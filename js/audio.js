window.TCG = window.TCG || {};

(function () {
  var ctx = null;
  var muted = false;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gain) {
    if (muted) return;
    type = type || "square";
    gain = gain == null ? 0.08 : gain;
    var c = ac();
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.02);
  }

  TCG.audio = {
    setMuted: function (v) {
      muted = !!v;
    },
    isMuted: function () {
      return muted;
    },
    unlock: function () {
      try {
        ac();
      } catch (e) {}
    },
    tick: function () {
      tone(180 + Math.random() * 80, 0, 0.04, "square", 0.04);
    },
    spinStart: function () {
      tone(120, 0, 0.15, "sawtooth", 0.06);
      tone(180, 0.08, 0.12, "square", 0.05);
    },
    reelStop: function () {
      tone(220, 0, 0.08, "triangle", 0.09);
      tone(330, 0.05, 0.1, "square", 0.05);
    },
    heartbeat: function () {
      if (muted) return;
      tone(90, 0, 0.12, "sine", 0.09);
      tone(70, 0.18, 0.14, "sine", 0.07);
    },
    clutch: function () {
      if (muted) return;
      tone(160, 0, 0.25, "sawtooth", 0.04);
      tone(200, 0.05, 0.4, "triangle", 0.05);
      tone(120, 0.2, 0.35, "sine", 0.06);
    },
    gasp: function () {
      tone(880, 0, 0.05, "square", 0.04);
      tone(660, 0.08, 0.12, "triangle", 0.05);
      tone(200, 0.2, 0.25, "sine", 0.06);
    },
    rise: function () {
      if (muted) return;
      for (var i = 0; i < 6; i++) {
        tone(180 + i * 55, i * 0.07, 0.1, "square", 0.035);
      }
    },
    miss: function () {
      tone(300, 0, 0.1, "triangle", 0.05);
      tone(220, 0.12, 0.15, "triangle", 0.05);
    },
    nearMiss: function () {
      tone(520, 0, 0.08, "square", 0.05);
      tone(520, 0.12, 0.08, "square", 0.05);
      tone(280, 0.28, 0.22, "triangle", 0.07);
    },
    line: function () {
      tone(440, 0, 0.08, "square", 0.06);
      tone(660, 0.1, 0.1, "square", 0.07);
      tone(880, 0.22, 0.18, "sawtooth", 0.06);
    },
    win: function (rarity) {
      if (muted) return;
      var sequences = {
        bonus: [392, 523, 659, 784],
        uncommon: [440, 554, 659],
        rare: [523, 659, 784, 1046],
        epic: [392, 523, 659, 784, 988],
        legendary: [523, 659, 784, 1046, 1318],
        jackpot: [262, 330, 392, 523, 659, 784, 1046, 1318],
      };
      var notes = sequences[rarity] || sequences.uncommon;
      var step = rarity === "jackpot" ? 0.09 : rarity === "bonus" ? 0.09 : 0.11;
      notes.forEach(function (f, i) {
        tone(f, i * step, 0.2, rarity === "jackpot" ? "sawtooth" : "square", 0.07);
      });
      if (rarity === "bonus") {
        tone(880, 0.4, 0.15, "triangle", 0.06);
        tone(1174, 0.52, 0.2, "square", 0.05);
      }
      if (rarity === "jackpot" || rarity === "legendary") {
        for (var i = 0; i < 8; i++) {
          tone(800 + i * 60, 0.7 + i * 0.05, 0.08, "square", 0.04);
        }
      }
    },
    /** Pokemon battle-start SFX (~1.15s, faded) when the bonus tile slams in */
    bonusSlam: function () {
      if (muted) return;
      try {
        if (TCG.audio._bonus) {
          TCG.audio._bonus.pause();
          TCG.audio._bonus = null;
        }
        var audio = new Audio("assets/sfx/bonus-battle.mp3");
        audio.volume = 0.95;
        TCG.audio._bonus = audio;
        var played = audio.play();
        if (played && played.catch) {
          played.catch(function () {
            TCG.audio._bonusBeep();
          });
        }
      } catch (e) {
        TCG.audio._bonusBeep();
      }
    },
    /** Synth fallback if the battle clip can't play */
    _bonusBeep: function () {
      if (muted) return;
      tone(90, 0, 0.18, "sine", 0.1);
      tone(140, 0.05, 0.22, "sawtooth", 0.07);
      tone(523, 0.12, 0.12, "square", 0.08);
      tone(784, 0.22, 0.16, "square", 0.08);
      tone(1046, 0.36, 0.22, "triangle", 0.07);
      tone(1318, 0.5, 0.28, "square", 0.05);
    },
    /** Play theme cry from cut YouTube clip (no TTS). */
    callStarter: function (theme) {
      if (muted || !theme || !theme.cry) return;
      try {
        if (TCG.audio._cry) {
          TCG.audio._cry.pause();
          TCG.audio._cry = null;
        }
        var audio = new Audio(theme.cry);
        audio.volume = 0.9;
        TCG.audio._cry = audio;
        audio.play().catch(function () {});
      } catch (e) {}
    },
    stopCall: function () {
      try {
        if (TCG.audio._cry) {
          TCG.audio._cry.pause();
          TCG.audio._cry.currentTime = 0;
          TCG.audio._cry = null;
        }
        if (TCG.audio._bonus) {
          TCG.audio._bonus.pause();
          TCG.audio._bonus.currentTime = 0;
          TCG.audio._bonus = null;
        }
      } catch (e) {}
    },
    click: function () {
      tone(600, 0, 0.03, "square", 0.04);
    },
    attractBeep: function () {
      tone(880, 0, 0.06, "square", 0.03);
      tone(1174, 0.08, 0.08, "square", 0.03);
    },
  };
})();
