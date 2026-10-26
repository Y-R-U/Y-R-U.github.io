// Card portraits: robots' renderPortrait (a 3D render per model) -> <img> in a card's .art box.
// A grid of 46 cards used to render every portrait back to back in one microtask chain (one 3.7 s long task on the M5).
// Now: the card shows its role-icon placeholder at once; renders run one at a time with a real yield (paint) between
// them, cards on screen first (IntersectionObserver); every result is kept as a PNG blob in IndexedDB, so later visits
// and sessions only decode images. Bump PORTRAIT_VERSION when robots change how portraits look.
export const PORTRAIT_VERSION = 2;   // 2: robots-6 (units.PORTRAIT_STYLE 2, new ARBITER)
const BUDGET_MS = 8;

const DB = 'vectorprotocol-portraits', ST = 'p';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(ST); } catch (e) { /* exists */ } };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
async function idbGet(k) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => { try { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
}
async function idbDel(k) {
  const d = await db(); if (!d) return;
  try { d.transaction(ST, 'readwrite').objectStore(ST).delete(k); } catch (e) { /* ignore */ }
}
async function idbPut(k, v) {
  const d = await db(); if (!d) return;
  try { d.transaction(ST, 'readwrite').objectStore(ST).put(v, k); } catch (e) { /* quota / private mode: memory cache only */ }
}

const yieldFrame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 0); } };
  requestAnimationFrame(go); setTimeout(go, 50); });   // rAF lets the frame paint; the timeout covers hidden tabs

// A failed render (units stub after a failed module fetch, a throw on context loss, a bad stored blob) is retried
// up to TRIES times with backoff; after that the job is dropped, so a later fill() (next screen) starts over.
const TRIES = 3, BACKOFF_MS = [500, 2000];

export function createPortraits({ engine, units, reload }) {
  const urls = new Map();      // key -> object URL (resolved)
  const jobs = new Map();      // key -> { u, arts:Set, promise, resolve, tries }
  const queue = [];            // keys waiting for a render
  let pumping = false;
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { for (const e of es) e.target.__vpVis = e.isIntersecting; }) : null;

  const keyOf = (u) => {
    const model = u.model || u.id;
    const faction = u.rarity === 'legendary' ? 'legendary' : u.faction;
    return { model, faction, key: ['v' + PORTRAIT_VERSION, model, u.rarity, faction].join('|') };
  };

  function job(u) {
    const { key } = keyOf(u);
    let j = jobs.get(key);
    if (j) return j;
    j = { u, key, arts: new Set(), tries: 0 };
    j.promise = new Promise((res) => { j.resolve = res; });
    jobs.set(key, j);
    // stored portrait first (fast path); only a miss goes into the render queue
    idbGet(key).then((blob) => {
      if (blob instanceof Blob && blob.size > 0) return done(j, URL.createObjectURL(blob));
      if (blob) idbDel(key);
      queue.push(key); pump();
    });
    return j;
  }

  function done(j, url) {
    if (!url) return failed(j);
    urls.set(j.key, url);
    for (const art of j.arts) put(art, url, j.u);
    j.arts.clear();
    j.resolve(url);
  }

  function failed(j) {
    j.tries++;
    if (j.tries < TRIES) {
      setTimeout(() => { if (jobs.get(j.key) === j) { queue.push(j.key); pump(); } }, BACKOFF_MS[j.tries - 1] || 2000);
      return;
    }
    // give up for now: arts keep their role icon, the job is forgotten so the next fill() of this key tries again
    jobs.delete(j.key);
    j.arts.clear();
    j.resolve(null);
  }

  // visible cards first, then in request order
  function next() {
    let best = -1;
    for (let i = 0; i < queue.length; i++) {
      const j = jobs.get(queue[i]);
      if ([...j.arts].some((a) => a.isConnected && a.__vpVis !== false)) { best = i; break; }
      if (best < 0 && [...j.arts].some((a) => a.isConnected)) best = i;
    }
    if (best < 0) best = 0;
    return queue.splice(best, 1)[0];
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    await yieldFrame();   // let the screen that asked for these paint first
    while (queue.length) {
      const t0 = performance.now();
      do {
        const j = jobs.get(next());
        if (j) await render(j);
      } while (queue.length && performance.now() - t0 < BUDGET_MS);
      await yieldFrame();
    }
    pumping = false;
  }

  async function render(j) {
    const { model, faction } = keyOf(j.u);
    if (!units?.renderPortrait && reload) { try { units = (await reload()) || units; } catch (e) { /* stays a stub */ } }
    if (!units?.renderPortrait) return done(j, null);
    let c = null;
    try { c = await units.renderPortrait(model, { rarity: j.u.rarity, faction, engine, renderer: engine?.renderer, format: 'canvas' }); }
    catch (e) { console.warn('[portraits] render failed', model, e.message); }
    if (!c) return done(j, null);
    if (typeof c === 'string') return done(j, c);
    // PNG encode happens off the main thread (toBlob); the blob is both the <img> source and the stored copy
    const blob = c.toBlob ? await new Promise((r) => c.toBlob(r, 'image/png')) : null;
    if (!blob) return done(j, c.toDataURL ? c.toDataURL('image/png') : null);
    idbPut(j.key, blob);
    done(j, URL.createObjectURL(blob));
  }

  function put(art, url, u) {
    if (!url) return;   // the art may not be in the DOM yet (unitCard fills before the card is appended)
    io?.unobserve(art);
    const el = new Image();
    el.decoding = 'async'; el.className = 'portrait'; el.alt = '';
    el.onload = () => { art.querySelector('.ph')?.remove(); art.classList.remove('pt-wait'); };
    el.onerror = () => {
      // a bad stored blob / revoked URL: forget it (memory + IndexedDB) and render again
      el.remove();
      if (!u) return;
      const { key } = keyOf(u);
      if (urls.get(key) === url) { urls.delete(key); jobs.delete(key); idbDel(key); try { URL.revokeObjectURL(url); } catch (e) { /* data: url */ } }
      art.__vpBad = (art.__vpBad || 0) + 1;
      if (art.__vpBad < TRIES) fill(art, u);
    };
    el.src = url;
    art.prepend(el);
  }

  // fill(art, u): placeholder (the card's role icon, shimmering) now, portrait when ready
  function fill(art, u) {
    const { key } = keyOf(u);
    const url = urls.get(key);
    if (url) { put(art, url, u); return Promise.resolve(url); }
    art.classList.add('pt-wait');
    const j = job(u);
    j.arts.add(art);
    io?.observe(art);
    return j.promise;
  }

  function get(u) { const url = urls.get(keyOf(u).key); return url ? Promise.resolve(url) : job(u).promise; }

  return { get, fill, get pending() { return queue.length; }, debug: () => ({ queue: [...queue], jobs: [...jobs.values()].map((j) => [j.key, j.arts.size, urls.has(j.key), j.tries]) }),
    _test: { urls, jobs, setUnits: (x) => { units = x; } } };
}
