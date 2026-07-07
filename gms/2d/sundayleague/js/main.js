// ---- boot, game loop, match lifecycle, app facade ----
import { SETTINGS_KEY, DEFAULT_HALF, PITCH_TYPES } from './const.js';
import { clamp, pick, irand } from './util.js';
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
  vibration: true, sound: true, offside: false,
};
function loadSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
  catch (e) { return { ...DEFAULTS }; }
}

const PITCH_EMOJI = { grass: '🌱', wet: '🌧', mud: '🟤', ice: '❄️', dry: '☀️' };

// ---------- app facade ----------
const app = {
  settings: loadSettings(),
  match: null,
  meta: null,
  demo: null,
  cup: null,
  lastQuick: null,
  pauseClose: null,

  applySettings() {
    const s = this.settings;
    input.side = s.side;
    input.joyMode = s.joyMode;
    AUDIO.setEnabled(s.sound);
    resize();
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  },

  forecastPitch(div) { return pickPitchType(div); },
  pitchLabel(pt) { return `${PITCH_EMOJI[pt] || ''} ${PITCH_TYPES[pt].name}`; },

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

  startQuick(a, b, pitchType) {
    this.lastQuick = [a, b, pitchType];
    this._begin(
      { teamA: teamDef(a), teamB: teamDef(b), userTeam: 0, mode: 'friendly', pitchType },
      { kind: 'friendly' },
    );
  },

  newCup(ni) { this.cup = newWorldCup(ni); },

  startWCMatch(cup, um) {
    this._begin(
      { teamA: teamDef(NATIONS[cup.userNi]), teamB: teamDef(NATIONS[um.oppNi]), userTeam: 0, mode: 'cup', pitchType: pick(['grass', 'grass', 'dry', 'wet']), resolveDraw: true },
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
    if (type === 'half') { if (params.get('auto')) this.secondHalf(); else UI.halfTimeModal(m); }
    if (type === 'fulltime') this._onFullTime(m);
  },

  _onFullTime(m) {
    const meta = this.meta;
    if (params.get('auto')) { this._autoNext(m); return; }
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
function resize() {
  const w = window.innerWidth, hgt = window.innerHeight;
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  renderer.resize(w, hgt, dpr);
  camera.resize(w, hgt, app.settings.zoom);
  input.layout(w, hgt);
  document.getElementById('orient-hint').classList.toggle('hidden', !(w > hgt && hgt < 480));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// audio unlock + pause on hide
document.addEventListener('pointerdown', () => AUDIO.init(), { once: false });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.match && !app.match.paused && !app.match.finished && !params.get('auto')) {
    app.pauseToggle();
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

if (params.get('auto')) {
  app._autoNext(null);
} else if (params.get('play')) {
  app.startQuick(CLUBS[26], NATIONS[2], 'grass');
} else {
  UI.showMenu();
}
requestAnimationFrame(loop);
