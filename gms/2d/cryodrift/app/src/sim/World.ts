import { Rng } from '../core/rng';
import {
  ENEMIES,
  statsForStrain,
  STRAINS,
  WAVE,
  type EnemyType,
  type PlayerStats,
  type StrainDef,
  type UpgradeDef,
} from '../config/balance';
import { Pool } from './Pool';
import {
  makeAntibody,
  makeEnemy,
  makePickup,
  makePlayer,
  makeProjectile,
  type Antibody,
  type Enemy,
  type Pickup,
  type PickupKind,
  type PhZone,
  type Player,
  type Projectile,
} from './entities';

/** A discrete thing that happened this step — drained by render + audio (the seam). */
export interface SimEvent {
  type: string;
  x?: number;
  y?: number;
  r?: number;
  color?: number;
  n?: number;
}

export type WavePhase = 'breather' | 'spawning' | 'fighting' | 'cleared';

/**
 * The entire simulation state. Pixi-free: takes input + dt, advances state, emits
 * events. Render reads it, never writes it (build plan §4/§15).
 */
export class World {
  rng: Rng;
  time = 0;
  strain: StrainDef;
  stats: PlayerStats;

  player: Player;
  enemies = new Pool<Enemy>(makeEnemy, 128);
  projectiles = new Pool<Projectile>(makeProjectile, 512);
  pickups = new Pool<Pickup>(makePickup, 256);
  antibodies = new Pool<Antibody>(makeAntibody, 24);
  phZones: PhZone[] = [];

  // wave / flow state
  wave = 0;
  phase: WavePhase = 'breather';
  phaseTimer = WAVE.breather;
  spawnQueue: EnemyType[] = [];
  spawnCd = 0;

  // run stats
  score = 0;
  streak = 0;
  bestStreak = 0;
  kills = 0;
  state: 'playing' | 'dead' = 'playing';
  runTime = 0;

  // upgrade flow (sim pauses while UI resolves)
  pendingUpgrade = false;
  upgradeChoices: UpgradeDef[] = [];

  events: SimEvent[] = [];

  /** menu backdrop: only ambient drift runs, no gameplay. */
  demo = false;

  constructor(strainId = 'cyto', seed?: number) {
    this.rng = new Rng(seed);
    this.strain = STRAINS.find((s) => s.id === strainId) ?? STRAINS[0];
    this.stats = statsForStrain(this.strain);
    this.player = makePlayer();
    this.player.membrane = this.stats.maxMembrane;
    this.player.atp = this.stats.maxAtp;
    this.scatterHazards();
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  private scatterHazards(): void {
    const r = WAVE.arenaRadius;
    // a handful of pH pockets
    const zones = 4;
    for (let i = 0; i < zones; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = this.rng.range(r * 0.3, r * 0.82);
      this.phZones.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        radius: this.rng.range(150, 260),
        dps: this.rng.range(8, 14),
        phase: this.rng.next() * Math.PI * 2,
      });
    }
    // drifting antibody clusters
    const clusters = 5;
    for (let i = 0; i < clusters; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = this.rng.range(r * 0.25, r * 0.85);
      const ab = this.antibodies.spawn();
      ab.pos.x = ab.prev.x = Math.cos(a) * d;
      ab.pos.y = ab.prev.y = Math.sin(a) * d;
      ab.radius = this.rng.range(26, 44);
      const v = this.rng.dir();
      const sp = this.rng.range(8, 22);
      ab.vel.x = v.x * sp;
      ab.vel.y = v.y * sp;
      ab.spin = this.rng.range(-1, 1);
    }
  }

  spawnEnemyAt(type: EnemyType, x: number, y: number): Enemy {
    const def = ENEMIES[type];
    const e = this.enemies.spawn();
    e.type = type;
    e.def = def;
    e.hp = e.maxHp = def.hp;
    e.radius = def.radius;
    e.pos.x = e.prev.x = x;
    e.pos.y = e.prev.y = y;
    e.vel.x = 0;
    e.vel.y = 0;
    e.heading = Math.atan2(-y, -x);
    e.fireCd = this.rng.range(0.3, 1);
    e.wander = this.rng.next() * Math.PI * 2;
    e.orbitDir = this.rng.bool() ? 1 : -1;
    e.fuse = 0;
    e.contactCd = 0;
    e.hitFlash = 0;
    return e;
  }

  spawnProjectile(
    team: 0 | 1,
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    life: number,
    radius: number,
  ): void {
    const p = this.projectiles.spawn();
    p.team = team;
    p.pos.x = p.prev.x = x;
    p.pos.y = p.prev.y = y;
    p.vel.x = vx;
    p.vel.y = vy;
    p.heading = Math.atan2(vy, vx);
    p.damage = damage;
    p.life = life;
    p.radius = radius;
  }

  spawnPickup(kind: PickupKind, x: number, y: number, value: number): void {
    const p = this.pickups.spawn();
    p.kind = kind;
    p.pos.x = p.prev.x = x;
    p.pos.y = p.prev.y = y;
    const v = this.rng.dir();
    const sp = this.rng.range(20, 70);
    p.vel.x = v.x * sp;
    p.vel.y = v.y * sp;
    p.radius = kind === 'organelle' ? 12 : 9;
    p.life = kind === 'organelle' ? 18 : 13;
    p.value = value;
    p.wobble = this.rng.next() * Math.PI * 2;
  }
}
