/* One modal, reused. Nothing in this game uses a browser dialog. */

import { $, el } from '../util.js';
import { Audio } from '../audio.js';

export const Modal = {
  open: false, onClose: null,

  show({ kicker = '', title = '', sub = '', body = '', buttons = [], art = null, dismissable = true }) {
    $('m-kick').textContent = kicker;
    $('m-title').textContent = title;
    $('m-sub').innerHTML = sub;
    $('m-sub').style.display = sub ? '' : 'none';
    const b = $('m-body');
    b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    b.style.display = (typeof body === 'string' ? body : !!body) ? '' : 'none';
    const artBox = $('m-art');
    artBox.innerHTML = '';
    artBox.className = art ? 'on' : '';
    if (art) artBox.appendChild(art);
    const foot = $('m-foot');
    foot.innerHTML = '';
    for (const [label, fn, cls] of buttons) {
      const btn = el('button', 'btn ' + (cls || ''), label);
      btn.onclick = () => { Audio.click(); fn(); };
      foot.appendChild(btn);
    }
    this.dismissable = dismissable;
    $('modal').classList.add('on');
    this.open = true;
  },

  hide() {
    $('modal').classList.remove('on');
    this.open = false;
    const cb = this.onClose; this.onClose = null;
    cb?.();
  },

  /** A stack of small confirmations, shown one after another. */
  queue: [],
  push(cfg) { this.queue.push(cfg); if (!this.open) this.next(); },
  next() {
    if (!this.queue.length) return false;
    const cfg = this.queue.shift();
    const btns = cfg.buttons || [['Good', () => { this.hide(); this.next(); }, 'go']];
    this.show({ ...cfg, buttons: btns });
    return true;
  },
};

document.addEventListener('click', e => {
  if (e.target === $('modal') && Modal.open && Modal.dismissable) { Modal.hide(); Modal.next(); }
});
