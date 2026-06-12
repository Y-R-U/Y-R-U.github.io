// HUD: potion counters, attack-style picker, inventory popup, pickup toasts.
// Styled popups only — no alert().

import { chime } from './utils.js';

const KINDS = {
  hpot:     { icon: '🧪', label: 'Health Potion', freq: 660, cls: 'hp' },
  mpot:     { icon: '🧪', label: 'Mana Potion',   freq: 720, cls: 'mp' },
  coin:     { icon: '🪙', label: 'Gold',          freq: 990 },
  sword:    { icon: '🗡️', label: 'Sword',         freq: 520 },
  bow:      { icon: '🏹', label: 'Bow',           freq: 560 },
  mushroom: { icon: '🍄', label: 'Mushroom',      freq: 780 },
};

const STYLES = [
  { id: 'sword',    icon: '⚔️', label: 'Melee' },
  { id: 'crossbow', icon: '🏹', label: 'Crossbow' },
  { id: 'staff',    icon: '🔮', label: 'Mage' },
];

const counts = {};
const chips = {};       // top-bar chips: potions only
const styleBtns = {};
let invGrid = null;

export function initUi({ onStyle } = {}) {
  for (const kind of Object.keys(KINDS)) counts[kind] = 0;

  // top-left: potion counters
  const inv = document.getElementById('inventory');
  for (const kind of ['hpot', 'mpot']) {
    const k = KINDS[kind];
    const chip = document.createElement('div');
    chip.className = `inv-chip pot-${k.cls}`;
    chip.innerHTML = `<span>${k.icon}</span><span class="cnt">0</span>`;
    inv.appendChild(chip);
    chips[kind] = chip;
  }

  // bottom-centre: attack-style picker
  const bar = document.getElementById('style-bar');
  for (const s of STYLES) {
    const b = document.createElement('button');
    b.className = 'style-btn';
    b.innerHTML = `<span class="ic">${s.icon}</span><span class="lb">${s.label}</span>`;
    b.addEventListener('click', () => {
      if (b.classList.contains('on')) return;
      setStyleActive(s.id);
      toast(`${s.icon} ${s.label} style`);
      chime(840);
      onStyle?.(s.id);
    });
    bar.appendChild(b);
    styleBtns[s.id] = b;
  }
  setStyleActive('sword');

  // inventory popup
  const panel = document.getElementById('inv-panel');
  panel.innerHTML = `
    <div class="dbg-header">
      <span class="dbg-title">🎒 Inventory</span>
      <button class="dbg-close" aria-label="Close">✕</button>
    </div>
    <div class="inv-grid"></div>
    <div class="inv-note">⚔️ melee · 🏹 bolts · 🔮 fireballs — pick a style below, then tap a chicken.</div>`;
  invGrid = panel.querySelector('.inv-grid');
  renderInv();
  panel.querySelector('.dbg-close').addEventListener('click', () => panel.classList.add('hidden'));
  document.getElementById('bag-btn').addEventListener('click', () => {
    renderInv();
    panel.classList.toggle('hidden');
  });

  setTimeout(() => document.getElementById('hint').classList.add('fade'), 6000);
}

export function setStyleActive(id) {
  for (const [s, b] of Object.entries(styleBtns)) b.classList.toggle('on', s === id);
}

function renderInv() {
  if (!invGrid) return;
  invGrid.innerHTML = '';
  for (const [kind, k] of Object.entries(KINDS)) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot' + (counts[kind] ? ' filled' : '');
    slot.innerHTML = `<span class="ic ${k.cls ? 'pot-' + k.cls : ''}">${k.icon}</span>
      <span class="ct">${counts[kind]}</span><span class="lb">${k.label}</span>`;
    invGrid.appendChild(slot);
  }
}

export function addPickup(kind, name) {
  const k = KINDS[kind];
  counts[kind]++;
  const chip = chips[kind];
  if (chip) {
    chip.querySelector('.cnt').textContent = counts[kind];
    chip.classList.add('has-items', 'bump');
    setTimeout(() => chip.classList.remove('bump'), 200);
  }
  renderInv();
  toast(`${k.icon} +1 ${name || k.label}`);
  chime(k.freq);
}

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

export const inventoryCounts = counts;
