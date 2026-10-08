import { BUILD } from '../build.js?v=202610081134';

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
const SK = code => `clued.room.${code}`;
export function saveSeat(code, seat) { try { sessionStorage.setItem(SK(code), JSON.stringify(seat)); } catch (e) {} }
export function loadSeat(code) { try { return JSON.parse(sessionStorage.getItem(SK(code)) || 'null'); } catch (e) { return null; } }
export function dropSeat(code) { try { sessionStorage.removeItem(SK(code)); } catch (e) {} }

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
