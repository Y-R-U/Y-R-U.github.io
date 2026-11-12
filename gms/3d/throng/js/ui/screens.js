import { createSheets } from './kit.js';
import { createMenu } from './menu.js';
import { createLobby } from './lobby.js';
import { createResults } from './results.js';
import { createPause } from './pause.js';
import { renderLocker } from './locker.js';
import { renderLadder, renderDaily, renderProfile, renderSettings } from './panels.js';

const SHEETS = {
  locker: { title: 'Locker', cls: 'sh-locker', render: renderLocker },
  ladder: { title: 'Ladder', cls: 'sh-ladder', render: renderLadder },
  daily: { title: 'Daily', cls: 'sh-daily', render: renderDaily },
  settings: { title: 'Settings', cls: 'sh-settings', render: renderSettings },
  profile: { title: 'Profile', cls: 'sh-profile', render: renderProfile },
};

export function createScreens({ root, app, onPlay, onPractice, onAgain, onMenu, onResume, onLeave }) {
  root.innerHTML = '';
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  const sheets = createSheets(root, { onClose: () => menu.refresh() });
  const open = (id) => {
    const def = SHEETS[id];
    if (!def) return;
    sheets.open(id, { title: def.title, cls: def.cls, render: (body, ctl) => def.render(body, { app, ...ctl }) });
  };
  const menu = createMenu({ root, app, onPlay, onPractice, open });
  const lobby = createLobby({ root, app });
  const results = createResults({ root, app, onAgain, onMenu });
  const pause = createPause({ root, app, onResume, onLeave });

  function hideAll() { menu.hide(); lobby.hide(); results.hide(); pause.hide(); sheets.close(); }

  return {
    hideAll, open, menu, lobby, results, pause, sheets,
    showMenu() { hideAll(); menu.show(); },
    showResults(o) { hideAll(); results.show(o); },
    refresh() { menu.refresh(); },
  };
}
