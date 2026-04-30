/* HTMLAudioElement-based player. Plays the cached MP3 out of IndexedDB. */
import * as store from './storage.js';
import * as sync from './sync.js';

export const state = {
  book: null,
  audio: null,
  url: null,
  playing: false,
  duration: 0,
  position: 0,
  speed: 1.0,
  onUpdate: null,
};

function notify() { state.onUpdate?.(); }

function teardown() {
  if (state.audio) {
    state.audio.pause();
    state.audio.src = '';
  }
  if (state.url) URL.revokeObjectURL(state.url);
  state.audio = null;
  state.url = null;
  state.playing = false;
  state.duration = 0;
  state.position = 0;
}

export async function loadBook(jobId, { onUpdate, hasSegments } = {}) {
  teardown();
  const meta = (await store.getBookMeta(jobId)) || { jobId, title: '', author: '', speed: 1.0 };
  const file = await store.readAudioFile(jobId);
  state.book = { ...meta, jobId, has_segments: !!hasSegments };
  state.url = URL.createObjectURL(file);
  state.onUpdate = onUpdate;
  state.speed = meta.speed || 1.0;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = state.url;
  audio.playbackRate = state.speed;
  audio.addEventListener('loadedmetadata', () => {
    state.duration = isFinite(audio.duration) ? audio.duration : 0;
    if (state.duration && !meta.duration) {
      store.updateBookMeta(jobId, { duration: state.duration });
    }
    if (meta.position && meta.position < state.duration - 1) {
      audio.currentTime = meta.position;
    }
    notify();
  });
  audio.addEventListener('timeupdate', () => {
    state.position = audio.currentTime;
    notify();
    sync.tick(audio.currentTime);
    updatePositionStateThrottled();
    savePositionThrottled();
  });
  audio.addEventListener('seeked', () => { state.position = audio.currentTime; updatePositionState(); notify(); });
  audio.addEventListener('ratechange', () => { state.speed = audio.playbackRate; updatePositionState(); });
  audio.addEventListener('play', () => { state.playing = true; updateMediaSession(); notify(); });
  audio.addEventListener('pause', () => { state.playing = false; updateMediaSession(); notify(); savePosition(); });
  audio.addEventListener('ended', () => {
    state.playing = false;
    state.position = state.duration;
    savePosition();
    notify();
  });
  state.audio = audio;

  await store.updateBookMeta(jobId, { lastPlayed: Date.now() });
  // Kick off segment fetch in parallel — sync.loadFor handles cache + miss.
  sync.loadFor(jobId, hasSegments).catch(() => {});
  updateMediaSession();
  notify();
}

export async function play() {
  if (!state.audio) return;
  try { await state.audio.play(); } catch (e) { console.warn('play failed', e); }
}

export function pause() {
  state.audio?.pause();
}

export function togglePlay() {
  state.playing ? pause() : play();
}

export function seekTo(seconds) {
  if (!state.audio) return;
  const t = Math.max(0, Math.min(state.duration || 0, seconds));
  state.audio.currentTime = t;
  state.position = t;
  notify();
}

export function skip(seconds) {
  if (!state.audio) return;
  seekTo((state.audio.currentTime || 0) + seconds);
}

export function setSpeed(v) {
  state.speed = Math.max(0.5, Math.min(3.0, v));
  if (state.audio) state.audio.playbackRate = state.speed;
  if (state.book) {
    state.book.speed = state.speed;
    store.updateBookMeta(state.book.jobId, { speed: state.speed });
  }
  notify();
}

export function unload() {
  savePosition();
  teardown();
  state.book = null;
  state.onUpdate = null;
  sync.loadFor(null);
}

let saveTimer = null;
function savePositionThrottled() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; savePosition(); }, 2000);
}
async function savePosition() {
  if (!state.book) return;
  await store.updateBookMeta(state.book.jobId, { position: state.position });
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !state.book) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: state.book.title || 'Audiobook',
    artist: state.book.author || 'Reader',
    album: state.book.title || '',
    artwork: [
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  });
  navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  // Bind each handler in its own try so an unsupported action (some cars
  // reject 'seekto' or 'previoustrack') doesn't drop the others.
  const setH = (name, fn) => {
    try { navigator.mediaSession.setActionHandler(name, fn); } catch (_) {}
  };
  setH('play', () => play());
  setH('pause', () => pause());
  setH('stop', () => pause());
  setH('seekbackward', (e) => skip(-(e?.seekOffset || 30)));
  setH('seekforward', (e) => skip(e?.seekOffset || 30));
  // Most car/BT remotes send previoustrack / nexttrack for the |◁ ▷| keys.
  setH('previoustrack', () => skip(-30));
  setH('nexttrack', () => skip(30));
  setH('seekto', (e) => { if (typeof e?.seekTime === 'number') seekTo(e.seekTime); });
  updatePositionState();
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!state.audio) return;
  const dur = state.duration || state.audio.duration;
  if (!isFinite(dur) || dur <= 0) return;
  const pos = Math.max(0, Math.min(dur, state.position || state.audio.currentTime || 0));
  try {
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: state.audio.playbackRate || state.speed || 1,
      position: pos,
    });
  } catch (_) {}
}

let posStateTimer = null;
function updatePositionStateThrottled() {
  if (posStateTimer) return;
  posStateTimer = setTimeout(() => { posStateTimer = null; updatePositionState(); }, 1000);
}
