// DOM helpers and the Debug tab's own stylesheet. dev.css belongs to the dev-infrastructure
// agent, so everything here is injected from this module and every class is `dbg-` prefixed —
// the game's style.css shares this document and has reshaped a dev toolbar before.

export function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export const clear = n => { while (n.firstChild) n.firstChild.remove(); return n; };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = n => (n > 1e6 ? `${(n / 1e6).toFixed(2)}M` : n > 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n ?? 0));
export const num = (v, d = 2) => (Number.isFinite(+v) ? (+v).toFixed(d) : '—');

export function button(label, cls, onclick) {
  const b = h('button', cls, label);
  b.onclick = onclick;
  return b;
}

// A labelled on/off switch that reads its own state back, so a panel never has to remember it.
// Two-step instead of confirm(): the house rule here is no browser dialogs, and a headless test
// driver answers every confirm() with OK — which is exactly the wrong default for a wipe button.
export function danger(label, onConfirm, ask = 'Click again to confirm') {
  const b = h('button', 'danger', label);
  let armed = 0;
  const disarm = () => { armed = 0; b.textContent = label; b.className = 'danger'; };
  b.onclick = () => {
    if (armed && Date.now() - armed < 5000) { disarm(); return onConfirm(); }
    armed = Date.now();
    b.textContent = `${ask} — ${label}`;
    b.className = 'danger dbg-armed';
    setTimeout(() => { if (armed) disarm(); }, 5000);
  };
  return b;
}

export function toggle(label, get, set) {
  const wrap = h('label', 'dbg-toggle');
  const box = h('input');
  box.type = 'checkbox';
  box.checked = !!get();
  box.onchange = () => { set(box.checked); box.checked = !!get(); };
  wrap.append(box, h('span', null, label));
  wrap.sync = () => { box.checked = !!get(); };
  return wrap;
}

export function slider({ label, min, max, step, get, set, fmt: f = v => num(v, 2) }) {
  const wrap = h('div', 'dbg-knob');
  const head = h('div', 'dbg-knob-head');
  const name = h('span', null, label);
  const val = h('i', null, f(get()));
  head.append(name, val);
  const r = h('input');
  Object.assign(r, { type: 'range', min, max, step, value: get() });
  r.oninput = () => { set(+r.value); val.textContent = f(+r.value); };
  wrap.append(head, r);
  wrap.sync = () => { r.value = get(); val.textContent = f(get()); };
  return wrap;
}

export function table(headings, rows) {
  const t = h('table');
  if (headings) {
    const tr = h('tr');
    for (const th of headings) tr.append(h('th', null, th));
    t.append(tr);
  }
  for (const r of rows) {
    const tr = h('tr');
    for (const c of r) {
      const td = h('td');
      if (c && typeof c === 'object' && 'html' in c) { td.innerHTML = c.html; td.className = c.cls || ''; }
      else td.textContent = c ?? '';
      tr.append(td);
    }
    t.append(tr);
  }
  return t;
}

export function section(title, ...kids) {
  const s = h('section');
  if (title) s.append(h('h2', null, title));
  s.append(...kids.filter(Boolean));
  return s;
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const CSS = `
#wf-dev .dbg-subs { display:flex; gap:4px; flex-wrap:wrap; margin:-4px 0 14px; border-bottom:1px solid var(--line); padding-bottom:8px; }
#wf-dev .dbg-subs button { padding:5px 11px; border-radius:999px; background:none; border:1px solid transparent; color:var(--dim); }
#wf-dev .dbg-subs button.on { background:#1d3a55; border-color:#2f6690; color:#fff; }
#wf-dev .dbg-subs .dbg-badge { margin-left:5px; color:var(--warn); font-size:11px; }
#wf-dev .dbg-cols { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; }
#wf-dev .dbg-cols > * { flex:1 1 300px; min-width:0; }
#wf-dev .dbg-note { color:var(--dim); font-size:12px; margin:6px 0 10px; }
#wf-dev .dbg-card { border:1px solid var(--line); border-radius:8px; padding:10px 12px; background:#0f151d; margin-bottom:10px; }
#wf-dev .dbg-card h3 { margin:0 0 8px; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); font-weight:500; }
#wf-dev .dbg-toggle { display:inline-flex; align-items:center; gap:6px; cursor:pointer; padding:4px 8px; border:1px solid var(--line); border-radius:6px; background:#182231; }
#wf-dev .dbg-toggle input { cursor:pointer; margin:0; accent-color:#6cc0ff; }
#wf-dev .dbg-knob { margin-bottom:8px; }
#wf-dev .dbg-knob-head { display:flex; justify-content:space-between; font:11px/1.4 ui-monospace,Menlo,monospace; color:var(--dim); }
#wf-dev .dbg-knob-head i { color:var(--accent); font-style:normal; }
#wf-dev .dbg-knob input[type=range] { width:100%; accent-color:#6cc0ff; cursor:pointer; }
#wf-dev .dbg-log { height:min(52vh,460px); overflow:auto; border:1px solid var(--line); border-radius:8px; background:#0b0f16; }
#wf-dev .dbg-log table { font:11.5px/1.55 ui-monospace,Menlo,monospace; }
#wf-dev .dbg-log td { padding:1px 8px 1px 0; border-bottom:1px solid #141b26; vertical-align:top; }
#wf-dev .dbg-log tr:hover td { background:#131c28; }
#wf-dev .dbg-k { display:inline-block; min-width:52px; padding:0 5px; border-radius:3px; background:#1a2634; color:#9fc6ea; font-size:10.5px; text-align:center; }
#wf-dev .dbg-k.fire { background:#16341f; color:#8ce9ad; } #wf-dev .dbg-k.enter { background:#3a2f13; color:#ffd68a; }
#wf-dev .dbg-k.exit { background:#22303f; color:#9fb6cc; } #wf-dev .dbg-k.action { background:#1d2a44; color:#a9bdff; }
#wf-dev .dbg-k.flag { background:#33203a; color:#e6a8ff; } #wf-dev .dbg-k.node,#wf-dev .dbg-k.line { background:#123033; color:#8fe0dc; }
#wf-dev .dbg-k.error { background:#3a1a1a; color:#ff9c9c; } #wf-dev .dbg-k.warn { background:#3a2f13; color:#ffd68a; }
#wf-dev .dbg-tree { height:min(52vh,460px); overflow:auto; border:1px solid var(--line); border-radius:8px; background:#0b0f16; padding:4px 0; }
#wf-dev .dbg-row { display:flex; align-items:center; gap:6px; padding:2px 8px; font:11.5px/1.6 ui-monospace,Menlo,monospace; cursor:pointer; white-space:nowrap; }
#wf-dev .dbg-row:hover { background:#131c28; }
#wf-dev .dbg-row.sel { background:#1d3a55; }
#wf-dev .dbg-row .dbg-tw { width:14px; color:var(--dim); text-align:center; flex:0 0 14px; }
#wf-dev .dbg-row .dbg-t { color:#5d6b7d; margin-left:auto; padding-left:12px; }
#wf-dev .dbg-row.off { opacity:.45; }
#wf-dev button.dbg-armed { background:#3a1414; color:#ffd0d0; border-color:#8a3535; }
#wf-dev .dbg-grouphead { padding:8px 8px 2px; color:#5d6b7d; font-size:10.5px; letter-spacing:.11em; text-transform:uppercase; }
#wf-dev .dbg-graph { width:100%; height:120px; display:block; border:1px solid var(--line); border-radius:8px; background:#0b0f16; }
#wf-dev .dbg-chips { display:flex; gap:4px; flex-wrap:wrap; }
#wf-dev .dbg-chip { font:11px/1 ui-monospace,Menlo,monospace; padding:4px 7px; border-radius:5px; border:1px solid var(--line); color:var(--dim); background:#0f151d; }
#wf-dev .dbg-chip.on { color:#e7f3ff; border-color:#2f6690; background:#1d3a55; }
#wf-dev .dbg-shot { max-width:100%; border:1px solid var(--line); border-radius:6px; background:#000; }
#wf-dev .dbg-flag { display:flex; align-items:center; gap:8px; padding:3px 0; font:12px/1.5 ui-monospace,Menlo,monospace; }
#wf-dev .dbg-flag input[type=text] { flex:1 1 auto; min-width:0; }
#wf-dev .dbg-stick { border:1px solid var(--line); border-radius:8px; background:#0b0f16; }
#wf-dev input[type=range] { accent-color:#6cc0ff; }
#wf-dev .dbg-scroll { max-height:260px; overflow:auto; }

#wf-dbg-hud {
  position:fixed; z-index:99997; width:250px; max-width:calc(100vw - 20px);
  background:rgba(10,14,20,.86); backdrop-filter:blur(8px);
  border:1px solid rgba(120,190,255,.28); border-radius:8px; color:#d7e2f0;
  font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; box-shadow:0 10px 30px rgba(0,0,0,.5);
}
#wf-dbg-hud * { box-sizing:border-box; }
#wf-dbg-hud div, #wf-dbg-hud span, #wf-dbg-hud b, #wf-dbg-hud i, #wf-dbg-hud button, #wf-dbg-hud canvas {
  display:revert; position:static; margin:0; padding:0; float:none; text-align:left; text-transform:none;
  letter-spacing:normal; font-style:normal; opacity:1; visibility:visible; transform:none; box-shadow:none;
}
#wf-dbg-hud header { display:flex; align-items:center; gap:6px; padding:5px 8px; cursor:move;
  border-bottom:1px solid rgba(255,255,255,.08); color:#6cc0ff; letter-spacing:.1em; font-size:10px; }
#wf-dbg-hud header b { flex:1 1 auto; font-weight:700; }
#wf-dbg-hud header button { background:none; border:0; color:#8494a8; cursor:pointer; font:inherit; padding:0 3px; }
#wf-dbg-hud header button:hover { color:#fff; }
#wf-dbg-hud .wfdbg-body { padding:6px 8px 8px; max-height:60vh; overflow:auto; }
#wf-dbg-hud .wfdbg-lane { margin-bottom:6px; }
#wf-dbg-hud .wfdbg-lane b { color:#5d6b7d; font-weight:400; font-size:10px; letter-spacing:.08em; }
#wf-dbg-hud .wfdbg-line { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#wf-dbg-hud .wfdbg-good { color:#5fd68a; } #wf-dbg-hud .wfdbg-bad { color:#ff7a7a; } #wf-dbg-hud .wfdbg-warn { color:#ffc861; }
#wf-dbg-hud.wfdbg-min .wfdbg-body { display:none; }
`;

export function ensureCSS() {
  if (document.getElementById('wf-dbg-css')) return;
  const s = document.createElement('style');
  s.id = 'wf-dbg-css';
  s.textContent = CSS;
  document.head.append(s);
}
