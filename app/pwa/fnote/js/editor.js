import * as store from './store.js';
import { navigate } from './router.js';
import { debounce } from './utils.js';
import { modalConfirm } from './modal.js';

const titleInput = document.getElementById('editor-title');
const contentEl = document.getElementById('editor-content');
const saveIndicator = document.getElementById('save-indicator');
const deleteBtn = document.getElementById('editor-delete');
const backBtn = document.getElementById('editor-back');
const fontSizeSelect = document.getElementById('tool-fontsize');
const fontColorInput = document.getElementById('tool-fontcolor');
const checklistBtn  = document.getElementById('tool-checklist');
const radiolistBtn  = document.getElementById('tool-radiolist');
const copyTextBtn   = document.getElementById('tool-copy-text');
const copyHtmlBtn   = document.getElementById('tool-copy-html');

let currentItem = null;
let isNew = false;
let debouncedSave = null;

export function renderEditor(noteId) {
  currentItem = store.getById(noteId);
  if (!currentItem) {
    navigate('#/');
    return;
  }

  isNew = !currentItem.content && !currentItem.title;
  titleInput.value = currentItem.title || '';
  contentEl.innerHTML = currentItem.content || '';
  fontSizeSelect.value = '3';
  saveIndicator.classList.remove('flash');
  saveIndicator.style.opacity = '0';

  // Set font color input to match theme
  const theme = document.documentElement.dataset.theme;
  fontColorInput.value = theme === 'dark' ? '#e0e0e0' : '#1a1a2e';

  if (debouncedSave) debouncedSave.cancel();
  debouncedSave = debounce(doSave, 800);

  contentEl.focus();
}

function doSave() {
  if (!currentItem) return;
  currentItem.title = titleInput.value.trim();
  currentItem.content = contentEl.innerHTML;
  currentItem.updatedAt = Date.now();
  store.save(currentItem);
  flashSaved();
}

function flashSaved() {
  saveIndicator.classList.remove('flash');
  void saveIndicator.offsetWidth;
  saveIndicator.classList.add('flash');
}

// Title changes
titleInput.addEventListener('input', () => {
  if (debouncedSave) debouncedSave();
});

// Content changes
contentEl.addEventListener('input', () => {
  if (debouncedSave) debouncedSave();
});

// Paste as plain text
contentEl.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
});

// Enter key in checkbox/radio lists
contentEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const node = sel.anchorNode;
  const checkRow = node?.closest?.('.fn-check') || node?.parentElement?.closest?.('.fn-check');
  const radioRow = node?.closest?.('.fn-radio') || node?.parentElement?.closest?.('.fn-radio');
  const row = checkRow || radioRow;
  if (!row) return;

  e.preventDefault();

  // Get the text content after the toggle span
  const toggle = row.querySelector('.fn-cb, .fn-rd');
  const textContent = row.textContent.replace(toggle?.textContent || '', '').trim();

  if (!textContent) {
    // Empty entry: remove the row and insert a plain line break
    const br = document.createElement('br');
    row.parentNode.insertBefore(br, row.nextSibling);
    row.remove();
    // Place cursor after the br
    const range = document.createRange();
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    // Create a new entry of the same type
    const isCheck = !!checkRow;
    const newRow = document.createElement('div');
    newRow.className = isCheck ? 'fn-check' : 'fn-radio';
    const span = document.createElement('span');
    span.className = isCheck ? 'fn-cb' : 'fn-rd';
    span.dataset.checked = 'false';
    span.contentEditable = 'false';
    span.innerHTML = isCheck ? '&#9744;' : '&#9675;';
    newRow.appendChild(span);
    newRow.appendChild(document.createTextNode('\u00A0'));
    row.parentNode.insertBefore(newRow, row.nextSibling);
    // Place cursor in the new row after the span
    const range = document.createRange();
    range.setStart(newRow.lastChild, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  if (debouncedSave) debouncedSave();
});

// Delete / Cancel
deleteBtn.addEventListener('click', async () => {
  if (!currentItem) return;
  const hasContent = currentItem.content && contentEl.innerHTML.replace(/<br\s*\/?>/g, '').trim();
  const hasTitle = titleInput.value.trim();

  if (isNew && !hasContent && !hasTitle) {
    store.remove(currentItem.id);
    navigateBack();
    return;
  }

  const confirmed = await modalConfirm('Delete this note?', 'Delete Note');
  if (confirmed) {
    store.remove(currentItem.id);
    navigateBack();
  }
});

// Back button
backBtn.addEventListener('click', () => {
  if (debouncedSave) debouncedSave.flush();
  navigateBack();
});

function navigateBack() {
  if (currentItem && currentItem.parentId) {
    navigate(`#/folder/${currentItem.parentId}`);
  } else {
    navigate('#/');
  }
  currentItem = null;
}

// Toolbar: Font Size
fontSizeSelect.addEventListener('change', () => {
  document.execCommand('fontSize', false, fontSizeSelect.value);
  contentEl.focus();
  if (debouncedSave) debouncedSave();
});

// Toolbar: Font Color
fontColorInput.addEventListener('input', () => {
  document.execCommand('foreColor', false, fontColorInput.value);
  contentEl.focus();
  if (debouncedSave) debouncedSave();
});

// Toolbar: Checkbox List
checklistBtn.addEventListener('click', () => {
  const html = '<div class="fn-check"><span class="fn-cb" data-checked="false" contenteditable="false">&#9744;</span>&nbsp;</div>';
  document.execCommand('insertHTML', false, html);
  contentEl.focus();
  if (debouncedSave) debouncedSave();
});

// Toolbar: Radio List
radiolistBtn.addEventListener('click', () => {
  const html = '<div class="fn-radio"><span class="fn-rd" data-checked="false" contenteditable="false">&#9675;</span>&nbsp;</div>';
  document.execCommand('insertHTML', false, html);
  contentEl.focus();
  if (debouncedSave) debouncedSave();
});

// Toolbar: Copy as plain text
copyTextBtn.addEventListener('click', () => {
  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll('.fn-cb').forEach(cb => {
    cb.replaceWith(cb.dataset.checked === 'true' ? '[x]' : '[ ]');
  });
  clone.querySelectorAll('.fn-rd').forEach(rd => {
    rd.replaceWith(rd.dataset.checked === 'true' ? '(*)' : '( )');
  });
  navigator.clipboard.writeText(clone.innerText || clone.textContent);
  flashBtn(copyTextBtn);
});

// Toolbar: Copy as HTML
copyHtmlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(contentEl.innerHTML);
  flashBtn(copyHtmlBtn);
});

function flashBtn(btn) {
  btn.style.borderColor = 'var(--accent)';
  setTimeout(() => { btn.style.borderColor = ''; }, 800);
}

// Checkbox/Radio click toggling
contentEl.addEventListener('click', (e) => {
  const cb = e.target.closest('.fn-cb');
  if (cb) {
    const checked = cb.dataset.checked === 'true';
    cb.dataset.checked = String(!checked);
    cb.innerHTML = checked ? '&#9744;' : '&#9745;';
    if (debouncedSave) debouncedSave();
    return;
  }

  const rd = e.target.closest('.fn-rd');
  if (rd) {
    // Deselect siblings
    const group = rd.closest('.fn-radio')?.parentElement || contentEl;
    group.querySelectorAll('.fn-rd').forEach(r => {
      r.dataset.checked = 'false';
      r.innerHTML = '&#9675;';
    });
    rd.dataset.checked = 'true';
    rd.innerHTML = '&#9679;';
    if (debouncedSave) debouncedSave();
  }
});

// Force save on leaving editor (flush debounce)
export function flushSave() {
  if (debouncedSave) debouncedSave.flush();
}
