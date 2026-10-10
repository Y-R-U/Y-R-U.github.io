// All DOM: HUD, leaderboard, neon name tags, kill feed, banners, popups and
// the callsign modal. No alerts, no prompts — ever.

import * as THREE from 'three';
import { NAME_POOL, IS_TOUCH, TANK, PICKUP_KINDS } from './config.js';
import { MODES, nemesis, prey, callsignPoolSize } from './career.js';
import { $, clamp, pickRandom, fmtTime } from './utils.js';
import { camera } from './world.js';
import { state, aliveTanks } from './state.js';
import { AudioFX } from './audio.js';

const _v = new THREE.Vector3();
let handlers = {};

// ---------------------------------------------------------------------------
// Init / wiring
// ---------------------------------------------------------------------------

export function initUI(h) {
  handlers = h;

  $('btn-play').addEventListener('click', () => handlers.onPlay());
  $('btn-help').addEventListener('click', () => $('help-box').classList.toggle('hidden'));
  $('btn-retry').addEventListener('click', () => handlers.onRetry());
  $('btn-menu').addEventListener('click', () => handlers.onMenu());
  $('btn-spectate').addEventListener('click', () => handlers.onSpectate());
  $('btn-win-retry').addEventListener('click', () => handlers.onRetry());
  $('btn-win-menu').addEventListener('click', () => handlers.onMenu());
  $('btn-spec-retry').addEventListener('click', () => handlers.onRetry());
  $('btn-spec-menu').addEventListener('click', () => handlers.onMenu());
  $('btn-edit-name').addEventListener('click', () => openNameModal());
  $('btn-title-edit').addEventListener('click', () => openNameModal());
  $('btn-mute').addEventListener('click', () => handlers.onToggleMute());
  $('career-strip').addEventListener('click', () => handlers.onCareer());
  $('btn-career-close').addEventListener('click', closeCareerPanel);
  $('btn-daily').addEventListener('click', () => handlers.onDaily());
  $('btn-autofire').addEventListener('click', () => handlers.onToggleAutoFire());
  $('leaderboard').addEventListener('click', () => {
    lbExpanded = !lbExpanded;
    $('leaderboard').classList.toggle('expanded', lbExpanded);
  });

  for (const pill of document.querySelectorAll('.mode-pill')) {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.mode-pill').forEach((p) => p.classList.remove('selected'));
      pill.classList.add('selected');
      handlers.onModeChange(parseInt(pill.dataset.count, 10));
    });
  }

  // callsign modal
  $('btn-name-cancel').addEventListener('click', closeNameModal);
  $('btn-name-random').addEventListener('click', () => {
    $('name-input').value = pickRandom(NAME_POOL);
  });
  $('btn-name-save').addEventListener('click', saveNameFromModal);
  $('name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNameFromModal();
    if (e.key === 'Escape') closeNameModal();
    e.stopPropagation();   // don't let WASD drive the tank while typing
  });
  $('name-input').addEventListener('keyup', (e) => e.stopPropagation());

  buildArrowPool();
}

export function setAutoFireUI(on) {
  const b = $('btn-autofire');
  b.textContent = 'AUTO-FIRE ' + (on ? 'ON' : 'OFF');
  b.classList.toggle('on', on);
}

export function updateDailyUI(daily, today) {
  const best = daily && daily.date === today && daily.best ? ' · TODAY BEST #' + daily.best : '';
  $('daily-sub').textContent = 'same field for everyone · ' + today + best;
}

export function selectModePill(count) {
  document.querySelectorAll('.mode-pill').forEach((p) =>
    p.classList.toggle('selected', parseInt(p.dataset.count, 10) === count));
}

// ---------------------------------------------------------------------------
// Callsign modal
// ---------------------------------------------------------------------------

export function sanitizeName(raw) {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 10);
  return s.length >= 2 ? s : null;
}

function openNameModal() {
  $('name-input').value = state.playerName;
  $('name-modal').classList.remove('hidden');
  setTimeout(() => $('name-input').focus(), 50);
}

function closeNameModal() {
  $('name-modal').classList.add('hidden');
}

function saveNameFromModal() {
  const name = sanitizeName($('name-input').value);
  if (!name) {
    $('name-input').classList.add('shake');
    setTimeout(() => $('name-input').classList.remove('shake'), 400);
    return;
  }
  closeNameModal();
  handlers.onNameSave(name);
}

export function setPlayerNameUI(name) {
  $('player-name').textContent = name;
  $('title-name').textContent = name;
}

// ---------------------------------------------------------------------------
// Career strip + panel
// ---------------------------------------------------------------------------

function row(parent, label, value, cls) {
  const r = document.createElement('div');
  r.className = 'stat-row' + (cls ? ' ' + cls : '');
  const a = document.createElement('span');
  a.textContent = label;
  const b = document.createElement('span');
  b.textContent = value;
  r.append(a, b);
  parent.appendChild(r);
  return r;
}

/** The one-line teaser under the callsign on the title screen. */
export function updateCareerStrip(career, modeId) {
  const el = $('career-strip');
  const t = career.totals;
  if (!t.played) {
    el.textContent = 'CAREER — NO MATCHES YET ▸';
    return;
  }
  const m = career.modes[modeId] || {};
  const bits = [
    t.played + (t.played === 1 ? ' MATCH' : ' MATCHES'),
    t.wins + ' WON',
    t.kills + ' KILLS',
  ];
  if (m.bestPlace) bits.push('BEST #' + m.bestPlace);
  el.textContent = 'CAREER — ' + bits.join(' · ') + ' ▸';
}

export function openCareerPanel(career, modeId) {
  const body = $('career-body');
  body.textContent = '';
  const t = career.totals;

  const overall = document.createElement('div');
  overall.className = 'career-block';
  const winRate = t.played ? Math.round((t.wins / t.played) * 100) : 0;
  row(overall, 'Matches', t.played);
  row(overall, 'Victories', `${t.wins} (${winRate}%)`);
  row(overall, 'Kills / deaths', `${t.kills} / ${t.deaths}`);
  row(overall, 'Best kill streak', t.bestStreak);
  row(overall, 'Best score', t.bestScore);
  row(overall, 'Time in the field', fmtTime(t.playTime));
  body.appendChild(overall);

  const head = document.createElement('div');
  head.className = 'career-head';
  head.textContent = 'BY MODE';
  body.appendChild(head);

  const table = document.createElement('div');
  table.className = 'career-table';
  const cells = ['MODE', 'PLAYED', 'WON', 'BEST', 'KILLS', 'LONGEST', 'SCORE'];
  for (const c of cells) {
    const h = document.createElement('span');
    h.className = 'ct-h';
    h.textContent = c;
    table.appendChild(h);
  }
  for (const mode of MODES) {
    const s = career.modes[mode.id] || {};
    const vals = [
      mode.label, s.played || 0, s.wins || 0,
      s.bestPlace ? '#' + s.bestPlace : '—',
      s.kills || 0, s.bestTime ? fmtTime(s.bestTime) : '—', s.bestScore || 0,
    ];
    vals.forEach((v, i) => {
      const c = document.createElement('span');
      c.className = 'ct-c' + (mode.id === modeId ? ' ct-now' : '') + (i === 0 ? ' ct-mode' : '');
      c.textContent = v;
      table.appendChild(c);
    });
  }
  body.appendChild(table);

  const notes = document.createElement('div');
  notes.className = 'career-block';
  const n = nemesis(career);
  const p = prey(career);
  row(notes, 'Nemesis',
    n ? `${n.name.toUpperCase()} ×${n.n}` : 'nobody yet');
  row(notes, 'Favourite prey',
    p ? `${p.name.toUpperCase()} ×${p.n}` : 'nobody yet');
  row(notes, 'Callsigns felled',
    `${career.callsigns.felled.length} of ${callsignPoolSize()}`);
  row(notes, 'Deployed as',
    career.callsigns.used.length
      ? career.callsigns.used.slice(-4).join(', ')
      : (state.playerName || '—'));
  body.appendChild(notes);

  $('career-popup').classList.remove('hidden');
}

export function closeCareerPanel() {
  $('career-popup').classList.add('hidden');
}

/** Results-screen footer: this match's score plus any records it broke. */
function renderSummary(hostId, summary) {
  const host = $(hostId);
  host.textContent = '';
  if (!summary) { host.classList.add('hidden'); return; }
  host.classList.remove('hidden');

  const score = document.createElement('div');
  score.className = 'res-score';
  score.textContent = summary.score + ' PTS';
  host.appendChild(score);

  const r = summary.records;
  const badges = [];
  if (summary.bounty) badges.push('NEMESIS BOUNTY +250');
  if (r.firstWinInMode) badges.push('FIRST ' + summary.mode.label + ' WIN');
  if (r.bestStreak && summary.streak > 1) badges.push('BEST STREAK ×' + summary.streak);
  // "You beat your own record" is meaningless on the first match in a mode —
  // there was nothing to beat.
  if (!r.firstInMode) {
    if (r.bestScore) badges.push('BEST SCORE');
    if (r.bestPlace) badges.push('BEST PLACEMENT');
    if (r.bestKills) badges.push('MOST KILLS');
    if (r.bestTime) badges.push('LONGEST SURVIVAL');
  }
  badges.splice(4);
  if (badges.length) {
    const wrap = document.createElement('div');
    wrap.className = 'res-badges';
    for (const b of badges) {
      const el = document.createElement('span');
      el.className = 'res-badge';
      el.textContent = b;
      wrap.appendChild(el);
    }
    host.appendChild(wrap);
  }

  const t = summary.career.totals;
  const line = document.createElement('div');
  line.className = 'res-career';
  line.textContent = `CAREER ${t.played} ${t.played === 1 ? 'MATCH' : 'MATCHES'}`
    + ` · ${t.wins} WON · ${t.kills} KILLS`;
  host.appendChild(line);
}

// ---------------------------------------------------------------------------
// Screens / HUD chrome
// ---------------------------------------------------------------------------

export function showTitle() {
  $('title-screen').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('leaderboard').classList.add('hidden');
  $('spectate-bar').classList.add('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  $('inside-arrow').classList.add('hidden');
  document.body.classList.remove('playing', 'spectating');
  hidePopups();
  clearTags();
  clearFeed();
  clearCallouts();
}

export function showMatchHUD() {
  $('title-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('leaderboard').classList.remove('hidden');
  $('spectate-bar').classList.add('hidden');
  document.body.classList.add('playing');
  document.body.classList.remove('spectating');
  hidePopups();
  clearCallouts();
  clearFeed();
  resetHUDCache();
  if (IS_TOUCH) {
    $('touch-left').classList.remove('hidden');
    $('touch-fire').classList.remove('hidden');
  } else {
    $('crosshair').classList.remove('hidden');
  }
}

export function hidePopups() {
  $('gameover-popup').classList.add('hidden');
  $('victory-popup').classList.add('hidden');
  $('name-modal').classList.add('hidden');
  $('career-popup').classList.add('hidden');
}

export function showDefeat({ place, total, kills, time, killer, summary }) {
  $('go-place').textContent = '#' + place + ' / ' + total;
  $('go-kills').textContent = kills;
  $('go-time').textContent = time;
  $('go-killer').textContent = killer;
  renderSummary('go-summary', summary);
  $('gameover-popup').classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  document.body.classList.remove('playing');
}

export function showVictory({ kills, time, summary }) {
  $('win-kills').textContent = kills;
  $('win-time').textContent = time;
  renderSummary('win-summary', summary);
  $('victory-popup').classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  document.body.classList.remove('playing');
}

export function showSpectateBar(name, place) {
  $('gameover-popup').classList.add('hidden');
  document.body.classList.add('spectating');
  $('spec-name').textContent = name;
  $('spec-place').textContent = '#' + place;
  $('spectate-bar').classList.remove('hidden');
}

export function updateSpectateName(name) {
  $('spec-name').textContent = name;
}

export function updateMuteBtn(muted) {
  const b = $('btn-mute');
  b.classList.remove('hidden');
  b.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  b.classList.toggle('muted', muted);
}

// ---------------------------------------------------------------------------
// Banner / hit flash / murder status
// ---------------------------------------------------------------------------

// Restart a CSS animation without a forced reflow (no offsetWidth read).
function replay(el, cls) {
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}

export function showBanner(text, small) {
  const el = $('banner-text');
  el.textContent = text;
  el.classList.toggle('small', !!small);
  $('banner').classList.remove('hidden');
  replay(el, 'play');
}

let flashAnim = null;
export function flashHit(peck) {
  const el = $('hit-flash');
  el.classList.remove('hidden');
  el.classList.toggle('peck', !!peck);
  if (flashAnim) flashAnim.cancel();
  flashAnim = el.animate([{ opacity: peck ? 0.7 : 1 }, { opacity: 0 }],
    { duration: peck ? 300 : 400, easing: 'ease-out', fill: 'forwards' });
}

let zoneText = null, zoneMode = null;
export function setZoneStatus(text, mode) {
  if (text === zoneText && mode === zoneMode) return;
  zoneText = text; zoneMode = mode;
  const el = $('zone-status');
  if (!text) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = text;
  el.classList.toggle('danger', mode === 'danger');
}

// ---------------------------------------------------------------------------
// Callouts: small non-blocking toasts under the zone status
// ---------------------------------------------------------------------------

const calloutLast = {};
export function callout(text, color, kind = 'info', cooldown = 0) {
  const now = performance.now();
  if (cooldown && calloutLast[kind] && now - calloutLast[kind] < cooldown * 1000) return false;
  calloutLast[kind] = now;
  const host = $('callouts');
  const el = document.createElement('div');
  el.className = 'callout callout-' + kind;
  if (color) el.style.setProperty('--c', color);
  el.textContent = text;
  host.prepend(el);
  while (host.children.length > 3) host.lastChild.remove();
  setTimeout(() => el.classList.add('fade'), 2400);
  setTimeout(() => el.remove(), 3000);
  return true;
}

export function clearCallouts() {
  $('callouts').textContent = '';
}

// Hit confirm: a tick + a brief X over the tank you just hit.
let hitAnim = null;
export function hitConfirm(tank) {
  AudioFX.confirm();
  const el = $('hitmarker');
  _v.copy(tank.pos);
  _v.y += 1.2;
  _v.project(camera);
  if (_v.z > 1) return;
  el.style.transform = `translate3d(${(_v.x * 0.5 + 0.5) * innerWidth}px,`
    + `${(-_v.y * 0.5 + 0.5) * innerHeight}px,0)`;
  if (hitAnim) hitAnim.cancel();
  hitAnim = el.firstElementChild.animate(
    [{ opacity: 1, transform: 'scale(1.3) rotate(45deg)' },
      { opacity: 0, transform: 'scale(0.8) rotate(45deg)' }],
    { duration: 260, easing: 'ease-out', fill: 'forwards' });
}

// "+1 NAME" when you destroy a tank.
export function killPop(tank) {
  const el = document.createElement('div');
  el.className = 'kill-pop';
  el.style.setProperty('--c', tank.accentCss);
  el.textContent = '+1 ' + tank.name + (tank.nemesis ? ' · BOUNTY' : '');
  $('kill-pops').appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// The "get inside" arrow: points from you toward the ring's centre while the
// murder is pecking you.
export function updateInsideArrow(show) {
  const el = $('inside-arrow');
  const p = state.player;
  if (!show || !p) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  _v.copy(p.pos);
  _v.y = 1;
  _v.project(camera);
  const px = (_v.x * 0.5 + 0.5) * innerWidth, py = (-_v.y * 0.5 + 0.5) * innerHeight;
  // a point a few metres toward the centre gives the on-screen direction
  const r = Math.hypot(p.pos.x, p.pos.z) || 1;
  _v.set(p.pos.x - (p.pos.x / r) * 6, 1, p.pos.z - (p.pos.z / r) * 6);
  _v.project(camera);
  const qx = (_v.x * 0.5 + 0.5) * innerWidth, qy = (-_v.y * 0.5 + 0.5) * innerHeight;
  const ang = Math.atan2(qy - py, qx - px);
  const R = 124;
  el.style.transform = `translate3d(${px + Math.cos(ang) * R}px,${py + Math.sin(ang) * R}px,0)`
    + ` rotate(${ang}rad)`;
}

// Active buff chips under the HP bar.
const buffEls = {};
export function updateBuffs() {
  const p = state.player;
  for (const kind of ['rapid', 'shield', 'ward']) {
    let el = buffEls[kind];
    if (!el) {
      el = buffEls[kind] = document.createElement('span');
      el.className = 'buff buff-' + kind;
      el.style.setProperty('--c', '#' + PICKUP_KINDS[kind].color.toString(16).padStart(6, '0'));
      el.dataset.v = '';
      el.style.display = 'none';
      $('buffs').appendChild(el);
    }
    const left = p && p.alive ? Math.ceil(p.buffs[kind]) : 0;
    const v = left > 0 ? PICKUP_KINDS[kind].label + ' ' + left : '';
    if (el.dataset.v === v) continue;
    el.dataset.v = v;
    el.textContent = v;
    el.style.display = v ? '' : 'none';
  }
}

// ---------------------------------------------------------------------------
// HUD numbers
// ---------------------------------------------------------------------------

const hudLast = { alive: -1, hp: -1, kills: -1 };
export function updateHUD() {
  const alive = aliveTanks().length;
  if (alive !== hudLast.alive) { hudLast.alive = alive; $('alive-count').textContent = alive; }
  const p = state.player;
  if (!p) return;
  const hp = Math.round(clamp(p.hp / TANK.hp, 0, 1) * 200) / 2;
  if (hp !== hudLast.hp) {
    hudLast.hp = hp;
    $('hp-fill').style.width = hp + '%';
    $('hp-fill').classList.toggle('low', hp < 35);
  }
  if (p.kills !== hudLast.kills) { hudLast.kills = p.kills; $('player-kills').textContent = p.kills; }
  updateBuffs();
}

export function resetHUDCache() {
  hudLast.alive = hudLast.hp = hudLast.kills = -1;
  zoneText = zoneMode = null;
}

// ---------------------------------------------------------------------------
// Leaderboard — rows are built once per match and patched in place. On touch
// it collapses to the top 3 plus you; a tap expands it.
// ---------------------------------------------------------------------------

let lbExpanded = false;
const lbRows = new Map();   // Tank -> { row, rk, kills, hpFill, place, last }
let lbOrder = '';
let lbMore = null;

function buildLeaderboard() {
  const lb = $('leaderboard');
  lb.textContent = '';
  lbRows.clear();
  lbOrder = '';
  const header = document.createElement('div');
  header.className = 'lb-header';
  header.textContent = 'STANDINGS';
  lb.appendChild(header);
  for (const t of state.tanks) {
    const row = document.createElement('div');
    row.className = 'lb-row' + (t.isPlayer ? ' you' : '');
    const rk = document.createElement('span');
    rk.className = 'lb-rank';
    const name = document.createElement('span');
    name.className = 'lb-name';
    name.style.color = t.accentCss;
    name.textContent = t.name;
    row.append(rk, name);
    if (t.personality) {
      const pers = document.createElement('small');
      pers.className = 'lb-pers';
      pers.title = t.personality.label;
      const g = document.createElement('b');
      g.textContent = t.personality.glyph;
      const l = document.createElement('i');
      l.textContent = ' ' + t.personality.label;
      pers.append(g, l);
      row.appendChild(pers);
    }
    if (t.nemesis) {
      const n = document.createElement('small');
      n.className = 'lb-nem';
      n.textContent = '☠';
      row.appendChild(n);
    }
    const kills = document.createElement('span');
    kills.className = 'lb-kills';
    const hp = document.createElement('span');
    hp.className = 'lb-hp';
    const hpFill = document.createElement('i');
    hp.appendChild(hpFill);
    const place = document.createElement('span');
    place.className = 'lb-place';
    row.append(kills, hp, place);
    lb.appendChild(row);
    lbRows.set(t, { row, rk, kills, hp, hpFill, place, name, last: {} });
  }
  lbMore = document.createElement('div');
  lbMore.className = 'lb-more';
  lb.appendChild(lbMore);
}

function setIf(entry, key, v, fn) {
  if (entry.last[key] === v) return;
  entry.last[key] = v;
  fn(v);
}

export function updateLeaderboard() {
  if (lbRows.size !== state.tanks.length || state.tanks.some((t) => !lbRows.has(t))) {
    buildLeaderboard();
  }
  const alive = aliveTanks().slice().sort((a, b) => b.kills - a.kills || b.hp - a.hp);
  const dead = state.tanks.filter((t) => !t.alive).sort((a, b) => a.place - b.place);
  const order = alive.concat(dead);

  const key = order.map((t) => state.tanks.indexOf(t)).join(',');
  if (key !== lbOrder) {
    lbOrder = key;
    const lb = $('leaderboard');
    for (const t of order) lb.insertBefore(lbRows.get(t).row, lbMore);
  }

  let hiddenCount = 0;
  order.forEach((t, i) => {
    const e = lbRows.get(t);
    const isAlive = t.alive;
    const rank = isAlive ? i + 1 : t.place;
    setIf(e, 'dead', isAlive ? 0 : 1, (v) => {
      e.row.classList.toggle('dead', !!v);
      e.name.style.color = v ? '' : t.accentCss;
      e.hp.style.display = v ? 'none' : '';
      e.place.style.display = v ? '' : 'none';
    });
    setIf(e, 'rk', isAlive ? String(rank) : '☠', (v) => { e.rk.textContent = v; });
    setIf(e, 'kills', t.kills, (v) => { e.kills.textContent = '⚔' + v; });
    setIf(e, 'place', t.place, (v) => { e.place.textContent = '#' + v; });
    setIf(e, 'hp', Math.round(clamp(t.hp / TANK.hp, 0, 1) * 100), (v) => {
      e.hpFill.style.transform = `scaleX(${v / 100})`;
    });
    const fold = i >= 3 && !t.isPlayer;
    if (fold) hiddenCount++;
    setIf(e, 'fold', fold ? 1 : 0, (v) => { e.row.classList.toggle('fold', !!v); });
  });
  const more = hiddenCount ? (lbExpanded ? '▴ less' : '+' + hiddenCount + ' more ▾') : '';
  if (lbMore.textContent !== more) lbMore.textContent = more;
}

export function setTagName(tank, name) {
  const e = lbRows.get(tank);
  if (e) e.name.textContent = name;
}

// ---------------------------------------------------------------------------
// Kill feed
// ---------------------------------------------------------------------------

export function addFeed(attacker, victim) {
  const feed = $('feed');
  const row = document.createElement('div');
  row.className = 'feed-row';

  if (attacker && attacker !== victim) {
    const a = document.createElement('b');
    a.style.color = attacker.accentCss;
    a.textContent = attacker.name;
    row.appendChild(a);
    row.appendChild(document.createTextNode(' ⚡ '));
  } else {
    const s = document.createElement('b');
    s.className = 'feed-murder';
    s.textContent = 'THE MURDER';
    row.appendChild(s);
    row.appendChild(document.createTextNode(' 🪶 '));
  }
  const v = document.createElement('b');
  v.style.color = victim.accentCss;
  v.textContent = victim.name;
  row.appendChild(v);

  feed.prepend(row);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => { row.classList.add('fade'); }, 3600);
  setTimeout(() => { row.remove(); }, 4400);
}

export function clearFeed() {
  $('feed').textContent = '';
}

// ---------------------------------------------------------------------------
// Name tags — neon stem rising from each tank to an underlined name, with the
// personality glyph. Positioned by transform, and only changed values are
// written to the DOM.
// ---------------------------------------------------------------------------

const tagMap = new Map();   // Tank -> { tag, name, last }

export function buildTags() {
  clearTags();
  const cont = $('tags');
  for (const t of state.tanks) {
    const tag = document.createElement('div');
    tag.className = 'tag' + (t.isPlayer ? ' tag-you' : '') + (t.nemesis ? ' tag-nemesis' : '');
    tag.style.setProperty('--c', t.accentCss);

    const stem = document.createElement('div');
    stem.className = 'tag-stem';
    tag.appendChild(stem);

    const name = document.createElement('div');
    name.className = 'tag-name';
    const label = document.createElement('span');
    label.textContent = t.name;
    if (t.personality) {
      const g = document.createElement('b');
      g.className = 'tag-glyph';
      g.textContent = t.personality.glyph;
      name.appendChild(g);
    }
    name.appendChild(label);
    if (t.nemesis) {
      const n = document.createElement('em');
      n.className = 'tag-nem';
      n.textContent = 'NEMESIS';
      name.appendChild(n);
    }
    tag.appendChild(name);

    cont.appendChild(tag);
    tagMap.set(t, { tag, name, label, last: { vis: true } });
  }
}

export function renameTag(tank, newName) {
  const entry = tagMap.get(tank);
  if (entry) entry.label.textContent = newName;
  setTagName(tank, newName);
}

export function clearTags() {
  $('tags').textContent = '';
  tagMap.clear();
}

export function updateTags() {
  for (const [t, e] of tagMap) {
    const { tag, name, last } = e;
    let vis = t.alive;
    if (vis) {
      _v.copy(t.pos);
      _v.y += 3.1;
      _v.project(camera);
      vis = !(_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05);
    }
    if (vis !== last.vis) { last.vis = vis; tag.style.display = vis ? '' : 'none'; }
    if (!vis) continue;
    const x = Math.round((_v.x * 0.5 + 0.5) * innerWidth);
    const y = Math.round((-_v.y * 0.5 + 0.5) * innerHeight);
    if (x !== last.x || y !== last.y) {
      last.x = x; last.y = y;
      tag.style.transform = `translate3d(${x}px,${y}px,0)`;
    }
    const dist = t.pos.distanceTo(camera.position);
    const fs = Math.round(clamp(16 - dist * 0.07, 10, 14));
    if (fs !== last.fs) { last.fs = fs; name.style.fontSize = fs + 'px'; }
    const op = dist > 80 ? 0.5 : 1;
    if (op !== last.op) { last.op = op; tag.style.opacity = op; }
  }
}

// ---------------------------------------------------------------------------
// Off-screen enemy arrows (accent-colored)
// ---------------------------------------------------------------------------

const arrowEls = [];

function buildArrowPool() {
  const cont = $('arrows');
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'threat-arrow';
    el.style.display = 'none';
    cont.appendChild(el);
    arrowEls.push(el);
  }
}

export function updateArrows() {
  let used = 0;
  const p = state.player;
  if (p && p.alive && state.phase === 'playing') {
    const near = aliveTanks()
      .filter((t) => t !== p && t.pos.distanceTo(p.pos) < 45)
      .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
    for (const t of near) {
      if (used >= arrowEls.length) break;
      _v.copy(t.pos);
      _v.y += 1;
      _v.project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.92;
      if (onScreen) continue;
      if (_v.z > 1) { _v.x *= -1; _v.y *= -1; }
      const s = Math.max(Math.abs(_v.x) / 0.9, Math.abs(_v.y) / 0.85, 0.0001);
      const nx = _v.x / s;
      const ny = _v.y / s;
      const el = arrowEls[used++];
      if (el.dataset.c !== t.accentCss) {
        el.dataset.c = t.accentCss;
        el.style.borderLeftColor = t.accentCss;
        el.style.filter = `drop-shadow(0 0 5px ${t.accentCss})`;
      }
      const tf = `translate3d(${Math.round((nx * 0.5 + 0.5) * innerWidth - 8)}px,`
        + `${Math.round((-ny * 0.5 + 0.5) * innerHeight - 9)}px,0)`
        + ` rotate(${Math.round(Math.atan2(-ny, nx) * 180 / Math.PI)}deg)`;
      if (el.dataset.tf !== tf) { el.dataset.tf = tf; el.style.transform = tf; }
      if (el.style.display !== 'block') el.style.display = 'block';
    }
  }
  for (let i = used; i < arrowEls.length; i++) {
    if (arrowEls[i].style.display !== 'none') arrowEls[i].style.display = 'none';
  }
}
