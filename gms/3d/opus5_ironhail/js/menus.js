// Every screen outside a battle: title, campaign map, mission brief, Tank
// Attack contracts, the garage (hulls / guns / utilities / upgrades / camo),
// the world ladder, results, settings and pause. All rendered into #menu.

import {
  $, el, clamp01, fmtTime, fmtBig, fmtRank, sanitizeName, mulberry32, hashStr,
} from './utils.js';
import {
  CHASSIS, WEAPONS, UTILITIES, UPGRADES, MODULES, CAMOS, MAX_UP_LEVEL, MAX_WEAPON_LEVEL, upgradeCost, weaponLevelCost, derivedStats, bpForRank, tierFor, nextTier, TIERS, LADDER_SIZE, weaponStats,
} from './arsenal.js';
import {
  profile, saveProfile, spend, canAfford, acquire, owns, hasModule, fireControlFitted, worldRank, commanderLevel, totalStars, missionRecord, markDirty, resetProfile, dailyAvailable, todayKey,
} from './save.js';
import {
  MISSIONS, ACTS, missionsOfAct, missionUnlocked, SKIRMISH_TIERS, suggestedTier,
} from './missions.js';
import { LADDER_TAGS, ENEMY_NAMES, IS_TOUCH } from './config.js';
import { AudioFX } from './audio.js';
import { state } from './state.js';


let handlers = {};
let currentTab = 'upgrades';

export function initMenus(h) {
  handlers = h;
  $('menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    AudioFX.click();
    route(b.dataset.act, b.dataset.arg);
  });
}

function route(action, arg) {
  switch (action) {
    case 'title': showTitle(); break;
    case 'campaign': showCampaign(); break;
    case 'attack': showAttack(); break;
    case 'garage': showGarage(); break;
    case 'ladder': showLadder(); break;
    case 'settings': showSettings('title'); break;
    case 'settings-pause': showSettings('pause'); break;
    case 'settings-return': showSettings(); break;   // keeps the back target
    case 'resume-settings': showPause(); break;
    case 'brief': showBrief(arg); break;
    case 'deploy': handlers.onDeployMission(arg); break;
    case 'deploy-cine': handlers.onDeployMission(arg, true); break;
    case 'deploy-skirmish': handlers.onDeploySkirmish(parseInt(arg, 10), false); break;
    case 'deploy-daily': handlers.onDeploySkirmish(0, true); break;
    case 'tab': currentTab = arg; showGarage(); break;
    case 'equip': doEquip(arg); break;
    case 'buy': doBuy(arg); break;
    case 'buy-module': doBuyModule(arg); break;
    case 'upgrade': doUpgrade(arg); break;
    case 'gunlevel': doGunLevel(arg); break;
    case 'rename': openRename(); break;
    case 'resume': handlers.onResume(); break;
    case 'restart': handlers.onRestart(); break;
    case 'abort': handlers.onAbort(); break;
    case 'next': handlers.onNextMission(); break;
    case 'again': handlers.onRestart(); break;
    case 'mute': toggleMute(); break;
    case 'quality': toggleQuality(); break;
    case 'aimside': setSetting('aimSide', arg); break;
    case 'padside': setSetting('padSide', arg); break;
    case 'inverty': setSetting('invertY', !profile.settings.invertY); break;
    case 'haptics': setSetting('haptics', profile.settings.haptics === false); break;
    case 'autoaim': setSetting('autoAim', profile.settings.autoAim === false); break;
    case 'camauto': setSetting('camAuto', profile.settings.camAuto === false); break;
    case 'cutscenes': setSetting('cutscenes', profile.settings.cutscenes === false); break;
    case 'highlights': setSetting('highlights', profile.settings.highlights === false); break;
    case 'reel': handlers.onReplayHighlights(); break;
    case 'wipe': confirmWipe(); break;
    case 'wipe-yes': resetProfile(); showTitle(); break;
    case 'reload': location.reload(); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

export function showMenu(on) {
  $('menu').classList.toggle('hidden', !on);
}

function frame(cls = '') {
  const m = $('menu');
  m.textContent = '';
  m.className = 'screen ' + cls;
  const wrap = el('div', 'sheet');
  m.appendChild(wrap);
  return wrap;
}

function statusBar(wrap) {
  const lvl = commanderLevel();
  const rank = worldRank();
  const tier = tierFor(rank);
  const bar = el('div', 'statusbar');

  const left = el('div', 'sb-left');
  const nm = el('button', 'sb-name');
  nm.dataset.act = 'rename';
  nm.textContent = profile.name;
  left.appendChild(nm);
  left.appendChild(el('span', 'sb-lvl', 'CMDR ' + lvl.level));
  const xpBar = el('div', 'sb-xp');
  const xpFill = el('i');
  xpFill.style.width = (lvl.need ? clamp01(lvl.into / lvl.need) * 100 : 100) + '%';
  xpBar.appendChild(xpFill);
  left.appendChild(xpBar);
  bar.appendChild(left);

  const right = el('div', 'sb-right');
  const rk = el('span', 'sb-rank', fmtRank(rank));
  rk.style.color = tier.colour;
  right.appendChild(rk);
  const tr = el('span', 'sb-tier', tier.name);
  tr.style.color = tier.colour;
  right.appendChild(tr);
  right.appendChild(el('span', 'sb-scrap', '⬢ ' + fmtBig(profile.scrap)));
  bar.appendChild(right);

  wrap.appendChild(bar);
  return bar;
}

function backRow(wrap, to = 'title', label = '‹ BACK') {
  const b = el('button', 'btn-back', label);
  b.dataset.act = to;
  wrap.appendChild(b);
}

function bigButton(label, action, arg, cls = 'btn-primary', sub = null) {
  const b = el('button', cls);
  b.dataset.act = action;
  if (arg != null) b.dataset.arg = arg;
  b.appendChild(el('span', null, label));
  if (sub) b.appendChild(el('small', null, sub));
  return b;
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

export function showTitle() {
  state.screen = 'title';
  const w = frame('title-screen');
  statusBar(w);

  const hero = el('div', 'hero');
  hero.appendChild(el('div', 'kicker', 'OPUS 5 PRESENTS'));
  const t = el('h1', 'logo');
  t.innerHTML = 'IRON<span>HAIL</span>';
  hero.appendChild(t);
  hero.appendChild(el('p', 'tagline',
    'Drone-spotted tank warfare. Your gun reloads on a timer — everything else is up to you.'));
  w.appendChild(hero);

  const stars = totalStars();
  const menu = el('div', 'menu-col');
  menu.appendChild(bigButton('STORY', 'campaign', null, 'btn-primary',
    stars + ' / ' + (MISSIONS.length * 3) + ' STARS'));
  menu.appendChild(bigButton('TANK ATTACK', 'attack', null, 'btn-secondary',
    'RANKED CONTRACTS · WORLD LADDER'));
  menu.appendChild(bigButton('GARAGE', 'garage', null, 'btn-secondary',
    profile.scrap > 0 ? '⬢ ' + fmtBig(profile.scrap) + ' TO SPEND' : 'HULL · GUN · UPGRADES'));
  const row = el('div', 'menu-row');
  row.appendChild(bigButton('LADDER', 'ladder', null, 'btn-mini'));
  row.appendChild(bigButton('SETTINGS', 'settings', null, 'btn-mini'));
  menu.appendChild(row);
  w.appendChild(menu);

  w.appendChild(el('div', 'footnote',
    'Move: WASD or left thumb · Aim: mouse or right thumb · Fire: click / SPACE / FIRE · ' +
    'Drone: Q · Scope: TAB · Utility: E'));
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export function showCampaign() {
  state.screen = 'campaign';
  const w = frame('list-screen');
  statusBar(w);
  backRow(w, 'title');
  w.appendChild(el('h2', 'screen-title', 'STORY'));
  w.appendChild(el('p', 'screen-sub',
    'Nine weeks into the water war, working contracts for Anvil Control.'));

  const scroll = el('div', 'scroll');
  for (const act of ACTS) {
    const ms = missionsOfAct(act.id);
    const unlockedAct = ms.some((m) => missionUnlocked(m, profile.campaign));
    const head = el('div', 'act-head' + (unlockedAct ? '' : ' locked'));
    head.appendChild(el('b', null, 'ACT ' + act.id + ' · ' + act.name));
    head.appendChild(el('span', null, act.blurb));
    scroll.appendChild(head);

    for (const m of ms) {
      const rec = missionRecord(m.id);
      const open = missionUnlocked(m, profile.campaign);
      const card = el('button', 'mcard' + (open ? '' : ' locked') + (rec.done ? ' done' : ''));
      if (open) { card.dataset.act = 'brief'; card.dataset.arg = m.id; }
      const l = el('div', 'mcard-l');
      l.appendChild(el('b', null, m.name));
      l.appendChild(el('small', null, open
        ? objectiveSummary(m) + ' · ' + m.time.toUpperCase()
        : 'LOCKED'));
      card.appendChild(l);
      const r = el('div', 'mcard-r');
      const st = el('div', 'stars');
      for (let i = 0; i < 3; i++) {
        st.appendChild(el('span', 'star' + (i < rec.stars ? ' on' : ''), '★'));
      }
      r.appendChild(st);
      if (m.finale) r.appendChild(el('small', 'finale', 'FINALE'));
      card.appendChild(r);
      scroll.appendChild(card);
    }
  }
  w.appendChild(scroll);
}

function objectiveSummary(m) {
  const o = m.objective;
  switch (o.kind) {
    case 'destroy_all': return 'ELIMINATE';
    case 'destroy_count': return 'ELIMINATE ' + o.goal;
    case 'survive': return 'SURVIVE ' + o.goal + 's';
    case 'demolish': return 'DEMOLITION';
    case 'hold': return 'HOLD ZONE';
    case 'escort': return 'ESCORT';
    case 'recon': return 'RECON';
    case 'boss': return 'BOSS';
    default: return 'ENGAGE';
  }
}

export function showBrief(id) {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return showCampaign();
  state.screen = 'brief';
  const w = frame('brief-screen');
  backRow(w, 'campaign');
  const rec = missionRecord(m.id);

  w.appendChild(el('div', 'kicker', 'ACT ' + m.act + ' · ' + ACTS[m.act - 1].name));
  w.appendChild(el('h2', 'screen-title', m.name));

  const chips = el('div', 'chip-row');
  chips.appendChild(el('span', 'chip', m.time.toUpperCase()));
  chips.appendChild(el('span', 'chip', (m.biome || '').toUpperCase()));
  chips.appendChild(el('span', 'chip', objectiveSummary(m)));
  chips.appendChild(el('span', 'chip', 'PAR ' + fmtTime(m.par)));
  chips.appendChild(el('span', 'chip gold', '+' + m.bpBase + ' BP'));
  w.appendChild(chips);

  w.appendChild(el('p', 'brief-text', m.brief));

  const grid = el('div', 'brief-grid');
  grid.appendChild(infoBlock('HOSTILES', enemySummary(m)));
  grid.appendChild(infoBlock('OBJECTIVE', objectiveDetail(m)));
  if (m.intel) grid.appendChild(infoBlock('INTEL', m.intel));
  if (m.unlock) grid.appendChild(infoBlock('ON COMPLETION', 'UNLOCKS ' + unlockName(m.unlock)));
  grid.appendChild(infoBlock('FIRE CONTROL', fireControlBrief(m)));
  w.appendChild(grid);

  const st = el('div', 'stars big');
  for (let i = 0; i < 3; i++) st.appendChild(el('span', 'star' + (i < rec.stars ? ' on' : ''), '★'));
  w.appendChild(st);
  w.appendChild(el('small', 'star-hint',
    '★ complete · ★★ inside par time · ★★★ par time with half your hull left'));

  const row = el('div', 'menu-row');
  row.appendChild(bigButton('DEPLOY', 'deploy', m.id, 'btn-primary'));
  row.appendChild(bigButton('GARAGE', 'garage', null, 'btn-secondary'));
  if (m.cine && profile.settings.cutscenes !== false) {
    row.appendChild(bigButton('▶ REPLAY STORY', 'deploy-cine', m.id, 'btn-mini'));
  }
  w.appendChild(row);
}

// The one line that tells a commander whether the gun lays itself this trip.
function fireControlBrief(m) {
  const fc = fireControlFitted(m);
  const off = profile.settings.autoAim === false;
  if (fc.owned) return off ? 'INSTALLED — switched off in Settings.' : 'INSTALLED — the computer lays the gun.';
  if (fc.trial) {
    return off
      ? 'LOANER FITTED for act one, but switched off in Settings.'
      : 'LOANER FITTED for act one. It lays the gun, leads the target and reads the wind for you.';
  }
  return 'NOT FITTED. Every shot is yours to judge — or buy the computer in the garage.';
}

function infoBlock(title, body) {
  const b = el('div', 'iblock');
  b.appendChild(el('b', null, title));
  b.appendChild(el('span', null, body));
  return b;
}

function enemySummary(m) {
  const parts = [];
  for (const e of m.enemies || []) {
    parts.push((e.count > 1 ? e.count + '× ' : '') +
      (CHASSIS[e.chassis] ? CHASSIS[e.chassis].name : e.chassis) +
      ' (' + (WEAPONS[e.weapon] ? WEAPONS[e.weapon].short : e.weapon) + ')');
  }
  if (m.boss) parts.unshift(m.boss.name + ' — COMMAND HULL');
  return parts.join(', ');
}

function objectiveDetail(m) {
  const o = m.objective;
  switch (o.kind) {
    case 'destroy_all': return 'Destroy every hostile hull on the field.';
    case 'destroy_count': return 'Destroy ' + o.goal + ' hulls. They arrive in ' + (o.waves || 1) + ' waves.';
    case 'survive': return 'Stay alive for ' + o.goal + ' seconds. Reinforcements keep coming.';
    case 'demolish': return 'Destroy ' + o.goal + ' ' + (o.label || 'structures') + '.';
    case 'hold': return 'Hold the marked circle for ' + o.goal + ' seconds. The clock stops if you leave.';
    case 'escort': return 'Keep the hauler alive until it reaches the far marker.';
    case 'recon': return 'Paint ' + o.goal + ' contacts with the drone. Marks count once each.';
    case 'boss': return 'Destroy the command hull and its guard.';
    default: return 'Engage.';
  }
}

function unlockName(u) {
  const maps = { weapons: WEAPONS, chassis: CHASSIS, utilities: UTILITIES, camos: CAMOS };
  const m = maps[u.kind];
  return m && m[u.id] ? m[u.id].name : u.id;
}

// ---------------------------------------------------------------------------
// Tank Attack
// ---------------------------------------------------------------------------

export function showAttack() {
  state.screen = 'attack';
  const w = frame('list-screen');
  statusBar(w);
  backRow(w, 'title');
  w.appendChild(el('h2', 'screen-title', 'TANK ATTACK'));
  w.appendChild(el('p', 'screen-sub',
    'One-off contracts on a random front. Win to climb the world ladder, lose and it costs you.'));

  const rank = worldRank();
  const tier = tierFor(rank);
  const nt = nextTier(rank);
  const band = el('div', 'ladder-band');
  band.appendChild(el('b', null, fmtRank(rank)));
  const tname = el('span', 'tier', tier.name);
  tname.style.color = tier.colour;
  band.appendChild(tname);
  if (nt) {
    band.appendChild(el('small', null,
      'NEXT: ' + nt.name + ' at ' + fmtRank(nt.max) + ' · ' +
      fmtBig(Math.max(0, bpForRank(nt.max) - profile.bp)) + ' BP TO GO'));
  } else {
    band.appendChild(el('small', null, 'TOP OF THE WORLD'));
  }
  w.appendChild(band);

  const scroll = el('div', 'scroll');

  if (dailyAvailable()) {
    const card = el('button', 'mcard daily');
    card.dataset.act = 'deploy-daily';
    const l = el('div', 'mcard-l');
    l.appendChild(el('b', null, 'DAILY CONTRACT'));
    l.appendChild(el('small', null, 'Double battle points · resets ' + todayKey()));
    card.appendChild(l);
    card.appendChild(el('div', 'mcard-r', '2×'));
    scroll.appendChild(card);
  }

  const lvl = commanderLevel().level;
  const suggested = suggestedTier(lvl);
  for (const t of SKIRMISH_TIERS) {
    const locked = t.id > suggested + 1;
    const card = el('button', 'mcard' + (locked ? ' locked' : ''));
    if (!locked) { card.dataset.act = 'deploy-skirmish'; card.dataset.arg = String(t.id); }
    const l = el('div', 'mcard-l');
    l.appendChild(el('b', null, t.name));
    l.appendChild(el('small', null, locked
      ? 'REACH CMDR ' + ((t.id - 1) * 3 + 1)
      : t.count + ' HOSTILES · SKILL ' + Math.round(t.skill * 100) + '%'));
    card.appendChild(l);
    const r = el('div', 'mcard-r');
    r.appendChild(el('span', 'bp', '+' + t.bp + ' BP'));
    r.appendChild(el('small', null, '⬢ ' + t.scrap));
    if (t.id === suggested) r.appendChild(el('small', 'rec', 'RECOMMENDED'));
    card.appendChild(r);
    scroll.appendChild(card);
  }
  w.appendChild(scroll);
}

// ---------------------------------------------------------------------------
// Garage
// ---------------------------------------------------------------------------

export function showGarage() {
  state.screen = 'garage';
  const w = frame('garage-screen');
  statusBar(w);
  backRow(w, 'title');
  w.appendChild(el('h2', 'screen-title', 'GARAGE'));

  const s = derivedStats(profile);
  const sum = el('div', 'stat-strip');
  addStat(sum, 'HULL', Math.round(s.hpMax));
  addStat(sum, 'SPEED', s.speed.toFixed(1));
  addStat(sum, 'TRAVERSE', s.traverse.toFixed(2) + ' r/s');
  addStat(sum, 'DAMAGE', Math.round(s.weapon.dmg));
  addStat(sum, 'RELOAD', s.weapon.reload.toFixed(2) + 's');
  addStat(sum, 'SPLASH', s.weapon.splashR.toFixed(1) + 'm');
  addStat(sum, 'UPLINK', Math.round(60 * s.droneMul) + 'm');
  addStat(sum, 'REPAIR', s.regen.toFixed(1) + '/s');
  w.appendChild(sum);

  const tabs = el('div', 'tabs');
  for (const [id, label] of [['upgrades', 'UPGRADES'], ['guns', 'GUNS'],
    ['hulls', 'HULLS'], ['utility', 'UTILITY'], ['camo', 'CAMO']]) {
    const b = el('button', 'tab' + (currentTab === id ? ' on' : ''), label);
    b.dataset.act = 'tab';
    b.dataset.arg = id;
    tabs.appendChild(b);
  }
  w.appendChild(tabs);

  const scroll = el('div', 'scroll');
  if (currentTab === 'upgrades') renderUpgrades(scroll);
  else if (currentTab === 'guns') renderGuns(scroll);
  else if (currentTab === 'hulls') renderHulls(scroll);
  else if (currentTab === 'utility') renderUtilities(scroll);
  else renderCamo(scroll);
  w.appendChild(scroll);
}

function addStat(cont, label, value) {
  const s = el('div', 'stat');
  s.appendChild(el('b', null, String(value)));
  s.appendChild(el('small', null, label));
  cont.appendChild(s);
}

function renderUpgrades(scroll) {
  const lvl = commanderLevel().level;
  renderModules(scroll, lvl);
  scroll.appendChild(el('div', 'section-head', 'UPGRADE TRACKS'));
  for (const key of Object.keys(UPGRADES)) {
    const u = UPGRADES[key];
    const level = profile.upgrades[key] || 0;
    const maxed = level >= MAX_UP_LEVEL;
    const cost = maxed ? 0 : upgradeCost(key, level);
    const row = el('div', 'item');
    const l = el('div', 'item-l');
    l.appendChild(el('b', null, u.icon + '  ' + u.name));
    l.appendChild(el('small', null, u.perLevel));
    const pips = el('div', 'pips');
    for (let i = 0; i < MAX_UP_LEVEL; i++) {
      pips.appendChild(el('i', i < level ? 'on' : ''));
    }
    l.appendChild(pips);
    row.appendChild(l);

    const r = el('div', 'item-r');
    if (maxed) {
      r.appendChild(el('span', 'maxed', 'MAX'));
    } else {
      const b = el('button', 'buy' + (canAfford(cost) ? '' : ' poor'));
      b.dataset.act = 'upgrade';
      b.dataset.arg = key;
      b.appendChild(el('span', null, '⬢ ' + fmtBig(cost)));
      b.appendChild(el('small', null, 'LVL ' + (level + 1)));
      r.appendChild(b);
    }
    row.appendChild(r);
    scroll.appendChild(row);
  }
}

// One-off systems. No levels: you have it bolted on or you do not.
function renderModules(scroll, lvl) {
  scroll.appendChild(el('div', 'section-head', 'MODULES · bought once, fitted for good'));
  for (const key of Object.keys(MODULES)) {
    const mo = MODULES[key];
    const has = hasModule(key);
    const locked = !has && lvl < mo.unlockLevel;
    const row = el('div', 'item' + (has ? ' equipped' : ''));

    const l = el('div', 'item-l');
    l.appendChild(el('b', null, mo.icon + '  ' + mo.name));
    l.appendChild(el('small', null, mo.blurb));
    if (mo.note) l.appendChild(el('small', 'nums', mo.note));
    row.appendChild(l);

    const r = el('div', 'item-r');
    if (has) {
      r.appendChild(el('span', 'equipped-tag', 'INSTALLED'));
    } else if (locked) {
      r.appendChild(el('span', 'locked-tag', 'CMDR ' + mo.unlockLevel));
    } else {
      const b = el('button', 'buy' + (canAfford(mo.cost) ? '' : ' poor'));
      b.dataset.act = 'buy-module';
      b.dataset.arg = key;
      b.appendChild(el('span', null, '⬢ ' + fmtBig(mo.cost)));
      r.appendChild(b);
    }
    row.appendChild(r);
    scroll.appendChild(row);
  }
}

function renderGuns(scroll) {
  const lvl = commanderLevel().level;
  for (const id of Object.keys(WEAPONS)) {
    const wp = WEAPONS[id];
    const has = owns('weapons', id);
    const equipped = profile.weapon === id;
    const gunLevel = profile.weaponLevels[id] || 0;
    const locked = !has && lvl < wp.unlockLevel;
    const row = el('div', 'item' + (equipped ? ' equipped' : ''));

    const l = el('div', 'item-l');
    l.appendChild(el('b', null, wp.name));
    l.appendChild(el('small', null, wp.blurb));
    const st = weaponStats(id, gunLevel);
    l.appendChild(el('small', 'nums',
      `DMG ${Math.round(st.dmg)}${wp.shells > 1 ? '×' + wp.shells : ''} · ` +
      `BLAST ${st.splashR.toFixed(1)}m · RELOAD ${st.reload.toFixed(2)}s · ` +
      `MV ${wp.speed} · ${wp.arc === 'high' ? 'HIGH ARC' : 'FLAT'}`));
    if (has) {
      const pips = el('div', 'pips');
      for (let i = 0; i < MAX_WEAPON_LEVEL; i++) pips.appendChild(el('i', i < gunLevel ? 'on' : ''));
      l.appendChild(pips);
    }
    row.appendChild(l);

    const r = el('div', 'item-r');
    if (locked) {
      r.appendChild(el('span', 'locked-tag', 'CMDR ' + wp.unlockLevel));
    } else if (!has) {
      const b = el('button', 'buy' + (canAfford(wp.cost) ? '' : ' poor'));
      b.dataset.act = 'buy';
      b.dataset.arg = 'weapons:' + id;
      b.appendChild(el('span', null, '⬢ ' + fmtBig(wp.cost)));
      r.appendChild(b);
    } else {
      if (!equipped) {
        const b = el('button', 'equip');
        b.dataset.act = 'equip';
        b.dataset.arg = 'weapon:' + id;
        b.appendChild(el('span', null, 'EQUIP'));
        r.appendChild(b);
      } else {
        r.appendChild(el('span', 'equipped-tag', 'EQUIPPED'));
      }
      if (gunLevel < MAX_WEAPON_LEVEL) {
        const cost = weaponLevelCost(id, gunLevel);
        const b2 = el('button', 'buy small' + (canAfford(cost) ? '' : ' poor'));
        b2.dataset.act = 'gunlevel';
        b2.dataset.arg = id;
        b2.appendChild(el('span', null, '⬢ ' + fmtBig(cost)));
        b2.appendChild(el('small', null, 'MK ' + (gunLevel + 2)));
        r.appendChild(b2);
      }
    }
    row.appendChild(r);
    scroll.appendChild(row);
  }
}

function renderHulls(scroll) {
  const lvl = commanderLevel().level;
  for (const id of Object.keys(CHASSIS)) {
    const c = CHASSIS[id];
    const has = owns('chassis', id);
    const equipped = profile.chassis === id;
    const locked = !has && lvl < c.unlockLevel;
    const row = el('div', 'item' + (equipped ? ' equipped' : ''));
    const l = el('div', 'item-l');
    l.appendChild(el('b', null, c.name + '  ·  ' + c.class));
    l.appendChild(el('small', null, c.blurb));
    l.appendChild(el('small', 'nums',
      `HULL ${c.hp} · SPEED ${c.speed} · TRAVERSE ${c.traverse} · ` +
      `ARMOUR ×${c.armour} · UPLINK ×${c.droneMul}`));
    row.appendChild(l);
    const r = el('div', 'item-r');
    if (locked) r.appendChild(el('span', 'locked-tag', 'CMDR ' + c.unlockLevel));
    else if (!has) {
      const b = el('button', 'buy' + (canAfford(c.cost) ? '' : ' poor'));
      b.dataset.act = 'buy';
      b.dataset.arg = 'chassis:' + id;
      b.appendChild(el('span', null, '⬢ ' + fmtBig(c.cost)));
      r.appendChild(b);
    } else if (!equipped) {
      const b = el('button', 'equip');
      b.dataset.act = 'equip';
      b.dataset.arg = 'chassis:' + id;
      b.appendChild(el('span', null, 'EQUIP'));
      r.appendChild(b);
    } else r.appendChild(el('span', 'equipped-tag', 'EQUIPPED'));
    row.appendChild(r);
    scroll.appendChild(row);
  }
}

function renderUtilities(scroll) {
  const lvl = commanderLevel().level;
  for (const id of Object.keys(UTILITIES)) {
    const u = UTILITIES[id];
    const has = owns('utilities', id);
    const equipped = profile.utility === id;
    const locked = !has && lvl < u.unlockLevel;
    const row = el('div', 'item' + (equipped ? ' equipped' : ''));
    const l = el('div', 'item-l');
    l.appendChild(el('b', null, u.name));
    l.appendChild(el('small', null, u.blurb));
    l.appendChild(el('small', 'nums', u.charges + ' CHARGES · ' + u.cooldown + 's COOLDOWN'));
    row.appendChild(l);
    const r = el('div', 'item-r');
    if (locked) r.appendChild(el('span', 'locked-tag', 'CMDR ' + u.unlockLevel));
    else if (!has) {
      const b = el('button', 'buy' + (canAfford(u.cost) ? '' : ' poor'));
      b.dataset.act = 'buy';
      b.dataset.arg = 'utilities:' + id;
      b.appendChild(el('span', null, '⬢ ' + fmtBig(u.cost)));
      r.appendChild(b);
    } else if (!equipped) {
      const b = el('button', 'equip');
      b.dataset.act = 'equip';
      b.dataset.arg = 'utility:' + id;
      b.appendChild(el('span', null, 'EQUIP'));
      r.appendChild(b);
    } else r.appendChild(el('span', 'equipped-tag', 'EQUIPPED'));
    row.appendChild(r);
    scroll.appendChild(row);
  }
}

function renderCamo(scroll) {
  const rank = worldRank();
  const grid = el('div', 'camo-grid');
  for (const id of Object.keys(CAMOS)) {
    const c = CAMOS[id];
    const has = owns('camos', id);
    const equipped = profile.camo === id;
    const rankLocked = c.rankReq && rank > c.rankReq;
    const cell = el('button', 'camo' + (equipped ? ' on' : '') + (rankLocked ? ' locked' : ''));
    if (!rankLocked) {
      cell.dataset.act = has ? 'equip' : 'buy';
      cell.dataset.arg = has ? 'camo:' + id : 'camos:' + id;
    }
    const sw = el('div', 'swatch');
    sw.style.background = '#' + c.hull.toString(16).padStart(6, '0');
    const stripe = el('i');
    stripe.style.background = '#' + c.accent.toString(16).padStart(6, '0');
    sw.appendChild(stripe);
    cell.appendChild(sw);
    cell.appendChild(el('b', null, c.name));
    cell.appendChild(el('small', null, rankLocked ? 'TOP ' + fmtBig(c.rankReq)
      : has ? (equipped ? 'WORN' : 'OWNED') : '⬢ ' + fmtBig(c.cost)));
    grid.appendChild(cell);
  }
  scroll.appendChild(grid);
}

// ---- garage actions ----

function doEquip(arg) {
  const [kind, id] = arg.split(':');
  if (kind === 'weapon') profile.weapon = id;
  if (kind === 'chassis') profile.chassis = id;
  if (kind === 'utility') profile.utility = id;
  if (kind === 'camo') profile.camo = id;
  markDirty();
  AudioFX.blip(700, 0.08, 0.06);
  showGarage();
}

function doBuy(arg) {
  const [kind, id] = arg.split(':');
  const maps = { weapons: WEAPONS, chassis: CHASSIS, utilities: UTILITIES, camos: CAMOS };
  const def = maps[kind][id];
  if (!def) return;
  if (!spend(def.cost)) { flashPoor(); return; }
  acquire(kind, id);
  // buying something equips it — nobody buys a gun to leave it in the crate
  if (kind === 'weapons') profile.weapon = id;
  if (kind === 'chassis') profile.chassis = id;
  if (kind === 'utilities') profile.utility = id;
  if (kind === 'camos') profile.camo = id;
  if (kind === 'weapons' && profile.weaponLevels[id] == null) profile.weaponLevels[id] = 0;
  markDirty();
  AudioFX.pickup();
  showGarage();
}

function doBuyModule(id) {
  const mo = MODULES[id];
  if (!mo || hasModule(id)) return;
  if (commanderLevel().level < mo.unlockLevel) return;
  if (!spend(mo.cost)) { flashPoor(); return; }
  acquire('modules', id);
  // a computer you paid for should be switched on when you leave the garage
  if (id === 'firecon') profile.settings.autoAim = true;
  markDirty();
  AudioFX.levelUp();
  showGarage();
}

function doUpgrade(key) {
  const level = profile.upgrades[key] || 0;
  if (level >= MAX_UP_LEVEL) return;
  const cost = upgradeCost(key, level);
  if (!spend(cost)) { flashPoor(); return; }
  profile.upgrades[key] = level + 1;
  markDirty();
  AudioFX.levelUp();
  showGarage();
}

function doGunLevel(id) {
  const level = profile.weaponLevels[id] || 0;
  if (level >= MAX_WEAPON_LEVEL) return;
  const cost = weaponLevelCost(id, level);
  if (!spend(cost)) { flashPoor(); return; }
  profile.weaponLevels[id] = level + 1;
  markDirty();
  AudioFX.levelUp();
  showGarage();
}

function flashPoor() {
  AudioFX.blip(150, 0.14, 0.07);
  const sb = document.querySelector('.sb-scrap');
  if (!sb) return;
  sb.classList.add('shake');
  setTimeout(() => sb.classList.remove('shake'), 420);
}

// ---------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------

export function showLadder() {
  state.screen = 'ladder';
  const w = frame('list-screen');
  statusBar(w);
  backRow(w, 'title');
  w.appendChild(el('h2', 'screen-title', 'WORLD LADDER'));
  w.appendChild(el('p', 'screen-sub',
    fmtBig(LADDER_SIZE) + ' commanders in the season. Battle points move you.'));

  const rank = worldRank();
  const tier = tierFor(rank);
  const hero = el('div', 'rank-hero');
  const rk = el('div', 'rank-big', fmtRank(rank));
  rk.style.color = tier.colour;
  hero.appendChild(rk);
  const tn = el('div', 'rank-tier', tier.name);
  tn.style.color = tier.colour;
  hero.appendChild(tn);
  hero.appendChild(el('small', null, fmtBig(profile.bp) + ' BP · BEST ' + fmtRank(profile.bestRank)));
  w.appendChild(hero);

  // tier ladder
  const tl = el('div', 'tier-list');
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    const reached = rank <= t.max;
    const row = el('div', 'tier-row' + (reached ? ' on' : ''));
    const nm = el('b', null, t.name);
    nm.style.color = reached ? t.colour : '';
    row.appendChild(nm);
    row.appendChild(el('small', null, t.max === Infinity ? 'ENTRY' : 'TOP ' + fmtBig(t.max)));
    tl.appendChild(row);
  }
  w.appendChild(tl);

  const scroll = el('div', 'scroll');
  scroll.appendChild(el('div', 'lb-head', 'AROUND YOU'));
  for (const row of nearbyLadder(rank)) {
    const r = el('div', 'lb-row' + (row.you ? ' you' : ''));
    r.appendChild(el('span', 'lb-rank', fmtRank(row.rank)));
    r.appendChild(el('span', 'lb-name', row.name));
    r.appendChild(el('span', 'lb-bp', fmtBig(row.bp) + ' BP'));
    scroll.appendChild(r);
  }
  scroll.appendChild(el('div', 'lb-head', 'SEASON RECORD'));
  const st = profile.stats;
  const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
  for (const [k, v] of [
    ['BATTLES', st.battles], ['WINS', st.wins], ['LOSSES', st.losses],
    ['KILLS', st.kills], ['ACCURACY', acc + '%'], ['BEST STREAK', st.bestStreak],
    ['LONGEST KILL', st.longestKill + 'm'], ['SCENERY DESTROYED', st.props],
    ['DRONES LOST', st.dronesLost], ['SCRAP EARNED', fmtBig(st.scrapEarned)],
  ]) {
    const r = el('div', 'lb-row');
    r.appendChild(el('span', 'lb-name', k));
    r.appendChild(el('span', 'lb-bp', String(v)));
    scroll.appendChild(r);
  }
  w.appendChild(scroll);
}

// Deterministic neighbours so the ladder looks stable between visits.
function nearbyLadder(rank) {
  const rows = [];
  const rng = mulberry32(hashStr('ladder' + Math.floor(rank / 3)));
  const offsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  for (const off of offsets) {
    const r = rank + off;
    if (r < 1) continue;
    if (off === 0) {
      rows.push({ rank: r, name: profile.name, bp: profile.bp, you: true });
      continue;
    }
    const tag = LADDER_TAGS[Math.floor(rng() * LADDER_TAGS.length)];
    const nm = ENEMY_NAMES[Math.floor(rng() * ENEMY_NAMES.length)];
    const style = rng();
    const name = style < 0.4 ? tag : style < 0.75 ? nm + '_' + tag.slice(0, 3)
      : tag + Math.floor(rng() * 90 + 10);
    // BP that would land on that rank, roughly
    const bp = Math.max(0, bpForRank(r) + Math.floor((rng() - 0.5) * 60));
    rows.push({ rank: r, name, bp });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function showResults(res) {
  state.screen = 'results';
  const w = frame('results-screen');
  const m = res.mission;

  w.appendChild(el('div', 'kicker', m.name));
  const h = el('h2', 'result-title' + (res.win ? ' win' : ' lose'),
    res.win ? 'OBJECTIVE COMPLETE' : 'MISSION FAILED');
  w.appendChild(h);
  if (!res.win && res.reason) w.appendChild(el('p', 'fail-reason', res.reason));

  if (!m.skirmish) {
    const st = el('div', 'stars big');
    for (let i = 0; i < 3; i++) {
      const s = el('span', 'star' + (i < res.stars ? ' on' : ''), '★');
      s.style.animationDelay = (i * 0.18) + 's';
      st.appendChild(s);
    }
    w.appendChild(st);
  }

  // rank movement
  const moved = res.rank.before - res.rank.after;
  const rk = el('div', 'rank-move');
  rk.appendChild(el('small', null, 'WORLD RANK'));
  const line = el('div', 'rank-line');
  line.appendChild(el('span', 'from', fmtRank(res.rank.before)));
  line.appendChild(el('span', 'arrow' + (moved > 0 ? ' up' : moved < 0 ? ' down' : ''),
    moved > 0 ? '▲' : moved < 0 ? '▼' : '—'));
  const to = el('span', 'to', fmtRank(res.rank.after));
  to.style.color = tierFor(res.rank.after).colour;
  line.appendChild(to);
  rk.appendChild(line);
  rk.appendChild(el('small', 'bp' + (res.bp >= 0 ? ' up' : ' down'),
    (res.bp >= 0 ? '+' : '') + res.bp + ' BP' +
    (moved > 0 ? '  ·  PASSED ' + fmtBig(moved) + ' COMMANDERS' : '')));
  w.appendChild(rk);

  const grid = el('div', 'res-grid');
  resRow(grid, 'KILLS', res.kills);
  resRow(grid, 'TIME', fmtTime(res.time) + ' / PAR ' + fmtTime(res.par));
  resRow(grid, 'ACCURACY', Math.round(res.accuracy * 100) + '% (' + res.hits + '/' + res.shots + ')');
  resRow(grid, 'DAMAGE OUT', res.damage);
  resRow(grid, 'DAMAGE IN', res.taken);
  resRow(grid, 'SCENERY WRECKED', res.props);
  if (res.longestKill) resRow(grid, 'LONGEST KILL', res.longestKill + 'm');
  if (res.streak > 1) resRow(grid, 'BEST STREAK', res.streak + '×');
  resRow(grid, 'HULL REMAINING', res.hpLeft + '%');
  resRow(grid, 'SCORE', res.score);
  w.appendChild(grid);

  const rew = el('div', 'rewards');
  rew.appendChild(rewardChip('⬢ ' + fmtBig(res.scrap), 'SCRAP'));
  rew.appendChild(rewardChip('+' + fmtBig(res.xp), 'XP'));
  if (res.level.gained > 0) {
    rew.appendChild(rewardChip('CMDR ' + res.level.level, 'LEVEL UP', 'gold'));
  }
  w.appendChild(rew);

  for (const u of res.unlocked) {
    w.appendChild(el('div', 'unlock', 'UNLOCKED: ' + unlockName(u)));
  }

  // Only offered when there is something to show — the reel decides that, not
  // the kill count, because a mine kill with nothing standing near it makes a
  // poor film.
  const reel = handlers.highlightCount ? handlers.highlightCount() : 0;
  if (reel > 0) {
    const rr = el('div', 'menu-row');
    rr.appendChild(bigButton('▶ ACTION REPLAY', 'reel', null, 'btn-secondary',
      reel === 1 ? '1 MOMENT' : reel + ' MOMENTS'));
    w.appendChild(rr);
  }

  const row = el('div', 'menu-row');
  if (res.win && !m.skirmish) {
    const idx = MISSIONS.findIndex((x) => x.id === m.id);
    if (idx >= 0 && idx < MISSIONS.length - 1) {
      row.appendChild(bigButton('NEXT MISSION', 'next', null, 'btn-primary'));
    } else {
      row.appendChild(bigButton('CAMPAIGN', 'campaign', null, 'btn-primary'));
    }
  } else {
    row.appendChild(bigButton(res.win ? 'AGAIN' : 'RETRY', 'again', null, 'btn-primary'));
  }
  row.appendChild(bigButton('GARAGE', 'garage', null, 'btn-secondary'));
  row.appendChild(bigButton(m.skirmish ? 'CONTRACTS' : 'CAMPAIGN',
    m.skirmish ? 'attack' : 'campaign', null, 'btn-secondary'));
  w.appendChild(row);
  if (res.level.gained > 0) AudioFX.levelUp();
}

function resRow(grid, label, value) {
  const r = el('div', 'res-row');
  r.appendChild(el('span', null, label));
  r.appendChild(el('b', null, String(value)));
  grid.appendChild(r);
}

function rewardChip(big, small, cls = '') {
  const c = el('div', 'reward ' + cls);
  c.appendChild(el('b', null, big));
  c.appendChild(el('small', null, small));
  return c;
}

// ---------------------------------------------------------------------------
// Pause / settings
// ---------------------------------------------------------------------------

export function showPause() {
  const w = frame('pause-screen');
  w.appendChild(el('h2', 'screen-title', 'PAUSED'));
  const m = state.mission;
  if (m) {
    w.appendChild(el('p', 'screen-sub', m.name));
    if (state.objective) w.appendChild(el('p', 'brief-text', state.objective.label));
  }
  const col = el('div', 'menu-col');
  col.appendChild(bigButton('RESUME', 'resume', null, 'btn-primary'));
  // Controls are exactly the thing you want to change mid-battle, when you
  // have just discovered the buttons are under the wrong thumb.
  col.appendChild(bigButton('SETTINGS & CONTROLS', 'settings-pause', null, 'btn-secondary'));
  col.appendChild(bigButton('RESTART', 'restart', null, 'btn-secondary'));
  col.appendChild(bigButton('ABORT MISSION', 'abort', null, 'btn-secondary'));
  const row = el('div', 'menu-row');
  row.appendChild(bigButton(AudioFX.muted ? 'SOUND OFF' : 'SOUND ON', 'mute', null, 'btn-mini'));
  col.appendChild(row);
  w.appendChild(col);
  if (state.mission && state.mission.intel) {
    w.appendChild(el('small', 'star-hint', 'INTEL: ' + state.mission.intel));
  }
}

// Where ‹ BACK goes — SETTINGS is reachable from the title and from the
// pause menu, and dumping a paused commander back to the title would be rude.
let settingsBack = 'title';

export function showSettings(from) {
  if (from) settingsBack = from;
  state.screen = 'settings';
  const w = frame('list-screen');
  backRow(w, settingsBack === 'pause' ? 'resume-settings' : settingsBack);
  w.appendChild(el('h2', 'screen-title', 'SETTINGS'));

  const scroll = el('div', 'scroll');

  // ---- controls -----------------------------------------------------------
  scroll.appendChild(el('div', 'section-head', 'CONTROLS'));
  scroll.appendChild(layoutDiagram());
  scroll.appendChild(sideRow('AIM THUMB', profile.settings.aimSide, 'aimside',
    'Which half of the screen drags the reticle. The other half is your drive stick.'));
  scroll.appendChild(sideRow('FIRE BUTTONS', profile.settings.padSide, 'padside',
    'Which side FIRE and the action buttons sit on. Put them under your other thumb.'));
  scroll.appendChild(sliderRow('AIM SENSITIVITY', 'sens', 0.4, 2.4, 0.1,
    'How fast a thumb drag or mouse sweep moves the reticle.',
    (v) => v.toFixed(1) + '×'));
  scroll.appendChild(toggleRow('INVERT AIM (Y)', !!profile.settings.invertY, 'inverty',
    'Drag down to raise the sight.'));
  if (IS_TOUCH) {
    scroll.appendChild(toggleRow('VIBRATION', profile.settings.haptics !== false, 'haptics',
      'A short buzz on firing, hits and kills.'));
  }

  // ---- gunnery ------------------------------------------------------------
  scroll.appendChild(el('div', 'section-head', 'GUNNERY'));
  scroll.appendChild(fireControlRow());
  scroll.appendChild(toggleRow('KILL CAM', profile.settings.camAuto !== false, 'camauto',
    'Rides the shell in when the round in the air is going to finish something. ' +
    'Never on an ordinary shot — it hands the view back down the same line you fired on.'));
  scroll.appendChild(toggleRow('STORY CUTSCENES', profile.settings.cutscenes !== false, 'cutscenes',
    'The films between the fighting. Every one is skippable, and none of them repeat unless you ask.'));
  scroll.appendChild(toggleRow('ACTION REPLAY', profile.settings.highlights !== false, 'highlights',
    'Your best kills and biggest demolitions, re-staged on the wreckage, between the battle and the results.'));

  // ---- presentation -------------------------------------------------------
  scroll.appendChild(el('div', 'section-head', 'PRESENTATION'));
  scroll.appendChild(toggleRow('SOUND', !AudioFX.muted, 'mute'));
  scroll.appendChild(toggleRow('LOW QUALITY MODE', !!profile.settings.lite, 'quality',
    'Turns off bloom and shadows. Applies after a reload.'));

  // ---- reference ----------------------------------------------------------
  scroll.appendChild(el('div', 'section-head', 'CONTROL REFERENCE'));
  scroll.appendChild(controlReference());

  const wipe = el('div', 'item');
  const wl = el('div', 'item-l');
  wl.appendChild(el('b', null, 'RESET PROGRESS'));
  wl.appendChild(el('small', null, 'Erases the campaign, the garage and your ladder position.'));
  wipe.appendChild(wl);
  const wr = el('div', 'item-r');
  const wb = el('button', 'buy poor');
  wb.dataset.act = 'wipe';
  wb.appendChild(el('span', null, 'WIPE'));
  wr.appendChild(wb);
  wipe.appendChild(wr);
  scroll.appendChild(wipe);

  scroll.appendChild(el('div', 'credit',
    'IRONHAIL — built by Opus 5. Procedural terrain, tanks, weather and audio; ' +
    'no assets, no build step. Everything you shoot is really being dug out of the ground.'));
  w.appendChild(scroll);
}

function toggleRow(label, on, action, sub, disabled = false) {
  const row = el('div', 'item');
  const l = el('div', 'item-l');
  l.appendChild(el('b', null, label));
  if (sub) l.appendChild(el('small', null, sub));
  row.appendChild(l);
  const r = el('div', 'item-r');
  const b = el('button', 'toggle' + (on ? ' on' : '') + (disabled ? ' disabled' : ''));
  if (!disabled) b.dataset.act = action;
  b.appendChild(el('span', null, disabled ? '—' : (on ? 'ON' : 'OFF')));
  r.appendChild(b);
  row.appendChild(r);
  return row;
}

// A two-way LEFT / RIGHT switch. Clearer than a toggle labelled "SOUTHPAW",
// because the label never has to say which way round "on" means.
function sideRow(label, value, action, sub) {
  const row = el('div', 'item');
  const l = el('div', 'item-l');
  l.appendChild(el('b', null, label));
  if (sub) l.appendChild(el('small', null, sub));
  row.appendChild(l);
  const r = el('div', 'item-r');
  const seg = el('div', 'seg');
  for (const side of ['left', 'right']) {
    const b = el('button', 'seg-b' + (value === side ? ' on' : ''), side.toUpperCase());
    b.dataset.act = action;
    b.dataset.arg = side;
    seg.appendChild(b);
  }
  r.appendChild(seg);
  row.appendChild(r);
  return row;
}

function sliderRow(label, key, min, max, step, sub, fmt) {
  const row = el('div', 'item');
  const l = el('div', 'item-l');
  l.appendChild(el('b', null, label));
  if (sub) l.appendChild(el('small', null, sub));
  const slider = el('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(profile.settings[key]);
  slider.className = 'slider';
  slider.addEventListener('input', () => {
    profile.settings[key] = parseFloat(slider.value);
    markDirty();
    handlers.onSettings();
    val.textContent = fmt(profile.settings[key]);
  });
  l.appendChild(slider);
  row.appendChild(l);
  const val = el('div', 'item-r', fmt(profile.settings[key]));
  row.appendChild(val);
  return row;
}

// A live picture of the thumb layout, because two words on a switch never
// beat seeing which half of the glass does what.
function layoutDiagram() {
  const aimRight = profile.settings.aimSide !== 'left';
  const padRight = profile.settings.padSide !== 'left';
  const wrap = el('div', 'layout-demo');
  const screen = el('div', 'ld-screen');

  const drive = el('div', 'ld-zone drive' + (aimRight ? ' l' : ' r'));
  drive.appendChild(el('b', null, '⊕'));
  drive.appendChild(el('span', null, 'DRIVE'));
  screen.appendChild(drive);

  const aim = el('div', 'ld-zone aim' + (aimRight ? ' r' : ' l'));
  aim.appendChild(el('b', null, '✛'));
  aim.appendChild(el('span', null, 'AIM'));
  screen.appendChild(aim);

  const fire = el('div', 'ld-fire' + (padRight ? ' r' : ' l'), 'FIRE');
  screen.appendChild(fire);
  const stack = el('div', 'ld-stack' + (padRight ? ' r' : ' l'));
  for (const t of ['UTIL', 'DRONE', 'SCOPE']) stack.appendChild(el('i', null, t));
  screen.appendChild(stack);

  wrap.appendChild(screen);
  wrap.appendChild(el('small', null,
    aimRight === padRight
      ? 'Aim and fire with the same thumb — drive with the other.'
      : 'Aim with one thumb, fire with the other.'));
  return wrap;
}

// The auto-aim row. Live while the computer is fitted — bought, or on loan
// through act one — and an honest shopfront when it is not.
function fireControlRow() {
  const fc = fireControlFitted(null);
  const owned = fc.owned;
  const usable = fc.fitted;
  const mo = MODULES.firecon;

  if (!usable) {
    const row = el('div', 'item');
    const l = el('div', 'item-l');
    l.appendChild(el('b', null, 'FIRE CONTROL (AUTO-AIM)'));
    l.appendChild(el('small', null,
      'Your loaner went back at the end of act one. ' + mo.blurb));
    row.appendChild(l);
    const r = el('div', 'item-r');
    const b = el('button', 'buy' + (canAfford(mo.cost) ? '' : ' poor'));
    b.dataset.act = 'garage';
    b.appendChild(el('span', null, '⬢ ' + fmtBig(mo.cost)));
    b.appendChild(el('small', null, 'GARAGE'));
    r.appendChild(b);
    row.appendChild(r);
    return row;
  }

  return toggleRow('FIRE CONTROL (AUTO-AIM)', profile.settings.autoAim !== false, 'autoaim',
    owned
      ? 'Installed. Lays the gun on the nearest contact, leads it and reads the wind. Nudge the reticle any time to take the shot back.'
      : 'On loan through act one. Lays the gun for you — buy the computer in the garage to keep it.');
}

// Not a manual, just the six things a commander actually needs to be told.
function controlReference() {
  const box = el('div', 'keyref');
  const aimRight = profile.settings.aimSide !== 'left';
  const rows = IS_TOUCH ? [
    [aimRight ? 'RIGHT OF SCREEN' : 'LEFT OF SCREEN', 'drag to aim'],
    [aimRight ? 'LEFT OF SCREEN' : 'RIGHT OF SCREEN', 'drag to drive'],
    ['FIRE', 'hold or tap — a tap while reloading still goes off'],
    ['DRONE', 'switch to the uplink camera; the stick then flies the drone'],
    ['MARK', 'paint what the drone can see for a strike'],
    ['PINCH', 'zoom the chase camera or the sight'],
  ] : [
    ['W A S D', 'drive (relative to the camera)'],
    ['MOUSE', 'aim · LEFT CLICK fire · RIGHT CLICK utility'],
    ['Q / R', 'drone camera / recall the drone'],
    ['TAB · 1 2 3', 'scope · chase, scope, drone'],
    ['E · F', 'utility · mark a target'],
    ['WHEEL · P · M', 'zoom · pause · mute'],
  ];
  for (const [k, v] of rows) {
    const r = el('div', 'kr');
    r.appendChild(el('b', null, k));
    r.appendChild(el('span', null, v));
    box.appendChild(r);
  }
  return box;
}

// One door for every settings write: store it, persist it, push it into the
// live systems, redraw. Nothing else in here pokes profile.settings directly.
function setSetting(key, value) {
  profile.settings[key] = value;
  markDirty();
  handlers.onSettings();
  showSettings();
}

function toggleMute() {
  AudioFX.init();
  AudioFX.setMuted(!AudioFX.muted);
  if (state.screen === 'settings') showSettings();
  else if (state.paused) showPause();
}

function toggleQuality() {
  profile.settings.lite = !profile.settings.lite;
  saveProfile();
  const w = frame('list-screen');
  w.appendChild(el('h2', 'screen-title', profile.settings.lite ? 'LOW QUALITY ON' : 'LOW QUALITY OFF'));
  w.appendChild(el('p', 'screen-sub', 'The renderer rebuilds on reload.'));
  const col = el('div', 'menu-col');
  col.appendChild(bigButton('RELOAD NOW', 'reload', null, 'btn-primary'));
  col.appendChild(bigButton('LATER', 'settings-return', null, 'btn-secondary'));
  w.appendChild(col);
}

function confirmWipe() {
  const w = frame('list-screen');
  w.appendChild(el('h2', 'screen-title', 'WIPE EVERYTHING?'));
  w.appendChild(el('p', 'screen-sub',
    'Campaign stars, garage, scrap and your world rank all go back to zero. There is no undo.'));
  const col = el('div', 'menu-col');
  col.appendChild(bigButton('KEEP MY PROGRESS', 'settings-return', null, 'btn-primary'));
  col.appendChild(bigButton('WIPE IT', 'wipe-yes', null, 'btn-secondary'));
  w.appendChild(col);
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

function openRename() {
  const modal = $('name-modal');
  const inp = $('name-input');
  inp.value = profile.name;
  modal.classList.remove('hidden');
  setTimeout(() => inp.focus(), 60);
}

export function initRenameModal(onSave) {
  const modal = $('name-modal');
  const inp = $('name-input');
  const close = () => modal.classList.add('hidden');
  const save = () => {
    const n = sanitizeName(inp.value);
    if (!n) {
      inp.classList.add('shake');
      setTimeout(() => inp.classList.remove('shake'), 420);
      return;
    }
    close();
    onSave(n);
  };
  $('btn-name-save').addEventListener('click', save);
  $('btn-name-cancel').addEventListener('click', close);
  $('btn-name-random').addEventListener('click', () => {
    inp.value = ENEMY_NAMES[Math.floor(Math.random() * ENEMY_NAMES.length)];
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
    e.stopPropagation();
  });
  inp.addEventListener('keyup', (e) => e.stopPropagation());
}

export function refreshCurrentScreen() {
  switch (state.screen) {
    case 'title': showTitle(); break;
    case 'campaign': showCampaign(); break;
    case 'garage': showGarage(); break;
    case 'ladder': showLadder(); break;
    case 'attack': showAttack(); break;
    case 'settings': showSettings(); break;
    default: break;
  }
}
