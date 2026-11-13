import { createSheets } from './kit.js';
import { createMenu } from './menu.js';
import { createLobby } from './lobby.js';
import { createResults } from './results.js';
import { createPause } from './pause.js';
import { renderLocker } from './locker.js';
import { renderLadder, renderDaily, renderProfile, renderSettings } from './panels.js';
import { renderOnline, renderOnlineBoards, createRoomLobby } from './online.js';

function renderLadderTabs(body, ctl) {
  const { app } = ctl;
  if (!app.net || !app.net.visible) return renderLadder(body, ctl);
  let tab = app.net.ladderTab || 'ladder';
  body.innerHTML = '<div class="tabs ld-tabs"><button type="button" data-t="ladder">Ladder</button><button type="button" data-t="online">Online</button></div><div class="ld-pane"></div>';
  const pane = body.querySelector('.ld-pane');
  const show = () => {
    app.net.ladderTab = tab;
    body.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    pane.innerHTML = '';
    (tab === 'online' ? renderOnlineBoards : renderLadder)(pane, ctl);
  };
  body.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; app.audio.ui(); show(); }));
  show();
}

const SHEETS = {
  locker: { title: 'Locker', cls: 'sh-locker', render: renderLocker },
  ladder: { title: 'Ladder', cls: 'sh-ladder', render: renderLadderTabs },
  online: { title: 'Online', cls: 'sh-online', render: renderOnline },
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
  const room = createRoomLobby({ root, app });

  function hideAll() { menu.hide(); lobby.hide(); results.hide(); pause.hide(); room.hide(); sheets.close(); }

  return {
    hideAll, open, menu, lobby, results, pause, sheets, room,
    showMenu() { hideAll(); menu.show(); },
    showResults(o) { hideAll(); results.show(o); },
    refresh() { menu.refresh(); },
  };
}
