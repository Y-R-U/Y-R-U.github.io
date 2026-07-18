// Bootstrap + game loop + state routing.
import { resize } from "./court.js";
import * as career from "./career.js";
import { makeMatch, updateMatch, drawMatch } from "./match.js";
import { bindInput } from "./input.js";
import * as UI from "./ui.js";
import { initAudio, setCrowdLevel } from "./audio.js";
import { clearFx } from "./fx.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const App = {
  save: career.load(),
  match: null,
  startMatch,
};
UI.initUI(App);

const params = new URLSearchParams(location.search);
const AUTO = params.has("auto");        // headless soak-test: bot plays both sides
if (params.has("tier")) {               // quick-jump for testing: ?tier=3
  App.save.tier = Math.min(7, +params.get("tier") || 0);
  App.save.rank = App.save.tier === 0 ? null : 1000000;
  App.save.opp = null;
  App.save.money = +params.get("money") || App.save.money;
  if (params.has("skills")) {           // ?skills=all for testing
    for (const id of Object.keys(App.save.skills = { power: 3, grunt: 3, heckle: 3, argue: 3, outrageous: 3, underarm: 3, injury: 3, pigeon: 3, racketsmash: 3, crowdwork: 3, zone: 3, luckyballs: 3, netcord: 3 })) ;
    App.save.loadout = ["power", "heckle", "outrageous", "pigeon"];
  }
}

function doResize() { resize(canvas); }
window.addEventListener("resize", doResize);
doResize();

function startMatch() {
  const tier = career.currentTier(App.save);
  const opp = career.nextOpponent(App.save);
  clearFx();
  const gear = career.gearBonus(App.save);
  const hooks = {
    ...UI.matchHooks,
    onMatchOver(m) {
      const summary = career.applyResult(App.save, m.won, m.earnings);
      App.match = null;
      setCrowdLevel(0);
      UI.showMatchResult(m, summary);
      if (AUTO) setTimeout(() => { document.getElementById("modal-root").innerHTML = ""; startMatch(); }, 800);
    },
  };
  App.match = makeMatch(App.save, opp, tier, gear, hooks);
  if (AUTO) App.match.autoPilot = true;
  UI.showScreen("hud");
  hooks.onHud(App.match);
  hooks.onSkillDock(App.match);
  window.__match = App.match;   // test hook
}

document.getElementById("pauseBtn").addEventListener("click", () => {
  const m = App.match;
  if (!m || m.over) return;
  m.paused = true;
  UI.showPause(m,
    () => { m.paused = false; },
    () => {
      // Forfeit = loss
      m.over = true; m.won = false;
      const summary = career.applyResult(App.save, false, Math.round(m.earnings * 0.5));
      App.match = null;
      UI.showMatchResult(m, summary);
    });
});

bindInput(canvas, () => (App.match && !App.match.paused && !App.match.over) ? App.match : null);

// First-run intro
function boot() {
  if (!App.save.seenIntro && !AUTO) {
    App.save.seenIntro = true;
    career.persist(App.save);
    UI.modal(`<h2>RACKETEER</h2><div class="big-emoji">🎾</div>
      <p>You are <b>unranked</b>. Not "low ranked" — the rankings do not know you exist.</p>
      <p>Climb from the car park to <b>World #1</b> using tennis, and when tennis fails: heckling, pigeons, fake injuries and sheer audacity.</p>`,
      [{ label: "LET'S GO", fn: () => { UI.buildMenu(); UI.showScreen("menu"); } }]);
  } else {
    UI.buildMenu();
    UI.showScreen("menu");
  }
  if (AUTO) { initAudio(); startMatch(); }
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
    // Refresh skill button states periodically (mojo/cooldowns change)
    dockTimer += dt;
    if (dockTimer > 0.5) { dockTimer = 0; UI.matchHooks.onSkillDock(m); UI.matchHooks.onHud(m); }
  } else if (!m) {
    // Idle attract: gentle court render behind menus
    ctx.fillStyle = "#0b1f14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
boot();

window.__game = App;   // test hook
