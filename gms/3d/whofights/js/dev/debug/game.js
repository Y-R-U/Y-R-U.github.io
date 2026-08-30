// The handles every panel needs, resolved late. main.js hangs the world on window.__wf after the
// engine has booted, so nothing may be captured at mount time.

import { record } from './core.js';

export function handles(ctx) {
  const w = typeof window !== 'undefined' ? window.__wf || {} : {};
  const app = ctx?.app || w.app || null;
  return {
    app,
    w,
    world: ctx?.world || w.world || null,
    player: w.player || null,
    doors: w.doors || null,
    characters: w.characters || null,
    session: w.game || null,
    level: w.level || ctx?.world?.doc || null,
    quality: app?.quality || w.quality || null,
    stats: app?.stats || null,
    scene: app?.scene || null,
    renderer: app?.renderer || null,
    camera: app?.camera || null,
  };
}

export function playing(ctx) {
  const g = handles(ctx);
  return !!(g.player && g.player.enabled);
}

// Put the player somewhere. Leaves any interior first: the door script owns pos and yaw while it
// is running, and warping out from under it strands the camera inside a wall.
export function warpTo(ctx, to) {
  const g = handles(ctx);
  const p = g.player;
  if (!p) return { ok: false, error: 'no player — is the game running?' };
  try { g.doors?.abort?.(); } catch { /* not inside anything */ }
  p.pos.x = +to.x || 0;
  p.pos.z = +to.z || 0;
  p.pos.y = groundY(g, p.pos.x, p.pos.z, p.pos.y);
  p.vel?.set?.(0, 0, 0);
  if (Number.isFinite(+to.yaw)) p.yaw = p.camYaw = p.moveYaw = +to.yaw;
  // One snapped frame, or the camera sweeps the length of the map to catch up.
  p.snap = true;
  setTimeout(() => { p.snap = false; }, 60);
  record('warp', to.id || 'manual', `${p.pos.x.toFixed(1)}, ${p.pos.z.toFixed(1)}${to.label ? ` · ${to.label}` : ''}`);
  g.session?.autosave?.mark?.();
  return { ok: true, x: p.pos.x, z: p.pos.z, y: p.pos.y };
}

function groundY(g, x, z, y) {
  try {
    const t = g.world?.terrain;
    if (t?.surfaceY) return t.surfaceY(x, z);
  } catch { /* terrain not built */ }
  return y || 0;
}

export function where(ctx) {
  const p = handles(ctx).player;
  if (!p) return null;
  return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(4) };
}
