import { PROFILE_KEY, SETTINGS_KEY } from './store.js';
import { titleFor } from './ranks.js';
import { CAREER_KEY } from '../game/career.js';
import { describeCareer, career } from './career.js';

const NO_CLOUD = ['auto', 'test', 'nocloud', 'noui', 'shot', 'dev'];
const Q = new URLSearchParams(location.search);
const flag = (k) => Q.has(k) && Q.get(k) !== '0';

// Everything that moves between devices (D36, docs/ACCESS.md §1). Profile = name, title gender, livery colours, company,
// registration, voice + favourites; settings = controls, views, difficulty, the hangar's chosen plane; career = PP, ranks,
// titles, online wins; tasks; story progress; the one-time teaching marks (so a new phone does not teach you again).
// Stays on the device: krayzee.netSaver (this connection) and krayzee.courtCollapsed (this screen). Never a mid-flight
// state: the game keeps none in storage. Entitlements are never saved (js/game/access.js, memory only).
export const SYNC_KEYS = [PROFILE_KEY, SETTINGS_KEY, CAREER_KEY, 'krayzee.tasks', 'krayzee.story', 'krayzee.hints', 'krayzee.coach', 'krayzee.coachTakeoff'];

// For the two-saves chooser: plain lines, never used to compare (games/CLAUDE.md).
export function describe(keys) {
  const p = keys[PROFILE_KEY];
  if (!p || typeof p !== 'object') return ['No pilot yet'];
  const c = describeCareer(keys[CAREER_KEY], p.gender);
  const st = keys['krayzee.story'], ms = st && typeof st === 'object' ? Object.values(st.missions || {}).filter((m) => m?.done).length : 0;
  const tk = keys['krayzee.tasks'], td = tk && typeof tk === 'object' ? Object.keys(tk.done || {}).length : 0;
  return [`${c ? c.title : titleFor(p.gender, 0)} ${p.name}`, c ? `${c.pp} PP lifetime` : '', ms ? `Story: ${ms} mission${ms > 1 ? 's' : ''} done` : '',
    td ? `${td} task${td > 1 ? 's' : ''} ticked` : '', p.company || p.registration || ''].filter(Boolean);
}

// The avatar is always mounted (unless ?noaccount); cloud sync only outside test flags.
export function mountKrayzeeAccount(canPester) {
  if (flag('noaccount')) return Promise.resolve(false);
  const opts = { gameId: 'krayzee', accent: '#e2b04a', nudge: 'callout', canPester, pesterHoldMs: 6000 };
  const go = NO_CLOUD.some(flag)
    ? import('/lib/auth/ui.js').then((m) => m.mountAccount(opts))
    : import('/lib/auth/localsync.js').then((m) => catchUp(countFlights(m.syncLocalKeys({ ...opts, keys: SYNC_KEYS, describe }))));
  return go.then(() => true).catch((e) => { console.warn('[krayzee] account layer unavailable', e); return false; });
}

// games/CLAUDE.md step 3: matchCompleted() once per finished flight, so the sign-in nudge counts sorties (it shows only
// on the menu: canPester). Every banked flight goes through career.addPP.
function countFlights(h) {
  const c = career();
  if (h?.matchCompleted && c && !c.__kzCount) {
    c.__kzCount = true;
    const add = c.addPP;
    c.addPP = function (...a) { const r = add.apply(this, a); try { h.matchCompleted(); } catch (e) { /* nudge only */ } return r; };
  }
  return h;
}

// Career and tasks can save during boot before this layer has hooked localStorage (the task grid's retro credit for
// story missions does), and such a write would only reach the account with the next save. Both carry their own savedAt:
// if it is newer than the account layer's stamp, write the same string again now, so the hook sees it. The push is
// still held until the boot reconcile decides (an adopt discards it), so this can never beat a newer cloud save.
function catchUp(h) {
  try {
    const synced = Number(localStorage.getItem('br8t_savedAt_krayzee') || 0);
    for (const k of [CAREER_KEY, 'krayzee.tasks']) {
      const v = localStorage.getItem(k);
      if (v && (JSON.parse(v)?.savedAt || 0) > synced + 1000) localStorage.setItem(k, v);
    }
  } catch (e) { /* storage blocked or a bad save: nothing to catch up */ }
  return h;
}

export function openAccountPanel() {
  const fab = document.getElementById('br8t-account')?.shadowRoot?.querySelector('.fab');
  if (fab) { fab.click(); return true; }
  return false;
}

export function setAccountVisible(on) {
  const root = document.documentElement;
  root.classList.toggle('kz-acct-off', !on);
  if (document.getElementById('br8t-account')) root.style.setProperty('--br8t-account-space', on ? '52px' : '0px');
}
