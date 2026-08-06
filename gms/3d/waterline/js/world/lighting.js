// Exterior sun / ambient / fog / time of day — C1 ONLY.
// C2 must not import or edit this file; interior lamps live in bridgeLights.js.
//
// The sky dome hangs off this group and is pumped from here: main.js builds the sky but only
// hands `lighting` and `ocean` to app.add(), and main.js is frozen.

import * as THREE from 'three';
import { GRADES, onGrade } from './sky.js';

export function buildLighting(quality, sky) {
  const object3D = new THREE.Group();
  object3D.name = 'lighting';
  if (sky) object3D.add(sky.object3D);

  const sun = new THREE.DirectionalLight(0xffe3bd, 3.2);
  sun.castShadow = true;
  const m = quality.get('shadowMap') ?? 1024;
  sun.shadow.mapSize.set(m, m);
  sun.shadow.bias = -0.0008;
  object3D.add(sun, sun.target);

  const ambient = new THREE.HemisphereLight(0x86b0d6, 0x2c3d4a, 1.4);
  object3D.add(ambient);

  const fog = new THREE.Fog(0x6f8ea8, 300, 1400);
  // Any quality knob that touches the sky re-fires the grade listeners, so a scenario that set fog
  // and then set a sky knob silently got the grade's fog back. Survives applyGrade; null = follow it.
  let fogOverride = null;

  const dir = sky ? sky.sunDir : new THREE.Vector3(-0.5, 0.6, 0.4).normalize();
  let extent = 140;
  let camera = null;
  let radius = extent;

  const centre = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const ALT = new THREE.Vector3(0, 0, 1);

  // The box used to be half-extent `extent` centred on the world origin, so anything staged
  // further out than `extent` got no shadow and no warning (D20). It now wraps the slice of the
  // camera frustum from the near plane to `extent * 2`, which is what `extent` means from here on:
  // shadow reach ahead of the lens, not half a box around (0,0,0).
  //
  // The smallest sphere round a right frustum of depth F with half-sizes a,b at the far plane has
  // its centre d = (F² + a² + b²) / 2F along the axis, and r works out equal to d — the apex lands
  // on the sphere. Widen past a² + b² > F² and the far rect alone bounds it.
  const place = () => {
    if (!camera) {
      centre.set(0, 0, 0);
      radius = extent;
    } else {
      const F = extent * 2;
      const a = Math.tan(camera.fov * Math.PI / 360) * F;
      const b = a * camera.aspect;
      let d;
      if (a * a + b * b > F * F) { d = F; radius = Math.hypot(a, b); }
      else { d = (F * F + a * a + b * b) / (2 * F); radius = d; }
      // The minimal sphere puts the lens exactly on its surface, which drops anything beside or
      // behind the camera — the bridge interior is the case that matters, and its sun shadows are
      // 11.8% of that frame. Pull the centre back and grow to match so the box keeps a real margin
      // around the lens.
      const m = Math.min(radius * 0.2, 40);
      radius += m;
      camera.getWorldDirection(fwd);
      centre.copy(camera.getWorldPosition(right)).addScaledVector(fwd, d - m);
    }

    // Snap the centre to the shadow map's own texel grid, or a moving camera crawls the shadow
    // edges across every static surface.
    right.crossVectors(dir, Math.abs(dir.y) > 0.99 ? ALT : UP).normalize();
    up.crossVectors(right, dir).normalize();
    const texel = (2 * radius) / (sun.shadow.mapSize.x || 1024);
    const u = Math.round(centre.dot(right) / texel) * texel;
    const w = Math.round(centre.dot(up) / texel) * texel;
    // the depth axis has to be snapped too: it does not shift the map laterally, but sliding the
    // light along it changes every depth sample against a fixed bias, and that alone moved 2.17%
    // of a static bridge frame on a 0.06 m camera nudge
    const n = Math.round(centre.dot(dir) / texel) * texel;
    centre.copy(right).multiplyScalar(u).addScaledVector(up, w).addScaledVector(dir, n);

    sun.target.position.copy(centre);
    sun.target.updateMatrixWorld();
    sun.position.copy(centre).addScaledVector(dir, radius * 3);

    const c = sun.shadow.camera;
    c.left = c.bottom = -radius; c.right = c.top = radius;
    c.near = 1;
    c.far = radius * 6;
    c.updateProjectionMatrix();
  };

  let lastGrade = null;
  const paint = g => {
    lastGrade = g;
    sun.color.set(g.sun.colour);
    sun.intensity = g.sun.intensity;
    ambient.color.set(g.amb.sky);
    ambient.groundColor.set(g.amb.ground);
    ambient.intensity = g.amb.intensity;
    fog.color.set(g.fog.colour);
    fog.near = fogOverride ? fogOverride[0] : g.fog.near;
    fog.far = fogOverride ? fogOverride[1] : g.fog.far;
    place();
  };
  onGrade(paint);

  const lighting = {
    object3D, sun, ambient, fog,
    get sky() { return sky; },

    setGrade(name) { sky?.setGrade(name); if (!sky) paint(GRADES[name]); return lighting; },

    setFog(near, far) {
      fogOverride = near == null ? null : [near, far];
      if (fogOverride) { fog.near = near; fog.far = far; }
      else if (lastGrade) paint(lastGrade);
      return lighting;
    },
    setTime(h) { sky?.setTime(h); return lighting; },

    update(dt, app) {
      camera = app.camera;
      place();
      sky?.update(dt, app);
    },

    // How far ahead of the camera shadows reach, in metres: the box spans near plane to 2 × r.
    setShadowExtent(r) {
      extent = r;
      place();
      return lighting;
    },

    // what actually got fitted, for capture-time probes
    shadowBox() {
      return { extent, radius, centre: centre.toArray(), sun: sun.position.toArray() };
    },

    registerKnobs(q) {
      q.register({ key: 'shadowDist', label: 'Shadow distance', type: 'range', min: 40, max: 400, step: 10, group: 'Lighting' },
        r => lighting.setShadowExtent(r / 2));
      sky?.registerKnobs(q);
    },
  };

  return lighting;
}
