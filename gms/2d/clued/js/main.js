import { BUILD } from './build.js?v=202610201106';
import './core/debuglog.js?v=202610201106';   // remote debug log (server-switched, docs/notes/DEBUGLOG.md)
import { loadFormats } from './formats/index.js?v=202610201106';
import { getFormat, listFormats, register } from './formats/registry.js?v=202610201106';
import { loadIndex, loadPack, loadPacks, getIndex } from './core/packs.js?v=202610201106';
import { buildQuestions, makeSpec } from './core/spec.js?v=202610201106';
import { preflight, urlsOf, swapFailed } from './core/media.js?v=202610201106';
import * as store from './core/store.js?v=202610201106';
import { mountApp, defineScreen, go, back, reset, header, current, canPester } from './ui/app.js?v=202610201106';
import { h } from './ui/kit.js?v=202610201106';
import { popup, toast, confirmPop } from './ui/popup.js?v=202610201106';
import { sfx, haptic, confetti } from './ui/fx.js?v=202610201106';
import { shareText } from './ui/share.js?v=202610201106';
import { loadNet } from './ui/net.js?v=202610201106';
import { watchVersion, checkVersion, updateState, reloadFresh } from './ui/update.js?v=202610201106';
import { applyAll } from './ui/settings.js?v=202610201106';
import { setMatchCompleted } from './ui/results.js?v=202610201106';
import './ui/home.js?v=202610201106';
import './ui/setup.js?v=202610201106';
import './ui/statspage.js?v=202610201106';
import { createRunner } from './structures/runner.js?v=202610201106';
import { prepare, playSpec } from './structures/session.js?v=202610201106';
import { STRUCTURES } from './structures/index.js?v=202610201106';
import { handoff } from './structures/handoff.js?v=202610201106';

const params = new URLSearchParams(location.search);
const TEST = params.has('test') || params.has('noauth');

// Everything another lane needs from the shell, in one place (documented in docs/notes/A.md).
const ctx = {
  BUILD, go, back, reset, header, defineScreen, current, h, popup, toast, confirmPop, handoff, shareText, sfx, haptic, confetti,
  createRunner, prepare, playSpec, buildQuestions, makeSpec, preflight, urlsOf, swapFailed,
  registry: { getFormat, listFormats, register }, packs: { loadIndex, loadPack, loadPacks, getIndex }, store, structures: STRUCTURES,
  results: p => go('results', p, { replace: true, skipGuard: true }),
};
window.__cluedCtx = ctx;

function ready() {
  window.__cluedReady = true;
  const b = document.getElementById('boot');
  if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 400); }
}

const JOIN_KEY = params.get('join') ? 'join' : params.get('p2p') ? 'p2p' : '';

// ?join/?p2p stay in the address bar until the join screen settles, so any reload (boot guard, update banner,
// the account layer adopting a newer cloud save) comes back to the name prompt instead of home.
async function route() {
  const join = params.get('join'), chal = params.get('c'), p2p = params.get('p2p');
  const hash = /[#&]lc=/.test(location.hash) ? location.hash : '';
  if (!join && !chal && !hash && !p2p) return false;
  if (!JOIN_KEY) {
    const keep = new URLSearchParams(location.search);
    keep.delete('c');
    history.replaceState(history.state, '', location.pathname + (keep.size ? '?' + keep : ''));
  }
  const watch = JOIN_KEY ? joinWatch(join || p2p) : null;
  const net = await loadNet();
  if (watch) watch.net = net;
  const fn = hash ? net?.openLinkChallenge : join ? net?.joinRoom : p2p ? net?.openP2P : net?.openChallenge;
  if (fn) {
    try { await fn(hash || join || p2p || chal, ctx); return true; } catch (e) { console.error('[clued] net route failed', e); }
  }
  watch?.stop();
  await popup({ title: join || p2p ? 'Join a game' : 'Challenge', body: 'Online play is not available right now. Try again soon!' });
  return false;
}

// Safety net: a join link must reach a name prompt, a room or an error with a button. Anything else after a few
// seconds (a stalled module or request, a screen that rendered nothing) gets a visible way out.
function joinWatch(code, ms = 7000) {
  const t0 = Date.now();
  let panel = null, timer = null;
  const w = { net: null, stop };
  const settled = () => {
    const s = current();
    if (!s || s.el.classList.contains('leaving')) return false;
    if (s.name === 'home') return false;
    if (s.name === 'room') return !s.el.querySelector('.net-loading') && !!s.el.innerText.trim();
    if (s.name !== 'join') return true;
    return !!s.el.querySelector('input, .net-wrap button, [data-act=retry]');
  };
  // a new home screen (not the one boot opened) = the player backed out
  const home0 = current();
  const gaveUp = () => { const s = current(); return s && (!['home', 'join', 'room'].includes(s.name) || (s.name === 'home' && s !== home0)); };
  function stop() { clearInterval(timer); panel?.remove(); panel = null; }
  function retry() {
    panel?.remove(); panel = null;
    if (!w.net) { reloadFresh(); return; }
    go('join', { code, ...(JOIN_KEY === 'p2p' ? { via: 'p2p' } : {}) }, { replace: true, skipGuard: true });
  }
  timer = setInterval(() => {
    if (gaveUp()) { stop(); return; }
    if (settled()) { if (panel) { panel.remove(); panel = null; } if (Date.now() - t0 > ms) stop(); return; }
    if (panel || Date.now() - t0 < ms) return;
    panel = h('div.join-rescue', { role: 'alert' },
      h('b', {}, 'Still joining…'),
      h('p', {}, 'This is taking longer than it should. Check your connection, then try again.'),
      h('div.row', {},
        h('button.btn.primary', { type: 'button', dataset: { act: 'join-retry' }, onclick: retry }, 'Try again'),
        h('button.btn', { type: 'button', onclick: reloadFresh }, 'Reload')));
    document.body.append(panel);
  }, 400);
  return w;
}

function hooks() {
  window.__clued = {
    ctx, BUILD,
    start(x) {
      if (x?.rounds) return playSpec({ v: 1, seed: String(Math.random()), ...x }, { title: 'Test', replay: null });
      const st = STRUCTURES[x?.structure || 'quick'];
      return st.start({ format: 'mc', packs: 'all', count: 5, opts: {}, difficulty: 0, timer: false, ...x });
    },
    answer: x => window.__cluedRun?.answer(x ?? 'correct'),
    next: () => window.__cluedRun?.next(),
    run: () => window.__cluedRun,
    state: () => ({ screen: current()?.name, run: window.__cluedRun ? { ...window.__cluedRun.state, players: undefined, answers: window.__cluedRun.state.answers.length } : null, q: window.__cluedRun?.current() || null }),
    canPester,
    checkVersion, updateState,
    // Test helper: what a tap at each point of a grid would hit. Anything outside the live screen, an open popup,
    // the update banner or the account widget is an overlay eating taps.
    hits({ cols = 5, rows = 10 } = {}) {
      const scr = current()?.el, bad = [];
      const ok = el => !el || el === document.body || el === document.documentElement || el.id === 'app' || scr?.contains(el)
        || el.closest('#popups .pop:not(.out), .upd-banner, #br8t-account, .join-rescue');
      const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = Math.round((c + 0.5) * innerWidth / cols), y = Math.round((r + 0.5) * innerHeight / rows);
        const el = document.elementFromPoint(x, y);
        if (!ok(el)) bad.push({ x, y, el: name(el) });
      }
      return { screen: current()?.name, bad };
    },
  };
}

async function boot() {
  applyAll();
  if (JOIN_KEY) loadNet();   // a join link needs js/net/ next: fetch it alongside the packs, not after them
  const [fr] = await Promise.all([loadFormats(), loadIndex()]);
  if (fr.failed.length) console.warn('[clued] formats failed to load:', fr.failed.join(', '));
  mountApp(document.getElementById('app'));
  watchVersion({ poll: !TEST || params.has('vcheck') });
  import(`./learn/hook.js?v=${BUILD}`).then(m => m.install()).catch(() => {});
  hooks();
  await go('home', {}, { replace: true });
  ready();
  if (!TEST) {
    import(`./core/cloud.js?v=${BUILD}`).then(m => {
      m.setCanPester(canPester);
      setMatchCompleted(m.matchCompleted);
    }).catch(e => console.info('[clued] account layer unavailable', e?.message));
  }
  route();
  // back from a br8t Pass checkout (js/net/topup.js → Stripe → ?checkout=success|cancel)
  const bought = params.get('checkout');
  if (bought) {
    const keep = new URLSearchParams(location.search);
    keep.delete('checkout');
    history.replaceState(history.state, '', location.pathname + (keep.size ? '?' + keep : '') + location.hash);
    if (bought === 'success') toast('Thank you! Your br8t Pass is on its way: unlimited online games', 4000);
  }
}

boot().catch(e => {
  console.error(e);
  window.__cluedBootError && window.__cluedBootError(e.stack || e.message || String(e));
});
