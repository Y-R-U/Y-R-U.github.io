// Sustained fire and the smoke column it makes — C4.
//
// `night_burn` is entirely one requirement: a burning ship at dusk is the light source for its own
// hull, its own smoke and the water around it. So a fire here is four things that move together —
// tongues, a hot root, a fire-lit smoke column, and the light: a pooled PointLight on the ship and
// a sea source on the water.
//
// The flame is built from tongue-shaped cards, not orange puffs. In 1272010_01 every oil fire is a
// cluster of tapering licks with dark gaps you can see the hull through; a cluster of round sprites
// tinted orange has no tongue silhouette and reads as smoke lit from inside.
//
// A sustained effect must not allocate per beat, so nothing here spawns: every card is taken once
// and cycled by a phase, which is also what makes a still reproducible.

import * as THREE from 'three';
import { registerEmitter } from './index.js';
import { defineScenario } from '../../scenarios.js';
import { seaCamera } from '../ocean.js';
import { VFX } from '../../config.js';
import { rng, clamp, smoothstep } from '../textures/noise.js';
import {
  WaterPatch, pumpCards, pumpSea, seaSource, dropSeaSource, sunDir, seaHeight, hotTexture, softAdd,
  smokeField, hotField, flameField, rainField, sprayField, apronTexture, vfxScene, dbg, useCtx, vfxCtx,
  setImpactPhase, setFirePhase, firePin, warmSource, dropWarmSource, warmSources,
} from './field.js';

export { setFirePhase } from './field.js';

const FLAME_M = 5.4;      // metres of flame height at size 1, before VFX[size].scale
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0.7, 0, 0.7).normalize();

// The glow an oil fire throws on the water it is standing on. Additive on a patch that follows the
// swell, because a flat quad at a fixed height slices the crests and draws a polygon on them.
let glowMat = null;
const glows = [];
function takeGlow(root) {
  if (!glowMat) {
    glowMat = softAdd(new THREE.MeshBasicMaterial({
      map: hotTexture(), color: 0xff7a26, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, fog: false, toneMapped: true, forceSinglePass: true,
    }));
  }
  let p = glows.find(g => !g.busy);
  if (!p) {
    if (glows.length >= 5) p = glows[0];
    else { p = new WaterPatch(glowMat.clone(), { rings: 4, seg: 20, root }); glows.push(p); }
  }
  p.busy = true;
  return p;
}
function freeGlow(p) { if (p) { p.busy = false; p.hide(); } }

// Burning oil standing on water has to disturb the water: a broken foam ring with the sea inside it
// darkened, on a patch that follows the swell. Without it a fire on the sea is a glow blob floating
// on undisturbed water, which is the "nothing touches anything" defect in its cheapest form.
let foamMat = null;
const foams = [];
function takeFoam(root) {
  if (!foamMat) {
    foamMat = new THREE.MeshBasicMaterial({
      map: apronTexture(), transparent: true, depthWrite: false, depthTest: false, opacity: 1,
      side: THREE.DoubleSide, fog: true, toneMapped: true, forceSinglePass: true,
    });
  }
  let p = foams.find(g => !g.busy);
  if (!p) {
    if (foams.length >= 3) p = foams[0];
    else { p = new WaterPatch(foamMat.clone(), { rings: 8, seg: 30, root }); foams.push(p); }
  }
  p.busy = true;
  return p;
}
function freeFoam(p) { if (p) { p.busy = false; p.hide(); } }

const world = new THREE.Vector3();
const w = new THREE.Vector3();
const centre = new THREE.Vector3();
const col = new THREE.Color();
let seq = 0;

registerEmitter('fire', (ctx, host, localPos, seconds = VFX.fireSeconds) => {
  useCtx(ctx);
  const o = typeof seconds === 'object' && seconds !== null ? seconds : { seconds };
  const cfg = VFX[o.size] ?? VFX[1];
  const LIFE = o.seconds === 0 ? Infinity : (o.seconds ?? VFX.fireSeconds);   // 0 = burns until cleared
  const H = FLAME_M * cfg.scale * (o.scale ?? 1);
  const RB = H * 0.42;                       // radius of the burning patch
  const r = rng(o.seed ?? (5171 + (seq++ % 64) * 53));
  const wind = new THREE.Vector3(o.wind ? o.wind[0] : -7, 0, o.wind ? o.wind[1] : 3);
  const onWater = !host;

  const flameF = flameField(ctx.root);
  const hotF = hotField(ctx.root);
  const smokeF = smokeField(ctx.root);

  const tongues = [], roots = [], tips = [], puffs = [];

  const NT = Math.round(8 * cfg.cards);
  for (let i = 0; i < NT; i++) {
    const s = flameF.take();
    if (!s) break;
    const a = r() * Math.PI * 2;
    const rr = Math.pow(r(), 0.6);
    tongues.push({
      s,
      // the y jitter is what stops the cluster sitting on one plane: without it every tongue is
      // seated at the same height on the same circle and four of them line up as parallel wedges
      off: new THREE.Vector3(Math.cos(a) * RB * rr * (0.7 + 0.7 * r()), H * (r() - 0.35) * 0.16,
        Math.sin(a) * RB * rr * (0.7 + 0.7 * r())),
      h: H * (0.24 + 0.72 * (1 - rr) * (0.5 + 1.0 * r())),
      wide: 0.34 + 0.82 * r(),
      flip: r() < 0.5 ? -1 : 1,            // mirrors the quad, so one tongue texture is two shapes
      rate: 0.70 + 1.05 * r(),
      ph: r(),
      lean: (r() - 0.5) * 0.62,
      bright: 0.29 + 0.32 * r(),
    });
  }

  // the root: a small, very hot, near-white core where the fire meets what it is burning. Without
  // it the base of a flame is the same orange as its tip and the fire has no seat.
  for (let i = 0; i < Math.round(3 * cfg.cards); i++) {
    const s = hotF.take();
    if (!s) break;
    const a = r() * Math.PI * 2, rr = Math.pow(r(), 0.7);
    roots.push({
      s, off: new THREE.Vector3(Math.cos(a) * RB * rr * 0.8, H * 0.06, Math.sin(a) * RB * rr * 0.8),
      size: H * (0.34 + 0.22 * r()), rate: 1.6 + 1.5 * r(), ph: r(), bright: 0.40 + 0.30 * r(),
    });
  }

  // detached tips: the top of a lick tearing off and burning out as it rises. Embers as hard bright
  // dots resolve into bokeh discs at 4x, so these are dim, small and on the soft-additive path.
  for (let i = 0; i < Math.round(5 * cfg.cards); i++) {
    const s = hotF.take();
    if (!s) break;
    const a = r() * Math.PI * 2, rr = r();
    tips.push({
      s, off: new THREE.Vector3(Math.cos(a) * RB * rr, 0, Math.sin(a) * RB * rr),
      rise: H * (0.7 + 0.9 * r()), life: 0.7 + 0.8 * r(), ph: r(),
      size: H * (0.035 + 0.05 * r()), bright: 0.14 + 0.16 * r(),
    });
  }

  const NS = Math.round(18 * cfg.cards);
  for (let i = 0; i < NS; i++) {
    const s = smokeF.take();
    if (!s) break;
    const fat = Math.pow(r(), 1.8);        // a few big masses among many small ones — 6:1 at any age
    puffs.push({
      s, ph: i / NS + r() * 0.04,
      life: 5.5 + 3.5 * r(),
      rise: H * (0.62 + 0.42 * r()),
      out: new THREE.Vector3((r() - 0.5) * RB * 2.2, H * (r() - 0.5) * 0.3, (r() - 0.5) * RB * 2.2),
      s0: H * (0.34 + 0.52 * fat), grow: H * (0.16 + 0.50 * fat),
      ar: 0.72 + 0.62 * r(),               // no two the same silhouette from one round texture
      dark: 0.0065 + 0.0165 * r(),
      rot: (r() - 0.5) * 1.9,
      spin: (r() - 0.5) * 0.9,             // rotates as it climbs, so the baked ramp is never a row
      shear: 0.30 + 0.50 * r(),
      alpha: 0.42 + 0.24 * r(),
    });
  }

  // steam: water flashing off around a fire standing on the sea. Small, low, warm-lit from the
  // flame beside it and cool where it thins — the visible half of "this fire is touching water".
  const steam = [];
  if (onWater) {
    const sprayF = sprayField(ctx.root);
    for (let i = 0; i < Math.round(7 * cfg.cards); i++) {
      const s = sprayF.take();
      if (!s) break;
      const a = r() * Math.PI * 2, rr = 0.85 + 0.9 * r();
      steam.push({
        s, dir: new THREE.Vector3(Math.cos(a) * RB * rr, 0, Math.sin(a) * RB * rr),
        rise: H * (0.10 + 0.20 * r()), life: 1.6 + 1.4 * r(), ph: r(),
        s0: H * (0.07 + 0.11 * r()), grow: H * (0.07 + 0.11 * r()),
        rot: (r() - 0.5) * 1.1, alpha: 0.030 + 0.045 * r(),
      });
    }
  }

  const light = o.light === false ? null : ctx.lights.acquire();
  // The cutoff is what gives a hull a shadow face. At H*8 one fire reached stem to stern and
  // every plate on the ship came back the same value; three.js windows the 1/d² by
  // (1-(d/cutoff)^4)^2, so the pool ends inside the ship's own length.
  if (light) { light.color.set(0xff9440); light.distance = o.lightRange ?? H * 4.2; }
  const source = o.sea === false ? null : seaSource();
  if (source) { source.colour = o.seaColour ?? '#ff8626'; source.radius = o.seaRadius ?? H * 14; }
  const warm = warmSource(o.warmRadius ?? o.seaRadius ?? H * 9);
  const glow = onWater ? takeGlow(ctx.root) : null;
  const foam = onWater ? takeFoam(ctx.root) : null;

  const sun = sunDir();
  let seaY = 0;
  let t = 0;

  const shape = () => {
    if (host) host.localToWorld(world.copy(localPos));
    else world.set(localPos.x, seaHeight(localPos.x, localPos.z), localPos.z);
    seaY = onWater ? world.y : seaHeight(world.x, world.z);
    // the fade-in and the burn-out at the end of a fire's life; a fire that appears at full size is
    // the tell that it was switched on rather than started
    const grow = smoothstep(0, 1.2, t);
    const end = isFinite(LIFE) ? 1 - smoothstep(LIFE - 3.5, LIFE, t) : 1;
    const k = grow * end;
    centre.copy(world).addScaledVector(UP, H * 0.35);

    for (const c of tongues) {
      const f = (t * c.rate + c.ph) % 1;
      // a lick grows, peaks and drops back; every tongue on its own phase so the cluster is never
      // one shape pulsing
      const lick = 0.34 + 0.66 * Math.sin(Math.PI * Math.pow(f, 0.85));
      const h = c.h * lick * k;
      c.s.sx = h * c.wide * c.flip;
      c.s.sy = h;
      c.s.rot = c.lean * (0.6 + 0.4 * Math.sin(t * 2.1 + c.ph * 9));
      c.s.pos.copy(world).add(c.off);
      c.s.pos.y += h * 0.47;
      const b = c.bright * (0.72 + 0.28 * lick);
      c.s.colour.setRGB(b, b * 0.56, b * 0.30).multiplyScalar(dbg.flame);
      c.s.alpha = h > 0.05 ? 1 : 0;
    }

    for (const c of roots) {
      const f = (t * c.rate + c.ph) % 1;
      const pulse = 0.6 + 0.4 * Math.sin(Math.PI * 2 * f);
      c.s.pos.copy(world).add(c.off);
      c.s.sx = c.s.sy = c.size * (0.8 + 0.35 * pulse) * k;
      const b = c.bright * pulse * k;
      c.s.colour.setRGB(b, b * 0.42, b * 0.16).multiplyScalar(dbg.hot);
      c.s.alpha = k > 0.02 ? 1 : 0;
    }

    for (const c of tips) {
      const f = ((t / c.life) + c.ph) % 1;
      c.s.pos.copy(world).add(c.off);
      c.s.pos.y += H * 0.55 + c.rise * f;
      c.s.pos.addScaledVector(wind, f * c.life * 0.25);
      c.s.sx = c.s.sy = c.size * (1 + f * 1.6);
      const b = c.bright * Math.pow(1 - f, 1.6) * k;
      c.s.colour.setRGB(b, b * 0.38, b * 0.11).multiplyScalar(dbg.hot);
      c.s.alpha = b > 0.004 ? 1 : 0;
    }

    for (const c of puffs) {
      const f = ((t / c.life) + c.ph) % 1;
      const age = f * c.life;
      c.s.pos.copy(world).add(c.out);
      const climbed = c.rise * age;
      c.s.pos.y += H * 0.30 + climbed;
      // shear, not drift: the lean is proportional to how far the puff has already climbed, so the
      // column bends over progressively instead of the whole cloud sliding downwind together
      c.s.pos.addScaledVector(wind, c.shear * (climbed / Math.max(H, 1)) * 0.16 * age);
      const sc = c.s0 + c.grow * age;
      c.s.sx = sc * c.ar; c.s.sy = sc / c.ar;
      // A card centred near the surface is depth-clipped by the sea along the sea's own triangle
      // edges and comes back as a hard black polygon lying on the water. Keep the whole quad clear.
      const floorY = seaY + sc * 0.62;
      if (c.s.pos.y < floorY) c.s.pos.y = floorY;
      // the near cards are flipped so the texture's baked bright edge faces the fire under them.
      // A fire-lit column is lit from BELOW and a top-lit card in that position is the reason
      // smoke reads as a stack of pasteboard.
      c.s.rot = (f < 0.42 ? Math.PI : 0) + c.rot + c.spin * age;
      w.copy(c.s.pos).sub(centre);
      const dist = Math.max(H * 0.5, w.length());
      // capped and falling as 1/d²: smoke that stays warm all the way up reads as fog lit from
      // nowhere, and in the plate the top of a column is darker than the sky behind it
      const warm = Math.min(1.0, (H * 0.75) / dist) ** 2 * 0.26 * k;
      const sky = c.dark * (0.85 + 1.5 * clamp(0.5 + 0.5 * sun.y, 0, 1));
      col.setRGB(sky * 1.06 + warm * 1.00, sky * 0.95 + warm * 0.42, sky * 0.90 + warm * 0.13);
      c.s.colour.copy(col);
      c.s.alpha = dbg.smoke * c.alpha * (o.smoke ?? 1) * smoothstep(0, 0.045, f) * (1 - smoothstep(0.55, 1.0, f)) * k;
    }

    const flick = 0.82 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.7);
    if (light) {
      light.position.copy(world).addScaledVector(UP, H * 0.5).addScaledVector(SIDE, H * 0.2);
      light.intensity = (o.candela ?? 260) * cfg.light * flick * k * dbg.light;
    }
    if (source) {
      source.pos.set(world.x, 3, world.z);
      source.intensity = (o.seaIntensity ?? 0.75) * flick * k;
    }
    warm.pos.copy(centre);
    warm.intensity = (o.warm ?? 1) * flick * k * (0.5 + 0.5 * (o.scale ?? 1));
    for (const c of steam) {
      const f = ((t / c.life) + c.ph) % 1;
      const age = f * c.life;
      c.s.pos.copy(world).add(c.dir);
      c.s.pos.y = seaY + 0.35 * H * 0.18 + c.rise * age;
      c.s.pos.addScaledVector(wind, age * 0.5);
      const sc = c.s0 + c.grow * age;
      c.s.sx = sc; c.s.sy = sc * 1.15;
      if (c.s.pos.y < seaY + sc * 0.62) c.s.pos.y = seaY + sc * 0.62;
      c.s.rot = c.rot;
      // lit by the flame it is standing in, so it is warm at the root and neutral once it thins
      const hot = Math.pow(1 - f, 1.7);
      const b = (0.17 + 0.34 * hot) * k;
      c.s.colour.setRGB(b * (1 + 0.55 * hot), b * (1 + 0.10 * hot), b * (1 - 0.24 * hot));
      c.s.alpha = dbg.spray * c.alpha * smoothstep(0, 0.14, f) * (1 - smoothstep(0.45, 1.0, f)) * k;
    }

    if (foam) {
      foam.set(world.x, world.z, H * 1.25, 0.55);
      foam.mesh.material.opacity = 0.28 * k * dbg.apron;
    }
    if (glow) {
      glow.set(world.x, world.z, H * 1.8, 0.5);
      // softAdd puts the factor on the source colour, so `opacity` no longer reaches the blend —
      // the patch has to be dimmed through its tint instead.
      const b = 0.19 * flick * k * dbg.hot;
      glow.mesh.material.color.setRGB(b, b * 0.42, b * 0.14);
    }
  };

  shape();

  return ctx.add({
    update(dt) {
      const p = firePin();
      t = o.at != null ? o.at : (p != null ? p : t + dt);
      shape();
      pumpCards(ctx.app.camera);
      pumpSea();
      return o.at != null || firePin() != null || t < LIFE;
    },
    kill() {
      for (const c of tongues) flameF.give(c.s);
      for (const c of roots) hotF.give(c.s);
      for (const c of tips) hotF.give(c.s);
      for (const c of puffs) smokeF.give(c.s);
      for (const c of steam) sprayField(ctx.root).give(c.s);
      if (light) ctx.lights.release(light);
      if (source) { source.intensity = 0; dropSeaSource(source); pumpSea(); }
      dropWarmSource(warm);
      freeGlow(glow);
      freeFoam(foam);
    },
  });
});

// ── rain ────────────────────────────────────────────────────────────────────────────────────
// 1272010_01 is a rain plate: bright vertical streaks over the whole frame, and the ones standing
// in front of the fires are lit by them. Streaks are the same spray cards at an extreme aspect —
// no new material, no new texture, one more claim on a field the burning scenario does not use.

export function rain(opts = {}) {
  const ctx = vfxCtx();
  if (!ctx) return null;
  const field = rainField(ctx.root);
  const cam = ctx.app.camera;
  const r = rng(opts.seed ?? 8821);
  const N = opts.count ?? 110;
  const near = opts.near ?? 10, far = opts.far ?? 190;
  const lean = opts.lean ?? 0.11;
  const drops = [];
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const tanH = Math.tan(cam.fov * Math.PI / 360) * 1.12;

  for (let i = 0; i < N; i++) {
    const s = field.take();
    if (!s) break;
    // Log-uniform in depth, biased near, and laid out on the camera's own axes so the frame is
    // covered whatever the pitch is. The exponent on r() is what buys the parallax: the streak
    // length below is a PHYSICAL length, so a near drop is a long smear and a far one is a tick.
    // The old version scaled length by d, which is screen-constant — i.e. no parallax at all.
    const d = near * Math.pow(far / near, Math.pow(r(), 1.5));
    const hh = d * tanH, hw = hh * (cam.aspect || 1.78);
    const p = new THREE.Vector3().copy(cam.position)
      .addScaledVector(fwd, d)
      .addScaledVector(right, (r() - 0.5) * 2 * hw)
      .addScaledVector(upv, (r() - 0.5) * 2 * hh);
    const len = 0.19 + 0.50 * Math.pow(r(), 1.4);
    drops.push({
      s, p, d, len,
      // width is not a fixed fraction of length: real rain in a still is a mix of sheets caught
      // side-on and drops caught end-on, and one ratio for all of them is the "screen decal" read
      w: len * (0.020 + 0.085 * Math.pow(r(), 0.6)),
      // 0.22 was almost no distance term at all, so a streak at 200 m was as bright as one at 10
      a: (0.13 + 0.52 * Math.pow(r(), 1.7)) * Math.pow(near / d, 0.62),
      // squalls, not a comb: a third of the drops carry a gust of their own and a few fall almost
      // straight, so the frame is not one ruled angle
      rot: lean * (r() < 0.34 ? 2.1 * r() : 0.15 + 0.9 * r()) + (r() - 0.5) * 0.16,
    });
  }

  // Rain at this density is not just streaks: it is curtains, and the plate's horizon disappears
  // into them in patches. Big soft cool masses standing between the ships and the skyline — they
  // break the grade's uniform horizon band, which is the one thing in frame that reads as a
  // painted-on colour rather than as weather.
  const murk = [];
  if (opts.murk !== 0) {
    const smokeF = smokeField(ctx.root);
    const rm = rng((opts.seed ?? 8821) ^ 0x2b17);
    const NM = opts.murk ?? 18;
    for (let i = 0; i < NM; i++) {
      const s = smokeF.take();
      if (!s) break;
      const dd = 380 + 1500 * Math.pow(rm(), 0.7);
      const hw = dd * tanH * (cam.aspect || 1.78);
      // stratified across the frame, not uniform random: 18 random draws leave holes, and one
      // clean stretch of untouched horizon is enough to read the band as a painted line again
      const u = ((i + 0.5) / NM - 0.5) * 2 + (rm() - 0.5) * 0.9 / NM;
      const p = new THREE.Vector3().copy(cam.position)
        .addScaledVector(fwd, dd)
        .addScaledVector(right, u * 1.25 * hw)
        .addScaledVector(upv, dd * tanH * (-0.08 + 0.17 * rm()));
      murk.push({
        s, p, w: dd * (0.22 + 0.30 * rm()), h: dd * (0.07 + 0.11 * rm()),
        a: 0.30 + 0.34 * rm(), rot: (rm() - 0.5) * 0.35, tone: 0.22 + 0.26 * rm(),
      });
    }
  }

  // Rain has to arrive somewhere. Specks of spray where the near drops strike the sea: soft-additive
  // so they cannot darken the water, seated on the swell, biased to the front of the frame where a
  // strike is actually resolvable.
  const hits = [];
  {
    const hotF = hotField(ctx.root);
    const rh = rng((opts.seed ?? 8821) ^ 0x51ed);
    const tanH2 = Math.tan(cam.fov * Math.PI / 360) * 1.12;
    for (let i = 0; i < (opts.hits ?? 54); i++) {
      const s = hotF.take();
      if (!s) break;
      const d = 14 * Math.pow(26, Math.pow(rh(), 1.25));
      const off = new THREE.Vector3().copy(fwd).multiplyScalar(d)
        .addScaledVector(right, (rh() - 0.5) * 2 * d * tanH2 * (cam.aspect || 1.78));
      const x = cam.position.x + off.x, z = cam.position.z + off.z;
      hits.push({ s, x, z, d, size: 0.10 + 0.42 * Math.pow(rh(), 2.0), a: 0.10 + 0.30 * rh() });
    }
  }

  const col = new THREE.Color();
  const w = new THREE.Vector3();
  const toL = new THREE.Vector3();
  // direction from the camera to each drop, fixed for a still — the screen-space half of the tint
  for (const c of drops) c.dir = c.p.clone().sub(cam.position).normalize();
  // softAdd is dst' = src·(1−dst) + dst, so a 145-luma sky takes 1.75× less increment than a
  // 65-luma sea from the same source value — rain against sky measured 0.30% of the band against
  // 4.54% over the water, and no value of `tone` closes that (0.30 → 0.52 moved the sky delta
  // 23.3 → 26.5). The drops silhouetted against sky need their own quantity. C6 escalation E3.
  for (const c of drops) c.sky = smoothstep(0, 0.05, c.dir.y);

  const shape = () => {
    const src = warmSources();
    const base = opts.tone ?? 0.34;
    for (const c of drops) {
      c.s.pos.copy(c.p);
      c.s.sx = c.w; c.s.sy = c.len;
      c.s.rot = c.rot;
      let warm = 0;
      for (const l of src) {
        if (l.intensity <= 0.01) continue;
        w.copy(c.p).sub(l.pos);
        const dd = Math.max(6, w.length());
        // Two terms. The first is the light actually reaching the drop, and it has to fall off
        // like light: `radius/dd` clamped at 1 was flat out to 150 m, which tinted every streak in
        // the frame the same cream and is why rain in front of a fire looked no different from
        // rain in front of the sky.
        const reach = (l.radius * 0.30) / dd;
        // The second is the one the eye actually checks: a drop drawn ACROSS the glow reads as lit
        // by it. Gated on the fire's APPARENT radius, so it lights the streaks silhouetted against
        // the fire and nothing else — a fixed exponent lights a cone that grows with distance.
        toL.copy(l.pos).sub(cam.position);
        const along = toL.length();
        toL.divideScalar(along);
        const ang = Math.acos(clamp(c.dir.dot(toL), -1, 1));
        const appR = Math.atan2(l.radius * 0.34, along);
        const front = c.d < along ? 1 : 0.25;
        const spread = ang / (appR * 1.9);
        warm += l.intensity * (reach * reach + 1.5 * front * Math.exp(-spread * spread));
      }
      warm = Math.min(2.2, warm) * c.a;
      const g = (base + (opts.skyTone ?? base * 0.80) * c.sky) * c.a * dbg.rain;
      // ratios held apart for the same reason the flame's are: soft-additive rain crossing a fire
      // must arrive at the fire's colour, not at white
      col.setRGB(g * 0.86 + warm * 0.62, g * 0.92 + warm * 0.29, g * 1.10 + warm * 0.09);
      c.s.colour.copy(col);
      c.s.alpha = dbg.rain > 0 ? 1 : 0;
    }
    for (const c of murk) {
      c.s.pos.copy(c.p);
      c.s.sx = c.w; c.s.sy = c.h; c.s.rot = c.rot;
      // cool and only a little brighter than the sea it stands in front of, so a curtain reads as
      // depth rather than as fog laid over the frame
      const b = c.tone * 0.11;
      c.s.colour.setRGB(b * 0.92, b * 0.95, b * 1.12);
      c.s.alpha = dbg.rain * c.a;
    }
    for (const c of hits) {
      c.s.pos.set(c.x, seaHeight(c.x, c.z) + c.size * 0.5, c.z);
      c.s.sx = c.size * 2.1; c.s.sy = c.size;
      const b = c.a * base * 2.2 * dbg.rain;
      c.s.colour.setRGB(b * 0.90, b * 0.97, b * 1.08);
      c.s.alpha = dbg.rain > 0 ? 1 : 0;
    }
  };
  shape();

  return ctx.add({
    update() { shape(); pumpCards(ctx.app.camera); return true; },
    kill() {
      for (const c of drops) field.give(c.s);
      for (const c of hits) hotField(ctx.root).give(c.s);
      for (const c of murk) smokeField(ctx.root).give(c.s);
    },
  });
}

// ── scored scenario ─────────────────────────────────────────────────────────────────────────

defineScenario({
  id: 'night_burn',
  label: 'Burning freighters at dusk in rain',
  ref: '1272010_01',
  setup(app) {
    const { fleet } = vfxScene(app, 'dusk', {
      seaState: 2, shadow: 120, fog: [260, 3000], amb: 0.075,
      // skyHaze was 1.9. hazeAmt mixes the grade's orange uHorizon into the sky at low elevation
      // AND into the ocean's airlight, so it was painting a full-width orange band across the
      // skyline and every metre of sea beyond 400 m — a global tint, not a light.
      // seaHaze scales the ocean's own fogK: at 1.0 the far sea WAS the horizon sky.
      sky: { skyCover: 2.0, skyHaze: 0.42, skyCloudSize: 1.6, exposure: 0.95, seaHaze: 0.55 },
      fade: { fade: [140, 1400], rip: [160, 1500], lod: 1.1 },
    });
    // no sun: the plate is rain and murk with the fires as the only source. Leaving C1's dusk sun
    // where the grade puts it draws a glitter path down the middle of the frame and the burning
    // ships stop being the light.
    window.__waterline.world.sky.setSun(25, -5);
    setImpactPhase(null);
    setFirePhase(30);

    const emit = window.__waterline.vfx.emit;
    const wind = [-17, 5];

    // the near freighter, broadside and burning along her waterline
    const [a] = fleet.stage([{ kit: 'battleship', cells: 5, x: -45, z: -240, heading: 0.16, detail: 2, seed: 1523 }]);
    a.setDamage(0.8);
    emit.fire(a.object3D, a.object3D.worldToLocal(a.hullSide(0.44, 1)), { seconds: 0, size: 9, scale: 1.55, seed: 71, wind, candela: 250, seaIntensity: 1.5, seaRadius: 34, warmRadius: 190 });
    // a second pooled light forward on the same hull, off the hero's axis: one light per ship puts
    // a single hotspot on the plating and leaves the rest of it reading as flat ambient
    emit.fire(a.object3D, a.object3D.worldToLocal(a.hullSide(0.26, 1)), { seconds: 0, size: 4, scale: 1.25, seed: 401, wind, candela: 120, sea: false });
    emit.fire(a.object3D, a.object3D.worldToLocal(a.hullSide(0.68, 1)), { seconds: 0, size: 4, scale: 0.85, seed: 233, wind, light: false, sea: false });

    // the second, further out and further gone
    const [b] = fleet.stage([{ kit: 'cruiser', cells: 4, x: 95, z: -330, heading: 0.34, detail: 2, seed: 6151 }]);
    b.setDamage(0.95);
    emit.fire(b.object3D, b.object3D.worldToLocal(b.hullSide(0.52, 1)), { seconds: 0, size: 9, scale: 1.1, seed: 907, wind, candela: 190, seaIntensity: 1.2, seaRadius: 26, warmRadius: 150 });
    emit.fire(b.object3D, b.object3D.worldToLocal(b.hullSide(0.30, 1)), { seconds: 0, size: 4, scale: 0.7, seed: 313, wind, light: false, sea: false });

    // burning oil on the water: no host, so these sit on the swell and carry their own glow patch
    emit.fire(null, new THREE.Vector3(-118, 0, -168), { seconds: 0, size: 4, scale: 1.2, seed: 1201, wind, light: false, sea: false });
    emit.fire(null, new THREE.Vector3(14, 0, -196), { seconds: 0, size: 4, scale: 0.9, seed: 1777, wind, light: false, sea: false });
    emit.fire(null, new THREE.Vector3(52, 0, -272), { seconds: 0, size: 1, scale: 1.5, seed: 2003, wind, light: false, sea: false });

    // a third hulk far out, and a convoy silhouette, so the burning is a scene rather than a prop.
    // x was 760 with drift -120: at 1180 m the frame is ±562 m, so the hull was off the right edge
    // and its plume drifted in as a row of puffs standing in clear air with nothing under them.
    fleet.stage([{ kit: 'cruiser', cells: 4, x: 430, z: -1180, heading: 1.2, detail: 0, seed: 55 }]);
    fleet.plumes.add(430, 16, -1180, { drift: [-46, 18], puffs: 16, rise: 95, scale: 19, tone: 0.92, seed: 313, alpha: 0.5, fire: 0.16, spread: 1.15 });
    fleet.stage([{ kit: 'destroyer', cells: 3, x: -720, z: -1420, heading: 0.9, detail: 0, seed: 811 }]);

    seaCamera(app, { y: 17, fov: 30, horizon: 0.575 });
    rain({ count: 330, near: 9, far: 200, seed: 8821, lean: 0.13, tone: 0.21 });
  },
});
