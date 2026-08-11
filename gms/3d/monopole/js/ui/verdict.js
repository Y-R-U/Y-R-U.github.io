// The cold open, which plays itself. Owns #verdict and nothing else.
//
// Tapping is an accelerator, never a requirement: the whole thing runs to the end on its own, a
// tap jumps to the next beat, and Skip cuts to the last framing. There is no Next button.
//
// There are two clocks and the beat table carries both — `at` for the recorded ruling, `ms` for a
// run with no sound. Sound is the normal case and silence is the fallback, not the other way round:
// a muted tab, a failed fetch, an autoplay refusal and `?mute=1` all land in the same silent path,
// which is the sequence that shipped before there was a voice.
//
// Nothing in here waits on the audio decoding. `arm()` starts the fetch as early as the gate can
// call it, `unlock()` spends the tap that browsers demand before any sound is allowed, and if
// either of them comes back empty the ruling still plays.

import content from '../sim/content.js';
import { esc } from './format.js';

let root = null;
let timer = 0;
let raf = 0;
let playing = false;
let audio = null;
let armed = false;
let unlocked = false;
let started = null;
let readyP = null;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const beatsOf = () => content.verdict.beats;
const trackOf = () => content.verdict.track;

// How long the camera has to make the move that starts on beat `i` — the run of captions it is
// under, not the caption it is on. A beat with no shot of its own is holding this one, so the ease
// covers the lot and the approach reads as one continuous walk rather than a move per line.
function span(i, sound) {
  const beats = beatsOf();
  let j = i + 1;
  while (j < beats.length && !beats[j].shot) j++;
  if (sound) {
    const end = j < beats.length ? beats[j].at : trackOf().end;
    return Math.max(0, (end - beats[i].at) * 1000);
  }
  let ms = 0;
  for (let k = i; k < j; k++) ms += beats[k].ms;
  return ms;
}

// Where a key ends up once it has finished doing everything it is going to do. A cut has to land
// there and not on the framing the move started from, or skipping mid-drift throws the camera back.
const restOf = s => (s.drift ? { pos: s.drift.pos, look: s.drift.look, fov: s.drift.fov ?? s.fov } : s);

// One beat's camera work. A key with a `drift` arrives fast and then keeps going slowly for
// whatever is left of the beat — which is the whole shape of the sequence: land on the line, then
// creep. Without it every move is spread across its caption's whole run and a nine-second beat
// crawls so slowly that the frame looks frozen.
let moveSeq = 0;
function arm(camera, s, total) {
  const seq = ++moveSeq;
  if (reduced()) return camera.moveTo({ ...restOf(s), ms: 0 });
  const hit = s.ms != null ? Math.min(s.ms, total || s.ms) : total;
  const move = camera.moveTo({ pos: s.pos, look: s.look, fov: s.fov, ms: hit, ease: s.ease || 'inout' });
  const left = total - hit;
  if (!s.drift || left < 400) return move;
  return move.then(r => {
    if (!playing || r?.cut || seq !== moveSeq) return;
    const d = s.drift;
    camera.moveTo({ pos: d.pos, look: d.look, fov: d.fov ?? s.fov, ms: left, ease: d.ease || 'linear' });
  });
}

export const verdict = {
  get playing() { return playing; },
  get hasSound() { return !!audio && unlocked; },
  // seconds into the recording, or null when the silent cut is running. The beat map is authored
  // against this and tools/front.mjs --sound checks the captions against it.
  get now() { return audio && !audio.paused ? audio.currentTime : null; },

  // Start the fetch. Safe to call more than once and safe to call before anything is on screen —
  // 750 kB has to be in the buffer before beat 0 or the first line arrives over silence.
  arm() {
    if (armed) return audio;
    armed = true;
    try {
      audio = new Audio(trackOf().src);
      audio.preload = 'auto';
      audio.load();
    } catch { audio = null; }
    return audio;
  },

  // Whether the track can actually be played, resolved once and cached. The gate holds its own
  // button on this: 744 kB has to be in the buffer before a tap means anything, and a button that
  // says "Play the ruling" before then is a button that does nothing when it is pressed.
  ready() {
    if (readyP) return readyP;
    const a = this.arm();
    if (!a) return (readyP = Promise.resolve(false));
    readyP = new Promise(res => {
      const t0 = performance.now();
      let poll = 0;
      const settle = v => {
        clearInterval(poll);
        a.removeEventListener('canplaythrough', ok);
        a.removeEventListener('error', bad);
        res(v);
      };
      const ok = () => settle(true);
      const bad = () => settle(false);
      a.addEventListener('canplaythrough', ok, { once: true });
      a.addEventListener('error', bad, { once: true });
      // readyState is polled as well as listened for. The event does not always arrive, and a
      // browser still at readyState 0 after a couple of seconds is one that will not fetch until it
      // is touched — iOS ignores `preload` on a media element until a gesture. Holding the button
      // shut for that player would mean they could never choose sound at all.
      poll = setInterval(() => {
        if (a.readyState >= 4 || (a.readyState === 0 && performance.now() - t0 > 2500)) ok();
      }, 200);
      if (a.readyState >= 4) ok();
    });
    return readyP;
  },

  // Spend a real tap on the element. Browsers only allow sound from inside a gesture, so this has
  // to be called synchronously from a pointer handler — awaiting anything first loses the gesture.
  //
  // It starts the track for real and leaves it running, rather than the usual play-then-pause
  // unlock. Pausing here would race `play()`, which is called a few hundred milliseconds later by
  // the caller that is fading this card out, and whichever arrived second would win. Running it
  // straight through has no race and buys a better opening anyway: the bars come up under the fade
  // instead of after it. `play()` adopts whatever is already going.
  unlock() {
    const a = this.arm();
    if (!a) return Promise.resolve(false);
    a.currentTime = 0;
    a.volume = 0;
    started = Promise.resolve(a.play()).then(() => {
      unlocked = true;
      ramp(a, 1, 700);
      return true;
    }).catch(() => { started = null; return false; });
    return started;
  },

  play({ camera = null, onBeat = null, sound = true } = {}) {
    if (playing) return Promise.resolve({ skipped: false });
    playing = true;
    lastBar = -1;
    ensureRoot();
    const beats = beatsOf();
    const track = trackOf();
    const silentTotal = beats.reduce((n, b) => n + b.ms, 0);

    return new Promise(resolve => {
      let i = -1;
      let elapsed = 0;
      let withSound = false;

      const finish = skipped => {
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        cancelAnimationFrame(raf);
        fadeOut(skipped ? 420 : track.fade);
        // A skip is a cut. Easing to the last framing over most of a second flies the camera off a
        // fleet that the caller's reveal throws away on the same frame, and the player watches it
        // go — which is the one thing the hard cut in the middle of the ruling exists to hide.
        const last = beats[beats.length - 1].shot;
        if (skipped && camera) camera.moveTo({ ...restOf(last), ms: 0 });
        root.classList.remove('in');
        setTimeout(() => { root.innerHTML = ''; root.classList.remove('live'); }, 420);
        resolve({ skipped });
      };

      // Paint beat `n` and start whatever move it owns. The only difference between the two clocks
      // in here is how long that move is given.
      const show = n => {
        i = n;
        const b = beats[i];
        paint(b, progress(), i === beats.length - 1);
        if (camera && b.shot) arm(camera, b.shot, span(i, withSound));
        onBeat?.(b, i);
      };

      const progress = () => (withSound
        ? Math.min(1, audio.currentTime / track.end)
        : elapsed / silentTotal);

      // ── silent: each beat holds for its own `ms` ──────────────────────────
      const advance = () => {
        clearTimeout(timer);
        if (i >= 0) elapsed += beats[i].ms;
        if (i + 1 >= beats.length) return finish(false);
        show(i + 1);
        timer = setTimeout(advance, reduced() ? Math.min(beats[i].ms, 1400) : beats[i].ms);
      };

      // ── sound: the file is the clock, and it is the only clock ────────────
      // Beats are never scheduled ahead, they are compared against `currentTime` every frame. A
      // decode stall, a background tab throttling timers or a player scrubbing all move the audio
      // and the captions together, because there is nothing else keeping time.
      const follow = () => {
        if (!playing) return;
        const t = audio.currentTime;
        if (i >= beats.length - 1 && (t >= track.end || audio.ended)) return finish(false);
        let j = i;
        while (j + 1 < beats.length && t >= beats[j + 1].at) j++;
        if (j === i) bar(progress());
        else {
          // A backgrounded tab freezes rAF and does not freeze the audio, so coming back can be
          // several beats late. Everything jumped over still has to happen — one of those beats
          // throws Meridian's fleet away — and its framing is taken as a cut, because easing
          // through three framings at once is how the player sees the fleet go.
          for (let k = i + 1; k < j; k++) {
            if (camera && beats[k].shot) camera.moveTo({ ...restOf(beats[k].shot), ms: 0 });
            onBeat?.(beats[k], k);
          }
          show(j);
        }
        raf = requestAnimationFrame(follow);
      };

      const startSilent = () => {
        withSound = false;
        i = -1;
        advance();
      };

      root.classList.add('live');
      requestAnimationFrame(() => root.classList.add('in'));
      root.onclick = e => {
        if (e.target.closest('[data-v="skip"]')) return finish(true);
        if (!withSound) return advance();
        // With sound the captions are not free to run ahead of the voice, so a tap moves the
        // recording rather than the text. Seeking keeps the two locked together for good.
        const nx = beats[i + 1];
        if (!nx) return finish(false);
        audio.currentTime = nx.at;
        show(i + 1);
      };

      const a = sound ? this.arm() : null;
      if (!a) { startSilent(); return; }
      // Already running because the gate spent a tap on it — adopt it rather than restarting, or
      // the opening bars play twice. Otherwise this is the attempt that will be refused when no
      // gesture has been spent, and the refusal is the silent cut.
      const p = started || Promise.resolve((a.currentTime = 0, a.play()));
      p.then(ok => {
        if (!playing) return;
        if (ok === false || a.paused) throw new Error('no sound');
        withSound = true;
        show(0);
        raf = requestAnimationFrame(follow);
      }).catch(() => { if (playing) startSilent(); });
    });
  },

  stop() {
    if (!playing) return;
    playing = false;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    fadeOut(300);
    root && (root.innerHTML = '');
  },
};

// One ramp for both directions, with a token so a fade-out started mid-fade-in wins rather than
// fighting it. Reaching zero pauses: a paused element stops decoding, a silent one does not.
let rampId = 0;
function ramp(a, to, ms) {
  const id = ++rampId;
  const from = a.volume;
  const t0 = performance.now();
  const step = () => {
    if (id !== rampId) return;
    const k = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else if (to === 0) { a.pause(); a.currentTime = 0; a.volume = 1; }
  };
  step();
}

// Cutting the sound dead on the last beat leaves a hole where the origin screen comes up. The tail
// of the track is written to be sat under, so it is faded rather than stopped.
function fadeOut(ms) {
  started = null;
  if (!audio || audio.paused) return;
  ramp(audio, 0, ms);
}

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('verdict');
  if (!root) {
    root = document.createElement('div');
    root.id = 'verdict';
    document.body.appendChild(root);
  }
  root.addEventListener('pointerdown', e => e.stopPropagation());
  return root;
}

// Driven off the audio this is a per-frame call, and the fill carries a half-second linear
// transition — writing it sixty times a second restarts that transition sixty times and the bar
// stops moving. Once every half a percent lets the transition do the work it is there for.
let lastBar = -1;
function bar(progress) {
  if (Math.abs(progress - lastBar) < 0.005) return;
  lastBar = progress;
  const el = root.querySelector('.v-bar span');
  if (el) el.style.width = `${(progress * 100).toFixed(1)}%`;
}

function paint(b, progress, last) {
  const body = {
    seal: () => `
      <div class="v-seal">
        <div class="v-mark" aria-hidden="true"><i></i><i></i><i></i></div>
        <i class="v-over">${esc(b.over)}</i>
        <h1>${esc(b.text)}</h1>
      </div>`,
    record: () => `
      <div class="v-record${b.weight ? ' weight' : ''}">
        <i class="v-over">${esc(b.over)}</i>
        <p>${esc(b.text)}</p>
      </div>`,
    stamp: () => `
      <div class="v-stamp">
        <b>${esc(b.text)}</b>
        <s>${esc(b.sub || '')}</s>
      </div>`,
    sentence: () => `
      <div class="v-sentence">
        <i class="v-over">${esc(b.over)}</i>
        <p>${esc(b.text)}</p>
      </div>`,
    land: () => `<div class="v-land"><p>${esc(b.text)}</p></div>`,
    // The instrumental. Nothing is written over the Reach for fifteen seconds on purpose.
    blank: () => '',
  }[b.kind];

  root.innerHTML = `
    <div class="v-bar"><span style="width:${(progress * 100).toFixed(1)}%"></span></div>
    <div class="v-stage" key="${esc(b.id)}">${body()}</div>
    ${last ? '' : '<button class="v-skip" data-v="skip">Skip</button>'}`;
  const stage = root.querySelector('.v-stage');
  requestAnimationFrame(() => stage.classList.add('in'));
}

export default verdict;
