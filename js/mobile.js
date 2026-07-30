/**
 * Mobile chrome — portrait gate + touch menu / nav wiring.
 * Depends on main.js having already attached core game handlers.
 */
(function () {
  var $ = function (sel) {
    return document.querySelector(sel);
  };

  function isLandscapePhone() {
    var landscape = window.matchMedia("(orientation: landscape)").matches;
    var shortSide = Math.min(window.innerWidth, window.innerHeight);
    var tallSide = Math.max(window.innerWidth, window.innerHeight);
    // Phone-sized + landscape only (skip desktop / IDE preview panes)
    var phoneSized = shortSide <= 500 && tallSide <= 950;
    var touchy =
      window.matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints || 0) > 1;
    return landscape && phoneSized && touchy;
  }

  function syncOrientation() {
    var gate = $("#orient-gate");
    if (!gate) return;
    var block = isLandscapePhone();
    gate.hidden = !block;
    document.body.classList.toggle("force-portrait-only", block);
    try {
      if (
        !block &&
        screen.orientation &&
        typeof screen.orientation.lock === "function"
      ) {
        screen.orientation.lock("portrait").catch(function () {});
      }
    } catch (e) {}
  }

  function closeMenu() {
    var el = $("#menu-overlay");
    if (el) el.hidden = true;
  }

  function openMenu() {
    var el = $("#menu-overlay");
    if (el) el.hidden = false;
  }

  function menuOpen() {
    return $("#menu-overlay") && !$("#menu-overlay").hidden;
  }

  function sendKey(key) {
    var code = key;
    if (key === " ") code = "Space";
    else if (key === "Escape") code = "Escape";
    else if (/^[0-9]$/.test(key)) code = "Digit" + key;
    else if (key.length === 1) code = "Key" + key.toUpperCase();
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: key,
        code: code,
        bubbles: true,
        cancelable: true,
      })
    );
  }

  // Attract CTA
  var attractStart = $("#btn-attract-start");
  if (attractStart) {
    attractStart.addEventListener("click", function (e) {
      e.stopPropagation();
      sendKey(" ");
    });
  }

  var demoBtn = $("#btn-demo-toggle");
  if (demoBtn) {
    demoBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      sendKey("7");
    });
  }

  function backKey() {
    sendKey("Escape");
  }

  ["btn-tos-back", "btn-theme-back", "btn-mode-back"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        backKey();
      });
    }
  });

  var machineExit = $("#btn-machine-exit");
  if (machineExit) {
    machineExit.addEventListener("click", function (e) {
      e.stopPropagation();
      backKey();
    });
  }

  var openMenuBtn = $("#btn-open-menu");
  if (openMenuBtn) {
    openMenuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openMenu();
    });
  }

  var closeMenuBtn = $("#btn-close-menu");
  if (closeMenuBtn) {
    closeMenuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeMenu();
    });
  }

  var menuOverlay = $("#menu-overlay");
  if (menuOverlay) {
    menuOverlay.addEventListener("click", function (e) {
      if (e.target === menuOverlay) closeMenu();
    });
  }

  function clickId(id) {
    var el = document.getElementById(id);
    if (el) el.click();
  }

  var menuOdds = $("#btn-menu-odds");
  if (menuOdds) {
    menuOdds.addEventListener("click", function () {
      closeMenu();
      sendKey("0");
    });
  }

  var menuLog = $("#btn-menu-log");
  if (menuLog) {
    menuLog.addEventListener("click", function () {
      closeMenu();
      sendKey("9");
    });
  }

  var menuOp = $("#btn-menu-op");
  if (menuOp) {
    menuOp.addEventListener("click", function () {
      closeMenu();
      sendKey("o");
    });
  }

  var menuMute = $("#btn-menu-mute");
  if (menuMute) {
    menuMute.addEventListener("click", function () {
      clickId("btn-mute");
      var muted =
        window.TCG && TCG.audio && TCG.audio.isMuted && TCG.audio.isMuted();
      menuMute.textContent = muted ? "Unmute sounds" : "Mute sounds";
      var opMute = $("#btn-mute");
      if (opMute) {
        menuMute.textContent = opMute.textContent;
      }
    });
  }

  var menuHome = $("#btn-menu-home");
  if (menuHome) {
    menuHome.addEventListener("click", function () {
      closeMenu();
      sendKey("Escape");
      setTimeout(function () {
        sendKey("Escape");
      }, 40);
    });
  }

  // Soften desktop copy that main.js sets
  var statusEl = $("#machine-status");
  if (statusEl && /Press/i.test(statusEl.textContent || "")) {
    statusEl.textContent = "Tap to SPIN";
  }

  // Patch common status strings after main updates them
  var mo;
  if (statusEl && typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(function () {
      var t = statusEl.textContent || "";
      if (/Press to SPIN/i.test(t)) statusEl.textContent = "Tap to SPIN";
      if (/Press button/i.test(t)) {
        statusEl.textContent = t.replace(/Press button/gi, "Tap");
      }
    });
    mo.observe(statusEl, { characterData: true, childList: true, subtree: true });
  }

  // Result next line is set in showResult — observe it too
  var nextEl = $("#result-next");
  if (nextEl && typeof MutationObserver !== "undefined") {
    var mo2 = new MutationObserver(function () {
      var t = nextEl.textContent || "";
      if (/Press/i.test(t)) {
        nextEl.textContent = t
          .replace(/Press button/gi, "Tap")
          .replace(/press button/gi, "tap")
          .replace(/Press /g, "Tap ");
      }
    });
    mo2.observe(nextEl, { characterData: true, childList: true, subtree: true });
  }

  window.addEventListener("resize", syncOrientation);
  window.addEventListener("orientationchange", syncOrientation);
  syncOrientation();

  // Prevent iOS rubber-band scrolling the whole app away
  document.addEventListener(
    "touchmove",
    function (e) {
      var target = e.target;
      if (!target) return;
      var scrollable = target.closest(
        ".tos-scroll, .odds-card, .log-card, .summary-card, .operator, .log-feed"
      );
      if (!scrollable && !menuOpen()) {
        // allow default only inside scroll panels
        if (!target.closest("input, textarea")) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );

  console.log("TCG SPIN Mobile · portrait");
})();
