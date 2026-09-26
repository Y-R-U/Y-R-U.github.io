// Two small cinematic overlays the UI kit doesn't have: full-screen story text cards and bark subtitles.
// Inline styles so they don't depend on css/* (owned by the ui agent).
const FONT = "'Rajdhani', system-ui, sans-serif";

export function createOverlay() {
  const card = document.createElement('div');
  card.style.cssText = `position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
    background:radial-gradient(ellipse at 50% 45%, #1b1712 0%, #070605 70%);color:#f3e2bd;font-family:${FONT};text-align:center;
    opacity:0;pointer-events:none;transition:opacity .7s ease;padding:0 8vw;`;
  const sub = document.createElement('div');
  sub.style.cssText = `position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:12;max-width:min(560px,52vw);
    padding:8px 16px 9px;border-radius:6px;background:linear-gradient(180deg,rgba(8,16,28,.82),rgba(4,10,20,.9));border:1px solid rgba(143,232,255,.35);
    box-shadow:0 0 24px rgba(0,0,0,.4);color:#eaf6ff;font:600 14px/1.3 ${FONT};letter-spacing:.02em;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none;`;
  document.body.append(card, sub);
  let subT = 0;

  return {
    card(lines, ms = 3000) {
      card.innerHTML = lines.map((l, i) => i === 0
        ? `<div style="font-family:Michroma,${FONT};font-size:clamp(15px,2.6vw,22px);letter-spacing:.32em;color:#ffd98a;text-shadow:0 0 18px #d6a64f88">${esc(l)}</div>`
        : `<div style="font-size:clamp(12px,1.9vw,16px);letter-spacing:.14em;color:#b9a47e;text-transform:uppercase">${esc(l)}</div>`).join('');
      card.style.opacity = '1';
      return new Promise((r) => setTimeout(() => { card.style.opacity = '0'; setTimeout(r, 500); }, ms));
    },
    subtitle(speaker, text, ms) {
      clearTimeout(subT);
      sub.innerHTML = `${speaker ? `<b style="color:#ffd98a;letter-spacing:.12em;text-transform:uppercase;font-size:12px;display:block;margin-bottom:2px">${esc(speaker)}</b>` : ''}${esc(text)}`;
      sub.style.opacity = '1';
      if (ms) subT = setTimeout(() => { sub.style.opacity = '0'; }, ms);
    },
    hideSubtitle() { clearTimeout(subT); sub.style.opacity = '0'; },
    // keep barks from showing through the dialogue letterbox / panels
    suppress(on) { const v = on ? 'hidden' : ''; if (sub.style.visibility !== v) sub.style.visibility = v; },
    get cardOpen() { return card.style.opacity === '1'; },
  };
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
