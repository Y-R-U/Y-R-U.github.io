// The cinematic cold-open: letterboxed camera flight along the road while the
// story fades through, a small horde marching beneath. Skippable; plays before
// level 1 on a fresh save (and from Help → "watch the intro" if wired).

import * as THREE from 'three';
import { CELL } from './config.js';
import { clamp } from './utils.js';

const smooth = (t) => t * t * (3 - 2 * t);

const LINES = [
  'For a hundred years, the old roads slept…',
  '…until the Hollow King woke,<br>and his horde began to march.',
  'Every road leads to one last castle.<br><b>Yours.</b>',
  '<span class="big">TOWERED</span><br>Raise your towers. Hold the line.',
];

export function playIntro(game) {
  const { world, camera, enemies } = game;
  const overlay = document.getElementById('intro');
  const text = document.getElementById('intro-text');
  const skipBtn = document.getElementById('intro-skip');
  overlay.classList.remove('hidden');

  // a doomed parade for the flyover
  const marchers = ['shambler', 'shambler', 'rotter', 'bones', 'shambler', 'rotter'];
  marchers.forEach((t, i) => enemies.spawn(t, 0).then(e => {
    e.s = world.curves[0].total * 0.12 + i * 2.2;
    e.waveIdx = -1;
  }));

  const curve = world.curves[0];
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3();
  const lowP = new THREE.Vector3(), lowL = new THREE.Vector3();
  const camP = new THREE.Vector3(), camL = new THREE.Vector3();
  const DUR = 16;

  // The road glide stops short of the castle (LIFT_AT) and the camera climbs
  // away from the path into a wide overhead reveal — landing on roughly the
  // vantage gameplay starts from, so the hand-off after the title is seamless.
  const LIFT_AT = 0.55;
  const castle = world.castlePos;
  const span = Math.max(game.level.grid.w, game.level.grid.h) * CELL;
  // Portrait can't fit the map's long axis at a landscape height — climb higher.
  const portrait = innerHeight > innerWidth ? 2.1 : 1;
  const hiR = clamp(span * 1.08 * portrait, 32, 112), hiPhi = 0.66, hiTheta = Math.PI + 0.25;
  // aim a little toward the castle so it sits inside the frame, not on the edge
  const bias = portrait > 1 ? 0.3 : 0.18;
  const hiL = new THREE.Vector3(castle.x * bias, 0.5, castle.z * bias);
  const hiP = new THREE.Vector3(
    hiL.x + Math.sin(hiTheta) * Math.sin(hiPhi) * hiR,
    Math.cos(hiPhi) * hiR,
    hiL.z + Math.cos(hiTheta) * Math.sin(hiPhi) * hiR);

  return new Promise((resolve) => {
    let t = 0, lineIdx = -1, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      overlay.classList.add('hidden');
      text.classList.remove('show');
      skipBtn.onclick = null;
      enemies.clear();
      resolve();
    };
    skipBtn.onclick = finish;

    game.introTick = (dt) => {
      if (done) return false;
      t += dt;
      const k = Math.min(t / DUR, 1);
      // low pass: glide down the road from the portal, easing in but never
      // reaching the castle — the climb takes over before we'd hit the walls
      const s = curve.total * (0.04 + 0.68 * smooth(k));
      curve.posAt(s, pos);
      curve.posAt(Math.min(s + 6, curve.total), ahead);
      lowP.set(pos.x - 4 + 6 * k, 4.2 - 1.2 * k, pos.z + 7 - 3 * k);
      lowL.set(ahead.x, 0.8, ahead.z);

      // climb: arc up and back until the whole battlefield is in frame
      const u = smooth(clamp((k - LIFT_AT) / (1 - LIFT_AT), 0, 1));
      camP.lerpVectors(lowP, hiP, u).y += Math.sin(u * Math.PI) * 5;
      camL.lerpVectors(lowL, hiL, u);
      camera.position.copy(camP);
      camera.lookAt(camL);

      const li = Math.min(Math.floor(k * LINES.length), LINES.length - 1);
      if (li !== lineIdx) {
        lineIdx = li;
        text.classList.remove('show');
        setTimeout(() => { text.innerHTML = LINES[li]; text.classList.add('show'); }, 350);
      }
      if (k >= 1) { setTimeout(finish, 1200); return false; }
      return true;
    };
  });
}
