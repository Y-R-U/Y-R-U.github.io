// First run and chapter select. Three panels west to east, matching the map.

import { el, clear } from './ui.js';
import { slate } from './towns.js';

export class Slate {
  constructor({ host, doc, sound = () => {} }) {
    this.host = host;
    this.doc = doc;
    this.sound = sound;
    this.root = el('div', 'g-slate');
  }

  // Resolves with the campaign the player chose. A panel that is not playable answers instead of
  // resolving, which is the whole point of the Longacre slate.
  show() {
    this.host.append(this.root);
    return new Promise(done => this.draw(done));
  }

  close() { this.root.remove(); }

  draw(done) {
    clear(this.root);
    this.root.append(el('h1', null, 'FORGE'));

    const panels = el('div', 'g-panels');
    const reply = el('div', 'g-reply');
    for (const p of slate(this.doc)) {
      const b = el('button', `g-panel ${p.state}`);
      b.append(el('u', null, p.mark), el('b', null, p.name.toUpperCase()));
      if (p.line) b.append(el('span', null, p.line));
      b.append(el('em', null, p.ground));
      b.onclick = () => {
        this.sound(p.playable ? 'uiConfirm' : 'uiBlip');
        if (p.playable) { this.close(); return done(p.id); }
        reply.textContent = p.reply;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { reply.textContent = ''; }, 3000);
      };
      panels.append(b);
    }
    this.root.append(panels, reply);
  }
}
