/** Theme mascots — cosmetics only. Odds never change. */
window.TCG = window.TCG || {};

TCG.THEMES = [
  {
    id: "fire",
    name: "Charmander",
    short: "FIRE",
    blurb: "Kanto fire starter",
    emoji: "🔥",
    img: "assets/themes/fire.png",
    gif: "assets/themes/fire.gif",
    cry: "assets/cries/fire.mp3",
    accent: "#ff6b35",
    accent2: "#ff3b4e",
    glow: "rgba(255, 80, 40, 0.35)",
    line: [
      { name: "Charmeleon", gif: "assets/evo/charmeleon.gif" },
      { name: "Charizard", gif: "assets/evo/charizard.gif" },
    ],
  },
  {
    id: "water",
    name: "Squirtle",
    short: "WATER",
    blurb: "Kanto water starter",
    emoji: "💧",
    img: "assets/themes/water.png",
    gif: "assets/themes/water.gif",
    cry: "assets/cries/water.mp3",
    accent: "#38bdf8",
    accent2: "#2563eb",
    glow: "rgba(56, 189, 248, 0.35)",
    line: [
      { name: "Wartortle", gif: "assets/evo/wartortle.gif" },
      { name: "Blastoise", gif: "assets/evo/blastoise.gif" },
    ],
  },
  {
    id: "grass",
    name: "Bulbasaur",
    short: "GRASS",
    blurb: "Kanto grass starter",
    emoji: "🌿",
    img: "assets/themes/grass.png",
    gif: "assets/themes/grass.gif",
    cry: "assets/cries/grass.mp3",
    accent: "#4ade80",
    accent2: "#16a34a",
    glow: "rgba(74, 222, 128, 0.35)",
    line: [
      { name: "Ivysaur", gif: "assets/evo/ivysaur.gif" },
      { name: "Venusaur", gif: "assets/evo/venusaur.gif" },
    ],
  },
  {
    id: "ghost",
    name: "Gengar",
    short: "GHOST",
    blurb: "Ghost-type mischief",
    emoji: "👻",
    img: "assets/themes/ghost.png",
    gif: "assets/themes/ghost.gif",
    cry: "assets/cries/ghost.mp3",
    accent: "#a855f7",
    accent2: "#7c3aed",
    glow: "rgba(168, 85, 247, 0.35)",
    line: [
      { name: "Gastly", gif: "assets/evo/gastly.gif" },
      { name: "Haunter", gif: "assets/evo/haunter.gif" },
    ],
  },
  {
    id: "normal",
    name: "Snorlax",
    short: "NORMAL",
    blurb: "Heavyweight napper",
    emoji: "😴",
    img: "assets/themes/normal.png",
    gif: "assets/themes/normal.gif",
    cry: "assets/cries/normal.mp3",
    accent: "#fbbf24",
    accent2: "#d97706",
    glow: "rgba(251, 191, 36, 0.35)",
    line: [{ name: "Munchlax", gif: "assets/evo/munchlax.gif" }],
  },
  {
    id: "electric",
    name: "Pikachu",
    short: "ELECTRIC",
    blurb: "Shocking crowd favorite",
    emoji: "⚡",
    img: "assets/themes/electric.png",
    gif: "assets/themes/electric.gif",
    cry: "assets/cries/electric.mp3",
    accent: "#facc15",
    accent2: "#eab308",
    glow: "rgba(250, 204, 21, 0.4)",
    line: [
      { name: "Pichu", gif: "assets/evo/pichu.gif" },
      { name: "Raichu", gif: "assets/evo/raichu.gif" },
    ],
  },
];

TCG.THEME_IDS = TCG.THEMES.map(function (t) {
  return t.id;
});

TCG.themeById = function (id) {
  return TCG.THEMES.find(function (t) {
    return t.id === id;
  });
};

TCG.emptyThemeStats = function () {
  return {
    spins: 0,
    prizes: { single: 0, pack: 0, bundle: 0, etb: 0, box: 0 },
  };
};

TCG.emptyDayThemes = function () {
  var out = {};
  TCG.THEMES.forEach(function (t) {
    out[t.id] = TCG.emptyThemeStats();
  });
  return out;
};
