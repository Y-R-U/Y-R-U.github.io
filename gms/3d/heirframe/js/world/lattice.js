import * as THREE from 'three';

// The Firmament seen from behind (A4-M5, "the sky is a screen"): hexagonal sky panels, back-lit, showing the city's
// daylight sky mirrored and bleeding through their seams; a few cells dead or flickering. Mounted in the Spine's north
// lattice with the "sun" (a huge sodium lamp in a gantry ring) and the "moon" (a flat feed screen with scanlines).
// Three draws.
export function firmamentLattice(ctx, { x0 = -40, x1 = 40, y0 = 12, y1 = 34, z = -99.9 } = {}) {
  const w = x1 - x0, h = y1 - y0;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } }]),
    vertexShader: /* glsl */`varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
      #include <fog_pars_fragment>
      float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // hex cell: returns (local offset, cell id)
      vec4 hex(vec2 p){ vec2 r = vec2(1.0, 1.732); vec2 hr = r * 0.5; vec2 a = mod(p, r) - hr, b = mod(p - hr, r) - hr;
        vec2 g = dot(a, a) < dot(b, b) ? a : b; return vec4(g, p - g); }
      void main(){
        vec2 P = vUv * uSize / 3.2;
        vec4 hc = hex(P);
        vec2 ag = abs(hc.xy);
        float edge = 0.5 - max(dot(ag, normalize(vec2(1.0, 1.732))), ag.x);
        float seam = smoothstep(0.02, 0.07, edge);
        float id = h1(hc.zw);
        // the sky as the city sees it, from the back: a blue gradient with a warm band low down, mirrored text-free
        vec3 sky = mix(vec3(0.95, 0.82, 0.6), vec3(0.25, 0.5, 1.0), smoothstep(0.0, 0.8, vUv.y));
        float lit = step(0.06, id) * (0.75 + 0.25 * sin(uTime * (0.4 + id * 2.0) + id * 30.0));
        if (id > 0.93) lit *= step(0.5, fract(uTime * (3.0 + id * 5.0)));   // flickering cells
        vec3 c = sky * lit * (0.55 + 0.45 * smoothstep(0.5, 0.0, edge)) * (0.6 + 0.4 * h1(hc.zw + 3.0)) * 0.95;
        c = mix(vec3(0.02, 0.025, 0.03), c, seam);
        c += vec3(0.4, 0.75, 1.3) * (1.0 - smoothstep(0.0, 0.05, edge)) * lit * 0.6;   // light leaking at the seams
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  }));
  panel.material.uniforms.uTime = ctx.time;
  panel.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  panel.name = 'firmament';
  ctx.scene.add(panel);

  // the sun: a sodium lamp the size of a house, in a gantry ring
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 3.6, 2.0), fog: false }));
  lamp.position.set(x0 + w * 0.28, y0 + h * 0.62, z + 0.6);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.55, 10, 40), new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.9, roughness: 0.4 }));
  ring.position.copy(lamp.position); ring.position.z += 0.2;
  // the moon: a flat feed of the planet, scanlines and all
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.time },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform float uTime; varying vec2 vUv;
      void main(){ vec2 q = vUv * 2.0 - 1.0; float r = length(q);
        vec3 c = vec3(0.02, 0.03, 0.05);
        if (r < 0.8) { float lit = smoothstep(-0.3, 0.6, dot(normalize(vec3(q, sqrt(max(0.0, 0.64 - r * r)))), normalize(vec3(-0.5, 0.4, 0.6))));
          c = mix(vec3(0.62, 0.6, 0.62), vec3(1.0, 0.94, 0.86), fract(sin(q.y * 23.0) * 3.0) * 0.4) * (0.1 + lit); }
        c *= 0.8 + 0.2 * step(0.5, fract(vUv.y * 90.0 - uTime * 2.0));
        c += vec3(0.0, 0.12, 0.2) * step(0.97, fract(vUv.y * 3.0 - uTime * 0.3));
        gl_FragColor = vec4(c * 1.4, 1.0); }`,
  }));
  moon.position.set(x0 + w * 0.76, y0 + h * 0.58, z + 0.5);
  ctx.scene.add(lamp, ring, moon);
  return { panel, lamp, moon };
}
