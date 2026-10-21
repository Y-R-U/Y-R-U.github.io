// Livery turntable for the profile creator: its own small renderer, independent of FLIGHT's.
export async function createPreview(stage, livery) {
  const [THREE, { createPlane }] = await Promise.all([import('three'), import('../plane/index.js')]);
  const canvas = document.createElement('canvas');
  stage.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a28, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(6, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2);
  rim.position.set(-8, 4, -9);
  scene.add(rim);

  const floorTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,240,210,.32)');
    r.addColorStop(0.6, 'rgba(255,230,190,.10)');
    r.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.receiveShadow = true;
  scene.add(shadow);

  const rig = await createPlane({ type: 'c172', livery, quality: 'high', cockpit: false });
  rig.setView?.('chase');
  rig.setControls?.({ aileron: 0, elevator: 0, rudder: 0, throttle: 0.12, flaps: 0, brake: 1 });
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const pivot = new THREE.Group();
  pivot.add(rig.root);
  rig.root.position.y = rig.dims?.gearHeight ?? 1;
  scene.add(pivot);

  const dims = rig.dims || { length: 8, span: 11, height: 2.7 };
  const target = new THREE.Vector3(0, (dims.height || 2.7) * 0.45, 0);
  function fit() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const radius = Math.max(dims.span || 11, dims.length || 8) * 0.56;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = radius / Math.sin(Math.min(vfov, hfov) / 2);
    const elev = THREE.MathUtils.degToRad(17);
    camera.position.set(0, target.y + Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  let yaw = -0.7, spin = 0.32, drag = null, active = true, raf = 0, last = performance.now();
  stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw, id: e.pointerId }; stage.setPointerCapture?.(e.pointerId); stage.style.cursor = 'grabbing'; });
  stage.addEventListener('pointermove', (e) => { if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  const up = () => { drag = null; stage.style.cursor = ''; };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  function frame(now) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag) yaw += spin * dt;
    pivot.rotation.y = yaw;
    rig.update?.(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setLivery(l) { rig.setLivery?.(l); },
    setActive(on) {
      active = on;
      if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      rig.dispose?.();
      floorTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
