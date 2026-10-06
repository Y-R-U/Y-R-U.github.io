import { THREE, makeProp, addBox, syncColliders, Builder, roundedBox, mat, gloss, ease, Particles } from './util.js';

// Sash window fitted to the wall hole (anchor = centre of the opening on the wall plane, +Z into the room).
export function createWindow(ctx, { w = 1.2, h = 1.2 } = {}) {
  const p = makeProp('window', ctx);
  const paint = mat(0xfaf3e6, { roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x4a5a90, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.4, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide });
  const brass = gloss(0xd9a441, { metalness: 0.8, roughness: 0.3 });
  const F = 0.05;

  const fb = new Builder();
  fb.add(roundedBox(w, F, 0.08, 0.01), paint, { pos: [0, h / 2 - F / 2, 0] });
  fb.add(roundedBox(w, F, 0.08, 0.01), paint, { pos: [0, -h / 2 + F / 2, 0] });
  fb.add(roundedBox(F, h, 0.08, 0.01), paint, { pos: [w / 2 - F / 2, 0, 0] });
  fb.add(roundedBox(F, h, 0.08, 0.01), paint, { pos: [-w / 2 + F / 2, 0, 0] });
  p.root.add(fb.build('winFrame'));

  const sashH = h / 2 - F + 0.01, sashW = w - F * 2;
  const sash = (z) => {
    const b = new Builder();
    const s = 0.035;
    b.add(roundedBox(sashW, s, 0.035, 0.008), paint, { pos: [0, sashH / 2 - s / 2, 0] });
    b.add(roundedBox(sashW, s, 0.035, 0.008), paint, { pos: [0, -sashH / 2 + s / 2, 0] });
    b.add(roundedBox(s, sashH, 0.035, 0.008), paint, { pos: [sashW / 2 - s / 2, 0, 0] });
    b.add(roundedBox(s, sashH, 0.035, 0.008), paint, { pos: [-sashW / 2 + s / 2, 0, 0] });
    b.add(roundedBox(0.02, sashH, 0.025, 0.006), paint);
    b.add(new THREE.PlaneGeometry(sashW - s, sashH - s), glass);
    const g = b.build('sash'); g.position.z = z;
    g.traverse(o => { if (o.isMesh && o.material === glass) { o.castShadow = false; o.renderOrder = 2; } });
    return g;
  };
  const upper = sash(-0.02); upper.position.y = sashH / 2 + 0.005; p.root.add(upper);
  const lower = sash(0.022); const lowY = -sashH / 2 - 0.005; lower.position.y = lowY; p.root.add(lower);
  const lock = new THREE.Mesh(roundedBox(0.06, 0.015, 0.03, 0.006), brass); lock.position.set(0, sashH / 2 - 0.01, 0.03);
  lower.add(lock);
  const lift = new THREE.Mesh(roundedBox(0.08, 0.02, 0.02, 0.008), brass); lift.position.set(0, -sashH / 2 + 0.03, 0.03);
  lower.add(lift);

  // blocker stays on even when open: the breeze comes in, the cat doesn't go out
  const glassC = addBox(p, 'glass', p.root, [-w / 2, -h / 2, -0.05], [w / 2, h / 2, 0.05]);

  const streakGeo = new THREE.BoxGeometry(0.014, 0.006, 0.5);
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xe4f6ff, transparent: true, opacity: 0.55, depthWrite: false });
  const streaks = new Particles(ctx.scene, { count: 40, geo: streakGeo, material: streakMat, gravity: 0, drag: 0.2, floorY: -10 });
  let spawnT = 0;
  const into = new THREE.Vector3();

  Object.assign(p.state, { open: false });
  Object.defineProperty(p, 'isOpen', { get: () => p.state.open });
  p.curtains = null; // set by index.js
  const openY = lowY + sashH * 0.85;

  p.onUpdate(dt => {
    streaks.update(dt);
    if (!p.state.open) return;
    spawnT -= dt;
    while (spawnT < 0) {
      spawnT += 0.06;
      const at = new THREE.Vector3((Math.random() - 0.5) * sashW * 0.9, -h / 2 + 0.05 + Math.random() * sashH * 0.8, -0.1);
      p.root.localToWorld(at);
      into.set(0, 0, 1).applyQuaternion(p.root.getWorldQuaternion(new THREE.Quaternion()));
      const sp = 2 + Math.random() * 1.5;
      const q = streaks.spawn({ pos: at, vel: into.clone().multiplyScalar(sp).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.2 + Math.random() * 0.3, 0)), life: 1.2 + Math.random() * 0.8, size: 1, sizeEnd: 0.2, spin: new THREE.Vector3(0, 0, 0) });
      q.rot.set(0, Math.atan2(into.x, into.z), 0);
    }
  });

  p.open = async () => {
    if (p.state.open) return;
    p.state.open = true;
    p.sfx('creak', { vol: 0.7 });
    await p.anim.tween(0.8, e => { lower.position.y = lowY + (openY - lowY) * e; }, ease.inOut);
    p.sfx('wind', { vol: 0.7 });
    p.curtains?.wave(true);
  };
  p.close = async () => {
    if (!p.state.open) return;
    p.state.open = false;
    await p.anim.tween(0.6, e => { lower.position.y = openY + (lowY - openY) * e; }, ease.inOut);
    p.sfx('click', { vol: 0.8 });
    glassC.enabled = true;
    p.curtains?.wave(false);
  };
  p.reset = () => { p.anim.clear(); p.state.open = false; lower.position.y = lowY; glassC.enabled = true; streaks.clear(); p.curtains?.wave(false); };
  return p;
}
