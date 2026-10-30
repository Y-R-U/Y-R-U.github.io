// The puzzle map: a winding trail of nodes through themed regions, top to bottom.
import { h, esc, icon, toast } from '../app/ui.js';
import { REGIONS } from './regions.js';
import { loadIndex } from './data.js';
import { buildGraph, computeState, nextOpen } from './layout.js';
import { getProgress, onProgress } from './progress.js';
import { GLYPHS, DECOR, starRow, crest } from './art.js';

const ROW_H = 86, TOP_PAD = 38, BOT_PAD = 30;
let graphP = null;
export function getGraph() {
  if (!graphP) graphP = loadIndex().then(idx => ({ idx, g: buildGraph(idx, REGIONS) })).catch(e => { graphP = null; throw e; });
  return graphP;
}

// deterministic pseudo-random for decor
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hashStr = s => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };

export function mountMap(el, app, { focus } = {}) {
  el.innerHTML = `<div class="pz-hud"></div><div class="pz-map"><div class="pz-loading"><div class="boot-spin"></div>Unrolling the map…</div></div>
    <div class="pz-foot"></div>
    <button class="btn btn-primary pz-next" hidden>${icon('play')}<span>Next puzzle</span></button>`;
  const hud = el.querySelector('.pz-hud'), mapEl = el.querySelector('.pz-map'), nextBtn = el.querySelector('.pz-next');
  let G = null, st = null, width = 0, dead = false;

  function renderHud() {
    const p = getProgress();
    const total = G ? G.g.order.length : 0;
    const solved = G ? G.g.order.filter(id => p.s[id] !== undefined).length : 0;
    const stars = G ? G.g.order.reduce((s, id) => s + (p.s[id] || 0), 0) : 0;
    const hist = p.h.length > 1 ? p.h : null;
    const trend = hist ? (() => {
      const mn = Math.min(...hist), mx = Math.max(...hist), span = Math.max(20, mx - mn);
      return `<svg class="pz-spark" viewBox="0 0 60 18" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${hist.map((v, i) => `${(i / (hist.length - 1) * 58 + 1).toFixed(1)},${(17 - (v - mn) / span * 16).toFixed(1)}`).join(' ')}"/></svg>`;
    })() : '';
    hud.innerHTML = `
      <div class="pz-hud-in">
        <div class="pz-rating" title="Puzzle rating: Elo against each puzzle's rating, first try only">
          ${crest()}<div><small>Puzzle rating</small><b>${p.r}</b>${p.n < 10 ? '<em>provisional</em>' : ''}</div>${trend}
        </div>
        <div class="pz-stat"><small>Solved</small><b>${solved}<span>/${total}</span></b></div>
        <div class="pz-stat"><small>Stars</small><b class="gold">★ ${stars}</b></div>
      </div>`;
  }

  function layout() {
    if (!G || dead) return;
    const w = Math.round(mapEl.clientWidth || 360);
    width = w;
    const p = getProgress();
    st = computeState(G.g, REGIONS, p);
    const parts = [];
    let gRow = 0;
    REGIONS.forEach((reg, ri) => {
      const rows = G.g.regionRows.get(reg.id); if (!rows) return;
      const ids = rows.flatMap(r => G.g.rows[r].ids);
      const solved = ids.filter(id => p.s[id] !== undefined).length;
      const stars = ids.reduce((s, id) => s + (p.s[id] || 0), 0);
      const ro = st.regionOpen.get(reg.id);
      const lo = G.g.nodes.get(ids[0]).r, hi = Math.max(...ids.map(id => G.g.nodes.get(id).r));
      const prev = REGIONS[ri - 1];
      // classic rows carry a name label, so they get extra room below
      const rowY = []; let yAcc = TOP_PAD;
      for (const r of rows) { const cl = G.g.rows[r].ids.some(id => G.g.nodes.get(id).classic); rowY.push(yAcc + ROW_H / 2); yAcc += ROW_H + (cl ? 26 : 0); }
      const height = yAcc + BOT_PAD;
      // node positions
      const pos = new Map();
      rows.forEach((r, i) => {
        const row = G.g.rows[r], k = row.ids.length;
        const spread = k === 1 ? 0 : Math.min(k === 2 ? 132 : 220, w * (k === 2 ? 0.38 : 0.62));
        const amp = Math.max(0, Math.min(w * 0.26, (w - spread) / 2 - 46));
        const cx = w / 2 + amp * Math.sin((gRow + i) * 0.62);
        row.ids.forEach((id, lane) => {
          const x = k === 1 ? cx : cx - spread / 2 + lane * (spread / (k - 1));
          let xx = x;
          const nd = G.g.nodes.get(id);
          if (nd.classic && nd.name) { const half = nd.name.length * 3.9 + 10; xx = Math.max(half, Math.min(w - half, x)); }
          pos.set(id, [Math.round(xx), rowY[i]]);
        });
      });
      gRow += rows.length;
      // paths
      let road = '', glow = '';
      for (const id of ids) {
        const [x1, y1] = pos.get(id);
        for (const nx of G.g.nodes.get(id).next) {
          const to = pos.get(nx); if (!to) continue;
          const [x2, y2] = to, my = (y1 + y2) / 2;
          const d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
          road += `<path d="${d}"/>`;
          if (p.s[id] !== undefined) glow += `<path d="${d}"/>`;
        }
      }
      // continuation into the next region (and from the previous one)
      const firstPos = pos.get(ids[0]), lastPos = pos.get(ids[ids.length - 1]);
      road += `<path d="M${firstPos[0]},0 L${firstPos[0]},${firstPos[1]}"/>`;
      if (ri < REGIONS.length - 1) road += `<path d="M${lastPos[0]},${lastPos[1]} C${lastPos[0]},${height} ${w / 2},${height - 10} ${w / 2},${height}"/>`;
      // decor in the margins, kept clear of every node and path nearby
      const R = rng(hashStr(reg.id)), shape = DECOR[reg.glyph] || DECOR.sprout;
      const pts = ids.map(id => pos.get(id));
      let decor = '';
      const count = Math.round(height / (w > 500 ? 70 : 110));
      for (let i = 0; i < count; i++) {
        const y = 24 + R() * (height - 48), s = 0.7 + R() * 0.8, side = i % 2 ? 1 : -1;
        const near = pts.filter(q => Math.abs(q[1] - y) < ROW_H * 1.1);
        const lo = near.length ? Math.min(...near.map(q => q[0])) : w / 2, hi = near.length ? Math.max(...near.map(q => q[0])) : w / 2;
        const pad = 46 + 28 * s;
        const free = side < 0 ? lo - pad : w - hi - pad;
        if (free < 14) continue;
        const x = side < 0 ? 14 + R() * (free - 14) : w - 14 - R() * (free - 14);
        decor += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)}) scale(${s.toFixed(2)})" opacity="${(0.12 + R() * 0.16).toFixed(2)}">${shape}</g>`;
      }
      const nodesHtml = rows.map((r, i) => G.g.rows[r].ids.map(id => {
        const n = G.g.nodes.get(id), [x, y] = pos.get(id), s = st.state.get(id);
        const num = ids.indexOf(id) + 1;
        const stars = p.s[id];
        const isNext = false;
        return `<button class="pz-node st-${s}${n.classic ? ' classic' : ''}${isNext ? ' next' : ''}" data-id="${esc(id)}" style="left:${x}px;top:${y}px"
          aria-label="${n.classic ? 'Classic' : 'Puzzle'} ${num}, ${s === 'locked' ? 'locked' : s === 'done' ? `${stars} stars` : 'open'}">
          <span class="pz-disc">${s === 'locked' ? icon('lock') : n.classic ? GLYPHS.crown : `<b>${num}</b>`}</span>
          ${s === 'done' ? `<span class="pz-stars">${starRow(stars)}</span>` : ''}
          ${n.classic ? `<span class="pz-cname">${esc(n.name || '')}</span>` : ''}
        </button>`;
      }).join('')).join('');
      parts.push(`<section class="pz-region${ro.open ? '' : ' locked'}" id="pzr-${reg.id}" style="--ra:${reg.a};--rb:${reg.b};--rh:${reg.hue}">
        <header class="pz-banner">
          <div class="pz-glyph">${GLYPHS[reg.glyph] || ''}</div>
          <div class="pz-btxt">
            <small>Chapter ${ri + 1} · ${lo}–${hi}</small>
            <h2>${esc(reg.name)}</h2>
            <p>${esc(ro.open ? reg.blurb : reg.sub)}</p>
            ${ro.open ? '' : `<p class="pz-lockmsg">${icon('lock')} Finish ${esc(prev ? prev.name : '')} or reach a puzzle rating of ${reg.unlock}</p>`}
            ${ro.byRating ? `<p class="pz-lockmsg open">Opened early by your rating</p>` : ''}
          </div>
          <div class="pz-bprog"><b>${solved}<span>/${ids.length}</span></b><small class="gold">★ ${stars}</small>
            <i style="--p:${(solved / ids.length * 100).toFixed(1)}%"></i></div>
        </header>
        <div class="pz-trail" style="height:${height}px">
          <svg class="pz-svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" aria-hidden="true">
            <g class="pz-decor" fill="var(--ra)" stroke="var(--ra)">${decor}</g>
            <g class="pz-road">${road}</g><g class="pz-road-in">${road}</g><g class="pz-glow">${glow}</g>
          </svg>
          ${nodesHtml}
        </div>
      </section>`);
    });
    mapEl.innerHTML = parts.join('');
    const nx = nextOpen(G.g, st, p.last);
    nextBtn.hidden = !nx;
    nextBtn.dataset.id = nx || '';
    if (nx) mapEl.querySelector(`.pz-node[data-id="${CSS.escape(nx)}"]`)?.classList.add('next');
    renderHud();
  }

  function scrollTo(id, smooth) {
    const node = mapEl.querySelector(`.pz-node[data-id="${CSS.escape(id)}"]`);
    const sc = el.closest('#view') || document.scrollingElement;
    if (!node || !sc) return;
    const r = node.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const top = sc.scrollTop + r.top - sr.top - sc.clientHeight * 0.45;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  el.addEventListener('click', e => {
    const n = e.target.closest('.pz-node');
    if (n) {
      const s = st && st.state.get(n.dataset.id);
      if (s === 'locked') {
        n.classList.remove('nope'); void n.offsetWidth; n.classList.add('nope');
        toast('Locked — solve a puzzle that leads here first');
        return;
      }
      app.go(`#/puzzles/p/${encodeURIComponent(n.dataset.id)}`);
      return;
    }
    if (e.target.closest('.pz-next')) {
      const id = nextBtn.dataset.id;
      if (id) app.go(`#/puzzles/p/${encodeURIComponent(id)}`);
    }
  });

  let rt = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(mapEl.clientWidth);
    if (!G || Math.abs(w - width) < 2) return;
    clearTimeout(rt); rt = setTimeout(layout, 120);
  });
  ro.observe(mapEl);
  const off = onProgress(() => layout());

  getGraph().then(res => {
    if (dead) return;
    G = res;
    el.querySelector('.pz-foot').innerHTML = `
      <div class="pz-rush card"><span class="badge">Later</span><b>Puzzle Rush</b><span>Race the clock through ever-harder puzzles — three strikes and you're out.</span></div>
      <p class="pz-credit">${esc(res.idx.attribution || '')}</p>`;
    layout();
    const p = getProgress();
    const target = focus || p.last || nextOpen(G.g, st, null);
    if (target) requestAnimationFrame(() => scrollTo(target, false));
  }).catch(err => {
    console.error('[puzzles] map', err);
    mapEl.innerHTML = '<div class="pz-loading">The puzzle map could not be loaded. Check your connection and try again.</div>';
  });
  renderHud();

  return {
    leave() { dead = true; ro.disconnect(); off(); clearTimeout(rt); },
  };
}
