// Small fallback hand-props for Jon (used when no prop object is passed to holdProp).
import * as THREE from '../../vendor/three/three.module.js';

let paperTex = null;
function newsTexture() {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f1ece0'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2b2b2b'; g.font = 'bold 18px Georgia, serif'; g.textAlign = 'center';
  g.fillText('DAILY NEWS', 64, 22);
  g.fillRect(8, 28, 112, 2);
  g.fillStyle = '#9a9a9a';
  for (let col = 0; col < 3; col++) for (let r = 0; r < 12; r++) {
    if (col === 0 && r > 2 && r < 7) continue;
    g.fillRect(8 + col * 38, 36 + r * 7, 32 - (r % 4 === 3 ? 10 : 0), 3);
  }
  g.fillStyle = '#b8b0a0'; g.fillRect(10, 58, 30, 26);
  paperTex = new THREE.CanvasTexture(c); paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

const std = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

export const PROP_BUILDERS = {
  // folded paper, long axis along +Z (forward out of the fist)
  newspaper() {
    const geo = new THREE.BoxGeometry(0.12, 0.012, 0.3, 1, 1, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setY(i, p.getY(i) + 0.03 * Math.sin((z + 0.15) / 0.3 * Math.PI) * (p.getX(i) / 0.06)); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, std(0xffffff, 0.85, 0, { map: newsTexture() }));
    m.position.z = 0.1; m.castShadow = true;
    const g = new THREE.Group(); g.add(m); return g;
  },
  rolled() {
    const geo = new THREE.CylinderGeometry(0.03, 0.032, 0.42, 12, 1);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, std(0xffffff, 0.85, 0, { map: newsTexture() }));
    m.position.z = 0.13; m.castShadow = true;
    const g = new THREE.Group(); g.add(m); return g;
  },
  fork() {
    const g = new THREE.Group(), mat = std(0xd9dde2, 0.25, 0.9); g.scale.setScalar(1.5);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.13), mat); h.position.z = 0.03; g.add(h);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.04), mat); t.position.set(-0.007 + i * 0.007, 0.004, 0.115); g.add(t); }
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.02), mat); n.position.set(0, 0.002, 0.095); g.add(n);
    return g;
  },
  spoon() {
    const g = new THREE.Group(), mat = std(0xd9dde2, 0.25, 0.9); g.scale.setScalar(1.5);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.16), mat); h.position.z = 0.04; g.add(h);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
    b.scale.set(1, 0.4, 1.3); b.position.set(0, 0.008, 0.14); g.add(b);
    return g;
  },
  plate() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.02, 24), std(0xfaf7f0, 0.35));
    p.position.set(0, 0.01, 0); g.add(p);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.007, 6, 24), std(0x5b86c4, 0.4));
    rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.021, 0); g.add(rim);
    return g;
  },
  pan() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.22), std(0xb8bcc2, 0.35, 0.7));
    p.position.set(0, 0.03, 0); g.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2), std(0xd2683a, 0.6));
    l.position.set(0, 0.06, 0); g.add(l);
    return g;
  },
  bowl() {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = i / 8; pts.push(new THREE.Vector2(0.06 + 0.04 * Math.sin(a * Math.PI / 2), a * 0.05)); }
    pts.push(new THREE.Vector2(0.095, 0.05), new THREE.Vector2(0.09, 0.012), new THREE.Vector2(0, 0.012));
    const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), std(0x2f6fb8, 0.3, 0, { side: THREE.DoubleSide }));   // matches the world cat bowl
    g.add(b);
    const food = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 16), std(0x9a6232, 0.9));
    food.position.y = 0.04; g.add(food);
    
    return g;
  },
  mug() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 16), std(0xd8563a, 0.4));
    m.position.y = 0.045; g.add(m);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 6, 12), std(0xd8563a, 0.4));
    h.position.set(0.045, 0.05, 0); g.add(h);
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.036, 14), std(0x4a2a14, 0.2));
    c.rotation.x = -Math.PI / 2; c.position.y = 0.08; g.add(c);
    return g;
  },
  suitcase() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.56), std(0x7a3b22, 0.55));
    b.position.y = -0.27; g.add(b);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.43, 0.04), std(0x3a2416, 0.6));
    strap.position.set(0, -0.27, 0.12); g.add(strap);
    const s2 = strap.clone(); s2.position.z = -0.12; g.add(s2);
    const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI), std(0x2a1a10, 0.5));
    hnd.rotation.y = Math.PI / 2; hnd.position.y = -0.06; g.add(hnd);
    return g;
  },
  box() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.42), std(0xc49a62, 0.85));
    b.position.y = 0.0; g.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.06, 0.08), std(0xe0d4b8, 0.7));
    t.position.y = 0.18; g.add(t);
    return g;
  },
};

// grip transforms relative to the hand grip socket
export const GRIPS = {
  newspaper: { pos: [0, 0, 0], rot: [0, 0, 0] },
  rolled: { pos: [0, 0, -0.02], rot: [0, 0, 0] },
  fork: { pos: [0, 0, -0.02], rot: [0, 0, 0] },
  spoon: { pos: [0, 0, -0.03], rot: [0, 0, 0] },
  // dishes: +Y of the dish along the hand's +Z (up when the forearm points forward), centred towards the midline
  plate: { pos: [0.06, -0.1, 0.0], rot: [Math.PI / 2, 0, 0] },
  pan: { pos: [0.1, -0.1, -0.01], rot: [Math.PI / 2, 0, 0] },
  bowl: { pos: [0.05, -0.08, -0.01], rot: [Math.PI / 2, 0, 0] },
  mug: { pos: [0.03, 0.0, 0.02], rot: [Math.PI / 2, 0, 0] },
  suitcase: { pos: [0, 0.03, 0], rot: [0, 0, 0] },
  // two-handed carries sit on the carry socket (in front of the belly)
  box: { pos: [0, 0, 0], rot: [0, 0, 0] },
  tv: { pos: [0, -0.2, -0.02], rot: [0, 0, 0] },
};

// Prefer the props lane's newspaper meshes when available (they lie along local X; ours extend along +Z).
let external = null;
export async function loadExternalProps() {
  if (external) return external;
  external = {};
  try {
    const m = await import('../world/props/newspaper.js');
    const wrap = (inner, z) => { const g = new THREE.Group(); inner.rotation.y = -Math.PI / 2; inner.position.z = z; g.add(inner); g.userData.inner = inner; return g; };
    external.newspaper = () => wrap(m.createNewspaper({ folded: true }), 0.12);
    external.rolled = () => wrap(m.createNewspaper(), 0.12);
  } catch (e) { /* fall back to our own */ }
  return external;
}

export function makeProp(name) {
  if (external?.[name]) {
    const o = external[name](); o.name = 'jonprop_' + name; o.userData.jonFallback = false;
    o.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return o;
  }
  const b = PROP_BUILDERS[name];
  if (!b) return null;
  const o = b(); o.name = 'jonprop_' + name; o.userData.jonFallback = true;
  o.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return o;
}

export function disposeProp(o) {
  o?.traverse(m => { if (m.isMesh && o.userData.jonFallback) { m.geometry.dispose(); m.material.dispose(); } });
}

// little "poof" sparkle used when the newspaper is conjured
export function makePoof() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 1, depthWrite: false });
  const geo = new THREE.OctahedronGeometry(0.018, 0);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(geo, mat);
    const a = i / 9 * Math.PI * 2;
    m.userData.v = new THREE.Vector3(Math.cos(a), 0.6 * Math.sin(a * 2.3), Math.sin(a)).multiplyScalar(0.5 + 0.4 * ((i * 7) % 3) / 2);
    g.add(m);
  }
  g.userData.t = 0;
  g.userData.update = (dt) => {
    const t = (g.userData.t += dt);
    g.children.forEach(m => { m.position.copy(m.userData.v).multiplyScalar(0.35 * (1 - Math.exp(-t * 6))); m.rotation.y += dt * 8; m.scale.setScalar(Math.max(0.01, 1 - t * 2)); });
    mat.opacity = Math.max(0, 1 - t * 2.2);
    return t < 0.5;
  };
  g.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return g;
}
