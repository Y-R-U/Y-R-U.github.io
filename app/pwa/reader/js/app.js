import * as store from './storage.js';
import * as api from './api.js';
import * as books from './books.js';
import * as player from './player.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

let voicesCache = null;
let pollTimer = null;
let serverReachable = true;
let lastRenderKey = '';

/* Last successful /api/jobs payload. We reuse this on a single transient
   failure so the UI doesn't flap between "server only" and "offline" while
   a large MP3 download is saturating the connection. */
let lastJobs = null;
let consecutiveFails = 0;

/* Throttle for progress-driven refreshes during a cache download. */
let lastProgressRefresh = 0;
const PROGRESS_REFRESH_MS = 400;

/* In-flight uploads that the server doesn't yet know about. Keyed by a
   synthetic id; cleared once the server assigns a real job id. */
const uploads = new Map();

/* Books currently being cached into OPFS. */
const caching = new Map();

/* Job ids that recently failed to cache — we won't auto-retry them in
   this session. User tapping play/download clears the flag. */
const cacheFailed = new Set();

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
    lastJobs = serverJobs;
    consecutiveFails = 0;
    serverReachable = true;
  } catch (_) {
    consecutiveFails++;
    if (consecutiveFails >= 2) {
      serverReachable = false;
    } else if (lastJobs) {
      // Single blip — reuse the last good payload. Prevents the offline
      // banner from flashing when a cache download contends with polling.
      serverJobs = lastJobs;
    }
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

  // Skip re-rendering the DOM if nothing visible changed — prevents the
  // library flicker when we poll on a steady state.
  const key = renderKey(jobRows, libraryRows, serverReachable);
  if (key !== lastRenderKey) {
    lastRenderKey = key;
    ui.renderJobs(jobRows, cancelJobRow);
    ui.renderLibrary(libraryRows, {
      onOpen: openBook,
      onSaveToDevice: saveBookToDevice,
      onSyncToDevice: syncToDevice,
      onRemoveCache: removeFromCache,
      onDelete: deleteBook,
    });
  }

  // Only keep polling while something is *actually* progressing. Error
  // jobs are terminal — they shouldn't force a live loop.
  const hasProgressing = uploads.size > 0
    || caching.size > 0
    || (serverJobs || []).some((j) => j.state === 'queued' || j.state === 'processing');
  if (hasProgressing) ensurePolling();
  else stopPolling();
}

function renderKey(jobRows, libraryRows, online) {
  const j = jobRows.map((r) => `${r.id}:${r.state}:${Math.round((r.progress || 0) * 100)}:${r.error || ''}`).join('|');
  const b = libraryRows.map((r) => `${r.jobId}:${r.cached ? 1 : 0}:${r.onServer ? 1 : 0}:${r.lastPlayed || 0}`).join('|');
  return `${online ? 1 : 0}|${j}|${b}`;
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
    if (entry) entry.cancelled = true;
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

function syncToDevice(book) {
  cacheFailed.delete(book.jobId);
  startCaching(book.jobId).catch(() => {});
}

async function saveBookToDevice(book) {
  cacheFailed.delete(book.jobId);
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
  cacheFailed.delete(book.jobId);
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
function startCaching(jobId) {
  if (caching.has(jobId)) return caching.get(jobId).promise;
  cacheFailed.delete(jobId);

  // Reserve the slot synchronously — otherwise two poll ticks can each
  // kick off a parallel download of the same job.
  let aborted = false;
  const entry = { title: '(loading…)', progress: 0, abort: () => { aborted = true; }, promise: null };
  caching.set(jobId, entry);

  const promise = (async () => {
    try {
      const meta = await api.getJob(jobId);
      if (!meta || meta.state !== 'done') return;
      entry.title = meta.title || meta.input_filename || jobId;
      await books.cacheMp3(meta, (p) => {
        if (aborted) throw new Error('cache aborted');
        entry.progress = p;
        // Throttle — fetchMp3Blob fires onProgress for every chunk, and
        // calling refresh() every time spams /api/jobs enough to cause
        // transient timeouts that flash the offline banner.
        const now = Date.now();
        if (now - lastProgressRefresh > PROGRESS_REFRESH_MS) {
          lastProgressRefresh = now;
          refresh();
        }
      });
      ui.showToast(`"${entry.title}" ready to play`);
    } catch (e) {
      console.error('cache failed for', jobId, e);
      if (!aborted) {
        cacheFailed.add(jobId);
        ui.showToast('Cache failed: ' + (e && e.message ? e.message : String(e)), { error: true, duration: 6000 });
      }
    } finally {
      caching.delete(jobId);
      refresh();
    }
  })();
  entry.promise = promise;
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
      onXhr: (xhr) => {
        entry.xhr = xhr;
      },
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
    if (!entry.cancelled) {
      ui.showToast('Upload failed: ' + (e.message || e), { error: true, duration: 6000 });
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
