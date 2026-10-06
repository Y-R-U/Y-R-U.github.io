// Food models (plate-local, plate well surface at y = PLATE_Y). The stars of the game.
import { THREE, Builder, roundedBox, lathe, xform, canvasTex, rng, gloss, mat } from './props/util.js';

export const PLATE_Y = 0.014;
const TAU = Math.PI * 2;

let M = null;
export function foodMats() {
  if (M) return M;
  const r = rng(11);
  const grill = canvasTex('steakTop', 256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.75);
    grd.addColorStop(0, '#8a4a26'); grd.addColorStop(1, '#5e2f17');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(40,16,6,0.25)' : 'rgba(170,96,50,0.22)';
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3, 0, TAU); g.fill();
    }
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.6);
    for (let k = -2; k <= 2; k++) {
      const grad = g.createLinearGradient(0, k * 52 - 9, 0, k * 52 + 9);
      grad.addColorStop(0, 'rgba(30,12,4,0)'); grad.addColorStop(0.5, 'rgba(30,12,4,0.95)'); grad.addColorStop(1, 'rgba(30,12,4,0)');
      g.fillStyle = grad; g.fillRect(-w, k * 52 - 9, w * 2, 18);
    }
    g.restore();
  }, { repeat: [7, 7] });
  const sideTex = canvasTex('steakSide', 128, 128, (g, w, h) => {
    g.fillStyle = '#7a4426'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(50,22,10,0.35)' : 'rgba(160,96,60,0.3)'; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.5, 0, TAU); g.fill(); }
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(40,16,6,0.5)'); grd.addColorStop(0.3, 'rgba(0,0,0,0)'); grd.addColorStop(0.7, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(40,16,6,0.5)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { repeat: [10, 10] });
  const loafTex = canvasTex('loaf', 256, 256, (g, w, h) => {
    g.fillStyle = '#7d5440'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(70,40,28,0.45)' : 'rgba(160,110,85,0.35)';
      g.beginPath(); g.arc(r() * w, r() * h, 0.8 + r() * 2.2, 0, TAU); g.fill();
    }
    // diced veg: little red / yellow / green squares
    const veg = ['#d8432c', '#f2c33a', '#6fae3c'];
    for (let i = 0; i < 70; i++) { g.fillStyle = veg[i % 3]; const s = 3 + r() * 3; g.fillRect(r() * w, r() * h, s, s); }
  }, { repeat: [2, 2] });
  const glazeTex = canvasTex('glaze', 128, 128, (g, w, h) => {
    g.fillStyle = '#962c16'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = r() < 0.6 ? 'rgba(130,20,10,0.25)' : 'rgba(240,80,50,0.25)'; g.beginPath(); g.arc(r() * w, r() * h, 4 + r() * 10, 0, TAU); g.fill(); }
  });
  const cheeseTex = canvasTex('cheeseTop', 256, 256, (g, w, h) => {
    g.fillStyle = '#f7c652'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 110; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(160,74,20,0.95)'); grd.addColorStop(0.45, 'rgba(212,130,48,0.75)'); grd.addColorStop(1, 'rgba(240,200,120,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,240,190,0.45)'; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 5, 0, TAU); g.fill(); }
    // clean molten strip along the bottom edge: the draped cheese sides sample it (uv v ≈ 0.02)
    const sg = g.createLinearGradient(0, h - 12, 0, h);
    sg.addColorStop(0, '#f7c652'); sg.addColorStop(0.4, '#f4bc48'); sg.addColorStop(1, '#f6c858');
    g.fillStyle = sg; g.fillRect(0, h - 12, w, 12);
  });
  const raguTex = canvasTex('ragu', 128, 128, (g, w, h) => {
    g.fillStyle = '#a02a16'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.6 ? 'rgba(92,34,16,0.6)' : 'rgba(200,76,40,0.5)';
      g.beginPath(); g.arc(r() * w, r() * h, 1.5 + r() * 3.5, 0, TAU); g.fill();
    }
  }, { repeat: [1, 1] });
  M = {
    steakTop: gloss(0xffffff, { map: grill, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
    steakSide: gloss(0xffffff, { map: sideTex, roughness: 0.5, clearcoat: 0.5 }),
    fat: gloss(0xf3dcb0, { roughness: 0.4, clearcoat: 0.5 }),
    mash: new THREE.MeshPhysicalMaterial({ color: 0xfbedc4, roughness: 0.62, sheen: 0.6, sheenColor: new THREE.Color(0xfff4d8), sheenRoughness: 0.6 }),
    butter: gloss(0xffe178, { roughness: 0.2, clearcoat: 1, transmission: 0 }),
    gravy: gloss(0x664020, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
    pea: gloss(0x6cbf2e, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    pasta: gloss(0xf6dc96, { roughness: 0.45, clearcoat: 0.4 }),
    layer: gloss(0xffffff, { vertexColors: true, roughness: 0.5, clearcoat: 0.35 }),
    sauce: gloss(0xb8321a, { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
    ricotta: mat(0xf4e3bf, { roughness: 0.75 }),
    ragu: gloss(0xffffff, { map: raguTex, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    cheese: gloss(0xffffff, { map: cheeseTex, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    melt: gloss(0xf2b844, { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }),
    basil: gloss(0x3f8f2a, { roughness: 0.4, clearcoat: 0.6, side: THREE.DoubleSide }),
    loaf: gloss(0xffffff, { map: loafTex, roughness: 0.62, clearcoat: 0.15 }),
    glaze: gloss(0xffffff, { map: glazeTex, roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.22 }),
    glazePool: gloss(0x8a2614, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
    parsley: mat(0x3d8a28),
  };
  return M;
}

// Lathe-ish blob: profile [[r,y]...], radial wobble by angle, optional vertex jitter.
function blob(profile, segs, rFn = () => 1, yFn = null) {
  const g = lathe(profile, segs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x);
    const k = rFn(th, y);
    p.setX(i, x * k); p.setZ(i, z * k);
    if (yFn) p.setY(i, yFn(x * k, y, z * k, th));
  }
  // close the lathe seam so normals don't crease
  g.deleteAttribute('normal');
  const merged = mergeSeam(g);
  merged.computeVertexNormals();
  return merged;
}
function mergeSeam(g) {
  const p = g.attributes.position, map = new Map(), idx = [], pos = [], uv = [];
  const uvA = g.attributes.uv;
  const remap = new Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
    if (!map.has(key)) { map.set(key, pos.length / 3); pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(uvA.getX(i), uvA.getY(i)); }
    remap[i] = map.get(key);
  }
  const src = g.index ? g.index.array : [...Array(p.count).keys()];
  for (let i = 0; i < src.length; i += 3) {
    const a = remap[src[i]], b = remap[src[i + 1]], c = remap[src[i + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

function noise3(x, y, z, s = 1) {
  return (Math.sin(x * 91 * s + y * 37) * Math.sin(z * 83 * s + x * 23) + Math.sin(y * 71 * s + z * 51) * 0.5) / 1.5;
}

function steakGeo(seg) {
  const sh = new THREE.Shape();
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const rx = 0.058 * (1 + 0.08 * Math.sin(a * 2 + 0.5) + 0.05 * Math.sin(a * 3 + 1.2));
    const rz = 0.047 * (1 + 0.1 * Math.cos(a * 2) + 0.06 * Math.sin(a * 5));
    const x = Math.cos(a) * rx + (Math.cos(a) > 0 ? 0.012 * Math.max(0, Math.sin(a)) : 0);
    const y = Math.sin(a) * rz;
    i === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.009, bevelSegments: seg, curveSegments: 4, steps: 1 });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // gentle dome + slight warp so it sits like a real cut
    p.setY(i, y + 0.006 * Math.max(0, 1 - (x * x / 0.006 + z * z / 0.0028)) * (y > 0.008 ? 1 : 0.3) + 0.001 * Math.sin(x * 60));
  }
  g.computeVertexNormals();
  smoothByPosition(g);
  return g;
}

// average normals of coincident vertices (fixes faceted extrude walls)
function smoothByPosition(g) {
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), keys = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    keys.push(k);
    const a = acc.get(k) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    acc.set(k, a);
  }
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1;
    // keep hard edges where normals disagree a lot (cap vs wall)
    const d = (n.getX(i) * a[0] + n.getY(i) * a[1] + n.getZ(i) * a[2]) / l;
    if (d > 0.7) n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  n.needsUpdate = true;
}

function peaPile(count, R, h, seed, m, quality = 'high') {
  const geo = quality === 'high' ? new THREE.SphereGeometry(0.0092, 10, 8) : new THREE.SphereGeometry(0.0092, 8, 6);
  const inst = new THREE.InstancedMesh(geo, m.pea, count);
  inst.castShadow = true; inst.receiveShadow = true;
  const r = rng(seed), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const placed = [];
  for (let i = 0; i < count; i++) {
    let x, z, y, tries = 0;
    do {
      const a = r() * TAU, d = Math.sqrt(r()) * R;
      x = Math.cos(a) * d; z = Math.sin(a) * d * 0.8;
      const dd = (x * x + z * z) / (R * R);
      y = 0.0086 + h * Math.max(0, 1 - dd) * r();
      tries++;
    } while (tries < 20 && placed.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2 < 0.0165 * 0.0165));
    placed.push([x, y, z]);
  }
  placed.sort((a, b) => b[1] - a[1]); // top peas first → eaten first
  placed.forEach(([x, y, z], i) => {
    const s = 0.88 + r() * 0.25;
    mtx.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(s, s * 0.92, s));
    inst.setMatrixAt(i, mtx);
    inst.setColorAt(i, c.setHSL(0.27 + r() * 0.04, 0.6 + r() * 0.15, 0.4 + r() * 0.1));
  });
  inst.userData.full = count;
  return inst;
}

function steamPoints(n = 22, spread = 0.07, seed = 3) {
  const tex = canvasTex('puff', 64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.06, map: tex, transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true,
  }));
  pts.frustumCulled = false; pts.renderOrder = 5;
  const r = rng(seed);
  const seeds = Array.from({ length: n }, () => [r() * TAU, (r() - 0.5) * spread, (r() - 0.5) * spread * 0.8, 0.6 + r() * 0.8]);
  let t = 0;
  pts.userData.strength = 1;
  pts.userData.tick = dt => {
    t += dt;
    const S = pts.userData.strength;
    for (let i = 0; i < n; i++) {
      const [ph, x0, z0, sp] = seeds[i];
      const k = ((t * 0.28 * sp + ph / TAU) % 1);
      const sway = Math.sin(t * 1.4 + ph) * 0.012 * (1 + k * 2);
      pos[i * 3] = x0 * (1 - k * 0.4) + sway;
      pos[i * 3 + 1] = 0.04 + k * 0.2;
      pos[i * 3 + 2] = z0 * (1 - k * 0.4) + Math.cos(t * 1.1 + ph) * 0.008 * k;
      const a = Math.sin(k * Math.PI) * 0.22 * S;
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = a;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  };
  return pts;
}

// Each item: {obj, order} — eaten in order, each shrinks with a little bite-pop.
function foodGroup(name) {
  const g = new THREE.Group(); g.name = 'food_' + name;
  g.userData.items = [];
  return g;
}
function item(g, obj, weight = 1) { g.add(obj); g.userData.items.push({ obj, weight, base: obj.scale.clone() }); return obj; }

export function buildSteakDinner(quality = 'high') {
  const m = foodMats(), seg = quality === 'low' ? 2 : 4, ls = quality === 'low' ? 20 : 36;
  const g = foodGroup('steak');
  // steak
  const steak = new THREE.Mesh(steakGeo(seg), [m.steakTop, m.steakSide]);
  steak.castShadow = steak.receiveShadow = true;
  const steakG = new THREE.Group(); steakG.add(steak);
  // a strip of fat along one edge
  const fat = new THREE.Mesh(xform(new THREE.CapsuleGeometry(0.0075, 0.06, 4, 10), { rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.8] }), m.fat);
  fat.position.set(0.006, 0.012, -0.05); fat.rotation.y = 0.18; fat.castShadow = true;
  steakG.add(fat);
  const juice = blob([[0, 0.0012], [0.05, 0.0014], [0.075, 0.0008], [0.077, 0]].reverse(), 28, th => 1 + 0.15 * Math.sin(th * 3 + 2) + 0.07 * Math.sin(th * 7));
  juice.scale(1.05, 1, 0.8);
  const juiceM = new THREE.Mesh(juice, m.gravy); juiceM.position.set(0.012, -0.0072, 0.004); juiceM.receiveShadow = true;
  steakG.add(juiceM);
  steakG.position.set(0.03, PLATE_Y + 0.0075, 0.03); steakG.rotation.y = 0.35;
  item(g, steakG, 3);

  // mashed potato: a broad, fluffy scoop with forked peaks and a shallow well of gravy on top
  const MP = [[0, 0], [0.057, 0], [0.061, 0.005], [0.058, 0.016], [0.051, 0.028], [0.041, 0.037], [0.029, 0.0435], [0.016, 0.0475], [0.007, 0.0482], [0, 0.0472]];
  const mashH = (d) => {
    for (let i = MP.length - 1; i > 0; i--) {
      const [r0, y0] = MP[i], [r1, y1] = MP[i - 1];
      if (d >= r0 && d <= r1) return y0 + (y1 - y0) * (d - r0) / Math.max(1e-6, r1 - r0);
    }
    return d > MP[1][0] ? 0 : MP[MP.length - 1][1];
  };
  const fluff = (x, z, th, y) => {
    if (y < 0.006) return 0;
    const up = Math.min(1, (y - 0.006) / 0.025);
    const peaks = Math.max(0, Math.sin(th * 5 + y * 150) * Math.sin(th * 3 - y * 260 + 1.3)) ** 2 * 0.006;
    return up * (peaks * up + 0.0012 * Math.sin(th * 4 + y * 380) + 0.0012 * noise3(x, y, z, 1.4));
  };
  const mash = blob(MP, Math.round(ls * 1.6),
    (th, y) => 1 + 0.045 * Math.sin(th * 3 + y * 90) + 0.012 * Math.sin(th * 5 - y * 140),
    (x, y, z, th) => y + fluff(x, z, th, y));
  const mashMesh = new THREE.Mesh(mash, m.mash); mashMesh.castShadow = mashMesh.receiveShadow = true;
  const mashG = new THREE.Group(); mashG.add(mashMesh);
  // gravy: pools in the top well, spills down two sides in lobes, and puddles on the plate
  const gravyTop = blob([[0, 0], [0.01, 0], [0.02, 0], [0.03, 0], [0.037, 0], [0.0375, 0]].reverse(), ls,
    th => 0.8 + 0.7 * Math.max(0, Math.sin(th * 2 + 0.7)) ** 3 + 0.25 * Math.max(0, Math.sin(th * 3 - 1.1)) ** 4 + 0.05 * Math.sin(th * 7),
    (x, y, z) => {
      const d = Math.hypot(x, z);
      return Math.max(mashH(d) + 0.0045, 0.0035);
    });
  const gravyPool = blob([[0, 0.002], [0.035, 0.0025], [0.06, 0.0028], [0.07, 0.0016], [0.071, 0.0001]].reverse(), ls,
    th => 1 + 0.16 * Math.sin(th * 3 + 2) + 0.08 * Math.sin(th * 6));
  const gb = new Builder();
  gb.add(gravyTop, m.gravy).add(gravyPool, m.gravy, { pos: [0.01, 0, 0.005] });
  const butter = roundedBox(0.017, 0.009, 0.015, 0.003, 2);
  xform(butter, { pos: [0.003, mashH(0.004) + 0.008, 0.002], rot: [0.12, 0.6, 0.1] });
  gb.add(butter, m.butter);
  // parsley flecks
  const pr = rng(4);
  for (let i = 0; i < (quality === 'high' ? 9 : 0); i++) {
    const a = pr() * TAU, d = 0.008 + pr() * 0.03;
    gb.add(new THREE.BoxGeometry(0.003, 0.0008, 0.0025), m.parsley, { pos: [Math.cos(a) * d, mashH(d) + 0.0055, Math.sin(a) * d], rot: [pr(), pr() * 3, pr()] });
  }
  mashG.add(gb.build('gravy'));
  mashG.position.set(-0.052, PLATE_Y, -0.038); mashG.scale.setScalar(0.88);
  item(g, mashG, 2);

  // peas
  const peas = peaPile(quality === 'low' ? 26 : quality === 'medium' ? 36 : 44, 0.052, 0.018, 9, m, quality);
  const peaG = new THREE.Group(); peaG.add(peas); peaG.position.set(-0.05, PLATE_Y, 0.05);
  peaG.userData.peas = peas;
  item(g, peaG, 1);
  return finish(g, quality);
}

function lasagnaBlock(w, d, h, quality, seed = 1, { sideSauce = true } = {}, b = new Builder()) {
  const m = foodMats(), r = rng(seed);
  const layers = [['pasta', 0.0045], ['ragu', 0.011], ['ricotta', 0.0025], ['pasta', 0.0045], ['ragu', 0.011], ['ricotta', 0.0025], ['pasta', 0.0045]];
  const sum = layers.reduce((a, l) => a + l[1], 0);
  const scale = (h - 0.01) / sum;
  let y = 0;
  const seg = quality === 'high' ? 2 : 1;
  for (const [k, t0] of layers) {
    const t = t0 * scale;
    const bulge = k === 'ragu' ? -0.002 : k === 'ricotta' ? -0.001 : 0.005;
    const geo = roundedBox(w + bulge, t * 1.15, d + bulge, Math.min(t * 0.5, 0.003), seg);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2));
      p.setY(i, p.getY(i) + 0.0022 * Math.sin(x * 55 + y * 300 + seed) * Math.cos(z * 47 + seed * 0.7));
      if (k === 'pasta') p.setY(i, p.getY(i) + 0.0018 * Math.sin(x * 140 + seed) * Math.sin(z * 120) * edge);
      if (k === 'ragu') { const lump = 1 + 0.06 * Math.abs(Math.sin(z * 160 + seed) * Math.sin(x * 150)); p.setX(i, x * lump); p.setZ(i, z * (1 + 0.06 * Math.abs(Math.sin(x * 170 + seed) * Math.cos(z * 140)))); }
    }
    geo.computeVertexNormals();
    if (k === 'ragu') { const uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * 9, (p.getY(i) + y) * 9 + p.getZ(i) * 4); }
    if (k === 'ragu') b.add(geo, m.ragu, { pos: [(r() - 0.5) * 0.002, y + t / 2, (r() - 0.5) * 0.002] });
    else b.add(geo, m.layer, { pos: [(r() - 0.5) * 0.002, y + t / 2, (r() - 0.5) * 0.002] }, k === 'pasta' ? 0xf6c45a : 0xfaf1dc);
    y += t;
  }
  // bubbly cheese top with drapes over the edges
  const cs = quality === 'high' ? 16 : quality === 'medium' ? 9 : 6;
  const cheese = new THREE.BoxGeometry(w + 0.004, 0.005, d + 0.004, sideSauce ? cs * 2 : cs, 2, sideSauce ? cs * 2 : cs);
  const tongues = sideSauce ? Array.from({ length: 8 }, () => [r() * 2 * (w + d), 0.005 + r() * 0.006, 0.012 + r() * (r() < 0.4 ? 0.026 : 0.012)]) : [];
  const perim = (x, z) => (Math.abs(z) >= d / 2 ? (z > 0 ? x + w / 2 : w + d + w / 2 - x) : (x > 0 ? w + z + d / 2 : 2 * w + d + d / 2 - z));
  const drape = (x, z) => {
    let k = 0; const u = perim(x, z);
    for (const [c, wd, L] of tongues) { const du = Math.min(Math.abs(u - c), 2 * (w + d) - Math.abs(u - c)); const q = (du * du) / (wd * wd); k = Math.max(k, L * Math.sqrt(Math.max(0, 1 - q))); }
    return k;
  };
  const p = cheese.attributes.position;
  const bumps = Array.from({ length: 14 }, () => [(r() - 0.5) * w, (r() - 0.5) * d, 0.004 + r() * 0.006, 0.006 + r() * 0.01]);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), yy = p.getY(i), z = p.getZ(i);
    if (sideSauce && Math.abs(yy) < 1e-6 && Math.max(Math.abs(x) / ((w + 0.004) / 2), Math.abs(z) / ((d + 0.004) / 2)) > 0.99) yy -= drape(x, z) * 0.5;
    if (yy > 0) {
      let hgt = 0;
      for (const [bx, bz, bh, br] of bumps) hgt += bh * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (br * br));
      yy += Math.min(hgt, 0.008) * 0.45;
    } else {
      const ex = Math.abs(x) / ((w + 0.006) / 2), ez = Math.abs(z) / ((d + 0.006) / 2);
      if (Math.max(ex, ez) > 0.98) yy -= 0.002 + 0.006 * Math.max(0, Math.sin(x * 70 + z * 55 + seed)) ** 2 + (sideSauce ? drape(x, z) : 0);
    }
    const out = 1 + 0.015 * Math.sin(x * 90 + z * 70);
    p.setXYZ(i, x * out, yy, z * out);
  }
  if (sideSauce) {
    const nrm = cheese.attributes.normal, uv = cheese.attributes.uv;
    for (let i = 0; i < p.count; i++) if (Math.abs(nrm.getY(i)) < 0.5) uv.setXY(i, ((p.getX(i) + p.getZ(i)) * 6) % 1, 0.012 + 0.012 * (p.getY(i) > 0 ? 1 : 0));
  }
  cheese.computeVertexNormals();
  b.add(cheese, m.cheese, { pos: [0, y + 0.0015, 0] });
  return b;
}

export function buildLasagnaPlate(quality = 'high') {
  const m = foodMats(), g = foodGroup('lasagna');
  const b = lasagnaBlock(0.1, 0.072, 0.052, quality, 5);
  // basil leaves
  const leaf = () => { const s = new THREE.SphereGeometry(0.012, 10, 6); s.scale(1, 0.16, 0.55); return s; };
  b.add(leaf(), m.basil, { pos: [0.012, 0.0585, 0.004], rot: [0.1, 0.7, 0.15] });
  b.add(leaf(), m.basil, { pos: [-0.002, 0.0595, -0.004], rot: [-0.1, -0.5, -0.1] });
  const slice = b.build('slice'); slice.position.set(0.005, PLATE_Y + 0.001, 0); slice.rotation.y = -0.25;
  item(g, slice, 4);
  // sauce pool
  const pool = blob([[0, 0.0015], [0.05, 0.002], [0.074, 0.0012], [0.075, 0]].reverse(), 32, th => 1 + 0.12 * Math.sin(th * 4) + 0.06 * Math.sin(th * 7 + 1));
  pool.scale(1, 1, 0.8);
  const poolM = new THREE.Mesh(pool, m.sauce); poolM.position.y = PLATE_Y; poolM.receiveShadow = true;
  item(g, poolM, 1);
  return finish(g, quality);
}

export function buildMeatloafPlate(quality = 'high') {
  const m = foodMats(), g = foodGroup('meatloaf'), seg = quality === 'low' ? 2 : 3;
  const L = 0.13, H = 0.065, T = 0.075;
  // loaf body: domed top, slightly tapered sides; textured cut face toward +X
  const loafGeo = (len, seed) => {
    const geo = roundedBox(len, H, T, Math.min(0.026, len * 0.45), seg + 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const top = (y + H / 2) / H;
      p.setY(i, y + top * 0.022 * Math.cos(z / T * Math.PI) * (1 - 0.3 * (x / len * 2) ** 4));
      p.setZ(i, z * (1 - 0.08 * top));
      p.setX(i, x + 0.0012 * Math.sin(z * 150 + y * 90 + seed));
    }
    geo.computeVertexNormals();
    return geo;
  };
  // glaze = the loaf's own surface pushed out a hair; below a wavy drip line it tucks back inside
  const glazeGeo = (len, seed) => {
    const gl = loafGeo(len, seed);
    const p = gl.attributes.position, n = gl.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const line = H * 0.12 - 0.04 * Math.max(0, Math.sin(x * 75 + seed * 2.3)) ** 2;
      const k = y > line && Math.abs(n.getX(i)) < 0.75 ? 0.0032 : -0.004;
      p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
    }
    gl.computeVertexNormals();
    return gl;
  };
  const r = rng(5);
  const loaf = new Builder();
  loaf.add(loafGeo(L, 1), m.loaf, { pos: [0, H / 2, 0] });
  loaf.add(glazeGeo(L, 1), m.glaze, { pos: [0, H / 2, 0] });
  const lo = loaf.build('loaf'); lo.position.set(-0.03, PLATE_Y, -0.01); lo.rotation.y = 0.35;
  item(g, lo, 4);
  // one thick slice tipped over in front, cut face up, glazed edge showing
  const sl = new Builder();
  sl.add(loafGeo(0.022, 3), m.loaf, { pos: [0, H / 2, 0] });
  sl.add(glazeGeo(0.022, 3), m.glaze, { pos: [0, H / 2, 0] });
  const so = sl.build('slice');
  so.rotation.set(0, 0.35, -Math.PI / 2 + 0.12, 'YXZ');
  so.position.set(0.07, PLATE_Y + 0.011, 0.045);
  item(g, so, 2);
  const pool = blob([[0, 0.0012], [0.04, 0.0016], [0.058, 0.0008], [0.059, 0]].reverse(), 28, th => 1 + 0.18 * Math.sin(th * 3 + 1));
  pool.scale(1.3, 1, 0.8);
  const pm = new THREE.Mesh(pool, m.glazePool); pm.position.set(0.02, PLATE_Y, 0.02); pm.receiveShadow = true;
  item(g, pm, 1);
  const pb = new Builder();
  for (let i = 0; i < 6; i++) {
    const s = new THREE.SphereGeometry(0.008, 8, 6); s.scale(1, 0.4, 0.8);
    pb.add(s, m.parsley, { pos: [-0.075 + (r() - 0.5) * 0.02, PLATE_Y + 0.004 + r() * 0.004, 0.07 + (r() - 0.5) * 0.02], rot: [r(), r() * 3, r()] });
  }
  item(g, pb.build('parsley'), 0.3);
  return finish(g, quality);
}

function finish(g, quality) {
  if (quality !== 'low') {
    const steam = steamPoints(quality === 'medium' ? 14 : 22, 0.08, g.name.length);
    g.add(steam); g.userData.steam = steam;
  }
  // food is small: receive shadows, don't cast them (perf)
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return g;
}

export function tickFood(g, dt) { g?.userData.steam?.userData.tick(dt); }

// t: 0 = untouched, 1 = gone. Items vanish in order; peas disappear one by one.
export function setFoodEaten(g, t) {
  if (!g) return;
  const items = g.userData.items;
  const total = items.reduce((a, i) => a + i.weight, 0);
  let acc = 0;
  const order = [...items].sort((a, b) => a.weight - b.weight === 0 ? 0 : 0);
  for (const it of order) {
    const a0 = acc / total, a1 = (acc + it.weight) / total; acc += it.weight;
    const k = Math.max(0, Math.min(1, (t - a0) / (a1 - a0)));
    const peas = it.obj.userData.peas;
    if (peas) {
      peas.count = Math.round(peas.userData.full * (1 - k));
      it.obj.visible = peas.count > 0;
      continue;
    }
    // stepped bites with a slight squash, so it reads as chomps not a smooth shrink
    const bites = 4, kb = Math.ceil(k * bites - 1e-6) / bites;
    const s = 1 - kb * 0.85;
    it.obj.scale.set(it.base.x * s, it.base.y * (s * 0.8 + 0.2 * (1 - kb)), it.base.z * s);
    it.obj.visible = k < 0.999;
  }
  if (g.userData.steam) { g.userData.steam.userData.strength = 1 - t; g.userData.steam.visible = t < 0.95; }
}

// The lasagna pan: 3x2 portions so one can be served and the rest eaten portion-by-portion.
// Pan: 6 portions. 5 merged (eaten portion-by-portion via drawRange), 1 separate (the one Jon serves).
export function buildLasagnaPanFilling(W, D, H, quality = 'high') {
  const g = foodGroup('panFilling');
  const cols = 3, rows = 2, pw = W / cols, pd = D / rows;
  const rest = new Builder(), marks = [];
  let served = null;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const last = i === cols - 1 && j === rows - 1;
    const b = last ? new Builder() : rest;
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(-W / 2 + pw * (i + 0.5), 0, -D / 2 + pd * (j + 0.5)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i + j) % 2 ? Math.PI : 0, 0)), new THREE.Vector3(1, 1, 1));
    if (last) {
      lasagnaBlock(pw - 0.002, pd - 0.002, H, quality, 30 + i * 7 + j, { sideSauce: false }, b);
      served = b.build('servedPortion');
      served.applyMatrix4(mtx);
    } else {
      rest.matrix = mtx;
      lasagnaBlock(pw - 0.002, pd - 0.002, H, quality, 30 + i * 7 + j, { sideSauce: false }, rest);
      marks.push(rest.marks());
    }
  }
  rest.matrix = null;
  const restG = rest.build('portions');
  g.add(restG, served);
  const bed = new THREE.Mesh(roundedBox(W, H * 0.22, D, 0.004, 1), foodMats().sauce);
  bed.position.y = H * 0.11; g.add(bed);
  // show the first n merged portions
  g.userData.setPortions = n => {
    for (const mesh of restG.children) {
      const cnt = n <= 0 ? 0 : marks[Math.min(n, marks.length) - 1].get(mesh.userData.mat) ?? 0;
      mesh.geometry.setDrawRange(0, cnt);
      mesh.visible = cnt > 0;
    }
  };
  g.userData.portionCount = marks.length;
  g.userData.served = served;
  g.userData.bed = bed;
  return finish(g, quality);
}
