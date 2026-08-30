// Enough DOM sugar that a panel reads as the shape it draws. Nothing here is level-specific.

export function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k === 'data') Object.assign(n.dataset, v);
    else if (k.startsWith('on')) n[k.toLowerCase()] = v;
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  add(n, kids);
  return n;
}

function add(n, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(n, k);
    else n.append(k instanceof Node ? k : String(k));
  }
}

export const btn = (label, onclick, cls = '') => h('button', { class: cls, text: label, onclick });

export const field = (label, ...controls) => h('div', { class: 'lv-field' }, h('span', { text: label }), controls);

export const row = (...kids) => h('div', { class: 'lv-row' }, kids);

export function select(options, value, onchange, { placeholder } = {}) {
  const s = h('select', { onchange: e => onchange(e.target.value) });
  if (placeholder !== undefined) s.append(h('option', { value: '', text: placeholder }));
  for (const o of options) {
    const v = typeof o === 'string' ? o : o.v;
    s.append(h('option', { value: v, text: typeof o === 'string' ? o : o.label ?? o.v }));
  }
  s.value = value ?? '';
  // A value that is not in the list would silently blank the control and lose the authored id.
  if (s.value !== (value ?? '') && value) {
    s.append(h('option', { value, text: `${value} — missing` }));
    s.value = value;
  }
  return s;
}

export function text(value, oninput, { placeholder = '', onchange, width } = {}) {
  return h('input', { type: 'text', value: value ?? '', placeholder,
    style: width ? { width } : null,
    oninput: e => oninput(e.target.value),
    onchange: onchange ? e => onchange(e.target.value) : null });
}

export function num(value, oninput, { step = 0.5, min, max, onchange } = {}) {
  return h('input', { type: 'number', value: Number.isFinite(+value) ? +value : 0, step, min, max,
    oninput: e => oninput(e.target.value === '' ? 0 : +e.target.value),
    onchange: onchange ? e => onchange(+e.target.value || 0) : null });
}

export function check(label, on, onchange) {
  return h('label', {}, h('input', { type: 'checkbox', checked: !!on, onchange: e => onchange(e.target.checked) }), label);
}

export const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
