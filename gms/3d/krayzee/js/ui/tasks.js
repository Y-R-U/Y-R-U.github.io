// D34 Tasks: the menu button, the grid popup, the pause-screen link, the in-flight tick toast and the set celebration.
// Mounted by one line in js/ui/index.js (// TASKS). Engine: js/game/tasks.js. Never alert(); nothing here blocks flight.
import { el, esc, onTap } from './dom.js';
import { createPopup } from './popup.js';
import { career } from './career.js';
import { getTasks } from '../game/tasks.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const TIER = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
let T = null, root = null, pop = null, menuBtn = null, pauseLink = null, filter = 'all', sel = null;
const toasts = [];
let toastEl = null, toastBusy = false, celebrations = [], celeEl = null;

function injectCss() {
  if (document.getElementById('kz-tasks-css')) return;
  const link = document.createElement('link');
  link.id = 'kz-tasks-css'; link.rel = 'stylesheet';
  link.href = new URL('../../css/tasks.css', import.meta.url).href;
  document.head.append(link);
}

export function mountTasks(uiRoot) {
  if (T) return T;
  root = uiRoot;
  injectCss();
  T = getTasks({ career: career() });
  pop = createPopup(root, { title: 'Tasks', sub: 'The Royal Ledger', cls: 'kz-tasks', onClose: () => { T.markSeen(); paintButtons(); } });
  pop.body.addEventListener('click', onGridTap);
  pop.foot.innerHTML = '<div class="kz-tk-detail" aria-live="polite"></div>';
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.isOpen) { e.preventDefault(); e.stopImmediatePropagation(); pop.close(); } }, true);
  mountMenuButton();
  mountPauseLink();
  T.on('task', (t) => { if (T.attached) queueToast(t); paintButtons(); if (pop.isOpen) paint(); });
  T.on('set', (s) => { celebrations.push(s); });
  T.on('change', () => { paintButtons(); if (pop.isOpen) paint(); });
  setInterval(tick, 700);
  paintButtons();
  return T;
}

export function openTasks() {
  if (!T) return;
  sel = null;
  paint();
  pop.open();
  pop.body.scrollTop = 0;
}

// ---------------------------------------------------------------- hooks into the menu and pause screen (DOM only)
function mountMenuButton() {
  const grid = root.querySelector('.kz-menu .kz-grid');
  if (!grid || root.querySelector('.kz-tk-menu')) return;
  menuBtn = el(`<button class="kz-btn kz-tk-menu" data-a="tasks" aria-label="Tasks"><span class="kz-tk-ico" aria-hidden="true">✓</span>Tasks<em class="kz-tk-count"></em><i class="kz-tk-new" hidden></i></button>`);
  grid.after(menuBtn);
  onTap(menuBtn, openTasks);
}
function mountPauseLink() {
  const body = root.querySelector('.kz-settings .kz-body');
  if (!body || root.querySelector('.kz-tk-pause')) return;
  pauseLink = el('<button class="kz-tk-pause" type="button"><span>✓ Tasks</span><b></b><i aria-hidden="true">›</i></button>');
  body.prepend(pauseLink);
  onTap(pauseLink, openTasks);
}
function paintButtons() {
  if (!T) return;
  const s = T.summary(), n = T.unseen().length;
  if (menuBtn) { menuBtn.querySelector('.kz-tk-count').textContent = `${s.done}/${s.total}`; menuBtn.querySelector('.kz-tk-new').hidden = !n; }
  if (pauseLink) pauseLink.querySelector('b').textContent = `${s.done}/${s.total}`;
  const card = root.querySelector('.kz-menu .kz-roundel');
  if (card) {
    const w = T.worn();
    let m = card.querySelector('.kz-tk-medal');
    if (w && !m) { m = el('<i class="kz-tk-medal" aria-hidden="true"></i>'); card.append(m); }
    if (m) { m.hidden = !w; if (w) { m.textContent = w.badge; m.title = w.epithet; } }
  }
}

// ---------------------------------------------------------------- the grid
const hms = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
function progressText(t) {
  if (t.done) return 'Done';
  if (!t.counted) return '';
  const v = t.value, g = t.target;
  if (/Secs$/.test(t.id) || ['air_30m', 'air_2h', 'air_5h', 'air_10h', 'air_50h', 'tub_hour', 'moth_30', 'endurance', 'form_30', 'form_300', 'upside_60'].includes(t.id)) {
    return g >= 3600 ? `${hms(v)} / ${hms(g)}` : `${Math.floor(v)} s / ${g} s`;
  }
  if (t.id.startsWith('dist_')) return `${fmt(v / 1000)} / ${fmt(g / 1000)} km`;
  if (t.id === 'lofty') return `${fmt(v / 0.3048)} / ${fmt(g / 0.3048)} ft`;
  if (t.id.startsWith('combo_')) return `×${v} / ×${g}`;
  return `${fmt(v)} / ${fmt(g)}`;
}

function paint() {
  const s = T.summary(), st = T.stats(), unseen = new Set(T.unseen());
  const list = T.tasks(), sets = T.sets(), reg = T.regalia();
  const prof = (() => { try { return JSON.parse(localStorage.getItem('krayzee.profile')) || {}; } catch (e) { return {}; } })();
  const worn = T.worn();
  const head = `<div class="kz-tk-sum">
      <div class="kz-tk-big"><b>${s.done}</b><span>/ ${s.total} tasks</span></div>
      <div class="kz-tk-sumr"><div class="kz-bar"><i style="width:${(100 * s.done / s.total).toFixed(1)}%"></i></div>
        <small>${s.sets}/${s.setTotal} sets · ${fmt(s.earned)} PP earned</small></div>
    </div>
    <div class="kz-tk-log">Logbook · <b>${hms(st.airSecs || 0)}</b> aloft · <b>${fmt((st.distM || 0) / 1000)} km</b> · <b>${fmt(st.landings || 0)}</b> landings · <b>${fmt(st.infractions || 0)}</b> rules broken</div>
    <div class="kz-tk-regalia">${reg.length ? reg.map((r) => `<button type="button" class="kz-tk-reg${r.worn ? ' on' : ''}" data-wear="${r.id}" aria-pressed="${r.worn}"><span>${r.badge}</span>${esc(r.epithet)}</button>`).join('')
      : '<p>Finish a set to earn a badge for your pilot card.</p>'}${worn && prof.name ? `<small class="kz-tk-styled">Styled: <i>${esc(prof.name)} ${esc(worn.epithet)}</i></small>` : ''}</div>
    <div class="kz-tk-filter" role="tablist">${['all', 'todo', 'done'].map((f) => `<button type="button" data-f="${f}" class="${filter === f ? 'on' : ''}" role="tab" aria-selected="${filter === f}">${{ all: 'All', todo: 'To do', done: 'Done' }[f]}</button>`).join('')}</div>`;
  const body = sets.map((set) => {
    const tasks = list.filter((t) => t.set === set.id && (filter === 'all' || (filter === 'done' ? t.done : !t.done)));
    if (!tasks.length) return '';
    const tiles = tasks.map((t) => {
      const lock = !t.avail;
      const bar = t.counted && !t.done && !lock ? `<span class="kz-tk-bar"><i style="width:${(t.frac * 100).toFixed(1)}%"></i></span>` : '';
      return `<button type="button" class="kz-tk-tile ${t.tier}${t.done ? ' done' : ''}${lock ? ' lock' : ''}${unseen.has(t.id) ? ' new' : ''}${sel === t.id ? ' sel' : ''}" data-id="${t.id}" aria-label="${esc(t.name)}${t.done ? ', done' : lock ? ', coming soon' : ''}">
        <span class="kz-tk-i" aria-hidden="true">${lock ? '🔒' : t.icon}</span><span class="kz-tk-n">${esc(t.name)}</span>
        ${bar}<span class="kz-tk-pp">${lock ? 'Soon' : `+${fmt(t.pp)}`}</span>${t.done ? '<span class="kz-tk-tick" aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('');
    return `<section class="kz-tk-set${set.done ? ' done' : ''}" data-set="${set.id}">
      <header><span class="kz-tk-badge" aria-hidden="true">${set.badge}</span><span class="kz-tk-sn"><b>${esc(set.name)}</b><small>${set.done ? `✓ Complete · ${esc(set.epithet)}` : `Set reward +${fmt(set.bonus)} PP · ${esc(set.epithet)}`}${set.locked ? ' · new planes coming' : ''}</small></span>
        <em>${set.count}/${set.total}</em></header>
      <div class="kz-tk-grid">${tiles}</div></section>`;
  }).join('') || '<p class="kz-tk-empty">Nothing here yet. Go and misbehave.</p>';
  pop.body.innerHTML = head + body;
  paintDetail();
}

function paintDetail() {
  const d = pop.foot.querySelector('.kz-tk-detail');
  const t = sel && T.tasks().find((x) => x.id === sel);
  if (!t) { d.innerHTML = '<span class="kz-tk-hint">Tap a task to see what it wants.</span>'; return; }
  const p = progressText(t);
  d.innerHTML = `<span class="kz-tk-di" aria-hidden="true">${t.avail ? t.icon : '🔒'}</span><span class="kz-tk-dt"><b>${esc(t.name)}</b> ${esc(t.avail ? t.desc : 'Coming soon: this aircraft is still in the Royal workshop.')}</span>
    <span class="kz-tk-dm"><em class="${t.tier}">${TIER[t.tier]}</em>${p ? `<small>${esc(p)}${t.perFlight && !t.done ? ' · best flight' : ''}</small>` : ''}<b>+${fmt(t.pp)} PP</b></span>`;
}

function onGridTap(e) {
  const f = e.target.closest('[data-f]');
  if (f) { e.stopPropagation(); filter = f.dataset.f; paint(); return; }
  const w = e.target.closest('[data-wear]');
  if (w) { e.stopPropagation(); T.wear(T.worn()?.id === w.dataset.wear ? null : w.dataset.wear); paint(); paintButtons(); return; }
  const tile = e.target.closest('.kz-tk-tile');
  if (!tile) return;
  e.stopPropagation();
  sel = sel === tile.dataset.id ? null : tile.dataset.id;
  for (const x of pop.body.querySelectorAll('.kz-tk-tile.sel')) x.classList.remove('sel');
  if (sel) tile.classList.add('sel');
  paintDetail();
}

// ---------------------------------------------------------------- in flight: a small queued tick, top-left under the score
// It slides down the left edge from under the score until it clears the HUD strip, banner, subtitles and buttons.
const AVOID = ['.krz-score', '.krz-top-l', '.krz-top-r', '#krz-hud .krz-hud-strip', '#krz-hud .krz-ap', '#krz-hud .krz-axes', '#krz-hud .krz-banner', '.krz-r-subs', '.krz-r-tower', '.krz-warp', '.krz-prompt', '.krz-r-panel'];
function visibleRects() {
  const out = [];
  for (const s of AVOID) for (const n of document.querySelectorAll(s)) {
    if (n.hidden || n.closest('[hidden]')) continue;
    const r = n.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
    out.push(r);
  }
  return out;
}
function placeToast() {
  const sc = document.querySelector('.krz-score')?.getBoundingClientRect();
  const left = Math.round(sc?.width ? sc.left : 10), w = toastEl.offsetWidth || 220, h = toastEl.offsetHeight || 30;
  const rs = visibleRects();
  let top = Math.round(sc?.height ? sc.bottom + 6 : 10);
  for (let i = 0; i < 80 && top < innerHeight * 0.55; i++) {
    const hit = rs.find((r) => r.left < left + w && left < r.right && r.top < top + h + 4 && top - 4 < r.bottom);
    if (!hit) break;
    top = Math.round(hit.bottom + 6);
  }
  toastEl.style.left = `${left}px`;
  toastEl.style.top = `${top}px`;
}
function queueToast(t) { toasts.push(t); if (!toastBusy) nextToast(); }
function nextToast() {
  if (!T.attached) toasts.length = 0; // quit to the menu: the Tasks dot carries the news instead
  if (!toasts.length) { toastBusy = false; return; }
  toastBusy = true;
  // paused (settings) or a popup open: hold the queue until the flight is back on screen
  if (document.querySelector('#kz-ui .kz-pop.on')) { setTimeout(nextToast, 400); return; }
  const t = toasts.shift();
  if (!toastEl) { toastEl = el('<div class="kz-tk-toast" role="status" aria-live="polite"></div>'); root.append(toastEl); }
  toastEl.className = `kz-tk-toast ${t.tier}`;
  toastEl.innerHTML = `<b aria-hidden="true">✓</b><span>${esc(t.name)}</span><em>+${fmt(t.pp)} PP</em>`;
  toastEl.dataset.id = t.id;
  placeToast();
  void toastEl.offsetWidth;
  toastEl.classList.add('on');
  setTimeout(() => { toastEl.classList.remove('on'); setTimeout(nextToast, 260); }, 2000);
}

// set complete: a card, only when parked or in the menu; taps through everywhere except the card itself
function tick() {
  if (!celebrations.length || celeEl || (T.attached && !T.parked) || pop.isOpen) return;
  const s = celebrations.shift();
  celeEl = el(`<div class="kz-tk-cele" role="status"><div class="kz-tk-cc">
    <small>Set complete</small><span class="kz-tk-cb" aria-hidden="true">${s.badge}</span><h3>${esc(s.name)}</h3>
    <p>+${fmt(s.bonus)} PP · badge earned: <i>${esc(s.epithet)}</i></p>
    <div class="kz-tk-cbtn">${T.worn()?.id === s.id ? '' : '<button type="button" class="kz-btn ghost" data-c="wear">Wear it</button>'}<button type="button" class="kz-btn primary" data-c="ok">Splendid</button></div></div></div>`);
  root.append(celeEl);
  const done = () => { if (!celeEl) return; celeEl.classList.remove('on'); const n = celeEl; celeEl = null; setTimeout(() => n.remove(), 300); };
  celeEl.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; e.stopPropagation(); if (b.dataset.c === 'wear') { T.wear(s.id); paintButtons(); } done(); });
  requestAnimationFrame(() => celeEl?.classList.add('on'));
  setTimeout(done, 9000);
}
