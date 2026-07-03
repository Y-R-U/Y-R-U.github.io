// The cinematic cold-open: letterboxed camera flight along the road while the
// story fades through, a small horde marching beneath. Skippable; plays before
// level 1 on a fresh save (and from Help → "watch the intro" if wired).

import * as THREE from 'three';

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
  const DUR = 16;

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
      // glide down the road from portal to castle, easing in
      const s = curve.total * (0.04 + 0.9 * (k * k * (3 - 2 * k)));
      curve.posAt(s, pos);
      curve.posAt(Math.min(s + 6, curve.total), ahead);
      const lift = 4.2 - 1.6 * k;
      camera.position.set(pos.x - 4 + 6 * k, lift, pos.z + 7 - 3 * k);
      camera.lookAt(ahead.x, 0.8, ahead.z);

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
