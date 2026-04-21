import * as tts from './tts.js';
import * as store from './storage.js';
import { splitSentences } from './books.js';

export const state = {
  book: null,
  chapterIdx: 0,
  sentenceIdx: 0,
  sentences: [],
  voice: 'af_heart',
  speed: 1.0,
  playing: false,
  ctx: null,
  currentSource: null,
  gen: 0,
  onUpdate: null,
  lastError: null,
};

export function clearError() {
  if (state.lastError) { state.lastError = null; notify(); }
}

function ctx() {
  if (!state.ctx || state.ctx.state === 'closed') {
    state.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  }
  if (state.ctx.state === 'suspended') state.ctx.resume();
  return state.ctx;
}

function notify() { if (state.onUpdate) state.onUpdate(); }

function loadChapter(idx) {
  const ch = state.book.chapters[idx];
  state.chapterIdx = idx;
  state.sentences = ch ? splitSentences(ch.text) : [];
  state.sentenceIdx = 0;
}

export async function loadBook(bookId, { onUpdate } = {}) {
  const book = await store.getBook(bookId);
  state.book = book;
  state.lastError = null;
  state.voice = book.voice || await store.getPref('lastVoice', 'af_heart');
  state.chapterIdx = book.position?.chapter || 0;
  state.sentenceIdx = 0;
  const ch = book.chapters[state.chapterIdx];
  state.sentences = ch ? splitSentences(ch.text) : [];
  state.sentenceIdx = Math.min(book.position?.sentence || 0, Math.max(0, state.sentences.length - 1));
  state.onUpdate = onUpdate;
  book.lastOpened = Date.now();
  await store.putBook(book);
  updateMediaSession();
  notify();
}

async function savePos() {
  if (!state.book) return;
  state.book.position = { chapter: state.chapterIdx, sentence: state.sentenceIdx };
  state.book.voice = state.voice;
  await store.putBook(state.book);
  await store.setPref('lastVoice', state.voice);
}

function audioBufferFrom(raw) {
  const buf = ctx().createBuffer(1, raw.audio.length, raw.sampling_rate);
  buf.getChannelData(0).set(raw.audio);
  return buf;
}

async function generateSentenceBuffer(text) {
  const raw = await tts.generate(text, state.voice, state.speed);
  return audioBufferFrom(raw);
}

function scheduleBuffer(buffer) {
  const src = ctx().createBufferSource();
  src.buffer = buffer;
  src.connect(ctx().destination);
  src.start();
  state.currentSource = src;
  return src;
}

async function playLoop() {
  const myGen = ++state.gen;
  let pre = null;
  while (state.gen === myGen && state.playing && state.chapterIdx < state.book.chapters.length) {
    if (state.sentenceIdx >= state.sentences.length) {
      if (state.chapterIdx + 1 >= state.book.chapters.length) break;
      state.chapterIdx += 1;
      loadChapter(state.chapterIdx);
      pre = null;
      notify();
      updateMediaSession();
      continue;
    }
    const sentenceText = state.sentences[state.sentenceIdx];
    let buffer;
    try {
      buffer = pre ?? await generateSentenceBuffer(sentenceText);
    } catch (err) {
      console.error('TTS generation failed:', err);
      state.lastError = 'Narration failed: ' + (err?.message || String(err));
      state.playing = false;
      notify();
      return;
    }
    if (state.gen !== myGen || !state.playing) return;
    pre = null;
    notify();
    const src = scheduleBuffer(buffer);
    const nextIdx = state.sentenceIdx + 1;
    const nextGen = nextIdx < state.sentences.length
      ? generateSentenceBuffer(state.sentences[nextIdx]).catch(() => null)
      : Promise.resolve(null);
    await new Promise((resolve) => { src.onended = resolve; });
    if (state.gen !== myGen || !state.playing) return;
    state.sentenceIdx = nextIdx;
    savePos();
    pre = await nextGen;
  }
  state.playing = false;
  notify();
}

export function play() {
  if (!state.book || state.playing) return;
  state.lastError = null;
  state.playing = true;
  ctx();
  updateMediaSession();
  notify();
  playLoop();
}

export function pause() {
  state.playing = false;
  try { state.currentSource?.stop(); } catch (_) {}
  state.gen += 1;
  updateMediaSession();
  notify();
}

export function togglePlay() {
  state.playing ? pause() : play();
}

function reset() {
  const wasPlaying = state.playing;
  state.playing = false;
  try { state.currentSource?.stop(); } catch (_) {}
  state.gen += 1;
  if (wasPlaying) setTimeout(() => play(), 50);
}

export function setSpeed(v) {
  state.speed = Math.max(0.5, Math.min(2.0, v));
  reset();
  notify();
}

export function setVoice(id) {
  state.voice = id;
  if (state.book) { state.book.voice = id; store.putBook(state.book); }
  store.setPref('lastVoice', id);
  reset();
  notify();
}

export function seekChapter(idx) {
  if (idx < 0 || idx >= state.book.chapters.length) return;
  const wasPlaying = state.playing;
  state.playing = false;
  try { state.currentSource?.stop(); } catch (_) {}
  state.gen += 1;
  loadChapter(idx);
  savePos();
  updateMediaSession();
  notify();
  if (wasPlaying) setTimeout(() => play(), 50);
}

export function nextChapter() { seekChapter(state.chapterIdx + 1); }
export function prevChapter() { seekChapter(state.chapterIdx - 1); }

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !state.book) return;
  const chapterTitle = state.book.chapters[state.chapterIdx]?.title || '';
  navigator.mediaSession.metadata = new MediaMetadata({
    title: chapterTitle,
    artist: state.book.author || state.book.title,
    album: state.book.title,
    artwork: [
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  });
  navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  const h = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
  try {
    h('play', () => play());
    h('pause', () => pause());
    h('previoustrack', () => prevChapter());
    h('nexttrack', () => nextChapter());
    h('seekbackward', () => { state.sentenceIdx = Math.max(0, state.sentenceIdx - 1); reset(); notify(); });
    h('seekforward', () => { state.sentenceIdx = Math.min(state.sentences.length, state.sentenceIdx + 1); reset(); notify(); });
  } catch (_) {}
}

// Preview-only — not tied to book state.
export async function previewVoice(voiceId, text) {
  const raw = await tts.generate(text, voiceId, 1.0);
  const buf = audioBufferFrom(raw);
  const src = ctx().createBufferSource();
  src.buffer = buf;
  src.connect(ctx().destination);
  src.start();
  return new Promise((resolve) => { src.onended = resolve; });
}
