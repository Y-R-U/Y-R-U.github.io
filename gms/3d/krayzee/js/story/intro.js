// D16 story intro: an in-engine cinematic over the live world (attract traffic keeps flying), narrated captions,
// the player's own plane on a stand for the "and you" beat, tap → Skip. The caller drives update(dt) every frame
// instead of its own camera; update returns false once the intro has finished.
import { INTRO, SHOTS, WORDS_PER_SEC } from '../../data/story/intro.js';
import { STANDS } from '../world/layout.js';
import { ensureStoryCss, el, loadProgress, saveProgress } from './dom.js';

const AUDIO_BASE = new URL('../../audio/story/', import.meta.url).href;
const GAP = 0.5, LEAD = 0.9, TAIL = 2.6, FADE = 0.7;
const RIVAL_LIVERY = { name: 'Rupert', company: 'Pomfrey-Smythe', primary: '#8a5aa8', secondary: '#f2e6c9', accent: '#d4af37', registration: 'K-POMF' };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

let narrationMeta = null;
export async function loadNarration() {
  if (narrationMeta) return narrationMeta;
  try { narrationMeta = (await (await fetch(AUDIO_BASE + 'narration.json')).json()).lines || {}; } catch (e) { narrationMeta = {}; }
  return narrationMeta;
}

export const introSeen = () => !!loadProgress().introSeen;
export function markIntroSeen() { const p = loadProgress(); p.introSeen = true; saveProgress(p); }

/**
 * opts: { camera, scene, traffic?, env? {groundHeightAt}, profile {name,title,company,gender}, createPlane?, livery?,
 *         prepareRig?(rig), quality?, volume? 0..1, parent?: Element, onDone?({skipped}) }
 */
export function createIntro(opts) {
  ensureStoryCss();
  const { camera } = opts;
  const parent = opts.parent || document.body;
  const S = { t: 0, active: false, done: false, skipped: false, lines: [], total: 0, shot: -1, rig: null, plane: null, painted: null, follow: null, fov0: camera.fov, audio: [], volume: opts.volume ?? 1 };

  const root = el('div', 'krz-intro', `
    <div class="krz-in-vig"></div>
    <div class="krz-in-card" hidden><small>By Royal Warrant</small><b></b><i></i></div>
    <div class="krz-in-title" hidden><small>The Kingdom of</small><b>Krayzee</b></div>
    <p class="krz-in-cap"></p>
    <button type="button" class="krz-in-skip" hidden>Skip intro <span aria-hidden="true">›</span></button>
    <div class="krz-in-black"></div>`);
  const cap = root.querySelector('.krz-in-cap'), card = root.querySelector('.krz-in-card'), title = root.querySelector('.krz-in-title');
  const skipBtn = root.querySelector('.krz-in-skip'), black = root.querySelector('.krz-in-black');
  let skipT = 0;
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target !== skipBtn) { skipBtn.hidden = false; skipT = 3.5; } });
  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); skip(); });
  const onKey = (e) => { if (S.active && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); skip(); } };

  function fill(p) {
    const name = String(p?.name || '').trim();
    card.querySelector('b').textContent = [p?.title, name].filter(Boolean).join(' ') || 'Your Lordship';
    const co = String(p?.company || '').trim();
    card.querySelector('i').textContent = co && co !== name ? `of ${co}` : 'of Krayzee Royal Aerodrome';
  }

  async function start() {
    if (S.active) return;
    const meta = await loadNarration();
    let t = LEAD;
    S.lines = INTRO.map((ln) => {
      const m = meta[ln.id];
      const d = m?.dur || ln.text.split(/\s+/).length / WORDS_PER_SEC;
      const o = { ...ln, start: t, dur: d, end: t + d + GAP, url: m ? AUDIO_BASE + m.file : null, played: false };
      t = o.end;
      return o;
    });
    S.total = t + TAIL;
    for (const ln of S.lines) if (ln.url) { const a = new Audio(ln.url); a.preload = 'auto'; a.volume = S.volume; ln.audio = a; S.audio.push(a); }
    fill(opts.profile);
    parent.appendChild(root);
    addEventListener('keydown', onKey);
    S.active = true; S.t = 0;
    requestAnimationFrame(() => root.classList.add('in'));
    spawnPlane();
  }

  async function spawnPlane() {
    if (!opts.createPlane || !opts.scene) return;
    const busy = (s) => (opts.traffic?.list || []).some((e) => Math.hypot(e.ac.pos.x - s.position[0], e.ac.pos.z - s.position[2]) < 20);
    const order = [3, 2, 4, 1, 5, 0, 6, 7].map((i) => STANDS[i]);
    const stand = order.find((s) => !busy(s)) || STANDS[3];
    try {
      const rig = await opts.createPlane({ type: 'c172', livery: opts.livery || opts.profile, quality: opts.quality || 'high', cockpit: false, pilot: { gender: opts.profile?.gender } });
      if (!S.active) { rig.dispose?.(); return; }
      opts.prepareRig?.(rig);
      const gy = opts.env?.groundHeightAt ? opts.env.groundHeightAt(stand.position[0], stand.position[2]) : 0;
      rig.root.position.set(stand.position[0], gy + (rig.dims?.gearHeight || 1.2), stand.position[2]);
      rig.root.rotation.set(0, Math.PI, 0);
      rig.setView?.('chase');
      opts.scene.add(rig.root);
      S.rig = rig; S.plane = [stand.position[0], gy, stand.position[2]];
    } catch (e) { console.warn('[story] intro plane', e); }
  }

  function pickRival() {
    const list = (opts.traffic?.list || []).filter((e) => !e.player && !e.ac.crashed && !e.ac.onGround && e.ac.agl > 15 && e.rig);
    list.sort((a, b) => Math.hypot(a.ac.pos.x, a.ac.pos.z) - Math.hypot(b.ac.pos.x, b.ac.pos.z));
    return list[0] || null;
  }

  function enterShot(i) {
    unpaint();
    S.shot = i;
    const ln = S.lines[i];
    cap.classList.remove('in'); void cap.offsetWidth;
    cap.textContent = ln.text; cap.classList.add('in');
    card.hidden = !ln.card; title.hidden = !ln.title;
    if (ln.card) card.classList.add('in');
    if (ln.title) requestAnimationFrame(() => title.classList.add('in'));
    S.follow = null;
    const sh = SHOTS[ln.shot];
    if (sh?.follow) {
      const r = pickRival();
      if (r) {
        S.follow = r; S.followCam = null;
        const lv = r.rig.livery?.();
        if (lv && r.rig.setLivery) { S.painted = { rig: r.rig, livery: lv }; r.rig.setLivery(RIVAL_LIVERY); }
      }
    }
  }
  function unpaint() { if (S.painted) { try { S.painted.rig.setLivery(S.painted.livery); } catch (e) { /* */ } S.painted = null; } }

  function setFov(f) {
    const a = camera.aspect || 1;
    let v = f;
    if (a < 1.3) {
      const h = 2 * Math.atan(Math.tan((f * Math.PI) / 360) * (16 / 9)) * 0.82;
      v = Math.min(80, (2 * Math.atan(Math.tan(h / 2) / a) * 180) / Math.PI);
    }
    if (Math.abs(camera.fov - v) > 0.01) { camera.fov = v; camera.updateProjectionMatrix(); }
  }

  function placeCamera(ln, k) {
    const sh = SHOTS[ln.shot] || SHOTS.airport;
    if (sh.follow && S.follow && !S.follow.ac.crashed && S.follow.rig) {
      const p = S.follow.rig.root.position, h = (S.follow.ac.heading * Math.PI) / 180;
      const fx = Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = Math.sin(h), [ox, oy, oz] = sh.offset;
      const want = [p.x + rx * ox - fx * oz, p.y + oy, p.z + rz * ox - fz * oz];
      S.followCam = S.followCam ? lerp3(S.followCam, want, 0.08) : want;
      camera.position.set(...S.followCam);
      camera.lookAt(p.x + fx * 25, p.y, p.z + fz * 25);
      setFov(sh.fov);
      return;
    }
    const s = sh.follow ? sh.fallback : sh;
    const o = s.rel ? S.plane || [STANDS[3].position[0], 0, STANDS[3].position[2]] : [0, 0, 0];
    const add = (v) => (s.rel ? [v[0] + o[0], v[1] + o[1], v[2] + o[2]] : v);
    const e = ease(k);
    const pos = lerp3(add(s.from), add(s.to || s.from), e);
    const look = lerp3(add(s.look), add(s.lookTo || s.look), s.lookTo ? ease(Math.min(1, k * 1.25)) : e);
    const gy = opts.env?.groundHeightAt ? opts.env.groundHeightAt(pos[0], pos[2]) + 2 : -Infinity;
    camera.position.set(pos[0], Math.max(pos[1], gy), pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    setFov(s.fov || 50);
  }

  function update(dt) {
    if (!S.active) return false;
    S.t += Math.min(dt, 0.1);
    if (skipT > 0 && (skipT -= dt) <= 0) skipBtn.hidden = true;
    const t = S.t;
    let i = S.lines.findIndex((ln) => t < ln.end);
    if (i < 0) i = S.lines.length - 1;
    if (i !== S.shot) enterShot(i);
    const ln = S.lines[i];
    for (const l of S.lines) if (!l.played && t >= l.start) {
      l.played = true;
      if (l.audio && t - l.start < 0.5) { l.audio.volume = S.volume; l.audio.play().catch(() => {}); }
    }
    const span = i === S.lines.length - 1 ? S.total - (i ? S.lines[i - 1].end : 0) : ln.end - (i ? S.lines[i - 1].end : 0);
    const k = Math.min(1, (t - (i ? S.lines[i - 1].end : 0)) / span);
    placeCamera(ln, k);
    const fadeIn = Math.max(0, 1 - t / FADE), fadeOut = Math.max(0, 1 - (S.total - t) / FADE);
    black.style.opacity = Math.max(fadeIn, fadeOut).toFixed(3);
    if (t >= S.total) finish(false);
    return S.active;
  }

  function skip() { if (S.active) finish(true); }
  // tests/benches: jump to a line (by id) or a time; earlier lines count as played
  function seek(to) {
    const ln = typeof to === 'string' ? S.lines.find((l) => l.id === to) : null;
    S.t = ln ? ln.start + 0.05 : +to || 0;
    for (const l of S.lines) { l.played = l.start < S.t - 0.3; if (l.played) l.audio?.pause(); }
  }

  function finish(skipped) {
    S.active = false; S.done = true; S.skipped = skipped;
    for (const a of S.audio) { try { a.pause(); } catch (e) { /* */ } }
    unpaint();
    if (S.rig) { opts.scene?.remove(S.rig.root); S.rig.dispose?.(); S.rig = null; }
    removeEventListener('keydown', onKey);
    camera.fov = S.fov0; camera.updateProjectionMatrix();
    root.classList.remove('in');
    setTimeout(() => root.remove(), 400);
    markIntroSeen();
    try { opts.onDone?.({ skipped }); } catch (e) { console.error(e); }
  }

  return {
    el: root, start, update, skip, seek,
    setVolume(v) { S.volume = v; for (const a of S.audio) a.volume = v; },
    get active() { return S.active; },
    get state() { return { active: S.active, done: S.done, skipped: S.skipped, t: +S.t.toFixed(2), total: +S.total.toFixed(2), shot: S.lines[S.shot]?.shot || null, line: S.lines[S.shot]?.id || null, plane: !!S.rig, rival: !!S.follow, caption: cap.textContent }; },
    dispose() { if (S.active) finish(true); root.remove(); },
  };
}

