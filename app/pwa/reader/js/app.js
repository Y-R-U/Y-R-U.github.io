import * as store from './storage.js';
import * as books from './books.js';
import * as tts from './tts.js';
import * as player from './player.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const PREVIEW_TEXT = 'The quick brown fox jumped over the lazy dog.';

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('SW register failed:', e); }
}

async function refreshLibrary() {
  const list = await store.listBooks();
  ui.renderLibrary(list, openBook, deleteBook);
}

async function deleteBook(id) {
  await store.deleteBook(id);
  await refreshLibrary();
}

async function openBook(id) {
  ui.showPlayer();
  await player.loadBook(id, { onUpdate: ui.updatePlayer });
  ui.updatePlayer();
  if (!tts.isLoaded()) {
    await ensureTTS();
  }
}

async function ensureTTS() {
  if (tts.isLoaded()) return;
  ui.showLoading('Preparing narrator model (first load only)…', 0);
  ui.setModelStatus('Loading…');
  let lastPct = 0;
  await tts.initTTS((p) => {
    if (p && typeof p.progress === 'number') {
      const pct = Math.min(100, Math.round(p.progress));
      if (pct !== lastPct) {
        lastPct = pct;
        const name = p.file ? p.file.split('/').pop() : '';
        ui.showLoading(`Downloading narrator model… ${name}`, pct);
      }
    } else if (p && p.status) {
      ui.showLoading(`Narrator model: ${p.status}`, null);
    }
  });
  ui.setModelStatus(`Loaded (${tts.getDevice()})`);
  ui.hideLoading();
}

async function handleImport(file) {
  ui.showLoading(`Importing ${file.name}…`, null);
  try {
    await books.importFile(file);
    await refreshLibrary();
  } catch (e) {
    alert('Import failed: ' + (e.message || e));
  } finally {
    ui.hideLoading();
  }
}

function wire() {
  $('btn-import').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleImport(file);
  });
  $('btn-settings').addEventListener('click', () => ui.openSettings());
  $('btn-close-settings').addEventListener('click', () => ui.closeSettings());
  $('settings-modal').querySelector('.modal-scrim').addEventListener('click', () => ui.closeSettings());
  $('btn-preload').addEventListener('click', ensureTTS);

  $('btn-back').addEventListener('click', () => {
    player.pause();
    ui.showLibrary();
    refreshLibrary();
  });
  $('btn-play').addEventListener('click', async () => {
    await ensureTTS();
    player.togglePlay();
  });
  $('btn-prev').addEventListener('click', () => player.prevChapter());
  $('btn-next').addEventListener('click', () => player.nextChapter());

  $('btn-chapters').addEventListener('click', () => {
    ui.renderChapters((i) => { player.seekChapter(i); ui.closeChapters(); });
    ui.openChapters();
  });
  $('btn-close-chapters').addEventListener('click', () => ui.closeChapters());
  $('chapter-drawer').querySelector('.drawer-scrim').addEventListener('click', () => ui.closeChapters());

  $('speed').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    $('speed-val').textContent = v.toFixed(1) + '×';
  });
  $('speed').addEventListener('change', (e) => player.setSpeed(parseFloat(e.target.value)));

  $('btn-voice').addEventListener('click', async () => {
    await ensureTTS();
    ui.renderVoicePicker(
      (id) => { player.setVoice(id); ui.renderVoicePicker(() => {}, () => {}); ui.updatePlayer(); ui.closeVoicePicker(); },
      (id) => player.previewVoice(id, PREVIEW_TEXT),
    );
    ui.openVoicePicker();
  });
  $('btn-close-voice').addEventListener('click', () => ui.closeVoicePicker());
  $('voice-modal').querySelector('.modal-scrim').addEventListener('click', () => ui.closeVoicePicker());
}

async function main() {
  registerSW();
  store.requestPersist();
  wire();
  const lastVoice = await store.getPref('lastVoice', 'af_heart');
  player.state.voice = lastVoice;
  await refreshLibrary();
}

main();
