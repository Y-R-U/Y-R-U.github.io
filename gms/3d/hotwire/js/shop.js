// Vega Motors (dealer) + Rico's Rides (upgrades/paint). Both open from
// world hotspots and from the title menu (out-of-game garage).

import { VEHICLES } from './vehicles.js';
import { P, saveProfile, carUpgrades } from './save.js';
import { fmtCash } from './utils.js';
import { CFG } from './config.js';
import * as audio from './audio.js';

const UP_DEFS = [
  { key: 'eng', name: 'Engine', desc: '+speed & acceleration', base: 400 },
  { key: 'tire', name: 'Tires', desc: '+grip & turn-in', base: 300 },
  { key: 'armor', name: 'Armor', desc: '+hull strength', base: 500 },
];
const PAINT_NAMES = ['Stock', 'Flame Red', 'Bay Blue', 'Serpent Green', 'Taxi Gold', 'Grape', 'Midnight', 'Pearl'];

export class Shop {
  constructor(ui) {
    this.ui = ui;
    this.onCarChanged = null;   // (carId) — main respawns the active car
  }

  dealer() {
    const ui = this.ui;
    const p = P();
    ui.modal('Vega Motors', (body) => {
      const grid = document.createElement('div');
      grid.className = 'shop-grid';
      body.append(grid);
      const maxTop = 30, maxHp = 500, maxGrip = 1.5;
      for (const [id, def] of Object.entries(VEHICLES)) {
        if (id === 'armored' && !p.ownedCars.includes('armored')) continue;   // ending unlock only
        const owned = p.ownedCars.includes(id);
        const card = document.createElement('div');
        card.className = 'shop-card' + (p.activeCar === id ? ' sel' : '');
        const bar = (v, max) => `<div class="statbar"><i style="width:${Math.round(v / max * 100)}%"></i></div>`;
        card.innerHTML = `<h4>${def.name}</h4>` +
          `<div class="price">${owned ? 'OWNED' : fmtCash(def.price)}</div>` +
          `<div class="desc">${def.desc}</div>` +
          `<div class="statlbl">speed</div>${bar(def.top, maxTop)}` +
          `<div class="statlbl">grip</div>${bar(def.grip, maxGrip)}` +
          `<div class="statlbl">armor</div>${bar(def.hp, maxHp)}`;
        const btn = document.createElement('button');
        btn.className = 'buy-btn' + (owned ? ' owned' : '');
        btn.textContent = owned ? (p.activeCar === id ? 'ACTIVE' : 'USE THIS') : 'BUY';
        btn.disabled = !owned && p.cash < def.price;
        btn.addEventListener('click', () => {
          if (!owned) {
            if (p.cash < def.price) return;
            p.cash -= def.price;
            p.ownedCars.push(id);
            audio.cashSound();
            this.ui.toast(`Bought ${def.name}!`);
          }
          p.activeCar = id;
          saveProfile();
          this.onCarChanged?.(id);
          this.dealer();   // re-render
        });
        card.append(btn);
        grid.append(card);
      }
    });
  }

  garage() {
    const ui = this.ui;
    const p = P();
    ui.modal("Rico's Rides", (body) => {
      // active car picker
      const pickRow = document.createElement('div');
      pickRow.className = 'set-row';
      pickRow.innerHTML = `<label>Working on</label>`;
      const sel = document.createElement('select');
      sel.style.cssText = 'background:#1c2836;color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:700';
      for (const id of p.ownedCars) {
        const o = document.createElement('option');
        o.value = id; o.textContent = VEHICLES[id]?.name || id;
        if (id === p.activeCar) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => { p.activeCar = sel.value; saveProfile(); this.onCarChanged?.(sel.value); this.garage(); });
      pickRow.append(sel);
      body.append(pickRow);

      const carId = p.activeCar;
      const u = carUpgrades(carId);
      for (const ud of UP_DEFS) {
        const row = document.createElement('div');
        row.className = 'up-row';
        const lvl = u[ud.key];
        const price = ud.base * (lvl + 1);
        row.innerHTML = `<div><b>${ud.name}</b><div class="desc" style="font-size:11px;color:rgba(255,255,255,.5)">${ud.desc}</div></div>` +
          `<div class="pips">${[0, 1, 2].map(i => `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('')}</div>`;
        const btn = document.createElement('button');
        btn.className = 'buy-btn';
        btn.style.width = 'auto';
        btn.textContent = lvl >= 3 ? 'MAX' : fmtCash(price);
        btn.disabled = lvl >= 3 || p.cash < price;
        btn.addEventListener('click', () => {
          if (lvl >= 3 || p.cash < price) return;
          p.cash -= price; u[ud.key]++;
          audio.cashSound(); saveProfile();
          this.onCarChanged?.(carId);
          this.garage();
        });
        row.append(btn);
        body.append(row);
      }
      // nitro
      const nrow = document.createElement('div');
      nrow.className = 'up-row';
      nrow.innerHTML = `<div><b>Nitro kit</b><div style="font-size:11px;color:rgba(255,255,255,.5)">⚡ button — short afterburner</div></div>`;
      const nbtn = document.createElement('button');
      nbtn.className = 'buy-btn' + (u.nitro ? ' owned' : '');
      nbtn.style.width = 'auto';
      nbtn.textContent = u.nitro ? 'FITTED' : fmtCash(800);
      nbtn.disabled = !u.nitro && p.cash < 800;
      nbtn.addEventListener('click', () => {
        if (u.nitro || p.cash < 800) return;
        p.cash -= 800; u.nitro = true;
        audio.cashSound(); saveProfile();
        this.onCarChanged?.(carId);
        this.garage();
      });
      nrow.append(nbtn);
      body.append(nrow);
      // paint
      const prow = document.createElement('div');
      prow.className = 'up-row';
      prow.innerHTML = '<div><b>Paint</b></div>';
      const dots = document.createElement('div');
      dots.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      CFG.colors.paint.forEach((c, i) => {
        const d = document.createElement('button');
        d.className = 'paint-dot' + (u.paint === i ? ' on' : '');
        d.title = PAINT_NAMES[i];
        d.style.background = c == null ? 'linear-gradient(135deg,#888,#ccc)' : '#' + c.toString(16).padStart(6, '0');
        d.addEventListener('click', () => {
          if (u.paint !== i) {
            if (i !== 0 && !u['paintPaid' + i]) {
              if (p.cash < 100) return;
              p.cash -= 100; u['paintPaid' + i] = true;
            }
            u.paint = i;
            audio.pickup(); saveProfile();
            this.onCarChanged?.(carId);
            this.garage();
          }
        });
        dots.append(d);
      });
      prow.append(dots);
      body.append(prow);
    });
  }
}
