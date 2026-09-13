// js/ui/screens.js — the DOM menu layer: router, run flow, and the screens that
// are not big enough to own a file (CONTRACTS §10, D5).
//
// Three things live here that are easy to miss:
//
// 1. THE FLOW. js/main.js owns the loop and `startRun`, but nothing else drives
//    the game from one state to the next. This module is what turns a tap on
//    the title into a stage, a story beat, a run, and a payout.
// 2. THE WATCHER. The sim has no callback into presentation (D4), so a small
//    rAF watcher reads `world.pendingLevels` and `world.over` and raises the
//    level-up sheet and the results screen off them.
// 3. THE RAMP (D9 / DESIGN §4). Every optional destination is behind an unlock
//    id read from `save.unlocks`. A brand-new save reaches one button.

import {
  DATA, values, el, add, clear, btn, tap, card, page, soulsChip, statRow, bar,
  screenEl, art, fmtTime, fmtInt, countUp, empty, rgbOf, ensureStyles,
} from './components.js';
import { writeSave, resetSave } from '../core/save.js';
import { levelup } from './levelup.js';
import { dialogue } from './dialogue.js';
import { codex } from './codex.js';
import { sanctum, stageSelect, charSelect, loadout, slotCount } from './sanctum.js';

// The unlock ids this lane gates on. Lane C's unlocks.js must grant these ids
// (stages.js already pays out 'sanctum' from stage 1), and may add `text` for
// each so a locked thing can explain itself.
const U = {
  SANCTUM: 'sanctum',
  RELICS: 'relics',
  CODEX: 'codex',
  CHALLENGES: 'challenges',
  CURSE: 'curse',
  ENDLESS: 'endless',
};

const LABEL = {
  sanctum: 'The Sanctum', relics: 'Relics', codex: 'The Codex',
  challenges: 'Trials', curse: 'Curse tiers', endless: 'Endless',
  sigils: 'Sigils', allstages: 'Every lane',
};

const QUERY = new URLSearchParams(location.search);

export function makeScreens(root, ctx) {
  ensureStyles();
  const save = ctx.save;
  const ns = ctx.ns || {};

  const REGISTRY = {
    boot, title, stageSelect, charSelect, loadout, dialogue, levelup,
    pause, results, sanctum, codex, settings, challenges, none,
  };

  let cur = 'none';
  let inst = null;
  let host = null;
  let runActive = false;
  let sample = 0;

  const run = { stageId: null, character: save.chars[0] || 'wick', relics: [], curse: 0, charges: null };

  const api = {
    show, hide, root,
    get current() { return cur; },
    // the flow, exposed so the host and the gates can drive it without taps
    startStage, endRun,
    get run() { return run; },
    destroy,
  };
  ns.screens = api;

  // ---- the persistent pause affordance ---------------------------------
  // Deliberately TOP-right and only 46px: it is the one control that must NOT
  // fall under a thumb, because a mis-tap during a fight costs a run. Everything
  // a player aims for mid-run is in the bottom half (DESIGN §8.5); this is the
  // documented exception, placed out of reach on purpose.
  const pauseBtn = el('button', 'ui-pausebtn');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Pause');
  add(pauseBtn, el('span', 'ui-glyph', '❙❙'));
  pauseBtn.hidden = true;
  tap(pauseBtn, ctx, () => show('pause'), 'uiTap');
  root.appendChild(pauseBtn);

  // Audio cannot start without a gesture, and the first gesture in this game is
  // always a tap on a menu.
  const unlockAudio = () => { if (ctx.audio) { try { ctx.audio.unlock(); } catch (e) {} } };
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', onKey);

  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (cur === 'none' && runActive) show('pause');
    else if (cur === 'pause') resume();
  }

  // ---- router -----------------------------------------------------------

  function show(name, props = {}) {
    const fn = REGISTRY[name];
    if (!fn) { if (ns.callout) ns.callout('No screen named "' + name + '"'); return; }
    teardown();
    cur = name;
    host = el('div', 'ui-host');
    host.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    root.insertBefore(host, pauseBtn);
    inst = fn(host, ctx, props) || { destroy() {} };
    syncPause();
  }

  function hide() { show('none'); }

  function teardown() {
    if (inst && inst.destroy) { try { inst.destroy(); } catch (e) {} }
    if (host) host.remove();
    inst = null; host = null;
  }

  function destroy() {
    teardown();
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    pauseBtn.remove();
  }

  function syncPause() {
    pauseBtn.hidden = !(cur === 'none' && runActive && ns.world && !ns.world.over);
  }

  // ---- flow -------------------------------------------------------------

  function stageList() { return values(DATA.STAGES); }

  function nextStageId() {
    const list = stageList();
    for (const s of list) if (!save.stagesCleared[s.id]) return s.id;
    return list.length ? list[list.length - 1].id : null;
  }

  /** How many upgrades a level-up offers. It grows with the ramp (DESIGN §4). */
  function offerCount() {
    const cleared = Object.keys(save.stagesCleared).length;
    let n = 2;
    if (cleared >= 1) n = 3;
    if (cleared >= 3 || save.unlocks.indexOf(U.RELICS) >= 0) n = 4;
    if (cleared >= 5) n = 5;
    return Math.max(2, Math.min(5, n + ((save.sanctum.offers | 0))));
  }

  function charges() {
    return {
      reroll: save.sanctum.reroll | 0,
      banish: save.sanctum.banish | 0,
      skip: save.sanctum.skip | 0,
    };
  }

  /** Title primary. Picks the lane for you until choosing one is earned. */
  function play() {
    if (Object.keys(save.stagesCleared).length && stageList().length > 1) {
      show('stageSelect', { onPick: (id, curse) => startStage(id, { curse }), onBack: () => show('title') });
    } else {
      startStage(nextStageId(), {});
    }
  }

  function startStage(stageId, opts = {}) {
    run.stageId = stageId || nextStageId();
    run.curse = opts.curse | 0;
    if (opts.character) run.character = opts.character;
    if (save.unlocks.indexOf(U.RELICS) >= 0 && values(DATA.RELICS).length) {
      show('loadout', {
        picked: run.relics,
        onDone: (ids) => { run.relics = ids.slice(0, slotCount(save)); intro(); },
        onBack: () => show('title'),
      });
    } else intro();
  }

  function intro() {
    const stage = DATA.STAGES[run.stageId];
    const key = stage && stage.intro;
    const beat = key && DATA.STORY[key];
    if (beat && save.story.seen.indexOf(key) < 0 && !QUERY.has('nostory')) {
      show('dialogue', { key, endLabel: 'Begin', onDone: () => { markSeen(key); launch(); } });
    } else launch();
  }

  function markSeen(key) {
    if (key && save.story.seen.indexOf(key) < 0) { save.story.seen.push(key); writeSave(save); }
  }

  function launch() {
    const stage = DATA.STAGES[run.stageId];
    run.charges = charges();
    runActive = true;
    ns.paused = false;
    if (ns.startRun) ns.startRun({ stage: run.stageId, character: run.character, relics: run.relics, curse: run.curse });
    if (ctx.audio) { try { ctx.audio.music('act' + ((stage && stage.act) || 1)); } catch (e) {} }
    show('none');
  }

  function resume() { ns.paused = false; show('none'); }

  function quit() {
    ns.paused = false;
    runActive = false;
    ns.world = null;
    show('title');
  }

  function endRun() {
    const w = ns.world;
    if (!w) return;
    const stage = DATA.STAGES[run.stageId] || {};
    const victory = w.over === 'victory';
    const base = (stage.rewards && stage.rewards.souls) | 0;
    const frac = stage.duration ? Math.min(1, w.time / stage.duration) : 0;
    const earned = Math.max(1, Math.round(victory ? base : base * frac * 0.6)) + (w.bonusSouls | 0);

    const unlocked = [];
    save.souls += earned;
    save.stats.runs++;
    save.stats.kills += w.kills | 0;
    save.stats.cuts += w.cuts | 0;
    save.stats.conductorsKilled += w.conductorsKilled | 0;
    if (w.time > (save.stats.bestTime || 0)) save.stats.bestTime = w.time;

    if (victory) {
      const prev = save.stagesCleared[run.stageId];
      save.stagesCleared[run.stageId] = {
        time: prev && prev.time ? Math.min(prev.time, w.time) : w.time,
        curse: Math.max(run.curse, (prev && prev.curse) | 0),
      };
      if (run.curse > (save.curse[run.stageId] | 0)) save.curse[run.stageId] = run.curse;
      for (const id of (stage.rewards && stage.rewards.unlocks) || []) {
        if (save.unlocks.indexOf(id) < 0) { save.unlocks.push(id); unlocked.push(id); }
      }
    }
    writeSave(save);
    runActive = false;
    syncPause();
    show('results', {
      result: w.over, time: w.time, kills: w.kills, cuts: w.cuts,
      conductors: w.conductorsKilled, level: w.player ? w.player.level : 1,
      souls: earned, unlocked, stageId: run.stageId,
    });
  }

  // ---- watcher ----------------------------------------------------------
  // The sim cannot call us (D4), so we read it. Cheap: three field reads a
  // frame, and a 2Hz sweep of the active enemies to fill the bestiary.

  let raf = requestAnimationFrame(function watch() {
    raf = requestAnimationFrame(watch);
    const w = ns.world;
    if (!w) { if (!pauseBtn.hidden) pauseBtn.hidden = true; return; }

    // ?auto: nothing is going to tap a card, and an unresolved level-up stops
    // the host stepping the sim entirely — so the bot takes the first offer.
    if (ns.bot) {
      if (w.pendingLevels > 0) {
        const o = (w.offerUpgrades(1) || [])[0];
        w.chooseUpgrade(o ? o.id : 'ns_alms');
      }
      return;
    }
    if (!runActive) return;

    if (w.pendingLevels > 0 && cur !== 'levelup') {
      show('levelup', { n: offerCount(), charges: run.charges || charges(), onDone: () => show('none') });
    } else if (w.over && cur !== 'results') {
      endRun();
    } else if (++sample % 30 === 0) {
      sampleCodex(w);
    }
    syncPause();
  });

  /**
   * The bestiary fills from what is on the field. Per-type KILL counts would be
   * better and need `world.killsByDef` — requested in docs/lanes/D-ui.md.
   */
  function sampleCodex(w) {
    if (!w.enemies || !w.enemies.each) return;
    const book = save.codex.enemies;
    w.enemies.each((e) => {
      const id = e.def && e.def.id;
      if (!id) return;
      const r = book[id];
      if (!r || typeof r !== 'object') book[id] = { seen: true, kills: (typeof r === 'number' ? r : 0) };
      else r.seen = true;
    });
  }

  // =========================================================================
  // Screens
  // =========================================================================

  function none() { return { destroy() {} }; }

  /** A held first frame. Long enough to read the name, short enough to forgive. */
  function boot(hostEl) {
    const scr = screenEl('screen--center');
    const mark = el('div', 'ui-title__mark');
    add(mark, el('h1', 'title', 'Nine Strings'), el('p', 'subtitle', 'The dead do not choose'));
    add(scr, mark);
    hostEl.appendChild(scr);
    scr.style.pointerEvents = 'auto';
    let t = setTimeout(() => show('title'), 850);
    tap(scr, ctx, () => { clearTimeout(t); show('title'); }, null);
    return { destroy() { clearTimeout(t); scr.remove(); } };
  }

  function title(hostEl) {
    const fresh = !save.stats.runs && !save.unlocks.length;
    const scr = screenEl('ui-title');

    const bg = el('div', 'ui-title__bg');
    art(bg, 'art/title.png', 'var(--choir)');
    add(scr, bg, el('div', 'ui-title__veil'));

    const top = el('div', 'ui-title__top');
    top.style.cssText = 'display:flex;justify-content:flex-end;min-height:30px';
    if (save.unlocks.indexOf(U.SANCTUM) >= 0) add(top, soulsChip(save.souls));
    add(scr, top);

    const bodyEl = el('div', 'ui-title__body');
    const mark = el('div', 'ui-title__mark');
    add(mark, el('h1', 'title', 'Nine Strings'), el('p', 'subtitle', 'The dead do not choose'));
    add(bodyEl, mark);

    add(bodyEl, btn(fresh ? 'Begin' : 'Continue', ctx, play, { cls: 'btn--primary' }));

    // D9: each of these appears the first run after it is earned, and not before.
    const grid = el('div', 'ui-title__grid');
    const cleared = Object.keys(save.stagesCleared).length;
    if (cleared) add(grid, btn('Lanes', ctx, () => show('stageSelect', {
      onPick: (id, curse) => startStage(id, { curse }), onBack: () => show('title'),
    })));
    if (save.unlocks.indexOf(U.SANCTUM) >= 0) add(grid, btn('Sanctum', ctx, () => show('sanctum', { onBack: () => show('title') })));
    if (save.chars.length > 1) add(grid, btn('Who goes', ctx, () => show('charSelect', {
      onPick: (id) => { run.character = id; show('title'); }, onBack: () => show('title'),
    })));
    if (save.unlocks.indexOf(U.RELICS) >= 0) add(grid, btn('Relics', ctx, () => show('loadout', {
      picked: run.relics, onDone: (ids) => { run.relics = ids; show('title'); }, onBack: () => show('title'),
    })));
    if (save.unlocks.indexOf(U.CODEX) >= 0) add(grid, btn('Codex', ctx, () => show('codex', { onBack: () => show('title') })));
    if (save.unlocks.indexOf(U.CHALLENGES) >= 0) add(grid, btn('Trials', ctx, () => show('challenges', { onBack: () => show('title') })));
    if (grid.children.length) add(bodyEl, grid);

    add(bodyEl, btn('Settings', ctx, () => show('settings', { onBack: () => show('title') }), { cls: 'btn--ghost btn--small' }));
    add(bodyEl, el('div', 'ui-title__ver', 'v' + (ns.version || '0')));
    add(scr, bodyEl);
    hostEl.appendChild(scr);
    return { destroy() { scr.remove(); } };
  }

  function pause(hostEl) {
    ns.paused = true;
    const w = ns.world;
    const { scr, body, foot } = page(ctx, 'Paused', resume);
    scr.classList.add('screen--scrim');

    if (w) {
      const stage = DATA.STAGES[run.stageId];
      if (stage) add(body, el('h2', 'h2', stage.name || ''), el('p', 'body', stage.subtitle || ''));
      const box = el('div', 'ui-field');
      add(box,
        statRow('Survived', fmtTime(w.time)),
        statRow('Level', w.player ? w.player.level : 1),
        statRow('Kills', fmtInt(w.kills)),
        statRow('Threads cut', fmtInt(w.cuts)),
        statRow('Conductors', fmtInt(w.conductorsKilled)));
      add(body, box);
    }

    add(foot, btn('Resume', ctx, resume, { cls: 'btn--primary' }));
    const row = el('div', 'btn-row');
    add(row, btn('Settings', ctx, () => show('settings', { onBack: () => show('pause') }), { cls: 'btn--small' }));
    add(row, btn('Restart', ctx, () => { ns.paused = false; startStage(run.stageId, { curse: run.curse }); }, { cls: 'btn--small' }));
    add(foot, row);
    add(foot, btn('Quit to title', ctx, quit, { cls: 'btn--ghost btn--small', sound: 'uiBack' }));

    hostEl.appendChild(scr);
    return { destroy() { scr.remove(); } };
  }

  function results(hostEl, _ctx, props = {}) {
    const win = props.result === 'victory';
    const stage = DATA.STAGES[props.stageId] || {};
    const { scr, body, foot } = page(ctx, stage.name || 'Run over', null);

    const head = el('div');
    add(head, el('h1', 'ui-verdict ' + (win ? 'ui-verdict--win' : 'ui-verdict--dead'), win ? 'Lane held' : 'You fell'));
    add(head, el('p', 'subtitle', win ? (stage.subtitle || '') : 'The strings went on without you'));
    add(body, head);

    const payout = el('div', 'ui-payout');
    const n = el('span', 'ui-payout__n num', '0');
    add(payout, el('span', 'ui-glyph ui-glyph--soul', '◇'), n, el('span', 'ui-payout__l', 'Souls'));
    add(body, payout);
    const stopCount = countUp(n, props.souls || 0, 1100);

    const box = el('div', 'ui-field');
    add(box,
      statRow('Survived', fmtTime(props.time || 0)),
      statRow('Level reached', props.level || 1),
      statRow('Kills', fmtInt(props.kills || 0)),
      statRow('Threads cut', fmtInt(props.cuts || 0)),
      statRow('Conductors killed', fmtInt(props.conductors || 0)));
    add(body, box);

    const got = props.unlocked || [];
    if (got.length) {
      const u = el('div', 'ui-unlock');
      add(u, el('div', 'ui-unlock__h', got.length > 1 ? 'Unlocked' : 'Unlocked'));
      for (const id of got) add(u, el('span', 'ui-unlock__i', unlockText(id)));
      add(body, u);
    }

    const toSanctum = save.unlocks.indexOf(U.SANCTUM) >= 0;
    add(foot, btn(toSanctum ? 'Spend souls' : 'Continue', ctx,
      () => show(toSanctum ? 'sanctum' : 'title', { onBack: () => show('title') }), { cls: 'btn--primary' }));
    const row = el('div', 'btn-row');
    add(row, btn('Again', ctx, () => startStage(props.stageId, { curse: run.curse }), { cls: 'btn--small' }));
    add(row, btn('Title', ctx, quit, { cls: 'btn--small', sound: 'uiBack' }));
    add(foot, row);

    hostEl.appendChild(scr);
    if (ctx.audio) { try { ctx.audio.sfx(win ? 'evolve' : 'death'); } catch (e) {} }
    return { destroy() { stopCount(); scr.remove(); } };
  }

  function unlockText(id) {
    const u = DATA.UNLOCKS && DATA.UNLOCKS[id];
    if (u && u.text) return u.text;
    if (DATA.CHARACTERS[id]) return DATA.CHARACTERS[id].name + ' will fight with you.';
    if (DATA.STAGES[id]) return DATA.STAGES[id].name + ' is open.';
    return (LABEL[id] || id) + ' is open.';
  }

  function settings(hostEl, _ctx, props = {}) {
    const back = props.onBack || (() => show('title'));
    const s = save.settings;
    const { scr, body, foot } = page(ctx, 'Settings', back);

    add(body, slider('Sound', s.sfx, (v) => { s.sfx = v; pushVolumes(); }));
    add(body, slider('Music', s.music, (v) => { s.music = v; pushVolumes(); }));
    add(body, segment('Quality', ['Low', 'Fair', 'Full'], s.quality | 0, (i) => {
      s.quality = i; ns.quality = i;
      if (ns.renderer && ns.renderer.setQuality) { try { ns.renderer.setQuality(i); } catch (e) {} }
      persist();
    }));
    add(body, segment('Stick side', ['Left', 'Auto', 'Right'], ['left', 'auto', 'right'].indexOf(s.stickSide || 'auto'), (i) => {
      s.stickSide = ['left', 'auto', 'right'][i]; persist();
    }));
    add(body, segment('Haptics', ['Off', 'On'], s.haptics ? 1 : 0, (i) => { s.haptics = !!i; persist(); }));

    const danger = el('div', 'ui-field');
    let armed = 0;
    const reset = btn('Erase everything', ctx, () => {
      if (!armed) {
        armed = setTimeout(() => { armed = 0; reset.lastChild.textContent = 'Erase everything'; }, 3000);
        reset.lastChild.textContent = 'Tap again to erase';
        reset.classList.add('is-armed');
        return;
      }
      clearTimeout(armed);
      resetSave();
      location.reload();
    }, { cls: 'btn--small', sound: 'uiDeny' });
    reset.style.setProperty('border-color', 'color-mix(in srgb, var(--danger) 50%, var(--edge))');
    add(danger, el('div', 'ui-field__l'), reset);
    add(danger, el('p', 'body', 'Souls, unlocks and every cleared lane. There is no undo.'));
    add(body, danger);

    add(foot, btn('Done', ctx, back, { cls: 'btn--primary' }));
    hostEl.appendChild(scr);
    return { destroy() { clearTimeout(armed); scr.remove(); } };

    function persist() { writeSave(save); }
    function pushVolumes() {
      if (ctx.audio && ctx.audio.setVolumes) { try { ctx.audio.setVolumes({ sfx: s.sfx, music: s.music }); } catch (e) {} }
      persist();
    }
  }

  function slider(label, value, onChange) {
    const f = el('div', 'ui-field');
    const l = el('div', 'ui-field__l');
    const v = el('div', 'ui-field__v', Math.round((value || 0) * 100) + '%');
    add(l, el('div', 'h2', label), v);
    const r = el('input', 'ui-range');
    r.type = 'range'; r.min = '0'; r.max = '100'; r.step = '5';
    r.value = String(Math.round((value || 0) * 100));
    r.style.setProperty('--fill', r.value + '%');
    r.addEventListener('input', () => {
      const n = +r.value / 100;
      v.textContent = r.value + '%';
      r.style.setProperty('--fill', r.value + '%');
      onChange(n);
    });
    add(f, l, r);
    return f;
  }

  function segment(label, options, index, onPick) {
    const f = el('div', 'ui-field');
    const l = el('div', 'ui-field__l');
    add(l, el('div', 'h2', label));
    const seg = el('div', 'ui-seg');
    const btns = [];
    options.forEach((o, i) => {
      const b = btn(o, ctx, () => {
        btns.forEach((x, k) => x.classList.toggle('is-on', k === i));
        onPick(i);
      }, { cls: 'btn--small' + (i === index ? ' is-on' : '') });
      btns.push(b);
      add(seg, b);
    });
    add(f, l, seg);
    return f;
  }

  function challenges(hostEl, _ctx, props = {}) {
    const back = props.onBack || (() => show('title'));
    const list = values(DATA.CHALLENGES);
    const { scr, body, foot } = page(ctx, 'Trials', back);
    add(foot, btn('Back', ctx, back, { cls: 'btn--ghost' }));

    if (!list.length) {
      add(body, empty('No trials set', 'The challenge table has not been written.'));
    } else {
      const stack = el('div', 'stack');
      for (const c of list) {
        const st = progressOf(save, c);
        const node = card(ctx, {
          icon: c.tag || (c.name || '?').slice(0, 3).toUpperCase(),
          title: c.name || c.id,
          sub: c.desc || '',
          note: c.reward ? 'Reward: ' + c.reward : null,
          flag: st.done ? 'Done' : null,
          on: st.done,
          accent: st.done ? 'var(--gold)' : 'var(--thread)',
          onTap: c.stage ? () => startStage(c.stage, { challenge: c.id }) : null,
        });
        if (!st.done && st.goal) {
          const t = el('div');
          t.style.cssText = 'margin-top:8px';
          add(t, bar(st.n / st.goal, 'var(--thread)'));
          add(t, el('span', 'ui-note', st.n + ' / ' + st.goal));
          add(node.querySelector('.card__text'), t);
        }
        add(stack, node);
      }
      add(body, stack);
    }
    hostEl.appendChild(scr);
    return { destroy() { scr.remove(); } };
  }

  return api;
}

function progressOf(save, c) {
  const raw = save.challenges ? save.challenges[c.id] : null;
  const goal = (c.goal | 0) || (c.target | 0) || 0;
  if (raw === true) return { done: true, n: goal, goal };
  if (typeof raw === 'number') return { done: goal ? raw >= goal : raw > 0, n: raw, goal };
  if (raw && typeof raw === 'object') {
    const n = raw.progress | 0;
    return { done: !!raw.done || (goal ? n >= goal : false), n, goal };
  }
  return { done: false, n: 0, goal };
}
