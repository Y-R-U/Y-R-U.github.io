// Shared UI kit: DOM builder, toasts, modals, confirm/prompt/pick, busy overlay.
import { sfx } from './sfx.js';

/**
 * el('div.card#id', {text|html, class, style:{}, on:{click}, ...attrs}, [children])
 * Children may be nodes, strings, or falsy (skipped).
 */
export function el(sel, props = {}, children = []) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const node = document.createElement(m[1] || 'div');
  if (m[2]) for (const tok of m[2].match(/[.#][\w-]+/g) || []) {
    if (tok[0] === '.') node.classList.add(tok.slice(1)); else node.id = tok.slice(1);
  }
  if (props && (props.nodeType || typeof props === 'string' || Array.isArray(props))) { children = props; props = {}; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && k !== 'title' && typeof v !== 'object') { try { node[k] = v; } catch (e) { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (!c && c !== 0) continue;
    node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** Big friendly button. kind: primary | good | warn | danger | ghost */
export function button(label, opts = {}) {
  const b = el('button.btn' + (opts.kind ? '.' + opts.kind : ''), {
    type: 'button',
    title: opts.title || '',
    on: { click: (e) => { sfx.play(opts.sound || 'click'); opts.onClick && opts.onClick(e); } }
  }, [opts.icon ? el('span.btn-i', { text: opts.icon }) : null, el('span', { text: label })]);
  if (opts.hint) b.dataset.hint = opts.hint;
  if (opts.id) b.id = opts.id;
  return b;
}

// ---------------------------------------------------------------- toasts ----
let toastWrap = null;
export function toast(msg, kind = 'info', ms = 2600) {
  if (!toastWrap) { toastWrap = el('div#toasts'); document.body.appendChild(toastWrap); }
  const t = el('div.toast.' + kind, {}, [
    el('span.toast-i', { text: kind === 'good' ? '✓' : kind === 'bad' ? '✕' : kind === 'warn' ? '!' : 'i' }),
    el('span', { text: msg })
  ]);
  toastWrap.appendChild(t);
  if (kind === 'bad') sfx.play('bad'); else if (kind === 'good') sfx.play('good');
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, ms);
  return t;
}

// ---------------------------------------------------------------- modals ----
let modalStack = [];

/**
 * modal({title, body:Node|string, buttons:[{label,kind,close,onClick}], wide, onClose, dismissable})
 * @returns {{close:Function, root:HTMLElement, body:HTMLElement}}
 */
export function modal(opts = {}) {
  const back = el('div.modal-back');
  const box = el('div.modal' + (opts.wide ? '.wide' : '') + (opts.huge ? '.huge' : ''));
  const body = el('div.modal-body');
  if (opts.body) body.appendChild(opts.body.nodeType ? opts.body : el('p', { html: opts.body }));

  const head = el('div.modal-head', {}, [
    opts.icon ? el('span.modal-icon', { text: opts.icon }) : null,
    el('h2', { text: opts.title || '' }),
    opts.dismissable === false ? null : el('button.modal-x', { type: 'button', 'aria-label': 'Close', text: '✕', on: { click: () => api.close(null) } })
  ]);

  const foot = el('div.modal-foot');
  for (const b of (opts.buttons || [])) {
    foot.appendChild(button(b.label, {
      kind: b.kind, icon: b.icon,
      onClick: () => { const r = b.onClick ? b.onClick() : undefined; if (b.close !== false) api.close(r === undefined ? b.value : r); }
    }));
  }

  box.append(head, body, ...(opts.buttons && opts.buttons.length ? [foot] : []));
  back.appendChild(box);
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('in'));

  let resolve;
  const done = new Promise(r => { resolve = r; });
  const api = {
    root: back, box, body, done,
    close(val) {
      if (!back.isConnected) return;
      back.classList.remove('in');
      setTimeout(() => back.remove(), 200);
      modalStack = modalStack.filter(m => m !== api);
      opts.onClose && opts.onClose(val);
      resolve(val);
    }
  };
  if (opts.dismissable !== false) back.addEventListener('mousedown', e => { if (e.target === back) api.close(null); });
  modalStack.push(api);
  sfx.play('pop');
  return api;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalStack.length) { e.stopPropagation(); modalStack[modalStack.length - 1].close(null); }
}, true);

export function confirmBox({ title, body, ok = 'Yes', cancel = 'No', danger = false, icon = '❓' }) {
  return modal({
    title, icon, body,
    buttons: [
      { label: cancel, kind: 'ghost', value: false },
      { label: ok, kind: danger ? 'danger' : 'good', value: true }
    ]
  }).done.then(v => v === true);
}

export function promptBox({ title, label, value = '', placeholder = '', hint = '', ok = 'OK', icon = '✏️', validate }) {
  const input = el('input.field', { type: 'text', value, placeholder });
  const err = el('div.field-err');
  const body = el('div', {}, [
    label ? el('label.field-label', { text: label }) : null,
    input,
    hint ? el('div.field-hint', { text: hint }) : null,
    err
  ]);
  const m = modal({
    title, icon, body,
    buttons: [{ label: 'Cancel', kind: 'ghost', value: null }, {
      label: ok, kind: 'good', close: false,
      onClick: () => {
        const v = input.value.trim();
        const problem = validate ? validate(v) : (v ? null : 'Please type something.');
        if (problem) { err.textContent = problem; input.focus(); return; }
        m.close(v);
      }
    }]
  });
  setTimeout(() => { input.focus(); input.select(); }, 60);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      const problem = validate ? validate(v) : (v ? null : 'Please type something.');
      if (problem) { err.textContent = problem; return; }
      m.close(v);
    }
  });
  return m.done;
}

/** pickBox({title, items:[{icon,label,desc,value}]}) -> Promise<value|null> */
export function pickBox({ title, icon = '🧩', items = [], columns = 1 }) {
  const list = el('div.pick' + (columns > 1 ? '.cols' : ''));
  const m = modal({ title, icon, body: list, wide: columns > 1 });
  for (const it of items) {
    list.appendChild(el('button.pick-item', {
      type: 'button', on: { click: () => { sfx.play('click'); m.close(it.value); } }
    }, [
      it.icon ? el('span.pick-icon', { text: it.icon }) : null,
      el('span.pick-txt', {}, [el('b', { text: it.label }), it.desc ? el('small', { text: it.desc }) : null])
    ]));
  }
  return m.done;
}

let busyEl = null, busyCount = 0;
export function busy(msg = 'Working…') {
  busyCount++;
  if (!busyEl) {
    busyEl = el('div.busy', {}, [el('div.busy-box', {}, [el('div.spinner'), el('span.busy-msg', { text: msg })])]);
    document.body.appendChild(busyEl);
  } else busyEl.querySelector('.busy-msg').textContent = msg;
  return {
    msg(m) { if (busyEl) busyEl.querySelector('.busy-msg').textContent = m; },
    done() { if (--busyCount <= 0) { busyCount = 0; busyEl && busyEl.remove(); busyEl = null; } }
  };
}

/** A labelled form row. control may be any node. */
export function row(label, control, hint) {
  return el('div.form-row', {}, [
    el('label.field-label', { text: label }),
    control,
    hint ? el('div.field-hint', { text: hint }) : null
  ]);
}

export function textField(value = '', opts = {}) {
  return el('input.field', { type: opts.type || 'text', value, placeholder: opts.placeholder || '', ...(opts.attrs || {}) });
}

export function select(options, value, onChange) {
  const s = el('select.field', { on: { change: () => onChange && onChange(s.value) } });
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    s.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === value }));
  }
  s.value = value;
  return s;
}

export function toggle(checked, onChange, label) {
  const input = el('input', { type: 'checkbox', checked, on: { change: () => onChange(input.checked) } });
  return el('label.switch', {}, [input, el('span.slider'), label ? el('span.switch-label', { text: label }) : null]);
}

export function slider(value, { min = 0, max = 100, step = 1, onInput, format }) {
  const out = el('span.slider-val', { text: format ? format(value) : String(value) });
  const s = el('input.range', {
    type: 'range', min, max, step, value,
    on: { input: () => { const v = parseFloat(s.value); out.textContent = format ? format(v) : String(v); onInput && onInput(v); } }
  });
  return el('span.slider-wrap', {}, [s, out]);
}

/**
 * Ask the user for a file. accept e.g. '.mcaddon,.zip' or 'image/png'
 * Resolves with null when they cancel — an unresolved promise would leave the caller (and its
 * "Opening…" overlay) hanging for the rest of the session.
 */
export function pickFile(accept = '', multiple = false) {
  return new Promise(res => {
    const inp = el('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener('focus', onFocus);
      inp.remove();
      res(value);
    };
    // 'cancel' fires in modern browsers; the focus fallback covers the rest.
    const onFocus = () => setTimeout(() => { if (!inp.files || !inp.files.length) finish(multiple ? [] : null); }, 400);
    inp.addEventListener('change', () => finish(multiple ? [...inp.files] : (inp.files[0] || null)));
    inp.addEventListener('cancel', () => finish(multiple ? [] : null));
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => window.addEventListener('focus', onFocus), 0);
  });
}
