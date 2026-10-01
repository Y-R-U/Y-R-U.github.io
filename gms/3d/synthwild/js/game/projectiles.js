// Pulse bolts: the player's Pulse Bow and the wireframe archer share this. Pooled meshes, cap 48.
const CAP = 48;

function segBox(o, d, len, b) {
  let t0 = 0, t1 = len;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < b[a] || o[a] > b[a + 3]) return -1; continue; }
    let ta = (b[a] - o[a]) / d[a], tb = (b[a + 3] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}

export class Projectiles {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;
    const T = (this.T = ctx.THREE);
    this.list = [];
    this.pool = [];
    this.group = new T.Group();
    this.group.name = 'projectiles';
    ctx.scene?.add(this.group);
    this.geo = new T.BoxGeometry(0.07, 0.07, 0.7);
    const mk = (c) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mats = { player: mk(0x7ff6ff), mob: mk(0xff4fd8) };
    this.v = new T.Vector3();
  }

  fire(from, vel, { owner = 'player', dmg = 3, gravity = 6, src = 'pulse', mob = null } = {}) {
    if (this.list.length >= CAP) this.kill(this.list[0]);
    const mesh = this.pool.pop() || new this.T.Mesh(this.geo, this.mats.player);
    mesh.material = this.mats[owner === 'player' ? 'player' : 'mob'];
    mesh.visible = true;
    this.group.add(mesh);
    const p = { x: from.x, y: from.y, z: from.z, vx: vel.x, vy: vel.y, vz: vel.z, g: gravity, owner, dmg, src, mob, life: 4, mesh };
    this.list.push(p);
    this.place(p);
    return p;
  }

  kill(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(p.mesh);
    this.pool.push(p.mesh);
  }

  place(p) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.lookAt(this.v.set(p.x + p.vx, p.y + p.vy, p.z + p.vz));
  }

  // player: { x, y, z, dead }
  update(dt, player) {
    const w = this.ctx.world, mobs = this.game.mobs;
    const pb = [player.x - 0.35, player.y, player.z - 0.35, player.x + 0.35, player.y + 1.8, player.z + 0.35];
    for (const p of [...this.list]) {
      p.life -= dt;
      if (p.life <= 0) { this.kill(p); continue; }
      p.vy -= p.g * dt;
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      const len = sp * dt;
      const o = [p.x, p.y, p.z], d = [p.vx / sp, p.vy / sp, p.vz / sp];
      let best = len, what = null, target = null;
      const wh = w?.raycast?.(o, d, len, { plants: false });
      if (wh && wh.dist < best) { best = wh.dist; what = 'world'; }
      if (p.owner === 'player') {
        const mh = mobs?.raycast(o, d, best);
        if (mh && mh.dist <= best) { best = mh.dist; what = 'mob'; target = mh.mob; }
      } else if (!player.dead) {
        const t = segBox(o, d, best, pb);
        if (t >= 0) { best = t; what = 'player'; }
      }
      p.x += d[0] * best; p.y += d[1] * best; p.z += d[2] * best;
      if (what) {
        const at = this.v.set(p.x, p.y, p.z).clone();
        if (what === 'mob') mobs.hit(target, p.dmg, { x: d[0], z: d[2] }, 'player');
        else if (what === 'player') this.game.hurtPlayer(p.dmg, p.src, { x: d[0] * 4, y: 2, z: d[2] * 4 });
        this.ctx.fx?.spark?.(at, p.owner === 'player' ? 0x7ff6ff : 0xff4fd8, 8);
        this.ctx.audio?.sfx?.('pulseHit', { pos: at });
        this.kill(p);
        continue;
      }
      this.place(p);
    }
  }

  clear() { for (const p of [...this.list]) this.kill(p); }
}
