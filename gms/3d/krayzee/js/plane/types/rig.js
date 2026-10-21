import * as THREE from 'three';
import { normalizeLivery } from '../livery.js';
import { glowTexture, discTexture } from '../materials.js';
import { mergeFarLOD } from '../farlod.js';

const D2R = Math.PI / 180;

// Assembles a PlaneRig (same API as the C172 createPlane) from a type definition:
// def = { id, cg:{s,y}, eye:{x,y,s,pitch}, eyeCenter?, portrait:{center:[x,y,z], cockpit:[x,y,z], fov, pitch}, dims,
//   lod:[near,far2Mul], createLivery(q), createMaterials(q, livery), buildExterior(q, mats, livery, ctx),
//   buildCockpit?(q, mats, ctx), createPilot?(q, cfg, ctx), animate(ext, cur, dt, ctx), onLivery?(L, ext, fars, ctx),
//   rpm:{idle,max}, pilotWithoutCockpit }
export async function assembleRig(def, opts = {}) {
  const quality = opts.quality === 'low' ? 'low' : 'high';
  const high = quality === 'high';
  const wantCockpit = opts.cockpit !== false;
  const CG = def.cg;
  const ctx = { opts, quality, high, wantCockpit, airspeed: 0 };

  const livery = def.createLivery(quality, ctx);
  const mats = def.createMaterials(quality, livery, ctx);
  const ext = def.buildExterior(quality, mats, ctx);

  const root = new THREE.Group();
  root.name = 'plane-' + def.id;
  const airframe = new THREE.Group();
  airframe.position.set(0, -CG.y, -CG.s);
  airframe.add(ext.group);
  const near = new THREE.Group();
  near.name = 'plane-near';
  near.add(airframe);
  const lodDistance = opts.lodDistance ?? (high ? def.lod?.[0] ?? 260 : def.lod?.[1] ?? 150);
  const lodDistance2 = opts.lodDistance2 ?? lodDistance * 3.5;
  const lod = new THREE.LOD();
  lod.name = 'plane-lod';
  lod.addLevel(near, 0);
  const fars = ['lod', 'lod2'].map((q, i) => {
    const f = def.buildExterior(q, mats, ctx);
    if (f.propMesh) f.propMesh.visible = false;
    const frame = new THREE.Group();
    frame.name = i ? 'plane-far2' : 'plane-far';
    frame.position.copy(airframe.position);
    frame.add(f.group);
    // like the C172: each far level is baked into one mesh / one draw call
    if (opts.mergeFar !== false) f.merged = mergeFarLOD(frame, { paint: mats.paint, glass: null });
    lod.addLevel(frame, i ? lodDistance2 : lodDistance, 0.08);
    return f;
  });
  root.add(lod);

  const shadowProxy = opts.shadowProxy ?? !high;
  let proxyMat = null;
  if (shadowProxy) {
    proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const src = lod.levels[2].object, pos = [], idx = [], v = new THREE.Vector3();
    src.updateMatrixWorld(true);
    const inv = src.matrixWorld.clone().invert(), m = new THREE.Matrix4();
    src.traverse((o) => {
      if (!o.isMesh || ['glass', 'lights', 'beacon', 'propDisc', 'prop', 'water'].includes(o.name)) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      const P = o.geometry.attributes.position, base = pos.length / 3;
      for (let i = 0; i < P.count; i++) pos.push(...v.fromBufferAttribute(P, i).applyMatrix4(m).toArray());
      const I = o.geometry.index;
      if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
      else for (let i = 0; i < P.count; i++) idx.push(base + i);
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setIndex(idx);
    const proxy = new THREE.Mesh(pg, proxyMat);
    proxy.name = 'plane-shadow';
    proxy.castShadow = true;
    proxy.onBeforeShadow = () => pg.setDrawRange(0, Infinity);
    proxy.onBeforeRender = () => pg.setDrawRange(0, 0);
    proxy.position.copy(src.position);
    near.add(proxy);
  }

  // stick pivot: the pilot's right hand follows it whether or not the cockpit detail exists
  const stick = new THREE.Object3D();
  stick.name = 'stick-pivot';
  if (def.stick) stick.position.set(...def.stick.pos);
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  cockpit.position.set(0, -CG.y, -CG.s);
  cockpit.add(stick);
  near.add(cockpit);
  ctx.stick = stick;
  let cp = null;
  if (wantCockpit && def.buildCockpit) {
    cp = def.buildCockpit(quality, mats, ctx);
    cockpit.add(cp.group);
  }
  let pilot = null;
  if (def.createPilot && opts.pilot !== false && (cp || def.pilotWithoutCockpit)) {
    pilot = def.createPilot(quality, typeof opts.pilot === 'object' ? opts.pilot : {}, ctx);
    cockpit.add(pilot.mesh);
  }

  let glow = null;
  if (high && ext.lightPts.length) {
    const n = ext.lightPts.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    ext.lightPts.forEach((l, i) => pos.set(l.p, i * 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    glow = new THREE.Points(g, new THREE.PointsMaterial({
      map: glowTexture(), size: 0.45, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true,
    }));
    glow.frustumCulled = false;
    glow.renderOrder = 4;
    ext.group.add(glow);
  }
  mats.disc.map = discTexture();
  mats.disc.needsUpdate = true;

  const toLocal = (x, y, s) => new THREE.Vector3(x, y - CG.y, s - CG.s);
  const E = def.eye, EC = def.eyeCenter || { ...def.eye, x: 0 };
  const eye = toLocal(E.x, E.y, E.s), eyePitch = E.pitch;
  const eyeCenter = toLocal(EC.x, EC.y, EC.s), eyeCenterPitch = EC.pitch ?? E.pitch;
  const P = def.portrait || {};
  const eyePortraitOffset = new THREE.Vector3(...(P.center || [0, 0.08, 0.2]));
  const eyePortraitOffsetCockpit = new THREE.Vector3(...(P.cockpit || [0.04, 0.06, 0.22]));
  const eyePortraitFov = P.fov ?? 92, eyePortraitPitch = P.pitch ?? -0.1;
  function viewEye(v, aspect = 1, out = new THREE.Vector3()) {
    const center = v === 'center';
    out.copy(center ? eyeCenter : eye);
    let pitch = center ? eyeCenterPitch : eyePitch, fov = null;
    const k = Math.min(1, Math.max(0, (1 - aspect) / 0.45));
    if (k > 0) {
      out.addScaledVector(center ? eyePortraitOffset : eyePortraitOffsetCockpit, k);
      fov = 80 + (eyePortraitFov - 80) * k;
      pitch += (eyePortraitPitch - pitch) * k;
    }
    return { eye: out, pitch, fov };
  }
  const dims = { ...def.dims, gearHeight: def.dims.gearHeight ?? CG.y };
  const frameFov = (distance, aspect = 16 / 9, fill = 0.35) =>
    Math.min(60, Math.max(4, 2 * Math.atan(dims.span / 2 / fill / Math.max(1, distance) / aspect) / D2R));
  const frameDistance = (fovDeg, aspect = 16 / 9, fill = 0.35) => dims.span / 2 / fill / (Math.tan((fovDeg * D2R) / 2) * aspect);

  const ctl = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0, brake: 0 };
  const cur = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0 };
  let rpm = 0, rpmKnown = false, view = 'chase', t = 0, lightLevel = opts.lightLevel ?? 0.35;
  let L = normalizeLivery(opts.livery);

  function setLivery(l) {
    L = { ...normalizeLivery({ ...l }), goldTaps: !!(l && l.goldTaps) };
    livery.draw(L);
    if (def.onLivery) def.onLivery(L, ext, fars, ctx);
  }
  setLivery({ ...L, goldTaps: opts.livery?.goldTaps });

  function setControls(c = {}) {
    for (const k of Object.keys(ctl)) if (typeof c[k] === 'number' && Number.isFinite(c[k])) ctl[k] = c[k];
  }
  function setView(v) {
    view = v === 'cockpit' || v === 'center' ? v : 'chase';
    if (cp) cp.setDetail(view !== 'chase');
    if (pilot) pilot.setHideBody(view === 'cockpit');
    if (glow) glow.visible = true;
  }
  setView(opts.view || 'chase');

  function updateInstruments(s = {}) {
    if (typeof s.rpm === 'number') { rpm = s.rpm; rpmKnown = true; }
    if (typeof s.airspeed === 'number') ctx.airspeed = s.airspeed;
    if (cp) cp.instruments.set(s);
  }

  const R = def.rpm || { idle: 600, max: 2100 };
  const glowCol = glow ? glow.geometry.attributes.color : null;
  function update(dt = 0.016) {
    dt = Math.min(0.1, Math.max(0, dt));
    t += dt;
    const k = 1 - Math.exp(-dt * 14);
    cur.aileron += (ctl.aileron - cur.aileron) * k;
    cur.elevator += (ctl.elevator - cur.elevator) * k;
    cur.rudder += (ctl.rudder - cur.rudder) * k;
    cur.throttle += (ctl.throttle - cur.throttle) * k;
    cur.flaps += (ctl.flaps - cur.flaps) * (1 - Math.exp(-dt * 1.2));
    def.animate(ext, cur, dt, ctx);
    if (def.stick) def.stick.move(stick, cur);

    const r = rpmKnown ? rpm : R.idle + cur.throttle * R.max;
    ctx.rpm = r;
    const omega = (r / 60) * Math.PI * 2;
    ext.propGroup.rotation.z -= omega * dt;
    const blur = THREE.MathUtils.smoothstep(r, 250, 1100);
    ext.propMesh.visible = blur < 0.98;
    mats.disc.opacity = blur;
    ext.disc.visible = blur > 0.01;
    ext.disc.rotation.z += dt * (0.6 + 0.25 * Math.sin(t * 0.37));
    for (const f of fars) {
      f.disc.visible = blur > 0.3;
      f.propMesh.visible = !f.disc.visible;
      f.propGroup.rotation.z = ext.propGroup.rotation.z;
    }

    const bph = t % 1.0, sph = t % 1.2;
    const beaconOn = bph < 0.07 || (bph > 0.16 && bph < 0.22);
    const strobeOn = sph < 0.04 || (sph > 0.1 && sph < 0.14);
    mats.beacon.color.setRGB(beaconOn ? 4 : 0.25, beaconOn ? 0.3 : 0.01, beaconOn ? 0.2 : 0.01);
    if (glowCol) {
      ext.lightPts.forEach((l, i) => {
        const on = l.kind === 'beacon' ? beaconOn : l.kind === 'strobe' ? strobeOn : true;
        const a = on ? (l.kind === 'nav' ? 0.25 + 0.75 * lightLevel : 1 + lightLevel) : 0;
        glowCol.setXYZ(i, l.col[0] * a, l.col[1] * a, l.col[2] * a);
      });
      glowCol.needsUpdate = true;
    }
    if (cp) cp.update(dt, cur, ctl, ctx);
    if (pilot) pilot.update(dt, cur, ctx);
  }

  let panelLight = opts.panelLight ?? null;
  function setLightLevel(kk) {
    lightLevel = Math.max(0, Math.min(1, kk));
    if (glow) glow.material.size = 0.3 + 0.5 * lightLevel;
    if (cp) cp.setNight(panelLight ?? THREE.MathUtils.smoothstep(lightLevel, 0.45, 0.9));
  }
  function setPanelLight(v) { panelLight = v == null ? null : Math.max(0, Math.min(1, +v)); setLightLevel(lightLevel); }
  function setPilot(p = {}) { if (pilot) pilot.setConfig(p); }

  function dispose() {
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of mats.all()) { if (m.map && !livery.owns(m.map)) m.map.dispose(); m.dispose(); }
    if (glow) { glow.material.map.dispose(); glow.material.dispose(); }
    if (proxyMat) proxyMat.dispose();
    livery.dispose();
    if (pilot) pilot.dispose();
    if (cp) cp.dispose();
    root.removeFromParent();
  }

  if (shadowProxy) {
    const proxy = near.getObjectByName('plane-shadow');
    near.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p; p = p.parent) if (p === proxy) return;
      if (!Object.getOwnPropertyDescriptor(o, 'castShadow')?.get) Object.defineProperty(o, 'castShadow', { get: () => false, set() {} });
    });
  }

  setLightLevel(lightLevel);
  update(0);
  return {
    root, cockpit: cp ? cockpit : null, eye, eyePitch, eyeCenter, eyeCenterPitch, eyePortraitOffset, eyePortraitOffsetCockpit, eyePortraitFov, eyePortraitPitch, viewEye,
    lod, lodDistance, lodDistance2, frameFov, frameDistance, dims, setLivery, setControls, setView, updateInstruments, update, dispose,
    setLightLevel, setPanelLight, setPilot, pilot: () => (pilot ? pilot.config : null),
    get view() { return view; }, quality, type: def.id, livery: () => ({ ...L }), _ext: ext, _cp: cp, _livery: livery, _pilot: pilot,
  };
}
