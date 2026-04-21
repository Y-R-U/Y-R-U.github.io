/* Thin wrapper around the server-side /api/* endpoints. */

export async function listVoices() {
  const r = await fetch('/api/voices');
  if (!r.ok) throw new Error('voices fetch failed');
  const { voices } = await r.json();
  return voices;
}

export async function listJobs() {
  const r = await fetch('/api/jobs');
  if (!r.ok) throw new Error('jobs list failed');
  const { jobs } = await r.json();
  return jobs;
}

export async function getJob(id) {
  const r = await fetch(`/api/jobs/${id}`);
  if (!r.ok) return null;
  return r.json();
}

export async function createJob(file, voice, speed = 1.0, { onUploadProgress } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('voice', voice);
  form.append('speed', String(speed));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/convert');
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
    xhr.send(form);
  });
}

export async function deleteJob(id) {
  await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
}

export async function fetchMp3Blob(id, onProgress) {
  const r = await fetch(`/api/jobs/${id}/mp3`);
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

/* Server-Sent Events — resolve/reject-style with per-update callback. */
export function streamJob(id, onUpdate) {
  const es = new EventSource(`/api/jobs/${id}/stream`);
  let closed = false;
  const done = new Promise((resolve, reject) => {
    es.addEventListener('update', (e) => {
      try {
        const meta = JSON.parse(e.data);
        onUpdate(meta);
        if (meta.state === 'done') { closed = true; es.close(); resolve(meta); }
        else if (meta.state === 'error') { closed = true; es.close(); reject(new Error(meta.error || 'conversion failed')); }
      } catch (err) { reject(err); }
    });
    es.onerror = () => {
      if (!closed) { closed = true; es.close(); reject(new Error('stream dropped')); }
    };
  });
  return { done, close: () => { closed = true; es.close(); } };
}
