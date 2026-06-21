// Homegrown audio — pure Web Audio synthesis, no samples, no files. SFX blips
// for the games plus two looping chiptune themes (DOOM's "At Doom's Gate" riff
// and Tetris' Korobeiniki). Created lazily on first sound (after a user gesture,
// which a game keypress already is). Muteable + remembers nothing on its own.

export function createAudio() {
  let ctx = null, master = null, enabled = true;
  const stops = []; // active music voice stoppers

  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { enabled = false; return null; }
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.16;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch { enabled = false; return null; }
  }

  function tone(freq, dur = 0.08, type = "square", gain = 0.2, when = 0) {
    if (!enabled || !freq) return;
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur = 0.12, gain = 0.3) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(master); src.start();
  }

  function slide(f1, f2, dur, type = "sawtooth", gain = 0.25) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  const sfx = {
    shoot: () => { tone(900, 0.05, "square", 0.12); tone(500, 0.05, "square", 0.08, 0.01); },
    hit: () => { tone(240, 0.07, "sawtooth", 0.18); noise(0.05, 0.12); },
    kill: () => { noise(0.16, 0.22); tone(120, 0.16, "sawtooth", 0.16); },
    die: () => slide(300, 60, 0.6, "sawtooth", 0.28),
    clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, "square", 0.16, i * 0.05)),
    level: () => [392, 523, 659, 880].forEach((f, i) => tone(f, 0.12, "square", 0.16, i * 0.07)),
    bounce: () => tone(620, 0.04, "square", 0.14),
    eat: () => { tone(820, 0.05, "square", 0.13); tone(1240, 0.05, "square", 0.1, 0.04); },
    blip: () => tone(420, 0.03, "square", 0.08),
    rotate: () => tone(360, 0.04, "triangle", 0.1),
    lock: () => tone(180, 0.06, "square", 0.14),
    point: () => { tone(700, 0.06, "square", 0.14); tone(1050, 0.06, "square", 0.1, 0.05); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, "square", 0.16, i * 0.09)),
  };

  // step sequencer: notes = [[freq, beats], ...]; loops until stopped
  function playSeq(notes, msPerBeat, type, gain) {
    let i = 0, stopped = false, to = null;
    function step() {
      if (stopped || !enabled) { if (!stopped) to = setTimeout(step, 200); return; }
      const [f, b] = notes[i];
      if (f) tone(f, Math.max(0.05, (b * msPerBeat) / 1000 * 0.9), type, gain);
      i = (i + 1) % notes.length;
      to = setTimeout(step, b * msPerBeat);
    }
    step();
    return () => { stopped = true; clearTimeout(to); };
  }

  // notes
  const N = { E2: 82.41, E3: 164.81, F3: 174.61, G3: 196.0, Bb3: 233.08, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880 };

  const TUNES = {
    doom: () => {
      const lead = [[N.E3, 1], [N.E3, 1], [N.E3, 1], [N.E3, 1], [N.E3, 1], [N.E3, 1], [N.G3, 1], [N.E3, 1], [N.E3, 1], [N.E3, 1], [N.Bb3, 1], [N.Bb3, 1], [N.G3, 1], [N.F3, 1], [N.E3, 1], [0, 1]];
      stops.push(playSeq(lead, 112, "square", 0.14));
      stops.push(playSeq([[N.E2, 1]], 112, "sawtooth", 0.1)); // the chug
    },
    tetris: () => {
      const m = [[N.E5, 2], [N.B4, 1], [N.C5, 1], [N.D5, 2], [N.C5, 1], [N.B4, 1], [N.A4, 2], [N.A4, 1], [N.C5, 1], [N.E5, 2], [N.D5, 1], [N.C5, 1], [N.B4, 3], [N.C5, 1], [N.D5, 2], [N.E5, 2], [N.C5, 2], [N.A4, 2], [N.A4, 2], [0, 2]];
      stops.push(playSeq(m, 140, "square", 0.13));
    },
  };

  function music(name) { stopMusic(); if (TUNES[name]) TUNES[name](); }
  function stopMusic() { while (stops.length) stops.pop()(); }

  return {
    sfx,
    music,
    stopMusic,
    setEnabled(on) { enabled = !!on; if (!enabled) stopMusic(); },
    isEnabled: () => enabled,
  };
}
