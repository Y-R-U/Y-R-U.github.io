/* Import flow: upload file to server, track the resulting job to completion,
   then persist the returned MP3 as a local book. */
import * as store from './storage.js';
import * as api from './api.js';

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function startImport(file, voice, speed, hooks = {}) {
  const { onUploadProgress, onServerProgress } = hooks;
  const job = await api.createJob(file, voice, speed, { onUploadProgress });
  const row = {
    jobId: job.id,
    filename: file.name,
    voice,
    speed,
    state: job.state,
    progress: 0,
    title: job.title || file.name.replace(/\.[^.]+$/, ''),
    author: '',
    error: null,
    createdAt: Date.now(),
  };
  await store.putJob(row);

  // Track to completion (runs on the caller's timeline — don't await this
  // unless you want to block).
  const finishedMeta = await trackJob(row, onServerProgress);
  return finishedMeta;
}

export async function trackJob(jobRow, onServerProgress) {
  const { done } = api.streamJob(jobRow.jobId, async (meta) => {
    const updated = {
      ...jobRow,
      state: meta.state,
      progress: meta.progress || 0,
      title: meta.title || jobRow.title,
      author: meta.author || jobRow.author,
      error: meta.error || null,
    };
    await store.putJob(updated);
    onServerProgress?.(updated);
  });
  const finalMeta = await done;  // throws on error
  return finalMeta;
}

export async function completeJob(jobRow, onDownloadProgress) {
  const blob = await api.fetchMp3Blob(jobRow.jobId, onDownloadProgress);
  const bookId = newId();
  await store.saveAudio(bookId, blob);

  let duration = null;
  try { duration = await probeDuration(blob); } catch (_) {}

  const book = {
    id: bookId,
    title: jobRow.title,
    author: jobRow.author,
    voice: jobRow.voice,
    speed: jobRow.speed || 1.0,
    size: blob.size,
    duration,
    format: 'mp3',
    createdAt: Date.now(),
    lastPlayed: 0,
    position: 0,
  };
  await store.putBook(book);
  await store.deleteJobRow(jobRow.jobId);
  api.deleteJob(jobRow.jobId).catch(() => {});
  return book;
}

function probeDuration(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : null);
    };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('probe failed')); };
    audio.src = url;
  });
}
