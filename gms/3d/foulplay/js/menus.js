// Every screen outside a race. Menus never touch game systems directly: they
// render from the profile and emit intentions on the bus, and flow.js decides
// what that means.

import { $, esc, fmtMoney, fmtRank, fmtTime, ordinal, clamp, clamp01, pick } from './utils.js';
import { profile, saveProfile, rankTier, equipPart, toggleLoadout, addMoney, playerPower, playerStats } from './save.js';
import { SLOTS, PARTS, SKILLS, RARITY, partById, skillById, partsForSlot, CHEST_TIERS, statsFor, powerRating } from './arsenal.js';
import { TRACK_DEFS, TRACK_BY_ID, buildTrack } from './trackgen.js';
import { CHAPTERS, LEVELS_PER_CHAPTER, storyLength, levelEvent, chapterOf } from './story.js';
import { SPECIAL_EVENTS, eventById, eventUnlocked, quickEvent, dailyEvent } from './events.js';
import { LIVERY, LADDER, NAME_POOL, DEV_MODE } from './config.js';
import { state } from './state.js';
import { emit, on } from './bus.js';
import { sfx } from './audio.js';

const menu = () => $('menu');
let actions = {};
let currentTab = { garage: 'engine', story: null, quick: 'track' };

export function showScreen() { menu().classList.add('show'); }
export function hideScreen() { menu().classList.remove('show'); menu().innerHTML = ''; }

// ---------------------------------------------------------------------------
function paint(html, acts = {}) {
  const m = menu();
  m.innerHTML = `<div class="wrap">${html}</div>`;
  m.scrollTop = 0;
  actions = acts;
  m.querySelectorAll('[data-act]').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      const fn = actions[node.dataset.act];
      sfx('ui');
      if (fn) fn(node.dataset, node);
    });
  });
  showScreen();
}

function topbar(title, back) {
  const t = rankTier();
  return `
    <div class="topbar">
      <div>
        ${back ? `<button class="btn-mini" data-act="back">‹ BACK</button>` : ''}
        <h1 style="display:inline-block;margin-left:${back ? '10px' : '0'};vertical-align:middle">${esc(title)}</h1>
      </div>
      <div style="text-align:right">
        <div class="money">${fmtMoney(profile.money)}</div>
        <div class="rank" style="color:${t.css}">${fmtRank(profile.rank)} · ${t.name}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════ TITLE ═══════════════════════════════
export function renderTitle() {
  const t = rankTier();
  const story = profile.story.level || 1;
  const ch = chapterOf(story);
  const chests = profile.chests.length;
  paint(`
    <div class="logo">FOUL<span>PLAY</span></div>
    <p class="tagline">CONTACT IS RACING · GETTING CAUGHT IS NOT</p>

    <button class="btn primary" data-act="story">
      THE SEASON
      <small>LEVEL ${story} / ${storyLength()} · ${esc(ch.name)}</small>
    </button>
    <button class="btn" data-act="quick">
      QUICK RACE
      <small>WORLD RANKED · ${fmtRank(profile.rank)} OF ${LADDER.population.toLocaleString('en-US')}</small>
    </button>
    <button class="btn" data-act="events">
      SPECIAL EVENTS
      <small>KNOCKOUTS, DERBIES AND THE DAILY</small>
    </button>
    <button class="btn" data-act="garage">
      GARAGE
      <small>POWER ${playerPower()} · ${profile.garage.loadout.length}/3 TRICKS EQUIPPED${chests ? ` · ${chests} CRATE${chests > 1 ? 'S' : ''} WAITING` : ''}</small>
    </button>
    <div class="btn-row">
      <button class="btn ghost" data-act="ladder">WORLD LADDER</button>
      <button class="btn ghost" data-act="stats">CAREER</button>
      <button class="btn ghost" data-act="settings">SETTINGS</button>
    </div>
    <p style="text-align:center;color:var(--dim);font-size:12px;letter-spacing:.14em;margin-top:2vh">
      DRIVER: ${esc(profile.name)} · <button class="btn-mini" data-act="rename">RENAME</button>
    </p>
  `, {
    story: () => emit('nav', { to: 'story' }),
    quick: () => emit('nav', { to: 'quick' }),
    events: () => emit('nav', { to: 'events' }),
    garage: () => emit('nav', { to: 'garage' }),
    ladder: () => emit('nav', { to: 'ladder' }),
    stats: () => emit('nav', { to: 'stats' }),
    settings: () => emit('nav', { to: 'settings' }),
    rename: () => renameDriver(),
  });
}

function renameDriver() {
  popup('DRIVER NAME', `
    <p>What do they announce when you come through the tunnel?</p>
    <input id="name-input" type="text" maxlength="14" autocomplete="off" spellcheck="false"
           value="${esc(profile.name)}" placeholder="YOUR NAME" />
  `, [
    { label: 'RANDOM', act: () => { $('name-input').value = pick(NAME_POOL); }, keep: true },
    { label: 'CANCEL', act: () => closePopup() },
    {
      label: 'SAVE', primary: true, act: () => {
        const v = ($('name-input').value || '').toUpperCase().replace(/[^A-Z0-9 '_-]/g, '').trim().slice(0, 14);
        if (v.length >= 2) { profile.name = v; saveProfile(true); }
        closePopup();
        renderTitle();
      },
    },
  ]);
}

// ═══════════════════════════════ STORY ═══════════════════════════════
export function renderStory() {
  const unlocked = profile.story.level || 1;
  const curCh = chapterOf(unlocked).n;
  const showCh = currentTab.story || curCh;

  const chapterTabs = CHAPTERS.map((c) => {
    const open = (c.n - 1) * LEVELS_PER_CHAPTER + 1 <= unlocked;
    return `<button class="tab ${c.n === showCh ? 'on' : ''} ${open ? '' : 'locked'}"
              data-act="chapter" data-n="${c.n}" ${open ? '' : 'disabled'}>${open ? c.n : '🔒'}</button>`;
  }).join('');

  const ch = CHAPTERS[showCh - 1];
  const levels = [];
  for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
    const n = (showCh - 1) * LEVELS_PER_CHAPTER + i + 1;
    const open = n <= unlocked;
    const stars = profile.story.cleared[n] || 0;
    const ev = open ? levelEvent(n) : null;
    levels.push(`
      <button class="pick ${open ? '' : 'locked'} ${stars ? 'done' : ''}" data-act="level" data-n="${n}" ${open ? '' : 'disabled'}>
        <div class="pick-grade">${open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒'}</div>
        <div class="pick-name">${n}. ${open ? esc(TRACK_BY_ID[ev.track].name) : 'LOCKED'}</div>
        <div class="pick-sub">${open ? esc(ev.objective.label) : 'WIN THE PREVIOUS RACE'}</div>
        ${open && ev.rivals && ev.rivals[0] && ev.rivals[0].boss
          ? `<div class="pick-desc">⚔ ${esc(ev.rivals[0].name)} — ${esc(ev.rivals[0].team)}</div>` : ''}
        ${open && ev.knockout ? `<div class="pick-desc">☠️ KNOCKOUT — last car every 22 seconds</div>` : ''}
      </button>`);
  }

  paint(`
    ${topbar('THE SEASON', true)}
    <div class="tabs">${chapterTabs}</div>
    <div class="card">
      <h2>${ch.n}. ${esc(ch.name)}</h2>
      <h3 style="margin-top:2px">${esc(ch.sub)}</h3>
      <p style="color:#b6c0ca;font-weight:500;font-size:14px;margin:8px 0 0">${esc(ch.blurb)}</p>
    </div>
    <div class="grid two">${levels.join('')}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    chapter: (d) => { currentTab.story = +d.n; renderStory(); },
    level: (d) => emit('story:play', { level: +d.n }),
  });
}

// ═══════════════════════════════ QUICK RACE ═══════════════════════════════
export function renderQuick() {
  const t = rankTier();
  const cards = TRACK_DEFS.map((d) => `
    <button class="pick" data-act="go" data-id="${d.id}">
      <div class="pick-grade">${'◆'.repeat(d.grade)}</div>
      <div class="pick-name">${esc(d.name)}</div>
      <div class="pick-sub">${d.laps} LAPS · ${['', 'EASY', 'STEADY', 'TRICKY', 'HARD', 'BRUTAL'][d.grade]}</div>
      <div class="pick-desc">${esc(d.flavour)}</div>
    </button>`).join('');

  paint(`
    ${topbar('QUICK RACE', true)}
    <div class="card">
      <div class="stat"><span>WORLD RANKING</span><b style="color:${t.css}">${fmtRank(profile.rank)}</b></div>
      <div class="stat"><span>BEST EVER</span><b>${fmtRank(profile.bestRank)}</b></div>
      <div class="stat"><span>RACES · WINS · PODIUMS</span><b>${profile.quick.races} · ${profile.quick.wins} · ${profile.quick.podiums}</b></div>
      <div class="stat"><span>WIN STREAK</span><b>${profile.quick.streak} (BEST ${profile.quick.bestStreak})</b></div>
      <p style="color:var(--dim);font-size:13px;font-weight:500;margin:10px 0 0">
        Every ranked result moves you through ${LADDER.population.toLocaleString('en-US')} drivers. Win and you take a
        real bite out of the gap. Finish at the back and you give some of it back.</p>
    </div>
    <button class="btn primary" data-act="random">RACE ANYWHERE<small>RANDOM CIRCUIT · RANKED</small></button>
    <h3 style="margin:12px 0 8px">PICK A CIRCUIT</h3>
    <div class="grid two">${cards}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    random: () => emit('race:begin', quickEvent({})),
    go: (d) => emit('race:begin', quickEvent({ track: d.id })),
  });
}

// ═══════════════════════════════ EVENTS ═══════════════════════════════
export function renderEvents() {
  const daily = dailyEvent();
  const doneDaily = profile.events.cleared[daily.id];
  const cards = SPECIAL_EVENTS.map((e) => {
    const open = eventUnlocked(e);
    const done = profile.events.cleared[e.id];
    return `
      <button class="pick ${open ? '' : 'locked'} ${done ? 'done' : ''}" data-act="ev" data-id="${e.id}" ${open ? '' : 'disabled'}>
        <div class="pick-grade">${done ? '✓ CLEARED' : CHEST_TIERS[e.chest] ? CHEST_TIERS[e.chest].name : ''}</div>
        <div class="pick-name">${e.icon} ${esc(e.name)}</div>
        <div class="pick-sub">${esc(TRACK_BY_ID[e.track].name)} · ${e.laps} LAPS · ${e.cars} CARS · ${fmtMoney(e.purse)}</div>
        <div class="pick-desc">${esc(e.blurb)}</div>
        <div class="pick-desc" style="color:var(--warn)">${open ? '🎯 ' + esc(e.objective.label) : `🔒 REACH ${fmtRank(e.unlockRank)}`}</div>
      </button>`;
  }).join('');

  paint(`
    ${topbar('SPECIAL EVENTS', true)}
    <button class="pick" data-act="daily" style="border-color:var(--warn)">
      <div class="pick-grade">${doneDaily ? '✓ DONE TODAY' : 'CONTRABAND CRATE'}</div>
      <div class="pick-name">${daily.icon} ${esc(daily.title)}</div>
      <div class="pick-sub">${esc(daily.subtitle)} · ${daily.laps} LAPS · ${fmtMoney(daily.purse)}</div>
      <div class="pick-desc">${esc(daily.blurb)}</div>
    </button>
    <h3 style="margin:14px 0 8px">THE COMMISSIONS</h3>
    <div class="grid two">${cards}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    daily: () => emit('race:begin', daily),
    ev: (d) => emit('race:begin', eventById(d.id)),
  });
}

// ═══════════════════════════════ GARAGE ═══════════════════════════════
export function renderGarage(tab) {
  const slotId = tab || currentTab.garage;
  currentTab.garage = slotId;
  const isTricks = slotId === 'tricks';
  const st = playerStats();

  const tabs = SLOTS.map((s) => `
    <button class="tab ${s.id === slotId ? 'on' : ''}" data-act="tab" data-id="${s.id}">${s.icon} ${s.name}</button>`).join('')
    + `<button class="tab ${isTricks ? 'on' : ''}" data-act="tab" data-id="tricks">🔧 TRICKS</button>`;

  let body;
  if (isTricks) {
    body = renderTricks();
  } else {
    const slot = SLOTS.find((s) => s.id === slotId);
    const list = partsForSlot(slotId).map((p) => {
      const owned = profile.garage.parts.includes(p.id);
      const on = profile.garage.equipped[slotId] === p.id;
      return `
        <button class="item rar-${p.rarity} ${on ? 'on' : ''} ${owned ? '' : 'locked'}"
                data-act="equip" data-id="${p.id}" ${owned ? '' : 'disabled'}>
          <span class="ic">${slot.icon}</span>
          <span class="nm">${esc(p.name)}<small>${RARITY[p.rarity].name} · TIER ${p.tier}${owned ? '' : ' · NOT OWNED'}</small></span>
          <span class="pipbar">${Array.from({ length: 6 }, (_, i) => `<i class="${i < p.tier ? 'on' : ''}"></i>`).join('')}</span>
        </button>`;
    }).join('');
    body = `<h3 style="margin-bottom:6px">${slot.icon} ${slot.name} — ${esc(slot.blurb)}</h3>${list}`;
  }

  const chests = profile.chests.length;
  paint(`
    ${topbar('GARAGE', true)}
    ${chests ? `<button class="btn primary" data-act="openchests">OPEN ${chests} CRATE${chests > 1 ? 'S' : ''}<small>SOMETHING IN THERE IS BETTER THAN WHAT YOU ARE USING</small></button>` : ''}
    <div class="card" style="padding:0;overflow:hidden">
      <div id="car-preview" class="car-preview"></div>
    </div>
    <div class="card">
      <div class="grid three">
        <div><h3>POWER</h3><div style="font-size:26px">${playerPower()}</div></div>
        <div><h3>TOP SPEED</h3><div style="font-size:26px">${Math.round((74 + st.top) * 3.6)}<small style="font-size:11px"> KM/H</small></div></div>
        <div><h3>GRIP</h3><div style="font-size:26px">${(st.grip * 100).toFixed(0)}%</div></div>
        <div><h3>ARMOUR</h3><div style="font-size:26px">${Math.round((1 - st.armour) * 100)}%</div></div>
        <div><h3>RAM</h3><div style="font-size:26px">${(st.ram * 100).toFixed(0)}%</div></div>
        <div><h3>STEALTH</h3><div style="font-size:26px;color:${st.stealth < 0.8 ? 'var(--good)' : 'inherit'}">${Math.round((1 - st.stealth) * 100)}%</div></div>
      </div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin:8px 0 0">
        STEALTH is the only stat the stewards can see. Every point of it is suspicion they never write down.</p>
    </div>
    <div class="tabs">${tabs}</div>
    <div class="card">${body}</div>
    <div class="card">
      <h3>PAINT</h3>
      <div class="grid four" style="margin-top:8px">
        ${LIVERY.map((l, i) => `
          <button class="item ${profile.livery === i ? 'on' : ''}" data-act="livery" data-i="${i}">
            <span class="ic" style="width:18px;height:18px;border-radius:4px;background:#${l.body.toString(16).padStart(6, '0')}"></span>
            <span class="nm">${esc(l.name)}</span>
          </button>`).join('')}
      </div>
    </div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    tab: (d) => renderGarage(d.id),
    equip: (d) => { equipPart(partById(d.id).slot, d.id); renderGarage(slotId); },
    trick: (d) => {
      if (!toggleLoadout(d.id)) toast3('LOADOUT IS FULL — TAKE ONE OFF FIRST');
      renderGarage('tricks');
    },
    livery: (d) => { profile.livery = +d.i; saveProfile(); renderGarage(slotId); },
    openchests: () => emit('nav', { to: 'chests' }),
  });
  import('./preview.js').then((m) => m.mountPreview($('car-preview')));
}

function renderTricks() {
  const lo = profile.garage.loadout;
  const rows = SKILLS.map((s) => {
    const owned = profile.garage.skills.includes(s.id);
    const on = lo.includes(s.id);
    const band = { contact: 'CONTACT', close: 'CLOSE', mid: 'MID-RANGE', long: 'LONG RANGE', drop: 'DROPPED' }[s.band];
    const heat = s.susp < 30 ? 'LOW HEAT' : s.susp < 60 ? 'HOT' : 'RADIOACTIVE';
    return `
      <button class="item rar-${s.rarity} ${on ? 'on' : ''} ${owned ? '' : 'locked'}"
              data-act="trick" data-id="${s.id}" ${owned ? '' : 'disabled'}>
        <span class="ic">${s.icon}</span>
        <span class="nm">${esc(s.name)}
          <small>${band} · ${s.range ? Math.round(s.range) + 'm' : 'BEHIND YOU'} · ${s.cd}s · ${heat}</small>
          <small style="color:#b6c0ca;letter-spacing:0">${esc(s.blurb)}</small>
        </span>
        <span style="font-size:11px;color:var(--dim)">${on ? 'EQUIPPED' : owned ? 'OWNED' : 'LOCKED'}</span>
      </button>`;
  }).join('');
  return `
    <h3 style="margin-bottom:4px">EQUIPPED ${lo.length}/3</h3>
    <p style="color:var(--dim);font-size:12px;font-weight:500;margin:0 0 10px">
      One button fires whichever equipped trick is ready and has a target. Close range reads as a racing
      incident; long range reads as exactly what it is.</p>
    ${rows}`;
}

// ═══════════════════════════════ CHESTS ═══════════════════════════════
export function renderChestQueue(queue) {
  const list = queue && queue.length ? queue : profile.chests;
  if (!list.length) { emit('nav', { to: 'garage' }); return; }
  const tier = CHEST_TIERS[list[0]] || CHEST_TIERS.scrap;
  paint(`
    ${topbar('CRATE', false)}
    <div class="chest-stage">
      <div class="chest-icon">📦</div>
      <h1 style="color:${tier.css};margin-top:10px">${esc(tier.name)}</h1>
      <p style="color:var(--dim);letter-spacing:.2em;font-size:13px">${list.length} WAITING</p>
    </div>
    <button class="btn primary" data-act="open">CRACK IT OPEN</button>
    <button class="btn ghost" data-act="later">LATER</button>
  `, {
    // flow.openChest takes it off the profile queue — do not shift here too.
    open: () => emit('chest:open', { tier: list[0] }),
    later: () => emit('nav', { to: 'garage' }),
  });
}

export function renderChestResult(tierId, loot, onDone) {
  const tier = CHEST_TIERS[tierId] || CHEST_TIERS.scrap;
  const rows = loot.items.map((it, i) => {
    if (it.kind === 'cash') {
      return `<div class="item rar-common" style="animation-delay:${i * 0.12}s">
        <span class="ic">💵</span><span class="nm">${fmtMoney(it.amount)}<small>${it.why ? esc('DUPLICATE — ' + it.why) : 'PRIZE MONEY'}</small></span></div>`;
    }
    if (it.kind === 'part') {
      const p = partById(it.id);
      const slot = SLOTS.find((s) => s.id === p.slot);
      return `<div class="item rar-${p.rarity}" style="animation-delay:${i * 0.12}s">
        <span class="ic">${slot.icon}</span>
        <span class="nm">${esc(p.name)}<small>${RARITY[p.rarity].name} ${slot.name} · TIER ${p.tier}</small></span></div>`;
    }
    const s = skillById(it.id);
    return `<div class="item rar-${s.rarity}" style="animation-delay:${i * 0.12}s">
      <span class="ic">${s.icon}</span>
      <span class="nm">${esc(s.name)}<small>${RARITY[s.rarity].name} TRICK · ${esc(s.tip)}</small></span></div>`;
  }).join('');

  paint(`
    <div class="chest-stage" style="padding:2vh 0">
      <h1 style="color:${tier.css}">${esc(tier.name)}</h1>
    </div>
    <div class="loot">${rows}</div>
    <button class="btn primary" data-act="ok" style="margin-top:16px">TAKE IT</button>
  `, { ok: () => onDone && onDone() });
}

// ═══════════════════════════════ RESULTS ═══════════════════════════════
export function renderResults(r) {
  if (!r) { emit('nav', { to: 'title' }); return; }
  const ev = r.event || {};
  const win = r.position === 1;
  const podium = r.position <= 3;

  const standings = r.classified.map((c) => `
    <tr class="${c.isPlayer ? 'me' : ''}">
      <td class="p">${c.pos}</td>
      <td><span class="sw" style="background:#${c.livery.body.toString(16).padStart(6, '0')}"></span>${esc(c.name)}</td>
      <td class="t">${c.retired ? 'OUT' : c.time ? fmtTime(c.time) : 'DNF'}</td>
    </tr>`).join('');

  const objectiveRow = r.objective ? `
    <div class="card" style="border-color:${r.objectivePassed ? 'rgba(55,194,106,.6)' : 'rgba(255,66,66,.5)'}">
      <div class="stat">
        <span>${r.objectivePassed ? '✓ OBJECTIVE COMPLETE' : '✗ OBJECTIVE FAILED'}</span>
        <b class="${r.objectivePassed ? 'good' : 'bad'}">${esc(r.objective.label)}</b>
      </div>
    </div>` : '';

  const ladderRow = r.rankAfter != null ? `
    <div class="card">
      <div class="stat"><span>WORLD RANKING</span>
        <b class="${r.rankAfter < r.rankBefore ? 'good' : r.rankAfter > r.rankBefore ? 'bad' : ''}">
          ${fmtRank(r.rankBefore)} → ${fmtRank(r.rankAfter)}
        </b></div>
    </div>` : '';

  paint(`
    <div class="result-hero">
      <div class="result-pos" style="color:${win ? 'var(--warn)' : podium ? 'var(--ink)' : 'var(--dim)'}">
        ${r.retired ? 'OUT' : ordinal(r.position).replace(/^(\d+)/, '$1<small>').replace(/(st|nd|rd|th)$/, '$1</small>')}
      </div>
      <div class="result-tag">${esc(ev.title || 'RACE')} · ${esc(ev.subtitle || '')}</div>
    </div>

    ${objectiveRow}

    <div class="card">
      <div class="money-row plus"><span>PRIZE MONEY</span><b>${fmtMoney(r.prize)}</b></div>
      <div class="money-row ${r.hypeBonus ? 'plus' : ''}"><span>CROWD BONUS (${Math.round(r.hype)} HYPE)</span><b>${fmtMoney(r.hypeBonus)}</b></div>
      <div class="money-row ${r.damageBill ? 'minus' : ''}"><span>REPAIRS</span><b>${r.damageBill ? '-' + fmtMoney(r.damageBill) : '$0'}</b></div>
      <div class="money-row ${r.fines ? 'minus' : ''}">
        <span>STEWARDS' FINES (${r.investigations} INVESTIGATION${r.investigations === 1 ? '' : 'S'})</span>
        <b>${r.fines ? '-' + fmtMoney(r.fines) : '$0'}</b></div>
      <div class="money-row total"><span>NET</span><b class="${r.net >= 0 ? 'good' : 'bad'}">${fmtMoney(r.net)}</b></div>
    </div>

    ${ladderRow}

    <div class="grid two">
      <div class="card">
        <h3>THE RACE</h3>
        <div class="stat"><span>BEST LAP</span><b>${isFinite(r.bestLap) ? fmtTime(r.bestLap) : '--'}</b></div>
        <div class="stat"><span>OVERTAKES</span><b>${r.overtakes}</b></div>
        <div class="stat"><span>BIGGEST AIR</span><b>${(r.bestAir || 0).toFixed(1)}m</b></div>
        <div class="stat"><span>TIME SIDEWAYS</span><b>${(r.driftTime || 0).toFixed(1)}s</b></div>
      </div>
      <div class="card">
        <h3>THE PAPERWORK</h3>
        <div class="stat"><span>RIVALS WRECKED</span><b>${r.wrecksCaused}</b></div>
        <div class="stat"><span>PARTS KNOCKED OFF</span><b>${r.partsKnockedOff}</b></div>
        <div class="stat"><span>FOULS</span><b>${r.fouls} <small style="color:var(--good)">(${r.cleanFouls} passed as racing)</small></b></div>
        <div class="stat"><span>PEAK SUSPICION</span><b class="${r.suspicionPeak > 80 ? 'bad' : ''}">${Math.round(r.suspicionPeak)}</b></div>
      </div>
    </div>

    <div class="card">
      <h3>CLASSIFICATION</h3>
      <table class="standings">${standings}</table>
    </div>

    ${r.highlights && r.highlights.length ? `<button class="btn ghost" data-act="replay">▶ WATCH THE HIGHLIGHTS AGAIN<small>${r.highlights.length} MOMENTS</small></button>` : ''}
    <div class="btn-row">
      <button class="btn" data-act="again">RACE AGAIN</button>
      <button class="btn primary" data-act="next">${nextLabel(ev, r)}</button>
    </div>
  `, {
    again: () => emit('race:begin', ev),
    next: () => {
      if (ev.mode === 'story' && r.objectivePassed && ev.level < storyLength()) {
        emit('story:play', { level: ev.level + 1 });
      } else if (profile.chests.length) emit('nav', { to: 'chests' });
      else emit('nav', { to: ev.mode === 'story' ? 'story' : ev.mode === 'event' ? 'events' : 'quick' });
    },
    replay: () => emit('replay:again', r),
  });
}

function nextLabel(ev, r) {
  if (ev.mode === 'story' && r.objectivePassed && ev.level < storyLength()) return 'NEXT LEVEL ▸';
  if (profile.chests.length) return 'OPEN CRATES ▸';
  return 'CONTINUE ▸';
}

// ═══════════════════════════════ LADDER ═══════════════════════════════
export function renderLadder() {
  const t = rankTier();
  const pct = (1 - profile.rank / LADDER.population) * 100;
  const tiers = [
    ['WORLD CHAMPION', 1], ['TOP TEN', 10], ['HEADLINER', 100], ['CONTENDER', 1000],
    ['PRO CIRCUIT', 10000], ['SEMI-PRO', 60000], ['CLUB RACER', 150000], ['NOBODY', LADDER.population],
  ];
  const rows = tiers.map(([name, r]) => `
    <div class="stat" style="${profile.rank <= r ? '' : 'opacity:.42'}">
      <span>${name}</span><b>${profile.rank <= r ? '✓ ' : ''}TOP ${r.toLocaleString('en-US')}</b>
    </div>`).join('');

  paint(`
    ${topbar('WORLD LADDER', true)}
    <div class="card" style="text-align:center">
      <div style="font-size:clamp(34px,9vmin,80px);color:${t.css};font-weight:800">${fmtRank(profile.rank)}</div>
      <div class="result-tag">${t.name} · TOP ${pct.toFixed(pct > 99 ? 3 : 1)}%</div>
      <div class="bar" style="width:100%;height:10px;margin-top:12px">
        <i style="width:${clamp01(pct / 100) * 100}%;background:linear-gradient(90deg,#4aa3ef,${t.css})"></i>
      </div>
      <p style="color:var(--dim);font-size:13px;font-weight:500;margin:12px 0 0">
        ${LADDER.population.toLocaleString('en-US')} licensed drivers. You started at ${fmtRank(LADDER.startRank)}.
        Best you have ever been: ${fmtRank(profile.bestRank)}.</p>
    </div>
    <div class="card">${rows}</div>
    <div class="card">
      <h3>FAME</h3>
      <div class="stat"><span>LIFETIME CROWD HYPE</span><b>${Math.round(profile.fame).toLocaleString('en-US')}</b></div>
      <div class="stat"><span>FINES PAID</span><b class="bad">${fmtMoney(profile.stats.finesPaid)}</b></div>
      <div class="stat"><span>FOULS THAT PASSED AS RACING</span><b class="good">${profile.stats.cleanFouls}</b></div>
    </div>
    <button class="btn primary" data-act="race">RACE FOR POSITIONS</button>
  `, {
    back: () => emit('nav', { to: 'title' }),
    race: () => emit('nav', { to: 'quick' }),
  });
}

// ═══════════════════════════════ CAREER STATS ═══════════════════════════════
export function renderStats() {
  const s = profile.stats;
  const row = (k, v, cls) => `<div class="stat"><span>${k}</span><b class="${cls || ''}">${v}</b></div>`;
  paint(`
    ${topbar('CAREER', true)}
    <div class="grid two">
      <div class="card">
        <h3>RACING</h3>
        ${row('RACES', s.races)}
        ${row('WINS', s.wins, 'good')}
        ${row('PODIUMS', s.podiums)}
        ${row('DID NOT FINISH', s.dnf, 'bad')}
        ${row('LAPS COMPLETED', s.laps)}
        ${row('BIGGEST AIR', (s.bestAir || 0).toFixed(1) + 'm')}
        ${row('TIME SIDEWAYS', Math.round(s.driftTime || 0) + 's')}
      </div>
      <div class="card">
        <h3>THE OTHER BUSINESS</h3>
        ${row('RIVALS WRECKED', s.wrecksCaused, 'good')}
        ${row('PARTS KNOCKED OFF', s.partsOff)}
        ${row('FOULS COMMITTED', s.fouls)}
        ${row('PASSED AS RACING INCIDENTS', s.cleanFouls, 'good')}
        ${row('INVESTIGATIONS', s.investigations, 'bad')}
        ${row('FINES PAID', fmtMoney(s.finesPaid), 'bad')}
        ${row('EARNED', fmtMoney(s.moneyEarned), 'good')}
      </div>
    </div>
    <div class="card">
      <h3>COLLECTION</h3>
      ${row('CRATES OPENED', s.chestsOpened)}
      ${row('PARTS OWNED', `${profile.garage.parts.length} / ${PARTS.length}`)}
      ${row('TRICKS UNLOCKED', `${profile.garage.skills.length} / ${SKILLS.length}`)}
      ${row('SEASON PROGRESS', `${Math.max(0, (profile.story.level || 1) - 1)} / ${storyLength()}`)}
    </div>
    <button class="btn danger" data-act="wipe">DELETE CAREER</button>
  `, {
    back: () => emit('nav', { to: 'title' }),
    wipe: () => popup('DELETE CAREER?', '<p>Every part, every trick, a hundred levels of progress and your world ranking. There is no undo.</p>', [
      { label: 'KEEP IT', act: () => closePopup() },
      {
        label: 'DELETE', danger: true, act: () => {
          try { localStorage.removeItem('foulplay_save_v1'); } catch (e) { /* private mode */ }
          location.reload();
        },
      },
    ]),
  });
}

// ═══════════════════════════════ SETTINGS ═══════════════════════════════
export function renderSettings() {
  const s = profile.settings;
  const seg = (act, val, cur, label) => `<button class="btn-mini ${val === cur ? 'on' : ''}" data-act="${act}" data-v="${val}">${label}</button>`;
  paint(`
    ${topbar('SETTINGS', true)}
    <div class="card">
      <h3>STEERING</h3>
      <div class="btn-row" style="margin:8px 0">
        ${seg('steer', 'drag', s.steer, 'DRAG')}
        ${seg('steer', 'tilt', s.steer, 'TILT')}
        ${seg('steer', 'buttons', s.steer, 'BUTTONS')}
      </div>
      <p style="color:var(--dim);font-size:12px;font-weight:500">
        DRAG: hold anywhere on the left of the screen and slide. Pull down to brake and drift.<br>
        TILT: lean the phone. BUTTONS: on-screen arrows. Keyboard always works too.</p>
      ${s.steer === 'tilt' ? `
        <div class="stat" style="margin-top:8px"><span>TILT SENSITIVITY</span><b>${s.tiltSens.toFixed(1)}×</b></div>
        <input type="range" min="0.4" max="2.2" step="0.1" value="${s.tiltSens}" data-act="tiltsens" id="tiltsens" />
        <button class="btn-mini" data-act="recentre">RECENTRE TILT</button>` : ''}
    </div>
    <div class="card">
      <h3>ASSISTS</h3>
      <button class="item ${s.assist ? 'on' : ''}" data-act="toggle" data-k="assist">
        <span class="ic">🧭</span><span class="nm">STRAIGHTENING ASSIST<small>Stronger help getting the car pointed forward after a knock</small></span></button>
      <button class="item ${s.highlights ? 'on' : ''}" data-act="toggle" data-k="highlights">
        <span class="ic">🎬</span><span class="nm">HIGHLIGHTS REEL<small>Replay the best moments after every race</small></span></button>
      <button class="item ${s.camShake ? 'on' : ''}" data-act="toggle" data-k="camShake">
        <span class="ic">📳</span><span class="nm">CAMERA SHAKE</span></button>
      <button class="item ${s.haptics ? 'on' : ''}" data-act="toggle" data-k="haptics">
        <span class="ic">📱</span><span class="nm">VIBRATION</span></button>
    </div>
    <div class="card">
      <h3>SOUND</h3>
      <button class="item ${s.sfx ? 'on' : ''}" data-act="toggle" data-k="sfx"><span class="ic">🔊</span><span class="nm">EFFECTS</span></button>
      <button class="item ${s.music ? 'on' : ''}" data-act="toggle" data-k="music"><span class="ic">🎵</span><span class="nm">MUSIC</span></button>
    </div>
    <div class="card">
      <h3>DISPLAY</h3>
      <div class="btn-row" style="margin:8px 0">
        ${seg('quality', 'auto', s.quality, 'AUTO')}
        ${seg('quality', 'high', s.quality, 'HIGH')}
        ${seg('quality', 'low', s.quality, 'LOW')}
      </div>
      <div class="btn-row">
        ${seg('unit', 'kmh', s.speedUnit, 'KM/H')}
        ${seg('unit', 'mph', s.speedUnit, 'MPH')}
      </div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin-top:8px">Quality changes apply on the next race.</p>
    </div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    steer: (d) => {
      profile.settings.steer = d.v;
      saveProfile();
      if (d.v === 'tilt') import('./input.js').then((m) => m.enableTilt());
      const showArrows = d.v === 'buttons';
      ['pad-left', 'pad-right', 'pad-brake'].forEach((id) => $(id) && $(id).classList.toggle('hidden', !showArrows));
      renderSettings();
    },
    quality: (d) => { profile.settings.quality = d.v; saveProfile(); renderSettings(); },
    unit: (d) => { profile.settings.speedUnit = d.v; saveProfile(); renderSettings(); },
    toggle: (d) => { profile.settings[d.k] = !profile.settings[d.k]; saveProfile(); renderSettings(); },
    recentre: () => import('./input.js').then((m) => m.recentreTilt()),
    tiltsens: () => { },
  });
  const slider = $('tiltsens');
  if (slider) {
    slider.addEventListener('input', () => {
      profile.settings.tiltSens = parseFloat(slider.value);
      saveProfile();
    });
  }
}

// ═══════════════════════════════ PAUSE ═══════════════════════════════
export function renderPause() {
  const ev = state.event || {};
  paint(`
    <div style="height:6vh"></div>
    <h1 style="text-align:center">PAUSED</h1>
    <p style="text-align:center;color:var(--dim);letter-spacing:.16em;margin-bottom:3vh">
      ${esc(ev.title || '')} · ${esc(ev.subtitle || '')}</p>
    <div class="card">
      <div class="stat"><span>POSITION</span><b>${state.player ? state.player.position : '-'} / ${state.cars.length}</b></div>
      <div class="stat"><span>LAP</span><b>${state.player ? Math.min(state.player.lap + 1, state.laps) : 1} / ${state.laps}</b></div>
      <div class="stat"><span>SUSPICION</span><b class="${state.suspicion > 70 ? 'bad' : ''}">${Math.round(state.suspicion)}</b></div>
      <div class="stat"><span>CROWD</span><b>${Math.round(state.hype)}</b></div>
      ${ev.objective ? `<div class="stat"><span>OBJECTIVE</span><b>${esc(ev.objective.label)}</b></div>` : ''}
    </div>
    <button class="btn primary" data-act="resume">RESUME</button>
    <button class="btn" data-act="restart">RESTART RACE</button>
    <button class="btn ghost" data-act="settings">SETTINGS</button>
    <button class="btn danger" data-act="quit">RETIRE FROM THE RACE</button>
  `, {
    resume: () => import('./flow.js').then((m) => m.togglePause()),
    restart: () => import('./flow.js').then((m) => m.restartRace()),
    settings: () => renderSettings(),
    quit: () => import('./flow.js').then((m) => m.quitRace()),
  });
}

// ═══════════════════════════════ REPLAY OVERLAY ═══════════════════════════════
let replayBox = null;
export function showReplayOverlay(show) {
  if (!replayBox) {
    replayBox = document.createElement('div');
    replayBox.id = 'replay-overlay';
    replayBox.style.cssText = `position:fixed;inset:0;z-index:7;pointer-events:none;display:none;`;
    replayBox.innerHTML = `
      <div style="position:absolute;left:0;right:0;top:0;height:11vh;background:#05070a"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:11vh;background:#05070a"></div>
      <div id="replay-tag" style="position:absolute;left:4vw;bottom:13vh;font-size:clamp(15px,3vmin,32px);font-weight:800;letter-spacing:.06em;text-shadow:0 3px 12px #000"></div>
      <div id="replay-sub" style="position:absolute;left:4vw;bottom:calc(13vh + clamp(20px,4vmin,42px));font-size:clamp(9px,1.4vmin,13px);letter-spacing:.28em;color:var(--brand)"></div>
      <div style="position:absolute;right:4vw;top:13vh;font-size:clamp(10px,1.5vmin,14px);letter-spacing:.24em;color:#ff5a5a">● REPLAY</div>
      <button id="replay-skip" style="position:absolute;right:4vw;bottom:13vh;pointer-events:auto;padding:7px 16px;border:1px solid var(--line);border-radius:20px;background:rgba(10,14,20,.7);font-size:12px;letter-spacing:.16em">SKIP ▸</button>`;
    document.body.appendChild(replayBox);
    replayBox.querySelector('#replay-skip').addEventListener('click', () => emit('replay:skip'));
    on('replay:clip', ({ clip, index, total }) => {
      const tag = $('replay-tag'), sub = $('replay-sub');
      if (tag) tag.textContent = clip.label || clip.kind;
      if (sub) sub.textContent = `${clip.kind} · ${index + 1}/${total}`;
    });
  }
  replayBox.style.display = show ? 'block' : 'none';
}

// ═══════════════════════════════ POPUP ═══════════════════════════════
export function popup(title, bodyHtml, buttons) {
  const p = $('popup');
  $('popup-title').textContent = title;
  $('popup-body').innerHTML = bodyHtml;
  const row = $('popup-actions');
  row.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.primary ? ' primary' : b.danger ? ' danger' : ' ghost');
    btn.textContent = b.label;
    btn.addEventListener('click', () => { sfx('ui'); b.act(); });
    row.appendChild(btn);
  }
  p.classList.remove('hidden');
}

export function closePopup() { $('popup').classList.add('hidden'); }

function toast3(msg) {
  popup('NOT SO FAST', `<p>${esc(msg)}</p>`, [{ label: 'OK', primary: true, act: () => closePopup() }]);
}

export { toast3 as notify };
