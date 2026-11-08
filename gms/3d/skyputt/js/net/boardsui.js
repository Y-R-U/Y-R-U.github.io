// Online board tabs for the Daily Challenge page and the Weekly Ladder page (boards agent).
// The tab row stays hidden until the server says it has boards (boards.available()), so offline,
// on an older server or where ONLINE_PUBLIC keeps the network off, the page looks exactly as before.
//
//   onlineTabs({ el, boards, key, local, online })   el: the section; local: the existing board's
//   element; online(panel) renders the Online panel into `panel` (dailyPanel / roundPanel below).
import { CHEAT_WARNING } from './net.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chosen = {};   // per-screen tab / scope / period, kept while the page lives
const toPar = (s, p) => (s === p ? 'E' : s > p ? `+${s - p}` : `${s - p}`);

export function onlineTabs({ el, boards, key, local, online, labels = ['Ghosts', 'Online'], onlineSub = null }) {
  if (!el || !boards) return;
  const tabs = document.createElement('div');
  tabs.className = 'seg ob-tabs';
  tabs.hidden = true;
  tabs.innerHTML = `<button data-tab="local">${esc(labels[0])}</button><button data-tab="online">${esc(labels[1])}</button>`;
  const panel = document.createElement('div');
  panel.className = 'ob-panel';
  panel.hidden = true;
  el.insertAdjacentElement('afterend', tabs);
  (local || tabs).insertAdjacentElement('afterend', panel);
  const sub = el.querySelector('small'), localSub = sub?.innerHTML;
  const show = tab => {
    chosen[key] = tab;
    if (sub && onlineSub) sub.innerHTML = tab === 'online' ? esc(onlineSub) : localSub;
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (local) local.hidden = tab === 'online';
    panel.hidden = tab !== 'online';
    if (tab === 'online') online(panel);
  };
  tabs.onclick = e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); show(b.dataset.tab); };
  boards.available().then(ok => {
    if (!ok || !tabs.isConnected) return;
    tabs.hidden = false;
    show(chosen[key] === 'online' ? 'online' : 'local');
    boards.flush();
  }).catch(() => {});
}

const seg = (name, opts, cur) => `<div class="seg ob-seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${v === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;

function table(res, cell) {
  const rows = res.rows || [], me = res.me;
  let html = rows.map(r => `<tr class="${r.you ? 'you' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td>${cell(r)}</tr>`).join('');
  if (me && !rows.some(r => r.you)) html += `<tr class="gap"><td colspan="3">⋯</td></tr><tr class="you"><td>${me.rank}</td><td>${esc(me.name)}</td>${cell(me)}</tr>`;
  return `<table class="scores board ob-board">${html}</table>`;
}

function meLine(res, none) {
  if (res.me) return `<div class="ob-me">You: <b>#${res.me.rank}</b> of ${res.total}</div>`;
  return `<div class="ob-me">${res.total ? `${res.total} player${res.total === 1 ? '' : 's'}` : 'Nobody yet'} · ${esc(none)}</div>`;
}

// Generic panel: controls (segs) on top, then load → table. `load(state)` → Promise<board>.
function panelOf(el, key, { state, controls, load, render, foot }) {
  const st = chosen[key + ':st'] || (chosen[key + ':st'] = { ...state });
  let seq = 0;
  async function draw() {
    const my = ++seq;
    el.innerHTML = `${controls(st)}<div class="ob-body"><div class="card-note small">Loading…</div></div>${foot ? `<div class="card-note small ob-foot">${foot}</div>` : ''}`;
    const body = el.querySelector('.ob-body');
    let res = null;
    try { res = await load(st); } catch (e) { res = { error: e }; }
    if (my !== seq || !el.isConnected) return;
    body.innerHTML = res.error ? `<div class="card-note small">${res.error.code === 'rate_limited' ? 'Busy — try again in a minute.' : 'Can’t reach the online board right now.'}</div>` : render(res, st);
  }
  el.onclick = e => {
    const b = e.target.closest('[data-seg] button'); if (!b) return;
    e.stopPropagation();
    st[b.parentElement.dataset.seg] = b.dataset.v;
    draw();
  };
  el.onchange = e => { const s = e.target.closest('select[data-sel]'); if (!s) return; st[s.dataset.sel] = s.value; draw(); };
  draw();
}

const SCOPES = [['all', 'Everyone'], ['friends', 'Friends']];
const FRIENDS_NOTE = 'Friends = people you’ve finished an online room with.';

// Daily: today's board for the hole you were given (players on a fallback hole have their own board).
export function dailyPanel(boards, { day, hole, sent, wait }) {
  return el => panelOf(el, 'daily', {
    state: { scope: 'all' },
    controls: st => seg('scope', SCOPES, st.scope),
    load: async st => { await Promise.resolve(wait?.()).catch(() => {}); return boards.dailyBoard({ day, hole, scope: st.scope }); },
    render: (res, st) => `${meLine(res, sent ? 'your result isn’t on this board yet' : 'hole out to join')}
      ${res.rows.length ? table(res, r => `<td>${r.strokes}${r.met ? ' <i class="ob-met">✓</i>' : ''}</td>`) : `<div class="card-note small">${st.scope === 'friends' ? 'None of your friends has finished today’s hole yet.' : 'Be the first on today’s board.'}</div>`}
      ${st.scope === 'friends' ? `<div class="card-note small">${FRIENDS_NOTE}</div>` : ''}`,
    foot: `Best of your ${3} tries counts · ✓ = twist cleared. ${esc(CHEAT_WARNING.split('.')[0])}.`,
  });
}

// Course rounds: best round per player, this week or all time, per course / nine.
export function roundPanel(boards, { rounds, week, wait }) {
  return el => panelOf(el, 'round', {
    state: { pick: `${rounds[0].course}:${rounds[0].round}`, period: 'week', scope: 'all' },
    controls: st => `<select class="ob-sel" data-sel="pick" aria-label="Course">${rounds.map(r => `<option value="${r.course}:${r.round}" ${`${r.course}:${r.round}` === st.pick ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      <div class="ob-row">${seg('period', [['week', 'This week'], ['all', 'All time']], st.period)}${seg('scope', SCOPES, st.scope)}</div>`,
    load: async st => { await Promise.resolve(wait?.()).catch(() => {}); const [course, round] = st.pick.split(':'); return boards.roundBoard({ course, round, week: st.period === 'week' ? week : 'all', scope: st.scope }); },
    render: (res, st) => `${meLine(res, 'finish this round to join')}
      ${res.rows.length ? table(res, r => `<td>${r.strokes} <small class="ob-par">${toPar(r.strokes, r.par)}</small></td>`) : `<div class="card-note small">${st.scope === 'friends' ? 'No friends on this board yet.' : 'No rounds yet. Play it from the map to be first.'}</div>`}
      ${st.scope === 'friends' ? `<div class="card-note small">${FRIENDS_NOTE}</div>` : ''}`,
    foot: 'Your best full round of each course or nine (week starts Monday). Scores are reported by each player’s own game.',
  });
}
