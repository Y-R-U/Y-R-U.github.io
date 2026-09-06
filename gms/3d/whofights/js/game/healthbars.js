// Health over the head of whoever it belongs to, rather than in a corner of the screen.
//
// Same trick as the speech bubble (js/game/bubble.js): a small DOM layer over the canvas, one
// element per body, projected each frame. DOM rather than sprites because these have to stay
// legible at any distance and a sprite that stays legible is a sprite that fights the depth
// buffer for it — and because the bubble already proved the projection works on a phone.
//
// Elements are pooled by key and reused. Rebuilding them each frame is what makes a bar flicker
// and what makes a browser lay the whole overlay out sixty times a second for nothing.

import { screenOf } from './bubble.js';
import { el } from './ui.js';

// Past this the bar is a smudge and the fight it belongs to is not the one in front of you.
export const FAR = 46;
// The distance a bar is drawn at its authored size. Nearer than this it does not grow — a foe at
// arm's length would otherwise wear a banner — and further it shrinks, but only to `MIN`, because
// a bar you cannot read is worse than one that is slightly the wrong size.
const FULL = 15;
const MIN = 0.62;

export class HealthBars {
  constructor({ app, host }) {
    this.app = app;
    this.host = host;
    this.root = el('div', 'g-heads');
    host.append(this.root);
    this.pool = new Map();
    this.live = new Set();
  }

  // `list` is everything that should have a bar this frame: `{key, world, fraction, name, kind,
  // mana}`. Anything not in it is hidden rather than removed — a foe that steps behind a pillar
  // for a third of a second must not cost a DOM teardown and rebuild.
  track(list) {
    this.live.clear();
    const cam = this.app.camera;
    const canvas = this.app.renderer.domElement;
    for (const b of list) {
      if (!b || b.fraction == null) continue;
      const pt = screenOf(cam, canvas, b.world);
      if (pt.behind) continue;
      const d = Math.hypot(cam.position.x - b.world.x, cam.position.y - b.world.y, cam.position.z - b.world.z);
      if (d > FAR) continue;
      this.live.add(b.key);
      this.draw(b, pt, d);
    }
    for (const [key, row] of this.pool) {
      if (!this.live.has(key)) row.root.hidden = true;
    }
  }

  row(key, kind, name) {
    let row = this.pool.get(key);
    if (row) return row;
    const root = el('div', `g-headbar g-headbar-${kind}`);
    const hp = el('div', 'g-headbar-hp');
    const hpFill = el('i');
    hp.append(hpFill);
    const mana = el('div', 'g-headbar-mana');
    const manaFill = el('i');
    mana.append(manaFill);
    mana.hidden = true;
    const label = el('b', null, name || '');
    root.append(label, hp, mana);
    this.root.append(root);
    row = { root, hp: hpFill, mana, manaFill, label, shown: null };
    this.pool.set(key, row);
    return row;
  }

  draw(b, pt, dist) {
    const row = this.row(b.key, b.kind || 'foe', b.name);
    row.root.hidden = false;
    // Scale is what makes a bar over a body thirty metres away read as belonging to it. Clamped
    // at both ends: unclamped it is a postage stamp at range and a billboard at arm's length.
    const k = Math.max(MIN, Math.min(1, (FULL / Math.max(1, dist)) ** 0.5));
    row.root.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
    // One write per changed value, not per frame: these are the elements most likely to be on
    // screen during the frames the fight is spending its budget.
    const key = `${b.fraction.toFixed(3)}|${b.mana == null ? '-' : b.mana.toFixed(3)}|${b.name || ''}`;
    if (row.shown === key) return;
    row.shown = key;
    row.hp.style.transform = `scaleX(${Math.max(0, Math.min(1, b.fraction))})`;
    row.root.classList.toggle('g-hurt', b.fraction <= 0.3);
    row.mana.hidden = b.mana == null;
    if (b.mana != null) row.manaFill.style.transform = `scaleX(${Math.max(0, Math.min(1, b.mana))})`;
    if (row.label.textContent !== (b.name || '')) row.label.textContent = b.name || '';
  }

  clear() {
    for (const row of this.pool.values()) row.root.remove();
    this.pool.clear();
    this.live.clear();
  }

  dispose() {
    this.clear();
    this.root.remove();
  }
}
