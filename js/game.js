window.TCG = window.TCG || {};

(function () {
  /** 3×3 cell indices
   *  0 1 2
   *  3 4 5
   *  6 7 8
   */
  TCG.PAYLINES = [
    { id: "row0", cells: [0, 1, 2], kind: "row" },
    { id: "row1", cells: [3, 4, 5], kind: "row" },
    { id: "row2", cells: [6, 7, 8], kind: "row" },
    { id: "col0", cells: [0, 3, 6], kind: "col" },
    { id: "col1", cells: [1, 4, 7], kind: "col" },
    { id: "col2", cells: [2, 5, 8], kind: "col" },
    { id: "diag", cells: [0, 4, 8], kind: "diag" },
    { id: "adiag", cells: [2, 4, 6], kind: "diag" },
  ];

  function pickWeighted(weights) {
    var total = 0;
    TCG.PRIZES.forEach(function (p) {
      total += weights[p.id] || 0;
    });
    if (total <= 0) return TCG.prizeById("miss");
    var r = Math.random() * total;
    for (var i = 0; i < TCG.PRIZES.length; i++) {
      r -= weights[TCG.PRIZES[i].id] || 0;
      if (r < 0) return TCG.PRIZES[i];
    }
    return TCG.PRIZES[TCG.PRIZES.length - 1];
  }

  function randItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function sealedPrizes() {
    return TCG.PRIZES.filter(function (p) {
      return p.id !== "miss";
    });
  }

  function productPrizes() {
    return TCG.PRIZES.filter(function (p) {
      return p.id !== "miss" && p.id !== "bonus";
    });
  }

  function decoyPool(avoidId) {
    var pool = [TCG.prizeById("miss"), TCG.prizeById("miss"), TCG.prizeById("miss")];
    productPrizes().forEach(function (p) {
      if (p.id !== avoidId) pool.push(p);
    });
    return pool;
  }

  /** True if board has any 3-in-a-row of the same non-miss prize */
  function findWins(board) {
    var wins = [];
    TCG.PAYLINES.forEach(function (line) {
      var a = board[line.cells[0]];
      var b = board[line.cells[1]];
      var c = board[line.cells[2]];
      if (a && b && c && a.id !== "miss" && a.id === b.id && b.id === c.id) {
        wins.push({ line: line, prize: a });
      }
    });
    return wins;
  }

  function boardHasWin(board) {
    return findWins(board).length > 0;
  }

  function fillRest(board, lineCells, avoidId) {
    var set = {};
    lineCells.forEach(function (i) {
      set[i] = true;
    });
    var pool = decoyPool(avoidId);
    for (var i = 0; i < 9; i++) {
      if (set[i]) continue;
      board[i] = randItem(pool);
    }
    // Repair accidental extra wins
    var guard = 0;
    while (boardHasWin(board) && guard < 40) {
      guard++;
      var wins = findWins(board);
      wins.forEach(function (w) {
        // Don't break the intended line cells if they match avoidId win
        var breakable = w.line.cells.filter(function (idx) {
          return !set[idx];
        });
        if (!breakable.length) {
          // Intended line — leave it; break another cell on accidental lines
          breakable = w.line.cells.slice(1);
        }
        var idx = randItem(breakable);
        if (!set[idx]) board[idx] = TCG.prizeById("miss");
        else board[idx] = randItem(decoyPool(avoidId));
      });
      // Re-check: if intended win was destroyed, restore
      if (avoidId && avoidId !== "miss") {
        var still = findWins(board).some(function (w) {
          return w.prize.id === avoidId && w.line.cells.every(function (c) {
            return set[c];
          });
        });
        // Simpler: force intended line back
        lineCells.forEach(function (idx) {
          board[idx] = TCG.prizeById(avoidId);
        });
      }
    }
    return board;
  }

  /** Stage a winning 3×3 for a known prize */
  function buildWinBoard(prize) {
    var line = randItem(TCG.PAYLINES);
    var board = new Array(9);
    line.cells.forEach(function (i) {
      board[i] = prize;
    });
    fillRest(board, line.cells, prize.id);
    // Ensure the intended win exists
    line.cells.forEach(function (i) {
      board[i] = prize;
    });
    // Knock out any OTHER winning lines
    var guard = 0;
    while (guard < 30) {
      guard++;
      var wins = findWins(board).filter(function (w) {
        return w.line.id !== line.id;
      });
      if (!wins.length) break;
      wins.forEach(function (w) {
        var idx = randItem(
          w.line.cells.filter(function (c) {
            return line.cells.indexOf(c) === -1;
          })
        );
        if (idx == null) idx = randItem(w.line.cells);
        board[idx] = TCG.prizeById("miss");
      });
      line.cells.forEach(function (i) {
        board[i] = prize;
      });
    }
    return {
      board: board,
      prize: prize,
      wins: [{ line: line, prize: prize }],
      nearMiss: null,
      kind: "win",
    };
  }

  /** Stage a near-miss: 2 matching on a line, third fails last */
  function buildNearMissBoard() {
    var tease = randItem([
      TCG.prizeById("single"),
      TCG.prizeById("single"),
      TCG.prizeById("single"),
      TCG.prizeById("pack"),
      TCG.prizeById("pack"),
      TCG.prizeById("bundle"),
      TCG.prizeById("bundle"),
      TCG.prizeById("etb"),
      TCG.prizeById("box"),
    ]);
    var line = randItem(TCG.PAYLINES);
    var order = shuffle(line.cells.slice());
    var matchA = order[0];
    var matchB = order[1];
    var breaker = order[2]; // lands last for drama

    var board = new Array(9);
    board[matchA] = tease;
    board[matchB] = tease;
    // Breaker: usually miss, sometimes a different sealed tease
    board[breaker] =
      Math.random() < 0.75
        ? TCG.prizeById("miss")
        : randItem(decoyPool(tease.id).filter(function (p) {
            return p.id !== "miss";
          }));

    fillRest(board, line.cells, tease.id);
    board[matchA] = tease;
    board[matchB] = tease;
    // Keep breaker as set
    if (!board[breaker] || board[breaker].id === tease.id) {
      board[breaker] = TCG.prizeById("miss");
    }

    // Scrub any accidental real wins
    var guard = 0;
    while (boardHasWin(board) && guard < 30) {
      guard++;
      findWins(board).forEach(function (w) {
        var idx = randItem(w.line.cells);
        board[idx] = TCG.prizeById("miss");
      });
      board[matchA] = tease;
      board[matchB] = tease;
      if (board[breaker].id === tease.id) board[breaker] = TCG.prizeById("miss");
    }

    return {
      board: board,
      prize: TCG.prizeById("miss"),
      wins: [],
      nearMiss: {
        line: line,
        tease: tease,
        matched: [matchA, matchB],
        breaker: breaker,
      },
      kind: "near",
    };
  }

  /** Flat miss — no strong tease */
  function buildDeadBoard() {
    var board = new Array(9);
    var pool = [
      TCG.prizeById("miss"),
      TCG.prizeById("miss"),
      TCG.prizeById("single"),
      TCG.prizeById("pack"),
      TCG.prizeById("bundle"),
    ];
    for (var i = 0; i < 9; i++) board[i] = randItem(pool);
    var guard = 0;
    while (boardHasWin(board) && guard < 40) {
      guard++;
      findWins(board).forEach(function (w) {
        board[randItem(w.line.cells)] = TCG.prizeById("miss");
      });
    }
    // Soft tease: exactly one pair somewhere, not on a full line
    if (Math.random() < 0.5) {
      var line = randItem(TCG.PAYLINES);
      var tease = TCG.prizeById("single");
      board[line.cells[0]] = tease;
      board[line.cells[1]] = tease;
      board[line.cells[2]] = TCG.prizeById("miss");
    }
    while (boardHasWin(board)) {
      findWins(board).forEach(function (w) {
        board[randItem(w.line.cells)] = TCG.prizeById("miss");
      });
    }
    return {
      board: board,
      prize: TCG.prizeById("miss"),
      wins: [],
      nearMiss: null,
      kind: "dead",
    };
  }

  /**
   * Attach an independent bonus tile to any settled board.
   * Prefers a miss cell that isn't on a winning line.
   */
  function attachBonus(outcome) {
    var winCells = {};
    (outcome.wins || []).forEach(function (w) {
      w.line.cells.forEach(function (c) {
        winCells[c] = true;
      });
    });
    var missCells = [];
    var other = [];
    for (var i = 0; i < 9; i++) {
      if (winCells[i]) continue;
      if (outcome.board[i] && outcome.board[i].id === "miss") missCells.push(i);
      else other.push(i);
    }
    var pool = missCells.length ? missCells : other.length ? other : [4];
    var bonusCell =
      pool.indexOf(4) !== -1 && Math.random() < 0.55
        ? 4
        : randItem(pool);
    outcome.bonus = true;
    outcome.bonusCell = bonusCell;
    return outcome;
  }

  /**
   * Build a full spin outcome from a determined prize.
   * Misses often become near-miss boards for suspense.
   * Bonus tile is attached separately (can stack with a win).
   */
  TCG.buildSpinOutcome = function (prize) {
    if (prize.id === "miss") {
      return Math.random() < 0.72 ? buildNearMissBoard() : buildDeadBoard();
    }
    return buildWinBoard(prize);
  };

  TCG.attachBonus = attachBonus;

  TCG.rollSingle = function () {
    return pickWeighted(TCG.SINGLE_WEIGHTS);
  };

  TCG.rollFreeSingle = function () {
    return pickWeighted(TCG.FREE_SINGLE_WEIGHTS);
  };

  TCG.rollFreePackage = function () {
    return pickWeighted(TCG.FREE_PACKAGE_WEIGHTS);
  };

  TCG.rollPackage = function () {
    var n = TCG.PRICES.packageSpins;
    var companions = n - 1;
    var rolls = [];
    for (var i = 0; i < companions; i++) {
      rolls.push(pickWeighted(TCG.PACKAGE_WEIGHTS));
    }
    var insertAt =
      Math.random() < 0.75
        ? Math.max(0, n - 3) + Math.floor(Math.random() * Math.min(3, n))
        : Math.floor(Math.random() * n);
    if (insertAt > rolls.length) insertAt = rolls.length;
    var results = rolls.slice();
    results.splice(insertAt, 0, TCG.prizeById(TCG.PACKAGE_GUARANTEE || "single"));
    return { results: results.slice(0, n), guaranteeIndex: insertAt };
  };

  // Back-compat alias
  TCG.rollTenPack = TCG.rollPackage;

  TCG.createSession = function () {
    var wins = {};
    var since = {};
    TCG.PRIZES.forEach(function (p) {
      wins[p.id] = 0;
      if (p.id !== "miss") since[p.id] = 0;
    });
    return {
      spins: 0,
      revenue: 0,
      cogs: 0,
      wins: wins,
      since: since,
      history: [],
    };
  };

  TCG.recordSpin = function (session, prize, pricePaid) {
    session.spins += 1;
    session.revenue += pricePaid;
    session.cogs += prize.cogs;
    session.wins[prize.id] = (session.wins[prize.id] || 0) + 1;

    // Drought counters — every non-miss prize tracks spins since it last hit
    Object.keys(session.since).forEach(function (id) {
      if (prize.id === id) session.since[id] = 0;
      else session.since[id] += 1;
    });

    session.history.unshift({
      at: Date.now(),
      prizeId: prize.id,
      name: prize.name,
      cogs: prize.cogs,
      paid: pricePaid,
    });
    if (session.history.length > 50) session.history.length = 50;
  };

  /** Bonus tile can stack with a prize — count it without double revenue. */
  TCG.recordBonusHit = function (session) {
    session.wins.bonus = (session.wins.bonus || 0) + 1;
    if (session.since && session.since.bonus != null) session.since.bonus = 0;
  };

  TCG.sessionProfit = function (session) {
    return session.revenue - session.cogs;
  };

  TCG.oddsSummary = function () {
    var n = TCG.PRICES.packageSpins;
    var guarantee = TCG.prizeById(TCG.PACKAGE_GUARANTEE || "single");
    var companionEv = TCG.expectedCogsWithBonus(
      TCG.PACKAGE_WEIGHTS,
      TCG.FREE_PACKAGE_WEIGHTS
    );
    var packageEv = guarantee.cogs + (n - 1) * companionEv;
    return {
      singleEv: TCG.expectedCogsWithBonus(
        TCG.SINGLE_WEIGHTS,
        TCG.FREE_SINGLE_WEIGHTS
      ),
      packageCompanionEv: companionEv,
      packageEv: packageEv,
      tenPackEv: packageEv,
      prices: TCG.PRICES,
    };
  };

  /** Icon strip order for spinning cells — bonus is never on the strip */
  TCG.spinStrip = function () {
    return [
      "miss",
      "single",
      "pack",
      "miss",
      "bundle",
      "single",
      "etb",
      "miss",
      "pack",
      "box",
      "single",
      "bundle",
      "miss",
    ].map(TCG.prizeById);
  };

  TCG.findWins = findWins;
})();
