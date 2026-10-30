// Online (online agent): helpers shared by the online screens (online.js, online_game.js).
import { h, esc, icon, avatar, toast, openSheet } from '../ui.js';
import { net } from '../net.js';

export { net };

// css/online.css is loaded on first use (index.html is ui-owned); resolves once it applied.
let cssP = null;
export function ensureCss() {
  if (cssP) return cssP;
  if (document.querySelector('link[data-online-css]')) return (cssP = Promise.resolve());
  cssP = new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../../../css/online.css', import.meta.url).href; l.dataset.onlineCss = '1';
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
    setTimeout(res, 2500);
  });
  return cssP;
}

export const CATS = [
  { id: 'bullet', name: 'Bullet' }, { id: 'blitz', name: 'Blitz' }, { id: 'rapid', name: 'Rapid' },
  { id: 'classical', name: 'Classical', short: 'Classic' }, { id: 'daily', name: 'Unlimited', short: 'Daily' },
];
export const catName = c => (CATS.find(x => x.id === c) || {}).name || c;

// '5+3' -> '5 | 3', 'unlimited' -> 'Unlimited'
export function tcLabel(tc) {
  const id = typeof tc === 'string' ? tc : tc && tc.id;
  if (!id || id === 'unlimited') return 'Unlimited';
  const [m, i] = id.split('+');
  return `${m} | ${i}`;
}
// 'Blitz 5 | 0', 'Unlimited'
export function tcFull(tc) {
  const id = typeof tc === 'string' ? tc : tc && tc.id;
  return id === 'unlimited' || !id ? 'Unlimited' : `${tcName(tc)} ${tcLabel(tc)}`.trim();
}
export const tcName = tc => (typeof tc === 'object' && tc ? tc.name : (net.tcs.find(t => t.id === tc) || {}).name) || '';
export const ratingTxt = (r, prov) => `${r ?? 1500}${prov ? '?' : ''}`;

// stable hue for an opponent's medallion
export function hueFor(s) { let x = 0; for (const c of String(s || '')) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360; }
export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}
export function playerAvatar(p, { size = 'sm', me = false } = {}) {
  if (me) return avatar('lion', { label: 'You', size });
  return avatar('', { label: initials(p && p.name), size, hue: hueFor(p && (p.pid || p.name)) });
}

// Opens the shared account layer's own panel (sign-in lives there, not here).
export function openAccount() {
  const fab = document.getElementById('br8t-account')?.shadowRoot?.querySelector('.fab');
  if (fab) { fab.click(); return true; }
  toast('Sign-in is not available here right now');
  return false;
}

export function resetTime(a) {
  if (!a || !a.resetsAt) return '';
  return new Date(a.resetsAt * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export const outOfGames = a => !!a && !a.unlimited && a.remaining <= 0;

// The allowance chip text (D12).
export function allowanceChip(a) {
  if (!a) return '';
  if (a.unlimited) {
    const why = a.tier === 'pass' ? 'BR8T Pass' : a.tier === 'admin' ? 'admin' : '';
    return `<div class="ol-allow unl">${icon('check')}<span><b>Unlimited</b> online games${why ? ` · ${why}` : ''}</span></div>`;
  }
  const left = Math.max(0, a.remaining);
  const out = left <= 0;
  const reset = resetTime(a);
  return `<div class="ol-allow${out ? ' out' : ''}">
    <span class="ol-pips" aria-hidden="true">${Array.from({ length: Math.max(0, a.perDay) }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}</span>
    <span class="ol-allow-txt"><b>${left} of ${a.perDay}</b> online games left today${reset ? `<small>Resets at ${esc(reset)}</small>` : ''}</span>
    ${a.tier === 'anon' ? `<button class="btn btn-ghost btn-sm" data-act="signin">Sign in for ${a.signedPerDay || 5} a day</button>`
      : out ? '<button class="btn btn-ghost btn-sm" data-act="pass">Unlimited with Pass</button>' : ''}
  </div>`;
}

// ---------- BR8T Pass (same-origin payments API on games.br8t.com) ----------
async function idToken() {
  try {
    const m = await import('/lib/auth/auth.js');
    await m.auth.ready();
    return m.auth.signedIn ? await m.auth.getIdToken() : null;
  } catch { return null; }
}
// the payments API is same-origin on games.br8t.com only (GitHub Pages / LAN dev have none)
const PAYMENTS = typeof location !== 'undefined' && location.hostname === 'games.br8t.com';
let priceP = null;
function passPrice() {
  if (!PAYMENTS) return Promise.resolve('');
  return priceP || (priceP = fetch('/api/br8t/offer', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
    const it = (d?.items || []).find(x => x.entitlement === 'br8t_pass' && x.interval !== 'year' && x.amount);
    return it ? new Intl.NumberFormat(undefined, { style: 'currency', currency: String(it.currency || 'aud').toUpperCase() }).format(it.amount / 100) : '';
  }).catch(() => ''));
}
export async function buyPass() {
  if (!PAYMENTS) { toast('The BR8T Pass shop is on games.br8t.com'); return; }
  const tok = await idToken();
  if (!tok) { toast('Sign in first, so the Pass goes on your BR8T account'); openAccount(); return; }
  const post = game => fetch('/api/br8t/checkout', { method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'br8t_pass_monthly', game }) });
  try {
    let res = await post('gambit');
    if (res.status === 400) res = await post('hub');
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.url) throw new Error(d.error || 'unavailable');
    location.assign(d.url);
  } catch { toast('The shop is unavailable right now. Try again later.'); }
}

// Out of online games (D12): friendly sheet with the account layer's sign-in or a Pass pitch.
export function outOfGamesSheet(a) {
  a = a || net.allowance || {};
  const anon = a.tier === 'anon';
  const reset = resetTime(a);
  const sh = openSheet(`<div class="ol-out">
    <div class="ol-out-ic">${icon('clock')}</div>
    <h3>That’s today’s ${a.perDay > 0 ? a.perDay : ''} online games</h3>
    <p>${reset ? `More free games at <b>${esc(reset)}</b> your time.` : 'More free games tomorrow.'} Bots and puzzles are always unlimited.</p>
    <div class="ol-out-btns">
      ${anon ? `<button class="btn btn-primary" data-act="signin">${icon('user')} Sign in for ${a.signedPerDay || 5} games a day</button>` : ''}
      <button class="btn ${anon ? 'btn-ghost' : 'btn-primary'}" data-act="pass">${icon('trophy')} <span class="pass-lbl">BR8T Pass: unlimited online</span></button>
      <a class="btn btn-ghost" href="#/play/bot" data-close>${icon('robot')} Play a bot</a>
    </div>
    <button class="link" data-close>Not now</button>
  </div>`);
  passPrice().then(p => { const l = sh.el.querySelector('.pass-lbl'); if (p && l) l.textContent = `BR8T Pass · ${p} a month`; });
  sh.el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'signin') { sh.close(); openAccount(); }
    if (b.dataset.act === 'pass') buyPass();
  });
  return sh;
}

// Friendly text for a server error; shows the out-of-games sheet where that is the answer.
const ERR = {
  offline: 'You are offline. Reconnecting…', timeout: 'The server did not answer. Try again.',
  no_token: 'Could not sign you in to the online server.', rate_limited: 'Slow down a little and try again.',
  paused: 'Online play is paused for a moment (server maintenance). Try again soon.',
  already_playing: 'You are already in a game.', too_many_games: 'You have too many games going already.',
  too_many_rooms: 'You already have two rooms open. Close one first.', lobby_full: 'The lobby is full right now. Try quick match.',
  no_room: 'That room is closed or the code is wrong.', own_room: 'That is your own room. Send the code to a friend.',
  host_busy: 'The host has just started another game.', host_no_games: 'The host has no online games left today.',
  opponent_busy: 'Your opponent is busy.', bad_name: 'That name is not allowed. Try another.', bad_tc: 'Unknown time control.',
  not_now: 'That is not possible right now.', ip_limit: 'Too many guest games from this network today. Sign in to keep playing.',
};
export function handleError(e, fallback = 'Something went wrong. Try again.') {
  const code = e && e.code;
  if (code === 'no_games_left') { outOfGamesSheet(e.data && e.data.allowance); return; }
  if (code === 'ip_limit') { toast(ERR.ip_limit, { ms: 3500 }); openAccount(); return; }
  toast(ERR[code] || (e && e.message && !/^[a-z_]+$/.test(e.message) ? e.message : fallback), { ms: 3000 });
}

export function connBanner() {
  const s = net.state;
  if (s === 'open' || s === 'idle') return '';
  return `<div class="ol-conn">${icon('globe')}<span>${s === 'connecting' ? 'Connecting…' : s === 'closed' ? 'Disconnected' : 'Reconnecting…'}</span></div>`;
}

export const nameOf = p => esc((p && p.name) || 'Player');
export { h };
