/**
 * 3D Viewer — Three.js torus habitat renderer with exterior orbit and interior walk-through.
 */
const Viewer = (() => {
  let scene, camera, renderer, animId;
  let torusMesh, hubMesh;
  let spokeMeshes = [];
  let extraMeshes = [];
  let mode = 'exterior';
  let isActive = false;
  let currentCfg = null;
  let currentRoomTypes = null;

  // Camera control state
  const ctrl = {
    isDragging: false,
    lastX: 0, lastY: 0,
    // Exterior orbit
    theta: 0.3, phi: 0.9,
    distance: 1400,
    // Interior first-person
    posX: 0, posY: 1.7, posZ: 0,
    yaw: 0, pitch: 0,
    keys: {},
    pinchDist: 0,
  };

  const canvas = document.getElementById('viewer-canvas');
  const floorSelector = document.getElementById('floor-selector');
  const floorButtons = document.getElementById('floor-buttons');
  const hudInfo = document.getElementById('hud-info');
  const hudControls = document.getElementById('hud-controls');

  function init() {
    if (scene) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 10000);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resize();

    // Ambient + directional light (for exterior)
    scene.add(new THREE.AmbientLight(0x334466, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(500, 300, 200);
    scene.add(sun);

    addStars();
    bindControls();
  }

  function addStars() {
    const geo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < 3000; i++) {
      const r = 4000 + Math.random() * 4000;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      verts.push(r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t));
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: true })));
  }

  // ---- Exterior habitat model ----
  function buildExterior(cfg) {
    clearHabitat();
    const R = cfg.majorRadius;
    const r = cfg.tubeRadius;

    // Torus ring
    const torusGeo = new THREE.TorusGeometry(R, r, 32, 120);
    const torusMat = new THREE.MeshStandardMaterial({ color: 0x667788, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide });
    torusMesh = new THREE.Mesh(torusGeo, torusMat);
    scene.add(torusMesh);

    // Inner surface
    const innerGeo = new THREE.TorusGeometry(R, r * 0.92, 32, 120);
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x88aa77, metalness: 0.1, roughness: 0.8, side: THREE.BackSide });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);
    extraMeshes.push(innerMesh);

    // Central hub
    const hubRadius = R * 0.08;
    const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius, r * 0.8, 24);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.7, roughness: 0.3 });
    hubMesh = new THREE.Mesh(hubGeo, hubMat);
    scene.add(hubMesh);

    // Spokes
    spokeMeshes = [];
    const spokeCount = 6;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const spokeLen = R - hubRadius;
      const spokeGeo = new THREE.CylinderGeometry(R * 0.012, R * 0.012, spokeLen, 8);
      const spokeMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.6, roughness: 0.4 });
      const spoke = new THREE.Mesh(spokeGeo, spokeMat);
      const midDist = hubRadius + spokeLen / 2;
      spoke.position.set(Math.cos(angle) * midDist, 0, Math.sin(angle) * midDist);
      spoke.rotation.order = 'YZX';
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = angle;
      scene.add(spoke);
      spokeMeshes.push(spoke);
    }
  }

  function clearHabitat() {
    if (torusMesh) { scene.remove(torusMesh); torusMesh = null; }
    if (hubMesh) { scene.remove(hubMesh); hubMesh = null; }
    spokeMeshes.forEach(s => scene.remove(s));
    spokeMeshes = [];
    extraMeshes.forEach(m => scene.remove(m));
    extraMeshes = [];
    Interior.cleanup(scene);
  }

  // ---- Mode switching ----
  function buildHabitat(cfg, roomTypes) {
    init();
    currentCfg = cfg;
    currentRoomTypes = roomTypes || [];
    buildExterior(cfg);

    ctrl.distance = cfg.majorRadius * 2.8;
    ctrl.theta = 0.3;
    ctrl.phi = 0.9;

    setMode('exterior');
    updateCamera();
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.btn-view-mode').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === m);
    });

    if (m === 'interior' || m === 'roofview') {
      enterInterior(m === 'roofview');
    } else {
      exitInterior();
    }

    updateHUD();
  }

  function enterInterior(roofView) {
    // Hide exterior objects
    if (torusMesh) torusMesh.visible = false;
    if (hubMesh) hubMesh.visible = false;
    spokeMeshes.forEach(s => s.visible = false);
    extraMeshes.forEach(m => m.visible = false);
    scene.children.forEach(c => { if (c.isPoints) c.visible = false; });

    // Build interior
    Interior.build(scene, currentCfg, currentRoomTypes);
    buildFloorSelector();
    floorSelector.classList.remove('hidden');

    camera.fov = 70;
    camera.near = 0.05;

    if (roofView) {
      // Position above a tall room looking down
      const rv = Interior.getRoofViewPosition();
      if (rv) {
        ctrl.posX = rv.x;
        ctrl.posY = rv.y;
        ctrl.posZ = rv.z;
        ctrl.yaw = Math.PI / 2;
        ctrl.pitch = -1.2; // look sharply downward
      } else {
        // Fallback: just go high up in hallway
        ctrl.posX = 0;
        ctrl.posY = 8;
        ctrl.posZ = 0;
        ctrl.yaw = Math.PI / 2;
        ctrl.pitch = -0.8;
      }
    } else {
      // Standard first-person hallway walk
      const start = Interior.getCameraStart();
      ctrl.posX = start.x;
      ctrl.posY = start.y;
      ctrl.posZ = start.z;
      ctrl.yaw = Math.PI / 2;
      ctrl.pitch = 0;
    }

    camera.updateProjectionMatrix();
    updateCamera();
  }

  function exitInterior() {
    Interior.cleanup(scene);
    floorSelector.classList.add('hidden');

    // Show exterior objects
    if (torusMesh) torusMesh.visible = true;
    if (hubMesh) hubMesh.visible = true;
    spokeMeshes.forEach(s => s.visible = true);
    extraMeshes.forEach(m => m.visible = true);
    scene.children.forEach(c => {
      if (c.isPoints) c.visible = true;
    });

    camera.near = 0.1;
    camera.fov = 60;
    camera.updateProjectionMatrix();
    updateCamera();
  }

  function buildFloorSelector() {
    const levels = currentCfg?.levels || 5;
    floorButtons.innerHTML = '';
    for (let i = 0; i < levels; i++) {
      const btn = document.createElement('button');
      btn.className = 'floor-btn' + (i === Interior.getFloor() ? ' active' : '');
      btn.textContent = i + 1;
      btn.title = `Floor ${i + 1}`;
      btn.addEventListener('click', () => {
        Interior.setFloor(i, scene, currentCfg, currentRoomTypes);
        // Reset camera to hallway
        const start = Interior.getCameraStart();
        ctrl.posX = start.x;
        ctrl.posY = start.y;
        ctrl.posZ = start.z;
        ctrl.yaw = Math.PI / 2;
        ctrl.pitch = 0;
        updateCamera();
        // Update active button
        floorButtons.querySelectorAll('.floor-btn').forEach((b, j) => {
          b.classList.toggle('active', j === i);
        });
        updateHUD();
      });
      floorButtons.appendChild(btn);
    }
  }

  function updateHUD() {
    if (mode === 'roofview') {
      const rv = Interior.getRoofViewPosition();
      hudInfo.textContent = rv ? `Roof view — ${rv.name}` : 'Roof view';
      hudControls.innerHTML = '<span>Drag to look &bull; WASD to fly &bull; Q/E up/down</span>';
    } else if (mode === 'interior') {
      const f = Interior.getFloor() + 1;
      const levels = currentCfg?.levels || 5;
      hudInfo.textContent = `Floor ${f} of ${levels}`;
      hudControls.innerHTML = '<span>Drag to look &bull; WASD to walk &bull; Q/E up/down</span>';
    } else {
      hudInfo.textContent = '';
      hudControls.innerHTML = '<span>Drag to orbit &bull; Scroll/Pinch to zoom &bull; WASD to rotate</span>';
    }
  }

  // ---- Camera ----
  function updateCamera() {
    if (mode === 'exterior') {
      const x = ctrl.distance * Math.sin(ctrl.phi) * Math.cos(ctrl.theta);
      const y = ctrl.distance * Math.cos(ctrl.phi);
      const z = ctrl.distance * Math.sin(ctrl.phi) * Math.sin(ctrl.theta);
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
    } else {
      // First-person
      camera.position.set(ctrl.posX, ctrl.posY, ctrl.posZ);
      const lx = ctrl.posX + Math.cos(ctrl.pitch) * Math.sin(ctrl.yaw);
      const ly = ctrl.posY + Math.sin(ctrl.pitch);
      const lz = ctrl.posZ + Math.cos(ctrl.pitch) * Math.cos(ctrl.yaw);
      camera.lookAt(lx, ly, lz);
    }
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function start() { isActive = true; resize(); animate(); }
  function stop() { isActive = false; if (animId) cancelAnimationFrame(animId); }

  function animate() {
    if (!isActive) return;
    animId = requestAnimationFrame(animate);

    // Keyboard movement
    if (mode === 'interior' || mode === 'roofview') {
      const speed = 0.15;
      const forward = { x: Math.sin(ctrl.yaw) * speed, z: Math.cos(ctrl.yaw) * speed };
      const strafe = { x: Math.cos(ctrl.yaw) * speed, z: -Math.sin(ctrl.yaw) * speed };
      if (ctrl.keys['w'] || ctrl.keys['arrowup']) { ctrl.posX += forward.x; ctrl.posZ += forward.z; }
      if (ctrl.keys['s'] || ctrl.keys['arrowdown']) { ctrl.posX -= forward.x; ctrl.posZ -= forward.z; }
      if (ctrl.keys['a'] || ctrl.keys['arrowleft']) { ctrl.posX -= strafe.x; ctrl.posZ -= strafe.z; }
      if (ctrl.keys['d'] || ctrl.keys['arrowright']) { ctrl.posX += strafe.x; ctrl.posZ += strafe.z; }
      if (ctrl.keys['q']) ctrl.posY -= 0.08;
      if (ctrl.keys['e']) ctrl.posY += 0.08;
      updateCamera();
    } else {
      const speed = 0.005;
      if (ctrl.keys['w'] || ctrl.keys['arrowup']) ctrl.phi = Math.max(0.1, ctrl.phi - speed);
      if (ctrl.keys['s'] || ctrl.keys['arrowdown']) ctrl.phi = Math.min(Math.PI - 0.1, ctrl.phi + speed);
      if (ctrl.keys['a'] || ctrl.keys['arrowleft']) ctrl.theta -= speed;
      if (ctrl.keys['d'] || ctrl.keys['arrowright']) ctrl.theta += speed;
      updateCamera();
    }

    renderer.render(scene, camera);
  }

  // ---- Input Handling ----
  function bindControls() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', (e) => { ctrl.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { ctrl.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('resize', resize);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
  }

  function onPointerDown(e) {
    ctrl.isDragging = true;
    ctrl.lastX = e.clientX;
    ctrl.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!ctrl.isDragging) return;
    const dx = e.clientX - ctrl.lastX;
    const dy = e.clientY - ctrl.lastY;
    ctrl.lastX = e.clientX;
    ctrl.lastY = e.clientY;

    if (mode === 'exterior') {
      ctrl.theta -= dx * 0.005;
      ctrl.phi = Math.max(0.1, Math.min(Math.PI - 0.1, ctrl.phi - dy * 0.005));
    } else {
      ctrl.yaw += dx * 0.003;
      ctrl.pitch = Math.max(-1.2, Math.min(1.2, ctrl.pitch - dy * 0.003));
    }
    updateCamera();
  }

  function onPointerUp(e) {
    ctrl.isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
  }

  function onWheel(e) {
    e.preventDefault();
    if (mode === 'exterior') {
      ctrl.distance *= (1 + e.deltaY * 0.001);
      ctrl.distance = Math.max(50, Math.min(8000, ctrl.distance));
    } else {
      // Scroll to walk forward/back
      const forward = { x: Math.sin(ctrl.yaw) * 0.5, z: Math.cos(ctrl.yaw) * 0.5 };
      ctrl.posX -= forward.x * Math.sign(e.deltaY);
      ctrl.posZ -= forward.z * Math.sign(e.deltaY);
    }
    updateCamera();
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      ctrl.pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = ctrl.pinchDist - dist;
      ctrl.pinchDist = dist;
      if (mode === 'exterior') {
        ctrl.distance *= (1 + delta * 0.005);
        ctrl.distance = Math.max(50, Math.min(8000, ctrl.distance));
      }
      updateCamera();
    }
  }

  function onTouchEnd() { ctrl.pinchDist = 0; }

  return { init, buildHabitat, setMode, start, stop, resize };
})();
