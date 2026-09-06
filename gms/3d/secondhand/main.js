import * as THREE from 'three';
import { buildTower } from './tower.js';
import { createGlass } from './glass.js';
import { Heist, DURATION, IMPACT_DELAY } from './heist.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const icons = () => window.lucide?.createIcons();
icons();
const state = new Heist();
const sound = new Sound();
let saved = {};
try { saved = JSON.parse(localStorage.getItem('secondhand.preferences') || '{}'); } catch { /* Storage is optional. */ }
let quality = saved.quality || 'auto';
let motion = saved.motion ?? !matchMedia('(prefers-reduced-motion: reduce)').matches;
$('quality').value = quality; $('motion').checked = motion;

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0e6df);
scene.fog = new THREE.FogExp2(0xe0e6df, .025);
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 80);
const pmrem = new THREE.PMREMGenerator(renderer);
const studio = new THREE.Scene(); studio.background = new THREE.Color(0x1b211f);
for (const [x, y, z, w, h, intensity] of [[-5, 4, 3, 3, 8, 6], [5, 2, 1, 1.3, 7, 3], [0, 7, -4, 5, 3, 5], [-1, 2, -6, 2, 6, 2]]) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity), side: THREE.DoubleSide }));
  panel.position.set(x, y, z); panel.lookAt(0, 2, 0); studio.add(panel);
}
const environment = pmrem.fromScene(studio, .035);
scene.environment = environment.texture; scene.environmentIntensity = .9;
studio.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xf4fff7, 0x526259, .7));
const keyLight = new THREE.DirectionalLight(0xfff6df, 2.8); keyLight.position.set(-3, 9, 6);
keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -5, right: 5, top: 8, bottom: -4, near: .1, far: 25 });
keyLight.shadow.normalBias = .025; keyLight.shadow.bias = -.00015; keyLight.shadow.radius = 3;
keyLight.target.position.set(0, 2.8, 0); scene.add(keyLight, keyLight.target);
const rim = new THREE.DirectionalLight(0xc1e2ef, 2.7); rim.position.set(4, 6, -4); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, .45); fill.position.set(1, 3, 8); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0xd3dcd1, roughness: .79, metalness: .04 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = .01; scene.add(floor);

// A raster contact shadow anchors the turned base without a costly extra render pass.
const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
const sc = shadowCanvas.getContext('2d');
const gradient = sc.createRadialGradient(64, 64, 24, 64, 64, 64); gradient.addColorStop(0, '#152f24aa'); gradient.addColorStop(.6, '#152f2440'); gradient.addColorStop(1, '#152f2400');
sc.fillStyle = gradient; sc.fillRect(0, 0, 128, 128);
const contact = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, opacity: .72 }));
contact.rotation.x = -Math.PI / 2; contact.position.y = .015; scene.add(contact);

const tower = buildTower(scene);
const glass = await createGlass(tower.dynamic, tower.mat.glass);
let width = innerWidth, height = innerHeight;
let yaw = .34, targetYaw = .34, pitch = .2, targetPitch = .2;
let focusIndex = 0, zoom = 1, targetZoom = 1, targetY = 3.2, lookY = 3.2;
let autoOrbit = false, photoMode = false, dpr = 1;
const cameraTarget = new THREE.Vector3(0, 3.2, 0);
const focusHeights = [3.2, 1.5, 3.5, 5.25];
let baseFrustum = 11;
function resize() {
  width = innerWidth; height = innerHeight;
  const mobile = width <= 760;
  const availableHeight = height - (mobile ? 190 : 110) - (mobile ? 180 : 200);
  baseFrustum = Math.max(8.6, 7.15 * height / Math.max(availableHeight, height * .42));
  if (width / height > 1.9) baseFrustum = Math.max(baseFrustum, 10.5);
  dpr = quality === 'low' ? 1 : Math.min(devicePixelRatio, quality === 'high' ? 2 : mobile ? 1.35 : 1.5);
  renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
  keyLight.castShadow = quality !== 'low';
  updateCamera(1, 0);
}
function updateCamera(blend, wallTime) {
  yaw += (targetYaw + (autoOrbit && motion ? Math.sin(wallTime * .16) * .55 : 0) - yaw) * blend;
  pitch += (targetPitch - pitch) * blend;
  zoom += (targetZoom - zoom) * blend;
  $('game').classList.toggle('inspecting', zoom > 1.1);
  lookY += (targetY - lookY) * blend;
  const h = baseFrustum / zoom;
  camera.left = -h * width / height / 2; camera.right = -camera.left;
  camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix();
  // Reserve more room for the footer in wide viewports while preserving portrait framing.
  const offset = width > 760 ? -.25 : -.07;
  cameraTarget.set(0, lookY + offset, 0);
  const sway = motion && !focusIndex ? Math.sin(wallTime * .3) * .009 : 0;
  camera.position.set(Math.sin(yaw + sway) * 18, lookY + Math.sin(pitch) * 18, Math.cos(yaw + sway) * 18);
  camera.lookAt(cameraTarget);
}
resize(); addEventListener('resize', resize);

let toastUntil = 0;
function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); toastUntil = performance.now() + 3200; }
function savePreferences() { try { localStorage.setItem('secondhand.preferences', JSON.stringify({ quality, motion })); } catch { /* Private browsing can disable storage. */ } }
let rewinding = null, completionPending = false, completionTimer = 0;
function act(id) {
  if (rewinding || state.replaying) return;
  if (id === 'wind') {
    if (state.wind()) { sound.wind(); toast('The mainspring remembers.'); }
  } else if (id === 'release') {
    if (state.drop()) { sound.click(); toast('Counterweight released.'); }
    else if (state.recording) toast('Your hands are occupied.');
    else if (!state.echo) toast('The counterweight needs a second hand.');
    else if (!state.power) toast('The echo is outside its charged interval.');
  } else if (id === 'take') {
    if (state.take()) {
      sound.win(); completionPending = true; completionTimer = 0;
      try {
        const best = Number(localStorage.getItem('secondhand.best')) || Infinity;
        if (state.time < best) localStorage.setItem('secondhand.best', state.time.toFixed(2));
      } catch { /* Optional best score. */ }
    } else if (!state.open) toast('The emerald seal is intact.');
  }
  updateUI();
}
for (const id of ['wind', 'release', 'take']) $(id).addEventListener('click', () => act(id));
$('rewind').onclick = () => {
  if (state.windAt === null || state.time <= 0 || rewinding) return;
  sound.rewind(); state.playing = false;
  rewinding = { from: state.time, to: state.dropAt === null ? state.windAt + .35 : Math.max(0, state.dropAt - .25), elapsed: 0 };
};
$('play').onclick = () => { state.playing = !state.playing; sound.click(); updateUI(); };
$('scrub').addEventListener('input', event => { rewinding = null; state.seek(Number(event.target.value)); updateUI(); });
function restart() {
  state.reset(); rewinding = null; completionPending = false;
  $('complete').close(); targetY = 3.2; targetZoom = 1; focusIndex = 0;
  $('record').textContent = 'NO TRACE LEFT'; updateUI(); sound.click();
}
$('restart').onclick = restart; $('again').onclick = restart;
$('watch').onclick = () => {
  $('complete').close(); state.replay(); targetY = 3.2; targetZoom = 1; focusIndex = 0;
  autoOrbit = motion; completionPending = false; updateUI();
};
$('sound').onclick = () => {
  sound.enable(!sound.enabled);
  $('sound').innerHTML = `<i data-lucide="${sound.enabled ? 'volume-2' : 'volume-x'}"></i>`;
  $('sound').title = sound.enabled ? 'Mute sound' : 'Enable sound'; $('sound').setAttribute('aria-label', $('sound').title); icons(); sound.click();
};
$('settings').onclick = () => { state.playing = false; $('preferences').showModal(); updateUI(); };
$('quality').onchange = event => { quality = event.target.value; savePreferences(); resize(); };
$('motion').onchange = event => { motion = event.target.checked; savePreferences(); };
$('view').onclick = () => { autoOrbit = !autoOrbit; $('view').setAttribute('aria-pressed', String(autoOrbit)); if (!autoOrbit) { targetYaw = .34; targetPitch = .2; } sound.click(); };
$('focus').onclick = () => {
  focusIndex = (focusIndex + 1) % 4; targetY = focusHeights[focusIndex];
  targetZoom = focusIndex ? (width <= 760 ? 1.85 : 1.7) : 1;
  targetYaw = focusIndex ? .12 : .34; targetPitch = focusIndex ? .08 : .2;
  sound.click();
};
function setPhoto(value) {
  photoMode = value; $('game').classList.toggle('photo-mode', value); $('restore-ui').hidden = !value;
}
$('photo').onclick = () => setPhoto(true); $('restore-ui').onclick = () => setPhoto(false);
addEventListener('keydown', event => {
  if (event.key === 'Escape') setPhoto(false);
  if (event.target.matches('input, select, button') || $('preferences').open || $('complete').open) return;
  if (event.code === 'Space') { event.preventDefault(); if (state.windAt !== null) $('play').click(); }
  if (event.key.toLowerCase() === 'r') $('rewind').click();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { state.playing = false; updateUI(); } });

const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
const sphere = new THREE.Sphere(); const hit = new THREE.Vector3();
function pick(x, y) {
  pointer.set(x / width * 2 - 1, -(y / height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
  for (const target of tower.pickTargets) {
    sphere.center.copy(target.point); sphere.radius = target.radius;
    if (raycaster.ray.intersectSphere(sphere, hit)) return target.id;
  }
  return null;
}
const pointers = new Map(); let gesture = null;
$('scene').addEventListener('pointerdown', event => {
  $('scene').setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  gesture = { x: event.clientX, y: event.clientY, yaw: targetYaw, pitch: targetPitch, moved: false, pinch: 0, zoom: targetZoom };
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y); gesture.moved = true; }
});
$('scene').addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) { $('scene').style.cursor = pick(event.clientX, event.clientY) ? 'pointer' : 'grab'; return; }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!gesture) return;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    if (gesture.pinch) targetZoom = THREE.MathUtils.clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.pinch, .8, 2.2);
    gesture.moved = true; return;
  }
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  if (Math.hypot(dx, dy) > 5) gesture.moved = true;
  if (gesture.moved) {
    autoOrbit = false;
    targetYaw = THREE.MathUtils.clamp(gesture.yaw + dx * .005, -.95, .95);
    targetPitch = THREE.MathUtils.clamp(gesture.pitch + dy * .002, -.07, .48);
  }
});
function pointerEnd(event) {
  if (gesture && !gesture.moved && event.type === 'pointerup') { const id = pick(event.clientX, event.clientY); if (id && !photoMode) act(id); }
  pointers.delete(event.pointerId); gesture = null;
}
$('scene').addEventListener('pointerup', pointerEnd); $('scene').addEventListener('pointercancel', pointerEnd);
$('scene').addEventListener('wheel', event => { event.preventDefault(); targetZoom = THREE.MathUtils.clamp(targetZoom * Math.exp(-event.deltaY * .001), .8, 2.2); }, { passive: false });

let lastPlaying = null;
function updateUI() {
  const finishedRecording = state.windAt !== null && !state.recording;
  const remain = Math.max(0, DURATION - state.time);
  $('remaining').textContent = String(Math.floor(remain)).padStart(2, '0');
  document.querySelector('.time-display small').textContent = '.' + String(Math.floor((remain % 1) * 100)).padStart(2, '0');
  $('elapsed').textContent = state.time.toFixed(2).padStart(5, '0');
  $('scrub').value = state.time; $('scrub').disabled = state.furthest === 0 || state.recording;
  $('scrub').setAttribute('aria-valuetext', `${state.time.toFixed(2)} seconds, ${state.furthest.toFixed(2)} recorded`);
  $('play').disabled = state.windAt === null || !!rewinding;
  $('rewind').disabled = !finishedRecording || state.time <= .05 || !!rewinding;
  $('wind').disabled = state.windAt !== null || state.replaying;
  $('release').disabled = !state.canDrop || state.replaying || !!rewinding;
  $('take').disabled = !state.open || state.won || state.replaying;
  $('wind').classList.toggle('recording', state.recording);
  $('release').classList.toggle('ready', state.canDrop);
  $('take').classList.toggle('ready', state.open && !state.won);
  $('wind-label').textContent = state.recording ? 'Winding...' : state.echo ? 'Echo recorded' : finishedRecording ? 'Spring wound' : 'Wind spring';
  $('wind-state').textContent = state.recording ? 'HANDS OCCUPIED' : state.echo ? '5 SECOND MEMORY' : finishedRecording ? 'MEMORY STORED' : 'RECORD 5 SECONDS';
  $('release-state').textContent = state.impact ? 'SEAL BROKEN' : state.dropAt !== null && state.time >= state.dropAt ? 'FALLING' : state.canDrop ? 'ECHO POWERED' : state.recording ? 'HANDS OCCUPIED' : 'NO POWER';
  $('take-state').textContent = state.taken ? 'RECOVERED' : state.open ? 'VAULT OPEN' : 'VAULT SEALED';
  $('seal-power').classList.toggle('active', state.echo && state.power);
  $('seal-glass').classList.toggle('active', state.impact);
  $('seal-vault').classList.toggle('active', state.taken);
  $('echo-track').style.left = `${(state.windAt || 0) / DURATION * 100}%`;
  $('echo-track').style.width = state.windAt === null ? '0' : `${5 / DURATION * 100}%`;
  $('echo-track').style.background = state.echo ? '#56a4bc45' : '#39856740';
  $('drop-marker').hidden = state.dropAt === null;
  if (state.dropAt !== null) $('drop-marker').style.left = `${state.dropAt / DURATION * 100}%`;
  $('timeline-label').textContent = rewinding ? 'REWINDING' : state.echo ? 'ECHO TIMELINE' : state.recording ? 'RECORDING' : 'TIMELINE';
  $('time-state').textContent = state.taken ? 'ARTEFACT RECOVERED' : state.replaying ? 'HEIST REPLAY' : rewinding ? 'TIME REVERSED' : state.echo && state.power ? 'ECHO ACTIVE' : state.recording ? 'RECORDING MEMORY' : state.playing ? 'TIME RUNNING' : state.windAt === null ? 'AWAITING INPUT' : 'TIME HELD';
  let objective = 'Wake the machine.', status = 'The mainspring is still.';
  if (state.recording) { objective = 'A moment, remembered.'; status = 'Your hands are occupied. The spring is charging.'; }
  else if (finishedRecording && !state.echo) { objective = 'Borrow a second hand.'; status = 'Your past is stored. The power faded five seconds later.'; }
  else if (state.echo && state.dropAt === null) { objective = 'Break the emerald seal.'; status = state.power ? 'Your echo holds the spring. The counterweight is armed.' : 'The mainspring has a five-second memory.'; }
  else if (state.dropAt !== null && !state.open) { objective = 'A beautiful fracture.'; status = 'The vault is yielding.'; }
  else if (state.open && !state.taken) { objective = 'Claim the chronometer.'; status = 'The iris is open. Nothing stands between you and time.'; }
  else if (state.taken) { objective = 'Time, stolen.'; status = 'One impossible moment. Perfectly executed.'; }
  if (state.time === DURATION && !state.won) { objective = 'The minute is over.'; status = 'Your recorded moments remain.'; }
  $('objective').textContent = objective; $('status').textContent = status;
  if (state.echo) $('record').textContent = '01 ECHO RECORDED';
  if (state.won) $('record').textContent = 'ARTEFACT RECOVERED';
  if (lastPlaying !== state.playing) {
    lastPlaying = state.playing;
    $('play').innerHTML = `<i data-lucide="${state.playing ? 'pause' : 'play'}"></i>`;
    $('play').title = state.playing ? 'Pause timeline' : 'Play timeline'; $('play').setAttribute('aria-label', $('play').title); icons();
  }
}
updateUI();
const start = performance.now(); let previous = start, frameCount = 0, sampleMs = 0, sampleFrames = 0, uiAccumulator = 0, lastImpact = false;
const frameTimes = [];
function frame(now) {
  const actualDt = (now - previous) / 1000;
  const dt = Math.min(.1, actualDt); previous = now;
  const wallTime = (now - start) / 1000;
  if (rewinding) {
    rewinding.elapsed += dt;
    const progress = Math.min(1, rewinding.elapsed / 1.3);
    const easing = progress * progress * (3 - 2 * progress);
    state.seek(THREE.MathUtils.lerp(rewinding.from, rewinding.to, easing));
    if (progress === 1) rewinding = null;
  } else {
    const fractureTime = state.dropAt === null ? -1 : state.time - state.dropAt - IMPACT_DELAY;
    const speed = fractureTime >= 0 && fractureTime < .48 && !state.replaying ? .38 : 1;
    state.tick(dt * speed);
  }
  if (state.impact && !lastImpact && state.playing) sound.glass();
  lastImpact = state.impact;
  sound.tick(state.time, state.power && state.playing);
  const intro = THREE.MathUtils.smoothstep(wallTime, 0, 1.8);
  tower.animate(state, wallTime, intro);
  glass.sample(state.dropAt === null ? 0 : Math.max(0, state.time - state.dropAt - IMPACT_DELAY));
  updateCamera(motion ? 1 - Math.exp(-dt * 5) : 1, wallTime);
  renderer.render(scene, camera);
  uiAccumulator += dt;
  if (uiAccumulator > .065) { updateUI(); uiAccumulator = 0; }
  if (toastUntil && now > toastUntil) { $('toast').classList.remove('visible'); toastUntil = 0; }
  if (completionPending) {
    completionTimer += dt;
    if (completionTimer > 2.7) {
      completionPending = false; state.playing = false;
      $('result-time').textContent = `${state.takeAt.toFixed(2)}s`; $('complete').showModal(); updateUI();
    }
  }
  if (state.replaying && !state.playing) state.replaying = false;
  if (frameCount > 30 && frameCount < 180) { sampleMs += actualDt * 1000; sampleFrames++; }
  if (frameCount === 180 && quality === 'auto' && sampleMs / sampleFrames > 28 && dpr > 1) {
    dpr = 1; renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
  }
  frameTimes.push(actualDt * 1000); if (frameTimes.length > 120) frameTimes.shift();
  frameCount++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('loading').style.opacity = '0'; setTimeout(() => $('loading').remove(), 650);
$('scene').addEventListener('webglcontextlost', event => { event.preventDefault(); state.playing = false; toast('Graphics interrupted. Reload to restore the vault.'); });

// Read-only observability for browser verification; game actions still use the real controls.
window.secondHand = {
  get state() { return { time: state.time, furthest: state.furthest, power: state.power, echo: state.echo, recording: state.recording, dropAt: state.dropAt, open: state.open, won: state.won, playing: state.playing, taken: state.taken }; },
  get metrics() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr, frames: frameCount, averageFrameMs: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length, shards: glass.shards.length }; },
  get fragment() { const m = glass.shards[20]; return [...m.position.toArray(), ...m.quaternion.toArray()]; },
  project(id) { const p = tower.pickTargets.find(p => p.id === id).point.clone().project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 }; },
};
