import { PROFILE_KEY, SETTINGS_KEY } from './store.js';
import { titleFor } from './ranks.js';
import { CAREER_KEY } from '../game/career.js';
import { describeCareer } from './career.js';

const NO_CLOUD = ['auto', 'test', 'nocloud', 'noui', 'shot', 'dev'];
const Q = new URLSearchParams(location.search);
const flag = (k) => Q.has(k) && Q.get(k) !== '0';

function describe(keys) {
  const p = keys[PROFILE_KEY];
  if (!p || typeof p !== 'object') return ['No pilot yet'];
  const c = describeCareer(keys[CAREER_KEY], p.gender);
  return [`${c ? c.title : titleFor(p.gender, 0)} ${p.name}`, c ? `${c.pp} PP lifetime` : '', p.company || p.registration || ''].filter(Boolean);
}

// The avatar is always mounted (unless ?noaccount); cloud sync only outside test flags.
export function mountKrayzeeAccount(canPester) {
  if (flag('noaccount')) return Promise.resolve(false);
  const opts = { gameId: 'krayzee', accent: '#e2b04a', nudge: 'callout', canPester, pesterHoldMs: 6000 };
  const go = NO_CLOUD.some(flag)
    ? import('/lib/auth/ui.js').then((m) => m.mountAccount(opts))
    : import('/lib/auth/localsync.js').then((m) => m.syncLocalKeys({ ...opts, keys: [PROFILE_KEY, SETTINGS_KEY, CAREER_KEY, 'krayzee.tasks' /* TASKS */], describe }));
  return go.then(() => true).catch((e) => { console.warn('[krayzee] account layer unavailable', e); return false; });
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
