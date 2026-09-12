/* ═══════════════════════════════════════════════════════════════════════════
   THE INTERFACE
   Every control is created only once the capability behind it exists, so the
   first minute of the game has a tank, a sentence and one button.
   ═══════════════════════════════════════════════════════════════════════════ */

import { $, el, money$, num, clamp, lerp, plural, cap, ago } from '../util.js';
import { CFG } from '../config.js';
import { SPECIES, SP } from '../data/species.js';
import { TANKS, TK, waterScore, daylight, isCycled, bioloadTotal, bioCapacity } from '../sim/tank.js';
import { evaluatePlacement } from '../sim/scoring.js';
import { Audio } from '../audio.js';
import { Modal } from './modal.js';
import { drawSpecies } from './icons.js';
import { Trip, tripCost } from '../game/expedition.js';
import * as Sheets from './sheets.js';

const ICONS = {
  feed:  '<path d="M4 8c3-2 6-2 8 0M6 12c3-2 6-2 8 0M4 16c3-2 6-2 8 0"/><circle cx="18" cy="7" r="1.3"/><circle cx="20" cy="12" r="1.3"/><circle cx="18" cy="17" r="1.3"/>',
  shop:  '<path d="M4 8h16l-1.4 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  care:  '<path d="M12 3s6 5.4 6 10a6 6 0 0 1-12 0c0-4.6 6-10 6-10z"/><path d="M9.5 13.5a2.6 2.6 0 0 0 2.5 2.4"/>',
  tanks: '<rect x="3" y="6" width="18" height="13" rx="1.6"/><path d="M3 11.5c2.8-1.6 5.6 1.6 8.4 0s5.8 1.6 9.6 0"/>',
  shelf: '<path d="M12 3l2.4 5.6L20 9.4l-4 4 1 6-5-2.9L7 19.4l1-6-4-4 5.6-.8z"/>',
  log:   '<path d="M4 5.2A2 2 0 0 1 6 3.4h5.2v17.2H6a2 2 0 0 1-2-1.8V5.2z"/><path d="M20 5.2a2 2 0 0 0-2-1.8h-5.2v17.2H18a2 2 0 0 0 2-1.8V5.2z"/>',
  trip:  '<circle cx="12" cy="12" r="8.4"/><path d="M15.4 8.6l-2 5.2-5.2 2 2-5.2z"/>',
  photo: '<path d="M3 8.4A2 2 0 0 1 5 6.6h2.3l1.2-2h7l1.2 2H19a2 2 0 0 1 2 1.8v9a2 2 0 0 1-2 1.8H5a2 2 0 0 1-2-1.8v-9z"/><circle cx="12" cy="12.6" r="3.4"/>',
};

export class UI {
  constructor(G) {
    this.G = G; G.ui = this;
    this.sheet = null; this.tab = null; this.pick = null;
    this.lastDock = ''; this.lastMeter = 0; this.logFlag = false;
    this.trip = null;
    $('sh-x').onclick = () => { Audio.click(); this.closeSheet(); };
    $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) this.closeSheet(); });
    window.addEventListener('keydown', e => this.key(e));
    this.buildVerdict();
  }
  get modalOpen() { return Modal.open; }

  buildVerdict() {
    const v = el('div'); v.id = 'verdict';
    v.innerHTML = '<span class="dot"></span><span class="txt"></span>';
    document.body.appendChild(v);
  }

  key(e) {
    const G = this.G;
    if (e.key === 'Escape') {
      if (Modal.open && Modal.dismissable) Modal.hide();
      else if (this.sheet) this.closeSheet();
      else if (G.photo) this.setPhoto(false);
      return;
    }
    if (Modal.open) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); G.setSpeed(G.paused ? 1 : 0); }
    if (k === '1') G.setSpeed(1);
    if (k === '3' && G.can('speed3')) G.setSpeed(3);
    if (k === 'f' && G.can('feed')) G.feed('flake', 1);
    if (k === 'b' && G.can('shelf1')) this.openSheet('shop', 'fish');
    if (k === 'c' && G.can('care')) this.openSheet('care');
  }

  /* ── the dock, rebuilt whenever the set of capabilities changes ───────── */
  syncDock() {
    const G = this.G;
    const items = [];
    if (G.can('feed')) items.push('speed');
    if (G.can('feed')) items.push('feed');
    if (G.can('shelf1')) items.push('shop');
    if (G.can('care')) items.push('care');
    if (G.can('tank2')) items.push('tanks');
    if (G.can('shelf1')) items.push('shelf');
    if (G.can('trips')) items.push('trip');
    if (G.can('logbook')) items.push('log');
    if (G.can('photo')) items.push('photo');
    const sig = items.join(',') + '|' + (G.can('speed3') ? 3 : 1);
    if (sig === this.lastDock) return;
    const fresh = this.lastDock !== '' ;
    const had = new Set(this.lastDock.split('|')[0].split(','));
    this.lastDock = sig;
    const d = $('dock-inner');
    d.innerHTML = '';
    $('dock').classList.toggle('on', items.length > 0);
    if (!items.length) return;
    for (const it of items) {
      if (it === 'speed') {
        const sp = el('div'); sp.id = 'speed';
        const speeds = G.can('speed3') ? [0, 1, 3] : [0, 1];
        for (const s of speeds) {
          const b = el('button', 'sp' + (G.speed === s ? ' on' : ''),
            s === 0 ? '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.6" height="14" rx="1.1"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.1"/></svg>' : s + '×');
          b.dataset.sp = s;
          b.onclick = () => { Audio.click(); G.setSpeed(s); };
          sp.appendChild(b);
        }
        d.appendChild(sp);
        d.appendChild(el('div', 'dk-sep'));
        continue;
      }
      const label = { feed: 'Feed', shop: 'Shop', care: 'Care', tanks: 'Tanks',
                      shelf: 'Shelf', log: 'Log', trip: 'Trips', photo: 'Photo' }[it];
      const b = el('button', 'dk' + (fresh && !had.has(it) ? ' fresh' : ''),
        `<svg viewBox="0 0 24 24">${ICONS[it]}</svg><span>${label}</span>`);
      b.dataset.k = it;
      b.onclick = () => { Audio.click(); this.dockClick(it); };
      d.appendChild(b);
    }
  }

  dockClick(k) {
    const G = this.G;
    switch (k) {
      case 'feed': {
        /* one tap feeds the food that suits this tank; the choice lives in Care */
        const id = G.bestFood();
        if (G.feed(id, 1)) this.toast('Fed — ' + { flake:'flake', pellet:'pellets', micro:'micro-feed', meaty:'frozen mysis', wafer:'an algae wafer' }[id]);
        break;
      }
      case 'shop':  this.openSheet('shop', 'fish'); break;
      case 'care':  this.openSheet('care'); break;
      case 'tanks': this.openSheet('tanks'); break;
      case 'shelf': this.openSheet('shelf'); break;
      case 'log':   this.logFlag = false; this.openSheet('log', 'species'); break;
      case 'trip':  this.openTrip(); break;
      case 'photo': this.setPhoto(!G.photo); break;
    }
  }

  onSpeed(s) {
    document.querySelectorAll('.sp').forEach(b => b.classList.toggle('on', +b.dataset.sp === s));
  }

  /* ── sheet ────────────────────────────────────────────────────────────── */
  openSheet(which, tab = null) {
    this.sheet = which; this.tab = tab; this.pick = null;
    $('sheet').classList.add('on');
    const tabs = {
      shop: [['fish', 'Fish'], ['plants', 'Plants'], ['decor', 'Hardscape'], ['gear', 'Equipment']],
      log: [['species', 'Species'], ['learned', 'Learned']],
    }[which] || [];
    const avail = tabs.filter(([k]) =>
      k !== 'plants' || this.G.can('plants')).filter(([k]) =>
      k !== 'decor' || this.G.can('decor')).filter(([k]) =>
      k !== 'gear' || this.G.can('gearshop'));
    $('sh-title').textContent = { shop: 'Shop', care: 'Care', feed: 'Feeding', tanks: 'Tanks',
      shelf: 'The Shelf', log: 'Logbook' }[which] || '';
    const tb = $('sh-tabs');
    tb.innerHTML = '';
    tb.style.display = avail.length > 1 ? '' : 'none';
    if (avail.length > 1) {
      if (!avail.some(([k]) => k === this.tab)) this.tab = avail[0][0];
      for (const [k, n] of avail) {
        const b = el('button', 'tab' + (this.tab === k ? ' on' : ''), n);
        b.onclick = () => { Audio.click(); this.tab = k; this.pick = null; this.hideVerdict(); this.openSheet(which, k); };
        tb.appendChild(b);
      }
    }
    $('sh-foot').style.display = 'none';
    this.renderSheet();
  }
  closeSheet() {
    this.sheet = null; this.pick = null;
    $('sheet').classList.remove('on');
    this.hideVerdict();
  }
  renderSheet() {
    const G = this.G, body = $('sh-body');
    $('sh-title').textContent = { shop: 'Shop', care: 'Care', feed: 'Feeding', tanks: 'Tanks',
      shelf: 'The Shelf', log: 'Logbook' }[this.sheet] || '';
    switch (this.sheet) {
      case 'shop':
        if (this.tab === 'plants') Sheets.renderPlants(G, this, body);
        else if (this.tab === 'decor') Sheets.renderDecor(G, this, body);
        else if (this.tab === 'gear') Sheets.renderGear(G, this, body);
        else Sheets.renderFish(G, this, body);
        break;
      case 'care':  Sheets.renderCare(G, this, body); break;
      case 'feed':  Sheets.renderFeed(G, this, body); break;
      case 'tanks': Sheets.renderTanks(G, this, body); break;
      case 'shelf': Sheets.renderShelf(G, this, body); break;
      case 'log':   Sheets.renderLog(G, this, body, this.tab); break;
    }
  }

  selectSpecies(id) {
    this.pick = id;
    this.renderSheet();
    const G = this.G, sp = SP[id];
    const ev = evaluatePlacement(G.T, id, 1);
    const v = $('verdict');
    v.className = 'on ' + ev.level;
    v.querySelector('.txt').innerHTML = ev.why;
    const foot = $('sh-foot');
    foot.style.display = '';
    foot.innerHTML = '';
    const counts = [1, 3, sp.school > 1 ? sp.school : 6];
    for (const n of [...new Set(counts)]) {
      const b = el('button', 'btn' + (n === counts[0] ? ' go' : ''),
        `Add ×${n} <span class="px">${money$(sp.price * n)}</span>`);
      b.onclick = () => {
        Audio.click();
        const got = G.buyFish(id, n);
        if (!got) return this.toast('Not enough money.');
        G.alert(ev.level === 'r' ? 'warn' : 'good', 'Stocked',
          `${plural(got, sp.name)} added.${ev.rel && ev.level !== 'g' ? ' ' + ev.why : ''}`, 4);
        if (ev.rel && ev.level === 'r') G.discover(ev.rel);
        this.renderSheet(); this.selectSpecies(id);
      };
      foot.appendChild(b);
    }
  }
  hideVerdict() { $('verdict')?.classList.remove('on'); }

  /* ── the very first fish: a tiny sheet with three gentle options ──────── */
  openFirstFish() {
    const G = this.G;
    const body = el('div');
    const picks = el('div', 'picks');
    for (const id of ['betta', 'guppy', 'danio']) {
      const sp = SP[id];
      const p = el('button', 'pick');
      const cv = el('canvas'); cv.width = 280; cv.height = 168;
      drawSpecies(cv, sp);
      p.appendChild(cv);
      p.appendChild(el('b', '', sp.name));
      p.appendChild(el('span', '', sp.keeping));
      p.onclick = () => {
        Audio.click();
        G.buyFish(id, id === 'betta' ? 1 : 3, true);
        if (id !== 'betta') { G.save.unlockedSpecies = G.save.unlockedSpecies || []; }
        Modal.hide();
        const f = G.T.fish[0];
        if (f) { G.setFollow(f); setTimeout(() => G.setFollow(null), 5200); }
        G.persist();
      };
      picks.appendChild(p);
    }
    body.appendChild(picks);
    Modal.show({ kicker: 'Your first fish', title: 'Pick one', sub: 'On the house. You can keep the others later.',
      body, buttons: [], dismissable: false });
  }

  openTankShop() { this.openSheet('tanks'); }

  askWater(t) {
    const G = this.G;
    Modal.show({ kicker: 'New tank', title: t.name, sub: 'Fresh water or salt?',
      body: '<p>Salt water is narrower in every direction — temperature, chemistry, and what forgives a mistake. It is also where the reef fish live.</p>',
      buttons: [
        ['Fresh water', () => { Modal.hide(); G.money -= t.price; G.addTank(t.id, 'fw', t.name); this.closeSheet(); }, 'go'],
        ['Salt water', () => { Modal.hide(); G.money -= t.price; G.addTank(t.id, 'sw', t.name + ' · Marine'); this.closeSheet(); }, ''],
        ['Cancel', () => Modal.hide(), 'quiet'],
      ] });
  }

  /* ── collecting trips ─────────────────────────────────────────────────── */
  openTrip() {
    const G = this.G;
    const cost = tripCost(G.stats.trips);
    if (this.trip && !this.trip.over) return this.showTripStage();
    Modal.show({
      kicker: 'Collecting trip', title: 'Fund a trip',
      sub: `Three stops. One choice at each. Whatever survives the trip is yours to keep for good.`,
      body: `<p>The boat leaves with <b>100 condition</b>. Rare animals cost condition to catch and hold; camping restores it. If it reaches zero the trip comes home with nothing.</p>`,
      buttons: [
        [`Fund it · ${money$(cost)}`, () => {
          if (G.money < cost) { Modal.hide(); return this.toast('Not enough money.'); }
          G.money -= cost;
          this.trip = new Trip(G);
          this.showTripStage();
        }, 'go'],
        ['Not now', () => Modal.hide(), 'quiet'],
      ] });
  }
  showTripStage() {
    const t = this.trip;
    if (t.over) return this.showTripResult();
    const cards = t.offer();
    const body = el('div');
    body.appendChild(el('div', 'prog', `<i style="width:${t.condition}%"></i>`));
    body.appendChild(el('div', 'c-d', `Condition <b>${t.condition}</b> · stop ${t.stage + 1} of 3`));
    const picks = el('div', 'picks');
    for (const c of cards) {
      const p = el('button', 'pick');
      p.appendChild(el('div', 'ic', c.icon));
      p.appendChild(el('b', '', c.title));
      p.appendChild(el('span', '', c.body));
      p.onclick = () => { Audio.click(); t.choose(c); this.showTripStage(); };
      picks.appendChild(p);
    }
    body.appendChild(picks);
    Modal.show({ kicker: `Stop ${t.stage + 1}`, title: 'Which way?', body, buttons: [], dismissable: false });
  }
  showTripResult() {
    const rows = this.trip.settle();
    const won = this.trip.won;
    const body = el('div');
    for (const r of rows) body.appendChild(el('div', 'reward',
      `<div class="rw-ic">${r.ic}</div><div><b>${r.b}</b><span>${r.s}</span></div>`));
    Modal.show({ kicker: won ? 'Home safe' : 'Lost at sea', title: won ? 'The boat is back' : 'Nothing came back',
      body, buttons: [['Good', () => { Modal.hide(); this.trip = null; }, 'go']] });
    won ? Audio.fanfare() : Audio.chime(false);
    this.trip.over = true;
  }

  /* ── reward popups from goals ─────────────────────────────────────────── */
  drainRewards() {
    const G = this.G;
    while (G.pending.length) {
      const r = G.pending.shift();
      const body = el('div');
      if (r.note) body.appendChild(el('p', '', r.note));
      for (const g of r.gained) body.appendChild(el('div', 'reward',
        `<div class="rw-ic">${g.ic}</div><div><b>${g.b}</b><span>${g.s}</span></div>`));
      Modal.push({ kicker: 'Done', title: r.title, body });
    }
    Audio.fanfare();
  }

  /* ── alerts, toasts, cards ────────────────────────────────────────────── */
  pushAlert(kind, key, html) {
    const a = el('div', 'alert ' + kind, `<span class="k">${key}</span>${html}`);
    $('alerts').appendChild(a);
    setTimeout(() => { a.classList.add('fade'); setTimeout(() => a.remove(), 460); }, kind === 'bad' ? 9500 : 7000);
    while ($('alerts').children.length > 4) $('alerts').firstChild.remove();
  }
  toast(msg, ms = 1900) {
    const t = $('toast');
    t.textContent = msg; t.className = 'on';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.className = '', ms);
  }
  flagLogbook() { this.logFlag = true; }
  flashVitals() {
    const v = $('top-left');
    v.style.transition = 'transform .4s var(--ease)';
    v.style.transform = 'scale(1.12)';
    setTimeout(() => v.style.transform = '', 420);
  }
  onTankChanged() { this.renderRail(); if (this.sheet) this.renderSheet(); }
  onFollow(f) { /* the fish card doubles as the follow indicator */ }

  showFishCard(f) {
    this.G.selected = f;
    $('fishcard').classList.add('on');
    this.renderFishCard();
  }
  hideFishCard() { $('fishcard').classList.remove('on'); }
  renderFishCard() {
    const G = this.G, f = G.selected;
    if (!f || !G.T.fish.includes(f)) { this.hideFishCard(); return; }
    const pct = v => Math.round(v * 100) + '%';
    const bar = (label, v, good) => `<div class="fc-r"><span>${label}</span><b style="color:${
      (good ? v > 0.6 : v < 0.4) ? 'var(--green)' : (good ? v > 0.3 : v < 0.7) ? 'var(--amber)' : 'var(--red)'}">${pct(v)}</b></div>`;
    const MOOD = { cruise:'Cruising', stalk:'Stalking', strike:'Striking', flee:'Fleeing', feed:'Feeding',
      hide:'Hiding', shelter:'Sheltering', host:'In the anemone', graze:'Working the sand', patrol:'Patrolling',
      chase:'Chasing', clean:'Cleaning a client', forage:'Foraging', drift:'Drifting', cling:'Holding on' };
    let note = '';
    if (!f.alive) note = 'Dead. Get it out before the ammonia does the rest.';
    else if (f.sick > 0.05) note = 'Showing ich. Treat the tank and fix what stressed it.';
    else if (f.hunger > 0.8) note = f.sp.slowFeeder ? 'Starving — too slow to compete at dinner.' : 'Hungry.';
    else if (f.finDamage > 0.2) note = 'Fins shredded. Something in here is nipping.';
    else if (f.stress > 0.7) note = 'Badly stressed. Check the water and its company.';
    else if (f.sp.school > 1 && G.T.fish.filter(x => x.alive && x.spId === f.spId).length < f.sp.school)
      note = 'It wants more of its own kind before it will settle.';
    else if (f.hostDecor) note = 'Hosted. This is the happiest a clownfish gets.';
    const acts = [`<button class="btn sm" data-a="follow">${G.orbit.follow === f ? 'Stop following' : 'Follow'}</button>`];
    if (G.can('moveFish') && G.tanks.length > 1) acts.push('<button class="btn sm" data-a="move">Move</button>');
    if (G.can('care')) acts.push('<button class="btn sm quiet" data-a="sell">Rehome</button>');
    $('fishcard').innerHTML = `
      <div class="fc-n">${f.sp.name}</div><div class="fc-s">${f.sp.sci}</div>
      <div class="fc-r"><span>Doing</span><b>${MOOD[f.mood] || 'Swimming'}</b></div>
      <div class="fc-r"><span>Length</span><b>${f.len.toFixed(1)} / ${f.sp.size} cm</b></div>
      ${bar('Condition', f.health, true)}${bar('Fullness', 1 - clamp(f.hunger, 0, 1), true)}
      ${f.stress > 0.05 ? bar('Stress', clamp(f.stress, 0, 1), false) : ''}
      ${f.finDamage > 0.02 ? bar('Fin damage', f.finDamage, false) : ''}
      ${f.sick > 0.02 ? bar('Illness', clamp(f.sick, 0, 1), false) : ''}
      ${note ? `<div class="fc-mood">${note}</div>` : ''}
      <div class="fc-acts">${acts.join('')}</div>`;
    $('fishcard').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      Audio.click();
      const a = b.dataset.a;
      if (a === 'follow') G.setFollow(G.orbit.follow === f ? null : f);
      if (a === 'sell') G.sellFish(f);
      if (a === 'move') this.askMove(f);
      this.renderFishCard();
    });
  }
  askMove(f) {
    const G = this.G;
    const body = el('div');
    G.tanks.forEach((T, i) => {
      if (i === G.active) return;
      const ev = evaluatePlacement(T, f.spId, 1);
      const c = el('div', 'card');
      const sw = el('div', 'sw');
      sw.style.background = `linear-gradient(165deg,${T.water === 'sw' ? '#0f4a66' : '#125440'},#04202c)`;
      c.appendChild(sw);
      c.appendChild(el('div', 'c-main', `<div class="c-n">${T.name}</div><div class="c-d">${ev.why}</div>`));
      c.onclick = () => { Audio.click(); Modal.hide(); G.moveFish(f, i); };
      body.appendChild(c);
    });
    Modal.show({ kicker: 'Move', title: `Where should the ${f.sp.name.toLowerCase()} go?`,
      body, buttons: [['Cancel', () => Modal.hide(), 'quiet']] });
  }

  /* ── the tank rail ────────────────────────────────────────────────────── */
  renderRail() {
    const G = this.G, r = $('rail');
    if (G.tanks.length < 2) { r.classList.remove('on'); return; }
    r.classList.add('on');
    r.innerHTML = '';
    G.tanks.forEach((T, i) => {
      const w = waterScore(T);
      const b = el('button', 'rail-t' + (i === G.active ? ' on' : '') + (w < 50 ? ' bad' : w < 78 ? ' warn' : ''),
        `<span>${T.gal}g</span><i style="width:${clamp(w, 4, 100)}%"></i>` +
        (T.fish.some(f => !f.alive) || w < 50 ? '<span class="pip"></span>' : ''));
      b.onclick = () => { Audio.click(); G.showTank(i); };
      r.appendChild(b);
    });
  }

  /* ── the meters ───────────────────────────────────────────────────────── */
  update() {
    const G = this.G;
    if (!G.T) return;
    this.syncDock();
    const now = performance.now();
    if (now - this.lastMeter < 200) return;
    this.lastMeter = now;
    const T = G.T;

    $('money').textContent = money$(G.money);
    $('top-right').classList.add('on');
    $('renown-wrap').classList.toggle('on', G.renown >= 1 || G.save.shelf.length > 0);
    $('renown').textContent = Math.floor(G.renown);
    $('visitors').textContent = G.can('shelf1') ? `${num(G.visitorRate)} visitors/hr` : '';

    if (G.totalFishEverAdded > 0) {
      $('top-left').classList.add('on');
      $('tank-name').textContent = T.name;
      const w = waterScore(T);
      const rows = [ring('Water', w, w > 80 ? '#5fe3a8' : w > 55 ? '#ffc266' : '#ff7676', Math.round(w) + '%') ];
      if (G.can('shelf1')) rows.push(ring('Appeal', clamp(G.appeal / 12, 0, 100), '#ffcf7a', num(G.appeal)));
      if (G.can('testkit')) {
        rows.push(chip('NH₃', T.nh3.toFixed(2), T.nh3 < 0.05 ? '#5fe3a8' : T.nh3 < 0.2 ? '#ffc266' : '#ff7676'));
        rows.push(chip('NO₂', T.no2.toFixed(2), T.no2 < 0.05 ? '#5fe3a8' : T.no2 < 0.2 ? '#ffc266' : '#ff7676'));
        rows.push(chip('NO₃', Math.round(T.no3), T.no3 < 25 ? '#5fe3a8' : T.no3 < 50 ? '#ffc266' : '#ff7676'));
        rows.push(chip('°C', T.temp.toFixed(1), '#9ab6c6'));
        rows.push(chip('pH', T.ph.toFixed(1), '#9ab6c6'));
        rows.push(chip('Filter', Math.round(Math.min(T.bactA, T.bactN) * 100) + '%',
          Math.min(T.bactA, T.bactN) > 0.7 ? '#5fe3a8' : '#ffc266'));
      }
      $('vitals').innerHTML = rows.join('');
    }
    if (G.selected) this.renderFishCard();
    this.renderRail();
    const logBtn = document.querySelector('.dk[data-k="log"]');
    if (logBtn) {
      const has = !!logBtn.querySelector('.pip');
      if (this.logFlag && !has) logBtn.appendChild(el('span', 'pip'));
      if (!this.logFlag && has) logBtn.querySelector('.pip').remove();
    }
    if (this.pick && this.sheet === 'shop' && this.tab === 'fish') {
      const ev = evaluatePlacement(T, this.pick, 1);
      const v = $('verdict');
      const cls = 'on ' + ev.level;
      if (v.className !== cls) v.className = cls;
      const txt = v.querySelector('.txt');
      if (txt.innerHTML !== ev.why) txt.innerHTML = ev.why;
    }
  }

  /* ── photo mode ───────────────────────────────────────────────────────── */
  initPhoto(post) {
    this.post = post;
    const p = el('div'); p.id = 'photo';
    p.innerHTML = `
      <div class="pc"><label>Focus</label><input type="range" id="ph-f" min="0" max="100" value="40"></div>
      <div class="pc"><label>Blur</label><input type="range" id="ph-a" min="0" max="100" value="45"></div>
      <div class="pc"><label>Exposure</label><input type="range" id="ph-e" min="0" max="100" value="50"></div>
      <div class="pc"><label>Look</label><div class="looks" id="ph-l"></div></div>
      <button class="btn go" id="ph-save">Save frame</button>
      <button class="btn quiet" id="ph-exit">Done</button>`;
    document.body.appendChild(p);
    const looks = ['Natural', 'Warm', 'Cold', 'Silver', 'Vivid'];
    $('ph-l').innerHTML = looks.map((l, i) => `<button class="lk${i === 0 ? ' on' : ''}" data-l="${i}">${l}</button>`).join('');
    $('ph-l').querySelectorAll('.lk').forEach(b => b.onclick = () => {
      Audio.click();
      $('ph-l').querySelectorAll('.lk').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      post.grade.uniforms.uLook.value = +b.dataset.l;
    });
    const sync = () => {
      const dist = this.G.orbit.dist;
      post.grade.uniforms.uFocus.value = lerp(dist * 0.45, dist * 1.4, +$('ph-f').value / 100);
      post.grade.uniforms.uAperture.value = Math.pow(+$('ph-a').value / 100, 1.3) * 1.1;
      post.grade.uniforms.uExposure.value = 0.6 + (+$('ph-e').value / 100) * 0.95;
    };
    ['ph-f', 'ph-a', 'ph-e'].forEach(id => $(id).oninput = sync);
    this.photoSync = sync;
    $('ph-exit').onclick = () => { Audio.click(); this.setPhoto(false); };
    $('ph-save').onclick = () => { Audio.click(); this.savePhoto(); };
  }
  setPhoto(on) {
    const G = this.G;
    G.photo = on;
    $('photo').classList.toggle('on', on);
    for (const id of ['dock', 'top-left', 'top-right', 'rail', 'fishcard', 'alerts', 'prompt', 'shelf']) {
      const e = $(id);
      if (!e) continue;
      e.style.opacity = on ? '0' : '';
      e.style.pointerEvents = on ? 'none' : '';
    }
    if (on) { this.closeSheet(); this.toast('Drag to frame. Sliders set the focus.'); this.photoSync?.(); }
    else { this.post.grade.uniforms.uAperture.value = 0.16; this.post.grade.uniforms.uLook.value = 0; }
  }
  savePhoto() {
    try {
      this.G.renderOnce();
      const a = el('a');
      a.href = this.G.renderer.domElement.toDataURL('image/png');
      a.download = `tidekeeper-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      this.toast('Frame saved');
    } catch (e) { this.toast('Could not save the frame'); }
  }
}

function ring(label, pct, col, txt) {
  const r = 8, c = 2 * Math.PI * r;
  const off = c * (1 - clamp(pct, 0, 100) / 100);
  return `<div class="vit"><svg class="ring" viewBox="0 0 20 20">
    <circle class="bg" cx="10" cy="10" r="${r}"></circle>
    <circle cx="10" cy="10" r="${r}" stroke="${col}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
    </svg><span><small>${label}</small><br><b style="color:${col}">${txt}</b></span></div>`;
}
function chip(label, val, col) {
  return `<div class="vit"><span><small>${label}</small><br><b style="color:${col}">${val}</b></span></div>`;
}
