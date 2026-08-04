// Sun / sky / fog / time of day. One procedural equirect sky serves as both the visible
// background and, through PMREM, the ambient environment — so shadowed faces pick up cool sky
// while lit faces get warm sun, which is most of what makes the reference plates read.

import * as THREE from 'three';
import { Field, clamp, lerp, smoothstep, hexRgb } from './textures/noise.js';
import { configure as configureTextures } from './textures/bake.js';
import { windows, setEnvIntensity, setVariation, setGroundField, setSkirt } from './materials.js';
import { track, untrack } from '../engine/budget.js';
import { groundField } from './textures/groundfield.js';

const SKY_W = 1024, SKY_H = 512;

// Replaces three's fixed-radius PCF with a blocker search, so the filter radius comes from how
// far the caster is from the receiver — contact stays tight, distance goes soft. `shadowRadius`
// is repurposed as the growth rate (see fitShadow): it is the only per-light float three lets us
// reach without owning every material in the scene.
const PENUMBRA = `
const float FORGE_MAX_DZ = 0.11;
const float FORGE_MIN_R = 0.75;
#define FORGE_SEARCH(px,py) d = unpackRGBAToDepth( texture2D( shadowMap, sc.xy + vec2(px,py) * s ) ); if ( d < sc.z ) { zb += d; hit += 1.0; }
#define FORGE_TAP(px,py) sum += texture2DCompare( shadowMap, sc.xy + vec2( (px)*rc.x - (py)*rc.y, (px)*rc.y + (py)*rc.x ) * f, sc.z );
	float forgePenumbra( sampler2D shadowMap, vec2 shadowMapSize, float grow, vec3 sc ) {
		vec2 texel = vec2( 1.0 ) / shadowMapSize;
		vec2 s = texel * max( 1.0, grow * FORGE_MAX_DZ );
		float hit = 0.0, zb = 0.0, d;
		FORGE_SEARCH( 0.0, 0.0 )
		FORGE_SEARCH( 0.55, 0.0 )
		FORGE_SEARCH( 0.0, 0.55 )
		FORGE_SEARCH( -0.55, 0.0 )
		FORGE_SEARCH( 0.0, -0.55 )
		FORGE_SEARCH( 0.707, 0.707 )
		FORGE_SEARCH( -0.707, 0.707 )
		FORGE_SEARCH( -0.707, -0.707 )
		FORGE_SEARCH( 0.707, -0.707 )
		if ( hit < 0.5 ) return 1.0;
		if ( hit > 8.5 ) return 0.0;
		float r = max( FORGE_MIN_R, grow * min( sc.z - zb / hit, FORGE_MAX_DZ ) );
		vec2 f = texel * r;
		float ang = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		vec2 rc = vec2( cos( ang ), sin( ang ) );
		float sum = 0.0;
		FORGE_TAP( 0.177, 0.000 )
		FORGE_TAP( -0.226, 0.207 )
		FORGE_TAP( 0.035, -0.394 )
		FORGE_TAP( 0.285, 0.371 )
		FORGE_TAP( -0.522, -0.093 )
		FORGE_TAP( 0.495, -0.315 )
		FORGE_TAP( -0.166, 0.616 )
		FORGE_TAP( -0.315, -0.608 )
		FORGE_TAP( 0.685, 0.250 )
		FORGE_TAP( -0.713, 0.294 )
		FORGE_TAP( 0.343, -0.734 )
		FORGE_TAP( 0.254, 0.809 )
		FORGE_TAP( -0.764, -0.443 )
		FORGE_TAP( 0.899, -0.188 )
		FORGE_TAP( -0.547, 0.779 )
		FORGE_TAP( -0.127, -0.976 )
		return sum * 0.0625;
	}
`;

(function installPenumbra() {
  let s = THREE.ShaderChunk.shadowmap_pars_fragment;
  const a = s.indexOf('\t\t#if defined( SHADOWMAP_TYPE_PCF )');
  const b = s.indexOf('\t\t#elif defined( SHADOWMAP_TYPE_VSM )');
  const g = s.indexOf('\tfloat getShadow(');
  if (a < 0 || b < 0 || g < 0 || a > b) return;
  s = s.slice(0, a) +
    '\t\t#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT )\n' +
    '\t\t\tshadow = forgePenumbra( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xyz );\n' +
    s.slice(b);
  THREE.ShaderChunk.shadowmap_pars_fragment =
    s.slice(0, s.indexOf('\tfloat getShadow(')) + PENUMBRA + s.slice(s.indexOf('\tfloat getShadow('));
})();

const _fwd = new THREE.Vector3(), _c = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _upY = new THREE.Vector3(0, 1, 0), _upZ = new THREE.Vector3(0, 0, 1);
const _cA = new THREE.Color(), _cB = new THREE.Color(), _cC = new THREE.Color(), _cD = new THREE.Color();

// `cool` is the horizon opposite the sun. Without it the dome is one colour at every azimuth, so
// a low sun paints the whole frame the same pink and nothing has a cool side for the key to
// disagree with.
const LUT = [
  // Night loses saturation faster than it loses value: a dark but vivid navy is the day sky's own
  // hue merely dimmed, which is what kept reading as daytime. Lit windows must stay the brightest
  // thing in frame. Don't match the night plate's mean luminance — it is a tilt-shifted miniature
  // and ours is a wide shot, and matching it turns the frame into one blue wash.
  { el: -0.50, zen: '#080c1a', hor: '#0e1426', gnd: '#05070f', glow: '#22304e', cool: '#080c1c' },
  { el: -0.16, zen: '#161d38', hor: '#2b3150', gnd: '#0d1120', glow: '#5a4c72', cool: '#181f42' },
  { el: -0.02, zen: '#584a8c', hor: '#e28fa4', gnd: '#3c3244', glow: '#ff8a52', cool: '#4a5590' },
  { el: 0.16, zen: '#8b7fc0', hor: '#f0a6b4', gnd: '#61504a', glow: '#ffab63', cool: '#93a3ca' },
  { el: 0.42, zen: '#6f9cd2', hor: '#dbe7ea', gnd: '#6d6456', glow: '#ffeed0', cool: '#b7cee0' },
  { el: 0.85, zen: '#5d92cd', hor: '#d2e2e8', gnd: '#71695c', glow: '#fff7e4', cool: '#bcd6e4' },
];
const LUT_RGB = LUT.map(e => ({
  el: e.el, zen: hexRgb(e.zen), hor: hexRgb(e.hor), gnd: hexRgb(e.gnd), glow: hexRgb(e.glow),
  cool: hexRgb(e.cool),
}));

// Key colour by elevation. Midday sits around 5500 K rather than white, so it can disagree
// with the cool sky fill — a shadow that is only a darker version of the lit surface is the
// single loudest tell that a render is not lit, just shaded. A deep-orange low sun turns the
// whole dusk frame brown; the reference plate's low light is a pale warm cream, so the ramp
// desaturates rather than saturates on the way down.
const SUN_LUT = [
  { el: -0.05, c: 0xffc79a }, { el: 0.10, c: 0xffdcae }, { el: 0.30, c: 0xffdcab },
  { el: 0.55, c: 0xffdeb0 }, { el: 0.80, c: 0xffe3bc },
];

const MOON = 0x8ab0ff;

const SHADOW_RATE = { 'every frame': 0, '30hz': 30, '15hz': 15, '10hz': 10 };
// Fraction of the fitted radius the view is allowed to drift before the map is refitted early.
// The fit is padded by the same fraction, so drift inside it costs texel density, not shadows.
const DRIFT = 0.06;

// Anything that moves a caster between scheduled updates calls this, or a reduced rate shows
// the previous frame's world.
let staleFlag = false;
export function invalidateShadow() { staleFlag = true; }

function lutAt(el) {
  let i = 0;
  while (i < LUT_RGB.length - 2 && el > LUT_RGB[i + 1].el) i++;
  const a = LUT_RGB[i], b = LUT_RGB[i + 1];
  const t = smoothstep(a.el, b.el, el);
  const mix = k => [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2], b[k][2], t)];
  return { zen: mix('zen'), hor: mix('hor'), gnd: mix('gnd'), glow: mix('glow'), cool: mix('cool') };
}

function sunColorAt(el) {
  let i = 0;
  while (i < SUN_LUT.length - 2 && el > SUN_LUT[i + 1].el) i++;
  const t = smoothstep(SUN_LUT[i].el, SUN_LUT[i + 1].el, el);
  return new THREE.Color(SUN_LUT[i].c).lerp(new THREE.Color(SUN_LUT[i + 1].c), t);
}

export class Lighting {
  constructor() {
    this.object3D = new THREE.Group();
    this.time = 10.5;
    this.night = 0;

    this.key = new THREE.DirectionalLight(0xffffff, 3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.022;
    this.object3D.add(this.key, this.key.target);

    // Hemisphere, not ambient: a flat ambient tints lit and shadowed faces identically, so the
    // shadow can never be a different hue from the light. Sky half is cool, ground half is the
    // warm bounce coming back off the terrain.
    this.fill = new THREE.HemisphereLight(0x9dc4f0, 0x8a7758, 0.1);
    this.object3D.add(this.fill);

    this.clouds = new Field({ size: 128, period: 4, octaves: 4, gain: 0.55, seed: 71 });
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = SKY_W; this.skyCanvas.height = SKY_H;
    this.skyImg = this.skyCanvas.getContext('2d').createImageData(SKY_W, SKY_H);
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.mapping = THREE.EquirectangularReflectionMapping;
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.skyTex.generateMipmaps = false;
    this.skyTex.minFilter = THREE.LinearFilter;
    track(this.skyTex, { w: SKY_W, h: SKY_H, fmt: 'rgba', mips: false, label: 'sky:equirect' });

    windows.attach(this.object3D);
    this.rows = { el: new Float32Array(SKY_H), cos: new Float32Array(SKY_H), sin: new Float32Array(SKY_H) };
    for (let y = 0; y < SKY_H; y++) {
      const el = (0.5 - (y + 0.5) / SKY_H) * Math.PI;
      this.rows.el[y] = el; this.rows.cos[y] = Math.cos(el); this.rows.sin[y] = Math.sin(el);
    }
    this.cols = { cos: new Float32Array(SKY_W), sin: new Float32Array(SKY_W) };
    for (let x = 0; x < SKY_W; x++) {
      const az = ((x + 0.5) / SKY_W - 0.5) * Math.PI * 2;
      this.cols.cos[x] = Math.cos(az); this.cols.sin[x] = Math.sin(az);
    }
  }

  registerKnobs(q, app) {
    this.app = app;
    this.q = q;
    app.scene.fog = new THREE.FogExp2(0xcfd8dd, 0.005);

    const gf = groundField();
    setGroundField(gf.tex, gf.grid);

    this.pmrem = new THREE.PMREMGenerator(app.renderer);
    this.pmrem.compileEquirectangularShader();
    track({ isTexture: false }, { w: 256, h: 256 * 6, fmt: 'rgb', mips: true, label: 'sky:pmrem' });

    q.register({ key: 'texCap', label: 'Texture cap', type: 'select', options: [256, 512, 1024, 2048], group: 'Renderer' },
      () => configureTextures(q));
    q.register({ key: 'aniso', label: 'Anisotropy', type: 'select', options: [1, 2, 4, 8, 16], group: 'Renderer' },
      () => configureTextures(q));

    q.register({ key: 'time', label: 'Time of day', type: 'range', min: 0, max: 24, step: 0.1, default: 10.5, group: 'World' },
      v => { this.time = v; this.dirty = true; this.apply(); });
    q.register({ key: 'viewDist', label: 'View distance', type: 'range', min: 60, max: 500, step: 10, group: 'World' },
      v => { app.camera.far = v * 3; app.camera.updateProjectionMatrix(); this.apply(); });
    q.register({ key: 'fogAmount', label: 'Fog', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'World' },
      () => this.apply());
    q.register({ key: 'cloudCover', label: 'Cloud cover', type: 'range', min: 0, max: 1, step: 0.05, default: 0.38, group: 'World' },
      () => { this.dirty = true; this.apply(); });

    q.register({ key: 'sunPower', label: 'Sun power', type: 'range', min: 0, max: 8, step: 0.1, default: 4.4, group: 'Light' },
      () => this.apply());
    q.register({ key: 'envPower', label: 'Sky bounce', type: 'range', min: 0, max: 4, step: 0.01, default: 0.58, group: 'Light' },
      () => this.apply());
    q.register({ key: 'skyFill', label: 'Sky fill', type: 'range', min: 0, max: 1, step: 0.01, default: 0.21, group: 'Light' },
      () => this.apply());
    q.register({ key: 'moonPower', label: 'Moon', type: 'range', min: 0, max: 6, step: 0.05, default: 2.2, group: 'Light' },
      () => this.apply());
    q.register({ key: 'nightLift', label: 'Night lift', type: 'range', min: 0, max: 10, step: 0.05, default: 3.0, group: 'Light' },
      () => this.apply());
    q.register({ key: 'nightSky', label: 'Night sky', type: 'range', min: 0, max: 2, step: 0.02, default: 1, group: 'Light' },
      () => { this.dirty = true; this.apply(); });
    q.register({ key: 'stoneVary', label: 'Stone variation', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'World' },
      v => setVariation(v));
    q.register({ key: 'wallSkirt', label: 'Wall contact shade', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'World' },
      v => setSkirt(v));
    q.register({ key: 'windowLights', label: 'Window lights', type: 'range', min: 0, max: 48, step: 1, default: 18, group: 'Light' },
      v => windows.setCap(Math.min(v, q.get('lightCap') ?? 24)));
    q.register({ key: 'windowPower', label: 'Window power', type: 'range', min: 0, max: 90, step: 0.5, default: 38, group: 'Light' },
      v => { windows.power = v; });
    q.register({ key: 'windowReach', label: 'Window reach', type: 'range', min: 3, max: 24, step: 0.5, default: 13, group: 'Light' },
      v => { windows.reach = v; });
    q.register({ key: 'windowGlow', label: 'Window glow', type: 'range', min: 0, max: 5, step: 0.05, default: 3.2, group: 'Light' },
      v => { windows.glow = v; windows.setNight(this.night); });

    q.register({ key: 'shadowMap', label: 'Shadow map', type: 'select', options: [512, 1024, 2048, 4096], group: 'Renderer' },
      v => {
        this.key.shadow.mapSize.set(+v, +v);
        if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
        this.apply();
      });
    q.register({ key: 'shadowDist', label: 'Shadow distance', type: 'range', min: 20, max: 200, step: 5, group: 'Renderer' },
      () => this.apply());
    // metres of penumbra radius per metre between caster and receiver — the real sun is 0.009,
    // which at village scale is invisible, so this is a storybook exaggeration
    q.register({ key: 'shadowSoft', label: 'Shadow spread', type: 'range', min: 0, max: 0.07, step: 0.005, default: 0.05, group: 'Renderer' },
      invalidateShadow);
    q.register({ key: 'shadowRate', label: 'Shadow update', type: 'select', options: Object.keys(SHADOW_RATE), default: '15hz', group: 'Renderer' },
      invalidateShadow);

    this.ready = true;
    this.dirty = true;
    this.apply();
  }

  // The LUT scaled by the night-sky knob, so the sky texture, the fog and the PMREM env all
  // move together — darkening only the drawn sky leaves the fog washing the distance.
  skyAt(el) {
    const s = lutAt(el);
    const k = this.q?.get('nightSky') ?? 1;
    if (k === 1 || !this.night) return s;
    const f = lerp(1, k, this.night);
    const out = { ...s };
    for (const key of ['zen', 'hor', 'gnd', 'cool']) {
      out[key] = [s[key][0] * f, s[key][1] * f, s[key][2] * f];
    }
    return out;
  }

  sunAngles(t) {
    const h = (t / 24) * Math.PI * 2 - Math.PI;
    const decl = 0.15, lat = 0.78;
    const sl = Math.sin(lat), cl = Math.cos(lat);
    const el = Math.asin(clamp(sl * Math.sin(decl) + cl * Math.cos(decl) * Math.cos(h), -1, 1));
    const az = Math.atan2(Math.sin(h), Math.cos(h) * sl - Math.tan(decl) * cl) + Math.PI;
    return { el, az };
  }

  apply() {
    if (!this.ready) return;
    invalidateShadow();
    const q = this.q;
    const { el, az } = this.sunAngles(this.time);
    this.elev = el;
    const isNight = el < -0.02;
    this.night = smoothstep(0.03, -0.13, el);

    const dirEl = isNight ? 0.62 : el;
    const dirAz = isNight ? az + Math.PI : az;
    this.keyDir = new THREE.Vector3(
      Math.sin(dirAz) * Math.cos(dirEl), Math.sin(dirEl), -Math.cos(dirAz) * Math.cos(dirEl));

    // Stands in for the eye adapting to a fifth of the irradiance. It rides on key and fill
    // together, so it lifts the level without touching the lit-to-shadow ratio.
    const lowSun = 1 - smoothstep(0.05, 0.42, el);
    const expo = lerp(1, 2.7, lowSun);

    const sunI = q.get('sunPower') * expo * smoothstep(-0.03, 0.05, el) * (0.82 + 0.18 * smoothstep(0.05, 0.5, el));
    const moonI = q.get('moonPower') * smoothstep(-0.02, -0.18, el);
    this.key.color.copy(isNight ? _cA.setHex(MOON) : sunColorAt(el));
    this.key.intensity = isNight ? moonI : sunI;

    const sky = this.skyAt(el);
    const hor = new THREE.Color().setRGB(sky.hor[0] / 255, sky.hor[1] / 255, sky.hor[2] / 255, THREE.SRGBColorSpace);
    const zen = new THREE.Color().setRGB(sky.zen[0] / 255, sky.zen[1] / 255, sky.zen[2] / 255, THREE.SRGBColorSpace);

    // The sky only takes over once the sun is actually going; boosting it while the sun is
    // merely low washes the key straight out of the image.
    const twilight = 1 - smoothstep(-0.06, 0.10, el);
    setEnvIntensity(q.get('envPower') * lerp(1, 1.9, twilight) * lerp(1, 1.7, this.night));

    // The fill must never agree with the key — but "cool" means cool relative to the key, not
    // blue. At a low sun the sky genuinely is the pink one, and pulling the fill toward a
    // midday blue there paints the whole frame the wrong colour.
    const high = smoothstep(0.10, 0.42, el);
    // The night fill has to be a saturated blue, not a neutral grey. A neutral fill preserves
    // every albedo's own hue, which is why the shrubs used to sit in a night frame as pale green
    // balls while the stone around them went blue — grey light times a green albedo is green.
    // What stops it reading as a blue filter over a daylight frame is the moon key being paler
    // and warmer than the fill, so lit faces separate from shade by hue as well as by value.
    const skyTarget = _cA.setHex(0xc3a6d2).lerp(_cB.setHex(0xbcc8cf), high).lerp(_cD.setHex(0x2f4f9a), this.night);
    const gndTarget = _cC.setHex(0xb8977c).lerp(_cD.setHex(0x9d8464), high).lerp(_cB.setHex(0x17244e), this.night);
    const desat = lerp(lerp(0.30, 0.88, smoothstep(0.02, 0.45, el)), 0.92, this.night);
    this.fill.color.copy(zen).lerp(skyTarget, desat);
    this.fill.groundColor.copy(hor).lerp(gndTarget, desat * 1.1);
    // The old low-sun boost was 2.6× on the fill alone, which put enough untinted ambient in
    // that the shadow map's own output stopped reading as a shadow at all — the "no shadows
    // below 15°" report was this line, not the shadow camera.
    const dayFill = q.get('sunPower') * q.get('skyFill') * expo * lerp(1, 1.3, lowSun);
    this.fill.intensity = lerp(dayFill, q.get('nightLift'), this.night);

    // Aerial perspective. A grazing sun means a far longer path through the atmosphere, so dusk
    // scatters twice as hard as midday — that haze is most of why the reference dusk plate has
    // no black anywhere in it.
    const fogCol = hor.clone().lerp(zen, 0.18 + this.night * 0.34);
    const vd = q.get('viewDist');
    const amt = Math.max(0, q.get('fogAmount'));
    this.app.scene.fog.color.copy(fogCol);
    this.app.scene.fog.density = 1.15 * amt * lerp(1, 2.9, lowSun) * lerp(1, 0.6, this.night) / Math.max(40, vd);

    windows.setNight(this.night);
    // drawSky is a 12 ms pixel loop; a slider drag calls apply() per pointer move, so the
    // rebuild is deferred to update() and happens at most once a frame.
    this.skyEl = el; this.skyAz = az;
  }

  drawSky(el, az) {
    const p = this.skyImg.data;
    const sky = this.skyAt(el);
    const cover = this.q.get('cloudCover');
    const dayF = smoothstep(-0.14, 0.06, el);
    // three's equirect lookup measures azimuth from +X toward +Z; the sun runs from -Z (north).
    const azT = az - Math.PI / 2;
    const A = Math.cos(el) * Math.cos(azT), B = Math.cos(el) * Math.sin(azT), C = Math.sin(el);
    const glowStrength = lerp(0.12, 1, smoothstep(-0.22, 0.04, el));
    // Narrow at midday — a wide skirt covers most of the dome, so the PMREM irradiance comes out
    // warm everywhere and shadowed faces can never read cool. Wide at dusk, where it is the only
    // cue that there is a sun in a frame whose camera is not pointing at one.
    const broad = lerp(0.05, 0.26, 1 - smoothstep(0.10, 0.40, el));
    const counter = lerp(0.20, 0.62, 1 - smoothstep(0.04, 0.44, el));

    const rowRGB = new Float32Array(SKY_H * 3);
    for (let y = 0; y < SKY_H; y++) {
      const e = this.rows.el[y];
      const t = Math.pow(smoothstep(-0.05, 0.62, e), 0.8);
      const g = smoothstep(0, -0.16, e);
      for (let k = 0; k < 3; k++) {
        rowRGB[y * 3 + k] = lerp(lerp(sky.hor[k], sky.zen[k], t), sky.gnd[k], g);
      }
    }

    for (let y = 0; y < SKY_H; y++) {
      const ce = this.rows.cos[y], se = this.rows.sin[y];
      const e = this.rows.el[y];
      const cloudBand = smoothstep(0.015, 0.22, e) * (1 - smoothstep(0.5, 1.1, e)) * dayF;
      const r0 = rowRGB[y * 3], g0 = rowRGB[y * 3 + 1], b0 = rowRGB[y * 3 + 2];
      for (let x = 0; x < SKY_W; x++) {
        const dot = ce * (this.cols.cos[x] * A + this.cols.sin[x] * B) + se * C;
        const s = dot > 0 ? dot : 0;
        // the wide skirt this used to have covered most of the dome, so the PMREM irradiance
        // came out warm everywhere and shadowed faces could never read cool
        const glow = (Math.pow(s, 220) * 0.9 + Math.pow(s, 44) * 0.26 + Math.pow(s, 7) * broad) * glowStrength;

        let r = r0, g = g0, b = b0;
        if (cloudBand > 0.001 && cover > 0.01) {
          const cv = this.clouds.at(x / SKY_W * 2.4, 0.5 - e * 0.75);
          const m = smoothstep(1 - cover, 1 - cover + 0.30, cv) * cloudBand;
          if (m > 0.001) {
            const lit = 0.92 + 0.35 * glow;
            r = lerp(r, lerp(sky.hor[0], 252, 0.55) * lit, m);
            g = lerp(g, lerp(sky.hor[1], 246, 0.55) * lit, m);
            b = lerp(b, lerp(sky.hor[2], 240, 0.55) * lit, m);
          }
        }
        if (dot < 0) {
          const cm = counter * dot * dot;
          r = lerp(r, sky.cool[0], cm); g = lerp(g, sky.cool[1], cm); b = lerp(b, sky.cool[2], cm);
        }
        r += sky.glow[0] * glow; g += sky.glow[1] * glow; b += sky.glow[2] * glow;

        // One equirect texel is ~6 screen pixels wide, so a bright star magnifies into a soft
        // disc the size of a moon. They have to stay dim enough to read as a dusting.
        if (this.night > 0.25 && e > 0.0) {
          const h = ((x * 1103515245 + y * 12345) ^ (y << 7)) >>> 0;
          if ((h % 9973) > 9908) {
            const s2 = 10 + (h % 46) * (h % 31 === 0 ? 2.0 : 0.7);
            const f = (this.night - 0.25) * 1.34 * smoothstep(0, 0.20, e);
            r += s2 * f; g += s2 * f; b += (s2 + 14) * f;
          }
        }

        const i = (y * SKY_W + x) * 4;
        p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = 255;
      }
    }
    this.skyCanvas.getContext('2d').putImageData(this.skyImg, 0, 0);
    // An equirect texture used as scene.background is converted to a cube map ONCE by
    // WebGLCubeMaps and cached against the texture object for the life of the renderer, so
    // needsUpdate alone repaints the canvas and changes nothing on screen — the sky stays on
    // whatever it was at the first frame. dispose() is the only thing that drops that cache.
    this.skyTex.dispose();
    this.skyTex.needsUpdate = true;
    this.lastDraw = performance.now();
    this.envDirty = true;
  }

  refreshEnv() {
    this.envTarget = this.pmrem.fromEquirectangular(this.skyTex, this.envTarget);
    this.app.scene.environment = this.envTarget.texture;
    this.app.scene.background = this.skyTex;
    this.envDirty = false;
  }

  // Centre of the sphere bounding the view frustum out to `shadowDist`, and its radius on
  // `this.fitRadius`. A sphere rather than a box because it does not change size as the camera
  // turns, which is what lets the texel snap in fitShadow actually hold still.
  shadowCentre(app, out) {
    const cam = app.camera;
    // past ~90 m one 2048 map has no texels left to spare and contact shadows turn to mush;
    // fog has taken over by then anyway
    const far = Math.min(this.q.get('shadowDist') || 80, 85, cam.far);
    const tanY = Math.tan(cam.fov * Math.PI / 360);
    const s = tanY * tanY * (1 + cam.aspect * cam.aspect);
    let z = (far + cam.near) * (1 + s) * 0.5;
    if (z > far) z = far;
    this.fitRadius = Math.sqrt((far - z) * (far - z) + s * far * far);
    return out.copy(cam.position).addScaledVector(cam.getWorldDirection(_fwd), z);
  }

  // Aim the shadow camera at that sphere. Only ever called on a frame whose map is re-rendered —
  // fitting without rendering leaves the map's depth from the camera's previous position.
  fitShadow(app, pad = 1) {
    const q = this.q;
    const centre = this.shadowCentre(app, _c);
    const radius = this.fitRadius * pad;
    (this.fitAt || (this.fitAt = new THREE.Vector3())).copy(centre);

    const up = Math.abs(this.keyDir.y) > 0.99 ? _upZ : _upY;
    this.key.up.copy(up);
    const zx = _bz.copy(this.keyDir).normalize();
    const xx = _bx.crossVectors(up, zx).normalize();
    const yy = _by.crossVectors(zx, xx);

    // snap the centre to whole shadow-map texels or a slow pan crawls with aliasing
    const texel = (2 * radius) / (+q.get('shadowMap') || 1024);
    const px = Math.round(centre.dot(xx) / texel) * texel;
    const py = Math.round(centre.dot(yy) / texel) * texel;
    const pz = centre.dot(zx);
    centre.copy(xx).multiplyScalar(px).addScaledVector(yy, py).addScaledVector(zx, pz);

    this.key.target.position.copy(centre);
    this.key.position.copy(centre).addScaledVector(zx, radius + 25);
    this.key.target.updateMatrixWorld();

    const c = this.key.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 0.5; c.far = 2 * radius + 55;
    c.updateProjectionMatrix();
    // bias has to track texel size or a tight fit acnes and a loose fit peter-pans
    this.key.shadow.normalBias = Math.max(0.012, Math.min(0.03, texel * 0.3));
    // shadowRadius is the growth rate forgePenumbra reads: blur texels per unit of normalised
    // shadow-map depth. Dividing the world rate by the texel size is what makes the look hold
    // when shadowMap or shadowDist changes.
    this.key.shadow.radius = Math.min(72, (q.get('shadowSoft') ?? 0) * (c.far - c.near) / texel);
  }

  // Almost nothing in the scene moves, so re-rendering the map every frame buys very little.
  // The fit has to freeze with it — see fitShadow.
  stepShadow(dt, app) {
    const sm = app.renderer.shadowMap;
    const hz = SHADOW_RATE[this.q.get('shadowRate')] || 0;
    if (!hz) { sm.autoUpdate = true; this.fitShadow(app); return; }

    sm.autoUpdate = false;
    this.shadowWait = (this.shadowWait || 0) - dt;
    const drifted = !this.fitAt ||
      this.shadowCentre(app, _c2).distanceTo(this.fitAt) > this.fitRadius * DRIFT;
    if (this.shadowWait > 0 && !drifted && !staleFlag) return;

    this.shadowWait = 1 / hz;
    staleFlag = false;
    this.fitShadow(app, 1 + DRIFT);
    sm.needsUpdate = true;
  }

  update(dt, app) {
    // Each redraw now also throws away a cube map three has to rebuild, so a slider drag is
    // coalesced to ~8/s rather than one per frame. `dirty` stays set, so the value you stop on
    // is always the one drawn.
    if (this.dirty && performance.now() - (this.lastDraw || 0) > 120) {
      this.dirty = false;
      this.drawSky(this.skyEl, this.skyAz);
    }
    if (this.envDirty) this.refreshEnv();
    this.stepShadow(dt, app);
    windows.update(dt, app);
  }

  dispose() {
    untrack(this.skyTex); this.skyTex.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
  }
}
