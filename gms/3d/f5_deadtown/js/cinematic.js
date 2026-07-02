// The cold open: a fully procedural TV news broadcast (canvas 2D + WebAudio
// synthesis, zero asset files). GNN studio → "Grey Flu" breaking news → field
// report outside the hospital (sirens, runners, camera shake) → the rattled
// anchor → the field feed glitches apart on the word "ZOMBIES" → static →
// EMERGENCY BROADCAST card → the DEADTOWN title slam. ~40 s, tap to skip.
// playCinematic() resolves when finished or skipped.

// virtual film frame; letterboxed onto whatever screen we get
const VW = 960, VH = 540;

const CAPTIONS = [
  // [start, end, voice, speaker, text]
  [0.8,  5.2,  'anchor',   'GNN NEWS DESK', 'Good evening. We begin tonight with the state of emergency in Harmon County.'],
  [5.6,  9.8,  'anchor',   'GNN NEWS DESK', 'Hospitals are overwhelmed by the so-called Grey Flu — fever, delirium… and extreme aggression.'],
  [10.6, 14.4, 'reporter', 'SARAH KWAN — ST. MARY\'S', 'Police are telling everyone within the sound of my voice: lock your doors.'],
  [14.8, 18.8, 'reporter', 'SARAH KWAN — ST. MARY\'S', 'We have seen people dragged away, Tom. We have seen bodies get back UP.'],
  [19.8, 23.2, 'anchor',   'GNN NEWS DESK', 'We are now being told the infected are… biting people.'],
  [23.5, 26.0, 'anchor',   'GNN NEWS DESK', 'Officials still refuse to use the word. Sarah — Sarah, are you there—'],
  [26.6, 30.4, 'yell',     'SARAH KWAN — LIVE', 'They\'re DEAD, Tom! They\'re not sick — they\'re ZOMBIES—'],
];
const SHOTS = [
  ['studio1', 0, 10.2],
  ['field',   10.2, 19.4],
  ['studio2', 19.4, 26.2],
  ['glitch',  26.2, 30.6],
  ['static',  30.6, 34.2],
  ['title',   34.2, 40.0],
];
const END_T = 40.0;

export function playCinematic() {
  const wrap = document.getElementById('cine');
  const canvas = document.getElementById('cine-canvas');
  const hint = document.getElementById('cine-skip');
  if (!wrap || !canvas) return Promise.resolve();
  wrap.classList.remove('hidden');

  const g = canvas.getContext('2d');
  const buf = document.createElement('canvas'); buf.width = VW; buf.height = VH;   // for glitch slicing
  const bg = buf.getContext('2d');
  let dpr = 1, sc = 1, ox = 0, oy = 0;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    sc = Math.min(canvas.width / VW, canvas.height / VH);
    ox = (canvas.width - VW * sc) / 2; oy = (canvas.height - VH * sc) / 2;
  }
  resize();
  addEventListener('resize', resize);

  // ── audio rig ──────────────────────────────────────────────────────────────
  let A = null, master = null;
  const nodes = [];
  function audio() {
    try { A = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = A.createGain(); master.gain.value = 0.8; master.connect(A.destination);
    // room tone
    const noiseBuf = A.createBuffer(1, A.sampleRate, A.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const room = A.createBufferSource(); room.buffer = noiseBuf; room.loop = true;
    const rf = A.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 400;
    const rg = A.createGain(); rg.gain.value = 0.012;
    room.connect(rf).connect(rg).connect(master); room.start();
    nodes.push(room);
    // news sting
    const t0 = A.currentTime + 0.15;
    [[329.6, 0], [392, 0.18], [523.25, 0.36], [659.25, 0.54]].forEach(([f, off]) => {
      const o = A.createOscillator(), og = A.createGain(), lp = A.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f;
      lp.type = 'lowpass'; lp.frequency.value = 2200;
      og.gain.setValueAtTime(0.0001, t0 + off);
      og.gain.exponentialRampToValueAtTime(0.11, t0 + off + 0.03);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.85);
      o.connect(lp).connect(og).connect(master); o.start(t0 + off); o.stop(t0 + off + 0.9);
    });
    return { noiseBuf };
  }
  const rig = audio();

  function voice(kind, dur) {
    if (!A) return;
    const t0 = A.currentTime;
    const base = kind === 'anchor' ? 108 : kind === 'reporter' ? 165 : 185;
    const vol = kind === 'yell' ? 0.075 : 0.05;
    let t = 0;
    while (t < dur - 0.1) {
      const syl = 0.06 + Math.random() * 0.1;
      const o = A.createOscillator(), og = A.createGain(), bp = A.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.35), t0 + t);
      o.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.3), t0 + t + syl);
      bp.type = 'bandpass'; bp.frequency.value = kind === 'anchor' ? 700 : 950; bp.Q.value = 1.4;
      og.gain.setValueAtTime(0.0001, t0 + t);
      og.gain.exponentialRampToValueAtTime(vol * (0.7 + Math.random() * 0.6), t0 + t + 0.015);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + t + syl);
      o.connect(bp).connect(og).connect(master);
      o.start(t0 + t); o.stop(t0 + t + syl + 0.02);
      t += syl + 0.03 + Math.random() * 0.07;
    }
  }
  function siren() {
    if (!A) return;
    const t0 = A.currentTime;
    for (const det of [0, 7]) {
      const o = A.createOscillator(), og = A.createGain(), lfo = A.createOscillator(), lg = A.createGain();
      o.type = 'sine'; o.frequency.value = 700 + det;
      lfo.frequency.value = 0.6; lg.gain.value = 160;
      lfo.connect(lg).connect(o.frequency);
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.035, t0 + 1.2);
      og.gain.setValueAtTime(0.035, t0 + 7.4);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 9);
      o.connect(og).connect(master); o.start(t0); lfo.start(t0);
      o.stop(t0 + 9.2); lfo.stop(t0 + 9.2);
    }
  }
  let staticSrc = null;
  function staticNoise(on) {
    if (!A) return;
    if (on && !staticSrc && rig) {
      staticSrc = A.createBufferSource(); staticSrc.buffer = rig.noiseBuf; staticSrc.loop = true;
      const f = A.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.4;
      const sg = A.createGain(); sg.gain.value = 0.09;
      staticSrc.connect(f).connect(sg).connect(master); staticSrc.start();
    } else if (!on && staticSrc) { try { staticSrc.stop(); } catch {} staticSrc = null; }
  }
  function ebsTone() {
    if (!A) return;
    const t0 = A.currentTime;
    for (const f of [853, 960]) {
      const o = A.createOscillator(), og = A.createGain();
      o.type = 'sine'; o.frequency.value = f;
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.05, t0 + 0.05);
      og.gain.setValueAtTime(0.05, t0 + 2.0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.3);
      o.connect(og).connect(master); o.start(t0); o.stop(t0 + 2.4);
    }
  }
  function titleBoom() {
    if (!A || !rig) return;
    const t0 = A.currentTime;
    const o = A.createOscillator(), og = A.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + 0.9);
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.34, t0 + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    o.connect(og).connect(master); o.start(t0); o.stop(t0 + 1.5);
    const s = A.createBufferSource(); s.buffer = rig.noiseBuf;
    const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const sg = A.createGain(); sg.gain.setValueAtTime(0.22, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    s.connect(lp).connect(sg).connect(master); s.start(t0); s.stop(t0 + 0.8);
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  const runners = Array.from({ length: 7 }, (_, i) => ({ lane: 330 + i * 22 + Math.random() * 14, speed: (120 + Math.random() * 160) * (Math.random() < 0.5 ? 1 : -1), off: Math.random() * 1400 - 200, h: 34 + Math.random() * 22 }));
  const mapDots = Array.from({ length: 42 }, () => ({ x: Math.random(), y: Math.random(), at: Math.random() * 22 }));

  function person(c, x, y, s, opts = {}) {
    // simple broadcast-vector person: suit torso, shirt, tie, head; talks/bobs
    const bob = Math.sin(opts.t * (opts.rattled ? 3.4 : 1.7)) * (opts.rattled ? 2.2 : 1.1);
    c.save(); c.translate(x, y + bob);
    c.fillStyle = opts.suit || '#2b3444';
    c.beginPath(); c.moveTo(-s * 0.62, s * 1.5); c.quadraticCurveTo(-s * 0.66, s * 0.28, -s * 0.34, s * 0.14);
    c.lineTo(s * 0.34, s * 0.14); c.quadraticCurveTo(s * 0.66, s * 0.28, s * 0.62, s * 1.5); c.closePath(); c.fill();
    c.fillStyle = '#e8e4da';                       // shirt
    c.beginPath(); c.moveTo(-s * 0.14, s * 0.16); c.lineTo(s * 0.14, s * 0.16); c.lineTo(s * 0.05, s * 0.72); c.lineTo(-s * 0.05, s * 0.72); c.closePath(); c.fill();
    if (!opts.noTie) {
      c.fillStyle = opts.tie || '#8e2f39';
      c.save(); if (opts.rattled) c.rotate(0.09);
      c.beginPath(); c.moveTo(0, s * 0.18); c.lineTo(s * 0.05, s * 0.3); c.lineTo(0, s * 0.66); c.lineTo(-s * 0.05, s * 0.3); c.closePath(); c.fill();
      c.restore();
    }
    c.fillStyle = opts.skin || '#d9a983';           // head
    c.beginPath(); c.ellipse(0, -s * 0.22, s * 0.30, s * 0.36, 0, 0, 7); c.fill();
    c.fillStyle = opts.hair || '#3a3026';
    c.beginPath(); c.ellipse(0, -s * 0.4, s * 0.31, s * 0.24, 0, Math.PI, 0); c.fill();
    if (opts.longHair) { c.fillRect(-s * 0.31, -s * 0.4, s * 0.09, s * 0.5); c.fillRect(s * 0.22, -s * 0.4, s * 0.09, s * 0.5); }
    if (opts.rattled) { c.strokeStyle = opts.hair || '#3a3026'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-s * 0.2 + i * s * 0.2, -s * 0.6); c.lineTo(-s * 0.16 + i * s * 0.2, -s * 0.72 - i * 2); c.stroke(); } }
    const blink = Math.sin(opts.t * 1.3 + (opts.seed || 0)) > 0.96;
    c.fillStyle = '#1c1c22';
    if (!blink) { c.beginPath(); c.arc(-s * 0.11, -s * 0.26, s * 0.035, 0, 7); c.arc(s * 0.11, -s * 0.26, s * 0.035, 0, 7); c.fill(); }
    else { c.fillRect(-s * 0.15, -s * 0.26, s * 0.08, 1.6); c.fillRect(s * 0.07, -s * 0.26, s * 0.08, 1.6); }
    if (opts.talking) {
      const open = (Math.sin(opts.t * 21) * 0.5 + 0.5) * s * 0.05 + 1.5;
      c.fillStyle = '#7c4a42'; c.beginPath(); c.ellipse(0, -s * 0.07, s * 0.07, open, 0, 0, 7); c.fill();
    } else { c.strokeStyle = '#7c4a42'; c.lineWidth = 2; c.beginPath(); c.moveTo(-s * 0.06, -s * 0.07); c.lineTo(s * 0.06, -s * 0.07); c.stroke(); }
    if (opts.mic) { c.fillStyle = '#191919'; c.fillRect(s * 0.3, -s * 0.1, s * 0.07, s * 0.5); c.beginPath(); c.arc(s * 0.335, -s * 0.14, s * 0.075, 0, 7); c.fill(); }
    c.restore();
  }

  function chyron(c, t, headline, flash) {
    // ticker
    c.fillStyle = '#101318'; c.fillRect(0, VH - 34, VW, 34);
    c.fillStyle = '#c9cdd4'; c.font = '600 17px "Courier New", monospace';
    const tick = 'CDC URGES CALM ••• NATIONAL GUARD DEPLOYED TO HARMON COUNTY ••• DO NOT APPROACH THE INFECTED ••• GREY FLU CASES DOUBLE EVERY SIX HOURS ••• AVOID ALL HOSPITALS ••• ';
    const w = c.measureText(tick).width;
    const off = (t * 90) % w;
    c.fillText(tick + tick, -off, VH - 11);
    // red breaking bar + headline
    c.fillStyle = (flash && Math.sin(t * 6) > 0) ? '#e03a2a' : '#b3271b';
    c.fillRect(0, VH - 96, 252, 40);
    c.fillStyle = '#fff'; c.font = '800 23px -apple-system, sans-serif';
    c.fillText('BREAKING NEWS', 16, VH - 68);
    c.fillStyle = 'rgba(16,19,24,0.92)'; c.fillRect(252, VH - 96, VW - 252, 40);
    c.fillStyle = '#f2f2ea'; c.font = '700 21px -apple-system, sans-serif';
    c.fillText(headline, 268, VH - 68);
    // GNN bug
    c.fillStyle = 'rgba(180,40,30,0.92)'; c.fillRect(VW - 86, 22, 62, 30);
    c.fillStyle = '#fff'; c.font = '800 20px -apple-system, sans-serif'; c.fillText('GNN', VW - 74, 44);
    c.fillStyle = '#c9cdd4'; c.font = '600 13px monospace'; c.fillText('LIVE', VW - 72, 66);
    c.fillStyle = '#e03a2a'; c.beginPath(); c.arc(VW - 80, 61, 4 * (Math.sin(t * 4) > 0 ? 1 : 0.55), 0, 7); c.fill();
  }

  function studio(c, t, rattled) {
    const gr = c.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, '#141b2c'); gr.addColorStop(1, '#0c1017');
    c.fillStyle = gr; c.fillRect(0, 0, VW, VH);
    // wall panels
    c.fillStyle = 'rgba(70,110,180,0.10)';
    for (let x = 0; x < VW; x += 120) c.fillRect(x, 0, 60, VH);
    // wall screen: county map with spreading red dots
    c.fillStyle = '#0e1622'; c.fillRect(560, 70, 330, 220);
    c.strokeStyle = '#31445e'; c.lineWidth = 4; c.strokeRect(560, 70, 330, 220);
    c.fillStyle = '#1c3040';
    c.beginPath(); c.moveTo(590, 250); c.quadraticCurveTo(620, 120, 730, 110);
    c.quadraticCurveTo(860, 100, 860, 200); c.quadraticCurveTo(840, 270, 700, 268); c.closePath(); c.fill();
    for (const d of mapDots) {
      if (t < d.at) continue;
      const grow = Math.min(1, (t - d.at) / 4);
      c.fillStyle = `rgba(224,58,42,${0.35 + grow * 0.4})`;
      c.beginPath(); c.arc(600 + d.x * 250, 120 + d.y * 130, 2 + grow * 6 + Math.sin(t * 5 + d.at) * 1.2, 0, 7); c.fill();
    }
    c.fillStyle = '#c9cdd4'; c.font = '700 15px -apple-system, sans-serif';
    c.fillText('HARMON COUNTY — CONFIRMED CASES', 578, 96);
    // desk
    c.fillStyle = '#232d3f'; c.beginPath();
    c.moveTo(80, VH); c.lineTo(160, 356); c.lineTo(560, 356); c.lineTo(640, VH); c.closePath(); c.fill();
    c.fillStyle = '#2e3a52'; c.fillRect(160, 348, 400, 12);
    if (rattled) { c.fillStyle = '#e8e4da'; c.save(); c.translate(300, 352); c.rotate(-0.2); c.fillRect(0, 0, 46, 30); c.restore(); c.fillStyle = '#dcd8ce'; c.fillRect(370, 344, 44, 28); }
    person(c, 360, 250, 110, { t, rattled, talking: talkingNow('anchor'), seed: 3 });
  }

  function field(c, t) {
    c.fillStyle = '#07080d'; c.fillRect(0, 0, VW, VH);
    // strobe washes
    const red = Math.max(0, Math.sin(t * 9)), blue = Math.max(0, Math.sin(t * 9 + Math.PI));
    c.fillStyle = `rgba(200,30,26,${red * 0.14})`; c.fillRect(0, 0, VW, VH);
    c.fillStyle = `rgba(40,80,220,${blue * 0.14})`; c.fillRect(0, 0, VW, VH);
    // hospital block
    c.fillStyle = '#11151d'; c.fillRect(90, 90, 700, 260);
    c.fillStyle = '#1a2029';
    for (let x = 120; x < 760; x += 58) for (let y = 118; y < 320; y += 52) {
      c.fillStyle = Math.random() < 0.06 ? '#d8c66a' : (Math.sin(x * 7 + y) > 0.3 ? '#242c38' : '#161b24');
      c.fillRect(x, y, 34, 30);
    }
    c.fillStyle = '#a41f1f'; c.fillRect(240, 60, 420, 44);
    c.fillStyle = '#fff'; c.font = '800 30px -apple-system, sans-serif';
    c.fillText('ST. MARY\'S  EMERGENCY', 268, 92);
    // ground + ambulance silhouette
    c.fillStyle = '#0d0f13'; c.fillRect(0, 350, VW, VH - 350);
    c.fillStyle = '#1d2530'; c.fillRect(640, 300, 190, 78);
    c.fillStyle = red > 0.5 ? '#e03a2a' : '#26304a'; c.fillRect(648, 288, 40, 14);
    c.fillStyle = blue > 0.5 ? '#3a62e0' : '#26304a'; c.fillRect(780, 288, 40, 14);
    // runners (panicked silhouettes)
    c.fillStyle = '#05060a';
    for (const r of runners) {
      const x = ((r.off + t * r.speed) % 1400 + 1400) % 1400 - 200;
      const y = r.lane + 40;
      const ph = t * 11 + r.lane;
      c.save(); c.translate(x, y); if (r.speed < 0) c.scale(-1, 1);
      c.beginPath(); c.arc(0, -r.h, r.h * 0.17, 0, 7); c.fill();
      c.fillRect(-r.h * 0.11, -r.h * 0.86, r.h * 0.22, r.h * 0.5);
      c.strokeStyle = '#05060a'; c.lineWidth = r.h * 0.12; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -r.h * 0.4); c.lineTo(Math.sin(ph) * r.h * 0.34, 0);
      c.moveTo(0, -r.h * 0.4); c.lineTo(Math.sin(ph + Math.PI) * r.h * 0.34, 0); c.stroke();
      c.beginPath(); c.moveTo(0, -r.h * 0.78); c.lineTo(Math.sin(ph + 1.5) * r.h * 0.3, -r.h * 0.5);
      c.moveTo(0, -r.h * 0.78); c.lineTo(Math.sin(ph + 4.6) * r.h * 0.3, -r.h * 0.5); c.stroke();
      c.restore();
    }
    person(c, 250, 300, 96, { t, talking: talkingNow('reporter') || talkingNow('yell'), mic: true, suit: '#5a2330', noTie: true, longHair: true, hair: '#241d16', seed: 8 });
  }

  function drawStatic(c, alpha = 1) {
    const w = 240, h = 135;
    const img = bg.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    bg.putImageData(img, 0, 0);
    c.save(); c.globalAlpha = alpha; c.imageSmoothingEnabled = false;
    c.drawImage(buf, 0, 0, w, h, 0, 0, VW, VH);
    c.restore();
  }

  // caption + voice state
  let voicedIdx = -1;
  function talkingNow(kind) {
    const c = CAPTIONS.find(cc => T >= cc[0] && T <= cc[1]);
    return !!c && c[2] === kind;
  }

  // ── main loop ──────────────────────────────────────────────────────────────
  let T = 0, last = performance.now(), done = false, resolveFn;
  const promise = new Promise(r => resolveFn = r);
  let sirenStarted = false, ebsStarted = false, boomed = false, staticOn = false;

  function frame(now) {
    if (done) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    T += dt;
    if (T >= END_T) { finish(); return; }

    const shot = SHOTS.find(([, a, b]) => T >= a && T < b) || SHOTS[SHOTS.length - 1];
    const [name, s0] = shot;
    const c = g;
    c.setTransform(sc, 0, 0, sc, ox, oy);
    c.clearRect(-ox / sc, -oy / sc, canvas.width / sc, canvas.height / sc);
    // black bars
    c.fillStyle = '#000'; c.fillRect(-ox / sc, -oy / sc, canvas.width / sc, canvas.height / sc);

    // voices fire once per caption
    for (let i = 0; i < CAPTIONS.length; i++) {
      if (i > voicedIdx && T >= CAPTIONS[i][0]) { voicedIdx = i; voice(CAPTIONS[i][2], CAPTIONS[i][1] - CAPTIONS[i][0]); }
    }

    if (name === 'studio1') {
      studio(c, T, false);
      chyron(c, T, '"GREY FLU" OUTBREAK — STATE OF EMERGENCY', false);
    } else if (name === 'field') {
      if (!sirenStarted) { sirenStarted = true; siren(); }
      c.save();
      c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);   // handheld
      field(c, T);
      c.restore();
      chyron(c, T, 'QUARANTINE ORDERED — MILTON CREEK', true);
    } else if (name === 'studio2') {
      studio(c, T, true);
      chyron(c, T, 'DO NOT APPROACH THE INFECTED', true);
    } else if (name === 'glitch') {
      // broken field feed: slice-shifted + RGB ghosting + dropouts
      bg.setTransform(1, 0, 0, 1, 0, 0);
      bg.clearRect(0, 0, VW, VH);
      bg.save(); bg.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
      field(bg, T); bg.restore();
      const drop = Math.random() < 0.12;
      if (!drop) {
        c.drawImage(buf, 0, 0);
        for (let i = 0; i < 9; i++) {
          const y = Math.random() * VH, h = 6 + Math.random() * 26, dx = (Math.random() - 0.5) * 70;
          c.drawImage(buf, 0, y, VW, h, dx, y, VW, h);
        }
        c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.16;
        c.fillStyle = '#f00'; c.fillRect(0, 0, VW, VH);
        c.globalAlpha = 0.3;
        c.drawImage(buf, 5 + Math.random() * 4, 0);
        c.restore();
        if (Math.random() < 0.3) drawStatic(c, 0.24);
      } else drawStatic(c, 0.9);
      chyron(c, T, 'LIVE FEED — SIGNAL DEGRADED', true);
    } else if (name === 'static') {
      const lt = T - s0;
      if (lt < 1.5) {
        if (!staticOn) { staticOn = true; staticNoise(true); }
        drawStatic(c);
        if (Math.random() < 0.2) { c.fillStyle = '#fff'; c.font = '800 40px monospace'; c.fillText('SIGNAL LOST', VW / 2 - 140, VH / 2); }
      } else {
        if (staticOn) { staticOn = false; staticNoise(false); }
        if (!ebsStarted) { ebsStarted = true; ebsTone(); }
        c.fillStyle = '#000'; c.fillRect(0, 0, VW, VH);
        c.fillStyle = '#10151c'; c.fillRect(0, VH * 0.32, VW, VH * 0.36);
        c.fillStyle = '#cfd4da'; c.textAlign = 'center';
        c.font = '800 34px monospace';
        c.fillText('EMERGENCY BROADCAST SYSTEM', VW / 2, VH * 0.46);
        c.font = '600 20px monospace';
        c.fillText('PLEASE  STAND  BY', VW / 2, VH * 0.56);
        c.textAlign = 'left';
      }
    } else if (name === 'title') {
      const lt = T - s0;
      c.fillStyle = '#000'; c.fillRect(0, 0, VW, VH);
      if (lt > 0.5) {
        if (!boomed) { boomed = true; titleBoom(); }
        const k = Math.min(1, (lt - 0.5) / 0.18);
        const scl = 1.6 - k * 0.6;
        const jx = k >= 1 ? (Math.random() - 0.5) * 2 : 0;
        c.save(); c.translate(VW / 2 + jx, VH / 2); c.scale(scl, scl);
        c.globalAlpha = Math.min(1, k * 1.4);
        c.textAlign = 'center';
        c.font = '900 108px -apple-system, "Arial Black", sans-serif';
        c.fillStyle = '#8e1d14'; c.fillText('DEADTOWN', 3, 12);
        c.fillStyle = '#d8d4c6'; c.fillText('DEADTOWN', 0, 8);
        c.restore(); c.textAlign = 'left'; c.globalAlpha = 1;
        // grunge scratches
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        for (let i = 0; i < 14; i++) { c.beginPath(); const x = VW * 0.22 + Math.random() * VW * 0.56, y = VH * 0.38 + Math.random() * VH * 0.2; c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 40, y + Math.random() * 22); c.stroke(); }
      }
      if (lt > 1.7) {
        c.textAlign = 'center';
        c.fillStyle = `rgba(180,60,48,${Math.min(1, (lt - 1.7) / 0.8)})`;
        c.font = '600 30px Georgia, serif';
        c.fillText('day one', VW / 2, VH / 2 + 78);
        c.textAlign = 'left';
      }
      if (lt > 4.2) { c.fillStyle = `rgba(0,0,0,${Math.min(1, (lt - 4.2) / 1.4)})`; c.fillRect(0, 0, VW, VH); }
    }

    // captions (letterboxed subtitles above the ticker) — skipped on title/static
    if (name !== 'title') {
      const cc = CAPTIONS.find(x => T >= x[0] && T <= x[1]);
      if (cc) {
        const [a, , , who, text] = cc;
        const shown = text.slice(0, Math.floor((T - a) / 0.028));
        c.font = '700 15px -apple-system, sans-serif';
        c.fillStyle = '#ffd24a';
        c.fillText(who, 40, VH - 138);
        c.font = '600 21px -apple-system, sans-serif';
        c.fillStyle = '#fff';
        c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 5; c.lineJoin = 'round';
        c.strokeText(shown, 40, VH - 112);
        c.fillText(shown, 40, VH - 112);
      }
    }
  }

  function finish() {
    if (done) return;
    done = true;
    staticNoise(false);
    if (master && A) { master.gain.setTargetAtTime(0.0001, A.currentTime, 0.2); setTimeout(() => { try { A.close(); } catch {} }, 900); }
    wrap.removeEventListener('pointerdown', skip);
    wrap.classList.add('fade');
    setTimeout(() => { wrap.classList.add('hidden'); wrap.classList.remove('fade'); }, 800);
    removeEventListener('resize', resize);
    resolveFn();
  }
  const skip = () => { if (T > 1) finish(); };
  wrap.addEventListener('pointerdown', skip);
  if (hint) setTimeout(() => { if (!done) hint.classList.add('show'); }, 2200);

  requestAnimationFrame(frame);
  return promise;
}
