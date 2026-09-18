import { ACCOUNTS, DEMO } from './edition.js';
const PREF = 'ragdojo.analytics';
let enabled = false;
try { enabled = localStorage.getItem(PREF) === 'yes'; } catch {}
const privacy = () => navigator.globalPrivacyControl || navigator.doNotTrack === '1';
export function analyticsEnabled() { return enabled && !privacy(); }
export function analyticsChoice(value) {
  enabled = !!value;
  try { localStorage.setItem(PREF, enabled ? 'yes' : 'no'); if (!enabled) localStorage.removeItem('ragdojo.visitor'); } catch {}
}
export function visitor() {
  if (!analyticsEnabled() || DEMO || !ACCOUNTS) return '';
  try { let id = localStorage.getItem('ragdojo.visitor'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('ragdojo.visitor', id); } return id; } catch { return ''; }
}
export const source = new URLSearchParams(location.search).get('from') === 'itch' ? 'itch' : 'direct';
export function track(event, save, outcome = '') {
  const id = visitor(); if (!id) return;
  void fetch('/api/ragdojo/analytics', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ id: crypto.randomUUID(), visitor: id, event, theme: save.theme, level: Math.min(44, Math.max(0, save.bully ? save.bullyLevel : save.level)), outcome, source }),
  }).catch(() => {});
}
