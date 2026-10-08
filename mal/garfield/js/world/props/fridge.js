import { THREE, makeProp, addBox, syncColliders, Builder, roundedBox, gloss, mat, ease, lathe, palette } from './util.js';

const W = 0.75, H = 1.85, D = 0.7, T = 0.05;

// Old rounded 50s fridge. Anchor = floor point at the front face centre, +Z = facing out.
export function createFridge(ctx, { hingeSide = -1 } = {}) {
  const p = makeProp('fridge', ctx);
  const enamel = gloss(0xf3e4b4, { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 });
  const liner = gloss(0xf8f6ef, { roughness: 0.3, clearcoat: 0.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.18 });
  const PAL = palette();
  const glow = new THREE.MeshStandardMaterial({ color: 0xf8f4ea, emissive: 0xfff1c0, emissiveIntensity: 0, roughness: 0.35 });

  const body = new THREE.Group(); body.position.z = -D / 2; p.root.add(body);
  const b = new Builder();
  // shell: back, sides, top (big rounded crown), bottom
  b.add(roundedBox(W, H - 0.02, T, 0.03), enamel, { pos: [0, H / 2, -D / 2 + T / 2] });
  for (const s of [-1, 1]) b.add(roundedBox(T + 0.02, H - 0.02, D - 0.05, 0.03, 2), enamel, { pos: [s * (W / 2 - T / 2 - 0.01), H / 2, -0.02] });
  b.add(roundedBox(W, 0.16, D - 0.04, 0.075, 4), enamel, { pos: [0, H - 0.08, -0.02] });
  b.add(roundedBox(W - 0.02, 0.12, D - 0.06, 0.02), enamel, { pos: [0, 0.06, -0.03] });
  // inner liner + shelves + food: own group, hidden while the door is shut (saves draw calls + shadow casters)
  const ib = new Builder();
  ib.add(new THREE.BoxGeometry(W - 2 * T - 0.02, H - 0.36, 0.01), glow, { pos: [0, H / 2 + 0.02, -D / 2 + T + 0.006] });
  for (const s of [-1, 1]) ib.add(new THREE.BoxGeometry(0.01, H - 0.36, D - T - 0.1), glow, { pos: [s * (W / 2 - T - 0.016), H / 2 + 0.02, 0.0] });
  const shelfYs = [0.42, 0.78, 1.14];
  for (const y of shelfYs) ib.add(roundedBox(W - 2 * T - 0.03, 0.015, D - T - 0.12, 0.005), chrome, { pos: [0, y, -0.01] });
  // freezer section: fixed upper door with its own horizontal handle
  ib.add(roundedBox(W - 2 * T - 0.02, 0.03, D - T - 0.08, 0.01), PAL.gloss, { pos: [0, 1.405, -0.02] }, 0xf8f6ef);
  b.add(roundedBox(W - 0.01, H - 1.43 - 0.03, 0.07, 0.05, 3), enamel, { pos: [0, (1.43 + H - 0.03) / 2, D / 2 + 0.015] });
  b.add(roundedBox(0.2, 0.025, 0.03, 0.012, 2), chrome, { pos: [-hingeSide * 0.12, 1.47, D / 2 + 0.07] });
  for (const sx of [-1, 1]) b.add(roundedBox(0.025, 0.03, 0.035, 0.008), chrome, { pos: [-hingeSide * 0.12 + sx * 0.09, 1.47, D / 2 + 0.06] });
  // little fridge food: milk bottle, jam jar, cheese wedge
  ib.add(lathe([[0, 0], [0.035, 0], [0.035, 0.13], [0.018, 0.19], [0.018, 0.22], [0, 0.22]], 14), PAL.gloss, { pos: [0.18, 1.15, -0.1] }, 0xffffff);
  ib.add(lathe([[0, 0], [0.03, 0], [0.032, 0.08], [0, 0.08]], 12), PAL.gloss, { pos: [0.08, 1.15, -0.15] }, 0xb0203a);
  ib.add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 3, 1, false, 0, 1.2), PAL.gloss, { pos: [-0.15, 0.81, -0.12] }, 0xffcf4a);
  // kick grille + chrome feet
  b.add(roundedBox(0.24, 0.08, 0.02, 0.008), chrome, { pos: [hingeSide * 0.13, 0.075, D / 2 - 0.02] });
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(0.2, 0.008, 0.01), PAL.gloss, { pos: [hingeSide * 0.13, 0.05 + i * 0.016, D / 2 - 0.008] }, 0x3a3530);
  for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.02, 0.025, 0.03, 10), chrome, { pos: [sx * (W / 2 - 0.08), 0.015, D / 2 - 0.08] });
  // bulb
  ib.add(new THREE.SphereGeometry(0.025, 10, 8), glow, { pos: [0, 1.33, -D / 2 + T + 0.04] });
  const shell = b.build('fridgeShell');
  body.add(shell);
  const inside = ib.build('fridgeInside', { cast: false });
  body.add(inside);


  // lasagna slot on the middle shelf
  const slot = new THREE.Object3D(); slot.name = 'fridgeLasagnaSlot'; slot.position.set(-0.04, 0.786, 0.0); body.add(slot);
  p.slot = slot;

  // door hinged at the side
  const hinge = new THREE.Group(); hinge.position.set(hingeSide * W / 2, 0, D / 2 - 0.02); body.add(hinge);
  const db = new Builder();
  const DW = W - 0.01, DH = 1.42 - 0.14 - 0.01;
  db.add(roundedBox(DW, DH, 0.07, 0.05, 3), enamel, { pos: [-hingeSide * DW / 2, 0.14 + DH / 2, 0.035] });
  const dib = new Builder();
  dib.add(roundedBox(DW - 0.08, DH - 0.08, 0.03, 0.015), PAL.gloss, { pos: [-hingeSide * DW / 2, 0.14 + DH / 2, -0.01] }, 0xf8f6ef);
  dib.add(roundedBox(DW - 0.04, DH - 0.04, 0.012, 0.01), PAL.gloss, { pos: [-hingeSide * DW / 2, 0.14 + DH / 2, -0.004] }, 0x8a8f86);
  // door shelves (bottles)
  for (const y of [0.55, 1.0]) {
    dib.add(roundedBox(DW - 0.14, 0.06, 0.07, 0.01), PAL.gloss, { pos: [-hingeSide * DW / 2, y, -0.06] }, 0xf8f6ef);
    for (let i = 0; i < 3; i++) dib.add(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 10), PAL.gloss, { pos: [-hingeSide * (0.18 + i * 0.13), y + 0.09, -0.06] }, [0xff9a3c, 0x4fa04a, 0xffe7b0][i]);
  }
  // big chrome lever handle + badge strip
  db.add(roundedBox(0.22, 0.026, 0.03, 0.012, 2), chrome, { pos: [-hingeSide * (DW - 0.2), 1.3, 0.1] });
  for (const sx of [-1, 1]) db.add(roundedBox(0.025, 0.03, 0.04, 0.008), chrome, { pos: [-hingeSide * (DW - 0.2) + sx * 0.1, 1.3, 0.085] });
  const door = db.build('fridgeDoor');
  hinge.add(door);
  const doorInside = dib.build('fridgeDoorInside', { cast: false });
  hinge.add(doorInside);
  const showInside = (on) => { inside.visible = on; doorInside.visible = on; };
  showInside(false);

  addBox(p, 'body', body, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  const doorC = addBox(p, 'door', hinge, [hingeSide > 0 ? -DW : 0, 0.12, -0.02], [hingeSide > 0 ? 0 : DW, 1.42, 0.09]);
  doorC.enabled = false; // only matters when swung open

  Object.assign(p.state, { open: false });
  Object.defineProperty(p, 'isOpen', { get: () => p.state.open });
  let lit = 0;
  Object.defineProperty(p, 'lightOn', { get: () => lit > 0.01 });
  const OPEN = 1.9;
  // no real light (a light toggle recompiles every shader); the liner glows instead
  const setLight = k => { lit = k; glow.emissiveIntensity = 0.6 * k; };
  setLight(0);

  p.open = async () => {
    if (p.state.open) return;
    p.state.open = true;
    showInside(true);
    p.sfx('fridge', { vol: 0.8 });
    setLight(1);
    await p.anim.tween(0.7, e => { hinge.rotation.y = hingeSide * OPEN * e; }, ease.outBack);
    doorC.enabled = true; syncColliders(p);
  };
  p.close = async () => {
    if (!p.state.open) return;
    p.state.open = false;
    doorC.enabled = false;
    await p.anim.tween(0.5, e => { hinge.rotation.y = hingeSide * OPEN * (1 - e); }, ease.inQuad);
    setLight(0);
    if (!p.state.open) showInside(false);
    p.sfx('door', { vol: 0.6, rate: 1.3 });
    syncColliders(p);
  };
  p.toggle = () => (p.state.open ? p.close() : p.open());
  p.reset = () => { p.anim.clear(); p.state.open = false; hinge.rotation.y = 0; setLight(0); showInside(false); doorC.enabled = false; syncColliders(p); };
  p.top = { y: H, w: W, d: D };
  p.slotPos = (out = new THREE.Vector3()) => { slot.updateWorldMatrix(true, false); return slot.getWorldPosition(out); };
  return p;
}
