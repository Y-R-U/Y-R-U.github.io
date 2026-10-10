import * as THREE from 'three';
import { createVeils } from './veil.js';
import { UNVEILED } from '../data/veils.js';

// Live 3D bust of the speaker in the dialogue portrait. The main renderer draws it into a corner of the canvas before
// the world frame (which then overwrites it), and the pixels are copied into the portrait's 2D canvas. Humans call in
// over the Link wearing their veil (veil.js, D30); unknown voices get a 2D waveform emblem. The one unveiled call
// plays a real portrait clip instead (portrait.unveiled).
const MODEL = { rental: 'rental', bulwark: 'brawler', ghost: 'ghost', gold: 'civ_gold', chrome: 'civ_chrome', black: 'civ_black', robot: 'security', human: 'human' };
const ACCENT = { human: 0x5fd8ff, gold: 0xffc865, civ_gold: 0xffc865, black: 0xff6a4a, civ_black: 0xff6a4a, ghost: 0x46e0ff, rental: 0xff9a4a };

export function createBust({ world, robots, tier, ui, audio }) {
  const dlg = ui?.dialogue;
  const box = dlg?.el?.querySelector('.dl-portrait');
  const cv = box?.querySelector('canvas.pc');
  if (!box || !cv || !robots?.createRobot) return null;
  const g2 = cv.getContext('2d', { alpha: true });
  const renderer = world.renderer;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(22, 0.8, 0.05, 30);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(1.6, 2.4, 2.2);
  const rim = new THREE.DirectionalLight(0x7fdcff, 3.2); rim.position.set(-2.2, 1.4, -2.0);
  scene.add(key, rim, key.target, rim.target);
  const veils = createVeils();
  let vid = null, veil = null;
  const bgCache = new Map();
  function bgTex(hex) {
    if (bgCache.has(hex)) return bgCache.get(hex);
    const c = document.createElement('canvas'); c.width = 64; c.height = 80;
    const x = c.getContext('2d'), col = new THREE.Color(hex);
    const rgb = (a, k = 1) => `rgba(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0},${a})`;
    x.fillStyle = '#030a14'; x.fillRect(0, 0, 64, 80);
    let gr = x.createRadialGradient(32, 30, 2, 32, 34, 46);
    gr.addColorStop(0, rgb(0.42, 0.55)); gr.addColorStop(0.55, rgb(0.12, 0.4)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 80);
    gr = x.createLinearGradient(0, 56, 0, 80); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, rgb(0.22, 0.5));
    x.fillStyle = gr; x.fillRect(0, 56, 64, 24);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    bgCache.set(hex, t);
    return t;
  }

  let pendingMats = [], compileT0 = 0, accStr = '#66d8ff', actor = null, curKey = '', mode = 'off', ready = false, level = 0, t = 0, wantLive = false;
  const head = new THREE.Vector3(), chest = new THREE.Vector3(), vp = new THREE.Vector4(), sc = new THREE.Vector4(), buf = new THREE.Vector2();
  const eyes = [];
  const stats = { renders: 0, calls: 0, ms: 0, compileMs: 0 };
  // med/low: the bust redraws every 2nd frame; its box is measured only when it can have changed size
  const every = tier.name === 'high' ? 1 : 2;
  let tick = 0, dtAcc = 0, size = null;
  const remeasure = () => { size = null; };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(remeasure).observe(cv.parentNode);
  addEventListener('resize', remeasure);

  function clear() {
    veils.remove(); veil = null;
    if (actor) { scene.remove(actor.root); actor.dispose?.(); actor = null; }
    pendingMats = [];
    eyes.length = 0; ready = false; curKey = '';
    stopVideo();
  }

  // the unveiled call: mp4 loop (muted, inline) → jpg still → the SVG portrait underneath, never a broken frame
  function stopVideo() {
    box.classList.remove('vid');
    if (vid) vid.pause();
  }
  function playVideo(base) {
    const win = box.querySelector('.pwin');
    if (!vid) {
      vid = document.createElement('video');
      vid.className = 'pv';
      for (const a of ['muted', 'playsinline', 'webkit-playsinline', 'loop', 'disablepictureinpicture']) vid.setAttribute(a, '');
      vid.muted = true; vid.preload = 'none';
      vid.addEventListener('error', () => { if (vid.dataset.base) { const im = new Image(); im.className = 'pv'; im.onerror = () => { im.remove(); box.classList.remove('vid'); }; im.src = vid.dataset.base + '.jpg'; vid.replaceWith(im); vid = null; } });
      win.insertBefore(vid, win.querySelector('.pscan'));
    }
    if (vid.dataset.base !== base) { vid.dataset.base = base; vid.poster = base + '.jpg'; vid.src = base + '.mp4'; }
    box.classList.add('vid');
    vid.play?.().catch(() => {});
  }

  function setSpeaker(o) {
    const p = typeof o.portrait === 'string' ? { kind: /[/.]/.test(o.portrait) ? 'unknown' : o.portrait } : (o.portrait || { kind: 'unknown' });
    const kind = p.model || MODEL[p.kind] || (robots.ROBOT_KINDS?.includes(p.kind) ? p.kind : null);
    const unv = p.unveiled && p.veil && UNVEILED[p.veil];
    const k = unv ? 'unveiled|' + p.veil : kind ? `${kind}|${p.seed ?? 1}|${p.tier ?? 0}|${p.hue ?? ''}|${p.veil ?? ''}` : 'emblem|' + (p.hue ?? '');
    wantLive = true;
    if (k === curKey) return;
    clear();
    curKey = k;
    const human = kind === 'human';
    const hue = p.hue != null ? new THREE.Color().setHSL(p.hue / 360, 0.95, 0.62).getHex() : null;
    const accent = unv ? 0xffd9a8 : human ? veils.tintOf(p.veil) : hue ?? ACCENT[p.kind] ?? ACCENT[kind] ?? 0x66d8ff;
    accStr = '#' + new THREE.Color(accent).getHexString();
    box.style.setProperty('--acc', accStr);
    dlg.el.style.setProperty('--acc-tag', human || unv ? accStr : '');
    if (unv) { mode = 'video'; ready = true; box.classList.remove('live'); playVideo(unv); return; }
    if (!kind) { mode = 'emblem'; ready = true; box.classList.add('live'); return; }
    mode = 'bust';
    box.classList.remove('live');
    try { actor = robots.createRobot({ kind, tier: p.tier ?? 0, seed: p.seed ?? 1, quality: tier.name }); } catch (e) { console.warn('[bust]', e); mode = 'off'; return; }
    actor.mesh.castShadow = false; actor.mesh.frustumCulled = false;
    actor.root.rotation.y = -0.38;
    actor.play('idle');
    if (human) veil = veils.wear(actor, p.veil);
    actor.update(0.016);
    if (veil) veils.pose(actor, t, 0);
    scene.add(actor.root);
    rim.color.setHex(accent);
    scene.background = bgTex(human ? accent : 0x2a6f9a);
    scene.environment = world.scene.environment;
    for (const m of [].concat(actor.mesh.material)) if (m.userData?.slot === 'eye' || m.userData?.slot === 'glow') eyes.push(m);
    aim();
    frame(0);
    // compile without blocking (KHR_parallel_shader_compile); update() shows the bust once every program links.
    // three's own compileAsync throws if a material is disposed while it polls, so poll here instead.
    pendingMats = [...renderer.compile(scene, cam)];
    compileT0 = performance.now();
  }

  function linked() {
    pendingMats = pendingMats.filter((m) => { const p = renderer.properties.get(m).currentProgram; return p && p.isReady && !p.isReady(); });
    return !pendingMats.length;
  }

  // framed once per speaker so the talk sway reads against a still camera
  function aim() {
    actor.root.updateMatrixWorld(true);
    actor.sockets.head.getWorldPosition(head);
    actor.mesh.skeleton.bones[2].getWorldPosition(chest);
    const span = Math.max(0.3, head.y - chest.y);
    const top = head.y + span * 0.55, bot = chest.y - span * 0.12;
    const ty = (top + bot) / 2, half = (top - bot) / 2;
    const dist = half / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(head.x + dist * 0.08, ty + span * 0.2, head.z + dist);
    cam.lookAt(head.x, ty, head.z);
  }

  function frame(dt) {
    actor.update(dt);
    if (veil) veils.pose(actor, t, level);
    const talking = dlg.open && !dlg.el.classList.contains('typed');
    const want = talking ? 'talk' : 'idle';
    if (actor.state.base !== want && actor.state.action !== want) actor.play(want, { loop: true, fade: 0.3 });
    for (const m of eyes) m.emissiveIntensity = (m.userData.baseEI ?? m.emissiveIntensity) * (1 + level * 2.2);
  }

  function drawEmblem(w, h, acc) {
    g2.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.46, R = Math.min(w, h) * 0.3;
    g2.save();
    g2.strokeStyle = acc; g2.fillStyle = acc; g2.shadowColor = acc; g2.shadowBlur = 12;
    g2.globalAlpha = 0.55; g2.lineWidth = Math.max(1, w / 140);
    g2.beginPath(); g2.arc(cx, cy, R, 0, Math.PI * 2); g2.stroke();
    g2.setLineDash([R * 0.12, R * 0.1]); g2.lineDashOffset = -t * R * 0.4;
    g2.beginPath(); g2.arc(cx, cy, R * 1.18, 0, Math.PI * 2); g2.stroke();
    g2.setLineDash([]); g2.globalAlpha = 0.9;
    const n = 13, bw = R * 1.5 / n;
    for (let i = 0; i < n; i++) {
      const e = Math.sin(t * 7 + i * 1.7) * 0.5 + 0.5, f = 1 - Math.abs(i - (n - 1) / 2) / n;
      const a = R * (0.08 + f * (0.12 + level * 0.9 * e + (dlg.el.classList.contains('typed') ? 0 : 0.25 * e)));
      g2.fillRect(cx - R * 0.75 + i * bw + bw * 0.2, cy - a, bw * 0.6, a * 2);
    }
    g2.restore();
  }

  function update(dt) {
    t += dt;
    veils.U.uT.value = t;
    if (!dlg.open && !dlg.el.classList.contains('show')) { if (wantLive) { wantLive = false; box.classList.remove('live'); stopVideo(); } return; }
    if (mode === 'off' || mode === 'video') return;
    if (!ready) { if (!linked()) return; ready = true; stats.compileMs = performance.now() - compileT0; }
    const lv = audio?.voLevel?.() ?? 0;
    level += (lv - level) * (1 - Math.exp(-dt * (lv > level ? 30 : 8)));
    box.style.setProperty('--vl', level.toFixed(3));
    dtAcc += dt;
    if (++tick % every) return;
    const fdt = dtAcc; dtAcc = 0;
    // layout size, not getBoundingClientRect: the open animation scales the box, and a ResizeObserver never sees transforms
    if (!size) { const el = cv.parentNode; size = { width: el.offsetWidth, height: el.offsetHeight }; }
    const r = size;
    if (r.width < 8 || r.height < 8) return;
    const pr = Math.min(2, renderer.getPixelRatio());
    const w = Math.round(r.width * pr), h = Math.round(r.height * pr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (mode === 'emblem') { drawEmblem(w, h, accStr); return; }
    renderer.getDrawingBufferSize(buf);
    if (w > buf.x || h > buf.y) return;
    const t0 = performance.now();
    frame(fdt);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const rp = renderer.getPixelRatio();
    renderer.getViewport(vp); renderer.getScissor(sc);
    const scT = renderer.getScissorTest(), ac = renderer.autoClear, calls0 = renderer.info.render.calls;
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, w / rp, h / rp); renderer.setScissor(0, 0, w / rp, h / rp); renderer.setScissorTest(true);
    renderer.autoClear = true;
    renderer.render(scene, cam);
    g2.clearRect(0, 0, w, h);
    g2.drawImage(renderer.domElement, 0, buf.y - h, w, h, 0, 0, w, h);
    renderer.setScissorTest(scT); renderer.setScissor(sc); renderer.setViewport(vp); renderer.autoClear = ac;
    stats.calls = renderer.info.render.calls - calls0;
    stats.renders++; stats.ms = performance.now() - t0;
    if (!box.classList.contains('live')) box.classList.add('live');
  }

  ui.on('dialogue:line', (o) => { size = null; try { setSpeaker(o); } catch (e) { console.warn('[bust]', e); } });
  ui.on('dialogue:end', () => { wantLive = false; box.classList.remove('live'); stopVideo(); if (mode === 'video') curKey = ''; level = 0; box.style.setProperty('--vl', 0); });
  return { update, stats, get mode() { return mode; }, get ready() { return ready; }, get key() { return curKey; }, get veil() { return veil; }, get video() { return vid; } };
}
