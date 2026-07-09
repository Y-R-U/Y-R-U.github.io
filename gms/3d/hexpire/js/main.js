// HEXPIRE — boot, render loop, turn engine and player interaction.
import { CFG } from './config.js';
import { key, disc } from './hex.js';
import { makeState, serialize, deserialize, armyAt, empireBases } from './state.js';
import {
  recalcTerritory, collectIncome, fireArrows, checkWinner,
  buildTower, buildVillage, upgradeBase, upgradeTower, sellBuilding, recruitArmy,
} from './rules.js';
import { moveOptions, applyMove, applyMerge, applyAttack, resetMoves, pathToTile } from './units.js';
import { generateMap } from './mapgen.js';
import { STORY, storyById, storyMapDef } from './maps.js';
import { aiBeginTurn, aiStep } from './ai.js';
import {
  R, initRender, buildBoard, refreshTiles, refreshTrees, syncBuildings, syncArmies,
  setHighlights, clearHighlights, pickHex, pickHexAny, fitCamera, focusOn, worldOf,
  renderUpdate, armyMeshOf,
} from './render.js';
import { initFx, fxUpdate, moveAlong, arrowShot, floatText, puff, ringPulse, hitFlash } from './fx.js';
import { initInput } from './input.js';
import * as UI from './ui.js';
import { initMenus, showScreen, hideAllScreens, openOptions, rivalColorIdx } from './menus.js';
import { tutStart, tutStop, tutActive, tutEvent } from './tutorial.js';
import { openEditor, closeEditorUI, editorActive, editorPainting, editorTapAt, editorPaintAt } from './editor.js';
import { Settings, Progress, Resume } from './save.js';
import { Sfx, unlockAudio, applyAudioSettings } from './audio.js';

const P = new URLSearchParams(location.search);
const SHOT = P.get('shot') === '1';
const AUTO = P.get('auto') === '1';
const LITE = P.get('lite') === '1' || SHOT;
const MAPP = P.get('map');

const G = {
  st: null,
  humanIdx: 0,
  mode: 'menu',            // menu | game | editor
  busy: false,
  sel: null,               // { armyId, opts } | { k }
  recruit: null,           // { baseK, level, spots:Set }
  story: null,             // current story chapter
  returnMap: null,         // editor test-play round trip
  input: null,
  over: false,
};
window.__game = G;

const speed = () => (AUTO || Settings.data.fastAI) ? 0.22 : 1;
const wait = (ms) => new Promise(r => setTimeout(r, ms * speed()));

// ---------- boot ----------
const container = document.getElementById('game-container');
initRender(container, { lite: LITE });
initFx(R.scene);
G.input = initInput(R.renderer.domElement, {
  onTap: routeTap,
  onPaint: (x, y) => {
    if (!editorActive()) return;
    const qr = pickHexAny(x, y);
    if (qr) editorPaintAt(qr[0], qr[1]);
  },
  isPainting: editorPainting,
});

initMenus({
  onStartStory: startStory,
  onStartSkirmish: startSkirmish,
  onStartCustom: (m) => startCustom(m, false),
  onOpenEditor: enterEditor,
  onContinue: continueGame,
  onQuitToMenu: quitToMenu,
});

document.getElementById('btn-endturn').onclick = onEndTurn;
document.getElementById('btn-cog').onclick = () => { Sfx.tap(); openOptions(true); };
document.getElementById('btn-home').onclick = () => {
  Sfx.tap();
  UI.showModal({
    title: 'Leave the battle?',
    body: '<p>Your campaign is saved — you can continue from the home menu.</p>',
    buttons: [{ label: 'Home', primary: true, onTap: quitToMenu }, { label: 'Keep Playing' }],
  });
};

// render loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  fxUpdate(dt);
  renderUpdate(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// entry
document.getElementById('boot').classList.add('hidden');
if (SHOT) setupShot();
else if (MAPP) { const ch = storyById(MAPP); ch ? startStory(ch) : startSkirmish({ style: 'classic', size: 'medium', rivals: rivalsDefault(3), seed: MAPP }); }
else if (AUTO) startSkirmish({ style: 'random', size: 'medium', rivals: rivalsDefault(3) });
else showScreen('menu');

function rivalsDefault(n) {
  const keys = Object.keys(CFG.personalities);
  return Array.from({ length: n }, (_, i) => ({
    name: CFG.aiNames[i], personality: keys[i % keys.length], colorIdx: rivalColorIdx(i),
  }));
}

// ---------- game setup ----------

function playerDef() {
  return { name: Settings.data.empireName || 'Your Empire', colorIdx: Settings.data.colorIdx, isAI: false };
}

function startStory(ch) {
  G.story = ch;
  const def = storyMapDef(ch);
  const empires = [playerDef(), ...ch.ais.map((a, i) => ({
    name: a.name, personality: a.personality, colorIdx: rivalColorIdx(i), isAI: true,
  }))];
  beginGame(def, empires, 'story-' + ch.id);
  if (ch.tutorial && Settings.data.showHints && !AUTO) tutStart({ focusHome });
}

function startSkirmish(opts) {
  G.story = null;
  let map = null;
  for (let tries = 0; tries < 6 && !map; tries++) {
    const m = generateMap({
      style: opts.style, size: opts.size,
      players: opts.rivals.length + 1,
      seed: opts.seed != null ? opts.seed + (tries ? '-' + tries : '') : undefined,
    });
    if (m.bases.length === opts.rivals.length + 1) map = m;
  }
  if (!map) { UI.toast('Map generation failed — try another style'); return; }
  const empires = [playerDef(), ...opts.rivals.map(r => ({ ...r, isAI: true }))];
  beginGame({ name: map.name, mode: 'skirmish', land: map.land, bases: map.bases }, empires, 'sk-' + map.seed);
}

function startCustom(m, fromEditor) {
  G.story = null;
  G.returnMap = fromEditor ? m : null;
  const keys = Object.keys(CFG.personalities);
  const empires = [playerDef()];
  for (let i = 1; i < m.bases.length; i++) {
    empires.push({
      name: CFG.aiNames[i - 1], colorIdx: rivalColorIdx(i - 1), isAI: true,
      personality: keys[Math.floor(Math.random() * keys.length)],
    });
  }
  beginGame({ name: m.name, mode: 'custom', land: m.land, bases: m.bases, pieces: m.pieces }, empires, 'cu-' + m.id);
}

function beginGame(mapDef, empires, seedStr) {
  hideAllScreens();
  closeEditorUI();
  tutStop();
  UI.closeModal();
  G.mode = 'game';
  G.over = false;
  deselect();
  G.st = makeState(mapDef, empires, seedStr);
  recalcTerritory(G.st);
  buildBoard(G.st);
  syncBuildings(G.st);
  syncArmies(G.st);
  fitCamera();
  UI.showHud(true);
  unlockAudio();
  if (!SHOT && !AUTO) applyAudioSettings();
  G.st.turn = -1;
  nextEmpire();
}

function continueGame() {
  const payload = Resume.load();
  if (!payload) return;
  try {
    G.st = deserialize(payload.json);
  } catch { UI.toast('Saved game could not be loaded'); Resume.clear(); return; }
  G.story = payload.storyId ? storyById(payload.storyId) : null;
  G.mode = 'game';
  G.over = false;
  hideAllScreens();
  deselect();
  recalcTerritory(G.st);
  buildBoard(G.st);
  syncBuildings(G.st);
  syncArmies(G.st);
  fitCamera();
  UI.showHud(true);
  unlockAudio(); applyAudioSettings();
  beginHumanTurn(false);
}

function quitToMenu() {
  UI.closeModal();
  UI.showHud(false);
  UI.hidePanel();
  UI.showEndTurn(false);
  tutStop();
  deselect();
  G.mode = 'menu';
  if (G.returnMap) {
    enterEditor(G.returnMap);
    G.returnMap = null;
    return;
  }
  showScreen('menu');
}

function enterEditor(existing = null) {
  hideAllScreens();
  UI.showHud(false);
  G.mode = 'editor';
  openEditor({
    onExit: () => { G.mode = 'menu'; showScreen('menu'); },
    onTest: (m) => { UI.closeModal(); startCustom(m, true); },
  }, existing && existing.land ? existing : null);
}

function focusHome() {
  const bt = empireBases(G.st, G.humanIdx)[0];
  if (bt) focusOn(bt.k, 8);
}

// ---------- turn engine ----------

function refreshAll() {
  refreshTiles(G.st);
  syncBuildings(G.st);
  syncArmies(G.st);
  if (G.mode === 'game') UI.updateHud(G.st, G.humanIdx);
}

function nextEmpire() {
  if (G.over) return;
  const st = G.st;
  let idx = st.turn;
  for (let i = 0; i < st.empires.length; i++) {
    idx = (idx + 1) % st.empires.length;
    if (idx === 0 && st.turn !== -1) st.round++;
    if (st.empires[idx].alive) { startEmpireTurn(idx); return; }
  }
}

async function startEmpireTurn(idx) {
  const st = G.st;
  st.turn = idx;
  const e = st.empires[idx];
  recalcTerritory(st);
  resetMoves(st, idx);
  const inc = collectIncome(st, idx);
  refreshAll();

  const bt = empireBases(st, idx)[0];
  if (bt && inc.total > 0 && !SHOT) {
    floatText(worldOf(bt.k, CFG.tileH + 1.3), '+' + inc.total + ' 🪙', '#ffe066');
    if (idx === G.humanIdx) Sfx.coin();
  }

  if (idx === G.humanIdx && !AUTO) {
    beginHumanTurn(true);
  } else {
    UI.updateHud(st, G.humanIdx);
    if (!SHOT) UI.turnBanner(e.name, CFG.colors[e.colorIdx].css, 900);
    G.input.setTapEnabled(false);
    await wait(650);
    await runAiTurn(idx);
  }
}

function beginHumanTurn(announce) {
  const st = G.st;
  G.busy = false;
  G.input.setTapEnabled(true);
  UI.showEndTurn(true, 'Round ' + st.round);
  if (announce) {
    UI.turnBanner('⚔️ Your turn', '#f0d68a', 1100);
    Sfx.turn();
  }
  UI.updateHud(st, G.humanIdx);
  // autosave at the top of every player turn
  Resume.store({ json: serialize(st), storyId: G.story?.id || null, t: Date.now() });
}

async function onEndTurn() {
  if (G.busy || G.over || G.st.turn !== G.humanIdx) return;
  G.busy = true;
  deselect();
  UI.showEndTurn(false);
  tutEvent('turn-ended');
  Sfx.turn();
  await arrowsPhase(G.humanIdx);
  if (!G.over) nextEmpire();
}

async function runAiTurn(idx) {
  const st = G.st;
  aiBeginTurn(st, idx);
  for (let steps = 0; steps < 48; steps++) {
    if (G.over) return;
    const act = aiStep(st, idx);
    if (!act) break;
    await animateAct(act, idx);
    refreshAll();
    if (checkGameEnd()) return;
  }
  await arrowsPhase(idx);
  if (!G.over) nextEmpire();
}

// ---------- arrows ----------

async function arrowsPhase(idx) {
  const st = G.st;
  const shots = fireArrows(st, idx);
  if (shots.length && !SHOT) {
    Sfx.arrow();
    const jobs = shots.map((s, i) =>
      wait(i * 90).then(() => arrowShot(worldOf(s.from, CFG.tileH + 0.7), worldOf(s.to, CFG.tileH + 0.25)))
        .then(() => {
          hitFlash(worldOf(s.to));
          floatText(worldOf(s.to, CFG.tileH + 0.8), '-1', '#ff9c8a', 0.7);
          if (s.kill) { puff(worldOf(s.to, CFG.tileH + 0.2), 0x777777, 10); Sfx.hit(); }
        }));
    await Promise.all(jobs);
  }
  refreshAll();
  checkGameEnd();
}

// ---------- action animation (AI + auto player) ----------

async function animateAct(act, idx) {
  const st = G.st;
  if (SHOT) return;
  if (act.type === 'build' || act.type === 'recruit' || act.type === 'upgrade') {
    const p = worldOf(act.k);
    puff(p, 0xd8cfa8, 8, 0.4);
    ringPulse(p, CFG.colors[st.empires[idx].colorIdx].hex);
    if (visible(act.k)) Sfx.build();
    await wait(260);
  } else if (act.type === 'move') {
    await animateMove(act.armyId, act.path);
  } else if (act.type === 'merge') {
    puff(worldOf(act.k, CFG.tileH + 0.3), 0xffffff, 8, 0.3);
    if (visible(act.k)) Sfx.merge();
    await wait(200);
  } else if (act.type === 'attack') {
    if (act.path) await animateMove(act.armyId, act.path);
    await animateStrike(act.armyId, act.targetK, act.ev);
  }
}

async function animateMove(armyId, path) {
  if (!path || !path.length) return;
  const entry = armyMeshOf(armyId);
  if (!entry) return;
  entry.animating = true;
  Sfx.march();
  await moveAlong(entry.mesh, path.map(k => worldOf(k)), 0.14 * speed() + 0.02);
  entry.animating = false;
  syncArmies(G.st);
}

async function animateStrike(armyId, targetK, ev) {
  const st = G.st;
  const entry = armyMeshOf(armyId);
  const tp = worldOf(targetK);
  // lunge
  if (entry) {
    entry.animating = true;
    const from = entry.mesh.position.clone();
    const mid = from.clone().lerp(tp, 0.45);
    await moveAlong(entry.mesh, [mid, from], 0.09 * speed() + 0.02);
    entry.animating = false;
  }
  if (ev.repelled) {
    floatText(worldOf(targetK, CFG.tileH + 0.9), '🛡 repelled', '#9fc4e8', 0.8);
    if (visible(targetK)) Sfx.repel();
  } else {
    hitFlash(tp);
    floatText(worldOf(targetK, CFG.tileH + 0.9), '-' + ev.dmg, '#ff8a76');
    if (visible(targetK)) Sfx.hit();
    if (ev.killedArmy) puff(tp.clone().setY(tp.y + 0.2), 0x883c30, 12, 0.5);
    if (ev.killedBuilding) {
      Sfx.razed();
      puff(tp.clone().setY(tp.y + 0.3), 0x8a7f6a, 14, 0.7);
      UI.toast(`${G.st.empires[ev.buildingOwner]?.name ?? 'A'} ${ev.killedBuilding === 'base' ? 'base' : ev.killedBuilding} was razed!`);
      refreshTrees(st);
    }
  }
  await wait(200);
  refreshAll();
}

const visible = () => true; // audio culling hook — keep simple, always audible

// ---------- win / lose ----------

function checkGameEnd() {
  const st = G.st;
  checkWinner(st);
  const humanDead = !st.empires[G.humanIdx].alive;
  if (st.winner === -1 && !humanDead) return false;
  if (G.over) return true;
  G.over = true;
  G.input.setTapEnabled(true);
  UI.showEndTurn(false);
  UI.hidePanel();
  clearHighlights();
  tutStop();
  Resume.clear();
  window.__done = true;

  const win = st.winner === G.humanIdx;
  if (win && G.story) Progress.markDone(G.story.id);
  const razed = st.empires.filter(e => !e.alive).length;
  const stats = `${st.mapName} · Round ${st.round}<br>` +
    (win ? `${razed} rival empire${razed === 1 ? '' : 's'} razed` :
      `Your empire fell to ${st.empires.find(e => e.alive && e.idx !== G.humanIdx)?.name ?? 'the rivals'}`);
  setTimeout(() => {
    if (win) Sfx.victory(); else Sfx.defeat();
    if (AUTO) return; // soak: leave the modal out, __done is set
    const nextCh = win && G.story ? STORY[STORY.findIndex(s => s.id === G.story.id) + 1] : null;
    UI.resultModal({
      win,
      name: st.empires[G.humanIdx].name,
      stats,
      onMenu: quitToMenu,
      onNext: nextCh ? () => startStory(nextCh) : null,
      onReplay: () => {
        if (G.story) startStory(G.story);
        else UI.showModal({ title: 'Rematch?', body: '<p>Set up a new skirmish from the home menu.</p>', buttons: [{ label: 'Home', primary: true, onTap: quitToMenu }] });
      },
    });
  }, 900 * speed());
  return true;
}

// ---------- player interaction ----------

function routeTap(x, y) {
  if (G.mode === 'editor') {
    const qr = pickHexAny(x, y);
    if (qr) editorTapAt(qr[0], qr[1]);
    return;
  }
  if (G.mode !== 'game' || G.busy || G.over || G.st.turn !== G.humanIdx) return;
  const st = G.st;
  const k = pickHex(st, x, y);
  if (!k) { deselect(); return; }

  // recruit placement mode
  if (G.recruit) {
    if (G.recruit.spots.has(k)) {
      const err = recruitArmy(st, G.humanIdx, k, G.recruit.level);
      if (err) { Sfx.error(); UI.toast(err); return; }
      Sfx.build();
      ringPulse(worldOf(k), CFG.colors[st.empires[G.humanIdx].colorIdx].hex);
      refreshAll();
      tutEvent('recruited');
      deselect();
      return;
    }
    deselect();
    // fall through to normal selection of whatever was tapped
  }

  // army orders
  if (G.sel?.armyId) {
    const army = st.armies.get(G.sel.armyId);
    if (army && army.owner === G.humanIdx) {
      const opts = G.sel.opts;
      if (opts.moves.has(k)) { orderMove(army, k); return; }
      if (opts.attacks.has(k)) { orderAttack(army, k, opts.attacks.get(k)); return; }
      if (opts.merges.has(k)) { orderMerge(army, k, opts.merges.get(k)); return; }
    }
  }
  selectTile(k);
}

function selectTile(k) {
  const st = G.st;
  const t = st.tiles.get(k);
  const army = armyAt(st, t);
  deselect(true);
  Sfx.select();
  const H = panelHandlers(k);

  if (army) {
    if (army.owner === G.humanIdx && st.turn === G.humanIdx) {
      const opts = moveOptions(st, army);
      G.sel = { armyId: army.id, opts, k };
      setHighlights({
        sel: [k],
        move: [...opts.moves],
        attack: [...opts.attacks.keys()],
        merge: [...opts.merges.keys()],
      });
      UI.armyPanel(st, army, G.humanIdx, H);
    } else {
      G.sel = { k };
      setHighlights({ sel: [k] });
      UI.armyPanel(st, army, G.humanIdx, H);
    }
    return;
  }
  if (t.building) {
    G.sel = { k };
    setHighlights({ sel: [k] });
    const b = t.building;
    if (b.type === 'base') { UI.basePanel(st, k, G.humanIdx, H); tutEvent('select-base'); }
    else if (b.type === 'village') UI.villagePanel(st, k, G.humanIdx, H);
    else UI.towerPanel(st, k, G.humanIdx, H);
    return;
  }
  if (t.owner === G.humanIdx) {
    G.sel = { k };
    setHighlights({ sel: [k] });
    UI.buildPanel(st, k, G.humanIdx, H);
    return;
  }
  // neutral / enemy / contested land — info
  G.sel = { k };
  setHighlights({ sel: [k] });
  const ownerName = t.owner === -2 ? 'Contested — pays no one' :
    t.owner === -1 ? 'Unclaimed land' : st.empires[t.owner].name + "'s land";
  UI.infoPanel(ownerName,
    t.owner === -2 ? 'both borders touch this hex — break a rival tower or base to claim it' :
      t.owner === -1 ? 'build a tower nearby to claim it' : 'take it by razing what claims it',
    null, H.onClose);
}

function panelHandlers(k) {
  const st = G.st;
  const idx = G.humanIdx;
  return {
    onClose: () => deselect(),
    onBuild: (kk, type) => {
      const err = buildTower(st, idx, kk, type);
      if (err) { Sfx.error(); UI.toast(err); return; }
      Sfx.build();
      puff(worldOf(kk), 0xd8cfa8, 8, 0.4);
      refreshTrees(st);
      refreshAll();
      tutEvent('built-tower');
      deselect();
    },
    onVillage: (kk) => {
      const err = buildVillage(st, idx, kk);
      if (err) { Sfx.error(); UI.toast(err); return; }
      Sfx.build();
      puff(worldOf(kk), 0xd8cfa8, 8, 0.4);
      refreshTrees(st);
      refreshAll();
      tutEvent('built-village');
      deselect();
    },
    onUpgradeBase: (kk) => {
      const err = upgradeBase(st, idx, kk);
      if (err) { Sfx.error(); UI.toast(err); return; }
      Sfx.upgrade();
      ringPulse(worldOf(kk), 0xf0d68a);
      refreshAll();
      UI.basePanel(st, kk, idx, panelHandlers(kk));
    },
    onUpgradeTower: (kk) => {
      const err = upgradeTower(st, idx, kk);
      if (err) { Sfx.error(); UI.toast(err); return; }
      Sfx.upgrade();
      ringPulse(worldOf(kk), 0xf0d68a);
      refreshAll();
      UI.towerPanel(st, kk, idx, panelHandlers(kk));
    },
    onSell: (kk) => {
      UI.showModal({
        title: 'Sell this building?',
        body: `<p>You get half the coin back and the land may shrink.</p>`,
        buttons: [{
          label: 'Sell', danger: true, onTap: () => {
            const err = sellBuilding(st, idx, kk);
            if (err) { Sfx.error(); UI.toast(err); return; }
            Sfx.sell();
            refreshAll();
            deselect();
          },
        }, { label: 'Keep' }],
      });
    },
    onRecruitStart: (baseK) => startRecruit(baseK, 1),
    onLevel: (lvl) => startRecruit(G.recruit?.baseK ?? k, lvl),
  };
}

function startRecruit(baseK, level) {
  const st = G.st;
  const t = st.tiles.get(baseK);
  const spots = new Set();
  for (const [nq, nr] of disc(t.q, t.r, CFG.musterRadius)) {
    const nt = st.tiles.get(key(nq, nr));
    if (nt && nt.owner === G.humanIdx && !nt.building && !nt.armyId) spots.add(nt.k);
  }
  if (!spots.size) { Sfx.error(); UI.toast('No free hex near this base'); return; }
  G.recruit = { baseK, level, spots };
  G.sel = null;
  setHighlights({ sel: [baseK], build: [...spots] });
  UI.recruitPanel(st, G.humanIdx, level, panelHandlers(baseK));
}

async function orderMove(army, destK) {
  const st = G.st;
  const path = pathToTile(st, army, destK);
  if (!path) return;
  G.busy = true;
  clearHighlights();
  UI.hidePanel();
  applyMove(st, army, path);
  await animateMove(army.id, path);
  G.busy = false;
  tutEvent('army-moved');
  if (army.movesLeft > 0) reselectArmy(army);
  else { deselect(); UI.updateHud(st, G.humanIdx); }
}

async function orderAttack(army, targetK, info) {
  const st = G.st;
  G.busy = true;
  clearHighlights();
  UI.hidePanel();
  let path = null;
  if (info.via !== key(army.q, army.r)) {
    path = pathToTile(st, army, info.via);
    if (path) { applyMove(st, army, path); await animateMove(army.id, path); }
  }
  const ev = applyAttack(st, army, targetK);
  await animateStrike(army.id, targetK, ev);
  G.busy = false;
  tutEvent('attacked');
  if (checkGameEnd()) return;
  const alive = st.armies.get(army.id);
  if (alive && alive.movesLeft > 0) reselectArmy(alive);
  else deselect();
  UI.updateHud(st, G.humanIdx);
}

async function orderMerge(army, destK, m) {
  const st = G.st;
  G.busy = true;
  clearHighlights();
  UI.hidePanel();
  const stepPath = pathToTile(st, army, m.via)?.concat(destK) ?? [destK];
  const entry = armyMeshOf(army.id);
  if (entry) { entry.animating = true; await moveAlong(entry.mesh, stepPath.map(k2 => worldOf(k2)), 0.14); }
  const err = applyMerge(st, army, destK, m.cost);
  if (err) { Sfx.error(); UI.toast(err); }
  else { Sfx.merge(); puff(worldOf(destK, CFG.tileH + 0.3), 0xffffff, 8, 0.3); }
  G.busy = false;
  refreshAll();
  deselect();
}

function reselectArmy(army) {
  const st = G.st;
  const opts = moveOptions(st, army);
  const k = key(army.q, army.r);
  G.sel = { armyId: army.id, opts, k };
  setHighlights({
    sel: [k],
    move: [...opts.moves],
    attack: [...opts.attacks.keys()],
    merge: [...opts.merges.keys()],
  });
  UI.armyPanel(st, army, G.humanIdx, panelHandlers(k));
  UI.updateHud(st, G.humanIdx);
}

function deselect(quiet = false) {
  G.sel = null;
  G.recruit = null;
  clearHighlights();
  UI.hidePanel();
  if (!quiet && G.mode === 'game' && G.st) UI.updateHud(G.st, G.humanIdx);
}

// ---------- screenshot staging ----------

async function setupShot() {
  const rivals = rivalsDefault(3);
  const empires = [playerDef(), ...rivals.map(r => ({ ...r, isAI: true }))];
  const m = generateMap({ style: 'jagged', size: 'medium', players: 4, seed: 'shotseed7' });
  G.mode = 'game';
  G.st = makeState({ name: 'Shot', land: m.land, bases: m.bases }, empires, 'shot');
  recalcTerritory(G.st);
  // simulate a few silent rounds so the board looks lived-in
  const st = G.st;
  for (let round = 0; round < 7; round++) {
    for (let e = 0; e < st.empires.length; e++) {
      if (!st.empires[e].alive) continue;
      st.turn = e;
      recalcTerritory(st);
      resetMoves(st, e);
      collectIncome(st, e);
      aiBeginTurn(st, e);
      for (let s = 0; s < 40; s++) if (!aiStep(st, e)) break;
      fireArrows(st, e);
      checkWinner(st);
    }
    st.round++;
  }
  recalcTerritory(st);
  buildBoard(st);
  syncBuildings(st);
  syncArmies(st);
  fitCamera(1.0);
  UI.showHud(false);
  await new Promise(r => setTimeout(r, 600));
  window.__shotReady = true;
}
