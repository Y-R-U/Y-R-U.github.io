// REST client for the Go server (same origin, editor port). Every write the
// editor makes lands in the same SQLite DB the game reads.

async function j(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  ping:        ()            => j('/api/ping'),
  levels:      ()            => j('/api/levels').then(r => r.levels),
  level:       (id)          => j(`/api/levels/${id}`),
  saveLevel:   (id, name, data) => j(`/api/levels/${id}`, { method: 'PUT', body: JSON.stringify({ name, data }) }),
  createLevel: (id, name, data) => j('/api/levels', { method: 'POST', body: JSON.stringify({ id, name, data }) }),
  deleteLevel: (id)          => j(`/api/levels/${id}`, { method: 'DELETE' }),
  versions:    (id)          => j(`/api/levels/${id}/versions`).then(r => r.versions),
  saveVersion: (id, name)    => j(`/api/levels/${id}/versions`, { method: 'POST', body: JSON.stringify({ name }) }),
  restore:     (id, vid)     => j(`/api/levels/${id}/restore`, { method: 'POST', body: JSON.stringify({ vid }) }),
  deleteVersion: (vid)       => j(`/api/versions/${vid}`, { method: 'DELETE' }),
  getConfig:   (key)         => j(`/api/config/${key}`).then(r => r.data).catch(() => null),
  putConfig:   (key, data)   => j(`/api/config/${key}`, { method: 'PUT', body: JSON.stringify({ data }) }),
  publish:     ()            => j('/api/publish', { method: 'POST' }),
};
