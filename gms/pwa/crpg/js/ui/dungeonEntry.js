// ===== Dungeon Entry Modal =====
import { DUNGEONS } from '../config.js';

let _onEnter = null;
let _onFlee  = null;

export function initDungeonModal() {
  document.getElementById('btn-dungeon-enter')?.addEventListener('click', () => {
    hideDungeonModal();
    if (_onEnter) _onEnter();
  });
  document.getElementById('btn-dungeon-flee')?.addEventListener('click', () => {
    hideDungeonModal();
    if (_onFlee) _onFlee();
  });
}

export function showDungeonModal(dungeonId, onEnter, onFlee) {
  const cfg = DUNGEONS[dungeonId];
  if (!cfg) return;

  _onEnter = onEnter;
  _onFlee  = onFlee;

  document.getElementById('dungeon-modal-title').textContent = cfg.name;
  document.getElementById('dungeon-modal-stars').textContent = '⭐'.repeat(cfg.stars);
  document.getElementById('dungeon-modal-info').innerHTML = `
    <b>Recommended Level:</b> ${cfg.recLevel}<br>
    <b>Loot Tier:</b> ${cfg.lootTier}<br>
    <b>Difficulty:</b> ${'★'.repeat(cfg.stars)}${'☆'.repeat(5 - cfg.stars)}
  `;
  document.getElementById('dungeon-modal').classList.remove('hidden');
}

export function hideDungeonModal() {
  document.getElementById('dungeon-modal').classList.add('hidden');
}
