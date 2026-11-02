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

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { lesson: 'Lesson', round: 'Round', rival: 'Rival', tournament: 'Tournament' };
const KIND_ICON = { lesson: '✎', round: '⛳', rival: '⚔', tournament: '🏆' };

// ---- progress helpers (pure, testable) ----
export function rankOf(story) {
  let n = 0;
  for (const ch of CHAPTERS) if (ch.data && story.chapters?.[ch.id]?.done) n++;
  return RANKS[Math.min(n, RANKS.length - 1)];
}
export function eventOpen(story, chapter, i) { return i === 0 || !!story.events[chapter.events[i - 1].id]?.passed; }
export function chapterOpen(story, k) { return k === 0 || !!story.chapters?.[CHAPTERS[k - 1].id]?.done; }

// Goal check → { passed, detail }
export function checkGoal(ev, res, field) {
  const g = ev.goal || {};
  const fails = [];
  if (g.maxStrokes !== undefined && res.total > g.maxStrokes) fails.push(`took ${res.total} (needed ${g.maxStrokes} or fewer)`);
  if (g.starsAtLeast !== undefined && res.stars < g.starsAtLeast) fails.push(`${res.stars} stars (needed ${g.starsAtLeast})`);
  // an ace leaves no room to use a helper, so it counts (a lesson must never punish a hole in one)
  if (g.use && !(res.used?.[g.use] > 0) && !(res.rows?.length === 1 && res.total === 1)) fails.push(`didn't use ${g.use === 'longSight' ? 'Long Sight' : 'a Mulligan'}`);
  let place = null;
  if (field) {
    const board = leaderboard(res, field);
    place = board.findIndex(r => r.you) + 1;
    if (g.beat && !(res.total < field[0].total)) fails.push(res.total === field[0].total ? 'tied' : `lost ${res.total}–${field[0].total}`);
    if (g.place && place > g.place) fails.push(`finished ${ordinal(place)} (needed top ${g.place})`);
  }
  return { passed: fails.length === 0, detail: fails.join(', '), place };
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
    const chapters = CHAPTERS.map((ch, k) => {
      const open = !!ch.data && chapterOpen(st, k), done = !!st.chapters?.[ch.id]?.done;
      return `<div class="tour ${open ? 'open' : 'locked'} ${done ? 'done' : ''}">
        <div class="tour-node">${done ? '✓' : k + 1}</div>
        <div class="tour-body"><div class="tour-name">${esc(ch.name)}</div>
          <div class="tour-sub">${ch.data ? esc(ch.data.blurb) : 'Coming soon'}</div>
          ${open ? `<div class="evs">${ch.data.events.map((ev, i) => eventRow(st, ch.data, ev, i)).join('')}</div>` : ''}
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
      if (b.dataset.a === 'mags') { el.hidden = true; await playDialogue(magsTip(st), { name: st.name }); render(); return; }
      if (b.dataset.ev) {
        const ch = CHAPTERS.find(c => c.id === b.dataset.ch).data;
        const ev = ch.events.find(x => x.id === b.dataset.ev);
        el.hidden = true;
        await runEvent(ch, ev);
      }
    };
  }

  function eventRow(st, ch, ev, i) {
    const open = eventOpen(st, ch, i), rec = st.events[ev.id];
    const state = rec?.passed ? 'passed' : open ? 'open' : 'locked';
    const best = rec?.best ? ` · best ${rec.best}` : '';
    return `<button class="ev ${state}" data-ch="${ch.id}" data-ev="${ev.id}" ${open ? '' : 'disabled'}>
      <span class="ev-ic">${rec?.passed ? '✓' : open ? KIND_ICON[ev.kind] : '🔒'}</span>
      <span class="ev-main"><b>${esc(ev.name)}</b><small>${esc(KIND[ev.kind])} · ${esc(ev.goalText)}${best}</small></span>
      <span class="ev-rw">${rewardText(ev.reward)}</span></button>`;
  }

  async function runEvent(ch, ev) {
    const st = story();
    const name = st.name;
    await playDialogue(ev.before, { name });
    // lesson grants (once)
    if (ev.grant && !st.seen[ev.id + ':grant']) {
      for (const [k, n] of Object.entries(ev.grant)) store.giveHelper(k, n);
      st.seen[ev.id + ':grant'] = true; store.saveStory();
    }
    const course = COURSES[ch.course];
    const holes = ev.holes.map(id => course.holes.find(h => h.id === id));
    const seed = (Date.now() / 1000) | 0;
    let field = null;
    if (ev.kind === 'rival' || ev.kind === 'tournament') {
      warming(ev.kind === 'rival' ? `${GOLFERS[ev.rival].name} is warming up…` : 'The field is warming up…');
      const golfers = ev.kind === 'rival' ? [ev.rival] : ev.field;
      field = await playField(golfers.map(id => ({ id, ...GOLFERS[id] })), holes, seed);
      $('#career').hidden = true;
    }
    const ghosts = ev.kind === 'rival' ? field.filter(f => f.shots?.some(x => x?.length)) : null;
    const res = await ctx.startEvent(ev, { id: ev.id, name: ev.name, holes }, { opponents: field, tips: ev.tips, ghosts });
    if (!res) { render(); return; }   // quit
    const check = checkGoal(ev, res, field);
    const rec = st.events[ev.id] || {};
    const first = check.passed && !rec.passed;
    st.events[ev.id] = { passed: rec.passed || check.passed, best: Math.min(rec.best ?? Infinity, res.total), tries: (rec.tries || 0) + 1 };
    if (first && ev.reward) {
      if (ev.reward.coins) store.addCoins(ev.reward.coins);
      for (const [k, n] of Object.entries(ev.reward.helpers || {})) store.giveHelper(k, n);
    }
    let chapterDone = false;
    if (check.passed && ch.events.every(e => st.events[e.id]?.passed) && !st.chapters[ch.id]?.done) {
      st.chapters[ch.id] = { done: true }; chapterDone = true;
    }
    store.saveStory();
    await resultCard(ev, res, check, field, first);
    await playDialogue(check.passed ? ev.after : (ev.lose || [['mags', 'Not this time. Have another go when you’re ready.']]), { name });
    if (chapterDone) { await playDialogue(ch.outro, { name }); await rankCard(ch); }
    render();
  }

  function warming(text) {
    const el = $('#career');
    el.innerHTML = `<div class="card career-card"><div class="card-title">${esc(text)}</div><div class="boot-spin"></div>
      <div class="card-note small">Planning shots on the real course</div></div>`;
    el.hidden = false;
  }

  function resultCard(ev, res, check, field, first) {
    return new Promise(resolve => {
      const el = $('#career');
      const board = field ? leaderboard(res, field) : null;
      el.innerHTML = `<div class="card career-card">
        <div class="card-kicker">${esc(ev.name.startsWith(KIND[ev.kind]) ? ev.name : KIND[ev.kind] + ' · ' + ev.name)}</div>
        <div class="card-title ${check.passed ? 'under' : 'over'}">${check.passed ? (ev.kind === 'tournament' ? `${ordinal(check.place)} place!` : ev.kind === 'rival' ? 'You win!' : 'Goal complete!') : 'Not quite'}</div>
        <div class="card-note">${esc(ev.goalText)}${check.passed ? '' : ` — ${esc(check.detail)}`}</div>
        <div class="card-stats"><div><span>Strokes</span><b>${res.total}</b></div><div><span>Par</span><b>${res.par}</b></div><div><span>Stars</span><b>${res.stars}</b></div></div>
        ${board ? `<table class="scores board">${board.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td>${r.colour ? `<i class="dot" style="background:${r.colour}"></i>` : ''}${esc(r.name)}</td><td>${r.total}</td></tr>`).join('')}</table>` : ''}
        ${first && ev.reward ? `<div class="card-note good">Reward: ${rewardText(ev.reward, true)}</div>` : ''}
        <button class="btn primary" data-a="ok">${check.passed ? 'Continue' : 'Back to career'}</button></div>`;
      el.hidden = false;
      el.onclick = e => { if (e.target.closest('[data-a=ok]')) { ctx.click?.(); el.hidden = true; resolve(); } };
    });
  }

  function rankCard(ch) {
    return new Promise(resolve => {
      const el = $('#career');
      el.innerHTML = `<div class="card career-card"><div class="card-kicker">${esc(ch.title)} complete</div>
        <div class="card-title under">New rank: ${esc(ch.rankOnFinish || rankOf(story()))}</div>
        <div class="dlg-face center">${portraitSVG(CHARACTERS.you.portrait, { size: 110 })}</div>
        <button class="btn primary" data-a="ok">Onward</button></div>`;
      el.hidden = false;
      el.onclick = e => { if (e.target.closest('[data-a=ok]')) { el.hidden = true; resolve(); } };
    });
  }

  function magsTip(st) {
    const ch = CHAPTERS[0].data;
    const next = ch.events.find(e => !st.events[e.id]?.passed);
    if (!next) return [['mags', 'You’ve outgrown the Muni, {name}. The Club Tour is coming.']];
    return [['mags', `Next up: ${next.name}. ${next.goalText}.`], ['mags', ch.events.indexOf(next) < 3 ? 'Take your time. Lessons are free.' : 'Remember: Long Sight before the tricky ones, Mulligan when it goes wrong.']];
  }

  return { open, render };
}

function rewardText(r, long = false) {
  if (!r) return '';
  const parts = [];
  if (r.coins) parts.push(`${ICONS.coin}${r.coins}`);
  for (const [k, n] of Object.entries(r.helpers || {})) parts.push(long ? `+${n} ${k === 'longSight' ? 'Long Sight' : 'Mulligan'}` : `+${n}${k === 'longSight' ? '⤴' : '↶'}`);
  return parts.join(' ');
}
