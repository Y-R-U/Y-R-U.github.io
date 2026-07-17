// Gameplay controller: replays board events as animation + FX, owns HUD,
// modes (journey/blitz/zen/weekly/event), boosters, forge meter, hints, auto.
import { Board } from './board.js';
import { GemMesh, initGemAssets, gemGlowColor, gemHexColor, getInnerAsset } from './gems.js';
import { R, cellToWorld, addShake } from './render.js';
import * as FX from './fx.js';
import { sfx } from './audio.js';
import { input, clearSelection } from './input.js';
import { SCORE, FORGE, CALLOUTS, GEM_COLORS, GRID } from './config.js';
import { save, persist, useBooster, addShards } from './save.js';
import { pick, fmt, fmtTime, clamp } from './utils.js';

export const game = {
  mode: null, level: null, board: null,
  meshes: new Map(),
  score: 0, shownScore: 0, moves: 0, timer: 0,
  forge: 0, forgeArmed: false, armedBooster: null,
  busy: false, over: false, paused: false, started: false,
  auto: false, autoTimer: 0,
  hintTimer: 0, hintMove: null,
  prismTimer: 0, zenPaid: 0,
  mods: {},
  onEnd: null,     // (result) => {}  wired by ui.js
  onToast: null,
};

// ── tiny tween engine ─────────────────────────────────────────────────
const tweens = [];
function tween(dur, onUpdate, { delay = 0, ease = easeOutCubic, onDone = null } = {}) {
  tweens.push({ t: -delay, dur, onUpdate, ease, onDone });
}
function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
function easeOutBack(k) { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
function easeOutBounce(k) {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(tw.t / tw.dur, 1);
    tw.onUpdate(tw.ease(k));
    if (k >= 1) { tweens.splice(i, 1); tw.onDone?.(); }
  }
}
const wait = (ms) => new Promise(res => setTimeout(res, ms));

// ── setup / teardown ──────────────────────────────────────────────────
export function initGame() {
  initGemAssets(R.lite);
  input.onSwap = (a, b) => playerSwap(a, b);
  input.onTap = (cell) => tapTarget(cell);
  input.onSelect = (cell) => highlight(cell);
}

export function startGame({ mode, level = null, rng = Math.random, mods = {}, rainbow = false }) {
  game.mode = mode;
  game.level = level;
  game.mods = mods;
  game.score = 0; game.shownScore = 0;
  game.forge = 0; game.forgeArmed = false; game.armedBooster = null;
  game.over = false; game.busy = false; game.paused = false; game.started = true;
  game.hintTimer = 0; game.hintMove = null; game.prismTimer = 0; game.zenPaid = 0;

  const metalChance = mods.metalChance ?? level?.metalChance ?? 0.14;
  game.board = new Board({
    colors: level?.colors ?? 6,
    metalChance, rng,
    mods: { metalScoreMult: mods.metalScoreMult, crushScoreMult: mods.crushScoreMult },
  });
  if (rainbow) game.board.addPrism();

  game.moves = level?.moves ?? 0;
  game.timer = (mode === 'blitz' || mode === 'weekly' || (mode === 'event' && mods.eventMode === 'blitz')) ? SCORE.blitzSeconds : 0;
  game.isTimed = game.timer > 0;

  rebuildMeshes(true);
  updateHud();
  input.enabled = true;
  save.data.stats.gamesPlayed++;
  persist();
}

export function stopGame() {
  game.started = false;
  input.enabled = false;
  game.auto = false;
  for (const [, gm] of game.meshes) R.gemLayer.remove(gm.group);
  game.meshes.clear();
  tweens.length = 0;
  FX.clearDomFx();
}

function rebuildMeshes(popIn = false) {
  for (const [, gm] of game.meshes) R.gemLayer.remove(gm.group);
  game.meshes.clear();
  game.board.forEach((gem, r, c) => {
    const gm = new GemMesh(gem);
    const p = cellToWorld(r, c);
    gm.group.position.set(p.x, p.y, 0);
    if (popIn) {
      gm.group.scale.setScalar(0.01);
      tween(0.35, k => gm.group.scale.setScalar(k), { delay: (r + c) * 0.02, ease: easeOutBack });
    }
    R.gemLayer.add(gm.group);
    game.meshes.set(gem.id, gm);
  });
}

// ── input actions ─────────────────────────────────────────────────────
function tapTarget(cell) {
  if (game.busy || game.over) return false;
  if (game.forgeArmed) {
    game.forgeArmed = false;
    game.forge = 0;
    sfx.forge();
    FX.flash('rgba(255,180,60,0.18)');
    runActivation(cell.r, cell.c, 1);
    return true;
  }
  if (game.armedBooster === 'hammer') {
    game.armedBooster = null;
    if (!useBooster('hammer')) return true;
    sfx.forge();
    runActivation(cell.r, cell.c, 0);
    updateHud();
    return true;
  }
  return false;
}

function highlight(cell) {
  for (const [, gm] of game.meshes) gm.group.userData.sel = false;
  if (!cell) return;
  const g = game.board.at(cell.r, cell.c);
  if (g) {
    const gm = game.meshes.get(g.id);
    if (gm) gm.group.userData.sel = true;
    sfx.click();
  }
}

async function playerSwap(a, b) {
  if (game.busy || game.over || !game.started) return;
  if (b.r < 0 || b.c < 0 || b.r >= game.board.rows || b.c >= game.board.cols) return;
  game.hintTimer = 0;

  const free = game.armedBooster === 'swap';
  const res = game.board.trySwap(a, b, free);
  if (!res.valid) {
    game.busy = true;
    await animateSwap(a, b);
    sfx.badSwap();
    await animateSwap(a, b); // back
    addShake(0.04);
    game.busy = false;
    return;
  }
  if (free) { game.armedBooster = null; useBooster('swap'); }
  else if (game.level) game.moves--;
  updateHud();
  await playEvents(res);
  afterMove();
}

function runActivation(r, c, radius) {
  const res = game.board.activate(r, c, radius);
  playEvents(res).then(() => afterMove());
}

// ── event playback ────────────────────────────────────────────────────
function animateSwap(a, b) {
  return new Promise(resolve => {
    const pa = cellToWorld(a.r, a.c), pb = cellToWorld(b.r, b.c);
    const ga = game.board.at(a.r, a.c), gb = game.board.at(b.r, b.c);
    // meshes may be mid-swap; move whatever is at each screen slot
    const list = [];
    for (const [, gm] of game.meshes) {
      const p = gm.group.position;
      if (Math.abs(p.x - pa.x) < 0.01 && Math.abs(p.y - pa.y) < 0.01) list.push({ gm, to: pb, from: pa });
      else if (Math.abs(p.x - pb.x) < 0.01 && Math.abs(p.y - pb.y) < 0.01) list.push({ gm, to: pa, from: pb });
    }
    sfx.swap();
    for (const { gm, to, from } of list) {
      tween(0.16, k => {
        gm.group.position.x = from.x + (to.x - from.x) * k;
        gm.group.position.y = from.y + (to.y - from.y) * k;
        gm.group.position.z = Math.sin(k * Math.PI) * 0.35;
      });
    }
    setTimeout(resolve, 170);
  });
}

async function playEvents(res) {
  game.busy = true;
  clearSelection();
  const events = res.events;
  for (const ev of events) {
    if (!game.started) { game.busy = false; return; }
    if (ev.t === 'swap') await animateSwap(ev.a, ev.b);
    else if (ev.t === 'swapBack') { sfx.badSwap(); await animateSwap(ev.a, ev.b); }
    else if (ev.t === 'clear') await playClear(ev, res.combo);
    else if (ev.t === 'fall') await playFall(ev);
  }
  // cascade time bonus in timed modes
  if (game.isTimed && res.cascades >= 3) {
    const bonus = (res.cascades - 2) * SCORE.blitzCascadeBonus;
    game.timer = Math.min(game.timer + bonus, SCORE.blitzSeconds + 30);
    FX.bigText('+' + Math.round(bonus) + ' SECONDS', 'time');
  }
  game.busy = false;
}

async function playClear(ev, comboKind) {
  const centroid = { x: 0, y: 0 };

  // activation FX first (beams / shockwaves / prism zaps / combos)
  for (const act of ev.activations) {
    const p = cellToWorld(act.r, act.c);
    switch (act.kind) {
      case 'lineH': FX.beam(p, true, 0xbfe0ff); sfx.beam(); break;
      case 'lineV': FX.beam(p, false, 0xbfe0ff); sfx.beam(); break;
      case 'burst': FX.shockwave(p.x, p.y, 0xffcc66, 2.4); sfx.boom(); break;
      case 'nova': FX.shockwave(p.x, p.y, 0xff66aa, 4.2); FX.flash('rgba(255,120,220,0.14)'); sfx.nova(); break;
      case 'prism': {
        sfx.prismCast();
        const col = act.color >= 0 ? GEM_COLORS[act.color].glow : 0xffffff;
        for (const cell of ev.cells) {
          if (cell.gem.color === act.color) {
            const q = cellToWorld(cell.r, cell.c);
            FX.zapBolt(p.x, p.y, q.x, q.y, col);
          }
        }
        break;
      }
      case 'comboLL': FX.beam(p, true, 0x88eeff); FX.beam(p, false, 0x88eeff); sfx.beam(); sfx.beam(); break;
      case 'comboLB': for (let d = -(act.rad || 1); d <= (act.rad || 1); d++) { FX.beam({ x: p.x, y: p.y + d }, true, 0xffee88); FX.beam({ x: p.x + d, y: p.y }, false, 0xffee88); } sfx.nova(); break;
      case 'comboBB': FX.shockwave(p.x, p.y, 0xffaa44, 5); FX.flash('rgba(255,180,80,0.16)'); sfx.nova(); break;
      case 'comboPC': case 'comboPL': case 'comboPB': {
        sfx.prismCast();
        FX.shockwave(p.x, p.y, 0xbfe0ff, 5);
        FX.flash('rgba(200,240,255,0.18)');
        for (const cell of ev.cells) {
          const q = cellToWorld(cell.r, cell.c);
          FX.zapBolt(p.x, p.y, q.x, q.y, gemGlowColor(cell.gem));
        }
        break;
      }
      case 'comboPP': FX.flash('rgba(190,225,255,0.32)', 400); FX.shockwave(p.x, p.y, 0xbfe0ff, 8); sfx.mega(); addShake(0.4); break;
    }
  }
  if (comboKind && ev.cascade === 1 && CALLOUTS[comboKind.replace('combo', 'combo')]) {
    FX.bigText(pick(Math.random, CALLOUTS[comboKind]), 'callout mega');
  }

  const crushKeys = new Set(ev.crushes.map(c => c.r * 100 + c.c));

  // pop the gems
  let i = 0;
  for (const cell of ev.cells) {
    const gm = game.meshes.get(cell.gem.id);
    const p = cellToWorld(cell.r, cell.c);
    centroid.x += p.x; centroid.y += p.y;
    const isMetal = cell.gem.finish === 'metal';
    const crushed = crushKeys.has(cell.r * 100 + cell.c);
    // glass shell + inner gem → crack, shatter the shell, gem tumbles free
    const isShelled = !isMetal && cell.gem.color >= 0 && cell.gem.special !== 'prism';
    const breakShell = (smash) => {
      if (isShelled) {
        FX.popFlash(p.x, p.y, gemGlowColor(cell.gem), smash ? 2.2 : 1);
        FX.burst(p.x, p.y, gemGlowColor(cell.gem), smash ? 24 : 10, smash ? 5 : 3);
        FX.shatter(p.x, p.y, gemHexColor(cell.gem), false, smash ? 14 : 8);
        const inner = getInnerAsset(cell.gem.color);
        FX.dropGem(p.x, p.y, inner.geo, inner.mat, smash);
      } else {
        FX.popFlash(p.x, p.y, gemGlowColor(cell.gem), isMetal ? 1.6 : 1.2);
        FX.burst(p.x, p.y, gemGlowColor(cell.gem), 12, 3.2);
        FX.shatter(p.x, p.y, gemGlowColor(cell.gem), isMetal, 8);
      }
    };
    if (crushed) {
      // THE CRUSH: metal above slams down, glass squashes flat, then explodes
      sfx.crush();
      slamCrusher(cell.r - 1, cell.c);
      game.forge = Math.min(game.forge + FORGE.crush, 100);
      save.data.stats.crushes++;
      addShake(0.16);
      if (gm) {
        const grp = gm.group;
        tween(0.13, k => { grp.scale.set(1 + k * 0.6, Math.max(1 - k * 1.1, 0.06), 1); }, {
          onDone: () => {
            R.gemLayer.remove(grp);
            breakShell(true);
            FX.shockwave(p.x, p.y, gemGlowColor(cell.gem), game.mods.crushShockwave ? 3.6 : 2);
          },
        });
        game.meshes.delete(cell.gem.id);
      }
      i++;
      continue;
    }
    if (isMetal) { sfx.clang(i * 0.02); game.forge = Math.min(game.forge + FORGE.metal, 100); }
    else sfx.pop(ev.cascade, i);
    if (cell.gem.special) { game.forge = Math.min(game.forge + FORGE.special, 100); save.data.stats.specials++; }
    if (gm) {
      const grp = gm.group;
      if (isShelled) {
        if (i === 0) sfx.glass(0.04);
        // crack: quick jitter + swell, then the shell bursts and the gem falls out
        tween(0.12, k => {
          grp.rotation.z = Math.sin(k * 26) * 0.07 * (1 - k * 0.5);
          grp.scale.setScalar(1 + k * 0.1);
        }, {
          onDone: () => { R.gemLayer.remove(grp); breakShell(false); },
        });
      } else {
        breakShell(false);
        tween(0.18, k => { grp.scale.setScalar(1 + k * 0.6); grp.rotation.z = k * 1.2; }, {
          onDone: () => R.gemLayer.remove(grp),
        });
      }
      game.meshes.delete(cell.gem.id);
    } else {
      breakShell(false);
    }
    i++;
  }
  if (ev.crushes.length) FX.bigText(pick(Math.random, CALLOUTS.crush), 'callout crushtx');
  if (ev.cells.length) {
    centroid.x /= ev.cells.length; centroid.y /= ev.cells.length;
    FX.floater(centroid.x, centroid.y, '+' + fmt(ev.points), ev.points > 400 ? 'big' : '');
  }

  // spawned special gems replace the old mesh with a pop-in
  for (const sp of ev.spawned) {
    if (sp.old) {
      const oldGm = game.meshes.get(sp.old.id);
      if (oldGm) { R.gemLayer.remove(oldGm.group); game.meshes.delete(sp.old.id); }
    }
    const gm = new GemMesh(sp.gem);
    const p = cellToWorld(sp.r, sp.c);
    gm.group.position.set(p.x, p.y, 0);
    gm.group.scale.setScalar(0.01);
    R.gemLayer.add(gm.group);
    game.meshes.set(sp.gem.id, gm);
    tween(0.3, k => gm.group.scale.setScalar(k * (sp.gem.special === 'nova' ? 1.12 : 1)), { ease: easeOutBack });
    const label = sp.gem.special === 'prism' ? CALLOUTS.prism : sp.gem.special === 'nova' ? CALLOUTS.nova
      : sp.gem.special === 'burst' ? CALLOUTS.burst : CALLOUTS.line;
    FX.bigText(pick(Math.random, label), 'callout');
    FX.shockwave(p.x, p.y, gemGlowColor(sp.gem), 1.4);
  }

  // score + praise
  game.score += ev.points;
  save.data.stats.matches++;
  save.data.stats.cascadesBest = Math.max(save.data.stats.cascadesBest, ev.cascade);
  if (ev.praise) {
    FX.bigText(ev.praise, 'praise n' + Math.min(ev.cascade, 7));
    FX.comboText(ev.cascade);
    addShake(0.03 * ev.cascade);
  }
  updateHud();
  zenMilestones();

  // prism+line converted gems need their meshes redressed before they fire
  for (const [, gm] of game.meshes) {
    if (gm.gem.special && gm.extras.length === 0 && gm.gem.special !== 'prism') gm.dress();
  }

  await wait(ev.cascade === 1 ? 270 : 300);
}

// the metal gem above a crush dips down onto the glass and springs back
function slamCrusher(r, c) {
  const g = game.board.at(r, c);
  if (!g || g.finish !== 'metal') return;
  const gm = game.meshes.get(g.id);
  if (!gm) return;
  const baseY = cellToWorld(r, c).y;
  tween(0.22, k => {
    const d = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
    gm.group.position.y = baseY - d * 0.5;
  });
}

function playFall(ev) {
  return new Promise(resolve => {
    let maxDur = 0.1;
    for (const mv of ev.moves) {
      const gm = game.meshes.get(mv.id);
      if (!gm) continue;
      const from = cellToWorld(mv.fr, mv.fc), to = cellToWorld(mv.tr, mv.tc);
      const dist = mv.tr - mv.fr;
      const dur = 0.16 + dist * 0.045;
      maxDur = Math.max(maxDur, dur);
      tween(dur, k => { gm.group.position.y = from.y + (to.y - from.y) * k; }, { ease: easeOutBounce });
    }
    for (const sp of ev.spawns) {
      const gm = new GemMesh(sp.gem);
      const to = cellToWorld(sp.r, sp.c);
      const fromY = cellToWorld(-1, sp.c).y + (sp.drop - 1) * 0.6;
      gm.group.position.set(to.x, fromY, 0);
      R.gemLayer.add(gm.group);
      game.meshes.set(sp.gem.id, gm);
      const dur = 0.18 + sp.drop * 0.045;
      maxDur = Math.max(maxDur, dur);
      tween(dur, k => { gm.group.position.y = fromY + (to.y - fromY) * k; }, { ease: easeOutBounce });
    }
    setTimeout(resolve, maxDur * 1000 + 40);
  });
}

// ── post-move bookkeeping ─────────────────────────────────────────────
async function afterMove() {
  if (game.over || !game.started) return;
  updateHud();

  // out of moves?
  if (game.level && game.moves <= 0) {
    endLevel();
    return;
  }
  // no valid moves → reshuffle
  if (game.board.findMoves().length === 0) {
    FX.bigText('NO MOVES — RESHUFFLE!', 'callout');
    sfx.shuffle();
    await wait(600);
    game.board.shuffleBoard();
    rebuildMeshes(true);
  }
  if (game.auto) queueAuto();
}

function zenMilestones() {
  if (game.mode !== 'zen' && !(game.mode === 'event' && game.mods.eventMode === 'zen')) return;
  const mult = game.mods.zenShardMult ?? 1;
  while (game.score >= (game.zenPaid + 1) * SCORE.zenMilestone) {
    game.zenPaid++;
    const pay = 50 * mult;
    addShards(pay);
    sfx.reward();
    FX.bigText(`MILESTONE  +${pay} ◆`, 'reward');
  }
}

function starsFor(score, lvl) {
  return score >= lvl.star3 ? 3 : score >= lvl.star2 ? 2 : score >= lvl.target ? 1 : 0;
}

async function endLevel() {
  game.over = true;
  input.enabled = false;
  const lvl = game.level;
  const win = game.score >= lvl.target;
  await wait(400);
  if (win) {
    sfx.win();
    FX.bigText('LEVEL CLEAR!', 'mega win');
    celebrate();
    await wait(1600);
  } else {
    sfx.lose();
    FX.bigText('OUT OF MOVES', 'mega lose');
    await wait(1200);
  }
  game.onEnd?.({ mode: 'journey', win, score: game.score, stars: starsFor(game.score, lvl), level: lvl });
}

async function endTimed() {
  game.over = true;
  input.enabled = false;
  sfx.win();
  FX.bigText("TIME'S UP!", 'mega');
  celebrate();
  await wait(1600);
  game.onEnd?.({ mode: game.mode, win: true, score: game.score });
}

export function celebrate() {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const x = (Math.random() - 0.5) * 8, y = (Math.random() - 0.5) * 9;
      FX.burst(x, y, GEM_COLORS[i % 6].glow, 22, 4.5, 0.3);
      if (i % 3 === 0) FX.shockwave(x, y, GEM_COLORS[i % 6].glow, 3);
    }, i * 180);
  }
}

// give up / quit from pause
export function abandonLevel() {
  game.over = true;
  input.enabled = false;
}

// rescue: +5 moves after failing (fake ad / booster)
export function rescue(moves = 5) {
  game.moves += moves;
  game.over = false;
  input.enabled = true;
  FX.bigText('+' + moves + ' MOVES!', 'reward');
  sfx.reward();
  updateHud();
}

// ── boosters (HUD buttons) ────────────────────────────────────────────
export function armBooster(kind) {
  if (game.busy || game.over) return;
  const have = save.data.boosters[kind] || 0;
  if (have <= 0) { game.onToast?.('None left — get more in the Shop'); return; }
  sfx.click();
  if (kind === 'moves') {
    if (!game.level) { game.onToast?.('Only in Journey levels'); return; }
    useBooster('moves');
    game.moves += 5;
    FX.bigText('+5 MOVES!', 'reward');
    sfx.reward();
    updateHud();
    return;
  }
  if (kind === 'shuffle') {
    useBooster('shuffle');
    sfx.shuffle();
    game.board.shuffleBoard();
    rebuildMeshes(true);
    updateHud();
    return;
  }
  // hammer / swap arm a target mode
  game.armedBooster = game.armedBooster === kind ? null : kind;
  game.onToast?.(game.armedBooster
    ? (kind === 'hammer' ? 'Tap any gem to smash it' : 'Swipe any two gems — free swap')
    : 'Cancelled');
  updateHud();
}

export function armForge() {
  if (game.forge < 100 || game.busy || game.over) return;
  game.forgeArmed = !game.forgeArmed;
  sfx.forge();
  game.onToast?.(game.forgeArmed ? 'FORGE READY — tap a gem to smash 3×3!' : 'Forge held');
}

// ── hints & auto-play ─────────────────────────────────────────────────
function showHint() {
  const moves = game.board.findMoves();
  if (!moves.length) return;
  moves.sort((a, b) => b.gain - a.gain);
  const mv = moves[0];
  for (const cell of [mv.a, mv.b]) {
    const g = game.board.at(cell.r, cell.c);
    const gm = g && game.meshes.get(g.id);
    if (gm) {
      const grp = gm.group;
      tween(0.7, k => { grp.scale.setScalar(1 + Math.sin(k * Math.PI * 4) * 0.14); });
    }
  }
  sfx.hint();
}

function queueAuto() {
  game.autoTimer = 0.45;
}

function autoPlay() {
  if (game.busy || game.over || !game.started) return;
  let moves = game.board.findMoves();
  if (!moves.length) return;
  moves.sort((a, b) => b.gain - a.gain);
  const mv = moves[Math.floor(Math.random() * Math.min(3, moves.length))];
  playerSwap(mv.a, mv.b);
}

// ── per-frame update ──────────────────────────────────────────────────
let lastTickSec = -1;
export function updateGame(t, dt) {
  updateTweens(dt);
  FX.updateFx(dt);
  if (!game.started) return;

  const ts = t / 1000;
  for (const [, gm] of game.meshes) {
    gm.update(ts, dt);
    // selection pulse
    if (gm.group.userData.sel) {
      const s = 1.18 + Math.sin(ts * 9) * 0.06;
      gm.group.scale.setScalar(s);
    } else if (!game.busy && Math.abs(gm.group.scale.x - 1) > 0.001 && gm.group.scale.x > 0.9 && gm.group.scale.x < 1.4) {
      gm.group.scale.setScalar(1);
    }
  }

  if (game.paused || game.over) return;

  // timers
  if (game.isTimed) {
    game.timer -= dt;
    const el = document.getElementById('hud-moves');
    el.textContent = fmtTime(game.timer);
    el.classList.toggle('low', game.timer < 11);
    if (game.timer < 11) {
      const sec = Math.ceil(game.timer);
      if (sec !== lastTickSec) { lastTickSec = sec; sfx.timeLow(); }
    }
    if (game.timer <= 0 && !game.busy) { endTimed(); return; }
  }

  // event: free prism drip
  if (game.mods.prismEvery) {
    game.prismTimer += dt;
    if (game.prismTimer >= game.mods.prismEvery && !game.busy) {
      game.prismTimer = 0;
      const spot = game.board.addPrism();
      if (spot) {
        const old = [...game.meshes.values()].find(gm => {
          const p = cellToWorld(spot.r, spot.c);
          return Math.abs(gm.group.position.x - p.x) < 0.01 && Math.abs(gm.group.position.y - p.y) < 0.01 && gm.gem.id !== spot.gem.id;
        });
        if (old) { R.gemLayer.remove(old.group); game.meshes.delete(old.gem.id); }
        const gm = new GemMesh(spot.gem);
        const p = cellToWorld(spot.r, spot.c);
        gm.group.position.set(p.x, p.y, 0);
        gm.group.scale.setScalar(0.01);
        R.gemLayer.add(gm.group);
        game.meshes.set(spot.gem.id, gm);
        tween(0.4, k => gm.group.scale.setScalar(k), { ease: easeOutBack });
        FX.bigText('FREE PRISM!', 'callout');
        sfx.prismCast();
      }
    }
  }

  // ambient sparkle glints on random gems
  if (!R.lite) {
    game.glintTimer = (game.glintTimer || 0) + dt;
    if (game.glintTimer > 0.4) {
      game.glintTimer = 0;
      const arr = [...game.meshes.values()];
      const gm = arr[Math.floor(Math.random() * arr.length)];
      if (gm) FX.popFlash(
        gm.group.position.x + (Math.random() - 0.5) * 0.5,
        gm.group.position.y + (Math.random() - 0.5) * 0.5,
        0xdfeaff, 0.35);
    }
  }

  // hints
  if (!game.busy && save.data.settings.hints && !game.auto) {
    game.hintTimer += dt;
    if (game.hintTimer > 6) { game.hintTimer = -4; showHint(); }
  }

  // auto player
  if (game.auto) {
    game.autoTimer -= dt;
    if (game.autoTimer <= 0 && !game.busy) { game.autoTimer = 0.6; autoPlay(); }
  }

  // score display lerp
  if (game.shownScore !== game.score) {
    game.shownScore = Math.min(game.score, game.shownScore + Math.max(1, Math.round((game.score - game.shownScore) * dt * 8) + 1));
    document.getElementById('hud-score').textContent = fmt(game.shownScore);
    updateScoreBar();
  }

  // forge button
  const fb = document.getElementById('forge-btn');
  document.getElementById('forge-fill').style.height = game.forge + '%';
  fb.classList.toggle('ready', game.forge >= 100);
  fb.classList.toggle('armed', game.forgeArmed);
}

// ── HUD ───────────────────────────────────────────────────────────────
function updateScoreBar() {
  const lvl = game.level;
  const bar = document.querySelector('#score-bar i');
  if (lvl) {
    bar.style.width = clamp(game.shownScore / lvl.star3 * 100, 0, 100) + '%';
  } else {
    bar.style.width = clamp((game.shownScore % 5000) / 50, 0, 100) + '%';
  }
}

export function updateHud() {
  const lvl = game.level;
  document.getElementById('hud-score').textContent = fmt(game.shownScore);
  const movesEl = document.getElementById('hud-moves');
  if (game.isTimed) movesEl.textContent = fmtTime(game.timer);
  else if (lvl) movesEl.textContent = game.moves;
  else movesEl.textContent = '∞';
  const goal = document.getElementById('hud-goal');
  if (lvl) goal.textContent = (lvl.boss ? '👑 ' : '') + `LEVEL ${lvl.n} — reach ${fmt(lvl.target)}`;
  else if (game.mode === 'weekly') goal.textContent = '🏆 WEEKLY CHALLENGE';
  else if (game.mode === 'event') goal.textContent = game.mods.eventName || 'EVENT';
  else goal.textContent = game.mode === 'blitz' ? '⚡ BLITZ' : '🌙 ZEN';
  // star markers on the bar
  const s = document.querySelectorAll('#score-bar em');
  if (lvl) {
    s[0].style.left = (lvl.target / lvl.star3 * 100) + '%';
    s[1].style.left = (lvl.star2 / lvl.star3 * 100) + '%';
    s[2].style.left = '100%';
    s.forEach(e => e.style.display = 'block');
    s[0].classList.toggle('hit', game.score >= lvl.target);
    s[1].classList.toggle('hit', game.score >= lvl.star2);
    s[2].classList.toggle('hit', game.score >= lvl.star3);
  } else s.forEach(e => e.style.display = 'none');
  updateScoreBar();
  // booster counts
  document.querySelectorAll('.boost').forEach(btn => {
    const kind = btn.dataset.boost;
    btn.querySelector('b').textContent = save.data.boosters[kind] || 0;
    btn.classList.toggle('armed', game.armedBooster === kind);
    btn.classList.toggle('empty', (save.data.boosters[kind] || 0) <= 0);
  });
}
