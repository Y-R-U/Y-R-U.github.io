// D29 Kingdom Map: pick an airport, fly toward it, magic clouds roll in, the next airport swaps in, you come out of the
// clouds near it. One airport world is loaded at a time (docs/MAP.md). Main hands over its pieces through ctx.
import * as layout from '../world/layout.js';
import { KINGDOM, ORDER, SOON, LOOKS, canUse, offsetM } from '../../data/airports/kingdom.js';
import { AIRCRAFT } from '../../data/aircraft.js';
import { arrivalRoute } from '../flight/routes.js';
import { AI_JETS } from '../flight/attract.js';
import { FOG_DENSITY } from '../world/env.js';
import { takeLandNow } from '../assist/landbutton.js';

for (const d of Object.values(KINGDOM)) layout.registerAirport(d);

export const TRAVEL = { swapM: 4000, arriveM: 5500, ferryM: 7500, ferryAlt: 450, cloudIn: 2.4, cloudOut: 2.8, fogK: 14, nearM: 1500 };
const JET_CHANCE = { royal: AI_JETS.chance, farm: 0, airbase: 0.3, palace: 0 };
const WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
const wind16 = (h) => WINDS[Math.round(h / 22.5) % 16];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const here = () => layout.AIRPORT;
// FLIGHTFIX4: airports that share one world (the Palace Lawn inside C-Tower 1's): a trip between them is a tower
// handover ~1.5 km out, no magic clouds and no teleport (the lawn is really there, 2 km NNE of C-Tower 1)
export const worldOf = (id) => KINGDOM[id]?.world || id;
export const sameWorld = (a, b) => worldOf(a) === worldOf(b);
// where the destination is in this world's frame: its own centre when it shares this world, else the kingdom offset
function destXZ(to) {
  const cur = here();
  if (sameWorld(cur.id, to)) return KINGDOM[to].center || [0, 0];
  const c = cur.center || [0, 0], [ox, oz] = offsetM(cur.id, to);
  return [c[0] + ox, c[1] + oz];
}

// FLIGHTFIX4: shader warm-up after a swap. three's compileAsync polls every material it compiled until each program is
// ready and cannot be stopped; a material disposed meanwhile (the next swap's world.dispose()) made its timer throw
// "reading 'isReady'" (and never resolve). This poll is the same, guarded per material, capped and cancellable.
export function warmShaders(renderer, scene, camera, { capMs = 3000, cancelled = () => false } = {}) {
  let mats;
  try { mats = renderer.compile(scene, camera); } catch (e) { return Promise.resolve(false); }
  const props = renderer.properties;
  if (!mats?.forEach || !props?.get) return Promise.resolve(true);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      try {
        if (cancelled()) return resolve(false);
        for (const m of [...mats]) { const prog = props.get(m)?.currentProgram; if (!prog?.isReady || prog.isReady()) mats.delete(m); }
        if (!mats.size) return resolve(true);
        if (performance.now() - t0 > capMs) return resolve(false);
      } catch (e) { return resolve(false); }
      setTimeout(tick, 10);
    };
    setTimeout(tick, 0);
  });
}

// ?airport=<id> at boot (before the world is built): only an airport the chosen plane can use.
export function bootAirport(id, type) {
  const def = KINGDOM[id];
  if (!def || def === here()) return here().id;
  if (!canUse(def, type).ok) { console.warn(`[map] ${type} cannot use ${id}`); return here().id; }
  layout.setAirport(id);
  AI_JETS.chance = JET_CHANCE[id] ?? JET_CHANCE.royal;
  return id;
}

// ctx: { S, overlay, scene, renderer, camera, env, attract, traffic, wiring, hud, getWorld, adoptWorld(w), buildWorld(opts),
//        placePlayer(), anchor() → element the chip sits under (the warp chip), log(type, data) }
export function createKingdom(ctx) {
  const { S, hud } = ctx;
  const K = { dest: null, ferry: false, phase: null, t: 0, pick: here().id, swaps: [], open: false, chipT: 0, fog: null };
  css();

  // ---------- DOM ----------
  const clouds = document.createElement('div');
  clouds.className = 'krz-clouds';
  clouds.hidden = true;
  clouds.innerHTML = `${'<i></i>'.repeat(9)}<div class="krz-clouds-cap"><b>Magic clouds</b><span></span></div>`;
  document.getElementById('krz-canvas')?.after(clouds);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'krz-map-chip';
  chip.hidden = true;
  chip.setAttribute('aria-label', 'Kingdom map');
  chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><b>MAP</b><small></small>';
  const sheet = document.createElement('section');
  sheet.className = 'krz-map';
  sheet.hidden = true;
  sheet.innerHTML = `<header><div><b>The Kingdom of Krayzee</b><span class="krz-map-at"></span></div><button type="button" class="krz-map-x" aria-label="Close map">×</button></header>
    <svg class="krz-map-svg" viewBox="-42 -38 88 70" role="img" aria-label="Kingdom map"></svg>
    <div class="krz-map-card"></div>`;
  ctx.overlay.append(chip);
  document.body.append(sheet);   // above the warp chip (body-level, z 19) and the radio (z 20); below UI popups' quit confirm
  const svg = sheet.querySelector('svg'), card = sheet.querySelector('.krz-map-card'), at = sheet.querySelector('.krz-map-at');
  const stop = (e) => e.stopPropagation();
  for (const el of [chip, sheet]) { el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true }); }
  chip.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!K.open); });
  sheet.querySelector('.krz-map-x').addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
  sheet.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) { K.pick = pin.dataset.pin; draw(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) go(act);
  });

  function setOpen(v) {
    K.open = !!v && canOpen();
    sheet.hidden = !K.open;
    if (K.open) { K.pick = K.dest || (K.pick === here().id ? ORDER.find((id) => id !== here().id) : K.pick); draw(); }
  }
  const canOpen = () => !!S.player && S.playMode === 'free' && !K.phase;

  // ---------- map drawing ----------
  function draw() {
    const cur = here(), P = S.player, type = S.type || 'c172';
    at.textContent = `You are at C-Tower ${cur.n} · ${cur.short}`;
    const pos = P ? [cur.map[0] + P.ac.pos.x / 1000, cur.map[1] + P.ac.pos.z / 1000] : cur.map;
    const pin = (d, soon) => {
      const [x, z] = d.pin || d.map, sel = K.pick === d.id, bad = !soon && !canUse(d, type).ok;
      return `<g class="pin${sel ? ' sel' : ''}${soon ? ' soon' : ''}${bad ? ' bad' : ''}${d === cur ? ' cur' : ''}" data-pin="${d.id}" transform="translate(${x} ${z})">
        <circle r="5" class="hit"/><circle r="${soon ? 1.1 : 1.7}" class="dot"/>${soon ? '' : `<text y="-2.6" class="n">${d.n}</text>`}
        <text y="${soon ? 3.4 : 4.2}" class="lbl">${soon ? d.name : d.short}</text></g>`;
    };
    const dest = K.dest ? KINGDOM[K.dest] : KINGDOM[K.pick];
    const route = dest && dest !== cur ? `<path class="route${K.dest ? ' on' : ''}" d="M${pos[0]} ${pos[1]} L${dest.map[0]} ${dest.map[1]}"/>` : '';
    svg.innerHTML = `<rect x="-42" y="-38" width="88" height="70" class="land"/>
      <path class="sea" d="M-42 8 C-36 12 -34 18 -24 21 C-18 24 -16 28 -14 32 L-42 32 Z"/>
      <path class="river" d="M44 -30 C30 -24 26 -10 14 -6 C4 -3 -4 -10 -14 -4 C-22 1 -26 4 -34 11"/>
      <g class="hills"><path d="M8 -28 l3 -5 l3 5z M12 -27 l4 -7 l4 7z M17 -29 l2.5 -4 l2.5 4z M-6 -33 l3 -4 l3 4z"/></g>
      <g class="woods">${[[-10, -18], [-24, -10], [20, 4], [6, 16], [-4, 22], [30, -4], [-30, -24]].map(([x, z]) => `<circle cx="${x}" cy="${z}" r="2.4"/>`).join('')}</g>
      <path class="castle" d="M0.2 -3.6 h1.2 v-1 h0.4 v1 h0.4 v-1 h0.4 v1 h0.4 v1.6 h-2.8z"/>
      ${route}
      ${SOON.map((d) => pin(d, true)).join('')}
      ${ORDER.map((id) => pin(KINGDOM[id], false)).join('')}
      ${P ? `<g class="me" transform="translate(${pos[0]} ${pos[1]}) rotate(${P.ac.heading})"><path d="M0 -2 L1.3 1.6 L0 0.8 L-1.3 1.6z"/></g>` : ''}`;
    drawCard();
  }
  function drawCard() {
    const cur = here(), type = S.type || 'c172', plane = AIRCRAFT[type]?.name || type;
    const soon = SOON.find((s) => s.id === K.pick);
    if (soon) { card.innerHTML = `<h3>${soon.name}</h3><p class="dim">Coming soon. The builders are still arguing about the bunting.</p>`; return; }
    const d = KINGDOM[K.pick] || cur, rw = d.runways[0], use = canUse(d, type), look = LOOKS[d.id] || {};
    const [ox, oz] = offsetM(cur.id, d.id), km = Math.hypot(ox, oz) / 1000;
    const where = d === cur ? 'You are here' : `${km.toFixed(0)} km ${wind16(bearingOf(ox, oz))}`;
    const fresh = S.player && S.player.ac.onGround && !S.everAir;
    let btn;
    if (d === cur) btn = K.dest ? '<button type="button" data-act="cancel" class="krz-map-go ghost">Cancel the trip</button>' : '<button type="button" class="krz-map-go" disabled>You are here</button>';
    else if (K.dest === d.id) btn = '<button type="button" data-act="cancel" class="krz-map-go ghost">Cancel the trip</button>';
    else btn = `<button type="button" data-act="${fresh ? 'start' : 'fly'}" class="krz-map-go${use.ok ? '' : ' no'}">${fresh ? 'Start here' : 'Fly there'}</button>`;
    card.innerHTML = `<h3>${d.name} <small>C-Tower ${d.n} · ${look.controller || ''}</small></h3>
      <p class="facts">RWY ${rw.id} · ${rw.length.toLocaleString('en-GB')} m ${rw.surface} · ${where}</p>
      <p class="dim">${look.blurb || ''}</p>
      <p class="fit ${use.ok ? 'ok' : 'bad'}">${use.ok ? `Fits your ${plane} (${use.vertical ? 'vertical landing' : `needs ${use.need} m`})` : `${use.short}<br><i>${use.quip}</i>`}</p>
      <div class="row">${btn}</div>`;
  }

  // ---------- actions ----------
  function go(act) {
    const P = S.player, d = KINGDOM[K.pick];
    if (act === 'cancel') { clear(); hud.flash('TRIP CANCELLED · HOME TOWER HAS YOU', 'info', 2.5); setOpen(false); return; }
    if (!P || !d || d === here()) return;
    const use = canUse(d, S.type || 'c172');
    if (!use.ok) {
      hud.flash(use.quip.toUpperCase(), 'warn', 4);
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      ctx.log?.('mapRefused', { to: d.id, type: S.type });
      return;
    }
    setOpen(false);
    if (act === 'start') { swap(d.id, 'ground'); return; }
    K.dest = d.id; K.ferry = false;
    const [ox, oz] = offsetM(here().id, d.id);
    hud.flash(`COURSE SET · ${d.short.toUpperCase()} · ${wind16(bearingOf(ox, oz))}`, 'info', 3);
    ctx.log?.('mapDest', { to: d.id });
  }
  function clear() { K.dest = null; K.ferry = false; K.owner = null; }

  // the autopilot's leg out: straight toward the destination, past the cloud line
  function setFerry(P) {
    const cur = here(), near = sameWorld(cur.id, K.dest);
    let x, z, alt = Math.max(TRAVEL.ferryAlt, Math.min(800, P.ac.alt));
    if (near) {
      // the same world: straight at the destination itself (the handover comes 1.5 km short), circuit-ish height
      [x, z] = destXZ(K.dest); alt = Math.max(220, Math.min(450, P.ac.alt));
    } else {
      const [ox, oz] = offsetM(cur.id, K.dest), L = Math.hypot(ox, oz), c = cur.center || [0, 0];
      x = c[0] + (ox / L) * TRAVEL.ferryM; z = c[1] + (oz / L) * TRAVEL.ferryM;
    }
    P.ap.landing = null;
    P.ap.setRoute({ name: `departure ferry ${K.dest}`, legs: [{ kind: 'fly', to: [x, alt, z], speed: 110, flaps: 0, label: `TO ${KINGDOM[K.dest].short.toUpperCase()}` }], loop: null });
    K.ferry = true;
  }

  // ---------- the swap ----------
  async function swap(id, mode) {
    if (K.phase) return;
    K.phase = 'in'; K.t = 0; K.mode = mode; K.to = id;
    if (mode === 'near') { K.t = TRAVEL.cloudIn; K.fog = ctx.scene.fog; ctx.log?.('mapHandover', { to: id }); return; }   // no clouds: straight to the swap
    clouds.hidden = false;
    clouds.querySelector('span').textContent = `${KINGDOM[id].short} ahead`;
    K.fog = ctx.scene.fog;
    if (mode !== 'fly') { K.t = TRAVEL.cloudIn; }
    ctx.log?.('mapClouds', { to: id, mode });
  }
  async function doSwap() {
    const id = K.to, mode = K.mode, P = S.player, from = here().id, def = KINGDOM[id], t0 = performance.now();
    const keep = P && mode === 'near' ? { near: true } : P && mode === 'fly' ? { agl: K.owner?.agl ?? Math.max(300, Math.min(700, P.ac.agl)), speed: P.ac.speed, throttle: P.ac.ctl.throttle } : null;
    const memBefore = { ...ctx.renderer.info.memory };
    K.gen = (K.gen || 0) + 1;   // stops the previous swap's shader warm-up poll before this one disposes its materials
    const own = K.owner;
    try {
      try { own?.beforeSwap?.(id); } catch (e) { console.warn('[map] trip', e); }
      const flush = () => { for (const e of [...ctx.attract.ai]) ctx.attract.despawn(e); };
      flush(); await sleep(300); flush();
      ctx.traffic.standOwner?.clear?.();
      ctx.getWorld().dispose();
      layout.setAirport(id);
      // FLIGHTFIX4: the old airport's runway ends, LAND/STOVL fallbacks and the old tower's gate must not outlive it
      try { P?.ap.airportChanged?.(); takeLandNow(); } catch (e) { console.warn('[map] ap reset', e); }
      AI_JETS.chance = JET_CHANCE[id] ?? JET_CHANCE.royal;
      const w = await ctx.buildWorld({ yield: true });
      ctx.adoptWorld(w);
      ctx.wiring.setWorld(w, def);
      flush();
      S.lastStop = null;
      await ctx.attract.start();
      if (P && keep?.near) handover(P);
      else if (P && keep) arrive(P, from, id, keep);
      else if (P) ctx.placePlayer();
      const gen = K.gen;
      try { await warmShaders(ctx.renderer, ctx.scene, ctx.camera, { capMs: 3000, cancelled: () => K.gen !== gen }); } catch (e) { /* optimisation only */ }
    } catch (e) {
      console.error('[map] swap failed', e);
      // the player's route may still name the old airport's runway ends: start them on this airport's runway
      if (P && here().id !== from) try { ctx.placePlayer(); } catch (e2) { /* */ }
    }
    clear();
    if (own && P && keep) try { own.onArrive?.(id); } catch (e) { console.warn('[map] trip', e); }
    const ms = Math.round(performance.now() - t0);
    K.swaps.push({ from, to: id, mode, ms, before: memBefore, after: { ...ctx.renderer.info.memory } });
    ctx.log?.('mapSwap', { from, to: id, mode, ms });
    K.phase = 'out'; K.t = 0;
    hud.flash(`${def.short.toUpperCase()} · C-TOWER ${def.n}`, 'good', 3.5);
    if (def.towerLines) setTimeout(() => { try { ctx.wiring.radio?.handleEvent({ type: 'tower', intent: 'welcome', actor: 'player' }); } catch (e) { /* */ } }, 2500);
  }
  // out of the clouds on the line from the old airport, heading for the new one, same height, speed and power
  function arrive(P, from, to, keep) {
    const [ox, oz] = offsetM(from, to), L = Math.hypot(ox, oz) || 1, c = KINGDOM[to].center || [0, 0];
    const R = TRAVEL.arriveM + keep.speed * TRAVEL.cloudOut * (S.simK || 1);   // the clouds part over cloudOut s: out of them at ~arriveM
    const x = c[0] - (ox / L) * R, z = c[1] - (oz / L) * R;
    P.ac.place({ x, z, alt: keep.agl, heading: bearingOf(ox, oz), speed: keep.speed, throttle: keep.throttle, flaps: 0 }, ctx.env);
    P.ap.landing = null;
    P.ap.setRoute(arrivalRoute(ctx.wiring.activeEnd(), { type: S.type || 'c172', stand: 'auto', parkSeconds: 30, from: [x, z] }));
    try { ctx.wiring.link?.placed(P, 8); } catch (e) { /* */ }
  }

  // the same world (palace <-> royal): no teleport, the new tower's arrival from where the plane is
  function handover(P) {
    P.ap.landing = null;
    P.ap.setRoute(arrivalRoute(ctx.wiring.activeEnd(), { type: S.type || 'c172', stand: 'auto', parkSeconds: 30, from: [P.ac.pos.x, P.ac.pos.z] }));
    P.ap.replan?.();
    try { ctx.wiring.link?.placed(P, 8); } catch (e) { /* */ }
  }

  // ---------- per frame (real dt); true = the sim is frozen for the swap ----------
  function frame(dt) {
    const P = S.player;
    if ((K.chipT -= dt) <= 0) { K.chipT = 0.25; paintChip(P); }
    if (K.phase === 'in') {
      K.t += dt;
      const k = Math.min(1, K.t / TRAVEL.cloudIn);
      if (K.mode !== 'near') { clouds.style.opacity = String(k * k); if (ctx.scene.fog) ctx.scene.fog.density = FOG_DENSITY * (1 + (TRAVEL.fogK - 1) * k); }
      if (k >= 1) { K.phase = 'swap'; doSwap(); }
      return K.phase === 'swap';
    }
    if (K.phase === 'swap') return true;
    if (K.phase === 'out') {
      if (K.mode === 'near') { K.phase = null; return false; }
      K.t += dt;
      const k = Math.min(1, K.t / TRAVEL.cloudOut);
      clouds.style.opacity = String(1 - k);
      if (ctx.scene.fog) ctx.scene.fog.density = FOG_DENSITY * (1 + (TRAVEL.fogK - 1) * (1 - k) * (1 - k));
      if (k >= 1) { K.phase = null; clouds.hidden = true; }
      return false;
    }
    if (!K.dest || !P || P.ac.crashed || (S.playMode !== 'free' && !K.owner)) return false;
    if (P.ac.onGround) { if (!K.owner) K.ferry = false; return false; }
    if (!K.ferry && P.ac.agl > 80 && !P.ap.landing) setFerry(P);
    if (sameWorld(here().id, K.dest)) {
      const [tx, tz] = destXZ(K.dest);
      if (Math.hypot(P.ac.pos.x - tx, P.ac.pos.z - tz) < TRAVEL.nearM) swap(K.dest, 'near');
      return false;
    }
    const c = here().center || [0, 0], [ox, oz] = offsetM(here().id, K.dest);
    const dx = P.ac.pos.x - c[0], dz = P.ac.pos.z - c[1], d = Math.hypot(dx, dz);
    const toward = (dx * ox + dz * oz) / (d * Math.hypot(ox, oz) || 1);
    if (d > TRAVEL.swapM && toward > 0.35) swap(K.dest, 'fly');
    return false;
  }
  function paintChip(P) {
    const show = canOpen() || !!K.dest;
    chip.hidden = !show || !!K.phase;
    if (chip.hidden) { if (K.open && !canOpen()) setOpen(false); return; }
    const small = chip.querySelector('small');
    if (K.dest && P) {
      const t = target(P);
      small.textContent = t ? `${KINGDOM[K.dest].short} · ${(t.dist / 1000).toFixed(1)} km` : '';
      chip.classList.add('on');
    } else { small.textContent = ''; chip.classList.remove('on'); }
    // portrait: under the warp chip; landscape: in the top row, left of the view / fullscreen buttons (the prompt card
    // band left of the warp chip is taken)
    const port = innerHeight > innerWidth;
    const a = port ? ctx.anchor?.() : document.querySelector('.krz-top-r'), r = a && !a.hidden ? a.getBoundingClientRect() : null;
    if (r?.width) {
      let top = port ? r.bottom + 8 : r.top + Math.max(0, (r.height - 40) / 2);
      const right = port ? innerWidth - r.right : innerWidth - r.left + 8;
      // the ground chips (difficulty / aircraft) sit across the same band before the first take-off: go below them
      const g = document.querySelector('.krz-chips:not(.gone)'), gr = g && !g.closest('[hidden]') ? g.getBoundingClientRect() : null;
      if (gr?.height && top < gr.bottom && top + 44 > gr.top && innerWidth - right > gr.left) top = gr.bottom + 8;
      chip.style.top = `${Math.round(top)}px`;
      chip.style.right = `${Math.round(right)}px`;
    }
    if (K.open && (K.drawT = (K.drawT || 0) + 1) % 4 === 0) draw();
  }
  // where the HUD's gold diamond points while a trip is on: the destination, in this world's frame
  function target(P) {
    if (!K.dest || !P) return null;
    const [x, z] = destXZ(K.dest);
    return { label: KINGDOM[K.dest].short.toUpperCase(), pos: [x, Math.max(300, P.ac.pos.y), z], dist: Math.hypot(x - P.ac.pos.x, z - P.ac.pos.z) };
  }

  const api = {
    frame, target,
    get busy() { return K.phase === 'swap'; },
    get dest() { return K.dest; },
    // aircraft picker at an airport the type cannot use: refused with the quip
    allows(type) {
      const u = canUse(here(), type);
      if (!u.ok) hud.flash(u.quip.toUpperCase(), 'warn', 4);
      return u.ok;
    },
    // story / online need C-Tower 1: swap home first (menu-time, no player)
    async ensure(id = 'royal') {
      if (here().id === id || K.phase) return;
      swap(id, S.player ? 'ground' : 'menu');
      while (K.phase) await sleep(100);
    },
    reset() { clear(); setOpen(false); },
    // STORY3: a mission-owned trip, in any play mode and any plane (the mission flies its own leg out, so no ferry leg);
    // o: { beforeSwap(to), onArrive(to), agl? (height out of the clouds) } — onArrive runs once the player is placed
    trip(id, o = {}) { if (!KINGDOM[id] || id === here().id || K.phase) return false; K.dest = id; K.ferry = true; K.owner = o; return true; },
    afterBoot() { if (here().id !== 'royal') ctx.wiring.setTower(here()); },
    state: () => ({ airport: here().id, dest: K.dest, ferry: K.ferry, phase: K.phase, open: K.open, pick: K.pick, swaps: K.swaps.slice() }),
    open: setOpen,
    // test hook (tools/test-map.mjs memory gate): send the AI home so only the world + the player's plane are on the GPU
    quietTraffic() { for (const e of [...ctx.attract.ai]) ctx.attract.despawn(e); return ctx.traffic.list.length; },
  };
  window.__kingdom = api;
  return api;
}

let cssDone = false;
function css() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.krz-clouds { position: fixed; inset: 0; z-index: 5; pointer-events: none; opacity: 0; overflow: hidden;
  background: radial-gradient(ellipse at 50% 55%, #fffaf0 0%, #f2f0f6 45%, #d9e2ef 100%); }
.krz-clouds i { position: absolute; width: 70vmax; height: 46vmax; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,0));
  animation: krz-cloud 9s ease-in-out infinite alternate; }
.krz-clouds i:nth-child(1) { left: -30vmax; top: -10vmax; } .krz-clouds i:nth-child(2) { right: -28vmax; top: -6vmax; animation-delay: -2s; }
.krz-clouds i:nth-child(3) { left: -10vmax; bottom: -20vmax; animation-delay: -4s; } .krz-clouds i:nth-child(4) { right: -20vmax; bottom: -16vmax; animation-delay: -1s; }
.krz-clouds i:nth-child(5) { left: 20vmax; top: 10vmax; background: radial-gradient(closest-side, rgba(255,226,240,.7), rgba(255,255,255,0)); animation-delay: -3s; }
.krz-clouds i:nth-child(6) { left: 5vmax; top: 30vmax; background: radial-gradient(closest-side, rgba(226,214,255,.65), rgba(255,255,255,0)); animation-delay: -5s; }
.krz-clouds i:nth-child(7) { right: 0; top: 25vmax; animation-delay: -6s; } .krz-clouds i:nth-child(8) { left: 30vmax; bottom: -10vmax; animation-delay: -7s; }
.krz-clouds i:nth-child(9) { left: 40vmax; top: -15vmax; background: radial-gradient(closest-side, rgba(255,240,200,.7), rgba(255,255,255,0)); animation-delay: -8s; }
@keyframes krz-cloud { from { transform: translate(-4vmax, 0) scale(1); } to { transform: translate(5vmax, -2vmax) scale(1.12); } }
.krz-clouds-cap { position: absolute; left: 0; right: 0; top: 40%; text-align: center; color: #4b3a6e; font: 700 15px system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; }
.krz-clouds-cap b { display: block; font-size: 22px; color: #6b3fa0; }
.krz-map-chip { position: absolute; z-index: 21; pointer-events: auto; display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 14px;
  border: 2px solid rgba(255,215,94,.45); background: var(--krz-glass, rgba(14,22,38,.48)); color: var(--krz-ink, #f6f1e4); font: 800 13px system-ui, sans-serif;
  letter-spacing: .08em; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); touch-action: manipulation; cursor: pointer; }
.krz-map-chip svg { width: 20px; height: 20px; color: #ffd75e; }
.krz-map-chip small { font: 700 11px system-ui, sans-serif; letter-spacing: .02em; color: #ffd75e; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.krz-map-chip small:empty { display: none; }
.krz-map-chip.on { border-color: #ffd75e; }
.krz-map { position: fixed; z-index: 32; pointer-events: auto; box-sizing: border-box; left: 8px; right: 8px; bottom: calc(env(safe-area-inset-bottom, 0px) + 210px); max-width: 520px; margin: 0 auto;
  padding: 8px 10px 10px; border-radius: 16px; background: rgba(12,16,26,.78); border: 2px solid rgba(255,215,94,.55); color: #f6f1e4; font: 13px system-ui, sans-serif;
  box-shadow: 0 8px 28px rgba(0,0,0,.35); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); touch-action: manipulation; }
.krz-map[hidden] { display: none !important; }
.krz-map header { display: flex; align-items: center; gap: 8px; }
.krz-map header div { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.krz-map header b { color: #ffd75e; font-size: 14px; letter-spacing: .06em; text-transform: uppercase; }
.krz-map header span { font-size: 12px; color: rgba(246,241,228,.7); }
.krz-map-x { width: 40px; height: 36px; border: 0; border-radius: 10px; background: rgba(255,255,255,.1); color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
.krz-map-svg { display: block; width: 100%; height: auto; max-height: 34vh; margin: 6px 0; border-radius: 10px; }
.krz-map-svg .land { fill: #d6dfae; } .krz-map-svg .sea { fill: #8fc3dc; } .krz-map-svg .river { fill: none; stroke: #8fc3dc; stroke-width: .8; }
.krz-map-svg .hills path { fill: #a99a7a; } .krz-map-svg .woods circle { fill: #9db57a; } .krz-map-svg .castle { fill: #7a5a8a; }
.krz-map-svg .route { stroke: #6b3fa0; stroke-width: .5; stroke-dasharray: 1.2 1; fill: none; } .krz-map-svg .route.on { stroke: #c4122f; stroke-width: .7; }
.krz-map-svg .pin { cursor: pointer; } .krz-map-svg .pin .hit { fill: transparent; }
.krz-map-svg .pin .dot { fill: #c4122f; stroke: #fff; stroke-width: .5; } .krz-map-svg .pin.cur .dot { fill: #2f7d32; }
.krz-map-svg .pin.bad .dot { fill: #8a8a8a; } .krz-map-svg .pin.sel .dot { stroke: #ffd75e; stroke-width: .9; }
.krz-map-svg .pin.soon .dot { fill: #b9ad92; stroke: none; }
.krz-map-svg text { font: 700 2.4px system-ui, sans-serif; text-anchor: middle; fill: #2a2438; } .krz-map-svg .pin.soon text { fill: #8d8370; font-weight: 600; font-size: 1.9px; }
.krz-map-svg text.n { fill: #fff; font-size: 2px; dominant-baseline: middle; } .krz-map-svg .pin text.n { transform: translateY(2.6px); }
.krz-map-svg .me path { fill: #ffd75e; stroke: #3a2a00; stroke-width: .3; }
.krz-map-card h3 { margin: 2px 0 4px; font-size: 15px; } .krz-map-card h3 small { font-size: 11px; font-weight: 600; color: rgba(246,241,228,.7); }
.krz-map-card p { margin: 2px 0; } .krz-map-card .dim { color: rgba(246,241,228,.7); font-size: 12px; } .krz-map-card .facts { font-weight: 700; color: #ffd75e; font-size: 12px; }
.krz-map-card .fit.ok { color: #5ee08f; } .krz-map-card .fit.bad { color: #ff8a7a; font-weight: 700; } .krz-map-card .fit i { font-weight: 500; color: #f6f1e4; }
.krz-map-card .row { display: flex; gap: 8px; margin-top: 6px; }
.krz-map-go { flex: 1; min-height: 44px; border: 0; border-radius: 12px; background: #ffd75e; color: #2a2010; font: 800 14px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
.krz-map-go.no { background: #6d6a63; color: #f6f1e4; } .krz-map-go.ghost { background: rgba(255,255,255,.12); color: #f6f1e4; } .krz-map-go:disabled { opacity: .45; }
.krz-map-card.shake { animation: krz-map-shake .4s; } @keyframes krz-map-shake { 25% { transform: translateX(-6px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } }
@media (orientation: landscape) and (max-height: 520px) {
  .krz-map { top: 8px; bottom: auto; right: auto; left: calc(env(safe-area-inset-left, 0px) + 8px); width: min(66vw, 620px); max-width: none; margin: 0;
    max-height: calc(100vh - 16px); display: grid; grid-template-columns: 44% 1fr; grid-template-rows: auto minmax(0, 1fr); column-gap: 10px; }
  .krz-map header { grid-column: 1 / -1; }
  .krz-map-svg { max-height: none; margin: 4px 0 0; align-self: start; }
  .krz-map-card { min-height: 0; overflow-y: auto; }
  .krz-map-card h3 { font-size: 14px; } .krz-map-card .dim { font-size: 11.5px; }
}`;
  document.head.appendChild(s);
}
