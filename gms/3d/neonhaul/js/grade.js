// §4.6's grade pass — the real one. Replaces the inline placeholder P0 left in main.js
// (DECISIONS obligation T3); there must never be two.
//
//   RenderPass  →  UnrealBloomPass  →  this (renderToScreen)
//     linear HDR     linear HDR         ACES + grade + sRGB → the screen
//
// ACES lives here and NOWHERE else. `renderer.toneMapping = ACESFilmicToneMapping` compiles its
// define only when `_currentRenderTarget === null` (three.module.js:30147-30155) and with a
// composer it never is, so setting it on the renderer does literally nothing. That is also why
// OutputPass exists and applies ACES itself; we replace OutputPass, so we inherit the job.

import * as THREE from 'three';
import { GRADE, HAZE } from './config.js';

const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);

export function makeGradeShader(noiseTex) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      tNoise: { value: noiseTex || null },
      uExposure: { value: GRADE.exposure },      // §4.6 step 1 — a PASS uniform, because
      uAces: { value: 1 },                       // renderer.toneMappingExposure is inert here
      uLift: { value: v3(GRADE.lift) },
      uGain: { value: v3(GRADE.gain) },
      // DECISIONS decision 10's far-haze tunable, and the only consumer of config.HAZE.
      // Neutral grey so the number stays a *brightness* control and never a tint.
      uGamma: { value: new THREE.Vector3(HAZE.gamma, HAZE.gamma, HAZE.gamma) },
      uSat: { value: GRADE.saturation },
      uSplitS: { value: v3(GRADE.splitShadow) },
      uSplitH: { value: v3(GRADE.splitHighlight) },
      uSplitAmt: { value: GRADE.splitAmount },
      uVignette: { value: GRADE.vignette },
      uDither: { value: GRADE.dither },
      uNoiseScale: { value: new THREE.Vector2(1 / 64, 1 / 64) },
      uTime: { value: 0 },
    },

    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,

    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform sampler2D tNoise;
      uniform vec3 uLift, uGain, uGamma, uSplitS, uSplitH;
      uniform float uExposure, uAces, uSat, uSplitAmt, uVignette, uDither, uTime;
      uniform vec2 uNoiseScale;
      varying vec2 vUv;

      // three's own ACESFilmicToneMapping body, inlined. The division by 0.6 is the ACES
      // reference exposure, not a typo — dropping it darkens the whole game by a stop.
      vec3 RRTAndODTFit( vec3 v ) {
        vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
        vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
        return a / b;
      }
      vec3 acesFilmic( vec3 color, float exposure ) {
        const mat3 ACESInputMat = mat3(
          vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
        const mat3 ACESOutputMat = mat3(
          vec3(  1.60475, -0.10208, -0.00327 ), vec3( -0.53108,  1.10813, -0.07276 ), vec3( -0.07367, -0.00605,  1.07602 ) );
        color *= exposure / 0.6;
        color = ACESInputMat * color;
        color = RRTAndODTFit( color );
        color = ACESOutputMat * color;
        return clamp( color, 0.0, 1.0 );
      }

      void main() {
        vec3 c = texture2D( tDiffuse, vUv ).rgb;

        // 1 + 2. exposure, then ACES. uAces == 0 is the §4.6 A/B: if the two frames come out
        // identical the pass is not tone mapping and the pipeline order is wrong.
        c = mix( clamp( c * uExposure, 0.0, 1.0 ), acesFilmic( c, uExposure ), uAces );

        // 3. the sRGB encode — the exact body of three's colorspace_fragment chunk, which is why
        // OutputPass must NOT also be in the chain.
        //
        // §4.6 puts this LAST, after the grade. That ordering cannot be right and the numbers say
        // so: ACES returns tone-mapped LINEAR, so a lift of 0.008 applied before the encode lands
        // on screen as 12.92 * 0.008 = 0.103 — a 10 % black floor on a frame whose whole premise
        // is that it is mostly black. The split-tone pair are worse: 0x0d2a33 at amount 0.18 adds
        // 0.036 of linear blue, which encodes to 0.36. Every magnitude in §4.6 and in config.GRADE
        // — the +/- 1/255 dither above all, which is a quantisation-space number by definition —
        // only means what it says in DISPLAY space. So the encode moves ahead of steps 3-5 and
        // the grade is genuinely display-referred. It still happens exactly once, in this pass.
        gl_FragColor = linearToOutputTexel( vec4( c, 1.0 ) );
        c = gl_FragColor.rgb;

        // 4. lift / gamma / gain, and saturation.
        c = pow( max( c, 0.0 ), uGamma );
        c = c * uGain + uLift;
        float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
        c = mix( vec3( l ), c, uSat );

        // 5. split tone — shadows to teal, highlights to magenta. This is what makes a
        // near-monochrome dark frame read as a photograph instead of an underexposed render.
        vec3 sh = uSplitS * ( 1.0 - smoothstep( 0.0, 0.55, l ) );
        vec3 hi = uSplitH * smoothstep( 0.35, 1.0, l );
        c += uSplitAmt * ( sh + hi );

        // 6. vignette, then blue-noise dither. The dither is NOT optional and is kept in LOW:
        // the frame is 80 % near-black gradient and 8-bit banding on it looks like a bug.
        vec2 d = vUv - 0.5;
        c *= 1.0 - uVignette * pow( min( 1.0, length( d ) * 1.4142 ), 2.4 );

        float n = texture2D( tNoise, gl_FragCoord.xy * uNoiseScale + vec2( fract( uTime * 0.37 ), fract( uTime * 0.61 ) ) ).r;
        c += ( n - 0.5 ) * 2.0 * ( uDither / 255.0 );

        gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
      }`,
  };
}

// sky.js hands the blended variant here once a frame. Keeping the mapping in one function is
// what stops "which uniform is exposure?" turning into a two-place bug.
export function applyGrade(pass, g) {
  if (!pass) return;
  const u = pass.uniforms;
  u.uExposure.value = GRADE.exposure * g.exposure;   // base x per-variant (§4.6 step 1)
  // sky.js resolves lift/gain to a vec3 during the blend — a variant may offset config.GRADE's
  // base or replace it outright (daysmog does, because that base is deliberately cool and §4.3
  // forbids blue dominance by day), and only the resolved pair can be crossfaded.
  u.uLift.value.fromArray(g.liftRGB);
  u.uGain.value.fromArray(g.gainRGB);
  u.uSat.value = GRADE.saturation * g.sat;
  u.uSplitAmt.value = g.split;
}
