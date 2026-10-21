// Bench/test shim: runs the story inside the real game WITHOUT main.js wiring, by wrapping the renderer's render()
// (intro camera + per-frame update) and traffic.update() (time warp). Production wiring is in docs/STORY.md instead.
//   const dev = await (await import('/gms/3d/krayzee/js/story/devhook.js')).install();
//   dev.story.playIntro(); dev.story.startMission(1, { difficulty: 'easy' });
import { createStory } from './index.js';
import { createPlane } from '../plane/index.js';

export async function install({ difficulty } = {}) {
  const G = window.__game;
  if (!G) throw new Error('no window.__game');
  if (window.__story) return window.__story;
  if (window.__krzStory) return (window.__story = { story: window.__krzStory, difficulty, G, wired: true });
  const R = G.renderer, T = G.traffic;
  const scene = T.list.find((e) => e.rig?.root.parent)?.rig.root.parent || null;
  let applyEnv = null;
  try { applyEnv = (await import('../main.js')).applyEnv; } catch (e) { /* */ }
  const ui = await import('../ui/index.js');
  const story = createStory({
    game: G, scene, camera: G.camera, createPlane, prepareRig: applyEnv,
    getProfile: ui.getProfile, getLivery: ui.getLivery || ui.getProfile, getSettings: ui.getSettings,
    quality: 'high', log: (t, d) => G.S?.log?.push({ t: +(performance.now() / 1000).toFixed(1), ...d, type: t }),
  });
  const render = R.renderer.render.bind(R.renderer);
  let last = performance.now();
  R.renderer.render = (s, c) => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try { story.update(dt); } catch (e) { console.error('[story]', e); }
    if (story.cameraOwned) { const sky = s.getObjectByName('sky'); if (sky) sky.position.copy(c.position); } // main's world.update ran before us
    render(s, c);
  };
  const tu = T.update.bind(T);
  T.update = (dt) => tu(dt * story.simScale(!!G.S?.paused));
  const dev = { story, difficulty, G };
  window.__story = dev;
  return dev;
}
