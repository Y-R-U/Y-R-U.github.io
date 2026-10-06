import * as THREE from '../../vendor/three/three.module.js';
import { initMaterials, material } from './materials.js';
import { buildHouse, STAIRS, W, D, UF, CEIL1 } from './house.js';
import { buildExterior } from './exterior.js';
import { createLighting } from './lighting.js';
import { createNav } from './nav.js';
import { makeHalos } from './glow.js';

const GROUND_CULL = new Set(['table', 'bench', 'chair', 'catBowl', 'curtains', 'window', 'fridge', 'vine', 'frontDoor', 'tv']);

async function loadProps() {
  try { return await import('./props/index.js'); } catch (e) { console.warn('[world] props unavailable, using placeholders', e); return null; }
}

const PLACEHOLDERS = {
  table: [1.5, 0.76, 0.9], bench: [1.3, 0.45, 0.35], chair: [0.45, 0.9, 0.45], fridge: [0.75, 1.85, 0.7],
  tv: [0.5, 0.45, 0.45], jonBed: [1.5, 0.55, 2.05], garfieldBed: [0.6, 0.2, 0.6], catBowl: [0.2, 0.06, 0.2],
  vase: [0.14, 0.3, 0.14], plate: [0.26, 0.03, 0.26],
};
const PH_ANCHOR = { table: 'underTable', bench: 'kitchenBench', chair: 'jonChair', fridge: 'fridgeFront', tv: 'tv', jonBed: 'jonBed', garfieldBed: 'garfieldBed', catBowl: 'catBowl', vase: 'vase', plate: 'plateSpot' };

function placeholderProps(scene, anchors) {
  const map = new Map();
  for (const [id, [w, h, d]] of Object.entries(PLACEHOLDERS)) {
    const a = anchors.get(PH_ANCHOR[id]);
    const root = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, id === 'fridge' ? -d / 2 : 0), new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.8 }));
    root.position.copy(a.pos); root.rotation.y = a.rotY;
    root.castShadow = root.receiveShadow = true;
    scene.add(root);
    map.set(id, { id, root, colliders: [], state: {}, update() {}, reset() {}, setFood() {} });
  }
  return map;
}

export async function createWorld({ renderer, quality = 'high', withProps = true } = {}) {
  initMaterials(renderer, quality);
  const scene = new THREE.Scene();
  scene.name = 'world';
  scene.background = new THREE.Color(0x3a3050);

  const house = buildHouse({ quality });
  scene.add(house.group, house.extGroup);
  if (house.halos?.length) scene.add(makeHalos(house.halos, { opacity: 0.7, fog: false }));
  const ext = buildExterior({ quality });
  scene.add(ext.sky, ext.nearGroup, ext.farGroup, ext.backdrop, ext.horizon);
  house.anchors.set('ceiling', { pos: new THREE.Vector3(4.9, CEIL1, 9.7), rotY: 0 });
  addCamAnchors(house.anchors);

  const lighting = createLighting({ renderer, scene, quality, lamps: house.lamps });
  const colliders = house.colliders;
  const anchors = house.anchors;

  const sfxHook = { fn: null };
  let propsMod = withProps ? await loadProps() : null;
  let props;
  if (propsMod?.createProps) {
    try {
      props = await propsMod.createProps({ scene, quality, anchors, sfx: (n, o) => sfxHook.fn?.(n, o) });
    } catch (e) { console.error('[world] createProps failed', e); propsMod = null; }
  }
  if (!props) props = placeholderProps(scene, anchors);
  const propColliders = propsMod?.allColliders ? propsMod.allColliders(props) : [...props.values()].flatMap(p => p.colliders || []);
  const propColSet = new Set(propColliders);
  colliders.push(...propColliders);

  const upperProps = ['jonBed', 'garfieldBed', 'bedroomDoor'].map(id => props.get(id)).filter(Boolean);

  const nav = createNav({
    colliders, floors: [0, UF], stairs: STAIRS,
    bounds: { x0: 0.1, x1: W - 0.1, z0: 0.1, z1: D - 0.1 },
    isDynamic: (c) => propColSet.has(c) || c.dynamic,
  });

  // Highest walkable top at or below fromY (+0.3 step) under (x,z).
  function groundAt(x, z, fromY = 10) {
    let best = -Infinity;
    for (const c of colliders) {
      if (c.enabled === false || c.noWalk) continue;
      if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
      const top = c.max.y;
      if (top <= fromY + 0.3 && top > best) best = top;
    }
    return best === -Infinity ? 0 : best;
  }

  let exteriorOn = true;
  const exterior = {
    show(on) {
      exteriorOn = !!on;
      ext.farGroup.visible = exteriorOn;
      house.extGroup.visible = exteriorOn;
      ext.backdrop.visible = !exteriorOn;
      ext.horizon.visible = exteriorOn;
      scene.fog = exteriorOn ? new THREE.Fog(0xb88090, 60, 200) : null;
      lighting.setMode(exteriorOn ? 'exterior' : 'interior', curFloor);
      material('grass').color.set(exteriorOn ? 0xbccc94 : 0x908c84);
    },
    get visible() { return exteriorOn; },
    lampPositions: ext.lampPositions,
  };

  let curFloor = 0, curVis = 'both';
  const lay = house.group.userData.layers;
  const otherProps = [...props.values()].filter(p => !upperProps.includes(p));
  function setCast(root, on) {
    root?.traverse(o => { if (o.isMesh) { if (o.userData._cs === undefined) o.userData._cs = o.castShadow; o.castShadow = on && o.userData._cs; } });
  }
  // The slab between floors doesn't cast shadows, so only the active storey's furniture may cast.
  function setFloor(f) {
    curFloor = f;
    const up = f === 1;
    setCast(lay.upper, up); setCast(lay.upperShell, up);
    setCast(lay.ground, !up); setCast(lay.groundShell, !up);
    for (const p of upperProps) setCast(p.root, up);
    for (const p of otherProps) setCast(p.root, !up);
    if (!exteriorOn) lighting.setMode('interior', f);
  }
  // Furniture of the storey the camera can't see is hidden (shells stay: they show through the stairwell).
  function setVis(v) {
    curVis = v;
    const g = v !== 'upper', u = v !== 'ground';
    if (lay.ground) lay.ground.visible = g;
    if (lay.upper) lay.upper.visible = u;
    for (const p of upperProps) hideProp(p, !u);
    for (const p of otherProps) if (GROUND_CULL.has(p.id)) hideProp(p, !g);
  }
  function hideProp(p, hide) {
    const ud = p.root.userData;
    if (hide && !ud._floorHidden) { ud._floorHidden = true; ud._prevVis = p.root.visible; p.root.visible = false; }
    else if (!hide && ud._floorHidden) { ud._floorHidden = false; p.root.visible = ud._prevVis; }
  }
  house.group.traverse(o => { if (o.isMesh) o.userData.cast = o.castShadow; });

  const camBlockers = [];
  {
    // Invisible box set (never added to the scene) for camera raycasts: walls, floors, ceilings.
    const geos = [];
    for (const c of colliders) if (c.wall || c.floor || c.id === 'ceilUF') {
      const s = new THREE.Vector3().subVectors(c.max, c.min), m = new THREE.Vector3().addVectors(c.max, c.min).multiplyScalar(0.5);
      if (c.id && /^(windowBlock|frontDoorBlock|w\d+)$/.test(c.id)) continue;
      geos.push(new THREE.BoxGeometry(s.x, s.y, s.z).translate(m.x, m.y, m.z));
    }
    const { mergeGeometries } = await import('../../vendor/three/addons/utils/BufferGeometryUtils.js');
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.name = 'camBlockers';
    mesh.updateMatrixWorld(true);
    camBlockers.push(mesh);
  }

  const world = {
    scene, colliders, anchors, nav, props, lighting, exterior, camBlockers, groundAt,
    quality,
    get floor() { return curFloor; },
    addCollider(c) { if (!c.id) c.id = 'c' + colliders.length; if (c.enabled === undefined) c.enabled = true; colliders.push(c); return c; },
    removeCollider(id) { const i = colliders.findIndex(c => c.id === id); if (i >= 0) colliders.splice(i, 1); },
    getCollider(id) { return colliders.find(c => c.id === id); },
    setFood(kind) {
      props.get('plate')?.setFood?.(kind);
      const pan = props.get('pan');
      if (pan) { if (pan.root.userData._floorHidden) pan.root.userData._prevVis = kind === 'lasagna'; else pan.root.visible = kind === 'lasagna'; }
    },
    setSfx(fn) { sfxHook.fn = fn; },
    reset() {
      if (propsMod?.resetProps) propsMod.resetProps(props); else for (const p of props.values()) p.reset?.();
    },
    update(dt, camera, focus) {
      // the street needs a longer far plane than the interior camera's 90 m (horizon ring sits at 145 m)
      if (camera && camera.far !== (exteriorOn ? 320 : (camera.userData.farIn ??= camera.far))) {
        camera.far = exteriorOn ? 320 : camera.userData.farIn; camera.updateProjectionMatrix();
      }
      if (propsMod?.updateProps) propsMod.updateProps(props, dt); else for (const p of props.values()) p.update?.(dt);
      const c = camera?.position;
      props.get('vine')?.cull?.(c);
      const y = c?.y ?? focus?.y ?? 0;
      const f = y > (curFloor ? UF - 0.5 : UF - 0.2) ? 1 : 0;
      if (f !== curFloor) setFloor(f);
      // From the kitchen the upper storey's shell is entirely behind the ceiling: skip ~7 draw calls.
      const shellUp = exteriorOn || f === 1 || !c || c.z < 5.7 || c.y > 2.4;
      if (lay.upperShell && lay.upperShell.visible !== shellUp) lay.upperShell.visible = shellUp;
      if (exteriorOn) { if (curVis !== 'both') setVis('both'); return; }
      const inWell = c && c.x > STAIRS.x0 - 1.4 && c.z > STAIRS.z0 - 0.9 && c.z < STAIRS.z1 + 1.2 && y > 0.9 && y < UF + 1.4;
      const v = inWell ? 'both' : f ? 'upper' : 'ground';
      if (v !== curVis) setVis(v);
    },
  };
  setFloor(0);
  exterior.show(false);
  world.setVisibilityMode = setVis;
  return world;
}

function addCamAnchors(anchors) {
  const cam = (name, p, l, fov) => anchors.set(name, { pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l), rotY: Math.atan2(l[0] - p[0], l[2] - p[2]), fov });
  cam('cam_culdesac', [1, 21, -56], [5, 1, -6], 45);
  cam('cam_culdesacLow', [-5.5, 10, -25], [5.5, 2.4, 2], 42);
  cam('cam_houseFront', [2, 3.4, -12], [6.2, 2.4, 0], 50);
  cam('cam_porch', [7.1, 1.4, -4.2], [7.1, 1.2, 0], 55);
  cam('cam_frontDoor', [7.1, 1.5, 0.45], [5.5, 1.0, 6.5], 60);
  cam('cam_livingWide', [8.2, 2.1, 0.6], [2.5, 0.6, 4.5], 60);
  cam('cam_dining', [7.3, 1.3, 7.0], [4.4, 1.2, 8.75], 50);
  cam('cam_diningSide', [4.4, 1.35, 6.2], [4.4, 0.85, 8.9], 50);
  cam('cam_plate', [4.95, 1.25, 7.85], [4.4, 0.78, 8.6], 45);
  cam('cam_bowl', [6.1, 0.55, 8.75], [6.7, 0.08, 9.7], 50);
  cam('cam_windowsill', [4.6, 1.55, 2.3], [2.9, 1.05, 0.25], 50);
  cam('cam_fridgeTop', [3.4, 2.35, 7.4], [5.6, 1.85, 10.5], 55);
  cam('cam_bedroomDoor', [8.6, UF + 1.6, 5.0], [6.4, UF + 1.1, 5.7], 55);
  cam('cam_bedroom', [5.6, UF + 2.0, 0.8], [1.5, UF + 0.4, 3.6], 60);
}
