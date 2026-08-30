// Small DOM helpers plus this tab's own stylesheet. js/dev/dev.css belongs to the dev-tools agent,
// so anything only the music tab needs lives here, scoped under #wf-dev and prefixed `mus-`.

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function clock(sec) {
  const s = Math.max(0, Math.round(+sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function field(label, node, note) {
  const w = el('label', 'mus-field');
  w.append(el('span', null, label), node);
  if (note) w.append(el('small', 'dim', note));
  return w;
}

export function num(v, d) { return Number.isFinite(+v) ? +v : d; }

const CSS = `
#wf-dev .mus-sub { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
#wf-dev .mus-sub button.on { background:#1d2a3a; border-color:#3a5878; color:#cfe3ff; }
/* main is padded 14px 16px; the header spans it edge to edge so nothing shows through behind it,
   and --mus-top (measured on mount) is what everything else sticks below. */
#wf-dev .mus-top { position:sticky; top:-14px; z-index:3; padding:10px 16px 8px;
  margin:-14px -16px 12px; background:#111823; border-bottom:1px solid var(--line); }
#wf-dev .mus-top .mus-sub { margin-bottom:8px; }
#wf-dev .mus-bar { display:flex; gap:10px; align-items:center; }
#wf-dev .mus-side { position:sticky; top:calc(var(--mus-top, 90px) - 14px); align-self:flex-start;
  max-height:calc(100vh - var(--mus-top, 90px) - 70px); overflow:auto; }
#wf-dev .mus-bar .mus-now { flex:1 1 auto; min-width:0; font-size:12px; }
#wf-dev .mus-bar .mus-now b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#wf-dev .mus-bar input[type=range] { flex:2 1 240px; accent-color:#5aa0e8; }
#wf-dev .mus-bar .mus-t { font:11px/1 ui-monospace,Menlo,monospace; color:var(--dim); white-space:nowrap; }
#wf-dev .mus-list { border:1px solid var(--line); border-radius:8px; overflow:hidden; }
#wf-dev .mus-row { display:flex; gap:8px; align-items:center; padding:5px 8px; border-top:1px solid var(--line); }
#wf-dev .mus-row:first-child { border-top:0; }
#wf-dev .mus-row.on { background:#16202c; }
#wf-dev .mus-row .mus-id { flex:0 0 190px; font:11px/1.4 ui-monospace,Menlo,monospace; color:var(--dim); }
#wf-dev .mus-row .mus-title { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#wf-dev .mus-row .mus-tag { flex:0 0 auto; font-size:10px; padding:1px 6px; border-radius:99px;
  border:1px solid var(--line); color:var(--dim); }
#wf-dev .mus-row .mus-tag.song { border-color:#5c4a86; color:#c0aee8; }
#wf-dev .mus-row button.mus-play { flex:0 0 30px; }
#wf-dev .mus-why { padding:8px 10px 12px; border-top:1px solid var(--line); background:#0e141d; }
#wf-dev .mus-why pre { margin:4px 0 0; white-space:pre-wrap; font:11px/1.5 ui-monospace,Menlo,monospace;
  color:#b9c7d8; max-height:240px; overflow:auto; }
#wf-dev .mus-field { display:block; margin:0 0 10px; }
#wf-dev .mus-field > span { display:block; font-size:11px; color:var(--dim); margin-bottom:3px; }
#wf-dev .mus-field input[type=text], #wf-dev .mus-field input[type=number],
#wf-dev .mus-field textarea, #wf-dev .mus-field select { width:100%; }
#wf-dev .mus-field small { display:block; margin-top:3px; font-size:11px; }
#wf-dev .mus-two { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
#wf-dev .mus-pick { max-height:52vh; overflow:auto; }
#wf-dev .mus-drag { cursor:grab; }
#wf-dev .mus-row.mus-over { outline:1px dashed #5aa0e8; outline-offset:-2px; }
#wf-dev .mus-meter { height:4px; border-radius:2px; background:#1b2534; overflow:hidden; }
#wf-dev .mus-meter i { display:block; height:100%; background:#5aa0e8; }
@media (max-width:820px) { #wf-dev .mus-two { grid-template-columns:1fr; }
  #wf-dev .mus-row .mus-id { flex-basis:120px; } }
`;

export function ensureStyle() {
  if (document.getElementById('wf-mus-css')) return;
  const s = document.createElement('style');
  s.id = 'wf-mus-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
