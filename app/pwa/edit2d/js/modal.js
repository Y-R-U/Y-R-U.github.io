/* modal.js – custom modal system (no alert/prompt/confirm) */

let overlay, box, titleEl, bodyEl, inputEl, btnRow;
let resolveModal = null;

export function initModals() {
  overlay = document.getElementById('modal-overlay');
  box = document.getElementById('modal-box');
  titleEl = document.getElementById('modal-title');
  bodyEl = document.getElementById('modal-body');
  inputEl = document.getElementById('modal-input');
  btnRow = document.getElementById('modal-buttons');

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(null);
  });
}

function showModal(title, body, buttons, showInput = false, placeholder = '') {
  titleEl.textContent = title;
  bodyEl.textContent = body;
  inputEl.style.display = showInput ? '' : 'none';
  inputEl.value = '';
  inputEl.placeholder = placeholder;
  btnRow.innerHTML = '';

  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'modal-btn' + (b.primary ? ' modal-btn-primary' : '');
    btn.textContent = b.label;
    btn.onclick = () => closeModal(b.value);
    btnRow.appendChild(btn);
  });

  overlay.classList.add('active');
  if (showInput) inputEl.focus();

  return new Promise(r => { resolveModal = r; });
}

function closeModal(value) {
  overlay.classList.remove('active');
  if (resolveModal) { resolveModal(value); resolveModal = null; }
}

export function modalAlert(message, title = 'Notice') {
  return showModal(title, message, [{ label: 'OK', value: true, primary: true }]);
}

export function modalConfirm(message, title = 'Confirm') {
  return showModal(title, message, [
    { label: 'Cancel', value: false },
    { label: 'OK', value: true, primary: true },
  ]);
}

export function modalPrompt(message, placeholder = '', title = 'Input') {
  return showModal(title, message, [
    { label: 'Cancel', value: '__cancel__' },
    { label: 'OK', value: '__ok__', primary: true },
  ], true, placeholder).then(v => {
    if (v === '__ok__') return inputEl.value;
    return null;
  });
}

export function modalSelect(title, message, options) {
  return new Promise(resolve => {
    titleEl.textContent = title;
    bodyEl.textContent = message;
    inputEl.style.display = 'none';
    btnRow.innerHTML = '';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'modal-btn';
      btn.textContent = opt.label;
      btn.onclick = () => { overlay.classList.remove('active'); resolve(opt.value); };
      btnRow.appendChild(btn);
    });

    const cancel = document.createElement('button');
    cancel.className = 'modal-btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => { overlay.classList.remove('active'); resolve(null); };
    btnRow.appendChild(cancel);

    overlay.classList.add('active');
    resolveModal = resolve;
  });
}

/**
 * Pack picker – shows a visual card grid for spritesheet selection.
 * @param {Array} packs  – catalog entries [{id, name, tileSize, builtin?, image?}]
 * @param {string} currentId – currently active pack id
 * @returns {Promise<string|null>} selected pack id, or null if cancelled
 */
export function modalPackPicker(packs, currentId) {
  return new Promise(resolve => {
    titleEl.textContent = 'Choose Sprite Pack';
    inputEl.style.display = 'none';
    btnRow.innerHTML = '';

    // Build card grid inside bodyEl
    bodyEl.textContent = '';
    const grid = document.createElement('div');
    grid.className = 'pack-picker-grid';

    packs.forEach(p => {
      const card = document.createElement('button');
      card.className = 'pack-card' + (p.id === currentId ? ' pack-card-active' : '');

      const name = document.createElement('span');
      name.className = 'pack-card-name';
      name.textContent = p.name;

      const meta = document.createElement('span');
      meta.className = 'pack-card-meta';
      meta.textContent = p.builtin ? 'Built-in' : `${p.tileSize}×${p.tileSize}px`;

      if (p.id === currentId) {
        const badge = document.createElement('span');
        badge.className = 'pack-card-badge';
        badge.textContent = 'Active';
        card.appendChild(badge);
      }

      card.appendChild(name);
      card.appendChild(meta);
      card.onclick = () => { overlay.classList.remove('active'); resolve(p.id); };
      grid.appendChild(card);
    });

    bodyEl.appendChild(grid);

    // Cancel button
    const cancel = document.createElement('button');
    cancel.className = 'modal-btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => { overlay.classList.remove('active'); resolve(null); };
    btnRow.appendChild(cancel);

    overlay.classList.add('active');
    resolveModal = resolve;
  });
}
