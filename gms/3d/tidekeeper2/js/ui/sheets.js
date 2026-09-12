/* The bottom sheet: shop, care, logbook, shelf, tanks. Each renderer returns
   nothing and writes straight into #sh-body. */

import { $, el, money$, num, cap, plural, clamp } from '../util.js';
import { SPECIES, SP } from '../data/species.js';
import { PLANTS, DECOR, FOODS, PL, DEC, FD } from '../data/flora.js';
import { GEAR, GR, has } from '../data/gear.js';
import { SHELF, SH, SPECIES_RENOWN, TIER_CAP } from '../data/progress.js';
import { RELATIONS, REL, LORE } from '../data/relations.js';
import { TANKS, TK, bioloadTotal, bioCapacity, waterScore, isCycled, flowOf } from '../sim/tank.js';
import { evaluatePlacement } from '../sim/scoring.js';
import { drawSpecies } from './icons.js';
import { Audio } from '../audio.js';

const iconFor = sp => {
  const cv = el('canvas'); cv.width = 128; cv.height = 96;
  drawSpecies(cv, sp);
  return cv;
};

export function renderFish(G, UI, body) {
  const T = G.T;
  const pool = SPECIES.filter(s => G.speciesAvailable(s.id));
  const locked = SPECIES.filter(s => !G.speciesAvailable(s.id) && s.tier <= 5);
  body.innerHTML = '';
  if (!pool.length) { body.appendChild(el('div', 'c-d', 'Nothing available yet.')); return; }

  for (const sp of pool) {
    const ev = evaluatePlacement(T, sp.id, 1);
    const dot = ev.level === 'g' ? 'var(--green)' : ev.level === 'a' ? 'var(--amber)' : 'var(--red)';
    const own = T.fish.filter(f => f.alive && f.spId === sp.id).length;
    const afford = G.money >= sp.price;
    const c = el('div', 'card' + (UI.pick === sp.id ? ' sel' : '') + (afford ? '' : ' off'));
    c.appendChild(iconFor(sp));
    c.appendChild(el('div', 'c-main', `
      <div class="c-n"><span style="width:8px;height:8px;border-radius:9px;background:${dot};box-shadow:0 0 9px ${dot}"></span>
        ${sp.name}${own ? ` <span style="color:var(--dimmer);font-weight:600">×${own}</span>` : ''}</div>
      <div class="c-s">${sp.sci}</div>
      <div class="c-m">
        <span class="pill ${sp.water}">${sp.water === 'sw' ? 'Marine' : 'Fresh'}</span>
        <span class="pill">${sp.size} cm</span>
        <span class="pill">${cap(sp.zone)}</span>
        ${sp.school > 1 ? `<span class="pill">Group of ${sp.school}+</span>` : ''}
        ${sp.rarity >= 4 ? '<span class="pill rare">Rare</span>' : ''}
        ${sp.glow > 0.3 ? '<span class="pill glow">Glows</span>' : ''}
        ${sp.behaviour === 'predator' ? '<span class="pill pred">Predator</span>' : ''}
      </div>
      <div class="c-d">${sp.desc}</div>`));
    c.appendChild(el('div', 'c-p', `${money$(sp.price)}<small>appeal ${sp.appeal}</small>`));
    c.onclick = () => { Audio.click(); UI.selectSpecies(sp.id); };
    body.appendChild(c);
  }

  if (locked.length) {
    body.appendChild(el('h4', '', 'Not yet available'));
    for (const sp of locked) {
      const cost = SPECIES_RENOWN[sp.tier] || 99;
      const c = el('div', 'card' + (G.renown >= cost ? '' : ' off'));
      const cv = iconFor(sp); cv.style.filter = 'grayscale(1) brightness(.5)';
      c.appendChild(cv);
      c.appendChild(el('div', 'c-main', `
        <div class="c-n">${sp.name}</div>
        <div class="c-d">${sp.keeping || sp.desc}</div>
        <div class="c-m"><span class="pill">Tier ${sp.tier}</span>
          <span class="pill">${sp.water === 'sw' ? 'Marine' : 'Fresh'}</span></div>`));
      c.appendChild(el('div', 'c-p ren', `◆${cost}<small>unlock</small>`));
      c.onclick = () => {
        Audio.click();
        if (G.buySpeciesUnlock(sp.id)) { UI.toast(`${sp.name} unlocked.`); UI.renderSheet(); }
        else UI.toast('Not enough renown.');
      };
      body.appendChild(c);
    }
  }
}

export function renderPlants(G, UI, body) {
  const T = G.T;
  body.innerHTML = '';
  const pool = PLANTS.filter(p => p.water === T.water);
  for (const p of pool) {
    const c = el('div', 'card' + (G.money >= p.price ? '' : ' off'));
    c.appendChild(el('div', 'sw', '')).style.background =
      'linear-gradient(165deg,#1d6a2c,#0b2a16)';
    c.appendChild(el('div', 'c-main', `
      <div class="c-n">${p.name}</div><div class="c-s">${p.sci}</div>
      <div class="c-m"><span class="pill">Nitrate ${p.uptake.toFixed(1)}</span>
        <span class="pill">O₂ ${p.o2.toFixed(1)}</span>
        <span class="pill">${p.light < 0.35 ? 'Low light' : p.light < 0.65 ? 'Medium light' : 'High light'}</span>
        <span class="pill">Appeal ${p.appeal}</span></div>
      <div class="c-d">${p.desc}</div>`));
    c.appendChild(el('div', 'c-p', money$(p.price)));
    c.onclick = () => {
      Audio.click();
      if (G.money < p.price) return UI.toast('Not enough money.');
      G.money -= p.price;
      T.plants.push({ id: p.id, health: 0.85 });
      G.world.syncContents(T);
      G.alert('good', 'Planted', `<b>${p.name}</b> is in.`, 6);
      Audio.blip(520, 0.12, 'sine', 0.05);
      G.persist(); UI.renderSheet();
    };
    body.appendChild(c);
  }
}

export function renderDecor(G, UI, body) {
  const T = G.T;
  body.innerHTML = '';
  for (const d of DECOR.filter(x => x.water === 'any' || x.water === T.water)) {
    const c = el('div', 'card' + (G.money >= d.price ? '' : ' off'));
    const sw = el('div', 'sw');
    sw.style.background = d.kind === 'wood' ? 'linear-gradient(165deg,#6b4a30,#2a1a10)'
      : d.kind === 'anemone' ? 'linear-gradient(165deg,#d9707e,#4a1030)'
      : d.kind === 'coral' ? 'linear-gradient(165deg,#dd8f5c,#50201a)'
      : 'linear-gradient(165deg,#5a6058,#1d2320)';
    c.appendChild(sw);
    c.appendChild(el('div', 'c-main', `
      <div class="c-n">${d.name}</div>
      <div class="c-m"><span class="pill">Appeal ${d.appeal}</span>
        ${d.hides ? '<span class="pill">Shelter</span>' : ''}
        ${d.host ? '<span class="pill rare">Hosts clownfish</span>' : ''}
        ${d.living ? '<span class="pill">Living</span>' : ''}</div>
      <div class="c-d">${d.desc}</div>`));
    c.appendChild(el('div', 'c-p', money$(d.price)));
    c.onclick = () => {
      Audio.click();
      if (G.money < d.price) return UI.toast('Not enough money.');
      G.money -= d.price;
      T.decor.push({ id: d.id, health: 1 });
      G.world.syncContents(T);
      G.alert('good', 'Added', `<b>${d.name}</b> is in the tank.`, 6);
      if (d.host) G.discover('clown-anem');
      G.persist(); UI.renderSheet();
    };
    body.appendChild(c);
  }
}

export function renderGear(G, UI, body) {
  const T = G.T;
  body.innerHTML = '';
  for (const g of GEAR.filter(x => !x.water || x.water === T.water)) {
    const owned = has(T, g.id);
    const superseded = (g.group === 'filter' || g.group === 'light')
      && GEAR.some(o => o.group === g.group && o.tier > g.tier && has(T, o.id));
    const c = el('div', 'card' + (owned || superseded ? ' off' : G.money >= g.price ? '' : ' off'));
    const sw = el('div', 'sw'); sw.style.background = 'linear-gradient(165deg,#1d3a4a,#0a1a22)';
    c.appendChild(sw);
    c.appendChild(el('div', 'c-main', `
      <div class="c-n">${g.name}${owned ? ' <span class="pill" style="background:rgba(95,227,168,.2);color:#8ef0c4">Fitted</span>' : ''}</div>
      <div class="c-d">${g.desc}</div>`));
    c.appendChild(el('div', 'c-p', g.price ? money$(g.price) : '—'));
    c.onclick = () => {
      Audio.click();
      if (owned || superseded) return;
      if (G.money < g.price) return UI.toast('Not enough money.');
      G.money -= g.price;
      T.gear.add(g.id);
      if (g.group === 'filter' || g.group === 'light')
        GEAR.filter(o => o.group === g.group && o.tier < g.tier).forEach(o => T.gear.delete(o.id));
      G.alert('good', 'Fitted', `<b>${g.name}</b> is running.`, 5);
      if (g.id === 'wave' && T.fish.some(f => f.alive && (f.sp.fragile || f.sp.slowFeeder))) {
        G.alert('warn', 'Careful', 'A wavemaker in a tank with jellies or seahorses is a countdown.', 0);
        G.discover('jelly-flow');
      }
      Audio.blip(660, 0.2, 'triangle', 0.06);
      G.persist(); UI.renderSheet();
    };
    body.appendChild(c);
  }
}

export function renderCare(G, UI, body) {
  const T = G.T;
  const wc = Math.round(T.litres * 0.25 * 0.06) + 2;
  body.innerHTML = '';
  const row = (title, desc, price, fn, tint) => {
    const c = el('div', 'card');
    const sw = el('div', 'sw'); sw.style.background = tint; c.appendChild(sw);
    c.appendChild(el('div', 'c-main', `<div class="c-n">${title}</div><div class="c-d">${desc}</div>`));
    c.appendChild(el('div', 'c-p', money$(price)));
    c.onclick = () => { Audio.click(); fn(); UI.renderSheet(); };
    body.appendChild(c);
  };
  row('Water change · 25%',
    'Removes a quarter of everything dissolved in the tank and puts the pH back where it started. The most useful thing you can do, always.',
    wc, () => G.waterChange(0.25), 'linear-gradient(165deg,#17607d,#07222e)');
  row('Water change · 50%',
    'Emergency dose. Fast relief, but a big swing in chemistry is its own stress.',
    wc * 2, () => G.waterChange(0.5), 'linear-gradient(165deg,#1a7a9d,#07222e)');
  row('Siphon the substrate',
    'Pulls out settled waste, clears some algae and removes anything dead.',
    5, () => G.siphon(), 'linear-gradient(165deg,#4a4438,#181410)');
  row('Treat the tank',
    'Whole-tank medication. Clears ich over a couple of days and knocks your filter bacteria back about a fifth.',
    26, () => G.medicate(), 'linear-gradient(165deg,#5a2f6e,#1a0d22)');
  const food = el('div', 'card');
  const fsw = el('div', 'sw'); fsw.style.background = 'linear-gradient(165deg,#7a5a2a,#231a0c)';
  food.appendChild(fsw);
  food.appendChild(el('div', 'c-main', `<div class="c-n">Choose a food</div>
    <div class="c-d">The Feed button drops whatever suits this tank. Some animals will only take one particular thing.</div>`));
  food.onclick = () => { Audio.click(); UI.openSheet('feed'); };
  body.appendChild(food);

  body.appendChild(el('h4', '', 'Settings'));
  const box = el('div', '');
  box.style.padding = '4px 2px 10px';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px">
      <span style="color:var(--dim)">Target temperature</span><b class="mono" id="cr-t">${T.target.toFixed(1)} °C</b></div>
    <input type="range" id="cr-tr" min="16" max="31" step="0.5" value="${T.target}" style="width:100%;accent-color:#4fd0ff">
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin:14px 0 6px">
      <span style="color:var(--dim)">Flow</span><b class="mono" id="cr-f">${Math.round(T.flowUser * 100)}%</b></div>
    <input type="range" id="cr-fr" min="0" max="100" value="${Math.round(T.flowUser * 100)}" style="width:100%;accent-color:#4fd0ff">
    <div style="font-size:12px;color:var(--dimmer);margin-top:10px;line-height:1.45">
      Flow drives oxygen exchange and most fish like it. Seahorses and moon jellies do not survive it.</div>`;
  body.appendChild(box);
  if (G.can('autofeed')) {
    const af = el('div', 'card' + (T.autoFeed ? ' sel' : ''));
    const sw = el('div', 'sw'); sw.style.background = 'linear-gradient(165deg,#4a4020,#1a1408)';
    af.appendChild(sw);
    af.appendChild(el('div', 'c-main', `<div class="c-n">Auto-feeder ${T.autoFeed ? '· on' : '· off'}</div>
      <div class="c-d">Feeds a measured dose every day, and keeps this tank earning while the game is closed.</div>`));
    af.onclick = () => { Audio.click(); T.autoFeed = !T.autoFeed; G.persist(); UI.renderSheet(); };
    body.appendChild(af);
  }
  $('cr-tr').oninput = e => { T.target = +e.target.value; $('cr-t').textContent = (+e.target.value).toFixed(1) + ' °C'; };
  $('cr-fr').oninput = e => { T.flowUser = +e.target.value / 100; $('cr-f').textContent = e.target.value + '%'; };
}

export function renderShelf(G, UI, body) {
  body.innerHTML = '';
  body.appendChild(el('div', 'c-d', `You have <b style="color:var(--violet)">◆${Math.floor(G.renown)}</b> renown. It comes in slowly from visitors and in lumps from the things you achieve.`));
  for (const s of SHELF) {
    const owned = G.save.shelf.includes(s.id);
    const gated = s.req && !G.save.shelf.includes(s.req) && !G.can(s.req);
    const c = el('div', 'card' + (owned || gated || G.renown < s.cost ? ' off' : ''));
    const sw = el('div', 'sw');
    sw.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:26px;background:rgba(198,164,255,.12)';
    sw.textContent = s.icon;
    c.appendChild(sw);
    c.appendChild(el('div', 'c-main', `<div class="c-n">${s.name}${owned ? ' <span class="pill" style="background:rgba(95,227,168,.2);color:#8ef0c4">Bought</span>' : ''}</div>
      <div class="c-d">${gated ? 'Needs the one before it.' : s.desc}</div>`));
    c.appendChild(el('div', 'c-p ren', `◆${s.cost}`));
    c.onclick = () => {
      Audio.click();
      if (owned || gated) return;
      if (!G.buyShelf(s.id)) return UI.toast('Not enough renown.');
      UI.toast(s.name + ' — bought.');
      if (s.kind === 'tank') UI.openTankShop();
      else UI.renderSheet();
    };
    body.appendChild(c);
  }
}

export function renderTanks(G, UI, body) {
  body.innerHTML = '';
  G.tanks.forEach((T, i) => {
    const live = T.fish.filter(f => f.alive).length;
    const w = Math.round(waterScore(T));
    const c = el('div', 'card' + (i === G.active ? ' sel' : ''));
    const sw = el('div', 'sw');
    sw.style.background = `linear-gradient(165deg,${T.water === 'sw' ? '#0f4a66' : '#125440'},#04202c)`;
    c.appendChild(sw);
    c.appendChild(el('div', 'c-main', `
      <div class="c-n">${T.name}</div>
      <div class="c-m"><span class="pill ${T.water}">${T.water === 'sw' ? 'Marine' : 'Fresh'}</span>
        <span class="pill">${T.gal} gal</span><span class="pill">${plural(live, 'fish', 'fish')}</span>
        <span class="pill" style="color:${w > 80 ? '#8ef0c4' : w > 55 ? '#ffd98a' : '#ffb0b0'}">Water ${w}%</span>
        ${T.autoFeed ? '<span class="pill">Auto-feed</span>' : ''}</div>
      <div class="c-d">${T.nh3 > 0.1 ? 'The water has turned.' : T.no3 > 50 ? 'Nitrate is high.' : isCycled(T) ? 'Mature and stable.' : 'Still settling in.'}</div>`));
    c.appendChild(el('div', 'c-p', i === G.active ? '<small>viewing</small>' : '<small>view</small>'));
    c.onclick = () => { Audio.click(); G.showTank(i); UI.closeSheet(); };
    body.appendChild(c);
  });
  const slots = 1 + ['tank2', 'tank3', 'tank4', 'tank5', 'tank6'].filter(t => G.can(t) || G.save.shelf.includes(t)).length;
  if (G.tanks.length < slots) {
    body.appendChild(el('h4', '', 'Set up another tank'));
    for (const t of TANKS) {
      const c = el('div', 'card' + (G.money >= t.price ? '' : ' off'));
      const sw = el('div', 'sw'); sw.style.background = 'linear-gradient(165deg,#123a4a,#04202c)';
      c.appendChild(sw);
      c.appendChild(el('div', 'c-main', `<div class="c-n">${t.name}</div>
        <div class="c-d">${t.litres} litres. A bigger tank is a more forgiving one — the same mistake is diluted further.</div>`));
      c.appendChild(el('div', 'c-p', t.price ? money$(t.price) : 'free'));
      c.onclick = () => {
        Audio.click();
        if (G.money < t.price) return UI.toast('Not enough money.');
        if (G.can('marine')) UI.askWater(t);
        else { G.money -= t.price; G.addTank(t.id, 'fw', t.name); UI.closeSheet(); UI.toast('Tank set up. It starts empty and uncycled.'); }
      };
      body.appendChild(c);
    }
  } else if (G.tanks.length >= slots) {
    body.appendChild(el('div', 'c-d', 'Another tank slot is on the Shelf, bought with renown.'));
  }
}

export function renderLog(G, UI, body, tab) {
  body.innerHTML = '';
  if (tab === 'species') {
    const kept = Object.keys(G.save.kept).length;
    body.appendChild(el('div', 'c-d', `<b>${kept}</b> of ${SPECIES.length} species kept.`));
    for (const sp of SPECIES) {
      const seen = !!G.save.kept[sp.id];
      const c = el('div', 'card');
      if (!seen) c.style.opacity = '.45';
      const cv = iconFor(sp);
      if (!seen) cv.style.filter = 'grayscale(1) brightness(.45)';
      c.appendChild(cv);
      c.appendChild(el('div', 'c-main', seen ? `
        <div class="c-n">${sp.name}</div><div class="c-s">${sp.sci}</div>
        <div class="c-d">${sp.desc}<br><span style="color:var(--dimmer)">${sp.water === 'sw' ? 'Marine' : 'Fresh'} ·
        ${cap(sp.zone)} · ${sp.size} cm · ${sp.temp[0]}–${sp.temp[1]} °C · pH ${sp.ph[0]}–${sp.ph[1]} ·
        bioload ${sp.bioload} · ${sp.school > 1 ? 'group of ' + sp.school + '+' : 'keep singly'} ·
        ${cap(sp.diet)}</span><br><b>Keeping:</b> ${sp.keeping || '—'}</div>`
        : `<div class="c-n">Not yet kept</div><div class="c-d">Keep one to write this entry.</div>`));
      body.appendChild(c);
    }
    return;
  }
  const total = RELATIONS.length + Object.keys(LORE).length;
  const found = G.save.rels.length + G.save.lore.length;
  body.appendChild(el('div', 'c-d', `<b>${found}</b> of ${total} things learned. Most of them you have to have happen to you.`));
  for (const [id, l] of Object.entries(LORE)) {
    const got = G.save.lore.includes(id);
    body.appendChild(el('div', 'card', `<div class="c-main"><div class="c-n">${got ? l[0] : '???'}</div>
      <div class="c-d">${got ? l[1] : 'Not learned yet.'}</div></div>`));
  }
  for (const r of RELATIONS) {
    const got = G.save.rels.includes(r.id);
    body.appendChild(el('div', 'card', `<div class="c-main"><div class="c-n">${got ? r.title : '???'}</div>
      <div class="c-d">${got ? r.text : 'Something in this book has not happened to you yet.'}</div></div>`));
  }
}

export function renderFeed(G, UI, body) {
  const T = G.T;
  const diets = {};
  T.fish.filter(f => f.alive).forEach(f => diets[f.sp.diet] = (diets[f.sp.diet] || 0) + 1);
  const hungry = T.fish.filter(f => f.alive && f.hunger > 0.55).length;
  body.innerHTML = '';
  body.appendChild(el('div', 'c-d', hungry
    ? `<b style="color:var(--amber)">${plural(hungry, 'fish', 'fish')}</b> ${hungry === 1 ? 'is' : 'are'} hungry. Feed what clears in two minutes and no more.`
    : 'Nobody is hungry. Anything they do not eat sinks, rots, and comes back as ammonia.'));
  for (const f of FOODS) {
    const n = Object.keys(diets).filter(d => f.feeds.includes(d)).reduce((s, d) => s + diets[d], 0);
    const c = el('div', 'card' + (G.money >= f.price ? '' : ' off'));
    const sw = el('div', 'sw'); sw.style.background = 'linear-gradient(165deg,#7a5a2a,#231a0c)';
    c.appendChild(sw);
    c.appendChild(el('div', 'c-main', `<div class="c-n">${f.name}</div>
      <div class="c-m"><span class="pill">${n ? plural(n, 'eater') : 'nobody eats this'}</span>
        <span class="pill">${f.sink > 0.7 ? 'Sinks fast' : f.sink > 0.3 ? 'Sinks slowly' : 'Floats'}</span>
        <span class="pill">${f.waste > 1 ? 'Messy' : 'Clean'}</span></div>
      <div class="c-d">${f.desc}</div>`));
    c.appendChild(el('div', 'c-p', money$(f.price)));
    c.onclick = () => { Audio.click(); if (G.feed(f.id, 1)) UI.renderSheet(); };
    body.appendChild(c);
  }
}
