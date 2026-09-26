import * as THREE from 'three';
import { addStatus } from '../sim/stats.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const CYAN = 0x7ff6ff, ION = 0xb080ff, GOLD = 0xffc860;

// Frame skills (DESIGN §5.2–5.5) by skill kind. The sim spends energy/cooldowns (useSkill) and applies self
// statuses; this file does the world side: geometry tests, knockback, summons, decoys, cloak and all the feedback.
export function createKits(K) {
  const { ctx, sim, fx, audio, ui, player, strike, pickTarget, faceTo, muzzle } = K;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const S = { timers: [], dash: null, charge: null, turrets: [], wall: null, cloak: null, blinkBank: 1, blinkSkill: null, still: 0, steadyShown: false };
  const later = (t, fn) => S.timers.push({ t, fn });
  const shake = (s) => { ctx.rig.shake = Math.max(ctx.rig.shake, s); };
  const at = (x, y, z) => v.set(x, y, z);
  const fwd = () => ({ x: Math.sin(player.yaw), z: Math.cos(player.yaw) });

  // aim: locked or nearest target within range, else facing
  function aimAt(range) {
    const t = pickTarget(range, { cone: Math.PI, prefer: K.api.lock });
    if (t) faceTo(t, 0.3);
    return t;
  }

  function cast(sk, pc) {
    switch (sk.kind) {
      case 'ranged': return zap(sk, pc);
      case 'self': return self(sk, pc);
      case 'distract': return distract(sk, pc);
      case 'aoe': return slam(sk, pc);
      case 'dash': return charge(sk, pc);
      case 'cone': return scatter(sk, pc);
      case 'line': return rail(sk, pc);
      case 'summon': return turret(sk, pc);
      case 'blink': return blink(sk, pc);
      case 'hack': return pulse(sk, pc);
      default: return false;
    }
  }
  const use = (pc, sk) => sim.useSkill(pc, sk);

  // --- rental ----------------------------------------------------------------------------------------
  function zap(sk, pc) {
    const t = pickTarget(sk.range || 14, { cone: Math.PI, prefer: K.api.lock, los: true });
    if (!t) { ui.toast('No target in range', 'warn', { ms: 1200 }); audio.sfx('ui_deny', { vol: 0.5 }); return false; }
    if (!use(pc, sk)) return false;
    faceTo(t); K.api.lock = t;
    K.actor().play(sk.anim || 'shoot', { loop: false });
    later(0.18, () => {
      if (t.state === 'dead' && !t.prop) return;
      const from = muzzle();
      const to = new THREE.Vector3(t.pos.x, t.pos.y + (t.prop ? 0.5 : 1.0 * (t.bot?.root.scale.y || 1) * Math.min(1, (t.bot?.height || 1.6) / 1.6)), t.pos.z);
      fx.tracer(from, to, 0x9fe8ff, 0.16, 1.4);
      fx.flash(from, 0.25, 0x9fe8ff);
      audio.sfx('laser', { x: player.pos.x, z: player.pos.z, vol: 0.8 });
      const r = strike(pc, t, sk, { knock: 2.5 });
      if (r && !r.miss) { ctx.hitstop(0.04); shake(0.05); }
    });
    return true;
  }

  function distract(sk, pc) {
    if (!use(pc, sk)) return false;
    K.actor().play(sk.anim || 'cast', { loop: false });
    fx.advert(player.pos, sk.applies?.[0]?.t || 2.6);
    fx.ring(player.pos, sk.radius || 6, 0x8fe8ff, 0.6);
    audio.sfx('scan', { vol: 0.8 });
    let n = 0;
    for (const e of ctx.enemies.alive()) {
      if (e.pos.distanceTo(player.pos) > (sk.radius || 6)) continue;
      for (const a of sk.applies || []) if (addStatus(e.c, { ...a, src: 'player' })) n++;
      e.pending = null;
    }
    if (n) ui.toast(`${n} distracted`, 'info', { ms: 1200 });
    return true;
  }

  function self(sk, pc) {
    if (!use(pc, sk)) return false;
    K.actor().play(sk.anim || 'cast', { loop: false });
    if (sk.id === 'h_veil') {
      fx.ring(player.pos, 2.2, CYAN, 0.45);
      fx.beam(player.pos, CYAN, 0.5, 2.6, 0.7);
      audio.sfx('scan', { vol: 0.6 });
      ctx.enemies.loseTrack(player.pos, 30);
    } else if (sk.id === 'b_bulwark') {
      wallOn(sk);
      ctx.enemies.taunt(player.pos.x, player.pos.z, sk.radius || 10, 5);
      fx.ring(player.pos, sk.radius || 10, GOLD, 0.6);
      audio.sfx('shield_hit', { vol: 1 });
      audio.sfx('explosion_small', { vol: 0.4 });
      shake(0.12);
      if (sk.restoreShieldPct) pc.shield = Math.min(pc.stats.shield, pc.shield + pc.stats.shield * sk.restoreShieldPct);
    } else {
      fx.ring(player.pos, 2.5, 0xffb060, 0.5);
      audio.sfx('scan', { vol: 0.8 });
      ui.toast(sk.name, 'good', { ms: 1400, icon: sk.icon });
    }
    return true;
  }

  // --- brawler -----------------------------------------------------------------------------------------
  function aoeHit(pc, cx, cz, r, sk, { falloff = 1, knock = 4, color = GOLD } = {}) {
    const center = { x: cx, z: cz };
    let n = 0;
    for (const e of K.targets()) {
      const d = Math.hypot(e.pos.x - cx, e.pos.z - cz) - (e.radius || 0.4) * 0.5;
      if (d > r) continue;
      strike(pc, e, sk, { knock: knock * (1 - Math.min(0.6, d / r * 0.5)), from: center, falloff, quiet: n > 3 });
      n++;
    }
    ctx.props.splash(cx, cz, r, 30);
    const p = at(cx, ctx.world.groundAt(cx, cz), cz);
    fx.ring(p, r, color, 0.45);
    fx.ring(p, r * 0.55, 0xffffff, 0.3);
    fx.sparks(at(cx, p.y + 0.3, cz), color, 22, 9);
    fx.flash(at(cx, p.y + 0.4, cz), 1.2, 0xfff0c0, 0.14);
    audio.sfx('explosion', { x: cx, z: cz, vol: 0.9 });
    shake(0.3);
    if (n) ctx.hitstop(0.08);
    return n;
  }

  function slam(sk, pc) {
    if (!use(pc, sk)) return false;
    aimAt(6);
    K.actor().play('attack_heavy', { loop: false, speed: 1.45 });
    const r = (sk.radius || 4) * (1 + (pc.stats.aoePct || 0));
    if (sk.pull) later(0.12, () => { for (const e of ctx.enemies.alive()) { const d = e.pos.distanceTo(player.pos); if (d < r + sk.pull && d > 1.2) ctx.enemies.knock(e, player.pos.x, player.pos.z, -Math.min(9, (d - 1) * 3)); } fx.ring(player.pos, r + sk.pull, 0x9fe8ff, 0.3); });
    later(0.3, () => {
      const f = fwd();
      aoeHit(pc, player.pos.x + f.x * 0.8, player.pos.z + f.z * 0.8, r, sk);
      if (sk.echo) later(sk.echo.delay || 1, () => aoeHit(pc, player.pos.x, player.pos.z, r, sk, { falloff: sk.echo.pct || 0.5, knock: 2, color: 0xffe0a0 }));
    });
    return true;
  }

  function charge(sk, pc) {
    if (!use(pc, sk)) return false;
    const t = aimAt(sk.range + 2);
    let dx = Math.sin(player.yaw), dz = Math.cos(player.yaw);
    if (t) { const l = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z) || 1; dx = (t.pos.x - player.pos.x) / l; dz = (t.pos.z - player.pos.z) / l; }
    const dur = 0.34;
    player.dodge(dx, dz, sk.range || 8, dur);
    K.actor().play('dodge', { loop: false, speed: 1.1 });
    S.dash = { sk, t: dur + 0.05, hit: new Set(), dx, dz };
    audio.sfx('dodge', { vol: 1 });
    audio.sfx('explosion_small', { vol: 0.5 });
    shake(0.08);
    return true;
  }

  function dashTick(dt, pc) {
    const D = S.dash;
    D.t -= dt;
    fx.sparks(at(player.pos.x, player.pos.y + 0.6, player.pos.z), 0xffa040, 2, 3);
    ctx.props.splash(player.pos.x, player.pos.z, D.sk.radius || 1.6, 30);
    for (const e of K.targets()) {
      if (D.hit.has(e)) continue;
      if (Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) - (e.radius || 0.4) > (D.sk.radius || 1.6)) continue;
      D.hit.add(e);
      const sk = D.sk;
      strike(pc, e, sk, { knock: (sk.knockback || 3) * 2.2 });
      if (e.c && sk.endStun) later(Math.max(0, D.t), () => e.c.alive && addStatus(e.c, { id: 'stun', t: sk.endStun, stun: true, src: 'player' }));
      ctx.hitstop(0.05); shake(0.16);
    }
    if (D.t <= 0) {
      fx.ring(player.pos, 2.4, 0xffa040, 0.35);
      if (D.hit.size) audio.sfx('melee_hit', { vol: 1 });
      S.dash = null;
    }
  }

  function wallOn(sk) {
    wallOff();
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.1, 20, 1, true, -Math.PI / 3, Math.PI * 2 / 3), mat);
    m.position.set(0, 1.05, 0);
    g.add(m);
    K.actor().root.add(g);
    S.wall = { g, mat, t: sk.selfStatus?.[0]?.t || 5 };
  }
  function wallOff() { if (!S.wall) return; S.wall.g.parent?.remove(S.wall.g); S.wall.g.children[0].geometry.dispose(); S.wall.mat.dispose(); S.wall = null; }

  // --- gunner ------------------------------------------------------------------------------------------
  function scatter(sk, pc) {
    const t = aimAt((sk.range || 7) + 3);
    if (!use(pc, sk)) return false;
    K.actor().play('shoot', { loop: false, speed: 1.2 });
    const from = muzzle();
    const arc = (sk.arc || 60) * Math.PI / 180, n = sk.pellets || 8, range = sk.range || 7;
    const base = t ? Math.atan2(t.pos.x - player.pos.x, t.pos.z - player.pos.z) : player.yaw;
    const cand = K.targets();
    const psk = sk;
    for (let i = 0; i < n; i++) {
      const a = base - arc / 2 + arc * (i + 0.5) / n + (Math.random() - 0.5) * arc / n * 0.6;
      let best = null, bd = range;
      for (const e of cand) {
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d > bd + (e.radius || 0.4)) continue;
        const half = Math.atan2((e.radius || 0.45) + 0.35, Math.max(0.5, d));
        if (Math.abs(angDiff(Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z), a)) > half) continue;
        best = e; bd = d;
      }
      const len = best ? bd : range * (0.7 + Math.random() * 0.3);
      fx.tracer(from, at(player.pos.x + Math.sin(a) * len, from.y - 0.2, player.pos.z + Math.cos(a) * len).clone(), 0xffd080, 0.09, 0.7);
      if (best) strike(pc, best, psk, { knock: (sk.knockback || 3) / 2, pellet: true, quiet: i % 2 === 1 });
    }
    fx.flash(from, 0.5, 0xffd080, 0.08);
    audio.sfx('shoot', { vol: 1 }); audio.sfx('explosion_small', { vol: 0.5 });
    shake(0.12);
    return true;
  }

  function rail(sk, pc) {
    if (!use(pc, sk)) return false;
    const t = aimAt(sk.range || 30);
    addStatus(pc, { id: 'railcharge', t: sk.charge || 0.8, moveMult: sk.chargeMove || 0.5, src: 'player' });
    K.actor().play('shoot', { loop: false, speed: 0.6 });
    S.charge = { sk, t: sk.charge || 0.8, target: t, glowT: 0 };
    audio.sfx('scan', { vol: 0.7 });
    return true;
  }

  function railTick(dt, pc) {
    const C = S.charge;
    C.t -= dt;
    if (C.target && C.target.state !== 'dead' && !C.target.destroyed) faceTo(C.target, 0.2);
    if ((C.glowT -= dt) <= 0) { C.glowT = 0.08; fx.flash(muzzle(), 0.25 + (1 - C.t / (C.sk.charge || 0.8)) * 0.35, ION, 0.1); }
    if (C.t > 0) return;
    S.charge = null;
    const sk = C.sk;
    const from = muzzle(), yaw = player.yaw, range = sk.range || 30, w = (sk.width || 1.2) / 2;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const hits = [];
    let end = range;
    for (const e of K.targets()) {
      const rx = e.pos.x - player.pos.x, rz = e.pos.z - player.pos.z;
      const along = rx * dx + rz * dz, perp = Math.abs(rx * dz - rz * dx);
      if (along < 0 || along > range || perp > w + (e.radius || 0.4)) continue;
      if (!e.prop && !ctx.losClear(player.pos, e.pos)) continue;
      hits.push([along, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    // the beam stops at the first wall
    for (let s = 1; s < range; s += 1) if (ctx.world.blocked(player.pos.x + dx * s, player.pos.z + dz * s, 0.05)) { end = s; break; }
    let last = null;
    for (const [along, e] of hits) { if (along > end) break; strike(pc, e, sk, { knock: 5 }); last = e; }
    const to = at(player.pos.x + dx * end, from.y, player.pos.z + dz * end).clone();
    fx.tracer(from, to, ION, 0.3, 3.2);
    fx.tracer(from, to, 0xffffff, 0.12, 1.2);
    fx.flash(from, 0.9, ION, 0.14);
    for (let s = 2; s < end; s += 2) ctx.props.splash(player.pos.x + dx * s, player.pos.z + dz * s, w + 0.3, 30);
    for (let s = 2; s < end; s += 3) fx.sparks(at(player.pos.x + dx * s, from.y, player.pos.z + dz * s), ION, 2, 2);
    audio.sfx('laser', { vol: 1 }); audio.sfx('explosion_small', { vol: 0.6 });
    shake(0.18); ctx.hitstop(0.06);
    if (sk.bounces && last) {
      const nx = K.targets().filter((o) => o !== last && !o.prop && o.pos.distanceTo(last.pos) < 12 && !hits.some((h) => h[1] === o)).sort((a, b) => a.pos.distanceTo(last.pos) - b.pos.distanceTo(last.pos))[0];
      if (nx) {
        fx.tracer(at(last.pos.x, last.pos.y + 1, last.pos.z).clone(), at(nx.pos.x, nx.pos.y + 1, nx.pos.z).clone(), ION, 0.25, 2);
        strike(pc, nx, sk, { knock: 3, falloff: 0.8 });
      }
    }
  }

  const turretGeo = {};
  function turretMesh() {
    if (!turretGeo.leg) {
      turretGeo.leg = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6);
      turretGeo.body = new THREE.BoxGeometry(0.42, 0.3, 0.5);
      turretGeo.barrel = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
      turretGeo.eye = new THREE.SphereGeometry(0.07, 8, 6);
      turretGeo.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 1, roughness: 0.18 });
      turretGeo.dark = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.8, roughness: 0.35 });
      turretGeo.glow = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
    }
    const G = turretGeo, g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(G.leg, G.dark); const a = i * Math.PI * 2 / 3; l.position.set(Math.sin(a) * 0.22, 0.4, Math.cos(a) * 0.22); l.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); g.add(l); }
    const head = new THREE.Group(); head.position.y = 0.92; g.add(head);
    const b = new THREE.Mesh(G.body, G.chrome); head.add(b);
    const br = new THREE.Mesh(G.barrel, G.dark); br.rotation.x = Math.PI / 2; br.position.set(0, 0.02, 0.4); head.add(br);
    const e = new THREE.Mesh(G.eye, G.glow); e.position.set(0, 0.1, 0.26); head.add(e);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.head = head;
    return g;
  }

  function turret(sk, pc) {
    if (!use(pc, sk)) return false;
    K.actor().play('cast', { loop: false });
    const count = sk.summonCount || 1;
    for (let i = 0; i < count; i++) {
      const f = fwd(), side = count > 1 ? (i ? 1 : -1) * 1.1 : 0;
      let x = player.pos.x + f.x * 1.6 + f.z * side, z = player.pos.z + f.z * 1.6 - f.x * side;
      if (ctx.world.blocked(x, z, 0.4)) { x = player.pos.x; z = player.pos.z; }
      const g = turretMesh();
      g.position.set(x, ctx.world.groundAt(x, z), z);
      g.scale.setScalar(0.01);
      ctx.world.scene.add(g);
      const sm = sk.summon || {};
      const decoy = ctx.enemies.addDecoy({ x, z, t: sm.t || 10, hp: pc.stats.hp * 0.6, radius: 12, kind: 'turret' });
      S.turrets.push({ g, t: sm.t || 10, fireT: 0.4, rate: sm.rate || 3, range: sm.range || 14, sk, decoy, grow: 0,
        shot: { id: 'g_turret_shot', name: 'Drone Turret', kind: 'ranged', base: (sm.base || 5) * (sk.summonCount > 1 ? 0.6 : 1), element: 'kinetic', fromSummon: true } });
      fx.beam(g.position, 0x9fe8ff, 0.4, 3, 0.8);
      fx.ring(g.position, 1.6, 0x9fe8ff, 0.4);
    }
    audio.sfx('pickup', { vol: 0.8 }); audio.sfx('scan', { vol: 0.5 });
    return true;
  }

  function turretTick(dt, pc) {
    for (let i = S.turrets.length - 1; i >= 0; i--) {
      const T = S.turrets[i];
      T.t -= dt; T.grow = Math.min(1, T.grow + dt * 4);
      T.g.scale.setScalar(0.2 + 0.8 * T.grow);
      if (T.t <= 0 || T.decoy.dead) {
        fx.flash(at(T.g.position.x, T.g.position.y + 0.9, T.g.position.z), 0.8, 0x9fe8ff, 0.14);
        fx.sparks(at(T.g.position.x, T.g.position.y + 0.9, T.g.position.z), 0x9fe8ff, 10, 4);
        ctx.world.scene.remove(T.g);
        ctx.enemies.removeDecoy(T.decoy);
        S.turrets.splice(i, 1);
        continue;
      }
      let best = null, bd = T.range;
      for (const e of ctx.enemies.alive()) {
        if (e.ally) continue;
        const d = e.pos.distanceTo(T.g.position);
        if (d < bd && ctx.losClear(T.g.position, e.pos)) { bd = d; best = e; }
      }
      const head = T.g.userData.head;
      if (best) head.rotation.y += angDiff(Math.atan2(best.pos.x - T.g.position.x, best.pos.z - T.g.position.z), head.rotation.y) * Math.min(1, dt * 12);
      if (best && (T.fireT -= dt) <= 0) {
        T.fireT = 1 / T.rate;
        const from = at(T.g.position.x, T.g.position.y + 0.95, T.g.position.z).clone();
        const to = new THREE.Vector3(best.pos.x + (Math.random() - 0.5) * 0.3, best.pos.y + 1, best.pos.z + (Math.random() - 0.5) * 0.3);
        fx.tracer(from, to, 0x9fe8ff, 0.07, 0.5);
        audio.sfx('shoot', { x: from.x, z: from.z, vol: 0.3, minGap: 90 });
        strike(pc, best, T.shot, { knock: 0.3, quiet: true });
        if (T.sk.splash) for (const o of ctx.enemies.alive()) if (o !== best && o.pos.distanceTo(best.pos) < T.sk.splash) strike(pc, o, T.shot, { falloff: 0.5, quiet: true });
      }
    }
  }

  // --- ghost ---------------------------------------------------------------------------------------------
  function blink(sk, pc) {
    if (!use(pc, sk)) return false;
    // Double Blink: a banked charge clears the cooldown once; the bank refills when the cooldown ends (update)
    if (sk.charges > 1 && S.blinkBank > 0) { S.blinkBank--; delete pc.cooldowns[sk.id]; }
    S.blinkSkill = sk;
    const from = player.pos.clone();
    const range = sk.range || 7;
    let tx, tz, face = player.yaw;
    const t = !player.stickActive ? pickTarget(range + 1.5, { cone: Math.PI, prefer: K.api.lock }) : null;
    if (t && !t.prop) {
      // shadow-step: land behind the target's back
      const by = t.yaw ?? Math.atan2(from.x - t.pos.x, from.z - t.pos.z);
      tx = t.pos.x - Math.sin(by) * (1.2 + (t.radius || 0.4)); tz = t.pos.z - Math.cos(by) * (1.2 + (t.radius || 0.4));
      face = Math.atan2(t.pos.x - tx, t.pos.z - tz);
      K.api.lock = t;
    } else {
      tx = from.x + Math.sin(player.yaw) * range; tz = from.z + Math.cos(player.yaw) * range;
    }
    // walk back toward the start until the spot is free
    for (let k = 0; k < 12 && ctx.world.blocked(tx, tz, 0.45); k++) { tx += (from.x - tx) * 0.2; tz += (from.z - tz) * 0.2; }
    if (ctx.world.blocked(tx, tz, 0.45)) { tx = from.x; tz = from.z; }
    fx.beam(from, CYAN, 0.35, 2.4, 0.6);
    fx.ring(from, 1.6, CYAN, 0.35);
    player.teleport(tx, tz, face);
    player.setTarget(null);
    fx.ring(player.pos, 1.6, CYAN, 0.35);
    fx.flash(at(player.pos.x, player.pos.y + 1, player.pos.z), 0.8, CYAN, 0.12);
    K.actor().play('dodge', { loop: false, speed: 1.6 });
    audio.sfx('dodge', { vol: 0.9 }); audio.sfx('scan', { vol: 0.4 });
    // decoy hologram draws fire for a moment
    const dt = sk.decoy || 2;
    fx.hologram(from, CYAN, dt);
    const d = ctx.enemies.addDecoy({ x: from.x, z: from.z, t: dt, hp: 1e9, radius: 14, kind: 'decoy' });
    later(dt, () => {
      ctx.enemies.removeDecoy(d);
      if (sk.decoyBlast) aoeHit(pc, from.x, from.z, 3, { id: 'h_decoy', name: 'Knife Decoy', kind: 'aoe', base: sk.decoyBlast }, { color: CYAN, knock: 3 });
    });
    ctx.combatTeleported?.();
    return true;
  }

  function pulse(sk, pc) {
    if (!use(pc, sk)) return false;
    K.actor().play('cast', { loop: false });
    const r = (sk.radius || 6) * (1 + (pc.stats.aoePct || 0));
    fx.ring(player.pos, r, CYAN, 0.6);
    fx.ring(player.pos, r * 0.6, 0xffffff, 0.4);
    fx.beam(player.pos, CYAN, 0.4, 3, 0.9);
    audio.sfx('scan', { vol: 1 }); audio.sfx('power_down', { vol: 0.4 });
    let dis = 0, conv = 0;
    const near = ctx.enemies.alive().filter((e) => !e.ally && e.pos.distanceTo(player.pos) < r).sort((a, b) => b.c.hp - a.c.hp);
    for (const e of near) {
      if (e.c.tags.some((t) => t === 'drone' || t === 'turret')) { addStatus(e.c, { id: 'disabled', t: 5, src: 'player' }); dis++; fx.sparks(at(e.pos.x, e.pos.y + 1, e.pos.z), CYAN, 8, 4); }
    }
    const max = sk.convert?.count || 1;
    for (const e of near) {
      if (conv >= max) break;
      if (!e.c.tags.includes('robot') || ['boss', 'champion'].includes(e.c.rank) || e.c.tags.includes('drone')) continue;
      ctx.enemies.convert(e, sk.convert?.t || 8); conv++;
    }
    if (sk.base) for (const e of near) strike(pc, e, sk, { knock: 2, quiet: true });
    if (conv || dis) ui.toast(conv ? `${conv} hacked to your side` : `${dis} systems disabled`, 'good', { ms: 1400 });
    ctx.onHackPulse?.();
    return true;
  }

  // cloak look: swap the frame's materials for see-through copies while hidden
  function cloakOn() {
    if (S.cloak) return;
    const swaps = [];
    K.actor().root.traverse((o) => {
      if (!o.isMesh) return;
      const orig = o.material;
      const mk = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.16; c.depthWrite = false; if (c.emissive) c.emissive.setHex(0x0a3a44); return c; };
      o.material = Array.isArray(orig) ? orig.map(mk) : mk(orig);
      o.castShadow = false;
      swaps.push([o, orig]);
    });
    S.cloak = swaps;
  }
  function cloakOff() {
    if (!S.cloak) return;
    for (const [o, orig] of S.cloak) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); o.material = orig; o.castShadow = true; }
    S.cloak = null;
    fx.flash(at(player.pos.x, player.pos.y + 1, player.pos.z), 0.6, CYAN, 0.12);
  }

  function update(dt, pc) {
    for (let i = S.timers.length - 1; i >= 0; i--) { const T = S.timers[i]; if ((T.t -= dt) <= 0) { S.timers.splice(i, 1); T.fn(); } }
    if (S.dash) dashTick(dt, pc);
    if (S.charge) railTick(dt, pc);
    if (S.turrets.length) turretTick(dt, pc);
    if (S.wall) {
      S.wall.t -= dt;
      S.wall.mat.opacity = 0.22 + 0.12 * Math.sin(performance.now() / 90) * (S.wall.t < 1 ? S.wall.t : 1);
      if (S.wall.t <= 0 || !pc.statuses.some((s) => s.id === 'bulwark')) wallOff();
    }
    const bs = S.blinkSkill;
    if (bs?.charges > 1 && S.blinkBank < bs.charges - 1 && !pc.cooldowns[bs.id]) S.blinkBank = bs.charges - 1;
    if (pc.hidden && !S.cloak) cloakOn();
    else if (!pc.hidden && S.cloak) cloakOff();
    // Steady Hands: a quick cue when the crit bonus comes online
    if (pc.passive === 'steady') {
      if (pc.still >= 1 && !S.steadyShown && ctx.fighting) { S.steadyShown = true; fx.ring(player.pos, 1.2, 0xffe2a0, 0.3); }
      if (pc.still < 1) S.steadyShown = false;
    }
    if (pc.passive === 'momentum' && pc.momentum >= 3 && Math.random() < dt * pc.momentum) fx.sparks(at(player.pos.x, player.pos.y + 1.2, player.pos.z), 0xff9a40, 1, 2);
  }

  function reset() {
    S.timers.length = 0; S.dash = null; S.charge = null; wallOff(); cloakOff();
    for (const T of S.turrets) { ctx.world.scene.remove(T.g); ctx.enemies.removeDecoy(T.decoy); }
    S.turrets.length = 0; S.blinkBank = 1;
  }

  return { cast, update, reset, get busy() { return !!(S.dash || S.charge); }, get turrets() { return S.turrets.length; } };
}
