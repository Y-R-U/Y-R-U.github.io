// Admin picture review: every pack picture with an OK / Bad verdict, saved on the server (admin only).
// A verdict is tied to the picture's src, so a swapped or regenerated picture comes back as "to review".
// New AI pictures wait in data/candidates/*.json (refs "<pack>:new/<key>", never loaded by the game) until
// tools/img_promote.mjs moves the OK ones into the live pack; an OK candidate verdict then carries over to the live copy.
// A picture can also carry a drawn circle around the target (mark, 0–1 image coordinates); tools/img_marks.mjs puts those in the packs.
import { h, markRect } from '../ui/kit.js?v=202610161246';
import { toast } from '../ui/popup.js?v=202610161246';
import { API } from './api.js?v=202610161246';

const root = document.getElementById('rv');
const gate = document.getElementById('gate');
const PAGE = 60;
const REASONS = [['poor', 'Looks bad / poor'], ['text', 'Words in it'], ['wrong', 'Wrong thing'], ['giveaway', 'Gives answer away'], ['broken', 'Won’t load']];
let auth = null;
const pics = [];
const reviews = new Map();
const view = { pack: 'all', show: 'todo', shown: PAGE, compact: compactPref() };
// compact = two cards per row on a phone; remembered per device
function compactPref() {
  try { const v = localStorage.getItem('clued.review.compact'); if (v === '1' || v === '0') return v === '1'; } catch {}
  return typeof matchMedia === 'function' && matchMedia('(max-width: 600px)').matches;
}
const fileName = src => String(src || '').split('?')[0].split('/').pop();
const carried = new Map();

async function call(method, path, body) {
  const tok = auth ? await Promise.race([auth.getIdToken().catch(() => null), new Promise(r => setTimeout(() => r(null), 5000))]) : null;
  const res = await fetch(API + path, {
    method, cache: 'no-store',
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

function signInPanel(msg) {
  gate.replaceChildren(h('p', {}, msg), h('button.btn.primary', { type: 'button', onclick: async () => {
    try { await auth.signInGoogle(); start(); } catch (e) { toast(e.message || 'Sign-in failed'); }
  } }, 'Sign in with Google'));
}

async function loadPics() {
  const index = await (await fetch(`data/index.json?r=${Date.now()}`, { cache: 'no-store' })).json();
  const ids = Object.keys(index.packs).filter(id => index.packs[id].caps?.img > 0).sort();
  const packs = await Promise.all(ids.map(id => fetch(`data/${index.packs[id].path}`, { cache: 'no-cache' }).then(r => r.json()).catch(() => null)));
  packs.forEach((p, n) => {
    if (!p) return;
    const seen = new Set(), seenSrc = new Set();
    (function walk(o, owner) {
      if (Array.isArray(o)) { o.forEach(x => walk(x, owner)); return; }
      if (!o || typeof o !== 'object') return;
      const me = o.id && (o.name || o.q || o.prompt) ? o : owner;
      const imgs = o.media?.img || (Array.isArray(o.img) ? o.img : null);
      (imgs || []).forEach((m, i) => {
        const src = typeof m === 'string' ? m : m?.src;
        if (!src || seenSrc.has(src)) return;
        seenSrc.add(src);
        let ref = `${ids[n]}/${me?.id || 'pack'}/${i}`;
        while (seen.has(ref)) ref += '+';
        seen.add(ref);
        pics.push({ ref, src, pack: ids[n], packTitle: p.title || ids[n], name: me?.name || me?.q || me?.prompt || '', ai: !/^https?:/.test(src), caption: m?.caption || '', page: m?.page || '' });
      });
      for (const [k, v] of Object.entries(o)) if (k !== 'media' && v && typeof v === 'object') walk(v, me);
    })([p.items, p.questions], null);
  });
  const cands = await fetch(`data/candidates/index.json?r=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  for (const c of cands?.candidates || []) {
    const p = await fetch(`data/${c.path}`, { cache: 'no-cache' }).then(r => r.json()).catch(() => null);
    for (const it of p?.items || []) for (const m of it.media?.img || []) {
      if (!m.src || !m.key) continue;
      pics.push({ ref: m.ref || `${c.pack}:new/${m.key}`, src: m.src, pack: `${c.pack}:new`, packTitle: c.title, name: it.name, ai: true, cand: true, caption: m.caption || '', page: m.page || '' });
    }
  }
}

// an OK on a candidate counts for the live copy img_promote made of it (same hashed file name, same pack)
function carryCandidates() {
  carried.clear();
  for (const r of reviews.values()) {
    const m = /^([^/:]+):new\//.exec(r.ref);
    if (m && r.verdict === 'ok') carried.set(`${m[1]}|${fileName(r.src)}`, r);
  }
}

// the stored verdict only counts while it is for the same picture
const verdictOf = p => {
  const r = reviews.get(p.ref);
  if (r) return r.src === p.src ? r : null;
  const c = p.ai && !p.cand && carried.get(`${p.pack}|${fileName(p.src)}`);
  return c ? { ...c, ref: p.ref, src: p.src } : null;
};

async function save(items) {
  try { await call('POST', '/admin/imgreview', { items }); } catch (e) { toast(`Not saved: ${e.message}`); throw e; }
}

function setVerdict(p, verdict, reason = '', note = '', mark = verdictOf(p)?.mark) {
  const before = reviews.get(p.ref);
  const row = { ref: p.ref, src: p.src, verdict, reason, note, ...(mark ? { mark } : {}) };
  if (verdict) reviews.set(p.ref, row); else reviews.delete(p.ref);
  summary();
  return save([row]).catch(() => {
    if (before) reviews.set(p.ref, before); else reviews.delete(p.ref);
    summary(); render();
  });
}

const sumEl = h('div.rv-sum');
function summary() {
  const inPack = view.pack === 'all' ? pics : view.pack === 'ai' ? pics.filter(p => p.ai) : pics.filter(p => p.pack === view.pack);
  let ok = 0, bad = 0, marked = 0;
  for (const p of inPack) { const r = verdictOf(p), v = r?.verdict; if (v === 'ok') ok++; else if (v === 'bad') bad++; if (r?.mark) marked++; }
  sumEl.replaceChildren(
    h('span', {}, h('b', {}, String(inPack.length)), ' pictures'),
    h('span', {}, h('b', {}, String(inPack.length - ok - bad)), ' to review'),
    h('span', {}, h('b', {}, String(ok)), ' OK'),
    h('span', {}, h('b', {}, String(bad)), ' bad'),
    h('span', {}, h('b', {}, String(marked)), ' circled'));
  refreshRest?.();
}

function filtered() {
  return pics.filter(p => {
    if (view.pack === 'ai' ? !p.ai : view.pack !== 'all' && p.pack !== view.pack) return false;
    const r = verdictOf(p), v = r?.verdict;
    if (view.show === 'marked') return !!r?.mark;
    return view.show === 'all' || (view.show === 'todo' ? !v : v === view.show);
  });
}

function card(p) {
  const el = h('div.rv-card');
  const img = h('img', { src: p.src, alt: p.name, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  const pic = h('a.rv-pic', { href: p.src, target: '_blank', rel: 'noopener' }, img, p.ai ? h('span.ai', {}, 'AI') : null);
  img.addEventListener('error', () => pic.classList.add('broken'));
  const ring = h('span.rv-ring', { hidden: true });
  pic.append(ring);
  const circle = h('button.rv-draw', { type: 'button' }, '◯ Circle target');
  const unring = h('button.rv-draw', { type: 'button' }, 'Clear circle');
  const yes = h('button.y', { type: 'button' }, '✓ OK');
  const no = h('button.n', { type: 'button' }, '✗ Bad');
  const why = h('div.rv-why');
  const note = h('input', { type: 'text', placeholder: 'Note (optional): what’s wrong, what to show instead', maxlength: 400 });
  const paint = () => {
    const v = verdictOf(p);
    el.classList.toggle('ok', v?.verdict === 'ok');
    el.classList.toggle('bad', v?.verdict === 'bad');
    yes.classList.toggle('on', v?.verdict === 'ok');
    no.classList.toggle('on', v?.verdict === 'bad');
    // compact cards keep the reasons folded until Bad is tapped
    why.hidden = v?.verdict !== 'bad' || (view.compact && !el.dataset.open);
    no.textContent = view.compact && v?.verdict === 'bad' && why.hidden ? '✗ Bad ▾' : '✗ Bad';
    for (const b of why.querySelectorAll('button')) b.classList.toggle('on', b.dataset.r === v?.reason);
    if (document.activeElement !== note) note.value = v?.note || '';
    el.classList.toggle('marked', !!v?.mark);
    unring.hidden = !v?.mark;
    showRing(draft || v?.mark);
  };
  const showRing = m => {
    const r = m && markRect(m, pic.clientWidth, pic.clientHeight, img.naturalWidth, img.naturalHeight);
    ring.hidden = !r;
    if (r) Object.assign(ring.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };
  img.addEventListener('load', paint);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => showRing(draft || verdictOf(p)?.mark)).observe(pic);

  // drag a box on the picture; the ellipse fills it
  let draft = null, start = null;
  const toImg = e => {
    const b = pic.getBoundingClientRect(), nw = img.naturalWidth, nh = img.naturalHeight;
    const s = Math.min(b.width / nw, b.height / nh), w = nw * s, ht = nh * s;
    const cl = v => Math.min(1, Math.max(0, v));
    return { x: cl((e.clientX - b.left - (b.width - w) / 2) / w), y: cl((e.clientY - b.top - (b.height - ht) / 2) / ht) };
  };
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const box = (a, b) => ({ cx: r4((a.x + b.x) / 2), cy: r4((a.y + b.y) / 2), rx: r4(Math.abs(b.x - a.x) / 2), ry: r4(Math.abs(b.y - a.y) / 2) });
  pic.addEventListener('click', e => { if (el.classList.contains('drawing')) e.preventDefault(); });
  pic.addEventListener('pointerdown', e => {
    if (!el.classList.contains('drawing') || !img.naturalWidth) return;
    e.preventDefault();
    pic.setPointerCapture(e.pointerId);
    start = toImg(e);
  });
  pic.addEventListener('pointermove', e => {
    if (!start) return;
    draft = box(start, toImg(e));
    showRing(draft);
  });
  const finish = e => {
    if (!start) return;
    const m = box(start, toImg(e));
    start = null; draft = null;
    if (m.rx < 0.01 || m.ry < 0.01) { paint(); return; }
    const v = verdictOf(p);
    setVerdict(p, v?.verdict || 'ok', v?.reason || '', v?.note || '', m).then(paint);
    paint();
  };
  pic.addEventListener('pointerup', finish);
  pic.addEventListener('pointercancel', () => { start = null; draft = null; paint(); });
  circle.addEventListener('click', () => {
    const on = el.classList.toggle('drawing');
    circle.textContent = on ? 'Done' : '◯ Circle target';
    circle.classList.toggle('on', on);
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
  unring.addEventListener('click', () => { const v = verdictOf(p); if (v) setVerdict(p, v.verdict, v.reason, v.note, null).then(paint); paint(); });
  yes.addEventListener('click', () => { setVerdict(p, verdictOf(p)?.verdict === 'ok' ? '' : 'ok').then(paint); paint(); });
  no.addEventListener('click', () => {
    const v = verdictOf(p);
    if (view.compact && v?.verdict === 'bad' && !el.dataset.open) { el.dataset.open = '1'; paint(); return; }
    if (v?.verdict !== 'bad') el.dataset.open = '1';
    setVerdict(p, v?.verdict === 'bad' ? '' : 'bad', v?.reason || (pic.classList.contains('broken') ? 'broken' : 'poor'), v?.note || '').then(paint);
    paint();
  });
  for (const [r, label] of REASONS) {
    why.append(h('button', { type: 'button', dataset: { r }, onclick: () => { setVerdict(p, 'bad', r, note.value).then(paint); paint(); } }, label));
  }
  note.addEventListener('change', () => { const v = verdictOf(p); setVerdict(p, 'bad', v?.reason || 'poor', note.value).then(paint); paint(); });
  why.append(note);
  el.append(pic, h('div.rv-meta', {}, h('b', {}, p.name || '(no name)'), h('small', {}, p.caption ? `${p.packTitle} · ${p.caption}` : p.packTitle)),
    h('div.rv-acts', {}, yes, no), h('div.rv-acts.rv-circ', {}, circle, unring), why);
  paint();
  return el;
}

const grid = h('div.rv-grid');
const more = h('div.rv-more');
// "Mark the rest OK": every listed picture (this pack, this filter, the pages shown) that has no verdict yet.
// Two taps (no modal), saved in batches with a progress count; failed batches are listed and can be retried.
const BATCH = 50;
let refreshRest = null;
function restOk(page) {
  const todo = () => page.filter(p => !verdictOf(p));
  const btn = h('button.btn.go.rv-rest', { type: 'button' });
  let armed = 0, timer = null;
  refreshRest = () => {
    if (btn.disabled) return;
    const n = todo().length;
    btn.hidden = !n;
    btn.textContent = armed ? `Tap again to mark ${n} as OK` : `✓ Mark the rest OK (${n})`;
  };
  btn.addEventListener('click', async () => {
    if (!armed) {
      armed = 1; refreshRest();
      timer = setTimeout(() => { armed = 0; refreshRest(); }, 4000);
      return;
    }
    clearTimeout(timer);
    btn.disabled = true;
    await markOk(todo(), btn);
  });
  refreshRest();
  return btn;
}

async function markOk(list, btn) {
  const failed = [];
  let done = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    const part = list.slice(i, i + BATCH);
    btn.textContent = `Saving… ${done} of ${list.length}`;
    try {
      await call('POST', '/admin/imgreview', { items: part.map(p => ({ ref: p.ref, src: p.src, verdict: 'ok' })) });
      part.forEach(p => reviews.set(p.ref, { ref: p.ref, src: p.src, verdict: 'ok' }));
      done += part.length;
    } catch (e) { failed.push({ part, err: e.message }); }
  }
  summary(); render();
  // the "to review" list has refilled with the next page: start it from the top
  if (done) window.scrollTo({ top: 0, behavior: 'smooth' });
  const box = more.querySelector('.rv-fails');
  if (!failed.length || !box) { if (done) toast(`Marked ${done} OK`); return; }
  const n = failed.reduce((s, f) => s + f.part.length, 0);
  const retry = h('button.btn', { type: 'button' }, `Retry ${n}`);
  retry.addEventListener('click', () => { retry.disabled = true; markOk(failed.flatMap(f => f.part.filter(p => !verdictOf(p))), retry); });
  box.replaceChildren(h('p.rv-err', {}, `${done} saved, ${n} not saved (${failed[0].err}): `,
    ...failed.flatMap(f => f.part).slice(0, 12).map(p => h('span', {}, `${p.name || p.ref}; `)), n > 12 ? `and ${n - 12} more. ` : ''), retry);
}

function render() {
  const list = filtered();
  const page = list.slice(0, view.shown);
  grid.classList.toggle('compact', view.compact);
  grid.replaceChildren(...page.map(card));
  if (!list.length) grid.append(h('p.muted', {}, view.show === 'todo' ? 'Nothing left to review here.' : 'No pictures match.'));
  more.replaceChildren(restOk(page), h('div.rv-fails'));
  const next = h('button.btn', { type: 'button', onclick: () => { view.shown += PAGE; render(); } }, `Show more (${list.length - page.length} left)`);
  next.hidden = list.length <= page.length;
  more.append(next);
}

function controls() {
  const counts = new Map();
  for (const p of pics) counts.set(p.pack, (counts.get(p.pack) || 0) + 1);
  const titles = new Map(pics.map(p => [p.pack, p.packTitle]));
  const cand = [...counts].filter(([id]) => id.endsWith(':new'));
  const sel = h('select', { id: 'rv-pack', 'aria-label': 'Pack' },
    ...cand.map(([id, n]) => h('option', { value: id }, `${titles.get(id)} (${n})`)),
    h('option', { value: 'all' }, `All packs (${pics.length})`),
    h('option', { value: 'ai' }, `AI pictures only (${pics.filter(p => p.ai).length})`),
    ...[...counts].filter(([id]) => !id.endsWith(':new')).map(([id, n]) => h('option', { value: id }, `${titles.get(id)} (${n})`)));
  sel.value = view.pack;
  sel.addEventListener('change', () => { view.pack = sel.value; view.shown = PAGE; summary(); render(); });
  const seg = h('div.rv-seg', { role: 'group', 'aria-label': 'Show' });
  for (const [k, label] of [['todo', 'To review'], ['bad', 'Bad'], ['ok', 'OK'], ['marked', 'Circled'], ['all', 'All']]) {
    const b = h('button', { type: 'button', class: view.show === k ? 'on' : '' }, label);
    b.addEventListener('click', () => { view.show = k; view.shown = PAGE; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); render(); });
    seg.append(b);
  }
  const lay = h('button.rv-lay', { type: 'button', id: 'rv-lay' });
  const label = () => { lay.textContent = view.compact ? '▭ 1 per row' : '▦ 2 per row'; lay.setAttribute('aria-pressed', String(view.compact)); };
  lay.addEventListener('click', () => {
    view.compact = !view.compact;
    try { localStorage.setItem('clued.review.compact', view.compact ? '1' : '0'); } catch {}
    label(); render();
  });
  label();
  return h('div.rv-bar', {}, sel, seg, lay);
}

async function start() {
  let got;
  try { got = await call('GET', '/admin/imgreview'); } catch (e) {
    if (e.status === 401) signInPanel('Sign in with your admin Google account.');
    else if (e.status === 403) signInPanel(`${auth?.user?.email || 'This account'} is not a Clued admin.`);
    else gate.replaceChildren(h('p', {}, `Couldn’t load: ${e.message}`));
    return;
  }
  for (const r of got.reviews || []) reviews.set(r.ref, r);
  gate.replaceChildren(h('p.muted', {}, 'Loading the packs…'));
  if (!pics.length) await loadPics();
  carryCandidates();
  // open on the first candidate set that still has pictures to review
  const firstNew = [...new Set(pics.filter(p => p.cand && !verdictOf(p)).map(p => p.pack))][0];
  if (firstNew) view.pack = firstNew;
  gate.remove();
  root.append(sumEl, controls(), grid, more);
  summary(); render();
}

(async () => {
  try {
    const m = await import('/lib/auth/auth.js');
    auth = { ...m.auth, signInGoogle: m.signInGoogle, getIdToken: () => m.auth.getIdToken(), get user() { return m.auth.user; } };
    await Promise.race([m.auth.ready(), new Promise(r => setTimeout(r, 5000))]);
  } catch (e) {
    gate.replaceChildren(h('p', {}, 'The br8t account layer didn’t load, so admin sign-in isn’t available here.'));
    return;
  }
  await start();
})();
