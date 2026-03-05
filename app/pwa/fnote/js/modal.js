const overlay = document.getElementById('modal-overlay');
const card = document.getElementById('modal-card');

let resolveModal = null;

function closeModal(value) {
  overlay.classList.remove('active');
  if (resolveModal) {
    resolveModal(value);
    resolveModal = null;
  }
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal(null);
});

function showModal({ title, message, inputs, buttons }) {
  return new Promise((resolve) => {
    resolveModal = resolve;
    card.innerHTML = '';

    if (title) {
      const t = document.createElement('div');
      t.className = 'modal-title';
      t.textContent = title;
      card.appendChild(t);
    }

    if (message) {
      const m = document.createElement('div');
      m.className = 'modal-body';
      m.textContent = message;
      card.appendChild(m);
    }

    let inputEl = null;
    if (inputs && inputs.length > 0) {
      inputs.forEach(cfg => {
        const inp = document.createElement('input');
        inp.className = 'modal-input';
        inp.type = cfg.type || 'text';
        inp.placeholder = cfg.placeholder || '';
        if (cfg.value) inp.value = cfg.value;
        card.appendChild(inp);
        if (!inputEl) inputEl = inp;
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            closeModal(inp.value);
          }
        });
      });
    }

    if (buttons && buttons.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      buttons.forEach(btn => {
        const b = document.createElement('button');
        b.className = `modal-btn ${btn.class || 'modal-btn-secondary'}`;
        b.textContent = btn.label;
        b.addEventListener('click', () => {
          if (btn.value === '__input__' && inputEl) {
            closeModal(inputEl.value);
          } else {
            closeModal(btn.value);
          }
        });
        actions.appendChild(b);
      });
      card.appendChild(actions);
    }

    overlay.classList.add('active');
    if (inputEl) {
      setTimeout(() => inputEl.focus(), 50);
    }
  });
}

export async function modalAlert(message, title = '') {
  await showModal({
    title,
    message,
    buttons: [{ label: 'OK', class: 'modal-btn-primary', value: true }],
  });
}

export async function modalConfirm(message, title = '') {
  const result = await showModal({
    title,
    message,
    buttons: [
      { label: 'Cancel', class: 'modal-btn-secondary', value: false },
      { label: 'Confirm', class: 'modal-btn-danger', value: true },
    ],
  });
  return result === true;
}

export async function modalPrompt(message, placeholder = '', title = '') {
  const result = await showModal({
    title,
    message,
    inputs: [{ placeholder }],
    buttons: [
      { label: 'Cancel', class: 'modal-btn-secondary', value: null },
      { label: 'OK', class: 'modal-btn-primary', value: '__input__' },
    ],
  });
  return result;
}

export async function modalChoice(title, choices) {
  const result = await showModal({
    title,
    buttons: choices.map(c => ({
      label: c,
      class: 'modal-btn-choice',
      value: c,
    })),
  });
  return result;
}

export { showModal };
