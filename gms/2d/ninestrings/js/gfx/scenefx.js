// The seam. Every `world.events` entry becomes pixels and sound HERE and
// nowhere else, which is what keeps the sim node-runnable and keeps every other
// gfx module from reaching into world state.
//
// Nothing in this file may write to the world. It reads an event list and
// drives particles, the camera, the post uniforms, floating numbers and audio.

import { PRESETS } from './particles.js';

// One persistent object, mutated in place - postfx requires this, and a fresh
// literal per frame would allocate 60 objects a second for no reason.
const POST = { bloom: 1, shake: { x: 0, y: 0 }, chroma: 0, vignette: 0.65,
               flash: 0, desat: 0, time: 0 };

// Floating damage numbers are presentation, not sim state (CONTRACTS 7.1), so
// they live here in a flat ring buffer.
const NUM_CAP = 96;
const FX_CAP = 160;
const SHAKE_SCALE = 1 / 7;   // sim intensity (0..25) -> camera magnitude (0..3.5)
const WHITE = [1, 1, 1];

export function makeSceneFx(ctx) {
  const { renderer, particles, camera, audio, viewport } = ctx;

  const nx = new Float32Array(NUM_CAP), ny = new Float32Array(NUM_CAP);
  const nvx = new Float32Array(NUM_CAP), nvy = new Float32Array(NUM_CAP);
  const nlife = new Float32Array(NUM_CAP), nmax = new Float32Array(NUM_CAP);
  const nval = new Float32Array(NUM_CAP), ncrit = new Uint8Array(NUM_CAP);
  let nHead = 0, nLive = 0;

  // Transient weapon visuals. Without these the player's attacks are literally
  // invisible: the sim emits swing/orb/aura/bolt/strike every time a weapon
  // fires and nothing was drawing them.
  // Struct-of-arrays for the same reason the particles are.
  const fkind = new Uint8Array(FX_CAP);          // 1 arc 2 bolt 3 ring 4 orb 5 aura
  const fx0 = new Float32Array(FX_CAP), fy0 = new Float32Array(FX_CAP);
  const fx1 = new Float32Array(FX_CAP), fy1 = new Float32Array(FX_CAP);
  const fr = new Float32Array(FX_CAP), fa = new Float32Array(FX_CAP);
  const fl = new Float32Array(FX_CAP), fm = new Float32Array(FX_CAP);
  const fcr = new Float32Array(FX_CAP), fcg = new Float32Array(FX_CAP), fcb = new Float32Array(FX_CAP);
  let fHead = 0;

  const pushFx = (kind, x0, y0, x1, y1, r, ang, life, col) => {
    const i = fHead; fHead = (fHead + 1) % FX_CAP;
    fkind[i] = kind; fx0[i] = x0; fy0[i] = y0; fx1[i] = x1; fy1[i] = y1;
    fr[i] = r; fa[i] = ang; fl[i] = fm[i] = life;
    const c = col || WHITE;
    fcr[i] = c[0]; fcg[i] = c[1]; fcb[i] = c[2];
  };

  // Reused emit spec. particles.emit() reads it into its own scratch and never
  // retains it, so one object serves every burst in the game.
  const E = {};
  const emit = (preset, x, y, extra) => {
    if (!particles) return;
    E.preset = preset; E.x = x; E.y = y;
    E.col = E.col2 = E.dir = E.speed = E.n = E.r = undefined;
    if (extra) for (const k in extra) E[k] = extra[k];
    particles.emit(E);
  };

  const pushNumber = (x, y, value, crit) => {
    const i = nHead;
    nHead = (nHead + 1) % NUM_CAP;
    if (nLive < NUM_CAP) nLive++;
    nx[i] = x; ny[i] = y - 6;
    // arc outward so a wall of numbers still reads as individual hits
    nvx[i] = (Math.random() - 0.5) * 34;
    nvy[i] = -54 - Math.random() * 18;
    nlife[i] = nmax[i] = crit ? 0.95 : 0.7;
    nval[i] = value; ncrit[i] = crit ? 1 : 0;
  };

  // `colour` on a sim event is an INDEX into the current stage's choir palette,
  // not an RGB value. Events must not allocate, and the palette is what gives
  // each act its own look. The renderer reads it the same way; an earlier
  // version of this file treated it as a packed 0xRRGGBB int and every thread
  // came out the wrong colour.
  const CR = [1, 1, 1];
  const FALLBACK_CHOIR = [[0.88, 0.21, 0.35], [0.33, 0.88, 0.63], [1, 0.67, 0.24],
                          [0.63, 0.42, 1], [0.31, 0.79, 1], [1, 0.36, 0.88]];
  let choirPal = FALLBACK_CHOIR;

  const unpack = (i) => {
    if (i === undefined || i === null) { CR[0] = CR[1] = CR[2] = 1; return CR; }
    const pal = choirPal && choirPal.length ? choirPal : FALLBACK_CHOIR;
    const c = pal[((i | 0) % pal.length + pal.length) % pal.length] || FALLBACK_CHOIR[0];
    CR[0] = c[0]; CR[1] = c[1]; CR[2] = c[2];
    return CR;
  };

  let flashDecay = 0, desatTarget = 0, chorusT = 0;
  let sfxBudget = 0;   // per-frame sound budget; see below

  const fx = {
    POST,

    /** Called by the host when a run starts, so events can resolve colours. */
    setStage(stage) {
      choirPal = (stage && stage.palette && stage.palette.choir) || FALLBACK_CHOIR;
    },

    consume(events) {
      if (!events || !events.length) return;
      // A wave dying at once can push 200 kill events in one tick. Sound is the
      // thing that degrades worst under that (it turns to static and eats the
      // frame), so it gets a hard per-frame budget while visuals do not.
      sfxBudget = 14;
      const snd = (name, x, opts) => {
        if (!audio || sfxBudget <= 0) return;
        sfxBudget--;
        audio.sfx(name, opts || (x !== undefined ? { pan: panOf(x) } : undefined));
      };

      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        switch (e.t) {

          case 'hit':
            emit(e.crit ? 'crit' : 'hit', e.x, e.y);
            pushNumber(e.x, e.y, e.dmg, e.crit);
            if (e.crit) { camera.shake(0.5); snd('crit', e.x); }
            else snd('hit', e.x);
            break;

          case 'kill':
            emit('blood', e.x, e.y);
            emit('death', e.x, e.y);
            camera.shake(e.elite ? 0.9 : 0.12);
            snd(e.elite ? 'killBig' : 'kill', e.x);
            break;

          case 'cut': {
            // The signature beat. Bright whip in the choir's colour, a real
            // shake, and a sound that has to cut through everything else.
            const c = unpack(e.colour);
            emit('cut', e.x, e.y, { col2: [c[0], c[1], c[2], 0] });
            camera.shake(0.42);
            POST.flash = Math.min(0.28, POST.flash + 0.12);
            snd('cut', e.x);
            break;
          }

          case 'conductorDown': {
            // The 60-90s payoff. Whole choir snaps at once.
            const c = unpack(e.colour);
            emit('shockwave', e.x, e.y, { col: [c[0], c[1], c[2], 1] });
            emit('death', e.x, e.y, { n: 40 });
            camera.shake(2.4);
            camera.punch(0.09);
            POST.flash = 0.5;
            flashDecay = 1.6;
            if (audio) { audio.duck(900); audio.sfx('conductorDown'); }
            sfxBudget = 0;   // nothing else this frame competes with it
            break;
          }

          case 'chorus':
            if (e.phase === 'start') {
              emit('chorus', camera.x, camera.y, { r: 300 });
              camera.punch(0.14);
              camera.shake(1.4);
              desatTarget = 0.55;
              POST.flash = 0.7;
              flashDecay = 2.2;
              if (audio) audio.sfx('chorus');
            } else {
              desatTarget = 0;
            }
            chorusT = e.phase === 'start' ? 1 : 0;
            break;

          case 'levelup':
            emit('levelup', e.x !== undefined ? e.x : camera.x, e.y !== undefined ? e.y : camera.y);
            POST.flash = Math.max(POST.flash, 0.22);
            flashDecay = Math.max(flashDecay, 1.2);
            if (audio) audio.sfx('levelup');
            break;

          case 'pickup':
            if (e.kind === 'shard') emit('pickup', e.x, e.y);
            else { emit('levelup', e.x, e.y); camera.shake(0.3); }
            snd(e.kind === 'shard' ? 'pickup' : e.kind === 'heart' ? 'heart' : 'chest', e.x);
            break;

          case 'playerHurt': {
            // Kick AWAY from the damage, so the screen recoils the way a body would.
            const dx = camera.x - e.x, dy = camera.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            camera.kick(dx / d, dy / d);
            camera.shake(e.dead ? 3 : 1.1);
            POST.chroma = Math.min(1, POST.chroma + (e.dead ? 1 : 0.55));
            emit('blood', e.x, e.y, { n: 16 });
            if (audio) audio.sfx(e.dead ? 'death' : 'hurt');
            break;
          }

          case 'chest':
            emit('levelup', e.x, e.y);
            camera.shake(0.6);
            snd('chest', e.x);
            break;

          case 'evolve':
            POST.flash = 0.85;
            flashDecay = 2.0;
            camera.punch(0.12);
            camera.shake(1.8);
            emit('shockwave', camera.x, camera.y, { r: 40 });
            if (audio) { audio.duck(700); audio.sfx('evolve'); }
            break;

          case 'boss':
            camera.shake(2.0);
            camera.punch(0.1);
            POST.flash = 0.4; flashDecay = 1.8;
            if (audio) audio.sfx('killBig');
            break;

          case 'shake':
            // The sim authors shake on its own 0..25 intensity scale; the camera
            // saturates at 3.5 (measured, see docs/lanes/A-fx.md). Converting
            // here keeps the conversion in ONE place - passing the raw number
            // through made every hit a maximum slam.
            camera.shake(e.amount * SHAKE_SCALE);
            break;

          case 'over':
            desatTarget = e.result === 'dead' ? 0.85 : 0;
            if (audio) audio.duck(1400);
            break;

          // ---- weapon visuals -------------------------------------------
          case 'swing':
            pushFx(1, e.x, e.y, e.ax, e.ay, e.r, e.half || 1.15, 0.20, e.colour);
            emit('spark', e.x + e.ax * e.r * 0.7, e.y + e.ay * e.r * 0.7,
                 { col: [e.colour[0], e.colour[1], e.colour[2], 1], n: 4 });
            break;

          case 'bolt':
            pushFx(2, e.x0, e.y0, e.x1, e.y1, 0, 0, 0.16, e.colour);
            break;

          case 'strike':
            pushFx(3, e.x, e.y, 0, 0, e.r, 0, 0.3, e.colour);
            emit('spark', e.x, e.y, { col: [e.colour[0], e.colour[1], e.colour[2], 1], n: 8 });
            break;

          case 'shout':
            pushFx(3, e.x, e.y, 0, 0, e.r, 0, 0.55, [1, 0.5, 0.4]);
            break;

          // orb and aura are re-emitted every tick while active, so they are
          // drawn for exactly one frame rather than buffered with a lifetime.
          case 'orb':
            pushFx(4, e.x, e.y, 0, 0, e.r || 7, 0, 1 / 60, e.colour);
            break;

          case 'aura':
            pushFx(5, e.x, e.y, 0, 0, e.r, 0, 1 / 60, e.colour);
            break;

          // 'say' is the tutorial/bark channel and belongs to the UI, not here.
        }
      }
    },

    // Called every rendered frame, after consume().
    step(dt) {
      POST.time += dt;

      // Decays. All exponential so they are frame-rate independent.
      const k = Math.exp(-dt * (flashDecay || 4));
      POST.flash *= k;
      if (POST.flash < 0.002) { POST.flash = 0; flashDecay = 0; }
      POST.chroma *= Math.exp(-dt * 3.2);
      POST.desat += (desatTarget - POST.desat) * (1 - Math.exp(-dt * 2.4));

      // The camera's own trauma drives a baseline chroma - a busy screen should
      // feel slightly unstable without anything explicitly asking for it.
      const t = camera.trauma || 0;
      if (t * 0.35 > POST.chroma) POST.chroma = t * 0.35;
      if (POST.chroma > 1) POST.chroma = 1;

      for (let i = 0; i < FX_CAP; i++) if (fl[i] > 0) fl[i] -= dt;

      for (let i = 0; i < NUM_CAP; i++) {
        if (nlife[i] <= 0) continue;
        nlife[i] -= dt;
        nx[i] += nvx[i] * dt;
        ny[i] += nvy[i] * dt;
        nvy[i] += 150 * dt;      // arc back down
        nvx[i] *= Math.exp(-dt * 2.4);
      }
    },

    /** Weapon visuals. Additive, under the damage numbers, above the world. */
    drawWeaponFx() {
      if (!renderer) return;
      renderer.layer('add');
      for (let i = 0; i < FX_CAP; i++) {
        const L = fl[i];
        if (L <= 0) continue;
        const f = L / fm[i];                 // 1 -> 0
        const r = fcr[i], g = fcg[i], b = fcb[i];

        switch (fkind[i]) {
          case 1: {
            // The arc: a fan of short segments sweeping through the cone, each
            // one fading behind the leading edge so it reads as a swing rather
            // than a static wedge.
            const base = Math.atan2(fy1[i], fx1[i]);
            const half = fa[i];
            const N = 9;
            const lead = 1 - f;              // where the swing front is, 0..1
            for (let k = 0; k < N; k++) {
              const t = k / (N - 1);
              const d = Math.abs(t - lead);
              const w = Math.max(0, 1 - d * 3.2);
              if (w <= 0) continue;
              const ang = base - half + half * 2 * t;
              const r0 = fr[i] * 0.35, r1 = fr[i];
              renderer.line(
                fx0[i] + Math.cos(ang) * r0, fy0[i] + Math.sin(ang) * r0,
                fx0[i] + Math.cos(ang) * r1, fy0[i] + Math.sin(ang) * r1,
                3.5 * w, r, g, b, 0.9 * w * f + 0.25 * w);
            }
            break;
          }
          case 2: {
            // Lightning: a jagged polyline, deterministic per index so it does
            // not crawl between frames.
            const N = 7;
            let px = fx0[i], py = fy0[i];
            const dx = (fx1[i] - fx0[i]) / N, dy = (fy1[i] - fy0[i]) / N;
            const nx = -dy, ny = dx;
            for (let k = 1; k <= N; k++) {
              const j = k === N ? 0 : (Math.sin(i * 12.9898 + k * 78.233) * 0.5);
              const qx = fx0[i] + dx * k + nx * j;
              const qy = fy0[i] + dy * k + ny * j;
              renderer.line(px, py, qx, qy, 2.6, r, g, b, f);
              px = qx; py = qy;
            }
            break;
          }
          case 3: {
            // Expanding ring.
            const rad = fr[i] * (0.35 + (1 - f) * 0.85);
            ringOf(renderer, fx0[i], fy0[i], rad, 2.4, r, g, b, f * 0.9);
            break;
          }
          case 4:
            renderer.quad(fx0[i], fy0[i], fr[i] * 2, fr[i] * 2, 0, r, g, b, 0.85);
            renderer.quad(fx0[i], fy0[i], fr[i] * 3.4, fr[i] * 3.4, 0, r, g, b, 0.22);
            break;
          case 5:
            ringOf(renderer, fx0[i], fy0[i], fr[i], 2, r, g, b, 0.30);
            ringOf(renderer, fx0[i], fy0[i], fr[i] * 0.82, 1.4, r, g, b, 0.13);
            break;
        }
      }
    },

    // Damage numbers draw on top of the world but inside post, so they bloom.
    drawNumbers() {
      if (!renderer || !renderer.text) return;
      renderer.layer('add');
      for (let i = 0; i < NUM_CAP; i++) {
        const L = nlife[i];
        if (L <= 0) continue;
        const f = L / nmax[i];
        const a = f > 0.7 ? 1 : f / 0.7;
        const crit = ncrit[i] === 1;
        const size = crit ? 15 : 10;
        renderer.text(
          crit ? Math.round(nval[i]) + '!' : String(Math.round(nval[i])),
          nx[i], ny[i], size,
          1, crit ? 0.78 : 0.95, crit ? 0.35 : 0.8, a,
          'center');
      }
    },

    reset() {
      nLive = 0; nHead = 0;
      nlife.fill(0);
      fl.fill(0);
      POST.flash = 0; POST.chroma = 0; POST.desat = 0;
      desatTarget = 0; flashDecay = 0;
    },
  };

  const panOf = (x) => {
    if (!viewport) return 0;
    const half = 210;                     // half of the 420u visible width
    return Math.max(-1, Math.min(1, (x - camera.x) / half));
  };

  return fx;
}

/** A ring from line segments - the renderer has no circle primitive. */
function ringOf(r, cx, cy, rad, w, cr, cg, cb, a) {
  const N = rad > 60 ? 40 : 24;
  let px = cx + rad, py = cy;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const qx = cx + Math.cos(t) * rad, qy = cy + Math.sin(t) * rad;
    r.line(px, py, qx, qy, w, cr, cg, cb, a);
    px = qx; py = qy;
  }
}

export { PRESETS };
