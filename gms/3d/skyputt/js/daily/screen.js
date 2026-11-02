// Daily Challenge screen (#daily) and the title tile. The round itself is played through ctx.play.
//   ctx: { store, daily (createDaily), now(), click, onBack, play(ch, att) → Promise<result|null> }
import { TRIES, MILESTONES, nextMilestone, goalMet, FINISH_REWARD, GOAL_REWARD } from './daily.js';
import { dayStart, addDays } from '../events/calendar.js';
import { countdown } from '../events/events.js';
import { rewardHTML } from '../events/screen.js';
import { THEME_LIST } from '../app/menus.js';
import { COURSES } from '../course/holes/index.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const back = `<button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>`;
const theme = id => THEME_LIST.find(t => t.id === id) || THEME_LIST[0];
const untilTomorrow = (ymd, now) => countdown(dayStart(addDays(ymd, 1)) - now);
const tryText = (t, ch) => t.quit ? 'quit' : t.picked ? 'picked up' : `${t.strokes}${goalMet(ch.twist, ch.hole, t) ? ' ✓' : ''}`;

// A little tear-off calendar showing today's date (an emoji calendar always says "JUL 17").
const calIcon = day => `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><rect x="2" y="4" width="24" height="22" rx="5" fill="#fff"/>
  <path d="M2 9a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v2H2z" fill="#e8463a"/><rect x="7.5" y="1.5" width="2.6" height="6" rx="1.3" fill="#3a4a6a"/>
  <rect x="17.9" y="1.5" width="2.6" height="6" rx="1.3" fill="#3a4a6a"/><text x="14" y="23" text-anchor="middle" font-size="12" font-weight="700" fill="#1b2440" font-family="Fredoka, system-ui, sans-serif">${day}</text></svg>`;

export function dailyTileHTML(daily) {
  const ymd = daily.today(), ch = daily.current(ymd), left = daily.triesLeft(ymd), st = daily.streak(ymd), b = daily.best(ymd);
  const sub = left === TRIES ? `${ch.twist.icon} ${ch.twist.name}` : b != null ? `Best ${b}${left ? ` · ${left} left` : ''}` : `${left} tr${left === 1 ? 'y' : 'ies'} left`;
  return `<span class="tm-ic dl-ic">${calIcon(+ymd.slice(8))}</span><span class="tm"><b>Daily #${ch.n}${st.count ? ` <em class="dl-st">🔥${st.count}</em>` : ''}</b><small>${esc(sub)}</small></span>${left === TRIES ? '<i class="dotn">!</i>' : ''}`;
}

export function createDailyScreen(ctx) {
  const { store, daily } = ctx;

  function page(flash = '') {
    const now = ctx.now(), ymd = daily.today(), ch = daily.current(ymd), el = $('#daily');
    const left = daily.triesLeft(ymd), used = daily.triesUsed(ymd), best = daily.best(ymd), st = daily.streak(ymd), met = daily.cleared(ymd);
    const rec = daily.peek(ymd), th = theme(ch.theme);
    const rows = daily.board(ymd, store.story().name || 'You');
    const me = rows.find(r => r.you);
    const nm = nextMilestone(st.count);
    const courseName = COURSES[ch.course]?.name || '';
    el.innerHTML = `<div class="career-card wide daily">
      <div class="map-head">${back}<div><div class="map-title">Daily Challenge #${ch.n}</div>
        <div class="map-sub">${esc(new Date(dayStart(ymd)).toDateString())} · new one in ${esc(untilTomorrow(ymd, now))}</div></div></div>
      ${flash ? `<div class="card-note good dl-flash">${flash}</div>` : ''}
      <div class="dl-hero">
        <span class="sw big" style="background:${th.swatch}"><i>${ch.twist.icon}</i></span>
        <div class="dl-what"><b>${esc(ch.hole.name)}</b><small>${esc(courseName)} · par ${ch.hole.par} · ${esc(th.name)}</small></div>
      </div>
      <div class="dl-twist ${met ? 'met' : ''}"><b>${ch.twist.icon} ${esc(ch.twist.name)}</b><span>${esc(ch.twist.text(ch.hole))}</span>${met ? '<em>✓ Cleared</em>' : ''}</div>
      <div class="ev-stats"><div><span>Tries</span><b>${left}/${TRIES}</b></div><div><span>Best</span><b>${best ?? '–'}</b></div>
        <div><span>Rank</span><b>${me ? `${me.rank}/${rows.length}` : '–'}</b></div><div><span>Streak</span><b>🔥 ${st.count}</b></div></div>
      ${left ? `<button class="btn primary" data-a="play">Play try ${used + 1} of ${TRIES} <small>· best result counts</small></button>`
        : `<div class="card-note">All ${TRIES} tries used. A new challenge in ${esc(untilTomorrow(ymd, now))}.</div>`}
      ${rec?.tries.length ? `<div class="dl-tries">${rec.tries.map((t, i) => `<span class="${goalMet(ch.twist, ch.hole, t) ? 'met' : t.quit || t.picked ? 'bad' : ''}">Try ${i + 1}: <b>${esc(tryText(t, ch))}</b></span>`).join('')}</div>` : ''}
      ${used ? `<button class="btn" data-a="share">Share result</button><textarea class="dl-share" readonly hidden></textarea>` : ''}
      ${st.atRisk ? `<div class="card-note">Finish today’s hole to keep your ${st.count}-day streak.</div>` : ''}
      <div class="sec">Today’s board <small>you vs the ghost field · ties go to you</small></div>
      <table class="scores board dl-board">${rows.map(r => `<tr class="${r.you ? 'you' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.strokes ?? '–'}</td></tr>`).join('')}</table>
      ${me ? '' : '<div class="card-note small">Hole out to join the board.</div>'}
      <div class="sec">Rewards</div>
      <div class="tiers">
        <div class="${rec?.paid.finish ? 'on' : ''}"><b>Finish</b><span>${rewardHTML(FINISH_REWARD)}${rec?.paid.finish ? ' ✓' : ''}</span></div>
        <div class="${rec?.paid.goal ? 'on' : ''}"><b>Twist</b><span>${rewardHTML(GOAL_REWARD)}${rec?.paid.goal ? ' ✓' : ''}</span></div>
      </div>
      <div class="sec">Streak <small>days in a row you finish the daily · best ${st.best}</small></div>
      <div class="tiers dl-miles">${Object.entries(MILESTONES).map(([d, r]) => `<div class="${st.count >= +d ? 'on' : ''} ${+d === nm ? 'next' : ''}"><b>${d} days</b><span>${rewardHTML(r)}</span></div>`).join('')}
        <div><b>Every 30</b><span>after that, the 30-day reward again</span></div></div>
    </div>`;
    el.hidden = false;
    el.scrollTop = 0;
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { el.hidden = true; ctx.onBack(); return; }
      if (b.dataset.a === 'share') { share(el); return; }
      if (b.dataset.a === 'play') {
        const att = daily.start();
        if (!att) { page(); return; }
        el.hidden = true;
        let res = null;
        try { res = await ctx.play(att.ch, att); } catch (err) { console.warn('[skyputt] daily round failed', err); }
        const out = daily.finish(att, res);
        page(flashFor(out, att));
      }
    };
  }

  function flashFor(out, att) {
    const t = out.try, parts = [];
    parts.push(t.quit ? `Try ${att.i + 1} quit.` : t.picked ? `Try ${att.i + 1}: picked up.` : `Try ${att.i + 1}: ${t.strokes} stroke${t.strokes === 1 ? '' : 's'}${out.met ? ` · ${esc(att.ch.twist.name)} cleared!` : ''}`);
    for (const r of out.rewards) parts.push(`${esc(r.why)}: ${rewardHTML(r.reward)}`);
    if (out.milestone) parts.push(`🔥 ${out.milestone.days}-day streak!`);
    return parts.join('<br>');
  }

  async function share(el) {
    const url = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
    const text = daily.shareText(daily.today(), url);
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    const ta = el.querySelector('.dl-share');
    try { await navigator.clipboard.writeText(text); toast(el, 'Copied to clipboard'); }
    catch { if (ta) { ta.hidden = false; ta.value = text; ta.select(); } toast(el, 'Copy the text below'); }
    if (ta) { ta.value = text; ta.hidden = false; }
  }
  function toast(el, msg) {
    const b = el.querySelector('[data-a=share]'); if (!b) return;
    b.textContent = msg; setTimeout(() => { b.textContent = 'Share result'; }, 1600);
  }

  return { open: () => page(), page };
}
