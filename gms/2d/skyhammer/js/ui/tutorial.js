// Tutorial hints for the t-* levels. One short line at a time, faded in and out, on the HUD
// overlay canvas. Reads world state only — it never writes to a sim object and never touches
// the HUD's layout state; the safe band below is recomputed from the same numbers hud.js uses.

import { approachBox } from '../sim/landing.js';

const FADE_IN = 0.32, FADE_OUT = 0.28, GAP = 0.22;

/* ------------------------------------------------------------------ probes */

const objOf = (w, type) => (w.mission && w.mission.objectives || []).find((o) => o.type === type) || null;
const have = (w, type) => { const o = objOf(w, type); return o ? o.have : 0; };
const objDone = (w, type) => { const o = objOf(w, type); return !!(o && o.done); };

function nearestAhead(w, pred, span) {
  const p = w.player;
  if (!p) return null;
  let best = null, bd = span;
  for (const e of w.ents) {
    if (e.dead || !pred(e)) continue;
    const dx = e.x - p.x;
    if (dx < -200 || dx > bd) continue;
    bd = dx; best = e;
  }
  return best;
}

const padOf = (w) => w.ents.find((e) => e.kind === 'pad' && !e.dead) || null;

/**
 * The §9 approach gate, READ from landing.js rather than restated. The previous version carried a
 * copy of the predicate under a comment promising it could not drift from landing.js — and it
 * drifted the moment the gate was reworked from a pad-centred slab into a real approach window.
 * A copy of a rule is not a shared rule.
 */
function gateOf(w) {
  const p = w.player, pad = padOf(w);
  return (p && pad && approachBox(pad, p)) || null;
}

const ammoTotal = (p) => {
  let n = 0;
  const a = p && p.ammo;
  if (a) for (let i = 0; i < a.length; i++) n += a[i] | 0;
  return n;
};

/* ------------------------------------------------------------------ scripts */

// `text` may be a string or (world, s) => string. `done` fires the moment the player has
// actually done the thing; `ready` holds a hint back until it is relevant; `timeout` only ever
// moves the script on so nobody can get stuck behind a trigger that never fires.
const SCRIPTS = {
  't-01': [
    { id: 'steer', timeout: 30,
      text: 'Hold a thumb anywhere. The nose follows your finger.',
      done: (s) => s.turned > 1.1 && s.stickT > 0.5 },
    { id: 'climb', timeout: 26,
      text: 'Pull up. The camera climbs with you.',
      done: (s, w) => w.cam.y > (w.camTune ? w.camTune.baseY : -100) + 45 },
    { id: 'guns', timeout: 40,
      ready: (s, w) => !!nearestAhead(w, (e) => e.kind === 'ground', 2400),
      text: 'The gun fires on its own. Just point it at the huts.',
      done: (s, w) => have(w, 'destroy') >= 1 },
    { id: 'guns2', timeout: 60,
      text: (w) => { const o = objOf(w, 'destroy'); const n = o ? Math.max(0, o.need - o.have) : 0; return n > 1 ? `${n} more huts.` : 'One more hut.'; },
      done: (s, w) => objDone(w, 'destroy') },
    { id: 'balloon', timeout: 45,
      ready: (s, w) => !!nearestAhead(w, (e) => e.kind === 'balloon', 3000),
      text: 'Fly straight through the balloon to collect it.',
      done: (s, w) => objDone(w, 'collect') },
  ],

  't-02': [
    { id: 'bomb', timeout: 45,
      ready: (s, w) => !!nearestAhead(w, (e) => e.kind === 'ground', 2600),
      text: 'The boat is armoured. Press a thumb button to drop a bomb.',
      done: (s) => s.ammoDrop > 0 },
    { id: 'sink', timeout: 60,
      text: 'Bombs fall forward — release before you are over it.',
      done: (s, w) => objDone(w, 'destroy') },
    { id: 'approach', timeout: 45,
      ready: (s, w) => { const pad = padOf(w); return !!pad && pad.x - w.player.x < 3400; },
      text: 'Carrier ahead. Get down to deck height and line up on the green box.',
      done: (s, w) => { const pad = padOf(w), p = w.player; return !!pad && Math.abs(p.y - pad.y) < 170 && pad.x - p.x < 1500; } },
    { id: 'final', timeout: 999,
      // Two conditions, so at most two things to say. The old version had four lines for three
      // invisible thresholds and could not tell you which one you had failed.
      text: (w) => {
        const pad = padOf(w), p = w.player, g = gateOf(w);
        if (g && g.inside && !g.dirOk) return 'In the box, but flying away. Turn back toward the ship.';
        if (pad && p.x > pad.x) return 'Past it. Loop around and come back at the box from the left.';
        return 'Fly into the green box off her bow, heading at the ship. She lands herself.';
      },
      done: (s, w) => w.player.landed || (w.player.script && w.player.script.kind === 'land') },
    { id: 'takeoff', timeout: 999,
      ready: (s, w) => w.player.landed,
      text: 'Down. Refuelled and rearmed — press TAKE OFF when you are ready.',
      done: (s) => s.tookOff },
    { id: 'balloon', timeout: 60,
      text: 'Last job: the supply balloon past the bow.',
      done: (s, w) => objDone(w, 'collect') },
  ],
};

/* --------------------------------------------------------------------- api */

export function makeTutorial(world) {
  const lvl = world && world.level;
  if (!lvl) return null;
  const script = SCRIPTS[lvl.id] || (lvl.tutorial ? SCRIPTS['t-01'] : null);
  if (!script) return null;

  const s = {
    i: 0, phase: 'in', t: 0, alpha: 0,
    turned: 0, stickT: 0, lastAng: null, ammo: null, ammoDrop: 0, wasLanded: false, tookOff: false,
    why: null,
  };

  const cur = () => (s.i < script.length ? script[s.i] : null);

  return {
    get done() { return s.i >= script.length; },
    get stepId() { return s.i < script.length ? script[s.i].id : null; },   // for the harness
    // 'done' when the player did the thing, 'timeout' when the script gave up waiting. A gate
    // that only asserts the tutorial finished cannot tell those apart, and a trigger that can
    // never fire looks exactly like one that always fires.
    get why() { return s.why; },

    step(w, dt) {
      const p = w.player;
      if (!p) return;

      // --- what the player has actually done, sampled every tick ---
      if (s.lastAng !== null) {
        let d = p.ang - s.lastAng;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        s.turned += Math.abs(d);
      }
      s.lastAng = p.ang;
      if (w.stick && w.stick.active) s.stickT += dt; else s.stickT = 0;
      const am = ammoTotal(p);
      if (s.ammo !== null && am < s.ammo) s.ammoDrop += s.ammo - am;
      s.ammo = am;
      if (p.landed) s.wasLanded = true;
      else if (s.wasLanded) s.tookOff = true;

      const c = cur();
      if (!c) { s.alpha = Math.max(0, s.alpha - dt / FADE_OUT); return; }

      s.t += dt;

      if (s.phase === 'wait') {                       // holding a hint back until it is relevant
        if (!c.ready || c.ready(s, w)) { s.phase = 'in'; s.t = 0; }
        return;
      }
      if (s.phase === 'in') {
        s.alpha = Math.min(1, s.alpha + dt / FADE_IN);
        if (c.done(s, w)) { s.phase = 'out'; s.t = 0; s.why = 'done'; }
        else if (c.timeout && s.t > c.timeout) { s.phase = 'out'; s.t = 0; s.why = 'timeout'; }
        return;
      }
      if (s.phase === 'out') {
        s.alpha = Math.max(0, s.alpha - dt / FADE_OUT);
        if (s.alpha <= 0 && s.t > FADE_OUT + GAP) {
          s.i++; s.t = 0; s.turned = 0;
          const n = cur();
          s.phase = n && n.ready && !n.ready(s, w) ? 'wait' : 'in';
        }
      }
    },

    draw(g, w, screen) {
      if (s.alpha <= 0.01) return;
      const c = cur();
      if (!c) return;
      const txt = typeof c.text === 'function' ? c.text(w, s) : c.text;
      if (!txt) return;
      drawHint(g, txt, screen, s.alpha);
    },
  };
}

/* -------------------------------------------------------------------- draw */

/**
 * The one clear band on a 390-high landscape phone: below the minimap (top-centre, 35 px tall),
 * inboard of the health/fuel bars, and 200 px clear of the slot buttons and TAKE OFF at the
 * bottom. Recomputed from hud.js's own layout numbers rather than imported, so this file has no
 * dependency on the HUD — if those numbers move, this comment is the thing to check.
 */
function drawHint(g, txt, screen, alpha) {
  const w = screen.w, h = screen.h;
  const barsEdge = 10 + 4 + 16 + Math.min(136, Math.round(w * 0.17));   // hud L.bars right edge
  const safe = barsEdge + 16;
  const maxW = Math.max(180, Math.min(w - safe * 2, 620));

  const fs = w < 560 ? 12 : 13;
  g.save();
  g.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const lines = wrap(g, txt, maxW - 26);
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, g.measureText(l).width);

  const lh = fs + 5;
  const bw = Math.min(maxW, tw + 26);
  const bh = lines.length * lh + 12;
  const bx = Math.round(w / 2 - bw / 2);
  const by = 10 + 35 + 16;                    // under the minimap (L.map.y + L.map.h + gap)

  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(12,9,6,0.62)';
  rrect(g, bx, by, bw, bh, 7); g.fill();
  g.strokeStyle = 'rgba(255,214,160,0.26)'; g.lineWidth = 1;
  rrect(g, bx + 0.5, by + 0.5, bw - 1, bh - 1, 7); g.stroke();

  g.fillStyle = '#f4e7d2';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) g.fillText(lines[i], bx + bw / 2, by + 6 + lh * i + lh / 2);
  g.restore();
}

function wrap(g, txt, maxW) {
  if (g.measureText(txt).width <= maxW) return [txt];
  const words = txt.split(' ');
  const out = [];
  let line = '';
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (line && g.measureText(t).width > maxW) { out.push(line); line = word; }
    else line = t;
  }
  if (line) out.push(line);
  return out.slice(0, 2);
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
