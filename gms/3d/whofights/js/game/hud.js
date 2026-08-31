// The play HUD: the menu button and the reach prompt.
//
// The prompt used to be a bare <b> inside a div that inherited `pointer-events: none` from #game,
// so the one thing telling the player they could interact was neither a button nor tappable. It is
// a real <button> at --tap height now, which is also what game.css was already styling.

import { el, clear } from './ui.js';

export class Hud {
  constructor({ host, onMenu = () => {}, onInteract = () => {} }) {
    this.host = host;

    const bar = el('div', 'g-bar-top');
    const menu = el('button', 'g-round', '≡');
    menu.setAttribute('aria-label', 'Menu');
    menu.onclick = onMenu;
    bar.append(menu);

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
