// Element helper plus this tab's own styling. dev.css belongs to the dev-infrastructure agent, so
// the rules live here and every class is prefixed — the overlay's reset outranks a bare class name.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el[k.toLowerCase()] = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function opt(value, label, selected) {
  return h('option', { value, selected: selected === value, text: label });
}

export function select(options, value, onchange, attrs = {}) {
  const s = h('select', { ...attrs, onchange: e => onchange(e.target.value) });
  for (const o of options) {
    if (Array.isArray(o) && Array.isArray(o[1])) {
      const g = h('optgroup', { label: o[0] });
      for (const [v, l] of o[1]) g.append(opt(v, l, value));
      s.append(g);
    } else {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      s.append(opt(v, l, value));
    }
  }
  s.value = value ?? '';
  return s;
}

const CSS = `
#wf-dev .convo-split { display:flex; gap:14px; align-items:stretch; height:100%; min-height:0; }
#wf-dev .convo-list { flex:0 0 320px; display:flex; flex-direction:column; min-height:0;
  border-right:1px solid var(--line); padding-right:10px; }
#wf-dev .convo-scroll { overflow:auto; flex:1 1 auto; min-height:0; }
#wf-dev .convo-editor { flex:1 1 auto; overflow:auto; min-width:0; padding-right:4px; }
#wf-dev .convo-node { display:block; width:100%; text-align:left; background:none;
  border:1px solid transparent; border-radius:6px; padding:5px 8px; color:var(--dim); margin-bottom:2px; }
#wf-dev .convo-node:hover { background:#182231; color:var(--ink); }
#wf-dev .convo-node.active { background:#1d3a55; border-color:#2f6690; color:#fff; }
#wf-dev .convo-node b { display:block; color:inherit; font-weight:600; }
#wf-dev .convo-node .convo-id { font:11px/1.4 ui-monospace,Menlo,monospace; color:#6f8098; }
#wf-dev .convo-node.active .convo-id { color:#b9d6f0; }
#wf-dev .convo-node.repeat { opacity:.5; }
#wf-dev .convo-badge { display:inline-block; font:10px/1.4 ui-monospace,Menlo,monospace;
  padding:1px 5px; border-radius:4px; border:1px solid var(--line); margin-right:4px; color:var(--dim); }
#wf-dev .convo-badge.orphan { color:var(--warn); border-color:#4a3d1f; background:#241d0e; }
#wf-dev .convo-badge.bad { color:var(--bad); border-color:#4a2626; }
#wf-dev .convo-badge.link { color:var(--good); border-color:#24462f; }
#wf-dev .convo-via { color:#5d6b7d; font:10px/1.4 ui-monospace,Menlo,monospace; }
#wf-dev .convo-card { border:1px solid var(--line); border-radius:8px; padding:10px;
  margin-bottom:10px; background:#111823; }
#wf-dev .convo-card.line { display:grid; grid-template-columns:170px 1fr auto; gap:8px; align-items:start; }
#wf-dev .convo-card.line textarea { min-height:56px; width:100%; flex:none; }
#wf-dev .convo-col { display:flex; flex-direction:column; gap:6px; min-width:0; }
#wf-dev .convo-num { color:#5d6b7d; font:11px/1.4 ui-monospace,Menlo,monospace; }
#wf-dev .convo-mini { padding:3px 7px; font-size:11px; }
#wf-dev .convo-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
#wf-dev .convo-head .convo-grow { flex:1 1 auto; }
#wf-dev .convo-links { font:11px/1.7 ui-monospace,Menlo,monospace; color:var(--dim); }
#wf-dev .convo-links .convo-jump { color:var(--accent); cursor:pointer; text-decoration:underline; }
#wf-dev .convo-pred { border-left:2px solid var(--line); padding-left:8px; margin:4px 0; }
#wf-dev .convo-transcript { background:#0b0f16; border:1px solid var(--line); border-radius:6px;
  padding:10px; max-height:300px; overflow:auto; font:12px/1.6 ui-monospace,Menlo,monospace; }
#wf-dev .convo-transcript .who { color:var(--accent); }
#wf-dev .convo-transcript .fx { color:var(--warn); }
#wf-dev .convo-choicebtn { display:block; width:100%; text-align:left; margin-bottom:4px; }
#wf-dev .convo-flags { display:flex; flex-wrap:wrap; gap:10px; font-size:11px; color:var(--dim); }
#wf-dev .convo-flags label { display:flex; gap:4px; align-items:center; cursor:pointer; }
#wf-dev .convo-new { border:1px solid #2f6690; border-radius:8px; padding:10px; background:#14202e; }
#wf-dev .convo-vo { font:10px/1.4 ui-monospace,Menlo,monospace; }
#wf-dev .convo-vo.fresh { color:var(--good); } #wf-dev .convo-vo.stale { color:var(--warn); }
#wf-dev .convo-vo.missing { color:var(--dim); } #wf-dev .convo-vo.bad { color:var(--bad); }
@media (max-width:900px) {
  #wf-dev .convo-split { flex-direction:column; }
  #wf-dev .convo-list { flex:0 0 auto; max-height:200px; border-right:0; border-bottom:1px solid var(--line); }
  #wf-dev .convo-card.line { grid-template-columns:1fr; }
}`;

export function ensureCSS() {
  if (document.getElementById('convo-css')) return;
  document.head.append(h('style', { id: 'convo-css', text: CSS }));
}

// prompt()/confirm() are refused by a headless dialog handler and are a modal in Aaron's face
// either way, so anything that needs an answer draws one of these instead.
export function promptCard({ title, note, value = null, placeholder = '', ok = 'OK', danger = false, onOK, onCancel }) {
  const input = value === null ? null
    : h('input', { type: 'text', value, placeholder, style: 'width:340px', class: 'convo-ask' });
  const done = () => onOK(input ? input.value.trim() : true);
  if (input) input.onkeydown = e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') onCancel(); };
  const card = h('div', { class: 'convo-new' },
    h('div', { class: 'row' }, h('b', { text: title }), note ? h('span', { class: 'dim', text: note }) : null),
    input ? h('div', { class: 'row' }, input) : null,
    h('div', { class: 'row' },
      h('button', { class: danger ? 'danger' : 'primary', text: ok, onclick: done }),
      h('button', { text: 'Cancel', onclick: onCancel })));
  queueMicrotask(() => input?.focus());
  return card;
}
