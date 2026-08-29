// The gates. Everything else in HOMEBOUND exists so the player can choose
// between these.
//
// THREE VERBS, ONE GUN
//   GROW   (wood)   every bullet hit raises the number. The sign updates LIVE —
//                   that feedback is the mechanic, not decoration.
//   BREAK  (glass)  cannot grow; enough damage shatters it. That is how a trap
//                   gate gets denied, and why glass is the "not negotiable" one.
//   PRESS  (button) one hit fires `item.action` and the plate goes down.
// Crossing a gate's z resolves whichever one the leader's x overlaps. Nothing
// is applied here: we emit `gate:pass` and game.js:applyEffect does the work.
//
// PERFORMANCE SHAPE
// Four instanced meshes, whatever the level throws at us: frames, opaque faces,
// glass faces, debris. The numbers ride on signs.js's shared glyph mesh, so a
// row of three gates with three different climbing values is still one draw.
// `updateGates` allocates nothing; `gateHitTest` walks the ~6-entry active
// window, never the level's item list.

import * as THREE from 'three';
import { GATE, EFFECTS, PAL, DEV_MODE } from './config.js';
import { state, squadDps } from './state.js';
import { emit } from './bus.js';
import { clamp, smoothstep, fmt } from './utils.js';
import {
  initSigns, glyphLayer, labelWriter, panelMaterial, faceMaterial, glassMaterial,
  faceQuad, attachCells, panelCellFor, signColorOf, PANEL_CELL, splitLabel,
  cbox, ccone, cmerge,
} from './signs.js';

// MANAGER: one open request, and one finding you asked for.
//
// 1. OPEN — `input.js` steers the wrong way. The camera looks along +Z, so
//    three's lookAt puts screen-right on world -X; `move()` adds a positive drag
//    delta to `state.targetX`, which slides the squad screen-LEFT. Same for the
//    ArrowRight key. Negating `RUN.dragScale`'s sign at the two call sites fixes
//    it. Gate lanes are laid out in world x, so this decides which sign the
//    player thinks they are steering at.
//
// 2. FINDING, no change wanted — `GATE.width` / `GATE.height` are fine as they
//    are, and I am not asking for them to move. Once a label is more than one
//    glyph its size is set by the panel's WIDTH, not its height: three digits
//    have to share the width, and PANEL_W is already 3.45 m against a 3.6 m
//    lane pitch, so the panels of a full row of three nearly touch and cannot
//    grow. Making the panel TALLER would buy nothing — for anything past two
//    glyphs the cap height that comes out of the fit depends only on the width
//    budget and the squeeze floor (see signs.js:fitRun), so a taller sign would
//    give a bigger `+1` and an identical `+360`. The readability at CAM.back 21
//    was bought inside signs.js instead: a digit now fills 62% of the panel
//    height where it filled 43%, because the glyph is sized off its INK rather
//    than off its atlas cell, which was 41% padding.
//
// Both previous requests here are resolved: `approachFade` is now documented as
// the distance the fade finishes by, so the 2.6x spawn multiplier below is the
// intended reading, and game.js maps `army:count {reason:'barrier'}` onto
// killTroops, so bodying a live wall costs men.

// --------------------------------------------------------------------------
// Geometry constants. The panel is deliberately as tall as the whole gate: the
// camera sits 25 m up and pulls back as the squad grows, so a 3 m sign at a row
// 40 m out is only ~45 px tall on a phone. Every centimetre of panel is a pixel
// of number, and the number is the entire point.
// --------------------------------------------------------------------------
const MAX_GATES = 30;            // active window; a row is 2-3, spaced ~50 m
const MAX_GLASS = 14;
const MAX_SHARDS = 96;

const G_W = GATE.width;          // 3.2 nominal; per-gate `w` scales x
const G_H = GATE.height;         // 3.0
// The panel is bigger than `GATE.height`, on purpose. `CAM.perUnit` pulls the
// camera to ~22 m back and 26 m up once the squad is 80 strong, which puts a
// gate 26 m ahead a full 54 m from the lens. A 3 m sign there is 45 px tall on
// a phone and its number is 25 px — under the readability bar. Sizing the panel
// off the LANE PITCH instead (lanes are 3.6 m apart, so 3.45 wide nearly
// touches its neighbour, exactly as in the reference) and running it to 3.3 m
// tall is what buys the number back.
// Both still scale off config, so a balance pass on GATE.width/height moves the
// art with it — they are just multiplied up rather than used raw.
const PANEL_W = G_W * 1.08;      // 3.45 on a 3.6 m lane pitch: panels nearly touch
const PANEL_H = G_H * 1.10;      // 3.30
const SILL_H = 0.42;
const PANEL_Y = SILL_H + PANEL_H / 2;
const POST_H = SILL_H + PANEL_H + 0.22;
const TILT = 0.10;               // radians leaned back, so the high camera gets
                                 // a squarer look at the face
const FACE_Z = -0.13;            // toward the camera, clear of the backboard

const FADE_START = GATE.approachFade * 2.6;   // see MANAGER note 2
const POP_M = 12;                // metres over which a gate scales up
const BURST_T = 0.42;            // resolve animation, seconds
const DESPAWN_BEHIND = 5;

// Hit and pass-through both use the PAINTED width, not the LevelDef's `w`. What
// the player aims at and steers into is the coloured panel they can see; a
// hitbox that disagrees with the art is the single most infuriating bug this
// genre has.
const halfW = (g) => PANEL_W * 0.5 * (g.w / G_W);

// --------------------------------------------------------------------------
// Module state
// --------------------------------------------------------------------------
let sceneRef = null;
// What a pane of glass is worth right now. Sampled at spawn rather than every
// frame: a gate that got tougher while you were shooting it would be unreadable,
// and a row spawned together should be internally consistent.
function glassHpNow() {
  return Math.max(GATE.glassHp, squadDps() * GATE.glassSeconds);
}

let frameMesh = null, faceMesh = null, glassMesh = null, shardMesh = null;
let faceCells = null, glassCells = null;
let frameArr = null, faceArr = null, glassArr = null, shardArr = null;
let labels = null;

let defs = [], nextDef = 0, prevZ = 0;
const active = [];               // live gates, ascending z
const pool = [];                 // recycled gate objects

// Debris, in typed arrays so a shattering gate costs no garbage.
const sh = {
  x: new Float32Array(MAX_SHARDS), y: new Float32Array(MAX_SHARDS), z: new Float32Array(MAX_SHARDS),
  vx: new Float32Array(MAX_SHARDS), vy: new Float32Array(MAX_SHARDS), vz: new Float32Array(MAX_SHARDS),
  rx: new Float32Array(MAX_SHARDS), ry: new Float32Array(MAX_SHARDS),
  wx: new Float32Array(MAX_SHARDS), wy: new Float32Array(MAX_SHARDS),
  s: new Float32Array(MAX_SHARDS), life: new Float32Array(MAX_SHARDS),
  // Per-shard aspect on the one shared box. A panel chunk is a chunk; a glass
  // shard is a sliver. See SHARD_KIND.
  ax: new Float32Array(MAX_SHARDS), ay: new Float32Array(MAX_SHARDS), az: new Float32Array(MAX_SHARDS),
};
// Hoisted: a literal here would allocate an array every time a shard expires.
const SH_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rx', 'ry', 'wx', 'wy', 's', 'life',
  'ax', 'ay', 'az'];

// Two debris profiles out of one pool, one geometry and one draw call.
//
// `panel` is the payoff when you run a gate down: fat chunks of the sign in the
// sign's own blue or red, thrown at you.
//
// `glass` used to be the same profile in PAL.glass, and that is the bug this
// splits. The base box is 0.34 m and `panel` scales it up to 2.1x, so a shard
// came out a 0.7 m cube — the size of a soldier's torso — in the one hue on the
// road that is the exact complement of the enemy red, and it bounced and lay
// about for over a second at ground level. Read at 60 m through fog, a handful
// of them standing in front of a red block are not debris, they are cyan men.
// Nothing was mistinting the crowd; the crowd was fine. Glass now shatters like
// glass: thin slivers, roughly a hand's width, gone in half the time, and more
// of them so the break still reads as a break.
const SHARD_KIND = {
  panel: { n: 14, s0: 1.00, s1: 2.10, ax: 1, ay: 1, az: 1, life0: 0.85, life1: 1.20, spin: 14, up: 2.4 },
  // Longest edge 0.43 m against a 1.7 m soldier: a quarter of a man, so a shard
  // is ~7 screen px where a body in the same block is ~30. That is the number
  // the old profile got wrong, not the hue.
  glass: { n: 20, s0: 0.65, s1: 1.25, ax: 0.42, ay: 1.00, az: 0.30, life0: 0.42, life1: 0.66, spin: 22, up: 3.0 },
};
let shCount = 0;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _col = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

// --------------------------------------------------------------------------
// Build
// --------------------------------------------------------------------------

// One gate frame: a wooden sill, a wooden backboard behind the sign, two steel
// posts with the pointed caps and rivets from the reference. Vertex-coloured
// and merged so all of it is a single instanced draw.
function buildFrame() {
  const parts = [];
  const px = PANEL_W / 2 + 0.12;

  // A thin wooden sill with a steel cap. In the reference the wood is a band
  // under the sign, not a picture frame around it — the coloured panel is
  // supposed to be almost all of what you see.
  parts.push(cbox(PANEL_W + 0.24, SILL_H, 0.40, 0, SILL_H / 2, 0, PAL.wood));
  parts.push(cbox(PANEL_W + 0.30, 0.12, 0.46, 0, SILL_H, 0, PAL.steel));

  // backboard, tilted with the sign so the two never separate
  const board = cbox(PANEL_W + 0.16, PANEL_H + 0.14, 0.18, 0, 0, 0, PAL.woodDark);
  board.rotateX(TILT); board.translate(0, PANEL_Y, 0.06);
  parts.push(board);

  for (const s of [-1, 1]) {
    parts.push(cbox(0.34, POST_H, 0.46, s * px, POST_H / 2, 0, PAL.steel));
    parts.push(ccone(0.30, 0.52, s * px, POST_H + 0.26, 0, PAL.steel));
    for (let i = 0; i < 4; i++) {
      parts.push(cbox(0.095, 0.095, 0.095, s * px, 0.60 + i * 0.86, -0.25, PAL.signStroke));
    }
  }
  return cmerge(parts);
}

function buildShard() {
  const g = new THREE.BoxGeometry(0.34, 0.34, 0.11);
  return g;
}

export function initGates(ctx) {
  if (!ctx?.scene) return null;
  sceneRef = ctx.scene;
  initSigns();

  const frameGeo = buildFrame();
  frameMesh = new THREE.InstancedMesh(frameGeo, panelMaterial('wood'), MAX_GATES);
  frameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  frameMesh.frustumCulled = false;
  frameMesh.castShadow = !!ctx.quality?.shadows;
  frameMesh.receiveShadow = false;
  frameMesh.count = 0;
  frameArr = frameMesh.instanceMatrix.array;

  const fg = faceQuad();
  faceCells = attachCells(fg, MAX_GATES);
  faceMesh = new THREE.InstancedMesh(fg, faceMaterial(), MAX_GATES);
  faceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  faceMesh.frustumCulled = false;
  faceMesh.count = 0;
  faceArr = faceMesh.instanceMatrix.array;

  const gg = faceQuad();
  glassCells = attachCells(gg, MAX_GLASS);
  glassMesh = new THREE.InstancedMesh(gg, glassMaterial(), MAX_GLASS);
  glassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glassMesh.frustumCulled = false;
  glassMesh.renderOrder = 5;      // under the glyphs, over everything opaque
  glassMesh.count = 0;
  glassArr = glassMesh.instanceMatrix.array;
  // A glass pane is drawn neutral and tinted here, so a `+50` pane and a `-30`
  // pane are still blue and red. Glass changes the VERB, never the tell.
  glassMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLASS * 3).fill(1), 3);
  glassMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  shardMesh = new THREE.InstancedMesh(
    buildShard(),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    MAX_SHARDS
  );
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shardMesh.frustumCulled = false;
  shardMesh.count = 0;
  shardArr = shardMesh.instanceMatrix.array;
  // instanceColor so blue panel debris, yellow panel debris and glass shards
  // all come out of one pool and one draw call.
  shardMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 3).fill(1), 3);
  shardMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  sceneRef.add(frameMesh, faceMesh, glassMesh, shardMesh, glyphLayer());
  labels = labelWriter(0);

  if (DEV_MODE) window.__hbGates = { active, gateChoices, defs: () => defs };
  return frameMesh;
}

// --------------------------------------------------------------------------
// Gate objects
// --------------------------------------------------------------------------
function newGate() {
  const g = {
    def: null, z: 0, x: 0, w: G_W, panel: 'wood', grow: false,
    type: 'troops', value: 0, base: 0, action: null,
    hp: 0, hpMax: 1, cell: 0,
    scale: 0, taken: false, dead: false, burst: -1, pressed: false,
    big: '', small: '', shown: '', tint: [1, 1, 1],
    // combat.js holds a bullet and calls this. Aliases because the other agent
    // is writing to the same contract from the other side and one of us will
    // reach for `damage()`; all three are the same call.
    hit: null, damage: null, applyDamage: null,
  };
  g.hit = (d) => hitGate(g, d);
  g.damage = g.hit;
  g.applyDamage = g.hit;
  return g;
}

function acquire(def) {
  const g = pool.pop() || newGate();
  g.def = def;
  g.z = def.z; g.x = def.x ?? 0; g.w = def.w || G_W;
  g.panel = def.panel || 'wood';
  g.type = def.effect?.type || 'troops';
  g.value = def.effect?.value ?? 0;
  g.base = Math.max(1, g.value);
  g.action = def.action || null;
  // A gate grows if the level says so AND the effect table allows it AND it is
  // not glass. Glass is the fixed-price option — that is what it is *for*.
  g.grow = !!def.grow && g.panel !== 'glass' && (EFFECTS[g.type]?.grow !== false);
  // Glass is priced in seconds of the squad's fire (see GATE.glassSeconds).
  // A level may still pin an explicit `hp` when it wants a specific pane to be
  // a set-piece rather than a choice.
  g.hpMax = def.hp || (g.panel === 'glass' ? glassHpNow() : GATE.glassHp);
  g.hp = g.hpMax;
  g.cell = g.panel === 'button' ? PANEL_CELL.button
    : g.panel === 'glass' ? PANEL_CELL.glass0
    : panelCellFor(g.type);
  g.scale = 0; g.taken = false; g.dead = false; g.burst = -1; g.pressed = false;
  g.shown = '';
  // Tint sits between white and the sign colour: full saturation kills the
  // sheen and the pane stops reading as glass.
  _col.set(signColorOf(g.type)).lerp(WHITE, 0.18);
  g.tint[0] = _col.r; g.tint[1] = _col.g; g.tint[2] = _col.b;
  relabel(g);
  active.push(g);
  return g;
}

// Order-preserving remove without `splice`, which returns a fresh array and so
// allocates on every despawn — and despawns happen inside updateGates.
function release(g) {
  const i = active.indexOf(g);
  if (i >= 0) {
    for (let j = i; j < active.length - 1; j++) active[j] = active[j + 1];
    active.length--;
  }
  g.def = null;
  if (pool.length < MAX_GATES) pool.push(g);
}

// The whole live-update path: format, split, and bail if the *displayed* string
// has not changed. A gate under sustained fire climbs 60 times a second but only
// changes its rendered text a few dozen times, and even then it is six floats.
function relabel(g) {
  const f = EFFECTS[g.type]?.fmt;
  const text = f ? f(g.value >= 1000 ? fmt(g.value) : Math.round(g.value)) : String(Math.round(g.value));
  if (text === g.shown) return false;
  g.shown = text;
  const sp = splitLabel(text);
  g.big = sp.big; g.small = sp.small;
  return true;
}

// --------------------------------------------------------------------------
// Damage — the three verbs
// --------------------------------------------------------------------------
function hitGate(g, damage = 1) {
  if (!g || g.dead || g.taken) return false;
  emit('gate:hit', { gate: g, damage });

  if (g.panel === 'button') {
    if (g.pressed) return false;
    g.pressed = true;
    emit('gate:press', { gate: g, action: g.action });
    emit('fx:explosion', { pos: { x: g.x, y: PANEL_Y, z: g.z }, scale: 0.8, color: PAL.enemy });
    emit('fx:shake', { amount: 0.18 });
    burst(g, PAL.enemy);
    return true;
  }

  if (g.panel === 'glass') {
    g.hp -= damage;
    // Crack stage is read straight off remaining hp, so the panel itself is the
    // health bar. Four stages is enough to feel "one more burst".
    const st = clamp(3 - Math.floor((g.hp / g.hpMax) * 4), 0, 3);
    g.cell = PANEL_CELL['glass' + st];
    if (g.hp <= 0) {
      g.dead = true;
      emit('gate:break', { gate: g });
      emit('fx:explosion', { pos: { x: g.x, y: PANEL_Y, z: g.z }, scale: 1.0, color: PAL.glass });
      emit('fx:shake', { amount: 0.22 });
      shatter(g, PAL.glass, 'glass');
    }
    return true;
  }

  if (!g.grow) return false;      // a wood trap is not negotiable either

  // FIREPOWER has to be visible on the sign. Growth used to count HITS and
  // ignore damage, which made the damage upgrade completely inert through the
  // opening chapter — there is nothing to shoot but gates there, so the player
  // bought the upgrade that sounds most important and watched nothing change.
  //
  // It is deliberately not fully proportional: at 1.0 a late-game gun would
  // slam every gate into `growMax` in a fraction of a second and the choice of
  // WHERE to point it would stop mattering. `growDmgScale` 0.85 keeps a better
  // gun visibly faster on the number while leaving the cap worth aiming for.
  const mul = 1 + (state.dmgMul - 1) * GATE.growDmgScale;
  const cap = g.base * GATE.growMax;
  if (g.value >= cap) return false;
  g.value = Math.min(cap, g.value + (GATE.growFlat + g.value * GATE.growPerHit) * mul);
  relabel(g);
  emit('gate:grow', { gate: g, value: g.value });
  return true;
}

// --------------------------------------------------------------------------
// Resolve
// --------------------------------------------------------------------------
function resolve(g) {
  g.taken = true;
  g.burst = 0;
  const effect = { type: g.type, value: g.type === 'mult' ? g.value : Math.round(g.value) };
  emit('gate:pass', { gate: g, effect });

  const good = EFFECTS[g.type]?.good !== false;
  const color = good ? PAL.signBlue : PAL.signRed;
  emit('fx:number', { pos: { x: g.x, y: PANEL_Y + 0.6, z: g.z }, text: g.shown, color });
  emit('fx:explosion', { pos: { x: g.x, y: PANEL_Y, z: g.z }, scale: good ? 1.1 : 0.9, color });
  emit('fx:shake', { amount: good ? 0.14 : 0.26 });
  burst(g, color);
}

// The panel bursts apart while the sign flies up — that half second is the
// payoff for the two seconds of choosing that preceded it.
function burst(g, color) {
  shatter(g, color, 'panel');
}

function shatter(g, color, kind) {
  const p = SHARD_KIND[kind] || SHARD_KIND.panel;
  const n = p.n;
  _col.set(color);
  for (let i = 0; i < n && shCount < MAX_SHARDS; i++) {
    const k = shCount++;
    const a = (i / n) * Math.PI * 2;
    sh.x[k] = g.x + Math.cos(a) * 0.7 * (g.w / G_W);
    sh.y[k] = PANEL_Y + Math.sin(a) * 0.9;
    sh.z[k] = g.z + FACE_Z;
    sh.vx[k] = Math.cos(a) * 4.2 + (Math.random() - 0.5);
    sh.vy[k] = p.up + Math.random() * 4.4;
    sh.vz[k] = -2.2 - Math.random() * 2.6;      // toward the camera; it reads
    sh.rx[k] = Math.random() * 6.28; sh.ry[k] = Math.random() * 6.28;
    sh.wx[k] = (Math.random() - 0.5) * p.spin; sh.wy[k] = (Math.random() - 0.5) * p.spin;
    sh.s[k] = p.s0 + Math.random() * (p.s1 - p.s0);
    sh.life[k] = p.life0 + Math.random() * (p.life1 - p.life0);
    sh.ax[k] = p.ax; sh.ay[k] = p.ay; sh.az[k] = p.az;
    shardMesh.instanceColor.array[k * 3] = _col.r;
    shardMesh.instanceColor.array[k * 3 + 1] = _col.g;
    shardMesh.instanceColor.array[k * 3 + 2] = _col.b;
  }
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------
export function resetGates(level) {
  if (!frameMesh) return null;
  for (let i = active.length - 1; i >= 0; i--) release(active[i]);
  active.length = 0;
  defs = (level?.items || []).filter((it) => it.kind === 'gate');
  nextDef = 0;
  prevZ = 0;
  shCount = 0;
  frameMesh.count = faceMesh.count = glassMesh.count = shardMesh.count = 0;
  return defs.length;
}

export function updateGates(dt) {
  if (!frameMesh) return null;

  const z = state.z;

  // Spawn. `defs` is sorted by z, so this is a pointer walk, never a scan.
  while (nextDef < defs.length && defs[nextDef].z - z <= FADE_START) {
    if (active.length >= MAX_GATES) break;
    acquire(defs[nextDef++]);
  }

  // Pass-through, resolved per ROW rather than per gate. Panels are 3.45 m wide
  // on a 3.6 m lane pitch, so butting them up leaves a 15 cm dead gap between
  // neighbours — a player sitting in it takes nothing, which reads as a bug and
  // not as a decision. Overlapping the catch zones and giving the row to the
  // NEAREST gate fixes that without ever resolving two gates at once. Straddling
  // still resolves on the leader only: that is what makes a row a commitment.
  // Rows are ≥40 m apart and dt is clamped to 0.05 s, so two rows can never
  // cross in the same frame.
  let picked = null, pickD = Infinity;
  for (let i = 0; i < active.length; i++) {
    const g = active[i];
    if (g.taken || g.dead || g.z > z || g.z <= prevZ) continue;
    const dx = Math.abs(state.x - g.x);
    if (dx > halfW(g) + 0.45) continue;
    if (dx < pickD) { pickD = dx; picked = g; }
  }
  if (picked) resolve(picked);

  labels.begin();
  let nFrame = 0, nFace = 0, nGlass = 0;

  for (let i = active.length - 1; i >= 0; i--) {
    const g = active[i];
    const d = g.z - z;

    if (g.burst >= 0) {
      g.burst += dt;
      if (g.burst >= BURST_T) { release(g); continue; }
    } else if (g.dead || d < -DESPAWN_BEHIND) {
      release(g);                 // missed, or shot out; no payoff either way
      continue;
    }

    // Pop-in. Scale, not opacity: one shared material means there is no
    // per-instance alpha, and a sign that grows out of the fog reads better
    // than one that ghosts in anyway.
    const t = clamp((FADE_START - d) / POP_M, 0, 1);
    let s = 0.18 + 0.82 * smoothstep(t);
    let rise = 0, zOff = 0, tiltA = TILT;

    if (g.burst >= 0) {
      // The sign flies up and tips over while the panel scales out. This half
      // second is the payoff for the two seconds of choosing that preceded it.
      const b = g.burst / BURST_T;
      rise = b * b * 7.0;
      zOff = -b * 1.8;
      tiltA = TILT + b * 1.6;
      s *= (1 + b * 0.4) * Math.max(0, 1 - b * 1.1);
    }

    const sx = (g.w / G_W) * s;
    const tc = Math.cos(tiltA), ts = Math.sin(tiltA);

    // The frame collapses in the first third of the burst while the sign is
    // still climbing. Snapping it away the instant the gate resolves leaves the
    // sign hanging in mid-air with nothing under it, which reads as a glitch.
    const fk = g.burst < 0 ? 1 : Math.max(0, 1 - (g.burst / BURST_T) * 3.2);
    if (fk > 0) writeScaled(frameArr, nFrame++ * 16, sx * fk, s * fk, s * fk, g.x, 0, g.z);

    const fw = PANEL_W * sx, fh = PANEL_H * s;
    const fy = PANEL_Y * s + rise;
    const fz = g.z + FACE_Z * s + zOff;

    if (g.panel === 'glass') {
      if (nGlass >= MAX_GLASS) continue;
      writeTilted(glassArr, nGlass * 16, fw, fh, tc, ts, g.x, fy, fz);
      glassCells.array[nGlass] = g.cell;
      const gc = glassMesh.instanceColor.array;
      gc[nGlass * 3] = g.tint[0]; gc[nGlass * 3 + 1] = g.tint[1]; gc[nGlass * 3 + 2] = g.tint[2];
      nGlass++;
    } else {
      writeTilted(faceArr, nFace * 16, fw, fh, tc, ts, g.x, fy, fz);
      faceCells.array[nFace++] = g.cell;
    }

    // Button plates carry no number — the plunger IS the label.
    if (g.panel !== 'button' && s > 0.02) {
      labels.label(g.big, g.small, g.x, fy, fz - 0.07, fw, fh, tiltA);
    }
  }

  labels.end();

  frameMesh.count = nFrame;
  faceMesh.count = nFace;
  glassMesh.count = nGlass;
  frameMesh.instanceMatrix.needsUpdate = true;
  faceMesh.instanceMatrix.needsUpdate = true;
  glassMesh.instanceMatrix.needsUpdate = true;
  glassMesh.instanceColor.needsUpdate = true;
  faceCells.needsUpdate = true;
  glassCells.needsUpdate = true;

  updateShards(dt);
  prevZ = z;
  return active.length;
}

function updateShards(dt) {
  for (let i = shCount - 1; i >= 0; i--) {
    sh.life[i] -= dt;
    if (sh.life[i] <= 0) {
      const last = --shCount;
      if (i !== last) {
        for (let f = 0; f < SH_FIELDS.length; f++) { const a = sh[SH_FIELDS[f]]; a[i] = a[last]; }
        const c = shardMesh.instanceColor.array;
        c[i * 3] = c[last * 3]; c[i * 3 + 1] = c[last * 3 + 1]; c[i * 3 + 2] = c[last * 3 + 2];
      }
      continue;
    }
    sh.vy[i] -= 20 * dt;
    sh.x[i] += sh.vx[i] * dt; sh.y[i] += sh.vy[i] * dt; sh.z[i] += sh.vz[i] * dt;
    sh.rx[i] += sh.wx[i] * dt; sh.ry[i] += sh.wy[i] * dt;
    if (sh.y[i] < 0.1) { sh.y[i] = 0.1; sh.vy[i] *= -0.32; sh.vx[i] *= 0.6; sh.vz[i] *= 0.6; }
    _v.set(sh.x[i], sh.y[i], sh.z[i]);
    _q.setFromEuler(_e.set(sh.rx[i], sh.ry[i], 0));
    const k = sh.s[i] * Math.min(1, sh.life[i] * 3);
    _s.set(k * sh.ax[i], k * sh.ay[i], k * sh.az[i]);
    _m.compose(_v, _q, _s);
    _m.toArray(shardArr, i * 16);
  }
  shardMesh.count = shCount;
  shardMesh.instanceMatrix.needsUpdate = true;
  shardMesh.instanceColor.needsUpdate = true;
}

// Column-major writes by hand. A Matrix4 compose per gate per frame is not free
// once a row of three is on screen with its glyphs and its debris.
function writeScaled(arr, o, sx, sy, sz, x, y, z) {
  arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

// rotX(tilt) * scale(w, h, 1)
function writeTilted(arr, o, w, h, c, s, x, y, z) {
  arr[o] = w; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = c * h; arr[o + 6] = s * h; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = -s; arr[o + 10] = c; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

/**
 * Bullet vs gate. Called for every live bullet every frame, so it walks the
 * active window (≈2-6 gates) and nothing else — no scan of the level's items,
 * no allocation, no early sort. Returns the gate or null; the caller then calls
 * `gate.hit(damage)`.
 *
 * Only gates that *respond* are returned. A wood trap is scenery to a bullet, so
 * shots pass through it to the enemy behind — you cannot shoot your way out of a
 * red panel, only steer around it.
 */
export function gateHitTest(x, y, z, r = 0.3) {
  for (let i = 0; i < active.length; i++) {
    const g = active[i];
    if (g.taken || g.dead || g.burst >= 0) continue;
    if (!(g.grow || g.panel === 'glass' || (g.panel === 'button' && !g.pressed))) continue;
    const dz = z - g.z;
    if (dz < -r - 0.5 || dz > r + 0.5) continue;
    if (Math.abs(x - g.x) > halfW(g) + r) continue;
    if (y > POST_H + r) continue;
    return g;
  }
  return null;
}

// How good a gate is, in units of "men this is worth right now". `mult` and
// `divide` scale with the squad, which is why a x2 early is worth almost
// nothing and a ÷2 late is a disaster.
function scoreOf(g) {
  const v = g.value;
  switch (g.type) {
    case 'troops': return v;
    case 'mult': return state.troops * (v - 1);
    case 'tier': return 30 + state.troops * 0.15;
    case 'weapon': return v * 22;
    case 'cash': return v * 0.35;
    case 'shield': return v * 0.9;
    case 'power': return 18;
    case 'loss': return -v * 1.6;
    case 'divide': return -state.troops * (1 - 1 / Math.max(1.01, v));
    default: return 0;
  }
}

// Pooled result rows: game.js calls this every frame through the AI thumb.
const _choices = [];
for (let i = 0; i < 4; i++) _choices.push({ x: 0, score: 0, effect: null, gate: null });
const _out = [];

/**
 * The gates in the next window, scored. The AI thumb steers by this and it
 * doubles as a design check: if there is no positive score in a row, the level
 * is offering the player a choice between bad and worse.
 */
export function gateChoices(z) {
  _out.length = 0;
  // nearest un-taken row ahead
  let rowZ = Infinity;
  for (let i = 0; i < active.length; i++) {
    const g = active[i];
    if (g.taken || g.dead || g.burst >= 0) continue;
    if (g.z > z && g.z < rowZ) rowZ = g.z;
  }
  if (rowZ === Infinity) return _out;
  let n = 0;
  for (let i = 0; i < active.length && n < _choices.length; i++) {
    const g = active[i];
    if (g.taken || g.dead || g.burst >= 0) continue;
    if (Math.abs(g.z - rowZ) > 1.5) continue;
    const c = _choices[n++];
    c.x = g.x;
    c.score = scoreOf(g);
    c.effect = g.def?.effect || null;
    c.gate = g;
    _out.push(c);
  }
  return _out;
}

export function disposeGates() {
  if (!frameMesh) return;
  for (const m of [frameMesh, faceMesh, glassMesh, shardMesh]) {
    m.parent?.remove(m);
    m.geometry.dispose();
    m.dispose();
  }
  shardMesh.material.dispose();
  frameMesh = faceMesh = glassMesh = shardMesh = null;
  active.length = 0; pool.length = 0; defs = [];
}
