// In-place Settings sheet (ui-4). Used by every screen with the shared board on show (bot game,
// online game, puzzle, lesson) so changing a setting never leaves the position you are playing.
//
//   import { openSettingsSheet } from './settingsheet.js';
//   openSettingsSheet(app);
//
// The sheet owns one history entry (same URL, so no hashchange / no re-render): the Android /
// browser back button closes the sheet instead of leaving the screen. Closing it any other way
// (X, scrim tap) pops that entry again so the next back press goes to the previous screen.
// Settings apply live through onSettings() listeners the screens already have.
import { openSheet, icon } from './ui.js';
import { settingsPanel } from './screens/settings.js';

let open = null;   // {sh, popped}

export function openSettingsSheet(app) {
  if (open) return open.sh;
  const state = { sh: null, popped: false, hash: location.hash };
  const onPop = () => { state.popped = true; state.sh && state.sh.close(); };
  state.onPop = onPop;
  state.sh = openSheet(`<div class="sheet-head"><h3>Settings</h3><button class="tb-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="sheet-body"></div>`, {
    cls: 'sheet-tall',
    onClose() {
      window.removeEventListener('popstate', onPop);
      if (open === state) open = null;
      // closed by X / scrim: drop the entry we pushed (only if we are still on it)
      if (!state.popped && history.state && history.state.gambitSheet && location.hash === state.hash) history.back();
    },
  });
  state.sh.el.querySelector('.sheet-body').appendChild(settingsPanel(app, { compact: true }));
  try { history.pushState({ ...(history.state || {}), gambitSheet: 1 }, '', location.href); } catch { /* ignore */ }
  window.addEventListener('popstate', onPop);
  open = state;
  return state.sh;
}

/** A route change removed every overlay: forget the sheet without touching history. */
export function forgetSettingsSheet() {
  if (!open) return;
  open.popped = true; window.removeEventListener('popstate', open.onPop); open = null;
}

export const settingsSheetOpen = () => !!open;
