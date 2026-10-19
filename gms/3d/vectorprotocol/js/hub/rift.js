// D21 story beat (map 6+): a thin violet tear hanging in the night behind the skyline, green light leaking through.
// One additive quad far behind the towers, so their silhouettes cut across it.
import * as THREE from 'three';

export function createRift() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime, uOpen;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      // jagged centreline: a slow bend plus two octaves of kinks
      float line(float y, float s){ return 0.5 + 0.05 * sin(y * 4.1 + s) + (n1(y * 8.0 + s) - 0.5) * 0.05 + (n1(y * 29.0 + s * 3.0) - 0.5) * 0.018; }
      void main(){
        float y = vUv.y, taper = pow(max(0.0, 1.0 - pow(abs(y * 2.0 - 1.0), 1.8)), 1.6);
        float w = 0.075 * taper * uOpen * (0.9 + 0.1 * sin(uTime * 1.1 + y * 9.0));
        float d = abs(vUv.x - line(y, 1.7));
        float inside = smoothstep(w, w * 0.55, d);
        float rim = smoothstep(w * 1.25, w, d) * (1.0 - inside);
        float glow = exp(-max(0.0, d - w) / 0.035) * taper;
        // the other realm seen through the tear: slow green/violet churn
        float sw = n2(vec2(vUv.x * 18.0 + uTime * 0.1, y * 9.0 - uTime * 0.25)) * 0.6 + n2(vec2(vUv.x * 41.0, y * 23.0 + uTime * 0.4)) * 0.4;
        vec3 violet = vec3(0.55, 0.18, 1.0), green = vec3(0.2, 1.0, 0.45);
        vec3 c = mix(violet * 0.25, green * 0.7, smoothstep(0.4, 0.85, sw)) * inside * 0.55 + violet * rim * 0.9 + violet * glow * 0.22;
        float a = clamp(inside + rim + glow * 0.5, 0.0, 1.0);
        gl_FragColor = vec4(c * uOpen, a * uOpen); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 95), mat);
  // treated like a skybox element: kept at a fixed direction from the camera (upper right of the frame) so it frames
  // the same on any aspect, drawn over the distant skyline (it hangs in front of the city haze, top-right, clear of every building label)
  const dir = new THREE.Vector3(), ndc = new THREE.Vector3();
  m.userData.place = (camera, nx = 0.56, ny = 0.8, dist = 420) => {
    ndc.set(nx, ny, 0.5).unproject(camera); dir.copy(ndc).sub(camera.position).normalize();
    m.position.copy(camera.position).addScaledVector(dir, dist);
    m.quaternion.copy(camera.quaternion); m.rotateZ(-0.22);
  };
  m.renderOrder = -0.5;
  m.frustumCulled = false;
  m.name = 'hub-rift';
  m.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return m;
}
