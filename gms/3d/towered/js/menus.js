// Title screen + level select (campaign realms with stars/locks + custom tab).

import { REALMS } from './config.js';
import { loadBuiltinIndex, customLevels, deleteCustomLevel, starsFor, isUnlocked } from './levels.js';
import { sfx, isMuted, setMuted, unlock } from './audio.js';

const $ = (id) => document.getElementById(id);

export function createMenus(game) {
  const m = {};
  const menu = $('menu'), ls = $('levelselect');

  const muteLabel = () => `${isMuted() ? '🔇' : '🔊'}&ensp;Sound ${isMuted() ? 'off' : 'on'}`;
  $('btn-mute').innerHTML = muteLabel();

  $('btn-play').onclick = async () => { unlock(); sfx.click(); await m.showLevelSelect(); };
  $('btn-editor').onclick = () => { location.href = 'editor.html'; };
  $('btn-help').onclick = () => { unlock(); sfx.click(); game.ui.showHelp(() => game.ui.closeModal()); };
  $('btn-mute').onclick = () => { unlock(); setMuted(!isMuted()); $('btn-mute').innerHTML = muteLabel(); sfx.click(); };
  $('ls-back').onclick = () => { sfx.click(); ls.classList.add('hidden'); menu.classList.remove('hidden'); };
  $('tab-campaign').onclick = () => switchTab(true);
  $('tab-custom').onclick = () => switchTab(false);

  function switchTab(campaign) {
    sfx.click();
    $('tab-campaign').classList.toggle('on', campaign);
    $('tab-custom').classList.toggle('on', !campaign);
    $('ls-campaign').classList.toggle('hidden', !campaign);
    $('ls-custom').classList.toggle('hidden', campaign);
    if (!campaign) renderCustom();
  }

  m.showTitle = () => {
    ls.classList.add('hidden');
    menu.classList.remove('hidden');
  };
  m.hideAll = () => { menu.classList.add('hidden'); ls.classList.add('hidden'); };

  m.showLevelSelect = async () => {
    menu.classList.add('hidden');
    await renderCampaign();
    ls.classList.remove('hidden');
  };

  async function renderCampaign() {
    const index = await loadBuiltinIndex();
    const host = $('ls-campaign');
    host.innerHTML = '';
    for (const realm of REALMS) {
      const title = document.createElement('div');
      title.className = 'realm-title';
      title.textContent = realm.name;
      host.appendChild(title);
      const grid = document.createElement('div');
      grid.className = 'lv-grid';
      for (const n of realm.levels) {
        const entry = index[n - 1];
        if (!entry) continue;
        const unlocked = isUnlocked(index, n);
        const stars = starsFor(entry.id);
        const card = document.createElement('button');
        const isBoss = n % 5 === 0;
        card.className = 'lv-card' + (unlocked ? '' : ' locked') + (isBoss ? ' boss' : '');
        card.innerHTML = `<div class="n">${unlocked ? n : '🔒'}</div>
          <div class="nm">${entry.name}</div>
          <div class="st">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>`;
        if (unlocked) card.onclick = () => { sfx.click(); m.hideAll(); game.startBuiltin(n); };
        grid.appendChild(card);
      }
      host.appendChild(grid);
    }
  }

  function renderCustom() {
    const host = $('ls-custom');
    host.innerHTML = '';
    const all = Object.values(customLevels());
    if (!all.length) {
      host.innerHTML = `<div class="lv-empty">No custom levels yet.<br><br>
        Open the <b>Level Editor</b> from the title screen, draw a road, script
        some waves and hit Save — your level will appear here.</div>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'lv-grid';
    all.forEach((lv, i) => {
      const card = document.createElement('button');
      card.className = 'lv-card';
      const stars = starsFor(lv.id);
      card.innerHTML = `<div class="n">${i + 1}</div><div class="nm">${lv.name || lv.id}</div>
        <div class="st">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
        <button class="lv-del" title="Delete">🗑</button>`;
      card.onclick = (ev) => {
        if (ev.target.classList.contains('lv-del')) {
          sfx.click();
          game.ui.toast(`Deleted "${lv.name || lv.id}"`);
          deleteCustomLevel(lv.id);
          renderCustom();
          return;
        }
        sfx.click(); m.hideAll(); game.startCustom(lv);
      };
      grid.appendChild(card);
    });
    host.appendChild(grid);
  }

  return m;
}
