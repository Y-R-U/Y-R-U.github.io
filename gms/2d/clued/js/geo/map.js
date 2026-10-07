// CLUED map component. SVG, projected once; pan/zoom via a CSS transform during gestures, committed on release.
// API documented in docs/notes/M.md.
import { makeProjection, projectedBox, greatCircle } from './proj.js?v=202610071336';
import { features as topoFeatures } from './topo.js?v=202610071336';
import { loadIndex, loadWorld, loadRegionFile, loadStatesFile, loadMarine, geo, isPlayable, regionMembers } from './data.js?v=202610071336';
import { regionFor } from './regions.js?v=202610071336';
import { injectStyle, POLITICAL, CONTINENT_FILL } from './style.js?v=202610071336';

const NS = 'http://www.w3.org/2000/svg';
const U = 1000;
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

export function createMap(el, opts = {}) {
  injectStyle();
  const o = {
    region: 'world', target: 'countries', set: 'states', style: 'plain', interactive: true, tapAssist: true,
    controls: true, maxZoom: null, padding: 12, bigTargets: false, labels: false, ...opts,
  };
  const region = { ...(typeof o.region === 'string' ? regionFor(o.region) : o.region) };
  if (!region.key && !region.frame) throw new Error('Unknown map region ' + o.region);
  let proj = null;
  el.classList.add('gm');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  if (o.bigTargets) el.classList.add('big');
  el.innerHTML = '<div class="gm-load">Loading map…</div>';

  const svg = svgEl('svg', { class: 'gm-svg' });
  const view = svgEl('g');
  const L = {};
  for (const k of ['grat', 'marine', 'ctx', 'land', 'inset', 'dots', 'lines', 'marks', 'labels']) { L[k] = svgEl('g', { class: 'gm-' + k }); view.append(L[k]); }
  svg.append(view);
  const ui = document.createElement('div'); ui.className = 'gm-ui';
  const toastEl = document.createElement('div'); toastEl.className = 'gm-toast';

  let W = 0, H = 0, T = { k: 1, x: 0, y: 0 }, live = null, fitK = 1, home = null, frameU = null, refit = false;
  let locked = false, destroyed = false, anim = 0;
  const feats = new Map();          // id -> { id, el, dot, lp:[x,y], box:[x0,y0,x1,y1], playable, layer, props }
  const marks = new Map();
  const labels = new Map();
  const insets = [];
  const fillers = [];
  const dotR = () => (o.bigTargets ? 8 : region.proj === 'equalEarth' ? 4 : 5.5);

  const project = (lon, lat) => { const p = proj(lon, lat); return [p[0] * U, p[1] * U]; };
  const insetFor = id => insets.find(i => i.ids.includes(id));
  const insetForPoint = (lon, lat) => insets.find(i => i.mb && lon >= i.mb[0] && lon <= i.mb[2] && lat >= i.mb[1] && lat <= i.mb[3]);
  const applyInset = (inset, p) => (inset ? [(p[0] - inset.a[0]) * inset.s + inset.t[0], (p[1] - inset.a[1]) * inset.s + inset.t[1]] : p);
  const pointU = (lon, lat, featureId) => applyInset(featureId ? insetFor(featureId) : insetForPoint(lon, lat), project(lon, lat));

  function pathOf(polys, inset) {
    let d = '';
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const dp = region.proj === 'equalEarth' ? 1 : 2;
    for (const poly of polys) for (const ring of poly) {
      if (ring.length < 3) continue;
      if (!ring.every(([lon, lat]) => proj.visible(lon, lat))) continue;
      let s = '';
      for (let i = 0; i < ring.length; i++) {
        const p = applyInset(inset, project(ring[i][0], ring[i][1]));
        s += (i ? 'L' : 'M') + p[0].toFixed(dp) + ' ' + p[1].toFixed(dp);
        if (p[0] < box[0]) box[0] = p[0]; if (p[0] > box[2]) box[2] = p[0];
        if (p[1] < box[1]) box[1] = p[1]; if (p[1] > box[3]) box[3] = p[1];
      }
      d += s + 'Z';
    }
    return { d, box };
  }

  function boxOfLonLat(bb, featureId) {
    const inset = featureId ? insetFor(featureId) : null;
    const b = projectedBox(proj, bb, 6);
    const a = applyInset(inset, [b[0] * U, b[1] * U]), c = applyInset(inset, [b[2] * U, b[3] * U]);
    return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])];
  }

  // ---------- build ----------
  async function build() {
    await loadIndex();
    const C = geo.countries;
    if (!region.frame) region.frame = C[region.states]?.mb || [-180, -60, 180, 80];
    proj = makeProjection(region);
    const members = o.members || (region.states ? null : regionMembers(region.key, o.set));
    const playFn = o.playable || (region.states ? () => true : id => isPlayable(id, o.set) && (!members || members.includes(id)));
    let mainTopo, mainObj, ctxObj = null;
    if (region.states) { mainTopo = await loadStatesFile(region.states); mainObj = 'states'; ctxObj = 'context'; }
    else { mainTopo = region.file ? await loadRegionFile(region.file) : await loadWorld(); mainObj = 'countries'; }
    if (destroyed) return;
    for (const ins of region.insets || []) insets.push({ ...ins, s: ins.scale ?? 1 });
    const mainF = topoFeatures(mainTopo, mainObj);
    // inset anchors: main-part centre of each inset feature -> projected `to`
    for (const ins of insets) {
      const f = mainF.find(x => ins.ids.includes(x.id));
      ins.mb = f?.props.mb || C[ins.ids[0]]?.mb;
      if (!ins.mb) continue;
      const b = projectedBox(proj, ins.mb, 6);
      ins.a = [(b[0] + b[2]) / 2 * U, (b[1] + b[3]) / 2 * U];
      ins.t = project(...ins.to);
    }
    const colorOf = politicalColours(mainF.map(f => f.id));
    const marineMode = o.target === 'marine';
    const targetLayer = marineMode ? L.marine : L.land;
    if (region.proj === 'equalEarth') drawGraticule();
    if (ctxObj) for (const f of topoFeatures(mainTopo, ctxObj)) {
      const { d } = pathOf(f.polys, null);
      if (d) L.ctx.append(svgEl('path', { d, class: 'gm-c', 'data-id': f.id }));
    }
    for (const f of mainF) {
      const inset = insetFor(f.id);
      const { d, box } = pathOf(f.polys, inset);
      const meta = region.states ? f.props : C[f.id] || {};
      const playable = !marineMode && o.target !== 'none' && playFn(f.id);
      const nonPlay = !region.states && meta.k === 'x';
      const p = svgEl('path', { d, 'data-id': f.id, class: 'gm-f ' + (playable ? 'on' : nonPlay ? 'np' : (o.target === 'none' || marineMode ? '' : 'off')) });
      fillers.push(() => {
        const on = !nonPlay && (o.style === 'political' || o.style === 'continents') && !(o.target !== 'none' && !playable && !marineMode);
        p.style.fill = !on ? '' : o.style === 'continents' ? (CONTINENT_FILL[meta.c] || '') : colorOf(f.id);
      });
      fillers[fillers.length - 1]();
      (marineMode ? L.land : L.land).append(p);
      const lp = meta.lp ? pointU(meta.lp[0], meta.lp[1], f.id) : (isFinite(box[0]) ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : null);
      const rec = { id: f.id, el: p, playable, layer: 'land', lp, box: isFinite(box[0]) ? box : null, props: meta, dot: null, mb: meta.mb };
      if (((playable && o.dots !== false) || o.dotFor?.includes(f.id)) && lp) {
        rec.dot = svgEl('circle', { class: 'gm-dot on hide', 'data-id': f.id, cx: lp[0].toFixed(2), cy: lp[1].toFixed(2), r: 1 });
        L.dots.append(rec.dot);
      }
      if (!marineMode) feats.set(f.id, rec);
    }
    for (const ins of insets) {
      const r = ins.ids.map(id => feats.get(id)?.box).filter(Boolean);
      if (!r.length) continue;
      const b = r.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]);
      const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.08;
      L.inset.append(svgEl('rect', { class: 'gm-inset', x: b[0] - pad, y: b[1] - pad, width: b[2] - b[0] + 2 * pad, height: b[3] - b[1] + 2 * pad, rx: pad }));
    }
    if (marineMode) {
      const { topo, info } = await loadMarine();
      if (destroyed) return;
      const mplay = o.playable || (() => true);
      for (const f of topoFeatures(topo, 'marine')) {
        const { d, box } = pathOf(f.polys, null);
        if (!d) continue;
        const m = info[f.id] || {};
        const playable = mplay(f.id);
        const p = svgEl('path', { d, 'data-id': f.id, class: 'gm-f ' + (playable ? 'on' : '') });
        targetLayer.append(p);
        feats.set(f.id, { id: f.id, el: p, playable, layer: 'marine', lp: m.lp ? project(...m.lp) : null, box, props: m, dot: null, mb: m.mb });
      }
      L.land.style.pointerEvents = 'none';
    }
    const frame = o.frame || region.frame;
    const fb = projectedBox(proj, frame);
    frameU = [fb[0] * U, fb[1] * U, fb[2] * U, fb[3] * U];
    el.innerHTML = '';
    el.append(svg, toastEl);
    if (o.controls && o.interactive) { buildControls(); el.append(ui); }
    measure();
    goHome(false);
    if (o.interactive) bindGestures();
    new ResizeObserver(() => {
      if (destroyed) return;
      const prev = { W, H, T: cur(), fitK, home };
      if (!measure()) return;
      if (!prev.W || !prev.H) return goHome(false);
      // keep the same centre and relative zoom when the container changes size
      const wasHome = Math.abs(prev.T.k - prev.home.k) < 1e-9 && Math.abs(prev.T.x - prev.home.x) < 0.5 && Math.abs(prev.T.y - prev.home.y) < 0.5;
      const cx = (prev.W / 2 - prev.T.x) / prev.T.k, cy = (prev.H / 2 - prev.T.y) / prev.T.k, rel = prev.T.k / prev.fitK;
      goHome(false);
      if (!wasHome) { const k = fitK * rel; commit(clampT({ k, x: W / 2 - cx * k, y: H / 2 - cy * k })); }
    }).observe(el);
  }

  function politicalColours(ids) {
    const col = {};
    for (const id of ids.slice().sort((a, b) => (geo.countries[b]?.nb?.length || 0) - (geo.countries[a]?.nb?.length || 0))) {
      const used = new Set((geo.countries[id]?.nb || []).map(n => col[n]));
      let c = 0; while (used.has(c)) c++;
      col[id] = c % POLITICAL.length;
    }
    return id => POLITICAL[col[id] ?? 0];
  }

  function drawGraticule() {
    let d = '';
    for (let lon = -180; lon <= 180; lon += 30) {
      d += 'M' + Array.from({ length: 37 }, (_, i) => project(lon, -90 + i * 5).map(v => v.toFixed(1)).join(' ')).join('L');
    }
    for (let lat = -60; lat <= 80; lat += 20) {
      d += 'M' + Array.from({ length: 73 }, (_, i) => project(-180 + i * 5, lat).map(v => v.toFixed(1)).join(' ')).join('L');
    }
    L.grat.append(svgEl('path', { class: 'gm-grat', d }));
    const edge = [...Array.from({ length: 61 }, (_, i) => project(-180, -90 + i * 3)), ...Array.from({ length: 61 }, (_, i) => project(180, 90 - i * 3))];
    L.grat.append(svgEl('path', { class: 'gm-sphere', d: 'M' + edge.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'Z' }));
  }

  function buildControls() {
    const mk = (txt, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); ui.append(b); };
    mk('+', 'Zoom in', () => zoomBy(2));
    mk('−', 'Zoom out', () => zoomBy(0.5));
    mk('⤢', 'Reset view', () => goHome(true));
  }

  // ---------- view transform ----------
  function measure() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (r.width === W && r.height === H)) return false;
    W = r.width; H = r.height;
    svg.setAttribute('viewBox', `0 0 ${2 * W} ${2 * H}`);
    return true;
  }
  const pad = () => { const p = o.padding; return typeof p === 'number' ? { t: p, r: p, b: p, l: p } : { t: 12, r: 12, b: 12, l: 12, ...p }; };
  function fitBox(b, padFrac = 0) {
    const P = pad();
    const bw = (b[2] - b[0]) * (1 + padFrac * 2) || 1, bh = (b[3] - b[1]) * (1 + padFrac * 2) || 1;
    const k = Math.min((W - P.l - P.r) / bw, (H - P.t - P.b) / bh);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { k, x: P.l + (W - P.l - P.r) / 2 - cx * k, y: P.t + (H - P.t - P.b) / 2 - cy * k };
  }
  const zoomRange = () => [fitK * 0.8, fitK * (o.maxZoom || (region.states ? 14 : region.proj === 'equalEarth' ? 40 : 28))];
  function clampT(t) {
    const [kmin, kmax] = zoomRange();
    let k = Math.min(kmax, Math.max(kmin, t.k));
    const cx = (W / 2 - t.x) / t.k, cy = (H / 2 - t.y) / t.k;   // centre in U
    const fw = frameU[2] - frameU[0], fh = frameU[3] - frameU[1];
    const ccx = Math.min(frameU[2] + fw * 0.15, Math.max(frameU[0] - fw * 0.15, cx));
    const ccy = Math.min(frameU[3] + fh * 0.15, Math.max(frameU[1] - fh * 0.15, cy));
    return { k, x: W / 2 - ccx * k, y: H / 2 - ccy * k };
  }
  function commit(t) {
    T = t; live = null;
    view.setAttribute('transform', `translate(${(T.x + W / 2).toFixed(2)} ${(T.y + H / 2).toFixed(2)}) scale(${T.k.toFixed(5)})`);
    svg.style.transform = '';
    el.classList.remove('live');
    refreshScaled();
  }
  function setLive(t) {
    const s = t.k / T.k;
    if (s > 2.2 || s < 0.55 || Math.abs(t.x - s * T.x) > W * 0.45 || Math.abs(t.y - s * T.y) > H * 0.45) return commit(t);
    live = t;
    el.classList.add('live');
    svg.style.transform = `translate(${(t.x - s * T.x).toFixed(1)}px,${(t.y - s * T.y).toFixed(1)}px) scale(${s.toFixed(4)})`;
  }
  const cur = () => live || T;
  function refreshScaled() {
    const k = T.k, r = dotR() / k;
    for (const f of feats.values()) {
      if (!f.dot) continue;
      const small = !f.box || Math.max(f.box[2] - f.box[0], f.box[3] - f.box[1]) * k < (o.bigTargets ? 14 : 7);
      f.dot.classList.toggle('hide', !small);
      if (small) f.dot.setAttribute('r', r.toFixed(3));
    }
    for (const m of marks.values()) m.g.setAttribute('transform', `translate(${m.p[0].toFixed(2)} ${m.p[1].toFixed(2)}) scale(${(1 / k).toFixed(5)})`);
    for (const l of labels.values()) { l.el.style.fontSize = (l.size / k).toFixed(4) + 'px'; l.el.style.strokeWidth = (3.5 / k).toFixed(4) + 'px'; }
  }
  function goHome(animate) {
    let t = fitBox(frameU);
    fitK = t.k;
    // Portrait screens: a wide frame would be a thin strip, so start zoomed in on its centre (pan for the rest).
    // gm-fit tells the layout how tall the box needs to be at this width, so it can drop the empty ocean bands;
    // it depends only on the width, so shrinking the box never feeds back into it.
    const P = pad(), bw = frameU[2] - frameU[0], bh = frameU[3] - frameU[1];
    const fhW = bh * (W - P.l - P.r) / (bw || 1), fh = bh * t.k;
    const want = o.portraitZoom !== false && innerHeight > innerWidth * 1.15 ? (region.proj === 'equalEarth' ? 1.7 : 1) : 1;
    const z = Math.min(want, (H * 0.92) / fh);
    if (z > 1.05) { const cx = (W / 2 - t.x) / t.k, cy = (H / 2 - t.y) / t.k; t = { k: t.k * z, x: W / 2 - cx * t.k * z, y: H / 2 - cy * t.k * z }; }
    el.dispatchEvent(new CustomEvent('gm-fit', { bubbles: true, detail: { h: fhW * want + P.t + P.b } }));
    // the layout may have resized the box just now: fit again at once, before any fly-to starts from a stale size
    if (!refit && measure()) { refit = true; try { return goHome(animate); } finally { refit = false; } }
    home = t;
    animate ? animateTo(t) : commit(t);
  }
  function zoomBy(f, x = W / 2, y = H / 2, animate = true) {
    const c = cur();
    const t = clampT({ k: c.k * f, x: x - (x - c.x) * f, y: y - (y - c.y) * f });
    t.x = x - (x - c.x) * (t.k / c.k); t.y = y - (y - c.y) * (t.k / c.k);
    animate ? animateTo(clampT(t), 320) : setLive(clampT(t));
  }
  function animateTo(t, ms = 650) {
    cancelAnimationFrame(anim);
    const a = cur(), t0 = performance.now();
    const ca = [(W / 2 - a.x) / a.k, (H / 2 - a.y) / a.k], cb = [(W / 2 - t.x) / t.k, (H / 2 - t.y) / t.k];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise(res => {
      const step = now => {
        const u = reduce ? 1 : Math.min(1, (now - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
        const k = Math.exp(Math.log(a.k) + (Math.log(t.k) - Math.log(a.k)) * e);
        const cx = ca[0] + (cb[0] - ca[0]) * e, cy = ca[1] + (cb[1] - ca[1]) * e;
        const s = { k, x: W / 2 - cx * k, y: H / 2 - cy * k };
        if (u >= 1) { commit(t); res(); } else { setLive(s); anim = requestAnimationFrame(step); }
      };
      anim = requestAnimationFrame(step);
    });
  }

  // ---------- gestures ----------
  function bindGestures() {
    const pts = new Map();
    let start = null, moved = false, pinch = null, lastTap = null, wheelTimer = 0;
    const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.gm-ui')) return;
      cancelAnimationFrame(anim);
      if (live) commit(live);
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { start = { p: local(e), t: e.timeStamp, T: { ...T } }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], T: { ...cur() } }; moved = true; }
    });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const f = d / pinch.d, P = pinch.T;
        const t = clampT({ k: P.k * f, x: m[0] - (pinch.m[0] - P.x) * f, y: m[1] - (pinch.m[1] - P.y) * f });
        setLive(t);
      } else if (start && pts.size === 1) {
        const p = local(e), dx = p[0] - start.p[0], dy = p[1] - start.p[1];
        if (!moved && Math.hypot(dx, dy) > 7) moved = true;
        if (moved) setLive(clampT({ k: start.T.k, x: start.T.x + dx, y: start.T.y + dy }));
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 1 && pinch) { pinch = null; const [p] = [...pts.values()]; start = { p, t: 0, T: { ...cur() } }; return; }
      if (pts.size) return;
      const wasTap = start && !moved && e.type === 'pointerup' && e.timeStamp - start.t < 700;
      if (live) commit(live);
      pinch = null;
      if (!wasTap) { start = null; return; }
      const [x, y] = local(e);
      const now = e.timeStamp;
      const dbl = lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30;
      if (dbl && (locked || !lastTap.hit)) { lastTap = null; zoomBy(2, x, y); return; }
      const hit = tap(x, y, e);
      lastTap = { t: now, x, y, hit: !!(hit && (hit.playable || hit.marker)) };
      start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = local(e);
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), x, y, false);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => live && commit(live), 160);
    }, { passive: false });
  }

  // ---------- hit testing ----------
  function screenOf(pU, t = T) { return [pU[0] * t.k + t.x, pU[1] * t.k + t.y]; }
  function elementsAt(x, y) {
    const r = el.getBoundingClientRect();
    return document.elementsFromPoint(r.left + x, r.top + y).filter(n => el.contains(n));
  }
  function idAt(x, y) {
    const n = elementsAt(x, y).find(n => n.dataset?.id && (n.classList.contains('gm-f') || n.classList.contains('gm-dot')) && !n.classList.contains('hide'));
    return n ? n.dataset.id : null;
  }
  function hitTest(x, y) {
    const lonlat = invert(x, y);
    const base = { x, y, lon: lonlat?.[0], lat: lonlat?.[1] };
    const R = o.bigTargets ? 34 : 22;
    const tapMarks = [...marks.values()].filter(m => m.tap).map(m => ({ m, d: Math.hypot(...screenOf(m.p).map((v, i) => v - [x, y][i])) })).filter(c => c.d < R + 4).sort((a, b) => a.d - b.d);
    if (tapMarks.length) return { ...base, marker: tapMarks[0].m.id, playable: true };
    const dots = [...feats.values()].filter(f => f.dot && !f.dot.classList.contains('hide')).map(f => ({ f, d: Math.hypot(...screenOf(f.lp).map((v, i) => v - [x, y][i])) }));
    const topDot = elementsAt(x, y).find(n => n.classList?.contains('gm-dot') && !n.classList.contains('hide'));
    if (topDot) {
      const onDots = dots.filter(c => c.d <= dotR() + 2);
      if (onDots.length > 1) return { ...base, ambiguous: onDots.map(c => c.f.id) };
      const f = feats.get(topDot.dataset.id);
      return { ...base, id: f.id, playable: f.playable };
    }
    const direct = idAt(x, y);
    const df = direct && feats.get(direct);
    if (df && df.playable) return { ...base, id: direct, playable: true };
    if (!o.tapAssist) return { ...base, id: direct, playable: !!df?.playable };
    const cands = new Set(dots.filter(c => c.d < R && c.f.playable).map(c => c.f.id));
    for (const rr of [R * 0.4, R * 0.75, R]) for (let a = 0; a < 8; a++) {
      const id = idAt(x + rr * Math.cos(a * Math.PI / 4), y + rr * Math.sin(a * Math.PI / 4));
      if (id && feats.get(id)?.playable) cands.add(id);
    }
    if (cands.size === 1) return { ...base, id: [...cands][0], playable: true, snapped: true };
    if (cands.size > 1) return { ...base, ambiguous: [...cands] };
    return { ...base, id: direct, playable: false };
  }
  function tap(x, y, ev) {
    const hit = hitTest(x, y);
    if (hit.ambiguous && !locked) {
      zoomBy(Math.min(4, zoomRange()[1] / T.k), x, y);
      toast('Zoomed in, tap again');
      return null;
    }
    if (hit.id) hit.props = feats.get(hit.id)?.props;
    o.onTap?.(hit, ev);
    return hit;
  }
  function invert(x, y) {
    const t = cur();
    let p = [(x - t.x) / t.k, (y - t.y) / t.k];
    for (const ins of insets) {
      if (!ins.a) continue;
      const box = ins.ids.map(id => feats.get(id)?.box).find(Boolean);
      if (box && p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]) { p = [(p[0] - ins.t[0]) / ins.s + ins.a[0], (p[1] - ins.t[1]) / ins.s + ins.a[1]]; break; }
    }
    return proj.invert(p[0] / U, p[1] / U);
  }

  let toastTimer = 0;
  function toast(msg, ms = 1600) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ---------- public API ----------
  const ready = build().then(() => api);
  const api = {
    ready, el, region,
    get zoom() { return T.k / fitK; },
    setState(id, state) {
      const f = feats.get(id); if (!f) return;
      for (const n of [f.el, f.dot]) if (n) { n.classList.forEach(c => c.startsWith('is-') && n.classList.remove(c)); if (state) state.split(' ').forEach(s => n.classList.add('is-' + s)); }
      if (state && f.dot) f.dot.parentNode.append(f.dot);
    },
    clearStates() { for (const id of feats.keys()) api.setState(id, null); },
    setStyle(style) { o.style = style; fillers.forEach(f => f()); },
    setLocked(b) { locked = !!b; el.classList.toggle('locked', locked); },
    flyTo(target, { pad: padFrac = 0.18, maxZoom = 8, duration = 700 } = {}) {
      let b = null;
      if (target === 'home') return animateTo(home, duration);
      const boxOf = id => { const f = feats.get(id); if (!f) return null; const bb = f.mb ? boxOfLonLat(f.mb, id) : f.box; return bb && isFinite(bb[0]) ? bb : f.lp ? [f.lp[0], f.lp[1], f.lp[0], f.lp[1]] : null; };
      if (Array.isArray(target) && typeof target[0] === 'string') {
        const bs = target.map(boxOf).filter(Boolean);
        if (bs.length) b = [Math.min(...bs.map(x => x[0])), Math.min(...bs.map(x => x[1])), Math.max(...bs.map(x => x[2])), Math.max(...bs.map(x => x[3]))];
      } else if (typeof target === 'string') {
        const f = feats.get(target); if (!f) return Promise.resolve();
        b = f.mb ? boxOfLonLat(f.mb, target) : f.box;
        if (!b || !isFinite(b[0])) b = f.lp ? [f.lp[0], f.lp[1], f.lp[0], f.lp[1]] : null;
      } else if (Array.isArray(target) && Array.isArray(target[0])) {
        const ps = target.map(([lon, lat]) => pointU(lon, lat));
        b = [Math.min(...ps.map(p => p[0])), Math.min(...ps.map(p => p[1])), Math.max(...ps.map(p => p[0])), Math.max(...ps.map(p => p[1]))];
      } else if (Array.isArray(target)) b = boxOfLonLat(target);
      if (!b) return Promise.resolve();
      const minSpan = (frameU[2] - frameU[0]) / maxZoom;
      if (b[2] - b[0] < minSpan) { const c = (b[0] + b[2]) / 2; b = [c - minSpan / 2, b[1], c + minSpan / 2, b[3]]; }
      if (b[3] - b[1] < minSpan * 0.5) { const c = (b[1] + b[3]) / 2; b = [b[0], c - minSpan / 4, b[2], c + minSpan / 4]; }
      const t = fitBox(b, padFrac);
      if (t.k > fitK * maxZoom) { const s = fitK * maxZoom / t.k; const cx = (W / 2 - t.x) / t.k, cy = (H / 2 - t.y) / t.k; t.k *= s; t.x = W / 2 - cx * t.k; t.y = H / 2 - cy * t.k; }
      if (t.k < home.k) return animateTo(home, duration);
      return animateTo(clampT(t), duration);
    },
    home: () => goHome(true),
    zoomBy: f => zoomBy(f),
    label(id, text, { size = 13, cls = '', at = null } = {}) {
      const f = feats.get(id);
      const p = at ? pointU(at[0], at[1]) : f?.lp;
      if (!p) return;
      api.unlabel(id);
      const t = svgEl('text', { class: 'gm-lbl ' + cls, x: p[0].toFixed(2), y: p[1].toFixed(2) });
      t.textContent = text ?? f?.props?.n ?? id;
      L.labels.append(t);
      labels.set(id, { el: t, size });
      refreshScaled();
    },
    unlabel(id) { labels.get(id)?.el.remove(); labels.delete(id); },
    clearLabels() { for (const id of [...labels.keys()]) api.unlabel(id); },
    addMarker({ id = 'm' + marks.size, lon, lat, kind = 'dot', label = '', cls = '', tap = false } = {}) {
      api.removeMarker(id);
      const g = svgEl('g', { class: `gm-mk ${kind} ${cls}`, 'data-mk': id });
      const big = o.bigTargets ? 1.35 : 1;
      if (kind === 'pin' || kind === 'true') {
        g.append(svgEl('path', { class: 'mk-pin', d: `M0 0C${-3 * big} ${-8 * big} ${-10 * big} ${-12 * big} ${-10 * big} ${-19 * big}A${10 * big} ${10 * big} 0 1 1 ${10 * big} ${-19 * big}C${10 * big} ${-12 * big} ${3 * big} ${-8 * big} 0 0Z` }));
        g.append(svgEl('circle', { cx: 0, cy: -19 * big, r: 3.6 * big, fill: '#fff' }));
      } else if (kind === 'star') {
        const s = 9 * big, pts = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? s * 0.45 : s, a = -Math.PI / 2 + i * Math.PI / 5; return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`; });
        g.append(svgEl('polygon', { class: 'mk-star', points: pts.join(' ') }));
      } else {
        if (tap) g.append(svgEl('circle', { r: 20 * big, fill: 'transparent' }));
        g.append(svgEl('circle', { class: 'mk-dot', r: (o.bigTargets ? 10 : 7.5) }));
      }
      if (label) { const t = svgEl('text', { x: 0, y: kind === 'dot' ? -14 : -30 * big, 'text-anchor': 'middle' }); t.textContent = label; g.append(t); }
      L.marks.append(g);
      const m = { id, g, p: pointU(lon, lat), lon, lat, tap };
      marks.set(id, m);
      refreshScaled();
      return id;
    },
    markerState(id, cls) { const m = marks.get(id); if (m) m.g.setAttribute('class', `gm-mk ${m.g.classList[1]} ${cls || ''}`); },
    markerLabel(id, text) {
      const m = marks.get(id); if (!m) return;
      let t = m.g.querySelector('text');
      if (!t) { t = svgEl('text', { x: 0, y: -14, 'text-anchor': 'middle' }); m.g.append(t); }
      t.textContent = text;
    },
    removeMarker(id) { marks.get(id)?.g.remove(); marks.delete(id); },
    clearMarkers() { for (const id of [...marks.keys()]) api.removeMarker(id); },
    addLine(a, b, { cls = '' } = {}) {
      const pts = greatCircle(a, b).map(([lon, lat]) => pointU(lon, lat));
      const p = svgEl('path', { class: 'gm-line ' + cls, d: 'M' + pts.map(p => p.map(v => v.toFixed(2)).join(' ')).join('L') });
      L.lines.append(p);
      return p;
    },
    // a polyline through [lon,lat] points as given (parallels, meridians)
    addPath(lonlats, { cls = '' } = {}) {
      const p = svgEl('path', { class: 'gm-line ' + cls, d: 'M' + lonlats.map(([lon, lat]) => pointU(lon, lat).map(v => v.toFixed(2)).join(' ')).join('L') });
      L.lines.append(p);
      return p;
    },
    clearLines() { L.lines.innerHTML = ''; },
    toast,
    // for tests and formats
    hitTest,
    project(lon, lat) { return screenOf(pointU(lon, lat)); },
    invert,
    featureIds: () => [...feats.keys()],
    feature: id => { const f = feats.get(id); return f ? { id, playable: f.playable, props: f.props, layer: f.layer } : null; },
    // a screen point that hits the feature (label point, or its dot)
    featurePoint(id) { const f = feats.get(id); return f?.lp ? screenOf(f.lp) : null; },
    destroy() { destroyed = true; cancelAnimationFrame(anim); el.innerHTML = ''; el.classList.remove('gm', 'big', 'locked', 'live'); },
  };
  return api;
}
