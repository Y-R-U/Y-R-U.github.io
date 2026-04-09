/**
 * Modal dialog — reusable popup for project creation, confirmations, etc.
 */
const Modal = (() => {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const btnCancel = document.getElementById('btn-modal-cancel');
  const btnConfirm = document.getElementById('btn-modal-confirm');

  let onConfirm = null;

  function show({ title, bodyHTML, confirmText, onOk }) {
    titleEl.textContent = title || 'Confirm';
    bodyEl.innerHTML = bodyHTML || '';
    btnConfirm.textContent = confirmText || 'OK';
    onConfirm = onOk || null;
    overlay.classList.remove('hidden');
    // Focus first input if any
    const firstInput = bodyEl.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function hide() {
    overlay.classList.add('hidden');
    onConfirm = null;
  }

  btnCancel.addEventListener('click', hide);

  btnConfirm.addEventListener('click', () => {
    if (onConfirm) onConfirm();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  // Enter key confirms
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && onConfirm) onConfirm();
    if (e.key === 'Escape') hide();
  });

  return { show, hide };
})();
