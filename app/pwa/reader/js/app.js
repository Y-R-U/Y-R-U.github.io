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

async function getTTSOptions() {
  return {
    device: await store.getPref('device', 'auto'),
    dtype: await store.getPref('dtype', 'q8'),
  };
}

function modelStatusText() {
  if (!tts.isLoaded()) return 'Not loaded';
  return `Loaded (${tts.getDevice()}, ${tts.getDtype()})`;
}

async function ensureTTS() {
  const opts = await getTTSOptions();
  const already = tts.isLoaded()
    && tts.currentOptions()?.dtype === opts.dtype
    && tts.currentOptions()?.device === (opts.device === 'auto' ? (tts.hasWebGPU() ? 'webgpu' : 'wasm') : opts.device);
  if (already) return;
  ui.showLoading('Preparing narrator model…', 0);
  ui.setModelStatus('Loading…');
  let lastPct = 0;
  await tts.initTTS(opts, (p) => {
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
  ui.setModelStatus(modelStatusText());
  ui.hideLoading();
}

async function handleImport(file) {
  const niceName = ui.shortName(file.name);
  ui.showLoading(`Importing ${niceName}…`, null);
  try {
    const onProgress = (done, total, label) => {
      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
      ui.showLoading(`${label || 'Importing'} ${niceName}… ${done}/${total}`, pct);
    };
    const result = await books.importFile(file, onProgress);
    await refreshLibrary();
    if (result.duplicate) {
      ui.showToast(`“${result.meta.title}” is already in your library.`);
    }
  } catch (e) {
    ui.showToast('Import failed: ' + (e.message || e), { error: true, duration: 5000 });
  } finally {
    ui.hideLoading();
  }
}

async function backfillBookKeys() {
  const list = await store.listBooks();
  for (const b of list) {
    if (b.key || !b.filename) continue;
    const size = await store.bookFileSize(b.id, b.filename);
    if (size == null) continue;
    b.key = `${b.filename}:${size}`;
    await store.putBook(b);
  }
}

async function refreshSettingsView() {
  const opts = await getTTSOptions();
  ui.setSettingsValues(opts);
  ui.setModelStatus(modelStatusText());
  let persisted = false;
  try { persisted = await (navigator.storage?.persisted?.() ?? Promise.resolve(false)); } catch (_) {}
  ui.setStorageStatus(persisted);
}

async function openSettings() {
  ui.populateSettingsOptions({
    deviceOptions: tts.DEVICE_OPTIONS,
    dtypeOptions: tts.DTYPE_OPTIONS,
    hasWebGPU: tts.hasWebGPU(),
  });
  await refreshSettingsView();
  ui.openSettings();
}

async function onDeviceChange(e) {
  await store.setPref('device', e.target.value);
  tts.unload();
  ui.setModelStatus(modelStatusText());
}

async function onDtypeChange(e) {
  await store.setPref('dtype', e.target.value);
  tts.unload();
  ui.setModelStatus(modelStatusText());
}

async function clearModelCache() {
  const ok = await ui.showConfirm({
    title: 'Clear cached model?',
    message: 'The Kokoro weights will be removed from local storage. The next play will re-download (~80 MB).',
    okLabel: 'Clear',
    danger: true,
  });
  if (!ok) return;
  tts.unload();
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage('clear-model-cache');
  } catch (_) {}
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('transformers-')).map((n) => caches.delete(n)));
  } catch (_) {}
  ui.setModelStatus(modelStatusText());
  ui.showToast('Cached model cleared.');
}

function wire() {
  $('btn-import').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleImport(file);
  });
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-close-settings').addEventListener('click', () => ui.closeSettings());
  $('settings-modal').querySelector('.modal-scrim').addEventListener('click', () => ui.closeSettings());
  $('btn-preload').addEventListener('click', ensureTTS);
  $('btn-clear-cache').addEventListener('click', clearModelCache);
  $('set-device').addEventListener('change', onDeviceChange);
  $('set-dtype').addEventListener('change', onDtypeChange);

  $('btn-back').addEventListener('click', () => {
    player.pause();
    ui.showLibrary();
    refreshLibrary();
  });
  $('btn-play').addEventListener('click', async () => {
    player.clearError();
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
  await backfillBookKeys();
  await refreshLibrary();
}

main();
