import * as store from './storage.js';
import * as api from './api.js';
import * as books from './books.js';
import * as player from './player.js';
import * as ui from './ui.js';
import * as library from './library.js';
import * as dragdrop from './dragdrop.js';
import * as textedit from './textedit.js';
import * as sync from './sync.js';

const $ = (id) => document.getElementById(id);

let voicesCache = null;
let pollTimer = null;
let serverReachable = true;
let lastRenderKey = '';
let lastJobs = null;
let consecutiveFails = 0;
const PROGRESS_REFRESH_MS = 400;
let lastProgressRefresh = 0;

const uploads = new Map();
const caching = new Map();
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

/* ---------------- Refresh: pull jobs + library, rebuild state, render ---------------- */
async function refresh() {
  let serverJobs = null;
  let lib = null;
  try {
    [serverJobs, lib] = await Promise.all([api.listJobs(), api.getLibrary()]);
    lastJobs = serverJobs;
    consecutiveFails = 0;
    serverReachable = true;
  } catch (_) {
    consecutiveFails++;
    if (consecutiveFails >= 2) serverReachable = false;
    else if (lastJobs) serverJobs = lastJobs;
  }

  // Local meta — used for lastPlayed + cached state in recents/cards.
  const localMetas = await store.listBookMeta();
  // Augment with `cached` from audioExists (more authoritative than meta.size).
  for (const m of localMetas) {
    m.cached = await store.audioExists(m.jobId);
  }

  // Jobs section: live uploads + queued/processing/error + caching downloads.
  const uploadRows = Array.from(uploads.values());
  const active = (serverJobs || []).filter(
    (j) => j.state === 'queued' || j.state === 'processing' || j.state === 'error'
  );
  const jobRows = [
    ...uploadRows.map((u) => ({ kind: 'upload', id: u.id, title: u.title, state: 'uploading', progress: u.progress })),
    ...active.map((j) => ({ kind: 'server', id: j.id, title: j.title || j.input_filename, state: j.state, progress: j.progress, error: j.error })),
  ];
  for (const [jobId, info] of caching.entries()) {
    jobRows.push({ kind: 'cache', id: jobId, title: info.title, state: 'downloading', progress: info.progress });
  }

  if (lib) {
    library.setData({ tree: lib, jobs: serverJobs || [], metas: localMetas });
  } else if (library.getTree() == null) {
    // Offline first paint with no cached tree — just render an empty shell.
    library.setData({ tree: { rev: 0, topLevel: [
      { id: 'f1', name: 'Books', children: [] }, { id: 'f2', name: 'Folder 2', children: [] },
      { id: 'f3', name: 'Folder 3', children: [] }, { id: 'f4', name: 'Folder 4', children: [] },
    ]}, jobs: [], metas: localMetas });
  } else {
    // Offline but we have a cached tree — refresh local metas (lastPlayed,
    // cached flag) so recents and item cards stay current.
    library.setData({ tree: library.getTree(), jobs: serverJobs || [], metas: localMetas });
  }

  ui.setConnectionStatus(serverReachable);

  const key = renderKey(jobRows, library.getTree(), library.getPath(), localMetas, serverReachable);
  if (key !== lastRenderKey) {
    lastRenderKey = key;
    ui.renderJobs(jobRows, cancelJobRow);
    library.render();
    dragdrop.attachAll($('grid'));
    dragdrop.attachAll($('breadcrumbs'));
  }

  const hasProgressing = uploads.size > 0
    || caching.size > 0
    || (serverJobs || []).some((j) => j.state === 'queued' || j.state === 'processing');
  if (hasProgressing) ensurePolling();
  else stopPolling();
}

function renderKey(jobRows, tree, path, metas, online) {
  const j = jobRows.map((r) => `${r.id}:${r.state}:${Math.round((r.progress || 0) * 100)}:${r.error || ''}`).join('|');
  const t = tree ? `${tree.rev}` : '0';
  const p = path.map((f) => f.id).join('>');
  const m = metas.map((x) => `${x.jobId}:${x.cached ? 1 : 0}:${x.lastPlayed || 0}`).join(',');
  return `${online ? 1 : 0}|${t}|${p}|${j}|${m}`;
}

function ensurePolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => refresh().catch(() => {}), 2000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/* ---------------- Library callbacks ---------------- */
library.init({
  onNavigate: () => {
    // Recompute key so render runs even if data didn't change.
    lastRenderKey = '';
    refresh();
  },
  onOpenItem: (row) => {
    if (!row) return;
    if (row.state === 'draft' || (row.kind === 'text' && row.state !== 'done')) {
      textedit.openExisting(row.jobId);
      return;
    }
    openBook(row);
  },
  onEditText: (row) => textedit.openExisting(row.jobId),
  onItemMenu: (row) => itemMenu(row),
  onFolderMenu: (folder, { fixed }) => folderMenu(folder, { fixed }),
  onAddHere: (parentFolderId) => addHere(parentFolderId),
});

/* ---------------- Drag-drop ---------------- */
dragdrop.init({
  onMove: async (op) => {
    const tree = library.getTree();
    if (!tree) return;
    let dstParentId, dstIndex;
    if (op.kind === 'into') {
      dstParentId = op.folderId;
      const dst = library.findFolderById(tree, dstParentId);
      if (!dst) return;
      dstIndex = (dst.children || []).length;
    } else if (op.kind === 'append-current') {
      dstParentId = library.currentParentId();
      if (!dstParentId) return;
      const dst = library.findFolderById(tree, dstParentId);
      dstIndex = (dst?.children || []).length;
    } else if (op.kind === 'before') {
      const beforeLoc = library.findNodeLocation(tree, op.beforeNodeId);
      if (!beforeLoc) return;
      dstParentId = beforeLoc.parent.id;
      dstIndex = beforeLoc.index;
    } else {
      return;
    }
    try {
      await library.moveNode(op.nodeId, dstParentId, dstIndex);
    } catch (e) {
      if (e.conflict) ui.showToast('Library was updated elsewhere — refreshed.');
      else ui.showToast('Move failed: ' + (e.message || e), { error: true });
    }
    lastRenderKey = '';
    await refresh();
  },
});

/* ---------------- Add flow (+ card) ---------------- */
async function addHere(parentFolderId) {
  const choice = await ui.showActionSheet({
    title: 'Add to this folder',
    actions: [
      { id: 'folder', label: '📁  New folder' },
      { id: 'file', label: '📄  Upload file (EPUB / PDF / TXT)' },
      { id: 'text', label: '✎  Write text' },
    ],
  });
  if (choice === 'folder') {
    const name = await ui.showPrompt({ title: 'Folder name', placeholder: 'My folder' });
    if (!name) return;
    try {
      await library.createFolder(parentFolderId, name);
      lastRenderKey = '';
      await refresh();
    } catch (e) {
      ui.showToast('Create failed: ' + (e.message || e), { error: true });
    }
  } else if (choice === 'file') {
    pendingParentForUpload = parentFolderId;
    $('file-input').click();
  } else if (choice === 'text') {
    textedit.openNew(parentFolderId);
  }
}

let pendingParentForUpload = null;

/* ---------------- Item / folder menus ---------------- */
async function itemMenu(row) {
  const choice = await ui.showActionSheet({
    title: row.title,
    actions: [
      row.state === 'done' && !row.cached ? { id: 'sync', label: 'Sync to this device' } : null,
      row.state === 'done' && row.onServer ? { id: 'save', label: 'Save .mp3 file' } : null,
      row.state === 'done' && row.cached ? { id: 'uncache', label: 'Remove from device (keep on server)' } : null,
      row.hasText ? { id: 'edit', label: 'Edit text' } : null,
      row.hasText && row.state === 'done' ? { id: 'reconvert', label: 'Re-convert (replace audio)' } : null,
      row.state === 'error' ? { id: 'delete-error', label: 'Remove failed item', danger: true } : null,
      { id: 'delete', label: 'Delete item', danger: true },
    ].filter(Boolean),
  });
  if (choice === 'sync') syncToDevice(row);
  else if (choice === 'save') saveBookToDevice(row);
  else if (choice === 'uncache') removeFromCache(row);
  else if (choice === 'edit') textedit.openExisting(row.jobId);
  else if (choice === 'reconvert') reconvertText(row);
  else if (choice === 'delete' || choice === 'delete-error') deleteBook(row);
}

async function folderMenu(folder, { fixed }) {
  const choice = await ui.showActionSheet({
    title: folder.name || 'Folder',
    actions: [
      { id: 'rename', label: 'Rename' },
      !fixed ? { id: 'delete', label: 'Delete folder', danger: true } : null,
    ].filter(Boolean),
  });
  if (choice === 'rename') {
    const name = await ui.showPrompt({ title: 'Rename folder', initialValue: folder.name || '' });
    if (!name) return;
    try {
      await library.renameFolder(folder.id, name);
      lastRenderKey = '';
      await refresh();
    } catch (e) {
      ui.showToast('Rename failed: ' + (e.message || e), { error: true });
    }
  } else if (choice === 'delete') {
    const childCount = (folder.children || []).length;
    if (childCount > 0) {
      ui.showToast('Folder is not empty — move or delete its contents first.');
      return;
    }
    const ok = await ui.showConfirm({
      title: 'Delete folder?',
      message: `"${folder.name}" will be removed.`,
      okLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await library.deleteFolder(folder.id);
      lastRenderKey = '';
      await refresh();
    } catch (e) {
      ui.showToast('Delete failed: ' + (e.message || e), { error: true });
    }
  }
}

/* ---------------- Book/job actions (kept from previous app.js) ---------------- */
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
  if (row.state === 'processing') {
    ui.showToast("Can't cancel while converting. Wait for it to finish, then delete.");
    return;
  }
  const ok = await ui.showConfirm({
    title: row.state === 'error' ? 'Remove failed job?' : 'Cancel conversion?',
    message: `"${row.title}" will be removed from the server.`,
    okLabel: row.state === 'error' ? 'Remove' : 'Cancel job',
    danger: true,
  });
  if (!ok) return;
  try { await api.deleteJob(row.id); }
  catch (e) { ui.showToast('Delete failed: ' + (e.message || e), { error: true }); }
  await refresh();
}

async function deleteBook(row) {
  const ok = await ui.showConfirm({
    title: 'Delete item?',
    message: `"${row.title}" will be removed from the server and this device. This cannot be undone.`,
    okLabel: 'Delete', danger: true,
  });
  if (!ok) return;
  await api.deleteJob(row.jobId).catch(() => {});
  await store.deleteAudio(row.jobId);
  await store.deleteBookMeta(row.jobId);
  await store.deleteSegments(row.jobId);
  lastRenderKey = '';
  await refresh();
}

async function removeFromCache(row) {
  const ok = await ui.showConfirm({
    title: 'Remove from device?',
    message: `"${row.title}" will be removed from this device, but stays on the server.`,
    okLabel: 'Remove',
  });
  if (!ok) return;
  await store.deleteAudio(row.jobId);
  await store.deleteSegments(row.jobId);
  await refresh();
}

function syncToDevice(row) {
  cacheFailed.delete(row.jobId);
  startCaching(row.jobId).catch(() => {});
}

async function saveBookToDevice(row) {
  cacheFailed.delete(row.jobId);
  try {
    let file;
    if (await store.audioExists(row.jobId)) file = await store.readAudioFile(row.jobId);
    else { ui.showToast('Downloading first…'); file = await api.fetchMp3Blob(row.jobId); }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    const safe = (row.title || 'audiobook').replace(/[^\w\s.-]+/g, '_');
    a.download = `${safe}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    ui.showToast('Save failed: ' + (e.message || e), { error: true });
  }
}

async function openBook(row) {
  cacheFailed.delete(row.jobId);
  ui.showPlayer();
  // Show edit pencil if this item has editable text.
  $('btn-player-edit').classList.toggle('hidden', !row.hasText);
  $('btn-player-edit').onclick = () => textedit.openExisting(row.jobId);
  try {
    if (!(await store.audioExists(row.jobId))) {
      if (!serverReachable) throw new Error('not cached and server is offline');
      ui.showToast('Downloading…');
      await startCaching(row.jobId);
    }
    await player.loadBook(row.jobId, {
      onUpdate: ui.updatePlayer,
      hasSegments: row.hasSegments,
    });
    ui.updatePlayer();
  } catch (e) {
    ui.showToast('Could not load: ' + (e.message || e), { error: true });
    ui.showLibrary();
    await refresh();
  }
}

async function reconvertText(row) {
  try {
    await api.convertItem(row.jobId);
    ui.showToast('Re-converting…');
    await store.deleteAudio(row.jobId);
    await store.deleteSegments(row.jobId);
    lastRenderKey = '';
    await refresh();
    ensurePolling();
  } catch (e) {
    ui.showToast('Convert failed: ' + (e.message || e), { error: true });
  }
}

/* ---------------- Caching (server -> IDB) ---------------- */
function startCaching(jobId) {
  if (caching.has(jobId)) return caching.get(jobId).promise;
  cacheFailed.delete(jobId);
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

/* ---------------- File upload flow ---------------- */
async function onFilePicked(file) {
  const voices = await getVoices();
  if (!voices.length) { ui.showToast('TTS server not reachable.', { error: true, duration: 5000 }); return; }
  const last = await store.getPref('lastVoice', 'af_heart');
  ui.openImport({
    filename: file.name,
    voices,
    currentVoice: voices.find((v) => v.id === last) ? last : voices[0].id,
    onCancel: () => {},
    onConfirm: async (voice) => {
      await store.setPref('lastVoice', voice);
      const parent = pendingParentForUpload || library.currentParentId() || 'f1';
      pendingParentForUpload = null;
      startUpload(file, voice, parent);
    },
  });
}

async function startUpload(file, voice, parentFolderId) {
  const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry = { id: localId, title: file.name.replace(/\.[^.]+$/, ''), progress: 0, xhr: null };
  uploads.set(localId, entry);
  refresh();
  try {
    const job = await api.createJob(file, voice, 1.0, {
      parentFolderId,
      onXhr: (xhr) => { entry.xhr = xhr; },
      onUploadProgress: (frac) => { entry.progress = frac; refresh(); },
    });
    uploads.delete(localId);
    await store.updateBookMeta(job.id, {
      title: job.title || entry.title, author: '', voice, speed: 1.0,
    });
    lastRenderKey = '';
    await refresh();
    ensurePolling();
  } catch (e) {
    uploads.delete(localId);
    await refresh();
    if (!entry.cancelled) ui.showToast('Upload failed: ' + (e.message || e), { error: true, duration: 6000 });
  }
}

/* ---------------- Text editor callbacks ---------------- */
textedit.init({
  onSaved: async (jobId) => {
    ui.showToast('Saved');
    ui.showLibrary();
    lastRenderKey = '';
    await refresh();
  },
  onConvertRequested: async (jobId) => {
    // Show voice picker, then call /api/items/{id}/convert.
    const voices = await getVoices();
    if (!voices.length) { ui.showToast('TTS server not reachable.', { error: true }); return; }
    const last = await store.getPref('lastVoice', 'af_heart');
    ui.openImport({
      filename: '', // we hide the import-file-row caller-side
      voices,
      currentVoice: voices.find((v) => v.id === last) ? last : voices[0].id,
      title: 'Choose a voice',
      hideFilename: true,
      onCancel: () => {},
      onConfirm: async (voice) => {
        await store.setPref('lastVoice', voice);
        try {
          await api.convertItem(jobId, { voice });
          ui.showToast('Converting…');
          ui.showLibrary();
          lastRenderKey = '';
          await refresh();
          ensurePolling();
        } catch (e) {
          ui.showToast('Convert failed: ' + (e.message || e), { error: true });
        }
      },
    });
  },
  onCancelled: () => { ui.showLibrary(); },
  onError: (msg) => ui.showToast(msg, { error: true }),
});

/* ---------------- Sync ticker init ---------------- */
sync.init({ row: $('sync-row'), line: $('sync-line'), toggle: $('btn-sync-toggle') });
store.getPref('syncEnabled', true).then((on) => sync.setEnabledFromPref(on));

/* ---------------- Settings ---------------- */
async function refreshSettings() {
  const persisted = await store.isPersisted();
  const est = await store.storageEstimate();
  ui.setStorageStatus({ persisted, ...est });
}

/* ---------------- Wire global UI ---------------- */
function wire() {
  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await onFilePicked(file);
  });
  $('btn-up').addEventListener('click', () => { library.navigateUp(); lastRenderKey = ''; refresh(); });
  $('btn-settings').addEventListener('click', async () => { await refreshSettings(); ui.openSettings(); });
  $('btn-close-settings').addEventListener('click', () => ui.closeSettings());
  $('settings-modal').querySelector('.modal-scrim').addEventListener('click', () => ui.closeSettings());

  $('btn-back').addEventListener('click', () => {
    player.unload();
    ui.showLibrary();
    refresh();
  });
  $('btn-play').addEventListener('click', () => player.togglePlay());
  $('btn-back-30').addEventListener('click', () => player.skip(-30));
  $('btn-fwd-30').addEventListener('click', () => player.skip(30));
  $('scrubber').addEventListener('input', (e) => player.seekTo(parseFloat(e.target.value)));
  $('speed').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    $('speed-val').textContent = v.toFixed(2).replace(/0$/, '') + '×';
  });
  $('speed').addEventListener('change', (e) => player.setSpeed(parseFloat(e.target.value)));
  $('btn-player-dl').addEventListener('click', () => {
    if (player.state.book) saveBookToDevice({ jobId: player.state.book.jobId, title: player.state.book.title });
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
