import * as THREE from 'three';
import { CG, EYE, toLocal } from './spec.js';
import { createLivery, normalizeLivery } from './livery.js';
import { createMaterials, glowTexture, discTexture } from './materials.js';
import { buildExterior } from './exterior.js';
import { buildCockpit } from './cockpit.js';
import { createPilot } from './pilot.js';
import { srgb } from './geom.js';

const D2R = Math.PI / 180;
const MAX = { aileron: 20 * D2R, elevUp: 28 * D2R, elevDown: 23 * D2R, rudder: 22 * D2R, flaps: 30 * D2R };

export async function createPlane(opts = {}) {
  const quality = opts.quality === 'low' ? 'low' : 'high';
  const high = quality === 'high';
  const wantCockpit = opts.cockpit !== false;
  // real window holes need an interior behind them; cockpit-less (AI) planes get painted glass
  const holes = wantCockpit;

  const livery = createLivery({ quality, holes });
  const mats = createMaterials({ quality, livery, holes });
  const ext = buildExterior({ quality, mats });

  const root = new THREE.Group();
  root.name = 'plane-c172';
  const airframe = new THREE.Group();
  airframe.position.set(0, -CG.y, -CG.s);
  airframe.add(ext.group);
  root.add(airframe);

  let cockpit = null, cp = null;
  if (wantCockpit) {
    cp = buildCockpit({ quality, mats });
    cockpit = cp.group;
    cockpit.position.set(0, -CG.y, -CG.s);
    root.add(cockpit);
  }
  let pilot = null;
  if (cp && opts.pilot !== false) {
    pilot = createPilot({ quality, opts: typeof opts.pilot === 'object' ? opts.pilot : {} });
    cockpit.add(pilot.mesh);
  }

  // light glow sprites
  let glow = null;
  if (high) {
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

  const eye = new THREE.Vector3(...toLocal(EYE.x, EYE.y, EYE.s));
  const eyePitch = EYE.pitch;
  const eyeCenter = new THREE.Vector3(...toLocal(0, EYE.y, EYE.s));
  const eyeCenterPitch = EYE.pitch;
  const dims = { length: 8.28, span: 11.0, height: 2.72, gearHeight: CG.y };

  const ctl = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0, brake: 0 };
  const cur = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0 };
  let rpm = 0, rpmKnown = false, view = 'chase', t = 0, lightLevel = opts.lightLevel ?? 0.35;
  let L = normalizeLivery(opts.livery);

  const spinCol = ext.spinnerMesh.geometry.attributes.color;
  function setLivery(l) {
    L = normalizeLivery({ ...l });
    livery.draw(L);
    const c = srgb(L.accent);
    for (let i = 0; i < spinCol.count; i++) spinCol.setXYZ(i, c[0], c[1], c[2]);
    spinCol.needsUpdate = true;
  }
  setLivery(L);

  function setControls(c = {}) {
    for (const k of Object.keys(ctl)) if (typeof c[k] === 'number' && Number.isFinite(c[k])) ctl[k] = c[k];
  }

  function setView(v) {
    view = v === 'cockpit' || v === 'center' ? v : 'chase';
    const inside = view !== 'chase';
    if (cp) cp.setDetail(inside);
    if (pilot) pilot.setHideBody(view === 'cockpit');
    ext.meshes.glass.visible = holes;
    if (glow) glow.visible = true;
  }
  setView(opts.view || 'chase');

  function updateInstruments(s = {}) {
    if (typeof s.rpm === 'number') { rpm = s.rpm; rpmKnown = true; }
    if (cp) cp.instruments.set(s);
  }

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
    const h = ext.hinges;
    h.ailR.rotation.x = -cur.aileron * MAX.aileron;
    h.ailL.rotation.x = cur.aileron * MAX.aileron;
    h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
    h.rudder.rotation.x = cur.rudder * MAX.rudder;
    // C172 flaps run aft on curved tracks (Fowler motion) while they rotate down
    const fl = Math.max(0, cur.flaps), aft = 0.12 * Math.min(1, fl * 1.5) ** 0.85, drop = 0.03 * fl;
    for (const f of [h.flapR, h.flapL]) { f.rotation.x = fl * MAX.flaps; f.position.z = aft; f.position.y = -drop; }

    const r = rpmKnown ? rpm : 600 + cur.throttle * 2100;
    const omega = (r / 60) * Math.PI * 2;
    ext.propGroup.rotation.z -= omega * dt;
    const blur = THREE.MathUtils.smoothstep(r, 250, 1100);
    ext.propMesh.visible = blur < 0.98;
    mats.disc.opacity = blur;
    ext.disc.visible = blur > 0.01;
    // a slow stroboscopic drift of the blade bands, like a camera/eye beat against the blade rate
    ext.disc.rotation.z += dt * (0.6 + 0.25 * Math.sin(t * 0.37));

    // beacon: double flash ~1 Hz; strobes: double flash every 1.2 s
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

    if (cp) cp.update(dt, cur, ctl);
    if (pilot) pilot.update(dt, cur, cp.yokes[0]);
  }

  // 0 = bright day (small glows) .. 1 = night (full halos)
  let panelLight = opts.panelLight ?? null;
  function setLightLevel(k) {
    lightLevel = Math.max(0, Math.min(1, k));
    if (glow) glow.material.size = 0.3 + 0.5 * lightLevel;
    if (cp) cp.setNight(panelLight ?? THREE.MathUtils.smoothstep(lightLevel, 0.45, 0.9));
  }
  // null = follow setLightLevel; 0..1 forces the panel backlight
  function setPanelLight(v) { panelLight = v == null ? null : Math.max(0, Math.min(1, +v)); setLightLevel(lightLevel); }
  function setPilot(p = {}) { if (pilot) pilot.setConfig(p); }

  function dispose() {
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of mats.all()) { if (m.map && m.map !== livery.texture) m.map.dispose(); m.dispose(); }
    if (glow) { glow.material.map.dispose(); glow.material.dispose(); }
    livery.dispose();
    if (pilot) pilot.dispose();
    if (cp) cp.dispose();
    root.removeFromParent();
  }

  setLightLevel(lightLevel);
  update(0);
  return {
    root, cockpit, eye, eyePitch, eyeCenter, eyeCenterPitch, dims, setLivery, setControls, setView, updateInstruments, update, dispose,
    setLightLevel, setPanelLight, setPilot, pilot: () => (pilot ? pilot.config : null),
    get view() { return view; }, quality, livery: () => ({ ...L }), _ext: ext, _cp: cp, _livery: livery, _pilot: pilot,
  };
}
