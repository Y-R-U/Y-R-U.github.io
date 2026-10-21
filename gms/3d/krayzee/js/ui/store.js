import { titleFor } from './ranks.js';
import { career } from './career.js';

export const PROFILE_KEY = 'krayzee.profile';
export const SETTINGS_KEY = 'krayzee.settings';

export const DEFAULT_PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-DIRK', rank: 0 };
export const QUALITIES = ['auto', 'low', 'medium', 'high'];
const SETTINGS_V = 3;
export const DEFAULT_SETTINGS = { view: 'chase', quality: 'auto', sfx: 1, voice: 1, music: 0.6, invertPitch: false, stickRight: false, units: 'aviation' };

export const LIMITS = { name: 12, company: 14, display: 14 };

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
const lite = () => { try { return new URLSearchParams(location.search).get('lite') === '1'; } catch (e) { return false; } };

export function hasProfile() { return !!read(PROFILE_KEY)?.name; }

export function loadProfile() {
  const p = { ...DEFAULT_PROFILE, ...(read(PROFILE_KEY) || {}) };
  const c = career();
  p.rank = c.rankIndex;
  p.title = c.displayTitle({ context: 'menu', gender: p.gender, rankIndex: p.rank });
  p.flightTitle = c.displayTitle({ context: 'free', gender: p.gender });
  p.rankTitle = titleFor(p.gender, p.rank);
  p.display = (p.company || p.name).slice(0, LIMITS.display);
  return p;
}

export function saveProfile(p) {
  const { name, gender, company, primary, secondary, accent, voice, registration } = p;
  write(PROFILE_KEY, { name, gender, company, primary, secondary, accent, voice, registration });
  return loadProfile();
}

function storedSettings() {
  const raw = read(SETTINGS_KEY) || {};
  const s = { ...DEFAULT_SETTINGS, ...raw };
  // Round 1 saved its 'high'/'low' default on any settings change; nobody chose it, so it becomes Auto (D6).
  if ((raw.v | 0) < 2 || !QUALITIES.includes(s.quality)) s.quality = 'auto';
  // D9/D10 changed what the pitch and stick-side defaults mean, so older saves start again from the new defaults.
  if ((raw.v | 0) < 3) { s.invertPitch = false; s.stickRight = false; }
  delete s.hand;
  s.invertPitch = !!s.invertPitch;
  s.stickRight = !!s.stickRight;
  s.v = SETTINGS_V;
  return s;
}

export function loadSettings() {
  const s = storedSettings();
  if (lite()) s.quality = 'low';
  s.hand = s.stickRight ? 'right' : 'left';
  return s;
}

export function saveSettings(s) {
  const { hand, ...keep } = s;
  write(SETTINGS_KEY, { ...keep, quality: lite() ? storedSettings().quality : s.quality, v: SETTINGS_V });
  return loadSettings();
}

export const liveryOf = (p) => ({ name: p.name, company: p.company, primary: p.primary, secondary: p.secondary, accent: p.accent, registration: p.registration });

const NAME_RE = /^\p{L}[\p{L}' .-]*$/u;
const COMPANY_RE = /^[\p{L}\p{N}' .&!-]*$/u;
const REG_RE = /^K-[A-Z0-9]{1,5}$/;

export function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trimStart(); }

export function checkName(s) {
  const v = s.trim();
  if (!v) return 'Every pilot needs a name.';
  if (v.length < 2) return 'At least two letters, please.';
  if (v.length > LIMITS.name) return `${LIMITS.name} letters at most — it has to fit on the tail.`;
  if (!NAME_RE.test(v)) return 'Letters, spaces, hyphens and apostrophes only.';
  return '';
}

export function checkCompany(s) {
  const v = s.trim();
  if (v.length > LIMITS.company) return `${LIMITS.company} characters at most.`;
  if (!COMPANY_RE.test(v)) return 'Letters, numbers, spaces and & . \' ! - only.';
  return '';
}

export function checkReg(s) { return REG_RE.test(s) ? '' : 'Format K- then 1–5 letters or digits, e.g. K-DIRK.'; }

export function suggestReg(name) {
  const letters = String(name || '').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  return 'K-' + (letters || 'ROYL');
}
