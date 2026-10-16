// Hat-trick sound clips: a compact player for song questions (clip loading, unlock and Apple handling as in listen.js).
import { h, esc } from '../ui/kit.js?v=202610161426';
import * as clip from '../audio/clip.js?v=202610161426';
import { revealHTML, BADGE_CSS, previewUrl } from '../audio/apple.js?v=202610161426';
import { net, appleSrc } from '../audio/applenet.js?v=202610161426';
import { getCtx, unlock, begin, end } from '../audio/ctx.js?v=202610161426';

const CSS = `
.tr-audio{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#1f1a4d;color:#fff}
.tr-audio::before{display:none}
.tr-play{position:relative;flex:none;width:84px;height:84px;border-radius:50%;border:var(--line) solid var(--ink);background:var(--sun);font-size:30px;box-shadow:var(--shadow);display:grid;place-items:center;color:var(--ink)}
.tr-play::after{content:'';position:absolute;inset:-9px;border-radius:50%;background:conic-gradient(var(--mint) calc(var(--p,0)*360deg),transparent 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 0);mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 0)}
.tr-play.on{animation:flame .5s infinite alternate}
.tr-st{font-weight:900;font-size:14px;opacity:.9}
.play.revealed .tr-audio .tr-play{width:52px;height:52px;font-size:20px}.play.revealed .tr-audio .tr-st{display:none}
.tr-rv .au-reveal{gap:10px}.tr-rv .au-art{width:min(84px,22vw)}
@media (orientation:landscape) and (max-height:520px){.tr-play{width:70px;height:70px;font-size:26px}
 .play.revealed .tr.audio .q-media{visibility:hidden}.tr-rv .au-art,.tr-rv .au-title,.tr-rv .au-sub{display:none}.tr-rv .au-apple{margin-top:0}}
`;

export function audioBox(q, api, { injectCSS }) {
  injectCSS('f-trio-audio-css', CSS + BADGE_CSS);
  const d = q.data || {};
  const a = d.a;
  const tag = 'trio:' + q.id;
  begin(tag);
  let handle = null, dead = false, raf = 0;
  const btn = h('button.tr-play', { type: 'button', 'aria-label': 'Play the clip', dataset: { act: 'play' } }, '▶');
  const st = h('div.tr-st', {}, 'Loading…');
  const box = h('figure.q-media.tr-audio', {}, btn, st);
  const tick = () => {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    const p = handle ? Math.min(1, handle.elapsed() / (d.len || handle.length || 1)) : 0;
    btn.style.setProperty('--p', p);
  };
  async function start(why) {
    if (dead || !a) return;
    try {
      if (getCtx().state !== 'running') await unlock();
      if (getCtx().state !== 'running') { st.textContent = 'Tap ▶ to listen'; return; }
      if (handle) clip.stopHandle(handle, 0.05, 'trio-replay');
      st.textContent = 'Loading…';
      handle = await clip.play(a, { start: d.start || 0, len: d.len, playLen: d.len, alive: () => !dead });
      if (dead) { handle.stop(undefined, 'trio-dead'); return; }
      btn.classList.add('on'); btn.textContent = '❚❚';
      st.textContent = 'Listening…';
      const h0 = handle;
      handle.done.then(() => { if (dead || handle !== h0) return; btn.classList.remove('on'); btn.textContent = '↻'; st.textContent = 'Tap to hear it again'; });
    } catch (e) {
      if (e?.superseded || dead) return;
      st.textContent = 'This clip would not load';
    }
    void why;
  }
  btn.addEventListener('click', () => start('tap'));
  if (a) clip.load(a, { start: d.start || 0, len: d.len }).then(() => { if (!dead) start('autoplay'); }, () => { st.textContent = 'This clip would not load'; });
  else st.textContent = 'No clip';
  raf = requestAnimationFrame(tick);
  return {
    el: box,
    stop() { if (handle) clip.stopHandle(handle, 0.4, 'trio-answer'); btn.classList.remove('on'); btn.disabled = true; btn.textContent = '♪'; st.textContent = ''; },
    destroy() { if (!dead) end(tag); dead = true; cancelAnimationFrame(raf); if (handle) clip.stopHandle(handle, 0.15, 'trio-destroy'); },
    revealNode() {
      const m = d.meta || {};
      const node = h('div.tr-rv');
      node.innerHTML = a?.apple ? revealHTML(a, m) : `<div class="au-reveal"><div class="au-meta"><div class="au-title">${esc(m.title)}</div></div></div>`;
      return node;
    },
  };
}

// Refresh stale Apple preview URLs before the media preflight (listen.js prepare, for trio questions).
export async function prepare(questions) {
  const list = questions.filter(q => q.format === 'trio' && q.data?.a?.apple);
  await Promise.all(list.map(async q => {
    const url = await previewUrl(q.data.a, true).catch(() => null);
    if (url) { q.data.a.src = url; if (q.media?.audio?.[0]) q.media.audio[0].src = url; }
  }));
  if (net.broken) for (const q of list) {
    for (const m of q.media?.audio || []) if (m.src) m.src = appleSrc(m.src);
    q.data.a.src = appleSrc(q.data.a.src);
  }
  return questions;
}

export const loadClip = q => clip.load(q.data.a, { start: q.data.start || 0, len: q.data.len });
