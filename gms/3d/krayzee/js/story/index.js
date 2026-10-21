// STORY facade (D16 intro, D17 missions, D18 time warp). Wiring for main.js: docs/STORY.md.
import { createIntro, introSeen, markIntroSeen, loadNarration } from './intro.js';
import { createMission } from './missions.js';
import { createTimeWarp, createWarpToggle, warpStateFor, WARP_LEVELS } from './timewarp.js';
import { createHost } from './host.js';
import { MISSIONS } from '../../data/story/mission1.js';
import { loadProgress } from './dom.js';

export { createIntro, introSeen, markIntroSeen, loadNarration, createMission, createTimeWarp, createWarpToggle, warpStateFor, WARP_LEVELS, createHost, MISSIONS, loadProgress };

/**
 * One object for main.js. opts: { game (window.__game), scene, camera, env, createPlane, prepareRig, getProfile, getLivery,
 *   getSettings, quality, parent, log, isOnline?() }
 *   story.playIntro({ onDone })       intro over the live world; while story.cameraOwned main must not move the camera
 *   story.startMission(id, { difficulty, onExit })
 *   story.simScale(paused)            D18 warp factor for this frame's sim dt (1 when not warping)
 *   story.update(dt)                  every rendered frame (real dt)
 *   story.showWarp(bool)              the 1×/2×/5× chip (Story missions + Free Flight, never online)
 */
export function createStory(opts = {}) {
  const G = opts.game || window.__game;
  const host = createHost(G);
  const S = { intro: null, mission: null, toggle: null };
  const warp = createTimeWarp({ onChange: () => S.toggle?.paint() });
  const settings = () => { try { return opts.getSettings?.() || {}; } catch (e) { return {}; } };

  function playIntro({ onDone } = {}) {
    S.intro?.dispose();
    const vol = settings().voice ?? settings().master ?? 1;
    S.intro = createIntro({
      camera: opts.camera, scene: opts.scene, traffic: G.traffic, env: opts.env || G.traffic?.env,
      profile: opts.getProfile?.(), livery: opts.getLivery?.() || opts.getProfile?.(), createPlane: opts.createPlane, prepareRig: opts.prepareRig,
      quality: opts.quality, volume: typeof vol === 'number' ? Math.max(0, Math.min(1, vol > 1 ? vol / 100 : vol)) : 1, parent: opts.parent,
      onDone: (r) => { opts.log?.('story.intro', r); S.intro = null; onDone?.(r); },
    });
    S.intro.start();
    return S.intro;
  }

  function startMission(id = 1, o = {}) {
    S.mission?.abort();
    const def = MISSIONS[id];
    if (!def) throw new Error(`no mission ${id}`);
    warp.reset();
    try { G.ghud?.coach?.complete?.(); } catch (e) { /* the mission does the teaching */ }
    S.mission = createMission(def, { host, camera: opts.camera, parent: opts.parent, difficulty: o.difficulty, gender: opts.getProfile?.()?.gender, setTarget: o.setTarget, log: opts.log, onComplete: o.onComplete, onFail: o.onFail, onExit: o.onExit });
    S.mission.start();
    showWarp(true);
    return S.mission;
  }

  let warpWanted = false, visT = 0;
  function showWarp(v) {
    warpWanted = !!v;
    if (v && !S.toggle) S.toggle = createWarpToggle({ container: opts.parent || document.body, warp });
    paintWarpVis();
    if (!v) warp.reset();
  }
  // hidden online, and while a LANDED — DEMAND IT button is up (nothing left to warp, and it shares that space)
  function paintWarpVis() {
    if (!S.toggle) return;
    const fin = [...document.querySelectorAll('.krz-finish')].some((e) => !e.hidden && !e.closest('[hidden]'));
    S.toggle.setVisible(warpWanted && !opts.isOnline?.() && !fin);
  }

  function simScale(paused = false) {
    const P = host.player();
    if (!P) return 1;
    return warp.update(warpStateFor({ traffic: G.traffic, player: P, extra: { online: !!opts.isOnline?.(), paused, imminent: S.mission?.warpHold || false } }));
  }

  function update(dt) {
    if (S.intro) S.intro.update(dt);
    if (S.mission) S.mission.update(dt);
    if (S.toggle) { S.toggle.paint(); if (--visT <= 0) { visT = 10; paintWarpVis(); } }
  }

  const api = {
    host, warp, playIntro, startMission, showWarp, simScale, update,
    get cameraOwned() { return !!S.intro?.active; },
    get intro() { return S.intro; }, get mission() { return S.mission; }, get toggle() { return S.toggle; },
    endMission() { S.mission?.abort(); S.mission = null; showWarp(false); },
    introSeen,
  };
  if (typeof window !== 'undefined') window.__krzStory = api; // tests / devhook reuse the game's own instance
  return api;
}
