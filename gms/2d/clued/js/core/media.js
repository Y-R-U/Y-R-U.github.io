// Media preflight: load every image/audio a question set needs before play starts.
const cache = new Map();   // url -> Promise<boolean>
const keep = new Map();    // url -> element, so the browser keeps it decoded

const AUDIO_RE = /\.(mp3|m4a|aac|ogg|oga|wav|opus|flac)(\?|$)/i;

export function mediaOf(q) {
  const out = { img: [], audio: [] };
  const seen = new Set();
  (function walk(v, key) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, key)); return; }
    if (typeof v.src === 'string' && !seen.has(v.src)) {
      seen.add(v.src);
      const kind = key === 'audio' || v.kind === 'audio' || AUDIO_RE.test(v.src) ? 'audio' : 'img';
      if (!v.lazy) out[kind].push(v);
    }
    for (const [k, x] of Object.entries(v)) if (k !== 'src') walk(x, k === 'audio' || k === 'img' ? k : key);
  })(q, null);
  return out;
}

export function creditsOf(q) {
  const m = mediaOf(q);
  return [...m.img, ...m.audio].filter(x => x.credit || x.license);
}

export function urlsOf(questions) {
  const s = new Set();
  for (const q of questions) {
    const m = mediaOf(q);
    m.img.forEach(x => s.add(x.src));
    m.audio.forEach(x => s.add(x.src));
  }
  return [...s];
}

function loadImage(url, ms) {
  return new Promise(res => {
    const img = new Image();
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(t); if (ok) keep.set(url, img); res(ok); };
    const t = setTimeout(() => fin(false), ms);
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => fin(img.naturalWidth > 0);
    img.onerror = () => fin(false);
    img.src = url;
  });
}

function loadAudio(url, ms) {
  return new Promise(res => {
    const a = new Audio();
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(t); a.oncanplay = a.onerror = null; if (ok) keep.set(url, a); res(ok); };
    const t = setTimeout(() => fin(true), ms);   // mobile may refuse to preload audio without a gesture; only a real error fails
    a.preload = 'auto';
    a.oncanplay = () => fin(true);
    a.onloadedmetadata = () => fin(true);
    a.onerror = () => fin(false);
    a.src = url;
    try { a.load(); } catch (e) { fin(false); }
  });
}

export function preloadOne(url, ms = 12000) {
  if (cache.has(url)) return cache.get(url);
  const p = (AUDIO_RE.test(url) ? loadAudio(url, ms) : loadImage(url, ms)).then(async ok => {
    if (ok) return true;
    // one retry with a cache-buster after a short back-off: Wikimedia thumbs 429 when hit in bursts
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    const retry = url + (url.includes('?') ? '&' : '?') + 'r=1';
    return AUDIO_RE.test(url) ? loadAudio(retry, ms) : loadImage(retry, ms);
  });
  cache.set(url, p);
  p.then(ok => { if (!ok) cache.delete(url); });
  return p;
}

// onProgress(done, total). Resolves { ok:Set, failed:Set }.
export async function preflight(urls, onProgress, { concurrency = 6, timeoutMs = 12000 } = {}) {
  const list = [...new Set(urls)].filter(Boolean);
  const ok = new Set(), failed = new Set();
  let done = 0, i = 0;
  onProgress && onProgress(0, list.length);
  async function worker() {
    while (i < list.length) {
      const url = list[i++];
      (await preloadOne(url, timeoutMs)) ? ok.add(url) : failed.add(url);
      done++;
      onProgress && onProgress(done, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return { ok, failed };
}

export const questionFailed = (q, failed) => urlsOf([q]).some(u => failed.has(u));

// Replace questions whose media failed with spares that loaded. Returns { questions, dropped }.
export function swapFailed(questions, spares, failed) {
  const pool = spares.filter(s => !questionFailed(s, failed));
  const used = new Set(questions.map(q => q.id));
  let dropped = 0;
  const out = [];
  for (const q of questions) {
    if (!questionFailed(q, failed)) { out.push(q); continue; }
    let k = pool.findIndex(s => !used.has(s.id) && s.format === q.format && s.round === q.round);
    if (k < 0) k = pool.findIndex(s => !used.has(s.id) && s.round === q.round);
    if (k >= 0) { const s = pool.splice(k, 1)[0]; used.add(s.id); out.push(s); } else dropped++;
  }
  return { questions: out, dropped };
}
