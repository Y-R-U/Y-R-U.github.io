// ===== Bottom Nav & Panel Switcher =====
import { renderSkillsPanel } from './skillsPanel.js';
import { renderInventory } from './inventory.js';
import { saveGame, loadGame, resetGame } from '../state.js';

const PANELS = {
  map:       null,
  skills:    'panel-skills',
  inventory: 'panel-inventory',
  menu:      'panel-menu',
};

let activeTab = 'map';

export function initMenuNav() {
  // Nav buttons
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.panel));
  }

  // Menu buttons
  document.getElementById('btn-save')?.addEventListener('click', () => {
    saveGame();
    alert('Game saved!');
  });
  document.getElementById('btn-load')?.addEventListener('click', () => {
    if (loadGame()) { alert('Game loaded!'); window.location.reload(); }
    else alert('No save found.');
  });
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm('Start a new game? All progress will be lost.')) {
      resetGame();
      window.location.reload();
    }
  });

  // Test button
  document.getElementById('btn-tests')?.addEventListener('click', () => {
    switchTab('tests');
  });

  // Debug mode
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === 'tests') {
    document.querySelectorAll('.debug-only').forEach(el => el.classList.remove('hidden'));
    setTimeout(() => switchTab('tests'), 200);
  }
}

export function switchTab(tab) {
  activeTab = tab;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === tab);
  });

  // Hide all panels
  for (const panelId of Object.values(PANELS)) {
    if (panelId) document.getElementById(panelId)?.classList.add('hidden');
  }
  document.getElementById('test-panel')?.classList.add('hidden');

  // Show selected panel
  if (tab === 'skills') {
    document.getElementById('panel-skills')?.classList.remove('hidden');
    renderSkillsPanel();
  } else if (tab === 'inventory') {
    document.getElementById('panel-inventory')?.classList.remove('hidden');
    renderInventory();
  } else if (tab === 'menu') {
    document.getElementById('panel-menu')?.classList.remove('hidden');
    _updateDebugInfo();
  } else if (tab === 'tests') {
    document.getElementById('test-panel')?.classList.remove('hidden');
  }
  // 'map' — no panel, just canvas
}

function _updateDebugInfo() {
  const el = document.getElementById('debug-info');
  if (!el) return;
  const { getState } = _stateRef;
  if (!getState) return;
  const st = getState();
  el.textContent = `Pos: (${st.player.x.toFixed(1)}, ${st.player.y.toFixed(1)}) | Gold: ${st.player.gold}`;
}

let _stateRef = {};
import('../state.js').then(m => { _stateRef = m; });

// NPC Dialogue modal
export function showDialogue(npc) {
  const modal = document.getElementById('dialogue-modal');
  const nameEl = document.getElementById('dialogue-npc-name');
  const textEl = document.getElementById('dialogue-text');
  if (!modal || !nameEl || !textEl) return;

  nameEl.textContent = npc.name;
  textEl.textContent = npc.dialogue || '...';
  modal.classList.remove('hidden');
}

export function initDialogueModal() {
  document.getElementById('btn-dialogue-close')?.addEventListener('click', () => {
    document.getElementById('dialogue-modal')?.classList.add('hidden');
  });
}
