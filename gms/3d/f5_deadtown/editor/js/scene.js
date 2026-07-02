// The editor viewport: a Three.js view of the level doc using the REAL asset
// pack + the REAL ground/env builder, so what you see is what the game ships.
// Default camera is orthographic top-down (north-up, matching the minimap);
// P toggles a perspective orbit preview. Entities (objects, pickups, hotspots,
// spawn zones, player start) are pickable/drag-movable; a ghost ring previews
// placement. All mutation happens in main.js — this module only renders,
// raycasts and reports pointer intents.

import * as THREE from 'three';
import { buildEnv } from '../../js/world.js';
import { model as loadModel } from '../../js/assets.js';
import { makePickupVisual } from '../../js/level.js';
import { makeHotspotMarker, HOTSPOT_STYLE } from '../../js/hotspots.js';
import { makeNameSprite } from '../../js/utils.js';

export function createEditorScene({ container, renderer, callbacks }) {
  const scene = new THREE.Scene();
  const W = () => container.clientWidth, H = () => container.clientHeight;

  // ── cameras ──
  let viewSize = 60;                       // ortho half-height in metres
  let panX = 0, panZ = 0;
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const persp = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
  let mode = 'top';                        // top | orbit
  let orbit = { yaw: -0.7, pitch: 0.9, dist: 60 };
  function applyCamera() {
    const aspect = W() / Math.max(1, H());
    if (mode === 'top') {
      ortho.left = -viewSize * aspect; ortho.right = viewSize * aspect;
      ortho.top = viewSize; ortho.bottom = -viewSize;
      ortho.position.set(panX, 120, panZ);
      ortho.up.set(0, 0, -1);
      ortho.lookAt(panX, 0, panZ);
      ortho.updateProjectionMatrix();
    } else {
      persp.aspect = aspect;
      const cp = Math.cos(orbit.pitch), d = orbit.dist;
      persp.position.set(panX + Math.sin(orbit.yaw) * cp * d, Math.sin(orbit.pitch) * d, panZ + Math.cos(orbit.yaw) * cp * d);
      persp.up.set(0, 1, 0);
      persp.lookAt(panX, 0, panZ);
      persp.updateProjectionMatrix();
    }
  }
  const camera = () => mode === 'top' ? ortho : persp;
  function onResize() { renderer.setSize(W(), H()); applyCamera(); }
  addEventListener('resize', onResize);

  // ── level content ──
  let env = null, doc = null;
  const root = new THREE.Group(); scene.add(root);
  const views = new Map();   // key "kind:uid" -> { group, kind, uid, extra }
  let boundsLine = null, grid = null;
  let disposables = [];

  function clearAll() {
    for (const [, v] of views) root.remove(v.group);
    views.clear();
    if (boundsLine) { root.remove(boundsLine); boundsLine = null; }
    if (grid) { root.remove(grid); grid = null; }
    for (const d of disposables) d.dispose?.();
    disposables = [];
    env?.dispose(); env = null;
  }

  const key = (kind, uid) => `${kind}:${uid}`;
  function register(kind, uid, group, extra = {}) {
    group.userData.pick = { kind, uid };
    root.add(group);
    views.set(key(kind, uid), { group, kind, uid, ...extra });
    return group;
  }

  // ── entity views ──
  function objectView(o) {
    const holder = new THREE.Group();
    holder.position.set(o.x, o.y || 0, o.z);
    holder.rotation.y = o.rot || 0;
    loadModel(o.model).then(m => { m.scale.setScalar(o.scale || 1); holder.add(m); }).catch(() => {
      const ph = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }));
      ph.position.y = 0.5; holder.add(ph); disposables.push(ph.geometry, ph.material);
    });
    if (o.collide?.type === 'box') {
      const bx = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(o.collide.hx * 2, 0.4, o.collide.hz * 2)),
        new THREE.LineBasicMaterial({ color: 0x50b0ff, transparent: true, opacity: 0.5 })
      );
      // collider is axis-aligned in the game — counter-rotate so it stays true
      bx.rotation.y = -(o.rot || 0);
      bx.position.y = 0.2;
      holder.add(bx);
      disposables.push(bx.geometry, bx.material);
    } else if (o.collide?.type === 'circle') {
      const c = ringMesh(o.collide.r, 0x50b0ff, 0.35);
      holder.add(c);
    }
    return register('object', o.uid, holder);
  }

  function ringMesh(r, color, opacity = 0.5, width = 0.16) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.1, r - width), r, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.y = 0.06;
    disposables.push(m.geometry, m.material);
    return m;
  }

  function pickupView(p) {
    const holder = new THREE.Group();
    holder.position.set(p.x, 0, p.z);
    const v = makePickupVisual(p.kind, p.item);
    holder.add(v.holder);
    disposables.push(v.ring.material, v.beam.material);
    const label = makeNameSprite(p.kind === 'weapon' ? `⚔ ${p.item}` : p.kind === 'ammo' ? `${p.n}× ${p.ammo}` : 'medkit', 2.1);
    holder.add(label);
    disposables.push(label.material.map, label.material);
    return register('pickup', p.uid, holder, { spin: v.itemNode });
  }

  function hotspotView(h) {
    const holder = new THREE.Group();
    holder.position.set(h.x, 0, h.z);
    const marker = makeHotspotMarker({ ...h, x: 0, z: 0 }, false, true);
    holder.add(marker.group);
    disposables.push(...marker.mats);
    const st = HOTSPOT_STYLE[h.type] || HOTSPOT_STYLE.note;
    const label = makeNameSprite(`${h.type}${h.label ? ' · ' + h.label : ''}`, 2.6);
    holder.add(label);
    disposables.push(label.material.map, label.material);
    // exit → target line hint drawn by main via linkLines
    return register('hotspot', h.uid, holder, { marker });
  }

  function spawnView(s) {
    const holder = new THREE.Group();
    holder.position.set(s.x, 0, s.z);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(s.r || 5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff4536, transparent: true, opacity: 0.13, depthWrite: false })
    );
    disc.position.y = 0.04;
    holder.add(disc);
    disposables.push(disc.geometry, disc.material);
    holder.add(ringMesh(s.r || 5, 0xff4536, 0.6));
    const label = makeNameSprite(`🧟 ${s.count}× ${(s.types || []).join('/')}${s.respawn ? ' ↻' : ''}`, 1.6);
    holder.add(label);
    disposables.push(label.material.map, label.material);
    return register('spawn', s.uid, holder);
  }

  function startView(ps) {
    const holder = new THREE.Group();
    holder.position.set(ps.x, 0, ps.z);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.4, 12),
      new THREE.MeshBasicMaterial({ color: 0x8fd07a })
    );
    cone.position.y = 0.7;
    holder.add(cone);
    const dir = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 8).rotateX(Math.PI / 2), cone.material);
    dir.position.set(Math.sin(ps.yaw || 0) * 1.1, 0.35, Math.cos(ps.yaw || 0) * 1.1);
    dir.lookAt(holder.position.x + Math.sin(ps.yaw || 0) * 3, 0.35, holder.position.z + Math.cos(ps.yaw || 0) * 3);
    holder.add(dir);
    disposables.push(cone.geometry, cone.material, dir.geometry);
    const label = makeNameSprite('🚩 start', 2.2);
    holder.add(label); disposables.push(label.material.map, label.material);
    return register('start', 'start', holder);
  }

  // ── selection highlight + ghost ──
  const selRing = ringMesh(1.2, 0xffe24a, 0.95, 0.12);
  selRing.visible = false; scene.add(selRing);
  let selKey = null;
  function select(kind, uid) {
    selKey = uid == null ? null : key(kind, uid);
    updateSelRing();
  }
  function updateSelRing() {
    const v = selKey && views.get(selKey);
    if (!v) { selRing.visible = false; return; }
    const r = pickRadius(v);
    selRing.geometry.dispose();
    selRing.geometry = new THREE.RingGeometry(Math.max(0.1, r - 0.14), r, 40).rotateX(-Math.PI / 2);
    selRing.position.set(v.group.position.x, 0.08, v.group.position.z);
    selRing.visible = true;
  }
  function pickRadius(v) {
    if (v.kind === 'object') {
      const o = findDoc(v.kind, v.uid);
      if (o?.collide?.type === 'box') return Math.hypot(o.collide.hx, o.collide.hz);
      if (o?.collide?.type === 'circle') return o.collide.r + 0.3;
      return 1.4;
    }
    if (v.kind === 'hotspot') return (findDoc(v.kind, v.uid)?.r || 2) + 0.3;
    if (v.kind === 'spawn') return (findDoc(v.kind, v.uid)?.r || 5) + 0.3;
    if (v.kind === 'start') return 1.2;
    return 1.0;
  }
  function findDoc(kind, uid) {
    if (!doc) return null;
    if (kind === 'object') return (doc.objects || []).find(o => o.uid === uid);
    if (kind === 'pickup') return (doc.pickups || []).find(o => o.uid === uid);
    if (kind === 'hotspot') return (doc.hotspots || []).find(o => o.uid === uid);
    if (kind === 'spawn') return (doc.spawns || []).find(o => o.uid === uid);
    if (kind === 'start') return doc.playerStart;
    return null;
  }

  const ghost = ringMesh(1.2, 0x8fd07a, 0.8);
  ghost.visible = false; scene.add(ghost);
  let ghostOn = false;
  function setGhost(on, r = 1.2) {
    ghostOn = on;
    ghost.visible = false;
    if (on) {
      ghost.geometry.dispose();
      ghost.geometry = new THREE.RingGeometry(Math.max(0.1, r - 0.16), r, 40).rotateX(-Math.PI / 2);
    }
  }

  // exit-link lines (exit hotspot → its target's door, when target == this level)
  let linkGroup = new THREE.Group(); scene.add(linkGroup);
  function drawLinks() {
    scene.remove(linkGroup);
    linkGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    linkGroup = new THREE.Group(); scene.add(linkGroup);
    if (!doc) return;
    for (const h of (doc.hotspots || [])) {
      if (h.type !== 'exit' || !h.target) continue;
      if (h.target.level === doc.id) {
        const t = (doc.hotspots || []).find(x => x.uid === h.target.hotspot);
        if (!t) continue;
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(h.x, 0.4, h.z), new THREE.Vector3(t.x, 0.4, t.z)]);
        linkGroup.add(new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x6fe08a, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.6 })));
      }
    }
    linkGroup.children.forEach(l => l.computeLineDistances?.());
  }

  // ── build / refresh ──
  function loadDoc(d) {
    clearAll();
    doc = d;
    env = buildEnv(scene, renderer, d);
    scene.fog = null;                                   // editor sees everything
    const HXX = d.bounds?.hx || 40, HZZ = d.bounds?.hz || 40;
    // bounds frame
    const pts = [new THREE.Vector3(-HXX, 0.1, -HZZ), new THREE.Vector3(HXX, 0.1, -HZZ), new THREE.Vector3(HXX, 0.1, HZZ), new THREE.Vector3(-HXX, 0.1, HZZ), new THREE.Vector3(-HXX, 0.1, -HZZ)];
    boundsLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffe24a }));
    root.add(boundsLine);
    disposables.push(boundsLine.geometry, boundsLine.material);
    // metre grid
    grid = new THREE.GridHelper(Math.max(HXX, HZZ) * 2, Math.max(HXX, HZZ), 0x394132, 0x2a3026);
    grid.material.transparent = true; grid.material.opacity = 0.22;
    grid.position.y = 0.02;
    root.add(grid);
    for (const o of (d.objects || [])) objectView(o);
    for (const p of (d.pickups || [])) pickupView(p);
    for (const h of (d.hotspots || [])) hotspotView(h);
    for (const s of (d.spawns || [])) spawnView(s);
    if (d.playerStart) startView(d.playerStart);
    drawLinks();
    updateSelRing();
    // frame the level
    viewSize = Math.max(HXX, HZZ) * 1.15;
    panX = 0; panZ = 0;
    applyCamera();
  }

  // refresh a single entity from the doc (position/fields changed)
  function refresh(kind, uid) {
    const v = views.get(key(kind, uid));
    if (v) root.remove(v.group);
    views.delete(key(kind, uid));
    const d = findDoc(kind, uid);
    if (d) {
      if (kind === 'object') objectView(d);
      else if (kind === 'pickup') pickupView(d);
      else if (kind === 'hotspot') hotspotView(d);
      else if (kind === 'spawn') spawnView(d);
      else if (kind === 'start') startView(d);
    }
    drawLinks();
    updateSelRing();
  }
  function moveView(kind, uid, x, z) {
    const v = views.get(key(kind, uid));
    if (v) { v.group.position.x = x; v.group.position.z = z; }
    updateSelRing();
  }

  // ── picking + drag + pan/zoom ──
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function worldAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera());
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, out) ? out : null;
  }
  function pickAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera());
    // markers first (rings are thin — test by distance on the ground plane)
    const w = worldAt(e);
    if (w) {
      let best = null, bestD = 1e9;
      for (const [, v] of views) {
        if (v.kind === 'object') continue;               // objects picked by mesh below
        const d = Math.hypot(w.x - v.group.position.x, w.z - v.group.position.z);
        const rr = Math.max(1.2, pickRadius(v));
        if (d < rr && d < bestD) { best = v; bestD = d; }
      }
      if (best) return best;
    }
    const meshes = [];
    for (const [, v] of views) if (v.kind === 'object') meshes.push(v.group);
    const hits = ray.intersectObjects(meshes, true);
    for (const h of hits) {
      let n = h.object;
      while (n && !n.userData.pick) n = n.parent;
      if (n) return views.get(key(n.userData.pick.kind, n.userData.pick.uid));
    }
    return null;
  }

  let drag = null;      // { v, offX, offZ, moved }
  let panning = null;   // { x, z, px, py }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    renderer.domElement.setPointerCapture(e.pointerId);
    const w = worldAt(e);
    if (ghostOn) { if (w && e.button === 0) callbacks.onPlace(w.x, w.z); return; }
    if (mode === 'orbit') { panning = { orbit: true, px: e.clientX, py: e.clientY }; return; }
    if (e.button === 1 || e.button === 2 || e.shiftKey) { panning = { px: e.clientX, py: e.clientY }; return; }
    const v = pickAt(e);
    if (v && w) {
      drag = { v, offX: v.group.position.x - w.x, offZ: v.group.position.z - w.z, moved: false };
      callbacks.onSelect(v.kind, v.uid);
    } else {
      panning = { px: e.clientX, py: e.clientY, deselectOnTap: true };
    }
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const w = worldAt(e);
    if (ghostOn && w) { ghost.visible = true; ghost.position.set(callbacks.snap(w.x), 0.06, callbacks.snap(w.z)); return; }
    if (drag && w) {
      drag.moved = true;
      const x = callbacks.snap(w.x + drag.offX), z = callbacks.snap(w.z + drag.offZ);
      moveView(drag.v.kind, drag.v.uid, x, z);
      callbacks.onMoveLive(drag.v.kind, drag.v.uid, x, z);
      return;
    }
    if (panning) {
      const dx = e.clientX - panning.px, dy = e.clientY - panning.py;
      panning.px = e.clientX; panning.py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) panning.deselectOnTap = false;
      if (panning.orbit) { orbit.yaw -= dx * 0.006; orbit.pitch = Math.min(1.4, Math.max(0.15, orbit.pitch + dy * 0.005)); }
      else {
        const k = (mode === 'top' ? (viewSize * 2) / H() : orbit.dist / 400);
        panX -= dx * k; panZ -= dy * k;
      }
      applyCamera();
    }
  });
  const endPointer = (e) => {
    if (drag) { if (drag.moved) callbacks.onMoveEnd(drag.v.kind, drag.v.uid); drag = null; }
    if (panning) { if (panning.deselectOnTap) callbacks.onSelect(null, null); panning = null; }
  };
  renderer.domElement.addEventListener('pointerup', endPointer);
  renderer.domElement.addEventListener('pointercancel', endPointer);
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (mode === 'top') {
      const before = worldAt(e);
      viewSize = Math.min(200, Math.max(6, viewSize * (1 + e.deltaY * 0.001)));
      applyCamera();
      const after = worldAt(e);
      if (before && after) { panX += before.x - after.x; panZ += before.z - after.z; applyCamera(); }
    } else {
      orbit.dist = Math.min(220, Math.max(8, orbit.dist * (1 + e.deltaY * 0.001)));
      applyCamera();
    }
  }, { passive: false });

  // ── loop ──
  let t = 0; const clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    const dt = clock.getDelta(); t += dt;
    for (const [, v] of views) {
      if (v.spin) { v.spin.rotation.y = t * 1.7; }
      if (v.marker) v.marker.tick(t);
    }
    renderer.render(scene, camera());
  }
  onResize();
  tick();

  return {
    loadDoc, refresh, moveView, select, setGhost, drawLinks,
    setGridVisible: (on) => { if (grid) grid.visible = on; },
    toggleCamera: () => { mode = mode === 'top' ? 'orbit' : 'top'; applyCamera(); return mode; },
    frame: () => { if (doc) { viewSize = Math.max(doc.bounds?.hx || 40, doc.bounds?.hz || 40) * 1.15; panX = panZ = 0; applyCamera(); } },
    get mode() { return mode; },
  };
}
