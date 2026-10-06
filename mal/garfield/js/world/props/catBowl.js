import { THREE, makeProp, Builder, lathe, gloss, mat, Particles, rng, canvasTex } from './util.js';

export function createCatBowl(ctx) {
  const p = makeProp('catBowl', ctx);
  const tex = canvasTex('bowlBand', 256, 32, (g, w, h) => {
    g.fillStyle = '#2f6fb8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd66b';
    // paw prints round the band
    for (let i = 0; i < 6; i++) {
      const x = (i + 0.5) * w / 6, y = h / 2 + 2;
      g.beginPath(); g.ellipse(x, y, 6, 5, 0, 0, Math.PI * 2); g.fill();
      for (const [dx, dy] of [[-6, -6], [-2, -9], [2, -9], [6, -6]]) { g.beginPath(); g.arc(x + dx, y + dy, 2.2, 0, Math.PI * 2); g.fill(); }
    }
  }, { repeat: [1, 1] });
  const out = gloss(0xffffff, { map: tex, roughness: 0.25, clearcoat: 1 });
  const inside = gloss(0xfdf6ea, { roughness: 0.2, clearcoat: 1 });
  const b = new Builder();
  b.add(lathe([[0, 0], [0.085, 0], [0.095, 0.006], [0.1, 0.03], [0.098, 0.055], [0.092, 0.058]], 40), out);
  b.add(lathe([[0.092, 0.058], [0.086, 0.055], [0.078, 0.02], [0.06, 0.012], [0, 0.012]], 40), inside);
  p.root.add(b.build('bowl'));

  // kibble heap: little rounded crosses/fish bites as instances
  const kib = new THREE.CylinderGeometry(0.009, 0.0095, 0.007, 7);
  const kmat = gloss(0xa8642c, { roughness: 0.6, clearcoat: 0.3 });
  const N = 70;
  const heap = new THREE.InstancedMesh(kib, kmat, N);
  heap.castShadow = true; heap.receiveShadow = true;
  const r = rng(5), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.072;
    const h = 0.016 + 0.035 * (1 - (d / 0.075) ** 2) * (0.5 + r() * 0.5);
    m4.compose(new THREE.Vector3(Math.cos(a) * d, h, Math.sin(a) * d), qq.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.85 + r() * 0.35));
    heap.setMatrixAt(i, m4);
    heap.setColorAt(i, c.setHSL(0.07 + r() * 0.03, 0.55, 0.32 + r() * 0.14));
  }
  p.root.add(heap);
  p.heap = heap;

  const bits = new Particles(ctx.scene, { count: 30, geo: kib, material: kmat, floorY: (ctx.floorY ?? 0) + 0.003, bounce: 0.3 });
  p.onUpdate(dt => bits.update(dt));

  // Garfield spits: from his mouth (world pos) along dir.
  p.spitBits = (from, dir) => {
    if (!from) { from = new THREE.Vector3(0, 0.25, 0.15); p.root.localToWorld(from); }
    if (!dir) dir = new THREE.Vector3(0, 0, 1).applyQuaternion(p.root.getWorldQuaternion(new THREE.Quaternion()));
    p.sfx('spit');
    for (let i = 0; i < 9; i++) {
      const v = dir.clone().normalize().multiplyScalar(1.4 + Math.random() * 1.2);
      v.x += (Math.random() - 0.5) * 0.9; v.z += (Math.random() - 0.5) * 0.9; v.y += 0.8 + Math.random() * 0.9;
      bits.spawn({ pos: from, vel: v, life: 6, size: 0.8 + Math.random() * 0.5 });
    }
    // one bite gone from the heap
    heap.count = Math.max(N - 6, heap.count - 3);
  };
  p.bitePos = (out = new THREE.Vector3()) => { out.set(0, 0.06, 0); return p.root.localToWorld(out); };
  p.reset = () => { bits.clear(); heap.count = N; };
  return p;
}
