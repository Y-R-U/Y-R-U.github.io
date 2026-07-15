// GRUDGE BUGS — the battle engine. Turn state machine, aiming and firing,
// projectile playback riding the physics-precomputed path, knockback ragdolls,
// destructible ledges, sudden-death jam tide, deaths, victory — and the
// instant-replay recorder (ghost clones re-act the carnage from a new angle).

import * as THREE from 'three';
import { PHYS, RULES, WEAPONS, FACTIONS, AI, WIND_LABELS, REPLAY_ANGLES } from './config.js';
import { mulberry32, clamp, lerp, pick, v3 } from './utils.js';
import * as phys from './physics.js';
import { buildBugMesh, animateBug, makeGravestone } from './bugs.js';
import { generateLayout, pickSpawns, ArenaView } from './level.js';
import { makeProjectile, makeShoe, makeBomber, animateBomber, makeBeeBomb, makeReticle, makeTrajectory, setTrajectory } from './weapons.js';
import { sampleRecPath } from './cameras.js';
import * as voice from './voice.js';
import * as audio from './audio.js';
import { planTurn } from './ai.js';

const T = THREE;
const W = (id) => WEAPONS.find(w => w.id === id);

let bugSeq = 0;

export class Battle {
  // deps: {fx, cams, dom}; opts: {teams:[{factionId,count,isAI,diff,hat}], theme,
  //   seed, sandwich, lite, fast, replays, cinematic, suddenDeathRound, ledgeDefs, onOver, onHUD, onPhase}
  constructor(scene, deps, opts) {
    this.scene = scene;
    this.fx = deps.fx; this.cams = deps.cams; this.dom = deps.dom;
    this.opts = opts;
    this.rng = mulberry32(opts.seed ?? (Math.random() * 1e9) | 0);
    this.killY = PHYS.killY;
    this.wind = { x: 0, z: 0, mag: 0 };
    this.round = 0; this.turnCount = -1; this.suddenDeath = false;
    this.phase = 'boot';
    this.timer = RULES.turnTime;
    this.projectiles = [];      // live playbacks {rec, playT, mesh, done}
    this.rags = [];             // {bug, path, end, playT}
    this.pendingShards = [];
    this.turnRec = null;
    this.group = new T.Group();
    scene.add(this.group);

    // world
    const defs = opts.ledgeDefs || generateLayout(this.rng, { size: 3 });
    this.ledges = phys.buildLedges(defs);
    this.arena = new ArenaView(scene, opts.theme, this.ledges, this.rng,
      { lite: opts.lite, sandwich: opts.sandwich, sandwichPos: opts.sandwichPos });

    // teams & bugs
    this.teams = opts.teams.map((td, ti) => {
      const faction = FACTIONS.find(f => f.id === td.factionId);
      const ammo = new Map(WEAPONS.map(w => [w.id, w.ammo]));
      return { i: ti, faction, isAI: !!td.isAI, diff: td.diff || AI.diffs[1], hat: td.hat, bugs: [], ammo, weapon: 'bazooka' };
    });
    const totalBugs = opts.teams.reduce((a, t) => a + t.count, 0);
    const spawns = pickSpawns(this.ledges, totalBugs, this.rng);
    let si = 0;
    for (const team of this.teams) {
      const td = opts.teams[team.i];
      const names = [...team.faction.names];
      for (let k = 0; k < td.count; k++) {
        const sp = spawns[si++ % spawns.length];
        const big = team.faction.boss ? 1.8 : 1;
        const rig = buildBugMesh(team.faction.species, team.faction.color, team.faction.accent,
          { outfit: team.faction.outfit, hat: team.hat, big });
        const bug = {
          id: 'b' + (bugSeq++), team: team.i, faction: team.faction,
          name: names.length ? names.splice(Math.floor(this.rng() * names.length), 1)[0] : team.faction.name + ' ' + k,
          hp: team.faction.boss ? RULES.bugHP * 3 : RULES.bugHP,
          maxhp: team.faction.boss ? RULES.bugHP * 3 : RULES.bugHP,
          li: sp.li, s: sp.s, faceDir: this.rng() < 0.5 ? 1 : -1,
          alive: true, rig, headObj: rig.head, airborne: false, lastHurtBy: null,
        };
        this.group.add(rig.root);
        this._placeBug(bug);
        team.bugs.push(bug);
      }
      team.cursor = 0;
    }
    this.allBugs = this.teams.flatMap(t => t.bugs);

    // aim + widgets
    this.aim = { yaw: 0, pitch: 0.55, power: 0, charging: false };
    this.traj = makeTrajectory(); this.traj.visible = false; this.group.add(this.traj);
    this.reticle = makeReticle(); this.reticle.visible = false; this.group.add(this.reticle);
    this.moveInput = 0; this.moveLeft = RULES.moveBudget;
    this.graves = [];

    // target marker: bouncing chevron over the focused enemy, drawn through walls
    {
      const mkMat = () => new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
      const cone = new T.Mesh(new T.ConeGeometry(0.2, 0.4, 4), mkMat());
      cone.rotation.x = Math.PI;
      const ring = new T.Mesh(new T.TorusGeometry(0.3, 0.045, 6, 20), mkMat());
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.28;
      this.marker = new T.Group();
      this.marker.add(cone, ring);
      this.marker.renderOrder = 30;
      cone.renderOrder = 30; ring.renderOrder = 30;
      this.marker.visible = false;
      this.markerMats = [cone.material, ring.material];
      this.group.add(this.marker);
      this.markerTag = document.createElement('div');
      this.markerTag.className = 'tgt-tag hidden';
      document.getElementById('bubbles')?.appendChild(this.markerTag);
    }

    if (!opts.cinematic) this._nextTurn(true);
  }

  // cinematic battles (story intros) hand over to the turn engine here
  startTurns() {
    if (this.phase !== 'boot') return;
    this.opts.cinematic = false;
    this._nextTurn(true);
  }

  // ---------------- placement ----------------
  L(bug) { return this.ledges[bug.li]; }
  bugPos(bug) { return phys.posAt(this.L(bug), bug.s).pos; }
  _placeBug(bug) {
    const { pos, dir } = phys.posAt(this.L(bug), bug.s);
    bug.rig.root.position.set(pos.x, pos.y, pos.z);
    bug.rig.root.rotation.y = Math.atan2(dir.x * bug.faceDir, dir.z * bug.faceDir);
  }

  physWorld() {
    return {
      ledges: this.ledges,
      bugs: this.allBugs.filter(b => b.alive && !b.airborne).map(b => ({ id: b.id, alive: true, pos: this.bugPos(b) })),
      wind: this.wind, killY: this.killY,
    };
  }

  activeBug() { return this._active; }
  activeTeam() { return this._active ? this.teams[this._active.team] : null; }
  aliveTeams() { return this.teams.filter(t => t.bugs.some(b => b.alive)); }

  // ---------------- turn engine ----------------
  _nextTurn(first = false) {
    if (this.over) return;
    this.turnCount++;
    const alive = this.aliveTeams();
    if (alive.length <= 1) return this._endBattle(alive[0] || null);
    const ti = this.turnCount % this.teams.length;
    const team = this.teams[ti];
    if (!team.bugs.some(b => b.alive)) { return this._nextTurn(); }
    if (ti === 0 || first) this.round++;

    // sudden death
    const sdRound = this.opts.suddenDeathRound ?? RULES.suddenDeathRound;
    if (this.round > sdRound) {
      if (!this.suddenDeath) {
        this.suddenDeath = true;
        this.cams.banner('🍓 THE JAM RISES 🍓', 2.2);
        audio.boom(0.6);
        const anyone = this.allBugs.find(b => b.alive);
        if (anyone) voice.say(anyone, 'sudden', { shout: true });
      }
      this.sdTurns = (this.sdTurns || 0) + 1;
      this.killY += RULES.jamRisePerTurn * (1 + this.sdTurns * 0.18);   // accelerates — no stalemates
      this.arena.setGroundY(this.killY);
      this._drownCheck();
      if (this.aliveTeams().length <= 1) return this._endBattle(this.aliveTeams()[0] || null);
    }

    // wind
    const mag = this.rng() * this.rng();  // biased low
    const wa = this.rng() * Math.PI * 2;
    this.wind = { x: Math.sin(wa) * mag * PHYS.windMax, z: Math.cos(wa) * mag * PHYS.windMax, mag };

    // pick bug (cycle alive)
    for (let k = 0; k < team.bugs.length; k++) {
      team.cursor = (team.cursor + 1) % team.bugs.length;
      if (team.bugs[team.cursor].alive) break;
    }
    const bug = team.bugs[team.cursor];
    this._active = bug;
    this.moveLeft = RULES.moveBudget;
    this.timer = RULES.turnTime;
    this.aim.power = 0; this.aim.charging = false;
    this.targeting = false;
    // open every turn already facing the nearest enemy — never the sky
    this._tgtIx = 0;
    const foe = this._nearestEnemy(bug);
    if (foe) {
      this._faceEnemy(bug, foe);
      this.cams.orbit.yaw = this.aim.yaw + Math.PI;
    } else {
      this.aim.pitch = 0.55;
      const dir = phys.posAt(this.L(bug), bug.s).dir;
      this.aim.yaw = Math.atan2(dir.x * bug.faceDir, dir.z * bug.faceDir);
    }

    this.phase = 'fly';
    this.opts.onPhase?.('turn', bug);
    const dest = () => { const p = this.bugPos(bug); return new T.Vector3(p.x, p.y, p.z); };
    this.cams.setMode('fly', {
      to: () => dest().add(new T.Vector3(
        Math.sin(this.cams.orbit.yaw) * 6, 2.6, Math.cos(this.cams.orbit.yaw) * 6)),
      look: () => dest(),
      done: () => this._beginPlay(),
    });
    if (this.opts.fast) this._beginPlay();
    if (mag > 0.6 && this.rng() < 0.5) setTimeout(() => bug.alive && voice.say(bug, 'wind'), 900);
  }

  _beginPlay() {
    if (this.over || this.phase === 'play') return;
    const bug = this._active;
    this.phase = 'play';
    this.cams.setMode('aim', { target: () => this._v3(this.bugPos(bug)), aim: () => this.aim });
    voice.say(bug, 'turn', { prob: 0.85 });
    this.opts.onHUD?.(this);
    if (this.activeTeam().isAI) this._aiGo();
    else {
      // point out who you're facing; first 🎯 tap then hops to the next one
      const foe = this._nearestEnemy(bug);
      if (foe && !this.opts.fast) { this._markTarget(foe, 2.2); this._tgtIx = 1; }
    }
  }

  _v3(p) { return new T.Vector3(p.x, p.y, p.z); }

  _endBattle(winnerTeam) {
    if (this.over) return;
    this.over = true;
    this.phase = 'over';
    this.winner = winnerTeam;
    this.traj.visible = false; this.reticle.visible = false;
    const bugs = winnerTeam ? winnerTeam.bugs.filter(b => b.alive) : [];
    if (bugs.length) {
      const c = bugs.reduce((a, b) => { const p = this.bugPos(b); a.x += p.x; a.y += p.y; a.z += p.z; return a; }, { x: 0, y: 0, z: 0 });
      c.x /= bugs.length; c.y /= bugs.length; c.z /= bugs.length;
      for (const b of bugs) b.rig.state = 'celebrate';
      this.cams.setMode('win', { center: new T.Vector3(c.x, c.y, c.z) });
      this.fx.confetti({ x: c.x, y: c.y + 1.5, z: c.z });
      voice.say(bugs[0], 'win', { shout: true });
    }
    audio.fanfare(winnerTeam?.i === 0);
    window.__done = true;
    setTimeout(() => this.opts.onOver?.(this._result(winnerTeam)), this.opts.fast ? 400 : 2600);
  }

  _result(winnerTeam) {
    return {
      winnerTeam: winnerTeam ? winnerTeam.i : -1,
      winnerName: winnerTeam?.faction.name || null,
      rounds: this.round,
      kills: this.killsByTeam || {},
      playerWon: winnerTeam?.i === 0,
      playerBugsAlive: this.teams[0].bugs.filter(b => b.alive).length,
    };
  }

  // ---------------- player/AI inputs ----------------
  setWalk(dir) { this.moveInput = dir; }
  addAim(dyaw, dpitch) {
    if (this.phase !== 'play') return;
    this.aim.yaw += dyaw;
    this.aim.pitch = clamp(this.aim.pitch + dpitch, -0.5, 1.45);
    this._trajDirty = true;
    // face the way you aim (relative to ledge tangent)
    const bug = this._active;
    const dir = phys.posAt(this.L(bug), bug.s).dir;
    const fw = Math.sin(this.aim.yaw) * dir.x + Math.cos(this.aim.yaw) * dir.z;
    if (Math.abs(fw) > 0.25) bug.faceDir = fw >= 0 ? 1 : -1;
  }
  selectWeapon(id) {
    const team = this.activeTeam();
    if (!team || this.phase !== 'play') return;
    if ((team.ammo.get(id) ?? 0) === 0) return;
    team.weapon = id;
    this.targeting = !!W(id).aim;
    this.reticle.visible = false;
    if (this.targeting) {
      // default the reticle onto the nearest enemy
      const bug = this._active;
      const en = this._nearestEnemy(bug);
      const p = en ? this.bugPos(en) : this.bugPos(bug);
      this._setReticle(new T.Vector3(p.x, p.y, p.z));
    }
    this._trajDirty = true;
    this.opts.onHUD?.(this);
  }
  _setReticle(v) {
    this.reticle.visible = true;
    this.reticle.position.copy(v);
    this.reticlePos = { x: v.x, y: v.y, z: v.z };
  }
  moveReticle(dx, dz) {
    if (!this.targeting || !this.reticlePos) return;
    const p = this.reticlePos;
    p.x = clamp(p.x + dx, -20, 20); p.z = clamp(p.z + dz, -20, 20);
    // snap y to nearest ledge surface below-ish
    let y = 1.2, best = 1e9;
    for (const L of this.ledges) {
      const n = phys.nearestS(L, p);
      const d = n.distXZ;
      if (d < best) { best = d; y = n.y; }
    }
    p.y = y;
    this.reticle.position.set(p.x, p.y + 0.1, p.z);
  }

  startCharge() {
    if (this.phase !== 'play' || this.aim.charging) return;
    const wid = this.activeTeam().weapon, w = W(wid);
    if (w.kind === 'melee') return this._fireMelee();
    if (w.kind === 'strike') return this._fireStrike();
    this.aim.charging = true; this.aim.power = 0;
    audio.chargeStart();
    this.opts.onPhase?.('charge');
  }
  releaseCharge() {
    if (!this.aim.charging) return;
    this.aim.charging = false;
    audio.chargeStop();
    this._fire(this.aim.power);
  }

  // ---------------- firing ----------------
  _muzzle(bug) {
    const p = this.bugPos(bug);
    return v3(p.x + Math.sin(this.aim.yaw) * 0.4, p.y + 0.55, p.z + Math.cos(this.aim.yaw) * 0.4);
  }

  _consumeAmmo(team, wid) {
    const a = team.ammo.get(wid);
    if (a > 0) team.ammo.set(wid, a - 1);
    if (team.ammo.get(wid) === 0 && team.weapon === wid) team.weapon = 'bazooka';
  }

  _fire(power) {
    const bug = this._active, team = this.activeTeam();
    const wid = team.weapon, w = W(wid);
    this._consumeAmmo(team, wid);
    this.traj.visible = false;
    const vel = phys.muzzleVel(this.aim.yaw, this.aim.pitch, power, w.speed);
    const rec = phys.simulate({ pos: this._muzzle(bug), vel, w, shooterId: bug.id }, this.physWorld());
    rec.weaponId = wid; rec.shooter = bug;
    rec.shotPath = rec.path; rec.dur = rec.impact.t;
    this._startShotPlayback(rec);
    this.turnRec = { shots: [rec], victims: [], bites: [], kills: 0, selfHit: false, weaponId: wid, shooter: bug };
    bug.rig.flinchT = 0.2;
    audio.pop();
  }

  _startShotPlayback(rec) {
    const mesh = makeProjectile(rec.weaponId);
    this.group.add(mesh);
    const pb = { rec, playT: 0, mesh, lastFuse: 0 };
    this.projectiles.push(pb);
    this.phase = 'shot';
    this.opts.onPhase?.('shot');
    audio.whooshStart();
    const self = this;
    this.cams.setMode('follow', {
      pos: () => { const p = sampleRecPath(rec.path, pb.playT); return new T.Vector3(p.x, p.y, p.z); },
      vel: () => {
        const a = sampleRecPath(rec.path, pb.playT), b = sampleRecPath(rec.path, pb.playT + 0.03);
        return new T.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      },
      progress: () => pb.playT / Math.max(0.1, rec.dur),
      remain: () => rec.dur - pb.playT,
    });
  }

  _fireMelee() {
    const bug = this._active, team = this.activeTeam();
    const w = W('slap');
    const p = this.bugPos(bug);
    const at = v3(p.x + Math.sin(this.aim.yaw) * w.range, p.y + 0.3, p.z + Math.cos(this.aim.yaw) * w.range);
    bug.rig.flinchT = 0.3;
    audio.slap();
    const rec = {
      weaponId: 'slap', shooter: bug, dur: 0.25,
      shotPath: [{ t: 0, x: p.x, y: p.y + 0.5, z: p.z }, { t: 0.25, x: at.x, y: at.y, z: at.z }],
      impact: { t: 0.25, pos: at, type: 'melee' },
    };
    this.turnRec = { shots: [rec], victims: [], bites: [], kills: 0, selfHit: false, weaponId: 'slap', shooter: bug };
    this.phase = 'shot';
    setTimeout(() => this._detonate(rec, { noBite: true, noBoom: true }), 220);
    const victim = this._nearestEnemy(bug, w.range + 0.4);
    if (victim) setTimeout(() => victim.alive && voice.say(victim, 'slap'), 900);
  }

  _fireStrike() {
    const bug = this._active, team = this.activeTeam();
    const wid = team.weapon, w = W(wid);
    if (!this.reticlePos) return;
    this._consumeAmmo(team, wid);
    this.reticle.visible = false;
    const at = { ...this.reticlePos };
    this.turnRec = { shots: [], victims: [], bites: [], kills: 0, selfHit: false, weaponId: wid, shooter: bug };
    this.phase = 'shot';
    this.opts.onPhase?.('shot');
    if (wid === 'shoe') this._shoeStrike(at, w);
    else this._beeStrike(at, w);
  }

  _shoeStrike(at, w) {
    const shoe = makeShoe();
    this.group.add(shoe);
    const y0 = at.y + 14;
    shoe.position.set(at.x, y0, at.z);
    const dur = 0.9;
    const path = [{ t: 0, x: at.x, y: y0, z: at.z }, { t: dur, x: at.x, y: at.y + 0.3, z: at.z }];
    const rec = { weaponId: 'shoe', shooter: this._active, dur, shotPath: path, impact: { t: dur, pos: v3(at.x, at.y + 0.3, at.z), type: 'shoe' } };
    this.turnRec.shots.push(rec);
    this.strike = { kind: 'shoe', mesh: shoe, rec, playT: 0, at, dur };
    this.cams.setMode('impact', { pos: new T.Vector3(at.x, at.y, at.z), dir: new T.Vector3(0.6, -0.2, 0.6).normalize() });
    this.cams.banner('🩴 THE SHOE 🩴', 1.4);
    audio.fallWhistle(0.9);
  }

  _beeStrike(at, w) {
    // bombers cross along the nearest ledge direction through the target
    let dir = { x: 1, z: 0 }, best = 1e9;
    for (const L of this.ledges) {
      const n = phys.nearestS(L, at);
      if (n.distXZ < best) { best = n.distXZ; dir = phys.posAt(L, n.s).dir; }
    }
    const bombers = [];
    for (let i = 0; i < 3; i++) {
      const b = makeBomber();
      this.group.add(b);
      bombers.push(b);
    }
    const span = w.span, from = { x: at.x - dir.x * span * 1.6, z: at.z - dir.z * span * 1.6 };
    this.strike = {
      kind: 'bee', bombers, dir, at, from, playT: 0, dur: 2.6,
      dropped: 0, bombs: w.bombs, w, alt: at.y + 5.5,
    };
    this.cams.banner('🐝 BEE-52 🐝', 1.4);
    this.cams.setMode('impact', {
      pos: new T.Vector3(at.x, at.y + 1, at.z),
      dir: new T.Vector3(dir.x, -0.15, dir.z).normalize(),
    });
  }

  // ---------------- detonation & effects ----------------
  _detonate(rec, { noBite = false, noBoom = false } = {}) {
    const w = W(rec.weaponId);
    const at = rec.impact.pos;
    if (!noBoom) {
      this.fx.explosion(at, w.radius, this.arena.terra);
      audio.boom(w.radius / 1.7);
      this.cams.addShake(0.35 + w.radius * 0.18);
      if (navigator.vibrate && !this.opts.fast) try { navigator.vibrate(40); } catch {}
    }
    if (rec.impact.type === 'splash') { this.fx.splash(at, this._splashColor()); audio.splash(); }
    // ledge bites
    if (!noBite && rec.impact.type !== 'splash') {
      const bites = phys.biteLedges(this.ledges, at, w.radius);
      this.turnRec?.bites.push(...bites);
      if (bites.length) this.arena.refreshDirty();
    }
    // damage + knockback
    const fxs = phys.explosionEffects(at, w, this.allBugs.filter(b => b.alive && !b.airborne).map(b => ({ id: b.id, alive: true, pos: this.bugPos(b) })));
    let anyHit = false;
    for (const e of fxs) {
      const bug = this.allBugs.find(b => b.id === e.id);
      if (!bug) continue;
      anyHit = true;
      this._hurt(bug, e.dmg, rec.shooter);
      this._launchRag(bug, e.imp, rec);
    }
    // shards — never chain off other shards or the whole picnic detonates
    if (w.shards && !rec.isShard) {
      for (let i = 0; i < w.shards; i++) {
        const a = (i / w.shards) * Math.PI * 2 + this.rng();
        const sv = v3(Math.cos(a) * (2.5 + this.rng() * 2), 5 + this.rng() * 2.5, Math.sin(a) * (2.5 + this.rng() * 2));
        const sw = { ...W('cluster'), kind: 'arc', dmg: w.shardDmg, radius: w.shardRadius, impulse: 6, wind: 0, shards: 0 };
        const srec = phys.simulate({ pos: v3(at.x, at.y + 0.25, at.z), vel: sv, w: sw, shooterId: null }, this.physWorld());
        srec.weaponId = 'cluster'; srec.shooter = rec.shooter; srec.isShard = true;
        srec.shotPath = srec.path; srec.dur = srec.impact.t;
        this.pendingShards.push(srec);
      }
    }
    // bugs left standing over a fresh gap fall
    this._gapCheck(rec);
    // clean miss: someone nearby gets to gloat
    if (!anyHit && rec.shooter && !rec.isShard && rec.weaponId !== 'slap') {
      const gloater = this.allBugs.find(b => b.alive && b.team !== rec.shooter.team);
      if (gloater && this.rng() < 0.55) voice.say(gloater, 'taunt');
    }
    this.phase = 'resolve';
  }

  _splashColor() {
    return { pond: 0x6fb3c9, sink: 0x9fb6c4, jam: 0xc9302f, coals: 0xff8030 }[this.arena.theme.ground] || 0x6fb3c9;
  }

  _hurt(bug, dmg, by) {
    bug.hp -= dmg;
    bug.lastHurtBy = by?.id || null;
    bug.rig.flinchT = 0.45;
    this.fx.floater(this.bugPos(bug), `-${dmg}`);
    if (by && by.team === bug.team) this.turnRec && (this.turnRec.selfHit = true);
    this.turnRec?.victims.push({ id: bug.id, dmg });
    if (by && by !== bug && by.team !== bug.team && this.rng() < 0.45) voice.say(by, 'taunt', { prob: 1 });
    else if (bug.alive && this.rng() < 0.6) voice.say(bug, 'hurt');
  }

  _launchRag(bug, imp, rec) {
    bug.airborne = true;
    const start = this.bugPos(bug);
    const rag = phys.simulateRag(v3(start.x, start.y + 0.1, start.z), imp, { ledges: this.ledges, killY: this.killY }, this.L(bug), true);
    const entry = { bug, path: rag.path, end: rag.end, playT: 0, rec };
    this.rags.push(entry);
    this.turnRec?.victims.push({ id: bug.id, ragPath: rag.path, ragEnd: rag.end, startPos: start });
    bug.rig.state = 'panic';
    if (rag.end.type === 'splash') {
      voice.say(bug, 'falling', { shout: true });
      audio.fallWhistle(Math.min(1.6, rag.end.t));
      // if this is the only faller, ride along
      if (this.rags.length === 1 && !this.opts.fast) {
        this.cams.setMode('fall', {
          target: () => { const b = entry; const p = sampleRecPath(b.path, b.playT); return new T.Vector3(p.x, p.y, p.z); },
          side: this.rng() < 0.5 ? -1 : 1,
          floorY: this.killY,
        });
      }
    }
  }

  _gapCheck(rec) {
    for (const bug of this.allBugs) {
      if (!bug.alive || bug.airborne) continue;
      if (!phys.spanAt(this.L(bug), bug.s)) {
        this._launchRag(bug, v3((this.rng() - 0.5) * 0.6, 0.5, (this.rng() - 0.5) * 0.6), rec);
      }
    }
  }

  _drownCheck() {
    for (const bug of this.allBugs) {
      if (!bug.alive || bug.airborne) continue;
      const p = this.bugPos(bug);
      if (p.y < this.killY + 0.15) {
        this.fx.splash(p, this._splashColor());
        audio.splash();
        this._kill(bug, 'drowned');
      }
    }
  }

  _kill(bug, how) {
    if (!bug.alive) return;
    bug.alive = false;
    bug.airborne = false;
    this.killsByTeam = this.killsByTeam || {};
    const killer = this.allBugs.find(b => b.id === bug.lastHurtBy);
    if (killer && killer.team !== bug.team) {
      this.killsByTeam[killer.team] = (this.killsByTeam[killer.team] || 0) + 1;
      if (this.turnRec && killer === this.turnRec.shooter) this.turnRec.kills++;
      if (killer.alive && this.rng() < 0.75) {
        const revenge = killer.lastHurtBy === bug.id;
        setTimeout(() => killer.alive && voice.say(killer, revenge ? 'revenge' : 'kill', { shout: revenge }), 600);
        if (revenge) this.cams.banner('REVENGE!', 1.2);
      }
    }
    if (how === 'boom') {
      const p = this.bugPos(bug);
      this.fx.poof(p, 0xdddddd, 8);
      audio.pop();
      const grave = makeGravestone(bug.faction.accent);
      grave.position.set(p.x, p.y, p.z);
      grave.rotation.y = this.rng() * 6;
      this.group.add(grave);
      this.graves.push(grave);
    }
    this.group.remove(bug.rig.root);
    this.opts.onHUD?.(this);
  }

  _nearestEnemy(bug, maxDist = 1e9) {
    let best = null, bd = maxDist;
    const p = this.bugPos(bug);
    for (const b of this.allBugs) {
      if (!b.alive || b.team === bug.team) continue;
      const q = this.bugPos(b);
      const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // swing yaw/pitch (and the bug's face) toward an enemy so they're on screen
  _faceEnemy(bug, en) {
    if (!en) return;
    const p = this.bugPos(bug), q = this.bugPos(en);
    this.aim.yaw = Math.atan2(q.x - p.x, q.z - p.z);
    const dxz = Math.hypot(q.x - p.x, q.z - p.z);
    this.aim.pitch = clamp(Math.atan2(q.y - p.y, Math.max(0.5, dxz)) + 0.32, -0.35, 1.1);
    const dir = phys.posAt(this.L(bug), bug.s).dir;
    const fw = Math.sin(this.aim.yaw) * dir.x + Math.cos(this.aim.yaw) * dir.z;
    if (Math.abs(fw) > 0.2) bug.faceDir = fw >= 0 ? 1 : -1;
    this._trajDirty = true;
  }

  // 🎯 button: hop the aim (and camera) through living enemies, nearest first
  cycleTarget() {
    if (this.phase !== 'play' || !this._active) return null;
    const bug = this._active;
    const p = this.bugPos(bug);
    const foes = this.allBugs
      .filter(b => b.alive && b.team !== bug.team)
      .sort((x, y) => {
        const a = this.bugPos(x), b2 = this.bugPos(y);
        return Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b2.x - p.x, b2.y - p.y, b2.z - p.z);
      });
    if (!foes.length) return null;
    this._tgtIx = (this._tgtIx ?? 0) % foes.length;
    const en = foes[this._tgtIx];
    this._tgtIx = (this._tgtIx + 1) % foes.length;
    this._faceEnemy(bug, en);
    this.cams.orbit.yaw = this.aim.yaw + Math.PI;
    if (this.targeting) { const q = this.bugPos(en); this._setReticle(new T.Vector3(q.x, q.y, q.z)); }
    this._markTarget(en);
    return en;
  }

  _markTarget(en, dur = 2.8) {
    this.markerBug = en;
    this.markerT = dur;
    this.marker.visible = true;
    for (const m of this.markerMats) m.color.setHex(en.faction.color);
    this.markerTag.textContent = `🎯 ${en.name} · ${Math.max(0, en.hp)} HP`;
    this.markerTag.style.color = en.faction.ui;
    this.markerTag.classList.remove('hidden');
  }

  _markerStep(unscaledDt) {
    if (!this.markerBug) return;
    this.markerT -= unscaledDt;
    const en = this.markerBug;
    if (this.markerT <= 0 || !en.alive || en.airborne) {
      this.marker.visible = false;
      this.markerTag.classList.add('hidden');
      this.markerBug = null;
      return;
    }
    const p = this.bugPos(en);
    const bob = Math.sin(performance.now() / 1000 * 5) * 0.1;
    const top = p.y + PHYS.bugHeight * (en.faction.boss ? 2.4 : 1.4) + 0.75 + bob;
    this.marker.position.set(p.x, top, p.z);
    this.marker.rotation.y += unscaledDt * 2.2;
    // DOM tag floats above the chevron
    const v = new T.Vector3(p.x, top + 0.55, p.z).project(this.cams.cam);
    if (v.z < 1) {
      this.markerTag.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      this.markerTag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      this.markerTag.classList.remove('hidden');
    } else this.markerTag.classList.add('hidden');
  }

  // ---------------- AI ----------------
  _aiGo() {
    const bug = this._active, team = this.activeTeam();
    const think = AI.thinkTime[0] + this.rng() * (AI.thinkTime[1] - AI.thinkTime[0]);
    const plan = planTurn(this, bug, team);
    this._aiScript = { plan, t: -think * (this.opts.fast ? 0.15 : 1), stage: 0 };
  }

  _aiStep(dt) {
    const sc = this._aiScript;
    if (!sc || this.phase !== 'play') return;
    sc.t += dt;
    if (sc.t < 0) return;
    const plan = sc.plan, bug = this._active;
    if (sc.stage === 0) {              // walk
      if (plan.moveTo == null || Math.abs(bug.s - plan.moveTo) < 0.12 || this.moveLeft <= 0) {
        this.setWalk(0); sc.stage = 1; sc.t = 0;
        this.selectWeapon(plan.weapon);
        if (plan.targetPoint) this._setReticle(new T.Vector3(plan.targetPoint.x, plan.targetPoint.y, plan.targetPoint.z));
        return;
      }
      this.setWalk(Math.sign(plan.moveTo - bug.s));
    } else if (sc.stage === 1) {       // swing aim toward plan over 0.7s
      const k = Math.min(1, sc.t / 0.7);
      this.aim.yaw = lerp(this.aim.yaw, plan.yaw, k);
      this.aim.pitch = lerp(this.aim.pitch, plan.pitch, k);
      this._trajDirty = true;
      if (k >= 1) { sc.stage = 2; sc.t = 0; }
    } else if (sc.stage === 2) {       // charge
      const w = W(this.activeTeam().weapon);
      if (w.kind === 'melee') { this._aiScript = null; this._fireMelee(); return; }
      if (w.kind === 'strike') { this._aiScript = null; this._fireStrike(); return; }
      if (!this.aim.charging) { this.aim.charging = true; audio.chargeStart(); }
      this.aim.power = Math.min(plan.power, this.aim.power + dt / 1.4);
      audio.chargeSet(this.aim.power);
      if (this.aim.power >= plan.power - 1e-3) {
        this.aim.charging = false;
        audio.chargeStop();
        this._aiScript = null;
        this._fire(plan.power);
      }
    }
  }

  // ---------------- replay ----------------
  _maybeReplay() {
    const rec = this.turnRec;
    this.turnRec = null;
    if (!rec) return this._afterTurn();
    const fell = rec.victims.some(v => v.ragEnd?.type === 'splash');
    const bigHit = rec.victims.reduce((a, v) => a + (v.dmg || 0), 0) >= 40;
    const multi = new Set(rec.victims.map(v => v.id)).size >= 2;
    const epic = rec.kills > 0 || fell || multi || rec.selfHit || bigHit || rec.weaponId === 'shoe';
    const allow = this.opts.replays === 'force' || (this.opts.replays !== false && !this.opts.fast);
    if (!epic || !allow || !rec.shots.length) return this._afterTurn();

    const shot = rec.shots[0];
    const angle = pick(this.rng, REPLAY_ANGLES);
    // victim pos for victim-cam
    const firstVictim = rec.victims.find(v => v.startPos);
    shot.victimPos = firstVictim?.startPos;
    const ragMax = Math.max(0, ...rec.victims.map(v => v.ragEnd?.t || 0));
    const tStart = Math.max(0, shot.dur - 2.4);
    const dur = (shot.dur - tStart) + ragMax + 0.9;

    // ghosts
    const ghosts = [];
    if (shot.weaponId !== 'slap' && shot.weaponId !== 'shoe') {
      const m = makeProjectile(shot.weaponId); this.group.add(m);
      ghosts.push({ mesh: m, kind: 'proj', path: shot.shotPath, t0: 0 });
    } else if (shot.weaponId === 'shoe') {
      const m = makeShoe(); this.group.add(m);
      ghosts.push({ mesh: m, kind: 'proj', path: shot.shotPath, t0: 0 });
    }
    for (const v of rec.victims) {
      if (!v.ragPath) continue;
      const bug = this.allBugs.find(b => b.id === v.id);
      if (!bug) continue;
      const rig = buildBugMesh(bug.faction.species, bug.faction.color, bug.faction.accent,
        { outfit: bug.faction.outfit, big: bug.faction.boss ? 1.8 : 1 });
      rig.state = 'panic';
      this.group.add(rig.root);
      rig.root.position.set(v.startPos.x, v.startPos.y, v.startPos.z);
      ghosts.push({ mesh: rig.root, rig, kind: 'bug', path: v.ragPath, t0: shot.dur, start: v.startPos });
      if (bug.alive) bug.rig.root.visible = false;
      ghosts[ghosts.length - 1].bugRef = bug;
    }
    const rp = { rec: shot, ghosts, playT: tStart, tStart, end: tStart + dur, boomed: false };
    this.replay = rp;
    this.phase = 'replay';
    this.opts.onPhase?.('replay');
    const tag = document.getElementById('replay-tag');
    tag.classList.remove('hidden');
    tag.querySelector('#replay-angle').textContent = angle.label;
    // close over rp, not this.replay — the camera stays in replay mode for a
    // few frames after the replay object is cleared
    this.cams.setMode('replay', { rec: shot, angle: angle.id, getT: () => rp.playT });
  }

  skipReplay() { if (this.replay) this.replay.playT = this.replay.end; }

  _replayStep(dt) {
    const rp = this.replay;
    rp.playT += dt;                    // dt already slowed by director (0.55)
    for (const g of rp.ghosts) {
      if (g.kind === 'proj') {
        const p = sampleRecPath(g.path, Math.min(rp.playT, g.path[g.path.length - 1].t));
        g.mesh.position.set(p.x, p.y, p.z);
        g.mesh.rotation.x += dt * 6;
      } else {
        if (rp.playT < g.t0) g.mesh.position.set(g.start.x, g.start.y, g.start.z);
        else {
          const p = sampleRecPath(g.path, rp.playT - g.t0);
          g.mesh.position.set(p.x, p.y, p.z);
          g.mesh.rotation.z += dt * 4;
        }
        if (g.rig) animateBug(g.rig, dt);
      }
    }
    if (!rp.boomed && rp.playT >= rp.rec.dur) {
      rp.boomed = true;
      const w = W(rp.rec.weaponId);
      this.fx.explosion(rp.rec.impact.pos, (w?.radius || 1.4) * 0.9, this.arena.terra);
      audio.boom(0.8);
    }
    if (rp.playT >= rp.end) {
      for (const g of rp.ghosts) {
        this.group.remove(g.mesh);
        if (g.bugRef?.alive) g.bugRef.rig.root.visible = true;
      }
      document.getElementById('replay-tag').classList.add('hidden');
      this.replay = null;
      this._afterTurn();
    }
  }

  _afterTurn() {
    this._drownCheck();
    const alive = this.aliveTeams();
    if (alive.length <= 1) return this._endBattle(alive[0] || null);
    this.phase = 'between';
    setTimeout(() => this._nextTurn(), this.opts.fast ? 60 : 500);
  }

  // ---------------- frame update ----------------
  update(dt, unscaledDt) {
    // bugs breathe/blink always
    for (const bug of this.allBugs) {
      if (!bug.alive) continue;
      animateBug(bug.rig, dt);
      if (!bug.airborne && bug !== this._active) bug.rig.walkAmt *= 0.9;
    }
    this.arena.update(dt, performance.now() / 1000);
    this.reticle.rotation.y += dt * 1.5;
    this._markerStep(unscaledDt);

    if (this.over) return;

    if (this.phase === 'play') {
      const bug = this._active;
      // timer (humans only)
      if (!this.activeTeam().isAI) {
        this.timer -= unscaledDt;
        if (this.timer <= 0) { this.phase = 'between'; voice.say(bug, 'idle', { prob: 0.7 }); this._afterTurn(); return; }
      } else this._aiStep(dt);
      // walking
      if (this.moveInput !== 0 && this.moveLeft > 0) {
        const L = this.L(bug);
        const span = phys.spanAt(L, bug.s) || [bug.s, bug.s];
        const step = this.moveInput * RULES.walkSpeed * dt;
        const ns = clamp(bug.s + step, span[0] + 0.25, span[1] - 0.25);
        this.moveLeft -= Math.abs(ns - bug.s);
        if (Math.abs(ns - bug.s) > 1e-5) {
          bug.s = ns;
          bug.faceDir = this.moveInput >= 0 ? 1 : -1;
          bug.rig.walkAmt = 1;
          const dir = phys.posAt(L, bug.s).dir;
          this.aim.yaw = Math.atan2(dir.x * bug.faceDir, dir.z * bug.faceDir);
          this._trajDirty = true;
          this._placeBug(bug);
        } else bug.rig.walkAmt *= 0.85;
      } else if (this._active) this._active.rig.walkAmt *= 0.85;
      this._placeBug(bug);
      bug.rig.state = 'aim';
      // charging power
      if (this.aim.charging) {
        this.aim.power = Math.min(1, this.aim.power + unscaledDt / 1.4);
        audio.chargeSet(this.aim.power);
        if (this.aim.power >= 1) this.releaseCharge();
      }
      // trajectory preview (throttled)
      this._trajTimer = (this._trajTimer || 0) - dt;
      if (this._trajDirty && this._trajTimer <= 0 && !this.targeting) {
        this._trajTimer = 0.08; this._trajDirty = false;
        const w = W(this.activeTeam().weapon);
        if (w.kind !== 'melee') {
          const power = this.aim.charging ? this.aim.power : 0.7;
          const vel = phys.muzzleVel(this.aim.yaw, this.aim.pitch, power, w.speed);
          const pv = phys.simulate({ pos: this._muzzle(bug), vel, w: { ...w, fuse: 99 }, shooterId: bug.id },
            { ...this.physWorld(), bugs: [] });
          setTrajectory(this.traj, pv.path, 1.0);
          this.traj.visible = true;
        } else this.traj.visible = false;
      }
    }

    // projectile playbacks
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pb = this.projectiles[i];
      pb.playT += dt;
      const p = sampleRecPath(pb.rec.path, Math.min(pb.playT, pb.rec.dur));
      pb.mesh.position.set(p.x, p.y, p.z);
      const q = sampleRecPath(pb.rec.path, Math.min(pb.playT + 0.03, pb.rec.dur));
      pb.mesh.lookAt(q.x + (q.x - p.x), q.y + (q.y - p.y), q.z + (q.z - p.z));
      if (pb.mesh.userData.spin === 'roll') pb.mesh.rotation.x += dt * 9;
      else pb.mesh.rotation.z += dt * 7;
      const w = W(pb.rec.weaponId);
      if (w.fuse && pb.playT - pb.lastFuse > 0.5) { pb.lastFuse = pb.playT; audio.fuseTick(); }
      audio.whooshSet(1 - pb.playT / Math.max(0.5, pb.rec.dur));
      if (pb.playT >= pb.rec.dur) {
        this.group.remove(pb.mesh);
        this.projectiles.splice(i, 1);
        audio.whooshStop();
        this.cams.setMode('impact', {
          pos: new T.Vector3(pb.rec.impact.pos.x, Math.max(pb.rec.impact.pos.y, this.killY + 1.0), pb.rec.impact.pos.z),
          dir: (() => {
            const a = sampleRecPath(pb.rec.path, Math.max(0, pb.rec.dur - 0.06));
            const d = new T.Vector3(pb.rec.impact.pos.x - a.x, pb.rec.impact.pos.y - a.y, pb.rec.impact.pos.z - a.z);
            return d.lengthSq() > 1e-8 ? d.normalize() : new T.Vector3(0, -1, 0.2).normalize();
          })(),
        });
        this._detonate(pb.rec);
      }
    }

    // strikes
    if (this.strike) this._strikeStep(dt);

    // ragdoll playbacks
    for (let i = this.rags.length - 1; i >= 0; i--) {
      const rg = this.rags[i];
      rg.playT += dt;
      const p = sampleRecPath(rg.path, rg.playT);
      rg.bug.rig.root.position.set(p.x, p.y, p.z);
      rg.bug.rig.root.rotation.z += dt * 6;
      rg.bug.rig.root.rotation.x += dt * 3;
      if (rg.playT >= rg.end.t) {
        this.rags.splice(i, 1);
        rg.bug.rig.root.rotation.set(0, rg.bug.rig.root.rotation.y, 0);
        rg.bug.airborne = false;
        rg.bug.rig.state = 'idle';
        if (rg.end.type === 'splash') {
          this.fx.splash(rg.end.pos, this._splashColor());
          audio.splash();
          this._kill(rg.bug, 'fell');
          this.opts.onPhase?.('splash', rg.bug);
        } else {
          rg.bug.li = rg.end.ledge.i;
          rg.bug.s = clamp(rg.end.s, 0.25, rg.end.ledge.len - 0.25);
          this._placeBug(rg.bug);
          const ld = phys.landDamage(rg.end.landV);
          if (ld > 0) { this._hurt(rg.bug, ld, this.allBugs.find(b => b.id === rg.bug.lastHurtBy) || null); }
          else if (this.rng() < 0.4) voice.say(rg.bug, 'land');
          if (rg.bug.hp <= 0) this._kill(rg.bug, 'boom');
        }
      }
    }

    // deaths from damage (after rags resolve so the drama reads)
    if (this.phase === 'resolve' && !this.rags.length && !this.projectiles.length && !this.strike) {
      for (const bug of this.allBugs) if (bug.alive && bug.hp <= 0) this._kill(bug, 'boom');
      if (this.pendingShards.length) {
        const s = this.pendingShards.shift();
        this._startShotPlayback(s);
      } else {
        this.opts.onHUD?.(this);
        this._maybeReplay();
      }
    }

    if (this.phase === 'replay' && this.replay) this._replayStep(dt);
  }

  _strikeStep(dt) {
    const st = this.strike;
    st.playT += dt;
    if (st.kind === 'shoe') {
      const k = Math.min(1, st.playT / st.dur);
      const p = sampleRecPath(st.rec.shotPath, st.playT);
      st.mesh.position.set(p.x, p.y, p.z);
      st.mesh.rotation.z = Math.sin(st.playT * 3) * 0.08;
      if (k >= 1) {
        this.group.remove(st.mesh);
        audio.squashThud();
        this.cams.addShake(0.9);
        this.strike = null;
        this._detonate(st.rec);
      }
    } else {
      // bee run
      const w = st.w;
      const speed = 6.5;
      for (let i = 0; i < st.bombers.length; i++) {
        const b = st.bombers[i];
        const lag = i * 0.8;
        const d = (st.playT - lag * 0.12) * speed;
        b.position.set(st.from.x + st.dir.x * d - st.dir.z * (i - 1) * 0.7,
          st.alt + Math.sin(st.playT * 3 + i) * 0.15,
          st.from.z + st.dir.z * d + st.dir.x * (i - 1) * 0.7);
        b.rotation.y = Math.atan2(st.dir.x, st.dir.z);
        animateBomber(b, st.playT + i);
      }
      // drop bombs over the target zone
      const lead = st.bombers[0];
      const distToTarget = Math.hypot(lead.position.x - st.at.x, lead.position.z - st.at.z);
      if (st.dropped < st.bombs && distToTarget < st.w.span * 0.6 + (st.bombs - st.dropped) * 0.5) {
        st.dropped++;
        const from = v3(lead.position.x, lead.position.y - 0.3, lead.position.z);
        const rec = phys.simulate({ pos: from, vel: v3(st.dir.x * 3, -2, st.dir.z * 3), w: { ...w, kind: 'arc' }, shooterId: null }, this.physWorld());
        rec.weaponId = 'bee52'; rec.shooter = this._active; rec.isShard = st.dropped > 1;
        rec.shotPath = rec.path; rec.dur = rec.impact.t;
        const mesh = makeBeeBomb();
        this.group.add(mesh);
        this.projectiles.push({ rec, playT: 0, mesh, lastFuse: 0 });
        if (st.dropped === 1) this.turnRec.shots.push(rec);
      }
      if (st.playT > st.dur) {
        for (const b of st.bombers) this.group.remove(b);
        this.strike = null;
        if (!this.projectiles.length) this.phase = 'resolve';
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.arena.dispose();
    this.markerTag?.remove();
    voice.clear();
    audio.whooshStop(); audio.chargeStop();
  }
}
