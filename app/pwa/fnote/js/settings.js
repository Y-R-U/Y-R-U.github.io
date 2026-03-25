import * as store from './store.js';
import { getSettings, saveSettings, getCompressedSize } from './store.js';
import { toggleTheme } from './theme.js';
import { showModal, modalAlert, modalConfirm } from './modal.js';
import { clearUsername } from './auth.js';

export function openSettings(username, onRefresh) {
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

  // Account / Sync section
  if (username) {
    const syncSection = document.createElement('div');
    syncSection.className = 'settings-section';

    const syncLabel = document.createElement('div');
    syncLabel.className = 'settings-label';
    syncLabel.textContent = 'Account';
    syncSection.appendChild(syncLabel);

    const syncRow = document.createElement('div');
    syncRow.className = 'settings-row';

    const userBadge = document.createElement('span');
    userBadge.style.cssText = 'font-size:0.88rem;color:var(--text);font-weight:500;';
    userBadge.textContent = `@${username}`;
    syncRow.appendChild(userBadge);

    const switchBtn = document.createElement('button');
    switchBtn.className = 'modal-btn modal-btn-secondary';
    switchBtn.style.cssText = 'font-size:0.75rem;padding:5px 10px;';
    switchBtn.textContent = 'Switch User';
    switchBtn.addEventListener('click', async () => {
      const ok = await modalConfirm(
        'Your notes are saved to the cloud and will be here when you log back in.',
        'Switch User?'
      );
      if (ok) {
        clearUsername();
        location.reload();
      }
    });
    syncRow.appendChild(switchBtn);
    syncSection.appendChild(syncRow);
    card.appendChild(syncSection);
  }

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

  // Storage size section
  const storageSection = document.createElement('div');
  storageSection.className = 'settings-section';
  storageSection.style.cssText =
    'text-align:center;padding-top:12px;border-top:1px solid var(--border);';

  const storageText = document.createElement('div');
  storageText.style.cssText =
    'font-size:0.75rem;color:var(--text-muted);line-height:1.5;';
  storageText.textContent = 'Calculating storage…';
  storageSection.appendChild(storageText);

  const storageBar = document.createElement('div');
  storageBar.style.cssText =
    'margin-top:6px;height:6px;border-radius:3px;background:var(--border);overflow:hidden;';
  const storageBarFill = document.createElement('div');
  storageBarFill.style.cssText =
    'height:100%;border-radius:3px;width:0%;transition:width 0.4s ease,background 0.3s;';
  storageBar.appendChild(storageBarFill);
  storageSection.appendChild(storageBar);

  card.appendChild(storageSection);

  // Async: compute and display compressed size
  getCompressedSize().then(bytes => {
    const mb = bytes / (1024 * 1024);
    const limitMB = 1.9;
    const pct = Math.min((mb / limitMB) * 100, 100);
    storageText.textContent = `Storage: ${mb.toFixed(2)} MB / ${limitMB} MB`;
    storageBarFill.style.width = `${pct}%`;

    if (mb > 1.9)      storageBarFill.style.background = 'var(--danger)';
    else if (mb > 1.5)  storageBarFill.style.background = '#f0a030';
    else                 storageBarFill.style.background = 'var(--accent)';
  }).catch(() => {
    storageText.textContent = 'Storage: unable to calculate';
  });

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
