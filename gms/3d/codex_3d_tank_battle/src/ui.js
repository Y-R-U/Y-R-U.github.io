import * as THREE from 'three';
import { formatStanding } from './utils.js';
import { sanitizeName, savePlayerName } from './names.js';

const screenPosition = new THREE.Vector3();

export function createUi() {
  const el = {
    menu: document.getElementById('menu'),
    result: document.getElementById('result'),
    hud: document.getElementById('hud'),
    leaderboard: document.getElementById('leaderboard'),
    leaderList: document.getElementById('leader-list'),
    startButton: document.getElementById('start-button'),
    restartButton: document.getElementById('restart-button'),
    aliveCount: document.getElementById('alive-count'),
    playerKills: document.getElementById('player-kills'),
    playerArmor: document.getElementById('player-armor'),
    playerNameButton: document.getElementById('player-name-button'),
    resultKicker: document.getElementById('result-kicker'),
    resultTitle: document.getElementById('result-title'),
    resultKills: document.getElementById('result-kills'),
    resultStanding: document.getElementById('result-standing'),
    nameModal: document.getElementById('name-modal'),
    nameForm: document.getElementById('name-form'),
    nameInput: document.getElementById('name-input'),
    nameCancel: document.getElementById('name-cancel'),
    labels: document.getElementById('labels'),
    crosshair: document.getElementById('crosshair'),
    fireButton: document.getElementById('fire-button'),
    stickZone: document.getElementById('stick-zone')
  };

  const labelMap = new Map();
  let renameHandler = null;

  el.playerNameButton.addEventListener('click', () => {
    el.nameInput.value = el.playerNameButton.textContent;
    el.nameModal.classList.remove('hidden');
    setTimeout(() => el.nameInput.focus(), 0);
  });

  el.nameCancel.addEventListener('click', () => {
    el.nameModal.classList.add('hidden');
  });

  el.nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextName = sanitizeName(el.nameInput.value);
    if (!nextName) return;
    savePlayerName(nextName);
    setPlayerName(nextName);
    el.nameModal.classList.add('hidden');
    if (renameHandler) renameHandler(nextName);
  });

  function setPlayerName(name) {
    el.playerNameButton.textContent = name;
  }

  function showGameUi(show) {
    [el.hud, el.leaderboard, el.crosshair, el.fireButton, el.stickZone].forEach((node) => {
      node.classList.toggle('hidden', !show);
    });
  }

  function clearLabels() {
    labelMap.clear();
    el.labels.replaceChildren();
  }

  function registerLabels(tanks) {
    clearLabels();
    tanks.forEach((tank) => {
      const label = document.createElement('div');
      label.className = 'tank-label';
      label.style.color = `#${tank.accent.toString(16).padStart(6, '0')}`;
      label.innerHTML = '<div class="label-line"></div><div class="label-name"></div>';
      label.querySelector('.label-name').textContent = tank.name;
      el.labels.append(label);
      labelMap.set(tank.id, label);
    });
  }

  function updateLabels(tanks, camera) {
    tanks.forEach((tank) => {
      const label = labelMap.get(tank.id);
      if (!label) return;
      label.querySelector('.label-name').textContent = tank.name;
      if (!tank.alive) {
        label.classList.remove('visible');
        return;
      }
      tank.labelAnchor.getWorldPosition(screenPosition);
      screenPosition.project(camera);
      const inFront = screenPosition.z > -1 && screenPosition.z < 1;
      const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-screenPosition.y * 0.5 + 0.5) * window.innerHeight;
      label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      label.classList.toggle('visible', inFront);
    });
  }

  function updateHud(player, tanks) {
    const alive = tanks.filter((tank) => tank.alive).length;
    el.aliveCount.textContent = String(alive);
    el.playerKills.textContent = String(player?.kills || 0);
    el.playerArmor.textContent = String(Math.max(0, Math.ceil(player?.hp || 0)));
  }

  function updateLeaderboard(tanks, playerId) {
    const ranked = rankTanks(tanks);
    el.leaderList.replaceChildren(...ranked.map((tank, index) => {
      const item = document.createElement('li');
      item.className = `${tank.id === playerId ? 'player' : ''} ${tank.alive ? '' : 'dead'}`;
      item.innerHTML = `
        <span class="rank">${index + 1}</span>
        <span class="board-name"></span>
        <span class="board-kills">K${tank.kills}</span>
        <span class="board-hp">${Math.max(0, Math.ceil(tank.hp))}</span>
      `;
      item.querySelector('.board-name').textContent = tank.name;
      return item;
    }));
  }

  function showMenu() {
    el.menu.classList.remove('hidden');
    el.result.classList.add('hidden');
    showGameUi(false);
  }

  function showRunning() {
    el.menu.classList.add('hidden');
    el.result.classList.add('hidden');
    showGameUi(true);
  }

  function showResult({ winner, player, standing }) {
    el.resultKicker.textContent = player.alive ? 'battle won' : 'battle lost';
    el.resultTitle.textContent = player.alive ? `${winner.name} stands alone` : `${winner.name} wins`;
    el.resultKills.textContent = String(player.kills);
    el.resultStanding.textContent = formatStanding(standing);
    el.result.classList.remove('hidden');
    showGameUi(false);
  }

  function onRename(handler) {
    renameHandler = handler;
  }

  return {
    el,
    setPlayerName,
    showMenu,
    showRunning,
    showResult,
    registerLabels,
    updateLabels,
    updateHud,
    updateLeaderboard,
    onRename
  };
}

export function rankTanks(tanks) {
  return [...tanks].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (b.hp !== a.hp) return b.hp - a.hp;
    return b.damage - a.damage;
  });
}
