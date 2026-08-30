// Recompress a track and decide by ear. There is deliberately no score here: a machine grade for
// "does this still sound right" is the mistake this house has already made once, on a speech pool
// a number called 90.7% intelligible and Aaron called a computer voice from the nineties.
//
// The source is always audio/music/raw/ — re-encoding the shipped file stacks generation loss on
// top of itself, which is exactly the artefact being judged.

import { el, clock, esc } from './ui.js';

const RAW = id => `audio/music/raw/${id}.mp3`;

export function compress(host, C) {
  const wrap = el('div', 'split');
  const side = el('div', 'side mus-side');
  const main = el('div', 'main');
  wrap.append(side, main);
  host.append(wrap);

  let profiles = [];
  let picked = null;
  let job = null;         // {state, note, position}
  let preview = null;     // the encode result awaiting a verdict
  let hasRaw = new Map();
  let playing = 'shipped';
  const audio = new Audio();

  async function boot() {
    const r = await post({ profiles: true });
    profiles = r.ok ? (r.profiles || []).filter(p => p.kind === 'music') : [];
    paint();
  }

  function post(body, onProgress) { return encodeCall(C.ctx.api, body, onProgress); }

  function paintSide() {
    side.innerHTML = '';
    side.append(el('div', 'grouphead', 'Tracks'));
    for (const t of C.doc().tracks || []) {
      const b = el('button', t.id === picked ? 'active' : '', t.title || t.id);
      b.onclick = () => { picked = t.id; preview = null; job = null; paint(); checkRaw(t.id); };
      side.append(b);
    }
    if (!(C.doc().tracks || []).length) side.append(el('div', 'dim', 'no tracks'));
  }

  async function checkRaw(id) {
    if (hasRaw.has(id)) return;
    let ok = false;
    try { ok = (await fetch(C.base + RAW(id), { method: 'HEAD' })).ok; } catch { /* not served */ }
    hasRaw.set(id, ok);
    if (picked === id) paintMain();
  }

  function paintMain() {
    main.innerHTML = '';
    main.append(el('p', 'dim', 'Compression is a listening call. Make a preview, switch between it and ' +
      'the shipped file mid-phrase, and keep the one that sounds right. Nothing here grades a take.'));

    if (!C.ctx.api.base && C.ctx.api.base !== '') {
      main.append(el('div', 'banner', 'Re-encoding needs the dev server — node tools/devserver.mjs'));
    }

    const t = C.track(picked);
    if (!t) { main.append(el('div', 'empty', 'pick a track on the left')); return; }
    const raw = hasRaw.get(t.id);

    main.append(el('h2', null, t.title || t.id));
    const info = document.createElement('table');
    info.innerHTML = `<tr><th>shipped</th><td class="wide"><code>${esc(t.file)}</code> · ${clock(t.seconds)}</td></tr>
      <tr><th>source</th><td class="wide">${raw === false
        ? `<span class="bad">no ${esc(RAW(t.id))}</span> — re-encoding the shipped file would stack generation loss`
        : `<code>${esc(RAW(t.id))}</code>`}</td></tr>`;
    main.append(info);

    const pick = document.createElement('select');
    for (const p of profiles) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.label;
      pick.append(o);
    }
    if (!profiles.length) { const o = document.createElement('option'); o.textContent = 'no dev server'; pick.append(o); }
    const args = el('div', 'dim');
    args.style.cssText = 'font:11px/1.5 ui-monospace,Menlo,monospace;margin:-6px 0 10px';
    const showArgs = () => { args.textContent = profiles.find(p => p.id === pick.value)?.args || ''; };
    pick.onchange = showArgs;
    showArgs();

    const go = el('button', 'primary', 'Make a preview');
    go.dataset.act = 'encode';
    go.disabled = raw === false || !profiles.length || (job && job.state !== 'done' && job.state !== 'error');
    const note = el('span', job?.state === 'error' ? 'bad' : 'dim');
    note.dataset.role = 'encode-note';
    note.textContent = job ? `${job.state}${job.position ? ` — ${job.position} in the queue` : ''}${job.note ? ` — ${job.note}` : ''}` : '';
    go.onclick = () => run(t, pick.value);

    const row = el('div', 'row');
    row.append(pick, go, note);
    main.append(row, args);

    if (preview) main.append(ab(t));
  }

  async function run(t, profile) {
    job = { state: 'queued', note: '' };
    preview = null;
    paintMain();
    const r = await post({ src: RAW(t.id), profile, out: `audio/music/${t.id}`, preview: true },
      s => { job = s; paintMain(); });
    if (!r.ok || r.state === 'error') {
      job = { state: 'error', note: r.error || 'failed' };
      paintMain();
      return;
    }
    job = { state: 'done', note: '' };
    preview = r;
    playing = 'preview';
    paintMain();
  }

  // One element, switched mid-phrase: the same bar heard twice, seconds apart, is not the same
  // comparison as the same bar heard twice at the same playhead.
  function ab(t) {
    const box = el('div');
    box.append(el('h2', null, 'A / B'));
    const sizes = document.createElement('table');
    const kb = n => (n ? `${Math.round(n / 1024)} kB` : '—');
    const rate = m => (m?.bitrate ? `${Math.round(m.bitrate / 1000)} kbps ${m.channels === 1 ? 'mono' : 'stereo'} @ ${Math.round((m.sampleRate || 0) / 100) / 10} kHz` : '—');
    sizes.innerHTML = `<tr><th></th><th>size</th><th class="wide">encoding</th></tr>
      <tr><th>source</th><td>${kb(preview.source?.bytes)}</td><td class="wide dim">${esc(rate(preview.source))} — audio/music/raw/</td></tr>
      <tr><th>preview</th><td>${kb(preview.after?.bytes)}</td><td class="wide">${esc(rate(preview.after))} — ${esc(preview.label || preview.profile || '')}</td></tr>
      ${preview.ratio ? `<tr><th>smaller by</th><td colspan="2" class="wide dim">${preview.ratio}× against the source</td></tr>` : ''}`;
    box.append(sizes);

    const src = which => (which === 'preview' ? C.base + preview.out : C.base + t.file);
    const swap = which => {
      if (playing === which && !audio.paused) return;
      const at = audio.currentTime;
      playing = which;
      audio.src = src(which);
      audio.currentTime = at || 0;
      audio.play().catch(() => {});
      paintButtons();
    };
    const a = el('button', null, 'Shipped');
    const b = el('button', null, 'Preview');
    const stop = el('button', null, '■');
    const paintButtons = () => {
      a.className = playing === 'shipped' ? 'primary' : '';
      b.className = playing === 'preview' ? 'primary' : '';
    };
    a.onclick = () => swap('shipped');
    b.onclick = () => swap('preview');
    stop.onclick = () => audio.pause();
    paintButtons();

    const keep = el('button', 'primary', 'Keep the preview');
    keep.dataset.act = 'promote';
    keep.onclick = async () => {
      const r = await post({ promote: preview.out });
      if (!r.ok) return C.ctx.toast(`could not keep it — ${r.error}`, 'bad');
      C.ctx.toast(`${r.out} replaced — that is now what ships`, 'good');
      audio.pause();
      preview = null;
      paintMain();
    };
    const drop = el('button', null, 'Discard');
    drop.onclick = () => {
      audio.pause();
      preview = null;
      paintMain();
      C.ctx.toast('left alone — the preview file stays under audio/music/_preview/');
    };

    const row = el('div', 'row');
    row.append(a, b, stop);
    const acts = el('div', 'row');
    acts.append(keep, drop);
    box.append(row, acts, el('p', 'dim',
      'Keeping is a rename, so the bytes you approved are the bytes that ship. Discarding is doing nothing.'));
    return box;
  }

  function paint() { paintSide(); paintMain(); }
  paint();
  boot();
  return { paint, dispose: () => audio.pause() };
}

// js/dev/api.js has no wrapper for /api/encode yet and is not this agent's file, so the call and
// its polling live here. Same {job, position} → /api/job/<id> shape as /api/music.
export async function encodeCall(api, body, onProgress) {
  const base = api.base;
  if (base === null) return { ok: false, offline: true, error: 'no dev server' };
  let start;
  try {
    const r = await fetch(`${base}/api/encode`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    start = await r.json();
  } catch (e) { return { ok: false, offline: true, error: String(e.message || e) }; }
  if (!start?.ok || !start.job) return start || { ok: false, error: 'no answer' };
  for (let i = 0; ; i++) {
    await new Promise(r => setTimeout(r, i < 4 ? 500 : 1500));
    const s = await api.job(start.job);
    if (!s.ok) return s;
    onProgress?.(s);
    if (s.state === 'done') return { ...s, ok: true };
    if (s.state === 'error') return { ...s, ok: false, error: s.error || 'encode failed' };
    if (i > 800) return { ok: false, error: 'gave up waiting' };
  }
}
