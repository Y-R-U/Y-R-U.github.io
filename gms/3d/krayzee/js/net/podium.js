// End-of-round podium (ONLINE §7). Network names only ever go through textContent.
// The card is a flex column: heading and button stay put, the standings scroll between them (844×390 fits).
const CROWN = '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 38 L2 10 L18 22 L32 4 L46 22 L62 10 L58 38 Z" fill="currentColor"/><circle cx="2" cy="10" r="3" fill="currentColor"/><circle cx="32" cy="4" r="3.4" fill="currentColor"/><circle cx="62" cy="10" r="3" fill="currentColor"/></svg>';
const FONT = new URL('../ui/fonts/InstrumentSerif-400-italic.woff2', import.meta.url).href;
const CSS = `
@font-face { font-family: 'Krayzee Serif'; src: url('${FONT}') format('woff2'); font-weight: 400; font-style: italic; font-display: swap; }
.kzp { position: fixed; inset: 0; z-index: 41; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(6, 10, 30, .72); color: #fbf6ea; font: 15px system-ui, sans-serif; animation: kzp-fade .2s ease-out; }
.kzp *, .kzp *::before, .kzp *::after { box-sizing: border-box; }
.kzp-card { width: min(420px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
  background: linear-gradient(180deg, #16244f, #111a3c); border: 1px solid #e2b04a; border-radius: 16px; padding: 16px 16px 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.5); animation: kzp-pop .34s cubic-bezier(.2, 1.35, .45, 1); }
.kzp-crest { flex: none; display: grid; place-items: center; color: #f7dc8f; margin-bottom: 2px; }
.kzp-crest svg { width: 40px; height: 28px; filter: drop-shadow(0 0 8px rgba(226,179,60,.55)); }
.kzp h2 { flex: none; margin: 0 0 2px; font: italic 400 28px/1.05 'Krayzee Serif', 'Instrument Serif', Didot, 'Bodoni 72', Baskerville, Georgia, serif;
  color: #f7dc8f; text-align: center; overflow-wrap: anywhere; }
.kzp .kzp-sub { flex: none; margin: 0 0 10px; text-align: center; opacity: .8; font-size: 13px; }
.kzp ol { flex: 1 1 auto; min-height: 44px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  list-style: none; margin: 0 -4px; padding: 0 4px; }
.kzp li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; }
.kzp li + li { margin-top: 3px; }
.kzp li.you { background: rgba(226, 176, 74, .16); box-shadow: inset 2px 0 0 #e2b04a; }
.kzp .kzp-place { width: 28px; flex: none; display: grid; place-items: center; font: 700 14px ui-monospace, Menlo, monospace; color: #cbc2ad; }
.kzp .kzp-place svg { width: 22px; height: 15px; color: #f7dc8f; filter: drop-shadow(0 0 3px rgba(226,179,60,.6)); }
.kzp .kzp-who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kzp .kzp-who small { color: #e9c873; font: 700 12px system-ui, sans-serif; font-variant: small-caps; letter-spacing: .04em; margin-right: 5px; }
.kzp .kzp-pp { flex: none; font: 600 13px ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; color: #cbc2ad; }
.kzp li.crown .kzp-pp { color: #f7dc8f; }
.kzp button { flex: none; width: 100%; min-height: 46px; margin-top: 12px; border-radius: 12px; border: 1px solid #e2b04a; background: #e2b04a; color: #1a1840;
  font: 600 16px system-ui, sans-serif; touch-action: manipulation; cursor: pointer; }
.kzp button:focus-visible { outline: 2px solid #fbf6ea; outline-offset: 2px; }
@media (max-height: 460px) {
  .kzp-card { padding: 10px 14px 10px; }
  .kzp-crest { display: none; }
  .kzp h2 { font-size: 23px; }
  .kzp .kzp-sub { margin-bottom: 6px; font-size: 12px; }
  .kzp li { padding: 5px 10px; }
  .kzp button { min-height: 42px; margin-top: 8px; }
}
@keyframes kzp-fade { from { opacity: 0; } }
@keyframes kzp-pop { from { opacity: 0; transform: translateY(10px) scale(.94); } }
@media (prefers-reduced-motion: reduce) { .kzp, .kzp-card { animation: none; } }`;

export function showPodium({ standings = [], winner = null, counted = false, won = false, onClose } = {}) {
  if (!document.getElementById('kzp-css')) { const st = document.createElement('style'); st.id = 'kzp-css'; st.textContent = CSS; document.head.append(st); }
  const root = document.createElement('div');
  root.className = 'kzp';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'kzp-h');
  const card = document.createElement('div');
  card.className = 'kzp-card';
  const crest = document.createElement('div');
  crest.className = 'kzp-crest';
  crest.innerHTML = CROWN;
  const h = document.createElement('h2');
  h.id = 'kzp-h';
  const top = standings.find((s) => s.id === winner);
  h.textContent = won ? 'You hold the Crown!' : top ? `${top.title} ${top.name} is crowned` : 'The bell has rung';
  const sub = document.createElement('p');
  sub.className = 'kzp-sub';
  sub.textContent = won && counted ? 'An online win for your career.' : counted ? 'Counted as an online round.' : 'Practice round: fewer than two royals.';
  const ol = document.createElement('ol');
  ol.setAttribute('aria-label', 'Final standings');
  standings.forEach((s, i) => {
    const li = document.createElement('li');
    const crowned = s.crown || s.id === winner;
    li.className = `${s.you ? 'you' : ''} ${crowned ? 'crown' : ''}`.trim();
    const pl = document.createElement('span'); pl.className = 'kzp-place';
    if (crowned) { pl.innerHTML = CROWN; pl.setAttribute('aria-label', 'Crown'); } else pl.textContent = String(i + 1);
    const who = document.createElement('span'); who.className = 'kzp-who';
    if (s.title) { const t = document.createElement('small'); t.textContent = s.title; who.append(t); }
    who.append(document.createTextNode(s.name || ''));
    const pp = document.createElement('span'); pp.className = 'kzp-pp'; pp.textContent = `${Math.round(s.roomPP || 0).toLocaleString('en-GB')} PP`;
    li.append(pl, who, pp);
    ol.append(li);
  });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Back to the lobby';
  card.append(crest, h, sub, ol, btn);
  root.append(card);
  document.body.append(root);
  let open = true;
  const close = () => { if (!open) return; open = false; document.removeEventListener('keydown', onKey, true); root.remove(); };
  const done = () => { if (!open) return; close(); onClose?.(); };
  const onKey = (e) => {
    if (!root.isConnected) { close(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(); }
    else if (e.key === 'Tab') { e.preventDefault(); btn.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  btn.addEventListener('click', done);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  try { btn.focus({ preventScroll: true }); } catch (e) { /* */ }
  return { close, el: root };
}
