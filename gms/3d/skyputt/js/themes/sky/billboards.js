// Sky Isles theme — one-draw-call camera-facing billboards (clouds, glows, sparkles, mist).
import * as THREE from 'three';

/**
 * items: [{ p: Vector3|[x,y,z], w, h, uv?: [u0,v0,u1,v1], color?: [r,g,b], a?: number,
 *           phase?: number, drift?: number }]
 * opts: { map, additive, mode: 'static'|'sparkle'|'flicker'|'mist', fog (THREE.Fog), uniforms (shared uTime) }
 */
export function makeBillboards(items, opts) {
  const n = items.length;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), size = new Float32Array(n * 8);
  const uv = new Float32Array(n * 16), col = new Float32Array(n * 16), ph = new Float32Array(n * 8);
  const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  items.forEach((it, i) => {
    const p = Array.isArray(it.p) ? it.p : [it.p.x, it.p.y, it.p.z];
    const r = it.uv || [0, 0, 1, 1];
    const c = it.color || [1, 1, 1];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set(p, v * 3);
      corner.set(C[k], v * 2);
      size[v * 2] = it.w; size[v * 2 + 1] = it.h ?? it.w;
      uv.set(r, v * 4);
      col.set([c[0], c[1], c[2], it.a ?? 1], v * 4);
      ph[v * 2] = it.phase ?? (i * 0.6180339) % 1; ph[v * 2 + 1] = it.drift ?? 0;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
  g.setAttribute('aUv', new THREE.BufferAttribute(uv, 4));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius += 60;

  const mode = { static: 0, sparkle: 1, flicker: 2, mist: 3 }[opts.mode || 'static'];
  const fog = opts.fog;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: opts.map },
      uTime: opts.uniforms?.uTime || { value: 0 },
      fogColor: { value: fog ? fog.color : new THREE.Color(0xffffff) },
      fogNear: { value: fog ? fog.near : 1e6 },
      fogFar: { value: fog ? fog.far : 2e6 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec2 aSize; attribute vec4 aUv; attribute vec4 aColor; attribute vec2 aPhase;
      uniform float uTime; uniform float fogNear; uniform float fogFar;
      varying vec2 vUv; varying vec4 vCol; varying float vFog;
      void main(){
        vec3 c = position;
        float a = aColor.a;
        vec2 sz = aSize;
        #if MODE == 1
          float t = uTime * 0.35 + aPhase.x * 40.0;
          c += vec3(sin(t * 1.3), sin(t * 1.7) * 0.5, cos(t * 1.1)) * aPhase.y;
          a *= 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (2.0 + aPhase.x * 3.0) + aPhase.x * 60.0), 3.0);
        #elif MODE == 2
          a *= 0.82 + 0.18 * sin(uTime * 9.0 + aPhase.x * 30.0) * sin(uTime * 5.3 + aPhase.x * 11.0);
        #elif MODE == 3
          float m = fract(uTime * 0.18 + aPhase.x);
          c.y -= m * aPhase.y;
          sz *= 0.6 + m * 0.9;
          a *= sin(m * 3.14159);
        #endif
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        mv.xy += aCorner * sz;
        gl_Position = projectionMatrix * mv;
        vUv = mix(aUv.xy, aUv.zw, aCorner + 0.5);
        vCol = vec4(aColor.rgb, a);
        vFog = smoothstep(fogNear, fogFar, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 fogColor;
      varying vec2 vUv; varying vec4 vCol; varying float vFog;
      void main(){
        vec4 t = texture2D(map, vUv);
        vec4 c = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
        #if ADDITIVE
          c.a *= 1.0 - vFog;
        #else
          c.rgb = mix(c.rgb, fogColor, vFog * 0.85);
        #endif
        if (c.a < 0.004) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
    defines: { MODE: mode, ADDITIVE: opts.additive ? 1 : 0 },
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: !opts.additive,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = opts.renderOrder ?? (opts.additive ? 3 : 2);
  return mesh;
}
