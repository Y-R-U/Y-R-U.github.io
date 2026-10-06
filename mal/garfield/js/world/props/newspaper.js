import { THREE, makeProp, Builder, canvasTex, mat, ease } from './util.js';

function printTex() {
  return canvasTex('newsprint', 256, 256, (g, w, h) => {
    g.fillStyle = '#ece6d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b3833';
    g.font = 'bold 30px Georgia, serif'; g.fillText('DAILY NEWS', 18, 40);
    g.fillRect(14, 50, w - 28, 3);
    for (let c = 0; c < 3; c++) for (let y = 66; y < h - 10; y += 7) {
      if (c === 1 && y > 90 && y < 150) continue;
      g.globalAlpha = 0.55; g.fillRect(14 + c * 80, y, 68 - (Math.random() * 14 | 0), 3);
    }
    g.globalAlpha = 0.5; g.fillStyle = '#8a8478'; g.fillRect(94, 92, 68, 56);
    g.globalAlpha = 1;
  });
}

function rolled() {
  const b = new Builder();
  const paper = new THREE.MeshStandardMaterial({ map: printTex(), roughness: 0.85, side: THREE.DoubleSide });
  const band = mat(0xc0392b, { roughness: 0.6 });
  const tube = new THREE.CylinderGeometry(0.032, 0.032, 0.32, 16, 4, true);
  const p = tube.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.08 * (Math.abs(y) / 0.16) ** 2; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  tube.computeVertexNormals();
  b.add(tube, paper, { rot: [0, 0, Math.PI / 2] });
  b.add(new THREE.CylinderGeometry(0.024, 0.024, 0.325, 14, 1, true), paper, { rot: [0, 0, Math.PI / 2] });
  const flap = new THREE.PlaneGeometry(0.3, 0.05, 8, 2);
  const fp = flap.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, 0.01 * Math.sin(fp.getX(i) * 20));
  b.add(flap, paper, { pos: [0, 0.03, 0.022], rot: [-0.6, 0, 0] });
  b.add(new THREE.TorusGeometry(0.034, 0.004, 6, 16), band, { rot: [0, Math.PI / 2, 0] });
  return b.build('newspaper');
}
function folded() {
  // flat folded paper, 0.3 (X) x 0.22 (Z), gently bowed, a few stacked sheets
  const b = new Builder();
  const paper = new THREE.MeshStandardMaterial({ map: printTex(), roughness: 0.85, side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) {
    const g = new THREE.BoxGeometry(0.3 - k * 0.004, 0.003, 0.22 - k * 0.006, 8, 1, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.018 * (x / 0.15) ** 2 + 0.004 * Math.sin(z * 30 + k)); }
    g.computeVertexNormals();
    b.add(g, paper, { pos: [0, k * 0.004, 0] });
  }
  return b.build('newspaperFolded');
}

// {folded:true} → flat folded paper (good for throwing); default rolled (good for whacking). Both ~0.3 m along local X.
export function createNewspaper({ folded: f = false } = {}) {
  const g = f ? folded() : rolled();
  g.name = f ? 'newspaperFolded' : 'newspaper';
  return g;
}

// Prop wrapper: spawn a mesh, or throw one along an arc (spinning end over end).
export function createNewspaperProp(ctx) {
  const p = makeProp('newspaper', ctx);
  p.root.visible = false;
  const live = [];
  p.spawn = o => createNewspaper(o);
  p.throwAt = async (from, to, { dur = null, height = 0.6, onHit = null, folded = true } = {}) => {
    const m = createNewspaper({ folded });
    ctx.scene.add(m);
    const d = from.distanceTo(to);
    dur = dur ?? Math.max(0.35, d / 7);
    const peak = Math.max(from.y, to.y) + height * Math.min(1, d / 3);
    live.push(m);
    p.sfx('swipe', { vol: 0.5, rate: 1.2 });
    await p.anim.tween(dur, (e, r) => {
      m.position.lerpVectors(from, to, r);
      const a = from.y, c = to.y, bb = 2 * peak - (a + c) / 2;
      m.position.y = (1 - r) * (1 - r) * a + 2 * (1 - r) * r * bb + r * r * c;
      m.rotation.set(r * 14, Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2, 0);
    }, ease.linear);
    onHit?.(m.position.clone());
    // drop and rest on the floor briefly, then vanish
    const y0 = m.position.y, floor = ctx.floorY ?? 0;
    await p.anim.tween(0.35, (e) => { m.position.y = y0 + (floor + 0.035 - y0) * e; m.rotation.x += 0.2; }, ease.inQuad);
    m.rotation.set(0, m.rotation.y, 0);
    await p.anim.wait(1.5);
    m.removeFromParent();
    live.splice(live.indexOf(m), 1);
    return m;
  };
  p.reset = () => { p.anim.clear(); for (const m of live) m.removeFromParent(); live.length = 0; };
  return p;
}
