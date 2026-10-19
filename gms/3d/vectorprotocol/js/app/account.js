// The shared br8t account avatar (/lib/auth/ui.js, HEIRFRAME js/account.js pattern). Shown on the hub and in
// Settings only, never in battle; the top bar keeps a slot clear for it on those screens (topbar.js .tb-acct).
// Skipped under ?dev and the test flags. No cloud saves yet (later phase, D18).
import { ACCOUNT_SCREENS } from '../ui/topbar.js';

const SKIP = ['dev', 'test', 'auto', 'nocloud', 'noui', 'shot'];

export function accountAllowed(Q = new URLSearchParams(location.search)) {
  return !SKIP.some((k) => Q.has(k) && Q.get(k) !== '0');
}

export function mountAccount() {
  if (!accountAllowed()) return Promise.resolve(false);
  const shown = () => ACCOUNT_SCREENS.has(window.__vp?.screen) && !document.querySelector('.vp-modal-wrap');
  return import('/lib/auth/ui.js').then(({ mountAccount: mount }) => {
    mount({ gameId: 'vectorprotocol', accent: '#2ee6ff', nudge: 'callout', canPester: shown, pesterHoldMs: 6000 });
    const host = document.getElementById('br8t-account');
    const app = document.getElementById('app');
    let last = null;
    const sync = () => {
      const on = shown();
      // the avatar is fixed to the viewport corner: the column only gives up room when its right edge is under it
      const r = app.getBoundingClientRect();
      const under = innerWidth - r.right < 52;
      const key = on + '/' + under;
      if (key === last) return;
      last = key;
      if (host) host.style.display = on ? '' : 'none';
      app.style.setProperty('--vp-acct-w', under ? '46px' : '0px');
      document.documentElement.style.setProperty('--br8t-account-space', on ? '52px' : '0px');
    };
    sync();
    setInterval(sync, 250);
    return true;
  }).catch((e) => { console.warn('[account] br8t account unavailable', e); return false; });
}
