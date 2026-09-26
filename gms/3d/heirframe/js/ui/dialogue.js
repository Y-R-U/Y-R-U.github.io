import { h, esc, store, haptic } from './core.js';
import { icon } from './icons.js';
import { portrait } from './portrait.js';

export function createDialogue(bus, root) {
  const el = h('div.hf-dlg', {
    html: `<div class="lb top"></div><div class="lb bot"></div>
    <div class="dl-box">
      <div class="dl-portrait"><div class="pf"></div><div class="pscan"></div></div>
      <div class="dl-body">
        <div class="dl-name"><b></b><span></span></div>
        <div class="dl-text"></div>
        <div class="dl-next">${icon('down')}</div>
      </div>
      <div class="dl-choices"></div>
    </div>`,
  });
  const $ = s => el.querySelector(s);
  const pf = $('.pf'), nm = $('.dl-name b'), role = $('.dl-name span'), txt = $('.dl-text'), choicesEl = $('.dl-choices');

  let cur = null, raf = 0, closeT = 0, audio = null;

  function stopAudio() { if (audio) { audio.pause(); audio = null; } }

  function finishTyping() {
    if (!cur || cur.done) return;
    cancelAnimationFrame(raf);
    cur.done = true;
    txt.innerHTML = esc(cur.text);
    el.classList.add('typed');
    showChoices();
  }

  function showChoices() {
    const list = cur.choices || [];
    choicesEl.innerHTML = '';
    list.forEach((c, i) => {
      const o = typeof c === 'string' ? { text: c } : c;
      const b = h('button.hf-choice.hf-live', { html: `<i class="hf-num">${i + 1}</i><span>${esc(o.text)}</span>${o.tag ? `<em>${esc(o.tag)}</em>` : ''}` });
      b.style.animationDelay = `${i * 70}ms`;
      b.addEventListener('click', e => { e.stopPropagation(); pick(i); });
      choicesEl.append(b);
    });
    el.classList.toggle('has-choices', list.length > 0);
  }

  function pick(i) {
    if (!cur) return;
    haptic(); bus.emit('sfx', 'confirm');
    const c = cur; cur = null;
    stopAudio();
    c.resolve(i);
    closeT = setTimeout(close, 90);
  }

  function advance() {
    if (!cur) return;
    if (!cur.done) return finishTyping();
    if (!(cur.choices || []).length) pick(0);
  }

  el.addEventListener('click', advance);

  function close() {
    clearTimeout(closeT);
    cancelAnimationFrame(raf);
    stopAudio();
    if (cur) { const c = cur; cur = null; c.resolve(-1); }
    el.classList.remove('show', 'typed', 'has-choices');
    root.classList.remove('hf-in-dialogue');
  }

  function show(o) {
    clearTimeout(closeT);
    if (cur) { const c = cur; cur = null; c.resolve(-1); }
    stopAudio();
    return new Promise(resolve => {
      cur = { ...o, text: o.text || '', resolve, done: false };
      const wasOpen = el.classList.contains('show');
      el.classList.remove('typed', 'has-choices', 'right', 'nosubs');
      el.classList.toggle('right', o.side === 'right');
      choicesEl.innerHTML = '';
      const speakerChanged = nm.textContent !== (o.speaker || '');
      nm.textContent = o.speaker || '';
      role.textContent = o.role || '';
      if (speakerChanged || !wasOpen) {
        pf.innerHTML = portrait(o.portrait || { kind: 'unknown' });
        el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
      }
      el.classList.add('show');
      root.classList.add('hf-in-dialogue');
      const hasVoice = !!(o.voiceUrl || o.voiceDuration);
      if (hasVoice && !store.settings.subtitles) el.classList.add('nosubs');
      let cps = 42;
      if (o.voiceDuration) cps = cur.text.length / Math.max(.5, o.voiceDuration * .9);
      if (o.voiceUrl) {
        audio = new Audio(o.voiceUrl);
        audio.volume = store.settings.voice;
        audio.addEventListener('loadedmetadata', () => { if (isFinite(audio?.duration)) cps = cur ? cur.text.length / Math.max(.5, audio.duration * .9) : cps; });
        audio.play().catch(() => {});
      }
      const t0 = performance.now() + (wasOpen ? 60 : 380);
      let shown = 0;
      txt.textContent = '';
      const tick = now => {
        if (!cur || cur.done) return;
        const n = Math.max(0, Math.min(cur.text.length, Math.floor((now - t0) / 1000 * cps)));
        if (n !== shown) {
          if (Math.floor(n / 3) !== Math.floor(shown / 3)) bus.emit('sfx', 'type');
          shown = n;
          txt.innerHTML = `${esc(cur.text.slice(0, n))}<span class="ghost">${esc(cur.text.slice(n))}</span>`;
        }
        if (n >= cur.text.length) finishTyping();
        else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  async function play(lines) {
    let r = 0;
    for (const l of lines) r = await show(l);
    return r;
  }

  function onKey(e) {
    if (!cur) return false;
    if (e.code === 'Space' || e.code === 'Enter') { advance(); return true; }
    const m = /^Digit(\d)$/.exec(e.code);
    if (m && cur.done && cur.choices && +m[1] - 1 < cur.choices.length) { pick(+m[1] - 1); return true; }
    return false;
  }

  return { el, show, play, close, onKey, get open() { return !!cur; }, _advance: advance };
}
