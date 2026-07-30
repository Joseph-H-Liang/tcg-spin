/**
 * Prize & odds config — tweak weights anytime.
 * All money values in USD.
 */
window.TCG = window.TCG || {};

TCG.PRICES = {
  singleSpin: 3,
  sixPack: 15,
  packageSpins: 6,
};

/** Guaranteed prize id inside the 6-for-$15 deal */
TCG.PACKAGE_GUARANTEE = "single";

TCG.PRIZES = [
  {
    id: "miss",
    name: "No Prize",
    short: "MISS",
    handTo: "Nothing to hand out — next spin!",
    blurb: "So close — no prize this spin",
    cogs: 0,
    msrp: 0,
    cssClass: "prize-miss",
    rarity: "miss",
  },
  {
    id: "bonus",
    name: "Bonus Tile",
    short: "BONUS",
    handTo: "No product — give them a free spin (does not count)",
    blurb: "Surprise tile drops in · free respin",
    cogs: 0,
    msrp: 0,
    cssClass: "prize-bonus",
    rarity: "bonus",
  },
  {
    id: "single",
    name: "AR / Full Art",
    short: "SINGLE",
    handTo: "Hand them: 1 AR/FA single — JP, sometimes EN (mystery pull)",
    blurb: "Mystery AR/FA pull · JP, sometimes EN",
    cogs: 2,
    msrp: 4,
    cssClass: "prize-single",
    rarity: "uncommon",
  },
  {
    id: "pack",
    name: "Booster Pack",
    short: "PACK",
    handTo: "Hand them: 1 sealed booster pack",
    blurb: "Sealed booster pack",
    cogs: 7,
    msrp: 10,
    cssClass: "prize-pack",
    rarity: "rare",
  },
  {
    id: "bundle",
    name: "Booster Bundle",
    short: "BUNDLE",
    handTo: "Hand them: 1 booster bundle",
    blurb: "Booster bundle (6 packs)",
    cogs: 50,
    msrp: 60,
    cssClass: "prize-bundle",
    rarity: "epic",
  },
  {
    id: "etb",
    name: "Elite Trainer Box",
    short: "ETB",
    handTo: "Hand them: 1 Elite Trainer Box",
    blurb: "Elite Trainer Box",
    cogs: 85,
    msrp: 110,
    cssClass: "prize-etb",
    rarity: "legendary",
  },
  {
    id: "box",
    name: "Booster Box",
    short: "JACKPOT",
    handTo: "Hand them: 1 BOOSTER BOX — JACKPOT!",
    blurb: "Full booster box",
    cogs: 240,
    msrp: 280,
    cssClass: "prize-box",
    rarity: "jackpot",
  },
];

/**
 * Free / bonus respin tables — no bonus tile (no chain).
 * Paid tables below are tuned so: prize EV + BONUS_CHANCE × free EV ≈ 15% margin.
 * Bonus can stack on top of a prize win (independent 5% roll).
 */
TCG.BONUS_CHANCE = 0.05;

TCG.FREE_SINGLE_WEIGHTS = {
  miss: 7461,
  single: 1350,
  pack: 1000,
  bundle: 105,
  etb: 62,
  box: 22,
};

TCG.FREE_PACKAGE_WEIGHTS = {
  miss: 7948,
  single: 900,
  pack: 1000,
  bundle: 85,
  etb: 49,
  box: 18,
};

/**
 * $3 spin prizes — EV ~$2.42; +5% bonus tile → free (~$2.55) keeps ~15% margin.
 * Single ~12.8%, pack ~9.45%. Bonus is a separate roll (can stack with a win).
 */
TCG.SINGLE_WEIGHTS = {
  miss: 7595,
  single: 1280,
  pack: 945,
  bundle: 100,
  etb: 59,
  box: 21,
};

/**
 * Companion spins in 6-for-$15 (Single guaranteed separately).
 * Prize EV ~$2.05; +5% bonus tile → free. Deal ~$12.77 (~15% margin).
 */
TCG.PACKAGE_WEIGHTS = {
  miss: 8046,
  single: 858,
  pack: 952,
  bundle: 80,
  etb: 47,
  box: 17,
};

TCG.prizeById = function (id) {
  return TCG.PRIZES.find(function (p) {
    return p.id === id;
  });
};

TCG.expectedCogs = function (weights) {
  var totalW = 0;
  var sum = 0;
  TCG.PRIZES.forEach(function (p) {
    var w = weights[p.id] || 0;
    totalW += w;
    sum += w * p.cogs;
  });
  return totalW === 0 ? 0 : sum / totalW;
};

/** EV of paid table + independent bonus-tile chance × free-table EV. */
TCG.expectedCogsWithBonus = function (paidWeights, freeWeights) {
  var prizeEv = TCG.expectedCogs(paidWeights);
  var freeEv = TCG.expectedCogs(freeWeights);
  var p = TCG.BONUS_CHANCE || 0;
  return prizeEv + p * freeEv;
};

TCG.rollBonus = function () {
  return Math.random() < (TCG.BONUS_CHANCE || 0);
};

TCG.weightTable = function (weights) {
  var total = 0;
  Object.keys(weights).forEach(function (k) {
    total += weights[k];
  });
  return TCG.PRIZES.map(function (p) {
    var w = weights[p.id] || 0;
    return Object.assign({}, p, {
      weight: w,
      chance: total ? w / total : 0,
    });
  }).filter(function (p) {
    return p.weight > 0;
  });
};

TCG.prizeIconHtml = function (prize) {
  var id = prize.id;
  if (id === "miss") {
    return (
      '<div class="ico ico-miss" aria-hidden="true">' +
      '<span class="ico-miss-x"></span>' +
      "</div>"
    );
  }
  if (id === "bonus") {
    return (
      '<div class="ico ico-bonus" aria-hidden="true">' +
      '<span class="ico-bonus-ring"></span>' +
      '<span class="ico-bonus-arrow"></span>' +
      '<span class="ico-bonus-plus">+</span>' +
      "</div>"
    );
  }
  if (id === "single") {
    return (
      '<div class="ico ico-single" aria-hidden="true">' +
      '<span class="ico-single-card"></span>' +
      '<span class="ico-single-art"></span>' +
      '<span class="ico-single-star">★</span>' +
      "</div>"
    );
  }
  if (id === "pack") {
    return (
      '<div class="ico ico-pack" aria-hidden="true">' +
      '<span class="ico-pack-foil"></span>' +
      '<span class="ico-pack-band"></span>' +
      '<span class="ico-pack-ball"></span>' +
      "</div>"
    );
  }
  if (id === "bundle") {
    return (
      '<div class="ico ico-bundle" aria-hidden="true">' +
      '<span class="ico-bundle-wrap"></span>' +
      '<span class="ico-bundle-p1"></span>' +
      '<span class="ico-bundle-p2"></span>' +
      '<span class="ico-bundle-p3"></span>' +
      '<span class="ico-bundle-label">6</span>' +
      "</div>"
    );
  }
  if (id === "etb") {
    return (
      '<div class="ico ico-etb" aria-hidden="true">' +
      '<span class="ico-etb-lid"></span>' +
      '<span class="ico-etb-body"></span>' +
      '<span class="ico-etb-badge">ETB</span>' +
      "</div>"
    );
  }
  if (id === "box") {
    return (
      '<div class="ico ico-box" aria-hidden="true">' +
      '<span class="ico-box-top"></span>' +
      '<span class="ico-box-front"></span>' +
      '<span class="ico-box-side"></span>' +
      '<span class="ico-box-star">★</span>' +
      "</div>"
    );
  }
  return "";
};
