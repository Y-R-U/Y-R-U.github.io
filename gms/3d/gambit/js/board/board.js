// GAMBIT board — Three.js scene, camera, input and the animation system.
// Owner: board agent. Contract: docs/TEAM_BRIEF.md (createBoard). API notes: docs/notes/board.md.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as kit from '../themes/kit.js';
import { loadTheme } from '../themes/index.js';
import { CameraRig, VIEW_ORDER, VIEW_LABELS, normalizeView } from './camera.js';
export { VIEW_ORDER, VIEW_LABELS, normalizeView };
import { PieceSet } from './pieces.js';
import { Overlays } from './overlays.js';
import { NameTags, LABEL_MS } from './labels.js';
export { LABEL_MS };

const FILES = 'abcdefgh';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const sqToXZ = sq => [sq.charCodeAt(0) - 97 - 3.5, 3.5 - (sq.charCodeAt(1) - 49)];
export const xzToSq = (x, z) => {
  const f = Math.floor(x + 4), r = Math.floor(4 - z);
  return f < 0 || f > 7 || r < 0 || r > 7 ? null : FILES[f] + (r + 1);
};
const sqVec = (sq, y = 0) => { const [x, z] = sqToXZ(sq); return new THREE.Vector3(x, y, z); };
const isSq = s => typeof s === 'string' && /^[a-h][1-8]$/.test(s);

/** Parse the placement field of a FEN -> Map(square -> {type, color}). */
export function parseFen(fen) {
  const out = new Map();
  const rows = String(fen || START_FEN).trim().split(/\s+/)[0].split('/');
  for (let i = 0; i < 8 && i < rows.length; i++) {
    let f = 0;
    for (const ch of rows[i]) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      if (f > 7) break;
      const low = ch.toLowerCase();
      if ('pnbrqk'.includes(low)) out.set(FILES[f] + (8 - i), { type: low, color: ch === low ? 'b' : 'w' });
      f++;
    }
  }
  return out;
}

/**
 * createBoard(container, opts) -> Promise<board>
 * opts: {theme='classic', fen, orientation='w', interactive=null, animSpeed=1,
 *        legalMoves(square) -> [sq | {to,...}]  (optional; else pass highlight({legalTargets})),
 *        onMoveAttempt, onPromotion, maxPixelRatio=2, keyboard=true, autoHighlight=true,
 *        coordinates=true, view='default', shadows=true}
 */
export async function createBoard(container, opts = {}) {
  const o = { theme: 'classic', orientation: 'w', interactive: null, animSpeed: 1, maxPixelRatio: 2, keyboard: true,
    autoHighlight: true, coordinates: true, view: 'top', shadows: true, labels: true, ...opts };
  if ('coords' in opts) o.coordinates = opts.coords !== false;

  // ------------------------------------------------------------ renderer / scene
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const dpr = () => Math.min(window.devicePixelRatio || 1, o.maxPixelRatio);
  renderer.setPixelRatio(dpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !!o.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none',
    userSelect: 'none', webkitUserSelect: 'none', webkitTapHighlightColor: 'transparent' });
  canvas.setAttribute('tabindex', '0');
  container.appendChild(canvas);
  const flashEl = document.createElement('div');
  Object.assign(flashEl.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', background: '#fff' });
  container.appendChild(flashEl);
  const finePointer = !!window.matchMedia?.('(pointer: fine)').matches;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  const rig = new CameraRig(camera);
  rig.setOrientation(o.orientation); rig.preset(o.view); rig.cur = { ...rig.goal };

  let fx = null, pieces = null, overlays = null, theme = null, fallbackTheme = null;
  let boardObj = null, envObj = null, envMinPhi = 0.12, lights = null, sun = null, envTex = null;

  // ------------------------------------------------------------ state
  const recs = new Map();            // square -> {type, color, sq, live}
  let orientation = o.orientation;
  let interactive = o.interactive;
  let speed = o.animSpeed;
  let selected = null, legalTargets = [], hl = { lastMove: null, check: null, hint: null }, arrows = [];
  let pending = null;                // user move awaiting applyMove {from,to,promotion,live,timer}
  let gen = 0;                       // bumps on setPosition so stale anims don't touch new state
  const timelines = new Set();
  let battleTl = null;
  let queue = Promise.resolve();
  let animCount = 0;
  let shadowDirty = true;
  const listeners = new Map();
  const emit = (name, data) => { for (const fn of listeners.get(name) || []) { try { fn(data); } catch (e) { console.error(e); } } };

  // ------------------------------------------------------------ render loop
  let raf = 0, last = 0, disposed = false;
  const stat = { frames: 0, cpu: 0, js: 0, jsMs: 0, t0: performance.now(), fps: 0, frameMs: 0, calls: 0, tris: 0 };
  const keys = new Set();
  function wake() { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    const t0 = performance.now();
    const dt = Math.min(50, Math.max(0, now - last)); last = now;
    for (const tl of [...timelines]) tl.update(dt);
    if (fx) { fx.rate = battleTl ? battleTl.rate : 1; fx.update(dt); }
    keyOrbit(dt);
    const camMoving = rig.update(dt);
    tags.update();
    if (envObj) envObj.visible = rig.cur.phi + rig.focusState.tilt * rig.focusState.f > envMinPhi;
    const anyLive = pieces && pieces.liveGroup.children.length > 0;
    if (renderer.shadowMap.enabled && (shadowDirty || anyLive)) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    const tr = performance.now(); stat.js += tr - t0;
    renderer.render(scene, camera);
    stat.calls = renderer.info.render.calls; stat.tris = renderer.info.render.triangles;
    stat.cpu += performance.now() - t0; stat.frames++;
    if (now - stat.t0 > 1000) { stat.fps = stat.frames * 1000 / (now - stat.t0); stat.frameMs = stat.cpu / stat.frames; stat.jsMs = stat.js / stat.frames; stat.frames = 0; stat.cpu = 0; stat.js = 0; stat.t0 = now; }
    if (timelines.size || (fx && fx.active) || camMoving || anyLive || keys.size || drag) wake();
  }

  // ------------------------------------------------------------ sizing
  let cssW = 1, cssH = 1;
  const _hp = new THREE.Vector3(), _up = new THREE.Vector3();
  const tags = new NameTags(container, {
    size: () => ({ w: cssW, h: cssH }),
    project(sq, below) {                // head (or, below=true, the foot) of the piece on sq, in container px
      const r = recs.get(sq); if (!r || !pieces) return null;
      if (r.live) _hp.copy(r.live.position); else { const [x, z] = sqToXZ(sq); _hp.set(x, 0, z); }
      _up.setFromMatrixColumn(camera.matrixWorld, 1);
      if (below) _hp.addScaledVector(_up, -(pieces.radius(r.color, r.type) + 0.04));
      else {
        _hp.y += pieces.height(r.color, r.type) * (r.live ? r.live.scale.y : 1) + 0.08;
        // lift along the camera's screen-up axis so the tag clears the piece even from straight overhead
        _hp.addScaledVector(_up, pieces.radius(r.color, r.type) + 0.12);
      }
      _hp.project(camera);
      if (_hp.z > 1) return null;
      return { x: (_hp.x + 1) / 2 * cssW, y: (1 - _hp.y) / 2 * cssH };
    },
  });
  tags.enabled = o.labels !== false;
  function resize() {
    const r = container.getBoundingClientRect();
    cssW = Math.max(1, Math.round(r.width)); cssH = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(dpr());
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
    fx?.setViewport(cssH * renderer.getPixelRatio(), camera.fov);
    rig.moving = true; wake();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  const onWinResize = () => resize();
  window.addEventListener('orientationchange', onWinResize);

  // ------------------------------------------------------------ theme
  async function setTheme(id) {
    const t = await loadTheme(id);
    fallbackTheme = fallbackTheme || await loadTheme('classic');
    if (disposed) return;
    finishAll();
    theme = t;
    // lights / environment
    if (lights) { scene.remove(lights); lights = null; }
    if (envObj) { scene.remove(envObj); kit.dispose(envObj); envObj = null; }
    const env = theme.board?.environment ? safe(() => theme.board.environment(THREE, kit, { renderer }), null) : null;
    lights = env?.lights || (theme.board?.lightRig ? safe(() => theme.board.lightRig(THREE, kit), null) : null) || kit.defaultLightRig();
    scene.add(lights);
    sun = null; let hemi = null;
    lights.traverse(l => { if (!sun && l.isDirectionalLight && l.castShadow) sun = l; if (!hemi && (l.isHemisphereLight || l.isAmbientLight)) hemi = l; });
    if (sun) {
      const mobile = Math.min(screen.width, screen.height) < 700;
      sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
      const c = sun.shadow.camera; c.left = -5.5; c.right = 5.5; c.top = 5.5; c.bottom = -5.5; c.near = 1; c.far = 30; c.updateProjectionMatrix();
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
      sun.target.position.set(0, 0, 0); if (!sun.target.parent) scene.add(sun.target);
    }
    if (envTex) envTex.dispose();
    envTex = pmrem.fromScene(env?.envScene || (env?.roomEnvironment ? new RoomEnvironment() : kit.studioEnvironment()), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = env?.envIntensity ?? 1;
    scene.background = env?.background ?? null;
    scene.fog = env?.fog ?? null;
    if (env?.object) { envObj = env.object; envMinPhi = env.minPhi ?? 0.12; scene.add(envObj); }
    // fx (needs the light to pulse)
    fx?.dispose();
    fx = kit.createFX(scene, { overlayEl: flashEl, flashLight: hemi });
    fx.setViewport(cssH * renderer.getPixelRatio(), camera.fov);
    buildBoardMesh();
    // pieces
    tags.setNames(theme.names);
    if (!pieces) pieces = new PieceSet(scene);
    pieces.load(theme, fallbackTheme);
    if (!overlays) overlays = new Overlays(scene, theme.board?.overlayStyle);
    syncPieces(); refreshOverlays();
    // compile shaders up front (parallel where supported) so the first frame doesn't hitch
    // (plus one live, non-instanced piece per side: that is a different shader variant)
    const warm = ['w', 'b'].map(c => pieces.makeLive(c, 'k'));
    try {
      if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch {}
    warm.forEach(w => pieces.removeLive(w));
    shadowDirty = true; wake();
    emit('theme', { id: theme.id });
  }
  function buildBoardMesh() {
    if (boardObj) { scene.remove(boardObj); disposeDeep(boardObj); }
    const b = theme.board?.build ? theme.board : fallbackTheme.board;
    boardObj = b.build(THREE, kit, { orientation, coordinates: o.coordinates });
    scene.add(boardObj);
    shadowDirty = true;
  }

  // ------------------------------------------------------------ pieces / position
  function recList() { return [...recs.values()].map(r => { const [x, z] = sqToXZ(r.sq); return { ...r, x, z }; }); }
  function syncPieces() { pieces?.sync(recList()); shadowDirty = true; wake(); }
  function goLive(rec) {
    if (!rec.live) { rec.live = pieces.makeLive(rec.color, rec.type); rec.live.position.copy(sqVec(rec.sq)); syncPieces(); }
    return rec.live;
  }
  function endLive(rec) {
    if (rec.live) { pieces.removeLive(rec.live); rec.live = null; }
  }
  function setPositionNow(fen) {
    finishAll(); gen++; tags.hide();
    clearPending(false);
    for (const r of recs.values()) endLive(r);
    pieces?.liveGroup.clear();
    recs.clear();
    for (const [sq, p] of parseFen(fen)) recs.set(sq, { ...p, sq, live: null });
    selected = null; legalTargets = [];
    syncPieces(); refreshOverlays();
  }
  async function setPositionAnimated(fen) {
    finishAll(); gen++; const my = gen;
    clearPending(false);
    const next = parseFen(fen);
    const stay = new Set();
    for (const [sq, p] of next) { const r = recs.get(sq); if (r && r.type === p.type && r.color === p.color) stay.add(sq); }
    const gone = [...recs.values()].filter(r => !stay.has(r.sq));
    const come = [...next].filter(([sq]) => !stay.has(sq)).map(([sq, p]) => ({ sq, ...p }));
    const tl = new kit.Timeline(1); timelines.add(tl);
    const jobs = [], newRecs = new Map();
    for (const sq of stay) newRecs.set(sq, recs.get(sq));
    for (const c of come) {
      // nearest matching piece slides over, otherwise it pops in
      let best = null, bd = 1e9;
      for (const g of gone) if (g.type === c.type && g.color === c.color && !g.used) {
        const d = Math.hypot(sqToXZ(g.sq)[0] - sqToXZ(c.sq)[0], sqToXZ(g.sq)[1] - sqToXZ(c.sq)[1]); if (d < bd) { bd = d; best = g; }
      }
      const rec = { type: c.type, color: c.color, sq: c.sq, live: null };
      newRecs.set(c.sq, rec);
      if (best) {
        best.used = true;
        const live = pieces.makeLive(c.color, c.type); live.position.copy(sqVec(best.sq)); rec.live = live;
        jobs.push(kit.slideTo(animCtx(tl, rec, best.sq, c.sq), live, sqVec(c.sq), { ms: 260 }));
      } else {
        const live = pieces.makeLive(c.color, c.type); live.position.copy(sqVec(c.sq)); live.scale.setScalar(0.01); rec.live = live;
        jobs.push(tl.tween(220, e => live.scale.setScalar(Math.max(0.01, e)), kit.ease.backOut));
      }
    }
    for (const g of gone) if (!g.used) {
      const live = g.live || pieces.makeLive(g.color, g.type); live.position.copy(sqVec(g.sq)); g.live = null;
      jobs.push(tl.tween(180, e => live.scale.setScalar(Math.max(0.01, 1 - e)), kit.ease.quadIn).then(() => pieces.removeLive(live)));
    }
    for (const g of gone) if (g.used && g.live) { pieces.removeLive(g.live); g.live = null; }
    recs.clear(); for (const [k, v] of newRecs) recs.set(k, v);
    selected = null; legalTargets = [];
    syncPieces(); refreshOverlays(); wake();
    await Promise.all(jobs);
    timelines.delete(tl);
    if (my !== gen) return;
    for (const r of recs.values()) endLive(r);
    syncPieces();
  }

  // ------------------------------------------------------------ overlays
  function refreshOverlays() {
    if (!overlays) return;
    const lm = hl.lastMove ? (Array.isArray(hl.lastMove) ? hl.lastMove : [hl.lastMove.from, hl.lastMove.to]) : [];
    overlays.lastMove.set(lm.filter(isSq));
    overlays.select.set(selected ? [selected] : []);
    overlays.hint.set(hl.hint ? [hl.hint.from, hl.hint.to].filter(isSq) : []);
    let chk = hl.check;
    if (chk === 'w' || chk === 'b') chk = [...recs.values()].find(r => r.type === 'k' && r.color === chk)?.sq || null;
    overlays.setCheck(isSq(chk) ? chk : null);
    overlays.setTargets(selected ? legalTargets : [], sq => recs.has(sq) || isEpTarget(sq));
    const all = [...arrows];
    if (hl.hint && hl.hint.arrow !== false && isSq(hl.hint.from) && isSq(hl.hint.to)) all.push({ from: hl.hint.from, to: hl.hint.to, color: '#3fa9ff', opacity: 0.8 });
    overlays.setArrows(all);
    wake();
  }
  function isEpTarget(sq) {
    const r = selected && recs.get(selected);
    return !!(r && r.type === 'p' && sq[0] !== selected[0]);
  }

  // ------------------------------------------------------------ selection / input
  const canMove = sq => { const r = recs.get(sq); if (!r || !interactive) return false; return interactive === 'both' || interactive === r.color; };
  function select(sq) {
    if (!sq) tags.hide('select');
    selected = sq;
    legalTargets = [];
    if (sq && typeof o.legalMoves === 'function') {
      try { legalTargets = (o.legalMoves(sq) || []).map(m => (typeof m === 'string' ? (m.length >= 4 ? m.slice(2, 4) : m) : m.to)).filter(isSq); } catch (e) { console.error(e); }
    }
    emit('select', { square: sq });
    refreshOverlays();
  }
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function rayAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }
  function groundAt(cx, cy, y = 0) {
    plane.constant = -y;
    const p = new THREE.Vector3();
    return rayAt(cx, cy).intersectPlane(plane, p) ? p : null;
  }
  /** Pick the piece under the pointer (vertical cylinders), else the ground square. */
  function pickAt(cx, cy) {
    const ray = rayAt(cx, cy);
    let best = null, bt = Infinity;
    const o3 = ray.origin, d = ray.direction;
    for (const r of recs.values()) {
      if (r.live && r.sq !== selected) continue;
      const [x, z] = sqToXZ(r.sq), R = 0.42, H = pieces.height(r.color, r.type);
      const ox = o3.x - x, oz = o3.z - z;
      const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - R * R;
      let t = Infinity;
      if (a > 1e-9) { const disc = b * b - 4 * a * c; if (disc >= 0) { const t1 = (-b - Math.sqrt(disc)) / (2 * a); const y = o3.y + d.y * t1; if (t1 > 0 && y >= 0 && y <= H) t = t1; } }
      if (t === Infinity && Math.abs(d.y) > 1e-6) { const tc = (H - o3.y) / d.y; const px = ox + d.x * tc, pz = oz + d.z * tc; if (tc > 0 && px * px + pz * pz <= R * R) t = tc; }
      if (t < bt) { bt = t; best = r.sq; }
    }
    const g = groundAt(cx, cy);
    return { piece: best, ground: g ? xzToSq(g.x, g.z) : null };
  }

  const pointers = new Map();
  let mode = null, down = null, drag = null, pinch = null;
  const TAP = 7;
  function onPointerDown(e) {
    if (disposed) return;
    canvas.focus({ preventScroll: true });
    if (battleTl) { skip(); e.preventDefault(); return; }       // tap skips a battle
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size === 2) {
      if (drag) cancelDrag();
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: rig.goal.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      mode = 'pinch'; return;
    }
    if (pointers.size > 2) return;
    if (e.button === 2) return;
    const hit = pickAt(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, hit, id: e.pointerId };
    mode = hit.piece && canMove(hit.piece) && !pending ? 'pendingPiece' : 'pendingOrbit';
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && !drag) updateHover(e); // cursor feedback
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pointers.size >= 2) {
      if (rig.locked) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      rig.setZoom(pinch.zoom * pinch.d / Math.max(20, d));
      // two-finger drag also orbits
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      rig.orbit(-(mx - pinch.mx) * 0.006, (my - pinch.my) * 0.005); pinch.mx = mx; pinch.my = my;
      wake(); return;
    }
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (mode === 'pendingPiece' && moved > TAP) startDrag(down.hit.piece, e);
    else if (mode === 'pendingOrbit' && moved > TAP) mode = 'orbit';
    if (mode === 'drag') moveDrag(e);
    else if (mode === 'orbit') {
      const k = 3.2 / Math.max(240, Math.min(cssW, cssH));
      rig.orbit(-(e.clientX - prev.x) * k, (e.clientY - prev.y) * k * 0.8);
      wake();
    }
  }
  function onPointerUp(e) {
    const wasDown = pointers.delete(e.pointerId);
    if (mode === 'pinch') { if (pointers.size === 0) mode = null; down = null; return; }
    if (!wasDown || !down || e.pointerId !== down.id) return;
    const m = mode; mode = null;
    if (e.type === 'pointercancel') { if (drag) cancelDrag(); down = null; return; }
    if (m === 'drag') endDrag(e);
    else if (m === 'pendingPiece') {
      const sq = down.hit.piece;
      if (selected && selected !== sq && legalTargets.includes(sq)) attemptMove(selected, sq, false); // own-piece target (rare variants)
      else {
        select(selected === sq ? null : sq);
        if (selected) tags.show(selected, recs.get(selected), 'select');   // own piece: tag + legal dots
      }
    } else if (m === 'pendingOrbit' && !selected) {
      // nothing selected: tapping any (enemy / not-movable) piece shows its name tag
      const sq = down.hit.piece;
      if (sq) tags.show(sq, recs.get(sq), 'tap'); else tags.hide();
    } else if (m === 'pendingOrbit' && selected) {
      const sq = down.hit.piece || down.hit.ground;
      const ok = sq && sq !== selected && (legalTargets.length ? legalTargets.includes(sq) : typeof o.legalMoves !== 'function');
      if (ok) attemptMove(selected, sq, false); else select(null);
    }
    down = null;
  }
  function updateHover(e) {
    const hit = pickAt(e.clientX, e.clientY);
    if (finePointer && e.pointerType === 'mouse') tags.hover(hit.piece, hit.piece && recs.get(hit.piece));
    const own = hit.piece && canMove(hit.piece);
    const tgt = selected && legalTargets.includes(hit.piece || hit.ground);
    canvas.style.cursor = own || tgt ? 'pointer' : 'grab';
  }
  function startDrag(sq, e) {
    const rec = recs.get(sq); if (!rec) return;
    if (selected !== sq) select(sq);
    tags.hide();
    const live = goLive(rec);
    drag = { rec, live, from: sq, over: null };
    mode = 'drag';
    live.scale.setScalar(1.18);
    canvas.style.cursor = 'grabbing';
    moveDrag(e);
  }
  function moveDrag(e) {
    const lift = 0.35;
    const p = groundAt(e.clientX, e.clientY, 0);
    if (!p) return;
    p.x = THREE.MathUtils.clamp(p.x, -4.3, 4.3); p.z = THREE.MathUtils.clamp(p.z, -4.3, 4.3);
    drag.live.position.set(p.x, lift, p.z);
    const over = xzToSq(p.x, p.z);
    if (over !== drag.over) { drag.over = over; overlays.hover.set(over && over !== drag.from ? [over] : []); }
    wake();
  }
  function cancelDrag() {
    if (!drag) return;
    const d = drag; drag = null; overlays.hover.set([]);
    snapBack(d.rec);
  }
  function snapBack(rec) {
    const live = rec.live; if (!live) return;
    const tl = new kit.Timeline(1); timelines.add(tl);
    const p0 = live.position.clone(), s0 = live.scale.x, to = sqVec(rec.sq);
    tl.tween(140, e => { live.position.lerpVectors(p0, to, e); live.scale.setScalar(s0 + (1 - s0) * e); }, kit.ease.quadOut)
      .then(() => { timelines.delete(tl); if (recs.get(rec.sq) === rec) { endLive(rec); syncPieces(); } });
    wake();
  }
  function endDrag(e) {
    const d = drag; drag = null; overlays.hover.set([]);
    canvas.style.cursor = '';
    const p = groundAt(e.clientX, e.clientY, 0);
    const to = p ? xzToSq(p.x, p.z) : null;
    if (!to || to === d.from) { snapBack(d.rec); return; }  // stays selected for tap-tap
    attemptMove(d.from, to, true);
  }
  async function attemptMove(from, to, viaDrag) {
    const rec = recs.get(from); if (!rec) return;
    let promotion;
    if (rec.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      if (viaDrag && rec.live) { rec.live.position.copy(sqVec(to)).setY(0.35); }
      // With board.onPromotion set the board asks it (ui draws the picker near
      // board.squareToScreen(to)); without it the move goes out with no promotion
      // and the ui is expected to pick and call applyMove itself.
      const ask = board.onPromotion;
      emit('promotion', { from, to, color: rec.color });
      if (ask) {
        try { promotion = await ask({ from, to, color: rec.color }); } catch { promotion = null; }
        if (!promotion) { if (rec.live) snapBack(rec); select(null); return; }
      }
    }
    pending = { from, to, promotion, viaDrag, rec };
    let ok = false;
    try { ok = board.onMoveAttempt ? await board.onMoveAttempt({ from, to, promotion }) : false; } catch (err) { console.error(err); ok = false; }
    if (!pending || pending.from !== from || pending.to !== to) return;   // applyMove already consumed it
    if (!ok) { clearPending(true); select(null); return; }
    // accepted: wait briefly for the ui to call applyMove with the verbose move
    if (viaDrag && rec.live) rec.live.position.copy(sqVec(to)).setY(0.12);
    select(null);
    pending.timer = setTimeout(() => { if (pending && pending.from === from) clearPending(true); }, 2500);
  }
  function clearPending(snap) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const p = pending; pending = null;
    if (snap && p.rec.live && recs.get(p.rec.sq) === p.rec) snapBack(p.rec);
  }
  function onWheel(e) {
    if (rig.locked) return;            // locked views: let the page scroll
    e.preventDefault();
    rig.zoomBy(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    wake();
  }
  // keyboard orbit
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
    Equal: 'in', NumpadAdd: 'in', Minus: 'out', NumpadSubtract: 'out' };
  const editable = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  function onKeyDown(e) {
    if (!o.keyboard || editable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!container.isConnected || !cssW) return;
    if (e.code === 'Digit0' || e.code === 'Home') { rig.reset(); wake(); return; }
    if (e.code === 'KeyV' && !e.repeat) { e.preventDefault(); cycleView(); return; }
    const k = KEYMAP[e.code]; if (!k || rig.locked) return;
    e.preventDefault(); keys.add(k); wake();
  }
  function setView(name) {
    rig.preset(name); wake();
    emit('view', { view: rig.presetName, label: VIEW_LABELS[rig.presetName], locked: rig.locked });
    return rig.presetName;
  }
  function cycleView() { return setView(VIEW_ORDER[(VIEW_ORDER.indexOf(rig.presetName) + 1) % VIEW_ORDER.length]); }
  function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) keys.delete(k); }
  function keyOrbit(dt) {
    if (!keys.size) return;
    const s = dt / 1000;
    if (keys.has('l')) rig.orbit(1.6 * s, 0); if (keys.has('r')) rig.orbit(-1.6 * s, 0);
    if (keys.has('u')) rig.orbit(0, -0.9 * s); if (keys.has('d')) rig.orbit(0, 0.9 * s);
    if (keys.has('in')) rig.zoomBy(1 - 0.9 * s); if (keys.has('out')) rig.zoomBy(1 + 0.9 * s);
  }
  const onBlur = () => keys.clear();
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  const onLeave = () => tags.hover(null);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // ------------------------------------------------------------ animation
  function camApi(tl) {
    return {
      three: camera,
      focus(point, { zoom = 0.75, tilt = 0.2, ms = 260 } = {}) {
        const f = rig.focusState; f.point.copy(point).setY(0); f.zoom = zoom; f.tilt = tilt;
        const f0 = f.f;
        return tl.tween(ms, e => { f.f = f0 + (1 - f0) * e; rig.moving = true; }, kit.ease.cubicInOut);
      },
      release({ ms = 300 } = {}) {
        const f = rig.focusState, f0 = f.f;
        return tl.tween(ms, e => { f.f = f0 * (1 - e); rig.moving = true; }, kit.ease.cubicInOut);
      },
      shake(amp, ms) { rig.shake(amp, ms / Math.max(0.2, tl.rate)); wake(); },
    };
  }
  function animCtx(tl, rec, fromSq, toSq, extra = {}) {
    const piece = rec.live;
    const from = piece ? piece.position.clone() : sqVec(fromSq), to = sqVec(toSq);
    return { THREE, kit, tl, tween: (ms, fn, ez) => tl.tween(ms, fn, ez), wait: ms => tl.wait(ms),
      piece, from, to, path: [from.clone(), to.clone()], dist: kit.flatDist(from, to), dir: kit.flatDir(sqVec(fromSq), to),
      type: rec.type, color: rec.color, fromSq, toSq, speed: tl.rate, fx, scene, camera: camApi(tl), ...extra };
  }
  function pickAnim(list, type) {
    const c = (list || []).filter(a => typeof a === 'function' && (!a.only || a.only.includes(type)));
    if (!c.length) return null;
    const total = c.reduce((s, a) => s + (a.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const a of c) { r -= a.weight ?? 1; if (r <= 0) return a; }
    return c[c.length - 1];
  }
  const themeList = key => (theme?.[key]?.length ? theme[key] : fallbackTheme?.[key]) || [];
  async function runMoveAnim(tl, rec, fromSq, toSq, move) {
    const ctx = animCtx(tl, rec, fromSq, toSq, { move });
    const fn = pickAnim(themeList('moveAnims'), rec.type);
    try { if (fn) await fn(ctx); } catch (e) { console.error('[board] move anim failed', e); }
  }
  /** Settle a dropped piece onto its square. */
  function settle(tl, rec, toSq) {
    const live = rec.live, p0 = live.position.clone(), s0 = live.scale.x, to = sqVec(toSq);
    return tl.tween(110, e => { live.position.lerpVectors(p0, to, e); live.scale.setScalar(s0 + (1 - s0) * e); }, kit.ease.quadIn)
      .then(() => kit.squash({ tween: (ms, fn, ez) => tl.tween(ms, fn, ez) }, live, 0.15, 60));
  }
  async function plainCapture(tl, vrec, delay) {
    const v = vrec.live;
    await tl.wait(delay);
    fx.smoke(v.position.clone().setY(0.2), { count: 7, alpha: 0.4, size: [0.2, 0.35] });
    await tl.tween(130, e => { v.scale.setScalar(Math.max(0.01, 1 - e)); v.position.y = -0.2 * e; }, kit.ease.quadIn);
    v.visible = false;
  }
  async function promoteFlourish(tl, rec, toSq, newType) {
    const old = rec.live, pos = sqVec(toSq);
    const custom = theme?.promoteAnim;
    fx.sparkles(pos.clone().setY(0.5), { count: 34 });
    fx.flash(pos.clone().setY(0.5), { color: '#fff3c0', radius: 1.0 });
    await tl.tween(140, e => { old.rotation.y = e * Math.PI; old.scale.setScalar(Math.max(0.01, 1 - e)); }, kit.ease.quadIn);
    pieces.removeLive(old);
    rec.type = newType;
    rec.live = pieces.makeLive(rec.color, newType); rec.live.position.copy(pos); rec.live.scale.setScalar(0.01);
    const nu = rec.live;
    if (custom) { try { await custom({ ...animCtx(tl, rec, toSq, toSq), piece: nu }); } catch (e) { console.error(e); } }
    else {
      fx.ring(pos, { radius: 0.9, color: '#ffe9a0' });
      await tl.tween(260, (e, k) => { nu.scale.setScalar(Math.max(0.01, e)); nu.rotation.y = (1 - k) * Math.PI * 2; }, kit.ease.backOut);
    }
    nu.rotation.y = 0; nu.scale.setScalar(1);
  }

  async function doApplyMove(m, { battle = true } = {}) {
    const my = gen;
    const from = m.from, to = m.to;
    if (!isSq(from) || !isSq(to)) return;
    const rec = recs.get(from);
    if (!rec) { if (m.after) setPositionNow(m.after); return; }
    const fromFile = from.charCodeAt(0), toFile = to.charCodeAt(0);
    let victimSq = recs.has(to) ? to : null;
    if (!victimSq && rec.type === 'p' && fromFile !== toFile) { const ep = to[0] + from[1]; if (recs.get(ep)?.type === 'p') victimSq = ep; }
    let castle = null;
    if (rec.type === 'k' && Math.abs(toFile - fromFile) === 2) {
      const rank = from[1], kside = toFile > fromFile;
      const rf = m.rookFrom || (kside ? 'h' : 'a') + rank, rt = m.rookTo || (kside ? 'f' : 'd') + rank;
      if (recs.get(rf)?.type === 'r') castle = { from: rf, to: rt, rec: recs.get(rf) };
    }
    const promo = m.promotion || (rec.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : null);
    const isPending = pending && pending.from === from && pending.to === to;
    const viaDrag = isPending && pending.viaDrag && rec.live;
    if (isPending) { clearTimeout(pending.timer); pending = null; }
    tags.hide();
    const vrec = victimSq ? recs.get(victimSq) : null;

    // logical state first, so picking and the next queued move see the new position
    recs.delete(from); if (victimSq) recs.delete(victimSq);
    rec.sq = to; recs.set(to, rec);
    if (castle) { recs.delete(castle.from); castle.rec.sq = castle.to; recs.set(castle.to, castle.rec); }
    if (o.autoHighlight) { hl.lastMove = [from, to]; hl.hint = null; }
    selected = null; legalTargets = [];
    if (!viaDrag && rec.live) { pieces.removeLive(rec.live); rec.live = null; }
    const attacker = rec.live || (rec.live = pieces.makeLive(rec.color, rec.type));
    if (!viaDrag) attacker.position.copy(sqVec(from));
    let victim = null;
    if (vrec) { vrec.live || (vrec.live = pieces.makeLive(vrec.color, vrec.type)); victim = vrec.live; victim.position.copy(sqVec(victimSq)); }
    if (castle) { castle.rec.live || (castle.rec.live = pieces.makeLive(castle.rec.color, 'r')); castle.rec.live.position.copy(sqVec(castle.from)); }
    syncPieces(); refreshOverlays();
    animCount++; emit('animstart', { move: m });

    const useBattle = vrec && battle && speed !== 'off' && speed !== 0;
    const tl = new kit.Timeline(useBattle ? Number(speed) || 1 : 1);
    timelines.add(tl); wake();
    try {
      if (useBattle) {
        battleTl = tl; emit('battlestart', { move: m });
        const ctx = animCtx(tl, rec, from, to, { move: m, attacker, victim, victimPos: sqVec(victimSq), victimSq,
          victimType: vrec.type, victimColor: vrec.color });
        ctx.dir = kit.flatDir(sqVec(from), sqVec(victimSq));
        const fn = pickAnim(themeList('battleAnims'), rec.type);
        const guard = new Promise(res => setTimeout(res, 9000 / tl.rate + 1000));   // never hang the game
        try { await Promise.race([fn ? fn(ctx) : Promise.resolve(), guard]); } catch (e) { console.error('[board] battle anim failed', e); }
        tl.finish();
        battleTl = null; emit('battleend', { move: m });
      } else {
        const jobs = [];
        if (viaDrag) jobs.push(settle(tl, rec, to)); else jobs.push(runMoveAnim(tl, rec, from, to, m));
        if (castle) jobs.push(kit.hopTo(animCtx(tl, castle.rec, castle.from, castle.to), castle.rec.live, sqVec(castle.to), { height: 0.9, ms: 300, squash: 0.2 }));
        if (vrec) jobs.push(plainCapture(tl, vrec, viaDrag ? 40 : 150));
        await Promise.all(jobs);
      }
      if (promo && my === gen) await promoteFlourish(tl, rec, to, promo);
    } finally {
      timelines.delete(tl);
      if (rig.focusState.f > 0) easeFocusBack();
      if (vrec?.live) { pieces.removeLive(vrec.live); vrec.live = null; }
      if (my === gen) {
        endLive(rec); if (castle) endLive(castle.rec);
        if (promo) rec.type = promo;
        syncPieces();
      } else { endLive(rec); if (castle) endLive(castle.rec); }
      animCount--; emit('animend', { move: m });
      wake();
    }
  }
  function easeFocusBack() {
    const tl = new kit.Timeline(1); timelines.add(tl);
    const f = rig.focusState, f0 = f.f;
    tl.tween(260, e => { f.f = f0 * (1 - e); rig.moving = true; }, kit.ease.cubicOut).then(() => timelines.delete(tl));
    wake();
  }
  function skip() { if (battleTl) { battleTl.finish(); fx?.clear(); wake(); } }
  function finishAll() {
    for (const tl of timelines) tl.finish();
    if (drag) { const d = drag; drag = null; endLive(d.rec); mode = null; }
    fx?.clear();
  }

  // ------------------------------------------------------------ public API
  const board = {
    onMoveAttempt: opts.onMoveAttempt || null,
    onPromotion: opts.onPromotion || null,
    get orientation() { return orientation; },
    get theme() { return theme?.id; },
    get speed() { return speed; },
    get renderer() { return renderer; },
    get scene() { return scene; },
    /** The FX system (kit.createFX) — ui may use it for celebrations, e.g. board.fx.sparkles(...). */
    get fx() { return fx; },
    setPosition(fen, { animate = false } = {}) {
      if (animate && pieces) { const p = setPositionAnimated(fen); queue = p.catch(() => {}); return p; }
      setPositionNow(fen); queue = Promise.resolve(); return Promise.resolve();
    },
    applyMove(m, { battle = true } = {}) {
      if (typeof m === 'string') m = { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] };
      const p = queue.then(() => doApplyMove(m, { battle }));
      queue = p.catch(e => console.error(e));
      return p;
    },
    setOrientation(c) {
      if (c !== 'w' && c !== 'b') return;
      orientation = c; rig.setOrientation(c);
      if (theme) buildBoardMesh();
      wake();
    },
    setTheme,
    setAnimSpeed(s) { speed = s === 'off' || s === 0 ? 'off' : (Number(s) || 1); if (battleTl && speed !== 'off') battleTl.rate = speed; },
    setInteractive(c) { interactive = c === 'w' || c === 'b' || c === 'both' ? c : null; if (!interactive) { select(null); cancelDrag(); } },
    highlight(h = {}) {
      if ('lastMove' in h) hl.lastMove = h.lastMove;
      if ('check' in h) hl.check = h.check;
      if ('hint' in h) hl.hint = h.hint;
      if ('legalTargets' in h) legalTargets = (h.legalTargets || []).map(t => (typeof t === 'string' ? t : t.to)).filter(isSq);
      if ('selected' in h) { selected = h.selected; }
      refreshOverlays();
    },
    showArrows(list) {
      const named = { hint: '#3fa9ff', good: '#4cc160', bad: '#e5484d', threat: '#e5484d', default: '#ffa81f' };
      arrows = (list || []).filter(a => a && isSq(a.from) && isSq(a.to)).map(a => ({ ...a, color: named[a.color] || a.color }));
      refreshOverlays();
    },
    setCoords(on) { o.coordinates = on !== false; if (theme) buildBoardMesh(); wake(); },
    setOptions(p = {}) {
      if ('coords' in p || 'coordinates' in p) board.setCoords(p.coords ?? p.coordinates);
      if ('keyboard' in p) o.keyboard = !!p.keyboard;
      if ('autoHighlight' in p) o.autoHighlight = !!p.autoHighlight;
      if ('legalMoves' in p) o.legalMoves = p.legalMoves;
      if ('maxPixelRatio' in p) { o.maxPixelRatio = p.maxPixelRatio; resize(); }
      if ('labels' in p) { o.labels = p.labels !== false; tags.enabled = o.labels; if (!o.labels) tags.hide(); }
    },
    select(sq) { select(isSq(sq) ? sq : null); },
    skip,
    isAnimating() { return animCount > 0; },
    whenIdle() { return queue; },
    /** Show / hide a piece name tag programmatically (e.g. learn mode). */
    showLabel(sq) { const r = recs.get(sq); if (r) tags.show(sq, r, 'tap'); },
    hideLabel() { tags.hide(); },
    pieceAt(sq) { const r = recs.get(sq); return r ? { type: r.type, color: r.color } : null; },
    /** Square centre in container CSS pixels (for placing the promotion picker etc.). */
    squareToScreen(sq, y = 0) {
      const v = sqVec(sq, y).project(camera);
      return { x: (v.x + 1) / 2 * cssW, y: (1 - v.y) / 2 * cssH };
    },
    camera: {
      /** 'top' | 'tilt' | 'angle' | 'free' ('default' = 'tilt'). Emits 'view'. */
      preset(name) { return setView(name); },
      /** Top → Tilt → Angle → Free → Top. Returns the new view name. Also bound to the V key. */
      cycle() { return cycleView(); },
      get view() { return rig.presetName; },
      get label() { return VIEW_LABELS[rig.presetName]; },
      get locked() { return rig.locked; },
      setLocked(on) { rig.setLocked(on); wake(); },
      views: VIEW_ORDER, labels: VIEW_LABELS,
      reset() { rig.reset(); wake(); },
      orbit(dTheta, dPhi) { rig.orbit(dTheta, dPhi); wake(); },
      zoom(f) { rig.zoomBy(f); wake(); },
      setAutoRotate(radPerSec) { rig.autoRotate = radPerSec || 0; rig.moving = true; wake(); },
      get state() { return rig.state; },
      get three() { return camera; },
    },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => listeners.get(name).delete(fn); },
    off(name, fn) { listeners.get(name)?.delete(fn); },
    resize,
    stats() { return { fps: +stat.fps.toFixed(1), frameMs: +stat.frameMs.toFixed(2), jsMs: +stat.jsMs.toFixed(2), drawCalls: stat.calls, triangles: stat.tris, pixelRatio: renderer.getPixelRatio(), pieces: pieces?.report() }; },
    /** Force one render now (tests/screenshots). */
    render() { renderer.shadowMap.needsUpdate = true; rig.update(16); renderer.render(scene, camera); stat.calls = renderer.info.render.calls; stat.tris = renderer.info.render.triangles; },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); finishAll();
      ro.disconnect(); window.removeEventListener('orientationchange', onWinResize);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
      fx?.dispose(); pieces?.dispose(); overlays?.dispose();
      if (boardObj) disposeDeep(boardObj); if (envObj) disposeDeep(envObj);
      envTex?.dispose(); pmrem.dispose(); renderer.dispose();
      canvas.remove(); flashEl.remove(); tags.dispose();
    },
  };

  canvas.__board = board;             // devtools / headless tests: document.querySelector('canvas').__board
  resize();
  await setTheme(o.theme);
  setPositionNow(o.fen || START_FEN);
  if (o.lastMove) board.highlight({ lastMove: o.lastMove });
  wake();
  return board;
}

function safe(fn, dflt) { try { return fn(); } catch (e) { console.error(e); return dflt; } }
function disposeDeep(obj) {
  obj.parent?.remove(obj);
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.userData?.kitCached) continue; m.map?.dispose(); m.dispose(); }
  });
}
