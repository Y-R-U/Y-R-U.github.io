// A free camera for looking at P11's work, outside the frozen §12.1 shots. Not a gate — the shot
// cameras are frozen for scoring and must not be moved, and "does the road grid line up with the
// streets" is a question no frozen camera happens to answer.
//
//   node tools/p11_view.mjs --name=topdown --pos=1305,300,300 --pitch=-89 --yaw=3.1416 [--var=stormnight]

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { open, waitFor, settle, evalJSON, quiesce, cleanup } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'shots/p11');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `=${d}`).split('=').slice(1).join('=');

async function main() {
  const name = arg('name', 'view');
  const pos = arg('pos', '1305,300,300').split(',').map(Number);
  const pitch = +arg('pitch', -60), yaw = +arg('yaw', 3.1416), fov = +arg('fov', 64);
  const variant = arg('var', 'stormnight');
  const W = +arg('w', 1200), H = +arg('h', 800);

  const ctx = await open({ w: W, h: H, dpr: 1, headed: false });
  const { S, base, close } = ctx;
  mkdirSync(OUT, { recursive: true });
  await S('Page.navigate', { url: `${base}/index.html?dpr=1&nohud&nosave&var=${variant}&freecam=1` });
  await waitFor(S, 'window.__ready', 30000);
  await evalJSON(S, `(window.__game.setCamera({pos:[${pos.join(',')}],yaw:${yaw},pitch:${pitch},fov:${fov}}),1)`);
  await quiesce(S, { label: `p11/${name}` });
  await settle(S, 40);
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const f = resolve(OUT, `${name}.png`);
  writeFileSync(f, Buffer.from(data, 'base64'));
  const st = await evalJSON(S, 'window.__state');
  console.log(`${name}  ${st.draws} draws  ${(st.tris / 1000).toFixed(1)}k tris  ${st.ms.frame.toFixed(2)}ms  ${st.errors.length} err  → ${f}`);
  await close();
}

main().catch(e => { console.error(e.message); cleanup(); process.exit(1); });
