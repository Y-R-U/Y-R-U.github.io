/* SUNDERFALL — UI module entry.
 *
 *   import { createUI } from './ui/index.js';
 *   const ui = await createUI(ctx);        // main.js already probes for exactly this
 *   ui.update(dt);  ui.render(alpha);
 *
 * Split of responsibilities, and why:
 *
 *   canvas overlay (#sf-canvas)   cast circles, damage numbers, bars, boss bar, toasts, speech
 *                                 bubbles, virtual stick. These need per-frame animation, additive
 *                                 glow and world-anchored positions — all painful in DOM.
 *   DOM (#sf-ui)                  pause, settings, loadout, spell-choice cards, level-up banner,
 *                                 death. These need text layout, scrolling, focus order and
 *                                 keyboard/AT behaviour — all painful on a canvas.
 *
 * Both sit above the WebGL canvas. Nothing here draws through the renderer, so the UI works with a
 * dead or absent `R` (which is what ui-test.html exploits).
 *
 * The sim owns the truth; this is a mirror. When nothing is pushing into it the mirror ticks itself
 * so the HUD is never a still image.
 */

import { C, A, clamp01, clearGrads, txt, easeOutCubic } from './theme.js';
import { createState, loadSettings, saveSettings, xpForLevel, SLOT_UNLOCK } from './state.js';
import { createLayout } from './layout.js';
import { createPicker } from './picker.js';
import { drawCircle, circleFx, clearIconCache } from './circles.js';
import { drawResources, drawBoss, drawToasts, drawScreenFx, drawLevelBurst, drawWash, addBite } from './hud.js';
import { createBubbles, pushDamage, updateDamage, drawDamage, clearDamage, DMG } from './world.js';
import { createTouch } from './touch.js';
import { createOverlays } from './overlays.js';
import { FALLBACK_SPELLS, genericIcon } from './icons.js';

const DMG_KIND = {
  hit: DMG.NORMAL, normal: DMG.NORMAL, crit: DMG.CRIT, heal: DMG.HEAL,
  focus: DMG.FOCUS, player: DMG.PLAYER, break: DMG.BREAK,
};

let cssInjected = false;
function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const href = new URL('./ui.css', import.meta.url).href;
  if (document.querySelector('link[data-sf-ui]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.setAttribute('data-sf-ui', '1');
  document.head.appendChild(l);
}

export function createUI(ctx) {
  injectCss();

  const bus = ctx.bus;
  const view = ctx.view;
  const input = ctx.input;
  const st = createState();
  const L = createLayout();
  const settings = loadSettings();
  const offs = [];

  /* ---- spells ---- */
  let SPELLS = Object.create(null);
  function setSpells(reg) {
    const out = Object.create(null);
    for (const id in FALLBACK_SPELLS) out[id] = FALLBACK_SPELLS[id];
    if (reg) {
      const list = Array.isArray(reg) ? reg : Object.keys(reg).map((k) => reg[k]);
      for (const s of list) {
        if (!s || !s.id) continue;
        const base = FALLBACK_SPELLS[s.id];
        const merged = Object.assign({}, base || {}, s);
        merged.fallback = false;
        if (typeof merged.icon !== 'function') merged.icon = (base && base.icon) || genericIcon;
        out[s.id] = merged;
      }
    }
    SPELLS = out;
    clearIconCache();
    for (const sl of st.slots) if (sl.spellId) sl.spell = SPELLS[sl.spellId] || null;
    recomputeDrain();
  }
  setSpells(ctx.spells || (ctx.mods && ctx.mods.spells && ctx.mods.spells.SPELLS));

  /* ---- mount ---- */
  const mount = (ctx.dom && ctx.dom.ui) || document.getElementById('ui-root') || document.body;
  const cv = document.createElement('canvas');
  cv.id = 'sf-canvas';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
  mount.appendChild(cv);
  const c = cv.getContext('2d');

  let dpr = 1, cw = 0, ch = 0;
  function resize() {
    const w = (view && view.w) || window.innerWidth;
    const h = (view && view.h) || window.innerHeight;
    const d = Math.min(2, (view && view.dpr) || window.devicePixelRatio || 1);
    if (d !== dpr) clearIconCache();     // icon bitmaps are baked per dpr; size alone is stable
    dpr = d;
    cw = w; ch = h;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    clearGrads(c);
    L.update(view, wantTouch(), settings.leftHanded);
    if (touch) touch.remount();
  }

  function wantTouch() {
    if (forceTouch != null) return forceTouch;
    return (view && view.mode === 'portrait') || (input && input.touchActive) ||
      (input && input.lastSource === 'touch');
  }
  let forceTouch = null;

  /* ---- fx state ---- */
  const fx = { hurt: 0, spend: 0 };
  const burst = { t: 0, max: 1.1, x: null, y: null, seed: 0 };
  const toasts = [];
  const bubbles = createBubbles(resolveSpeakers());

  function resolveSpeakers() {
    const s = ctx.story || (ctx.mods && ctx.mods.story);
    return (s && (s.SPEAKER || (s.SCRIPT && s.SCRIPT.speakers))) || null;
  }

  /* ---- overlays + touch ---- */
  let assignMode = null;
  const overlays = createOverlays(ctx, L, st, {
    settings,
    setSetting(k, v) {
      settings[k] = v;
      saveSettings(settings);
      if (k === 'leftHanded') resize();
      bus && bus.emit('ui:settings', { key: k, value: v, settings });
    },
    knownSpells() {
      const out = [];
      for (const id of st.known) if (SPELLS[id]) out.push(SPELLS[id]);
      return out;
    },
    assign(i, id) { api.setSlot(i, id); },
    setAssignMode(id) { assignMode = id; },
    togglePause() { api.togglePause(); },
    // death does not set `paused`, so setPaused(false) can early-out — re-arm the controls directly
    restart() {
      api.setPaused(false); overlays.hideDeath();
      if (touch) touch.setEnabled(true);
      bus && bus.emit('ui:restart', {});
    },
    quit() {
      api.setPaused(false); overlays.hideDeath();
      if (touch) touch.setEnabled(true);
      bus && bus.emit('ui:quit', {});
    },
  });
  mount.appendChild(overlays.root);

  /* Swapping one spell used to mean opening the pause overlay. The circle you
     tapped already says which slot you mean, so show only that slot's options. */
  const picker = createPicker(ctx, L, st, {
    spells: () => SPELLS,
    assign(slot, id) { api.setSlot(slot, id); overlays.refreshPause(); },
  });

  const touch = createTouch(ctx, L, {
    onCirclePress(i, x, y) { pressCircle(i, x, y); },
    onCircleRelease(i) { st.slots[i].pressed = false; },
    // the picker floats over everything and eats the tap that dismisses it
    onPointerDown(x, y) { return picker.hit(x, y); },
  });

  /* The intro owns the screen and mounts in a sibling with no z-index, so the HUD — which needs a
     z-index to sit over the WebGL canvas — would otherwise paint on top of it. Stay hidden until a
     scene says otherwise. No scene machine (the harness) means show immediately. */
  let visible = true;
  function setVisible(v) {
    visible = v;
    cv.style.display = v ? '' : 'none';
    overlays.root.style.display = v ? '' : 'none';
  }
  if (ctx.scenes) setVisible(false);

  resize();
  if (view && view.onResize) offs.push(view.onResize(resize) || (() => {}));
  if (bus) offs.push(bus.on('view:change', resize));
  window.addEventListener('resize', resize);

  /* ---------------------------------------------------------------- *
   * Slot logic
   * ---------------------------------------------------------------- */

  function recomputeDrain() {
    let d = 0;
    for (let i = 1; i < 5; i++) {
      const s = st.slots[i];
      if (!s.spell || st.level < s.unlockLevel) continue;
      const cd = (s.spell.cooldown || 1);
      d += (s.spell.cost || 0) / cd;
    }
    st.focusDrain = d;
  }

  function pressCircle(i) {
    const s = st.slots[i];
    // A locked circle draws a keyhole and "LV 3", which reads as a button. It
    // was silent when pressed, so a player holding a spell they cannot place
    // had no way to learn why. Say it out loud.
    if (st.level < s.unlockLevel) {
      s.denyAt = now;
      api.toast('Circle ' + (i + 1) + ' opens at level ' + s.unlockLevel, { kind: 'warn', value: 'LV' + s.unlockLevel });
      return;
    }
    if (assignMode) { api.setSlot(i, assignMode); assignMode = null; overlays.refreshPause(); return; }
    // Nothing to swap to: the full loadout is the honest answer, since the
    // player has learned exactly one spell and it is already placed.
    const choices = (st.known ? st.known.length : 0) + (s.spellId && st.known.indexOf(s.spellId) < 0 ? 1 : 0);
    if (i !== 0) {
      if (choices > 1) picker.show(i); else overlays.openLoadout();
      return;
    }
    if (!s.spell) { if (choices > 0) picker.show(i); else overlays.openLoadout(); return; }
    s.pressed = true;
    api.tryCast(0);
  }

  /* ---------------------------------------------------------------- *
   * Public API
   * ---------------------------------------------------------------- */

  let now = 0;            // seconds of real time since boot, the clock every animation uses
  let paused = false;
  let source = null;      // optional pull adapter

  const api = {
    state: st,
    slots: st.slots,
    settings,
    layout: L,
    bubbles,
    picker,
    get spells() { return SPELLS; },
    setSpells,

    /** Point the HUD at a live object; called every frame, cheaper than pushing. */
    setSource(fn) { source = fn; st.driven = true; },

    /** Push authoritative numbers. Any field may be omitted. */
    setStats(o) {
      st.driven = true;
      for (const k in o) {
        if (k === 'level') { api.setLevel(o.level, true); continue; }
        if (k in st) st[k] = o[k];
      }
      if (o.hp != null && o.hp > st.hpGhost) st.hpGhost = o.hp;
      if (o.maxHp != null && st.hp > st.maxHp) st.hp = st.maxHp;
    },

    setLevel(lv, silent) {
      if (lv === st.level) return;
      const before = st.level;
      st.level = lv;
      st.xpNext = xpForLevel(lv);
      recomputeDrain();
      if (!silent && lv > before) api.levelUp(lv);
    },

    /** setSlot(i, spellId|null, rank?) — null clears the circle. */
    setSlot(i, spellId, rank) {
      const s = st.slots[i];
      if (!s) return;
      if (spellSys && spellSys.setSlot) {          // the system owns slots; the mirror picks it up
        if (spellId) spellSys.setSlot(i, spellId); else if (spellSys.clearSlot) spellSys.clearSlot(i);
        bus && bus.emit('ui:assign', { slot: i, spellId: spellId || null });
        return;
      }
      s.spellId = spellId || null;
      s.spell = spellId ? (SPELLS[spellId] || null) : null;
      s.rank = rank || st.ranks[spellId] || 1;
      s.cd = 0; s.cdMax = 0;
      s.readyAt = now;
      if (spellId && st.known.indexOf(spellId) < 0) st.known.push(spellId);
      recomputeDrain();
      bus && bus.emit('ui:assign', { slot: i, spellId: s.spellId });
    },

    setRank(spellId, rank) {
      st.ranks[spellId] = rank;
      for (const s of st.slots) if (s.spellId === spellId) s.rank = rank;
    },

    learn(spellId, rank) {
      if (st.known.indexOf(spellId) < 0) st.known.push(spellId);
      st.ranks[spellId] = rank || st.ranks[spellId] || 1;
      const sp = SPELLS[spellId];
      api.toast(sp ? sp.name : spellId, { kind: 'spell', value: 'LEARNED' });
      // first empty unlocked circle takes it, so a new spell is never invisible.
      // When spells/system.js is bound it has already done this — do not fight it.
      if (!spellSys) {
        for (let i = 0; i < 5; i++) {
          const s = st.slots[i];
          if (!s.spellId && st.level >= s.unlockLevel) { api.setSlot(i, spellId, st.ranks[spellId]); break; }
        }
      }
      overlays.refreshPause();
    },

    setCooldown(i, secs, maxSecs) {
      const s = st.slots[i];
      if (!s) return;
      s.cd = secs;
      s.cdMax = maxSecs || Math.max(secs, s.cdMax || secs);
    },

    /** Fire the presentation for a cast. The sim should call this (or emit `spell:cast`). */
    onCast(i, opts) {
      const s = st.slots[i];
      if (!s || !s.spell) return;
      const cd = (opts && opts.cooldown) || s.spell.cooldown || 1;
      const cost = (opts && opts.cost != null) ? opts.cost : (s.spell.cost || 0);
      s.cd = cd; s.cdMax = cd;
      s.castAt = now;
      circleFx.onCast(s, L.circles[i], s.spell);
      if (cost > 0) {
        const before = st.focus / st.maxFocus;
        if (!st.driven) st.focus = Math.max(0, st.focus - cost);
        addBite(before, Math.max(0, before - cost / st.maxFocus),
          A(schoolCss(s.spell.school) || C.arc, 0.85));
      }
      if (i === 0) {
        st.focusHoldUntil = st.simTime + 0.8;
        fx.spend = 1;
      }
    },

    /** Player-driven attempt on a circle. Returns false and plays the refusal if it can't go. */
    tryCast(i) {
      const s = st.slots[i];
      if (!s || !s.spell) return false;
      const cost = s.spell.cost || 0;
      if (s.cd > 0 || st.focus < cost) { s.denyAt = now; return false; }
      bus && bus.emit('ui:cast', { slot: i, spellId: s.spellId, auto: true, cost });
      // presentation runs immediately; the sim re-affirms it with spell:cast if it agrees
      api.onCast(i);
      return true;
    },

    damage(x, y, value, kind) {
      if (!settings.damageNumbers) return;
      if (!(Math.abs(value) >= 1)) return;    // a floating "0" is noise, not feedback
      pushDamage(x, y, value, DMG_KIND[kind] != null ? DMG_KIND[kind] : DMG.NORMAL);
    },

    toast(text, o) {
      toasts.push({ text, value: (o && o.value) || '', kind: (o && o.kind) || 'info', at: now, life: (o && o.life) || 3.2 });
      if (toasts.length > 4) toasts.shift();
    },

    /** say({who,text,dur,x,y,anchor}) — x/y are world coordinates. */
    say(b) { return bubbles.say(b); },

    boss(b) {
      if (!b) { if (st.boss) st.boss.closing = true; return; }
      st.boss = Object.assign({ show: 0, ghost: b.hp, hitAt: -9, phases: [0.33, 0.66] }, b);
    },
    bossDamage(hp) {
      if (!st.boss) return;
      st.boss.hp = Math.max(0, hp);
      st.boss.hitAt = now;
    },

    levelUp(level, unlockText) {
      st.level = level;
      st.xp = 0;
      st.xpNext = xpForLevel(level);
      recomputeDrain();
      burst.t = burst.max; burst.seed = Math.random() * 7;
      const p = playerScreen();
      burst.x = p.x; burst.y = p.y;
      let unlock = unlockText;
      if (!unlock) {
        const idx = SLOT_UNLOCK.indexOf(level);
        if (idx > 0) unlock = 'Cast circle ' + (idx + 1) + ' unlocked';
      }
      overlays.showLevelUp(level, unlock);
      if (ctx.R && ctx.R.fx && settings.flashes) {
        ctx.R.fx.flash(1, 0.8, 0.4, 0.16, 0.3);
        ctx.R.fx.chroma(0.4, 0.3);
      }
      if (idxUnlockSlot(level) >= 0) {
        const i = idxUnlockSlot(level);
        st.slots[i].readyAt = now;
        circleFx.onReady(st.slots[i], L.circles[i], st.slots[i].spell);
      }
    },

    /** offerSpells(['emberbolt', ...] | [spellObj]) -> Promise<id|null> */
    offerSpells(list) {
      const objs = list.map((s) => (typeof s === 'string' ? SPELLS[s] : s)).filter(Boolean);
      if (!objs.length) return Promise.resolve(null);
      return overlays.offer(objs).then((id) => {
        if (id) {
          const had = st.known.indexOf(id) >= 0;
          if (had) api.setRank(id, (st.ranks[id] || 1) + 1);
          else api.learn(id);
          bus && bus.emit('ui:spell-chosen', { id, rankUp: had });
        }
        return id;
      });
    },

    setPaused(v) {
      if (v === paused) return;
      paused = v;
      if (v) overlays.openPause(); else overlays.closePause();
      if (touch) touch.setEnabled(!v);
      bus && bus.emit('ui:pause', { paused: v });
    },
    togglePause() { api.setPaused(!paused); },
    get paused() { return paused; },
    /** True whenever something on top of the game must stop the world: the pause
     *  menu, the spell offer, the death screen. main.js gates the sim on this. */
    get blocked() { return paused || overlays.blocking || picker.isOpen; },

    death(stats) {
      overlays.showDeath(Object.assign({ level: st.level, runTime: st.runTime, kills: st.kills, broken: st.broken }, stats));
      if (touch) touch.setEnabled(false);
    },

    /** For the harness and for a scene that wants the controls forced on or off. */
    setTouch(v) { forceTouch = v; resize(); },
    /** Wipe the run mirror back to a fresh run — used by the death screen's Again. */
    reset() {
      clearDamage(); bubbles.clear(); toasts.length = 0; picker.close();
      st.boss = null; burst.t = 0; fx.hurt = 0; fx.spend = 0;
      st.hp = st.maxHp; st.hpGhost = st.maxHp;
      st.focus = st.maxFocus;
      st.kills = 0; st.broken = 0; st.runTime = 0;
      st.inCombat = false;
      // nothing may survive into the new run holding the screen
      overlays.hideDeath();
      overlays.cancelChoice();
      overlays.closePause();
      assignMode = null;
      paused = false;
      if (touch) touch.setEnabled(true);
    },

    update, render, destroy,
  };

  function idxUnlockSlot(level) { return SLOT_UNLOCK.indexOf(level); }
  const SCHOOL_CSS = { fire: '#ff8a3d', storm: '#7fd9ff', earth: '#d0a961', decay: '#9ede5a', void: '#b57cff', life: '#ff90b2' };
  function schoolCss(school) { return SCHOOL_CSS[school] || null; }

  const _ps = { x: 0, y: 0 };
  function playerScreen() {
    const p = ctx.player || (ctx.sim && ctx.sim.player);
    if (p && view && view.toScreen) { view.toScreen(p.x, p.y, _ps); return _ps; }
    _ps.x = cw * 0.5; _ps.y = ch * 0.5;
    return _ps;
  }

  /* ---------------------------------------------------------------- *
   * Screen-shake / flash settings are only real if they gate the engine.
   * Wrapped once, restored on destroy.
   * ---------------------------------------------------------------- */
  let unwrapFx = null;
  if (ctx.R && ctx.R.fx) {
    const f = ctx.R.fx;
    const shake0 = f.shake.bind(f), flash0 = f.flash.bind(f), chroma0 = f.chroma.bind(f);
    f.shake = (s, t) => shake0(s * settings.shake, t);
    f.flash = (r, g, b, a, t) => flash0(r, g, b, settings.flashes ? a : a * 0.25, t);
    f.chroma = (a, t) => chroma0(settings.flashes ? a : a * 0.3, t);
    unwrapFx = () => { f.shake = shake0; f.flash = flash0; f.chroma = chroma0; };
  }

  /* ---------------------------------------------------------------- *
   * Bus wiring
   * ---------------------------------------------------------------- */
  if (bus) {
    /* Damage-over-time ticks every fixed step: a burn is ~0.15 hp a tick, which
       `Math.round`ed to a screen full of 0s. Bank the fractions and only throw a
       number once a whole point of health has actually gone. */
    let dotBank = 0;
    offs.push(bus.on('player:damage', (e) => {
      if (e.hp != null) st.hp = e.hp;
      else if (e.amount != null) st.hp = Math.max(0, st.hp - e.amount);
      if (e.maxHp != null) st.maxHp = e.maxHp;
      const amt = e.amount || 0;
      // the screen pulse scales with the hit instead of flashing hard on a tick
      fx.hurt = Math.max(fx.hurt, Math.min(1, Math.max(0.10, amt / Math.max(1, st.maxHp) * 6)));
      if (e.amount != null && e.x != null) {
        dotBank += amt;
        if (dotBank >= 1) {
          api.damage(e.x, e.y, Math.round(dotBank), 'player');
          dotBank = 0;
        }
      }
    }));
    offs.push(bus.on('player:heal', (e) => {
      if (e.hp != null) st.hp = e.hp; else st.hp = Math.min(st.maxHp, st.hp + (e.amount || 0));
      if (e.x != null) api.damage(e.x, e.y, Math.round(e.amount || 0), 'heal');
    }));
    offs.push(bus.on('player:level', (e) => {
      const unlock = e.unlock || (e.unlockedCircle ? 'Cast circle ' + e.unlockedCircle + ' unlocked' : '');
      api.levelUp(e.level || st.level + 1, unlock);
    }));
    offs.push(bus.on('player:died', () => api.death({})));
    offs.push(bus.on('spell:cast', (e) => {
      const i = e.slot != null ? e.slot : st.slots.findIndex((s) => s.spellId === e.id);
      if (i >= 0) api.onCast(i, e);
    }));
    offs.push(bus.on('spell:hit', (e) => {
      if (e.damage != null && e.x != null) api.damage(e.x, e.y, Math.round(e.damage), e.crit ? 'crit' : 'hit');
    }));
    offs.push(bus.on('spell:learn', (e) => api.learn(e.id, e.rank)));
    offs.push(bus.on('hint:blocked', (e) => {
      api.toast(e.text, { kind: 'warn', value: e.action, life: 2.6 });
    }));
    offs.push(bus.on('hint:tip', (e) => {
      api.toast(e.text, { kind: e.kind || 'info', value: e.value || '', life: e.life || 3.6 });
    }));
    /* Rook talking to himself. The bubble tracks him rather than sitting where
       he was, so a line survives the run he says it during. */
    offs.push(bus.on('bark', (e) => {
      const p = ctx.world && ctx.world.player;
      if (!p || !p.alive || !e.text) return;
      const who = e.who || 'rook';
      bubbles.say({
        who, text: e.text, size: 13.5,
        // anyone who is not him speaks from the other side, so a two-hander
        // (the ward, on the first Again) does not stack in one place
        ax: who === 'rook' ? 60 : -60, ay: who === 'rook' ? -170 : -215,
        anchor: () => ({ x: p.x, y: p.y - 40 }),
      });
    }));
    offs.push(bus.on('spell:unplaced', (e) => {
      const sp = SPELLS[e.id];
      api.toast((sp ? sp.name : e.id) + ' — no free circle' +
        (e.nextCircleLevel ? ', next opens at level ' + e.nextCircleLevel : ''), { kind: 'warn', value: 'HELD' });
    }));
    offs.push(bus.on('spell:levelup', (e) => {
      api.setRank(e.id, e.rank);
      const sp = SPELLS[e.id];
      api.toast((sp ? sp.name : e.id) + ' rank ' + e.rank, { kind: 'shard', value: 'R' + e.rank });
    }));
    offs.push(bus.on('enemy:died', (e) => {
      st.kills++;
      if (e && e.xp) { st.xp += e.xp; if (st.xp >= st.xpNext) api.levelUp(st.level + 1); }
    }));
    offs.push(bus.on('terrain:break', () => { st.broken++; }));
    offs.push(bus.on('prop:break', () => { st.broken++; }));
    offs.push(bus.on('pickup', (e) => {
      api.toast(e.text || e.name || 'Picked up', { kind: e.kind || 'shard', value: e.value ? String(e.value) : '' });
      if (e.kind === 'shard') st.shards++;
    }));
    offs.push(bus.on('story:beat', (e) => bubbles.say(e)));
    offs.push(bus.on('scene:change', (e) => {
      const play = e.name === 'play';
      setVisible(play || e.name === 'gameover');
      overlays.setPauseBtnVisible(play);
    }));
    offs.push(bus.on('intro:done', () => setVisible(true)));
  }

  /* ---------------------------------------------------------------- *
   * spells/system.js binding.
   *
   * That module owns circles, focus, XP, levels and the pick-1-of-3 offer. Once it exists the HUD
   * stops simulating anything and becomes a pure mirror of it, pulled every fixed step. Without
   * this the HUD would happily display a second, wrong copy of the game state.
   * ---------------------------------------------------------------- */
  let spellSys = null;

  function bindSpellSystem(S) {
    if (!S || spellSys === S) return;
    spellSys = S;
    st.driven = true;
    if (S.manualEnabled === false) { /* the UI owns the cast button; nothing to do */ }
    source = () => {
      st.focus = S.focus;
      st.maxFocus = S.focusMax || 100;
      st.focusRegen = S.focusRegen || 12;
      // regenPause is seconds remaining; the HUD wants an absolute stamp on its own clock
      st.focusHoldUntil = S.regenPause > 0 ? st.simTime + S.regenPause : 0;
      st.shards = S.shards || 0;
      if (S.level && S.level !== st.level) { st.level = S.level; recomputeDrain(); }
      st.xp = S.xp || 0;
      st.xpNext = st.xp + (S.xpToNext || 1);
      const cs = S.circles;
      if (cs) {
        for (let i = 0; i < 5 && i < cs.length; i++) {
          const c = cs[i], s = st.slots[i];
          if (s.spellId !== c.spellId) {
            s.spellId = c.spellId || null;
            s.spell = c.def || (c.spellId ? SPELLS[c.spellId] : null) || null;
            recomputeDrain();
          }
          s.rank = c.rank || 1;
          if (c.cd > 0 && c.cd > s.cd) s.cdMax = Math.max(c.cd, c.cdMax || c.cd);
          if (s.cd > 0 && c.cd <= 0) {                 // came off cooldown this tick
            s.readyAt = now;
            if (s.spell && st.focus >= (s.spell.cost || 0)) circleFx.onReady(s, L.circles[i], s.spell);
          }
          s.cd = c.cd || 0;
          if (!s.cdMax) s.cdMax = c.cdMax || (s.spell && s.spell.cooldown) || 1;
          s.blocked = c.blocked || '';
        }
      }
      st.known.length = 0;
      if (S.known && S.known.forEach) S.known.forEach((rank, id) => { st.known.push(id); st.ranks[id] = rank; });
      return null;
    };
    // the mirror runs every tick; nothing else needs to push
  }

  if (bus) {
    offs.push(bus.on('spell:ready', (e) => bindSpellSystem((e && e.system) || ctx.spellSystem)));
    offs.push(bus.on('spell:offer', (offer) => {
      if (!spellSys || !offer || !offer.choices) return;
      const defs = offer.choices.map((ch, i) => {
        const d = Object.assign({}, ch.def || SPELLS[ch.id] || {});
        d.id = d.id || ch.id;
        d._idx = i;
        if (!ch.isNew) d.known = { rank: Math.max(1, (ch.rank || 2) - 1) };
        return d;
      });
      overlays.offer(defs).then((id) => {
        const pickIdx = defs.findIndex((d) => d.id === id);
        if (pickIdx >= 0 && spellSys.chooseOffer) spellSys.chooseOffer(defs[pickIdx]._idx);
        bus.emit('ui:spell-chosen', { id });
      });
    }));
  }
  bindSpellSystem(ctx.spellSystem || (ctx.spells && ctx.spells.system));

  /* keyboard: 1–5 opens that circle's picker, the same thing a click does */
  function onKey(e) {
    if (e.key < '1' || e.key > '5') return;
    if (overlays.blocking) return;
    const i = +e.key - 1;
    // same key twice closes it; close() clears `slot`, so read it first
    const wasOpen = picker.isOpen ? picker.state.slot : -1;
    if (wasOpen >= 0) { picker.close(); if (wasOpen === i) return; }
    if (st.level < st.slots[i].unlockLevel) {
      api.toast('Circle ' + (i + 1) + ' opens at level ' + st.slots[i].unlockLevel, { kind: 'warn', value: 'LV' + st.slots[i].unlockLevel });
      return;
    }
    if (st.known.length > 1) picker.show(i);
    else { api.setPaused(true); overlays.openLoadout(); }
  }
  window.addEventListener('keydown', onKey);

  /* ---------------------------------------------------------------- *
   * Frame
   * ---------------------------------------------------------------- */

  let simAuto = false;    // demo auto-casting, for the harness
  api.setDemo = (v) => { simAuto = v; };

  function update(dt) {
    st.simTime += dt;
    if (!paused && !overlays.blocking) st.runTime += dt;

    if (source) {
      const s = source();
      if (s) for (const k in s) if (k in st && k !== 'slots') st[k] = s[k];
    }

    // pause via keyboard/gamepad
    if (input && input.pressed && input.pressed('pause')) {
      input.consume('pause');
      if (overlays.choiceOpen) { /* the choice must be answered */ }
      else api.togglePause();
    }

    if (paused || overlays.blocking) {
      if (input && input.consume) { input.consume('jump'); input.consume('cast'); input.consume('dash'); }
      return;
    }

    // cooldowns always tick locally; the sim overwrites them whenever it likes
    for (let i = 0; i < 5; i++) {
      const s = st.slots[i];
      if (s.cd > 0) {
        s.cd -= dt;
        if (s.cd <= 0) {
          s.cd = 0;
          s.readyAt = now;
          if (s.spell && st.focus >= (s.spell.cost || 0)) circleFx.onReady(s, L.circles[i], s.spell);
        }
      }
    }

    if (!st.driven) {
      if (st.simTime >= st.focusHoldUntil) {
        st.focus = Math.min(st.maxFocus, st.focus + st.focusRegen * dt);
      }
      st.hpGhost += (st.hp - st.hpGhost) * Math.min(1, dt * 2.2);
      if (st.hpGhost < st.hp) st.hpGhost = st.hp;
    } else {
      st.hpGhost += (st.hp - st.hpGhost) * Math.min(1, dt * 2.2);
      if (st.hpGhost < st.hp) st.hpGhost = st.hp;
    }

    if (simAuto) {
      for (let i = 1; i < 5; i++) {
        const s = st.slots[i];
        if (!s.spell || st.level < s.unlockLevel || s.cd > 0) continue;
        if (st.focus < (s.spell.cost || 0)) continue;
        api.onCast(i);
      }
      if (st.slots[0].spell && st.slots[0].cd <= 0 && st.focus >= (st.slots[0].spell.cost || 0) && Math.random() < 0.02) {
        api.tryCast(0);
      }
    }

    if (st.boss) {
      st.boss.show = clamp01(st.boss.show + (st.boss.closing ? -dt * 2 : dt * 1.6));
      st.boss.ghost += (st.boss.hp - st.boss.ghost) * Math.min(1, dt * 1.6);
      if (st.boss.ghost < st.boss.hp) st.boss.ghost = st.boss.hp;
      if (st.boss.closing && st.boss.show <= 0) st.boss = null;
    }

    if (touch) touch.update();
    if (input && touch && touch.aim.active && bus) {
      bus.emit('ui:aim', { x: touch.aim.x, y: touch.aim.y, active: true });
    }
  }

  let last = 0;
  let hintT = 4.5;
  let fpsAcc = 0, fpsN = 0, fpsShown = 0;

  function render() {
    if (!visible) return;
    const t = performance.now() / 1000;
    let dt = last ? t - last : 0.016;
    last = t;
    if (dt > 0.1) dt = 0.1;
    now = t;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);

    const env = { now, dt, dpr, focus: st.focus, level: st.level, touch: L.touch };

    drawScreenFx(c, L, fx, st, env);
    fx.hurt = Math.max(0, fx.hurt - dt * 2.4);
    fx.spend = Math.max(0, fx.spend - dt * 3);

    drawWash(c, L);
    if (st.boss) drawBoss(c, L, st.boss, env);
    drawResources(c, L, st, env);

    const toScreen = (view && view.toScreen) ? view.toScreen : fallbackToScreen;
    bubbles.update(dt);
    updateDamage(dt);
    drawDamage(c, toScreen, L.mode === 'portrait' ? 0.86 : 1, now);
    bubbles.draw(c, toScreen, L, now);

    // expire toasts
    for (let i = toasts.length - 1; i >= 0; i--) if (now - toasts[i].at > toasts[i].life + 0.4) toasts.splice(i, 1);
    drawToasts(c, L, toasts, env);

    if (touch) {
      touch.render(c, dt, now);
      if (hintT > 0 && !paused) {
        hintT -= dt;
        touch.hint(c, clamp01(hintT / 1.2));
      }
    }

    circleFx.update(dt);
    for (let i = 0; i < 5; i++) drawCircle(c, st.slots[i], L.circles[i], env);
    if (assignMode) drawAssignTargets();
    drawAutoTarget(toScreen);
    circleFx.draw(c);
    picker.update(dt);
    picker.draw(c, env);

    if (burst.t > 0) { drawLevelBurst(c, L, burst, env); burst.t -= dt; }

    if (settings.showFps || DIAG) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 0.4) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
      overlays.setFps(fpsShown + ' fps · ' + (L.mode === 'portrait' ? 'P' : 'L') + (DIAG ? ' · ' + diagLine() : ''));
    }
  }

  /* `?diag=1` — the state that decides whether "I can't move" is the sim, the
     scene machine or a latched input. Readable on a phone, where there is no
     console. */
  const DIAG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('diag');
  function diagLine() {
    const w = ctx.world;
    const p = w && w.player;
    const sc = ctx.scenes;
    return 'sc:' + (sc ? sc.name + (sc.current ? '' : '/NULL') : '-') +
      ' f:' + (w ? w.frame : '-') +
      ' ctl:' + (w ? (w.playerControl ? 1 : 0) : '-') +
      ' st:' + (p ? p.data.state : '-') +
      ' hp:' + (p ? Math.round(p.hp) : '-') +
      ' ax:' + (input ? input.axisX.toFixed(1) : '-') +
      ' z:' + (input && input.zoneCount ? input.zoneCount() : '-') +
      ' src:' + (input ? input.lastSource[0] : '-');
  }

  /* The sim's auto-aim is invisible unless we say what it locked on to. Four
     corner ticks, no ring — a ring reads as a cast circle. */
  const _at = { x: 0, y: 0 };
  function drawAutoTarget(toScreen) {
    const t = input && input.autoTarget;
    if (!t || !t.alive || t.dead) return;
    toScreen(t.x, t.y - (t.h || 60) * 0.12, _at);
    const r = 20 + Math.sin(now * 4) * 1.5;
    const g = 6;
    c.save();
    c.lineWidth = 2;
    c.strokeStyle = A(C.ember, 0.7);
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      c.moveTo(_at.x + sx * r, _at.y + sy * (r - g));
      c.lineTo(_at.x + sx * r, _at.y + sy * r);
      c.lineTo(_at.x + sx * (r - g), _at.y + sy * r);
    }
    c.stroke();
    c.restore();
  }

  function drawAssignTargets() {
    const p = 0.55 + Math.sin(now * 5) * 0.35;
    for (let i = 0; i < 5; i++) {
      if (st.level < st.slots[i].unlockLevel) continue;
      const g = L.circles[i];
      c.beginPath();
      c.arc(g.x, g.y, g.r + 8 + p * 3, 0, Math.PI * 2);
      c.lineWidth = 2.5;
      c.strokeStyle = A(C.arc, p);
      c.stroke();
    }
    txt(c, 'CHOOSE A CIRCLE', L.circles[0].x, L.circles[0].y - L.circles[0].r - 30, 10, A(C.arc, 0.9),
      { align: 'center', base: 'middle', track: 3, weight: 700, shadow: 1 });
  }

  const _fs = { x: 0, y: 0 };
  function fallbackToScreen(x, y, out) {
    const o = out || _fs;
    o.x = x; o.y = y;
    return o;
  }

  function destroy() {
    for (const off of offs) { try { off(); } catch { /* already gone */ } }
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    if (unwrapFx) unwrapFx();
    if (touch) touch.destroy();
    overlays.destroy();
    cv.remove();
  }

  api.setVisible = setVisible;
  // DESIGN.md §2: you start with Emberbolt in the manual circle. The sim overwrites this the
  // moment it calls setSlot; without it a fresh boot shows five empty sockets.
  st.known.push('emberbolt');
  st.ranks.emberbolt = 1;
  api.setSlot(0, 'emberbolt', 1);

  bus && bus.emit('ui:ready', { ui: api });
  return api;
}

export default createUI;
export { easeOutCubic };
