import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// 4-tap box down-sample; clamps so a stray Inf/NaN highlight can't black the frame through the blur.
const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
vec3 tap(vec2 o) { vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; return clamp(c, vec3(0.0), vec3(64.0)); }
void main() { gl_FragColor = vec4((tap(vec2(-0.5)) + tap(vec2(0.5, -0.5)) + tap(vec2(-0.5, 0.5)) + tap(vec2(0.5))) * 0.25, 1.0); }`;

const BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

// Tilt-shift = blend toward the blurred scene away from a horizontal focus band; bloom = the bright part of the two
// blurred levels. Tone mapping + sRGB come from three's chunks, so the hero matches the directly rendered cards.
const SHARP = `vec3 sharp(sampler2D t, vec2 uv, vec2 px, float k) {
  vec3 c = texture2D(t, uv).rgb;
  if (k <= 0.0) return c;
  vec3 n = texture2D(t, uv + vec2(px.x, 0.0)).rgb + texture2D(t, uv - vec2(px.x, 0.0)).rgb + texture2D(t, uv + vec2(0.0, px.y)).rgb + texture2D(t, uv - vec2(0.0, px.y)).rgb;
  return max(c + (c - n * 0.25) * k, c * 0.5);
}`;

// MSAA resolve + light unsharp mask + tone mapping, for views that skip bloom/tilt (phone cards).
const RESOLVE = `uniform sampler2D tScene; uniform vec2 uTexel; uniform float uSharp; varying vec2 vUv;
${SHARP}
void main() {
  gl_FragColor = vec4(sharp(tScene, vUv, uTexel, uSharp), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const COMPOSITE = `uniform sampler2D tScene, tS1, tS2; varying vec2 vUv;
uniform float uBloom, uWide, uTh, uKnee, uTilt, uFocus, uBand, uFeather, uSharp; uniform vec2 uTexel;
${SHARP}
float lum(vec3 c) { return max(c.r, max(c.g, c.b)); }
void main() {
  vec3 c = sharp(tScene, vUv, uTexel, uSharp);
  vec3 s1 = texture2D(tS1, vUv).rgb, s2 = texture2D(tS2, vUv).rgb;
  float t = smoothstep(uBand, uBand + uFeather, abs(vUv.y - uFocus)) * uTilt;
  c = mix(c, mix(s1, s2, t * 0.35), t);
  c += (s1 * smoothstep(uTh, uTh + uKnee, lum(s1)) * 0.6 + s2 * smoothstep(uTh, uTh + uKnee, lum(s2)) * 0.9 * uWide) * uBloom;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const POST_DEFAULTS = {
  bloom: { strength: 0.35, threshold: 0.85, knee: 0.5 },
  tilt: { focus: 0.5, band: 0.17, feather: 0.32, strength: 0.8 },
};

// scene → HDR target (MSAA on high) → ½ (or ¼) down-sample → blur → ⅛ (or 1/16) → blur → composite into the view's
// viewport. Six full-screen triangles. Targets belong to the renderer; a recreate disposes them and they come back.
export function createPost() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(geo);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms, toneMapped = false) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped });
  const down = mat(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const blur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const U = (v) => ({ value: v });
  const comp = mat(COMPOSITE, {
    tScene: U(null), tS1: U(null), tS2: U(null), uSharp: U(0), uTexel: U(new THREE.Vector2()), uBloom: U(0), uWide: U(1), uTh: U(1), uKnee: U(0.5), uTilt: U(0), uFocus: U(0.5), uBand: U(0.2), uFeather: U(0.3),
  }, true);
  const resolve = mat(RESOLVE, { tScene: U(null), uTexel: U(new THREE.Vector2()), uSharp: U(0) }, true);
  let rts = null, key = '', last = null;

  const rt = (w, h, samples = 0, depth = false) => new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: THREE.HalfFloatType, samples, depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });

  function ensure(pw, ph, samples, div, chain) {
    const k = pw + 'x' + ph + ':' + samples + ':' + div + ':' + chain;
    if (k === key) return;
    dispose();
    key = k;
    if (!chain) { rts = { scene: rt(pw, ph, samples, true) }; return; }
    const w1 = Math.ceil(pw / div), h1 = Math.ceil(ph / div);
    rts = { scene: rt(pw, ph, samples, true), d1: rt(w1, h1), a1: rt(w1, h1), b1: rt(w1, h1), d2: rt(w1 >> 2, h1 >> 2), a2: rt(w1 >> 2, h1 >> 2), b2: rt(w1 >> 2, h1 >> 2) };
  }

  function pass(renderer, m, target) {
    quad.material = m;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  }

  function downInto(renderer, src, dst, sw, sh) {
    down.uniforms.tSrc.value = src.texture;
    down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    pass(renderer, down, dst);
  }

  function blurInto(renderer, src, a, b) {
    blur.uniforms.tSrc.value = src.texture;
    blur.uniforms.uDir.value.set(1 / a.width, 0);
    pass(renderer, blur, a);
    blur.uniforms.tSrc.value = a.texture;
    blur.uniforms.uDir.value.set(0, 1 / b.height);
    pass(renderer, blur, b);
  }

  function dispose() {
    if (rts) for (const k in rts) rts[k].dispose();
    rts = null;
    key = '';
  }

  return {
    passes: 7,
    render(renderer, world, camera, v, { bloom = null, tilt = null, samples = 0, div = 2, sharpen = 0 } = {}) {
      const chain = !!(bloom || tilt);
      ensure(v.pw, v.ph, samples, div, chain);
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(rts.scene);
      renderer.render(world, camera);
      if (!chain) {
        resolve.uniforms.tScene.value = rts.scene.texture;
        resolve.uniforms.uTexel.value.set(1 / v.pw, 1 / v.ph);
        resolve.uniforms.uSharp.value = sharpen;
        quad.material = last = resolve;
        renderer.setRenderTarget(prevTarget);
        renderer.setViewport(v.vx, v.vy, v.pw, v.ph);
        renderer.setScissor(v.vx, v.vy, v.pw, v.ph);
        renderer.render(scene, cam);
        return;
      }
      downInto(renderer, rts.scene, rts.d1, v.pw, v.ph);
      blurInto(renderer, rts.d1, rts.a1, rts.b1);
      downInto(renderer, rts.b1, rts.d2, rts.b1.width, rts.b1.height);
      blurInto(renderer, rts.d2, rts.a2, rts.b2);
      const u = comp.uniforms;
      u.tScene.value = rts.scene.texture;
      u.tS1.value = rts.b1.texture;
      u.tS2.value = rts.b2.texture;
      u.uSharp.value = sharpen;
      u.uTexel.value.set(1 / v.pw, 1 / v.ph);
      u.uBloom.value = bloom ? bloom.strength ?? 0.35 : 0;
      u.uWide.value = bloom?.wide ?? 1;
      u.uTh.value = bloom?.threshold ?? 0.85;
      u.uKnee.value = bloom?.knee ?? 0.5;
      u.uTilt.value = tilt ? tilt.strength ?? 0.8 : 0;
      u.uFocus.value = tilt?.focus ?? 0.5;
      u.uBand.value = tilt?.band ?? 0.17;
      u.uFeather.value = tilt?.feather ?? 0.32;
      quad.material = last = comp;
      renderer.setRenderTarget(prevTarget);
      renderer.setViewport(v.vx, v.vy, v.pw, v.ph);
      renderer.setScissor(v.vx, v.vy, v.pw, v.ph);
      renderer.render(scene, cam);
    },
    // Re-run only the final pass (the targets still hold the last frame): the hero-direct presenter uses it to put the
    // hero back after a card frame drew into the shared canvas.
    replay(renderer, v) {
      if (!rts || !last) return false;
      quad.material = last;
      renderer.setRenderTarget(null);
      renderer.setViewport(v.vx, v.vy, v.pw, v.ph);
      renderer.setScissor(v.vx, v.vy, v.pw, v.ph);
      renderer.render(scene, cam);
      return true;
    },
    dispose() { dispose(); last = null; },
  };
}
