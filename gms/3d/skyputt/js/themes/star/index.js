// Star Station — the orbital space-station theme for SKYPUTT. Implements docs/THEME_CONTRACT.md.
// Procedural Three.js only: canvas textures, merged geometry, no downloaded assets.
import { createMaterials } from './materials.js';
import { createSkins } from './skins.js';
import { buildEnvironment } from './env.js';

export default function createTheme(ctx = {}) {
  const quality = ctx.quality === 'low' ? 'low' : 'high';
  const M = createMaterials(quality);
  M.quality = quality;
  const S = createSkins(M);
  const envs = new Set();
  return {
    id: 'star',
    name: 'Star Station',
    materials: M.materials,
    buildEnvironment(scene, info) {
      const env = buildEnvironment(scene, { ...info, quality: info.quality || quality }, M, info.quality || quality);
      envs.add(env);
      const dispose = env.dispose;
      env.dispose = () => { if (envs.delete(env)) dispose(); };
      return env;
    },
    skins: S.skins,
    /** Extension: frees the theme's shared materials/textures (call after every environment is disposed). */
    dispose() {
      for (const e of [...envs]) e.dispose();
      S.dispose();
      M.dispose();
    },
  };
}
