import * as THREE from 'three';

// Animated glowing floor ring (interactable pads, kiosk halo, tap-to-move marker).
export function createPadRing(time, radius, color = [0.4, 0.8, 1.0], busy = false) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Vector3(...color) }, uBusy: { value: busy ? 1 : 0 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBusy, uAlpha; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float r = length(vUv);
        float a = atan(vUv.y, vUv.x);
        float ring = smoothstep(0.035, 0.0, abs(r - 0.95)) + smoothstep(0.02, 0.0, abs(r - 0.78)) * 0.6;
        float dash = step(0.5, fract(a * 6.0 / 3.14159 + uTime * 0.25)) * smoothstep(0.03, 0.0, abs(r - 0.86));
        float pulse = smoothstep(0.06, 0.0, abs(r - fract(uTime * 0.45))) * (1.0 - r) * uBusy;
        float fill = smoothstep(1.0, 0.0, r) * 0.12 * uBusy;
        float v = (ring + dash * 0.8 + pulse * 1.5 + fill) * step(r, 1.0);
        gl_FragColor = vec4(uColor * v * 3.0 * uAlpha, 0.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const g = new THREE.PlaneGeometry(radius * 2, radius * 2);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 2;
  return mesh;
}

export function createJetMaterial(time) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: /* glsl */`uniform float uTime; varying vec2 vUv;
      void main(){ float s = 0.55 + 0.45 * sin(vUv.x * 60.0 - uTime * 14.0);
        float a = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * 0.5 * s;
        gl_FragColor = vec4(vec3(1.0, 1.0, 1.0) * 1.6 * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Drifting sunlit motes around a moving centre (the player).
export function createMotes(time, pxScale, count = 220) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 12; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uCenter: { value: new THREE.Vector3() }, uScale: pxScale },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uScale; uniform vec3 uCenter; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.2 + seed * 30.0) * 2.0 + uTime * 0.3;
        p.y += sin(uTime * 0.3 + seed * 11.0) * 0.8;
        p.z += cos(uTime * 0.17 + seed * 21.0) * 2.0;
        p.xz = mod(p.xz - uCenter.xz + 30.0, 60.0) - 30.0 + uCenter.xz;
        vA = (0.5 + 0.5 * sin(uTime * 2.0 + seed * 50.0)) * 0.55;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.5, (0.035 + seed * 0.05) * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * 2.0 * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// Soft ground shadows of unseen traffic passing overhead (one instanced draw, multiply blend).
export function createSkyShadows(time, count = 5, area = 90) {
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`varying vec2 vUv; void main(){ float d = length(vUv * vec2(1.0, 1.9)); float a = smoothstep(1.0, 0.25, d) * 0.28; gl_FragColor = vec4(vec3(1.0 - a), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
  });
  const im = new THREE.InstancedMesh(g, m, count);
  im.frustumCulled = false; im.renderOrder = 1;
  const cars = [...Array(count)].map((_, i) => ({ off: (i / count - 0.5) * area * 0.8 + (Math.random() - 0.5) * 8, t: Math.random(), sp: 0.03 + Math.random() * 0.025, s: 3 + Math.random() * 2 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const dir = new THREE.Vector3(Math.sin(0.6), 0, Math.cos(0.6)), side = new THREE.Vector3(Math.cos(0.6), 0, -Math.sin(0.6));
  return {
    mesh: im,
    update(dt, center) {
      cars.forEach((c, i) => {
        c.t = (c.t + dt * c.sp) % 1;
        p.copy(center).addScaledVector(dir, (c.t - 0.5) * area).addScaledVector(side, c.off); p.y = 0.03;
        m4.compose(p, q, sc.set(c.s * 0.9, 1, c.s * 2.2));
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
    },
  };
}
