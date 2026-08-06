// The round in flight and every drifting smoke card — C6 owns this file (REVIEW.md B12).
//
// Muzzle smoke and shell-trail smoke are the same card system, so they live together here rather
// than being built twice by C3 and C6. The round itself is `Round` in world/shell.js; this file is
// only the registration and the pooling.

import * as THREE from 'three';
import { registerEmitter } from './index.js';
import { smokeField, pumpCards, useCtx, warmSources, seaHeight } from './field.js';
import { Round } from '../shell.js';
import { rng } from '../textures/noise.js';

// `at(t)` is what the chase camera and the match-cut screen-position assertion read, so it stays
// queryable for the whole life of the handle, not just while the round is animating.
registerEmitter('tracer', (ctx, from, to, ms, size) => {
  useCtx(ctx);
  const opts = typeof size === 'object' ? size : { size };
  const round = new Round(ctx, { from, to, ms, ...opts, size: opts.size ?? 1 });
  const handle = ctx.add({
    update: dt => round.update(dt),
    kill: () => round.kill(),
  });
  handle.object3D = round.mesh;
  handle.round = round;
  handle.at = (t, out) => round.arc.at(t, out);
  handle.head = out => round.head(out);
  handle.pose = (u, stretch, fat) => round.poseAt(u, stretch, fat);
  return handle;
});

// Drifting smoke: propellant residue, a burnt patch of air, a puff hanging where something was.
// Normal-blended on C4's shared smoke field — additive cannot draw a dark cloud, and a grey puff
// that gets brighter over a bright sea is the "floating sprite" finding.
registerEmitter('smoke', (ctx, pos, drift, size) => {
  useCtx(ctx);
  const cfg = ctx.size(size);
  const opts = typeof size === 'object' ? size : {};
  const field = smokeField(ctx.root);
  const r = rng(opts.seed ?? 7717);
  const n = Math.round(9 * cfg.cards);
  const slots = [];
  const seed = [];
  const base = pos.clone();
  const dr = (drift || new THREE.Vector3()).clone();
  for (let i = 0; i < n; i++) {
    const s = field.take();
    if (!s) break;
    slots.push(s);
    seed.push([(r() - 0.5) * 2, r(), (r() - 0.5) * 2, 0.5 + r() * 1.1, (r() - 0.5) * 2, r() * 0.4]);
  }
  const life = cfg.life * 2.2;
  let t = 0;
  const pose = () => {
    const warm = warmSources();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], j = seed[i];
      const age = Math.min(1, (t + j[5] * life) / life);
      const sp = cfg.scale * (1.1 + age * 4.2) * j[3];
      s.pos.set(
        base.x + dr.x * t + j[0] * sp * 0.9,
        Math.max(seaHeight(base.x, base.z) + sp * 0.6, base.y + dr.y * t + j[1] * sp * 0.7 + t * 1.4),
        base.z + dr.z * t + j[2] * sp * 0.9,
      );
      s.sx = sp * (0.9 + j[1] * 0.5);
      s.sy = sp * (0.8 + j[3] * 0.35);
      s.rot = j[4] * 2.2 + age * j[4];
      // a puff near a fire or a muzzle takes its colour, which is what stops smoke reading as a
      // flat grey decal pasted over the frame
      let lit = 0;
      for (const w of warm) {
        const d = w.pos.distanceTo(s.pos);
        lit += w.intensity * (w.radius / (w.radius + d)) ** 2;
      }
      const k = Math.min(0.85, lit * 0.5);
      s.colour.setRGB(0.30 + k * 0.9, 0.30 + k * 0.42, 0.31 + k * 0.16);
      s.alpha = 0.52 * (1 - age) ** 1.3 * Math.min(1, t * 5 + 0.25);
    }
  };
  pose();
  return ctx.add({
    update(dt) {
      t += dt;
      pose();
      pumpCards(ctx.app.camera);
      return t < life;
    },
    kill() { for (const s of slots) field.give(s); },
  });
});
