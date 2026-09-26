import { h, esc, onTap } from './core.js';
import { icon } from './icons.js';
import { portrait } from './portrait.js';

const SP = 126, ROW = 122, NODE_H = 92, PAD_X = 70, PAD_Y = 22;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const stateOf = p => p.state || (p.revealed ? 'revealed' : 'unknown');
const shown = p => ['revealed', 'complete'].includes(stateOf(p));

function layout(people) {
  const byId = new Map(people.map(p => [p.id, p]));
  const gens = [...new Set(people.map(p => p.gen ?? 0))].sort((a, b) => a - b);
  const pos = new Map();
  gens.forEach((g, gi) => {
    const row = people.filter(p => (p.gen ?? 0) === g);
    const want = new Map();
    row.forEach((p, i) => {
      const ps = (p.parents || []).map(id => pos.get(id)).filter(Boolean);
      want.set(p.id, ps.length ? ps.reduce((s, q) => s + q.x, 0) / ps.length : i * SP);
    });
    for (let pass = 0; pass < 2; pass++) row.forEach(p => {
      if ((p.parents || []).length) return;
      const anchor = p.near || p.partner;
      if (anchor && want.has(anchor) && anchor !== p.id) want.set(p.id, want.get(anchor) + (p.near ? .6 : .5));
    });
    row.sort((a, b) => want.get(a.id) - want.get(b.id));
    let xs = row.map(p => want.get(p.id));
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + SP);
    const shift = row.reduce((s, p, i) => s + want.get(p.id) - xs[i], 0) / (row.length || 1);
    xs = xs.map(x => x + shift);
    row.forEach((p, i) => pos.set(p.id, { x: xs[i], y: gi * ROW, gi }));
  });
  let minX = Infinity, maxX = -Infinity;
  for (const q of pos.values()) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }
  for (const q of pos.values()) { q.x = q.x - minX + PAD_X + 40; q.y += PAD_Y; }
  return { pos, w: maxX - minX + PAD_X * 2 + 80, h: gens.length * ROW + PAD_Y, gens };
}

function links(people, pos, extra = []) {
  const byId = new Map(people.map(p => [p.id, p]));
  let gold = '', dim = '', dots = '', side = '';
  const done = new Set();
  const lit = (...ids) => ids.every(id => byId.get(id) && shown(byId.get(id)));
  for (const l of extra) {
    const a = pos.get(l.a), b = pos.get(l.b);
    if (!a || !b) continue;
    const y = Math.min(a.y, b.y) + 30, mx = (a.x + b.x) / 2;
    side += `<path class="lk-side ${esc(l.kind || '')}" d="M${a.x} ${a.y + 30}Q${mx} ${y - 40} ${b.x} ${b.y + 30}"/>`;
    if (l.label) side += `<text class="lk-lbl" x="${mx}" y="${y - 22}">${esc(l.label)}</text>`;
  }
  for (const p of people) {
    if (p.partner && pos.has(p.partner) && !done.has([p.id, p.partner].sort().join())) {
      done.add([p.id, p.partner].sort().join());
      const a = pos.get(p.id), b = pos.get(p.partner), y = a.y + 36;
      const seg = `M${Math.min(a.x, b.x) + 38} ${y}H${Math.max(a.x, b.x) - 38}`;
      lit(p.id, p.partner) ? gold += seg : dim += seg;
      dots += `<rect x="${(a.x + b.x) / 2 - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${(a.x + b.x) / 2} ${y})" class="${lit(p.id, p.partner) ? 'g' : 'd'}"/>`;
    }
  }
  const fam = new Map();
  for (const p of people) {
    const ps = (p.parents || []).filter(id => pos.has(id));
    if (!ps.length) continue;
    const k = ps.slice().sort().join();
    if (!fam.has(k)) fam.set(k, { ps, kids: [] });
    fam.get(k).kids.push(p);
  }
  for (const { ps, kids } of fam.values()) {
    const pp = ps.map(id => pos.get(id));
    const mx = pp.reduce((s, q) => s + q.x, 0) / pp.length;
    const top = pp.length > 1 ? pp[0].y + 31 : pp[0].y + NODE_H - 4;
    const cy = pos.get(kids[0].id).y;
    const bar = cy - 16;
    const on = lit(...ps);
    let d = `M${mx} ${top}V${bar}`;
    const xs = kids.map(k => pos.get(k.id).x);
    d += `M${Math.min(mx, ...xs)} ${bar}H${Math.max(mx, ...xs)}`;
    on ? gold += d : dim += d;
    for (const k of kids) {
      const q = pos.get(k.id), seg = `M${q.x} ${bar}V${q.y - 2}`;
      on && shown(k) ? gold += seg : dim += seg;
    }
  }
  return `<path class="lk-dim" d="${dim}"/><path class="lk-glow" d="${gold}"/><path class="lk-gold" d="${gold}"/>${dots}${side}`;
}

function nodeHtml(p, q, sel) {
  const st = stateOf(p), vis = shown(p);
  if (p.collapsed) {
    return `<button class="cx-node cx-col hf-live ${vis ? 'on' : 'locked'}" data-id="${esc(p.id)}" style="left:${q.x}px;top:${q.y + 22}px"><span>${icon('more')}</span><b>${esc(vis ? p.label || p.name || '' : p.label || '· · ·')}</b></button>`;
  }
  const name = vis || st === 'rumoured' ? p.name : '?';
  const sub = vis ? (p.years || p.role || '') : st === 'rumoured' ? 'Rumoured' : 'Unknown';
  return `<button class="cx-node hf-live s-${st} ${vis ? 'on' : 'locked'} ${p.you ? 'you' : ''} ${sel ? 'sel' : ''}" data-id="${esc(p.id)}" style="left:${q.x}px;top:${q.y}px">
    <div class="cx-ring"><div class="cx-por">${portrait(vis ? p.portrait || { kind: 'human', seed: String(p.id).length * 13 + q.gi } : { kind: 'unknown', hue: 200 })}</div>${p.you ? '<i class="cx-you">You</i>' : ''}${p.newClue ? '<i class="cx-new"></i>' : ''}</div>
    <b>${esc(name)}</b><span>${esc(sub)}</span>
  </button>`;
}

function detail(p, clues) {
  if (!p) return '<div class="cx-dt empty"><p>Select a person to read their record.</p></div>';
  const cl = clues.filter(c => c.personId === p.id && c.found !== false);
  if (!shown(p)) {
    const rum = stateOf(p) === 'rumoured';
    return `<div class="cx-dt locked"><div class="cd-hd"><div class="cd-por">${portrait({ kind: 'unknown', hue: 200 })}</div>
      <div><span class="hf-label">${rum ? 'Rumoured' : 'Sealed Record'}</span><h3>${esc(rum ? p.name : 'Unknown')}</h3></div></div><p class="cd-bio">${esc(p.hint || 'Recover more fragments to unseal this record.')}</p>
      <div class="cd-prog"><i style="--f:${Math.min(1, cl.length / (p.need || 3))}"></i><span class="hf-num">${cl.length} / ${p.need || 3} fragments</span></div></div>`;
  }
  return `<div class="cx-dt"><div class="cd-hd"><div class="cd-por">${portrait(p.portrait || { kind: 'human', seed: 5 })}</div>
    <div><span class="hf-label">${esc(p.role || '')}${stateOf(p) === 'complete' ? ' · Complete' : ''}</span><h3>${esc(p.name)}</h3>${p.years ? `<div class="cd-yr hf-num">${esc(p.years)}</div>` : ''}</div></div>
    <p class="cd-bio">${esc(p.bio || '')}</p>
    ${cl.length ? `<div class="cd-cl"><span class="hf-label">Linked fragments</span>${cl.map(c => `<div class="cd-c">${icon('sparkle')}<span>${esc(c.title)}</span></div>`).join('')}</div>` : ''}</div>`;
}

export function codexPanel(body, data, ctx) {
  const st = ctx.state;
  st.tab ||= 'tree';
  const people = data.people || [], clues = data.clues || [], places = data.places || [];
  const found = clues.filter(c => c.found !== false);
  const newN = found.filter(c => c.new).length;
  const known = people.filter(p => !p.collapsed && stateOf(p) !== 'unknown');
  if (data.chapter) ctx.extra.innerHTML = `<span class="hf-chip gold">${esc(data.chapter)}</span>`;

  const tab = (id, ic, label, n, badge) => `<button class="cx-tab hf-live ${st.tab === id ? 'on' : ''}" data-t="${id}">${icon(ic)}<span>${label}</span>${n != null ? ` <b class="hf-num">${n}</b>` : ''}${badge ? `<i>${badge}</i>` : ''}</button>`;
  const tabs = `<div class="cx-tabs">
    ${tab('tree', 'codex', 'Family Tree')}${tab('people', 'user', 'People', known.length)}${tab('places', 'pin', 'Places', places.filter(p => p.found !== false).length)}${tab('clues', 'sparkle', 'Clues', found.length, newN)}
    <span class="cx-count hf-num">${people.filter(p => !p.collapsed && shown(p)).length} / ${people.filter(p => !p.collapsed).length} unsealed</span>
  </div>`;

  if (st.tab === 'tree') {
    const L = layout(people);
    st.sel ??= (people.find(p => p.you) || people[0])?.id;
    const sel = people.find(p => p.id === st.sel);
    const genLbl = L.gens.map((g, i) => `<div class="cx-gen" style="top:${i * ROW + PAD_Y + 18}px"><span>Gen</span><b>${ROMAN[i] || i + 1}</b></div>`).join('');
    body.innerHTML = `<div class="hf-codex">${tabs}
      <div class="cx-main">
        <div class="cx-tree hf-scroll"><div class="cx-canvas" style="width:${L.w}px;height:${L.h}px">
          <div class="cx-stars"></div>${genLbl}
          <svg class="cx-links" width="${L.w}" height="${L.h}">${links(people, L.pos, data.links)}</svg>
          ${people.map(p => nodeHtml(p, L.pos.get(p.id), p.id === st.sel)).join('')}
        </div></div>
        ${detail(sel, clues)}
      </div></div>`;
    const tree = body.querySelector('.cx-tree');
    requestAnimationFrame(() => {
      if (st.scroll) { tree.scrollLeft = st.scroll[0]; tree.scrollTop = st.scroll[1]; return; }
      const q = L.pos.get(st.sel);
      if (q) { tree.scrollLeft = q.x - tree.clientWidth / 2; tree.scrollTop = q.y - tree.clientHeight + NODE_H + 30; }
    });
    tree.addEventListener('scroll', () => { st.scroll = [tree.scrollLeft, tree.scrollTop]; }, { passive: true });
    let drag = null;
    tree.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      drag = { x: e.clientX, y: e.clientY, sl: tree.scrollLeft, st: tree.scrollTop, moved: 0 };
      addEventListener('pointerup', () => setTimeout(() => { drag = null; }, 0), { once: true });
    });
    tree.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      tree.scrollLeft = drag.sl - (e.clientX - drag.x); tree.scrollTop = drag.st - (e.clientY - drag.y);
    });
    body.querySelectorAll('.cx-node').forEach(n => onTap(n, () => {
      if (drag && drag.moved > 6) return;
      st.sel = n.dataset.id; ctx.bus.emit('sfx', 'click'); ctx.rerender();
    }));
  } else if (st.tab === 'people') {
    body.innerHTML = `<div class="hf-codex">${tabs}<div class="cx-list hf-scroll">${known.map((p, i) => `
      <article class="cx-person s-${stateOf(p)}" style="animation-delay:${i * 40}ms">
        <div class="cp-por">${portrait(shown(p) ? p.portrait || { kind: 'human', seed: i * 9 + 4 } : { kind: 'unknown', hue: 200 })}</div>
        <div class="cl-b"><div class="cl-h"><b>${esc(p.name)}</b>${p.you ? '<i>You</i>' : ''}</div>
        <div class="cl-s">${esc(shown(p) ? p.role || '' : 'Rumoured')}${p.years ? ` · ${esc(p.years)}` : ''}</div>
        <p>${esc(shown(p) ? p.bio || '' : p.hint || '')}</p></div>
      </article>`).join('') || '<div class="hf-empty">No one on record yet.</div>'}</div></div>`;
  } else if (st.tab === 'places') {
    body.innerHTML = `<div class="hf-codex">${tabs}<div class="cx-list hf-scroll">${places.map((p, i) => p.found === false
      ? `<article class="cx-clue sealed"><div class="cl-ic">${icon('lock')}</div><div class="cl-b"><div class="cl-h"><b>Uncharted</b></div><div class="cl-s">${esc(p.district || 'Unknown district')}</div></div></article>`
      : `<article class="cx-clue place" style="animation-delay:${i * 40}ms"><div class="cl-ic">${icon(p.icon || 'pin')}</div>
        <div class="cl-b"><div class="cl-h"><b>${esc(p.name)}</b>${p.new ? '<i>New</i>' : ''}</div><div class="cl-s">${esc(p.district || '')}</div><p>${esc(p.text || '')}</p></div></article>`).join('') || '<div class="hf-empty">No places recorded yet.</div>'}</div></div>`;
  } else {
    body.innerHTML = `<div class="hf-codex">${tabs}<div class="cx-list hf-scroll">${found.map((c, i) => `
      <article class="cx-clue ${c.new ? 'new' : ''} ${st.open === c.id ? 'open' : ''}" data-id="${esc(c.id)}" style="animation-delay:${i * 40}ms">
        <div class="cl-ic">${icon(c.icon || 'sparkle')}</div>
        <div class="cl-b"><div class="cl-h"><b>${esc(c.title)}</b>${c.new ? '<i>New</i>' : ''}</div>
        <div class="cl-s">${esc(c.source || '')}</div><p>${esc(c.text || '')}</p></div>
      </article>`).join('') || '<div class="hf-empty">No clues recovered yet.</div>'}
      ${clues.filter(c => c.found === false).map(() => '<article class="cx-clue sealed"><div class="cl-ic">' + icon('lock') + '</div><div class="cl-b"><div class="cl-h"><b>Unrecovered clue</b></div><div class="cl-s">Location unknown</div></div></article>').join('')}
    </div></div>`;
    body.querySelectorAll('.cx-clue[data-id]').forEach(c => c.addEventListener('click', () => {
      st.open = st.open === c.dataset.id ? null : c.dataset.id;
      c.classList.toggle('open'); ctx.bus.emit('sfx', 'click');
    }));
  }
  body.querySelectorAll('.cx-tab').forEach(t => onTap(t, () => { st.tab = t.dataset.t; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));
}
