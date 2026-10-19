// Story map screen: a horizontally scrolling road of numbered level nodes over a per-map backdrop.
// createStoryMap(container, {mapId, map, progress, isOpen?, showTitle?, showBack?, animateUnlock?, justUnlocked?, chapter?})
//   -> { on('level'|'back', fn), centerOn(levelId, animate), setProgress(progress), dispose(), el, headSlot }
//   Landscape (container w/h >= 1): class .wide (+ .short under 400 px tall), road in the band between head and CTA.
// createMapSelect(container, {maps, progress, isOpen?}) -> { on('map', fn), dispose(), el }
import { themeFor, backdropUrl, thumbUrl } from './themes.js';
import { injectMapCss } from './map_css.js';
import { DEMO_MAPS } from './demo_maps.js';
export { DEMO_MAPS };

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0110 0v3h1.5v11h-13V10zm2 0h6V7a3 3 0 00-6 0z"/></svg>';
const SKULL = '<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 3 5.8 3 10.5c0 2.8 1.3 4.7 3 5.9V20h3v-2h2v2h2v-2h2v2h3v-3.6c1.7-1.2 3-3.1 3-5.9C21 5.8 17.5 2 12 2zM8.5 13.5a2 2 0 110-4 2 2 0 010 4zm7 0a2 2 0 110-4 2 2 0 010 4z"/></svg>';
const CREST = '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5zm0 4.2L9.6 10H7l2.1 1.9-.8 3.1L12 13.2l3.7 1.8-.8-3.1L17 10h-2.6z"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24"><path d="M4 6l8 6 8-6v4l-8 6-8-6z"/></svg>';

function emitter() {
  const L = {};
  return { on(e, f) { (L[e] ||= []).push(f); return () => { L[e] = L[e].filter((x) => x !== f); }; }, emit(e, ...a) { (L[e] || []).forEach((f) => f(...a)); } };
}
const pad2 = (n) => String(n).padStart(2, '0');

function levelStates(map, progress = {}, isOpen) {
  const out = map.levels.map((l, i) => {
    const stars = progress[l.id] || 0;
    const open = isOpen ? isOpen(l.id) : i === 0 || !!progress[map.levels[i - 1].id];
    return { l, i, stars, state: stars > 0 ? 'done' : open ? 'next' : 'locked', kind: l.boss ? 'boss' : l.elite ? 'elite' : 'std' };
  });
  let cur = out.findIndex((s) => s.state === 'next');
  if (cur < 0) cur = out.length - 1;
  return { list: out, cur };
}

// fallback backdrop when the image is missing: layered silhouette skyline/forest on a canvas
function proceduralBackdrop(theme, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, theme.bg[0]); gr.addColorStop(0.55, theme.bg[1]); gr.addColorStop(1, theme.bg[2]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const fantasy = theme.realm !== 'scifi';
  for (let layer = 0; layer < 3; layer++) {
    const base = h * (0.5 + layer * 0.1), a = 0.35 + layer * 0.25;
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += fantasy ? 12 : 18 + r() * 30) {
      const y = fantasy ? base - (Math.sin(x * 0.01 + layer) * 30 + r() * 50) : base - r() * (180 - layer * 40);
      if (fantasy) g.lineTo(x, y); else { g.lineTo(x, y); g.lineTo(x + 18, y); }
    }
    g.lineTo(w, h); g.fill();
    if (!fantasy) for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? theme.accent : theme.warm; g.globalAlpha = 0.2 + r() * 0.5; g.fillRect(r() * w, base - r() * 160, 2, 2); }
    g.globalAlpha = 1;
  }
  return c.toDataURL('image/jpeg', 0.8);
}

function roadSegments(pts) {
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    segs.push(`M${p1[0].toFixed(1)},${p1[1].toFixed(1)} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`);
  }
  return segs;
}

export function createStoryMap(container, opts = {}) {
  injectMapCss();
  const ev = emitter();
  const map = opts.map || DEMO_MAPS.find((m) => m.id === opts.mapId) || DEMO_MAPS[0];
  const index = opts.index ?? Math.max(0, (map.order || 1) - 1);
  const theme = themeFor(map, index);
  let progress = opts.progress || {};
  const root = document.createElement('div');
  root.className = `vpm r-${theme.realm}`;
  root.style.setProperty('--a', theme.accent); root.style.setProperty('--w', theme.warm);
  root.innerHTML = `<div class="vpm-bg"><img alt="" draggable="false"></div><div class="vpm-shade"></div>
    <div class="vpm-motes">${'<i></i>'.repeat(14)}</div><div class="vpm-track"><svg class="vpm-road"></svg><div class="vpm-nodes"></div></div>
    <div class="vpm-head"></div><div class="vpm-cta"></div><div class="vpm-rail"><div class="vpm-rail-fill"></div><div class="vpm-rail-thumb"></div></div>`;
  container.appendChild(root);
  const bgWrap = root.querySelector('.vpm-bg'), img = bgWrap.querySelector('img'), track = root.querySelector('.vpm-track');
  const svg = root.querySelector('.vpm-road'), nodesEl = root.querySelector('.vpm-nodes'), head = root.querySelector('.vpm-head');
  const cta = root.querySelector('.vpm-cta');
  const railFill = root.querySelector('.vpm-rail-fill'), railThumb = root.querySelector('.vpm-rail-thumb');
  // landscape: ui mounts its chest bar here, between the title and the stars (kept across header re-renders)
  const slot = document.createElement('div'); slot.className = 'vpm-slot';
  let wide = false;
  root.querySelectorAll('.vpm-motes i').forEach((m, i) => { m.style.left = (i * 37 % 100) + '%'; m.style.top = (20 + i * 53 % 70) + '%'; m.style.animationDelay = (-i * 1.7) + 's'; m.style.animationDuration = (9 + i % 5 * 2) + 's'; });

  let VW = 0, VH = 0, TW = 0, maxScroll = 0, x = 0, v = 0, raf = 0, pts = [], segLens = [], bgW = 0, bgH = 0;
  let st = levelStates(map, progress, opts.isOpen);
  let imgAspect = 1792 / 704, imgReady = false, bgTravel = 0, bgOff = 0;

  img.onload = () => { imgAspect = img.naturalWidth / img.naturalHeight; imgReady = true; root.classList.add('bg-ready'); layoutBg(); };
  img.onerror = () => { img.onerror = null; img.src = proceduralBackdrop(theme, 1400, 560); };
  img.src = backdropUrl(map, theme);

  function header() {
    if (opts.showTitle === false) { head.style.display = 'none'; return; }
    const done = st.list.filter((s) => s.stars).length, stars = st.list.reduce((a, s) => a + s.stars, 0);
    head.innerHTML = `${opts.showBack ? '<button class="vpm-back" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg></button>' : ''}
      <div class="vpm-title"><div class="k">${theme.realm === 'scifi' ? 'CHAPTER' : 'CHAPTER'} ${pad2(map.chapter || index + 1)} <span>// ${theme.name.toUpperCase()}</span></div>
      <div class="n">${map.name}</div></div>
      <div class="vpm-prog"><div class="s">${STAR}<b>${stars}</b>/${map.levels.length * 3}</div><div class="c">${done}/${map.levels.length} CLEARED</div></div>`;
    head.querySelector('.vpm-back')?.addEventListener('click', () => ev.emit('back'));
    head.insertBefore(slot, head.querySelector('.vpm-prog'));
  }

  function drawCta() {
    if (opts.cta === false) { cta.style.display = 'none'; return; }
    const s = st.list[st.cur], l = s.l;
    const allDone = st.list.every((q) => q.state === 'done');
    cta.innerHTML = `<div class="i"><div class="k">${allDone ? 'CHAPTER COMPLETE' : s.kind === 'boss' ? 'BOSS CONTRACT' : s.kind === 'elite' ? 'ELITE CONTRACT' : 'NEXT CONTRACT'} ${pad2(l.node ?? s.i + 1)}</div>
      <div class="n">${l.name || ''}</div>${l.power ? `<div class="p">REC. POWER <b>${l.power.toLocaleString()}</b></div>` : ''}</div>
      <button class="go" type="button">${allDone ? 'REPLAY' : 'DEPLOY'}<svg viewBox="0 0 24 24"><path d="M8 4l9 8-9 8z"/></svg></button>`;
    cta.querySelector('.go').addEventListener('click', () => ev.emit('level', l.id));
    cta.querySelector('.i').addEventListener('click', () => centerOn(l.id));
  }

  function layout() {
    VW = root.clientWidth; VH = root.clientHeight;
    wide = VW / Math.max(1, VH) >= 1;
    root.classList.toggle('wide', wide);
    root.classList.toggle('short', wide && VH < 400);
    const n = map.levels.length;
    const sp = wide ? Math.max(96, Math.min(140, VW * 0.12)) : Math.max(80, Math.min(112, VW * 0.215));
    const left = Math.min(VW * 0.22, 90), right = Math.min(VW * 0.3, 120);
    TW = Math.max(VW, left + right + sp * (n - 1));
    maxScroll = Math.max(0, TW - VW);
    let yAt;
    if (wide) {
      // the road lives in the free band between the head and the CTA + rail
      const rr = root.getBoundingClientRect();
      const top = (opts.showTitle === false ? 0 : head.getBoundingClientRect().bottom - rr.top) + 24;
      const bot = (opts.cta === false ? root.querySelector('.vpm-rail').getBoundingClientRect().top : cta.getBoundingClientRect().top) - rr.top - 46; // room for the name plate / stars under a node
      const mid = (top + bot) / 2, A = Math.max(0, bot - top) * 0.30;
      yAt = (l, i) => (l.y != null ? VH * l.y : mid + A * (Math.sin(i * 1.15 + 0.4) + 0.33 * Math.sin(i * 2.9 + 1)));
    } else {
      const band = { mid: 0.53, amp: VH > 600 ? 0.15 : 0.11 };
      yAt = (l, i) => VH * (l.y != null ? l.y : band.mid + band.amp * Math.sin(i * 1.15 + 0.4) + 0.05 * Math.sin(i * 2.9 + 1));
    }
    pts = map.levels.map((l, i) => [l.x != null ? left + l.x * (TW - left - right) : left + i * sp, yAt(l, i)]);
    track.style.width = TW + 'px';
    svg.setAttribute('width', TW); svg.setAttribute('height', VH); svg.setAttribute('viewBox', `0 0 ${TW} ${VH}`);
    drawRoad(); drawNodes(); layoutBg(); apply();
  }

  function layoutBg() {
    // backdrop covers the height; it drifts at most ~60% of the track speed, centred on the image's middle
    // (landscape: wider so the parallax keeps some travel, anchored on the horizon at 0.45)
    bgH = VH; bgW = Math.max(VW * (wide ? 1.25 : 1.05), VH * imgAspect);
    if (bgW / bgH > imgAspect) bgH = bgW / imgAspect;
    img.style.width = bgW + 'px'; img.style.height = bgH + 'px';
    img.style.top = ((VH - bgH) * (wide ? 0.45 : 0.5)) + 'px';
    bgTravel = Math.min(bgW - VW, maxScroll * 0.6);
    bgOff = (bgW - VW - bgTravel) / 2;
    apply();
  }

  function drawRoad(animIdx = -1) {
    const segs = roadSegments(pts);
    const fantasy = theme.realm !== 'scifi';
    let html = '';
    const full = segs.join(' ');
    html += `<path class="rd-shadow" d="${full}"/>`;
    html += `<path class="rd-base" d="${full}"/>`;
    if (fantasy) html += `<path class="rd-stones" d="${full}"/><path class="rd-stones2" d="${full}"/>`;
    else html += `<path class="rd-rail" d="${full}"/>`;
    segs.forEach((d, i) => {
      const lit = st.list[i + 1].state !== 'locked';
      if (lit) html += `<path class="rd-glow${i === animIdx ? ' anim' : ''}" data-i="${i}" d="${d}"/><path class="rd-core${i === animIdx ? ' anim' : ''}" data-i="${i}" d="${d}"/>`;
      else html += `<path class="rd-todo" d="${d}"/>`;
    });
    svg.innerHTML = html;
    if (animIdx >= 0) {
      svg.querySelectorAll('.anim').forEach((p) => {
        const L = p.getTotalLength();
        p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = L;
        p.getBoundingClientRect();
        p.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(.5,0,.3,1)';
        requestAnimationFrame(() => { p.style.strokeDashoffset = 0; });
      });
    }
  }

  function nodeHtml(s) {
    const fantasy = theme.realm !== 'scifi';
    const icon = s.state === 'locked' ? LOCK : s.kind === 'boss' ? (fantasy ? CREST : SKULL) : '';
    const num = s.state === 'locked' && s.kind === 'std' ? '' : `<b>${s.l.node ?? s.i + 1}</b>`;
    const stars = s.state === 'done' ? `<span class="stars">${[1, 2, 3].map((k) => `<i class="${k <= s.stars ? 'on' : ''}">${STAR}</i>`).join('')}</span>` : '';
    const tag = s.i === st.cur && s.state === 'next' ? `<span class="tag">${s.kind === 'boss' ? 'BOSS' : 'NEXT'}${CHEV}</span><span class="nm">${s.l.name || ''}</span>`
      : s.kind === 'boss' ? '<span class="tag dim">BOSS</span>' : s.kind === 'elite' ? '<span class="tag dim elite">ELITE</span>' : '';
    return `<span class="ring"></span><span class="hex">${s.kind !== 'boss' && s.state === 'locked' ? icon : (s.kind === 'boss' ? icon + num : num)}</span>${stars}${tag}`;
  }

  function drawNodes(popIdx = -1) {
    nodesEl.innerHTML = '';
    st.list.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `vpm-node s-${s.state} k-${s.kind}${i === st.cur && s.state === 'next' ? ' cur' : ''}${i === popIdx ? ' pop' : ''}`;
      b.style.left = pts[i][0] + 'px'; b.style.top = pts[i][1] + 'px';
      b.dataset.id = s.l.id;
      b.innerHTML = nodeHtml(s);
      nodesEl.appendChild(b);
    });
  }

  function apply() {
    x = Math.max(-60, Math.min(maxScroll + 60, x));
    track.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
    const k = maxScroll > 0 ? Math.max(0, Math.min(1, x / maxScroll)) : 0;
    img.style.transform = `translate3d(${(-(bgOff + bgTravel * k)).toFixed(1)}px,0,0)`;
    root.style.setProperty('--mx', (-k * 120).toFixed(1) + 'px');
    const cleared = st.list.filter((s) => s.state === 'done').length / Math.max(1, st.list.length);
    railFill.style.width = (cleared * 100) + '%';
    const vis = maxScroll > 0 ? VW / TW : 1;
    railThumb.style.width = (vis * 100) + '%'; railThumb.style.left = (k * (1 - vis) * 100) + '%';
  }

  // momentum drag + wheel; taps on nodes fire 'level'
  const drag = { id: null, x0: 0, last: 0, t: 0, moved: 0, samples: [] };
  function tick() {
    raf = 0;
    if (drag.id !== null) return;
    let moving = false;
    if (Math.abs(v) > 4) { x += v / 60; v *= 0.94; moving = true; } else v = 0;
    const over = x < 0 ? x : x > maxScroll ? x - maxScroll : 0;
    if (over) { x -= over * 0.18; v *= 0.6; moving = moving || Math.abs(over) > 0.5; if (Math.abs(over) <= 0.5) x -= over; }
    if (anim) { const t = Math.min(1, (performance.now() - anim.t0) / anim.dur), e = 1 - Math.pow(1 - t, 3); x = anim.from + (anim.to - anim.from) * e; moving = t < 1; if (t >= 1) anim = null; }
    apply();
    if (moving) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  let anim = null;
  function onDown(e) {
    if (drag.id !== null) return;
    drag.id = e.pointerId; drag.x0 = drag.last = e.clientX; drag.moved = 0; drag.samples = [[performance.now(), e.clientX]]; v = 0; anim = null;
    drag.target = e.target.closest('.vpm-node');
  }
  function onMove(e) {
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.last; drag.last = e.clientX; drag.moved += Math.abs(dx);
    const over = x < 0 || x > maxScroll;
    x -= over ? dx * 0.4 : dx;
    drag.samples.push([performance.now(), e.clientX]); if (drag.samples.length > 6) drag.samples.shift();
    apply();
  }
  function onUp(e) {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    const s = drag.samples, a = s[0], b = s[s.length - 1];
    if (b && a && b[0] - a[0] > 0 && performance.now() - b[0] < 80) v = -(b[1] - a[1]) / ((b[0] - a[0]) / 1000);
    v = Math.max(-4000, Math.min(4000, v));
    if (drag.moved < 8 && drag.target) {
      const id = drag.target.dataset.id, s2 = st.list.find((q) => q.l.id === id);
      if (s2 && s2.state !== 'locked') { drag.target.classList.add('tap'); setTimeout(() => drag.target?.classList.remove('tap'), 180); ev.emit('level', id); }
      else if (s2) { drag.target.classList.remove('shake'); void drag.target.offsetWidth; drag.target.classList.add('shake'); ev.emit('locked', id); }
    }
    kick();
  }
  function onWheel(e) { e.preventDefault(); x += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY); anim = null; apply(); kick(); }
  root.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  root.addEventListener('wheel', onWheel, { passive: false });

  function centerOn(levelId, animate = true) {
    const i = Math.max(0, st.list.findIndex((s) => s.l.id === levelId));
    const to = Math.max(0, Math.min(maxScroll, pts[i][0] - VW * 0.5));
    if (!animate) { x = to; apply(); return; }
    anim = { from: x, to, t0: performance.now(), dur: 900 }; kick();
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const keep = st.list[st.cur]?.l.id; layout(); centerOn(keep, false); }) : null;
  header(); drawCta(); layout();
  // start a little left of the current node and glide onto it
  const curId = st.list[st.cur].l.id;
  const animIdx = (opts.animateUnlock || opts.justUnlocked) ? Math.max(0, st.list.findIndex((s) => s.l.id === (opts.justUnlocked || curId)) - 1) : -1;
  centerOn(st.list[Math.max(0, st.cur - 2)].l.id, false);
  setTimeout(() => centerOn(curId, true), 60);
  if (animIdx >= 0 && st.list[animIdx + 1].state !== 'locked') setTimeout(() => { drawRoad(animIdx); setTimeout(() => drawNodes(animIdx + 1), 1100); }, 500);
  ro?.observe(root);

  return {
    el: root, on: ev.on, centerOn, headSlot: slot,
    get wide() { return wide; },
    get state() { return { mapId: map.id, theme: theme.id, realm: theme.realm, current: curId, scroll: x, maxScroll, nodes: st.list.map((s) => ({ id: s.l.id, state: s.state, stars: s.stars, kind: s.kind })) }; },
    setProgress(p, { animate = true } = {}) {
      const prevCur = st.cur; progress = p; st = levelStates(map, progress, opts.isOpen); header(); drawCta();
      if (animate && st.cur > prevCur) { drawRoad(st.cur - 1); drawNodes(-1); setTimeout(() => drawNodes(st.cur), 1100); centerOn(st.list[st.cur].l.id); }
      else { drawRoad(); drawNodes(); }
    },
    dispose() {
      cancelAnimationFrame(raf); ro?.disconnect();
      removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
      root.remove();
    },
  };
}

export function createMapSelect(container, { maps = DEMO_MAPS, progress = {}, isOpen, title = 'CAMPAIGN' } = {}) {
  injectMapCss();
  const ev = emitter();
  const root = document.createElement('div'); root.className = 'vpms';
  const cards = maps.map((m, i) => {
    const th = themeFor(m, i);
    const stars = m.levels.reduce((a, l) => a + (progress[l.id] || 0), 0), done = m.levels.filter((l) => progress[l.id]).length;
    const open = isOpen ? isOpen(m.levels[0].id) : i === 0 || !!progress[maps[i - 1].levels.at(-1).id];
    const pct = Math.round(done / m.levels.length * 100);
    return `<button class="vpms-card r-${th.realm}${open ? '' : ' locked'}${open && done < m.levels.length ? ' active' : ''}" data-id="${m.id}" style="--a:${th.accent};--w:${th.warm};--img:url('${thumbUrl(m, th)}')">
      <span class="ph"></span><span class="sh"></span>
      <span class="no">${pad2(m.chapter || i + 1)}</span>
      <span class="tx"><span class="k">CHAPTER ${pad2(m.chapter || i + 1)} // ${th.name.toUpperCase()}${th.realm !== 'scifi' ? ' <em>RIFT</em>' : ''}</span><span class="n">${m.name}</span>
      <span class="meta">${open ? `<span class="bar"><i style="width:${pct}%"></i></span><span class="st">${STAR}${stars}/${m.levels.length * 3}</span>` : `<span class="lk">${LOCK} Clear chapter ${pad2(i)} to unlock</span>`}</span></span>
    </button>`;
  }).join('');
  root.innerHTML = `<div class="vpms-head"><div class="k">VECTOR PROTOCOL</div><div class="n">${title}</div></div><div class="vpms-list">${cards}</div>`;
  container.appendChild(root);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => root.classList.toggle('wide', root.clientWidth >= root.clientHeight)) : null;
  ro?.observe(root);
  root.addEventListener('click', (e) => {
    const c = e.target.closest('.vpms-card'); if (!c) return;
    if (c.classList.contains('locked')) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); return; }
    ev.emit('map', c.dataset.id);
  });
  return { el: root, on: ev.on, dispose() { ro?.disconnect(); root.remove(); } };
}
