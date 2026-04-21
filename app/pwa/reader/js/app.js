import * as store from './storage.js';
import * as api from './api.js';
import * as books from './books.js';
import * as player from './player.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

let voicesCache = null;
const activeTrackers = new Map();  // jobId -> { close }

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('SW register failed:', e); }
}

async function getVoices() {
  if (voicesCache) return voicesCache;
  try { voicesCache = await api.listVoices(); }
  catch (_) { voicesCache = []; }
  return voicesCache;
}

/* ---- Library refresh ---- */
async function refresh() {
  const [localBooks, localJobs] = await Promise.all([store.listBooks(), store.listJobs()]);
  ui.renderJobs(localJobs, cancelJob);
  ui.renderLibrary(localBooks, openBook, deleteBook, downloadBook);
}

async function cancelJob(jobRow) {
  const tracker = activeTrackers.get(jobRow.jobId);
  tracker?.close();
  activeTrackers.delete(jobRow.jobId);
  await store.deleteJobRow(jobRow.jobId);
  api.deleteJob(jobRow.jobId).catch(() => {});
  await refresh();
}

async function deleteBook(id) {
  await store.deleteBook(id);
  await refresh();
}

async function downloadBook(book) {
  try {
    const file = await store.readAudioFile(book.id);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    const safe = (book.title || 'audiobook').replace(/[^\w\s.-]+/g, '_');
    a.download = `${safe}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    ui.showToast('Download failed: ' + (e.message || e), { error: true });
  }
}

async function openBook(id) {
  ui.showPlayer();
  try {
    await player.loadBook(id, { onUpdate: ui.updatePlayer });
    ui.updatePlayer();
  } catch (e) {
    ui.showToast('Could not load: ' + (e.message || e), { error: true });
    ui.showLibrary();
    await refresh();
  }
}

/* ---- Import flow ---- */
async function onFilePicked(file) {
  const voices = await getVoices();
  if (!voices.length) {
    ui.showToast('TTS server not reachable.', { error: true, duration: 5000 });
    return;
  }
  const last = await store.getPref('lastVoice', 'af_heart');
  ui.openImport({
    filename: file.name,
    voices,
    currentVoice: voices.find((v) => v.id === last) ? last : voices[0].id,
    onCancel: () => {},
    onConfirm: async (voice) => {
      await store.setPref('lastVoice', voice);
      startConversion(file, voice);
    },
  });
}

async function startConversion(file, voice) {
  // Optimistic placeholder job row so the card shows up before the POST
  // completes (important for large uploads).
  const placeholderId = `pending-${Date.now()}`;
  const placeholder = {
    jobId: placeholderId,
    filename: file.name,
    voice,
    state: 'uploading',
    progress: 0,
    title: file.name.replace(/\.[^.]+$/, ''),
    author: '',
    error: null,
    createdAt: Date.now(),
  };
  await store.putJob(placeholder);
  refresh();

  let jobRow = null;
  try {
    const job = await api.createJob(file, voice, 1.0, {
      onUploadProgress: async (frac) => {
        placeholder.progress = frac;
        await store.putJob(placeholder);
        refresh();
      },
    });
    await store.deleteJobRow(placeholderId);
    jobRow = {
      jobId: job.id,
      filename: file.name,
      voice,
      speed: 1.0,
      state: job.state,
      progress: 0,
      title: job.title || placeholder.title,
      author: '',
      error: null,
      createdAt: Date.now(),
    };
    await store.putJob(jobRow);
    await refresh();
    await trackToCompletion(jobRow);
  } catch (e) {
    if (jobRow) {
      jobRow.state = 'error';
      jobRow.error = e.message || String(e);
      await store.putJob(jobRow);
    } else {
      await store.deleteJobRow(placeholderId);
    }
    await refresh();
    ui.showToast('Conversion failed: ' + (e.message || e), { error: true, duration: 6000 });
  }
}

async function trackToCompletion(jobRow) {
  if (activeTrackers.has(jobRow.jobId)) return;
  const tracker = api.streamJob(jobRow.jobId, async (meta) => {
    jobRow.state = meta.state;
    jobRow.progress = meta.progress || 0;
    jobRow.title = meta.title || jobRow.title;
    jobRow.author = meta.author || jobRow.author;
    jobRow.error = meta.error || null;
    await store.putJob(jobRow);
    refresh();
  });
  activeTrackers.set(jobRow.jobId, tracker);
  try {
    await tracker.done;
    jobRow.state = 'downloading';
    jobRow.progress = 0;
    await store.putJob(jobRow);
    refresh();
    await books.completeJob(jobRow, async (frac) => {
      jobRow.progress = frac;
      await store.putJob(jobRow);
      refresh();
    });
    ui.showToast(`"${jobRow.title}" ready.`);
  } catch (e) {
    jobRow.state = 'error';
    jobRow.error = e.message || String(e);
    await store.putJob(jobRow);
    ui.showToast('Conversion failed: ' + (e.message || e), { error: true, duration: 6000 });
  } finally {
    activeTrackers.delete(jobRow.jobId);
    refresh();
  }
}

/* ---- Resume active jobs on page load ---- */
async function resumeJobs() {
  const rows = await store.listJobs();
  for (const row of rows) {
    if (!row.jobId || row.jobId.startsWith('pending-')) {
      // Upload never completed server-side.
      await store.deleteJobRow(row.jobId);
      continue;
    }
    const serverMeta = await api.getJob(row.jobId).catch(() => null);
    if (!serverMeta) { await store.deleteJobRow(row.jobId); continue; }
    row.state = serverMeta.state;
    row.progress = serverMeta.progress || 0;
    row.title = serverMeta.title || row.title;
    await store.putJob(row);
    if (serverMeta.state === 'done' || serverMeta.state === 'processing' || serverMeta.state === 'queued') {
      trackToCompletion(row).catch(() => {});
    }
  }
}

/* ---- Settings ---- */
async function refreshSettings() {
  const persisted = await store.isPersisted();
  const est = await store.storageEstimate();
  ui.setStorageStatus({ persisted, ...est });
}

function wire() {
  $('btn-import').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await onFilePicked(file);
  });
  $('btn-settings').addEventListener('click', async () => { await refreshSettings(); ui.openSettings(); });
  $('btn-close-settings').addEventListener('click', () => ui.closeSettings());
  $('settings-modal').querySelector('.modal-scrim').addEventListener('click', () => ui.closeSettings());

  $('btn-back').addEventListener('click', () => {
    player.unload();
    ui.showLibrary();
    refresh();
  });
  $('btn-play').addEventListener('click', () => player.togglePlay());
  $('btn-back-15').addEventListener('click', () => player.skip(-15));
  $('btn-fwd-30').addEventListener('click', () => player.skip(30));
  $('scrubber').addEventListener('input', (e) => player.seekTo(parseFloat(e.target.value)));
  $('speed').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    $('speed-val').textContent = v.toFixed(2).replace(/0$/, '') + '×';
  });
  $('speed').addEventListener('change', (e) => player.setSpeed(parseFloat(e.target.value)));
  $('btn-player-dl').addEventListener('click', () => {
    if (player.state.book) downloadBook(player.state.book);
  });
}

async function main() {
  registerSW();
  store.requestPersist();
  wire();
  await refresh();
  resumeJobs();
}

main();
