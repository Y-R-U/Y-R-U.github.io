// Hotspot authoring, pure: turning two ground points into a shape, the drag handles that resize
// one, and what is wrong with a hotspot before anyone plays it. The runtime is
// js/game/hotspots.js and this leans on it rather than restating its geometry.

import { TRIGGERS, normaliseHotspot } from '../../editor/scene.js';
import { inShape } from '../../game/hotspots.js';
import { validateAction, VERB_IDS } from '../../game/actions.js';
import { slugify } from './levelio.js';

export { TRIGGERS, VERB_IDS, normaliseHotspot };

export const MIN_SIZE = 0.5;
const r2 = v => Math.round((Number.isFinite(+v) ? +v : 0) * 100) / 100;

export function circleFrom(a, b) {
  return { k: 'circle', x: r2(a.x), z: r2(a.z), r: r2(Math.max(MIN_SIZE, Math.hypot(b.x - a.x, b.z - a.z))) };
}

export function rectFrom(a, b) {
  let x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  let z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  if (x1 - x0 < MIN_SIZE) x1 = x0 + MIN_SIZE;
  if (z1 - z0 < MIN_SIZE) z1 = z0 + MIN_SIZE;
  return { k: 'rect', x0: r2(x0), z0: r2(z0), x1: r2(x1), z1: r2(z1) };
}

export const centreOf = s =>
  !s ? { x: 0, z: 0 } : s.k === 'circle' ? { x: s.x, z: s.z } : { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 };

export const radiusOf = s =>
  !s ? 0 : s.k === 'circle' ? s.r : Math.max(s.x1 - s.x0, s.z1 - s.z0) / 2;

export function moveShape(s, dx, dz) {
  if (!s) return s;
  if (s.k === 'circle') return { ...s, x: r2(s.x + dx), z: r2(s.z + dz) };
  return { k: 'rect', x0: r2(s.x0 + dx), z0: r2(s.z0 + dz), x1: r2(s.x1 + dx), z1: r2(s.z1 + dz) };
}

export function handlesOf(s) {
  if (!s) return [];
  if (s.k === 'circle') {
    return [{ id: 'c', kind: 'move', x: s.x, z: s.z }, { id: 'r', kind: 'size', x: s.x + s.r, z: s.z }];
  }
  const c = centreOf(s);
  return [
    { id: 'c', kind: 'move', x: c.x, z: c.z },
    { id: 'nw', kind: 'size', x: s.x0, z: s.z0 },
    { id: 'ne', kind: 'size', x: s.x1, z: s.z0 },
    { id: 'sw', kind: 'size', x: s.x0, z: s.z1 },
    { id: 'se', kind: 'size', x: s.x1, z: s.z1 },
  ];
}

// A corner drag pins the opposite corner; the centre handle slides the whole thing.
export function dragHandle(s, id, x, z) {
  if (!s) return s;
  if (id === 'c') { const c = centreOf(s); return moveShape(s, x - c.x, z - c.z); }
  if (s.k === 'circle') return { ...s, r: r2(Math.max(MIN_SIZE, Math.hypot(x - s.x, z - s.z))) };
  const anchor = { nw: [s.x1, s.z1], ne: [s.x0, s.z1], sw: [s.x1, s.z0], se: [s.x0, s.z0] }[id];
  if (!anchor) return s;
  return rectFrom({ x: anchor[0], z: anchor[1] }, { x, z });
}

// World-space rather than screen-space: close enough for a tap at any sane camera distance, and
// it keeps this module free of a camera.
export function pickHandle(s, x, z, tol = 1.2) {
  let best = null, bd = Infinity;
  for (const h of handlesOf(s)) {
    const d = Math.hypot(h.x - x, h.z - z);
    // A size handle wins a tie so a small circle can still be resized rather than only moved.
    if (d <= tol && (d < bd || (d === bd && h.kind === 'size'))) { bd = d; best = h; }
  }
  return best;
}

// The runtime's shapeOf, without needing a Hotspots instance: `at` answers where a character is.
export function shapeAt(h, at) {
  if (!h) return null;
  if (!h.attach) return h.shape || null;
  const p = at?.(h.attach);
  return p ? { k: 'circle', x: p.x, z: p.z, r: h.r || 2.5 } : null;
}

export const hitHotspot = (h, x, z, at) => inShape(shapeAt(h, at), x, z);

export function pickHotspot(list, x, z, at) {
  let best = null, bd = Infinity;
  for (const h of list || []) {
    const s = shapeAt(h, at);
    if (!s || !inShape(s, x, z)) continue;
    const c = centreOf(s);
    const d = (x - c.x) ** 2 + (z - c.z) ** 2;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

export function newHotspotId(name, taken = []) {
  const base = `hs.${slugify(name).replace(/-/g, '.')}`;
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; n < 1e4; n++) if (!set.has(`${base}.${n}`)) return `${base}.${n}`;
  return `${base}.${Date.now()}`;
}

export const ACTION_TEMPLATES = {
  say: () => ({ k: 'say', node: '' }),
  goto: () => ({ k: 'goto', level: '', at: { x: 0, z: 0, yaw: Math.PI } }),
  music: () => ({ k: 'music', set: '' }),
  flag: () => ({ k: 'flag', name: '', value: true }),
  bark: () => ({ k: 'bark', who: '', category: 'idle' }),
  event: () => ({ k: 'event', name: '', data: {} }),
};

export const newAction = k => (ACTION_TEMPLATES[k] ? ACTION_TEMPLATES[k]() : { k });

export function describeAction(a, names = {}) {
  if (!a || typeof a.k !== 'string') return 'not an action';
  if (a.k === 'say') return `say ${names.conversations?.[a.node] || a.node || '(nothing)'}`;
  if (a.k === 'goto') return `go to ${a.level || '(nowhere)'}`;
  if (a.k === 'music') return a.stop ? 'stop the music' : `play ${a.set || '(no set)'}`;
  if (a.k === 'flag') return `set ${a.name || '(unnamed)'} = ${JSON.stringify(a.value ?? true)}`;
  if (a.k === 'bark') return `${names.characters?.[a.who] || a.who || '(nobody)'} barks ${a.category || 'idle'}`;
  if (a.k === 'event') return `emit ${a.name || '(unnamed)'}`;
  return a.k;
}

export function summarise(h, names) {
  const acts = (h?.actions || []).map(a => describeAction(a, names));
  return acts.length ? acts.join(' · ') : 'does nothing';
}

export function hotspotProblems(h, refs = {}) {
  const out = [];
  if (!h || typeof h !== 'object') return ['not an object'];
  if (!h.id) out.push('no id');
  if (!h.attach && !h.shape) out.push('neither a shape nor a character to follow — the loader will drop it');
  if (h.attach && refs.characters && !refs.characters[h.attach]) out.push(`follows "${h.attach}", who is not in data/characters.json`);
  if (h.attach && refs.characters?.[h.attach] && (refs.characters[h.attach].body || 'none') === 'none') {
    out.push(`follows "${h.attach}", who has no body — it can never fire`);
  }
  if (!TRIGGERS.includes(h.trigger)) out.push(`unknown trigger "${h.trigger}"`);
  if (!(h.actions || []).length) out.push('does nothing — it has no actions');
  (h.actions || []).forEach((a, i) => {
    const at = `action ${i + 1}`;
    out.push(...validateAction(a, at));
    if (a?.k === 'say' && a.node && refs.conversations && !refs.conversations[a.node]) out.push(`${at}: no conversation node "${a.node}"`);
    if (a?.k === 'goto' && a.level && refs.levelIds && !refs.levelIds.includes(a.level)) out.push(`${at}: no level "${a.level}"`);
    if (a?.k === 'music' && a.set && refs.musicSets && !refs.musicSets.includes(a.set)) out.push(`${at}: no music set "${a.set}"`);
    if (a?.k === 'bark' && a.who && refs.characters && !refs.characters[a.who]) out.push(`${at}: no character "${a.who}"`);
  });
  return out;
}

export const VERB_COLOUR = {
  say: 0x4fd1ff, goto: 0xffa23a, music: 0xc08bff, flag: 0x66dd88, bark: 0xffe066, event: 0x9aa4b2,
};
export const BROKEN_COLOUR = 0xff5a5a;

export function colourOf(h, problems = []) {
  if (problems.length) return BROKEN_COLOUR;
  const first = (h?.actions || []).find(a => VERB_COLOUR[a?.k]);
  return first ? VERB_COLOUR[first.k] : BROKEN_COLOUR;
}

export const hex = n => `#${n.toString(16).padStart(6, '0')}`;
