(function () {
  var $ = function (sel) {
    return document.querySelector(sel);
  };

  var screens = {
    attract: $("#screen-attract"),
    tos: $("#screen-tos"),
    theme: $("#screen-theme"),
    mode: $("#screen-mode"),
    machine: $("#screen-machine"),
  };

  var session = TCG.createSession();
  var state = "attract";
  var mode = "single";
  var currentTheme = "fire";
  var tenQueue = null;
  var tenIndex = 0;
  var tenGuaranteeIndex = -1;
  var tenCollected = [];
  var tenPackLogId = null;
  /** Next press is a free respin (after BONUS). No second bonus on free spins. */
  var pendingFreeSpin = false;
  /** True while the current spin is the free respin. */
  var isFreeSpin = false;
  /** Extra result cards after a stacked win + bonus (prize card, then bonus card). */
  var resultQueue = [];
  var busy = false;
  var demoMode = false;
  var demoRunning = false;
  var demoToken = 0;
  /** Attract idle auto-demo — toggled with key 7 */
  var demoEnabled = true;
  var lastActivity = Date.now();
  var DEMO_IDLE_MS = 30 * 1000;
  var strip = TCG.spinStrip();
  var cellEls = [];

  function todayKey() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return (
      d.getFullYear() +
      "-" +
      (m < 10 ? "0" : "") +
      m +
      "-" +
      (day < 10 ? "0" : "") +
      day
    );
  }

  function emptyStock() {
    return { pack: "", bundle: "", etb: "", box: "" };
  }

  function loadDayData() {
    var blank = {
      date: todayKey(),
      spins: 0,
      themes: TCG.emptyDayThemes(),
      stock: emptyStock(),
      log: [],
    };
    try {
      var raw = localStorage.getItem("tcgspin-day");
      if (!raw) return blank;
      var data = JSON.parse(raw);
      if (!data || data.date !== todayKey()) return blank;
      if (!data.themes) data.themes = TCG.emptyDayThemes();
      TCG.THEMES.forEach(function (t) {
        if (!data.themes[t.id]) data.themes[t.id] = TCG.emptyThemeStats();
      });
      if (!data.stock) data.stock = emptyStock();
      ["pack", "bundle", "etb", "box"].forEach(function (k) {
        if (typeof data.stock[k] !== "string") data.stock[k] = "";
      });
      if (!Array.isArray(data.log)) data.log = [];
      return data;
    } catch (e) {
      return blank;
    }
  }

  function saveDayData() {
    try {
      localStorage.setItem("tcgspin-day", JSON.stringify(dayData));
    } catch (e) {}
  }

  var dayData = loadDayData();
  var daySpins = dayData.spins || 0;

  function stockLabel(prizeId) {
    var stock = dayData.stock || emptyStock();
    var custom = stock[prizeId];
    if (custom && String(custom).trim()) return String(custom).trim();
    var p = TCG.prizeById(prizeId);
    return p ? p.name : prizeId;
  }

  function prizeDisplayName(prize) {
    if (!prize) return "";
    if (
      prize.id === "pack" ||
      prize.id === "bundle" ||
      prize.id === "etb" ||
      prize.id === "box"
    ) {
      return stockLabel(prize.id);
    }
    return prize.name;
  }

  function handToText(prize) {
    if (!prize || prize.id === "miss") {
      return "Nothing to hand out — next spin!";
    }
    if (prize.id === "bonus") {
      return "No product — BONUS TILE → tap for FREE SPIN";
    }
    if (prize.id === "pack") {
      return "Hand them: 1 " + stockLabel("pack");
    }
    if (prize.id === "bundle") {
      return "Hand them: 1 " + stockLabel("bundle");
    }
    if (prize.id === "etb") {
      return "Hand them: 1 " + stockLabel("etb");
    }
    if (prize.id === "box") {
      return "Hand them: 1 " + stockLabel("box") + " — JACKPOT!";
    }
    return prize.handTo;
  }

  function clearBonusState() {
    pendingFreeSpin = false;
    isFreeSpin = false;
    resultQueue = [];
  }

  function formatChance(chance) {
    var pct = chance * 100;
    if (pct >= 10) return pct.toFixed(1) + "%";
    if (pct >= 1) return pct.toFixed(2) + "%";
    return pct.toFixed(3) + "%";
  }

  function fillOddsTable(tableId, weights) {
    var table = document.getElementById(tableId);
    if (!table) return { anyFeature: 0, anySealed: 0, bonus: 0 };
    var tbody = table.querySelector("tbody");
    var rows = TCG.weightTable(weights);
    var anyFeature = 0;
    var anySealed = 0;
    var bonusChance = 0;
    tbody.innerHTML = rows
      .map(function (p) {
        if (p.id === "bonus") bonusChance += p.chance;
        else if (p.id !== "miss") anySealed += p.chance;
        if (p.id !== "miss") anyFeature += p.chance;
        var label =
          p.id === "pack" ||
          p.id === "bundle" ||
          p.id === "etb" ||
          p.id === "box"
            ? stockLabel(p.id)
            : p.name;
        var rowClass =
          p.id === "miss"
            ? "odds-miss"
            : p.id === "bonus"
              ? "odds-bonus"
              : "odds-win";
        return (
          '<tr class="' +
          rowClass +
          '">' +
          "<td>" +
          label +
          "</td>" +
          "<td>" +
          formatChance(p.chance) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return {
      anyFeature: anyFeature,
      anySealed: anySealed,
      bonus: bonusChance,
    };
  }

  function updateStockPreview() {
    var el = $("#stock-preview");
    if (!el) return;
    el.textContent =
      "Pack → " +
      stockLabel("pack") +
      " · Bundle → " +
      stockLabel("bundle") +
      " · ETB → " +
      stockLabel("etb") +
      " · Box → " +
      stockLabel("box");
  }

  function refreshOddsBoard() {
    var anySingle = fillOddsTable("odds-table-single", TCG.SINGLE_WEIGHTS);
    var anyPack = fillOddsTable("odds-table-pack", TCG.PACKAGE_WEIGHTS);
    var bonusChance = TCG.BONUS_CHANCE || 0;
    var s = $("#odds-any-single");
    var p = $("#odds-any-pack");
    if (s) {
      s.textContent =
        "Any sealed: " +
        formatChance(anySingle.anySealed) +
        " · Bonus tile: " +
        formatChance(bonusChance) +
        " (stacks with wins → free respin, no chain)";
    }
    if (p) {
      p.textContent =
        "Any sealed on companion: " +
        formatChance(anyPack.anySealed) +
        " · Bonus tile: " +
        formatChance(bonusChance) +
        " (stacks · free doesn't use a pack slot) · +1 guaranteed AR/FA in the 6";
    }
    updateStockPreview();
    refreshTosOdds();
  }

  function refreshTosOdds() {
    var anySingle = fillOddsTable("tos-odds-single", TCG.SINGLE_WEIGHTS);
    var anyPack = fillOddsTable("tos-odds-pack", TCG.PACKAGE_WEIGHTS);
    var bonusChance = TCG.BONUS_CHANCE || 0;
    var s = $("#tos-odds-note-single");
    var p = $("#tos-odds-note-pack");
    if (s) {
      s.textContent =
        "Any sealed: " +
        formatChance(anySingle.anySealed) +
        " · Bonus tile (extra): " +
        formatChance(bonusChance) +
        " — can stack with a win";
    }
    if (p) {
      p.textContent =
        "Any sealed on companion: " +
        formatChance(anyPack.anySealed) +
        " · Bonus tile (extra): " +
        formatChance(bonusChance) +
        " · +1 guaranteed AR/FA in the 6";
    }
  }

  function syncStockInputsFromData() {
    var stock = dayData.stock || emptyStock();
    ["pack", "bundle", "etb", "box"].forEach(function (k) {
      var input = $("#stock-" + k);
      if (input) input.value = stock[k] || "";
    });
    updateStockPreview();
  }

  function readStockInputsToData() {
    if (!dayData.stock) dayData.stock = emptyStock();
    ["pack", "bundle", "etb", "box"].forEach(function (k) {
      var input = $("#stock-" + k);
      dayData.stock[k] = input ? input.value.trim() : "";
    });
    saveDayData();
    refreshOddsBoard();
  }

  function oddsOpen() {
    return $("#odds-overlay") && !$("#odds-overlay").hidden;
  }

  function openOdds() {
    syncStockInputsFromData();
    refreshOddsBoard();
    $("#odds-overlay").hidden = false;
  }

  function closeOdds() {
    readStockInputsToData();
    $("#odds-overlay").hidden = true;
    var active = document.activeElement;
    if (active && active.blur) active.blur();
  }

  function toggleOdds() {
    if (oddsOpen()) closeOdds();
    else openOdds();
  }

  function emptyPrizeCounts() {
    return {
      miss: 0,
      bonus: 0,
      single: 0,
      pack: 0,
      bundle: 0,
      etb: 0,
      box: 0,
    };
  }

  function logSpinResult(prize, opts) {
    opts = opts || {};
    if (!dayData.log) dayData.log = [];
    var entry = {
      t: Date.now(),
      mode: mode,
      theme: currentTheme,
      prize: prize.id,
      freeSpin: !!isFreeSpin,
      bonus: !!opts.bonus,
    };
    if (mode === "ten") {
      if (!tenPackLogId) tenPackLogId = Date.now();
      entry.packId = tenPackLogId;
      entry.spin = tenIndex + 1;
      entry.of = TCG.PRICES.packageSpins;
      entry.guarantee = !isFreeSpin && tenIndex === tenGuaranteeIndex;
    }
    dayData.log.push(entry);
    if (dayData.log.length > 400) {
      dayData.log = dayData.log.slice(-400);
    }
    saveDayData();
  }

  function formatLogTime(ms) {
    try {
      return new Date(ms).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (e) {
      return String(ms);
    }
  }

  function countsFromEntries(entries) {
    var counts = emptyPrizeCounts();
    entries.forEach(function (e) {
      if (counts[e.prize] != null) counts[e.prize] += 1;
      if (e.bonus) counts.bonus += 1;
    });
    return counts;
  }

  function formatTier(counts, opts) {
    opts = opts || {};
    var parts = [];
    var order = opts.includeMiss
      ? ["box", "etb", "bundle", "pack", "single", "bonus", "miss"]
      : ["box", "etb", "bundle", "pack", "single", "bonus"];
    order.forEach(function (id) {
      var n = counts[id] || 0;
      if (!n && !opts.showZeros) return;
      var label =
        id === "pack" || id === "bundle" || id === "etb" || id === "box"
          ? stockLabel(id)
          : id === "single"
            ? "AR/FA"
            : id === "bonus"
              ? "Bonus"
              : id === "miss"
                ? "Miss"
                : id;
      parts.push(n + "× " + label);
    });
    return parts.length ? parts.join(" · ") : "none";
  }

  function renderTierTable(el, counts, spinsLabel) {
    if (!el) return;
    var order = ["single", "pack", "bundle", "etb", "box", "bonus", "miss"];
    var labels = {
      single: "AR/FA",
      pack: stockLabel("pack"),
      bundle: stockLabel("bundle"),
      etb: stockLabel("etb"),
      box: stockLabel("box"),
      bonus: "Bonus tile",
      miss: "Miss",
    };
    el.innerHTML =
      "<caption>" +
      spinsLabel +
      "</caption><thead><tr><th>Prize</th><th>Qty</th></tr></thead><tbody>" +
      order
        .map(function (id) {
          return (
            "<tr><td>" +
            labels[id] +
            "</td><td>" +
            (counts[id] || 0) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody>";
  }

  function buildDayLogGroups() {
    var log = dayData.log || [];
    var singles = [];
    var packs = {};
    var packOrder = [];
    log.forEach(function (e) {
      if (e.mode === "ten" && e.packId != null) {
        if (!packs[e.packId]) {
          packs[e.packId] = [];
          packOrder.push(e.packId);
        }
        packs[e.packId].push(e);
      } else {
        singles.push(e);
      }
    });
    return { singles: singles, packs: packs, packOrder: packOrder };
  }

  function refreshLogBoard() {
    var groups = buildDayLogGroups();
    var singleCounts = countsFromEntries(groups.singles);
    var packEntries = [];
    groups.packOrder.forEach(function (id) {
      packEntries = packEntries.concat(groups.packs[id]);
    });
    var packCounts = countsFromEntries(packEntries);

    renderTierTable(
      $("#log-table-single"),
      singleCounts,
      groups.singles.length + " single spin" + (groups.singles.length === 1 ? "" : "s")
    );
    renderTierTable(
      $("#log-table-pack"),
      packCounts,
      groups.packOrder.length +
        "× 6-pack · " +
        packEntries.length +
        " spin" +
        (packEntries.length === 1 ? "" : "s") +
        " (incl. free)"
    );

    var feed = $("#log-feed");
    if (!feed) return;

    // Newest first activity rows
    var rows = [];
    // Merge singles + pack groups by latest timestamp
    groups.singles.forEach(function (e) {
      rows.push({
        t: e.t,
        kind: "single",
        entry: e,
      });
    });
    groups.packOrder.forEach(function (id) {
      var spins = groups.packs[id];
      var last = spins[spins.length - 1];
      rows.push({
        t: last.t,
        kind: "pack",
        spins: spins,
        packId: id,
      });
    });
    rows.sort(function (a, b) {
      return b.t - a.t;
    });

    if (!rows.length) {
      feed.innerHTML = '<p class="log-empty">No spins logged yet today.</p>';
      return;
    }

    feed.innerHTML = rows
      .map(function (row) {
        if (row.kind === "single") {
          var e = row.entry;
          var theme = TCG.themeById(e.theme);
          var prize = TCG.prizeById(e.prize);
          return (
            '<article class="log-row log-single">' +
            "<time>" +
            formatLogTime(e.t) +
            "</time>" +
            '<span class="log-mode">' +
            (e.freeSpin ? "FREE" : "SINGLE") +
            "</span>" +
            '<span class="log-detail">' +
            (theme ? theme.short + " · " : "") +
            (prize ? prizeDisplayName(prize) : e.prize) +
            (e.bonus ? " + BONUS" : "") +
            (e.freeSpin ? " (bonus respin)" : "") +
            "</span>" +
            "</article>"
          );
        }
        var spins = row.spins;
        var paidCount = spins.filter(function (s) {
          return !s.freeSpin;
        }).length;
        var done = paidCount >= TCG.PRICES.packageSpins;
        var counts = countsFromEntries(spins);
        var theme = TCG.themeById(spins[0].theme);
        var detail = formatTier(counts, { includeMiss: true });
        var spinLines = spins
          .map(function (s) {
            var p = TCG.prizeById(s.prize);
            return (
              '<div class="log-spin-line">' +
              formatLogTime(s.t) +
              " · #" +
              s.spin +
              (s.freeSpin ? " FREE" : "") +
              " · " +
              (p ? prizeDisplayName(p) : s.prize) +
              (s.bonus ? " + BONUS" : "") +
              (s.guarantee ? " (guaranteed)" : "") +
              "</div>"
            );
          })
          .join("");
        return (
          '<article class="log-row log-pack' +
          (done ? "" : " in-progress") +
          '">' +
          "<time>" +
          formatLogTime(row.t) +
          "</time>" +
          '<span class="log-mode">6-PACK' +
          (done
            ? ""
            : " · " + paidCount + "/" + TCG.PRICES.packageSpins) +
          "</span>" +
          '<span class="log-detail">' +
          (theme ? theme.short + " · " : "") +
          detail +
          "</span>" +
          '<div class="log-pack-spins">' +
          spinLines +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function logOpen() {
    return $("#log-overlay") && !$("#log-overlay").hidden;
  }

  function openLog() {
    refreshLogBoard();
    $("#log-overlay").hidden = false;
  }

  function closeLog() {
    $("#log-overlay").hidden = true;
  }

  function toggleLog() {
    if (logOpen()) closeLog();
    else openLog();
  }

  function typingInField() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  }

  function noteActivity() {
    lastActivity = Date.now();
    if (demoMode || demoRunning) stopDemo();
  }

  function demoAlive(token) {
    return demoMode && demoRunning && token === demoToken;
  }

  function stopDemo() {
    if (!demoMode && !demoRunning) return;
    demoToken += 1;
    demoMode = false;
    demoRunning = false;
    clearBonusState();
    document.body.classList.remove("demo-mode");
    hideWinBanner();
    $("#result-overlay").hidden = true;
    $("#summary-overlay").hidden = true;
    clearWinLines();
    cellEls.forEach(function (c) {
      stopFreeSpin(c, false);
      c._freeSpin = null;
    });
    busy = false;
    goAttract();
  }

  async function startDemoLoop() {
    if (!demoEnabled) return;
    if (demoRunning) return;
    if (oddsOpen() || logOpen()) return;
    if (!$("#operator").hidden) return;

    demoToken += 1;
    var token = demoToken;
    demoRunning = true;
    demoMode = true;
    document.body.classList.add("demo-mode");

    while (demoAlive(token)) {
      var theme =
        TCG.THEMES[Math.floor(Math.random() * TCG.THEMES.length)];
      applyTheme(theme.id);
      mode = "single";
      tenQueue = null;
      tenIndex = 0;
      tenCollected = [];
      tenPackLogId = null;
      clearBonusState();
      buildGrid();
      updateMeter();
      showScreen("machine");
      state = "ready";
      setStatus("DEMO · auto spin");
      $("#btn-spin").disabled = true;
      $("#btn-spin").classList.remove("ready");

      await wait(700);
      if (!demoAlive(token)) break;

      await runSpin();
      if (!demoAlive(token)) break;

      // If demo hit BONUS, play the free respin before returning to attract
      while (pendingFreeSpin && demoAlive(token)) {
        await wait(900);
        if (!demoAlive(token)) break;
        hideWinBanner();
        $("#result-overlay").hidden = true;
        clearWinLines();
        state = "ready";
        await runSpin();
        if (!demoAlive(token)) break;
      }

      // Back to attract between demos
      hideWinBanner();
      $("#result-overlay").hidden = true;
      clearWinLines();
      clearBonusState();
      showScreen("attract");
      state = "attract";
      setStatus("DEMO");
      await wait(2200);
    }

    demoRunning = false;
    demoMode = false;
    document.body.classList.remove("demo-mode");
  }

  function updateDemoToggleUI() {
    var el = $("#demo-toggle");
    var stateEl = $("#demo-toggle-state");
    if (stateEl) stateEl.textContent = demoEnabled ? "ON" : "OFF";
    if (el) el.classList.toggle("is-off", !demoEnabled);
  }

  function toggleDemoEnabled() {
    demoEnabled = !demoEnabled;
    if (!demoEnabled && (demoMode || demoRunning)) {
      stopDemo();
    }
    updateDemoToggleUI();
    TCG.audio.click();
  }

  function checkDemoIdle() {
    if (!demoEnabled) return;
    if (demoRunning || busy) return;
    if (oddsOpen() || logOpen()) return;
    if (!$("#operator").hidden) return;
    if (Date.now() - lastActivity < DEMO_IDLE_MS) return;
    // Attract only — never yank someone off TOS / theme / machine
    if (state !== "attract") return;
    startDemoLoop();
  }

  function bumpDaySpins(prize) {
    daySpins += 1;
    dayData.spins = daySpins;
    var stats = dayData.themes[currentTheme];
    if (!stats) {
      stats = TCG.emptyThemeStats();
      dayData.themes[currentTheme] = stats;
    }
    stats.spins += 1;
    if (prize && prize.id !== "miss" && stats.prizes[prize.id] != null) {
      stats.prizes[prize.id] += 1;
    }
    saveDayData();
    updateDayCounter();
    updateThemeBoard();
  }

  function updateDayCounter() {
    var el = $("#day-spins");
    if (el) {
      var s = String(daySpins);
      if (s.length <= 2) {
        el.textContent = s;
      } else {
        el.innerHTML =
          '<span class="day-counter-hi">' +
          s.slice(0, -2) +
          "</span>" +
          '<span class="day-counter-lo">' +
          s.slice(-2) +
          "</span>";
      }
    }
    var op = $("#op-day-spins");
    if (op) op.textContent = String(daySpins);
  }

  function prizeSummary(stats) {
    var parts = [];
    ["box", "etb", "bundle", "pack", "single"].forEach(function (id) {
      var n = stats.prizes[id] || 0;
      if (n > 0) {
        var p = TCG.prizeById(id);
        parts.push(n + "× " + p.short);
      }
    });
    return parts.length ? parts.join(" · ") : "no wins yet";
  }

  function updateThemeBoard() {
    var board = $("#theme-board");
    if (board) {
      board.innerHTML = TCG.THEMES.map(function (t) {
        var stats = dayData.themes[t.id] || TCG.emptyThemeStats();
        var active = t.id === currentTheme ? " active" : "";
        return (
          '<div class="theme-board-row theme-' +
          t.id +
          active +
          '">' +
          '<img class="tbr-sprite" src="' +
          t.gif +
          '" alt="' +
          t.name +
          '" />' +
          '<span class="tbr-name">' +
          t.short +
          "</span>" +
          '<span class="tbr-pokemon">' +
          t.name +
          "</span>" +
          '<span class="tbr-prizes">' +
          prizeSummary(stats) +
          "</span>" +
          "</div>"
        );
      }).join("");
    }

    document.querySelectorAll("[data-theme-stat]").forEach(function (el) {
      var id = el.getAttribute("data-theme-stat");
      var stats = dayData.themes[id] || TCG.emptyThemeStats();
      el.textContent = prizeSummary(stats);
    });

    var op = $("#op-themes");
    if (op) {
      op.innerHTML =
        "<p><strong>Theme wins today</strong></p>" +
        TCG.THEMES.map(function (t) {
          var stats = dayData.themes[t.id] || TCG.emptyThemeStats();
          return (
            "<div>" +
            t.name +
            ": " +
            prizeSummary(stats) +
            "</div>"
          );
        }).join("");
    }
  }

  function applyTheme(id) {
    var theme = TCG.themeById(id) || TCG.THEMES[0];
    currentTheme = theme.id;
    TCG.THEME_IDS.forEach(function (tid) {
      document.body.classList.remove("theme-" + tid);
    });
    document.body.classList.add("theme-" + theme.id);
    document.documentElement.style.setProperty("--theme-accent", theme.accent);
    document.documentElement.style.setProperty("--theme-accent-2", theme.accent2);
    document.documentElement.style.setProperty("--theme-glow", theme.glow);

    var badge = $("#active-theme-badge");
    if (badge) {
      badge.innerHTML =
        '<img src="' +
        theme.gif +
        '" alt="" />' +
        "<span>" +
        theme.short +
        "</span>";
    }
    var pill = $("#mode-theme-pill");
    if (pill) {
      pill.innerHTML =
        '<img src="' +
        theme.gif +
        '" alt="" />' +
        "<span>" +
        theme.name +
        "</span>";
      pill.className = "theme-pill theme-" + theme.id;
    }
    updateThemeBoard();
    updateEvoRail(theme);
  }

  function updateEvoRail(theme) {
    var rail = $("#evo-rail");
    if (!rail) return;
    var line = (theme && theme.line) || [];
    if (!line.length) {
      rail.innerHTML = "";
      rail.hidden = true;
      return;
    }
    rail.hidden = false;
    rail.innerHTML =
      '<p class="evo-rail-label">EVO LINE</p>' +
      line
        .map(function (mon, i) {
          return (
            '<div class="evo-dancer" style="animation-delay:' +
            i * 0.35 +
            's">' +
            '<img src="' +
            mon.gif +
            '" alt="' +
            mon.name +
            '" />' +
            "<span>" +
            mon.name +
            "</span>" +
            "</div>"
          );
        })
        .join("");
  }

  var PRIZE_COLOR = {
    miss: "var(--miss)",
    bonus: "var(--bonus)",
    single: "var(--single)",
    pack: "var(--pack)",
    bundle: "var(--bundle)",
    etb: "var(--etb)",
    box: "var(--box)",
  };

  /** Center of each cell in the 100×100 SVG overlay space */
  var CELL_CENTER = [
    [16.67, 16.67],
    [50, 16.67],
    [83.33, 16.67],
    [16.67, 50],
    [50, 50],
    [83.33, 50],
    [16.67, 83.33],
    [50, 83.33],
    [83.33, 83.33],
  ];

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("active", key === name);
    });
  }

  function cellSize() {
    var el = cellEls[0];
    if (!el) return 110;
    return el.getBoundingClientRect().height;
  }

  /** Locked reel height for the active spin (avoids mid-spin symbol jumps). */
  var spinCellH = 0;

  function syncItemHeights() {
    var h = cellSize();
    if (!h) return h;
    document.querySelectorAll(".cell-item").forEach(function (item) {
      item.style.height = h + "px";
    });
    return h;
  }

  function itemHeight() {
    if (spinCellH) return spinCellH;
    var sample = document.querySelector(".cell-item");
    if (sample && sample.offsetHeight) return sample.offsetHeight;
    return cellSize() || 110;
  }

  function buildGrid() {
    var grid = $("#slot-grid");
    grid.innerHTML = "";
    cellEls = [];
    clearWinLines();

    for (var i = 0; i < 9; i++) {
      var cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.dataset.idx = String(i);

      var windowEl = document.createElement("div");
      windowEl.className = "cell-window";

      var track = document.createElement("div");
      track.className = "cell-track";

      var loop = strip.concat(strip, strip, strip);
      loop.forEach(function (prize) {
        var item = document.createElement("div");
        item.className = "cell-item " + prize.cssClass;
        item.innerHTML =
          TCG.prizeIconHtml(prize) +
          '<span class="lbl">' +
          prize.short +
          "</span>";
        track.appendChild(item);
      });

      windowEl.appendChild(track);
      cell.appendChild(windowEl);
      grid.appendChild(cell);
      cellEls.push(cell);
    }

    requestAnimationFrame(function () {
      var h = syncItemHeights();
      cellEls.forEach(function (cell, i) {
        var track = cell.querySelector(".cell-track");
        var startIdx = strip.length + (i % strip.length);
        track.style.transform = "translateY(" + -(startIdx * h) + "px)";
      });
    });
  }

  function setStatus(text) {
    $("#machine-status").textContent = text;
  }

  function updateMeter() {
    var btnLabel = document.querySelector("#btn-spin .spin-btn-label");
    if (pendingFreeSpin) {
      $("#meter-label").textContent = "BONUS";
      $("#meter-value").textContent = "FREE SPIN";
      if (btnLabel) btnLabel.textContent = "FREE";
      return;
    }
    if (btnLabel) btnLabel.textContent = "SPIN";
    if (mode === "single") {
      $("#meter-label").textContent = "MODE";
      $("#meter-value").textContent = "1 SPIN";
    } else {
      var n = TCG.PRICES.packageSpins;
      $("#meter-label").textContent = "MODE";
      $("#meter-value").textContent =
        Math.min(tenIndex + 1, n) + " / " + n;
    }
  }

  function droughtHeat(n) {
    if (n >= 80) return "blazing";
    if (n >= 40) return "hot";
    if (n >= 20) return "warm";
    return "";
  }

  function updateDrought() {
    var order = ["single", "pack", "bundle", "etb", "box", "bonus"];
    var grid = $("#drought-grid");
    if (!grid) return;
    grid.innerHTML = order
      .map(function (id) {
        var prize = TCG.prizeById(id);
        var n = (session.since && session.since[id]) || 0;
        var heat = droughtHeat(n);
        var due =
          heat === "hot" || heat === "blazing"
            ? '<span class="drought-due">DUE</span>'
            : "";
        return (
          '<div class="drought-chip ' +
          prize.cssClass +
          (heat ? " " + heat : "") +
          '">' +
          due +
          '<span class="drought-name">' +
          prize.short +
          "</span>" +
          '<strong class="drought-count">' +
          n +
          "</strong>" +
          "</div>"
        );
      })
      .join("");

    var op = $("#op-drought");
    if (op) {
      op.innerHTML =
        "<p><strong>Spins since last</strong></p>" +
        order
          .map(function (id) {
            var prize = TCG.prizeById(id);
            var n = (session.since && session.since[id]) || 0;
            return (
              "<div>" +
              prize.name +
              ": <strong>" +
              n +
              "</strong></div>"
            );
          })
          .join("");
    }
  }

  function clearWinLines() {
    var svg = $("#win-lines");
    svg.innerHTML = "";
    svg.classList.remove("active");
    cellEls.forEach(function (c) {
      c.classList.remove("lit", "near-lit", "breaker", "clutch", "bonus-hit");
    });
    var wrap = $("#grid-wrap");
    if (wrap) {
      wrap.classList.remove("clutch-mode", "bonus-reveal");
      var tile = wrap.querySelector(".bonus-tile");
      if (tile) tile.remove();
      var burst = wrap.querySelector(".bonus-burst");
      if (burst) burst.remove();
    }
    document.body.classList.remove("flash-bonus");
  }

  function drawWinLine(line, className) {
    var svg = $("#win-lines");
    svg.classList.add("active");
    var cells = line.cells;
    var a = CELL_CENTER[cells[0]];
    var b = CELL_CENTER[cells[2]];
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M " + a[0] + " " + a[1] + " L " + b[0] + " " + b[1]);
    path.setAttribute("class", "win-stroke " + (className || ""));
    svg.appendChild(path);

    // Force draw animation
    var len = path.getTotalLength();
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    requestAnimationFrame(function () {
      path.style.strokeDashoffset = "0";
    });
  }

  /**
   * Bonus is not a reel symbol — slam an extra tile onto a settled cell.
   */
  async function playBonusTileReveal(cellIdx) {
    var wrap = $("#grid-wrap");
    var cell = cellEls[cellIdx];
    if (!wrap || !cell) return;

    wrap.classList.add("bonus-reveal");
    cell.classList.add("bonus-hit");
    setStatus(demoMode ? "DEMO · BONUS TILE!" : "BONUS TILE!");

    var burst = document.createElement("div");
    burst.className = "bonus-burst";
    burst.setAttribute("aria-hidden", "true");
    wrap.appendChild(burst);

    var tile = document.createElement("div");
    tile.className = "bonus-tile";
    tile.innerHTML =
      TCG.prizeIconHtml(TCG.prizeById("bonus")) +
      '<span class="bonus-tile-label">BONUS</span>' +
      '<span class="bonus-tile-sub">FREE SPIN</span>';
    wrap.appendChild(tile);

    // Park the tile over the target cell
    var wrapRect = wrap.getBoundingClientRect();
    var cellRect = cell.getBoundingClientRect();
    var cx = cellRect.left - wrapRect.left + cellRect.width / 2;
    var cy = cellRect.top - wrapRect.top + cellRect.height / 2;
    tile.style.setProperty("--bx", cx + "px");
    tile.style.setProperty("--by", cy + "px");
    burst.style.setProperty("--bx", cx + "px");
    burst.style.setProperty("--by", cy + "px");

    // Reflow then play slam
    void tile.offsetWidth;
    tile.classList.add("slam");
    burst.classList.add("pop");

    document.body.classList.add("flash-bonus", "shake-bonus");
    TCG.audio.stopCall();
    if (TCG.audio.bonusSlam) TCG.audio.bonusSlam();
    else TCG.audio.win("bonus");
    spawnConfetti(28);

    await wait(520);
    setStatus(demoMode ? "DEMO · BONUS SPIN!" : "BONUS SPIN!");
    document.body.classList.remove("shake-bonus");
    await wait(1100);
    document.body.classList.remove("flash-bonus");
  }

  function goAttract() {
    state = "attract";
    mode = "single";
    tenQueue = null;
    tenIndex = 0;
    tenCollected = [];
    tenPackLogId = null;
    clearBonusState();
    busy = false;
    if (!demoMode) {
      hideWinBanner();
      $("#result-overlay").hidden = true;
      $("#summary-overlay").hidden = true;
    } else {
      hideWinBanner();
      $("#result-overlay").hidden = true;
    }
    clearWinLines();
    showScreen("attract");
  }

  function goTos() {
    state = "tos";
    busy = false;
    hideWinBanner();
    $("#result-overlay").hidden = true;
    refreshTosOdds();
    var scroller = $("#tos-scroll");
    if (scroller) scroller.scrollTop = 0;
    showScreen("tos");
    TCG.audio.click();
    if (scroller) {
      try {
        scroller.focus({ preventScroll: true });
      } catch (err) {
        scroller.focus();
      }
    }
  }

  function acceptTos() {
    goTheme();
  }

  function goTheme() {
    state = "theme";
    busy = false;
    hideWinBanner();
    $("#result-overlay").hidden = true;
    updateThemeBoard();
    showScreen("theme");
    TCG.audio.click();
  }

  function goMode() {
    state = "mode";
    busy = false;
    hideWinBanner();
    $("#result-overlay").hidden = true;
    applyTheme(currentTheme);
    showScreen("mode");
    TCG.audio.click();
  }

  function pickTheme(id) {
    applyTheme(id);
    goMode();
  }

  function startMode(selected) {
    mode = selected;
    tenCollected = [];
    tenPackLogId = null;
    clearBonusState();
    if (mode === "ten") {
      var pack = TCG.rollPackage();
      tenQueue = pack.results;
      tenGuaranteeIndex = pack.guaranteeIndex;
      tenIndex = 0;
      tenPackLogId = Date.now();
    } else {
      tenQueue = null;
      tenIndex = 0;
    }
    buildGrid();
    updateMeter();
    setStatus("Tap to SPIN");
    $("#btn-spin").disabled = false;
    $("#btn-spin").classList.add("ready");
    document.querySelector(".machine-lights").classList.remove("lit");
    showScreen("machine");
    state = "ready";
    TCG.audio.click();
  }

  function priceForCurrentSpin() {
    if (isFreeSpin) return 0;
    if (mode === "single") return TCG.PRICES.singleSpin;
    return TCG.PRICES.sixPack / TCG.PRICES.packageSpins;
  }

  function nextPrize() {
    if (pendingFreeSpin) {
      isFreeSpin = true;
      pendingFreeSpin = false;
      if (mode === "ten") return TCG.rollFreePackage();
      return TCG.rollFreeSingle();
    }
    isFreeSpin = false;
    if (mode === "single") return TCG.rollSingle();
    return tenQueue[tenIndex];
  }

  function getTrackY(track) {
    var m = /translateY\((-?[\d.]+)px\)/.exec(track.style.transform || "");
    return m ? parseFloat(m[1]) : 0;
  }

  function prizeStripIndex(prize) {
    for (var i = 0; i < strip.length; i++) {
      if (strip[i].id === prize.id) return i;
    }
    return 0;
  }

  /** Keep a reel spinning until landFromSpin — no jump to a telltale start. */
  function startFreeSpin(cell) {
    stopFreeSpin(cell, false);
    var track = cell.querySelector(".cell-track");
    var h = itemHeight();
    var stripPx = h * strip.length;
    var rawY = getTrackY(track);
    // Park in copy 1 with same phase so wrapping never leaves the DOM empty
    var phase = ((-rawY) % stripPx + stripPx) % stripPx;
    var y = -(stripPx + phase);
    var state = {
      running: true,
      y: y,
      speed: h * 18,
      raf: 0,
      last: performance.now(),
    };
    cell.classList.add("spinning");
    cell._freeSpin = state;
    track.style.transition = "none";
    track.style.transform = "translateY(" + y + "px)";

    function tick(now) {
      if (!state.running) return;
      var dt = Math.min(0.05, (now - state.last) / 1000);
      state.last = now;
      state.y -= state.speed * dt;
      // Wrap inside copies 1–2 only (always drawn)
      while (state.y < -stripPx * 2.5) state.y += stripPx;
      while (state.y > -stripPx * 0.5) state.y -= stripPx;
      track.style.transform = "translateY(" + state.y + "px)";
      state.raf = requestAnimationFrame(tick);
    }
    state.raf = requestAnimationFrame(tick);
  }

  function stopFreeSpin(cell, keepClass) {
    var state = cell._freeSpin;
    if (!state) return;
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    if (!keepClass) cell.classList.remove("spinning");
    // leave _freeSpin.y for lander to read, then clear after
  }

  /**
   * Land a free-spinning (or idle) cell onto prize without teleporting.
   * Always scrolls forward from the current Y, staying inside the 4 strip copies.
   */
  function landFromSpin(cell, prize, duration, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var track = cell.querySelector(".cell-track");
      var h = itemHeight();
      var stripLen = strip.length;
      var stripPx = stripLen * h;
      var idx = prizeStripIndex(prize);
      var copies = 4;
      var minY = -((copies * stripLen - 1) * h);

      var rawY = cell._freeSpin ? cell._freeSpin.y : getTrackY(track);
      stopFreeSpin(cell, true);
      cell._freeSpin = null;

      // Same visual phase, parked in copy 1 so we have room to roll forward
      var phase = ((-rawY) % stripPx + stripPx) % stripPx;
      var fromY = -(stripPx + phase);

      // Next on-strip landing for this prize, at least ~1–2 full strips ahead
      var minTravel = stripPx * (opts.slowMo ? 1.25 : 0.85) + h * 2;
      var targetY = null;
      for (var c = 0; c < copies; c++) {
        var y = -((c * stripLen + idx) * h);
        var travel = fromY - y;
        if (travel >= minTravel && y >= minY) {
          targetY = y;
          break;
        }
      }
      if (targetY == null) {
        // Fallback: copy 3 slot (always in DOM)
        targetY = -((3 * stripLen + idx) * h);
        fromY = targetY + stripPx + phase;
        if (fromY > -h) fromY = -(stripPx + phase);
      }

      track.style.transition = "none";
      track.style.transform = "translateY(" + fromY + "px)";
      cell.classList.add("spinning");

      var start = performance.now();
      var tickMs = opts.slowMo ? 70 : 85;
      var tickTimer = setInterval(function () {
        if (state === "spinning") TCG.audio.tick();
      }, tickMs);

      function easeClutch(t) {
        // Fast, then a clear readable brake into the symbol
        if (t < 0.55) return (t / 0.55) * 0.78;
        var u = (t - 0.55) / 0.45;
        return 0.78 + 0.22 * (1 - Math.pow(1 - u, 2.2));
      }

      function easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
      }

      function frame(now) {
        var elapsed = now - start;
        var t = Math.min(1, elapsed / duration);
        var e = opts.slowMo ? easeClutch(t) : easeOut(t);
        var pos = fromY + (targetY - fromY) * e;
        track.style.transform = "translateY(" + pos + "px)";
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          clearInterval(tickTimer);
          track.style.transform = "translateY(" + targetY + "px)";
          cell.classList.remove("spinning");
          cell.classList.add("stopped");
          TCG.audio.reelStop();
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function animateCell(cell, prize, delay, duration, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var track = cell.querySelector(".cell-track");
      // Never remeasure/resync heights mid-spin — that jumps already-stopped reels
      var h = itemHeight();
      var idx = prizeStripIndex(prize);
      var targetIndex = strip.length * 2 + idx;
      var targetY = -(targetIndex * h);
      var fromY = targetY - h * (strip.length + (opts.slowMo ? 10 : 6));
      var overshoot = opts.bounce ? h * 0.12 : 0;

      track.style.transition = "none";
      track.style.transform = "translateY(" + fromY + "px)";
      void track.offsetHeight;

      cell.classList.add("spinning");
      var start = performance.now();
      var tickMs = opts.slowMo ? 55 : 85;
      var tickTimer = setInterval(function () {
        if (state === "spinning") TCG.audio.tick();
      }, tickMs);

      function easeOut(t) {
        return 1 - Math.pow(1 - t, opts.slowMo ? 4 : 3);
      }

      function frame(now) {
        var elapsed = now - start - delay;
        if (elapsed < 0) {
          requestAnimationFrame(frame);
          return;
        }
        var t = Math.min(1, elapsed / duration);
        var e = easeOut(t);
        var pos;
        if (overshoot && t < 0.88) {
          var t1 = t / 0.88;
          var e1 = 1 - Math.pow(1 - t1, 3);
          pos = fromY + (targetY - overshoot - fromY) * e1;
        } else if (overshoot) {
          var t2 = (t - 0.88) / 0.12;
          var e2 = 1 - Math.pow(1 - t2, 2);
          pos = targetY - overshoot + overshoot * e2;
        } else {
          pos = fromY + (targetY - fromY) * e;
        }
        track.style.transform = "translateY(" + pos + "px)";
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          clearInterval(tickTimer);
          track.style.transform = "translateY(" + targetY + "px)";
          cell.classList.remove("spinning");
          cell.classList.add("stopped");
          TCG.audio.reelStop();
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  /**
   * Stop order: build suspense.
   * Near-miss: breaker cell stops last.
   * Win: winning line cells stop last (center of line last).
   * Otherwise: cascade left-to-right, top-to-bottom, center last.
   */
  function stopOrder(outcome) {
    var order = [0, 1, 2, 3, 5, 6, 7, 8, 4]; // center last by default
    if (outcome.nearMiss) {
      var br = outcome.nearMiss.breaker;
      order = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(function (i) {
        return i !== br;
      });
      var matched = outcome.nearMiss.matched;
      order = order.filter(function (i) {
        return matched.indexOf(i) === -1;
      });
      order = order.concat(matched).concat([br]);
      return order;
    }
    if (outcome.wins && outcome.wins.length) {
      var lineCells = outcome.wins[0].line.cells.slice();
      var last = lineCells[1];
      var rest = lineCells.filter(function (i) {
        return i !== last;
      });
      order = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(function (i) {
        return lineCells.indexOf(i) === -1;
      });
      order = order.concat(rest).concat([last]);
      return order;
    }
    return order;
  }

  async function runSpin() {
    if (busy || state === "spinning") return;
    if (!demoMode) {
      if (state === "result") {
        dismissResult();
        return;
      }
      if (state === "summary") return;
      if (state === "attract") {
        TCG.audio.unlock();
        goTos();
        return;
      }
      if (state === "tos") return;
      if (state === "theme") return;
      if (state === "mode") return;
    }
    if (state !== "ready") return;

    var myDemoToken = demoToken;
    var wasDemo = demoMode;
    busy = true;
    state = "spinning";
    if (!demoMode) TCG.audio.unlock();
    clearWinLines();
    var wrap = $("#grid-wrap");
    wrap.classList.remove("clutch-mode");
    cellEls.forEach(function (c) {
      stopFreeSpin(c, false);
      c._freeSpin = null;
      c.classList.remove("stopped", "lit", "near-lit", "breaker", "clutch");
    });

    // Lock reel item height once so stopped cells never jump during clutch
    spinCellH = syncItemHeights() || cellSize() || 110;

    $("#btn-spin").disabled = true;
    $("#btn-spin").classList.remove("ready");
    $("#btn-spin").classList.add("pressed");
    setTimeout(function () {
      $("#btn-spin").classList.remove("pressed");
    }, 120);
    $("#result-overlay").hidden = true;
    document.querySelector(".machine-lights").classList.add("lit");
    setStatus(
      demoMode
        ? isFreeSpin || pendingFreeSpin
          ? "DEMO · bonus spin…"
          : "DEMO · spinning…"
        : isFreeSpin
          ? "FREE SPIN…"
          : "Good luck…"
    );
    TCG.audio.spinStart();

    // Consume pending free spin here (sets isFreeSpin). Demo uses same path.
    var prize;
    if (pendingFreeSpin) {
      prize = nextPrize();
    } else if (demoMode) {
      isFreeSpin = false;
      prize = TCG.rollSingle();
    } else {
      prize = nextPrize();
    }
    // Independent bonus tile — stacks with wins; never on free respins
    var gotBonus = !isFreeSpin && TCG.rollBonus();
    var outcome = TCG.buildSpinOutcome(prize);
    if (gotBonus) TCG.attachBonus(outcome);
    var order = stopOrder(outcome);
    var lastIdx = order[order.length - 1];
    var early = order.slice(0, -1);
    var isWin = outcome.wins && outcome.wins.length;
    var isNear = outcome.kind === "near";
    // ~1 in 3 on wins / dead spins. Never on near-misses (avoids fake 3-then-miss).
    // Only the last cell keeps spinning; settled cells stay locked.
    var useClutch = !isNear && Math.random() < 0.3;

    function aborted() {
      return wasDemo && myDemoToken !== demoToken;
    }

    if (useClutch) {
      var baseDur = isWin ? 1200 : 1100;
      var step = isWin ? 160 : 140;

      startFreeSpin(cellEls[lastIdx]);

      await Promise.all(
        early.map(function (idx, n) {
          return animateCell(
            cellEls[idx],
            outcome.board[idx],
            n * step,
            baseDur + n * 70,
            { bounce: false }
          );
        })
      );

      if (aborted()) {
        busy = false;
        return;
      }

      wrap.classList.add("clutch-mode");
      cellEls[lastIdx].classList.add("clutch");
      if (isWin) {
        setStatus(demoMode ? "DEMO · final stop…" : "Final stop…");
      } else {
        setStatus("Final stop…");
      }
      TCG.audio.clutch();
      TCG.audio.heartbeat();
      await wait(isWin ? 420 : 300);
      if (aborted()) {
        busy = false;
        return;
      }
      if (isWin) TCG.audio.rise();

      await landFromSpin(
        cellEls[lastIdx],
        outcome.board[lastIdx],
        isWin ? 1800 : 1400,
        { slowMo: true, bounce: false }
      );

      wrap.classList.remove("clutch-mode");
      cellEls[lastIdx].classList.remove("clutch");
    } else if (isWin) {
      // Clean cascade — line completes and stays
      setStatus(demoMode ? "DEMO · spinning…" : "Good luck…");
      await Promise.all(
        order.map(function (idx, n) {
          return animateCell(
            cellEls[idx],
            outcome.board[idx],
            n * 95,
            880 + n * 45,
            { bounce: false }
          );
        })
      );
    } else if (isNear) {
      await Promise.all(
        order.map(function (idx, n) {
          return animateCell(
            cellEls[idx],
            outcome.board[idx],
            n * 110,
            920 + n * 50,
            { bounce: false }
          );
        })
      );
    } else {
      // Quick cascade — no clutch tell
      await Promise.all(
        order.map(function (idx, n) {
          return animateCell(
            cellEls[idx],
            outcome.board[idx],
            n * 120,
            1000 + n * 70,
            { bounce: false }
          );
        })
      );
    }

    if (aborted()) {
      busy = false;
      return;
    }

    document.querySelector(".machine-lights").classList.remove("lit");

    // Reveal moment
    if (outcome.wins.length) {
      setStatus(demoMode ? "DEMO · LINE!" : "LINE!");
      outcome.wins.forEach(function (w) {
        drawWinLine(w.line, "win-" + w.prize.id);
        w.line.cells.forEach(function (i) {
          cellEls[i].classList.add("lit");
        });
      });
      TCG.audio.line();
      var hold =
        prize.rarity === "jackpot"
          ? 1600
          : prize.rarity === "legendary"
            ? 1400
            : prize.rarity === "epic"
              ? 1200
              : 900;
      if (prize.id !== "single" && prize.id !== "miss") {
        await wait(400);
        if (aborted()) {
          busy = false;
          return;
        }
        setStatus(
          prize.id === "box"
            ? "JACKPOT?!"
            : prize.id === "etb"
              ? "ETB?!"
              : prize.id === "bundle"
                ? "BUNDLE?!"
                : "PACK?!"
        );
        TCG.audio.heartbeat();
      }
      await wait(hold);
    } else if (outcome.nearMiss && !outcome.bonus) {
      setStatus("SO CLOSE…");
      cellEls[outcome.nearMiss.breaker].classList.add("breaker");
      drawWinLine(outcome.nearMiss.line, "near-miss");
      TCG.audio.gasp();
      TCG.audio.nearMiss();
      document.body.classList.add("shake-near");
      setTimeout(function () {
        document.body.classList.remove("shake-near");
      }, 500);
      await wait(1300);
      clearWinLines();
    } else if (outcome.nearMiss && outcome.bonus) {
      // Short tease, then bonus steals the moment
      setStatus("SO CLOSE…");
      cellEls[outcome.nearMiss.breaker].classList.add("breaker");
      drawWinLine(outcome.nearMiss.line, "near-miss");
      TCG.audio.gasp();
      await wait(700);
      clearWinLines();
      cellEls[outcome.nearMiss.breaker].classList.remove("breaker");
    } else if (!outcome.bonus) {
      setStatus("No line");
      await wait(350);
    } else {
      setStatus(demoMode ? "DEMO…" : "…");
      await wait(420);
    }

    if (aborted()) {
      busy = false;
      return;
    }

    if (outcome.bonus) {
      await playBonusTileReveal(outcome.bonusCell);
      if (aborted()) {
        busy = false;
        return;
      }
      // Let battle SFX land before the prize cry on a stacked win
      if (outcome.wins && outcome.wins.length) {
        await wait(400);
        if (aborted()) {
          busy = false;
          return;
        }
      }
    }

    if (!demoMode) {
      var paid = priceForCurrentSpin();
      TCG.recordSpin(session, outcome.prize, paid);
      if (outcome.bonus) TCG.recordBonusHit(session);
      bumpDaySpins(outcome.prize);
      logSpinResult(outcome.prize, { bonus: !!outcome.bonus });
      if (mode === "ten") {
        tenCollected.push({
          prize: outcome.prize,
          guarantee: !isFreeSpin && tenIndex === tenGuaranteeIndex,
          freeSpin: !!isFreeSpin,
          bonus: !!outcome.bonus,
        });
      }
      if (outcome.bonus) {
        pendingFreeSpin = true;
      }
    } else if (outcome.bonus) {
      pendingFreeSpin = true;
    }

    // Win + bonus: prize message (cry), then bonus message. Miss + bonus: bonus only.
    resultQueue = [];
    if (outcome.bonus && outcome.prize.id !== "miss") {
      resultQueue.push({
        prize: TCG.prizeById("bonus"),
        opts: { bonusCard: true },
      });
      showResult(outcome.prize, { bonusFollowUp: true });
    } else if (outcome.bonus) {
      showResult(TCG.prizeById("bonus"), { bonusCard: true });
    } else {
      showResult(outcome.prize, {});
    }
    if (!demoMode) updateOperator();
    busy = false;

    if (wasDemo && demoAlive(myDemoToken)) {
      var demoHold =
        outcome.prize.id === "miss" && !outcome.bonus
          ? 2400
          : outcome.bonus
            ? 2600
            : outcome.prize.rarity === "jackpot"
              ? 5200
              : 3800;
      await wait(demoHold);
      while (resultQueue.length && demoAlive(myDemoToken)) {
        var nextCard = resultQueue.shift();
        showResult(nextCard.prize, nextCard.opts || {});
        await wait(2200);
      }
      if (demoAlive(myDemoToken) && !pendingFreeSpin) {
        hideWinBanner();
        $("#result-overlay").hidden = true;
        clearWinLines();
        state = "ready";
      }
    }
  }

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function hideWinBanner() {
    var banner = $("#win-banner");
    if (!banner) return;
    banner.hidden = true;
    banner.classList.remove("jackpot", "playing");
    TCG.audio.stopCall();
  }

  function playWinBanner(prize) {
    var theme = TCG.themeById(currentTheme) || TCG.THEMES[0];
    var banner = $("#win-banner");
    if (!banner || !theme) return;

    var sprite = $("#win-banner-sprite");
    var call = $("#win-banner-call");
    var prizeLine = $("#win-banner-prize");

    sprite.src = theme.gif;
    sprite.alt = theme.name;
    call.textContent = theme.name + "!";
    prizeLine.textContent =
      prize.id === "bonus"
        ? "BONUS TILE · FREE SPIN"
        : "WON · " + prizeDisplayName(prize);

    banner.classList.toggle(
      "jackpot",
      prize.rarity === "jackpot" || prize.rarity === "legendary"
    );
    banner.hidden = false;

    // Restart CSS animation
    var inner = banner.querySelector(".win-banner-inner");
    if (inner) {
      inner.style.animation = "none";
      // force reflow
      void inner.offsetWidth;
      inner.style.animation = "";
    }

    // Bonus tile uses its own battle SFX — no starter cry
    if (prize.id !== "bonus") {
      TCG.audio.callStarter(theme);
    } else {
      TCG.audio.stopCall();
    }

    clearTimeout(playWinBanner._timer);
    playWinBanner._timer = setTimeout(function () {
      banner.hidden = true;
    }, prize.rarity === "jackpot" || prize.rarity === "legendary" ? 2200 : 1900);
  }

  function showResult(prize, opts) {
    opts = opts || {};
    state = "result";
    var overlay = $("#result-overlay");
    var card = $("#result-card");
    overlay.hidden = false;

    var isMiss = prize.id === "miss";
    var isBonusCard = !!opts.bonusCard || prize.id === "bonus";
    var bonusFollowUp = !!opts.bonusFollowUp;
    var displayPrize = isBonusCard ? TCG.prizeById("bonus") : prize;

    card.className = "result-card " + displayPrize.cssClass;
    if (displayPrize.rarity === "jackpot" || displayPrize.rarity === "legendary") {
      card.classList.add("jackpot");
    }

    var theme = TCG.themeById(currentTheme) || TCG.THEMES[0];

    if (demoMode) {
      if (isMiss && !isBonusCard) {
        hideWinBanner();
        $("#result-eyebrow").textContent = "DEMO · MISS";
      } else {
        playWinBanner(displayPrize);
        $("#result-eyebrow").textContent = isBonusCard
          ? "DEMO · BONUS"
          : prize.rarity === "jackpot"
            ? "DEMO · JACKPOT"
            : "DEMO · WIN";
      }
      $("#result-symbol").innerHTML = TCG.prizeIconHtml(displayPrize);
      $("#result-symbol").style.color =
        PRIZE_COLOR[displayPrize.id] || "var(--gold)";
      $("#result-title").textContent = prizeDisplayName(displayPrize);
      $("#result-handto").textContent = isBonusCard
        ? "Demo · bonus tile → free respin"
        : isMiss
          ? "Demo spin — tap to play for real"
          : "Demo only — not a real handout";
      $("#result-next").textContent = bonusFollowUp
        ? "Auto-demo · bonus next"
        : isBonusCard || pendingFreeSpin
          ? "Auto-demo · free spin next"
          : "Auto-demo · any tap cancels";
    } else if (isBonusCard) {
      hideWinBanner();
      $("#result-eyebrow").textContent =
        theme.name.toUpperCase() + " · BONUS TILE";
    } else if (isMiss) {
      hideWinBanner();
      $("#result-eyebrow").textContent = "SO CLOSE";
    } else {
      // Prize cry after bonus battle SFX (stacked wins)
      playWinBanner(prize);
      $("#result-eyebrow").textContent =
        prize.rarity === "jackpot"
          ? "★ " + theme.name.toUpperCase() + " · JACKPOT ★"
          : theme.name.toUpperCase() +
            (isFreeSpin ? " · FREE SPIN WIN" : " · YOU WON");
    }

    if (!demoMode) {
      $("#result-symbol").innerHTML = TCG.prizeIconHtml(displayPrize);
      $("#result-symbol").style.color =
        PRIZE_COLOR[displayPrize.id] || "var(--gold)";
      $("#result-title").textContent = prizeDisplayName(displayPrize);
      if (isBonusCard) {
        $("#result-handto").textContent = handToText(displayPrize);
      } else if (isFreeSpin && !isMiss) {
        $("#result-handto").textContent =
          handToText(prize) + " · from bonus spin";
      } else {
        $("#result-handto").textContent = handToText(prize);
      }

      var packN = TCG.PRICES.packageSpins;
      if (bonusFollowUp) {
        $("#result-next").textContent = "Tap · BONUS next";
      } else if (isBonusCard || (pendingFreeSpin && !isFreeSpin)) {
        $("#result-next").textContent =
          "Tap · FREE SPIN (does not count)";
      } else if (mode === "ten" && tenIndex < packN - 1) {
        $("#result-next").textContent =
          "Tap · spin " + (tenIndex + 2) + " of " + packN;
      } else if (mode === "ten") {
        $("#result-next").textContent = "Tap to see full haul";
      } else {
        $("#result-next").textContent = "Tap for next player";
      }
    }

    if (isBonusCard) {
      // Battle SFX already played on tile slam — no cry
      document.body.classList.add("flash-win");
      setTimeout(function () {
        document.body.classList.remove("flash-win");
      }, 400);
    } else if (isMiss) {
      TCG.audio.miss();
    } else {
      setTimeout(function () {
        TCG.audio.win(prize.rarity);
      }, 280);
      if (
        prize.rarity === "jackpot" ||
        prize.rarity === "legendary" ||
        prize.rarity === "epic"
      ) {
        spawnConfetti(prize.rarity === "jackpot" ? 60 : 36);
        document.body.classList.add("flash-jackpot");
        setTimeout(function () {
          document.body.classList.remove("flash-jackpot");
        }, 1600);
      } else {
        document.body.classList.add("flash-win");
        setTimeout(function () {
          document.body.classList.remove("flash-win");
        }, 400);
        spawnConfetti(prize.id === "single" ? 10 : 18);
      }
    }

    setStatus(
      isBonusCard
        ? "Bonus tile!"
        : isFreeSpin
          ? "Free · " + prize.name
          : prize.name
    );
  }

  function dismissResult() {
    if (demoMode) {
      hideWinBanner();
      $("#result-overlay").hidden = true;
      clearWinLines();
      state = "ready";
      return;
    }
    hideWinBanner();
    $("#result-overlay").hidden = true;
    clearWinLines();

    // Stacked win + bonus: prize card first, then bonus card
    if (resultQueue.length) {
      var next = resultQueue.shift();
      showResult(next.prize, next.opts || {});
      return;
    }

    // After BONUS card: stay on this pack/single slot for the free respin
    if (pendingFreeSpin) {
      state = "ready";
      updateMeter();
      setStatus("FREE SPIN · tap");
      $("#btn-spin").disabled = false;
      $("#btn-spin").classList.add("ready");
      return;
    }

    isFreeSpin = false;

    if (mode === "ten") {
      tenIndex += 1;
      updateMeter();
      if (tenIndex >= TCG.PRICES.packageSpins) {
        showTenSummary();
        return;
      }
      state = "ready";
      setStatus("Tap to SPIN");
      $("#btn-spin").disabled = false;
      $("#btn-spin").classList.add("ready");
      return;
    }

    goAttract();
  }

  function showTenSummary() {
    state = "summary";
    var counts = {};
    var bonusHits = 0;
    tenCollected.forEach(function (item) {
      var id = item.prize.id;
      if (!counts[id]) {
        counts[id] = {
          prize: item.prize,
          n: 0,
          guaranteed: false,
          freeSpins: 0,
        };
      }
      counts[id].n += 1;
      if (item.guarantee) counts[id].guaranteed = true;
      if (item.freeSpin) counts[id].freeSpins += 1;
      if (item.bonus) bonusHits += 1;
    });
    if (bonusHits) {
      counts.bonus = {
        prize: TCG.prizeById("bonus"),
        n: bonusHits,
        guaranteed: false,
        freeSpins: 0,
      };
    }

    var list = $("#summary-list");
    list.innerHTML = "";
    ["box", "etb", "bundle", "pack", "single", "bonus", "miss"].forEach(
      function (id) {
        var row = counts[id];
        if (!row) return;
        var li = document.createElement("li");
        var guaranteeLabel = "INCLUDES GUARANTEED SINGLE";
        var extra = "";
        if (id === "bonus") {
          extra =
            '<div style="color:var(--muted);font-size:0.8rem;font-weight:600">Triggered free respin(s) — no product</div>';
        } else if (row.freeSpins) {
          extra =
            '<div style="color:var(--bonus);font-size:0.8rem;font-weight:700">' +
            row.freeSpins +
            " from bonus spin</div>";
        }
        li.innerHTML =
          '<span class="qty">' +
          row.n +
          "</span><span>" +
          prizeDisplayName(row.prize) +
          (row.guaranteed
            ? '<div class="guaranteed">' + guaranteeLabel + "</div>"
            : "") +
          (id === "bonus"
            ? extra
            : '<div style="color:var(--muted);font-size:0.8rem;font-weight:600">' +
              handToText(row.prize) +
              "</div>" +
              extra) +
          '</span><span class="summary-ico ' +
          row.prize.cssClass +
          '">' +
          TCG.prizeIconHtml(row.prize) +
          "</span>";
        list.appendChild(li);
      }
    );

    $("#summary-overlay").hidden = false;
    spawnConfetti(40);
  }

  function spawnConfetti(n) {
    var colors = [
      "#e11d2e",
      "#ffd24a",
      "#3b9eff",
      "#2ec4a0",
      "#c084fc",
      "#fff",
      "#ff5a5a",
    ];
    for (var i = 0; i < n; i++) {
      var el = document.createElement("i");
      el.className = "confetti";
      el.style.left = Math.random() * 100 + "vw";
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = 1.5 + Math.random() * 1.8 + "s";
      el.style.animationDelay = Math.random() * 0.3 + "s";
      document.body.appendChild(el);
      (function (node) {
        setTimeout(function () {
          node.remove();
        }, 3500);
      })(el);
    }
  }

  function updateOperator() {
    $("#op-spins").textContent = String(session.spins);
    updateDayCounter();

    $("#op-wins").innerHTML = TCG.PRIZES.map(function (p) {
      return (
        "<div>" +
        p.name +
        ": <strong>" +
        (session.wins[p.id] || 0) +
        "</strong></div>"
      );
    }).join("");

    updateDrought();
    updateThemeBoard();
  }

  function toggleOperator() {
    var panel = $("#operator");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) updateOperator();
  }

  $("#btn-tos-agree").addEventListener("click", function () {
    acceptTos();
  });
  $("#btn-single").addEventListener("click", function () {
    startMode("single");
  });
  $("#btn-ten").addEventListener("click", function () {
    startMode("ten");
  });

  document.querySelectorAll(".theme-card").forEach(function (btn) {
    btn.addEventListener("click", function () {
      pickTheme(btn.getAttribute("data-theme"));
    });
  });
  $("#btn-spin").addEventListener("click", function () {
    runSpin();
  });
  $("#btn-summary-done").addEventListener("click", function () {
    $("#summary-overlay").hidden = true;
    goAttract();
  });
  $("#btn-close-op").addEventListener("click", toggleOperator);
  $("#btn-mute").addEventListener("click", function () {
    TCG.audio.setMuted(!TCG.audio.isMuted());
    $("#btn-mute").textContent = TCG.audio.isMuted()
      ? "Unmute sounds"
      : "Mute sounds";
  });
  $("#btn-reset-session").addEventListener("click", function () {
    if (confirm("Reset session stats?")) {
      session = TCG.createSession();
      updateOperator();
    }
  });
  $("#btn-fullscreen").addEventListener("click", function () {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen &&
        document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });

  $("#result-overlay").addEventListener("click", function (e) {
    e.stopPropagation();
    if (state === "result") dismissResult();
  });

  $("#summary-overlay").addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    e.stopPropagation();
  });

  document.getElementById("app").addEventListener("click", function (e) {
    if (demoMode || demoRunning) {
      noteActivity();
      return;
    }
    if (
      e.target.closest(
        "button, a, .operator, .mode-card, .theme-card, .primary-btn, .text-btn, .overlay, .odds-card, .log-card, .tos-panel, input, textarea, label"
      )
    ) {
      return;
    }
    if (oddsOpen() || logOpen()) return;
    if (state === "attract") {
      TCG.audio.unlock();
      goTos();
      return;
    }
    if (state === "ready") runSpin();
  });

  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    var key = e.key;

    // Demo toggle — works even while a demo is running
    if (key === "7") {
      e.preventDefault();
      toggleDemoEnabled();
      noteActivity();
      return;
    }

    if (demoMode || demoRunning) {
      e.preventDefault();
      noteActivity();
      return;
    }

    // Odds board — available anytime (unless typing, except 0/Esc still work)
    if (key === "0") {
      if (typingInField() && oddsOpen()) return; // let "0" type into inputs
      e.preventDefault();
      if (logOpen()) closeLog();
      toggleOdds();
      return;
    }

    if (key === "9") {
      if (typingInField()) return;
      e.preventDefault();
      if (oddsOpen()) closeOdds();
      toggleLog();
      return;
    }

    if (key === "o" || key === "O") {
      if (typingInField()) return;
      toggleOperator();
      return;
    }
    if (key === "Escape") {
      if (logOpen()) {
        closeLog();
        return;
      }
      if (oddsOpen()) {
        closeOdds();
        return;
      }
      if (!$("#operator").hidden) {
        toggleOperator();
        return;
      }
      if (typingInField()) return;
      if (state === "tos") {
        goAttract();
        return;
      }
      if (state === "mode") {
        goTheme();
        return;
      }
      if (state === "theme") {
        goTos();
        return;
      }
      if (state === "ready" || state === "result") goAttract();
      return;
    }

    if (typingInField() || oddsOpen() || logOpen()) return;

    if (state === "tos") {
      var tosScroll = $("#tos-scroll");
      if (key === "1") {
        e.preventDefault();
        acceptTos();
        return;
      }
      if (tosScroll) {
        if (key === "ArrowDown" || key === "PageDown" || key === " " || key === "Spacebar") {
          e.preventDefault();
          tosScroll.scrollBy(0, key === "PageDown" ? 220 : 90);
          return;
        }
        if (key === "ArrowUp" || key === "PageUp") {
          e.preventDefault();
          tosScroll.scrollBy(0, key === "PageUp" ? -220 : -90);
          return;
        }
      }
      return;
    }

    if (state === "theme") {
      var idx = parseInt(key, 10);
      if (idx >= 1 && idx <= TCG.THEMES.length) {
        pickTheme(TCG.THEMES[idx - 1].id);
      }
      return;
    }

    if (state === "mode") {
      if (key === "1") startMode("single");
      if (key === "2") startMode("ten");
      return;
    }

    if (key === " " || key === "Enter" || key.length === 1 || key === "Spacebar") {
      e.preventDefault();
      if (state === "summary") {
        $("#summary-overlay").hidden = true;
        goAttract();
        return;
      }
      runSpin();
    }
  });

  $("#btn-close-odds").addEventListener("click", function () {
    closeOdds();
  });
  $("#odds-overlay").addEventListener("click", function (e) {
    if (e.target === $("#odds-overlay")) closeOdds();
  });
  $("#btn-close-log").addEventListener("click", function () {
    closeLog();
  });
  $("#log-overlay").addEventListener("click", function (e) {
    if (e.target === $("#log-overlay")) closeLog();
  });
  ["pack", "bundle", "etb", "box"].forEach(function (k) {
    var input = $("#stock-" + k);
    if (!input) return;
    input.addEventListener("input", function () {
      readStockInputsToData();
    });
  });

  setInterval(function () {
    if (
      state === "attract" &&
      demoEnabled &&
      !demoMode &&
      !TCG.audio.isMuted() &&
      !oddsOpen() &&
      !logOpen()
    ) {
      TCG.audio.attractBeep();
    }
  }, 4000);

  setInterval(checkDemoIdle, 5000);

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (state !== "ready" && state !== "attract") return;
      if (!cellEls.length || busy) return;
      spinCellH = 0;
      var h = syncItemHeights();
      if (!h) return;
      cellEls.forEach(function (cell, i) {
        var track = cell.querySelector(".cell-track");
        if (!track) return;
        var startIdx = strip.length + (i % strip.length);
        track.style.transition = "none";
        track.style.transform = "translateY(" + -(startIdx * h) + "px)";
      });
    }, 120);
  });

  updateDemoToggleUI();

  ["pointerdown", "keydown", "touchstart"].forEach(function (evt) {
    window.addEventListener(
      evt,
      function () {
        noteActivity();
      },
      { passive: true }
    );
  });

  buildGrid();
  applyTheme(currentTheme);
  updateOperator();
  updateDrought();
  updateDayCounter();
  updateThemeBoard();
  syncStockInputsFromData();
  console.log("TCG SPIN 3×3 ready", TCG.oddsSummary());
})();
