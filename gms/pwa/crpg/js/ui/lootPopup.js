// ===== Loot Popup =====
import { ITEMS } from '../config.js';

let _hideTimer = null;

export function showLootPopup(drops, gold) {
  const popup  = document.getElementById('loot-popup');
  const content = document.getElementById('loot-content');
  if (!popup || !content) return;

  let html = '<div style="font-size:14px;color:#f5a623;font-weight:bold;margin-bottom:4px">LOOT!</div>';
  if (gold > 0) html += `<div style="color:#f5a623">+${gold}g</div>`;
  for (const drop of drops) {
    const item = ITEMS[drop.id];
    if (!item) continue;
    html += `<div style="color:${item.color || '#ccc'}">${item.glyph} ${item.name}${drop.qty > 1 ? ` ×${drop.qty}` : ''}</div>`;
  }

  content.innerHTML = html;
  popup.classList.remove('hidden');

  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => popup.classList.add('hidden'), 2500);
}

export function hideLootPopup() {
  const popup = document.getElementById('loot-popup');
  if (popup) popup.classList.add('hidden');
}
