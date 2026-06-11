// HUD: inventory chips, pickup toasts, fading hint. Styled popups only — no alert().

import { chime } from './utils.js';

const KINDS = {
  coin:     { icon: '🪙', label: 'Gold',     freq: 990 },
  potion:   { icon: '🧪', label: 'Potion',   freq: 660 },
  sword:    { icon: '🗡️', label: 'Sword',    freq: 520 },
  mushroom: { icon: '🍄', label: 'Mushroom', freq: 780 },
};

const counts = {};
const chips = {};

export function initUi() {
  const inv = document.getElementById('inventory');
  for (const [kind, k] of Object.entries(KINDS)) {
    counts[kind] = 0;
    const chip = document.createElement('div');
    chip.className = 'inv-chip';
    chip.innerHTML = `<span>${k.icon}</span><span class="cnt">0</span>`;
    inv.appendChild(chip);
    chips[kind] = chip;
  }
  setTimeout(() => document.getElementById('hint').classList.add('fade'), 6000);
}

export function addPickup(kind, name) {
  const k = KINDS[kind];
  counts[kind]++;
  const chip = chips[kind];
  chip.querySelector('.cnt').textContent = counts[kind];
  chip.classList.add('has-items', 'bump');
  setTimeout(() => chip.classList.remove('bump'), 200);
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
