export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function btn(cls, text, onClick, label) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

export function show(node, on) {
  if (node.hidden === !on) return;
  node.hidden = !on;
}

export const reducedMotion = () => document.documentElement.classList.contains('calm');

export function sheetRow(label, value) {
  const r = el('div', 'row');
  r.append(el('span', 'row-k', label), el('b', 'row-v', String(value)));
  return r;
}

export function bar(p, cls = '') {
  const b = el('div', 'bar ' + cls);
  const f = el('i');
  f.style.setProperty('--p', Math.max(0, Math.min(1, p || 0)).toFixed(3));
  b.appendChild(f);
  return b;
}
