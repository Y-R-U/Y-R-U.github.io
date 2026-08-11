// The one tap before the ruling, and the only reason it exists is that browsers will not make a
// sound until a player has touched the page. Nothing else in the front of the game asks to be
// clicked, so this card has to earn its place: it is the title, it says how long the thing it is
// about to play runs for, and it offers the silent cut to anyone who does not want sound at 2am.
//
// Returning players never see it — they skip the ruling entirely — and `?mute=1` skips it too, so
// the tooling still gets the sequence it always got.

import { esc } from './format.js';
import { verdict } from './verdict.js';

let root = null;
let asking = false;

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('gate');
  if (!root) {
    root = document.createElement('div');
    root.id = 'gate';
    document.body.appendChild(root);
  }
  return root;
}

export const gate = {
  // Resolves true if the player wants the recording, false for the silent cut. Either way the
  // caller goes straight into the ruling.
  ask({ title = 'Monopole', runs = 'Two minutes eighteen' } = {}) {
    if (asking) return Promise.resolve(false);
    asking = true;
    ensureRoot();
    // The fetch starts now, not on the tap. A player takes two or three seconds to read a card and
    // that is most of what the file needs, so by the time the tap lands there is nothing to wait
    // for — and if there is, playback starts late and the captions start late with it.
    verdict.arm();

    return new Promise(resolve => {
      root.innerHTML = `
        <div class="g-card">
          <div class="v-mark" aria-hidden="true"><i></i><i></i><i></i></div>
          <i class="g-over">Universal Alliance · Competition Division</i>
          <h1>${esc(title)}</h1>
          <p>The ruling that opened Tamber Reach, read in full. ${esc(runs)}.</p>
          <button class="g-go" data-g="sound">Play the ruling</button>
          <button class="g-quiet" data-g="quiet">Read it in silence</button>
        </div>`;
      root.classList.add('live');
      requestAnimationFrame(() => root.classList.add('in'));

      const leave = sound => {
        asking = false;
        root.classList.remove('in');
        setTimeout(() => { root.innerHTML = ''; root.classList.remove('live'); }, 380);
        resolve(sound);
      };

      // `click`, not `pointerdown`, and the unlock happens on the same turn as the handler — an
      // `await` before `audio.play()` spends the gesture and the ruling comes up silent on iOS.
      root.onclick = e => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        if (b.dataset.g !== 'sound') return leave(false);
        verdict.unlock();
        leave(true);
      };
    });
  },
};

export default gate;
