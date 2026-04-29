/* Download a completed server job into IndexedDB, record local metadata. */
import * as store from './storage.js';
import * as api from './api.js';

export async function cacheMp3(jobMeta, onProgress) {
  const blob = await api.fetchMp3Blob(jobMeta.id, onProgress);
  await store.saveAudio(jobMeta.id, blob);

  let duration = null;
  try { duration = await probeDuration(blob); } catch (_) {}

  await store.updateBookMeta(jobMeta.id, {
    title: jobMeta.title || jobMeta.input_filename,
    author: jobMeta.author || '',
    voice: jobMeta.voice,
    speed: jobMeta.speed || 1.0,
    size: blob.size,
    duration,
    cachedAt: Date.now(),
  });
}

export async function ensureCached(jobMeta, onProgress) {
  if (await store.audioExists(jobMeta.id)) return;
  await cacheMp3(jobMeta, onProgress);
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
