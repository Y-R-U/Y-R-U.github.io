import { h } from './kit.js?v=202610081215';

let layer = null;
const ensure = () => layer || (layer = document.getElementById('popups') || document.body.appendChild(h('div', { id: 'popups' })));

// Styled in-page popup. actions: [{ label, value, primary?, danger? }]. Resolves with the chosen value (null on dismiss).
export function popup({ title = '', body = '', actions = [{ label: 'OK', value: true, primary: true }], dismiss = true, cls = '' } = {}) {
  return new Promise(resolve => {
    const root = ensure();
    const card = h('div.pop-card', { role: 'dialog', 'aria-modal': 'true', class: cls });
    const back = h('div.pop', {}, card);
    if (title) card.append(h('h3.pop-title', {}, title));
    if (body) card.append(typeof body === 'string' ? h('div.pop-body', { html: body }) : h('div.pop-body', {}, body));
    const row = h('div.pop-actions');
    let done = false;
    const close = v => {
      if (done) return;
      done = true;
      back.classList.add('out');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => back.remove(), 220);
      resolve(v);
    };
    for (const a of actions) row.append(h('button.btn', { type: 'button', class: a.primary ? 'primary' : a.danger ? 'danger' : 'ghost', onclick: () => close(a.value) }, a.label));
    card.append(row);
    if (dismiss) back.addEventListener('click', e => { if (e.target === back) close(null); });
    const onKey = e => {
      if (e.key === 'Escape' && dismiss) { e.stopPropagation(); close(null); }
      if (e.key === 'Enter') { const p = actions.find(a => a.primary); if (p) { e.preventDefault(); e.stopPropagation(); close(p.value); } }
    };
    document.addEventListener('keydown', onKey, true);
    root.append(back);
    requestAnimationFrame(() => back.classList.add('in'));
    back._close = close;
  });
}

export const confirmPop = (title, body, yes = 'Yes', no = 'Cancel', danger = false) =>
  popup({ title, body, actions: [{ label: no, value: false }, { label: yes, value: true, primary: !danger, danger }] });

export function toast(msg, ms = 2400) {
  const root = ensure();
  const t = h('div.toast', {}, msg);
  root.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

export const closeAll = () => document.querySelectorAll('#popups .pop').forEach(p => p._close && p._close(null));
