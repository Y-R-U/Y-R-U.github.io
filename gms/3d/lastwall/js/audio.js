// LASTWALL — procedural WebAudio: no asset files. Lazy init on first gesture.
let A = null, master = null, sfxG = null, musG = null, started = false;

function ctx() {
  if (!A) {
    A = new (window.AudioContext || window.webkitAudioContext)();
    master = A.createGain(); master.gain.value = 0.7; master.connect(A.destination);
    sfxG = A.createGain(); sfxG.gain.value = 1; sfxG.connect(master);
    musG = A.createGain(); musG.gain.value = 0.32; musG.connect(master);
  }
  if (A.state === 'suspended') A.resume();
  return A;
}
export function unlock() { ctx(); if (!started) { started = true; wind(); drone(); } }

const noiseBuf = (() => { let b = null; return () => {
  const a = ctx();
  if (!b) { b = a.createBuffer(1, a.sampleRate * 1.2, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return b;
}; })();

function burst(dur, freq, q, gain, decay = null, type = 'bandpass') {
  const a = ctx(), t = a.currentTime;
  const src = a.createBufferSource(); src.buffer = noiseBuf();
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (decay || dur));
  src.connect(f); f.connect(g); g.connect(sfxG);
  src.start(t); src.stop(t + dur);
}
function tone(freq, dur, gain, type = 'square', slide = 0) {
  const a = ctx(), t = a.currentTime;
  const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxG); o.start(t); o.stop(t + dur);
}

export const sfx = {
  shot()    { burst(.14, 1800, .8, .5); tone(160, .08, .3, 'square', -80); },
  heavyShot(){ burst(.25, 900, .7, .7); tone(90, .16, .45, 'square', -50); },
  scatter() { burst(.3, 700, .5, .8); tone(70, .2, .5, 'square', -30); },
  smg()     { burst(.07, 2200, 1, .3); },
  flame()   { burst(.16, 400, .4, .22, .16, 'lowpass'); },
  swing()   { burst(.16, 600, 2, .3, .14, 'highpass'); },
  thud()    { tone(90, .12, .5, 'sine', -40); burst(.08, 300, 1, .3); },
  squelch() { burst(.16, 500, .6, .55, .14); tone(140, .1, .3, 'sawtooth', -90); },
  crunch()  { burst(.2, 250, .8, .7); tone(60, .18, .5, 'sine', -30); },
  crack()   { burst(.1, 3000, 1.5, .5); },
  scream()  { tone(600, .7, .18, 'sawtooth', -420); },
  fall()    { tone(300, 1.0, .14, 'triangle', -260); },
  splat()   { burst(.22, 350, .5, .6); },
  boom()    { burst(.7, 120, .4, 1, .6, 'lowpass'); tone(46, .5, .7, 'sine', -20); },
  rumble()  { burst(1.6, 70, .3, .9, 1.4, 'lowpass'); tone(34, 1.4, .6, 'sine', -10); },
  pickup()  { tone(660, .1, .25, 'triangle'); setTimeout(() => tone(990, .14, .25, 'triangle'), 70); },
  boost()   { tone(220, .3, .3, 'sawtooth', 660); setTimeout(() => tone(440, .25, .25, 'square', 440), 120); },
  superReady(){ tone(523, .12, .3, 'triangle'); setTimeout(() => tone(784, .2, .3, 'triangle'), 110); },
  superFire(){ burst(.9, 200, .5, 1, .8, 'lowpass'); tone(38, .8, .8, 'sine', -14); tone(1200, .5, .2, 'sawtooth', -1000); },
  hurt()    { tone(200, .14, .4, 'square', -80); },
  die()     { tone(180, .8, .4, 'sawtooth', -140); },
  levelup() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, .22, .28, 'triangle'), i * 90)); },
  draft()   { tone(330, .2, .2, 'triangle', 110); },
  gate()    { burst(.8, 150, .6, .6, .7, 'lowpass'); tone(55, .7, .4, 'sine'); },
  roar()    { tone(90, .9, .55, 'sawtooth', -40); burst(.7, 250, .4, .5, .6, 'lowpass'); },
  click()   { burst(.03, 2000, 2, .2); },
};

// looping wind + distant moan bed
function wind() {
  const a = ctx();
  const src = a.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = .4;
  const g = a.createGain(); g.gain.value = .07;
  const lfo = a.createOscillator(); lfo.frequency.value = .13;
  const lg = a.createGain(); lg.gain.value = 120;
  lfo.connect(lg); lg.connect(f.frequency);
  src.connect(f); f.connect(g); g.connect(musG);
  src.start(); lfo.start();
}
let droneNodes = null;
function drone() {
  const a = ctx();
  const g = a.createGain(); g.gain.value = .05; g.connect(musG);
  for (const f of [55, 55.7, 82.4]) {
    const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const og = a.createGain(); og.gain.value = .3;
    const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 240;
    o.connect(og); og.connect(fl); fl.connect(g); o.start();
  }
  droneNodes = g;
}
export function bossMusic(on) { if (droneNodes) droneNodes.gain.value = on ? .12 : .05; }
