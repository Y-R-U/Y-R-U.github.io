import * as THREE from 'three';

// Default night-neon PMREM: a dark room with cyan/blue ceiling strips, magenta/purple accents and a warm rim,
// so metal and glossy plating always have something bright to catch. Scenes may build their own instead.
export function buildNeonEnv(renderer, size = 256, { warm = 0.6 } = {}) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x05070f);
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: 0x070b18, side: THREE.BackSide }));
  room.position.y = 6; s.add(room);
  const strip = (w, h, d, color, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
    m.position.set(x, y, z); s.add(m); return m;
  };
  for (let i = -3; i <= 3; i++) strip(0.5, 0.2, 30, 0x4fc8ff, 5, i * 4, 15.5, 0);
  strip(36, 4, 0.3, 0x2b6bff, 2.5, 0, 8, -19.5);
  strip(36, 1, 0.3, 0x9a4dff, 4, 0, 3, 19.5);
  strip(0.3, 6, 30, 0xff3fb4, 1.6, -19.5, 6, 0);
  strip(0.3, 6, 30, 0x37e6ff, 2.2, 19.5, 6, 0);
  strip(10, 3, 0.3, 0xffa040, 3 * warm, 8, 4, 19.4);
  strip(40, 0.1, 40, 0x0a1430, 1, 0, -3.8, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 100, { size });
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt.texture;
}

// Forest-ruins PMREM (fantasy arena, D21): warm misty sky dome, a low sun glow, green canopy walls and a mossy ground,
// so metal mechs reflect daylight greens/golds instead of neon. Caller owns (disposes) the texture.
export function buildForestEnv(renderer, size = 128) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x58664a);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      float y = vD.y;
      vec3 sky = mix(vec3(0.95, 0.9, 0.7), vec3(0.45, 0.6, 0.62), smoothstep(0.1, 0.9, y));
      vec3 canopy = vec3(0.12, 0.2, 0.08);
      vec3 ground = vec3(0.14, 0.15, 0.09);
      vec3 c = mix(canopy, sky, smoothstep(0.05, 0.55, y));
      c = mix(ground, c, smoothstep(-0.2, 0.02, y));
      float sun = pow(max(0.0, dot(vD, normalize(vec3(-0.5, 0.65, 0.55)))), 24.0);
      c += vec3(3.0, 2.4, 1.4) * sun;
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  s.add(dome);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 100, { size });
  pm.dispose();
  dome.geometry.dispose(); dome.material.dispose();
  return rt.texture;
}
