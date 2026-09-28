// D24 dev mode. Loaded ONLY by game.js's dynamic import when the URL has ?dev (never for players).
// ?dev=1 · &district=<id> · &mission=A2-M1 (skip the title, straight into play) · &fresh (new dev save)
import { STORY_MISSIONS } from '../data/story.js';
import { DISTRICTS } from '../data/districts.js';
import { completeStory } from '../sim/story.js';
import { rollItem } from '../sim/loot.js';
import { createRng } from '../sim/rng.js';
import { OWNABLE_FRAMES } from '../data/frames.js';
import { DISTRICT_NAMES } from '../game/districts.js';

// the dev save lives next to the real one under a _dev suffix, so debug play never touches Aaron's save
export function devStorage() {
  const ls = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const mem = new Map();
  const k = (key) => key + '_dev';
  return {
    getItem: (key) => { try { return ls ? ls.getItem(k(key)) : mem.get(k(key)) ?? null; } catch (e) { return mem.get(k(key)) ?? null; } },
    setItem: (key, v) => { try { if (ls) ls.setItem(k(key), v); else mem.set(k(key), v); } catch (e) { mem.set(k(key), v); } },
    removeItem: (key) => { try { ls?.removeItem(k(key)); } catch (e) { /* private mode */ } mem.delete(k(key)); },
  };
}

const CSS = `
.hfdev-btn { position: fixed; z-index: 60; top: max(8px, env(safe-area-inset-top)); left: 300px; height: 34px; padding: 0 12px; border-radius: 17px;
  font: 700 13px/34px 'Rajdhani', system-ui, sans-serif; letter-spacing: .14em; color: #1a0f00; background: linear-gradient(180deg, #fff6d6, #ffd986 40%, #dc9a34);
  border: 1px solid rgba(255, 240, 200, .8); box-shadow: 0 2px 10px rgba(0, 0, 0, .35); touch-action: manipulation; user-select: none; }
.hfdev-btn.god { box-shadow: 0 0 0 2px #5dffb3, 0 2px 10px rgba(0, 0, 0, .35); }
.hfdev { position: fixed; z-index: 61; top: max(8px, env(safe-area-inset-top)); bottom: max(8px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%);
  width: min(620px, calc(100vw - 24px)); overflow-y: auto; padding: 12px 14px 14px; border-radius: 14px; display: none; color: #eef8ff;
  font: 500 14px/1.3 'Rajdhani', system-ui, sans-serif; background: linear-gradient(165deg, rgba(64, 132, 196, .5), rgba(14, 34, 62, .9) 55%, rgba(6, 16, 32, .95));
  border: 1px solid rgba(170, 228, 255, .5); backdrop-filter: blur(14px) saturate(1.5); -webkit-backdrop-filter: blur(14px) saturate(1.5); }
.hfdev.show { display: block; }
.hfdev h3 { margin: 10px 0 6px; font: 700 11px/1 'Michroma', system-ui, sans-serif; letter-spacing: .16em; color: #ffd27a; text-transform: uppercase; }
.hfdev .row { display: flex; flex-wrap: wrap; gap: 6px; }
.hfdev button { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(170, 228, 255, .35); background: rgba(8, 22, 44, .75);
  color: #eef8ff; font: 600 14px 'Rajdhani', system-ui, sans-serif; touch-action: manipulation; }
.hfdev button.on { background: rgba(93, 255, 179, .22); border-color: #5dffb3; color: #d8ffe9; }
.hfdev button.here { border-color: #ffd27a; color: #ffd27a; }
.hfdev .top { display: flex; justify-content: space-between; align-items: center; }
.hfdev .top b { font: 700 13px 'Michroma', system-ui, sans-serif; letter-spacing: .14em; }
.hfdev .stat { color: rgba(214, 236, 255, .72); font-size: 13px; margin-top: 4px; }
`;

const storyIdFromUrl = (v) => (v ? v.toLowerCase().replace('-', '_') : null);

export function createDev(G, { world, ui, player, rig, createSim, loadGame, store, sites, startSession, Q }) {
  const D = { god: false, oneHit: false, open: false };
  const staged = () => STORY_MISSIONS.filter((m) => (m.steps || m.fixed) && m.act <= (G.sim?.storyActCap ?? 2));

  // ---- actions ----------------------------------------------------------------------------------------------
  function toast(t, sub) { ui?.toast(t, 'info', { sub, ms: 1600 }); }
  function setLevel(n) { const S = G.sim.state; while (S.player.level < n) G.sim.giveXp(Math.max(200, 50 * S.player.level * S.player.level), 'dev'); }
  function goDistrict(id) {
    if (G.runner.active) G.runner.abandon();
    if (DISTRICTS[id]) G.sim.unlockDistrict(id);
    setHeat(0);
    if (world.district?.id === id) { const sp = world.spawnPoints.player; player.teleport(sp.x, sp.z, Math.PI); rig.target.copy(player.pos); rig.snap(); return; }
    G.districts.travel(id, { via: 'dev' });
  }
  function setHeat(n) {
    const S = G.sim.state;
    S.factions.heat = n ? n - 0.05 : 0;
    G.sim.events.emit('heat', { stars: n, changed: true });
    if (!n) G.heat?.standDown?.();
  }
  // story checkpoint: every earlier mission completed through the sim (clues, reveals, flags, unlocks), level at the gate
  function jumpStory(id) {
    const idx = STORY_MISSIONS.findIndex((m) => m.id === id);
    if (idx < 0) { toast('Unknown mission', id); return false; }
    if (G.runner.active) G.runner.abandon();
    const S = G.sim.state, st = S.story;
    st.done = []; st.clues = []; st.reveals = []; st.flags = []; st.mission = STORY_MISSIONS[0].id;
    for (const m of STORY_MISSIONS.slice(0, idx)) { const fx = completeStory(st, m.id, {}); for (const d of fx?.unlocks || []) G.sim.unlockDistrict(d); }
    st.mission = id;
    Object.assign(S.flags, { introDone: true, kioskDone: true, boardUnlocked: true });
    setLevel(STORY_MISSIONS[idx].gate);
    if (STORY_MISSIONS[idx].gate >= 5 && !G.sim.ownedFrames().length) { G.sim.addCredits(G.sim.framePrice() || 1500, 'dev'); G.sim.buyFrame('brawler'); }
    setHeat(0);
    G.sim.refreshBoard();
    G.acceptCard(`story_${id}`);
    toast(`Story: ${STORY_MISSIONS[idx].title}`, id.toUpperCase().replace('_', '-'));
    return true;
  }
  function ownFrames() {
    setLevel(5);
    for (const f of OWNABLE_FRAMES) if (!G.sim.state.frames.some((x) => x.frameId === f)) { G.sim.addCredits(G.sim.framePrice() || 0, 'dev'); G.sim.buyFrame(f); }
  }
  function fillParts() {
    const S = G.sim.state, rng = createRng('dev|' + Date.now());
    for (const slot of ['chassis', 'core', 'weapon', 'optics', 'mobility', 'chip']) G.sim.addItem(rollItem(rng, { ilvl: S.player.level, slot, rarity: 'prototype' }), { silent: true });
    G.sim.equipBest();
    toast('Prototype parts equipped', `FR ${G.sim.frameFR()}`);
  }

  // ---- per-frame: god mode + one-hit kills ------------------------------------------------------------------
  G.devTick = () => {
    const sim = G.sim;
    if (!sim) return;
    if (!sim.__devHit) {
      const hit = sim.hit;
      sim.hit = (a, d, s, o) => {
        const r = hit(a, d, s, o);
        if (D.oneHit && a?.kind === 'player' && d?.kind === 'enemy' && r?.hit && d.alive) { d.hp = 0; d.shield = 0; d.alive = false; r.killed = true; }
        return r;
      };
      sim.__devHit = true;
    }
    if (!D.god) return;
    const pc = sim.playerCombatant();
    pc.invulnerable = true; pc.alive = true;
    pc.hp = pc.stats.hp; pc.shield = pc.stats.shield; pc.energy = pc.stats.energy;
    for (const k in pc.cooldowns) pc.cooldowns[k] = 0;
  };

  // ---- UI -----------------------------------------------------------------------------------------------------
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const btn = document.createElement('button'); btn.className = 'hfdev-btn'; btn.textContent = 'DEV';
  const panel = document.createElement('div'); panel.className = 'hfdev';
  document.body.append(btn, panel);
  const tap = (el, fn) => el.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  ['pointerdown', 'touchstart'].forEach((ev) => { btn.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); });
  tap(btn, () => { D.open = !D.open; render(); });

  function section(title, items) {
    const h = document.createElement('h3'); h.textContent = title;
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, fn, cls] of items) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; tap(b, () => { if (!G.sim) { toast('Start a game first'); return; } fn(); render(); }); row.append(b); }
    panel.append(h, row);
  }
  function render() {
    btn.classList.toggle('god', D.god);
    panel.classList.toggle('show', D.open);
    if (!D.open) return;
    panel.innerHTML = '';
    const top = document.createElement('div'); top.className = 'top';
    const S = G.sim?.state;
    top.innerHTML = `<b>DEV MODE</b><span class="stat">${S ? `L${S.player.level} · ${S.credits} cr · ${G.districts?.id} · ${S.story.mission}` : 'title screen'}</span>`;
    const close = document.createElement('button'); close.textContent = 'Close'; tap(close, () => { D.open = false; render(); });
    top.append(close); panel.append(top);
    section('Cheats', [
      ['God mode', () => { D.god = !D.god; if (!D.god && G.sim) G.sim.playerCombatant().invulnerable = false; }, D.god ? 'on' : ''],
      ['One-hit kills', () => { D.oneHit = !D.oneHit; }, D.oneHit ? 'on' : ''],
      ['Speed ×1', () => G.setSpeed(1), G.speed === 1 ? 'on' : ''], ['Speed ×3', () => G.setSpeed(3), G.speed === 3 ? 'on' : ''],
    ]);
    section('Start point (relay there)', (world.districts || []).map((id) => [DISTRICT_NAMES[id] || DISTRICTS[id]?.name || id, () => { D.open = false; goDistrict(id); }, G.districts?.id === id ? 'here' : '']));
    section('Story checkpoint', staged().map((m) => [`${m.id.toUpperCase().replace('_', '-')} ${m.title}`, () => { D.open = false; jumpStory(m.id); }, S?.story.mission === m.id ? 'here' : '']));
    section('Economy', [
      ['+1,000 cr', () => G.sim.addCredits(1000, 'dev')], ['+10,000 cr', () => G.sim.addCredits(10000, 'dev')], ['+100,000 cr', () => G.sim.addCredits(100000, 'dev')],
      ['Own all frames', ownFrames], ['Fill parts', fillParts],
    ]);
    section('Level', [5, 8, 10, 15, 20, 30].map((n) => [`L${n}`, () => setLevel(n), S?.player.level >= n ? 'on' : '']).concat([['+1', () => setLevel((G.sim.state.player.level || 1) + 1)]]));
    section('Heat', [0, 1, 2, 3, 4, 5].map((n) => [`${n}★`, () => setHeat(n)]));
  }

  // ---- URL shortcut: ?dev=1&district=portside&mission=A2-M1 → straight into play -------------------------------------
  async function autostart() {
    const district = Q.get('district'), mission = storyIdFromUrl(Q.get('mission'));
    if (!district && !mission) return false;
    let sim = null;
    if (!Q.has('fresh')) { try { sim = loadGame({ store, sites }); } catch (e) { sim = null; } }
    if (!sim) { store.clear?.(); sim = createSim({ seed: Q.get('seed') || 'dev', store, sites }); }
    Object.assign(sim.state.flags, { introDone: true, kioskDone: true, boardUnlocked: true });
    const here = world.district?.id;
    if (district && here) { G.keepDistrict = true; if (DISTRICTS[here]) { sim.unlockDistrict(here); sim.state.districts.current = here; } }
    startSession(sim);
    G.keepDistrict = false;
    G.state = 'free';
    ui?.hideHud?.(false);
    if (mission) setTimeout(() => jumpStory(mission), 300);
    toast('Dev start', `${DISTRICT_NAMES[here] || here}${mission ? ' · ' + mission : ''}`);
    return true;
  }

  render();
  return Object.assign(D, { autostart, goDistrict, jumpStory, setLevel, setHeat, ownFrames, fillParts, render });
}
