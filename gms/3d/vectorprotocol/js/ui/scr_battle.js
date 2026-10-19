// Battle screen: the battle agent's 3D scene when available (createBattleScene), else the sim stepper
// played on a flat "tactical feed" board. Either way the HUD is driven by sim-shaped `state`.
import { h, fmt } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { load } from '../app/modules.js';
import { data, unitDef } from '../app/data.js';
import { createHud } from './hud.js';
import { modsText } from './scr_formation.js';
import { hint, hintSeen } from './tutorial.js';
import { snd, audioReady } from '../app/sound.js';
import { orient } from '../app/orient.js';
import { DEV } from '../app/store.js';
import { btn } from './components.js';

// same rule as js/battle/battle.js picks the arena: the session theme (level.realm || map.realm, or a map theme alias),
// else a wave made mostly of realm:'fantasy' units
const FANTASY = new Set(['fantasy', 'forest', 'verdance', 'rift', 'ruins']);
export function hudTheme(B) {
  const t = (typeof B.theme === 'string' && B.theme) || (typeof B.arena === 'string' && B.arena) || B.arena?.theme || B.realm;
  if (t) return FANTASY.has(t) ? 'fantasy' : 'scifi';
  let n = 0, f = 0;
  const D = data();
  for (const w of B.enemyWaves || []) for (const u of w?.units || []) {
    const id = typeof u?.def === 'string' ? u.def : u?.def?.id;
    const d = u?.def?.realm ? u.def : (id && (D?.enemies?.[id] || D?.units?.[id])) || null;
    n++; if ((u?.realm || d?.realm) === 'fantasy') f++;
  }
  return n && f / n > 0.5 ? 'fantasy' : 'scifi';
}

export async function mount(root, ctx) {
  const { store, router, engine, portraits } = ctx;
  const B = ctx.session.battle;
  if (!B) { router.go('/hub', { replace: true }); return {}; }
  if (B.consumed) { router.go(B.kind === 'story' ? '/map/' + B.mapIndex : '/hub', { replace: true }); return {}; }
  B.consumed = true;

  const speed0 = store.settings.speed || 1, auto0 = store.settings.auto !== false;
  let ctl = null, scene = null, ended = false, paused = false;

  const hud = createHud(root, {
    portraits, theme: hudTheme(B), speed: speed0, auto: auto0, slots: store.state.slots,
    onSpeed: (s) => { ctl?.setSpeed(s); store.setSetting('speed', s); },
    onAuto: (a) => { ctl?.setAuto(a); store.setSetting('auto', a); },
    onFire: (id) => { if (ctl?.fireOverdrive(id)) hud.fired(id); },
    onMenu: () => pauseMenu(),
    onSquad: () => statsModal(),
    onInfo: () => infoModal(),
  });

  hud.setMode(orient.mode);   // before the scene reads hud.margins()
  window.__vp.hud = hud;
  // tutorial: the first time an Overdrive charges, point at the glowing portrait and the AUTO toggle
  let odHinted = false;
  // AUTO off and a charged Overdrive left untapped for 1.5 s: point at it once, ever (sim-4: m1_l4 drops to ~19 % without taps)
  let readySince = 0, manualHinted = hintSeen(store, 'od_manual') || store.settings.hints === false;
  const manualNudge = (s) => {
    if (manualHinted || hud.auto || ended || s?.done) { readySince = 0; return; }
    const u = s?.player?.units?.find((x) => x.alive && x.overdriveReady);
    if (!u) { readySince = 0; return; }
    if (!readySince || document.querySelector('.tut-tip')) { readySince ||= performance.now(); return; }
    if (performance.now() - readySince < 1500) return;
    manualHinted = true;
    const card = root.querySelector('.pc[data-id="' + u.id + '"]');
    hint(store, 'od_manual', card, 'Overdrive ready! AUTO is off, so it waits for you: tap the glowing portrait to fire it.', { force: true, delay: 0, life: 8000, compact: true, width: 250 });
  };
  const onState = (s) => {
    hud.update(s);
    manualNudge(s);
    // AUTO fires on the tick it charges, so 'ready' is rarely visible: trigger just before full charge
    const near = (u) => u.alive && (u.overdriveReady || (u.chargePct || 0) >= 0.85);
    if (odHinted || ended || s?.done || !s?.player?.units?.some(near)) return;
    odHinted = true;
    const u = s.player.units.find(near);
    const card = root.querySelector('.pc[data-id="' + u.id + '"]');
    // compact + no dimming: it sits just above the strip and covers as little of the board as it can
    hint(store, 'overdrive', card, hud.auto ? 'Gold bar = Overdrive charge. AUTO fires it when full; turn AUTO off to tap the glowing portrait yourself.' : 'Overdrive charging: tap the portrait when it glows.', { delay: 50, life: 7000, compact: true, width: 250 });
  };

  // D26 battle intro (camera fly-in, battle-owned): off when the setting is off, under ?dev&nointro, and on a replay of a contract
  // already fought this session (Retry/Replay from results goes straight into the fight)
  const seenIntro = (ctx.session.introSeen ||= new Set());
  const introKey = (B.kind || 'story') + ':' + (B.levelId || B.title || '');
  const wantIntro = store.settings.battleIntro !== false && !(DEV && new URLSearchParams(location.search).has('nointro')) && !seenIntro.has(introKey);
  seenIntro.add(introKey);

  const battleMod = engine ? await load('battle') : null;
  await Promise.race([audioReady, new Promise((r) => setTimeout(r, 1500))]);
  const au = snd.forBattle(B);   // starts the battle/boss/rift track; null without js/audio
  if (battleMod?.createBattleScene) {
    try {
      scene = battleMod.createBattleScene(engine, { playerSquad: B.player, enemyWaves: B.enemyWaves, seed: B.seed, goals: B.goals, arena: B.arena, theme: B.theme, data: B.data || data(), auto: auto0, overlay: root, speed: speed0, ...(au ? { audio: au } : {}), intro: wantIntro, margins: hud.margins() || { top: 64, bottom: 150 } });
      ctl = {
        setSpeed: (s) => scene.setSpeed(s), setAuto: (a) => scene.setAuto(a), fireOverdrive: (id) => scene.fireOverdrive(id),
        pause: (p) => { if (scene.setPaused) scene.setPaused(p); else if (p) engine.stop(); else engine.start(); },
        forfeit: () => !!scene.forfeit?.(),   // true = the scene plays WITHDRAWN and fires 'end' itself
        get state() { return scene.state; },
      };
      hud.setBanners(false);   // the 3D overlay owns ROUND / Overdrive / VICTORY banners
      scene.on('state', onState);
      scene.on('end', (r) => onEnd(r?.result || r));
      scene.setSpeed(speed0); scene.setAuto(auto0);
    } catch (e) { console.warn('[battle] 3D scene failed, using tactical feed', e); scene = null; }
  }
  if (!scene) ctl = await tacticalFeed(root, ctx, B, hud, onEnd, { speed: speed0, auto: auto0, onState });
  if (!ctl) { root.append(h('div.scr-error', 'Combat sim offline')); return { topbar: false }; }
  // the board camera fits the gap between my real HUD bars (heights vary with safe-area insets and phone width)
  const fitMargins = () => {
    if (!scene?.setMargins) return;
    const m = hud.margins();
    if (m) scene.setMargins(m);
  };
  const ro = new ResizeObserver(fitMargins);
  ro.observe(root); ro.observe(hud.strip); ro.observe(hud.rail);   // the strip grows when a small squad gets bigger cards
  requestAnimationFrame(fitMargins);
  // rotation: same HUD nodes, new layout; the scene refits from the new margins (no restart, docs/LANDSCAPE.md §1.4)
  // Back / Forward during the fight opens the pause sheet instead of silently dropping the battle (QA Q16)
  const offGuard = (router.setGuard || (() => () => {}))(() => { if (ended) return true; if (!paused) pauseMenu(); return false; });
  // returning to a backgrounded tab: the fight was frozen by the browser, so offer the pause sheet first (QA Q23)
  const onVis = () => { if (document.visibilityState === 'visible' && !ended && !paused && ctl) pauseMenu(); };
  document.addEventListener('visibilitychange', onVis);
  const offOrient = orient.on(({ mode }) => { hud.setMode(mode); fitMargins(); requestAnimationFrame(fitMargins); });
  hud.update(ctl.state);
  if (!scene) setTimeout(() => hud.flash(B.title || 'Engage', 'big'), 150);
  if (scene) {
    Promise.resolve(scene.ready).then(() => { scene.start?.(); if (wantIntro) introUi(); }).catch(async (e) => {
      console.warn('[battle] 3D scene failed to load, switching to tactical feed', e);
      if (ended) return;
      ctx.screens.setScene(null);
      document.getElementById('screen-bg').className = 'on';
      scene = null;
      ctl = await tacticalFeed(root, ctx, B, hud, onEnd, { speed: hud.speed, auto: hud.auto, onState });
    });
  }

  // SKIP / DON'T SHOW AGAIN while the intro plays; feature-detected (D19): without the battle API nothing shows
  let introEl = null;
  function introUi() {
    if (!scene || ended) return;
    let done = null;
    if ('introActive' in scene) {
      if (!scene.introActive && typeof scene.playIntro === 'function') done = Promise.resolve(scene.playIntro({ strength: orient.landscape ? 1 : 0.6 }));
    } else if (typeof scene.playIntro === 'function') done = Promise.resolve(scene.playIntro({ strength: orient.landscape ? 1 : 0.6 }));
    else return;
    const active = () => !ended && (scene.introActive ?? !!done);
    if (!active()) return;
    const finish = () => {
      if (!introEl) return;
      hud.el.classList.remove('intro'); hud.el.classList.add('intro-out');
      introEl.remove(); introEl = null;
    };
    const skip = () => { try { scene.skipIntro?.(); } catch (e) { /* battle owns it */ } finish(); };
    introEl = h('div.bi-bar',
      btn("Don't show again", () => { store.setSetting('battleIntro', false); skip(); ctx.toast('Battle intro off · turn it back on in Settings'); }, { cls: 'sm bi-never' }),
      btn('Skip', skip, { cls: 'sm primary bi-skip', icon: 'ffwd' }));
    const place = () => { if (introEl && !orient.landscape) introEl.style.bottom = ((hud.margins()?.bottom ?? 150) + 8) + 'px'; else if (introEl) introEl.style.bottom = ''; };
    root.appendChild(introEl); place();
    hud.el.classList.add('intro');
    done?.then(finish, finish);
    const poll = () => { if (!introEl) return; if (!active()) finish(); else { place(); setTimeout(poll, 150); } };
    setTimeout(poll, 300);
  }

  function onEnd(result) {
    if (ended) return; ended = true;
    if (!scene) hud.flash(result?.win ? 'Victory' : 'Defeat', result?.win ? 'win' : 'loss');   // the 3D scene shows its own
    setTimeout(() => {
      ctx.session.result = { battle: B, result };
      router.go('/results', { replace: true });
    }, scene ? 900 : 1600);
  }

  async function pauseMenu() {
    paused = true; ctl.pause(true);
    const v = await ctx.modal({ title: 'Paused', body: 'Combat feed suspended.', actions: [{ label: 'Retreat', value: 'quit', cls: 'danger' }, { label: 'Resume', value: 'go', cls: 'primary' }] });
    paused = false; ctl.pause(false);
    if (v !== 'quit' || ended) return;
    const fallback = () => onEnd({ win: false, stars: 0, reason: 'retreat', integrity: ctl.state?.player?.integrity ?? 0 });
    if (scene && ctl.forfeit()) setTimeout(fallback, 4000);   // normally the scene's 'end' arrives first
    else fallback();
  }
  function statsModal() {
    const s = ctl.state;
    const rows = (s?.player?.units || []).map((u) => h('div.row.bstat', roleBadge(u.role), h('b.grow', u.name), h('small', 'Lv' + u.level),
      h('b', { style: { color: u.alive ? 'var(--hp)' : 'var(--red)' } }, u.alive ? Math.round(u.hpPct * 100) + '%' : 'DOWN')));
    ctx.modal({ title: 'Squad status', body: h('div.col', rows) });
  }
  function infoModal() {
    const s = ctl.state;
    const syn = s?.player?.synergies || [];
    ctx.modal({ title: 'Battle intel', body: h('div.col',
      h('div.vp-kicker', 'Active synergies'), syn.length ? syn.map((x) => h('div', h('b', x.name), ' ', h('small.t-muted', modsText(x.mods)))) : h('small.t-muted', 'None'),
      h('div.vp-kicker', 'Counters'), h('small', 'Archer › Mage › Tank › Archer (counter bonus)'),
      h('div.vp-kicker', 'Controls'), h('small', auto0 ? 'AUTO fires Overdrives as they charge. Turn it off to time them yourself — tap a glowing portrait.' : 'Tap a glowing portrait to fire its Overdrive.')) });
  }

  return {
    scene, topbar: false, bg: scene ? 'off' : 'on',
    unmount() { ended = true; ro.disconnect(); offOrient(); offGuard(); document.removeEventListener('visibilitychange', onVis); if (window.__vp.hud === hud) window.__vp.hud = null; ctl?.dispose?.(); hud.dispose(); },
  };
}

// --- fallback: run the pure sim and draw a flat board (no WebGL needed)
async function tacticalFeed(root, ctx, B, hud, onEnd, { speed, auto, onState = hud.update }) {
  const sim = await load('sim_battle');
  if (!sim?.createBattle) return null;
  let battle;
  try { battle = sim.createBattle({ data: B.data || data(), player: B.player, enemyWaves: B.enemyWaves, seed: B.seed, goals: B.goals, auto }); }
  catch (e) { console.error('[battle] sim failed', e); return null; }
  const field = h('div.tf-field', h('div.tf-line'), h('div.tf-tag', icon('target'), 'Tactical feed'));
  root.prepend(field);
  const tokens = new Map();
  let spd = speed, paused = false, raf = 0, last = performance.now(), acc = 0, alive = true;
  const fx = h('div.tf-fx'); field.appendChild(fx);

  function token(u) {
    const t = h('div.tf-u' + (u.side === 'enemy' ? '.foe' : ''), { dataset: { faction: u.rarity === 'legendary' ? 'legendary' : u.faction } },
      h('div.tf-plate'), h('div.tf-body', icon(u.role)), h('div.tf-hp', h('div.tf-hd', roleBadge(u.role, u.side === 'enemy')), h('div.tf-bar', h('i'))));
    field.appendChild(t);
    return t;
  }
  function place(u, t) {
    // screen: centre line vertical; front col next to it; far lane at top (perspective-ish scale)
    const side = u.side === 'enemy' ? 1 : -1;
    const x = 50 + side * (14 + u.slot.col * 22) + (u.slot.lane - 1) * side * -2;
    const y = 78 - u.slot.lane * 22;
    t.style.left = x + '%'; t.style.top = y + '%';
    t.style.setProperty('--sc', (1.08 - u.slot.lane * 0.12).toFixed(2));
  }
  function draw(s, evs) {
    const seen = new Set();
    for (const u of [...s.player.units, ...s.enemy.units]) {
      seen.add(u.id);
      let t = tokens.get(u.id);
      if (!t) { t = token(u); tokens.set(u.id, t); place(u, t); }
      t.querySelector('.tf-bar i').style.transform = 'scaleX(' + Math.max(0, u.hpPct).toFixed(3) + ')';
      t.classList.toggle('dead', !u.alive);
      t.classList.toggle('od', !!u.overdriveReady);
    }
    for (const [id, t] of tokens) if (!seen.has(id)) { t.remove(); tokens.delete(id); }
    for (const e of evs || []) {
      if (e.type === 'hit' || e.type === 'damage') { const t = tokens.get(e.dst); if (t) { t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit'); if (e.amount && store().settings.damageNumbers) num(t, e.amount, e.crit); } }
      if (e.type === 'ability' || e.type === 'overdrive') { const t = tokens.get(e.src); if (t && (e.kind === 'overdrive' || e.type === 'overdrive')) { t.classList.add('cast'); setTimeout(() => t.classList.remove('cast'), 500); } }
      if (e.type === 'end') onEnd(e.result);
    }
  }
  const store = () => ctx.store;
  function num(t, n, crit) {
    const d = h('div.tf-num' + (crit ? '.crit' : ''), fmt(n));
    d.style.left = t.style.left; d.style.top = t.style.top;
    fx.appendChild(d); setTimeout(() => d.remove(), 900);
  }
  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused || battle.done) return;
    acc += dt * spd * battle.tps;
    const n = Math.floor(acc); acc -= n;
    if (n > 0) { const evs = battle.step(n); draw(battle.state, evs); onState(battle.state); }
  }
  draw(battle.state, []);
  raf = requestAnimationFrame(loop);
  window.__vp.battle = battle;
  return {
    get state() { return battle.state; },
    setSpeed(s) { spd = s; }, setAuto(a) { battle.setAuto(a); },
    fireOverdrive(id) { return battle.fireOverdrive(id); },
    pause(p) { paused = p; last = performance.now(); },
    dispose() { alive = false; cancelAnimationFrame(raf); if (window.__vp.battle === battle) window.__vp.battle = null; },
  };
}
