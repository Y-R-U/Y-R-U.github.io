// The in-run HUD. Everything here is a read-only view of `state` plus a handful
// of bus events — the HUD never decides anything, it only reports.
//
// Two rules shape the whole file:
//
// 1. Nothing animates a layout property. This DOM sits over a live 3D scene, so
//    a width/left/top transition costs a layout+paint on every frame the GPU
//    wants for the crowd. Transforms and opacity only, with one exception: the
//    two progress fills, which are `transform: scaleX()` on a full-width bar
//    precisely so they are not width animations either.
//
// 2. Elements are created once in initHud() and then only ever shown, hidden
//    and re-textured. resetHud() is called between runs and must not churn the
//    DOM — a run start is the frame the player is least willing to lose.

import { TIERS, tierAt } from './config.js';
import { state } from './state.js';
import { on, emit } from './bus.js';
import { $, el, fmt, clamp, approach } from './utils.js';

// The tutorial copy. One idea each, phrased as an instruction and not as a
// paragraph — a card the player has to *read* is a card that gets ignored while
// the squad drives into a wall. `done` is the bus event that proves the player
// understood it, which is how a tutorial dismisses itself.
const TUTORIALS = {
  gates: { icon: '🚧', head: 'PICK A LANE', body: 'Drive through the gate you want. You only get one.', done: 'gate:pass' },
  grow:  { icon: '🎯', head: 'SHOOT THE SIGN', body: 'The number climbs while you hit it. Bank it by running it.', done: 'gate:grow' },
  promote: { icon: '▲', head: 'PROMOTE', body: 'A green gate trades men for better men. Fewer, stronger.', done: 'army:tier' },
  barrier: { icon: '🧱', head: 'WALLS HAVE HP', body: 'Shoot the number down. Body it while it stands and you lose men.', done: 'barrier:broken' },
  trap:  { icon: '⛔', head: 'RED IS A TRAP', body: 'Steer around it — or shoot it off the road before you arrive.', done: 'gate:break' },
  // The one gate whose sign will not tell you. Say the odds honestly — the
  // gamble is only interesting if the player knows it is one.
  gamble: { icon: '🎲', head: 'NOBODY KNOWS', body: 'A ? pays out at random. Usually well. Sometimes it takes half your men.', done: 'gate:pass' },
};

// Who is talking in a story bubble. The chip is a two-glyph portrait rather
// than art, because a downloaded face is a download and a drawn face at 34px is
// a smudge.
const SPEAKERS = {
  ME:     { chip: '🪖', name: 'ME',     cls: 'sp-me' },
  RADIO:  { chip: '📻', name: 'RADIO',  cls: 'sp-radio' },
  FAMILY: { chip: '🏠', name: 'HOME',   cls: 'sp-family' },
};

// `?huddemo` stages every transient at once — toast, bubble, promotion banner,
// boss bar, delta ticker. None of them can be reached from a URL otherwise, and
// a HUD element that is only ever seen for 1.5s mid-firefight is a HUD element
// nobody ever checks the layout of.
const HUD_DEMO = new URLSearchParams(location.search).has('huddemo');

let R = null;              // cached element refs, resolved once
let inited = false;
let level = null;

// Counter easing. `shown` chases `state.troops` so a +240 gate rolls up instead
// of snapping — the roll is the reward, and it costs one lerp a frame.
let shownCount = 0;
let deltaAcc = 0, deltaT = 0;

let flash = 0;             // damage vignette, seconds remaining
let bannerT = 0;
let toastT = 0;
const toastQ = [];
let bossT = 0;             // seconds since the last boss:hp, hides a stale bar
let dragHintT = 0;
let tut = null;            // { key, t, offDone } while a tutorial card is up
let paused = false;
let lastShield = -1;
const bubbles = [];        // { node, t }

export function initHud() {
  if (inited) return;
  inited = true;

  R = {
    root: $('#hud'),
    chip: $('.troop-chip'),
    icon: $('#tc-icon'),
    count: $('#tc-count'),
    delta: $('#tc-delta'),
    shield: $('#tc-shield'),
    shieldN: $('#tc-shield b'),
    fill: $('#prog-fill'),
    flag: $('#prog-flag'),
    label: $('#prog-label'),
    cash: $('#run-cash'),
    pause: $('#btn-pause'),
    boss: $('#boss-bar'),
    bossName: $('#boss-name'),
    bossFill: $('#boss-fill'),
    bossHp: $('#boss-hp'),
    banner: $('#tier-banner'),
    bannerText: $('#tier-banner span'),
    toast: $('#run-toast'),
    bubbles: $('#bubble-layer'),
    tut: $('#tut-layer'),
    dmg: $('#dmg-flash'),
    hint: $('#drag-hint'),
  };

  // Pause. There is no pauseRun() in game.js, so we flip `state.running`
  // ourselves: updateGame() already reads it as "should the world advance", and
  // every system keeps updating and rendering underneath. See the MANAGER note
  // in menus.js — this wants to be a real API.
  R.pause?.addEventListener('click', () => setPaused(true));
  on('ui:resume', () => setPaused(false));

  on('army:count', onCount);
  on('army:tier', onTier);
  on('boss:hp', onBoss);
  on('hud:toast', (o) => { toastQ.push(o); if (toastT <= 0) nextToast(); });
  on('story:bubble', onBubble);
  on('run:end', () => { setPaused(false); hideTut(); });

  // The drag hint dies the moment the player drags, which is the only proof
  // that reads as "understood". Listening on the stage rather than importing
  // input.js keeps this a one-way dependency on a frozen module.
  $('#stage')?.addEventListener('pointerdown', () => { dragHintT = 0; R.hint.classList.add('hidden'); }, { passive: true });
}

export function resetHud(lv) {
  if (!inited) initHud();
  level = lv || null;
  shownCount = state.troops;
  deltaAcc = 0; deltaT = 0;
  flash = 0; bannerT = 0; toastT = 0; toastQ.length = 0;
  bossT = 0; paused = false;

  R.count.textContent = fmt(state.troops);
  R.icon.textContent = tierAt(state.tier).icon;
  R.delta.textContent = '';
  R.delta.className = '';
  R.cash.textContent = '0';
  R.fill.style.transform = 'scaleX(0)';
  // Missions and events carry `chapter: 0` so they cannot mark a story level
  // cleared, which also means "CH.0" would be a lie on the label — they get
  // their own name instead.
  R.label.textContent = lv?.chapter
    ? `CH.${lv.chapter} · ${lv.name || 'LEVEL ' + (lv.level ?? 1)}`
    : (lv?.name || 'CONTRACT');
  R.boss.classList.add('hidden');
  R.banner.classList.add('hidden');
  R.toast.classList.remove('on');
  R.dmg.style.opacity = '0';
  clearBubbles();

  // "Drag to move" belongs on the first level of the first chapter and nowhere
  // else. Anywhere later it is noise over a player who already knows.
  const first = (lv?.chapter ?? 1) === 1 && (lv?.level ?? 1) === 1;
  dragHintT = first ? 6 : 0;
  R.hint.classList.toggle('hidden', !first);

  showTut(lv?.tutorial);
  if (HUD_DEMO) demo();
}

function demo() {
  onCount({ count: state.troops, delta: 47, reason: 'gate' });
  // The ticker is a one-second animation, and a headless shot lands somewhere
  // unpredictable after boot. Re-fire it on wall-clock timers so whenever the
  // screenshot happens, one of them is mid-flight.
  for (const ms of [400, 900, 1400]) setTimeout(() => onCount({ count: state.troops, delta: 47, reason: 'gate' }), ms);
  onTier({ tier: 3, prev: 2 });
  onBoss({ frac: 0.62 });
  state.bossHp = 2480; state.bossMax = 4000;
  R.bossName.textContent = 'THE COLONEL';
  R.bossHp.textContent = fmt(2480);
  toastQ.push({ icon: '💰', text: 'CACHE FOUND  +$240' });
  nextToast();
  onBubble({ who: 'RADIO', text: 'Armour on the bridge. Do not stop moving.', ms: 20000 });
  onBubble({ who: 'FAMILY', text: 'We saw the convoy on the news. Come home.', ms: 20000 });
}

export function showHud(onOff) {
  if (!inited) initHud();
  R.root.classList.toggle('hidden', !onOff);
  if (!onOff) { clearBubbles(); hideTut(); }
}

// --------------------------------------------------------------------------
// The frame. game.js calls this only for real runs — the main screen's autoplay
// backdrop deliberately has no HUD over it.
// --------------------------------------------------------------------------
export function updateHud(dt) {
  // The shield pip only exists while there is a shield. BODY ARMOUR used to be
  // a percentage nobody could see working; a number that visibly drains as
  // walls and bullets eat it is the entire point of the change.
  if (R.shield) {
    const sh = Math.round(state.shield || 0);
    if (sh !== lastShield) {
      lastShield = sh;
      R.shield.classList.toggle('hidden', sh <= 0);
      if (R.shieldN) R.shieldN.textContent = sh;
      if (sh > 0) { R.shield.classList.remove('pulse'); void R.shield.offsetWidth; R.shield.classList.add('pulse'); }
    }
  }
  if (!inited || R.root.classList.contains('hidden')) return;

  // Counter. Snap the last unit so the number never sits on 199 of 200.
  const target = Math.max(0, state.troops);
  shownCount = approach(shownCount, target, 0.9985, dt);
  if (Math.abs(shownCount - target) < 0.6) shownCount = target;
  R.count.textContent = fmt(shownCount);

  // Delta ticker. Consecutive hits inside a window accumulate, so walking a
  // +1 gate reads as one climbing +14 rather than fourteen flickers.
  if (deltaT > 0) {
    deltaT -= dt;
    if (deltaT <= 0) { R.delta.textContent = ''; R.delta.className = ''; deltaAcc = 0; }
  }

  const len = level?.length || 600;
  const p = clamp(state.z / len, 0, 1);
  R.fill.style.transform = `scaleX(${p.toFixed(4)})`;
  R.flag.style.transform = `translateX(-50%) scale(${p > 0.97 ? 1.25 : 1})`;
  R.cash.textContent = fmt(state.cash);
  R.icon.textContent = tierAt(state.tier).icon;

  if (bannerT > 0 && (bannerT -= dt) <= 0) R.banner.classList.add('hidden');
  if (toastT > 0 && (toastT -= dt) <= 0) { R.toast.classList.remove('on'); nextToast(); }

  if (flash > 0) {
    flash -= dt;
    R.dmg.style.opacity = String(clamp(flash / 0.34, 0, 1) * 0.85);
    if (flash <= 0) R.dmg.style.opacity = '0';
  }

  // A boss bar with no boss behind it is a lie. If boss:hp stops arriving for
  // a second the fight is over, whoever forgot to say so.
  if (!R.boss.classList.contains('hidden')) {
    bossT += dt;
    if (bossT > 1.2 || state.bossHp <= 0) R.boss.classList.add('hidden');
  }

  if (dragHintT > 0 && (dragHintT -= dt) <= 0) R.hint.classList.add('hidden');

  if (tut) {
    tut.t -= dt;
    // Fallback dismissal: a card the player never "completed" still has to go,
    // or a mistimed tutorial parks itself over the whole level.
    if (tut.t <= 0) hideTut();
  }

  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.t -= dt;
    if (b.t <= 0) { b.node.classList.add('out'); bubbles.splice(i, 1); setTimeout(() => b.node.remove(), 260); }
  }
}

// --------------------------------------------------------------------------
// Bus handlers
// --------------------------------------------------------------------------

function onCount({ count, delta, reason }) {
  if (!delta) return;
  // A promotion is not a loss even though it removes men, so it must not flash
  // the screen red — it has its own banner.
  const bad = delta < 0 && reason !== 'promote';

  // Reset the accumulator when the sign flips, otherwise a +40 gate immediately
  // followed by -6 of enemy fire reads as "+34" and hides the damage.
  if (deltaT <= 0 || Math.sign(deltaAcc) !== Math.sign(delta)) deltaAcc = 0;
  deltaAcc += delta;
  deltaT = 0.95;
  R.delta.textContent = (deltaAcc > 0 ? '+' : '') + fmt(deltaAcc);
  R.delta.className = deltaAcc > 0 ? 'up' : 'down';
  restart(R.delta, 'pop');
  restart(R.chip, bad ? 'shake' : 'punch');

  if (bad) flash = 0.34;
}

function onTier({ tier, prev }) {
  const t = TIERS[clamp(tier, 0, TIERS.length - 1)];
  R.bannerText.textContent = `${t.icon} ${t.name}`;
  R.banner.classList.remove('hidden');
  restart(R.banner, 'banner-in');
  bannerT = 1.9;
  R.icon.textContent = t.icon;
  if (tut?.key === 'promote') hideTut();
}

function onBoss({ frac }) {
  const f = clamp(frac ?? 0, 0, 1);
  if (f <= 0 && R.boss.classList.contains('hidden')) return;
  const boss = level?.items?.find((i) => i.kind === 'boss');
  R.bossName.textContent = boss?.name || 'HOSTILE ARMOUR';
  R.bossFill.style.transform = `scaleX(${f.toFixed(4)})`;
  R.bossHp.textContent = fmt(state.bossHp || Math.round(f * (state.bossMax || 0)));
  R.boss.classList.toggle('danger', f < 0.25);
  R.boss.classList.remove('hidden');
  bossT = 0;
  if (f <= 0) setTimeout(() => R.boss.classList.add('hidden'), 400);
}

function onBubble({ who, text, ms }) {
  const sp = SPEAKERS[who] || SPEAKERS.ME;
  const n = el('div', `bubble ${sp.cls}`);
  n.innerHTML = `<span class="bub-chip">${sp.chip}</span><div class="bub-body"><b>${sp.name}</b><p></p></div>`;
  n.querySelector('p').textContent = text || '';
  R.bubbles.appendChild(n);
  // Three on screen at once is already a wall of text over a moving game.
  while (R.bubbles.children.length > 3) R.bubbles.firstChild.remove();
  bubbles.push({ node: n, t: Math.max(1.2, (ms || 2600) / 1000) });
}

function nextToast() {
  const t = toastQ.shift();
  if (!t) return;
  R.toast.innerHTML = '';
  if (t.icon) R.toast.appendChild(el('span', 'toast-icon', t.icon));
  R.toast.appendChild(el('b', null, '')).textContent = t.text || '';
  R.toast.classList.add('on');
  toastT = 1.5;
}

// --------------------------------------------------------------------------
// Tutorials
// --------------------------------------------------------------------------

function showTut(key) {
  hideTut();
  const def = TUTORIALS[key];
  if (!def) return;
  const card = el('div', 'tut-card');
  card.innerHTML = `<span class="tut-icon">${def.icon}</span><b></b><p></p>`;
  card.querySelector('b').textContent = def.head;
  card.querySelector('p').textContent = def.body;
  R.tut.appendChild(card);
  // Dismissed by *playing*: the first time the bus proves the lesson landed.
  const offDone = on(def.done, () => hideTut());
  tut = { key, node: card, t: 9, offDone };
}

function hideTut() {
  if (!tut) return;
  tut.offDone?.();
  const n = tut.node;
  n.classList.add('out');
  setTimeout(() => n.remove(), 240);
  tut = null;
}

function clearBubbles() {
  bubbles.length = 0;
  if (R?.bubbles) R.bubbles.innerHTML = '';
}

// --------------------------------------------------------------------------
// Pause
// --------------------------------------------------------------------------

function setPaused(on_) {
  if (paused === on_) return;
  paused = on_;
  state.running = !on_ && state.result === null;
  R.root.classList.toggle('paused', on_);
  if (on_) emit('ui:pause', {});
}

// Restarting a CSS animation needs the class off, a forced reflow, then on —
// otherwise a second +1 inside the animation's duration does nothing visible,
// which is exactly the case that has to punch.
function restart(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}
