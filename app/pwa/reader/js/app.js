import * as store from './storage.js';
import * as api from './api.js';
import * as books from './books.js';
import * as player from './player.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

let voicesCache = null;
let pollTimer = null;
let serverReachable = true;

/* In-flight uploads that the server doesn't yet know about. Keyed by a
   synthetic id; cleared once the server assigns a real job id. */
const uploads = new Map();

/* Books currently being cached into OPFS. */
const caching = new Map();

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

/* ---- Refresh ---- */
async function refresh() {
  let serverJobs = null;
  try {
    serverJobs = await api.listJobs();
    serverReachable = true;
  } catch (_) {
    serverReachable = false;
  }

  // Jobs section = live uploads + in-flight server jobs + error jobs
  const uploadRows = Array.from(uploads.values());
  const active = (serverJobs || []).filter(
    (j) => j.state === 'queued' || j.state === 'processing' || j.state === 'error'
  );

  // Overlay caching progress onto done-but-not-cached jobs so the user sees
  // the download bar in the same place as the conversion bar.
  const jobRows = [
    ...uploadRows.map((u) => ({
      kind: 'upload',
      id: u.id,
      title: u.title,
      state: 'uploading',
      progress: u.progress,
    })),
    ...active.map((j) => ({
      kind: 'server',
      id: j.id,
      title: j.title || j.input_filename,
      state: j.state,
      progress: j.progress,
      error: j.error,
    })),
  ];

  for (const [jobId, info] of caching.entries()) {
    jobRows.push({ kind: 'cache', id: jobId, title: info.title, state: 'downloading', progress: info.progress });
  }

  // Library = server's done jobs (authoritative), augmented with local
  // metadata + cached flag.
  const libraryRows = [];
  if (serverJobs !== null) {
    const done = serverJobs.filter((j) => j.state === 'done');
    for (const j of done) {
      if (caching.has(j.id)) continue; // still showing as a progress card
      const meta = (await store.getBookMeta(j.id)) || {};
      const cached = await store.audioExists(j.id);
      libraryRows.push({
        jobId: j.id,
        title: j.title || meta.title || j.input_filename,
        author: j.author || meta.author || '',
        voice: j.voice,
        speed: j.speed,
        size: j.mp3_size || meta.size || 0,
        duration: meta.duration || null,
        position: meta.position || 0,
        lastPlayed: meta.lastPlayed || 0,
        cached,
        onServer: true,
      });
    }
  } else {
    // Server unreachable — fall back to locally cached books so playback
    // still works offline.
    const local = await store.listBookMeta();
    for (const m of local) {
      if (!(await store.audioExists(m.jobId))) continue;
      libraryRows.push({
        jobId: m.jobId,
        title: m.title || '(untitled)',
        author: m.author || '',
        voice: m.voice,
        speed: m.speed,
        size: m.size || 0,
        duration: m.duration || null,
        position: m.position || 0,
        lastPlayed: m.lastPlayed || 0,
        cached: true,
        onServer: false,
      });
    }
  }

  ui.setConnectionStatus(serverReachable);
  ui.renderJobs(jobRows, cancelJobRow);
  ui.renderLibrary(libraryRows, {
    onOpen: openBook,
    onSaveToDevice: saveBookToDevice,
    onRemoveCache: removeFromCache,
    onDelete: deleteBook,
  });

  // Kick off background downloads for any done-but-not-cached books.
  if (serverJobs !== null) {
    for (const b of libraryRows) {
      if (!b.cached && !caching.has(b.jobId)) {
        startCaching(b.jobId).catch(() => {});
      }
    }
  }

  // Keep polling while anything is still in flight.
  if (jobRows.length || caching.size || uploads.size) {
    ensurePolling();
  } else {
    stopPolling();
  }
}

function ensurePolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => refresh().catch(() => {}), 2000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/* ---- Actions on jobs/books ---- */
async function cancelJobRow(row) {
  if (row.kind === 'upload') {
    const entry = uploads.get(row.id);
    entry?.xhr?.abort();
    uploads.delete(row.id);
    await refresh();
    return;
  }
  if (row.kind === 'cache') {
    const entry = caching.get(row.id);
    entry?.abort?.();
    caching.delete(row.id);
    await refresh();
    return;
  }
  // kind === 'server' — ask first, since this deletes server-side work.
  if (row.state === 'processing') {
    ui.showToast('Can\'t cancel while converting. Wait for it to finish, then delete.');
    return;
  }
  const ok = await ui.showConfirm({
    title: row.state === 'error' ? 'Remove failed job?' : 'Cancel conversion?',
    message: `"${row.title}" will be removed from the server.`,
    okLabel: row.state === 'error' ? 'Remove' : 'Cancel job',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteJob(row.id);
  } catch (e) {
    ui.showToast('Delete failed: ' + (e.message || e), { error: true });
  }
  await refresh();
}

async function deleteBook(book) {
  const ok = await ui.showConfirm({
    title: 'Delete audiobook?',
    message: `"${book.title}" will be removed from the server and this device. This cannot be undone.`,
    okLabel: 'Delete', danger: true,
  });
  if (!ok) return;
  await api.deleteJob(book.jobId).catch(() => {});
  await store.deleteAudio(book.jobId);
  await store.deleteBookMeta(book.jobId);
  await refresh();
}

async function removeFromCache(book) {
  const ok = await ui.showConfirm({
    title: 'Remove from device?',
    message: `"${book.title}" will be removed from this device, but stays on the server and can be re-downloaded.`,
    okLabel: 'Remove',
  });
  if (!ok) return;
  await store.deleteAudio(book.jobId);
  await refresh();
}

async function saveBookToDevice(book) {
  try {
    let file;
    if (await store.audioExists(book.jobId)) {
      file = await store.readAudioFile(book.jobId);
    } else {
      ui.showToast('Downloading first…');
      file = await api.fetchMp3Blob(book.jobId);
    }
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
    ui.showToast('Save failed: ' + (e.message || e), { error: true });
  }
}

async function openBook(book) {
  ui.showPlayer();
  try {
    if (!(await store.audioExists(book.jobId))) {
      if (!serverReachable) throw new Error('not cached and server is offline');
      ui.showToast('Downloading…');
      await startCaching(book.jobId);
    }
    await player.loadBook(book.jobId, { onUpdate: ui.updatePlayer });
    ui.updatePlayer();
  } catch (e) {
    ui.showToast('Could not load: ' + (e.message || e), { error: true });
    ui.showLibrary();
    await refresh();
  }
}

/* ---- Caching (server -> OPFS) ---- */
async function startCaching(jobId) {
  if (caching.has(jobId)) return caching.get(jobId).promise;
  const meta = await api.getJob(jobId);
  if (!meta || meta.state !== 'done') return;

  let aborted = false;
  const entry = { title: meta.title || meta.input_filename, progress: 0, abort: () => { aborted = true; } };
  const promise = (async () => {
    try {
      await books.cacheMp3(meta, (p) => {
        if (aborted) throw new Error('cache aborted');
        entry.progress = p;
        refresh();
      });
      ui.showToast(`"${entry.title}" ready to play`);
    } catch (e) {
      if (!aborted) ui.showToast('Cache failed: ' + (e.message || e), { error: true });
    } finally {
      caching.delete(jobId);
      refresh();
    }
  })();
  entry.promise = promise;
  caching.set(jobId, entry);
  refresh();
  return promise;
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
      startUpload(file, voice);
    },
  });
}

async function startUpload(file, voice) {
  const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id: localId,
    title: file.name.replace(/\.[^.]+$/, ''),
    progress: 0,
    xhr: null,
  };
  uploads.set(localId, entry);
  refresh();

  try {
    const job = await api.createJob(file, voice, 1.0, {
      onUploadProgress: (frac) => {
        entry.progress = frac;
        refresh();
      },
    });
    uploads.delete(localId);
    // Seed local metadata so the title shows up before first polling tick.
    await store.updateBookMeta(job.id, {
      title: job.title || entry.title,
      author: '',
      voice,
      speed: 1.0,
    });
    await refresh();
    ensurePolling();
  } catch (e) {
    uploads.delete(localId);
    await refresh();
    ui.showToast('Upload failed: ' + (e.message || e), { error: true, duration: 6000 });
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
    if (player.state.book) saveBookToDevice(player.state.book);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('online', () => refresh());
}

async function main() {
  registerSW();
  store.requestPersist();
  wire();
  await refresh();
}

main();
