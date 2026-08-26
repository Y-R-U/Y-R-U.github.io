// A fake `world` matching CONTRACTS §4/§5/§6 exactly, so the renderer can be built and looked at
// without waiting for the engine. It uses the REAL sim terrain (DOM-free, node-runnable) so the
// ground the lab shows is the ground the game will show.

import { makeRng } from '../../js/core/rng.js';
import { makeTerrain } from '../../js/sim/terrain.js';
import { ENEMIES } from '../../js/data/enemies.js';
import { PLANES } from '../../js/data/planes.js';
import { CAM } from '../../js/data/tuning.js';

const GROUND_MIX = ['hut', 'hut', 'bunker', 'depot', 'tank', 'radar', 'factory', 'railyard', 'truck', 'tower'];
const FLAK_MIX = ['flakLight', 'flakHeavy', 'sam'];
const AIR_MIX = ['scout', 'ju87', 'bf109', 'bomber'];

let nextId = 1;

export function makeFakeWorld({ biome = 'farmland', tod = 'dawn', weather = 'clear', seed = 1234, planeId = 'kestrel' } = {}) {
  const level = { id: 'lab', act: 1, name: 'Lab', biome, timeOfDay: tod, weather, length: 30000, seed };
  const rng = makeRng(seed);
  const terrain = makeTerrain(level, rng);
  const planeDef = PLANES.find((p) => p.id === planeId) || PLANES[0];

  const player = {
    id: nextId++, kind: 'player', def: planeDef,
    x: 3000, y: 320, vx: planeDef.cruise, vy: 0, ang: 0,
    hp: planeDef.hp, hpMax: planeDef.hp, team: 0,
    w: planeDef.len / 2, h: 18, r: planeDef.len / 2, dead: false, t: 0,
  };

  const ents = [player];
  const R = makeRng(seed ^ 0x5eed);

  for (let x = 1600; x < 26000; x += 380 + R.f() * 620) {
    const r = R.f();
    let id;
    if (r < 0.12) id = R.pick(FLAK_MIX);
    else if (r < 0.20) id = 'balloon';
    else id = R.pick(GROUND_MIX);
    const d = ENEMIES[id];
    if (!d) continue;
    const y = d.kind === 'balloon' ? 380 + R.f() * 520 : terrain.heightAt(x) + d.h;
    ents.push({
      id: nextId++, kind: d.kind, def: d, x, y, vx: 0, vy: 0, ang: 0,
      hp: d.hp * (0.35 + R.f() * 0.65), hpMax: d.hp, team: 1,
      w: d.w, h: d.h, r: Math.max(d.w, d.h), dead: false, t: 0,
    });
  }

  for (let i = 0; i < 8; i++) {
    const id = AIR_MIX[i % AIR_MIX.length];
    const d = ENEMIES[id];
    ents.push({
      id: nextId++, kind: 'fighter', def: d,
      x: 3600 + i * 1500, y: 420 + Math.sin(i) * 220, vx: -d.cruise, vy: 0, ang: Math.PI + Math.sin(i) * 0.3,
      hp: d.hp, hpMax: d.hp, team: 1, w: d.w, h: d.h, r: d.w, dead: false, t: 0, ai: {},
    });
  }

  const padDef = { shape: 'carrier', w: 170, h: 60, name: 'Carrier' };
  ents.push({
    id: nextId++, kind: 'pad', def: padDef, padId: 'carrier',
    x: 9200, y: terrain.heightAt(9200) + 60, vx: 0, vy: 0, ang: 0,
    hp: 1, hpMax: 1, team: 2, w: 170, h: 60, r: 180, dead: false, t: 0,
  });

  const world = {
    t: 0, frame: 0, rng, level, terrain,
    cam: { x: player.x - 1900 * CAM.anchorX, y: CAM.baseY, vw: 1900, vh: CAM.vh, scale: 1, shakeX: 0, shakeY: 0, shakeMag: 0 },
    player, ents, projs: [], debris: [], events: [],
    mission: { objectives: [] }, stats: {}, over: null,
  };

  let fireT = 0, bombT = 0, boomT = 1.2, wobble = 0;

  /** Not the sim — just enough motion to judge the look. */
  world.tick = (dt, ctl = {}) => {
    world.t += dt;
    world.frame++;
    wobble += dt;

    if (!ctl.freeze) {
      player.ang = (ctl.ang !== undefined) ? ctl.ang : Math.sin(wobble * 0.5) * 0.15;
      player.vx = Math.cos(player.ang) * planeDef.cruise;
      player.vy = Math.sin(player.ang) * planeDef.cruise;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      const floor = terrain.heightAt(player.x) + 120;
      if (player.y < floor) { player.y = floor; }
      if (ctl.climb) player.y += ctl.climb * dt;
      player.y = Math.max(floor, Math.min(ctl.ceil || 700, player.y));
      if (player.x > level.length - 3000) player.x = 2000;
    }

    for (const e of ents) {
      if (e.kind === 'fighter') {
        e.x += e.vx * dt;
        e.y += Math.sin(world.t * 1.3 + e.id) * 26 * dt * 6;
        e.ang = Math.PI + Math.sin(world.t * 0.8 + e.id) * 0.25;
        if (e.x < world.cam.x - 2000) e.x = world.cam.x + 3400;
      } else if (e.kind === 'balloon') {
        e.y += Math.sin(world.t * 0.7 + e.id) * 12 * dt;
      }
    }

    // camera, CONTRACTS §3 verbatim
    const vw = world.cam.vw;
    const camXT = player.x - vw * CAM.anchorX + player.vx * CAM.lookahead;
    world.cam.x += (camXT - world.cam.x) * Math.min(1, CAM.lerpX * dt);
    const bandY = world.cam.y + CAM.vh * (1 - CAM.topBand);
    const camYT = player.y > bandY ? player.y - CAM.vh * (1 - CAM.topBand) : CAM.baseY;
    const kY = camYT > world.cam.y ? CAM.lerpUp : CAM.lerpDown;
    world.cam.y += (camYT - world.cam.y) * Math.min(1, kY * dt);
    world.cam.y = Math.max(CAM.baseY, world.cam.y);
    world.cam.shakeMag = Math.max(0, world.cam.shakeMag - dt * CAM.shakeDecay * 10);

    // projectiles
    world.projs = world.projs.filter((p) => {
      p.ttl -= dt;
      if (p.gravity) p.vy -= 1400 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.ttl <= 0 || p.y < terrain.heightAt(p.x)) {
        if (p.kind !== 'bullet') world.events.push({ e: 'explode', x: p.x, y: Math.max(p.y, terrain.heightAt(p.x)), r: p.radius || 150, kind: 'ground' });
        return false;
      }
      return true;
    });

    fireT -= dt;
    if (fireT <= 0 && !ctl.noGuns) {
      fireT = 0.09;
      const a = player.ang;
      world.projs.push({ id: nextId++, kind: 'bullet', x: player.x + Math.cos(a) * 60, y: player.y + Math.sin(a) * 60, vx: Math.cos(a) * 2100 + player.vx, vy: Math.sin(a) * 2100, ang: a, team: 0, dmg: 5, ttl: 0.7, dead: false });
      world.events.push({ e: 'fire', x: player.x + Math.cos(a) * 62, y: player.y + Math.sin(a) * 62, weapon: 'mg', ang: a });
    }

    bombT -= dt;
    if (bombT <= 0 && !ctl.noGuns) {
      bombT = 2.4;
      world.projs.push({ id: nextId++, kind: 'bomb', x: player.x, y: player.y - 20, vx: player.vx * 0.9, vy: -40, ang: 0, team: 0, dmg: 120, ttl: 6, gravity: 1, radius: 190, dead: false });
    }

    boomT -= dt;
    if (boomT <= 0 && !ctl.noBooms) {
      boomT = 1.6 + Math.random() * 1.8;
      const bx = world.cam.x + vw * (0.25 + Math.random() * 0.6);
      const by = terrain.heightAt(bx) + 30 + Math.random() * 60;
      world.events.push({ e: 'explode', x: bx, y: by, r: 90 + Math.random() * 170, kind: 'ground' });
      world.cam.shakeMag = 12;
    }
  };

  world.drainEvents = () => { const e = world.events; world.events = []; return e; };
  return world;
}
