/* Voice notes — recording UI, list modal, offline queue.

   Recording uses MediaRecorder (webm/opus on Chrome/Android-WebView, m4a/AAC
   on Safari). The server transcodes whatever we send to mp3. When the server
   is unreachable, the note is queued in IndexedDB and replayed on reconnect.
*/

import * as api from './api.js';
import * as store from './storage.js';
import * as ui from './ui.js';
import * as player from './player.js';
import * as sync from './sync.js';

const $ = (id) => document.getElementById(id);

const session = {
  bookId: null,
  position: 0,                // seconds within the audiobook
  paragraph: { index: -1, text: '' },
  existingNote: null,         // when "open" was used to edit an existing note
  bookTitle: '',
  // recording state
  stream: null,
  recorder: null,
  chunks: [],
  blob: null,                 // recorded blob ready to save
  isRecording: false,
  previewUrl: null,
  playbackReleased: false,    // whether we detached the book's audio device
  useNative: false,           // recording via Android bridge (.apk) vs MediaRecorder
};

let listRefresh = null;       // (re)render hook for the open list modal

export function init() {
  // Wire all the recording-page controls once.
  $('btn-record-back').addEventListener('click', () => exitRecorder({ confirmIfDirty: true }));
  $('btn-record-toggle').addEventListener('click', toggleRecord);
  $('btn-record-rerecord').addEventListener('click', startRerecord);
  $('btn-record-play').addEventListener('click', playPreview);
  $('btn-record-save').addEventListener('click', saveRecording);
  $('btn-notes-close').addEventListener('click', closeNotesList);
  $('notes-modal').querySelector('.modal-scrim').addEventListener('click', closeNotesList);

  // Replay queue on reconnect.
  window.addEventListener('online', () => flushQueue().catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) flushQueue().catch(() => {});
  });
}

/* ---------------- Recorder ---------------- */

export async function openRecorderForCurrent() {
  if (!player.state.book) {
    ui.showToast('Open a book first to add a voice note.');
    return;
  }
  // Capture position + paragraph BEFORE we tear down the audio. Use
  // paragraphAt(position) so the eye-toggle-off case still gets the actual
  // current paragraph (state.segIdx isn't advanced while the toggle is off).
  const position = player.state.position || 0;
  const para = sync.paragraphAt(position)
            || sync.currentParagraph()
            || { index: -1, text: '' };
  beginSession({
    bookId: player.state.book.jobId,
    bookTitle: player.state.book.title || 'Voice note',
    position,
    paragraph: para,
    existingNote: null,
  });
  // Pause AND fully release the audio device — pause() alone leaves the
  // WebView's audio pipeline holding the device on Android, which causes
  // getUserMedia to reject with NotReadableError.
  session.playbackReleased = player.pauseAndReleaseDevice();
  showRecorderView();
}

export async function openRecorderForNote(bookId, note, bookTitle) {
  beginSession({
    bookId,
    bookTitle: bookTitle || 'Voice note',
    position: note.position_seconds || 0,
    paragraph: { index: note.paragraph_index ?? -1, text: note.paragraph_text || '' },
    existingNote: note,
  });
  // Same audio-device release as the current-book path: even when previewing
  // an existing note, the book's audio element is still loaded and would
  // block a re-record's getUserMedia.
  session.playbackReleased = player.pauseAndReleaseDevice();
  showRecorderView();
}

function beginSession({ bookId, bookTitle, position, paragraph, existingNote }) {
  resetRecorderUiAndState();
  session.bookId = bookId;
  session.bookTitle = bookTitle;
  session.position = position;
  session.paragraph = paragraph;
  session.existingNote = existingNote;
  session.blob = null;
}

function showRecorderView() {
  $('library-view').classList.add('hidden');
  $('player-view').classList.add('hidden');
  $('text-view').classList.add('hidden');
  $('record-view').classList.remove('hidden');

  $('record-title').textContent = session.existingNote ? 'Edit note' : 'New voice note';
  $('record-position').textContent = fmtTime(session.position);
  $('record-paragraph').textContent = session.paragraph.text || '(no paragraph context)';
  $('record-hint').textContent = session.existingNote
    ? 'Re-record to replace this note, or play to preview.'
    : 'Tap record to start.';

  // For an existing note, we already have audio and can preview it.
  if (session.existingNote) {
    showPostStopUi({ canSave: false });
    // Lazy-fetch via blob URL — direct http:// src on https://abreader.local
    // fails with "no supported source" on Chromium WebView even with
    // MIXED_CONTENT_ALWAYS_ALLOW.
    loadExistingNoteAudio(session.bookId, session.existingNote.id);
  } else {
    showPreRecordUi();
  }
  history.pushState({ view: 'record' }, '', null);
}

async function loadExistingNoteAudio(bookId, noteId) {
  const preview = $('record-preview');
  // Free any prior blob URL.
  if (preview.dataset.blobUrl) {
    URL.revokeObjectURL(preview.dataset.blobUrl);
    delete preview.dataset.blobUrl;
  }
  preview.removeAttribute('src');
  try {
    const r = await fetch(api.noteAudioUrl(bookId, noteId));
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    preview.dataset.blobUrl = url;
    preview.src = url;
  } catch (e) {
    ui.showToast('Note audio unavailable: ' + (e.message || e), { error: true });
  }
}

function showPreRecordUi() {
  setRecordButton('record');
  $('record-secondary').classList.add('hidden');
  $('btn-record-save').classList.add('hidden');
}

function setRecordButton(mode) {
  // mode: 'record' | 'stop' | 'idle'
  const btn = $('btn-record-toggle');
  const icon = btn.querySelector('.record-icon');
  const label = btn.querySelector('.record-label');
  btn.classList.toggle('recording', mode === 'stop');
  btn.classList.toggle('idle', mode === 'idle');
  if (mode === 'record') { icon.textContent = '●'; label.textContent = 'Record'; btn.disabled = false; }
  else if (mode === 'stop') { icon.textContent = '■'; label.textContent = 'Stop'; btn.disabled = false; }
  else { icon.textContent = '●'; label.textContent = 'Record again'; btn.disabled = false; }
}

function showPostStopUi({ canSave = true } = {}) {
  setRecordButton('idle');
  $('record-secondary').classList.remove('hidden');
  if (canSave) {
    $('btn-record-save').classList.remove('hidden');
    $('record-hint').textContent = 'Tap save to keep this note.';
  } else {
    $('btn-record-save').classList.add('hidden');
  }
}

function resetRecorderUiAndState() {
  stopMediaTracks();
  if (session.useNative) {
    try { window.ABReaderAndroid?.cancelNativeRecording?.(); } catch (_) {}
    session.useNative = false;
  }
  if (session.previewUrl) {
    URL.revokeObjectURL(session.previewUrl);
    session.previewUrl = null;
  }
  session.blob = null;
  session.chunks = [];
  session.isRecording = false;
  const preview = $('record-preview');
  if (preview.dataset.blobUrl) {
    URL.revokeObjectURL(preview.dataset.blobUrl);
    delete preview.dataset.blobUrl;
  }
  preview.src = '';
  $('record-paragraph').textContent = '';
  showPreRecordUi();
}

async function toggleRecord() {
  if (session.isRecording) return stopRecording();
  return startRecording();
}

async function startRecording() {
  // If we're previewing existing audio (from "open"), recording overrides.
  const preview = $('record-preview');
  preview.pause();
  preview.src = '';

  // Native (.apk) path first — bypasses Chromium's audio capture stack,
  // which on some Android builds (e.g. Samsung S22 Ultra / Android 16)
  // refuses to acquire the mic with NotReadableError even when permission
  // is granted. The native MediaRecorder uses the same pipeline as the
  // system Voice Recorder app, which we know works.
  if (await tryStartNativeRecording()) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    ui.showToast('Mic API unavailable. The .apk needs to be v14 or newer.', { error: true, duration: 8000 });
    return;
  }

  // Probe what audio inputs the OS actually surfaces. inputCount=0 means
  // the OS isn't exposing any mic to the WebView (another app or system
  // policy is holding it); inputCount>=1 with a still-failing capture means
  // device acquisition is rejected by the audio HAL or a constraint mismatch.
  let inputCount = -1;
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    inputCount = devs.filter((d) => d.kind === 'audioinput').length;
  } catch (_) {}

  // Some WebView builds reject the default audio:true because of the DSP
  // chain (echo cancel / noise suppression / AGC). Try progressively simpler
  // constraints before giving up.
  const constraintCandidates = [
    { audio: true },
    { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
    { audio: { channelCount: 1, sampleRate: 16000 } },
  ];
  let stream = null;
  let lastError = null;
  outer: for (const constraints of constraintCandidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        lastError = null;
        break outer;
      } catch (e) {
        lastError = e;
        if (e?.name !== 'NotReadableError' && e?.name !== 'OverconstrainedError') break outer;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
  if (!stream) {
    const e = lastError;
    const name = e?.name || 'Error';
    const msg = e?.message || String(e);
    const tail = inputCount >= 0 ? ` · audioinputs:${inputCount}` : '';
    ui.showToast(`Mic blocked (${name}): ${msg}${tail}`, { error: true, duration: 10000 });
    return;
  }
  session.stream = stream;
  session.chunks = [];
  const mime = pickMimeType();
  let recorder;
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (e) {
    stopMediaTracks();
    ui.showToast('Recording not supported in this browser.', { error: true });
    return;
  }
  session.recorder = recorder;
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size) session.chunks.push(e.data);
  });
  recorder.addEventListener('stop', onRecorderStop);
  recorder.start();
  session.isRecording = true;
  setRecordButton('stop');
  $('record-secondary').classList.add('hidden');
  $('btn-record-save').classList.add('hidden');
  $('record-hint').textContent = 'Recording…';
}

function stopRecording() {
  if (!session.isRecording) return;
  if (session.useNative) {
    finishNativeRecording();
    return;
  }
  if (!session.recorder) return;
  try { session.recorder.stop(); } catch (_) {}
  session.isRecording = false;
}

async function tryStartNativeRecording() {
  const bridge = window.ABReaderAndroid;
  if (!bridge?.startNativeRecording || !bridge?.stopNativeRecording) return false;
  let ok = false;
  try { ok = bridge.startNativeRecording(); } catch (_) { ok = false; }
  if (!ok) return false;
  session.isRecording = true;
  session.useNative = true;
  setRecordButton('stop');
  $('record-secondary').classList.add('hidden');
  $('btn-record-save').classList.add('hidden');
  $('record-hint').textContent = 'Recording…';
  return true;
}

function finishNativeRecording() {
  const bridge = window.ABReaderAndroid;
  let b64 = '';
  try { b64 = bridge?.stopNativeRecording?.() || ''; } catch (_) { b64 = ''; }
  session.useNative = false;
  session.isRecording = false;
  if (!b64) {
    ui.showToast('Native recorder produced no audio.', { error: true });
    showPreRecordUi();
    return;
  }
  let bytes;
  try { bytes = base64ToBytes(b64); }
  catch (e) {
    ui.showToast('Native recording decode failed.', { error: true });
    showPreRecordUi();
    return;
  }
  session.blob = new Blob([bytes], { type: 'audio/mp4' });
  if (session.previewUrl) URL.revokeObjectURL(session.previewUrl);
  session.previewUrl = URL.createObjectURL(session.blob);
  $('record-preview').src = session.previewUrl;
  showPostStopUi({ canSave: true });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function onRecorderStop() {
  stopMediaTracks();
  const recorder = session.recorder;
  session.recorder = null;
  if (!session.chunks.length) {
    ui.showToast('Nothing recorded.', { error: true });
    showPreRecordUi();
    return;
  }
  const type = (recorder?.mimeType) || 'audio/webm';
  session.blob = new Blob(session.chunks, { type });
  session.chunks = [];
  if (session.previewUrl) URL.revokeObjectURL(session.previewUrl);
  session.previewUrl = URL.createObjectURL(session.blob);
  $('record-preview').src = session.previewUrl;
  showPostStopUi({ canSave: true });
}

function startRerecord() {
  // Re-record discards the current preview (recorded blob OR existing-note
  // preview) and begins a fresh capture.
  if (session.previewUrl) {
    URL.revokeObjectURL(session.previewUrl);
    session.previewUrl = null;
  }
  session.blob = null;
  $('record-preview').src = '';
  startRecording();
}

function playPreview() {
  const a = $('record-preview');
  if (!a.src) {
    ui.showToast('No recording to play.');
    return;
  }
  if (a.paused) a.play().catch(() => {});
  else a.pause();
}

async function saveRecording() {
  if (!session.blob) {
    ui.showToast('Nothing to save.');
    return;
  }
  const btn = $('btn-record-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    if (session.existingNote) {
      await api.replaceNoteAudio(session.bookId, session.existingNote.id, session.blob);
      ui.showToast('Note updated');
    } else {
      try {
        await api.uploadNote(session.bookId, session.blob, {
          positionSeconds: session.position,
          paragraphIndex: session.paragraph.index,
          paragraphText: session.paragraph.text,
        });
        ui.showToast('Note saved');
      } catch (e) {
        // Network failure → queue in IDB for later upload.
        await store.enqueueNote({
          localId: 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          bookId: session.bookId,
          blob: session.blob,
          position: session.position,
          paragraphIndex: session.paragraph.index,
          paragraphText: session.paragraph.text,
          queuedAt: Date.now(),
        });
        ui.showToast('Saved offline — will upload when reconnected.');
      }
    }
    exitRecorder({ confirmIfDirty: false });
    if (listRefresh) listRefresh().catch(() => {});
  } catch (e) {
    ui.showToast('Save failed: ' + (e.message || e), { error: true });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function exitRecorder({ confirmIfDirty }) {
  if (confirmIfDirty && session.blob && !session.existingNote) {
    const ok = await ui.showConfirm({
      title: 'Discard recording?',
      message: 'Your unsaved voice note will be lost.',
      okLabel: 'Discard', danger: true,
    });
    if (!ok) return;
  }
  if (session.isRecording) {
    if (session.useNative) {
      try { window.ABReaderAndroid?.cancelNativeRecording?.(); } catch (_) {}
      session.useNative = false;
    } else {
      try { session.recorder?.stop(); } catch (_) {}
    }
    session.isRecording = false;
  }
  resetRecorderUiAndState();
  $('record-view').classList.add('hidden');
  // Restore the audiobook playback (re-attach the audio source we released
  // on entry). Position is preserved by player.savePosition() during pause.
  if (session.playbackReleased) {
    session.playbackReleased = false;
    try { await player.reloadCurrentBook(); } catch (_) {}
  }
  if (history.state?.view === 'record') history.back();
  else $('player-view').classList.remove('hidden');
}

function stopMediaTracks() {
  if (session.stream) {
    for (const t of session.stream.getTracks()) {
      try { t.stop(); } catch (_) {}
    }
    session.stream = null;
  }
}

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch (_) {}
  }
  return null;
}

/* ---------------- Notes list modal ---------------- */

export async function openNotesList() {
  if (!player.state.book) {
    ui.showToast('Open a book first.');
    return;
  }
  const bookId = player.state.book.jobId;
  const bookTitle = player.state.book.title || '';
  const modal = $('notes-modal');
  modal.classList.remove('hidden');
  // No history.pushState — the notes-list is a transient overlay. Pushing
  // would race with showRecorderView's pushState when "Open" is tapped (the
  // queued popstate from history.back() would fire AFTER pushState and
  // bounce back to the player view, hiding the record view we just opened).

  const refresh = async () => {
    let notes;
    try {
      notes = await api.listNotes(bookId);
    } catch (e) {
      $('notes-list').innerHTML = `<div class="hint">Couldn't load notes: ${e.message || e}</div>`;
      return;
    }
    renderNotesList(notes, bookId, bookTitle);
  };
  listRefresh = refresh;
  await refresh();
}

function closeNotesList() {
  const modal = $('notes-modal');
  modal.classList.add('hidden');
  listRefresh = null;
  // Pause inline players and free any blob URLs we lazily fetched.
  document.querySelectorAll('#notes-list audio').forEach((a) => {
    try { a.pause(); } catch (_) {}
    if (a.dataset.blobUrl) {
      URL.revokeObjectURL(a.dataset.blobUrl);
      delete a.dataset.blobUrl;
    }
  });
}

function renderNotesList(notes, bookId, bookTitle) {
  const list = $('notes-list');
  list.innerHTML = '';
  if (!notes.length) {
    list.innerHTML = '<div class="hint">No voice notes for this book yet.</div>';
    return;
  }
  for (const n of notes) {
    const row = document.createElement('div');
    row.className = 'note-item';
    const pos = fmtTime(n.position_seconds || 0);
    const dur = n.duration_seconds ? `${Math.round(n.duration_seconds)}s` : '';
    const meta = [pos, dur].filter(Boolean).join(' · ');
    const para = (n.paragraph_text || '').slice(0, 240);
    row.innerHTML = `
      <div class="note-info">
        <div class="note-meta"></div>
        <div class="note-text"></div>
      </div>
      <div class="note-actions">
        <button class="icon-btn" data-act="jump" aria-label="Jump to spot">↪</button>
        <button class="icon-btn" data-act="play" aria-label="Play">▶</button>
        <button class="icon-btn" data-act="open" aria-label="Open">✎</button>
        <button class="icon-btn danger" data-act="delete" aria-label="Delete">🗑</button>
      </div>
      <audio class="note-preview" preload="none" hidden></audio>
    `;
    row.querySelector('.note-meta').textContent = meta;
    row.querySelector('.note-text').textContent = para || '(no paragraph context)';
    const audio = row.querySelector('.note-preview');
    // src is set lazily on first play via fetch+blob to dodge Chromium's
    // mixed-content media-element block (page is https://abreader.local,
    // audio URL is http://LAN — direct src= fails with "no supported source"
    // even with MIXED_CONTENT_ALWAYS_ALLOW).

    row.querySelector('[data-act="jump"]').addEventListener('click', () => {
      player.seekTo(n.position_seconds || 0);
      ui.showToast(`Jumped to ${pos}`);
      closeNotesList();
    });
    const playBtn = row.querySelector('[data-act="play"]');
    playBtn.addEventListener('click', async () => {
      // Stop any other inline players first.
      document.querySelectorAll('#notes-list audio').forEach((a) => { if (a !== audio) a.pause(); });
      if (audio.paused) {
        try {
          if (!audio.dataset.blobUrl) {
            const r = await fetch(api.noteAudioUrl(bookId, n.id));
            if (!r.ok) throw new Error(`fetch ${r.status}`);
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            audio.dataset.blobUrl = url;
            audio.src = url;
          }
          await audio.play();
          playBtn.textContent = '⏸';
        } catch (e) {
          ui.showToast('Play failed: ' + (e.message || e), { error: true });
        }
      } else {
        audio.pause();
        playBtn.textContent = '▶';
      }
      audio.onended = () => { playBtn.textContent = '▶'; };
      audio.onpause = () => { playBtn.textContent = '▶'; };
    });
    row.querySelector('[data-act="open"]').addEventListener('click', () => {
      audio.pause();
      closeNotesList();
      openRecorderForNote(bookId, n, bookTitle);
    });
    row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      const ok = await ui.showConfirm({
        title: 'Delete voice note?',
        message: 'This voice note will be removed permanently.',
        okLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteNote(bookId, n.id);
        if (listRefresh) await listRefresh();
        else row.remove();
      } catch (e) {
        ui.showToast('Delete failed: ' + (e.message || e), { error: true });
      }
    });

    list.appendChild(row);
  }
}

/* ---------------- Offline queue ---------------- */

let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const queued = await store.listQueuedNotes();
    for (const q of queued) {
      try {
        await api.uploadNote(q.bookId, q.blob, {
          positionSeconds: q.position,
          paragraphIndex: q.paragraphIndex,
          paragraphText: q.paragraphText,
        });
        await store.dequeueNote(q.localId);
      } catch (_) {
        // Server still unreachable; stop trying for now.
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/* ---------------- History (back-button support) ---------------- */
export function isOnRecordView() {
  return !$('record-view').classList.contains('hidden');
}

export function backFromRecord() {
  exitRecorder({ confirmIfDirty: true });
}

export function isNotesListOpen() {
  return !$('notes-modal').classList.contains('hidden');
}

export function closeNotesListExternal() {
  closeNotesList();
}

/* ---------------- Helpers ---------------- */

function fmtTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
