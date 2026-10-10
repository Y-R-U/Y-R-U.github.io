import { BUILD } from './build.js?v=202610100547';
import './core/debuglog.js?v=202610100547';   // remote debug log (server-switched, docs/notes/DEBUGLOG.md)
import { loadFormats } from './formats/index.js?v=202610100547';
import { getFormat, listFormats, register } from './formats/registry.js?v=202610100547';
import { loadIndex, loadPack, loadPacks, getIndex } from './core/packs.js?v=202610100547';
import { buildQuestions, makeSpec } from './core/spec.js?v=202610100547';
import { preflight, urlsOf, swapFailed } from './core/media.js?v=202610100547';
import * as store from './core/store.js?v=202610100547';
import { mountApp, defineScreen, go, back, reset, header, current, canPester } from './ui/app.js?v=202610100547';
import { h } from './ui/kit.js?v=202610100547';
import { popup, toast, confirmPop } from './ui/popup.js?v=202610100547';
import { sfx, haptic, confetti } from './ui/fx.js?v=202610100547';
import { shareText } from './ui/share.js?v=202610100547';
import { loadNet } from './ui/net.js?v=202610100547';
import { watchVersion, checkVersion, updateState } from './ui/update.js?v=202610100547';
import { applyAll } from './ui/settings.js?v=202610100547';
import { armBgm } from './ui/toggles.js?v=202610100547';
import { setMatchCompleted } from './ui/results.js?v=202610100547';
import './ui/home.js?v=202610100547';
import './ui/setup.js?v=202610100547';
import './ui/statspage.js?v=202610100547';
import { createRunner } from './structures/runner.js?v=202610100547';
import { prepare, playSpec } from './structures/session.js?v=202610100547';
import { STRUCTURES } from './structures/index.js?v=202610100547';
import { handoff } from './structures/handoff.js?v=202610100547';

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

async function route() {
  const join = params.get('join'), chal = params.get('c'), p2p = params.get('p2p');
  const hash = /[#&]lc=/.test(location.hash) ? location.hash : '';
  if (!join && !chal && !hash && !p2p) return false;
  const keep = new URLSearchParams(location.search);
  keep.delete('join'); keep.delete('c'); keep.delete('p2p');
  history.replaceState(history.state, '', location.pathname + (keep.size ? '?' + keep : ''));
  const net = await loadNet();
  const fn = hash ? net?.openLinkChallenge : join ? net?.joinRoom : p2p ? net?.openP2P : net?.openChallenge;
  if (fn) {
    try { await fn(hash || join || p2p || chal, ctx); return true; } catch (e) { console.error('[clued] net route failed', e); }
  }
  await popup({ title: join || p2p ? 'Join a game' : 'Challenge', body: 'Online play is not available right now. Try again soon!' });
  return false;
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
        || el.closest('#popups .pop:not(.out), .upd-banner, #br8t-account');
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
  armBgm();
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
}

boot().catch(e => {
  console.error(e);
  window.__cluedBootError && window.__cluedBootError(e.stack || e.message || String(e));
});
