// Bootstrap + game loop + mode routing.
import { resize } from "./court.js";
import * as career from "./career.js";
import { makeMatch, updateMatch, drawMatch } from "./match.js";
import { bindInput } from "./input.js";
import * as UI from "./ui.js";
import * as MODES from "./modes.js";
import * as STORY from "./story.js";
import { initAudio, setCrowdLevel, setMuted, isMuted } from "./audio.js";
import { clearFx } from "./fx.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const App = {
  save: career.load(),
  match: null, tstate: null, pendingStory: null,
  playStory, playRanked, playQuick, playDaily, playTournament, playTournRound, peekStory,
};
UI.initUI(App);

const params = new URLSearchParams(location.search);
const AUTO = params.has("auto");        // headless soak-test: bot plays both sides
const AUTOMODE = params.get("mode") || "ranked";
if (params.has("tier")) {               // ranked quick-jump: ?tier=3
  App.save.tier = Math.min(7, +params.get("tier") || 0);
  App.save.rank = App.save.tier === 0 ? null : 1000000;
  App.save.opp = null;
}
if (params.has("level")) App.save.story = Math.min(100, Math.max(1, +params.get("level") || 1));
if (params.has("money")) App.save.money = +params.get("money") || App.save.money;
if (params.has("skills")) {             // ?skills=all for testing
  App.save.skills = { power: 3, grunt: 3, heckle: 3, argue: 3, outrageous: 3, underarm: 3, injury: 3, pigeon: 3, racketsmash: 3, crowdwork: 3, zone: 3, luckyballs: 3, netcord: 3 };
  App.save.loadout = ["power", "heckle", "outrageous", "pigeon"];
  // Slots are story-gated, so a skills soak needs the story progress to match.
  if (!params.has("level")) App.save.story = Math.max(App.save.story, 40);
}

function doResize() { resize(canvas); }
window.addEventListener("resize", doResize);
doResize();

/* ---------------- generic match launcher ---------------- */
function launch(cfg, opp, onOver) {
  // Only tournaments ask (in playTournament); everything else uses the saved default.
  if (AUTO) cfg.mlen = params.get("mlen") || cfg.mlen || "1g";
  cfg.mlen = cfg.mlen || App.save.settings?.matchLen || "1g";
  clearFx();
  const gear = career.gearBonus(App.save);
  const hooks = {
    ...UI.matchHooks,
    onMatchOver(m) {
      App.match = null;
      setCrowdLevel(0);
      onOver(m);
      career.persist(App.save);
      if (AUTO) setTimeout(() => { document.getElementById("modal-root").innerHTML = ""; autoNext(); }, 800);
    },
  };
  App.match = makeMatch(App.save, opp, cfg, gear, hooks);
  if (AUTO) App.match.autoPilot = true;
  UI.showScreen("hud");
  hooks.onHud(App.match);
  hooks.onSkillDock(App.match);
  window.__match = App.match;   // test hook
}

/* ---------------- modes ---------------- */
let storyRoll = null;           // cached opponent for the story screen preview
function peekStory() {
  if (!storyRoll || storyRoll.n !== App.save.story) {
    storyRoll = { n: App.save.story, ...MODES.storyMatch(App.save) };
  }
  return storyRoll;
}

function playStory() {
  const { cfg, opp, lvl } = peekStory();
  // The opening cutscene plays once, before the very first match of the story.
  if (!AUTO && lvl.n === 1 && !App.save.csStart) {
    App.save.csStart = true;
    career.persist(App.save);
    return UI.showCutscene(STORY.CUTSCENES.start, () => playStory());
  }
  launch(cfg, opp, (m) => {
    App.save.money += Math.max(0, m.earnings);
    const wasBoss = lvl.isBoss, level = lvl.n;
    let finale = false, newChapter = lvl.chapter + 1;
    if (m.won) {
      if (level >= 100) { App.save.storyDone = true; finale = true; }
      else App.save.story = level + 1;
      storyRoll = null;
    }
    const rank = career.applyStoryRank(App.save, m.won, level);
    const ctx = { wasBoss: wasBoss && m.won, finale, newChapter, level, rank };
    const result = () => UI.showStoryResult(m, ctx);
    const cs = m.won ? (finale ? STORY.CUTSCENES.end : STORY.CUTSCENES[level]) : null;
    if (cs && !AUTO) UI.showCutscene(cs, result);
    else result();
  });
}

function playRanked() {
  const tier = career.currentTier(App.save);
  const opp = career.nextOpponent(App.save);
  const cfg = { ...tier, mode: "ranked" };
  launch(cfg, opp, (m) => {
    const summary = career.applyResult(App.save, m.won, m.earnings);
    UI.showRankedResult(m, summary);
  });
}

function playQuick(stars) {
  const { cfg, opp } = MODES.quickMatch(stars);
  launch(cfg, opp, (m) => {
    App.save.money += Math.max(0, m.earnings);
    UI.showQuickResult(m);
  });
}

function playDaily() {
  const d = MODES.dailyMatch();
  const already = App.save.dailyWin === d.date;
  if (already) d.cfg.prize = 25;
  launch(d.cfg, d.opp, (m) => {
    App.save.money += Math.max(0, m.earnings);
    const firstToday = m.won && !already;
    if (firstToday) App.save.dailyWin = d.date;
    UI.showDailyResult(m, { mod: d.mod, firstToday });
  });
}

function playTournament(kind) {
  const t = MODES.TOURNAMENTS[kind];
  if (App.save.money < t.entry) return;
  App.save.money -= t.entry;
  career.persist(App.save);
  App.tstate = MODES.startTournament(kind);
  const bracket = () => UI.showTournBracket(App.tstate, () => playTournRound());
  // Cups are the only mode that asks — every round of the cup uses this length.
  if (AUTO) bracket();
  else UI.showMatchLen(() => bracket());
}

function playTournRound() {
  const ts = App.tstate;
  const { cfg, opp, roundName } = MODES.tournamentMatch(ts);
  cfg.mlen = App.save.settings?.matchLen || "1g";
  launch(cfg, opp, (m) => {
    App.save.money += Math.max(0, m.earnings);
    if (m.won) {
      ts.round++;
      if (ts.round >= 3) {
        App.save.trophies[ts.kind] = (App.save.trophies[ts.kind] || 0) + 1;
        const rank = career.applyCupRank(App.save, ts.kind);
        UI.showTournResult(m, { kind: ts.kind, champion: true, rank });
        App.tstate = null;
      } else {
        UI.showTournResult(m, { tstate: ts, kind: ts.kind });
      }
    } else {
      UI.showTournResult(m, { roundName, kind: ts.kind });
      App.tstate = null;
    }
  });
}

if (params.has("storybook")) setTimeout(() => UI.showStorybook(true), 400);

/* ---------------- menu exhibition (attract mode) ---------------- */
let demoWait = 0;
function newDemo() {
  const dsave = Object.assign(career.newSave(), {
    skills: { power: 3, grunt: 3, outrageous: 3, heckle: 2 },
    loadout: ["power", "grunt", "outrageous", "heckle"],
    racket: "graph", shoes: "run",
    story: 100, storyDone: true,      // demo players have every skill slot

    bestSpeed: 999,                   // never fires record banners on the menu
    settings: App.save.settings || {},
  });
  const { cfg, opp } = MODES.quickMatch(2 + Math.random() * 2);
  cfg.mlen = "set"; cfg.eventChance = 0.18;
  cfg.oppSkills = ["heckle", "grunt", "argue", "power", "outrageous", "pigeon", "underarm"];
  App.demo = makeMatch(dsave, opp, cfg, career.gearBonus(dsave), {});
  App.demo.autoPilot = true;
  App.demo.silent = true;
}
App.wantDemo = () => { if (!App.demo || App.demo.over) newDemo(); };

/* ---------------- auto-soak routing ---------------- */
function autoNext() {
  if (AUTOMODE === "story") playStory();
  else if (AUTOMODE === "daily") playDaily();
  else if (AUTOMODE === "quick") playQuick(2.5);
  else if (AUTOMODE === "tourn") {
    if (App.tstate) playTournRound();
    else { App.save.money += 2000; playTournament("local"); setTimeout(() => { document.getElementById("modal-root").innerHTML = ""; playTournRound(); }, 400); }
  } else playRanked();
}

document.getElementById("pauseBtn").addEventListener("click", () => {
  const m = App.match;
  if (!m || m.over) return;
  m.paused = true;
  UI.showPause(m,
    () => { m.paused = false; },
    () => {
      m.over = true; m.won = false;
      App.save.money += Math.round(m.earnings * 0.5);
      career.persist(App.save);
      App.match = null; App.tstate = null;
      UI.buildMenu(); UI.showScreen("menu");
    });
});

bindInput(canvas, () => (App.match && !App.match.paused && !App.match.over) ? App.match : null);

/* ---------------- boot ---------------- */
function boot() {
  if (!App.save.seenIntro && !AUTO) {
    App.save.seenIntro = true;
    career.persist(App.save);
    UI.modal(`<h2>RACKETEER</h2><div class="big-emoji">🎾</div>
      <p>You are <b>unranked</b>, unfit, and two pints into a Tuesday.</p>
      <p>A 63-year-old at the bar says he was world #4 in 1987, and bets he can still beat you. Climb from that pub court to <b>World #1</b> using tennis — and when tennis fails: heckling, pigeons, fake injuries and sheer audacity.</p>`,
      [{ label: "LET'S GO", fn: () => { UI.buildMenu(); UI.showScreen("menu"); } }]);
  } else {
    UI.buildMenu();
    UI.showScreen("menu");
  }
  if (AUTO) { initAudio(); autoNext(); }
}

let last = performance.now();
let dockTimer = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const m = App.match;
  if (m && !m.paused) {
    updateMatch(m, dt);
    drawMatch(m, ctx);
    dockTimer += dt;
    if (dockTimer > 0.5) { dockTimer = 0; UI.matchHooks.onSkillDock(m); UI.matchHooks.onHud(m); }
  } else if (!m) {
    const menuVisible = !document.getElementById("scr-menu").classList.contains("hidden");
    if (menuVisible && (!App.demo || App.demo.over)) {
      demoWait += dt;
      if (!App.demo || demoWait > 2.5) { demoWait = 0; newDemo(); }
    }
    if (App.demo && menuVisible && !App.demo.over) {
      const was = isMuted(); setMuted(true);
      updateMatch(App.demo, dt);
      setMuted(was);
      drawMatch(App.demo, ctx);
    } else if (App.demo && menuVisible) {
      drawMatch(App.demo, ctx);
    } else {
      ctx.fillStyle = "#0b1f14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
boot();

window.__game = App;   // test hooks
window.__ui = UI;
window.__c = career;
