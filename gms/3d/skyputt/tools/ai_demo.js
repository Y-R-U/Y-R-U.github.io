// Ghost AI demo: one hole, 3 AI golfers taking turns as ghost balls, in the real hole view + theme.
// URL: tools/ai_demo.html?hole=sky9&theme=sky&golfers=pro:0.9,bertha:0.6,banks:0.6&seed=3&speed=1
// Imports the game's modules read-only (builder, holeview, camera rig, themes). window.__demo for CDP.
import * as THREE from 'three';
import { COURSES } from '../js/course/holes/index.js';
import { buildHole } from '../js/course/builder.js';
import { buildHoleView } from '../js/game/holeview.js';
import { CameraRig } from '../js/game/camera.js';
import { AIGolfer, PERSONALITIES, createAIClient, ballState, hashStr } from '../js/ai/index.js';
import { GhostBall } from '../js/ai/ghost.js';

const params = new URLSearchParams(location.search);
const holeId = params.get('hole') || 'sky9';
const def = COURSES.sky.holes.find(h => h.id === holeId) || COURSES.sky.holes[0];
const seed = +(params.get('seed') || 3);
const speed = +(params.get('speed') || 1);
const quality = params.get('q') === 'low' ? 'low' : 'high';
const spec = (params.get('golfers') || 'pro:0.9,bertha:0.6,banks:0.6').split(',').map(s => s.split(':'));
const demo = window.__demo = { ready: false, done: false, log: [], scores: null, mode: null };

const $ = s => document.querySelector(s);
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
const rig = new CameraRig(camera);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

async function loadTheme(id) {
  const ctx = { THREE, renderer, quality };
  const fallback = (await import('../js/themes/greybox/index.js')).default(ctx);
  if (id === 'greybox') return { theme: fallback, fallback };
  try { return { theme: (await import(`../js/themes/${id}/index.js`)).default(ctx), fallback }; }
  catch (e) { console.warn('[ai_demo] theme unavailable, greybox', e); return { theme: fallback, fallback }; }
}

const { theme, fallback } = await loadTheme(params.get('theme') || 'sky');
const hole = buildHole(def);
const view = buildHoleView(scene, hole, theme, fallback, { renderer, camera, quality });
rig.occluders = view.occluders;
const teeV = new THREE.Vector3(hole.tee.x, hole.tee.y, hole.tee.z);
const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, -(tz - z));
// heading down the fairway from a spot: toward the main-track frame ~2.4 m further on (or the cup when close)
const mainFrames = hole.frames.filter(f => !f.loop);
function fairwayYaw(p) {
  if (Math.hypot(hole.cup.x - p[0], hole.cup.z - p[2]) < 2.5) return yawTo(p[0], p[2], hole.cup.x, hole.cup.z);
  let bi = 0, bd = Infinity;
  mainFrames.forEach((f, i) => { const d = Math.hypot(f.p[0] - p[0], (f.p[1] - p[1]) * 2, f.p[2] - p[2]); if (d < bd) { bd = d; bi = i; } });
  const t = mainFrames[Math.min(mainFrames.length - 1, bi + 12)].p;
  return yawTo(p[0], p[2], t[0], t[2]);
}
{ const f = hole.teeFrame.f; rig.snap(teeV, Math.atan2(f[0], -f[2])); }

// golfers + ghosts
const golfers = spec.map(([pid, sk], i) => new AIGolfer({ personality: pid, skill: +sk || 0.6, seed: hashStr(`demo:${seed}:${i}`) }));
const ghosts = golfers.map(g => { const gb = new GhostBall({ color: g.color }); gb.place(hole.tee); scene.add(gb); return gb; });
const players = golfers.map((g, i) => ({ g, ghost: ghosts[i], strokes: 0, done: false, ball: { x: hole.tee.x, y: hole.tee.y, z: hole.tee.z } }));

function board(active = -1) {
  $('#board').innerHTML = `<h1>${def.name} · par ${def.par}</h1>` + players.map((p, i) => `
    <div class="row ${i === active ? 'on' : ''}"><span class="dot" style="background:#${p.g.color.toString(16).padStart(6, '0')}"></span>
    <span class="nm">${p.g.pers.name} <span class="sub">${p.g.rank} ${p.g.rating}</span></span><span>${p.done ? (p.strokes === 1 ? 'ACE' : p.strokes) : p.strokes || '–'}</span></div>`).join('');
}
board();

// ---- plan the whole turn sequence up front in the worker, on one shared obstacle clock
const ai = createAIClient({ worker: params.get('worker') !== '0' });
demo.mode = ai.mode;
const turns = [];
let clock = 0;
const maxStrokes = def.par + 4;
const tPlan = performance.now();
for (let round = 0; round < maxStrokes && players.some(p => !p.done); round++) {
  for (const [i, p] of players.entries()) {
    if (p.done) continue;
    $('#msg').textContent = `${p.g.pers.name} is planning…`;
    const s = await ai.shot(def, p.g, p.ball, { t0: clock + 1.0 });
    p.strokes++;
    const shot = { ...s, who: i };
    turns.push(shot);
    demo.log.push({ who: p.g.personality, n: p.strokes, state: s.state, sims: s.plan.sims, ms: Math.round(s.plan.ms) });
    clock = s.t1;
    if (s.state === 'cup') p.done = true;
    else if (s.state === 'oob') { p.strokes++; shot.to = s.from; p.ball = { x: s.from[0], y: s.from[1], z: s.from[2] }; clock += 1.0; }
    else p.ball = s.rest;
    if (!p.done && p.strokes >= maxStrokes) p.done = true;
  }
}
const planMs = performance.now() - tPlan;
const final = players.map(p => p.strokes);
players.forEach(p => { p.strokes = 0; p.done = false; });
demo.scores = final; demo.planMs = Math.round(planMs); demo.ready = true;
$('#msg').textContent = '';
board();

// ---- playback in real time: the hole's obstacles run on the same clock the shots were planned on
let wt = 0, next = 0, active = -1;
const focus = teeV.clone();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed; last = now;
  wt += dt;
  const sh = turns[next];
  if (sh && wt >= sh.t0) {
    const p = players[sh.who];
    p.ghost.play({ ...sh, hz: 30 }, { onDone: () => {
      p.strokes += sh.state === 'oob' ? 2 : 1;
      if (sh.state === 'cup') { p.done = true; $('#msg').textContent = p.strokes === 1 ? `${p.g.pers.name}: HOLE IN ONE!` : `${p.g.pers.name} holes out in ${p.strokes}`; }
      else if (sh.state === 'oob') $('#msg').textContent = `${p.g.pers.name}: out of bounds, +1`;
      else $('#msg').textContent = '';
      if (next >= turns.length && players.every(q => !q.ghost.playing)) demo.done = true;
      board(active);
    } });
    p.ghost.update(wt - sh.t0);   // catch up to the exact clock
    active = sh.who; next++;
    board(active);
    const nx = turns[next];
    if (!nx) setTimeout(() => { demo.done = true; }, 3000);
  }
  for (const g of ghosts) g.update(dt);
  // camera follows the ball in play (or the next one up)
  const tgt = active >= 0 ? ghosts[active].ball.position : teeV;
  const rolling = active >= 0 && ghosts[active].playing;
  focus.copy(tgt);
  if (rolling) {
    const s = turns[next - 1], p = s.path, hz = 30, f = Math.min(p.length / 3 - 1, Math.floor((wt - s.t0) * hz) + 3);
    if (f > 0) { const x = p[f * 3], z = p[f * 3 + 2]; if (Math.hypot(x - tgt.x, z - tgt.z) > 0.05) rig.setGoalYaw(yawTo(tgt.x, tgt.z, x, z)); }
  } else if (turns[next]) {
    const n = turns[next]; const f = n.from; focus.set(f[0], f[1], f[2]);
    rig.setGoalYaw(fairwayYaw(f));
  }
  rig.update(dt, focus, { rolling });
  rig.avoidOcclusion?.(focus, dt);
  view.update(dt, now / 1000, wt, null);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
