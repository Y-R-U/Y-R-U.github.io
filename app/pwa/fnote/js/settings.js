import * as store from './store.js';
import { getSettings, saveSettings } from './store.js';
import { toggleTheme } from './theme.js';
import { showModal } from './modal.js';
import { modalAlert } from './modal.js';

export function openSettings(onRefresh) {
  const settings = getSettings();
  const isDark = settings.theme === 'dark';

  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-card');

  card.innerHTML = '';

  // Title
  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Settings';
  card.appendChild(title);

  // Theme toggle section
  const themeSection = document.createElement('div');
  themeSection.className = 'settings-section';

  const themeRow = document.createElement('div');
  themeRow.className = 'settings-row';

  const themeLabel = document.createElement('span');
  themeLabel.className = 'settings-label';
  themeLabel.textContent = 'Dark Mode';
  themeLabel.style.marginBottom = '0';

  const toggle = document.createElement('button');
  toggle.className = `toggle-track${isDark ? ' on' : ''}`;
  toggle.addEventListener('click', () => {
    const newTheme = toggleTheme();
    toggle.classList.toggle('on', newTheme === 'dark');
  });

  themeRow.appendChild(themeLabel);
  themeRow.appendChild(toggle);
  themeSection.appendChild(themeRow);
  card.appendChild(themeSection);

  // Export section
  const exportSection = document.createElement('div');
  exportSection.className = 'settings-section';

  const exportLabel = document.createElement('div');
  exportLabel.className = 'settings-label';
  exportLabel.textContent = 'Data';
  exportSection.appendChild(exportLabel);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'settings-btn';
  exportBtn.textContent = 'Export Notes (JSON)';
  exportBtn.addEventListener('click', () => {
    const json = store.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fnotes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  exportSection.appendChild(exportBtn);

  // Import button
  const importBtn = document.createElement('button');
  importBtn.className = 'settings-btn';
  importBtn.style.marginTop = '8px';
  importBtn.textContent = 'Import Notes (JSON)';
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        store.importAll(text);
        overlay.classList.remove('active');
        if (onRefresh) onRefresh();
        await modalAlert('Notes imported successfully!', 'Import');
      } catch (err) {
        await modalAlert('Failed to import: ' + err.message, 'Error');
      }
    });
    input.click();
  });
  exportSection.appendChild(importBtn);
  card.appendChild(exportSection);

  // Close button
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn modal-btn-primary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
  });
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  overlay.classList.add('active');
}
