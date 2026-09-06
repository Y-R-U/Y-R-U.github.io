// The play HUD: the menu button and the reach prompt.
//
// The prompt used to be a bare <b> inside a div that inherited `pointer-events: none` from #game,
// so the one thing telling the player they could interact was neither a button nor tappable. It is
// a real <button> at --tap height now, which is also what game.css was already styling.

import { el, clear } from './ui.js';

// A bar and its fill. Scaled rather than sized: a width transition on a percentage relayouts the
// HUD every frame a blow lands, and the fight is the one moment the frame budget is spoken for.
function bar2(cls) {
  const root = el('div', `g-hpline ${cls}`);
  const fill = el('i');
  root.append(fill);
  return { root, set: k => { fill.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`; } };
}

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

    // Health, and the elemental's. Both are hidden until there is a fight, because a health bar
    // on a screen where nothing can hurt you is a promise the rest of the game does not keep.
    this.vitals = el('div', 'g-hpbar');
    this.vitals.hidden = true;
    this.mine = bar2('g-hpmine');
    this.theirs = bar2('g-hpfoe');
    this.vitals.append(this.mine.root, this.theirs.root);

    host.append(bar, this.vitals, this.prompt);
    this.showing = null;
    this.shown = null;
  }

  // `me` and `foe` are 0..1, or null for "not in a fight" and "nothing left standing".
  setVitals(me, foe) {
    const key = `${me == null ? '-' : me.toFixed(2)}:${foe == null ? '-' : foe.toFixed(2)}`;
    if (key === this.shown) return;
    this.shown = key;
    this.vitals.hidden = me == null;
    if (me == null) return;
    this.mine.set(me);
    this.theirs.root.hidden = foe == null;
    if (foe != null) this.theirs.set(foe);
  }

  // `text` is the hotspot's name, or null when nothing is in reach.
  setPrompt(text) {
    if (text === this.showing) return;
    this.showing = text;
    this.prompt.hidden = !text;
    if (text) clear(this.button).append(el('span', null, text));
  }
}
