#!/usr/bin/env node
/**
 * Knees bend FORWARD. The knee joint value rotates the shin relative to the thigh, so a
 * POSITIVE one bows the knee backwards — a bird's leg — and the whole pose library was
 * originally written that way.
 *
 *   node tools/flipknees.mjs --check     # gate: fails if any pose bends a knee backwards
 *   node tools/flipknees.mjs             # rewrite js/poses.js onto the forward solve
 *   node tools/flipknees.mjs --falsify   # check a deliberately backwards leg, watch it fail
 *
 * The rewrite is the other branch of the two-link solve, so the FOOT DOES NOT MOVE: only the
 * knee crosses to the other side of the hip->ankle line. It is idempotent — a pose already on
 * the forward branch comes back unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BONE } from '../js/ragdoll.js';
import { POSE } from '../js/poses.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'js', 'poses.js');
const T = BONE.thigh, S = BONE.shin;
const clamp = (v) => Math.max(-1, Math.min(1, v));

/** The same foot, reached with the knee on the forward side. */
export function forwardKnee(h, k) {
  const fx = T * Math.sin(h) + S * Math.sin(h + k);
  const fy = T * Math.cos(h) + S * Math.cos(h + k);
  const d = Math.hypot(fx, fy);
  if (d < 1e-6) return [h, k];
  const phi = Math.atan2(fx, fy);
  const beta = Math.acos(clamp((T * T + S * S - d * d) / (2 * T * S)));
  const alpha = Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d)));
  return [phi + alpha, -(Math.PI - beta)];
}

const args = process.argv.slice(2);

if (args.includes('--check') || args.includes('--falsify')) {
  const poses = { ...POSE };
  // A bird's leg, planted in the library on purpose: the check must go red on it.
  if (args.includes('--falsify')) poses.__bad = { ...POSE.guard, kl: 0.36, hl: -0.28 };
  const bad = Object.entries(poses).filter(([, p]) => p.kl > 0.02 || p.kr > 0.02);
  for (const [n, p] of bad) console.log(`FAIL  ${n} bends a knee backwards  kl ${p.kl} kr ${p.kr}`);
  console.log(bad.length ? `\n${bad.length} of ${Object.keys(poses).length} poses bend backwards`
                         : `all ${Object.keys(poses).length} poses bend their knees forward`);
  process.exit(bad.length ? 1 : 0);
}

let src = readFileSync(FILE, 'utf8');
const r2 = (v) => +v.toFixed(2);
let touched = 0;
src = src.replace(/pose\(\{([^}]*)\}\)/g, (whole, body) => {
  const get = (key) => {
    const m = body.match(new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`));
    return m ? parseFloat(m[1]) : 0;
  };
  const [hl, kl] = forwardKnee(get('hl'), get('kl'));
  const [hr, kr] = forwardKnee(get('hr'), get('kr'));
  const next = { hl: r2(hl), kl: r2(kl), hr: r2(hr), kr: r2(kr) };
  let b = body;
  for (const key of ['hl', 'kl', 'hr', 'kr']) {
    if (!new RegExp(`\\b${key}:`).test(b)) continue;
    b = b.replace(new RegExp(`(\\b${key}:\\s*)(-?[\\d.]+)`), `$1${next[key]}`);
  }
  if (b !== body) touched++;
  return `pose({${b}})`;
});
writeFileSync(FILE, src);
console.log(`rewrote ${touched} poses onto the forward knee`);
