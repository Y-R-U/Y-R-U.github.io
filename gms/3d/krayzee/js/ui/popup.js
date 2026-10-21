import { el, esc, onTap, ICON } from './dom.js';

export function createPopup(root, { title, sub = '', cls = '', onClose } = {}) {
  const node = el(`<div class="kz-pop ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="kz-panel">
      <div class="kz-head"><h2><small>${esc(sub)}</small>${esc(title)}</h2><button class="kz-x" aria-label="Close">${ICON.close}</button></div>
      <div class="kz-slot"></div>
      <div class="kz-foot"></div>
    </div>
  </div>`);
  root.append(node);
  const slot = node.querySelector('.kz-slot');
  slot.replaceWith(...[el('<div class="kz-body"></div>')]);
  const pop = {
    node,
    panel: node.querySelector('.kz-panel'),
    body: node.querySelector('.kz-body'),
    foot: node.querySelector('.kz-foot'),
    x: node.querySelector('.kz-x'),
    closable: true,
    get isOpen() { return node.classList.contains('on'); },
    open() { node.classList.add('on'); },
    close() { if (!pop.isOpen) return; node.classList.remove('on'); onClose?.(); },
    setTitle(t, s) { node.querySelector('.kz-head h2').innerHTML = `<small>${esc(s ?? sub)}</small>${esc(t)}`; },
  };
  onTap(pop.x, () => { if (pop.closable) pop.close(); }, 'back');
  node.addEventListener('click', (e) => { if (e.target === node && pop.closable) pop.close(); });
  return pop;
}
