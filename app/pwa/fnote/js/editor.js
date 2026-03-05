import * as store from './store.js';
import { navigate } from './router.js';
import { debounce } from './utils.js';
import { modalConfirm } from './modal.js';

const titleInput = document.getElementById('editor-title');
const contentEl = document.getElementById('editor-content');
const saveIndicator = document.getElementById('save-indicator');
const deleteBtn = document.getElementById('editor-delete');
const fontSizeSelect = document.getElementById('tool-fontsize');
const fontColorInput = document.getElementById('tool-fontcolor');
const checklistBtn = document.getElementById('tool-checklist');
const radiolistBtn = document.getElementById('tool-radiolist');

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
