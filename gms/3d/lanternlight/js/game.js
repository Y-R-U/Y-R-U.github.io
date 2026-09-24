import * as THREE from 'three';
import { pathX, pathDX, clamp, lerp, damp, globalU, mat, glowTexture } from './util.js';
import { createStreamer, groundHeight, makeHome, makeSea, WATER } from './env.js';
import { makeChar, makeLantern, makeMoth } from './chars.js';
import { createFX, createMotes, makeHushling, makeObstacle, buildLayout } from './entities.js';
import { CHAPTERS, LINES } from './chapters.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NAMES = { ivy: 'Ivy', rowan: 'Rowan', p: 'Pip', b: 'Bean', n: '' };
const WATER_COLS = {
  river: { deep: 0x060a22, shallow: 0x1a2a55, skyC: 0x3a3070, glint: 0xffe0b0 },
  sky: { deep: 0x2a1840, shallow: 0x5a3060, skyC: 0x9a5878, glint: 0x7a5a70 },
  dawn: { deep: 0x122a55, shallow: 0x2a4a80, skyC: 0xc08a88, glint: 0xfff0d0 },
};

function makeBoat() {
  const g = new THREE.Group();
  const paper = mat(0xc8b89c, { rim: 0.5, flat: true, extra: { side: THREE.DoubleSide } });
  const hullG = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const hp = hullG.attributes.position;
  for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); hp.setX(i, hp.getX(i) * (1 - Math.abs(z) * 0.35)); hp.setY(i, hp.getY(i) + Math.abs(z) * Math.abs(z) * 0.35); }
  hullG.computeVertexNormals();
  const hull = new THREE.Mesh(hullG, paper); hull.scale.set(0.75, 0.45, 1.45); hull.position.y = 0.32; hull.castShadow = true; g.add(hull);
  const ts = new THREE.Shape(); ts.moveTo(-0.95, 0); ts.lineTo(0.95, 0); ts.lineTo(0, 0.9); ts.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(ts), paper); sail.rotation.y = Math.PI / 2; sail.position.set(0, 0.3, 0.55); sail.scale.setScalar(0.7); g.add(sail);
  const bowLamp = makeLantern(0.9, 0.8); bowLamp.position.set(0, 0.95, 1.25); g.add(bowLamp);
  return g;
}

function makeCage() {
  const g = new THREE.Group();
  const m = mat(0x140a1e, { flat: true, rim: 1.8 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 2.6, 4), m);
    c.position.set(Math.cos(a) * 0.85, 1.0, Math.sin(a) * 0.85); c.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(c);
  }
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 0.8, 9), mat(0x3a3a50, { flat: true }));
  rock.position.y = -0.3; g.add(rock);
  return g;
}

function makeNest() {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xc07040, emissive: 0xff7a28, emissiveIntensity: 0.9, roughness: 0.8 });
  const box = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), pts = [];
  const im = new THREE.InstancedMesh(box, paper, 120), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * 6.28, r = 1.3 + Math.random() * 2.4, y = Math.max(0, 1.4 - r * 0.3) * Math.random() + Math.random() * 0.2;
    const p = V(Math.cos(a) * r, y, Math.sin(a) * r); e.set(Math.random(), Math.random(), Math.random()); q.setFromEuler(e);
    m4.compose(p, q, V(1, 1, 1)); im.setMatrixAt(i, m4); if (i % 8 === 0) pts.push(p.x, p.y + 0.2, p.z);
  }
  g.add(im);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTexture(), color: 0xff9a40, size: 1.1, opacity: 0.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  return g;
}

export function createGame(world, audio, ui, save, params) {
  const { scene, camera } = world;
  const streamer = createStreamer(scene);
  const fx = createFX(scene), motes = createMotes(scene);
  const home = makeHome(); scene.add(home);
  const isle = new THREE.Mesh(new THREE.CylinderGeometry(14, 19, 5, 11), mat(0x5a6a50, { flat: true })); isle.position.set(-4, -1.4, 2); home.add(isle);
  const sea = makeSea(); sea.visible = false; scene.add(sea);
  const boat = makeBoat(); boat.visible = false; scene.add(boat);
  const cage = makeCage(); cage.visible = false; scene.add(cage);
  const nest = makeNest(); nest.visible = false; scene.add(nest);
  const moth = makeMoth(); moth.root.visible = false; moth.root.scale.setScalar(1.2); scene.add(moth.root);
  const wisp = makeLantern(2.2, 1.4); wisp.visible = false; scene.add(wisp);
  const wispLight = new THREE.PointLight(0xffa050, 12, 16, 1.6); wisp.add(wispLight);

  const chars = { ivy: makeChar('ivy'), rowan: makeChar('rowan'), pip: makeChar('pip'), bean: makeChar('bean') };
  Object.values(chars).forEach((c) => { c.root.visible = false; scene.add(c.root); });
  const lampLight = new THREE.PointLight(0xffb060, 8, 22, 1.2);
  lampLight.castShadow = false;

  const G = {
    state: 'boot', paused: false, chapter: 0, heroKind: save.hero || 'ivy', gt: 0,
    P: { s: 0, u: 0, tu: 0, h: 0, vh: 0, th: 0, speed: 0, tSpeed: 0, light: 100, inv: 0, shineCd: 0, boost: 0, stumble: 0 },
    party: { pip: false, bean: false }, boss: null, stats: { motes: 0, hits: 0, fails: 0 },
    camFn: null, camK: 3, hold: 0, lampDown: false, auto: !!params.auto, events: [],
  };
  const P = G.P;
  let ch = CHAPTERS[0], layout = [], spawnIdx = 0, ents = [], waiters = [], evIdx = 0, subChain = Promise.resolve();
  const camPos = V(0, 3, 8), camLook = V(), tmp = V(), tmp2 = V();
  const hero = () => chars[G.heroKind];

  const wpos = (s, u, y, out = V()) => out.set(pathX(s) + u, y, -s);
  const fwd = (s, out = V()) => out.set(pathDX(s), 0, -1).normalize();
  const baseY = (s, u) => (ch.mode === 'run' ? groundHeight(ch.env, u, s) : ch.mode === 'glide' ? 0 : ch.mode === 'ride' ? 6 : 0);

  const sleep = (sec) => new Promise((res) => waiters.push({ t: G.gt + sec, res }));
  const until = (pred) => new Promise((res) => waiters.push({ pred, res }));

  function lineFile(key) { return key.startsWith('e_') ? `${key}_${G.heroKind}.mp3` : `${key}.mp3`; }
  async function say(key) {
    const who = key[0] === 'e' ? NAMES[G.heroKind] : NAMES[key[0]];
    const cls = { p: 'pip', b: 'bean', n: 'narrator' }[key[0]] || '';
    ui.sub(who, LINES[key] || '', cls);
    const t0 = G.gt;
    const d = await audio.vo(lineFile(key));
    if (!d) await sleep(Math.max(1.5, (LINES[key] || '').length * 0.065) - (G.gt - t0));
    ui.subHide();
    await sleep(0.25);
  }
  const sayBg = (...keys) => { subChain = subChain.then(async () => { for (const k of keys) await say(k); }); return subChain; };

  function setCompanions() {
    const inChap = G.chapter;
    Object.entries(chars).forEach(([k, c]) => { c.root.visible = false; });
    hero().root.visible = true;
    chars.pip.root.visible = G.party.pip;
    chars.bean.root.visible = G.party.bean;
    hero().lantern.visible = true;
    hero().root.add(lampLight); lampLight.position.set(-0.3, 1.3, 0.5);
    chars.pip.lantern.visible = inChap >= 3;
  }

  function clearEnts() { ents.forEach((e) => e.mesh && scene.remove(e.mesh)); ents = []; motes.clear(); }

  function setupChapter(i, fromS = 0) {
    G.chapter = i; ch = CHAPTERS[i];
    world.setPalette(ch.palette, true);
    streamer.setKind(ch.env);
    Object.assign(P, { s: fromS, u: 0, tu: 0, h: 0, vh: 0, th: 0, speed: 0, tSpeed: ch.speed, inv: 1.5, shineCd: 0, boost: 0, stumble: 0 });
    P.light = fromS > 0 ? 80 : 100;
    layout = buildLayout(ch);
    spawnIdx = layout.findIndex((e) => e.s > fromS + 14); if (spawnIdx < 0) spawnIdx = layout.length;
    evIdx = ch.events.findIndex((e) => e.s > fromS + 1); if (evIdx < 0) evIdx = ch.events.length;
    clearEnts();
    streamer.prime(P.s);
    const wc = WATER_COLS[ch.env === 'river' ? 'river' : ch.env === 'sky' ? 'sky' : 'dawn'];
    WATER.deep.value.set(wc.deep); WATER.shallow.value.set(wc.shallow); WATER.skyC.value.set(wc.skyC); WATER.glint.value.set(wc.glint);
    WATER.sunDir.value.set(...(ch.env === 'river' ? [0.5, 0.5, -0.7] : [0, 0.18, -1])).normalize();
    sea.visible = ch.env === 'sky' || ch.env === 'dawn';
    sea.position.y = ch.env === 'sky' ? -46 : 0;
    home.visible = ch.env === 'garden';
    placeHome(ch.env === 'garden' ? 0 : ch.length + 70);
    if (ch.env === 'dawn') home.visible = true;
    isle.visible = ch.env === 'dawn';
    boat.visible = ch.mode === 'boat';
    cage.visible = false; nest.visible = false; wisp.visible = ch.env === 'garden';
    moth.root.visible = ch.mode === 'ride'; moth.setGold(ch.mode === 'ride' ? 1 : 0);
    G.boss = null; G.coast = false;
    const hm = { run: 'run', boat: 'sit', glide: 'glide', ride: 'ride' }[ch.mode];
    hero().setMode(hm);
    chars.pip.setMode(ch.mode === 'run' ? 'run' : ch.mode === 'glide' ? 'ride' : ch.mode === 'ride' ? 'ride' : 'sit');
    chars.bean.setMode('sit');
    G.party.pip = i >= 2; G.party.bean = i >= 4;
    setCompanions();
    ui.hud(true); ui.chapName(ch.title);
    ui.sibMarks(i);
    audio.music(ch.music);
    audio.wind(ch.mode === 'glide' ? 1 : ch.mode === 'ride' ? 0.7 : ch.mode === 'boat' ? 0.25 : 0.15, ch.mode === 'glide' ? 700 : 400);
    world.state.dark = 0;
    G.camFn = null; G.camK = 6;
    snapCamera();
  }

  function placeHome(s) {
    const px = pathX(s);
    if (s === 0) {
      home.position.set(px + 9, -1, 10); home.rotation.y = 0;
      home.userData.cottage.position.set(-8, 1, 2); home.userData.cottage.rotation.y = Math.PI + 0.3;
    } else {
      home.position.set(px + 12, -1, -s); home.rotation.y = 0;
      home.userData.cottage.position.set(-8, 1, 2); home.userData.cottage.rotation.y = Math.PI + 0.3;
    }
  }

  function spawnAhead() {
    const horizon = P.s + (ch.mode === 'glide' ? 110 : 85);
    while (spawnIdx < layout.length && layout[spawnIdx].s < horizon) {
      const L = { ...layout[spawnIdx++] };
      spawnEnt(L);
    }
  }
  function spawnEnt(L) {
    L.y = L.y ?? 0; L.alive = true;
    if (L.type === 'mote') { L.seed = 0.1 + Math.random() * 0.9; L.wy = 0; motes.add(L); }
    else if (L.type === 'hush') { L.mesh = makeHushling(ch.id === 'hush' ? 1.1 : 1); L.t0 = Math.random() * 6; scene.add(L.mesh); }
    else {
      const t = L.type === 'floatlog' ? 'log' : L.type;
      L.mesh = makeObstacle(t, L.half ? ch.width * 0.95 : ch.width * 2 + 1.6);
      scene.add(L.mesh);
    }
    ents.push(L);
    return L;
  }
  function kill(e) { e.alive = false; if (e.mesh) scene.remove(e.mesh); if (e.type === 'mote') motes.remove(e); }

  function damage(n, e) {
    if (P.inv > 0 || G.state !== 'play') return;
    P.light -= n; P.inv = 1.1; G.stats.hits++;
    audio.sfx.hit(); world.state.flash = 0; G.shake = 0.35;
    if (e && e.type === 'hush') { fx.burst(e.mesh.position, 0x8050ff, 26, 5); kill(e); }
    if (P.light < 30 && !G.saidLow) { G.saidLow = true; sayBg('e_low'); }
    ui.flashDamage();
  }

  function collect(e) {
    kill(e); P.light = Math.min(100, P.light + 4.5); G.stats.motes++;
    audio.sfx.mote(); fx.burst(tmp.set(e.wx, e.wy, e.wz), 0xffd890, 6, 2, 0.25, 0.5);
    if (P.light > 45) G.saidLow = false;
  }

  function shine() {
    if (G.state === 'cut') { G.shinePressed = true; audio.sfx.shine(); world.state.flash = 0.6; fx.ring(heroPos(), 0xffd080); return; }
    if (G.state !== 'play' || P.shineCd > 0 || P.light < 6) return;
    P.light -= 4; P.shineCd = 0.8; G.shinePressed = true;
    audio.sfx.shine(); world.state.flash = 0.55;
    const hp = heroPos();
    fx.ring(hp, 0xffd080, 36, 14);
    for (const e of ents) {
      if (!e.alive || (e.type !== 'hush' && e.type !== 'storm')) continue;
      const ds = e.s - P.s;
      if (ds > -3 && ds < 18 && Math.abs(e.u - P.u) < 5.5 && Math.abs((e.y || 0) - P.h) < 5) {
        fx.burst(e.mesh.position, e.type === 'hush' ? 0xc0a0ff : 0xfff0c0, 24, 6);
        fx.seek(e.mesh.position, hp, 0xffd080, 4);
        kill(e); P.light = Math.min(100, P.light + 6);
      }
    }
  }

  const heroPos = () => hero().root.getWorldPosition(tmp2).add(V(0, 1, 0));

  function jump() {
    if (G.state !== 'play') return;
    if ((ch.mode === 'run' || ch.mode === 'boat') && P.h <= 0.02) {
      P.vh = ch.mode === 'run' ? 7.4 : 6.2; audio.sfx.jump();
      if (ch.mode === 'boat') audio.sfx.splash();
    }
  }

  function steer(du, dh) {
    P.tu = clamp(P.tu + du, -ch.width, ch.width);
    if (ch.mode === 'glide' || ch.mode === 'ride') P.th = clamp(P.th + dh, -2.2, 2.6);
  }

  function currentCheckpoint() { let c = 0; ch.checkpoints.forEach((cp) => { if (P.s >= cp) c = cp; }); return c; }

  function autoPilot(dt) {
    let best = null, bd = 1e9, danger = null;
    for (const e of ents) {
      if (!e.alive) continue;
      const ds = e.s - P.s; if (ds < 0 || ds > 22) continue;
      if (e.type === 'mote' && ds < bd) { bd = ds; best = e; }
      if (e.type !== 'mote' && e.type !== 'ring' && (!danger || ds < danger.s - P.s)) danger = e;
      if (e.type === 'ring' && ds < bd) { bd = ds; best = e; }
    }
    let tu = best ? best.u : 0, th = best ? (best.y || 1) - 1 : 0;
    if (danger) {
      const ds = danger.s - P.s;
      if (danger.type === 'hush' && ds < 12 && P.shineCd <= 0) shine();
      if (['log', 'floatlog', 'pool'].includes(danger.type) && ds < (ch.mode === 'run' ? 3.2 : 3.6) && ds > 0.5) jump();
      if (['rock', 'thorns', 'storm'].includes(danger.type) && ds < 14 && Math.abs(danger.u - tu) < 1.8) tu = danger.u > 0 ? danger.u - 2.2 : danger.u + 2.2;
      if (danger.type === 'storm' && ds < 14) th = (danger.y || 0) > 0 ? danger.y - 2.4 : danger.y + 2.4;
    }
    P.tu = damp(P.tu, clamp(tu, -ch.width, ch.width), 5, dt);
    if (ch.mode === 'glide') P.th = damp(P.th, clamp(th, -2.2, 2.6), 4, dt);
  }

  function updatePlay(dt) {
    if (G.auto) autoPilot(dt);
    if (G.keys) {
      const k = G.keys; const du = ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * dt * 7, dh = ((k.up ? 1 : 0) - (k.down ? 1 : 0)) * dt * 5;
      if (du || dh) steer(du, ch.mode === 'glide' || ch.mode === 'ride' ? dh : 0);
    }
    P.inv = Math.max(0, P.inv - dt); P.shineCd = Math.max(0, P.shineCd - dt); P.boost = Math.max(0, P.boost - dt); P.stumble = Math.max(0, P.stumble - dt);
    const target = ch.speed * (P.boost > 0 ? 1.35 : 1) * (P.stumble > 0 ? 0.55 : 1) * (G.bossSlow || 1);
    P.speed = damp(P.speed, target, 2, dt);
    P.s += P.speed * dt;
    P.u = damp(P.u, P.tu, 9, dt);
    if (ch.mode === 'run' || ch.mode === 'boat') {
      P.vh -= (ch.mode === 'run' ? 22 : 18) * dt; P.h += P.vh * dt;
      if (P.h <= 0) { if (P.vh < -3 && ch.mode === 'boat') audio.sfx.splash(); P.h = 0; P.vh = 0; }
    } else {
      P.h = damp(P.h, P.th, 5, dt);
    }
    P.light -= ch.drain * dt * (G.boss ? 1.3 : 1);

    spawnAhead();
    const magnet = G.party.pip ? 2.6 : 2.0;
    const bodyH = P.h + 0.8;
    for (const e of ents) {
      if (!e.alive) continue;
      const ds = e.s - P.s;
      if (ds < -8) { kill(e); continue; }
      if (e.type === 'mote') {
        if (Math.abs(ds) < 1.6) {
          const du = e.u - P.u, dy = e.y - bodyH;
          if (du * du + dy * dy < magnet * magnet) collect(e);
        }
        continue;
      }
      if (e.type === 'hush') {
        if (ds < 26 && ds > 2) { e.u += clamp(P.u - e.u, -1, 1) * dt * (ch.id === 'hush' ? 1.1 : 0.8); if (ch.mode === 'glide') e.y += clamp(P.h + 1 - e.y, -1, 1) * dt * 0.8; }
        if (e.drift) e.u = clamp(e.u + e.drift * dt * 0.8, -ch.width, ch.width), (Math.abs(e.u) >= ch.width - 0.01) && (e.drift *= -1);
        if (Math.abs(ds) < 0.8 && Math.abs(e.u - P.u) < 0.85 && Math.abs(e.y - bodyH) < 1.1) damage(18, e);
        continue;
      }
      if (Math.abs(ds) > 1.4) continue;
      switch (e.type) {
        case 'log': case 'floatlog': if (Math.abs(ds) < 0.55 && P.h < 0.55) { damage(14, e); P.stumble = 0.8; } break;
        case 'pool': if (Math.abs(ds) < 1.2 && P.h < 0.15) { damage(16, e); P.stumble = 1; } break;
        case 'rock': if (Math.abs(ds) < 0.8 && Math.abs(e.u - P.u) < 1.0) { damage(14, e); P.tu = clamp(P.u + (P.u > e.u ? 1.6 : -1.6), -ch.width, ch.width); } break;
        case 'thorns': if (Math.abs(ds) < 0.7 && Math.abs(e.u - P.u) < ch.width * 0.5) { damage(14, e); P.tu = clamp(-Math.sign(e.u) * ch.width * 0.6, -ch.width, ch.width); } break;
        case 'storm': if (Math.abs(ds) < 1.2 && Math.abs(e.u - P.u) < 1.5 && Math.abs(e.y - P.h) < 1.4) { damage(16, e); } break;
        case 'ring': if (!e.hit && Math.abs(ds) < 0.8 && Math.abs(e.u - P.u) < 1.3 && Math.abs(e.y - bodyH) < 1.4) {
          e.hit = true; P.boost = 1.6; P.light = Math.min(100, P.light + 8); audio.sfx.free(); fx.ring(e.mesh.position, 0xfff0b0, 30, 6);
        } break;
      }
    }
    ents = ents.filter((e) => e.alive);

    while (evIdx < ch.events.length && P.s >= ch.events[evIdx].s) fireEvent(ch.events[evIdx++]);
    if (G.boss) updateBoss(dt);
    if (ch.mode === 'ride') P.light = 100;

    if (P.light <= 0) { P.light = 0; fail(); return; }
    if (P.s >= ch.length) { G.state = 'cut'; outro(); }
  }

  function fireEvent(ev) {
    if (ev.say) sayBg(ev.say, ...(ev.then ? [ev.then] : []));
    if (ev.hint) ui.hint(ev.hint, ev.shineTut ? 7 : 4.5);
    if (ev.shineTut) {
      const e = spawnEnt({ type: 'hush', s: P.s + 20, u: P.u, y: 1.1 });
      G.shinePressed = false;
      until(() => G.shinePressed || !e.alive).then(() => ui.hint(null));
    }
    if (ev.music) audio.music(ev.music, 3);
    if (ev.boss) startBoss();
  }

  function startBoss() {
    G.boss = { t: 0, next: 2.5 };
    moth.root.visible = true; moth.setGold(0); moth.flap(1.6, 0.6);
    world.setPalette('hush');
    ui.hint('The Hush!', 2.5);
  }
  function updateBoss(dt) {
    const b = G.boss; b.t += dt; b.next -= dt;
    const ms = P.s + 26 + Math.sin(b.t * 0.4) * 3;
    moth.root.position.copy(wpos(ms, Math.sin(b.t * 0.6) * 2.5, 4.5 + Math.sin(b.t * 1.1) * 0.8));
    moth.root.rotation.set(0.2, Math.atan2(pathDX(ms), -1) + Math.PI, Math.sin(b.t * 0.6) * 0.15);
    if (b.next <= 0 && P.s < ch.length - 25) {
      b.next = 2.4 + Math.random() * 1.2;
      const e = spawnEnt({ type: 'hush', s: P.s + 22, u: (Math.random() * 2 - 1) * ch.width * 0.8, y: 1.1 });
      fx.burst(moth.root.position, 0x6030c0, 16, 4);
      e.mesh.position.copy(moth.root.position);
      e.swoop = 1;
    }
    world.state.dark = 0.25;
  }

  function fail() {
    G.state = 'failing'; G.stats.fails++;
    audio.sfx.hit(); audio.music('fail', 0.6);
    hero().setMode('idle');
    const lines = ['e_fail1', 'e_fail2', 'e_fail3', 'n_fail'];
    const pick = lines[G.stats.fails % lines.length];
    sleep(0.8).then(() => { ui.show('fail'); say(pick); });
  }
  function retry() {
    ui.hide('fail');
    const cp = currentCheckpoint();
    ui.fade(true);
    sleep(0.7).then(() => {
      setupChapter(G.chapter, cp);
      if (G.chapter === 3 && cp >= 440) startBoss();
      if (G.chapter === 3 && cp >= 440) audio.music('final', 1);
      G.state = 'play';
      ui.fade(false);
    });
  }

  // ---------- cutscenes ----------
  function snapCamera() { const f = followCam(); camPos.copy(f.pos); camLook.copy(f.look); }
  function followCam() {
    const s = P.s, f = fwd(s);
    const hp = wpos(s, P.u * 0.55, baseY(s, P.u));
    let dist = 5.2, hgt = 2.9, ahead = 7.5, up = 0.4;
    if (ch.mode === 'glide') { dist = 6.5; hgt = 2.0; ahead = 10; up = P.h * 0.6 + 0.5; hp.y += P.h * 0.5; }
    if (ch.mode === 'boat') { dist = 6.6; hgt = 3.4; }
    if (ch.mode === 'ride') { dist = 12; hgt = 7.5; ahead = 14; hp.y += P.h * 0.5 + 1; up = 0; }
    return { pos: hp.clone().addScaledVector(f, -dist).add(V(0, hgt, 0)), look: hp.clone().addScaledVector(f, ahead).add(V(0, up, 0)) };
  }

  function placeParty(dt) {
    const s = P.s, f = fwd(s), yaw = Math.atan2(f.x, f.z);
    const h = hero();
    const by = baseY(s, P.u);
    if (G.state === 'play' || G.state === 'failing' || G.coast) {
      if (ch.mode === 'run') { wpos(s, P.u, by + P.h, h.root.position); h.setMode(P.h > 0.05 ? 'jump' : G.state === 'failing' ? 'idle' : 'run'); }
      else if (ch.mode === 'boat') {
        const bob = Math.sin(G.gt * 2.1) * 0.05;
        wpos(s, P.u, P.h + bob, boat.position); boat.rotation.set(Math.sin(G.gt * 1.6) * 0.04 - P.vh * 0.02, yaw, (P.u - P.tu) * 0.12);
        h.root.position.copy(boat.position).add(V(0, 0.12, 0)).addScaledVector(f, 0.35);
      } else if (ch.mode === 'glide') { wpos(s, P.u, P.h + Math.sin(G.gt * 1.4) * 0.1, h.root.position); }
      else if (ch.mode === 'ride') {
        wpos(s, P.u, 6 + P.h + Math.sin(G.gt * 1.2) * 0.3, moth.root.position);
        moth.root.rotation.set(-0.08, yaw, (P.u - P.tu) * 0.25);
        h.root.position.copy(moth.root.position).add(V(0, 0.95, 0)).addScaledVector(f, 0.6);
      }
      h.root.rotation.set(0, yaw, 0);
      h.st.speed = P.speed;
      h.st.lean = clamp((P.u - P.tu) * 0.25, -0.35, 0.35);
      h.root.visible = P.inv > 0 ? Math.floor(G.gt * 14) % 2 === 0 : true;
    }
    if (G.party.pip && (G.state === 'play' || G.state === 'failing' || G.coast)) {
      const p = chars.pip;
      if (ch.mode === 'run') {
        const pu = clamp(P.u + (P.u > ch.width - 1 ? -0.75 : 0.75), -ch.width - 0.8, ch.width + 0.8);
        wpos(s - 0.4, pu, groundHeight(ch.env, pu, s - 0.4) + Math.max(0, P.h - 0.1), p.root.position);
        p.setMode(P.h > 0.05 ? 'jump' : 'run'); p.st.speed = P.speed * 1.1;
      } else if (ch.mode === 'boat') { p.root.position.copy(boat.position).add(V(0, 0.12, 0)).addScaledVector(f, -0.5); p.setMode('sit'); }
      else if (ch.mode === 'glide') { p.root.position.copy(h.root.position).add(V(0, 0.28, 0)).addScaledVector(f, -0.28); p.setMode('ride'); }
      else if (ch.mode === 'ride') { p.root.position.copy(moth.root.position).add(V(0.45, 0.95, 0)).addScaledVector(f, -0.35); p.setMode('ride'); }
      p.root.rotation.set(0, yaw, 0);
    }
    if (G.party.bean && ch.mode === 'ride' && (G.state === 'play')) {
      const b = chars.bean; b.root.position.copy(moth.root.position).add(V(-0.45, 0.95, 0)).addScaledVector(f, -0.1); b.setMode('sit'); b.root.rotation.set(0, yaw, 0);
    }
    if (wisp.visible && G.state === 'play') {
      const ws = P.s + 30;
      wpos(ws, Math.sin(G.gt * 0.7) * 1.2, 2.2 + Math.sin(G.gt * 1.3) * 0.4, tmp);
      wisp.position.lerp(tmp, 1 - Math.exp(-dt * 2));
      if (P.s > ch.length - 40) wisp.visible = false;
    }
  }

  const walkTo = (c, s, u, speed, dt) => {
    const target = wpos(s, u, 0), d = target.clone().sub(c.root.position); d.y = 0;
    const len = d.length(); if (len < 0.05) return true;
    const step = Math.min(len, speed * dt); c.root.position.addScaledVector(d.normalize(), step);
    c.root.position.y = groundHeight(ch.env, c.root.position.x - pathX(-c.root.position.z), -c.root.position.z);
    c.root.rotation.y = Math.atan2(d.x, d.z);
    return false;
  };
  const tween = (sec, fn) => new Promise((res) => { const t0 = G.gt; waiters.push({ pred: () => { const k = clamp((G.gt - t0) / sec, 0, 1); fn(k * k * (3 - 2 * k)); return k >= 1; }, res }); });

  async function playIntro() {
    G.state = 'cut';
    setupChapter(0, 0);
    ui.hud(false);
    G.state = 'cut';
    const px = pathX(-8);
    const pip = chars.pip, bean = chars.bean, h = hero();
    [pip, bean].forEach((c) => { c.root.visible = true; c.setMode('walk'); });
    pip.root.position.copy(wpos(-9.5, 0.6, 0)); bean.root.position.copy(wpos(-9.8, -0.1, 0));
    h.root.visible = false;
    wisp.visible = true; wisp.position.copy(wpos(-4, 0.3, 1.6));
    G.camFn = (t) => ({ pos: wpos(-2, -6 + t * 0.2, 2.2 + t * 0.03), look: wpos(-6 + t * 0.6, 0, 1.2) });
    G.camK = 2; snapCam();
    ui.fade(false);
    audio.music('garden', 3);
    let t = 0; G.cutTick = (dt) => {
      t += dt; wisp.position.lerp(wpos(-4 + t * 1.5, Math.sin(t) * 0.6, 1.6 + Math.sin(t * 2) * 0.2), 1 - Math.exp(-dt * 2));
      if (t > 1.5) { walkTo(pip, -4 + t * 1.45, 0.5, 1.5, dt); walkTo(bean, -4.5 + t * 1.4, -0.3, 1.45, dt); }
    };
    await say('n_intro');
    await sleep(0.4);
    G.cutTick = null;
    ui.fade(true); await sleep(0.9);
    pip.root.visible = bean.root.visible = false;
    h.root.visible = true; h.setMode('idle');
    h.root.position.copy(wpos(-9.2, 0.3, 0)); h.root.rotation.y = Math.PI - 0.3;
    G.camFn = () => ({ pos: wpos(-6.5, 0.6, 1.25), look: wpos(-9.2, 0.3, 1.25) });
    snapCam(); ui.fade(false);
    await sleep(0.6);
    await say('e_pick');
    h.setMode('walk');
    G.cutTick = (dt) => walkTo(h, 0, 0, 2.2, dt);
    G.camFn = () => { const f = followCam(); return f; };
    G.camK = 1.6;
    P.s = 0;
    await sleep(1.6);
    G.cutTick = null;
    await chapterCard(0);
    G.state = 'play'; ui.hud(true);
    sayBg('n_ch1');
  }

  function snapCam() { if (G.camFn) { lastCamFn = G.camFn; camT0 = G.gt; const c = G.camFn(0); camPos.copy(c.pos); camLook.copy(c.look); } }

  async function chapterCard(i) {
    const c = CHAPTERS[i];
    await ui.card(c.num, c.title);
    save.unlock(i);
  }

  async function startChapter(i) {
    G.state = 'cut';
    ui.fade(true); await sleep(0.8);
    setupChapter(i, 0);
    ui.hud(false);
    ui.fade(false);
    await chapterCard(i);
    ui.hud(true);
    G.state = 'play';
    const nar = ['n_ch1', 'n_ch2', 'n_ch3', 'n_ch4', null][i];
    if (nar && i > 0) sayBg(nar);
  }

  async function outro() {
    ui.hint(null);
    const i = G.chapter;
    G.coast = i !== 1;
    await subChain;
    if (i === 0) {
      await tween(1.4, (k) => { P.speed = ch.speed * (1 - k); });
      return startChapter(1);
    }
    if (i === 1) return rescuePip();
    if (i === 2) return startChapter(3);
    if (i === 3) return findBean();
    if (i === 4) return ending();
  }

  async function slowStop(sec = 1.8) { const v0 = P.speed; await tween(sec, (k) => { P.speed = v0 * (1 - k); }); P.speed = 0; G.coast = false; }

  async function rescuePip() {
    ui.hud(false);
    const s0 = P.s + 14;
    cage.visible = true; cage.position.copy(wpos(s0, 0, 0)); cage.scale.setScalar(1);
    const pip = chars.pip; pip.root.visible = true; pip.setMode('idle'); pip.lantern.visible = false;
    pip.root.position.copy(wpos(s0, 0, 0.1)); pip.root.rotation.y = 0;
    clearEnts();
    G.camFn = () => ({ pos: wpos(P.s - 4, 3, 3.2), look: wpos(s0, 0, 1) }); G.camK = 1.5;
    G.cutTick = (dt) => { P.s = Math.min(P.s + Math.max(0, (s0 - 3.2 - P.s)) * dt * 0.8, s0 - 3.2); placeBoatCut(); };
    await sleep(2.5);
    ui.hud(true); ui.hint('Tap SHINE to burn away the thorns', 20);
    G.shinePressed = false;
    await until(() => G.shinePressed || G.auto);
    ui.hint(null); ui.hud(false); audio.sfx.free(); world.state.flash = 1;
    fx.burst(cage.position.clone().add(V(0, 1, 0)), 0xffd080, 60, 7);
    await tween(0.8, (k) => cage.scale.set(1 + k * 0.4, 1 - k, 1 + k * 0.4));
    cage.visible = false;
    pip.st.wave = 2;
    G.camFn = () => ({ pos: wpos(s0 - 5.2, 1.8, 1.6), look: wpos(s0 - 1.6, 0, 0.9) });
    await say('e_rescuepip');
    const from = pip.root.position.clone(), to = boat.position.clone().add(V(0, 0.12, 0)).addScaledVector(fwd(P.s), -0.5);
    pip.setMode('jump');
    await tween(0.7, (k) => { pip.root.position.lerpVectors(from, to, k); pip.root.position.y += Math.sin(k * Math.PI) * 1.2; });
    audio.sfx.splash(); pip.setMode('sit'); G.party.pip = true;
    G.cutTick = () => { placeBoatCut(); pip.root.position.copy(boat.position).add(V(0, 0.12, 0)).addScaledVector(fwd(P.s), -0.5); pip.root.rotation.y = boat.rotation.y; };
    await say('p_rescued');
    await say('e_whereb');
    await say('p_moth');
    G.cutTick = null;
    return startChapter(2);
  }
  function placeBoatCut() {
    const f = fwd(P.s);
    wpos(P.s, P.u, Math.sin(G.gt * 2.1) * 0.05, boat.position); boat.rotation.set(0, Math.atan2(f.x, f.z), 0);
    hero().root.position.copy(boat.position).add(V(0, 0.12, 0)).addScaledVector(f, 0.35); hero().root.rotation.y = boat.rotation.y;
  }

  async function findBean() {
    await slowStop(1.2);
    ui.hud(false);
    const s0 = P.s + 12, h = hero(), pip = chars.pip, bean = chars.bean;
    clearEnts(); G.boss = null;
    nest.visible = true; nest.position.copy(wpos(s0 + 1.2, 0, groundHeight('hush', 0, s0)));
    bean.root.visible = true; bean.setMode('sit'); bean.root.position.copy(wpos(s0, 0, groundHeight('hush', 0, s0) + 0.3)); bean.root.rotation.y = 0;
    moth.root.visible = true; moth.flap(0.8, 0.35);
    moth.root.position.copy(wpos(s0 + 7, 0, 3.5)); moth.root.rotation.set(0.35, Math.PI, 0);
    h.setMode('idle'); pip.setMode('idle');
    G.camFn = (t) => ({ pos: wpos(P.s - 3.5, 1.6, 2.2), look: wpos(s0 + 2, 0, 2.2) }); G.camK = 1.2;
    audio.music('hush', 2);
    await sleep(1.2);
    await say('e_seebean');
    pip.setMode('run'); h.setMode('walk');
    G.cutTick = (dt) => { walkTo(pip, s0 - 0.8, 0.7, 3.2, dt) && pip.setMode('idle'); walkTo(h, s0 - 1.1, -0.5, 2, dt) && h.setMode('hug'); };
    G.camFn = () => ({ pos: wpos(s0 - 4.5, -1.8, 1.7), look: wpos(s0, 0, 0.8) });
    await sleep(2.2);
    bean.st.wave = 1.5; bean.setMode('idle');
    await say('b_found');
    G.camFn = () => ({ pos: wpos(s0 - 3, 1.2, 1.2), look: wpos(s0 + 6, 0, 3.6) });
    await sleep(1.2);
    await say('e_final');
    G.cutTick = null;
    chars.pip.lantern.visible = true;
    ui.hud(true); ui.hint('Hold SHINE — lanterns up!', 30);
    G.camFn = () => ({ pos: wpos(s0 - 6, 0.5, 1.2), look: wpos(s0 + 2, 0, 2.5) });
    G.holdTarget = 1.4;
    await until(() => G.hold >= G.holdTarget || G.auto);
    ui.hint(null); ui.hud(false);
    [h, pip, bean].forEach((c) => c.setMode('raise'));
    sayBg('e_final2');
    audio.music('final', 1.5);
    world.state.bloomBoost = 0;
    await tween(3, (k) => { world.state.bloomBoost = k * 1.4; lampLight.intensity = 8 + k * 40; });
    audio.sfx.free(); world.state.flash = 1.4; ui.fade(true, true);
    await sleep(1.2);
    moth.setGold(1); moth.flap(1.2, 0.5);
    world.setPalette('dawn', true);
    world.state.bloomBoost = 0; lampLight.intensity = 8;
    for (let k = 0; k < 8; k++) fx.burst(moth.root.position.clone().add(V((Math.random() - 0.5) * 8, Math.random() * 3, 0)), 0xffd890, 30, 6, 0.5, 2.5);
    nest.visible = false;
    ui.fade(false);
    G.camFn = () => ({ pos: wpos(s0 - 5, 0, 1.5), look: wpos(s0 + 7, 0, 4.5) });
    await sleep(2.5);
    await subChain;
    return startChapter(4);
  }

  async function ending() {
    const h = hero(), pip = chars.pip, bean = chars.bean;
    const land = ch.length + 40;
    home.visible = true; G.coast = false;
    G.cutTick = (dt) => {
      P.s = Math.min(P.s + P.speed * dt, land); P.speed = Math.max(3, P.speed - dt * 2);
      const f = fwd(P.s), yaw = Math.atan2(f.x, f.z);
      wpos(P.s, P.u * 0.95, 6 + Math.sin(G.gt * 1.2) * 0.3, moth.root.position); moth.root.rotation.set(-0.05, yaw, 0);
      h.root.position.copy(moth.root.position).add(V(0, 0.95, 0)).addScaledVector(f, 0.6);
      pip.root.position.copy(moth.root.position).add(V(0.45, 0.95, 0)).addScaledVector(f, -0.35);
      bean.root.position.copy(moth.root.position).add(V(-0.45, 0.95, 0)).addScaledVector(f, -0.1);
      [h, pip, bean].forEach((c) => (c.root.rotation.y = yaw));
    };
    G.camFn = () => ({ pos: wpos(P.s + 16, -10, 9), look: wpos(P.s - 5, 0, 7) }); G.camK = 0.8;
    audio.music('title', 3);
    ui.hud(false);
    ui.show('ending');
    await sleep(1);
    const lines = ['They flew home on the back of the morning,', 'three lights in a row.', 'And the eldest never said “leave me alone” again.', 'Well. Not often.', 'And never meaning it.'];
    ui.endLines(lines);
    await say('n_end');
    await sleep(2);
    G.camFn = () => ({ pos: wpos(ch.length + 28, -2, 6), look: wpos(ch.length + 70, 9, 3) });
    const mf = moth.root.position.clone(), mt = wpos(ch.length + 64, 7.5, 11);
    G.cutTick = (dt) => {
      moth.root.position.lerp(mt, 1 - Math.exp(-dt * 0.5));
      const f = fwd(P.s);
      h.root.position.copy(moth.root.position).add(V(0, 0.95, 0)).addScaledVector(f, 0.6);
      pip.root.position.copy(moth.root.position).add(V(0.45, 0.95, 0)).addScaledVector(f, -0.35);
      bean.root.position.copy(moth.root.position).add(V(-0.45, 0.95, 0)).addScaledVector(f, -0.1);
    };
    ui.endCredits();
    save.unlock(5); save.set('done', true);
    await sleep(3);
    G.cutTick = null;
  }

  function updateCut(dt) {
    if (G.coast) P.s += P.speed * dt;
    if (G.cutTick) G.cutTick(dt);
  }

  // ---------- title ----------
  function showTitle() {
    G.state = 'title';
    setupChapter(0, 0);
    ui.hud(false);
    G.state = 'title';
    wisp.visible = false;
    const iv = chars.ivy, ro = chars.rowan;
    Object.values(chars).forEach((c) => (c.root.visible = false));
    [iv, ro].forEach((c, k) => { c.root.visible = true; c.setMode('idle'); c.root.position.copy(wpos(-8, k ? 1.25 : -0.05, 0)); c.root.rotation.y = Math.PI + (k ? -0.25 : 0.25); });
    G.titleT = 0;
    G.camFn = (t) => {
      if (G.state === 'pick') return { pos: wpos(-4.2, 0.6, 1.25), look: wpos(-8, 0.6, 1.05) };
      const a = t * 0.06;
      return { pos: wpos(10 + Math.sin(a) * 2, -6 + Math.cos(a) * 1.5, 3), look: wpos(-10, 6, 6.5) };
    };
    G.camK = 1.2; snapCam();
    audio.music('title', 2);
  }
  function pickHero(kind) {
    G.heroKind = kind; save.set('hero', kind);
    chars[kind].st.wave = 1.6;
  }

  // ---------- main loop ----------
  const shake = V();
  let lastCamFn = null, camT0 = 0;
  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (G.paused) { world.render(); return; }
    G.gt += dt; globalU.uTime.value = G.gt;
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if ((w.t !== undefined && G.gt >= w.t) || (w.pred && w.pred())) { waiters.splice(i, 1); w.res(); }
    }
    if (G.state === 'play') updatePlay(dt);
    else if (G.state === 'cut' || G.state === 'failing') updateCut(dt);
    if (G.state === 'failing') P.speed = damp(P.speed, 0, 3, dt);
    G.hold = G.lampDown ? G.hold + dt : 0;

    placeParty(dt);
    for (const e of ents) {
      if (e.type === 'mote') { e.wx = pathX(e.s) + e.u; e.wy = baseY(e.s, e.u) + e.y; e.wz = -e.s; continue; }
      if (!e.mesh) continue;
      const by = e.type === 'hush' || e.type === 'storm' || e.type === 'ring' ? baseY(e.s, e.u) : ch.mode === 'run' ? groundHeight(ch.env, e.u, e.s) : ch.mode === 'boat' ? -0.12 : 0;
      wpos(e.s, e.u, by + e.y, tmp);
      if (e.swoop) { e.mesh.position.lerp(tmp, 1 - Math.exp(-dt * 3)); if (e.mesh.position.distanceTo(tmp) < 0.3) e.swoop = 0; }
      else e.mesh.position.copy(tmp);
      if (e.type === 'hush') e.mesh.position.y += Math.sin(G.gt * 2 + e.t0) * 0.2;
      e.mesh.rotation.y = Math.atan2(pathDX(e.s), -1) + (e.type === 'hush' ? Math.PI : 0);
      if (e.type === 'floatlog') e.mesh.position.y += Math.sin(G.gt * 2 + e.s) * 0.05;
      if (e.mesh.userData.tick) e.mesh.userData.tick(G.gt, dt);
      e.mesh.traverse((o) => { if (o.userData.tick && o !== e.mesh) o.userData.tick(G.gt, dt); });
    }
    motes.sync();
    Object.values(chars).forEach((c) => c.root.visible && c.update(dt));
    if (moth.root.visible) moth.update(dt);
    if (home.visible) home.userData.beam.rotation.y += dt * 0.6;
    if (wisp.visible) wisp.rotation.y += dt;
    fx.update(dt);

    const lf = clamp(P.light / 100, 0, 1);
    lampLight.intensity = G.state === 'play' ? 3 + lf * 7 : lampLight.intensity;
    if (hero().lantern) hero().lantern.userData.halo.scale.setScalar(0.5 + lf * 0.7);
    if (G.state === 'play' && ch.mode !== 'ride') world.state.dark = Math.max(G.boss ? 0.25 : 0, clamp((35 - P.light) / 35, 0, 1) * 0.7);
    ui.light(lf, P.shineCd <= 0, P.light < 25 && G.state === 'play');
    ui.progress(clamp(P.s / ch.length, 0, 1));

    streamer.update(P.s, ch.mode === 'glide' ? 6 : 5);
    streamer.tick(G.gt);
    let target;
    if (G.camFn !== lastCamFn) { lastCamFn = G.camFn; camT0 = G.gt; }
    if (G.camFn) target = G.camFn(G.gt - camT0);
    else target = followCam();
    const k = G.camFn ? G.camK : 6;
    camPos.lerp(target.pos, 1 - Math.exp(-dt * k));
    camLook.lerp(target.look, 1 - Math.exp(-dt * (k + 1)));
    G.shake = Math.max(0, (G.shake || 0) - dt);
    shake.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(G.shake * 0.5);
    camera.position.copy(camPos).add(shake);
    camera.lookAt(camLook);
    if (sea.visible) { sea.position.x = camera.position.x; sea.position.z = camera.position.z; }
    world.update(dt, wpos(P.s, P.u, baseY(P.s, P.u)));
    world.render();
  }

  // ---------- public ----------
  Object.assign(G, {
    update, showTitle, pickHero, playIntro, startChapter, shine, jump, steer, retry, chars, moth, ents: () => ents, layout: () => layout, ch: () => ch,
    setPaused(p) { G.paused = p; },
    lampHold(d) { G.lampDown = d; },
    beginFromChapter(i) {
      G.party.pip = i >= 2; G.party.bean = i >= 4;
      return startChapter(i);
    },
    toTitle() { waiters = []; subChain = Promise.resolve(); G.cutTick = null; audio.stopVO(); ui.subHide(); ui.hint(null); showTitle(); },
    restartChapter() { waiters = []; G.cutTick = null; audio.stopVO(); ui.subHide(); ui.hint(null); return startChapter(G.chapter); },
  });
  return G;
}
