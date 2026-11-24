// audio.js — synthesized sound effects with WebAudio. No audio files, no network.
// Everything is lazy: the AudioContext is created on the first user gesture.
let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOn = false;
let sirenOsc = null;
let sirenGain = null;

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { return null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioUnlock() { ensureCtx(); }

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
  const c = ensureCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(c.currentTime + dur);
}

function noiseBurst(dur, vol = 0.3, lowpass = 1200) {
  const c = ensureCtx(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

export const sfx = {
  shoot() { noiseBurst(0.12, 0.5, 2600); tone(180, 0.08, 'square', 0.15, 60); },
  punch() { noiseBurst(0.08, 0.3, 900); },
  pickup() { tone(660, 0.09, 'sine', 0.25); setTimeout(() => tone(990, 0.12, 'sine', 0.25), 70); },
  cash() { tone(880, 0.1, 'triangle', 0.25); setTimeout(() => tone(1174, 0.14, 'triangle', 0.25), 90); },
  mission() { tone(523, 0.12, 'triangle', 0.25); setTimeout(() => tone(659, 0.12, 'triangle', 0.25), 110); setTimeout(() => tone(784, 0.2, 'triangle', 0.25), 220); },
  fail() { tone(330, 0.25, 'sawtooth', 0.2, 165); },
  busted() { tone(220, 0.4, 'sawtooth', 0.25, 110); },
  crash() { noiseBurst(0.25, 0.5, 700); },
  horn() { tone(370, 0.18, 'square', 0.12); tone(466, 0.18, 'square', 0.1); },
  click() { tone(1200, 0.04, 'square', 0.12); },
  door() { noiseBurst(0.1, 0.25, 500); tone(140, 0.1, 'sine', 0.2, 90); },
};

// Engine hum follows the player's car speed (0..1).
export function engineSound(speed01, on) {
  const c = ensureCtx(); if (!c) return;
  if (!on) {
    if (engineOsc) { try { engineOsc.stop(); } catch (e) {} engineOsc = null; engineGain = null; }
    return;
  }
  if (!engineOsc) {
    engineOsc = c.createOscillator(); engineOsc.type = 'sawtooth';
    engineGain = c.createGain(); engineGain.gain.value = 0.0;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  engineOsc.frequency.value = 55 + speed01 * 130;
  engineGain.gain.value = 0.05 + speed01 * 0.06;
}

// Two-tone police siren while any wanted level is active.
export function sirenSound(on) {
  if (on === sirenOn) return;
  sirenOn = on;
  const c = ensureCtx(); if (!c) { sirenOn = false; return; }
  if (!on) {
    if (sirenOsc) { try { sirenOsc.stop(); } catch (e) {} sirenOsc = null; sirenGain = null; }
    return;
  }
  sirenOsc = c.createOscillator(); sirenOsc.type = 'triangle';
  sirenGain = c.createGain(); sirenGain.gain.value = 0.045;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.9;
  const lfoGain = c.createGain(); lfoGain.gain.value = 220;
  lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
  sirenOsc.frequency.value = 720;
  sirenOsc.connect(sirenGain); sirenGain.connect(master);
  sirenOsc.start(); lfo.start();
  sirenOsc._lfo = lfo;
}
