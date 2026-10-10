import { BUILD } from '../build.js?v=202610101826';

let styled = false;
export function ensureStyles() {
  if (styled || document.getElementById('net-css')) { styled = true; return; }
  styled = true;
  const link = document.createElement('link');
  link.id = 'net-css';
  link.rel = 'stylesheet';
  link.href = new URL(`./net.css?v=${BUILD}`, import.meta.url).href;
  document.head.append(link);
}

// playerKey per room, per tab (sessionStorage), so a refresh rejoins as the same player.
// Server-room seats are also kept on the device (localStorage "clued.myrooms") for the hub's "Your rooms" list:
// rooms you created or joined and left can be rejoined or ended later. Device (p2p) rooms die with the tab, so not those.
const SK = code => `clued.room.${code}`;
const MY = 'clued.myrooms';
export function myRooms() {
  try { const m = JSON.parse(localStorage.getItem(MY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
}
function saveMine(m) { try { localStorage.setItem(MY, JSON.stringify(m)); } catch (e) {} }
export function rememberRoom(code, seat) {
  if (!seat?.key || seat.via === 'p2p') return;
  const m = myRooms();
  m[code] = { ...(m[code] || { at: Date.now() }), key: seat.key, id: seat.id, via: 'server', ...(seat.host != null ? { host: !!seat.host } : {}) };
  const codes = Object.keys(m).sort((a, b) => (m[b].at || 0) - (m[a].at || 0));
  codes.slice(20).forEach(c => delete m[c]);
  saveMine(m);
}
export function forgetRoom(...codes) { const m = myRooms(); codes.forEach(c => delete m[c]); saveMine(m); }
export function saveSeat(code, seat) { try { sessionStorage.setItem(SK(code), JSON.stringify(seat)); } catch (e) {} rememberRoom(code, seat); }
export function loadSeat(code) {
  try {
    const s = JSON.parse(sessionStorage.getItem(SK(code)) || 'null');
    if (s) return s;
  } catch (e) {}
  const m = myRooms()[code];
  return m?.key ? { key: m.key, id: m.id, via: 'server' } : null;
}
// drops this tab's seat; forget = also drop it from "Your rooms"
export function dropSeat(code, forget = false) { try { sessionStorage.removeItem(SK(code)); } catch (e) {} if (forget) forgetRoom(code); }

export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
export const validCode = s => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(s);

// Drop ?join= / ?c= from the address bar so a later refresh of another screen doesn't re-route.
export function setQuery(param, value) {
  try {
    const u = new URL(location.href);
    ['join', 'c', 'p2p'].forEach(k => k !== param && u.searchParams.delete(k));
    if (value) u.searchParams.set(param, value); else u.searchParams.delete(param);
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch (e) {}
}

export const ANSWER_SECS = [3, 5, 10, 15, 20, 30];
export const GAP_SECS = [3, 5, 10, 0];
export const gapLabel = s => (s ? `${s} s` : 'Host taps Next');
export const TRUST_HINT = 'Best played with friends you trust: strangers on the internet may enjoy cheating 😉';

export const START_CHOICES = [60, 120, 300, 0];
export const startLabel = s => (s ? `${s / 60} min` : 'Host will start');
export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
