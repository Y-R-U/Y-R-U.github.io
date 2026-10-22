// End-of-round podium (ONLINE §7). Network names only ever go through textContent.
const CSS = `
.kzp { position: fixed; inset: 0; z-index: 41; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(6, 10, 30, .72); color: #fbf6ea; font: 15px system-ui, sans-serif; }
.kzp-card { width: min(420px, 100%); max-height: 100%; overflow: auto; background: linear-gradient(180deg, #16244f, #111a3c);
  border: 1px solid #e2b04a; border-radius: 16px; padding: 18px 16px; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.kzp h2 { margin: 0 0 4px; font-size: 22px; color: #f7dc8f; text-align: center; }
.kzp .kzp-sub { margin: 0 0 14px; text-align: center; opacity: .8; font-size: 13px; }
.kzp ol { list-style: none; margin: 0 0 16px; padding: 0; }
.kzp li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; }
.kzp li + li { margin-top: 4px; }
.kzp li.you { background: rgba(226, 176, 74, .16); }
.kzp .kzp-place { width: 28px; font-weight: 700; color: #f7dc8f; text-align: center; }
.kzp .kzp-who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kzp .kzp-pp { font-variant-numeric: tabular-nums; }
.kzp button { width: 100%; min-height: 46px; border-radius: 12px; border: 1px solid #e2b04a; background: #e2b04a; color: #1a1840;
  font: 600 16px system-ui, sans-serif; touch-action: manipulation; }`;

export function showPodium({ standings = [], winner = null, counted = false, won = false, onClose } = {}) {
  if (!document.getElementById('kzp-css')) { const st = document.createElement('style'); st.id = 'kzp-css'; st.textContent = CSS; document.head.append(st); }
  const root = document.createElement('div');
  root.className = 'kzp';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Round over');
  const card = document.createElement('div');
  card.className = 'kzp-card';
  const h = document.createElement('h2');
  const top = standings.find((s) => s.id === winner);
  h.textContent = won ? 'You hold the Crown!' : top ? `${top.title} ${top.name} is crowned` : 'The bell has rung';
  const sub = document.createElement('p');
  sub.className = 'kzp-sub';
  sub.textContent = won && counted ? 'An online win for your career.' : counted ? 'Counted as an online round.' : 'Practice round: fewer than two royals.';
  const ol = document.createElement('ol');
  standings.forEach((s, i) => {
    const li = document.createElement('li');
    if (s.you) li.className = 'you';
    const pl = document.createElement('span'); pl.className = 'kzp-place'; pl.textContent = s.crown || s.id === winner ? '♛' : String(i + 1);
    const who = document.createElement('span'); who.className = 'kzp-who'; who.textContent = `${s.title || ''} ${s.name || ''}`.trim();
    const pp = document.createElement('span'); pp.className = 'kzp-pp'; pp.textContent = `${Math.round(s.roomPP || 0).toLocaleString('en-GB')} PP`;
    li.append(pl, who, pp);
    ol.append(li);
  });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Back to the lobby';
  card.append(h, sub, ol, btn);
  root.append(card);
  document.body.append(root);
  const close = () => { root.remove(); };
  btn.addEventListener('click', () => { close(); onClose?.(); });
  return { close, el: root };
}
