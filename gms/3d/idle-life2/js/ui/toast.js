import { el } from './dom.js?v=20261004a';

export function createToasts(root) {
  const box = el('div', 'toasts');
  box.setAttribute('aria-live', 'polite');
  root.appendChild(box);

  function remove(t) {
    t.classList.add('out');
    setTimeout(() => t.remove(), 350);
  }

  return {
    toast(text, { ms = 2000, cls = '' } = {}) {
      for (const t of box.children) if (t.textContent === text) { remove(t); }
      while (box.children.length >= 2) box.firstChild.remove();
      const t = el('div', 'toast ' + cls, text);
      box.appendChild(t);
      setTimeout(() => remove(t), ms);
      return t;
    },
    cardToast(card, text) {
      const old = card.querySelector('.card-toast');
      if (old) old.remove();
      const t = el('div', 'card-toast', text);
      card.appendChild(t);
      setTimeout(() => t.remove(), 1700);
    },
  };
}
