// ===== Inventory Panel UI =====
import { ITEMS } from '../config.js';
import { getState, equipItem, unequipItem, addToBackpack } from '../state.js';
import { useItem } from '../skills/tasks.js';

const EQUIP_SLOTS = [
  { id:'head',    label:'Head',    glyph:'[' },
  { id:'chest',   label:'Chest',   glyph:']' },
  { id:'legs',    label:'Legs',    glyph:']' },
  { id:'hands',   label:'Hands',   glyph:')' },
  { id:'feet',    label:'Feet',    glyph:'_' },
  { id:'weapon',  label:'Weapon',  glyph:'/' },
  { id:'offhand', label:'Shield',  glyph:')' },
  { id:'ring',    label:'Ring',    glyph:'o' },
  { id:'amulet',  label:'Amulet',  glyph:'+' },
];

let _currentItemPopup = null;

export function renderInventory() {
  _renderEquipSlots();
  _renderBackpack();
}

function _renderEquipSlots() {
  const grid = document.getElementById('equip-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const st = getState();

  for (const slot of EQUIP_SLOTS) {
    const equipped = st.inventory.equipped[slot.id];
    const itemDef  = equipped ? ITEMS[equipped.id] : null;

    const el = document.createElement('div');
    el.className = 'equip-slot' + (equipped ? ' has-item' : '');
    el.innerHTML = `
      <div class="slot-item-glyph" style="color:${itemDef?.color || '#555'}">${itemDef ? itemDef.glyph : slot.glyph}</div>
      <div class="slot-label">${itemDef ? itemDef.name.slice(0,8) : slot.label}</div>
    `;
    el.addEventListener('click', () => {
      if (equipped) _showItemPopup(equipped.id, 'equipped', slot.id);
    });
    grid.appendChild(el);
  }
}

function _renderBackpack() {
  const grid = document.getElementById('backpack-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const st = getState();

  for (let i = 0; i < st.inventory.backpack.length; i++) {
    const slot = st.inventory.backpack[i];
    const itemDef = slot ? ITEMS[slot.id] : null;

    const el = document.createElement('div');
    el.className = 'inv-slot' + (slot ? ' has-item' : '');
    if (itemDef) {
      el.innerHTML = `
        <div class="inv-item-glyph" style="color:${itemDef.color || '#ccc'}">${itemDef.glyph}</div>
        <div class="inv-item-name">${itemDef.name.slice(0,10)}</div>
        ${slot.qty > 1 ? `<div class="inv-item-qty">${slot.qty}</div>` : ''}
      `;
      el.addEventListener('click', () => _showItemPopup(slot.id, 'backpack', i));
    }
    grid.appendChild(el);
  }
}

function _showItemPopup(itemId, source, sourceIndex) {
  const popup = document.getElementById('item-popup');
  const content = document.getElementById('item-popup-content');
  if (!popup || !content) return;

  const item = ITEMS[itemId];
  if (!item) return;

  _currentItemPopup = { itemId, source, sourceIndex };

  const statLines = [];
  if (item.atkBonus) statLines.push(`+${item.atkBonus} Attack`);
  if (item.defBonus) statLines.push(`+${item.defBonus} Defence`);
  if (item.magBonus) statLines.push(`+${item.magBonus} Magic`);
  if (item.rngBonus) statLines.push(`+${item.rngBonus} Ranged`);
  if (item.heal)     statLines.push(`Heals +${item.heal} HP`);
  if (item.reqAtk)   statLines.push(`Req Attack ${item.reqAtk}`);
  if (item.reqDef)   statLines.push(`Req Defence ${item.reqDef}`);
  if (item.reqMag)   statLines.push(`Req Magic ${item.reqMag}`);
  if (item.reqRng)   statLines.push(`Req Ranged ${item.reqRng}`);
  if (item.value)    statLines.push(`Value: ${item.value}g`);

  let btns = '';
  if (source === 'backpack') {
    if (item.slot) btns += `<button class="item-popup-btn" id="ipop-equip">Equip</button>`;
    if (item.type === 'food' || item.type === 'potion') btns += `<button class="item-popup-btn" id="ipop-use">Use</button>`;
    btns += `<button class="item-popup-btn danger" id="ipop-drop">Drop</button>`;
  } else {
    btns += `<button class="item-popup-btn" id="ipop-unequip">Unequip</button>`;
  }
  btns += `<button class="item-popup-btn" id="ipop-close">Close</button>`;

  content.innerHTML = `
    <div class="item-popup-name" style="color:${item.color || '#fff'}">${item.glyph} ${item.name}</div>
    <div class="item-popup-desc">${statLines.join(' · ')}</div>
    <div class="item-popup-btns">${btns}</div>
  `;

  popup.classList.remove('hidden');

  document.getElementById('ipop-close')?.addEventListener('click', closeItemPopup);
  document.getElementById('ipop-equip')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    equipItem(item, item.slot);
    closeItemPopup();
    renderInventory();
  });
  document.getElementById('ipop-unequip')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    unequipItem(sourceIndex);
    closeItemPopup();
    renderInventory();
  });
  document.getElementById('ipop-use')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    // Get player from game
    const ev = new CustomEvent('crpg:useItem', { detail: { itemId } });
    window.dispatchEvent(ev);
    closeItemPopup();
    renderInventory();
  });
  document.getElementById('ipop-drop')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    const st = getState();
    st.inventory.backpack[sourceIndex] = null;
    closeItemPopup();
    renderInventory();
  });
}

function closeItemPopup() {
  const popup = document.getElementById('item-popup');
  if (popup) popup.classList.add('hidden');
  _currentItemPopup = null;
}

// Close popup on outside click
document.addEventListener('click', (e) => {
  const popup = document.getElementById('item-popup');
  if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target)) {
    closeItemPopup();
  }
});
