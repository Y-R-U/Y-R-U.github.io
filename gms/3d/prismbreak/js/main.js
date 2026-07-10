// Boot, main loop, URL test hooks (?lite ?auto ?shot ?mode).
import { initRender, renderFrame, applyTheme, R } from './render.js';
import { initFx, bigText, burst } from './fx.js';
import { initAudio } from './audio.js';
import { initInput } from './input.js';
import { initGame, updateGame, updateHud, game } from './game.js';
import { initUi, show, launch } from './ui.js';
import { load, save } from './save.js';
import { THEMES, GEM_COLORS } from './config.js';
import { levelDef } from './levels.js';
import { seededRng } from './utils.js';

const params = new URLSearchParams(location.search);
const lite = params.has('lite');
const shot = params.has('shot');
const auto = params.has('auto');

function bootStatus(msg) { const el = document.getElementById('boot-status'); if (el) el.textContent = msg; }

load();
bootStatus('cutting facets…');
initRender(lite);
initFx();
initGame();
initInput();
initAudio();
initUi();
applyTheme(THEMES[save.data.theme] || THEMES.aurora);

// main loop
function loop(t) {
  requestAnimationFrame(loop);
  const dt = renderFrame(t);
  updateGame(t, dt);
}
requestAnimationFrame(loop);

function ready() {
  document.getElementById('boot').classList.add('gone');
  setTimeout(() => document.getElementById('boot').remove(), 600);

  if (shot) return stageShot();
  if (auto) {
    const mode = params.get('mode') || 'zen';
    launch({ mode });
    game.auto = true;
    return;
  }
  show('menu');
}

// wait for the display font so the logo doesn't flash unstyled
if (document.fonts?.ready) {
  Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(ready);
} else ready();

// ── screenshot staging ────────────────────────────────────────────────
function stageShot() {
  const lvl = levelDef(12);
  launch({ mode: 'journey', level: { ...lvl, metalChance: 0.22 } });
  // deterministic-ish pretty board: sprinkle specials, then flashy FX
  setTimeout(() => {
    const rng = seededRng(777);
    const picks = [
      { r: 2, c: 2, special: 'prism', color: -1 },
      { r: 4, c: 5, special: 'burst' },
      { r: 6, c: 1, special: 'lineH' },
      { r: 1, c: 6, special: 'nova' },
    ];
    for (const p of picks) {
      const g = game.board.at(p.r, p.c);
      if (!g) continue;
      g.special = p.special;
      if (p.color !== undefined) g.color = p.color;
      g.finish = 'glass';
      const gm = game.meshes.get(g.id);
      if (gm) gm.refresh();
    }
    game.score = 8420;
    game.shownScore = 8420;
    updateHud();
    bigText('SPECTACULAR!', 'praise n4', 60000);
    // freeze the pop text mid-animation so the capture sees it
    const popEl = document.querySelector('#bigtext .pop');
    if (popEl) { popEl.style.animation = 'none'; popEl.style.opacity = '1'; popEl.style.transform = 'scale(1) rotate(-2deg)'; }
    for (let i = 0; i < 4; i++) {
      burst((rng() - 0.5) * 6, (rng() - 0.5) * 7, GEM_COLORS[i + 1].glow, 18, 3.5, 0.28);
    }
    setTimeout(() => { window.__shotReady = true; }, 500);
  }, 700);
}

// headless/debug handle
window.__game = { game, save, R, launch, show, params };
