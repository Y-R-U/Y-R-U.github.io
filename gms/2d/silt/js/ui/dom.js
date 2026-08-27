// The whole DOM helper. Twenty lines is the right amount of framework for this.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') for (const s2 in v) (s2.startsWith('--') ? el.style.setProperty(s2, v[s2]) : (el.style[s2] = v[s2]));
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

/** SVG from markup. Cheaper and clearer than createElementNS chains. */
export function svg(markup) {
  const d = document.createElement('div');
  d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" ${markup}`;
  return d.firstElementChild;
}

export function icon(paths, vb = '0 0 24 24') {
  return svg(`viewBox="${vb}">${paths}</svg>`);
}

/** 12,480 — never 12480. Score is the one number a player actually reads. */
export function fmt(n) {
  n = Math.round(n || 0);
  return n.toLocaleString('en-US');
}

export function on(el, ev, fn) { el.addEventListener(ev, fn); return el; }

/** Buttons must not let a tap fall through to the sand behind them. */
export function tap(el, fn) {
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, { passive: true });
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
  return el;
}
