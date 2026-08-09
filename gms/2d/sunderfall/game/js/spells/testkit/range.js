/**
 * The spell proving range: ground, a masonry wall, an arch on two pillars,
 * trees, crates, a bone pile, glass and iron — one of everything a spell is
 * supposed to interact with, laid out so a single screenshot shows all of it.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT } from '../../sim/materials.js';

export function buildRange(world, ctx) {
  const T = world.terrain;
  const rng = ctx.rng;

  // ground: a shallow valley so acid has somewhere to ooze to
  T.hill(-2200, 2600, (x) => {
    let y = 120;
    y += Math.sin(x * 0.0016) * 34;
    y += Math.sin(x * 0.0051 + 1.3) * 14;
    if (x > 300 && x < 900) y += 70 * Math.sin(((x - 300) / 600) * Math.PI);   // the basin
    if (x > 1500 && x < 1900) y -= 90;                                          // a step up
    return y;
  }, MATERIAL.EARTH);
  T.box(-2200, 560, 4800, 600, MATERIAL.ROCK);      // bedrock, well below the play line
  T.box(1500, 30, 400, 60, MATERIAL.ROCK);

  const G = (x) => {
    const g = world.groundY(x, -400, 1400);
    return Number.isNaN(g) ? 120 : g;
  };

  const props = {};

  // ---- the masonry wall (acid and stonepin target)
  props.wall = [];
  for (let i = 0; i < 3; i++) {
    props.wall.push(world.addProp('wall_brick', -620 + i * 112, G(-620 + i * 112)));
  }
  props.wallTop = world.addProp('wall_brick', -564, props.wall[0].top, { supportedBy: [props.wall[0], props.wall[1]] });
  props.wallTop2 = world.addProp('wall_brick', -452, props.wall[1].top, { supportedBy: [props.wall[1], props.wall[2]] });
  props.window = world.addProp('window_glass', -508, props.wallTop.top + 10, { supportedBy: [props.wallTop, props.wallTop2] });

  // ---- the arch on two pillars (the support-graph showpiece)
  const pl = world.addProp('pillar_stone', -60, G(-60));
  const pr = world.addProp('pillar_stone', 260, G(260));
  const arch = world.addProp('arch_stone', 100, pl.top + 20, { supportedBy: [pl, pr] });
  const cap = world.addProp('wall_brick', 100, arch.top + 8, { supportedBy: [arch] });
  props.pillarL = pl; props.pillarR = pr; props.arch = arch; props.cap = cap;

  // ---- trees (fire and galewrench)
  props.trees = [];
  for (const tx of [-1400, -1180, -980, 1180, 1420]) {
    props.trees.push(world.addTree(tx > 0 ? 'tree_oak' : 'tree_young', tx, G(tx)));
  }
  for (const bx of [-1300, -1080, 620, 1300]) world.addProp('bush', bx, G(bx));
  world.addProp('ferns', -880, G(-880));
  world.addProp('ferns', 980, G(980));

  // ---- crates and barrels
  props.crates = [];
  for (let i = 0; i < 4; i++) props.crates.push(world.addProp('crate', 480 + i * 64, G(480 + i * 64)));
  props.crates.push(world.addProp('crate', 512, G(512) - 60));
  props.barrel = world.addProp('barrel', 700, G(700));
  world.addProp('fence', -1650, G(-1650));
  world.addProp('fence', -1520, G(-1520));

  // ---- bone pile (gravewake fuel)
  props.bones = [
    world.addProp('skull_pile', 860, G(860)),
    world.addProp('skull_pile', 960, G(960)),
  ];

  // ---- metal and glass (sparklash)
  props.gate = world.addProp('gate_iron', 1560, G(1560));
  props.brazier = world.addProp('brazier', 1700, G(1700));
  props.lanterns = [world.addProp('lantern', -300, G(-300)), world.addProp('lantern', 1120, G(1120))];

  // ---- rock
  world.addProp('boulder_big', -1750, G(-1750));
  world.addProp('boulder_small', 1900, G(1900));
  world.addProp('rocks_small', 340, G(340));
  world.addProp('stump', -760, G(-760));
  world.addProp('deadtree', 2050, G(2050));

  world.solveSupport();
  return props;
}

/* ------------------------------------------------------------------ *
 * Dummy targets
 * ------------------------------------------------------------------ */

function dummyUpdate(e, dt) {
  const d = e.data;
  d.t += dt;
  if (d.mobile) {
    e.vx = Math.sin(d.t * 0.7 + d.phase) * 90;
    e.faceX = e.vx >= 0 ? 1 : -1;
  } else e.vx *= 0.9;
}

function dummyRender(e, alpha, R) {
  const d = e.data;
  const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
  const f = e.hitFlash || 0;
  const burn = e.burning > 0 ? 1 : 0;
  let r = 0.16 + f * 0.8 + burn * 0.18, g = 0.15 + f * 0.8, b = 0.19 + f * 0.8;
  const sway = Math.sin(d.t * 3 + d.phase) * 0.05;
  R.sprite({ tex: R.blob, x, y: y + 22, w: 16, h: 46, rot: 0.08, r, g, b, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: x + 11, y: y + 22, w: 16, h: 46, rot: -0.08, r, g, b, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x, y, w: e.w, h: e.h * 0.62, rot: sway, r, g, b, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: x + e.faceX * 5, y: y - e.h * 0.42, w: 30, h: 32, r, g, b, a: 1, layer: LAYER.ACTORS });
  R.sprite({ tex: R.blob, x: x + e.faceX * 11, y: y - e.h * 0.42, w: 7, h: 5, r: 0.95, g: 0.45, b: 0.30, a: 1, layer: LAYER.FX, add: true });
  // health as a shrinking bar; a still frame has to show that damage landed
  const hp = Math.max(0, e.hp / e.maxHp);
  R.quad({ x, y: y - e.h * 0.75, w: 54, h: 6, r: 0.05, g: 0.04, b: 0.05, a: 0.8, layer: LAYER.UI_WORLD });
  R.quad({ x: x - 27 + 27 * hp, y: y - e.h * 0.75, w: 54 * hp, h: 6, r: 0.85, g: 0.28, b: 0.22, a: 1, layer: LAYER.UI_WORLD });
}

function corpseRender(e, alpha, R) {
  R.sprite({ tex: R.blob, x: e.x, y: e.y + 8, w: 74, h: 24, rot: 0.1, r: 0.13, g: 0.11, b: 0.13, a: 1, layer: LAYER.TERRAIN_FRONT });
  R.sprite({ tex: R.blob, x: e.x - 24, y: e.y + 2, w: 26, h: 26, r: 0.15, g: 0.13, b: 0.15, a: 1, layer: LAYER.TERRAIN_FRONT });
}

export function spawnDummy(world, x, y, opts) {
  const o = opts || {};
  const e = world.spawn({
    kind: 'enemy', x, y: y - 50, w: 40, h: 96, team: 1,
    hp: o.hp || 160, material: MATERIAL.FLESH, gravity: 1, friction: 6,
    tag: o.tag || 'dummy', flammable: 1,
    onUpdate: dummyUpdate, render: dummyRender,
    onDeath(sp) {
      world.spawn({
        kind: 'corpse', x: sp.x, y: sp.y + sp.h * 0.4, w: 70, h: 26, team: 2,
        hp: 1, gravity: 1, friction: 10, life: 0, tag: 'corpse',
        render: corpseRender,
      });
      world.burstDebris(sp.x, sp.y, MATERIAL.FLESH, 6, { speed: 260, speedVar: 180, spread: Math.PI, size: 0.6 });
    },
  });
  if (!e) return null;
  e.data.t = 0; e.data.phase = world.rng.angle(); e.data.mobile = !!o.mobile;
  e.data.elite = !!o.elite;
  return e;
}

export function spawnDummies(world, ctx) {
  const G = (x) => {
    const g = world.groundY(x, -400, 1400);
    return Number.isNaN(g) ? 120 : g;
  };
  const out = [];
  const xs = [-1520, -1240, -900, -700, -420, -180, 60, 180, 420, 640, 900, 1040, 1240, 1620, 1840];
  for (let i = 0; i < xs.length; i++) {
    out.push(spawnDummy(world, xs[i], G(xs[i]), { mobile: i % 3 === 0, hp: 160 }));
  }
  return out;
}
