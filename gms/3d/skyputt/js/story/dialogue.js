// Dialogue cards: a portrait, a name and one line at a time. Tap / click / Enter / Space to advance.
import { portraitSVG } from './portrait.js';
import { CHARACTERS } from './data/characters.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// lines: [[speakerId, text], ...]; vars: { name }. Resolves when the last line is dismissed.
export function playDialogue(lines, vars = {}, { onLine } = {}) {
  return new Promise(resolve => {
    if (!lines || !lines.length) { resolve(); return; }
    const el = document.getElementById('dialogue');
    let i = 0;
    const show = () => {
      const [who, raw] = lines[i];
      const ch = CHARACTERS[who] || { name: who, portrait: {} };
      const text = raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
      const side = who === 'you' ? 'right' : 'left';
      el.innerHTML = `<div class="dlg ${side}">
        <div class="dlg-face">${portraitSVG(ch.portrait, { size: 96 })}</div>
        <div class="dlg-box"><div class="dlg-name">${esc(who === 'you' ? (vars.name || 'You') : ch.name)}</div>
          <div class="dlg-text">${esc(text)}</div>
          <div class="dlg-more">${i < lines.length - 1 ? 'Tap to continue' : 'Tap to close'} ▸</div></div></div>`;
      el.hidden = false;
      onLine?.(i);
    };
    const next = e => {
      if (e.type === 'keydown' && !['Enter', ' ', 'Escape'].includes(e.key)) return;
      e.preventDefault?.();
      i++;
      if (i >= lines.length || e.key === 'Escape') { el.hidden = true; el.innerHTML = ''; el.removeEventListener('click', next); removeEventListener('keydown', next); resolve(); }
      else show();
    };
    el.addEventListener('click', next);
    addEventListener('keydown', next);
    show();
  });
}
