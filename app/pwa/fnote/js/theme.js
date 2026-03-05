import { getSettings, saveSettings } from './store.js';

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const color = theme === 'dark' ? '#1a1a2e' : '#f0f2f5';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = color;
}

export function toggleTheme() {
  const settings = getSettings();
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  saveSettings(settings);
  applyTheme(settings.theme);
  return settings.theme;
}

export function initTheme() {
  const { theme } = getSettings();
  applyTheme(theme || 'dark');
}
