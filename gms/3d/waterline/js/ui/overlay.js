// Result, pause, settings, and every transient message — C7 owns this file.
//
// Aaron's standing rule across this repo: popups, never alert/confirm/prompt, and never a blocking
// modal for something informational. So there are three shapes here and they are different things:
//   panel()  a choice that the player has to make — result, pause, settings. It waits for a tap.
//   toast()  something that happened. It leaves on its own and blocks nothing.
//   note()   a standing condition (no localStorage). Dismissible, never in the way.

import { UI } from '../config.js';
import { register } from './flow.js';

export function buildOverlay(mount) {
  const root = document.createElement('div');
  root.className = 'screen screen-overlay';
  root.hidden = true;
  mount.appendChild(root);

  const toasts = document.createElement('div');
  toasts.className = 'toasts';
  mount.appendChild(toasts);

  const notes = document.createElement('div');
  notes.className = 'notes';
  mount.appendChild(notes);

  let current = null;
  let resolve = null;

  // Emptied, not just hidden: a hidden panel that keeps its DOM still answers querySelector, and
  // both the harness and any later code then read a result screen that closed two matches ago.
  function close(value) {
    root.hidden = true;
    root.innerHTML = '';
    current = null;
    const r = resolve;
    resolve = null;
    r?.(value);
  }

  const api = {
    root,
    get screen() { return current; },

    show(name, html = '') {
      current = name;
      root.className = `screen screen-overlay screen-${name}`;
      root.innerHTML = html;
      root.hidden = false;
    },

    hide() { if (resolve) close(null); else { current = null; root.hidden = true; root.innerHTML = ''; } },

    // Returns the chosen action's `value`. A panel with no actions cannot be dismissed, so every
    // caller must give it at least one way out.
    panel({ id, title, subtitle, body, fields, actions = [], onChange }) {
      if (resolve) close(null);
      current = id;
      root.className = `screen screen-overlay screen-${id}`;
      const lines = Array.isArray(body) ? body : body ? [body] : [];
      root.innerHTML = `
        <div class="panel">
          ${title ? `<h1>${title}</h1>` : ''}
          ${subtitle ? `<h2>${subtitle}</h2>` : ''}
          ${lines.length ? `<div class="panel-body">${lines.map(l => `<p>${l}</p>`).join('')}</div>` : ''}
          ${(fields || []).map(f => `
            <label class="field">
              <span>${f.label}</span>
              <select data-field="${f.key}">
                ${f.options.map(([v, t]) => `<option value="${v}"${v === f.value ? ' selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>`).join('')}
          <div class="panel-actions">
            ${actions.map(a => `<button data-act="${a.value}" class="${a.primary ? 'primary' : ''}${a.danger ? ' danger' : ''}">${a.label}</button>`).join('')}
          </div>
        </div>`;
      root.hidden = false;
      root.querySelectorAll('[data-field]').forEach(sel => {
        sel.onchange = () => onChange?.(sel.dataset.field, sel.value);
      });
      return new Promise(res => {
        resolve = res;
        root.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => close(b.dataset.act); });
      });
    },

    toast(text, ms = UI.toastMs) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = text;
      toasts.appendChild(el);
      requestAnimationFrame(() => el.classList.add('on'));
      setTimeout(() => {
        el.classList.remove('on');
        setTimeout(() => el.remove(), 400);
      }, ms);
      return el;
    },

    note(text) {
      const el = document.createElement('div');
      el.className = 'note';
      el.innerHTML = `<span></span><button aria-label="Dismiss">×</button>`;
      el.querySelector('span').textContent = text;
      el.querySelector('button').onclick = () => el.remove();
      notes.appendChild(el);
      return el;
    },
  };

  register('overlay', api);
  return api;
}
