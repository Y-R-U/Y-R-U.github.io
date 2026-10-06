import { THREE, makeProp, addBox, syncColliders, Builder, roundedBox, mat, gloss, ease, woodTex } from './util.js';

// Six raised panels each side (classic panelled door).
function doorSlab(w, h, paint) {
  const t = 0.045;
  const b = new Builder();
  b.add(roundedBox(w, h, t, 0.012, 2), paint, { pos: [w / 2, h / 2, 0] });
  const rows = [[0.83, 0.2], [0.555, 0.27], [0.21, 0.32]];
  for (const side of [-1, 1]) for (const cx of [0.28, 0.72]) for (const [cy, ph] of rows) {
    b.add(roundedBox(w * 0.32, h * ph, 0.016, 0.008, 1), paint, { pos: [w * cx, h * cy, side * (t / 2 + 0.002)] });
    b.add(new THREE.BoxGeometry(w * 0.36, h * ph + w * 0.04, 0.006), paint, { pos: [w * cx, h * cy, side * (t / 2 - 0.001)] });
  }
  return b;
}

// Hinged door. Anchor = centre of the opening at floor, +Z = the side it swings toward; hinge on local -X.
function makeDoor(id, ctx, { w = 0.85, h = 2.05, color = 0xf1e6cf, wood = false, startOpen = false, locked = false } = {}) {
  const p = makeProp(id, ctx);
  const paint = wood ? gloss(0xffffff, { map: woodTex('#a8683a', '#6e3d1d', 'door'), roughness: 0.45, clearcoat: 0.5 }) : gloss(color, { roughness: 0.4, clearcoat: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8a843, metalness: 0.85, roughness: 0.28 });
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0); p.root.add(hinge);
  const leaf = new THREE.Group(); hinge.add(leaf);
  const b = doorSlab(w - 0.01, h - 0.01, paint);
  leaf.add(b.build(id + 'Slab'));
  const knob = new THREE.Group(); knob.position.set(w - 0.09, 0.98, 0); leaf.add(knob);
  const kb = new Builder();
  for (const s of [-1, 1]) {
    kb.add(new THREE.SphereGeometry(0.03, 10, 8), brass, { pos: [0, 0, s * 0.065] });
    kb.add(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 8), brass, { rot: [Math.PI / 2, 0, 0] });
    kb.add(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 16), brass, { pos: [0, 0, s * 0.026], rot: [Math.PI / 2, 0, 0] });
  }
  knob.add(kb.build('knob'));
  const block = addBox(p, 'blocker', p.root, [-w / 2, 0, -0.06], [w / 2, h, 0.06]);

  const OPEN = -1.75;
  Object.assign(p.state, { open: startOpen, locked });
  Object.defineProperty(p, 'isOpen', { get: () => p.state.open });
  const apply = () => { hinge.rotation.y = p.state.open ? OPEN : 0; block.enabled = !p.state.open; };
  apply();

  p.open = async () => {
    if (p.state.open) return;
    if (p.state.locked) return p.rattle();
    p.state.open = true; block.enabled = false;
    p.sfx('door', { vol: 0.7 });
    await p.anim.tween(0.7, e => { hinge.rotation.y = OPEN * e; }, ease.outBack);
  };
  p.close = async () => {
    if (!p.state.open) return;
    p.state.open = false;
    p.sfx('creak', { vol: 0.5 });
    await p.anim.tween(0.45, e => { hinge.rotation.y = OPEN * (1 - e); }, ease.inQuad);
    block.enabled = true;
    p.sfx('door', { vol: 1 });
    // slam shudder
    await p.anim.tween(0.25, (e, r) => { leaf.position.z = Math.sin(r * 30) * (1 - r) * 0.006; }, ease.linear);
    leaf.position.z = 0;
  };
  // pounding/jiggling from the other side
  p.rattle = async (dur = 0.6) => {
    p.sfx('whack', { vol: 0.5, rate: 0.7 });
    await p.anim.tween(dur, (e, r) => {
      const k = Math.sin(r * 55) * (1 - r * 0.5);
      leaf.position.z = k * 0.008;
      hinge.rotation.y = (p.state.open ? OPEN : 0) + k * 0.006;
      knob.rotation.z = Math.sin(r * 38) * 0.35;
    }, ease.linear);
    leaf.position.z = 0; knob.rotation.z = 0; hinge.rotation.y = p.state.open ? OPEN : 0;
  };
  p.reset = () => { p.anim.clear(); p.state.open = startOpen; leaf.position.z = 0; knob.rotation.z = 0; apply(); };
  return p;
}

export const createBedroomDoor = ctx => makeDoor('bedroomDoor', ctx, { color: 0xf4ead6, startOpen: true });
export const createFrontDoor = ctx => makeDoor('frontDoor', ctx, { w: 0.9, wood: true, locked: true });
