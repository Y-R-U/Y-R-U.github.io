// The world object (CONTRACTS §4). Nothing else constructs one. Never touches the DOM.

import { makeRng } from '../core/rng.js';
import { CAM, PHYS, ECON, COMBAT } from '../data/tuning.js';
import { clamp, damp } from '../core/math.js';
import { makeTerrain } from './terrain.js';
import { makePlayer } from './plane.js';
import { BEHAVIOUR } from './behaviour.js';
import { stepProjectiles } from './projectiles.js';
import { fire } from './weapons.js';
import { makeSpawner } from './spawn.js';
import { makeMission } from './mission.js';
import { makeLanding } from './landing.js';
import { killEnt } from './damage.js';

export const DT = 1 / 60;

const DEFAULT_SAVE = { planeId: 'kestrel', upgrades: {}, loadout: ['bomb_std', 'rocket', null, null] };

export function createWorld({ level, seed, save }) {
  const sd = (seed ?? level.seed) >>> 0;
  const sv = { ...DEFAULT_SAVE, ...(save || {}) };
  if (!sv.loadout) sv.loadout = DEFAULT_SAVE.loadout;

  let idc = 1;
  const world = {
    t: 0, frame: 0,
    rng: makeRng(sd ^ 0x5bf03635),
    seed: sd,
    level,
    terrain: makeTerrain(level, makeRng(sd)),
    cam: {
      x: 0, y: CAM.baseY, vw: 1600, vh: CAM.vh, scale: 1,
      shakeX: 0, shakeY: 0, shakeMag: 0, screenW: 1600, screenH: 900,
    },
    player: null,
    ents: [], projs: [], debris: [], events: [],
    mission: null, spawner: null, landing: null,
    stats: { kills: {}, money: 0, shots: 0, hits: 0, collected: 0, time: 0, damageTaken: 0, hurtBy: {} },
    over: null,
    results: null,
    // Live camera tuning (manager: Aaron expects to retune the climb-and-follow by
    // hand). stepCamera reads THIS, never CAM directly, so a slider is enough.
    camTune: { ...CAM },
    // presentation inputs, written by main.js before step()
    stick: { active: false, ax: 0, ay: 0, sx: 0, sy: 0 },
    slots: [false, false, false, false],
    autofire: true,
    loadout: sv.loadout,
    save: sv,

    nextId: () => idc++,
    push: (ev) => { world.events.push(ev); },
    drainEvents() { const e = world.events; world.events = []; return e; },

    setViewport(w, h) {
      const c = world.cam;
      c.screenW = w; c.screenH = h;
      c.vw = clamp(CAM.vh * (w / h), CAM.vwMin, CAM.vwMax);
      c.scale = h / CAM.vh;
    },

    setStickAngle(a) {
      const s = world.stick;
      s.active = true; s.ax = 0; s.ay = 0;
      s.sx = Math.cos(a) * 60; s.sy = -Math.sin(a) * 60;
    },
    releaseStick() { world.stick.active = false; },

    fireSlot(i) {
      const p = world.player;
      if (!p || p.dead || p.landed || p.script) return false;
      const id = p.loadout[i];
      return id ? fire(world, p, id) : false;
    },

    takeOff() { return world.landing.takeOff(world.player); },

    crashPlayer() {
      const p = world.player;
      if (!p || p.dead) return;
      p.dead = true;
      world.push({ e: 'explode', x: p.x, y: p.y, r: 220, big: true, kind: 'player' });
      world.deathCause = p.y - 14 <= world.terrain.heightAt(p.x) + 1 ? 'terrain' : 'shot down';
      world.push({ e: 'shake', mag: 1.2 });
      world.push({ e: 'haptic', pattern: 'boom' });
      if (!world.over) { world.over = 'dead'; world.finish(); }
    },

    win() {
      if (world.over) return;
      world.over = 'win';
      world.stats.money += (level.reward && level.reward.money) || 0;
      world.push({ e: 'ui', what: 'win' });
      world.finish();
    },

    finish() {
      const par = level.par || 120;
      const f = world.t / par;
      const stars = world.over !== 'win' ? 0 : f <= ECON.starTimes[0] ? 3 : f <= ECON.starTimes[1] ? 2 : 1;
      world.results = {
        outcome: world.over,
        levelId: level.id,
        kills: { ...world.stats.kills },
        money: Math.round(world.stats.money),
        time: world.t,
        stars,
        shots: world.stats.shots,
        hits: world.stats.hits,
        accuracy: world.stats.shots ? world.stats.hits / world.stats.shots : 0,
        collected: world.stats.collected,
        objectives: world.mission.objectives.map((o) => ({ label: o.label, have: Math.round(o.have * 10) / 10, need: o.need, done: o.done })),
      };
      world.push({ e: 'ui', what: 'results', results: world.results });
    },

    step() {
      const dt = DT;
      world.frame++;
      if (world.over) { stepCamera(world, dt); stepShake(world, dt); return; }
      world.t += dt;
      world.stats.time = world.t;

      world.spawner.step();

      const p = world.player;
      const ents = world.ents;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.dead) continue;
        const b = BEHAVIOUR[e.kind];
        if (b) b(e, world, dt);
      }

      if (p && !p.dead && !p.landed && !p.script) {
        if (world.autofire) fire(world, p, p.def.mainGun);
        for (let i = 0; i < 4; i++) if (world.slots[i]) world.fireSlot(i);
        world.landing.check(p);
      }

      stepProjectiles(world, dt);
      stepDebris(world, dt);

      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        if (e === p) continue;
        if (e.dead || e.despawn) ents.splice(i, 1);
      }

      stepCamera(world, dt);
      stepShake(world, dt);
      world.mission.step(world, dt);
      if ((world.frame & 7) === 0) world.mission.tag(world);
    },
  };

  world.player = makePlayer(world, sv);
  world.ents.push(world.player);
  world.mission = makeMission(world);
  world.landing = makeLanding(world);
  world.spawner = makeSpawner(world);
  world.player.y = Math.max(620, world.terrain.heightAt(world.player.x) + 420);
  world.setViewport(1600, 900);
  stepCamera(world, 1);
  world.cam.x = clamp(world.player.x - world.cam.vw * CAM.anchorX, 0, Math.max(0, level.length - world.cam.vw));
  return world;
}

function stepCamera(world, dt) {
  const c = world.cam, p = world.player, L = world.level.length, T = world.camTune;
  if (!p) return;
  const tx = p.x - c.vw * T.anchorX + p.vx * T.lookahead;
  c.x = damp(c.x, clamp(tx, 0, Math.max(0, L - c.vw)), T.lerpX, dt);
  c.x = clamp(c.x, 0, Math.max(0, L - c.vw));

  const bandY = c.y + c.vh * (1 - T.topBand);
  const ty = p.y > bandY ? p.y - c.vh * (1 - T.topBand) : T.baseY;
  c.y = damp(c.y, ty, ty > c.y ? T.lerpUp : T.lerpDown, dt);
  if (c.y < T.baseY) c.y = T.baseY;
}

function stepShake(world, dt) {
  const c = world.cam;
  let add = 0;
  for (const ev of world.events) if (ev.e === 'shake') add += ev.mag;
  if (add) c.shakeMag = Math.min(CAM.shakeMax, c.shakeMag + add * CAM.shakeMax * 0.55);
  c.shakeMag = Math.max(0, c.shakeMag - CAM.shakeDecay * CAM.shakeMax * 0.06 - c.shakeMag * CAM.shakeDecay * dt);
  const m = c.shakeMag;
  c.shakeX = m ? (world.rng.f() * 2 - 1) * m : 0;
  c.shakeY = m ? (world.rng.f() * 2 - 1) * m : 0;
}

function stepDebris(world, dt) {
  const d = world.debris;
  for (let i = d.length - 1; i >= 0; i--) {
    const b = d[i];
    b.ttl -= dt;
    if (b.ttl <= 0) { d.splice(i, 1); continue; }
    if (b.rest) continue;
    b.vy -= 1300 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.ang += b.av * dt;
    const g = world.terrain.heightAt(b.x) + b.s * 0.4;
    if (b.y < g) {
      b.y = g;
      if (Math.abs(b.vy) < 60) { b.rest = true; b.vx = 0; b.vy = 0; b.av = 0; }
      else { b.vy = -b.vy * 0.35; b.vx *= 0.6; b.av *= 0.5; }
    }
  }
}

export { killEnt, PHYS, COMBAT };
