// STORY facade (D16 intro, D17 missions, D18 time warp). Wiring for main.js: docs/STORY.md.
import { createIntro, introSeen, markIntroSeen, loadNarration } from './intro.js';
import { createMission } from './missions.js';
import { createTimeWarp, createWarpToggle, warpStateFor, WARP_LEVELS } from './timewarp.js';
import { createHost } from './host.js';
import { extendHost } from './actors.js';
import { createPicker, missionList } from './picker.js';
import { MISSIONS, MISSION_IDS } from '../../data/story/index.js';
import { RADIO_LINES, STORY_AUDIO } from '../../data/story/lines.js';
import { loadProgress } from './dom.js';

export { createIntro, introSeen, markIntroSeen, loadNarration, createMission, createTimeWarp, createWarpToggle, warpStateFor, WARP_LEVELS, createHost, MISSIONS, MISSION_IDS, missionList, loadProgress };

/**
 * One object for main.js. opts: { game (window.__game), scene, camera, env, createPlane, prepareRig, getProfile, getLivery,
 *   getSettings, quality, parent, log, isOnline?() }
 *   story.playIntro({ onDone })       intro over the live world; while story.cameraOwned main must not move the camera
 *   story.startMission(id, { difficulty, onExit })   from the menu (no ?mission=) with missions unlocked: the picker first
 *   story.simScale(paused)            D18 warp factor for this frame's sim dt (1 when not warping)
 *   story.update(dt)                  every rendered frame (real dt)
 *   story.showWarp(bool)              the 1×/2×/5× chip (Story missions + Free Flight, never online)
 */
export function createStory(opts = {}) {
  const G = opts.game || window.__game;
  const host = extendHost(createHost(G), G, { scene: opts.scene, createPlane: opts.createPlane, prepareRig: opts.prepareRig, quality: opts.quality });
  const S = { intro: null, mission: null, toggle: null, picker: null, opts: null };
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

  const urlMission = () => { try { return new URLSearchParams(location.search).has('mission'); } catch (e) { return false; } };
  const volume = () => { const v = settings().voice ?? settings().master ?? 1; return typeof v === 'number' ? Math.max(0, Math.min(1, v > 1 ? v / 100 : v)) : 1; };

  // From the menu: with more than Mission 1 unlocked, a mission picker first (the world waits behind it).
  function startMission(id = 1, o = {}) {
    S.opts = o;
    if (!o.direct && !urlMission() && missionList().filter((m) => m.unlocked).length > 1) return pick(o);
    return runMission(id, o);
  }

  function pick(o = S.opts || {}) {
    S.mission?.abort(); S.mission = null;
    S.picker?.close();
    showWarp(false);
    S.picker = createPicker({ parent: opts.parent, difficulty: o.difficulty || host.difficulty(),
      onPick: (id) => { S.picker = null; runMission(id, o); },
      onClose: () => { S.picker = null; try { o.onExit?.({ action: 'picker' }); } catch (e) { console.error(e); } } });
    return null;
  }

  function runMission(id, o = {}) {
    S.mission?.abort();
    const def = MISSIONS[id];
    if (!def) throw new Error(`no mission ${id}`);
    warp.reset();
    try { G.ghud?.coach?.complete?.(); } catch (e) { /* the mission does the teaching */ }
    host.addLines(RADIO_LINES, STORY_AUDIO);
    const next = MISSION_IDS.find((n) => n > id);
    S.mission = createMission(def, { host, camera: opts.camera, parent: opts.parent, difficulty: o.difficulty, gender: opts.getProfile?.()?.gender, setTarget: o.setTarget, log: opts.log,
      volume: volume(), hasNext: !!next, onComplete: o.onComplete, onFail: o.onFail, onExit: o.onExit,
      onNext: () => runMission(next, o) });
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
    if (S.picker || S.mission?.holdSim) return 0;
    return warp.update(warpStateFor({ traffic: G.traffic, player: P, extra: { online: !!opts.isOnline?.(), paused, imminent: S.mission?.warpHold || false } }));
  }

  function update(dt) {
    if (S.intro) S.intro.update(dt);
    if (S.mission) S.mission.update(dt);
    if (S.toggle) { S.toggle.paint(); if (--visT <= 0) { visT = 10; paintWarpVis(); } }
  }

  const api = {
    host, warp, playIntro, startMission, runMission, pick, showWarp, simScale, update,
    get cameraOwned() { return !!S.intro?.active; },
    get intro() { return S.intro; }, get mission() { return S.mission; }, get toggle() { return S.toggle; }, get picker() { return S.picker; },
    endMission() { S.mission?.abort(); S.mission = null; S.picker?.close(); S.picker = null; showWarp(false); },
    introSeen,
  };
  if (typeof window !== 'undefined') window.__krzStory = api; // tests / devhook reuse the game's own instance
  return api;
}
