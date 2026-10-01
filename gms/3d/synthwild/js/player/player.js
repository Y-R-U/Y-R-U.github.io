// ctx.player: movement, physics state, camera rig, avatar/hand. pos = feet centre (THREE.Vector3).
import { BODY, moveBody, canJumpOver, unstick, fallDamage, boxOf, boxHitsSolid } from './physics.js';
import { createCameraRig } from './camera.js';
import { initAvatarLib, setAvatarLight, createAvatar, createHand } from './avatar.js';
import { createAuto } from './auto.js';
import { BLOCKS } from '../data/blocks.js';

const PITCH_MAX = 1.55, STEP = 1 / 60, AIM_RANGE = 4.5, AIM_CONE = 0.22;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
// Ladders: data vines, lane 1's climb rail, or any block flagged climb:true. Kelp slows you down.
const CLIMB = new Uint8Array(256), KELP = new Uint8Array(256);
for (const b of BLOCKS) if (b) {
  if (b.climb || b.key === 'data_vine' || b.key === 'climb_rail') CLIMB[b.id] = 1;
  if (b.waterlogged && b.plant) KELP[b.id] = 1;
}
const CLIMB_UP = 2.8, CLIMB_SLIDE = 2.2;

export const player = {
  pos: null, vel: null, yaw: 0, pitch: 0, h: BODY.H, eyeH: BODY.EYE,
  onGround: false, inWater: false, headInWater: false, flying: false, crouching: false, sprinting: false,
  speed: 0, view: 'first', dead: false, ready: false,
  _ctx: null, _frame: -1, _fallPeak: null, _lastJump: 0, _stepDist: 0, _blocked: false, _pendingSpawn: null, _t: 0,

  init(ctx) {
    this._ctx = ctx;
    const { THREE } = ctx;
    this.pos = new THREE.Vector3(0.5, 40, 0.5);
    this.vel = new THREE.Vector3();
    this.rpos = this.pos.clone();      // interpolated render position
    this._prev = this.pos.clone();
    this._eye = new THREE.Vector3();
    this.view = ctx.settings?.get?.('view') === 'third' ? 'third' : 'first';
    this.rig = createCameraRig(ctx);
    initAvatarLib(THREE, ctx.sky?.uniforms);
    this.avatar = createAvatar();
    ctx.scene.add(this.avatar.root);
    this.hand = createHand();
    if (!ctx.camera.parent) ctx.scene.add(ctx.camera);
    ctx.camera.add(this.hand.root);
    this._solid = (x, y, z) => ctx.world?.isSolidSub(x, y, z) ?? false;

    const inp = ctx.input;
    // Lane 5's ui maps toggleView onto the 'view' setting; only handle it here when there is no ui.
    inp?.on?.('toggleView', () => { if (!ctx.ui) this.setView(this.view === 'first' ? 'third' : 'first'); });
    ctx.settings?.on?.('view', v => { this.view = v === 'third' ? 'third' : 'first'; });
    const bus = ctx.bus;
    bus?.on?.('player:death', () => { this.dead = true; this.vel.set(0, 0, 0); });
    bus?.on?.('player:respawn', d => {
      this.dead = false;
      const p = d?.pos;
      if (p) this.teleport(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z); else this.spawn();
    });
    bus?.on?.('player:knockback', d => { const v = d?.vel || d; if (v) this.knock(v[0] ?? v.x, v[1] ?? v.y, v[2] ?? v.z); });
    if (/[?&]auto=1/.test(location.search)) inp.auto = createAuto(ctx);
    import('../ui/icons.js').then(m => { this._iconURL = m.iconURL; this._handKey = null; }).catch(() => {});
    if (!this.ready) this.spawn();
  },

  setView(v) {
    v = v === 'third' ? 'third' : 'first';
    if (this.view === v) return;
    this.view = v;
    if (this._ctx.settings?.get?.('view') !== v) this._ctx.settings?.set?.('view', v);
  },
  eye(out = this._eye) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); },
  aabb() { return boxOf(this._body()); },
  get underwater() { return this.headInWater; },
  get target() { return this._ctx?.brush?.target || this._ctx?.brush?.mobTarget || null; },
  get camDistance() { return this.rig?.distance || 0; },
  get mode() { return this._ctx?.session?.mode || 'survival'; },

  spawn(x = 0.5, z = 0.5) { this._pendingSpawn = [x, z]; this.ready = false; },
  teleport(x, y, z) {
    this.pos.set(x, y, z); this.rpos?.copy(this.pos); this._prev?.copy(this.pos); this.vel.set(0, 0, 0); this._fallPeak = null; this._pendingSpawn = null; this.ready = true;
  },
  knock(vx, vy, vz) {
    if (typeof vx === 'object') ({ x: vx, y: vy, z: vz } = vx);
    this.vel.x += vx; this.vel.y = Math.max(this.vel.y, vy); this.vel.z += vz; this.onGround = false; this.flying = false; },
  swing() { this.hand?.swing(); this.avatar?.swingArm(); },

  serialize() {
    return { pos: this.pos.toArray(), yaw: this.yaw, pitch: this.pitch, flying: this.flying, view: this.view };
  },
  load(d) {
    if (!d?.pos) return this.spawn();
    this.teleport(d.pos[0], d.pos[1], d.pos[2]);
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0; this.flying = !!d.flying && this.mode === 'build';
  },

  _aimTarget(inp) {
    const ctx = this._ctx, mobs = ctx.game?.mobs?.list;
    if (!mobs?.length || inp.device !== 'touch' || !(ctx.settings?.get?.('aimAssist') ?? true) || this.dead) return null;
    const e = this.eye();
    let best = null, bestA = AIM_CONE;
    for (const m of mobs) {
      if (m.dying) continue;
      const dx = m.pos.x - e.x, dy = m.pos.y + (m.def?.h ?? 1) * 0.6 - e.y, dz = m.pos.z - e.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > AIM_RANGE || d < 0.3) continue;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const a = Math.hypot(wrapAngle(yaw - this.yaw), pitch - this.pitch);
      if (a < bestA) { bestA = a; best = { yaw, pitch, mob: m }; }
    }
    return best;
  },

  _body() { return { x: this.pos.x, y: this.pos.y, z: this.pos.z, h: this.h, onGround: this.onGround }; },
  // Samples the body (slightly inflated) for climbable and kelp cells: returns bit 1 = climb, 2 = kelp.
  _touching() {
    const w = this._ctx.world, p = this.pos, r = BODY.W / 2 + 0.08;
    let f = 0;
    for (const hy of [0.15, 0.9, this.h - 0.2]) for (const [ox, oz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const m = w.getSub(Math.floor((p.x + ox) * 4), Math.floor((p.y + hy) * 4), Math.floor((p.z + oz) * 4));
      f |= CLIMB[m] | (KELP[m] << 1);
      if (f === 3) return f;
    }
    return f;
  },
  _liquidAt(x, y, z) {
    const m = this._ctx.world?.getSub?.(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4));
    const b = BLOCKS[m];
    return !!(b && (b.liquid || b.waterlogged));
  },

  update(dt) {
    const ctx = this._ctx, inp = ctx.input, w = ctx.world;
    if (!ctx || this._frame === inp?.frame) return;
    this._frame = inp?.frame;
    dt = Math.min(dt, 0.1);
    this._t += dt;
    if (!w) return;

    if (this._pendingSpawn) {
      const [x, z] = this._pendingSpawn;
      if (w.isReady?.(x, z) ?? true) {
        const y = w.surfaceY?.(x, z);
        this.teleport(x, (Number.isFinite(y) ? y : 64) + 0.02, z);
      }
    }
    const frozen = !this.ready || this.dead || ctx.session?.paused || (w.isReady && !w.isReady(this.pos.x, this.pos.z));

    let ldx = inp.look.dx, ldy = inp.look.dy;
    const sticky = this._aimTarget(inp);
    if (sticky) {
      // Touch aim assist: slow the crosshair over a mob in melee range and drift gently onto it.
      ldx *= 0.55; ldy *= 0.55;
      const k = Math.min(1, dt * 2.5);
      ldx -= wrapAngle(sticky.yaw - this.yaw) * k;
      ldy -= (sticky.pitch - this.pitch) * k;
    }
    this.yaw -= ldx;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch - ldy));

    if (inp.pressed('jump')) this._jumpEdge = true;
    if (!frozen) {
      this._acc = Math.min((this._acc || 0) + dt, 0.1);
      while (this._acc >= STEP) {
        this._prev.copy(this.pos);
        this._simulate(STEP, inp, ctx, this._jumpEdge);
        this._jumpEdge = false;
        this._acc -= STEP;
      }
      this.rpos.lerpVectors(this._prev, this.pos, this._acc / STEP);
    } else { this._prev.copy(this.pos); this.rpos.copy(this.pos); }
    this._present(dt, ctx);
    ctx.brush?.update?.(dt);
  },

  _simulate(dt, inp, ctx, jumpEdge) {
    const build = this.mode === 'build';
    if (!build) this.flying = false;
    const solid = this._solid;
    const body = this._body();
    if (unstick(solid, body)) { this.pos.y = body.y; this.vel.y = 0; }

    if (jumpEdge) {
      const t = performance.now();
      if (build && t - this._lastJump < 320) { this.flying = !this.flying; this.vel.y = 0; this._lastJump = 0; }
      else this._lastJump = t;
    }

    const wantCrouch = inp.held.crouch && !this.flying && !this.climbing;
    if (wantCrouch) this.crouching = true;
    else if (this.crouching) {
      if (!boxHitsSolid(solid, boxOf({ ...body, h: BODY.H }))) this.crouching = false;
    }
    this.h = this.crouching ? BODY.CROUCH_H : BODY.H;

    this.inWater = this._liquidAt(this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.headInWater = this._liquidAt(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
    const feetWet = this.inWater || this._liquidAt(this.pos.x, this.pos.y + 0.05, this.pos.z);

    const touch = this._touching();
    this.climbing = !!(touch & 1) && !this.flying;
    const kelp = !!(touch & 2);
    const mx = inp.move.x, my = inp.move.y;
    this.sprinting = (inp.held.sprint || this.sprinting) && my > 0.5 && !this.crouching && !this.inWater;
    if (my <= 0.2) this.sprinting = false;
    const speed = this.flying ? BODY.FLY * (this.sprinting ? 1.8 : 1)
      : this.crouching ? BODY.CROUCH : this.inWater ? BODY.SWIM : this.sprinting ? BODY.SPRINT : BODY.WALK;
    const drag = kelp ? 0.55 : 1;
    // Off the ground on a ladder, forward turns into climbing (a free-hanging vine isn't walked through);
    // strafe is slow and pulling back steps off.
    let hx = mx, hy = my;
    if (this.climbing && !this.onGround) { hx = mx * 0.3; hy = my > 0 ? 0 : my * 0.5; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = (hx * cy - hy * sy) * speed * drag, wz = (-hx * sy - hy * cy) * speed * drag;
    const accel = this.flying ? 10 : this.onGround ? 16 : this.inWater ? 6 : 4;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    const v = this.vel;
    if (this.flying) {
      const vy = (inp.held.jump ? BODY.FLY_V : 0) - (inp.held.crouch ? BODY.FLY_V : 0);
      v.y += (vy - v.y) * Math.min(1, 12 * dt);
    } else if (this.climbing) {
      // Walk into it or hold jump to climb, crouch to hang still, otherwise slide down slowly.
      const up = inp.held.jump || my > 0.3;
      const target = up ? CLIMB_UP : inp.held.crouch ? 0 : -CLIMB_SLIDE;
      v.y += (target - v.y) * Math.min(1, 14 * dt);
    } else if (this.inWater) {
      const target = (inp.held.jump ? 3.2 : -1.4) * (kelp ? 0.7 : 1);
      v.y += (target - v.y) * Math.min(1, 4 * dt);
      if (inp.held.jump && !this.headInWater && this._blocked) v.y = 6.5;    // climb out onto a bank
    } else {
      v.y = Math.max(v.y - BODY.GRAVITY * dt, -BODY.TERMINAL);
      if (inp.held.jump && this.onGround) { v.y = BODY.JUMP_V; ctx.bus?.emit?.('player:jump'); }
      else if (this.onGround && this._blocked && (ctx.settings?.get?.('autoJump') ?? true) && Math.hypot(mx, my) > 0.4 &&
        canJumpOver(solid, body, wx * 0.08, wz * 0.08, 1.0)) {
        v.y = BODY.JUMP_V;
      }
    }

    const steps = Math.max(1, Math.ceil((Math.hypot(v.x, v.y, v.z) * dt) / 0.2));
    const h = dt / steps;
    let landed = false, blocked = false;
    const before = { x: body.x, z: body.z };
    for (let i = 0; i < steps; i++) {
      const r = moveBody(solid, body, v.x * h, v.y * h, v.z * h, { step: true, edgeGuard: this.crouching && !this.flying });
      if (r.hitY) { if (v.y < 0) landed = true; v.y = 0; }
      if (r.hitX) { v.x = 0; blocked = true; }
      if (r.hitZ) { v.z = 0; blocked = true; }
    }
    this._blocked = blocked;
    const wasGround = this.onGround;
    this.onGround = landed || (body.onGround && v.y <= 0);
    if (!this.onGround && v.y <= 0 && !this.flying) {
      const probe = { ...body };
      const r = moveBody(solid, probe, 0, -0.02, 0);
      if (r.hitY) this.onGround = true;
    }
    if (this.flying && landed) this.flying = false;
    this.pos.set(body.x, body.y, body.z);

    const moved = Math.hypot(body.x - before.x, body.z - before.z);
    this.speed += (moved / dt - this.speed) * 0.3;
    if (this.onGround && moved > 0) {
      this._stepDist += moved;
      if (this._stepDist > (this.sprinting ? 2.0 : 1.6)) {
        this._stepDist = 0;
        const m = ctx.world.getSub(Math.floor(body.x * 4), Math.floor(body.y * 4) - 1, Math.floor(body.z * 4));
        ctx.bus?.emit?.('player:step', { mat: m, sprint: this.sprinting });
      }
    }

    // Fall damage measured from the highest point since last on the ground / in water / flying.
    if (this.onGround || feetWet || this.flying || this.climbing) {
      if (this._fallPeak !== null && this.onGround && !feetWet && !this.flying && !this.climbing) {
        const d = this._fallPeak - this.pos.y;
        if (!wasGround) ctx.bus?.emit?.('player:land', { fall: d });
        const dmg = fallDamage(d);
        // Lane 4's survival already derives fall damage from this state; only emit when it isn't there.
        const noFall = ctx.settings?.get?.('noFallDamage') || this.mode === 'build' || ctx.game?.survival;
        if (dmg > 0 && !noFall) ctx.bus?.emit?.('player:damage', { amount: dmg, src: 'fall' });
      }
      this._fallPeak = this.pos.y;
    } else this._fallPeak = Math.max(this._fallPeak ?? this.pos.y, this.pos.y);
  },

  _present(dt, ctx) {
    const targetEye = this.crouching ? BODY.CROUCH_EYE : BODY.EYE;
    this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 14);
    this.rig.update(dt, this);
    const lw = ctx.world?.lightAt?.(this.rpos.x, this.rpos.y + this.eyeH, this.rpos.z);
    setAvatarLight(lw == null ? 15 : lw >> 4, lw == null ? 0 : lw & 15, this._t, dt);
    const third = this.view === 'third';
    const a = this.avatar;
    a.root.visible = third && this.ready && !this.dead;
    a.root.position.copy(this.rpos);
    a.root.rotation.y = this.yaw + Math.PI;
    a.update(dt, { speed: this.speed, crouch: this.crouching, flying: this.flying, swimming: this.inWater && !this.onGround, pitch: this.pitch, onGround: this.onGround });
    this.hand.root.visible = !third && !this.dead;
    const hv = ctx.game?.inv?.held?.() || (this.mode === 'build' ? ctx.brush?.heldBlock?.() : 0) || null;
    const hk = hv ? (typeof hv === 'number' ? 'b' + hv : hv.id) : '';
    if (hk !== this._handKey || (!this._handAtlas && ctx.render?.atlas)) {
      this._handKey = hk; this._handAtlas = !!ctx.render?.atlas;
      this.hand.setHeld(hv, { atlas: ctx.render?.atlas, iconURL: this._iconURL, blocks: BLOCKS });
    }
    this.hand.update(dt, this.speed, this.onGround);
  },
};

export default player;
