// Tiny WebAudio synth: every sound is generated, nothing to download.
let ctx = null, master = null, muted = false;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  startAmbience();
}
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; }

function tone(f, t0, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0, dur, { vol = 0.3, f = 2000, q = 1, type = 'bandpass' } = {}) {
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = b;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t0);
}
const now = () => ctx ? ctx.currentTime : 0;
const midi = m => 440 * Math.pow(2, (m - 69) / 12);

export const sfx = {
  click() { tone(2400, now(), 0.03, { vol: 0.1 }); },
  chip() { const t = now(); noise(t, 0.05, { f: 3400, q: 12, vol: 0.5 }); noise(t, 0.04, { f: 5600, q: 14, vol: 0.3 }); },
  chips() { for (let i = 0; i < 6; i++) sfx.chipAt(i * 0.045); },
  chipAt(d) { const t = now() + d; noise(t, 0.05, { f: 3000 + Math.random() * 900, q: 12, vol: 0.4 }); },
  card() { noise(now(), 0.14, { f: 4000, q: 1.2, vol: 0.35 }); },
  step(v = 1) { const t = now(); tone(110, t, 0.12, { vol: 0.12 * v, slide: 0.5 }); noise(t, 0.06, { f: 900, q: 2, vol: 0.08 * v }); },
  spin() { const t = now(); noise(t, 0.05, { f: 1500, q: 5, vol: 0.4 }); tone(1318.5, t + 0.05, 0.35, { vol: 0.15 }); },
  reelTick() { noise(now(), 0.03, { f: 2100, q: 8, vol: 0.18 }); },
  reelStop() { const t = now(); tone(90, t, 0.18, { vol: 0.3, slide: 0.6 }); noise(t, 0.05, { f: 2600, q: 6, vol: 0.2 }); },
  win() { const t = now(); [72, 76, 79, 84].forEach((m, i) => tone(midi(m), t + i * 0.07, 0.5, { vol: 0.2 })); },
  bigwin() { const t = now(); [72, 76, 79, 84, 79, 84, 88, 91, 96].forEach((m, i) => tone(midi(m), t + i * 0.09, 0.6, { vol: 0.2, type: 'triangle' })); sfx.coins(); },
  coins() { const t = now(); for (let i = 0; i < 24; i++) { const d = Math.pow(Math.random(), 0.8) * 1.6, f = 2000 + Math.random() * 2000; tone(f, t + d, 0.2, { vol: 0.06 }); tone(f * 1.5, t + d, 0.15, { vol: 0.04 }); } },
  lose() { const t = now(); [67, 63, 60].forEach((m, i) => tone(midi(m), t + i * 0.16, 0.5, { vol: 0.14, type: 'triangle' })); },
  nope() { const t = now(); tone(120, t, 0.12, { type: 'square', vol: 0.08 }); tone(120, t + 0.16, 0.12, { type: 'square', vol: 0.08 }); },
  ball() { noise(now(), 0.05, { f: 2200 + Math.random() * 800, q: 12, vol: 0.3 }); },
  roll() { const t = now(); for (let i = 0; i < 10; i++) noise(t + Math.random() * 0.5, 0.04, { f: 2500 + Math.random() * 2000, q: 9, vol: 0.3 }); },
  dice() { const t = now(); noise(t, 0.06, { f: 1700, q: 10, vol: 0.5 }); tone(220, t, 0.08, { vol: 0.15 }); },
  cheer() { const t = now(); noise(t, 1.2, { f: 1100, q: 0.7, vol: 0.35 }); for (let i = 0; i < 5; i++) tone(260 + Math.random() * 200, t + Math.random() * 0.2, 0.7, { vol: 0.05, type: 'sawtooth', slide: 1.5 }); },
  aww() { const t = now(); for (let i = 0; i < 5; i++) tone(300 + Math.random() * 120, t + Math.random() * 0.15, 0.9, { vol: 0.05, type: 'sawtooth', slide: 0.6 }); },
  pop() { tone(880, now(), 0.12, { vol: 0.15, slide: 1.6 }); },
  pour() { const t = now(); for (let i = 0; i < 8; i++) noise(t + i * 0.1, 0.1, { f: 700 + i * 110, q: 4, vol: 0.25 }); },
  gulp() { const t = now(); [0, 0.28, 0.56].forEach(d => tone(170, t + d, 0.18, { vol: 0.3, slide: 0.5 })); },
  powerup() { const t = now(); [60, 67, 72, 76, 79, 84, 88].forEach((m, i) => tone(midi(m), t + i * 0.05, 0.3, { vol: 0.15, type: 'square' })); },
  bell() { tone(392, now(), 2.5, { vol: 0.25 }); tone(784, now(), 1.5, { vol: 0.1 }); },
  fanfare() { const t = now(); [60, 64, 67, 72, 67, 72, 76, 79, 84].forEach((m, i) => tone(midi(m), t + i * 0.14, 0.7, { vol: 0.2, type: 'triangle' })); },
  bankrupt() { const t = now(); [64, 60, 57, 52].forEach((m, i) => tone(midi(m), t + i * 0.3, 0.8, { vol: 0.2, type: 'sawtooth' })); sfx.aww(); },
  chat() { tone(1200, now(), 0.08, { vol: 0.08 }); tone(1600, now() + 0.06, 0.08, { vol: 0.06 }); },
  clack() { noise(now(), 0.02, { f: 3000, q: 20, vol: 0.12 }); },
};

// Casino floor: a soft murmur and distant slot jingles, running forever.
function startAmbience() {
  const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last; }
  const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
  const g = ctx.createGain(); g.gain.value = 0.35;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
  s.connect(f); f.connect(g); g.connect(master); s.start();
  const jingle = () => {
    const t = now(), base = [72, 74, 76, 79][Math.floor(Math.random() * 4)];
    [0, 4, 7, 12].forEach((st, i) => tone(midi(base + st), t + i * 0.09, 0.6, { vol: 0.012 }));
    setTimeout(jingle, 800 + Math.random() * 2500);
  };
  jingle();
}
