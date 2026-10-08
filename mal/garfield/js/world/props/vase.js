import { THREE, makeProp, Builder, lathe, gloss, mat, ease, Particles, rng, worldPos, canvasTex, palette } from './util.js';

const PROFILE = [[0, 0], [0.045, 0], [0.055, 0.01], [0.075, 0.06], [0.08, 0.1], [0.07, 0.15], [0.042, 0.2], [0.034, 0.23], [0.04, 0.255], [0.05, 0.27]];
const VH = 0.27;

export function createVase(ctx) {
  const p = makeProp('vase', ctx);
  const tex = canvasTex('vaseGlaze', 256, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f2a184'); grd.addColorStop(0.6, '#f7b496'); grd.addColorStop(1, '#d98466');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff1dc'; g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const x = i * w / 8 + 16;
      g.beginPath(); g.moveTo(x, h * 0.35); g.bezierCurveTo(x + 14, h * 0.45, x - 14, h * 0.55, x, h * 0.65); g.stroke();
      g.fillStyle = '#fff1dc'; g.beginPath(); g.arc(x, h * 0.33, 4, 0, Math.PI * 2); g.fill();
    }
  });
  const glaze = gloss(0xffffff, { map: tex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  const FL = palette().gloss;
  const petal = gloss(0xf58fae, { roughness: 0.5, clearcoat: 0.3 });

  const body = new THREE.Group(); p.root.add(body);
  const b = new Builder();
  b.add(lathe(PROFILE, 32), glaze);
  const r = rng(3);
  // flowers: stems + daisy-ish heads
  const heads = [[0.05, 0.47, 0.02, 0xffc8d8], [-0.04, 0.44, -0.03, 0xf58fae], [0.0, 0.52, -0.01, 0xffd27a], [-0.02, 0.42, 0.045, 0xf58fae]];
  for (const [x, y, z, pm] of heads) {
    const len = y - 0.18;
    const s = new THREE.CylinderGeometry(0.004, 0.005, len, 5);
    const dir = new THREE.Vector3(x, len, z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    s.applyQuaternion(q); s.translate(x / 2, 0.18 + len / 2, z / 2);
    b.add(s, FL, null, 0x4f8f37);
    for (let i = 0; i < 7; i++) {
      const pg = new THREE.SphereGeometry(0.018, 8, 5); pg.scale(1, 0.25, 0.45); pg.translate(0.02, 0, 0);
      pg.rotateY(i / 7 * Math.PI * 2);
      pg.rotateX(-0.35 + r() * 0.2);
      b.add(pg, FL, { pos: [x, y, z] }, pm);
    }
    b.add(new THREE.SphereGeometry(0.011, 8, 6), FL, { pos: [x, y + 0.004, z] }, 0x8a4a1a);
    const leaf = new THREE.SphereGeometry(0.02, 8, 5); leaf.scale(1, 0.15, 0.4);
    b.add(leaf, FL, { pos: [x * 0.5, 0.3, z * 0.5], rot: [0.4, r() * 3, 0.5] }, 0x4f8f37);
  }
  const whole = b.build('vase');
  body.add(whole);

  // shards: curved glazed bits, instanced; stay on the floor as a slip area
  const shardGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.006, 3, 1, false);
  shardGeo.scale(1, 1, 0.8);
  const shards = new Particles(ctx.scene, { count: 40, geo: shardGeo, material: glaze, floorY: (ctx.floorY ?? 0) + 0.003, bounce: 0.2, drag: 1.2 });
  const flowers = new Particles(ctx.scene, { count: 12, geo: (() => { const g = new THREE.SphereGeometry(0.03, 8, 5); g.scale(1, 0.3, 1); return g; })(), material: petal, floorY: (ctx.floorY ?? 0) + 0.01, bounce: 0.2 });
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  puddle.rotation.x = -Math.PI / 2; puddle.visible = false; puddle.renderOrder = 1;
  {
    const pos = puddle.geometry.attributes.position;
    for (let i = 1; i < pos.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)); const k = 0.75 + 0.2 * Math.sin(a * 3) + 0.1 * Math.sin(a * 7); pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k); }
  }
  ctx.scene.add(puddle);
  p.onUpdate(dt => { shards.update(dt); flowers.update(dt); });

  Object.assign(p.state, { knocked: false, broken: false });
  p.fragments = null; // {pos, radius} once broken
  const home = { pos: null, rotY: 0 };
  p.place = a => { home.pos = a.pos.clone(); home.rotY = a.rotY || 0; p.root.position.copy(home.pos); p.root.rotation.y = home.rotY; };

  // dir: world direction the paw pushes (default: into the room, +Z of anchor is off the sill edge)
  // target (optional world point, e.g. Odie's head): the vase lands/shatters there instead of 0.35 m past the edge
  p.knock = async ({ dir = null, floorY = ctx.floorY ?? 0, sillDepth = 0.26, target = null } = {}) => {
    if (p.state.knocked) return;
    const userDir = dir;
    p.state.knocked = true;
    p.sfx('click', { vol: 0.6, rate: 0.7 });
    const qy = p.root.getWorldQuaternion(new THREE.Quaternion());
    dir = (dir ? dir.clone() : new THREE.Vector3(0, 0, 1).applyQuaternion(qy)).setY(0).normalize();
    const start = worldPos(p.root, new THREE.Vector3());
    if (target && !userDir) dir = target.clone().sub(start).setY(0).normalize();
    ctx.scene.attach(p.root);
    const axis = new THREE.Vector3(dir.z, 0, -dir.x); // tip forward around this axis
    // wobble, then tip toward the edge, slide off, fall tumbling
    await p.anim.tween(0.45, (e, r) => {
      const ang = Math.sin(r * Math.PI * 3) * 0.18 * (1 - r) + r * r * 0.25;
      p.root.quaternion.setFromAxisAngle(axis, ang);
    }, ease.linear);
    const edge = start.clone().addScaledVector(dir, sillDepth);
    await p.anim.tween(0.25, e => {
      p.root.position.lerpVectors(start, edge, e);
      p.root.quaternion.setFromAxisAngle(axis, 0.25 + e * 0.6);
    }, ease.inQuad);
    const land = target ? target.clone() : edge.clone().addScaledVector(dir, 0.35);
    if (!target) land.y = floorY;
    const fallT = Math.sqrt(2 * Math.max(0.05, edge.y - land.y) / 9.8);
    p.sfx('swipe', { vol: 0.3, rate: 0.6 });
    await p.anim.tween(fallT, (e, r) => {
      p.root.position.x = edge.x + (land.x - edge.x) * r;
      p.root.position.z = edge.z + (land.z - edge.z) * r;
      p.root.position.y = edge.y - (edge.y - land.y) * r * r;
      p.root.quaternion.setFromAxisAngle(axis, 0.85 + r * 1.6);
    }, ease.linear);
    // shatter
    p.state.broken = true;
    p.root.visible = false;
    p.sfx('shatter', { vol: 1 });
    const v = new THREE.Vector3();
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8;
      shards.spawn({ pos: land.clone().add(v.set(0, 0.08, 0)), vel: v.set(Math.cos(a) * sp, 0.6 + Math.random() * 1.6, Math.sin(a) * sp).clone(), life: 1e9, size: 0.7 + Math.random() * 0.8, flat: true });
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      flowers.spawn({ pos: land.clone().add(v.set(0, 0.2, 0)), vel: v.set(Math.cos(a) * 0.8, 1.2, Math.sin(a) * 0.8).clone(), life: 1e9, size: 0.8 + Math.random() * 0.4, flat: true, scale: new THREE.Vector3(1, 1, 1) });
      flowers.p[flowers.p.length - 1].color = null;
    }
    puddle.position.set(land.x, floorY + 0.002, land.z);
    land.y = floorY; puddle.visible = true;
    p.fragments = { pos: land.clone(), radius: 0.55 };
    await p.anim.tween(0.4, e => puddle.scale.setScalar(0.3 + 0.7 * e), ease.outQuad);
  };

  p.reset = () => {
    p.anim.clear(); shards.clear(); flowers.clear();
    puddle.visible = false;
    if (home.pos) { p.root.position.copy(home.pos); p.root.quaternion.identity(); p.root.rotation.y = home.rotY; }
    p.root.visible = true;
    Object.assign(p.state, { knocked: false, broken: false });
    p.fragments = null;
  };
  p.height = VH;
  return p;
}
