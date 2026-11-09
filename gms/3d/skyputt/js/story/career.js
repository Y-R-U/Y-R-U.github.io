// Career mode "Nobody to Pro" (PLAN 2.5): profile, the tour map, chapter events and their flow
// (dialogue → play → goal check → rewards → dialogue). Story content lives in ./data/ as data.
import { CHAPTERS, RANKS } from './data/chapters.js';
import { CHARACTERS } from './data/characters.js';
import { GOLFERS } from './data/golfers.js';
import { portraitSVG } from './portrait.js';
import { playDialogue } from './dialogue.js';
import { playField } from './opponents.js';
import { COURSES } from '../course/holes/index.js';
import { ICONS } from '../game/hud.js';
import { helperName, HELPER_BY_ID } from '../meta/helpers.js';
import { BALL_BY_ID, TRAIL_BY_ID } from '../meta/economy.js';

const COSMETICS = { ball: BALL_BY_ID, trail: TRAIL_BY_ID };
// the chapter an event belongs to, and the tour after it (for the 'unlocked' line on a rival win)
const ch0Of = ev => CHAPTERS.findIndex(c => c.data?.events.includes(ev));
const nextTourName = k => (k >= 0 && CHAPTERS[k + 1]?.data ? CHAPTERS[k + 1].data.title : null);

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { lesson: 'Lesson', round: 'Round', rival: 'Rival', tournament: 'Tournament' };
const KIND_ICON = { lesson: '✎', round: '⛳', rival: '⚔', tournament: '🏆' };

// ---- progress helpers (pure, testable) ----
// Rank = the best rank any finished chapter grants (chapters without `rankOnFinish`, like the World
// Tour, give a trophy instead). Derived from the save, so old profiles keep working.
export function rankOf(story) {
  let r = 0;
  for (const ch of CHAPTERS) if (ch.data && story.chapters?.[ch.id]?.done) r = Math.max(r, RANKS.indexOf(ch.data.rankOnFinish));
  return RANKS[Math.max(0, r)];
}
export function eventOpen(story, chapter, i) { return i === 0 || !!story.events[chapter.events[i - 1].id]?.passed; }
// story2: the next tour opens once the previous tour's rival is beaten (or the tour is done).
// story7: a tour may have several rivals (the Grand Tour has one per stop); the LAST one is the gate.
export const rivalOf = data => data?.events.filter(e => e.kind === 'rival').pop() || null;
export function chapterOpen(story, k) {
  if (k === 0) return true;
  const prev = CHAPTERS[k - 1];
  if (!prev.data || !CHAPTERS[k].data) return false;
  return !!story.chapters?.[prev.id]?.done || !!story.events[rivalOf(prev.data)?.id]?.passed;
}
// story7: course locks. A story event plays a hole only once its course is open (`lockedBy` gate hole
// finished), counting holes played earlier in the same event (the qualifier plays fest9 then sugar9).
// The story opens courses by playing their gate hole, as ch4 always has (sky9 → Hollow Woods).
// → the first closed course (its `lockedBy.note` says how to open it), or null.
const COURSE_OF = id => Object.values(COURSES).find(c => c.holes.some(h => h.id === id)) || null;
export function courseLock(unlocked, ev) {
  const done = { ...(unlocked || {}) };
  for (const id of ev.holes) {
    const c = COURSE_OF(id);
    if (c?.lockedBy && !done[c.lockedBy.hole]) return c;
    done[id] = true;
  }
  return null;
}
// Courses still gated in this save (to say "Star Station is open" after the event that opened it).
export const gatedCourses = unlocked => Object.values(COURSES).filter(c => c.lockedBy && !unlocked?.[c.lockedBy.hole]).map(c => c.id);
// story7: Battle (ball hits) vs Classic, from the player's setting (default Battle; notes/ballhit.md).
export const battleOn = store => store.settings?.()?.ballHit !== false;
export const modeName = on => (on ? 'Battle' : 'Classic');
// A ball of the golfer knocked out of bounds during the round (play.js hole note "<name>: knocked out +1").
export const knockedOut = (res, name) => !!res.rows?.some(r => r.notes?.some(n => n.startsWith(name + ': knocked out')));

// The chapter to point the player at: the last open one that isn't finished (else the last open one).
export function currentChapter(story) {
  let cur = 0;
  CHAPTERS.forEach((ch, k) => { if (ch.data && chapterOpen(story, k)) cur = k; });
  for (let k = 0; k <= cur; k++) if (CHAPTERS[k].data && !story.chapters?.[CHAPTERS[k].id]?.done && chapterOpen(story, k)) return k;
  return cur;
}
// A rival's cosmetic reward ('ball:lime' | 'trail:ember'); if it is already owned, half its price in coins.
export function grantCosmetic(store, key, catalog) {
  const d = store.data;
  if (!key || !d.cosmetics) return null;
  const [type, id] = key.split(':');
  const item = catalog?.[type]?.[id];
  if (d.cosmetics.owned.includes(key)) { const c = Math.round((item?.price || 200) / 2); store.addCoins(c); return { key, coins: c, name: item?.name || id }; }
  d.cosmetics.owned.push(key); store.save();
  return { key, coins: 0, name: item?.name || id };
}

// How to use each helper, for a failed lesson's message (aceUse explains the hole-in-one pass).
const HOW_TO_USE = {
  mulligan: 'hit a shot, then tap Mulligan to take it back',
  longSight: 'tap Long Sight at the top of the helper column before you aim',
};
// Goal check → { passed, detail, place, aceUse }
export function checkGoal(ev, res, field) {
  const g = ev.goal || {};
  const fails = [];
  if (g.maxStrokes !== undefined && res.total > g.maxStrokes) fails.push(`took ${res.total} (needed ${g.maxStrokes} or fewer)`);
  if (g.starsAtLeast !== undefined && res.stars < g.starsAtLeast) fails.push(`${res.stars} stars (needed ${g.starsAtLeast})`);
  // an ace leaves no room to use a helper, so it counts (a lesson must never punish a hole in one)
  const usedIt = res.used?.[g.use] > 0, ace = res.rows?.length === 1 && res.total === 1;
  if (g.use && !usedIt && !ace) fails.push(`didn't use ${helperName(g.use)} (${HOW_TO_USE[g.use] || `tap ${helperName(g.use)} in the helper column before a shot`})`);
  const aceUse = !!g.use && !usedIt && ace;   // passed by a hole in one: say so on the result card
  let place = null;
  if (field) {
    const board = leaderboard(res, field);
    place = board.findIndex(r => r.you) + 1;
    if (g.beat && !(res.total < field[0].total)) fails.push(res.total === field[0].total ? 'tied' : `lost ${res.total}–${field[0].total}`);
    if (g.place && place > g.place) fails.push(`finished ${ordinal(place)} (needed top ${g.place})`);
  }
  return { passed: fails.length === 0, detail: fails.join(', '), place, aceUse };
}
// You win ties on the board (home advantage) except for `beat`, which needs strictly fewer.
export function leaderboard(res, field) {
  return [{ name: 'You', total: res.total, you: true }, ...field.map(f => ({ name: f.name, total: f.total, colour: f.colour }))]
    .sort((a, b) => a.total - b.total || (b.you ? 1 : 0) - (a.you ? 1 : 0));
}
export function ordinal(n) { const t = n % 100; if (t >= 11 && t <= 13) return n + 'th'; return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); }

// ---- the screen ----
// ctx: { store, startEvent(ev, chapter, opts) → Promise<result|null>, onBack, click, back }
export function createCareer(ctx) {
  const { store } = ctx;
  const story = () => store.story();
  const expanded = {};   // tour index → unfolded (session only)

  async function ensureProfile() {
    if (story().name) return true;
    return new Promise(resolve => {
      const el = $('#career');
      el.innerHTML = `<div class="card career-card"><div class="card-kicker">Career · Nobody to Pro</div>
        <div class="card-title">Who's putting?</div>
        <div class="dlg-face center">${portraitSVG(CHARACTERS.you.portrait, { size: 96 })}</div>
        <input id="c-name" class="name-in" maxlength="16" autocomplete="off" placeholder="Your name" aria-label="Your name">
        <button class="btn primary" data-a="ok">Start my career</button>
        <button class="btn ghost" data-a="back">Back</button></div>`;
      el.hidden = false;
      const inp = el.querySelector('#c-name');
      setTimeout(() => inp.focus(), 50);
      const ok = () => {
        const n = inp.value.trim().replace(/\s+/g, ' ').slice(0, 16);
        if (!n) { inp.classList.add('bad'); inp.focus(); return; }
        story().name = n; store.saveStory(); ctx.click?.(); resolve(true);
      };
      inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
      el.querySelector('[data-a=ok]').onclick = ok;
      el.querySelector('[data-a=back]').onclick = () => { ctx.back?.(); el.hidden = true; resolve(false); };
    });
  }

  async function open() {
    if (!(await ensureProfile())) { ctx.onBack(); return; }
    const st = story();
    // chapter intro once
    const ch0 = CHAPTERS[0].data;
    if (!st.seen[ch0.id + ':intro']) {
      $('#career').hidden = true;
      await playDialogue(ch0.intro, { name: st.name });
      st.seen[ch0.id + ':intro'] = true; store.saveStory();
    }
    render();
  }

  function render() {
    const st = story();
    const el = $('#career');
    const cur = currentChapter(st);
    const chapters = CHAPTERS.map((ch, k) => {
      const open = !!ch.data && chapterOpen(st, k), done = !!st.chapters?.[ch.id]?.done;
      const shown = open && (expanded[k] ?? k === cur);   // story2: only the current tour is unfolded
      const prevRival = k > 0 ? rivalOf(CHAPTERS[k - 1].data) : null;
      const lockNote = !ch.data ? 'Coming soon' : `Beat ${esc(GOLFERS[prevRival?.rival]?.name || 'the last rival')} to unlock`;
      return `<div class="tour ${open ? 'open' : 'locked'} ${done ? 'done' : ''}">
        <div class="tour-node">${done ? '✓' : k + 1}</div>
        <div class="tour-body"><div class="tour-name">${esc(ch.name)}${open && k !== cur ? `<button class="tour-fold" data-tour="${k}" aria-expanded="${shown}">${shown ? 'Hide' : 'Show'}</button>` : ''}</div>
          <div class="tour-sub">${ch.data ? esc(ch.data.blurb) : ''}${open ? '' : `<span class="tour-lock"> · ${lockNote}</span>`}</div>
          ${shown ? `<div class="evs">${ch.data.events.map((ev, i) => eventRow(st, ch.data, ev, i)).join('')}</div>` : ''}
        </div></div>`;
    }).join('');
    el.innerHTML = `<div class="career-card wide">
      <div class="map-head">
        <button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="who">${portraitSVG(CHARACTERS.you.portrait, { size: 46 })}</div>
        <div><div class="map-title">${esc(st.name)}</div><div class="map-sub">${esc(rankOf(st))} · ${ICONS.coin}${store.data.coins | 0}</div></div>
        <button class="round coach" data-a="mags" aria-label="Talk to Mags">${portraitSVG(CHARACTERS.mags.portrait, { size: 40, bg: false })}</button>
      </div>
      <div class="tours">${chapters}</div></div>`;
    el.hidden = false;
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { el.hidden = true; ctx.onBack(); return; }
      if (b.dataset.tour) { const k = +b.dataset.tour; expanded[k] = !(expanded[k] ?? k === currentChapter(st)); render(); return; }
      if (b.dataset.a === 'mags') { el.hidden = true; await playDialogue(magsTip(st), { name: st.name }); render(); return; }
      if (b.dataset.ev) {
        const ch = CHAPTERS.find(c => c.id === b.dataset.ch).data;
        const ev = ch.events.find(x => x.id === b.dataset.ev);
        el.hidden = true;
        if (!st.seen[ch.id + ':intro']) {   // a new tour's opening scene, once
          await playDialogue(ch.intro, { name: st.name });
          st.seen[ch.id + ':intro'] = true; store.saveStory();
        }
        await runEvent(ch, ev);
      }
    };
  }

  function eventRow(st, ch, ev, i) {
    const prevOk = eventOpen(st, ch, i), gate = prevOk ? courseLock(store.data.unlocked, ev) : null;
    const open = prevOk && !gate, rec = st.events[ev.id];
    const state = rec?.passed ? 'passed' : open ? 'open' : 'locked';
    const best = (rec?.best ? ` · best ${rec.best}` : '') + (ev.battle ? ` · ${modeName(battleOn(store))}` : '') + (gate ? ` · ${gate.lockedBy.note || gate.name + ' is locked'}` : '');
    return `<button class="ev ${state}" data-ch="${ch.id}" data-ev="${ev.id}" ${open ? '' : 'disabled'}>
      <span class="ev-ic">${rec?.passed ? '✓' : open ? KIND_ICON[ev.kind] : '🔒'}</span>
      <span class="ev-main"><b>${esc(ev.name)}</b><small>${esc(KIND[ev.kind])} · ${esc(ev.goalText)}${best}</small></span>
      <span class="ev-rw">${rewardText(ev.reward)}</span></button>`;
  }

  async function runEvent(ch, ev) {
    const st = story();
    const name = st.name;
    const battle = battleOn(store);   // story7: events with `battle` say which mode is on
    await playDialogue([...(ev.before || []), ...(ev.battle ? ev.battle[battle ? 'on' : 'off'] || [] : [])], { name });
    // lesson grants (once)
    if (ev.grant && !st.seen[ev.id + ':grant']) {
      for (const [k, n] of Object.entries(ev.grant)) store.giveHelper(k, n);
      st.seen[ev.id + ':grant'] = true; store.saveStory();
    }
    const course = COURSES[ch.course];
    // courses2: an event may name holes from another course (Hollow Masters plays Hollow Woods)
    const holes = ev.holes.map(id => course.holes.find(h => h.id === id) || Object.values(COURSES).flatMap(c => c.holes).find(h => h.id === id));
    const seed = (Date.now() / 1000) | 0;
    let field = null, ghosts = null;
    if (ev.kind === 'rival' || ev.kind === 'tournament') {
      warming(ev.kind === 'rival' ? `${GOLFERS[ev.rival].name} is warming up…` : 'The field is warming up…', ev.battle ? `Ball hits: ${modeName(battle)}` : '');
      const golfers = ev.kind === 'rival' ? [ev.rival] : ev.field;
      field = await playField(golfers.map(id => ({ id, ...GOLFERS[id] })), holes, seed);
      $('#career').hidden = true;
      if (ev.kind === 'rival') ghosts = field.filter(f => f.shots?.some(x => x?.length));
    } else if (ev.sparring) {
      // story7: a lesson with a ball to knock — the golfer's first `park` shots on a fixed seed, so the ball
      // stops in the same place every try (no score, no board: it is only there to be hit)
      const g = ev.sparring;
      warming(`${GOLFERS[g.golfer].name} is teeing up…`, `Ball hits: ${modeName(battle)}`);
      const f = await playField([{ id: g.golfer, ...GOLFERS[g.golfer] }], holes, g.seed);
      $('#career').hidden = true;
      ghosts = f.map(x => ({ ...x, shots: x.shots.map(s => s?.slice(0, g.park || 1) || null) })).filter(x => x.shots.some(s => s?.length));
    }
    const tips = ev.tipsClassic && !battle ? ev.tipsClassic : ev.tips;
    const gatedBefore = gatedCourses(store.data.unlocked);
    const res = await ctx.startEvent(ev, { id: ev.id, name: ev.name, holes }, { opponents: field, tips, ghosts, theme: ev.theme || ch.theme || null });
    if (!res) { render(); return; }   // quit
    const check = checkGoal(ev, res, field);
    const rec = st.events[ev.id] || {};
    const first = check.passed && !rec.passed;
    st.events[ev.id] = { passed: rec.passed || check.passed, best: Math.min(rec.best ?? Infinity, res.total), tries: (rec.tries || 0) + 1 };
    let cosmetic = null;
    if (first && ev.reward) {
      if (ev.reward.coins) store.addCoins(ev.reward.coins);
      for (const [k, n] of Object.entries(ev.reward.helpers || {})) store.giveHelper(k, n);
      if (ev.reward.cosmetic) cosmetic = grantCosmetic(store, ev.reward.cosmetic, COSMETICS);
    }
    let chapterDone = false;
    if (check.passed && ch.events.every(e => st.events[e.id]?.passed) && !st.chapters[ch.id]?.done) {
      st.chapters[ch.id] = { done: true }; chapterDone = true;
    }
    store.saveStory();
    // story7: courses this event opened (its gate hole was played), named on the result card
    const opened = gatedBefore.filter(id => !gatedCourses(store.data.unlocked).includes(id)).map(id => COURSES[id].name);
    await resultCard(ev, res, check, field, first, cosmetic, { opened, gate: rivalOf(ch) === ev, mode: ev.battle ? modeName(battle) : null });
    const knock = ev.afterKnock && ev.sparring && knockedOut(res, GOLFERS[ev.sparring.golfer].name);
    const afterLines = check.aceUse ? [['mags', `A hole in one! No ${helperName(ev.goal.use)} needed — that counts. You'll find a use for it later.`], ...(ev.after || [])] : knock ? [...ev.afterKnock, ...(ev.after || [])] : ev.after;
    const loseLines = ev.lose || (ev.goal?.use && !res.used?.[ev.goal.use]
      ? [['mags', `Close! This lesson is about the ${helperName(ev.goal.use)}: ${HOW_TO_USE[ev.goal.use] || `tap ${helperName(ev.goal.use)} in the helper column before a shot`}.`]]
      : [['mags', 'Not this time. Have another go when you’re ready.']]);
    await playDialogue(check.passed ? afterLines : loseLines, { name });
    if (chapterDone) { await playDialogue(ch.outro, { name }); await rankCard(ch); }
    render();
  }

  function warming(text, note = '') {
    const el = $('#career');
    el.innerHTML = `<div class="card career-card"><div class="card-title">${esc(text)}</div><div class="boot-spin"></div>
      <div class="card-note small">Planning shots on the real course${note ? ` · ${esc(note)}` : ''}</div></div>`;
    el.hidden = false;
  }

  function resultCard(ev, res, check, field, first, cosmetic, { opened = [], gate = true, mode = null } = {}) {
    return new Promise(resolve => {
      const el = $('#career');
      const board = field ? leaderboard(res, field) : null;
      el.innerHTML = `<div class="card career-card">
        <div class="card-kicker">${esc(ev.name.startsWith(KIND[ev.kind]) ? ev.name : KIND[ev.kind] + ' · ' + ev.name)}</div>
        <div class="card-title ${check.passed ? 'under' : 'over'}">${check.passed ? (ev.kind === 'tournament' ? `${ordinal(check.place)} place!` : ev.kind === 'rival' ? 'You win!' : 'Goal complete!') : 'Not quite'}</div>
        <div class="card-note">${esc(ev.goalText)}${check.passed ? '' : ` — ${esc(check.detail)}`}</div>
        ${check.aceUse ? `<div class="card-note good">A hole in one! No ${esc(helperName(ev.goal.use))} needed — that counts.</div>` : ''}
        <div class="card-stats"><div><span>Strokes</span><b>${res.total}</b></div><div><span>Par</span><b>${res.par}</b></div><div><span>Stars</span><b>${res.stars}</b></div></div>
        ${board ? `<table class="scores board">${board.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td>${r.colour ? `<i class="dot" style="background:${r.colour}"></i>` : ''}${esc(r.name)}</td><td>${r.total}</td></tr>`).join('')}</table>` : ''}
        ${first && ev.reward ? `<div class="card-note good">Reward: ${rewardText(ev.reward, true)}${cosmetic ? ` · ${cosmetic.coins ? `${esc(cosmetic.name)} (owned: +${cosmetic.coins} coins)` : `new ${cosmetic.key.startsWith('ball') ? 'ball' : 'trail'}: ${esc(cosmetic.name)}`}` : ''}</div>` : ''}
        ${check.passed && first && ev.kind === 'rival' && gate && nextTourName(ch0Of(ev)) ? `<div class="card-note good">${esc(nextTourName(ch0Of(ev)))} unlocked!</div>` : ''}
        ${opened.map(n => `<div class="card-note good">${esc(n)} is open on the course map!</div>`).join('')}
        ${mode ? `<div class="card-note small">Ball hits: ${esc(mode)}${mode === 'Classic' ? ' (change it in Settings)' : ''}</div>` : ''}
        <button class="btn primary" data-a="ok">${check.passed ? 'Continue' : 'Back to career'}</button></div>`;
      el.hidden = false;
      el.onclick = e => { if (e.target.closest('[data-a=ok]')) { ctx.click?.(); el.hidden = true; resolve(); } };
    });
  }

  function rankCard(ch) {
    return new Promise(resolve => {
      const el = $('#career');
      el.innerHTML = `<div class="card career-card"><div class="card-kicker">${esc(ch.title)} complete</div>
        <div class="card-title under">${ch.rankOnFinish ? `New rank: ${esc(ch.rankOnFinish)}` : `Trophy: ${esc(ch.trophy || ch.name)}`}</div>
        ${ch.trophy && ch.rankOnFinish ? `<div class="card-note">Trophy: ${esc(ch.trophy)}</div>` : ''}
        <div class="dlg-face center">${portraitSVG(CHARACTERS.you.portrait, { size: 110 })}</div>
        <button class="btn primary" data-a="ok">Onward</button></div>`;
      el.hidden = false;
      el.onclick = e => { if (e.target.closest('[data-a=ok]')) { el.hidden = true; resolve(); } };
    });
  }

  function magsTip(st) {
    const ch = CHAPTERS[currentChapter(st)].data;
    const next = ch.events.find(e => !st.events[e.id]?.passed);
    if (!next) return ch.done || [['mags', 'Nothing left to teach you, {name}. Go and enjoy it.']];
    const rival = rivalOf(ch);
    const hint = next.kind === 'lesson' ? 'Take your time. Lessons are free.'
      : next.kind === 'rival' ? next.tip || `${GOLFERS[next.rival]?.name || 'Your rival'} is the one to beat. Win and the next tour opens.`
      : ch.tip || 'Remember: Long Sight before the tricky ones, Mulligan when it goes wrong.';
    const lines = [['mags', `Next up: ${next.name}. ${next.goalText}.`], ['mags', hint]];
    if (rival && st.events[rival.id]?.passed && next.kind === 'tournament' && CHAPTERS[currentChapter(st) + 1]?.data) lines.push(['mags', 'You can head on to the next tour any time, but there’s a trophy here with your name on it.']);
    return lines;
  }

  return { open, render };
}

function rewardText(r, long = false) {
  if (!r) return '';
  const parts = [];
  if (r.coins) parts.push(`${ICONS.coin}${r.coins}`);
  for (const [k, n] of Object.entries(r.helpers || {})) parts.push(long ? `+${n} ${helperName(k)}` : `+${n}${HELPER_BY_ID[k]?.short || ''}`);
  if (r.cosmetic && !long) parts.push('🎁');
  return parts.join(' ');
}
