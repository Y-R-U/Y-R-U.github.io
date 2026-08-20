#!/usr/bin/env node
// tools/cap_s2h.mjs — the S2-H capture pass. Street level, looked at rather than reported on.
//
//   node tools/cap_s2h.mjs                 # portrait 390x844
//   node tools/cap_s2h.mjs --land          # landscape 844x390
//   node tools/cap_s2h.mjs --headed
//
// Every camera here is DERIVED from a real shopfront's own instance matrix rather than hand-picked,
// so a frame cannot accidentally be aimed at bare wall and read as "the feature is not working".
// Shots land in shots/s2h/ (gitignored, like every other render).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const TAG = LAND ? 'land' : 'port';
const OUT = resolve(ROOT, 'shots/s2h');
const DEG = 180 / Math.PI;

// The same district anchors gates_p3a uses, so "the Lantern Quarter" means the same place in both.
const SPOTS = [
  ['lantern', [5504, 180, -10112]],
  ['ribs', [-2944, 180, 1920]],
  ['soot', [3968, 200, -10112]],
  ['spine', [40, 220, 30]],
];

const cam = (S, pos, yaw, pitch, fov = 62) =>
  evalJSON(S, `(window.__game.setCamera({pos:[${pos}],yaw:${yaw},pitch:${pitch},fov:${fov}}),1)`);

async function drain(S) {
  await settle(S, 8);
  for (let i = 0; i < 300; i++) {
    const s = await evalJSON(S, 'window.__state');
    if (s.city.queued === 0) { await settle(S, 8); return true; }
    await settle(S, 6);
  }
  throw new Error('the near ring never finished streaming');
}

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}_${TAG}.png`), Buffer.from(data, 'base64'));
  console.log(`  → shots/s2h/${name}_${TAG}.png`);
}

// `setCamera` uses three's YXZ Euler, so the view direction is ( -sin(yaw), -cos(yaw) ) and the
// yaw that LOOKS ALONG (dx, dz) is atan2( -dx, -dz ). Getting that sign backwards aims the camera
// 180 degrees away, and the first pass of this tool did exactly that: four districts of frames
// showing the back wall of the street with no shopfront in any of them, which reads precisely like
// a feature that is not drawing. The A/B is what caught it — ON and OFF were byte-identical.
const lookYaw = (dx, dz) => Math.atan2(-dx, -dz) * DEG;

// Stand `back` metres off a shopfront's own face at height `eye`, looking straight at its middle.
async function faceShop(S, m, back, eye, pitchBias = 0) {
  const px = m.x + m.nx * back, pz = m.z + m.nz * back;
  const yaw = lookYaw(m.x - px, m.z - pz);
  const pitch = Math.atan2(m.y - eye, back) * DEG + pitchBias;
  await cam(S, [px.toFixed(2), eye, pz.toFixed(2)], yaw.toFixed(2), pitch.toFixed(2));
  await settle(S, 6);
  return { px, pz, yaw, pitch };
}

mkdirSync(OUT, { recursive: true });

const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
await S('Page.navigate', { url: `${base}/index.html?nosave&nohud&var=deepnight` });
await waitFor(S, 'window.__ready', 60000);
await drain(S);

for (const [name, pos] of SPOTS) {
  console.log(name);
  await cam(S, pos, 20, -6);
  await drain(S);
  const meta = await evalJSON(S, 'window.__game.shopMeta(0)');
  if (!meta.length) { console.log('  no shopfronts here'); continue; }
  const st = await evalJSON(S, 'window.__game.shopState()');
  console.log(`  ${st.n} shopfronts live, kinds ${JSON.stringify(st.stats).slice(0, 200)}`);

  // The one nearest the district anchor, so the row behind it is in frame too.
  const near = meta.slice().sort((a, b) =>
    Math.hypot(a.x - pos[0], a.z - pos[2]) - Math.hypot(b.x - pos[0], b.z - pos[2]))[0];

  // §3.1's canyon is ROAD = 13.2 m wide, so "stand back and look at it" has a hard ceiling: at
  // 13 m the camera is 80 mm inside the building across the street, which is exactly how the first
  // pass of this tool produced four frames of flat red and nearly read as a broken feature.
  await faceShop(S, near, 6.6, 3.2);
  await shot(S, `${name}_open`);

  // The oblique view — the same shop from 55 m down the street, which is the angle Aaron's blind is
  // meant to shut at, and the only way to see a whole row at once.
  {
    const tx = -near.nz, tz = near.nx;
    const px = near.x + tx * 52 + near.nx * 6.6, pz = near.z + tz * 52 + near.nz * 6.6;
    const yaw = lookYaw(near.x - px, near.z - pz);
    await cam(S, [px.toFixed(2), 4.2, pz.toFixed(2)], yaw.toFixed(2), -1);
    await settle(S, 6);
    await shot(S, `${name}_row`);
  }

  // Straight down the street, mid-road. This is the shot that shows whether a lit ground floor
  // makes a canyon read as a street.
  {
    const tx = -near.nz, tz = near.nx;
    const px = near.x + tx * 78 + near.nx * 6.6, pz = near.z + tz * 78 + near.nz * 6.6;
    const yaw = lookYaw(-tx, -tz);           // back down the street, past the shop we anchored on
    await cam(S, [px.toFixed(2), 6.0, pz.toFixed(2)], yaw.toFixed(2), -2);
    await settle(S, 6);
    await shot(S, `${name}_canyon`);
  }

  // What the player actually sees most of the time: 55 m up, looking down the same street. Every
  // blind in frame should be shut here, and that being unremarkable is the point of the feature.
  {
    const tx = -near.nz, tz = near.nx;
    const px = near.x + tx * 60 + near.nx * 6.6, pz = near.z + tz * 60 + near.nz * 6.6;
    await cam(S, [px.toFixed(2), 55, pz.toFixed(2)], lookYaw(-tx, -tz).toFixed(2), -26);
    await settle(S, 6);
    await shot(S, `${name}_above`);
  }
}

// ── the A/B, on the one camera that has the most shopfront on screen ───────
console.log('a/b');
await cam(S, SPOTS[0][1], 20, -6);
await drain(S);
const meta = await evalJSON(S, 'window.__game.shopMeta(0)');
const near = meta.slice().sort((a, b) =>
  Math.hypot(a.x - SPOTS[0][1][0], a.z - SPOTS[0][1][2]) - Math.hypot(b.x - SPOTS[0][1][0], b.z - SPOTS[0][1][2]))[0];
await faceShop(S, near, 6.6, 3.2);
await hook(S, 'setShopVisible', false);
await settle(S, 6);
await shot(S, 'ab_off');
await hook(S, 'setShopVisible', true);
await settle(S, 6);
await shot(S, 'ab_on');
await hook(S, 'setShopForce', 0);
await settle(S, 6);
await shot(S, 'ab_blind_shut');
await hook(S, 'setShopForce', 1);
await settle(S, 6);
await shot(S, 'ab_blind_open');
await hook(S, 'setShopForce', -1);

await close();
console.log('done');
