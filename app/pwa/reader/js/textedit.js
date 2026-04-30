/* Text-editor view. Lets the user create or edit a text item, then either
   Save (persist text only) or Convert (queue TTS). */
import * as api from './api.js';

const $ = (id) => document.getElementById(id);

const state = {
  itemId: null,        // job id for an existing item, null for new
  parentFolderId: null,
  voice: 'af_heart',
  callbacks: null,     // {onSaved, onConvertRequested, onCancelled}
  dirty: false,
};

export function init(callbacks) {
  state.callbacks = callbacks;
  // Use the history stack — Android/browser back lands here too.
  $('btn-text-back').addEventListener('click', () => history.back());
  $('btn-text-save').addEventListener('click', onSave);
  $('btn-text-convert').addEventListener('click', onConvert);
  const markDirty = () => { state.dirty = true; };
  $('text-name').addEventListener('input', markDirty);
  $('text-body').addEventListener('input', markDirty);
}

export async function openNew(parentFolderId) {
  state.itemId = null;
  state.parentFolderId = parentFolderId;
  state.voice = 'af_heart';
  state.dirty = false;
  $('text-name').value = '';
  $('text-body').value = '';
  show();
}

export async function openExisting(jobId) {
  try {
    const data = await api.getTextItem(jobId);
    state.itemId = jobId;
    state.parentFolderId = null;
    state.voice = data.voice || 'af_heart';
    state.dirty = false;
    $('text-name').value = data.title || '';
    $('text-body').value = data.text || '';
    show();
  } catch (e) {
    state.callbacks?.onError?.('Could not load text: ' + (e.message || e));
  }
}

function show() {
  // If we came from the player, replace its history entry so back from the
  // text view lands in the library (not back through the player overlay).
  const fromPlayer = !$('player-view').classList.contains('hidden');
  $('library-view').classList.add('hidden');
  $('player-view').classList.add('hidden');
  $('text-view').classList.remove('hidden');
  if (history.state?.view !== 'text') {
    const newState = { view: 'text', jobId: state.itemId };
    if (fromPlayer) history.replaceState(newState, '', null);
    else history.pushState(newState, '', null);
  }
  setTimeout(() => $('text-name').focus(), 50);
}

async function onSave() {
  const title = ($('text-name').value || '').trim() || 'Untitled';
  const text = $('text-body').value || '';
  try {
    if (!state.itemId) {
      const created = await api.createTextItem({
        title,
        text,
        parent_folder_id: state.parentFolderId,
        voice: state.voice,
      });
      state.itemId = created.id;
    } else {
      await api.updateTextItem(state.itemId, { title, text });
    }
    state.dirty = false;
    state.callbacks?.onSaved?.(state.itemId);
  } catch (e) {
    state.callbacks?.onError?.('Save failed: ' + (e.message || e));
  }
}

async function onConvert() {
  // Save first if dirty / not yet created.
  const title = ($('text-name').value || '').trim() || 'Untitled';
  const text = $('text-body').value || '';
  if (!text.trim()) {
    state.callbacks?.onError?.('Add some text first.');
    return;
  }
  try {
    if (!state.itemId) {
      const created = await api.createTextItem({
        title, text,
        parent_folder_id: state.parentFolderId,
        voice: state.voice,
      });
      state.itemId = created.id;
    } else if (state.dirty) {
      await api.updateTextItem(state.itemId, { title, text });
      state.dirty = false;
    }
    state.callbacks?.onConvertRequested?.(state.itemId);
  } catch (e) {
    state.callbacks?.onError?.('Convert failed: ' + (e.message || e));
  }
}

export function isOpen() {
  return !$('text-view').classList.contains('hidden');
}
