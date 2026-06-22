import { PAL } from './palette';

/* ───────────────────────── Player strains ───────────────────────── */

export interface StrainDef {
  id: string;
  name: string;
  blurb: string;
  tint: number;
  // feel multipliers (applied over FEEL)
  thrustMul: number;
  maxSpeedMul: number;
  dragMul: number;
  // combat
  maxMembrane: number;
  maxAtp: number;
  atpRegen: number;
  toxinDamage: number;
  fireInterval: number; // seconds between shots
  toxinSpeed: number;
}

export const STRAINS: StrainDef[] = [
  {
    id: 'cyto',
    name: 'Cytophage',
    blurb: 'Balanced generalist. A dependable membrane and steady enzyme fire.',
    tint: PAL.player,
    thrustMul: 1, maxSpeedMul: 1, dragMul: 1,
    maxMembrane: 100, maxAtp: 100, atpRegen: 18,
    toxinDamage: 14, fireInterval: 0.16, toxinSpeed: 720,
  },
  {
    id: 'flagellate',
    name: 'Flagellate',
    blurb: 'Fast and slippery. Thin membrane — survive on movement, not armor.',
    tint: PAL.orbiter,
    thrustMul: 1.28, maxSpeedMul: 1.22, dragMul: 1.12,
    maxMembrane: 74, maxAtp: 120, atpRegen: 24,
    toxinDamage: 11, fireInterval: 0.13, toxinSpeed: 820,
  },
  {
    id: 'lysophage',
    name: 'Lysophage',
    blurb: 'Heavy hitter. Sluggish but its enzyme bursts hit like a hammer.',
    tint: PAL.mutation,
    thrustMul: 0.84, maxSpeedMul: 0.9, dragMul: 0.92,
    maxMembrane: 130, maxAtp: 90, atpRegen: 16,
    toxinDamage: 24, fireInterval: 0.24, toxinSpeed: 640,
  },
];

/* ───────────────────────── Player base stats ─────────────────────── */

export const PLAYER = {
  baseRadius: 26,
  radiusCap: 54,
  growthPerNutrient: 1.5,
  growthHpScale: 1.6, // +maxMembrane per px of radius gained
  growthSluggish: 0.5, // 0..1: how much speed/thrust the max radius shaves

  regenDelay: 2.4, // s after damage before membrane regen
  regenRate: 4, // hp/s

  contactInvuln: 0.6, // s of i-frames after a contact hit

  toxinLifetime: 0.95,
  toxinRadius: 6,
  toxinInheritVel: 0.35,
  splitShot: 1,
  splitSpread: 0.16, // radians between split pellets
  lifesteal: 0, // fraction of toxin damage returned as heal

  magnetRange: 130,

  boostAtpPerSec: 32,

  lysisAtpCost: 34,
  lysisRadius: 150,
  lysisDamage: 64,
  lysisCooldown: 0.7,

  engulfAtpCost: 24,
  engulfHpFrac: 0.35, // engulf only enemies at/below this HP fraction
  engulfReach: 22,
  engulfHeal: 16,
} as const;

/* ───────────────────────── Enemy archetypes ──────────────────────── */

export type EnemyType = 'seeker' | 'drifter' | 'orbiter' | 'burster' | 'macrophage';

export interface EnemyDef {
  type: EnemyType;
  hp: number;
  radius: number;
  contact: number; // contact damage
  thrust: number;
  drag: number;
  maxSpeed: number;
  score: number;
  tint: number;
  // shooters
  fireInterval?: number;
  projDamage?: number;
  projSpeed?: number;
  range?: number;
  // orbiter
  orbitRadius?: number;
  // burster
  trigger?: number;
  fuse?: number;
  explodeRadius?: number;
  explodeDamage?: number;
  // drops
  dropOrganelle?: boolean;
  boss?: boolean;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  seeker: {
    type: 'seeker', hp: 28, radius: 18, contact: 10,
    thrust: 540, drag: 0.5, maxSpeed: 235, score: 100, tint: PAL.seeker,
  },
  drifter: {
    type: 'drifter', hp: 22, radius: 16, contact: 7,
    thrust: 280, drag: 0.62, maxSpeed: 150, score: 120, tint: PAL.drifter,
    fireInterval: 1.4, projDamage: 8, projSpeed: 360, range: 540,
  },
  orbiter: {
    type: 'orbiter', hp: 32, radius: 17, contact: 7,
    thrust: 440, drag: 0.55, maxSpeed: 230, score: 150, tint: PAL.orbiter,
    fireInterval: 0.95, projDamage: 7, projSpeed: 430, range: 620, orbitRadius: 230,
  },
  burster: {
    type: 'burster', hp: 18, radius: 15, contact: 0,
    thrust: 720, drag: 0.5, maxSpeed: 330, score: 140, tint: PAL.burster,
    trigger: 78, fuse: 0.45, explodeRadius: 112, explodeDamage: 32,
  },
  macrophage: {
    type: 'macrophage', hp: 340, radius: 46, contact: 22,
    thrust: 320, drag: 0.45, maxSpeed: 150, score: 650, tint: PAL.macrophage,
    dropOrganelle: true, boss: true,
  },
};

/* ───────────────────────── Waves ─────────────────────────────────── */

export interface SpawnGroup {
  type: EnemyType;
  count: number;
}

/** Procedurally escalating waves; a macrophage mini-boss every 5th wave. */
export function waveComposition(wave: number): SpawnGroup[] {
  const groups: SpawnGroup[] = [];
  const t = wave;
  groups.push({ type: 'seeker', count: 2 + Math.floor(t * 0.9) });
  if (t >= 2) groups.push({ type: 'drifter', count: 1 + Math.floor((t - 1) * 0.6) });
  if (t >= 3) groups.push({ type: 'orbiter', count: 1 + Math.floor((t - 2) * 0.5) });
  if (t >= 4) groups.push({ type: 'burster', count: 1 + Math.floor((t - 3) * 0.45) });
  if (t % 5 === 0) groups.push({ type: 'macrophage', count: Math.floor(t / 5) });
  return groups;
}

export const WAVE = {
  breather: 3.2, // s between waves
  spawnInterval: 0.55, // s between individual spawns within a wave
  arenaRadius: 1500, // petri-dish radius (world px)
  wallDamage: 6, // chip damage on hitting the meniscus
  wallBounce: 0.55,
} as const;

/* ───────────────────────── Upgrades (mutations) ──────────────────── */

export interface PlayerStats {
  maxMembrane: number;
  maxAtp: number;
  atpRegen: number;
  regenRate: number;
  toxinDamage: number;
  fireInterval: number;
  toxinSpeed: number;
  toxinRadius: number;
  splitShot: number;
  lifesteal: number;
  magnetRange: number;
  boostAtpPerSec: number;
  boostMaxMul: number;
  lysisDamage: number;
  lysisRadius: number;
  thrustMul: number;
  maxSpeedMul: number;
  dragMul: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  color: number;
  apply: (s: PlayerStats) => void;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'regen', name: 'Mitochondria', color: PAL.nutrient,
    desc: 'Membrane regenerates 70% faster.', apply: (s) => { s.regenRate *= 1.7; } },
  { id: 'split', name: 'Fission Spores', color: PAL.toxin,
    desc: 'Toxin splits into an extra pellet.', apply: (s) => { s.splitShot = Math.min(5, s.splitShot + 1); } },
  { id: 'membrane', name: 'Thick Membrane', color: PAL.membrane,
    desc: '+38 maximum membrane integrity.', apply: (s) => { s.maxMembrane += 38; } },
  { id: 'flagellum', name: 'Extra Flagellum', color: PAL.orbiter,
    desc: 'Boost costs 30% less ATP and runs faster.', apply: (s) => { s.boostAtpPerSec *= 0.7; s.boostMaxMul += 0.2; } },
  { id: 'bigtoxin', name: 'Caustic Enzyme', color: PAL.danger,
    desc: '+45% toxin damage and larger pellets.', apply: (s) => { s.toxinDamage *= 1.45; s.toxinRadius *= 1.5; } },
  { id: 'rapid', name: 'Twitch Cilia', color: PAL.player,
    desc: 'Fire 28% faster.', apply: (s) => { s.fireInterval *= 0.72; } },
  { id: 'magnet', name: 'Chemotaxis', color: PAL.nutrientSpark,
    desc: '+90 nutrient attraction range.', apply: (s) => { s.magnetRange += 90; } },
  { id: 'lysis', name: 'Volatile Vacuole', color: PAL.burster,
    desc: '+55% lysis-burst damage and radius.', apply: (s) => { s.lysisDamage *= 1.55; s.lysisRadius *= 1.25; } },
  { id: 'absorb', name: 'Osmotrophy', color: PAL.mutation,
    desc: 'Heal for 9% of toxin damage dealt.', apply: (s) => { s.lifesteal += 0.09; } },
  { id: 'agility', name: 'Axoneme Tune', color: PAL.toxin,
    desc: '+14% thrust for sharper handling.', apply: (s) => { s.thrustMul *= 1.14; } },
];

export function statsForStrain(strain: StrainDef): PlayerStats {
  return {
    maxMembrane: strain.maxMembrane,
    maxAtp: strain.maxAtp,
    atpRegen: strain.atpRegen,
    regenRate: PLAYER.regenRate,
    toxinDamage: strain.toxinDamage,
    fireInterval: strain.fireInterval,
    toxinSpeed: strain.toxinSpeed,
    toxinRadius: PLAYER.toxinRadius,
    splitShot: PLAYER.splitShot,
    lifesteal: PLAYER.lifesteal,
    magnetRange: PLAYER.magnetRange,
    boostAtpPerSec: PLAYER.boostAtpPerSec,
    boostMaxMul: 1.7,
    lysisDamage: PLAYER.lysisDamage,
    lysisRadius: PLAYER.lysisRadius,
    thrustMul: strain.thrustMul,
    maxSpeedMul: strain.maxSpeedMul,
    dragMul: strain.dragMul,
  };
}
