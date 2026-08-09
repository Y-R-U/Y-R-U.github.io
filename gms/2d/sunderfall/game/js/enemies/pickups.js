/**
 * Drops. Only the spell shard for now — elites drop it, and it is the currency the
 * rank system runs on (DESIGN §2). The progression agent should listen for the
 * standard `pickup` bus event rather than reaching in here.
 */

import { LAYER } from '../gfx/renderer.js';
import { silhouette } from './rig.js';

let _w = null;

export function spawnSpellShard(world, x, y, o) {
  _w = world;
  const opt = o || {};
  return world.spawn({
    kind: 'pickup', tag: 'spell_shard', team: 2,
    x, y, w: 22, h: 26,
    vx: (Math.random() - 0.5) * 160, vy: -320,
    gravity: 1, drag: 0.3, bounce: 0.4, friction: 3, collides: true, trigger: true,
    life: opt.life === undefined ? 0 : opt.life,
    data: { value: opt.value === undefined ? 1 : opt.value, t: Math.random() * 6.28, settled: 0, magnet: 0 },
    onUpdate: shardUpdate,
    render: shardRender,
  });
}

function shardUpdate(e, dt) {
  const d = e.data;
  const w = _w;
  d.t += dt;
  const p = w.player;
  if (!p || !p.alive) return;
  const dx = p.x - e.x, dy = (p.y - 6) - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 220) {
    d.magnet = Math.min(1, d.magnet + dt * 2.2);
    const pull = 900 * d.magnet;
    e.vx += (dx / dist) * pull * dt;
    e.vy += (dy / dist) * pull * dt - 3000 * dt;   // cancel gravity while homing
  }
  if (dist < 26) {
    w.bus.emit('pickup', { entity: e, kind: 'spell_shard', tag: 'spell_shard', value: d.value, x: e.x, y: e.y });
    w.ctx.audio.sfx('shard_pickup', { x: e.x, y: e.y });
    w.P.emit({
      x: e.x, y: e.y, count: 22, speed: 220, speedVar: 160, life: 0.55, lifeVar: 0.3,
      size: 10, sizeEnd: 1, color: [0.75, 0.9, 1, 1], color2: [0.25, 0.4, 1, 0], add: true, drag: 2.4, glow: 0.3,
    });
    w.R.light({ x: e.x, y: e.y, radius: 320, r: 0.6, g: 0.8, b: 1, intensity: 2 });
    w.despawn(e);
  }
}

function shardRender(e, alpha, R) {
  const d = e.data;
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha + Math.sin(d.t * 2.6) * 3;
  const rot = d.t * 1.4;
  if (silhouette()) {
    R.spriteRaw(R.white, 0, 0, 1, 1, x, y, 12, 22, rot, 0.012, 0.012, 0.018, 1, LAYER.ACTORS, false, 1);
    return;
  }
  R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, 60, 60, 0, 0.45, 0.65, 1, 0.35, LAYER.FX, true, 1);
  R.spriteRaw(R.white, 0, 0, 1, 1, x, y, 11, 24, rot, 0.55, 0.75, 1, 1, LAYER.ACTORS, false, 1);
  R.spriteRaw(R.white, 0, 0, 1, 1, x, y, 6, 16, rot, 1, 1, 1, 1, LAYER.FX, true, 1);
  R.light({ x, y, radius: 200, r: 0.5, g: 0.7, b: 1, intensity: 0.9, flicker: 0.12 });
}
