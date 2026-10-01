// Hide & Seek in a little Grower village.
//  Hide (default export): 30 s to hide (16 loam blocks to build a nook), then a Seeker drone with a visible scan
//  cone hunts for 2 minutes. Stay out of the cone!
//  Seek (seekGame): 4 Rivals hide while you count; find them in 3 minutes. A ping every 30 s points the way.
import { BotSquad, NAMES } from '../bots/index.js';
import { disposeObject } from '../../core/dispose.js';
import { pad, fill, put, W } from '../bots/arena.js';

const H = 17;
// Huts: centre and door side (dx,dz toward the street).
const HUTS = [[-10, -10, 1, 0], [10, -10, -1, 0], [-10, 10, 1, 0], [10, 10, -1, 0], [0, -12, 0, 1], [0, 12, 0, -1]];

function buildVillage(A) {
  pad(A, H, H, { floor: 'photomoss', under: 'loam_mesh', wall: 'fibre_stone', wallH: 4, glassTop: false });
  fill(A, -1, -1, -H, 1, -1, H, 'mirror_tile');      // streets
  fill(A, -H, -1, -1, H, -1, 1, 'mirror_tile');
  for (const [cx, cz, dx, dz] of HUTS) {
    fill(A, cx - 2, 0, cz - 2, cx + 2, 3, cz + 2, 'polymer_brick', 'hollow');
    fill(A, cx - 2, 3, cz - 2, cx + 2, 3, cz + 2, 'lattice_planks');
    fill(A, cx - 1, 0, cz - 1, cx + 1, 0, cz + 1, 'air');                            // hollow() floored it: ground level inside
    fill(A, cx + dx * 2, 0, cz + dz * 2, cx + dx * 2, 1, cz + dz * 2, 'air');          // door
    put(A, cx - dx * 2 + (dz ? 1 : 0), 1, cz - dz * 2 + (dx ? 1 : 0), 'clearglass');   // back window
    put(A, cx, 2, cz, 'glowbulb');
  }
  // Hedges with gaps, crate stacks and two trees.
  for (const s of [-1, 1]) {
    fill(A, 4, 0, s * 5, 7, 1, s * 5, 'solar_leaves');
    fill(A, -7, 0, s * 5, -4, 1, s * 5, 'solar_leaves');
    fill(A, s * 5, 0, -3, s * 5, 1, -2, 'solar_leaves');
    fill(A, s * 5, 0, 2, s * 5, 1, 3, 'solar_leaves');
    fill(A, s * 15, 0, -6, s * 15, 1, -5, 'lattice_planks');
    put(A, s * 15, 2, -6, 'lattice_planks');
    fill(A, s * 6, 0, s * 15, s * 7, 0, s * 15, 'lattice_planks');
    fill(A, s * 13, 0, s * 4, s * 13, 3, s * 4, 'carbon_log');
    fill(A, s * 13 - 2, 4, s * 4 - 2, s * 13 + 2, 5, s * 4 + 2, 'solar_leaves');
  }
  put(A, 0, 0, 0, 'light_panel');
}

// Standable hiding spots (relative cells): hut corners away from the door, behind hedges/crates, under trees.
function hideSpots() {
  const out = [];
  for (const [cx, cz, dx, dz] of HUTS) {
    out.push([cx - dx * 1 + (dz ? 1 : 0), 0, cz - dz * 1 + (dx ? 1 : 0)], [cx - dx * 1 - (dz ? 1 : 0), 0, cz - dz * 1 - (dx ? 1 : 0)]);
  }
  for (const s of [-1, 1]) out.push([5, 0, s * 6], [-5, 0, s * 6], [s * 6, 0, -3], [s * 16, 0, -6], [s * 6, 0, s * 16], [s * 14, 0, s * 5], [s * 12, 0, s * 3]);
  return out;
}

function makeDrone(T) {
  const g = new T.Group();
  const body = new T.Mesh(new T.SphereGeometry(0.42, 16, 12), new T.MeshBasicMaterial({ color: 0xe8f2ff }));
  const band = new T.Mesh(new T.TorusGeometry(0.46, 0.06, 6, 20), new T.MeshBasicMaterial({ color: 0x3a4458 }));
  band.rotation.x = Math.PI / 2;
  const eye = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), new T.MeshBasicMaterial({ color: 0xffd23d, toneMapped: false }));
  eye.position.z = 0.36;
  const head = new T.Group();
  head.add(body, band, eye);
  g.add(head);
  const RANGE = 11, ANG = 0.5;
  const coneGeo = new T.ConeGeometry(Math.tan(ANG) * RANGE, RANGE, 28, 1, true);
  coneGeo.translate(0, -RANGE / 2, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = new T.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.13, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  const cone = new T.Mesh(coneGeo, coneMat);
  head.add(cone);
  return { g, head, eye, cone, coneMat, RANGE, ANG };
}

const hide = {
  id: 'hideseek', name: 'Hide & Seek', icon: 'eye', minutes: 3,
  blurb: 'Hide from the Seeker drone. Stay out of its yellow scan cone for 2 minutes!',
  build(A) { this.A = A; buildVillage(A); },

  start(mg) {
    const { ctx } = mg, A = (this.A ||= mg.arena), T = ctx.THREE;
    Object.assign(this, { mg, ctx, phase: 'hide', t: 30, over: false, meter: 0, maxMeter: 0, survived: 0 });
    ctx.session.mgSurvival = false;
    ctx.sky?.setTime?.(0.32);
    const inv = ctx.game.inv;
    inv.clear(); inv.setSlot(0, ctx.game.items.id('loam_mesh'), 16); inv.select(0);
    const p = W(A, 0, 0, 2);
    ctx.player.teleport(p.x, p.y + 0.02, p.z); ctx.player.yaw = Math.PI; ctx.player.pitch = 0;
    ctx.game.setSpawn(p);
    this.d = makeDrone(T);
    ctx.scene?.add(this.d.g);
    this.dp = { x: A.origin.x + 0.5, y: A.origin.y + 8, z: A.origin.z + 0.5 };
    this.yaw = 0; this.pitch = -0.6; this.route = []; this.peek = 0;
    const speed = { easy: 2.6, normal: 3.3, hard: 4 }[mg.level] || 3.3;
    this.speed = speed;
    mg.hud.objective('Hide! The Seeker launches soon');
    mg.hud.score('🧱 16 blocks');
    mg.hud.big('HIDE!', 1.5);
  },

  // Patrol: street cruise points high up, then door peeks low down, in a shuffled order.
  nextLeg() {
    const A = this.A, o = A.origin;
    if (!this.route.length) {
      const peeks = HUTS.map(([cx, cz, dx, dz]) => ({ x: cx + dx * 3.2, z: cz + dz * 3.2, y: 1.3, look: [cx, cz], wait: 2.4 }));
      const cruise = [[0, 0], [-14, -14], [14, -14], [-14, 14], [14, 14], [0, -15], [0, 15], [-15, 0], [15, 0], [9, 0], [-9, 0], [0, 6], [0, -6]].map(([x, z]) => ({ x, z, y: 5.2, wait: 0.4 }));
      // Alternate a door peek with a street sweep so every hut gets checked about once a minute.
      peeks.sort(() => Math.random() - 0.5); cruise.sort(() => Math.random() - 0.5);
      this.route = peeks.flatMap((pk, i) => [cruise[i % cruise.length], pk]);
    }
    const w = this.route.shift();
    this.leg = { x: o.x + w.x + 0.5, y: o.y + w.y, z: o.z + w.z + 0.5, wait: w.wait, look: w.look && { x: o.x + w.look[0] + 0.5, z: o.z + w.look[1] + 0.5 } };
  },

  update(dt) {
    if (this.over) return;
    const { ctx, mg, d } = this;
    this.t -= dt;
    mg.hud.timer(this.t);
    const left = ctx.game.inv.count(ctx.game.items.id('loam_mesh'));
    mg.hud.score(`🧱 ${Math.floor(left)} blocks`);
    if (this.phase === 'hide') {
      if (this.t <= 3.5 && !this.warned) { this.warned = true; mg.hud.big('Ready or not…', 2); }
      if (this.t <= 0) { this.phase = 'seek'; this.t = 120; mg.hud.big('Here it comes!', 1.6); mg.hud.objective('Stay out of the yellow cone!'); this.nextLeg(); ctx.audio?.sfx?.('droneOn'); }
      this.draw(dt, false);
      return;
    }
    // Fly the leg.
    const L = this.leg, p = this.dp;
    const dx = L.x - p.x, dy = L.y - p.y, dz = L.z - p.z, dist = Math.hypot(dx, dy, dz);
    if (dist > 0.15) {
      const s = Math.min(dist, this.speed * dt);
      p.x += (dx / dist) * s; p.y += (dy / dist) * s; p.z += (dz / dist) * s;
      if (Math.hypot(dx, dz) > 0.3) this.wantYaw = Math.atan2(dx, dz);
      this.wantPitch = L.y < 3 ? -0.15 : -0.75;
    } else if ((L.wait -= dt) <= 0) this.nextLeg();
    if (L.look && dist < 0.5) { this.wantYaw = Math.atan2(L.look.x - p.x, L.look.z - p.z); this.wantPitch = -0.12; }
    // Sweep side to side while cruising.
    const peeking = L.look && dist < 0.5;
    const sweep = Math.sin(performance.now() / (peeking ? 450 : 700)) * (peeking ? 0.75 : 0.55);
    let a = (this.wantYaw ?? 0) + sweep - this.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
    this.yaw += a * Math.min(1, dt * 3);
    this.pitch += ((this.wantPitch ?? -0.6) - this.pitch) * Math.min(1, dt * 2);

    // Detection.
    const P = ctx.player.pos;
    const fwd = [Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)];
    let seen = false;
    for (const hy of [1.5, 0.9]) {
      const tx = P.x - p.x, ty = P.y + hy - p.y, tz = P.z - p.z, td = Math.hypot(tx, ty, tz);
      if (td < 1.6) { seen = true; break; }
      if (td > d.RANGE) continue;
      const cos = (tx * fwd[0] + ty * fwd[1] + tz * fwd[2]) / td;
      if (cos < Math.cos(d.ANG)) continue;
      const hit = ctx.world.raycast?.([p.x, p.y, p.z], [tx / td, ty / td, tz / td], td, { plants: false });
      if (!hit || hit.dist >= td - 0.35) { seen = true; break; }
    }
    this.meter = Math.max(0, this.meter + (seen ? dt * (Math.hypot(P.x - p.x, P.z - p.z) < 5 ? 1.6 : 1) : -dt * 0.5));
    this.maxMeter = Math.max(this.maxMeter, this.meter);
    if (seen && !this.beeped) { this.beeped = true; ctx.audio?.sfx?.('droneSpot'); }
    if (!seen) this.beeped = false;
    this.draw(dt, seen);
    if (this.meter >= 0.75) return this.finish(false);
    if (this.t <= 0) return this.finish(true);
  },

  draw(dt, seen) {
    const { d } = this;
    d.g.position.set(this.dp.x, this.dp.y + Math.sin(performance.now() / 300) * 0.08, this.dp.z);
    d.head.rotation.set(0, 0, 0);
    d.head.rotation.order = 'YXZ';
    d.head.rotation.y = this.yaw; d.head.rotation.x = -this.pitch;
    d.cone.visible = this.phase === 'seek';
    const hot = Math.min(1, this.meter / 0.75);
    d.coneMat.color.setRGB(1, 0.82 * (1 - hot), 0.24 * (1 - hot));
    d.coneMat.opacity = 0.12 + 0.25 * hot + (seen ? 0.06 * Math.sin(performance.now() / 50) : 0);
    d.eye.material.color.copy(d.coneMat.color);
  },

  finish(won) {
    this.over = true;
    const surv = won ? 120 : 120 - Math.max(0, this.t);
    const stars = won ? (this.maxMeter < 0.35 ? 3 : 2) : surv >= 60 ? 1 : 0;
    this.mg.finish({ won, stars, score: Math.round(surv), title: won ? 'Never found!' : 'Spotted!', text: won ? (stars === 3 ? 'The Seeker never even got close.' : 'Phew, that was close!') : `You stayed hidden for ${Math.round(surv)} s.` });
  },

  end() { disposeObject(this.d?.g); },
};

export const seekGame = {
  id: 'hideseek-seek', name: 'Hide & Seek: Seeker', icon: 'search', minutes: 4,
  blurb: 'Four Rivals hide in the village. Find them all before time runs out!',
  build(A) { this.A = A; buildVillage(A); },

  start(mg) {
    const { ctx } = mg, A = (this.A ||= mg.arena);
    Object.assign(this, { mg, ctx, phase: 'count', t: 15, over: false, pingT: 30, found: 0 });
    ctx.session.mgSurvival = false;
    ctx.sky?.setTime?.(0.3);
    ctx.game.inv.clear();
    this.centre = W(A, 0, 0, 2);
    const sq = (this.squad = new BotSquad(ctx, { level: mg.level }));
    const spots = hideSpots().sort(() => Math.random() - 0.5);
    for (let i = 0; i < 4; i++) {
      const s = W(A, (i - 1.5) * 1.2, 0, -1);
      const b = sq.add({ name: NAMES[(i * 3 + 2) % NAMES.length], team: i % 2 ? 'green' : 'gold', x: s.x, y: s.y, z: s.z });
      const h = spots[i];
      b.spot = [A.origin.x + h[0], A.origin.y + h[1], A.origin.z + h[2]];
      b.goTo(...b.spot, 0.3);
      b.hideTag = false;
    }
    sq.onTag = (bot) => { if (this.phase !== 'seek' || bot.mem.found) return false; this.foundBot(bot); return true; };
    ctx.player.teleport(this.centre.x, this.centre.y + 0.02, this.centre.z);
    ctx.player.yaw = 0; ctx.player.pitch = -1.2;
    mg.hud.objective('Eyes closed! Counting…');
    mg.hud.score('Found 0 / 4');
  },

  foundBot(b) {
    b.mem.found = true;
    this.found++;
    this.ctx.fx?.spark?.({ x: b.x, y: b.y + 1.8, z: b.z }, 0xffd25e, 14);
    this.ctx.audio?.sfx?.('found');
    this.mg.hud.toast(`Found ${b.name}!`);
    this.mg.hud.score(`Found ${this.found} / 4`);
    b.goTo(Math.floor(this.centre.x) + (this.found - 2), Math.floor(this.centre.y), Math.floor(this.centre.z) - 3, 0.5);
    if (this.found >= 4) this.finish();
  },

  update(dt) {
    if (this.over) return;
    const { ctx, mg, squad } = this;
    const P = ctx.player.pos;
    this.t -= dt;
    mg.hud.timer(this.t);
    squad.update(dt);
    if (this.phase === 'count') {
      // Keep the seeker in place, looking at the floor.
      ctx.player.teleport(this.centre.x, this.centre.y + 0.02, this.centre.z);
      ctx.player.pitch = -1.25;
      const n = Math.ceil(this.t);
      if (n !== this.lastN) { this.lastN = n; mg.hud.big(n > 0 ? String(n) : 'Coming, ready or not!', n > 0 ? 0.9 : 1.6); }
      if (this.t <= 0) {
        for (const b of squad.list) { if (!b.arrived(0.8)) b.teleport(b.spot[0] + 0.5, b.spot[1], b.spot[2] + 0.5); b.stop(); b.hideTag = true; b.yaw = Math.random() * 6.28; }
        this.phase = 'seek'; this.t = 180; ctx.player.pitch = 0;
        mg.hud.objective('Find all 4 Rivals! Tap them when you spot them');
      }
      return;
    }
    for (const b of squad.list) {
      if (b.mem.found) continue;
      const d = Math.hypot(b.x - P.x, b.y - P.y, b.z - P.z);
      if (d < 2.2 && squad.los({ x: P.x, y: P.y + 1.6, z: P.z }, { x: b.x, y: b.y + 1.4, z: b.z })) this.foundBot(b);
    }
    if ((this.pingT -= dt) <= 0) { this.pingT = 30; this.ping(); }
    if (this.t <= 0) this.finish();
  },

  // A faint pointer toward the nearest Rival still hiding.
  ping() {
    const P = this.ctx.player.pos, cam = this.ctx.camera;
    const left = this.squad.list.filter((b) => !b.mem.found);
    if (!left.length) return;
    const b = left.sort((a, c) => a.dist(P) - c.dist(P))[0];
    const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz);
    for (let i = 1; i <= 4; i++) this.ctx.fx?.spark?.({ x: P.x + (dx / d) * i * 1.2, y: P.y + 1.2, z: P.z + (dz / d) * i * 1.2 }, 0xffd25e, 3);
    const f = cam?.getWorldDirection ? cam.getWorldDirection(new this.ctx.THREE.Vector3()) : { x: 0, z: -1 };
    const ang = Math.atan2(dx * f.z - dz * f.x, dx * f.x + dz * f.z);
    const arrow = Math.abs(ang) < 0.6 ? '⬆ ahead' : Math.abs(ang) > 2.5 ? '⬇ behind you' : ang > 0 ? '⬅ to your left' : '➡ to your right';
    this.mg.hud.toast(`Ping! Someone is ${arrow}, ${d < 10 ? 'close' : 'far'}`, 3);
    this.ctx.audio?.sfx?.('ping');
  },

  finish() {
    this.over = true;
    const all = this.found >= 4;
    const stars = all ? (this.t > 90 ? 3 : this.t > 30 ? 2 : 1) : this.found >= 2 ? 1 : 0;
    this.mg.finish({ won: all, stars, score: this.found, title: all ? 'Found everyone!' : `Found ${this.found} of 4`, text: all ? `With ${Math.round(this.t)} s to spare.` : 'They were sneaky this time!' });
  },

  end() { this.squad?.clear(); },
};

export default hide;
