import { ICON } from './hud.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const NAME_KEY = 'throng.name';
const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

export function createScreens({ root, audio, onPlay, onMenu }) {
  let saved = '';
  try { saved = localStorage.getItem(NAME_KEY) || ''; } catch {}

  root.innerHTML = `
    <section class="screen menu hidden">
      <div class="menu-card">
        <h1 class="logo"><span>THRONG</span></h1>
        <p class="tagline">Gather the biggest crowd in the city</p>
        <label class="name-field"><span>Your name</span>
          <input type="text" maxlength="14" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Blue Empire" value="${esc(saved)}">
        </label>
        <button type="button" class="btn btn-primary play">PLAY</button>
        <p class="hint"><span class="touch-hint">Drag anywhere to lead your crowd</span><span class="key-hint">Drag, or use WASD / arrow keys</span></p>
      </div>
      <button type="button" class="round menu-mute" aria-label="Sound">${audio.muted ? ICON.mute : ICON.sound}</button>
    </section>
    <section class="screen results hidden">
      <div class="res-card">
        <div class="res-head"><div class="res-place"></div><div class="res-sub"></div></div>
        <div class="res-body">
          <ol class="res-list"></ol>
          <div class="res-side">
            <div class="res-stats"></div>
            <div class="res-btns">
              <button type="button" class="btn btn-primary again">PLAY AGAIN</button>
              <button type="button" class="btn btn-ghost to-menu">MENU</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;

  const menu = root.querySelector('.menu'), results = root.querySelector('.results');
  const input = menu.querySelector('input');
  const muteBtn = menu.querySelector('.menu-mute');
  const stop = (e) => e.stopPropagation();
  root.addEventListener('pointerdown', stop);

  const play = () => {
    const name = input.value.trim().slice(0, 14);
    try { localStorage.setItem(NAME_KEY, name); } catch {}
    input.blur();
    audio.ui();
    onPlay(name);
  };
  menu.querySelector('.play').addEventListener('click', play);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
  muteBtn.addEventListener('click', () => audio.setMuted(!audio.muted));
  audio.onMute((m) => { muteBtn.innerHTML = m ? ICON.mute : ICON.sound; });
  results.querySelector('.again').addEventListener('click', () => { audio.ui(); onPlay(input.value.trim()); });
  results.querySelector('.to-menu').addEventListener('click', () => { audio.ui(); onMenu(); });

  function hideAll() { menu.classList.add('hidden'); results.classList.add('hidden'); }

  function showMenu() {
    hideAll();
    menu.classList.remove('hidden');
  }

  function showResults(state, players, me) {
    hideAll();
    const sorted = state.crowds.slice().sort((a, b) => a.rank - b.rank);
    const mc = state.crowds[me];
    const place = results.querySelector('.res-place'), sub = results.querySelector('.res-sub');
    results.classList.toggle('won', mc.rank === 1);
    place.textContent = mc.rank === 1 ? 'VICTORY!' : `${ord(mc.rank)} PLACE`;
    sub.textContent = mc.rank === 1 ? 'Biggest crowd in the city' : mc.rank <= 3 ? 'So close — go again!' : 'The city is waiting. Go again!';
    results.querySelector('.res-list').innerHTML = sorted.map((c) => `
      <li class="${c.index === me ? 'me' : ''}" style="--c:${hex(c.color)}">
        <span class="rl-rank">${c.rank === 1 ? ICON.crown : c.rank}</span>
        <span class="rl-ico">${ICON.person}</span>
        <span class="rl-name">${esc(players[c.index].name)}</span>
        <span class="rl-n">${c.count}</span>
      </li>`).join('');
    const stat = (label, v) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
    results.querySelector('.res-stats').innerHTML =
      stat('Crowd', mc.count) + stat('Best', mc.best) + stat('Kills', mc.kills) + stat('Recruited', mc.recruited);
    results.classList.remove('hidden');
    void results.offsetWidth;
    results.classList.add('in');
  }

  return { showMenu, showResults, hideAll, get name() { return input.value.trim(); } };
}
