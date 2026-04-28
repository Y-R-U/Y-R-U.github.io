import * as THREE from 'three';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function angleTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function lerpAngle(current, target, amount) {
  return current + normalizeAngle(target - current) * clamp(amount, 0, 1);
}

export function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function randomPointInArena(radius, innerRadius = 0) {
  const angle = Math.random() * Math.PI * 2;
  const dist = randomBetween(innerRadius, radius);
  return new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
}

export function keepInsideArena(position, radius, tankRadius = 0) {
  const dist = Math.hypot(position.x, position.z);
  const limit = radius - tankRadius;
  if (dist > limit) {
    const scale = limit / dist;
    position.x *= scale;
    position.z *= scale;
  }
}

export function resolveCircleCollision(a, b, minDistance) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  if (dist >= minDistance) return false;
  const push = (minDistance - dist) / dist;
  a.x += dx * push;
  a.z += dz * push;
  return true;
}

export function formatStanding(rank) {
  const mod10 = rank % 10;
  const mod100 = rank % 100;
  if (mod10 === 1 && mod100 !== 11) return `${rank}st`;
  if (mod10 === 2 && mod100 !== 12) return `${rank}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${rank}rd`;
  return `${rank}th`;
}
