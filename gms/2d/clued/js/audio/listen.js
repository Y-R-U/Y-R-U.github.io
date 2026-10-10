// `listen` format: hear a short clip, then name the song / artist / decade / composer / film / anthem / animal.
// Also "finish the line" for public-domain songs (items with `lyrics`).
import {
  register, poolItems, distractors, byDifficulty, placeAnswer, collect, pick, shuffle, hasAudio, imageOf, hasImg, pickPack,
} from '../formats/registry.js?v=202610100510';
import { h, choiceGrid, esc } from '../ui/kit.js?v=202610100510';
import { basePoints } from '../core/scoring.js?v=202610100510';
import * as clip from './clip.js?v=202610100510';
import { revealHTML, BADGE_CSS, art as artUrl, previewUrl } from './apple.js?v=202610100510';
import { getCtx, unlock, begin, end, ctxInfo } from './ctx.js?v=202610100510';
import { LISTEN_CSS } from './listen_css.js?v=202610100510';
import { dlog, modLoaded, buildsSeen } from '../core/debuglog.js?v=202610100510';
const MOD_ID = modLoaded('listen', import.meta.url);

let renderSeq = 0;

const CLIPS = [1, 2, 3, 5, 10, 15, 30];
const CLIP_MUL = { 1: 2, 2: 1.7, 3: 1.5, 5: 1.25, 10: 1, 15: 0.85, 30: 0.7 };
const ART_MUL = { off: 1, blur: 0.85, on: 0.65 };
const REPLAYS = 2, REPLAY_MUL = 0.85;
export const STAGE_LENS = [1, 2, 4, 8, 15];

const isSong = (it) => it.facts?.artist != null && it.facts?.year != null;
const isTheme = (it) => it.facts?.track != null;
const audioOf = (it, rng) => {
  const list = (it.media?.audio || []).filter((a) => a.src);
  return list.length ? pick(rng, list) : null;
};

// which questions an item can produce, weighted
function asks(item, pack, want) {
  const out = [];
  const MAP = { title: ['title', 'name', 'film'], artist: ['artist', 'artist-name'], decade: ['decade'], composer: ['composer'] };
  const add = (k, w) => { if (want === 'auto' || MAP[want]?.includes(k)) out.push([k, w]); };
  if (isSong(item)) { add('title', 6); add('artist', 3); add('decade', 1.5); }
  else if (isTheme(item)) { add('film', 6); if (item.facts.composer) add('composer', 1); }
  else if (item.facts?.composer) { add('title', 5); add('composer', 3); }
  else if (pack.factsMeta?.origin && item.facts?.origin && item.media.audio[0]?.apple) add('artist-name', 5);
  else add('name', 5);
  if (item.lyrics?.length > 1 && item.media.audio.some((a) => clip.isPiano(a)) && (want === 'auto' || want === 'lyrics')) out.push(['lyrics', want === 'lyrics' ? 5 : 1.2]);
  return out;
}

const PROMPTS = {
  title: (it, p) => (isSong(it) ? 'Name this song' : p.id === 'nursery-rhymes' ? 'Which song is this?' : 'Name this piece'),
  artist: () => 'Who is the artist?',
  'artist-name': () => 'Who is the artist?',
  decade: () => 'Which decade is this song from?',
  composer: (it) => (isTheme(it) ? 'Who wrote this theme?' : 'Who composed this?'),
  film: (it) => (it.facts.type === 'tv' ? 'Which TV show is this theme from?' : 'Which film is this music from?'),
  name: (it, p) => p.listenPrompt || (p.id === 'birds' ? 'Which bird is this?' : p.theme === 'animals' ? 'Which animal makes this sound?' : null) || (it.media.audio.some((a) => clip.isPiano(a)) ? 'Which song is this?' : 'What is this sound?'),
};

function makeOptions(rng, t, pool, kind, n, kids = false) {
  const key = {
    title: (it) => it.name, film: (it) => it.name, name: (it) => it.name, 'artist-name': (it) => it.name,
    artist: (it) => it.facts.artist, composer: (it) => it.facts.composer, decade: (it) => it.facts.decade,
  }[kind];
  if (kind === 'decade') {
    const d = +String(t.item.facts.decade).slice(0, 4);
    const all = shuffle(rng, [-30, -20, -10, 10, 20, 30].map((x) => d + x).filter((x) => x >= 1950 && x <= 2020)).slice(0, n - 1).map((x) => `${x}s`);
    if (all.length < n - 1) return null;
    return placeAnswer(rng, t.item.facts.decade, all);
  }
  const film = kind === 'film';
  const sub = film ? pool.filter((c) => (c.item.facts.type || 'film') === (t.item.facts.type || 'film')) : pool;
  let wrong;
  if (kids) {
    // kids get clearly different answers, never lookalikes
    const look = new Set(t.item.lookalikes || []), seen = new Set([key(t.item)]);
    wrong = shuffle(rng, pool).filter((c) => c.item !== t.item && !look.has(c.item.id) && !seen.has(key(c.item)) && seen.add(key(c.item))).slice(0, n - 1);
    if (wrong.length < n - 1) wrong = null;
  } else wrong = distractors(rng, t, sub.length > n * 2 ? sub : pool, n - 1, { keyFn: (it) => key(it), reject: (it) => key(it) === key(t.item) });
  if (!wrong) return null;
  const { options, answer } = placeAnswer(rng, t, wrong);
  return { options: options.map((c) => key(c.item)), answer, items: options };
}

function lyricQuestion(rng, t, pool, n) {
  const ly = t.item.lyrics;
  const ok = ly.slice(0, -1).map((l, k) => k).filter((k) => ly.indexOf(ly[k]) === ly.lastIndexOf(ly[k]) && ly[k + 1] !== ly[k]);
  if (!ok.length) return null;
  const i = ok[Math.floor(rng() * ok.length)];
  const right = ly[i + 1];
  const others = shuffle(rng, pool.filter((c) => c.item !== t.item && c.item.lyrics?.length).flatMap((c) => c.item.lyrics))
    .filter((l) => l !== right && l !== ly[i]);
  const wrong = [...new Set(others)].slice(0, n - 1);
  if (wrong.length < n - 1) return null;
  const { options, answer } = placeAnswer(rng, right, wrong);
  return { prompt: `Finish the line: “${ly[i]} …”`, options, answer, answerText: right };
}

function clipLen(opts, difficulty, kids) {
  let len = CLIPS.includes(+opts.clip) ? +opts.clip : 5;
  if (kids) len = Math.max(len, 5);
  else if (difficulty === 1 && len < 5) len *= 2;
  return len;
}

function generate({ rng, packs, count, opts = {}, difficulty = 0, kids = false, avoid }) {
  // "Grow the clip" was removed (Aaron 2026-10-08: slow and confusing; replay is how you hear more). Old favourites
  // and rooms may still carry opts.grow: it is ignored, every clip plays exactly the chosen length.
  const want = opts.ask || 'auto';
  const n = kids ? Math.min(3, +opts.answers || 3) : (+opts.answers || 4);
  const art = kids ? 'blur' : (ART_MUL[opts.art] ? opts.art : 'off');   // kids: covers often print the title, so they sharpen as the clip plays
  const usable = packs.filter((p) => (p.items || []).filter(hasAudio).length >= n);
  // hand-written mc questions that carry a sound ("Listen! Which animal makes this sound?")
  const qPool = packs.flatMap((p) => (p.questions || []).filter((q) => (q.kind || 'mc') === 'mc' && q.media?.audio?.some((a) => a.src) && (q.wrong || []).length >= 2).map((q) => ({ p, q })));
  if (!usable.length && !qPool.length) return [];
  const itemN = usable.reduce((s, p) => s + (p.items || []).filter(hasAudio).length, 0);
  return collect(count, () => {
    if (qPool.length && (!usable.length || rng() < qPool.length / (qPool.length + itemN))) return fromQuestion(rng, pick(rng, qPool), n, opts, difficulty, kids);
    const p = pickPack(rng, usable);
    const pool = poolItems([p], (it) => hasAudio(it) && (!kids || p.kids || (it.difficulty || 2) === 1));
    if (pool.length < n) return null;
    const t = pick(rng, byDifficulty(pool, difficulty, n, (c) => c.item.difficulty || 2));
    const kinds = asks(t.item, p, want);
    if (!kinds.length) return null;
    const total = kinds.reduce((s, k) => s + k[1], 0);
    let r = rng() * total, kind = kinds[0][0];
    for (const [k, w] of kinds) { r -= w; if (r < 0) { kind = k; break; } }
    const a0 = audioOf(t.item, rng);
    if (!a0) return null;
    const a = { ...a0 };
    if (clip.isPiano(a)) a.lazy = true;
    let len = clipLen(opts, difficulty, kids);
    if (a.dur && a.dur < len && !a.apple) len = a.dur;
    const start = clip.isPiano(a) ? 0 : clip.pickStart(a, len, rng(), a.dur || 30);
    const f = t.item.facts || {};
    const songTitle = a.title || (isTheme(t.item) ? f.track : f.anthem ? `${t.item.name}: ${f.anthem}` : t.item.name);
    const by = f.artist || (isTheme(t.item) ? f.composer : f.composer) || (a.apple ? t.item.name : '');
    const meta = { title: songTitle, artist: by || (a.credit && !a.apple ? `Recording: ${a.credit}` : ''), year: f.year || '' };
    const base = {
      format: 'listen', refs: [t.ref], explain: t.item.blurb, pack: p.id,
      media: { audio: [a] },
      timeLimit: Math.round((len + (kind === 'lyrics' ? 20 : 15)) * 1000),
      data: { a, start, len, art: a.apple ? art : 'off', kind, replays: kids ? -1 : REPLAYS, meta, kids: !!kids },
    };
    if (a.apple?.art) base.data.artImg = { src: artUrl(a.apple.art, 300), credit: 'Artwork: Apple Music', license: 'Apple Music artwork', page: a.apple.url, kind: 'img' };
    if (kind === 'lyrics') {
      const lq = lyricQuestion(rng, t, pool, n);
      if (!lq) return null;
      return { ...base, id: `listen:lyrics:${t.ref}:${lq.answer}`, prompt: lq.prompt, options: lq.options.map((text) => ({ text })), answer: lq.answer, answerText: lq.answerText };
    }
    const o = makeOptions(rng, t, pool, kind, n, kids);
    if (!o) return null;
    const pics = (kids || kind === 'name') && o.items && o.items.every((c) => hasImg(c.item));
    return {
      ...base, id: `listen:${kind}:${t.ref}`, prompt: PROMPTS[kind](t.item, p),
      options: o.options.map((text, i) => (pics ? { text, img: imageOf(o.items[i].item, rng) } : { text: String(text) })),
      answer: o.answer, answerText: String(o.options[o.answer]),
      data: { ...base.data, layout: pics ? 'images' : 'text' },
    };
  }, avoid);
}

function fromQuestion(rng, { p, q }, n, opts, difficulty, kids) {
  const a = { ...q.media.audio.find((x) => x.src) };
  let len = clipLen(opts, difficulty, kids);
  if (a.dur && a.dur < len) len = a.dur;
  const { options, answer } = placeAnswer(rng, String(q.answer), shuffle(rng, q.wrong.map(String)).slice(0, n - 1));
  return {
    format: 'listen', id: `listen:${p.id}/q:${q.id}`, prompt: q.prompt, refs: [`${p.id}/q:${q.id}`], explain: q.explain, pack: p.id,
    media: { audio: [a] }, timeLimit: Math.round((len + 15) * 1000),
    options: options.map((text) => ({ text })), answer, answerText: String(q.answer),
    data: { a, start: a.start || 0, len, art: 'off', kind: 'name', replays: kids ? -1 : REPLAYS, meta: { title: String(q.answer), artist: '', year: '' }, kids: !!kids, layout: 'text' },
  };
}

let cssDone = false;
function css() {
  if (cssDone || !globalThis.document) return;
  cssDone = true;
  document.head.append(h('style', { id: 'au-listen-css' }, BADGE_CSS + LISTEN_CSS));
}

function render(el, q, api) {
  css();
  const d = q.data;
  const rn = ++renderSeq, qid = String(q.id || '').replace(/^listen:/, '').slice(-64);
  const L = (msg, data, lvl) => dlog('listen', msg, { r: rn, q: qid, ...ctxInfo(), ...data }, lvl);
  L('render', { lm: MOD_ID, len: d.len, start: d.start, kind: d.kind, art: d.art, stages: q.stages || 0, mode: api.mode, track: d.a?.apple?.trackId, src: String(d.a?.src || '').slice(-50), piano: clip.isPiano(d.a), vis: globalThis.document?.visibilityState });
  L('builds', buildsSeen());
  const busyTag = 'listen:' + q.id;
  begin(busyTag);
  const lyrics = d.kind === 'lyrics';
  let replaysLeft = d.replays, played = 0, handle = null, raf = 0, done = false, dead = false;
  const staged = q.stages > 1 && d.stageLens;
  let stage = staged ? Math.min(q.stages - 1, api.stage || 0) : 0;
  const playLen = () => (staged ? d.stageLens[stage] : d.len);
  el.innerHTML = '';
  const wrap = h('div.q.has-media.au-listen', { class: d.layout === 'images' ? 'au-pics' : '' });
  const disc = h('div.au-disc', { class: `art-${d.art}` });
  if (d.artImg && d.art !== 'off') disc.append(h('img.au-cover', { src: d.artImg.src, alt: '', draggable: 'false' }));
  const canvas = h('canvas.au-viz', { width: 300, height: 300, 'aria-hidden': 'true' });
  const ring = h('div.au-ring');
  const play = h('button.au-play', { type: 'button', 'aria-label': 'Play clip' }, h('span.au-ico', { html: '▶' }));
  const status = h('div.au-status', {}, lyrics ? 'Tap to hear the song' : 'Loading…');
  const again = h('button.btn.au-again', { type: 'button', hidden: true }, '↻ Replay');
  disc.append(canvas, ring, play);
  // shared vote button is the runner's; until it draws one (api.moreButton), offer our own
  const more = staged && !api.moreButton ? h('button.btn.au-more', { type: 'button' }, 'Longer clip 👀') : null;
  const mediaCol = h('figure.q-media.au-media', {}, disc, h('div.au-under', {}, status, again, more));
  const body = h('div.q-body');
  const answersEl = h('div.q-answers', { class: d.layout === 'images' ? 'compact' : '' });
  body.append(h('h2.q-prompt', {}, q.prompt), answersEl);
  wrap.append(mediaCol, body);
  el.append(wrap);

  const grid = choiceGrid(answersEl, q.options, {
    images: d.layout === 'images',
    onPick(i) {
      if (done) return;
      done = true;
      grid.lock(); grid.mark(q.answer, i);
      finish(i === q.answer, i);
    },
  });

  const ctx2d = canvas.getContext('2d');
  function draw() {
    if (dead) return;
    if (!wrap.isConnected) { L('detached'); ctrlObj.destroy('detached'); return; }  // the runner replaced the stage without calling destroy
    raf = requestAnimationFrame(draw);
    const W = canvas.width, H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);
    const an = handle?.analyser;
    const prog = handle ? Math.min(1, handle.elapsed() / (playLen() || handle.length || 1)) : 0;
    ring.style.setProperty('--p', prog);
    const sharp = staged ? stage / (q.stages - 1) : prog;
    if (d.art === 'blur' && disc.firstChild?.tagName === 'IMG' && !done) disc.firstChild.style.filter = `blur(${Math.round(22 * (1 - sharp))}px)`;
    if (!an) return;
    const bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bins);
    const N = 48, cx = W / 2, cy = H / 2, r0 = W * 0.3;
    ctx2d.lineCap = 'round';
    for (let k = 0; k < N; k++) {
      const v = bins[Math.floor((k / N) * bins.length * 0.7)] / 255;
      const ang = (k / N) * Math.PI * 2 - Math.PI / 2;
      const len = 6 + v * W * 0.17;
      ctx2d.strokeStyle = `hsla(${(k / N) * 300 + 180}, 85%, 62%, ${0.45 + v * 0.55})`;
      ctx2d.lineWidth = 5;
      ctx2d.beginPath();
      ctx2d.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx2d.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
      ctx2d.stroke();
    }
  }

  const setStatus = (t) => { if (status.textContent !== t) L('status', { text: t }); status.textContent = t; };
  const showPlay = (why) => { L('playButton', { why }); play.hidden = false; };
  function updateAgain() {
    again.hidden = played === 0 || done || replaysLeft === 0;
    again.textContent = replaysLeft < 0 ? '↻ Play again' : `↻ Replay (${replaysLeft} left)`;
  }

  let startN = 0;
  async function start(isReplay, why = '') {
    const sn = ++startN;
    L('start', { sn, replay: !!isReplay, why, dead, done, played });
    if (dead) { L('start.exit', { sn, reason: 'dead' }); return; }
    try {
      if (getCtx().state !== 'running') { L('start.unlock', { sn }); await unlock(); }
      if (getCtx().state !== 'running') { L('start.exit', { sn, reason: 'ctx-not-running' }, 'warn'); setStatus('Tap ▶ to listen'); showPlay('ctx-not-running'); return; }
      play.hidden = true;
      disc.classList.add('playing');
      setStatus('Loading…');
      if (dead) { L('start.exit', { sn, reason: 'dead-after-unlock' }); return; }
      handle = await clip.play(d.a, { start: d.start, len: d.len, playLen: playLen(), alive: () => !dead });
      if (dead) { L('start.exit', { sn, reason: 'dead-after-play', clip: handle.id }); handle.stop(undefined, 'listen-dead-after-play'); return; }
      L('start.playing', { sn, clip: handle.id, length: handle.length });
      setStatus(isReplay ? 'Listening again…' : 'Listening…');
      played++;
      if (isReplay && replaysLeft > 0) replaysLeft--;
      const h0 = handle;
      handle.done.then(() => {
        L('clipDone', { sn, clip: h0.id, elapsed: h0.elapsed?.(), dead, done, current: handle === h0 });
        if (dead) return;
        disc.classList.remove('playing');
        if (!done) { setStatus(lyrics ? 'Pick the next line' : 'Pick your answer'); showPlay('replay-after-end'); play.firstChild.innerHTML = '↻'; }
        updateAgain();
      });
      updateAgain();
      again.hidden = true;
    } catch (e) {
      if (e?.superseded || dead) { L('start.exit', { sn, reason: e?.superseded ? 'superseded' : 'dead-in-catch', err: String(e?.message || e) }); return; }
      console.warn('[listen] clip failed', e);
      L('start.fail', { sn, err: String(e?.message || e), name: e?.name }, 'warn');
      setStatus('This clip would not load');
      showPlay('failed');
    }
  }
  play.addEventListener('click', () => {
    L('tap.play', { played, replaysLeft, done, hasHandle: !!handle });
    if (handle && played && !done) { if (replaysLeft === 0) return; start(true, 'tap'); } else start(false, 'tap');
  });
  again.addEventListener('click', () => { L('tap.again', { replaysLeft }); start(true, 'tap-again'); });

  function setStage(n) {
    if (dead || done || n <= stage) return;
    stage = Math.min(q.stages - 1, n);
    if (more) more.hidden = stage >= q.stages - 1;
    setStatus(`${playLen()} s clip`);
    start(false, 'stage');
  }
  if (staged) {
    if (more) {
      more.addEventListener('click', () => {
        if (api.requestMore) api.requestMore();
        else setStage(stage + 1);
      });
      more.hidden = stage >= q.stages - 1;
    }
    api.onStage?.((n) => setStage(n));
  }

  // preload, then autoplay (the runner's tap on "Next" has already unlocked audio)
  const pt0 = performance.now();
  L('prepare');
  clip.load(d.a, { start: d.start, len: d.len }).then((c) => {
    L('prepare.ok', { ms: performance.now() - pt0, dead, bufDur: c?.buffer?.duration ?? c?.duration });
    if (dead) return;
    if (lyrics) { setStatus('Tap ▶ to hear the tune'); return; }
    setStatus('Ready');
    L('autoplay');
    start(false, 'autoplay');
  }, (e) => { L('prepare.fail', { ms: performance.now() - pt0, err: String(e?.message || e) }, 'warn'); setStatus('This clip would not load'); });
  draw();

  function points(correct) {
    if (!correct) return 0;
    const lim = api.timer?.limit, rem = api.timer?.remaining?.() ?? 0;
    const base = basePoints({ timed: !!lim && rem > 0, remaining: rem, limit: lim });
    if (lyrics) return base;
    if (staged) return api.onStage ? undefined : Math.round(base * (1 - 0.6 * stage / (q.stages - 1)));
    const used = Math.max(0, played - 1);
    return Math.round(base * (CLIP_MUL[d.len] ?? 1) * (ART_MUL[d.art] || 1) * Math.pow(REPLAY_MUL, d.replays < 0 ? 0 : used)) || base;
  }

  function revealNode() {
    const m = d.meta;
    const node = h('div.au-rv');
    if (d.a.apple) node.innerHTML = revealHTML(d.a, { title: m.title, artist: m.artist, year: m.year });
    else node.innerHTML = `<div class="au-reveal"><div class="au-meta"><div class="au-title">${esc(m.title)}</div><div class="au-sub">${esc([m.artist, m.year].filter(Boolean).join(' · '))}</div></div></div>`;
    const btn = h('button.btn.au-keep', { type: 'button' }, '▶ Keep listening');
    let sh = null;
    btn.addEventListener('click', async () => {
      if (sh) { sh.stop(); sh = null; btn.textContent = '▶ Keep listening'; return; }
      btn.textContent = '❚❚ Pause';
      try { sh = await clip.stream(d.a, { start: Math.max(0, d.start - (d.a.apple ? 0 : 0)) }); sh.done.then(() => { sh = null; btn.textContent = '▶ Keep listening'; }); } catch { btn.textContent = 'Could not play'; }
    });
    node.querySelector('.au-meta')?.append(btn);
    return node;
  }

  function finish(correct, given) {
    L('answer', { correct, given, played, clip: handle?.id });
    if (handle && !lyrics) handle.stop(0.4, 'listen-answer');
    disc.classList.remove('playing');
    play.hidden = true;
    if (more) more.hidden = true;
    if (d.artImg && !disc.querySelector('img')) disc.prepend(h('img.au-cover', { src: d.artImg.src, alt: '' }));
    disc.classList.add('revealed');
    const img = disc.querySelector('img'); if (img) img.style.filter = '';
    again.hidden = true;
    setStatus('');
    api.reveal(revealNode());
    const pts = points(correct);
    api.answer({ correct, given, ...(pts != null ? { points: pts } : {}), replays: Math.max(0, played - 1), detail: { played, len: playLen(), art: d.art, stage } });
    if (lyrics) start(false, 'lyrics-reveal');
  }

  const ctrlObj = {
    destroy(why = 'runner') { L('destroy', { why, was: dead, clip: handle?.id }); if (!dead) end(busyTag); dead = true; cancelAnimationFrame(raf); if (handle) clip.stopHandle(handle, 0.15, 'listen-destroy'); grid.destroy(); },
    timeout() { L('timeout', { done, clip: handle?.id }); if (done) return; done = true; grid.lock(); grid.mark(q.answer, -1); if (handle) handle.stop(0.3, 'listen-timeout'); },
    eliminate(k = 2) { grid.eliminate(q.answer, k, api.rng || Math.random); },
    choose(x) { grid.pick(x === 'correct' ? q.answer : x === 'wrong' ? (q.answer + 1) % q.options.length : +x); },
    hint() { return d.meta.year ? `It came out in ${d.meta.year}` : d.meta.artist ? `Think of ${d.meta.artist}` : null; },
  };
  return ctrlObj;
}

// optional hook for the shell: refresh stale Apple previews before media preflight
export async function prepare(questions) {
  const list = questions.filter((q) => q.format === 'listen' && q.data?.a?.apple);
  dlog('listen', 'prepareAll', { n: list.length });
  await Promise.all(list.map(async (q) => {
    const url = await previewUrl(q.data.a, true).catch(() => null);
    if (url) { q.data.a.src = url; if (q.media?.audio?.[0]) q.media.audio[0].src = url; }
  }));
  return questions;
}

// optional hook for rooms: fetch + decode the clip during the lead-in (render's clip.load then resolves at once)
export function preload(q) {
  const d = q?.data;
  if (!d?.a) return Promise.resolve();
  const t0 = performance.now(), qid = String(q.id || '').replace(/^listen:/, '').slice(-64);
  dlog('listen', 'preload', { q: qid });
  const p = clip.load(d.a, { start: d.start, len: d.len });
  p.then(() => dlog('listen', 'preload.ok', { q: qid, ms: performance.now() - t0 }), (e) => dlog('listen', 'preload.fail', { q: qid, ms: performance.now() - t0, err: String(e?.message || e) }, 'warn'));
  return p;
}

export default register({
  id: 'listen', title: 'Listen', icon: '🎧', blurb: 'Name it from a short clip',
  tags: ['choice', 'music'],
  kids: true,
  options: [
    { key: 'clip', label: 'Clip length', type: 'choice', values: CLIPS, labels: CLIPS.map((s) => `${s}s`), default: 5, kidsValues: [5, 10, 15], kidsDefault: 10, help: 'Plays exactly this long; replay to hear it again. Shorter clips score more' },
    { key: 'art', label: 'Album artwork', type: 'choice', values: ['off', 'blur', 'on'], labels: ['Off', 'Blurred', 'On'], default: 'off', kidsHide: true, help: 'Off scores most' },
    { key: 'ask', label: 'Ask for', type: 'choice', values: ['auto', 'title', 'artist', 'decade', 'composer', 'lyrics'], labels: ['Mix', 'Title', 'Artist', 'Decade', 'Composer', 'Next line'], default: 'auto', kidsHide: true },
    { key: 'answers', label: 'Answers', type: 'choice', values: [2, 3, 4, 6], default: 4, kidsValues: [2, 3], kidsDefault: 3 },
  ],
  supports(info) {
    const c = info.caps || {};
    return (c.audio || 0) >= 4 ? true : 'Needs sound clips';
  },
  prepare,
  preload,
  generate,
  render,
});
