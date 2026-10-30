// Halloween move animations. Every piece has its own (round 3 added the queen's bat swarm /
// glide and the king's royal hop); Classic's set stays in the list as occasional variety. Battles fall back to Classic (index.js).
import { moveAnims as classicMoves } from '../classic/anims.js';

const { PI, sin, min, max, exp } = Math;

/** Pumpkin imp: a bouncy little hop with a side-to-side wobble, then a jelly landing. */
export async function impHop(ctx) {
  const { kit, piece, to, dist } = ctx;
  const from = piece.position.clone(), dir = kit.flatDir(from, to);
  const side = new ctx.THREE.Vector3(-dir.z, 0, dir.x);
  const ms = min(250, 175 + dist * 30), h = min(0.55, 0.3 + dist * 0.08);
  await ctx.tween(ms, (e, k) => {
    kit.arc(piece.position, from, to, h, e);
    kit.setLean(piece, side, 0.32 * sin(k * PI * 2.5) * (1 - k * 0.6), 0.25 * sin(k * PI));
    const st = sin(k * PI) * 0.12;                       // stretch in the air
    piece.scale.set(1 - st * 0.4, 1 + st, 1 - st * 0.4);
  }, kit.ease.sineInOut);
  // jelly landing: damped squash wobble
  await ctx.tween(90, (e, k) => {
    const s = 0.22 * exp(-k * 3.2) * Math.cos(k * PI * 2.6);
    piece.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
    kit.setLean(piece, side, 0.06 * (1 - k) * sin(k * PI * 3));
  });
  piece.scale.set(1, 1, 1); piece.quaternion.identity(); piece.position.copy(to);
}
impHop.only = ['p']; impHop.weight = 4; impHop.label = 'imp hop';

/** Crypt tower: grinds across the board with a stony rumble and puffs of grave dust. */
export async function cryptRumble(ctx) {
  const { kit, piece, to, dist, fx } = ctx;
  const from = piece.position.clone(), dir = kit.flatDir(from, to);
  const side = new ctx.THREE.Vector3(-dir.z, 0, dir.x);
  const ms = min(290, 190 + dist * 18);
  const dustCols = ['#8a8070', '#6c6458', '#a59b88'];
  fx?.smoke(from.clone().setY(0.05), { count: 5, colors: dustCols, alpha: 0.35, size: [0.14, 0.24], up: 0.2, speed: [0.3, 0.8] });
  let puff = 0;
  await ctx.tween(ms, (e, k) => {
    piece.position.lerpVectors(from, to, e);
    const amp = sin(k * PI);
    piece.position.addScaledVector(side, 0.014 * amp * sin(k * 70));
    piece.position.y = 0.012 * amp * Math.abs(sin(k * 53));
    // heavy: leans back on start, rocks forward on the stop, grinding twist throughout
    kit.setLean(piece, dir, (k < 0.55 ? -0.07 * sin(k / 0.55 * PI) : 0.11 * sin((k - 0.55) / 0.45 * PI)), 0.05 * amp * sin(k * 41));
    if (k - puff > 0.3) { puff = k; fx?.smoke(piece.position.clone().setY(0.04), { count: 2, colors: dustCols, alpha: 0.3, size: [0.12, 0.2], up: 0.15, speed: [0.2, 0.5] }); }
  }, kit.ease.quadInOut);
  piece.position.copy(to); piece.quaternion.identity();
  fx?.smoke(to.clone().setY(0.05), { count: 6, colors: dustCols, alpha: 0.35, size: [0.14, 0.26], up: 0.15, speed: [0.4, 1.0] });
  await kit.squash(ctx, piece, 0.1, 60);
}
cryptRumble.only = ['r']; cryptRumble.weight = 4; cryptRumble.label = 'crypt rumble';

/** Side colours for spectral FX (the pieces' flame ramp / glow). */
const wisp = color => (color === 'b' ? ['#8cff52', '#4fd256', '#c8ff96'] : ['#ffb02a', '#f47a10', '#ffd27a']);

/**
 * Nightmare: rears, takes a high spectral leap pitched nose-down, and streams ghost-flame
 * wisps from its mane along the arc; lands with a soft puff of side-coloured spirit smoke.
 */
export async function nightmareLeap(ctx) {
  const { kit, piece, to, dist, fx, color } = ctx;
  const from = piece.position.clone(), dir = kit.flatDir(from, to), axis = kit.tiltAxis(dir);
  const cols = wisp(color), ms = min(280, 230 + dist * 15), h = min(0.95, 0.7 + dist * 0.06);
  fx?.smoke(from.clone().setY(0.06), { count: 4, colors: cols, alpha: 0.35, size: [0.12, 0.2], up: 0.3, speed: [0.2, 0.6], life: [300, 500] });
  let last = -1;
  await ctx.tween(ms, (e, k) => {
    kit.arc(piece.position, from, to, h, e);
    // rear back on take-off, pitch nose-down into the landing
    piece.quaternion.setFromAxisAngle(axis, -0.5 * sin(k * PI) + 0.32 * sin(k * PI * 2));
    const st = sin(k * PI) * 0.1;
    piece.scale.set(1 - st * 0.3, 1 + st, 1 - st * 0.3);
    if (k - last > 0.07 && k < 0.95) {
      last = k;
      const p = piece.position.clone().addScaledVector(dir, -0.18); p.y += 0.6;
      fx?.burst({ pos: p, count: 5, colors: cols, speed: [0.05, 0.4], spread: 1, up: 0.25, life: [280, 520],
        size: [0.12, 0.2], sizeEnd: 0.15, gravity: -0.6, drag: 2.5, shape: 0, alpha: 0.75, blend: 'add' });
    }
  }, kit.ease.sineInOut);
  piece.quaternion.identity(); piece.scale.set(1, 1, 1); piece.position.copy(to);
  fx?.smoke(to.clone().setY(0.06), { count: 7, colors: cols, alpha: 0.4, size: [0.14, 0.24], up: 0.2, speed: [0.5, 1.1], life: [300, 520] });
  await kit.squash(ctx, piece, 0.22, 65);
}
nightmareLeap.only = ['n']; nightmareLeap.weight = 5; nightmareLeap.label = 'spectral leap';

/**
 * Witch: lifts off, swoops along a low arc leaning into the flight with a twirl of the hat
 * (the broom sweeps round from above), trailing sparkles; a light bob on landing.
 */
export async function witchSwoop(ctx) {
  const { kit, piece, to, dist, fx, color } = ctx;
  const from = piece.position.clone(), dir = kit.flatDir(from, to);
  const cols = color === 'b' ? ['#c8ff96', '#8cff52', '#b48ae8'] : ['#ffe08a', '#ffb02a', '#ffffff'];
  const ms = min(290, 200 + dist * 22), h = min(0.5, 0.26 + dist * 0.04);
  const turn = (dist > 2.5 ? 2 : 1) * PI * (Math.random() < 0.5 ? 1 : -1);
  let last = -1;
  await ctx.tween(ms, (e, k) => {
    piece.position.lerpVectors(from, to, e);
    piece.position.y = h * Math.pow(sin(PI * k), 0.6);              // quick lift, glide, settle
    kit.setLean(piece, dir, 0.32 * sin(PI * k), turn * kit.ease.cubicInOut(k));
    if (k - last > 0.09 && k > 0.08 && k < 0.92) {
      last = k;
      const p = piece.position.clone().addScaledVector(dir, -0.15); p.y += 0.62;
      fx?.sparkles(p, { count: 3, colors: cols, speed: [0.1, 0.5], up: 0.2, life: [260, 480], size: [0.06, 0.1], gravity: 0.6 });
    }
  }, kit.ease.sineInOut);
  piece.quaternion.identity(); piece.position.copy(to);
  fx?.sparkles(to.clone().setY(0.2), { count: 6, colors: cols, speed: [0.3, 0.9], up: 0.4, life: [300, 520], size: [0.06, 0.1] });
  await kit.squash(ctx, piece, 0.12, 55);
}
witchSwoop.only = ['b']; witchSwoop.weight = 5; witchSwoop.label = 'broom swoop';

// ------------------------------------------------------------------ round 3: royals
/** One shared little bat (flat silhouette in the xz plane, head toward -z), per side colour. */
const batCache = new Map();
function batKit(THREE, kit, color) {
  if (batCache.has(color)) return batCache.get(color);
  const half = [[0, -0.034], [0.012, -0.05], [0.016, -0.03], [0.04, -0.034], [0.08, -0.05], [0.11, -0.02],
    [0.09, 0.0], [0.075, 0.022], [0.058, 0.004], [0.04, 0.026], [0.024, 0.008], [0.012, 0.03], [0, 0.04]];
  const pts = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geom = new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2);   // shape y -> world +z (tail), head toward -z
  const mat = kit.material({ color: color === 'b' ? '#3a2260' : '#4a2208', roughness: 0.7, vertexColors: false,
    side: THREE.DoubleSide, emissive: color === 'b' ? '#2a5a20' : '#5a2a00', emissiveIntensity: 0.6 });
  const v = { geom, mat };
  batCache.set(color, v);
  return v;
}

/**
 * Vampire Countess: bursts into a little swarm of bats that flutters across in a swirl and
 * re-forms her on the target square (a pop of side-coloured mist both ends).
 */
export async function countessBats(ctx) {
  const { kit, THREE, piece, to, dist, fx, color, scene } = ctx;
  const from = piece.position.clone(), cols = wisp(color);
  const N = 5, { geom, mat } = batKit(THREE, kit, color);
  const bats = new THREE.InstancedMesh(geom, mat, N);
  bats.frustumCulled = false; bats.renderOrder = 4;
  const host = scene || piece.parent;
  host?.add(bats);
  const seed = Array.from({ length: N }, (_, i) => ({ ph: (i / N) * PI * 2 + Math.random() * 0.5, h: 0.45 + Math.random() * 0.35, r: 0.16 + Math.random() * 0.12, f: 9 + Math.random() * 5 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Vector3();
  const place = (centre, k, spread, size, tAll) => {
    seed.forEach((b, i) => {
      const a = b.ph + tAll * 7;                                   // swirl round the centre
      p.set(centre.x + Math.cos(a) * b.r * spread, centre.y + (b.h - 0.6) * spread + 0.05 * sin(tAll * 20 + i), centre.z + Math.sin(a) * b.r * spread);
      const flap = 0.45 + 0.55 * Math.abs(sin(tAll * b.f * PI + i));
      e.set(0.15 * sin(tAll * 13 + i), -a, 0.22 * Math.cos(a));    // face along the swirl, lightly banked
      q.setFromEuler(e); sc.set(size * flap, size, size);
      m4.compose(p, q, sc); bats.setMatrixAt(i, m4);
    });
    bats.instanceMatrix.needsUpdate = true;
  };
  const hide = () => { place(from, 0, 0, 0.0001, 0); };
  hide();
  try {
    fx?.smoke(from.clone().setY(0.55), { count: 6, colors: cols, alpha: 0.35, size: [0.16, 0.26], up: 0.25, speed: [0.3, 0.8], life: [260, 460] });
    // 1) dissolve: she shrinks into a twist as the swarm bursts out of her
    await ctx.tween(80, (k) => {
      piece.scale.set(max(0.01, 1 - k), max(0.01, 1 - k * 0.7), max(0.01, 1 - k));
      piece.rotation.y = k * 1.4;
      c.copy(from).setY(0.62);
      place(c, k, 0.3 + 0.7 * k, 0.9 + 1.0 * k, k * 0.08);
    }, kit.ease.quadIn);
    piece.scale.setScalar(0.01); piece.rotation.y = 0;
    // 2) the swarm flutters over in an arc
    const ms = min(180, 130 + dist * 12), h = min(0.45, 0.22 + dist * 0.04);
    let last = 0;
    await ctx.tween(ms, (k, raw) => {
      kit.arc(c, from, to, h, k); c.y += 0.62;
      piece.position.copy(to);
      place(c, k, 1 + 0.2 * sin(raw * PI), 1.9, 0.08 + raw * (ms / 1000));
      if (raw - last > 0.2 && raw < 0.9) { last = raw; fx?.burst({ pos: c.clone(), count: 3, colors: cols, speed: [0.05, 0.3], spread: 1, up: 0.1, life: [220, 380], size: [0.06, 0.1], sizeEnd: 0.2, gravity: -0.3, drag: 2, shape: 1, alpha: 0.6, blend: 'add' }); }
    }, kit.ease.sineInOut);
    // 3) re-form: the bats fold in and she pops back up with a little overshoot
    piece.position.copy(to);
    await ctx.tween(70, (k) => {
      c.copy(to).setY(0.62);
      place(c, k, 1 - k, 1.9 * (1 - k) + 0.0001, 0.3 + k * 0.08);
      const s2 = kit.ease.backOut(k);
      piece.scale.set(max(0.01, s2), max(0.01, s2), max(0.01, s2));
      piece.rotation.y = (1 - k) * -1.2;
    });
  } finally {
    host?.remove(bats); bats.dispose();
    piece.scale.set(1, 1, 1); piece.rotation.y = 0; piece.position.copy(to);
  }
  fx?.smoke(to.clone().setY(0.5), { count: 6, colors: cols, alpha: 0.35, size: [0.14, 0.24], up: 0.2, speed: [0.4, 0.9], life: [260, 460] });
}
countessBats.only = ['q']; countessBats.weight = 5; countessBats.label = 'bat swarm';

/** Vampire Countess, quieter variant: hovers and glides across, leaning back, trailing mist. */
export async function countessGlide(ctx) {
  const { kit, piece, to, dist, fx, color } = ctx;
  const from = piece.position.clone(), dir = kit.flatDir(from, to), cols = wisp(color);
  const ms = min(280, 200 + dist * 18);
  let last = -1;
  await ctx.tween(ms, (e, k) => {
    piece.position.lerpVectors(from, to, e);
    piece.position.y = 0.12 * Math.pow(sin(PI * k), 0.5);
    kit.setLean(piece, dir, -0.12 * sin(PI * k), 0.35 * sin(PI * k) * sin(k * PI * 2));
    if (k - last > 0.12 && k < 0.9) { last = k; fx?.smoke(piece.position.clone().setY(0.08), { count: 2, colors: cols, alpha: 0.3, size: [0.12, 0.2], up: 0.05, speed: [0.1, 0.3], life: [260, 420] }); }
  }, kit.ease.cubicInOut);
  piece.position.copy(to); piece.quaternion.identity();
  await kit.squash(ctx, piece, 0.08, 50);
}
countessGlide.only = ['q']; countessGlide.weight = 2; countessGlide.label = 'vampire glide';

/**
 * Pumpkin King: a stately royal hop. He crouches, rises with a regal sway (the mantle
 * flutters as he comes down), lands with a stomp ring and a puff of side-coloured embers.
 */
export async function royalHop(ctx) {
  const { kit, THREE, piece, to, dist, fx, color } = ctx;
  const from = piece.position.clone(), dir = kit.flatDir(from, to), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const cols = wisp(color), ms = min(210, 165 + dist * 12), h = min(0.42, 0.24 + dist * 0.035);
  // crouch
  await ctx.tween(55, (k) => { const s = 0.1 * sin(k * PI / 2); piece.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6); kit.setLean(piece, dir, -0.08 * k); }, kit.ease.quadOut);
  await ctx.tween(ms, (e, k) => {
    kit.arc(piece.position, from, to, h, e);
    const st = sin(k * PI) * 0.07, back = 0.1 * (1 - k);
    piece.scale.set(1 - st * 0.4 + back * 0.4, 1 + st - back, 1 - st * 0.4 + back * 0.4);
    // regal sway, then a quick flutter on the way down
    const flutter = k > 0.55 ? 0.05 * sin((k - 0.55) * PI * 9) * (1 - k) * 2 : 0;
    piece.quaternion.setFromAxisAngle(kit.tiltAxis(side), 0.12 * sin(k * PI * 2) + flutter);
    piece.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(kit.tiltAxis(dir), 0.14 * sin(k * PI) - 0.06));
  }, kit.ease.sineInOut);
  piece.position.copy(to); piece.quaternion.identity(); piece.scale.set(1, 1, 1);
  fx?.ring(to.clone().setY(0.03), { radius: 0.55, color: color === 'b' ? '#8cff52' : '#ffb02a' });
  fx?.sparks(to.clone().setY(0.1), { count: 10, colors: cols, dir: new THREE.Vector3(0, 1, 0) });
  fx?.dust(to.clone().setY(0.05), { colors: ['#8a8070', '#6c6458'] });
  await kit.squash(ctx, piece, 0.16, 70);
}
royalHop.only = ['k']; royalHop.weight = 5; royalHop.label = 'royal hop';

export const moveAnims = [impHop, cryptRumble, nightmareLeap, witchSwoop, countessBats, countessGlide, royalHop, ...classicMoves];
