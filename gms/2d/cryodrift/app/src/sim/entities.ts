import type { EnemyDef, EnemyType } from '../config/balance';
import type { Body } from './movement';
import { makeBody } from './movement';
import type { Poolable } from './Pool';

/** Player cell — single instance, not pooled. */
export interface Player extends Body {
  membrane: number;
  atp: number;
  sinceDamage: number; // s since last damage taken (gates regen)
  invuln: number; // i-frame timer
  fireCd: number;
  lysisCd: number;
  growth: number; // px of radius added by nutrients
  alive: boolean;
  prevSpecial: boolean; // edge detection for the special button
}

export const makePlayer = (): Player => ({
  ...makeBody(0, 0, 26),
  membrane: 100,
  atp: 100,
  sinceDamage: 99,
  invuln: 0,
  fireCd: 0,
  lysisCd: 0,
  growth: 0,
  alive: true,
  prevSpecial: false,
});

export interface Enemy extends Body, Poolable {
  type: EnemyType;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  fireCd: number;
  wander: number; // wander heading
  orbitDir: 1 | -1;
  fuse: number; // burster countdown (>0 = armed)
  contactCd: number;
  hitFlash: number; // render cue, set by sim on damage
}

export const makeEnemy = (): Enemy =>
  ({
    ...makeBody(0, 0, 18),
    idx: 0,
    alive: false,
    type: 'seeker',
    def: undefined as unknown as EnemyDef,
    hp: 1,
    maxHp: 1,
    fireCd: 0,
    wander: 0,
    orbitDir: 1,
    fuse: 0,
    contactCd: 0,
    hitFlash: 0,
  }) as Enemy;

export interface Projectile extends Body, Poolable {
  team: 0 | 1; // 0 = player toxin, 1 = enemy
  damage: number;
  life: number;
}

export const makeProjectile = (): Projectile =>
  ({
    ...makeBody(0, 0, 6),
    idx: 0,
    alive: false,
    team: 0,
    damage: 0,
    life: 0,
  }) as Projectile;

export type PickupKind = 'nutrient' | 'organelle';

export interface Pickup extends Body, Poolable {
  kind: PickupKind;
  life: number;
  value: number;
  wobble: number;
}

export const makePickup = (): Pickup =>
  ({
    ...makeBody(0, 0, 9),
    idx: 0,
    alive: false,
    kind: 'nutrient',
    life: 0,
    value: 0,
    wobble: 0,
  }) as Pickup;

/** Drifting immune-system obstacle: solid + chip damage, indestructible. */
export interface Antibody extends Body, Poolable {
  spin: number;
}

export const makeAntibody = (): Antibody =>
  ({
    ...makeBody(0, 0, 34),
    idx: 0,
    alive: false,
    spin: 0,
  }) as Antibody;

/** Static-ish hazard zone (pH pocket). */
export interface PhZone {
  x: number;
  y: number;
  radius: number;
  dps: number;
  phase: number;
}
