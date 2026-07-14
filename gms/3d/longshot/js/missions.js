// LONGSHOT — the mission engine. Interprets declarative mission defs
// (story.js / events.js) into spawned targets, routines, timers and win/fail
// logic; owns firing, scoring, panic, exposure and the smart-scope feed.

import * as THREE from 'three';
import { simulate, raycast, buildTable, solve } from './ballistics.js';
import { perchReach } from './city.js';
import { BALLISTICS, PANIC, EXPOSURE, SCORE, RIFLES, SCOPES, AMMOS } from './config.js';
import { SUIT_FILES, CIV_FILES, GUARD_FILES } from './people.js';
import { rng, clamp, fmtM } from './utils.js';
import { save } from './save.js';
import * as audio from './audio.js';

const T = THREE;

// the sedan's front wheel, in the car's own frame (it may drive either axis)
export function convoyTyre(cv) {
  return cv.car.position.clone().addScaledVector(cv.axis, 2.0).setY(0.5);
}

// straight line from `eye` to `pt` unblocked by `buildings`?
// `holes` are the carved office rooms. Without them the LOS test calls every
// man-at-a-window BLIND — it sees only the facade AABB — while the ballistics
// happily put a round through the opening and kill him. Two systems disagreeing
// about what you can see is how a target ends up "visible but unmarkable", or a
// fleeing mark picks an escape route it thinks you can't watch.
function losFrom(eye, pt, buildings, holes) {
  const d = { x: pt.x - eye.x, y: pt.y - eye.y, z: pt.z - eye.z };
  const dist = Math.hypot(d.x, d.y, d.z);
  if (dist < 2) return true;
  const rc = raycast(eye, d, { buildings, holes, groundY: -5, max: dist - 1.5 });
  return rc.type === 'none';
}

export class MissionRun {
  constructor(def, ctx) {
    this.def = def;
    this.ctx = ctx;                       // { scene, city, pop, fx, rig, bcam, hud, onEnd }
    this.r = rng((def.seed || def.id) + ':run');
    this.state = 'setup';
    this.score = 0;
    this.shots = 0; this.hits = 0; this.headshots = 0; this.civKills = 0;
    this.longest = 0;
    this.missed = false;
    this.killTimes = [];
    this.streakBest = 0;
    this.time = 0;
    this.timeLimit = def.timeLimit || 0;
    this.exposure = 0;
    this.loudShots = 0;
    this.panicked = false;
    this.targets = [];
    this.plates = [];
    this.chamberT = 0;
    this.reloadT = 0;
    this.identify = null;
    this.special = {};
    this._rfAcc = 0.3;
    this._lowTick = 0;

    // loadout
    const L = save.loadout;
    this.rifle = RIFLES.find(x => x.id === (def.forceRifle || L.rifle)) || RIFLES[0];
    this.scope = SCOPES.find(x => x.id === L.scope) || SCOPES[0];
    this.ammo = AMMOS.find(x => x.id === L.ammo) || AMMOS[0];
    this.gear = save.owned.gear;
    this.ammoLeft = this.rifle.mag;
    this.v0 = this.rifle.v0 * (this.ammo.v0mul || 1);
    this.suppressed = !!this.rifle.suppressed;
    this.table = buildTable({ v0: this.v0 });

    // wind
    const wr = def.wind || [0, 0];
    this.windSpeed = this.r.range(wr[0], wr[1]);
    this.windDir = this.r.range(0, Math.PI * 2);
    this.gusts = !!def.gusts;
    this.windNow = this.windSpeed;
  }

  windVec() {
    return { x: Math.sin(this.windDir) * this.windNow, z: Math.cos(this.windDir) * this.windNow };
  }

  // Everything the HUD should point you at. On an IDENTIFY contract the mark is
  // deliberately NOT listed until you've confirmed it — that's the whole job.
  markerItems() {
    const out = [];
    for (const pl of this.plates) if (!pl.hit) out.push({ pos: pl.c, kind: 'plate' });
    const hideMark = this.identify && !this.identify.confirmed;
    for (const t of this.targets) {
      const p = t.person;
      if (t.dead || t.escaped || !p || !p.alive || p.gone || p.hidden || hideMark) continue;
      out.push({
        pos: p.group.position.clone().add(new T.Vector3(0, 2.05 * p.scale, 0)),
        kind: 'target', label: p.label || null,
      });
    }
    const S = this.special;
    if (S.sniper?.alive) out.push({ pos: S.sniper.pos.clone().add(new T.Vector3(0, 0.6, 0)), kind: 'target', label: 'GLINT' });
    if (S.convoy && S.convoy.state === 'driving')
      out.push({ pos: S.convoy.car.position.clone().add(new T.Vector3(0, 2.4, 0)), kind: 'car', label: 'TYRE' });
    if (S.protect) {
      const vip = S.protect.vip;
      if (vip.alive) out.push({ pos: vip.group.position.clone().add(new T.Vector3(0, 2.05 * vip.scale, 0)), kind: 'vip', label: 'INFORMANT' });
      for (const k of S.protect.killers)
        if (k.alive) out.push({ pos: k.group.position.clone().add(new T.Vector3(0, 2.05 * k.scale, 0)), kind: 'killer' });
    }
    return out;
  }

  // ── setup ──────────────────────────────────────────────────────────────────
  async setup() {
    const { city, pop, rig, hud } = this.ctx;
    const def = this.def, r = this.r;

    // The city was GENERATED around this contract: city.js already placed the
    // perch at the briefed range and capped every building inside the sightline
    // cone to the kill zone, so the shot exists before anyone is spawned.
    this.zone = (city.zone || city.plaza).clone();
    const best = city.vantageB || city.colliders[0];
    this.vantageB = best;
    this.simB = city.colliders.filter(b => b !== best);   // your own roof never blocks you
    // Stand UP, at the parapet. The roof slab is 1.4 m thick, so the eye goes at
    // roof-top + 1.6 m — miss this and the shooter is lying flat on the gravel
    // with the rooftop filling two-thirds of the screen (and the whole scope).
    const roofY = best.h + 1.4;
    this.roofY = roofY;              // main.js hands this + vantageB to the Walker.
    // Both are set BEFORE anything that can throw: the rest of setup() is allowed
    // to fail (main.js catches it and keeps the contract playable), and a perch
    // that is half-described would take the walker down with it.
    const yaw = Math.atan2(this.zone.x - best.cx, this.zone.z - best.cz);
    const reach = perchReach(Math.min(best.w, best.d), yaw);   // 3 m short of the edge he faces
    const eye = new T.Vector3(
      best.cx + Math.sin(yaw) * reach, roofY + 1.62, best.cz + Math.cos(yaw) * reach);
    city.setVantage(new T.Vector3(eye.x, roofY, eye.z), yaw, best);
    rig.setVantage(eye, yaw);
    rig.setLoadout(this.rifle, this.scope, this.ammo, this.gear);
    this.origin = rig.eye;
    pop.losTest = (pt) => this._losClear(pt);   // fleeing marks stay shootable

    // spawn declared targets
    const setup = def.setup || {};
    const tdefs = setup.targets || [];
    let ti = 0;
    for (const td of tdefs) {
      if (td.kind === 'sniper') { this.targets.push({ def: td, person: null, dead: false, escaped: false }); continue; }
      const t = await this._spawnTarget(td, ti++);
      if (t) this.targets.push(t);
    }
    // timed-appearance contracts: the mark only surfaces in windows
    if (def.special === 'appear' && this.targets[0]?.person) {
      const p = this.targets[0].person;
      p.hidden = true; p.group.visible = false;
      this.special.appear = { p, t: 5, shown: false, showFor: setup.showFor || 8, hideFor: setup.hideFor || 12 };
    }

    // identify puzzle
    if (setup.identify) await this._setupIdentify(setup.identify);

    // crowd + guards
    const nCiv = setup.civs ?? 10;
    for (let i = 0; i < nCiv; i++) await this._spawnCiv();
    for (let i = 0; i < (setup.guards || 0); i++) await this._spawnGuard(i);

    // specials
    if (def.special === 'range') await this._setupRange();
    if (def.special === 'protect') await this._setupProtect(setup.protect);
    if (def.special === 'convoy') await this._setupConvoy();
    if (def.special === 'countersniper') this._setupCounterSniper();
    if (def.special === 'endless') this.special.endless = { wave: 0, escaped: 0, nextIn: 2 };

    // spotter drone gear: auto-mark primaries
    if (this.gear.includes('drone') && !this.identify) {
      for (const t of this.targets) if (t.person) pop.mark(t.person, true);
      if (this.targets.length) hud.toast('SPOTTER DRONE: targets marked', 'good');
    }

    // Point the shooter at the job: the opening view looks straight down the
    // sightline at whatever this contract is about, not off into the skyline.
    const look = this.plates.length ? this.plates[0].c
      : (this.targets.find(t => t.person)?.person.group.position.clone().setY(1.4) || this.zone);
    const dv = new T.Vector3().subVectors(look, this.origin);
    rig.yaw = Math.atan2(dv.x, dv.z);
    rig.pitch = Math.atan2(dv.y, Math.hypot(dv.x, dv.z));

    hud.setWind(this.windDir, this.windNow, this.scope.windmeter);
    hud.setAmmo(this.ammoLeft, this.rifle.mag);
    hud.setExposure((this.def.setup?.guards || 0) > 0 ? 0 : null);
    this._objective();
    this.state = 'active';
  }

  _losClear(pt, ignore) {
    return losFrom(this.origin, pt,
      ignore ? this.simB.filter(b => b !== ignore) : this.simB, this.ctx.city.holes);
  }
  // building near `want` metres out with a sightline to ptOf(b)
  _pickBuilding(want, hWant, hW, ptOf, filter) {
    const cands = this.simB
      .filter(b => (!filter || filter(b)))
      .sort((a, b) =>
        (Math.abs(Math.hypot(a.cx - this.origin.x, a.cz - this.origin.z) - want) + Math.abs(a.h - hWant) * hW) -
        (Math.abs(Math.hypot(b.cx - this.origin.x, b.cz - this.origin.z) - want) + Math.abs(b.h - hWant) * hW));
    for (const b of cands.slice(0, 60)) if (this._losClear(ptOf(b), b)) return b;
    return cands[0];
  }

  async _spawnTarget(td, i) {
    const { city, pop } = this.ctx;
    const r = this.r;
    const file = td.file || r.pick(SUIT_FILES);
    const base = {
      role: 'target', file, armored: !!td.armored, label: td.label,
      onDeath: null,
    };
    let person = null;
    if (td.kind === 'room') {
      // carve a lit office bay facing the vantage, in the given range band
      const want = td.dist || this.def.vantage?.dist || 250;
      const bestB = this._pickBuilding(want, Math.max(26, this.origin.y), 0.25, (b) => {
        const dx = this.origin.x - b.cx, dz = this.origin.z - b.cz;
        const nx = Math.abs(dx) * b.d > Math.abs(dz) * b.w ? Math.sign(dx) : 0;
        const nz = nx ? 0 : Math.sign(dz);
        return {
          x: b.cx + nx * (b.w / 2 + 1.2),
          y: Math.min(b.h - 4.5, Math.max(12, this.origin.y - 4)),
          z: b.cz + nz * (b.d / 2 + 1.2),
        };
      }, (b) => b.h >= 22);
      const room = city.addRoom(bestB, this.origin, Math.min(bestB.h - 6, Math.max(10, this.origin.y - 4 + r.range(-8, 4))));
      person = await pop.spawn({
        ...base, pos: room.pos, yaw: room.yaw,
        routine: { type: 'room', anim: r.pick(['watch', 'phone', 'talk']) },
        anim: 'watch',
      });
      person.room = room;
    } else if (td.kind === 'rooftop') {
      const want = td.dist || 300;
      const bestB = this._pickBuilding(want, Math.max(12, this.origin.y - 10), 0.8,
        (b) => ({ x: b.cx, y: b.h + 1.5, z: b.cz }));
      person = await pop.spawn({
        ...base, pos: new T.Vector3(bestB.cx, bestB.h + 1.4, bestB.cz),
        yaw: r.range(0, 6.28), routine: { type: 'stand', anim: td.anim || 'phone' },
      });
      person.roofB = bestB;
    } else if (td.kind === 'walk') {
      const loop = this._visibleLoop(140);
      person = await pop.spawn({
        ...base, pos: loop[0].clone(), yaw: 0,
        routine: { type: 'loop', points: loop, speed: td.speed || 1.35 },
        anim: 'walk',
      });
    } else if (td.kind === 'bench') {
      const b = this._visibleBench();
      person = await pop.spawn({
        ...base, pos: b.clone().setY(0), yaw: r.range(0, 6.28),
        routine: { type: 'sit' }, anim: 'sit',
      });
    } else if (td.kind === 'pair') {
      // target walks with a bodyguard glued to the vantage side
      const loop = this._visibleLoop(120);
      person = await pop.spawn({
        ...base, pos: loop[0].clone(), yaw: 0,
        routine: { type: 'loop', points: loop, speed: 1.2, pause: true },
        anim: 'walk',
      });
      const guard = await this.ctx.pop.spawn({
        role: 'civ', file: 'man_officer_swat.glb', pos: loop[0].clone(), yaw: 0,
        routine: { type: 'stand', anim: 'walk' }, armored: true, label: 'bodyguard',
      });
      this.special.pair = { target: person, guard };
    } else { // plaza (default)
      const p = this._visibleGroundSpot();
      person = await pop.spawn({
        ...base, pos: p, yaw: r.range(0, 6.28),
        routine: { type: 'stand', anim: td.anim || r.pick(['phone', 'talk', 'idle']) },
      });
    }
    person.order = td.order || 0;
    return { def: td, person, dead: false, escaped: false };
  }

  // ── LOS-checked spawn spots ────────────────────────────────────────────────
  _visibleGroundSpot() {
    const pts = [...this.ctx.city.plazaPts].sort(() => this.r() - 0.5);
    for (const c of pts) {
      const p = c.clone().add(new T.Vector3(this.r.range(-4, 4), 0, this.r.range(-4, 4)));
      if (this._losClear({ x: p.x, y: 1.5, z: p.z })) return p;
    }
    return pts[0].clone();
  }
  _visibleBench() {
    const bs = [...this.ctx.city.benches].sort(() => this.r() - 0.5);
    for (const b of bs) if (this._losClear({ x: b.x, y: b.y + 0.9, z: b.z })) return b;
    return bs[0] || this.zone.clone();
  }
  // A walking MARK circuits the open kill zone, not a block's sidewalk — a
  // sidewalk loop wraps around that block's buildings, so half the circuit is
  // spent behind them and the contract becomes a waiting game. Every waypoint
  // here is line-of-sight checked, so he's always shootable and always moving
  // (his bearing keeps changing, which is what makes the lead interesting).
  _visibleLoop(maxDist) {
    const city = this.ctx.city;
    const R = Math.min(21, (city.zoneR || 50) * 0.4);
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const p = this.zone.clone().add(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      if (this._losClear({ x: p.x, y: 1.6, z: p.z })) ring.push(p);
    }
    if (ring.length >= 4) return ring;
    // fall back: whichever nearby sidewalk you can see most of
    let loops = city.walkLoops.filter(l => Math.hypot(l[0].x - this.zone.x, l[0].z - this.zone.z) < maxDist);
    if (city.plazaLoop) loops = [city.plazaLoop, ...loops.filter(l => l !== city.plazaLoop)];
    if (!loops.length) loops = city.walkLoops;
    let best = loops[0], bestN = -1;
    for (const l of loops) {
      const n = l.reduce((a, p) => a + (this._losClear({ x: p.x, y: 1.6, z: p.z }) ? 1 : 0), 0);
      if (n === l.length) return l;
      if (n > bestN) { bestN = n; best = l; }
    }
    return best;
  }

  async _spawnCiv() {
    const { city, pop } = this.ctx;
    const r = this.r;
    const near = r.chance(0.6);
    const seats = [...city.benches, ...city.parkBenches];
    if (r.chance(0.25) && seats.length) {
      const b = r.pick(seats);
      return pop.spawn({
        role: 'civ', file: r.pick(CIV_FILES), pos: b.clone().setY(0),
        yaw: r.range(0, 6.28), routine: { type: 'sit' }, anim: 'sit',
      });
    }
    const loops = near
      ? city.walkLoops.filter(l => Math.hypot(l[0].x - this.zone.x, l[0].z - this.zone.z) < 160)
      : city.walkLoops;
    const loop = r.pick(loops.length ? loops : city.walkLoops);
    return pop.spawn({
      role: 'civ', file: r.pick(CIV_FILES),
      pos: loop[r.int(0, 3)].clone().add(new T.Vector3(r.range(-1, 1), 0, r.range(-1, 1))),
      yaw: 0, routine: { type: 'loop', points: loop, start: r.int(0, 3), pause: true, speed: r.range(1.1, 1.6) },
      anim: 'walk',
    });
  }

  async _spawnGuard(i) {
    const { pop } = this.ctx;
    const r = this.r;
    // guards orbit the first target — but on the STREET, at ground level
    const t0 = this.targets[0];
    const t = t0?.person;
    const centre = t ? t.group.position : this.zone;
    const a = (i / Math.max(1, this.def.setup.guards)) * Math.PI * 2 + r.range(0, 1);
    const p = new T.Vector3(centre.x + Math.cos(a) * r.range(8, 16), 0, centre.z + Math.sin(a) * r.range(8, 16));
    // Guards post up on the street below / around the mark — never INSIDE his
    // office, where they'd stand in the window and eat the round meant for him.
    const g = await pop.spawn({
      role: 'guard', file: r.pick(GUARD_FILES), pos: p, yaw: r.range(0, 6.28),
      routine: { type: 'stand', anim: 'guard' }, armored: true,
    });
    if (t && t.roofB) g.group.position.set(p.x, t.roofB.h + 1.4, p.z);   // rooftop marks: same roof
    else if (t0 && t0.def.kind === 'room') {
      // overwatch on nearby rooftops, watching the skyline for you
      const b = this._pickBuilding(this.def.vantage?.dist * 0.8 || 240, this.origin.y - 8, 0.6,
        (bb) => ({ x: bb.cx, y: bb.h + 1.5, z: bb.cz }));
      if (b) g.group.position.set(b.cx + r.range(-4, 4), b.h + 1.4, b.cz + r.range(-4, 4));
    }
    return g;
  }

  async _setupIdentify(spec) {
    const { pop, hud } = this.ctx;
    const r = this.r;
    // the real target already spawned as targets[0]; decoys share 2 of 3 clues
    const real = this.targets[0].person;
    real.traits = { outfit: 'suit', phone: real.char.anim === 'phone', kind: this.targets[0].def.kind || 'plaza' };
    this.identify = { confirmed: false, wrongs: 0 };
    for (let i = 0; i < (spec.decoys || 3); i++) {
      const td = { kind: this.targets[0].def.kind || 'plaza', file: r.pick(SUIT_FILES), anim: i === 0 ? real.char.anim : r.pick(['idle', 'talk', 'watch']) };
      const decoy = await this._spawnTarget(td, 90 + i);
      decoy.person.role = 'civ';                       // decoys are innocent
      decoy.person.decoy = true;
    }
  }

  async _setupRange() {
    // steel plates on rooftops at graded ranges — the tutorial shoots steel
    const { city, scene } = this.ctx;
    const dists = [130, 230, 330];
    const mat = new T.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.4, metalness: 0.7 });
    const ring = new T.MeshBasicMaterial({ color: 0xc23b2e });
    for (const d of dists) {
      const bestB = this._pickBuilding(d, Math.max(10, this.origin.y - 6), 0.6,
        (b) => ({ x: b.cx, y: b.h + 2.4, z: b.cz }));
      const g = new T.Group();
      const plate = new T.Mesh(new T.CircleGeometry(0.55, 20), mat);
      const bull = new T.Mesh(new T.CircleGeometry(0.2, 16), ring);
      bull.position.z = 0.01;
      const post = new T.Mesh(new T.BoxGeometry(0.08, 1.6, 0.08), mat);
      post.position.y = -1.05;
      g.add(plate, bull, post);
      g.position.set(bestB.cx, bestB.h + 2.4, bestB.cz);
      g.lookAt(this.origin.x, this.origin.y, this.origin.z);
      scene.add(g);
      this.plates.push({ group: g, hit: false, dist: 0, c: g.position.clone() });
    }
  }

  async _setupProtect(spec) {
    const { city, pop } = this.ctx;
    const r = this.r;
    // VIP crosses the kill zone perpendicular to your sightline, so she stays
    // in view the whole walk; killers converge on her from the edges
    const toEye = new T.Vector3().subVectors(this.origin, this.zone).setY(0).normalize();
    const across = new T.Vector3(-toEye.z, 0, toEye.x);
    const R = (city.zoneR || 50) * 0.7;
    const start = this.zone.clone().addScaledVector(across, -R);
    const route = [start, this.zone.clone(), this.zone.clone().addScaledVector(across, R)];
    const vip = await pop.spawn({
      role: 'vip', file: 'woman_reporter.glb', pos: start, yaw: 0,
      routine: { type: 'loop', points: route, speed: 1.15 }, label: 'INFORMANT',
    });
    pop.mark(vip, true);
    vip.marker.material.color.set(0x37c86b);
    // `pending` counts killers whose spawn is in flight: pop.spawn() is async, so
    // without it the win check sees an empty killers[] the instant the last wave
    // is SCHEDULED and hands you the mission before the killer even walks in.
    this.special.protect = {
      vip, killers: [], spawned: 0, pending: 0,
      total: spec?.waves || 4, nextIn: 6, doneRoute: route[route.length - 1],
    };
  }

  async _setupConvoy() {
    const { scene, city } = this.ctx;
    // Scripted sedan: drives the avenue ACROSS your sightline through the kill
    // zone, so the tyre shot is a genuine moving-target lead, not a going-away
    // shot. `axis` is the road direction, `n` its inward normal.
    const geoB = new T.BoxGeometry(2.2, 1.3, 5.2); geoB.translate(0, 0.85, 0);
    const geoC = new T.BoxGeometry(2, 1, 2.6); geoC.translate(0, 1.8, -0.2);
    const car = new T.Group();
    car.add(new T.Mesh(geoB, new T.MeshStandardMaterial({ color: 0x14161c, roughness: 0.35, metalness: 0.6 })));
    car.add(new T.Mesh(geoC, new T.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.3, metalness: 0.6 })));
    const toEye = new T.Vector3().subVectors(this.origin, this.zone).setY(0).normalize();
    // the road running most perpendicular to the sightline: x-road or z-road
    const alongX = Math.abs(toEye.z) > Math.abs(toEye.x);
    const lane = (city.zoneR || 50) * 0.62;
    const axis = alongX ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1);
    const start = this.zone.clone()
      .addScaledVector(axis, -160)
      .addScaledVector(alongX ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0), toEye.z * 0 + (alongX ? Math.sign(toEye.z) : Math.sign(toEye.x)) * lane);
    car.position.copy(start);
    car.rotation.y = alongX ? Math.PI / 2 : 0;
    scene.add(car);
    this.special.convoy = {
      car, speed: 12, state: 'driving', exitT: 0,
      axis, travelled: 0, maxTravel: 320,
    };
  }

  _setupCounterSniper() {
    const { city, fx } = this.ctx;
    const r = this.r;
    // enemy marksman on a rooftop across the city — his glint gives him away
    const bestB = this._pickBuilding(420, this.origin.y, 0.7,
      (b) => ({ x: b.cx, y: b.h + 1.1, z: b.cz }));
    const pos = new T.Vector3(bestB.cx, bestB.h + 1.1, bestB.cz);
    this.special.sniper = {
      pos, glint: fx.glint(pos.clone().add(new T.Vector3(0, 0.4, 0))),
      shots: 0, nextShot: 9, alive: true, b: bestB,
    };
  }

  // ── objective text ─────────────────────────────────────────────────────────
  _objective() {
    const hud = this.ctx.hud;
    const alive = this.targets.filter(t => !t.dead && !t.escaped).length;
    if (this.def.special === 'range') {
      const left = this.plates.filter(p => !p.hit).length;
      hud.setObjective('RANGE DAY', `ring the steel — ${left} plate${left === 1 ? '' : 's'} left`);
    } else if (this.def.special === 'protect') {
      hud.setObjective('OVERWATCH', 'keep the informant alive');
    } else if (this.def.special === 'endless') {
      hud.setObjective('THE NEST', `wave ${this.special.endless.wave} — ${3 - this.special.endless.escaped} escapes left`);
    } else if (this.identify && !this.identify.confirmed) {
      hud.setObjective('IDENTIFY', 'find the mark — check the intel, then MARK ◈');
    } else {
      hud.setObjective(this.def.name, alive ? `${alive} target${alive === 1 ? '' : 's'} remaining` : 'clear');
    }
  }

  // ── firing ─────────────────────────────────────────────────────────────────
  fire() {
    if (this.state !== 'active') return;
    if (this.reloadT > 0 || this.chamberT > 0) { audio.dry(); return; }
    if (this.ammoLeft <= 0) { this._reload(); return; }
    const { rig, fx, hud, pop, city } = this.ctx;

    this.ammoLeft--;
    this.shots++;
    save.stats.shots++;
    this.chamberT = this.rifle.chamber;
    audio.shot(this.suppressed);
    fx.muzzleFlash(rig.camera);
    rig.fire();

    const ray = rig.aimRay();
    let dir = ray.dir.clone();
    if (!rig.scoped) {         // hip fire: big spread
      dir.x += (Math.random() - 0.5) * 0.03;
      dir.y += (Math.random() - 0.5) * 0.03;
      dir.z += (Math.random() - 0.5) * 0.03;
      dir.normalize();
    }

    const people = this.ctx.pop.colliders();
    // plates + convoy tyre + enemy sniper ride along as pseudo-people
    for (const pl of this.plates) {
      if (pl.hit) continue;
      people.push({ person: { plate: pl }, head: { c: pl.c, r: 0.55 }, torso: { a: pl.c, b: pl.c, r: 0 } });
    }
    if (this.special.convoy && this.special.convoy.state === 'driving') {
      const cv = this.special.convoy;
      people.push({
        person: { tyre: true },
        vel: cv.axis.clone().multiplyScalar(cv.speed),                  // it's moving — lead it
        head: { c: convoyTyre(cv), r: 0.7 },                            // front wheel
        torso: {                                                        // the body
          a: cv.car.position.clone().addScaledVector(cv.axis, -2.2).setY(1.0),
          b: cv.car.position.clone().addScaledVector(cv.axis, 2.2).setY(1.0),
          r: 1.1,
        },
      });
    }
    if (this.special.sniper?.alive) {
      const s = this.special.sniper.pos;
      people.push({
        person: { sniper: true },
        head: { c: new T.Vector3(s.x, s.y + 0.5, s.z), r: 0.2 },
        torso: { a: new T.Vector3(s.x, s.y - 0.6, s.z), b: new T.Vector3(s.x, s.y + 0.3, s.z), r: 0.3 },
      });
    }

    const res = simulate(ray.origin, dir, {
      v0: this.v0, wind: this.windVec(),
      ap: this.ammo.ap, heavy: this.rifle.heavy,
      people, buildings: this.simB, glass: city.glass, holes: city.holes,
      groundY: 0,
    });

    for (const ev of res.events) {
      if (ev.type === 'glass') { audio.glassBreak(); fx.glassShatter(ev.glass); }
    }

    const hit = res.hit;
    const hitP = new T.Vector3(hit.point.x, hit.point.y, hit.point.z);
    const dist = res.dist;

    // decide bullet cam BEFORE resolving: final target kill, or a long headshot
    const wouldKill = (hit.type === 'head') ||
      (hit.type === 'torso' && hit.person && !(hit.person.armored && !(this.ammo.ap || this.rifle.heavy)));
    const isTargetP = hit.person && (hit.person.role === 'target');
    const lastKill = isTargetP && wouldKill &&
      this.targets.filter(t => !t.dead && !t.escaped).length === 1 && !this.def.noBcam;
    const flairCam = isTargetP && wouldKill && hit.type === 'head' && dist > 320 && this.r.chance(0.45);
    const useCam = !this.ctx.noBcam && (lastKill || flairCam) && this.def.special !== 'endless';

    const resolveHit = () => this._resolveHit(res, dist);
    if (useCam) {
      if (hit.person) hit.person.frozen = true;
      this.ctx.hud.setBcam(true);
      this.ctx.bcam.start(res, () => {
        this.ctx.hud.setBcam(false);
        resolveHit();
      });
    } else {
      if (res.tof > 0.25) setTimeout(resolveHit, Math.min(1200, res.tof * 1000));
      else resolveHit();
    }

    hud.setAmmo(this.ammoLeft, this.rifle.mag);
    if (!this.suppressed) this._loudNoise();
    if (this.ammoLeft === 0) this._reload();
  }

  _resolveHit(res, dist) {
    if (this.state !== 'active' && this.state !== 'won') { /* still show impacts */ }
    const { fx, hud, pop } = this.ctx;
    const hit = res.hit;
    const hp = new T.Vector3(hit.point.x, hit.point.y, hit.point.z);

    if (hit.type === 'head' || hit.type === 'torso') {
      const p = hit.person;
      if (p.plate) return this._hitPlate(p.plate, dist);
      if (p.tyre) return this._hitTyre();
      if (p.sniper) return this._hitSniper(hit.type === 'head');
      const lethal = hit.type === 'head' || !p.armored || this.ammo.ap || this.rifle.heavy;
      fx.impactBody(hp);
      if (lethal) {
        pop.kill(p, new T.Vector3(hit.dir.x, hit.dir.y, hit.dir.z));
        this.hits++; save.stats.hits++; save.stats.kills++;
        if (hit.type === 'head') { this.headshots++; save.stats.heads++; }
        hud.showHitmarker(hit.type === 'head');
        audio.killConfirm();
        this.longest = Math.max(this.longest, dist);
        save.stats.longest = Math.max(save.stats.longest, Math.round(dist));
        this._onKill(p, hit.type === 'head', dist);
      } else {
        hud.toast('ARMOURED — no effect', 'bad');
        p.panicked = true;
        this._panicAt(hp, true);
      }
    } else if (hit.type === 'building') {
      fx.impactConcrete(hp); fx.bulletHole(hp);
      audio.impactConcrete();
      if (Math.random() < 0.4) audio.ricochet();
      this._registerMiss(hp);
    } else if (hit.type === 'ground') {
      fx.impactGround(hp);
      audio.impactConcrete();
      this._registerMiss(hp);
    } else {
      this._registerMiss(null);
    }
    this._objective();
  }

  _registerMiss(hp) {
    this.missed = true;
    if (hp) this._panicAt(hp, false);
  }

  _hitPlate(pl, dist) {
    pl.hit = true;
    audio.ricochet();
    this.ctx.hud.showHitmarker(false);
    this.ctx.hud.toast(`STEEL — ${fmtM(dist)}`, 'good');
    this.score += 400;
    pl.group.rotation.x += 1.2;      // knocked back
    this.hits++;
    if (this.plates.every(p => p.hit)) this._win();
    this._objective();
  }

  _hitTyre() {
    const cv = this.special.convoy;
    audio.ricochet();
    this.ctx.hud.showHitmarker(false);
    this.ctx.hud.toast('TYRE OUT — vehicle stopping', 'good');
    cv.state = 'stopping';
    this.hits++;
  }

  async _hitSniper(head) {
    const s = this.special.sniper;
    s.alive = false;
    s.glint.remove();
    this.hits++; this.headshots += head ? 1 : 0;
    this.ctx.hud.showHitmarker(head);
    audio.killConfirm();
    this.ctx.hud.toast('COUNTER-SNIPER DOWN', 'good');
    this.score += SCORE.kill + (head ? SCORE.head : 0);
    // he counts as the mission's target
    const t = this.targets.find(t => t.def.kind === 'sniper');
    if (t) { t.dead = true; }
    this._checkWin();
  }

  _onKill(p, head, dist) {
    const now = this.time;
    if (p.role === 'target') {
      const t = this.targets.find(t => t.person === p);
      if (t) t.dead = true;
      // order check
      if (this.def.setup?.ordered) {
        const earlier = this.targets.some(x => !x.dead && !x.escaped && x.person.order < p.order);
        if (earlier) {
          this.ctx.hud.toast('OUT OF ORDER — they know', 'bad');
          this._panicAt(p.group.position, true);
        }
      }
      // kill window for multi-target contracts
      if (this.def.setup?.window && this.targets.some(x => !x.dead && !x.escaped)) {
        this.special.window = this.def.setup.window;
        this.ctx.hud.toast(`${this.def.setup.window}s — drop the rest`, '');
      }
      let sc = SCORE.kill + (head ? SCORE.head : 0) + Math.round(Math.max(0, (dist - SCORE.distFrom) * SCORE.distPerM));
      if (p.state === 'route' && (p.routine.type === 'loop' || p.routine.type === 'patrol')) sc += SCORE.moving;
      if (this.killTimes.length && now - this.killTimes[this.killTimes.length - 1] < SCORE.streakWindow) {
        sc += SCORE.streak;
        this.ctx.hud.toast('STREAK +' + SCORE.streak, 'good');
      }
      this.killTimes.push(now);
      this.score += sc;
      this.ctx.hud.toast((head ? 'HEADSHOT — ' : 'TARGET DOWN — ') + fmtM(dist), 'good');
      this._panicAt(p.group.position, true);
      this._checkWin();
    } else if (p.role === 'vip') {
      this._fail('the informant is dead — by your hand');
    } else if (p.role === 'guard' || p.hostile) {
      if (p.hostile) {
        this.score += 600;
        this.ctx.hud.toast('KILLER DOWN', 'good');
        const pr = this.special.protect;
        if (pr) pr.killers = pr.killers.filter(k => k !== p);
      } else {
        this.score += 150;
        this.ctx.hud.toast('guard eliminated', '');
      }
      this._panicAt(p.group.position, true);
    } else {
      // civilian (or decoy)
      this.civKills++;
      this.score += SCORE.civilian;
      audio.failSting();
      this.ctx.hud.toast('CIVILIAN KILLED ' + SCORE.civilian, 'bad');
      this._panicAt(p.group.position, true);
      if (this.civKills >= 2 || this.def.noCiv) this._fail('civilian casualties — contract voided');
    }
  }

  _panicAt(pos, always) {
    const r = this.suppressed ? PANIC.quietRadius : PANIC.loudRadius;
    this.ctx.pop.panicFrom(pos, always ? Math.max(r, 26) : r, this);
    if (!this.panicked) {
      this.panicked = true;
      audio.panicCrowd();
    }
  }

  _loudNoise() {
    this.loudShots++;
    if ((this.def.setup?.guards || 0) > 0) {
      this.exposure += this.loudShots === 1 ? 12 : EXPOSURE.perLoudShot * (this.gear.includes('ghillie') ? 0.55 : 1);
      if (this.exposure >= EXPOSURE.failAt) return this._fail('position compromised — they found you');
      this.ctx.hud.setExposure(this.exposure / EXPOSURE.failAt);
    }
    if (this.special.sniper?.alive) {
      this.special.sniper.nextShot = Math.min(this.special.sniper.nextShot, 3.5);
    }
  }

  _reload() {
    if (this.reloadT > 0) return;
    this.reloadT = 2.6;
    this.ctx.hud.toast('RELOADING…', '');
  }

  // people.js callbacks
  onTargetFlees(p, bunkered) {
    if (this._fleeWarned) return;
    this._fleeWarned = true;
    if (bunkered) {
      this.special.bunker = 13;
      this.ctx.hud.toast('TARGET DIVING FOR COVER — 13s', 'bad');
    } else {
      this.ctx.hud.toast('TARGET FLEEING — stop them', 'bad');
      this.ctx.hud.fixerSay('They\'re rabbiting. You have seconds.');
    }
  }
  onEscape(p) {
    const t = this.targets.find(t => t.person === p);
    if (t && !t.dead) {
      t.escaped = true;
      if (this.def.special === 'endless') {
        this.special.endless.escaped++;
        this.ctx.hud.toast(`ESCAPED (${this.special.endless.escaped}/3)`, 'bad');
        if (this.special.endless.escaped >= 3) this._fail('three marks slipped away');
        this._objective();
      } else {
        this._fail('the target got away');
      }
    }
  }

  // ── marking / identify ─────────────────────────────────────────────────────
  mark() {
    const { rig, pop, hud } = this.ctx;
    const ray = rig.aimRay();
    const cone = rig.scoped ? 0.012 + rig.fov * 0.0004 : 0.05;
    const p = pop.pick(ray.origin, ray.dir, cone);
    if (!p) { hud.toast('MARK ◈ tags a person — put the crosshair on one first', ''); return; }
    if (this.identify && !this.identify.confirmed) {
      if (p.role === 'target') {
        this.identify.confirmed = true;
        pop.mark(p, true);
        audio.markPing();
        hud.toast('MARK CONFIRMED — take the shot', 'good');
        this._objective();
      } else {
        this.identify.wrongs++;
        this.score -= 500;
        hud.toast('WRONG — that\'s not the mark (−500)', 'bad');
        if (this.identify.wrongs >= 3) this._fail('you burned the intel — wrong marks');
      }
      return;
    }
    if (p.role === 'target' || p.role === 'vip') {
      pop.mark(p, true);
      audio.markPing();
      hud.toast(p.label ? `MARKED — ${p.label}` : 'TARGET MARKED', 'good');
    } else {
      hud.toast('not a contract target', '');
    }
  }

  // ── update ─────────────────────────────────────────────────────────────────
  update(dt) {
    if (this.state !== 'active') return;
    const { hud, rig, city, pop, fx } = this.ctx;
    this.time += dt;

    if (this.chamberT > 0) {
      this.chamberT -= dt;
      if (this.chamberT <= 0 && !this.rifle.semi && this.ammoLeft > 0) audio.bolt();
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammoLeft = this.rifle.mag;
        hud.setAmmo(this.ammoLeft, this.rifle.mag);
        audio.bolt();
      }
    }

    // wind gusts
    if (this.gusts) {
      this.windNow = this.windSpeed * (1 + 0.45 * Math.sin(this.time * 0.5) * Math.sin(this.time * 0.17 + 2));
    }
    hud.setWindLive(this.windDir - rig.yaw, this.windNow);

    // timers
    if (this.timeLimit > 0) {
      const left = this.timeLimit - this.time;
      hud.setTimer(left);
      if (left < 10) {
        this._lowTick += dt;
        if (this._lowTick > 1) { this._lowTick = 0; audio.tensionTick(); }
      }
      if (left <= 0) return this._fail('out of time');
    }
    if (this.special.window !== undefined) {
      this.special.window -= dt;
      hud.setTimer(this.special.window);
      if (this.special.window <= 0) {
        for (const t of this.targets) if (!t.dead && !t.escaped) t.escaped = true;
        return this._fail('the rest scattered');
      }
    }
    if (this.special.bunker !== undefined) {
      this.special.bunker -= dt;
      if (this.special.bunker <= 0) return this._fail('target bunkered in — no shot left');
    }

    // exposure decay
    if (this.exposure > 0) {
      this.exposure = Math.max(0, this.exposure - EXPOSURE.decay * dt);
      hud.setExposure(this.exposure / EXPOSURE.failAt);
    }

    this._updateSpecials(dt);

    // rangefinder + smart dot + holdover, throttled
    this._rfAcc += dt;
    if (this._rfAcc > 0.15) {
      this._rfAcc = 0;
      this._updateRange();
    }
    hud.setBreath(rig.breath / (3.4 * rig.loadout.breathMul), rig.winded > 0);
  }

  _updateRange() {
    const { rig, hud, city, pop } = this.ctx;
    const showRF = this.scope.rangefinder || this.gear.includes('binos');
    if (!showRF && !this.scope.smart) { hud.setDist(null); rig.smart = null; return; }
    const ray = rig.aimRay();
    const rc = raycast(ray.origin, ray.dir, {
      people: pop.colliders(), buildings: this.simB, glass: city.glass, holes: city.holes, groundY: 0, max: 2500,
    });
    if (rc.type === 'none') { hud.setDist(null); rig.smart = null; return; }
    const D = rc.dist;
    const right = new T.Vector3(ray.dir.z, 0, -ray.dir.x).normalize();
    const w = this.windVec();
    const cross = right.x * w.x + right.z * w.z;
    const dropM = this.table.dropAt(D);
    const driftM = this.table.driftAt(D, cross);
    if ((rig.scoped && this.scope.rangefinder) || (!rig.scoped && this.gear.includes('binos'))) {
      let txt = `${Math.round(D)}m`;
      if (rig.scoped && this.scope.rangefinder) {
        txt += `  ▼${(dropM / D * 1000).toFixed(1)}`;
        if (this.scope.windmeter) txt += `  ${driftM >= 0 ? '▶' : '◀'}${Math.abs(driftM / D * 1000).toFixed(1)}`;
      }
      hud.setDist(txt);
    } else hud.setDist(null);
    rig.smart = (rig.scoped && this.scope.smart)
      ? { xMrad: driftM / D * 1000, yMrad: dropM / D * 1000 }
      : null;
  }

  _updateSpecials(dt) {
    const { hud, pop, fx } = this.ctx;
    const S = this.special;

    // protect: killer waves close on the VIP
    if (S.protect) {
      const pr = S.protect;
      if (!pr.vip.alive) return this._fail('the informant is dead');
      pr.nextIn -= dt;
      if (pr.nextIn <= 0 && pr.spawned < pr.total) {
        pr.nextIn = 8 + this.r.range(0, 4);
        pr.spawned++;
        this._spawnKiller(pr);
      }
      for (const k of pr.killers) {
        if (!k.alive) continue;
        const d = k.group.position.distanceTo(pr.vip.group.position);
        const dir = new T.Vector3().subVectors(pr.vip.group.position, k.group.position).setY(0).normalize();
        k.targetYaw = Math.atan2(dir.x, dir.z);
        k.group.position.addScaledVector(dir, 2.6 * dt);
        k.char.setAnim('run');
        if (d < 5) {
          k.closeT = (k.closeT || 0) + dt;
          if (k.closeT > 1.6) { pop.kill(pr.vip, dir); return this._fail('the informant is dead'); }
        }
      }
      // every wave sent AND landed, every killer down, the informant still
      // walking: done
      if (pr.spawned >= pr.total && pr.pending === 0 && pr.killers.every(k => !k.alive)) this._win();
    }

    // convoy car
    if (S.convoy) {
      const cv = S.convoy;
      if (cv.state === 'driving') {
        cv.car.position.addScaledVector(cv.axis, cv.speed * dt);
        cv.travelled += cv.speed * dt;
        if (cv.travelled > cv.maxTravel) this._fail('the convoy rolled through');
      } else if (cv.state === 'stopping') {
        cv.speed = Math.max(0, cv.speed - 14 * dt);
        cv.car.position.addScaledVector(cv.axis, cv.speed * dt);
        if (cv.speed === 0) {
          cv.state = 'stopped';
          cv.exitT = 1.6;
        }
      } else if (cv.state === 'stopped') {
        cv.exitT -= dt;
        if (cv.exitT <= 0) {
          cv.state = 'out';
          this._spawnTarget({
            kind: 'plaza', label: 'THE COURIER',
            file: 'man_business.glb',
          }, 50).then(t => {
            t.person.group.position.copy(cv.car.position).add(new T.Vector3(2.2, 0, 0));
            t.person.group.position.y = 0;
            t.person.state = 'escape';
            // he sprints on down the avenue — across your glass, not away from
            // it. ~90 m of running: about 17 s of shooting, one good lead.
            t.person.fleeTo = cv.car.position.clone().addScaledVector(cv.axis, 90);
            t.person.char.setAnim('run');
            this.targets.push(t);
            this.ctx.hud.toast('COURIER ON FOOT — drop him', 'bad');
            pop.mark(t.person, true);
            this._objective();
          });
        }
      }
    }

    // counter-sniper exchange
    if (S.sniper && S.sniper.alive) {
      S.sniper.nextShot -= dt;
      if (S.sniper.nextShot <= 0) {
        S.sniper.nextShot = 8 + this.r.range(0, 4);
        S.sniper.shots++;
        audio.shot(false);
        fx.tracer([
          { x: S.sniper.pos.x, y: S.sniper.pos.y, z: S.sniper.pos.z },
          { x: this.origin.x, y: this.origin.y, z: this.origin.z },
        ], 0xff6a5a);
        hud.flashVignette();
        if (S.sniper.shots >= 3) return this._fail('outsniped — he found his range');
        hud.toast(`INCOMING FIRE (${S.sniper.shots}/3) — find the glint`, 'bad');
      }
    }

    // endless waves
    if (S.endless) {
      S.endless.nextIn -= dt;
      if (S.endless.nextIn <= 0) {
        S.endless.wave++;
        S.endless.nextIn = Math.max(9, 20 - S.endless.wave);
        const kinds = ['plaza', 'walk', 'bench', 'rooftop'];
        this._spawnTarget({ kind: this.r.pick(kinds) }, 100 + S.endless.wave).then(t => {
          this.targets.push(t);
          pop.mark(t.person, true);
          // marks self-extract after a while
          setTimeout(() => {
            if (t.person.alive && !t.escaped && this.state === 'active') {
              t.person.state = 'escape';
              t.person.fleeTo = pop.nearestEscape(t.person.group.position);
              t.person.char.setAnim('run');
              t.person.group.position.y = 0;
            }
          }, (14 + Math.max(4, 16 - S.endless.wave)) * 1000);
          this._objective();
        });
      }
    }

    // timed-appearance windows
    if (S.appear) {
      const A = S.appear;
      A.t -= dt;
      if (A.t <= 0) {
        A.shown = !A.shown;
        A.t = A.shown ? A.showFor : A.hideFor;
        A.p.hidden = !A.shown;
        A.p.group.visible = A.shown;
        if (A.p.alive) {
          hud.toast(A.shown ? 'TARGET EXPOSED' : 'target gone to ground', A.shown ? 'good' : '');
          if (A.shown) audio.markPing();
        }
      }
    }

    // pair bodyguard shadows the target on the vantage side
    if (S.pair && S.pair.target.alive && S.pair.guard.alive) {
      const t = S.pair.target, g = S.pair.guard;
      const toV = new T.Vector3().subVectors(this.origin, t.group.position).setY(0).normalize();
      const want = t.group.position.clone().addScaledVector(toV, 1.1);
      g.group.position.lerp(want, Math.min(1, dt * 3));
      g.targetYaw = t.group.rotation.y;
      g.char.setAnim(t.char.anim === 'walk' ? 'walk' : 'guard');
    }
  }

  async _spawnKiller(pr) {
    const { pop } = this.ctx;
    pr.pending++;
    // They come in from the edge of the kill zone — far enough that you have
    // time, close enough that you can SEE them coming (an unseeable killer is
    // just a coin-flip on the informant's life).
    const R = (this.ctx.city.zoneR || 50) * 0.95;
    let start = null;
    for (let i = 0; i < 12; i++) {
      const a = this.r.range(0, Math.PI * 2);
      const p = pr.vip.group.position.clone().add(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      p.y = 0;
      if (this._losClear({ x: p.x, y: 1.6, z: p.z })) { start = p; break; }
    }
    if (!start) {
      const a = this.r.range(0, Math.PI * 2);
      start = pr.vip.group.position.clone().add(new T.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)).setY(0);
    }
    const k = await pop.spawn({
      role: 'guard', file: this.r.pick(['man_punk.glb', 'man_officer_swat.glb', 'man_soldier.glb']),
      pos: start, yaw: 0, routine: { type: 'stand', anim: 'run' },
    });
    k.hostile = true;
    pop.mark(k, true);
    pr.killers.push(k);
    pr.pending--;
    this.ctx.hud.toast('KILLER INBOUND — marked', 'bad');
    audio.markPing();
  }

  _checkWin() {
    if (this.identify) {
      if (this.targets.every(t => t.dead)) this._win();
      return;
    }
    if (this.targets.length && this.targets.every(t => t.dead)) this._win();
  }

  _win() {
    if (this.state !== 'active') return;
    this.state = 'won';
    setTimeout(() => this._finish(true), 1400);
  }
  _fail(reason) {
    if (this.state !== 'active') return;
    this.state = 'lost';
    this.failReason = reason;
    audio.failSting();
    setTimeout(() => this._finish(false), 1400);
  }

  _finish(won) {
    // score extras
    const lines = [];
    const base = this.score;
    lines.push(['Contract score', Math.round(base)]);
    let bonus = 0;
    if (won && !this.missed && this.shots > 0) { bonus += SCORE.noMiss; lines.push(['No shot wasted', SCORE.noMiss]); }
    if (won && this.timeLimit > 0) {
      const tb = Math.round(Math.max(0, this.timeLimit - this.time) * SCORE.timeBonusPerS);
      if (tb) { bonus += tb; lines.push(['Time bonus', tb]); }
    }
    if (won && !this.panicked && this.targets.length > 0 && this.def.special !== 'range') {
      bonus += 600; lines.push(['Ghost — nobody panicked', 600]);
    }
    if (this.headshots) lines.push([`Headshots ×${this.headshots}`, '—']);
    if (this.longest > 0) lines.push(['Longest kill', Math.round(this.longest) + 'm']);
    const total = Math.max(0, Math.round(base + bonus));
    this.ctx.onEnd({
      won, reason: this.failReason, score: total, lines,
      shots: this.shots, hits: this.hits, headshots: this.headshots,
      longest: this.longest, civKills: this.civKills,
      time: this.time, def: this.def,
    });
  }
}
