// ---- boot, game loop, match lifecycle, app facade ----
import { SETTINGS_KEY, WORLDCUP_KEY, DEFAULT_HALF, PITCH_TYPES, WORLD_W, ZOOMS } from './const.js';
import { clamp, pick, irand, dist } from './util.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Camera } from './camera.js';
import { FX } from './fx.js';
import { Replay } from './replay.js';
import { Match } from './match.js';
import { bakePitch } from './pitch.js';
import { AUDIO } from './audio.js';
import { UI } from './ui.js';
import { CLUBS, NATIONS, GIANTS, teamDef } from './teams.js';
import {
  loadCareer, saveCareer, userTeam, nextFixture, reportRound, pickPitchType,
  ccNextMatch, ccReport, CC_STAGES, newWorldCup, wcReport,
} from './league.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const camera = new Camera();
const fx = new FX();
const replay = new Replay();

// soak-test instrumentation
window.__soak = { frames: 0, errors: [], goals: 0, state: '' };
window.addEventListener('error', (e) => window.__soak.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__soak.errors.push(String(e.reason)));

// ---------- settings ----------
const DEFAULTS = {
  side: 'right', joyMode: 'float', halfLen: DEFAULT_HALF, difficulty: 'normal',
  zoom: 'normal', radar: true, replays: true, aftertouch: true, autoSwitch: true,
  vibration: true, sound: true, offside: false, tips: {},
};
const HALFTIME_SECS = 5;
function loadSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
  catch (e) { return { ...DEFAULTS }; }
}

const PITCH_EMOJI = { grass: '🌱', wet: '🌧', mud: '🟤', ice: '❄️', dry: '☀️' };

// The World Cup bracket is plain data — nations still in, results so far, which
// stage. No live match hides in it, so it is safe to restore straight into.
function loadCup() {
  try { const raw = localStorage.getItem(WORLDCUP_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function saveCup(cup) {
  try {
    if (cup) localStorage.setItem(WORLDCUP_KEY, JSON.stringify(cup));
    else localStorage.removeItem(WORLDCUP_KEY);
  } catch (e) { /* full or blocked */ }
}

// ---------- app facade ----------
const app = {
  settings: loadSettings(),
  match: null,
  meta: null,
  demo: null,
  _cup: loadCup(),
  get cup() { return this._cup; },
  set cup(v) { this._cup = v; saveCup(v); },
  lastQuick: null,
  pauseClose: null,

  applySettings() {
    const s = this.settings;
    input.side = s.side;
    input.joyMode = s.joyMode;
    AUDIO.setEnabled(s.sound);
    resize();
    this.saveSettings();
  },
  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) {}
  },
  resetTips() { this.settings.tips = {}; this.saveSettings(); },

  forecastPitch(div) { return pickPitchType(div); },
  pitchLabel(pt) { return `${PITCH_EMOJI[pt] || ''} ${PITCH_TYPES[pt].name}`; },

  // pre-match panel choices. folding them back into settings keeps one live settings
  // object (so the pause menu still edits the running match) and makes them the default.
  _applyOpts(o) {
    if (!o) return;
    Object.assign(this.settings, o);
    this.applySettings();
  },

  // ----- starting matches -----
  _begin(cfg, meta) {
    this.demo = null;
    this.meta = meta;
    replay.clear();
    fx.setWeather(null);
    const m = new Match({
      halfLen: Number(params.get('half')) || this.settings.halfLen,
      difficulty: this.settings.difficulty,
      settings: this.settings,
      onEvent: (type, data) => this._onEvent(type, data),
      ...cfg,
    }, { fx, input, camera, replay });
    renderer.setPitch(bakePitch(m.pitchType, irand(1, 99999)));
    this.match = m;
    window.__soak.matches = (window.__soak.matches || 0) + 1;
    UI.hideAll();
    UI.hudShow(m);
    input.enabled = true;
    input.releaseAll();
    coach.reset();
    orientHint(false);
    if (!params.get('auto')) armBack();
    return m;
  },

  startCareerMatch(c, fix, pitchType) {
    const opp = c.teams[fix.oppIdx];
    this._begin(
      { teamA: teamDef(userTeam(c)), teamB: teamDef(opp), userTeam: 0, mode: 'league', pitchType },
      { kind: 'career', oppIdx: fix.oppIdx },
    );
  },

  startCCMatch(c) {
    const cc = ccNextMatch(c);
    if (!cc) return;
    this._begin(
      { teamA: teamDef(userTeam(c)), teamB: teamDef(GIANTS[cc.gi]), userTeam: 0, mode: 'cup', pitchType: 'grass', resolveDraw: true },
      { kind: 'careerCC' },
    );
  },

  startQuick(a, b, pitchType, opts) {
    this.lastQuick = [a, b, pitchType, opts];
    this._applyOpts(opts);
    this._begin(
      { teamA: teamDef(a), teamB: teamDef(b), userTeam: 0, mode: 'friendly', pitchType },
      { kind: 'friendly' },
    );
  },

  newCup(ni, opts) {
    this.cup = newWorldCup(ni);
    this.cup.opts = opts || null;   // the whole tournament plays to these
  },

  startWCMatch(cup, um) {
    this._applyOpts(cup.opts);   // the cup keeps its own settings for every round
    this._begin(
      {
        teamA: teamDef(NATIONS[cup.userNi]), teamB: teamDef(NATIONS[um.oppNi]), userTeam: 0,
        mode: 'cup', pitchType: pick(['grass', 'grass', 'dry', 'wet']), resolveDraw: true,
      },
      { kind: 'wc' },
    );
  },

  startShootout() {
    const opp = pick(NATIONS);
    let mine = pick(NATIONS);
    while (mine === opp) mine = pick(NATIONS);
    this._begin(
      { teamA: teamDef(mine), teamB: teamDef(opp), userTeam: 0, mode: 'shootout', pitchType: 'grass' },
      { kind: 'shootout' },
    );
  },

  startPractice() {
    const c = loadCareer();
    const mine = c ? userTeam(c) : CLUBS[0];
    this._begin(
      { teamA: teamDef(mine), teamB: teamDef(CLUBS[16]), userTeam: 0, mode: 'practice', pitchType: 'grass' },
      { kind: 'practice' },
    );
  },

  // ----- in-match flow -----
  pauseToggle() {
    const m = this.match;
    if (!m || m.finished || m.state === 'halftime') return;
    if (m.paused) return; // modal handles resume
    m.paused = true;
    AUDIO.click();
    this.pauseClose = UI.pauseModal(this.meta);
  },

  resumeMatch() {
    if (this.match) this.match.paused = false;
    input.releaseAll();
  },

  secondHalf() {
    if (this.match) this.match.resumeSecondHalf();
    input.releaseAll();
  },

  rematch() {
    if (this.meta.kind === 'shootout') this.startShootout();
    else if (this.lastQuick) this.startQuick(...this.lastQuick);
    else this._exitToMenu();
  },

  quitMatch(counts) {
    const meta = this.meta;
    if (counts && meta.kind === 'career') {
      const c = loadCareer();
      if (c) {
        const { seasonOver, events } = reportRound(c, 0, 3, meta.oppIdx);
        this._endMatchUI();
        if (seasonOver) { UI.seasonEndModal(events, () => UI.showCareer()); return; }
        UI.showCareer();
        return;
      }
    }
    if (counts && meta.kind === 'careerCC') {
      const c = loadCareer();
      if (c) ccReport(c, false);
      this._endMatchUI();
      UI.showCareer();
      return;
    }
    this._exitToMenu();
  },

  _endMatchUI() {
    this.match = null;
    if (this.halfTime) { this.halfTime.close(); this.halfTime = null; }
    coach.reset();
    if (history.state && history.state.slMatch) { backPopping = true; history.back(); }
    input.enabled = false;
    UI.hudHide();
    fx.setWeather(null);
    AUDIO.setCrowd(false);
  },

  _exitToMenu() {
    this._endMatchUI();
    UI.showMenu();
  },

  // ----- match events -----
  _onEvent(type, data) {
    const m = this.match;
    if (!m) return;
    UI.matchEvent(type, data);
    if (type === 'goal') { UI.hudTick(m); window.__soak.goals++; }
    if (type === 'half') { if (params.get('auto')) this.secondHalf();
      else this.halfTime = UI.halfTimeModal(m, HALFTIME_SECS, () => { this.halfTime = null; this.secondHalf(); });
    }
    if (type === 'fulltime') this._onFullTime(m);
  },

  _onFullTime(m) {
    const meta = this.meta;
    if (params.get('auto')) { this._autoNext(m); return; }
    if (cloud) cloud.matchFinished();
    UI.fullTimeModal(m, meta, () => this._afterMatch(m, meta));
  },

  _afterMatch(m, meta) {
    const r = m.result();
    const won = r.a > r.b || (r.pens && r.pens[0] > r.pens[1]);
    this._endMatchUI();

    if (meta.kind === 'career') {
      const c = loadCareer();
      const { seasonOver, events } = reportRound(c, r.a, r.b, meta.oppIdx);
      if (seasonOver) { UI.seasonEndModal(events, () => UI.showCareer()); return; }
      UI.showCareer();
      return;
    }
    if (meta.kind === 'careerCC') {
      const c = loadCareer();
      const out = ccReport(c, won);
      if (out.wonCup) {
        UI.popup({
          title: 'WORLD CHAMPIONS!',
          html: '<div style="text-align:center;font-size:52px">🌍🏆</div><p class="sub">From the Sunday Park League to the top of the world. Football completed.</p>',
          buttons: [{ label: 'Legendary', cls: 'gold', cb: () => UI.showCareer() }],
          dismissable: false,
        });
      } else if (out.out) {
        UI.popup({
          title: 'Knocked Out', html: `<p class="sub">Beaten in the ${out.stageName}. The league restarts — go win it again.</p>`,
          buttons: [{ label: 'Continue', cb: () => UI.showCareer() }], dismissable: false,
        });
      } else {
        UI.popup({
          title: 'Through!', html: `<p class="sub">You won the ${out.stageName}!</p>`,
          buttons: [{ label: 'Continue', cls: 'gold', cb: () => UI.showCareer() }], dismissable: false,
        });
      }
      return;
    }
    if (meta.kind === 'wc') {
      wcReport(this.cup, won, r.a, r.b, r.pens);
      saveCup(this.cup);          // wcReport mutates in place, so the setter never fires
      UI.showCup();
      return;
    }
    this._exitToMenu();
  },

  // soak mode: chain matches forever
  _autoNext(m) {
    this._endMatchUI();
    const a = pick(CLUBS), b = pick(NATIONS);
    this._begin(
      { teamA: teamDef(a), teamB: teamDef(b), userTeam: -1, mode: 'friendly', pitchType: pickPitchType(irand(1, 4)) },
      { kind: 'friendly' },
    );
  },
};

// ---------- demo match behind menus ----------
function startDemo() {
  const a = pick(CLUBS.filter(c => c.div <= 2));
  let b = pick(NATIONS);
  const m = new Match({
    teamA: teamDef(a), teamB: teamDef(b), userTeam: -1, mode: 'demo',
    halfLen: 99999, pitchType: 'grass', difficulty: 'normal',
    settings: { ...app.settings, replays: false, vibration: false },
    onEvent: () => {},
  }, { fx, input, camera, replay });
  renderer.setPitch(bakePitch('grass', irand(1, 99999)));
  app.demo = m;
}

// ---------- resize / orientation ----------
// landscape pulls out to the far camera and lets the pitch sit between dark
// stand margins, which take the radar and the kick button.
function resize() {
  const w = window.innerWidth, hgt = window.innerHeight;
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const land = w > hgt;
  renderer.resize(w, hgt, dpr);
  camera.resize(w, hgt, land ? 'far' : app.settings.zoom, land);
  input.layout(w, hgt, land ? Math.max(0, (w - WORLD_W * hgt / ZOOMS.far) / 2) : 0);
  orientHint(land && hgt < 480);
}

// "best played in portrait": once a session, a few seconds, never in a match
let orientShown = false, orientTimer = 0;
try { orientShown = sessionStorage.getItem('sundayleague.orientHint') === '1'; } catch (e) {}
function orientHint(want) {
  const el = document.getElementById('orient-hint');
  if (!want || app.match || orientShown) {
    if (!want || app.match) { clearTimeout(orientTimer); el.classList.add('hidden'); }
    return;
  }
  orientShown = true;
  try { sessionStorage.setItem('sundayleague.orientHint', '1'); } catch (e) {}
  el.classList.remove('hidden', 'fade');
  orientTimer = setTimeout(() => {
    el.classList.add('fade');
    orientTimer = setTimeout(() => el.classList.add('hidden'), 700);
  }, 3000);
}

// ---------- Android back: pauses a live match instead of leaving ----------
let backPopping = false;
function armBack() {
  if (!(history.state && history.state.slMatch)) history.pushState({ slMatch: 1 }, '');
}
window.addEventListener('popstate', () => {
  if (backPopping) { backPopping = false; if (app.match) armBack(); return; }
  if (!app.match) return;
  armBack();
  if (!app.match.finished) app.pauseToggle();
});

// ---------- first-match control tips (each shown once, remembered in settings) ----------
const TIPS = {
  tap: 'Tap <b>KICK</b> for a quick pass to whoever you aim the stick at',
  hold: '<b>Hold KICK</b> to power up, let go to shoot or hit it long',
  curl: 'Right after a shot, <b>swipe the stick sideways</b> to curl it',
  defend: "No ball? Tap <b>KICK</b> to slide in, or to head it when it's in the air",
};
const TIP_SHOW = 5, TIP_GAP = 8, TIP_SEEN = 2.5;
const coach = {
  cur: null, t: 0, gap: 4,
  el: document.getElementById('coach'),
  reset() { this._hide(); this.gap = 4; },
  _hide() { this.cur = null; this.el.classList.remove('show'); },
  _seen(k) { return !!(app.settings.tips && app.settings.tips[k]); },
  _want(m) {
    const b = m.ball, sel = m.sel, mine = b.owner && b.owner === sel;
    if (!this._seen('tap') && mine) return 'tap';
    if (this._seen('tap') && !this._seen('hold') && mine) return 'hold';
    if (this._seen('hold') && !this._seen('curl') && m.settings.aftertouch &&
      !b.owner && b.lastKicker === sel && b.speed() > 350) return 'curl';
    if (!this._seen('defend') && b.owner && b.owner.team !== m.userTeam &&
      dist(sel.x, sel.y, b.x, b.y) < 110) return 'defend';
    return null;
  },
  update(m, dt) {
    const live = m.state === 'play' && !m.paused && m.userTeam >= 0 && m.sel &&
      !['shootout', 'demo'].includes(m.mode) && !params.get('auto');
    if (!live) { if (this.cur) this._hide(); return; }
    if (this.cur) {
      this.t += dt;
      if (this.t >= TIP_SEEN && !this._seen(this.cur)) {
        app.settings.tips = { ...(app.settings.tips || {}), [this.cur]: 1 };
        app.saveSettings();
      }
      if (this.t >= TIP_SHOW) { this._hide(); this.gap = TIP_GAP; }
      return;
    }
    if ((this.gap -= dt) > 0) return;
    const k = this._want(m);
    if (!k) return;
    this.cur = k; this.t = 0;
    this.el.innerHTML = TIPS[k];
    this.el.classList.add('show');
  },
};
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// audio unlock (kept for the page's lifetime) + pause and silence on hide
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
  document.addEventListener(ev, () => AUDIO.init(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    AUDIO.suspend();
    if (app.match && !app.match.paused && !app.match.finished && !params.get('auto')) app.pauseToggle();
  } else {
    AUDIO.resume();
  }
});

// ---------- main loop ----------
let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  const dt = clamp((t - last) / 1000, 0.0001, 1 / 30);
  last = t;
  input.update(dt);
  const m = app.match || app.demo;
  if (!app.match && !app.demo) startDemo();
  if (m) {
    if (app.match && input.pauseEdge) app.pauseToggle();
    m.update(dt);
    renderer.draw(m, dt, { demo: m === app.demo });
    if (app.match) {
      UI.hudTick(app.match);
      if (app.halfTime && app.match.state === 'halftime') app.halfTime.tick(app.match.stateT);
      coach.update(app.match, dt);
      const st = app.match.state;
      window.__soak.state = st;
      window.__soak.states = window.__soak.states || {};
      window.__soak.states[st] = (window.__soak.states[st] || 0) + 1;
    }
  }
  window.__soak.frames++;
}

// ---------- boot ----------
UI.init(app);
app.applySettings();
resize();

window.__game = app; // debug/test hook

// Account / cloud save. Loaded late and optionally so a missing or blocked auth
// layer costs nothing, and skipped under the test hooks so soaks stay hermetic.
let cloud = null;
if (!params.get('auto') && !params.get('play') && !params.get('half')) {
  import('./cloud.js').then(m => { cloud = m; }).catch(() => {});
}

if (params.get('auto')) {
  app._autoNext(null);
} else if (params.get('play')) {
  app.startQuick(CLUBS[26], NATIONS[2], 'grass');
} else {
  UI.showMenu();
}
requestAnimationFrame(loop);
