// Title screen, pause menu, win/lose screens. The title floats over the live
// island slowly orbiting at golden hour.

import * as AU from './audio.js';

const $ = (id) => document.getElementById(id);

export function createMenus(game) {
  const menus = {};

  menus.showBoot = (msg, frac) => {
    $('boot-status').textContent = msg;
    if (frac != null) $('boot-bar').querySelector('i').style.width = `${Math.round(frac * 100)}%`;
  };
  menus.hideBoot = () => $('boot').classList.add('hidden');

  menus.showTitle = (hasSave) => {
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('btn-continue').classList.toggle('hidden', !hasSave);
    updateMute();
  };
  menus.hideTitle = () => {
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
  };

  function updateMute() {
    $('btn-mute').innerHTML = AU.isMuted() ? '🔇&ensp;Sound Off' : '🔊&ensp;Sound';
  }

  $('btn-new').addEventListener('click', () => {
    AU.unlock(); AU.sfx.click();
    if (game.saveExists()) {
      game.ui.modal(`
        <h2>✨ New Island?</h2>
        <p>Your current island and its folk will be washed away. The sea keeps no memories.</p>
        <div class="confirmrow">
          <button class="ok" id="nw-ok">Begin anew</button>
          <button class="no" id="nw-no">Keep my folk</button>
        </div>`);
      $('nw-ok').addEventListener('click', () => { game.ui.closeModal(); game.newGame(); });
      $('nw-no').addEventListener('click', game.ui.closeModal);
    } else game.newGame();
  });
  $('btn-continue').addEventListener('click', () => { AU.unlock(); AU.sfx.click(); game.continueGame(); });
  $('btn-help').addEventListener('click', () => { AU.unlock(); AU.sfx.click(); game.ui.help(); });
  $('btn-mute').addEventListener('click', () => { AU.unlock(); AU.setMuted(!AU.isMuted()); updateMute(); });

  game.openMenu = () => {
    AU.sfx.click();
    game.paused = true;
    $('btn-pause').textContent = '▶';
    game.ui.modal(`
      <h2>🌿 Firstfolk</h2>
      <p>Day ${game.W.day} · ${game.V.pop()} folk · your island endures.</p>
      <div class="confirmrow"><button class="ok" id="pm-resume">▶ Resume</button></div>
      <div class="confirmrow"><button class="no" id="pm-help">📜 How to Play</button>
      <button class="no" id="pm-mute">${AU.isMuted() ? '🔇 Sound Off' : '🔊 Sound On'}</button></div>
      <div class="confirmrow"><button class="no" id="pm-title">⏏ Save & Title</button></div>`);
    $('pm-resume').addEventListener('click', () => { game.ui.closeModal(); game.paused = false; $('btn-pause').textContent = '⏸'; });
    $('pm-help').addEventListener('click', () => game.ui.help());
    $('pm-mute').addEventListener('click', (e) => { AU.setMuted(!AU.isMuted()); e.target.textContent = AU.isMuted() ? '🔇 Sound Off' : '🔊 Sound On'; });
    $('pm-title').addEventListener('click', () => location.reload());
  };

  menus.win = (stats) => {
    AU.sfx.win();
    AU.startMusic(5);
    game.ui.modal(`
      <h2>🌟 Ascension</h2>
      <p>The Monument sings. Your folk raise their arms as the light takes you —
      a god no longer young, remembered in stone and firelight.</p>
      <div class="statgrid">
        <div><b>${stats.days}</b>days</div>
        <div><b>${stats.pop}</b>folk at the end</div>
        <div><b>${stats.buildings}</b>buildings raised</div>
        <div><b>${stats.raidsBroken}</b>raids broken</div>
      </div>
      <div class="confirmrow">
        <button class="ok" id="win-stay">🌿 Linger a while</button>
        <button class="no" id="win-new">✨ New Island</button>
      </div>`);
    $('win-stay').addEventListener('click', game.ui.closeModal);
    $('win-new').addEventListener('click', () => game.newGame());
  };

  menus.lose = () => {
    AU.sfx.lose();
    game.ui.modal(`
      <h2>🪦 The Fire Goes Out</h2>
      <p>The last of your folk is gone. Grass grows over the hearth-stones, and
      the sea forgets the island's name. Perhaps, somewhere, a new fire waits.</p>
      <div class="confirmrow">
        <button class="ok" id="lose-new">✨ New Island</button>
      </div>`);
    $('lose-new').addEventListener('click', () => game.newGame());
  };

  return menus;
}
