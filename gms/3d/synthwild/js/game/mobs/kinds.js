// Behaviour + animation for each mob kind. `e` is the per-frame environment built by the mob manager:
// { dt, player:{x,y,z,eyeY}, dist, dy, los(), steer(), wander(), game, ctx, rng, daylight, night }

const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);

export function face(m, x, z, dt, rate = 8) {
  const want = Math.atan2(x, z);
  let d = want - m.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  m.yaw += d * Math.min(1, rate * dt);
}

export function walkAnim(legs, phase, amp, pairs = 2) {
  legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + (pairs === 4 ? (i === 0 || i === 3 ? 0 : Math.PI) : i * Math.PI)) * amp; });
}

export function wanderTick(m, e, speed) {
  m.wt -= e.dt;
  if (m.wt <= 0) {
    if (m.walking) { m.walking = false; m.wt = rand(1.5, 4.5); }
    else { m.walking = true; m.wt = rand(1, 3); m.wdir = Math.random() * TAU; }
  }
  if (m.walking) {
    const dx = Math.sin(m.wdir), dz = Math.cos(m.wdir);
    if (!e.safe(m, dx, dz)) { m.wdir += Math.PI * rand(0.5, 1.5); return 0; }
    m.wantX = dx * speed; m.wantZ = dz * speed;
    face(m, dx, dz, e.dt, 5);
    return speed;
  }
  return 0;
}

// ---------------- Bin-droid ibis ----------------
export const ibis = {
  name: 'Bin-droid Ibis', hostile: false, hp: 6, speed: 1.1, w: 0.45, h: 0.8, eye: 0.75,
  flutter: 2.2, knock: 1.2, step: 1,
  init(m) { m.wt = rand(0, 2); m.eggT = rand(300, 600); m.peck = 0; m.panic = 0; },
  think(m, e) {
    m.wantX = m.wantZ = 0;
    if (m.panic > 0) {
      m.panic -= e.dt;
      let dx = m.pos.x - e.player.x, dz = m.pos.z - e.player.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (!e.safe(m, dx, dz)) { const t = dx; dx = -dz; dz = t; }
      if (e.safe(m, dx, dz)) { m.wantX = dx * 3.2; m.wantZ = dz * 3.2; face(m, dx, dz, e.dt, 10); }
      m.moving = 3.2;
    } else {
      m.moving = wanderTick(m, e, this.speed);
      if (!m.walking && m.onGround && Math.random() < e.dt * 0.6) m.peck = 0.5;
    }
    m.eggT -= e.dt;
    if (m.eggT <= 0) { m.eggT = rand(300, 600); e.game.drops?.spawnItem('scrap_egg', 1, m.pos.x, m.pos.y + 0.3, m.pos.z); }
  },
  onHit(m) { m.panic = 3; },
  drops: [{ key: 'ibis_fibre', min: 1, max: 2 }, { key: 'scrap_egg', chance: 0.5 }],
  animate(m, dt) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 6 + m.moving * 3 : 0);
    walkAnim(p.legs, m.phase, m.moving ? 0.6 : 0);
    const air = !m.onGround;
    const flap = air || m.panic > 0 ? Math.sin(m.t * 26) * 0.7 + 0.5 : 0;
    p.wingL.rotation.z = -flap; p.wingR.rotation.z = flap;
    p.body.position.y = 0.5 + (m.moving ? Math.abs(Math.sin(m.phase)) * 0.03 : 0);
    if (m.peck > 0) m.peck -= dt;
    const peck = m.peck > 0 ? Math.sin((m.peck / 0.5) * Math.PI) : 0;
    p.neck.rotation.x = 0.2 + peck * 1.3 + (m.moving ? Math.sin(m.phase * 2) * 0.12 : 0);
    p.head.rotation.x = peck * 0.4;
  },
};

// ---------------- Glitchfuse ----------------
export const FUSE_TIME = 1.5;
export const EMP_RADIUS = 4.5;
export const glitchfuse = {
  name: 'Glitchfuse', hostile: true, hp: 20, speed: 2.4, w: 0.55, h: 1.7, eye: 1.4, knock: 1, step: 1,
  init(m) { m.wt = 0; m.fuse = 0; m.fusing = false; m.seen = 0; },
  think(m, e) {
    m.wantX = m.wantZ = 0;
    m.moving = 0;
    const close = e.dist < 3 && Math.abs(e.dy) < 2.5;
    const sees = e.dist < 18 && e.los();
    if (sees) m.seen = 4; else m.seen -= e.dt;
    if (m.fusing) {
      if (e.dist > 4.5 || (!sees && e.dist > 2)) {
        m.fusing = false;
        e.ctx.audio?.sfx?.('fuseCancel', { pos: m.pos });
      } else {
        m.fuse += e.dt;
        face(m, e.player.x - m.pos.x, e.player.z - m.pos.z, e.dt, 6);
        if (e.dist > 1.4) m.moving = e.steer(m, this.speed * 0.35);
        if (m.fuse >= FUSE_TIME) { e.explode(m); return; }
      }
    } else {
      m.fuse = Math.max(0, m.fuse - e.dt * 1.5);
      if (close && sees && !e.player.dead) {
        m.fusing = true;
        e.ctx.audio?.sfx?.('fuse', { pos: m.pos });
        e.ctx.bus?.emit?.('mob:fuse', { mob: m });
      } else if (m.seen > 0 && e.dist < 24 && !e.player.dead) {
        m.moving = e.steer(m, this.speed);
      } else m.moving = wanderTick(m, e, 0.8);
    }
  },
  drops: [{ key: 'carbon_nodule', min: 0, max: 2 }],
  animate(m, dt) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 9 : 0);
    walkAnim(p.legs, m.phase, m.moving ? 0.55 : 0, 4);
    const f = Math.min(1, m.fuse / FUSE_TIME);
    const active = f > 0.001;
    // Strobe: white <-> cyan, faster as the fuse burns down.
    const hz = 4 + 12 * f * f;
    m.strobe = (m.strobe || 0) + dt * hz;
    const on = Math.floor(m.strobe * 2) % 2 === 0;
    if (active && m.flash <= 0) {
      const u = m.parts.mat.userData.u.uFlash.value;
      if (on) u.set(1, 1, 1, 0.55 + 0.4 * f); else u.set(0, 0.62, 1, 0.5 + 0.45 * f);
    }
    const swell = 1 + 0.28 * f * f + (f > 0.75 ? Math.sin(m.t * 90) * 0.03 : 0);
    p.body.scale.set(swell, 1 + 0.12 * f * f, swell);
    p.head.rotation.x = -0.15 * f;
    p.ring.visible = p.halo.visible = p.glow.visible = active;
    if (active) {
      const r = EMP_RADIUS * (0.35 + 0.65 * Math.min(1, f * 1.6));
      p.ring.scale.setScalar(r);
      p.ring.rotation.z += dt * (1 + 4 * f);
      p.halo.scale.setScalar(0.7 + 1.2 * f);
      p.halo.rotation.y -= dt * (2 + 8 * f);
      if (f > 0.65 && !on) p.ringMat.color.setRGB(1, 0.05, 0.6); else if (on) p.ringMat.color.setRGB(1, 1, 1); else p.ringMat.color.setRGB(0, 0.75, 1);
      p.ringMat.opacity = (on ? 0.9 : 0.6) * Math.min(1, 0.4 + f);
      p.groundMat.color.copy(p.ringMat.color);
      p.groundMat.opacity = p.ringMat.opacity * 0.6;
      p.glow.scale.setScalar(0.8 + 3.2 * f);
      p.glow.material.opacity = (on ? 0.9 : 0.45) * (m.tint > 0.8 ? 0.35 : 1);
    }
  },
};

// ---------------- Reboot ----------------
export const WINDUP = 0.4;
export const reboot = {
  name: 'Reboot', hostile: true, hp: 20, speed: 1.9, w: 0.6, h: 1.85, eye: 1.6, knock: 0.9, step: 1,
  init(m) { m.wt = 0; m.atk = 0; m.cool = 0; m.burn = 0; m.seen = 0; m.twitch = 0; m.swing = 0; },
  think(m, e) {
    m.wantX = m.wantZ = 0;
    m.moving = 0;
    m.cool -= e.dt;
    if (m.swing > 0) m.swing -= e.dt;
    // Sunlight burns it out unless it reaches shade.
    if (e.sunlit(m)) {
      m.burn += e.dt;
      if (Math.random() < e.dt * 14) e.ctx.fx?.spark?.(m.pos.clone ? m.pos.clone().setY(m.pos.y + rand(0.4, 1.8)) : m.pos, 0xffaa33, 3);
      if (m.burn > 2.2) { e.burnOut(m); return; }
    } else m.burn = Math.max(0, m.burn - e.dt);
    const sees = e.dist < 20 && e.los();
    if (sees) m.seen = 5; else m.seen -= e.dt;
    if (m.atk > 0) {
      m.atk -= e.dt;
      face(m, e.player.x - m.pos.x, e.player.z - m.pos.z, e.dt, 10);
      if (m.atk <= 0) {
        m.swing = 0.25;
        m.cool = 1.1 * e.coolMul;
        if (e.dist < 2.2 && Math.abs(e.dy) < 1.8) e.hurtPlayer(3, 'reboot', m);
        else e.ctx.audio?.sfx?.('whiff', { pos: m.pos });
      }
      return;
    }
    if (m.seen > 0 && e.dist < 28 && !e.player.dead) {
      if (e.dist < 1.7 && Math.abs(e.dy) < 1.5 && m.cool <= 0) {
        m.atk = WINDUP;
        e.ctx.audio?.sfx?.('visor', { pos: m.pos });
        return;
      }
      if (e.dist > 1.2) m.moving = e.steer(m, this.speed);
      else face(m, e.player.x - m.pos.x, e.player.z - m.pos.z, e.dt, 8);
    } else m.moving = wanderTick(m, e, 0.7);
  },
  drops: [{ key: 'lattice_rod', min: 0, max: 2 }, { key: 'ferrite_ingot', chance: 0.06 }],
  animate(m, dt) {
    const p = m.parts;
    m.phase += dt * (m.moving ? 5.5 : 0);
    // Lurch: the left leg drags, the torso rolls over each step.
    p.legs[0].rotation.x = m.moving ? Math.sin(m.phase) * 0.55 : 0;
    p.legs[1].rotation.x = m.moving ? Math.sin(m.phase + Math.PI) * 0.3 : 0;
    p.hips.position.y = 0.82 + (m.moving ? Math.abs(Math.sin(m.phase)) * 0.05 : 0);
    p.torso.rotation.z = m.moving ? Math.sin(m.phase) * 0.14 : Math.sin(m.t * 1.3) * 0.04;
    m.twitch -= dt;
    if (m.twitch < -rand(1.5, 4)) m.twitch = 0.15;
    p.head.rotation.z = m.twitch > 0 ? 0.35 : 0;
    // Telegraph: visor flares 0.4 s before the swing, arms rear back.
    const w = m.atk > 0 ? 1 - m.atk / WINDUP : 0;
    const s = m.swing > 0 ? m.swing / 0.25 : 0;
    p.arms.forEach((a, i) => {
      a.rotation.x = -1.25 - w * 1.4 + s * 1.6 + (m.moving ? Math.sin(m.phase + i * Math.PI) * 0.12 : 0);
    });
    p.torso.rotation.x = 0.28 - w * 0.25 + s * 0.35;
    const flare = w > 0 ? 0.7 + w * 1.5 + Math.sin(m.t * 50) * 0.12 : 0.45 + Math.sin(m.t * 3) * 0.05;
    p.flare.scale.setScalar(flare);
    p.flare.material.opacity = w > 0 ? 1 : 0.7;
    p.core.scale.setScalar(w > 0 ? 0.15 + w * 0.45 : 0.01);
    if (w > 0 && m.flash <= 0) p.mat.userData.u.uFlash.value.set(1, 0.05, 0.1, 0.18 * w);
    if (m.burn > 0 && m.flash <= 0) p.mat.userData.u.uFlash.value.set(1, 0.55, 0.15, Math.min(0.7, m.burn * 0.35) * (0.6 + 0.4 * Math.sin(m.t * 30)));
  },
};

export const KINDS = { ibis, glitchfuse, reboot };
