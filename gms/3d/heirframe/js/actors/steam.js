import * as THREE from '../../../../lib/three/0.180.0/three.module.js';

// World-space steam puffs from a robot's vent sockets. One Points draw; lazily parented to the robot's parent
// (the scene) so puffs hang in the air while the robot moves on. emit(k) bursts; a thin wisp runs on its own.
export function createSteam(root, sources, { max = 120, wisp = 0.35 } = {}) {
  const pos = new Float32Array(max * 3), life = new Float32Array(max), size = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float aLife, aSize; uniform float uScale; varying float vL;
      void main() {
        vL = aLife;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_PointSize = aLife > 0.0 ? aSize * ( 1.0 + ( 1.0 - aLife ) * 1.6 ) * uScale / max( -mv.z, 0.5 ) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vL;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length( q ) * 2.0;
        float a = smoothstep( 1.0, 0.2, d ) * smoothstep( 0.0, 0.25, vL ) * min( 1.0, ( 1.0 - vL ) * 6.0 ) * 0.55;
        gl_FragColor = vec4( vec3( 0.93, 0.95, 0.97 ) * ( 0.85 + 0.25 * ( 0.5 - q.y ) ), a );
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.name = 'steam'; pts.renderOrder = 3;
  const _s = new THREE.Vector2();
  pts.onBeforeRender = (r, s, cam) => { r.getDrawingBufferSize(_s); mat.uniforms.uScale.value = _s.y * cam.projectionMatrix.elements[5] * 0.5; };
  const P = Array.from({ length: max }, () => ({ t: 0, T: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.2 }));
  let head = 0, wt = 0;
  const w = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion();
  const spawn = (src, n, speed, sz) => {
    src.getWorldPosition(w);
    src.getWorldQuaternion(q); up.set(0, 1, 0).applyQuaternion(q);
    for (let i = 0; i < n; i++) {
      const p = P[head]; head = (head + 1) % max;
      p.T = p.t = 0.9 + Math.random() * 0.9;
      p.p.copy(w);
      p.v.set((Math.random() - 0.5) * 1.4, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 1.4).addScaledVector(up, speed * (0.6 + Math.random() * 0.6));
      p.s = sz * (0.7 + Math.random() * 0.6);
    }
  };
  return {
    points: pts,
    emit(k = 1) { for (const s of sources) spawn(s, Math.round(8 * k), 0.5 + 0.35 * k, 0.24); },
    update(dt, active = true) {
      if (!pts.parent && root.parent) root.parent.add(pts);
      if (active && wisp > 0 && (wt -= dt) <= 0) { wt = wisp; spawn(sources[sources.length - 1], 1, 0.6, 0.18); }
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.t > 0) {
          p.t -= dt;
          p.v.multiplyScalar(Math.exp(-dt * 2.2)); p.v.y += 0.45 * dt;
          p.p.addScaledVector(p.v, dt);
        }
        pos[i * 3] = p.p.x; pos[i * 3 + 1] = p.p.y; pos[i * 3 + 2] = p.p.z;
        life[i] = p.t > 0 ? p.t / p.T : 0; size[i] = p.s;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aLife.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
    },
    dispose() { pts.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
