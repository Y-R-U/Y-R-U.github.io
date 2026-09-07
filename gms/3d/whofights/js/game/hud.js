// The play HUD: the menu button and the reach prompt.
//
// Health does NOT live here any more. Two bars in the corner of the screen never said whose
// health they were, and in a room with more than one thing in it they never could — they are over
// the heads they belong to now, in js/game/healthbars.js.
//
// The prompt used to be a bare <b> inside a div that inherited `pointer-events: none` from #game,
// so the one thing telling the player they could interact was neither a button nor tappable. It is
// a real <button> at --tap height now, which is also what game.css was already styling.

import { el, clear } from './ui.js';

export class Hud {
  constructor({ host, onMenu = () => {}, onInteract = () => {}, onSheet = null, onBag = null }) {
    this.host = host;

    const bar = el('div', 'g-bar-top');
    const menu = el('button', 'g-round', '≡');
    menu.setAttribute('aria-label', 'Menu');
    menu.onclick = onMenu;
    bar.append(menu);
    // Rank, stars and what you are made of. Beside the menu rather than inside it: it is a thing
    // the player looks at between contracts, not a setting.
    if (onSheet) {
      const you = el('button', 'g-round g-round-you', '★');
      you.setAttribute('aria-label', 'Your sheet');
      you.onclick = onSheet;
      bar.append(you);
    }
    // The bag. `I` opens it on a keyboard; on a phone there is no I to press, so it needs a
    // button — and it needs one anyway, because a player who has just been given a dagger has to
    // be able to find where the dagger went.
    if (onBag) {
      const bag = el('button', 'g-round g-round-bag', '❖');
      bag.setAttribute('aria-label', 'What you are carrying');
      bag.onclick = onBag;
      bar.append(bag);
    }

    this.prompt = el('div', 'g-prompt');
    this.prompt.hidden = true;
    this.button = el('button');
    this.button.onclick = onInteract;
    this.prompt.append(this.button);

    host.append(bar, this.prompt);
    this.showing = null;
  }

  // `text` is the hotspot's name, or null when nothing is in reach.
  setPrompt(text) {
    if (text === this.showing) return;
    this.showing = text;
    this.prompt.hidden = !text;
    if (text) clear(this.button).append(el('span', null, text));
  }
}
