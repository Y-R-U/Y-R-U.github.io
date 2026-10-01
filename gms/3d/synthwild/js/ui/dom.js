// Tiny DOM helpers + styled popups (never alert/confirm/prompt).
export function h(tag, attrs = {}, ...kids) {
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

let layer = null;
let audioRef = null;
export function setLayer(root, audio) { layer = root; audioRef = audio; }
export const click = (name = 'click') => audioRef?.sfx?.(name);

// Styled modal-free popup: a centred glass card over a dim scrim. Resolves with the chosen value.
export function popup({ title, text, input, buttons = [{ label: 'OK', value: true, primary: true }], danger = false }) {
  return new Promise((resolve) => {
    let field = null;
    const close = (v) => {
      card.classList.add('out'); scrim.classList.add('out');
      setTimeout(() => scrim.remove(), 180);
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    if (input) {
      field = h('input.sw-input', { type: 'text', value: input.value || '', maxLength: input.max || 48,
        placeholder: input.placeholder || '', autocomplete: 'off', spellcheck: false });
    }
    const btns = buttons.map((b) => h('button.sw-btn' + (b.primary ? (danger ? '.danger' : '.primary') : ''), {
      onclick: () => { click(); close(field && b.value === true ? field.value.trim() : b.value); },
    }, b.label));
    const card = h('div.sw-pop.glass', { role: 'dialog' },
      title && h('h3', {}, title), text && h('p', {}, text), field, h('div.sw-pop-btns', {}, btns));
    const scrim = h('div.sw-scrim', { onpointerdown: (e) => { if (e.target === scrim) close(null); } }, card);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      else if (e.key === 'Enter') { e.stopPropagation(); const p = buttons.find((b) => b.primary); if (p) close(field ? field.value.trim() : p.value); }
    };
    document.addEventListener('keydown', onKey, true);
    (layer || document.body).append(scrim);
    if (field) setTimeout(() => { field.focus(); field.select(); }, 30);
  });
}

export const confirmPop = (title, text, yes = 'Yes', danger = false) =>
  popup({ title, text, danger, buttons: [{ label: 'Cancel', value: false }, { label: yes, value: true, primary: true }] });

export const promptPop = (title, value, placeholder, yes = 'Save') =>
  popup({ title, input: { value, placeholder }, buttons: [{ label: 'Cancel', value: null }, { label: yes, value: true, primary: true }] });

let toastBox = null;
export function toast(text, { kind = 'info', ms = 2600, icon = null } = {}) {
  if (!toastBox || !toastBox.isConnected) {
    toastBox = h('div.sw-toasts');
    (layer || document.body).append(toastBox);
  }
  const t = h('div.sw-toast.glass.' + kind, {}, icon && h('span.ti', {}, icon), h('span', {}, text));
  toastBox.append(t);
  while (toastBox.children.length > 4) toastBox.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export function fmtAgo(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(ms).toLocaleDateString();
}
