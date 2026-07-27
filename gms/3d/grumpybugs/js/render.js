// GRUMPY BUGS — the look. One place that owns tone mapping, shadow quality,
// the light rig and the environment probe, so the game, the intro cutscene and
// tools/gallery.html all render the props under identical conditions.
//
// The art is flat-shaded primitive soup; what sells it is CONTRAST — a warm
// key, a cool sky bounce and a hard rim from behind so chitin edges separate
// from the dirt. ACES tone mapping keeps the saturated faction colours from
// clipping to mush when a muzzle flash goes off next to them.

import * as THREE from 'three';

const T = THREE;

export const LOOK = {
  exposure: 1.16,
  shadow: 2048,          // lite drops to 1024
  sunIntensity: 2.05,
  hemiIntensity: 0.72,
  rimIntensity: 0.95,
  fillIntensity: 0.22,
};

export function applyRenderProfile(renderer, { lite = false } = {}) {
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  return renderer;
}

// A tiny gradient sky rendered to a PMREM probe. Gives every glossy material
// (beetle shells, the fork, the acorn's steel band) something to reflect —
// without it, metalness just reads as "dark".
export function buildEnv(renderer, theme) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  gr.addColorStop(0.00, hex(theme.sky[0]));
  gr.addColorStop(0.48, hex(theme.sky[1]));
  gr.addColorStop(0.52, hex(theme.fog));
  gr.addColorStop(1.00, hex(theme.terra.dirt2));
  g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.mapping = T.EquirectangularReflectionMapping;

  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

// Three lights and a bounce. Returns the objects so the caller can add them to
// whichever group it disposes.
export function lightRig(theme, { lite = false } = {}) {
  const night = theme.id === 'kitchen';
  const hemi = new T.HemisphereLight(theme.sky[0], theme.terra.dirt2,
    LOOK.hemiIntensity * (night ? 0.8 : 1));

  const sun = new T.DirectionalLight(theme.sun, LOOK.sunIntensity * (night ? 0.6 : 1));
  sun.position.set(11, 19, 7);
  if (!lite) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(LOOK.shadow, LOOK.shadow);
    const c = sun.shadow.camera;
    c.left = c.bottom = -24; c.right = c.top = 24; c.far = 64;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.022;
    sun.shadow.radius = 2.2;
  }

  // rim: opposite the sun, low and cool — the edge light that makes a bug read
  // as a silhouette against its own ledge
  const rim = new T.DirectionalLight(night ? 0x9db6ff : 0xbfd8ff, LOOK.rimIntensity);
  rim.position.set(-13, 5.5, -11);

  // a whisper of fill from the front so the dark side never goes to mud
  const fill = new T.DirectionalLight(theme.fog, LOOK.fillIntensity);
  fill.position.set(2, 4, 14);

  return { lights: [hemi, sun, sun.target, rim, fill], hemi, sun, rim, fill };
}
