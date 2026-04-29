/* Thin wrapper around the server-side /api/* endpoints. */

const DEFAULT_TIMEOUT_MS = 3500;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function listVoices() {
  const r = await fetchWithTimeout('/api/voices');
  if (!r.ok) throw new Error('voices fetch failed');
  const { voices } = await r.json();
  return voices;
}

export async function listJobs() {
  const r = await fetchWithTimeout('/api/jobs');
  if (!r.ok) throw new Error('jobs list failed');
  const { jobs } = await r.json();
  return jobs;
}

export async function getJob(id) {
  const r = await fetchWithTimeout(`/api/jobs/${id}`);
  if (!r.ok) return null;
  return r.json();
}

export async function createJob(file, voice, speed = 1.0, { onUploadProgress, onXhr, parentFolderId } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('voice', voice);
  form.append('speed', String(speed));
  if (parentFolderId) form.append('parent_folder_id', parentFolderId);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/convert');
    if (onXhr) onXhr(xhr);
    if (onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onUploadProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
      } else {
        let msg = `upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (_) {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.onabort = () => reject(new Error('upload canceled'));
    xhr.send(form);
  });
}

/* ---- Library tree ---- */
export async function getLibrary() {
  const r = await fetchWithTimeout('/api/library', {}, 5000);
  if (!r.ok) throw new Error('library fetch failed');
  return r.json();
}

export async function putLibrary(rev, topLevel) {
  const r = await fetch('/api/library', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rev, topLevel }),
  });
  if (r.status === 409) {
    const body = await r.json().catch(() => ({}));
    const err = new Error('library conflict');
    err.conflict = true;
    err.current = body.current || null;
    throw err;
  }
  if (!r.ok) {
    let msg = `library PUT failed (${r.status})`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

/* ---- Text items ---- */
export async function createTextItem({ title, text, parent_folder_id, voice }) {
  const r = await fetch('/api/items/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, text, parent_folder_id, voice }),
  });
  if (!r.ok) {
    let msg = `create text failed (${r.status})`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

export async function getTextItem(id) {
  const r = await fetchWithTimeout(`/api/items/${id}/text`, {}, 5000);
  if (!r.ok) throw new Error('text fetch failed');
  return r.json();
}

export async function updateTextItem(id, { title, text }) {
  const body = {};
  if (title !== undefined) body.title = title;
  if (text !== undefined) body.text = text;
  const r = await fetch(`/api/items/${id}/text`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = `text update failed (${r.status})`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

export async function convertItem(id, { voice, speed } = {}) {
  const r = await fetch(`/api/items/${id}/convert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voice, speed }),
  });
  if (!r.ok) {
    let msg = `convert failed (${r.status})`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

/* ---- Segments ---- */
export async function getSegments(jobId) {
  const r = await fetchWithTimeout(`/api/jobs/${jobId}/segments`, {}, 5000);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('segments fetch failed');
  return r.json();
}

export async function deleteJob(id) {
  const r = await fetchWithTimeout(`/api/jobs/${id}`, { method: 'DELETE' });
  if (!r.ok) {
    let msg = `delete failed (${r.status})`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
}

export async function fetchMp3Blob(id, onProgress) {
  const r = await fetchWithTimeout(`/api/jobs/${id}/mp3`, {}, 15000);
  if (!r.ok) throw new Error('mp3 not ready');
  const total = Number(r.headers.get('content-length')) || 0;
  if (!onProgress || !total || !r.body) return r.blob();
  const reader = r.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded / total);
  }
  return new Blob(chunks, { type: 'audio/mpeg' });
}
