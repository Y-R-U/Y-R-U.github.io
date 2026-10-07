// Small UI bits for device-hosted rooms (S's screens render everything else).
import { h } from '../ui/kit.js?v=202610071438';
import { toast } from '../ui/popup.js?v=202610071438';

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `.p2p-note{display:flex;gap:10px;align-items:flex-start;margin-top:12px;padding:10px 12px;border:2px solid var(--ink);border-radius:14px;background:#fff7d1;text-align:left;font-size:14px;line-height:1.35}
.p2p-note b{display:block;font-size:15px}.p2p-note .ico{font-size:24px;line-height:1}.p2p-note.join{background:#eef6ff}`;
  document.head.append(s);
}

export function lobbyNote(isHost) {
  style();
  if (isHost) {
    return h('div.p2p-note', { dataset: { p2p: 'host' } }, h('span.ico', {}, '📡'),
      h('div', {}, h('b', {}, 'Hosting from this device'),
        'No server: this tab runs the game, up to 8 players. Keep it open and on screen until the end. Phones pause background tabs, and closing it ends the room.'));
  }
  return h('div.p2p-note.join', { dataset: { p2p: 'join' } }, h('span.ico', {}, '📡'),
    h('div', {}, h('b', {}, 'Device room'), 'The host’s device runs this game directly, with no server in between.'));
}

export const hostBackWarning = secs => toast(`This tab was hidden for ${secs} s: players may have lost the connection while it was away.`);

