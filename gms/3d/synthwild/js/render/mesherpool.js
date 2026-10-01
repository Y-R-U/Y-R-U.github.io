// Worker pool for section meshing. One job per section key at a time.
export function createMesherPool(table, onResult, onError = () => {}) {
  const hc = navigator.hardwareConcurrency || 4;
  const count = Math.max(1, Math.min(3, hc - 2));
  const PER = 3; // jobs in flight per worker
  const workers = [];
  const jobs = new Map(); // key -> worker index
  let seq = 0, gen = 0;
  for (let i = 0; i < count; i++) {
    const w = new Worker(new URL('./mesher.worker.js', import.meta.url), { type: 'module' });
    w.load = 0;
    w.postMessage({ type: 'table', table });
    w.onmessage = (e) => {
      const msg = e.data;
      w.load = Math.max(0, w.load - 1);
      if (jobs.get(msg.key) === msg.id) jobs.delete(msg.key);
      if (msg.gen !== undefined && msg.gen !== gen) return;
      if (msg.type === 'error') { console.error('[mesher]', msg.key, msg.error); onError(msg.key); return; }
      onResult(msg);
    };
    w.onerror = (e) => console.error('[mesher] worker error', e.message || e);
    workers.push(w);
  }
  return {
    free() { let n = 0; for (const w of workers) n += Math.max(0, PER - w.load); return n; },
    busy: (key) => jobs.has(key),
    inflight: () => jobs.size,
    submit(key, payload) {
      let best = workers[0];
      for (const w of workers) if (w.load < best.load) best = w;
      const id = ++seq;
      best.load++;
      jobs.set(key, id);
      best.postMessage({ type: 'mesh', id, key, gen, version: payload.version, payload },
        [payload.cells.buffer, payload.subs.buffer, payload.light.buffer]);
    },
    cancelAll() { gen++; jobs.clear(); },
    terminate() { for (const w of workers) w.terminate(); },
  };
}
