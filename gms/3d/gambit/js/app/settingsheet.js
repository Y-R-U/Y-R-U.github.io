// In-place Settings sheet (ui-4). Used by every screen with the shared board on show (bot game,
// online game, puzzle, lesson) so changing a setting never leaves the position you are playing.
//
//   import { openSettingsSheet } from './settingsheet.js';
//   openSettingsSheet(app);
//
// Like every openSheet() it owns one history entry (ui.js backClosable): Android / browser back
// closes the sheet instead of leaving the screen.
// Settings apply live through onSettings() listeners the screens already have.
import { openSheet, icon } from './ui.js';
import { settingsPanel } from './screens/settings.js';

let open = null;   // the open sheet, or null (back-button handling is openSheet's own, ui.js backClosable)

export function openSettingsSheet(app) {
  if (open) return open;
  const sh = open = openSheet(`<div class="sheet-head"><h3>Settings</h3><button class="tb-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="sheet-body"></div>`, {
    cls: 'sheet-tall',
    onClose() { if (open === sh) open = null; },
  });
  sh.el.querySelector('.sheet-body').appendChild(settingsPanel(app, { compact: true }));
  return sh;
}

/** A route change removed every overlay: forget the sheet (closeAllOverlays forgets its history entry). */
export function forgetSettingsSheet() { open = null; }

export const settingsSheetOpen = () => !!open;
