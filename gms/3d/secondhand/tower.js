import * as THREE from 'three';
import { mergeGeometries } from '../../lib/three/0.160.0/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

export function buildTower(scene) {
  const root = new THREE.Group(); scene.add(root);
  const staticParts = new THREE.Group(); root.add(staticParts);
  const dynamic = new THREE.Group(); root.add(dynamic);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a3a3a3'; ctx.fillRect(0, 0, 256, 256);
  let seed = 23;
  for (let i = 0; i < 3000; i++) {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    const a = (seed >>> 0) / 4294967296;
    ctx.fillStyle = `rgba(${a > .5 ? '255,255,255' : '0,0,0'},${.02 + a * .07})`;
    ctx.fillRect(0, i % 256, 256, 1);
  }
  const brushed = new THREE.CanvasTexture(canvas); brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  const mat = {
    silver: new THREE.MeshStandardMaterial({ color: 0xbac9c4, metalness: .92, roughness: .25, bumpMap: brushed, bumpScale: .012 }),
    bright: new THREE.MeshStandardMaterial({ color: 0xd4ddd6, metalness: .97, roughness: .16 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x203830, metalness: .85, roughness: .3 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xe8ebe0, roughness: .28, metalness: .08, clearcoat: .6, clearcoatRoughness: .2 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb69b61, metalness: .85, roughness: .29 }),
    green: new THREE.MeshPhysicalMaterial({ color: 0x076a4f, metalness: .32, roughness: .2, clearcoat: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x96d7bc, transmission: .98, thickness: .08, roughness: .055, ior: 1.48, metalness: 0, envMapIntensity: 1.3, attenuationColor: new THREE.Color(0x0a6744), attenuationDistance: 3.5, side: THREE.DoubleSide }),
    light: new THREE.MeshStandardMaterial({ color: 0x9ee5c4, emissive: 0x2cba82, emissiveIntensity: .3, roughness: .25, metalness: .35 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc46045, emissive: 0x6e180b, emissiveIntensity: .4, roughness: .3, metalness: .5 }),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylinderCache = new Map();
  function mesh(geo, material, x = 0, y = 0, z = 0, parent = staticParts) {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w, h, d, material, x, y, z, parent) { const m = mesh(boxGeo, material, x, y, z, parent); m.scale.set(w, h, d); return m; }
  function cyl(radius, height, material, x = 0, y = 0, z = 0, parent = staticParts, segments = 64) {
    const key = `${radius}/${height}/${segments}`;
    if (!cylinderCache.has(key)) cylinderCache.set(key, new THREE.CylinderGeometry(radius, radius, height, segments));
    return mesh(cylinderCache.get(key), material, x, y, z, parent);
  }
  function ring(radius, tube, material, x = 0, y = 0, z = 0, parent = staticParts, flat = true) {
    const m = mesh(new THREE.TorusGeometry(radius, tube, 8, 80), material, x, y, z, parent);
    if (flat) m.rotation.x = Math.PI / 2;
    return m;
  }
  function rod(a, b, r, material, parent = staticParts) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const m = cyl(r, av.distanceTo(bv), material, 0, 0, 0, parent, 12);
    m.position.copy(av).add(bv).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize());
    return m;
  }
  function bolts(radius, y, count, parent = staticParts) {
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
      cyl(.04, .035, mat.bright, x, y, z, parent, 6);
      const slot = box(.043, .008, .007, mat.dark, x, y + .02, z, parent); slot.rotation.y = a;
    }
  }
  function gear(radius, teeth, material, x, y, z, parent = dynamic) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
    const shape = new THREE.Shape();
    for (let i = 0; i <= teeth * 4; i++) {
      const a = i / (teeth * 4) * TAU;
      const r = radius * (i % 4 === 1 || i % 4 === 2 ? 1 : .87);
      if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, radius * .67, 0, TAU, true); shape.holes.push(hole);
    mesh(new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .013, bevelThickness: .014 }), material, 0, 0, 0, group);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const spoke = box(radius * .71, radius * .065, .07, material, Math.cos(a) * radius * .32, Math.sin(a) * radius * .32, .045, group); spoke.rotation.z = a;
    }
    const hub = cyl(radius * .17, .13, mat.dark, 0, 0, .05, group, 24); hub.rotation.x = Math.PI / 2;
    const cap = cyl(radius * .09, .16, mat.brass, 0, 0, .065, group, 16); cap.rotation.x = Math.PI / 2;
    return group;
  }
  function decal(text, width, height, x, y, z, parent = staticParts, color = '#aabcb0') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.fillStyle = color;
    g.font = '500 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 64);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    return mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }), x, y, z, parent);
  }
  function arch(radius, y, material) {
    const points = [];
    for (let i = 0; i <= 60; i++) { const a = Math.PI + i / 60 * Math.PI; points.push(new THREE.Vector3(Math.cos(a) * radius, y + Math.sin(a) * -radius, -.72)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 60, .055, 8, false), material);
  }

  // Turned plinth, knurled edge, and three concentric mechanical decks.
  cyl(1.63, .16, mat.dark, 0, .17); cyl(1.58, .12, mat.silver, 0, .29);
  cyl(1.48, .14, mat.ceramic, 0, .42); cyl(1.42, .055, mat.brass, 0, .52);
  cyl(1.38, .07, mat.dark, 0, .58); bolts(1.29, .63, 20);
  ring(1.57, .023, mat.bright, 0, .24); ring(1.48, .023, mat.bright, 0, .47);
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * TAU;
    const m = box(.018, .08, .032, mat.bright, Math.sin(a) * 1.587, .31, Math.cos(a) * 1.587); m.rotation.y = a;
  }
  for (const [level, r] of [[2.48, 1.36], [4.45, 1.25], [6.03, 1.12]]) {
    cyl(r, .09, mat.silver, 0, level); cyl(r - .045, .09, mat.ceramic, 0, level + .085);
    ring(r, .026, mat.bright, 0, level - .02); ring(r - .045, .012, mat.brass, 0, level + .14);
    bolts(r - .12, level + .145, 16);
  }
  // Fluted ceramic columns and exposed steel tie rods leave the front open.
  for (const side of [-1, 1]) for (const back of [-1, 1]) {
    const x = side * 1.02, z = back * .63;
    cyl(.091, 5.43, mat.silver, x, 3.3, z, staticParts, 20);
    for (const [y, h] of [[1.55, 1.62], [3.48, 1.68], [5.26, 1.37]]) {
      cyl(.125, h, mat.ceramic, x, y, z, staticParts, 24);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; cyl(.012, h - .12, mat.silver, x + Math.sin(a) * .122, y, z + Math.cos(a) * .122, staticParts, 6); }
      for (const yy of [y - h / 2, y + h / 2]) { cyl(.158, .055, mat.dark, x, yy, z, staticParts, 24); ring(.147, .013, mat.brass, x, yy, z); }
    }
  }
  for (let i = 0; i < 15; i++) {
    const a = Math.PI * .56 + i / 14 * Math.PI * .88;
    const x = Math.sin(a) * 1.02, z = Math.cos(a) * 1.02;
    const m = box(.07, 1.54, .11, i % 3 ? mat.green : mat.brass, x, 1.57, z); m.rotation.y = a;
  }
  arch(1.01, 5.25, mat.bright);
  const rearGlass = mesh(new THREE.CylinderGeometry(.99, .99, 1.68, 48, 1, true, Math.PI / 2, Math.PI), mat.glass, 0, 3.43, 0, dynamic);
  rearGlass.castShadow = false;
  for (const a of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    rod([Math.sin(a), 2.58, Math.cos(a)], [Math.sin(a), 4.28, Math.cos(a)], .025, mat.bright);
  }

  const gears = [gear(.73, 32, mat.brass, -.12, 1.54, .43), gear(.4, 22, mat.silver, .78, 1.9, .36), gear(.34, 18, mat.bright, -.86, 1.05, .52), gear(.27, 16, mat.silver, .55, .98, .56)];
  const mainWheel = new THREE.Group(); mainWheel.position.set(-.12, 1.54, .63); dynamic.add(mainWheel);
  ring(.73, .025, mat.bright, 0, 0, .015, mainWheel, false);
  ring(.56, .018, mat.dark, 0, 0, .025, mainWheel, false);
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU;
    const tick = box(i % 5 ? .009 : .018, i % 5 ? .035 : .065, .011, mat.ceramic, Math.sin(a) * .66, Math.cos(a) * .66, .045, mainWheel); tick.rotation.z = -a;
  }
  const key = new THREE.Group(); key.position.set(-.12, 1.54, .82); dynamic.add(key);
  rod([-.3, 0, 0], [.3, 0, 0], .045, mat.bright, key);
  for (const x of [-.29, .29]) ring(.11, .032, mat.brass, x, 0, 0, key, false);
  const spindle = cyl(.07, .38, mat.bright, 0, 0, -.08, key); spindle.rotation.x = Math.PI / 2;
  decal('M E R I D I A N', 1.3, .23, 0, .77, .99);

  // Two sliding counterweights and a central pendulum sit behind the fracture pane.
  for (const x of [-.58, .58]) {
    rod([x, 2.7, .12], [x, 4.2, .12], .022, mat.bright);
    gear(.17, 14, mat.brass, x, 4.16, .1, staticParts);
  }
  const weight = new THREE.Group(); dynamic.add(weight);
  cyl(.24, .48, mat.brass, .58, 0, .13, weight);
  for (const y of [-.24, -.19, .19, .24]) ring(.24, .018, mat.bright, .58, y, .13, weight);
  const weightLine = rod([.58, 2.7, .14], [.58, 4.2, .14], .012, mat.dark, dynamic);
  const pendulum = new THREE.Group(); pendulum.position.set(-.3, 4.17, .25); dynamic.add(pendulum);
  rod([0, 0, 0], [0, -1.13, 0], .018, mat.brass, pendulum);
  const bob = cyl(.22, .085, mat.bright, 0, -1.15, 0, pendulum); bob.rotation.x = Math.PI / 2;
  ring(.16, .012, mat.brass, 0, -1.15, .05, pendulum, false);
  for (const x of [-.965, .965]) rod([x, 2.62, .85], [x, 4.26, .85], .022, mat.brass);
  for (const y of [2.62, 4.26]) rod([-.965, y, .85], [.965, y, .85], .024, mat.bright);
  const sealPlate = box(.36, .14, .04, mat.dark, 0, 2.69, .891, dynamic);
  decal('II', .15, .12, 0, 2.69, .916, sealPlate.parent);

  const vault = new THREE.Group(); vault.position.set(0, 5.23, .1); dynamic.add(vault);
  const backPlate = cyl(.77, .15, mat.dark, 0, 0, -.27, vault); backPlate.rotation.x = Math.PI / 2;
  ring(.84, .055, mat.silver, 0, 0, .05, vault, false); ring(.91, .022, mat.brass, 0, 0, .035, vault, false);
  ring(.71, .027, mat.bright, 0, 0, .16, vault, false);
  const iris = [], boltsMoving = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    const pivot = new THREE.Group(); vault.add(pivot); pivot.rotation.z = a;
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(.03, -.04); bladeShape.lineTo(.25, -.34); bladeShape.lineTo(.73, -.28); bladeShape.lineTo(.76, .16); bladeShape.lineTo(.42, .29); bladeShape.closePath();
    const blade = mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: .055, bevelEnabled: true, bevelSegments: 2, bevelSize: .025, bevelThickness: .018, steps: 1 }), i % 2 ? mat.ceramic : mat.silver, 0, 0, .2 + i * .012, pivot);
    iris.push({ pivot, blade, angle: a });
    const bolt = cyl(.035, .08, mat.brass, Math.cos(a) * .84, Math.sin(a) * .84, .12, vault, 12); bolt.rotation.x = Math.PI / 2;
    const slide = box(.18, .08, .1, mat.bright, Math.cos(a) * .92, Math.sin(a) * .92, .11, vault); slide.rotation.z = a; boltsMoving.push({ mesh: slide, angle: a });
  }
  const gemRoot = new THREE.Group(); gemRoot.position.set(0, 5.23, .34); dynamic.add(gemRoot);
  const gemMat = new THREE.MeshPhysicalMaterial({ color: 0x63f2b5, metalness: .12, roughness: .035, transmission: .86, thickness: 1.4, ior: 2.05, envMapIntensity: 2.1, emissive: 0x075d37, emissiveIntensity: .15 });
  const gem = mesh(new THREE.OctahedronGeometry(.37), gemMat, 0, 0, 0, gemRoot); gem.scale.y = 1.38;
  const gemEdge = new THREE.LineSegments(new THREE.EdgesGeometry(gem.geometry), new THREE.LineBasicMaterial({ color: 0xb7f9d7, transparent: true, opacity: .5 })); gem.add(gemEdge);
  const gemHalo = ring(.47, .012, mat.brass, 0, 0, -.08, gemRoot, false); gemHalo.rotation.y = .35;
  const gemLight = new THREE.PointLight(0x78ffc3, 1.7, 3.5); gemLight.position.set(0, 5.23, .6); root.add(gemLight);

  // A visible balance assembly crowns the instrument, with curved braces and a dial.
  const crown = new THREE.Group(); crown.position.y = 6.1; dynamic.add(crown);
  cyl(.86, .09, mat.green, 0, .05, 0, crown);
  ring(.88, .025, mat.bright, 0, .08, 0, crown);
  ring(.66, .04, mat.brass, 0, .17, 0, crown);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    const pts = [new THREE.Vector3(Math.sin(a) * .94, .03, Math.cos(a) * .94), new THREE.Vector3(Math.sin(a) * .73, .35, Math.cos(a) * .73), new THREE.Vector3(Math.sin(a) * .25, .48, Math.cos(a) * .25)];
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, .015, 6, false), i % 2 ? mat.silver : mat.brass, 0, 0, 0, crown);
  }
  cyl(.27, .12, mat.dark, 0, .45, 0, crown); cyl(.2, .1, mat.bright, 0, .55, 0, crown);
  ring(.12, .016, mat.brass, 0, .62, 0, crown);
  const balance = new THREE.Group(); balance.position.set(0, 6.3, 0); dynamic.add(balance);
  ring(.48, .02, mat.bright, 0, 0, 0, balance);
  rod([-.47, 0, 0], [.47, 0, 0], .013, mat.brass, balance);
  rod([0, 0, -.47], [0, 0, .47], .013, mat.brass, balance);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; cyl(.035, .055, mat.brass, Math.sin(a) * .45, .015, Math.cos(a) * .45, balance, 12); }
  for (const x of [-1.13, 1.13]) {
    rod([x, .76, -.12], [x, 5.85, -.12], .025, mat.brass);
    for (const y of [1.1, 2.2, 3.1, 4.1, 5, 5.6]) cyl(.048, .095, mat.dark, x, y, -.12, staticParts, 12);
  }
  const powerLines = [];
  for (const side of [-1, 1]) powerLines.push(rod([side * 1.145, .72, .67], [side * 1.145, 5.8, .67], .009, mat.light));
  for (let i = 0; i < 3; i++) {
    const badge = cyl(.07, .04, i ? mat.red : mat.light, -1.03, [1.6, 3.4, 5.25][i], .8, dynamic, 20); badge.rotation.x = Math.PI / 2;
  }

  function bakeGroup(group) {
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert();
    const batches = new Map();
    group.traverse(o => {
      if (!o.isMesh) return;
      const key = o.material.uuid;
      if (!batches.has(key)) batches.set(key, { material: o.material, geometries: [] });
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      batches.get(key).geometries.push(g);
    });
    group.clear();
    for (const { material, geometries } of batches.values()) {
      mesh(mergeGeometries(geometries), material, 0, 0, 0, group);
      geometries.forEach(g => g.dispose());
    }
  }
  for (const group of [...gears, mainWheel, key, pendulum, weight, crown, balance]) bakeGroup(group);
  // Bake fixed details by material to keep the draw-call budget stable on phones.
  staticParts.updateMatrixWorld(true);
  const batches = new Map();
  staticParts.traverse(o => {
    if (!o.isMesh) return;
    const key = o.material.uuid;
    if (!batches.has(key)) batches.set(key, { material: o.material, geometries: [] });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    batches.get(key).geometries.push(g);
  });
  root.remove(staticParts);
  for (const { material, geometries } of batches.values()) {
    const merged = mergeGeometries(geometries);
    if (merged) mesh(merged, material, 0, 0, 0, root);
    geometries.forEach(g => g.dispose());
  }
  const pickTargets = [
    { id: 'wind', point: new THREE.Vector3(-.12, 1.54, .9), radius: .82 },
    { id: 'release', point: new THREE.Vector3(.58, 3.55, .9), radius: .65 },
    { id: 'take', point: new THREE.Vector3(0, 5.23, .65), radius: .82 },
  ];
  return {
    root, dynamic, mat, pickTargets,
    animate(state, wallTime, intro) {
      const t = state.time;
      const power = state.power ? 1 : 0;
      const activeTime = state.windAt === null ? 0 : clamp(t - state.windAt, 0, 5);
      gears.forEach((g, i) => { g.rotation.z = activeTime * (i % 2 ? -1 : 1) * [1.3, 2.36, 2.75, 3.5][i]; });
      key.rotation.z = activeTime * 2.6;
      key.material = mat.bright;
      pendulum.rotation.z = Math.sin(activeTime * 3.4) * .23;
      balance.rotation.y = Math.sin(activeTime * 7) * 1.9;
      const drop = state.dropAt === null ? -1 : t - state.dropAt;
      weight.position.y = 3.91 - 1.14 * smooth(0, .8, drop);
      weightLine.scale.y = 1 - .65 * smooth(0, .8, drop);
      const opening = smooth(.85, 2.65, drop);
      iris.forEach(({ pivot, blade, angle }, i) => {
        pivot.rotation.z = angle + opening * .27;
        blade.position.x = opening * .61;
        blade.position.z = .2 + i * .012 + opening * .06;
        blade.rotation.y = -opening * .83;
      });
      boltsMoving.forEach(({ mesh: m, angle }) => { const r = .92 + opening * .13; m.position.set(Math.cos(angle) * r, Math.sin(angle) * r, .11); });
      const lift = state.takeAt === null ? 0 : smooth(0, 2, t - state.takeAt);
      gemRoot.position.set(0, 5.23 + lift * .5, -.02 + opening * .16 + lift * 1.5);
      gem.rotation.y = .3 + (state.windAt === null ? wallTime * .13 : t * .32);
      gem.rotation.z = Math.sin(t * .6) * .09;
      gemRoot.scale.setScalar(1 + lift * .6);
      gemLight.intensity = .5 + opening * 2 + lift;
      mat.light.emissiveIntensity = power ? 2.5 : .25;
      mat.light.color.setHex(state.echo && power ? 0x78d6ff : 0x9ee5c4);
      mat.light.emissive.setHex(state.echo && power ? 0x398bbc : 0x2cba82);
      root.position.y = -.2 * (1 - intro);
      root.rotation.y = (1 - intro) * -.17;
      sealPlate.visible = drop < .8;
    },
  };
}
