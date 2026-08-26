// The gfx lab: the real renderer driven by a fake world, with every layer toggleable.
// URL params: biome, tod, weather, seed, plane, preserve, dpr, photo, bloom, freeze, ang, alt, t.

import { makeRenderer } from '../../js/gfx/renderer.js';
import { makeFakeWorld } from './fakeworld.js';
import { makeReadout } from './readout.js';
import { BIOME_KEYS, TOD_KEYS, WEATHER_KEYS } from '../../js/gfx/palette.js';

const q = new URLSearchParams(location.search);
const gl = document.getElementById('gl');
const hud = document.getElementById('hud');

const cfg = {
  biome: q.get('biome') || 'farmland',
  tod: q.get('tod') || 'dawn',
  weather: q.get('weather') || 'clear',
  seed: Number(q.get('seed') || 1234),
  plane: q.get('plane') || 'kestrel',
};
const photoLvl = Number(q.get('photo') || 0);   // 1 = hide UI, keep a one-line stamp; 2 = clean
const photo = photoLvl >= 1;
const freeze = q.get('freeze') === '1';
const startAlt = Number(q.get('alt') || 0);
const fixedAng = q.has('ang') ? Number(q.get('ang')) : undefined;
const warm = Number(q.get('t') || 0);

let world = makeFakeWorld(cfg);
const R = makeRenderer({ gl, hud });
R.setQuality({ bloom: q.get('bloom') !== '0', reduceEffects: q.get('reduce') === '1' });

const readout = makeReadout(R.camApi);
R.camera.add(readout.mesh);
readout.setVisible(photoLvl < 2);
readout.setCompact(photoLvl === 1);

const layers = { sky: true, clouds: true, backdrop: true, terrain: true, veg: true, actors: true, fx: true };
// ?gate=1 makes the frame REPRODUCIBLE: no random explosions, no gunfire, a fixed-dt warm-up and
// then a hard freeze. tools/contrastgate.mjs depends on this — a contrast number measured on a
// frame that differs run to run is not a gate, it is a coin toss.
const gateMode = q.get('gate') === '1';
const ctl = { climb: 0, freeze, ang: fixedAng, noGuns: gateMode, noBooms: gateMode };

function rebuild() {
  world = makeFakeWorld(cfg);
  if (startAlt) world.player.y += startAlt;
}
if (startAlt) world.player.y += startAlt;

// ------------------------------------------------------------------ controls
const ui = document.getElementById('ui');
function btn(label, fn, isOn) {
  const b = document.createElement('button');
  b.textContent = label;
  if (isOn) b.classList.add('on');
  b.onclick = () => { fn(b); };
  ui.appendChild(b);
  return b;
}
function sel(list, value, fn) {
  const s = document.createElement('select');
  for (const v of list) { const o = document.createElement('option'); o.value = o.textContent = v; s.appendChild(o); }
  s.value = value;
  s.onchange = () => fn(s.value);
  ui.appendChild(s);
  return s;
}
sel(BIOME_KEYS, cfg.biome, (v) => { cfg.biome = v; rebuild(); });
sel(TOD_KEYS, cfg.tod, (v) => { cfg.tod = v; rebuild(); });
sel(WEATHER_KEYS, cfg.weather, (v) => { cfg.weather = v; rebuild(); });
for (const k of Object.keys(layers)) {
  btn(k, (b) => { layers[k] = !layers[k]; b.classList.toggle('on', layers[k]); applyLayers(); }, true);
}
btn('BOOM', () => {
  const x = world.cam.x + world.cam.vw * 0.5, y = world.terrain.heightAt(x) + 60;
  world.events.push({ e: 'explode', x, y, r: 300, kind: 'ground' });
  world.cam.shakeMag = 30;
});
btn('NUKE', () => {
  const x = world.cam.x + world.cam.vw * 0.5, y = world.terrain.heightAt(x) + 90;
  world.events.push({ e: 'explode', x, y, r: 620, kind: 'ground', nuke: true });
  world.cam.shakeMag = 46;
});
btn('bloom', (b) => { const on = !R.quality().bloom; R.setQuality({ bloom: on }); b.classList.toggle('on', on); }, R.quality().bloom);
btn('reduce', (b) => { const on = !R.quality().reduceEffects; R.setQuality({ reduceEffects: on }); b.classList.toggle('on', on); });
btn('climb', (b) => { ctl.climb = ctl.climb ? 0 : 520; b.classList.toggle('on', !!ctl.climb); });
btn('dive', (b) => { ctl.climb = ctl.climb ? 0 : -520; b.classList.toggle('on', !!ctl.climb); });
btn('freeze', (b) => { ctl.freeze = !ctl.freeze; b.classList.toggle('on', ctl.freeze); });
btn('photo', (b) => {
  const on = !document.body.classList.contains('photo');
  document.body.classList.toggle('photo', on);
  readout.setVisible(!on);
  b.classList.toggle('on', on);
});
btn('reseed', () => { cfg.seed = (cfg.seed * 7 + 13) % 99991; rebuild(); });

function applyLayers() {
  R.parts.sky.group.visible = layers.sky;
  R.parts.clouds.setVisible(layers.clouds);
  R.parts.backdrop.setVisible(layers.backdrop);
  R.parts.terrain.root.visible = layers.terrain;
  R.parts.terrain.setVegVisible(layers.veg);
  R.parts.actors.root.visible = layers.actors;
  R.parts.fx.root.visible = layers.fx;
  R.parts.explosions.root.visible = layers.fx;
  R.parts.debris.root.visible = layers.fx;
}

// ------------------------------------------------------------------ frame loop
let last = performance.now();
const frameMs = [];
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  const t0 = performance.now();

  if (!gateMode) world.tick(dt, ctl);
  R.draw(world, 1, world.drainEvents());

  const ms = performance.now() - t0;
  frameMs.push(ms);
  if (frameMs.length > 240) frameMs.shift();

  const sorted = frameMs.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const s = R.stats;
  readout.set([
    `${s.palette}  seed ${cfg.seed}  ${s.size}@${s.dpr}  bloom ${R.quality().bloom ? 'on' : 'off'}`,
    `plane ${cfg.plane}`,
    `p95 ${p95.toFixed(2)}ms  draws ${s.drawCalls}  tris ${(s.tris / 1000).toFixed(1)}k  chunks ${s.chunks}  parts ${s.particles}`,
    `cam ${world.cam.x.toFixed(0)},${world.cam.y.toFixed(0)}  plane ${world.player.x.toFixed(0)},${world.player.y.toFixed(0)}`,
  ]);
  readout.fit();

  window.__state = {
    fps: s.fps, ms: s.ms, p95, drawCalls: s.drawCalls, tris: s.tris,
    palette: s.palette, seed: cfg.seed, biome: cfg.biome, tod: cfg.tod, weather: cfg.weather,
    size: s.size, dpr: s.dpr, chunks: s.chunks, particles: s.particles,
    bloom: R.quality().bloom, cam: { x: world.cam.x, y: world.cam.y, vw: world.cam.vw },
    plane: { x: world.player.x, y: world.player.y, ang: world.player.ang },
    ready: true,
  };
  requestAnimationFrame(frame);
}

addEventListener('resize', () => { R.resize(); readout.fit(); });
R.resize();
applyLayers();
if (photo) document.body.classList.add('photo');

// warm the sim forward so a capture at t=0 is not an empty frame
if (warm > 0) for (let i = 0; i < Math.round(warm * 60); i++) { world.tick(1 / 60, ctl); world.drainEvents(); }
if (gateMode) ctl.freeze = true;

// expose for tools/contrastgate.mjs and ad-hoc CDP pokes
window.__lab = {
  R, get world() { return world; }, cfg, ctl, layers, applyLayers,
  boom(x, y, r, o) { R.boom(x, y, r, o); },
  setPlaneVisible(v) { R.parts.actors.root.visible = v; },
  /** Paint the player in sky colour so the contrast gate can be proven to fail. */
  camouflage(on) {
    const A = R.parts.actors;
    if (!on) { A.camouflagePlayer(null); return; }
    // sample the sky ACTUALLY behind the plane, so the sabotage is the real failure mode
    const p = R.project(world.player.x, world.player.y);
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const g2 = c.getContext('2d');
    g2.drawImage(gl, 0, 0);
    const sx = Math.round(p.x * (gl.width / R.camApi.W));
    const sy = Math.round((p.y - 70) * (gl.height / R.camApi.H));
    const d = g2.getImageData(Math.max(0, Math.min(gl.width - 1, sx)), Math.max(0, Math.min(gl.height - 1, sy)), 1, 1).data;
    const hex = (d[0] << 16) | (d[1] << 8) | d[2];
    A.camouflagePlayer(hex);
    return '#' + hex.toString(16).padStart(6, '0');
  },
  /** Screen-space boxes for the player and every other visible actor, for the gate. */
  targets() {
    const out = [];
    const vw = world.cam.vw;
    for (const e of world.ents) {
      if (e.dead) continue;
      const d = e.def || {};
      const isAir = e.kind === 'player' || e.kind === 'fighter';
      // aircraft boxes are the FUSELAGE CORE, not the full span: a full-span box is mostly
      // background, and background contamination is what makes a contrast number lie.
      const len = isAir ? (d.len || (e.w ? e.w * 2 : 110)) * 0.66 : (e.w || 40) * 2;
      const hgt = isAir ? (d.len || (e.w ? e.w * 2 : 110)) * 0.22 : (e.h || 30) * 2.4;
      const cy = isAir ? e.y : e.y - (e.h || 30) * 0.2;
      const p = R.project(e.x, cy);
      const s = R.scale();
      const w = len * s, h = Math.max(10 * s, hgt * s);
      if (p.x < -w || p.x > R.camApi.W + w || p.y < -h || p.y > R.camApi.H + h) continue;
      out.push({ id: e.id, kind: e.kind, shape: d.shape || '', x: p.x - w / 2, y: p.y - h / 2, w, h });
    }
    return out;
  },
  planeScreen() {
    const p = R.project(world.player.x, world.player.y);
    return { x: p.x, y: p.y, len: (world.player.def.len || 120) * R.scale() };
  },
};

requestAnimationFrame(frame);
