import * as THREE from 'three';

// Outside the ark: black sky, a star field with a milky band, a hard white sun and Verdance (the real planet: oceans,
// green continents, cloud swirls, a blue atmosphere rim). One shader for the sky dome and for the district's PMREM.
const spaceGLSL = /* glsl */`
uniform vec3 uSun, uPlanet;
uniform float uPR, uEnv, uTime;
varying vec3 vDir;
float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.07 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return s; }
float stars(vec3 d, float S, float th){
  vec3 p = d * S, c = floor(p);
  float r = h3(c);
  if (r < th) return 0.0;
  vec3 q = c + 0.2 + 0.6 * vec3(h3(c + 1.7), h3(c + 5.1), h3(c + 9.3));
  float dd = length(p - q);
  float w = fwidth(p.x) * 1.2 + 0.02;
  return (1.0 - smoothstep(0.0, w * 1.6, dd)) * (0.35 + 1.6 * pow((r - th) / (1.0 - th), 2.0));
}
vec3 spaceColor(vec3 d){
  vec3 col = vec3(0.004, 0.005, 0.01);
  // milky band along a tilted great circle
  vec3 bn = normalize(vec3(0.35, 0.8, -0.48));
  float bd = dot(d, bn);
  float band = exp(-bd * bd * 22.0) * (0.55 + 0.45 * fb3(d * 5.0)) * smoothstep(0.25, 0.75, fb3(d * 2.3 + 4.0));
  col += vec3(0.05, 0.05, 0.075) * band * (0.6 + 0.4 * uEnv);
  col += vec3(0.02, 0.01, 0.03) * smoothstep(0.55, 0.9, fb3(d * 3.1 + 11.0)) * (1.0 - abs(bd));
  float st = uEnv > 0.5 ? 0.0 : stars(d, 220.0, 0.985) + stars(d, 90.0, 0.992) * 1.6 + stars(d, 420.0, 0.99) * band * 2.0;
  col += vec3(0.95, 0.97, 1.0) * st;
  // the sun: a hard white disc with a tight glare (no atmosphere to spread it)
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.96, 0.9) * (pow(sd, 900.0) * 3.0 + pow(sd, 80.0) * 0.25 + pow(sd, 12.0) * 0.04);
  col += vec3(1.0, 0.98, 0.94) * smoothstep(0.99985, 0.99995, sd) * 60.0;
  // Verdance
  float pc = dot(d, uPlanet), ang = acos(clamp(pc, -1.0, 1.0));
  if (ang < uPR * 1.12) {
    vec3 t = normalize(cross(uPlanet, vec3(0.0, 1.0, 0.0)));
    vec3 b = cross(t, uPlanet);
    vec2 q = vec2(dot(d - uPlanet * pc, t), dot(d - uPlanet * pc, b)) / sin(uPR);
    float r2 = dot(q, q);
    vec3 halo = vec3(0.25, 0.55, 1.0);
    if (r2 < 1.0) {
      vec3 n = normalize(q.x * t + q.y * b - sqrt(1.0 - r2) * uPlanet);
      // body-fixed frame so the continents turn slowly
      float rot = uTime * 0.004;
      vec3 m = vec3(n.x * cos(rot) - n.z * sin(rot), n.y, n.x * sin(rot) + n.z * cos(rot));
      float land = fb3(m * 2.6 + 7.0) + 0.18 * fb3(m * 9.0);
      float lm = smoothstep(0.54, 0.575, land);
      float lat = abs(m.y);
      vec3 sea = mix(vec3(0.015, 0.06, 0.16), vec3(0.03, 0.16, 0.28), smoothstep(0.54, 0.47, land));
      vec3 green = mix(vec3(0.05, 0.2, 0.06), vec3(0.16, 0.3, 0.1), fb3(m * 14.0));
      green = mix(green, vec3(0.42, 0.36, 0.22), smoothstep(0.66, 0.78, land) * 0.7);
      vec3 surf = mix(sea, green, lm);
      surf = mix(surf, vec3(0.85, 0.9, 0.95), smoothstep(0.78, 0.9, lat + 0.06 * fb3(m * 6.0)));
      float cl = fb3(m * 4.0 + vec3(0.0, 0.0, uTime * 0.002) + fb3(m * 8.0) * 0.8);
      float cloud = smoothstep(0.5, 0.72, cl);
      surf = mix(surf, vec3(0.92, 0.94, 0.97), cloud * 0.85);
      float lit = dot(n, uSun);
      float day = smoothstep(-0.08, 0.25, lit);
      vec3 pcol = surf * (0.02 + 1.25 * day * max(lit + 0.15, 0.0));
      // sun glint on the oceans
      vec3 hv = normalize(uSun - d);
      pcol += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, hv), 0.0), 60.0) * (1.0 - lm) * (1.0 - cloud) * day * 0.8;
      float rim = pow(1.0 - sqrt(max(1.0 - r2, 0.0)), 2.2);
      pcol += halo * rim * (0.08 + 0.9 * smoothstep(-0.3, 0.4, lit));
      col = mix(col, pcol, smoothstep(1.0, 0.985, r2));
    }
    float out = (ang - uPR) / (uPR * 0.12);
    if (out > 0.0) {
      vec3 sdir = normalize(d - uPlanet * pc);
      float litE = smoothstep(-0.4, 0.5, dot(sdir, uSun));
      col += halo * pow(1.0 - clamp(out, 0.0, 1.0), 3.0) * 0.5 * litE;
    }
  }
  // in the env map: the hull as a dark plated floor below the horizon, so chrome and gold reflect structure
  if (uEnv > 0.5 && d.y < 0.0) {
    vec2 p = d.xz / max(-d.y, 0.02) * 3.0;
    vec2 f = abs(fract(p / 4.0) - 0.5);
    float seam = smoothstep(0.47, 0.495, max(f.x, f.y));
    vec3 hull = mix(vec3(0.07, 0.075, 0.085), vec3(0.14, 0.14, 0.15), h3(vec3(floor(p / 4.0), 1.0)));
    hull *= 1.0 - 0.6 * seam;
    col = mix(hull, col, smoothstep(-0.02, 0.0, d.y));
  }
  return col;
}
`;

export function createSpaceMaterial({ sun, planet, pr = 0.5, env = false, time = null } = {}) {
  return new THREE.ShaderMaterial({
    name: 'SpaceSky',
    uniforms: { uSun: { value: sun.clone().normalize() }, uPlanet: { value: planet.clone().normalize() }, uPR: { value: pr }, uEnv: { value: env ? 1 : 0 }, uTime: time || { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize( ( modelMatrix * vec4( position, 0.0 ) ).xyz );
        gl_Position = ( projectionMatrix * viewMatrix * vec4( ( modelMatrix * vec4( position, 1.0 ) ).xyz, 1.0 ) ).xyww;
      }`,
    fragmentShader: spaceGLSL + /* glsl */`void main() { gl_FragColor = vec4( spaceColor( normalize( vDir ) ), 1.0 ); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
}

// Sky dome for the district group (follows the camera, drawn at the far plane).
export function addSpaceSky(ctx, o) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), createSpaceMaterial({ ...o, time: ctx.time }));
  mesh.frustumCulled = false; mesh.renderOrder = -100; mesh.name = 'spaceSky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  ctx.scene.add(mesh);
  return mesh;
}

// PMREM of the same sky (stars off, hull floor below), plus a few lit cards so metal has something bright to catch.
export function spaceEnv(renderer, tier, o, cards = []) {
  const s = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.SphereGeometry(80, 64, 32), createSpaceMaterial({ ...o, env: true }));
  m.material.depthTest = false; m.material.depthWrite = false; m.renderOrder = -10;
  s.add(m);
  for (const [c, x, y, z, w, h, ry] of cards) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.rotation.y = ry; s.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 300, { size: tier.envSize || 256 });
  pm.dispose();
  s.traverse((q) => { q.geometry?.dispose(); q.material?.dispose(); });
  rt.texture.userData.rt = rt;
  return rt.texture;
}
