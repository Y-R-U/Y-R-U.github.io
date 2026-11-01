// SKYPUTT sound preview: audition every sound, the roll engine and the music.
// Also exposes window.__renderAll() for tools/sound_preview_cdp.mjs.
import { createAudio, SFX_NAMES, ROLL_SURFACES, renderSfx, renderRoll, renderMusic } from '../js/audio/index.js';

const $ = id => document.getElementById(id);
const audio = createAudio();
window.__audio = audio;

const P = () => ({ power: +$('pPower').value, speed: +$('pSpeed').value, material: $('pMat').value });
const GROUPS = {
  'g-shot': [['putt', () => ({ power: P().power })], ['wall', () => P()], ['bumper', () => P()], ['windmillHit', () => P()], ['aimTick', () => ({ power: P().power })]],
  'g-course': [['cupRattle'], ['cupDrop'], ['rattle + drop', null, () => { audio.play('cupRattle'); setTimeout(() => audio.play('cupDrop'), 420); }],
    ['lipOut'], ['splash'], ['fall'], ['pickup'], ['pickup x5', null, () => { for (let i = 0; i < 5; i++) setTimeout(() => audio.play('pickup'), i * 260); }],
    ['boost'], ['loop']],
  'g-ui': [['holeInOne'], ['birdie'], ['par'], ['bogey'], ['click'], ['back'], ['star 1', () => ({ n: 1 }), null, 'star'], ['star 2', () => ({ n: 2 }), null, 'star'],
    ['star 3', () => ({ n: 3 }), null, 'star'], ['stars 1-2-3', null, () => [1, 2, 3].forEach((n, i) => setTimeout(() => audio.play('star', { n }), i * 350))], ['coin']],
};
for (const [gid, list] of Object.entries(GROUPS)) {
  for (const [label, params, custom, name] of list) {
    const b = document.createElement('button');
    b.textContent = label; b.dataset.sfx = name || label;
    b.onclick = () => { audio.unlock(); custom ? custom() : audio.play(name || label, params ? params() : {}); };
    $(gid).appendChild(b);
  }
}
for (const s of ROLL_SURFACES) { const o = document.createElement('option'); o.textContent = s; $('rSurf').appendChild(o); }
for (const id of ['pPower', 'pSpeed']) $(id).oninput = () => { $(id + 'V').textContent = (+$(id).value).toFixed(id === 'pPower' ? 2 : 1); };
// aimTick follows the power slider, like dragging the aim
$('pPower').addEventListener('input', () => audio.play('aimTick', { power: +$('pPower').value }));

// gate: first gesture unlocks
const gate = $('gate');
const unlock = () => { audio.unlock(); gate.style.display = 'none'; };
gate.addEventListener('pointerdown', unlock);
addEventListener('pointerdown', () => audio.unlock());

// mix
const vol = () => audio.setVolume({ master: +$('vMaster').value, sfx: +$('vSfx').value, music: +$('vMusic').value });
for (const id of ['vMaster', 'vSfx', 'vMusic']) $(id).oninput = vol;
$('mute').onclick = () => { const on = !$('mute').classList.contains('on'); $('mute').classList.toggle('on', on); audio.mute(on); };

// roll: slider = held speed; "simulate a putt" = 4.5 m/s decaying to rest over ~3 s
let rollSpeed = 0, sim = null;
$('rSpeed').oninput = () => { sim = null; rollSpeed = +$('rSpeed').value; $('rSpeedV').textContent = rollSpeed.toFixed(2); };
$('rPutt').onclick = () => { audio.unlock(); audio.play('putt', { power: 0.7 }); sim = { v: 4.5, t: performance.now() }; };
$('rStop').onclick = () => { sim = null; rollSpeed = 0; $('rSpeed').value = 0; $('rSpeedV').textContent = '0.00'; audio.stopRoll(); };
let lastF = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastF) / 1000); lastF = now;
  if (sim) {
    sim.v = Math.max(0, sim.v - dt * (sim.v > 1 ? 1.5 : 0.8));
    rollSpeed = sim.v; $('rSpeed').value = sim.v; $('rSpeedV').textContent = sim.v.toFixed(2);
    if (sim.v <= 0) sim = null;
  }
  audio.roll(rollSpeed, $('rSurf').value);
  meter();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// music
$('mStart').onclick = () => { audio.unlock(); audio.music.start('sky'); };
$('mStop').onclick = () => audio.music.stop();
$('mDuck').onclick = () => { const on = !$('mDuck').classList.contains('on'); $('mDuck').classList.toggle('on', on); audio.music.duck(on); };

// meter + status
let an = null, buf = null;
function meter() {
  const E = audio.debugGraph();
  if (E && !an) { an = E.ctx.createAnalyser(); an.fftSize = 1024; E.out.connect(an); buf = new Float32Array(an.fftSize); }
  const st = audio.debugState();
  $('status').textContent = `audio: ${st.ctx} · voices ${st.active} · music ${st.music || 'off'}${st.ducked ? ' (ducked)' : ''} · roll ${st.roll ? 'on' : 'idle'}`;
  if (!an) return;
  an.getFloatTimeDomainData(buf);
  let pk = 0; for (const x of buf) pk = Math.max(pk, Math.abs(x));
  const db = pk > 0 ? 20 * Math.log10(pk) : -90;
  document.querySelector('#meter i').style.width = Math.max(0, Math.min(100, (db + 48) / 48 * 100)) + '%';
}

// offline measurements
const CASES = [
  ['putt', { power: 0.15 }], ['putt', { power: 0.6 }], ['putt', { power: 1 }],
  ...['stone', 'wood', 'metal', 'glass'].flatMap(m => [['wall', { speed: 1, material: m }], ['wall', { speed: 6.4, material: m }]]),
  ['bumper', { speed: 1.5 }], ['bumper', { speed: 6 }], ['windmillHit', { speed: 4 }],
  ['cupRattle', {}], ['cupDrop', {}], ['lipOut', {}], ['splash', {}], ['fall', {}],
  ['pickup', { combo: 0 }], ['pickup', { combo: 6 }], ['boost', {}], ['loop', {}],
  ['holeInOne', {}], ['birdie', {}], ['par', {}], ['bogey', {}],
  ['click', {}], ['back', {}], ['star', { n: 1 }], ['star', { n: 2 }], ['star', { n: 3 }], ['coin', {}],
  ['aimTick', { power: 0 }], ['aimTick', { power: 1 }],
];
const label = (n, p) => n + (Object.keys(p).length ? ' ' + Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',') : '');
window.__renderAll = async ({ music = 40 } = {}) => {
  const rows = [];
  for (const [n, p] of CASES) { const r = await renderSfx(n, p); rows.push({ key: label(n, p), post: r.post, pre: r.pre }); }
  for (const s of ROLL_SURFACES) { const r = await renderRoll(s, 4.5, 3); rows.push({ key: 'roll ' + s, post: r.post, pre: r.pre }); }
  if (music) { const r = await renderMusic('sky', music); rows.push({ key: `music sky ${music}s`, post: r.post, pre: r.pre }); }
  return rows;
};
window.__names = SFX_NAMES;

$('measure').onclick = async () => {
  $('levels').textContent = 'rendering…';
  const rows = await window.__renderAll({ music: 30 });
  $('levels').innerHTML = '<table><tr><th>sound</th><th>peak</th><th>peak dB</th><th>RMS dB</th><th>pre-limiter peak</th><th>len s</th></tr>' +
    rows.map(r => `<tr class="${r.post.peak >= 1 || r.post.rmsDb < -50 ? 'bad' : ''}"><td>${r.key}</td><td>${r.post.peak.toFixed(3)}</td><td>${r.post.peakDb}</td><td>${r.post.rmsDb}</td><td>${r.pre.peak.toFixed(3)}</td><td>${r.post.active}</td></tr>`).join('') + '</table>';
};
window.__ready = true;
