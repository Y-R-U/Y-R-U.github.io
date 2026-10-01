// M2 mob models: wireframe archer, swarm-leg spider, bioreactor bull, void linker, gel-core.
import { geo, mesh, pivot, glowMaterial, glowSprite, registerModel, three } from './models.js';

// Twelve edge struts of a box: a "wireframe" cube.
function edges(w, h, d, cx, cy, cz, t, c) {
  const out = [];
  for (const y of [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) out.push({ s: [w + t, t, t], p: [cx, cy + y, cz + z], c });
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) out.push({ s: [t, h, t], p: [cx + x, cy, cz + z], c });
  for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) out.push({ s: [t, t, d], p: [cx + x, cy + y, cz], c });
  return out;
}

function beamMesh(color) {
  const T = three();
  const g = new T.BoxGeometry(1, 1, 1);
  g.translate(0, 0, 0.5);
  const m = new T.Mesh(g, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: T.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false }));
  m.visible = false;
  m.frustumCulled = false;
  return m;
}

// ---- Wireframe archer: a pale hologram skeleton of struts, magenta joint nodes, a strut bow ----
registerModel('archer', (mat) => {
  const T = three();
  const root = new T.Group();
  const C = '#d6f4ff', J = glowMaterial('#ff4fd8');
  const hips = pivot(root, [0, 0.92, 0]);
  const torso = pivot(hips, [0, 0, 0]);
  mesh(geo('ar.torso', [
    { s: [0.06, 0.7, 0.06], p: [0, 0.35, -0.04], c: C },
    ...[0.18, 0.32, 0.46].map((y, i) => ({ s: [0.42 - i * 0.04 + 0.08, 0.05, 0.26], p: [0, y, 0], c: C })),
    { s: [0.6, 0.06, 0.08], p: [0, 0.62, 0], c: C },
    { s: [0.36, 0.06, 0.08], p: [0, 0.0, 0], c: C },
  ]), mat, torso);
  mesh(geo('ar.joints', [
    { s: [0.1, 0.1, 0.1], p: [0.3, 0.62, 0], c: '#fff', shade: false },
    { s: [0.1, 0.1, 0.1], p: [-0.3, 0.62, 0], c: '#fff', shade: false },
    { s: [0.12, 0.12, 0.12], p: [0, 0.32, 0.08], c: '#fff', shade: false },
  ]), J, torso);
  const head = pivot(torso, [0, 0.72, 0]);
  mesh(geo('ar.head', edges(0.34, 0.34, 0.34, 0, 0.18, 0, 0.04, C)), mat, head);
  mesh(geo('ar.eyes', [{ s: [0.08, 0.05, 0.02], p: [0.08, 0.2, 0.17], c: '#fff', shade: false }, { s: [0.08, 0.05, 0.02], p: [-0.08, 0.2, 0.17], c: '#fff', shade: false }]), J, head);
  const arms = [];
  for (const x of [0.3, -0.3]) {
    const arm = pivot(torso, [x, 0.62, 0]);
    mesh(geo('ar.arm', [{ s: [0.05, 0.36, 0.05], p: [0, -0.18, 0], c: C }, { s: [0.045, 0.34, 0.045], p: [0, -0.52, 0], c: C },
      { s: [0.08, 0.08, 0.08], p: [0, -0.36, 0], c: '#ff9be9', shade: false }]), mat, arm);
    arms.push(arm);
  }
  // Bow in the left hand: an arc of struts with a glowing string.
  const bow = pivot(arms[0], [0, -0.66, 0.06]);
  const arc = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.0;
    arc.push({ s: [0.04, 0.16, 0.05], p: [0, Math.sin(a) * 0.42, Math.cos(a) * 0.18 - 0.12], r: [-a, 0, 0], c: '#9fe8ff' });
  }
  mesh(geo('ar.bow', arc), mat, bow);
  mesh(geo('ar.string', [{ s: [0.015, 0.8, 0.015], p: [0, 0, -0.14], c: '#fff', shade: false }]), J, bow);
  const legs = [];
  for (const x of [0.12, -0.12]) {
    const leg = pivot(root, [x, 0.92, 0]);
    mesh(geo('ar.leg', [{ s: [0.055, 0.46, 0.055], p: [0, -0.23, 0], c: C }, { s: [0.05, 0.44, 0.05], p: [0, -0.68, 0], c: C },
      { s: [0.14, 0.04, 0.22], p: [0, -0.9, 0.04], c: C }]), mat, leg);
    legs.push(leg);
  }
  const charge = glowSprite('#ff4fd8', 0.01);
  charge.position.set(0, -0.66, 0.1);
  arms[0].add(charge);
  const beam = beamMesh(0xff4fd8);
  return { root, hips, torso, head, arms, bow, legs, charge, beam, world: [beam] };
});

// ---- Swarm-leg spider: low chrome body, red eye cluster, eight jointed legs ----
registerModel('spider', (mat) => {
  const T = three();
  const root = new T.Group();
  const body = pivot(root, [0, 0.5, 0]);
  mesh(geo('sp.body', [
    { s: [0.8, 0.5, 0.75], p: [0, 0.05, -0.32], c: '#2a2c3a' },
    { s: [0.6, 0.12, 0.55], p: [0, 0.32, -0.32], c: '#3c4057' },
    { s: [0.1, 0.06, 0.6], p: [0, 0.39, -0.32], c: '#46f0d4', shade: false },
    { s: [0.52, 0.38, 0.48], p: [0, 0, 0.26], c: '#353849' },
    { s: [0.12, 0.08, 0.16], p: [0.1, -0.12, 0.54], c: '#14151d' },
    { s: [0.12, 0.08, 0.16], p: [-0.1, -0.12, 0.54], c: '#14151d' },
  ]), mat, body);
  const eyes = mesh(geo('sp.eyes', [
    { s: [0.08, 0.08, 0.03], p: [0.09, 0.08, 0.51], c: '#fff', shade: false },
    { s: [0.08, 0.08, 0.03], p: [-0.09, 0.08, 0.51], c: '#fff', shade: false },
    { s: [0.05, 0.05, 0.03], p: [0.19, 0.12, 0.49], c: '#fff', shade: false },
    { s: [0.05, 0.05, 0.03], p: [-0.19, 0.12, 0.49], c: '#fff', shade: false },
    { s: [0.05, 0.05, 0.03], p: [0.04, 0.16, 0.51], c: '#fff', shade: false },
    { s: [0.05, 0.05, 0.03], p: [-0.04, 0.16, 0.51], c: '#fff', shade: false },
  ]), new T.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false, fog: false }), body);
  const glow = glowSprite('#ff2a3a', 0.4);
  glow.position.set(0, 0.1, 0.56);
  body.add(glow);
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1, k = i % 4;
    const leg = pivot(body, [side * 0.26, 0.02, 0.32 - k * 0.22]);
    leg.rotation.y = side * (0.5 - k * 0.33) + (side < 0 ? Math.PI : 0);
    mesh(geo('sp.leg', [
      { s: [0.5, 0.06, 0.06], p: [0.25, 0.14, 0], r: [0, 0, 0.55], c: '#4a4e66' },
      { s: [0.6, 0.05, 0.05], p: [0.62, -0.12, 0], r: [0, 0, -1.0], c: '#6a6f8a' },
      { s: [0.07, 0.07, 0.07], p: [0.47, 0.28, 0], c: '#46f0d4', shade: false },
    ]), mat, leg);
    legs.push(leg);
  }
  return { root, body, eyes, glow, legs };
});

// ---- Bioreactor bull: cream hide, bronze horns, a glowing green reactor tank on its back ----
registerModel('bull', (mat) => {
  const T = three();
  const root = new T.Group();
  const body = pivot(root, [0, 0.62, 0]);
  mesh(geo('bu.body', [
    { s: [0.86, 0.72, 1.36], p: [0, 0.36, 0], c: '#e9e3d6' },
    { s: [0.88, 0.4, 0.5], p: [0, 0.4, -0.3], c: '#8a6d4f' },
    { s: [0.5, 0.06, 0.9], p: [0, 0.75, 0], c: '#5b6b7c' },
    { s: [0.12, 0.3, 0.12], p: [0, 0.3, -0.72], c: '#8a6d4f' },
  ]), mat, body);
  mesh(geo('bu.tank', [
    { s: [0.36, 0.26, 0.7], p: [0, 0.92, -0.05], c: '#fff', shade: false },
  ]), glowMaterial('#6dff8a'), body);
  mesh(geo('bu.tankcaps', [
    { s: [0.42, 0.32, 0.07], p: [0, 0.92, 0.32], c: '#3b414c' },
    { s: [0.42, 0.32, 0.07], p: [0, 0.92, -0.42], c: '#3b414c' },
  ]), mat, body);
  const head = pivot(body, [0, 0.5, 0.68]);
  mesh(geo('bu.head', [
    { s: [0.52, 0.5, 0.5], p: [0, 0, 0.2], c: '#e9e3d6' },
    { s: [0.42, 0.22, 0.12], p: [0, -0.12, 0.48], c: '#d9a59a' },
    { s: [0.16, 0.06, 0.06], p: [0.34, 0.2, 0.14], c: '#c7a35a' },
    { s: [0.06, 0.18, 0.06], p: [0.41, 0.3, 0.14], c: '#c7a35a' },
    { s: [0.16, 0.06, 0.06], p: [-0.34, 0.2, 0.14], c: '#c7a35a' },
    { s: [0.06, 0.18, 0.06], p: [-0.41, 0.3, 0.14], c: '#c7a35a' },
  ]), mat, head);
  mesh(geo('bu.eyes', [{ s: [0.54, 0.06, 0.04], p: [0, 0.08, 0.44], c: '#fff', shade: false }]), glowMaterial('#6dff8a'), head);
  const legs = [];
  for (const [x, z] of [[0.28, 0.48], [-0.28, 0.48], [0.28, -0.48], [-0.28, -0.48]]) {
    const leg = pivot(root, [x, 0.62, z]);
    mesh(geo('bu.leg', [{ s: [0.22, 0.62, 0.22], p: [0, -0.31, 0], c: '#d8d2c4' }, { s: [0.24, 0.1, 0.24], p: [0, -0.57, 0], c: '#3b414c' }]), mat, leg);
    legs.push(leg);
  }
  return { root, body, head, legs };
});

// ---- Void linker: very tall, near-black, violet eyes; shimmers like bad signal before it acts ----
registerModel('voidlinker', (mat) => {
  const T = three();
  const root = new T.Group();
  const hips = pivot(root, [0, 1.5, 0]);
  const torso = pivot(hips, [0, 0, 0]);
  mesh(geo('vl.torso', [
    { s: [0.44, 0.75, 0.24], p: [0, 0.38, 0], c: '#17121f' },
    { s: [0.46, 0.05, 0.26], p: [0, 0.55, 0], c: '#3a2a5a' },
  ]), mat, torso);
  const head = pivot(torso, [0, 0.76, 0]);
  mesh(geo('vl.head', [{ s: [0.42, 0.42, 0.42], p: [0, 0.21, 0], c: '#120e18' }]), mat, head);
  const eyeMat = new T.MeshBasicMaterial({ color: 0xc770ff, toneMapped: false, fog: false });
  const eyes = mesh(geo('vl.eyes', [
    { s: [0.12, 0.05, 0.02], p: [0.1, 0.22, 0.215], c: '#fff', shade: false },
    { s: [0.12, 0.05, 0.02], p: [-0.1, 0.22, 0.215], c: '#fff', shade: false },
  ]), eyeMat, head);
  const arms = [];
  for (const x of [0.28, -0.28]) {
    const arm = pivot(torso, [x, 0.7, 0]);
    mesh(geo('vl.arm', [{ s: [0.1, 1.35, 0.1], p: [0, -0.66, 0], c: '#1d1727' }]), mat, arm);
    arms.push(arm);
  }
  const legs = [];
  for (const x of [0.11, -0.11]) {
    const leg = pivot(root, [x, 1.5, 0]);
    mesh(geo('vl.leg', [{ s: [0.11, 1.5, 0.11], p: [0, -0.75, 0], c: '#1d1727' }]), mat, leg);
    legs.push(leg);
  }
  const aura = glowSprite('#9b5cff', 0.01);
  aura.position.y = 1.5;
  root.add(aura);
  return { root, hips, torso, head, eyes, eyeMat, arms, legs, aura };
});

// ---- Gel-core: a translucent jelly cube around a glowing nucleus. body is scaled by size ----
let shellMat = null;
registerModel('gelcore', (mat) => {
  const T = three();
  shellMat ||= new T.MeshBasicMaterial({ color: 0x5dffa8, transparent: true, opacity: 0.42, depthWrite: false });
  const root = new T.Group();
  const body = pivot(root, [0, 0, 0]);
  mesh(geo('gc.core', [
    { s: [0.36, 0.3, 0.36], p: [0, 0.4, 0], c: '#1f7a4c' },
    { s: [0.08, 0.08, 0.04], p: [0.08, 0.42, 0.19], c: '#06140c' },
    { s: [0.08, 0.08, 0.04], p: [-0.08, 0.42, 0.19], c: '#06140c' },
  ]), mat, body);
  const nucleus = mesh(geo('gc.nuc', [{ s: [0.24, 0.24, 0.24], p: [0, 0, 0], c: '#fff', shade: false }]), glowMaterial('#b6ffd9'), body, [0, 0.66, 0]);
  const shell = mesh(geo('gc.shell', [{ s: [1, 1, 1], p: [0, 0.5, 0], c: '#ffffff' }]), shellMat, body);
  shell.renderOrder = 1;
  return { root, body, nucleus, shell };
});
