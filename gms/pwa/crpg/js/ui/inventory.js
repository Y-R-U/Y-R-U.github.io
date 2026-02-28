// ===== Inventory Panel UI =====
import { ITEMS } from '../config.js';
import { getState, equipItem, unequipItem } from '../state.js';

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
      <div class="slot-item-glyph" style="color:${itemDef?.color || '#555'}">${itemDef ? (itemDef.emoji || itemDef.glyph) : slot.glyph}</div>
      <div class="slot-label">${itemDef ? itemDef.name.slice(0,8) : slot.label}</div>
    `;
    el.addEventListener('click', (e) => {
      e.stopPropagation();   // prevent document outside-click handler closing popup immediately
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
        <div class="inv-item-glyph" style="color:${itemDef.color || '#ccc'}">${itemDef.emoji || itemDef.glyph}</div>
        <div class="inv-item-name">${itemDef.name.slice(0,10)}</div>
        ${slot.qty > 1 ? `<div class="inv-item-qty">${slot.qty}</div>` : ''}
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();   // prevent document outside-click handler closing popup immediately
        _showItemPopup(slot.id, 'backpack', i);
      });
    }
    grid.appendChild(el);
  }
}

function _showItemPopup(itemId, source, sourceIndex) {
  const popup   = document.getElementById('item-popup');
  const content = document.getElementById('item-popup-content');
  if (!popup || !content) return;

  const item = ITEMS[itemId];
  if (!item) return;

  _currentItemPopup = { itemId, source, sourceIndex };

  const statLines = [];
  if (item.atkBonus) statLines.push(`+${item.atkBonus} Atk`);
  if (item.strBonus) statLines.push(`+${item.strBonus} Str`);
  if (item.defBonus) statLines.push(`+${item.defBonus} Def`);
  if (item.magBonus) statLines.push(`+${item.magBonus} Mag`);
  if (item.rngBonus) statLines.push(`+${item.rngBonus} Rng`);
  if (item.heal)     statLines.push(`+${item.heal} HP`);
  if (item.reqAtk)   statLines.push(`Req Atk ${item.reqAtk}`);
  if (item.reqStr)   statLines.push(`Req Str ${item.reqStr}`);
  if (item.reqDef)   statLines.push(`Req Def ${item.reqDef}`);
  if (item.reqMag)   statLines.push(`Req Mag ${item.reqMag}`);
  if (item.reqRng)   statLines.push(`Req Rng ${item.reqRng}`);
  if (item.value)    statLines.push(`Value: ${item.value}g`);

  let btns = '';
  if (source === 'backpack') {
    if (item.slot)                                      btns += `<button class="item-popup-btn" id="ipop-equip">Equip</button>`;
    if (item.type === 'food' || item.type === 'potion') btns += `<button class="item-popup-btn" id="ipop-use">Use</button>`;
    if (item.value)                                     btns += `<button class="item-popup-btn" id="ipop-sell">Sell ${Math.floor(item.value * 0.5)}g</button>`;
    btns += `<button class="item-popup-btn danger" id="ipop-drop">Drop</button>`;
  } else {
    btns += `<button class="item-popup-btn" id="ipop-unequip">Unequip</button>`;
  }
  btns += `<button class="item-popup-btn" id="ipop-close">✕</button>`;

  content.innerHTML = `
    <div class="item-popup-name" style="color:${item.color || '#fff'}">${item.emoji || item.glyph} ${item.name}</div>
    <div class="item-popup-desc">${statLines.join(' · ') || 'No stats'}</div>
    <div class="item-popup-btns">${btns}</div>
  `;

  popup.classList.remove('hidden');

  document.getElementById('ipop-close')?.addEventListener('click', closeItemPopup);

  document.getElementById('ipop-equip')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    const st = getState();
    // Skill requirement check
    if (item.reqAtk && (st.player.skills.attack?.level   || 1) < item.reqAtk) { _warnReq(`Need Atk ${item.reqAtk}`);  return; }
    if (item.reqStr && (st.player.skills.strength?.level || 1) < item.reqStr) { _warnReq(`Need Str ${item.reqStr}`);  return; }
    if (item.reqDef && (st.player.skills.defence?.level  || 1) < item.reqDef) { _warnReq(`Need Def ${item.reqDef}`);  return; }
    if (item.reqMag && (st.player.skills.magic?.level    || 1) < item.reqMag) { _warnReq(`Need Mag ${item.reqMag}`);  return; }
    if (item.reqRng && (st.player.skills.ranged?.level   || 1) < item.reqRng) { _warnReq(`Need Rng ${item.reqRng}`);  return; }
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
    window.dispatchEvent(new CustomEvent('crpg:useItem', { detail: { itemId } }));
    renderInventory();
    // Keep popup open if the item still exists in backpack (stackables with qty > 0)
    const st2 = getState();
    const remaining = st2.inventory.backpack.find(s => s && s.id === itemId && s.qty > 0);
    if (remaining) {
      const newIdx = st2.inventory.backpack.findIndex(s => s && s.id === itemId);
      _showItemPopup(itemId, 'backpack', newIdx >= 0 ? newIdx : sourceIndex);
    } else {
      closeItemPopup();
    }
  });

  document.getElementById('ipop-sell')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    const st         = getState();
    const sellPrice  = Math.floor((item.value || 0) * 0.5);
    st.player.gold  += sellPrice;
    const bpSlot     = st.inventory.backpack[sourceIndex];
    if (bpSlot) {
      bpSlot.qty = (bpSlot.qty || 1) - 1;
      if (bpSlot.qty <= 0) st.inventory.backpack[sourceIndex] = null;
    }
    closeItemPopup();
    renderInventory();
  });

  document.getElementById('ipop-drop')?.addEventListener('click', () => {
    if (!_currentItemPopup) return;
    const st     = getState();
    const bpSlot = st.inventory.backpack[sourceIndex];
    if (bpSlot) {
      bpSlot.qty = (bpSlot.qty || 1) - 1;
      if (bpSlot.qty <= 0) st.inventory.backpack[sourceIndex] = null;
    }
    closeItemPopup();
    renderInventory();
  });
}

function _warnReq(msg) {
  const content = document.getElementById('item-popup-content');
  if (!content) return;
  let warn = content.querySelector('.req-warn');
  if (!warn) {
    warn = document.createElement('div');
    warn.className = 'req-warn';
    warn.style.cssText = 'color:#e94560;font-size:11px;margin-top:6px;text-align:center;';
    content.appendChild(warn);
  }
  warn.textContent = msg;
}

function closeItemPopup() {
  document.getElementById('item-popup')?.classList.add('hidden');
  _currentItemPopup = null;
}

// Close on outside tap — stopPropagation on slot clicks prevents immediate re-close
document.addEventListener('click', (e) => {
  const popup = document.getElementById('item-popup');
  if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target)) {
    closeItemPopup();
  }
});
