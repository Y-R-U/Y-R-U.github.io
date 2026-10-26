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
  // the "Login now!" pill only on the hub: its top bar is an overlay, so making room for the pill moves nothing below it
  const pester = () => shown() && window.__vp?.screen === 'hub';
  return import('/lib/auth/ui.js').then(({ mountAccount: mount }) => {
    mount({ gameId: 'vectorprotocol', accent: '#2ee6ff', nudge: 'callout', canPester: pester, pesterHoldMs: 6000 });
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
      window.dispatchEvent(new Event('vp-account'));
      app.style.setProperty('--vp-acct-w', under ? '46px' : '0px');
      document.documentElement.style.setProperty('--br8t-account-space', on ? '52px' : '0px');
    };
    sync();
    setInterval(sync, 250);
    // leaving the hub: hide the avatar (and any pill) at once, not on the next 250 ms tick, so the next screen's bar is never under it
    const leave = () => {
      if (!host || ACCOUNT_SCREENS.has(location.hash.split(/[/?]/)[1])) return;
      host.style.display = 'none'; last = null;
      window.dispatchEvent(new Event('vp-account'));
    };
    addEventListener('hashchange', leave);
    addEventListener('popstate', leave);     // router.go() uses pushState and then fires a synthetic popstate
    if (host?.shadowRoot) watchPill(host.shadowRoot);
    return true;
  }).catch((e) => { console.warn('[account] br8t account unavailable', e); return false; });
}

// ui-8: the shared layer's sign-in pill (.pester in the open shadow root of #br8t-account) hangs off the avatar's left,
// ~174 px wide, for pesterHoldMs (6 s), then fades (.out, 300 ms) and is removed. It fires no event, so a
// MutationObserver on the shadow root is the signal. While it is up the top bar gets .pill: the badge slot grows to
// the pill's live width (ResizeObserver), or, where the bar can't fit beside it (portrait phones), .pill-wrap moves
// the currencies and the fullscreen button to a second row under the company emblem.
function watchPill(sr) {
  let pill = null, need = 0;
  const ro = new ResizeObserver(() => fit());
  const bar = () => document.querySelector('.vp-topbar.acct:not(.hide)');
  const clear = (tb) => { tb.classList.remove('pill', 'pill-wrap'); tb.style.removeProperty('--vp-pill-slot'); tb.style.removeProperty('--vp-pill-room'); };
  function fit() {
    const tb = bar();
    const up = pill && pill.isConnected && sr.host.style.display !== 'none';
    document.querySelectorAll('.vp-topbar.pill').forEach((e) => { if (e !== tb || !up) clear(e); });
    if (!tb) return;
    const cs = getComputedStyle(tb), pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    const r = tb.getBoundingClientRect(), left = r.left + pl, right = r.right - pr;
    if (!up) {
      // natural width of everything but the badge slot, measured at rest (the currencies have free space then)
      const kids = [...tb.children].filter((e) => !e.classList.contains('tb-acct') && e.offsetWidth);
      const gap = parseFloat(cs.columnGap) || 6;
      const cur = tb.querySelector('.tb-cur'), chips = cur ? [...cur.children] : [];
      need = kids.reduce((a, e) => a + (e === cur && chips.length ? chips.at(-1).getBoundingClientRect().right - chips[0].getBoundingClientRect().left : e.offsetWidth), 0) + gap * kids.length;
      return;
    }
    // layout box of the fixed pill, without its slide-in transform
    const pcs = getComputedStyle(pill);
    const pillLeft = innerWidth - (parseFloat(pcs.right) || 0) - pill.offsetWidth - 6;
    const room = Math.max(0, Math.round(pillLeft - left));
    const wrap = need > room;
    tb.classList.add('pill');
    tb.classList.toggle('pill-wrap', wrap);
    tb.style.setProperty('--vp-pill-room', room + 'px');
    tb.style.setProperty('--vp-pill-slot', Math.max(0, Math.round(right - pillLeft)) + 'px');
  }
  const scan = () => {
    const p = sr.querySelector('.pester');
    if (p === pill) return;
    if (pill) ro.unobserve(pill);
    pill = p;
    if (pill) ro.observe(pill);
    fit();
  };
  new MutationObserver(scan).observe(sr, { childList: true });
  addEventListener('resize', () => requestAnimationFrame(fit));
  addEventListener('vp-account', fit);
  setInterval(fit, 500);     // screen changes / orientation / topbar shown or hidden
  scan();
}
