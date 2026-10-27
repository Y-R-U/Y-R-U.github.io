// Opportunity prompts: one small, rate-limited, dismissible suggestion of a rule the player could break right now.
// Reads ATC/traffic state only (never issues anything). Settings key `hints` (default on) hides them.
import { RUNWAYS, TOWER, TERMINAL, TAXIWAYS, PARALLEL, threshold, runwayHeadingFor } from '../world/layout.js';
import * as sfx from './sound.js';
import { rect, rects } from './place.js';

const SHOW = 6, GAP = 9, KIND_CD = 45, DISMISS_CD = 150, DONE_CD = 70;
// Which infraction ids satisfy which prompt.
const SATISFIES = {
  cut_in_final: 'cut_in', runway_steal: 'cut_in', forced_goaround: 'cut_in',
  queue_jump: 'queue', unauth_takeoff: 'noclear', tower_buzz: 'buzz', terminal_buzz: 'terminal',
  formation: 'formation', low_pass: 'lowpass', taxiway_landing: 'oddland', grass_landing: 'oddland', apron_landing: 'oddland',
  near_miss: 'formation',
};
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L19 19 L12 15 L5 19 Z" fill="currentColor"/></svg>';
const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return d; };
const hdgTo = (dx, dz) => (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
const fmtDist = (m) => (m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

export function createPrompts(root, { getSettings, onTarget, held } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-prompt';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="krz-pr-dir"><span class="krz-pr-arrow">${ARROW}</span><span class="krz-pr-d"></span></span><span class="krz-pr-body"><b class="krz-pr-t"></b><small class="krz-pr-s"></small></span><button type="button" class="krz-pr-x" aria-label="Dismiss hint">&times;</button>`;
  root.append(el);
  const tEl = el.querySelector('.krz-pr-t'), sEl = el.querySelector('.krz-pr-s'), dEl = el.querySelector('.krz-pr-d'), arrow = el.querySelector('.krz-pr-arrow');
  const S = { cur: null, t: 0, gap: 4, cd: {}, evalT: 0, clock: 0, invalidT: 0, blocked: false, history: [] };

  // Top band left of the warp chip / tower badge, over the AP pill and axes row, above the subtitles (Aaron, HUD4).
  let lay = '', layT = 0;
  function layout(force) {
    const W = innerWidth, strip = rect('.krz-hud-strip');
    const T = Math.round((strip ? strip.bottom : 50) + 5);
    const band = (r) => r.top < T + 40 && r.bottom > T;
    let R = W - 10, L = 8, B = T + 92;
    for (const r of rects(['.krz-warp', '.krz-r-tower', '.krz-net'])) if (band(r) && r.left > W * 0.5) R = Math.min(R, r.left - 6);
    for (const r of rects(['.krz-score', '.krz-court', '.krz-net', '.krz-r-subs', '.krz-st-coach'], 1)) if (r.top < T + 12 && r.bottom > T && r.right < R - 160) L = Math.max(L, r.right + 6);
    for (const r of rects(['.krz-r-subs', '.krz-st-coach', '.krz-court'])) if (r.top >= T - 2 && r.left < R && r.right > L) B = Math.min(B, r.top - 4);
    const maxW = Math.min(R - L, 360), maxH = B - T;
    const k = `${W}|${T}|${R}|${maxW}|${maxH}|${tEl.textContent}|${sEl.textContent}`;
    if (!force && k === lay) return;
    lay = k;
    el.style.top = `${T}px`; el.style.right = `${Math.round(W - R)}px`; el.style.maxWidth = `${Math.floor(maxW)}px`;
    const room = maxH >= 34 && maxW >= 170;
    el.classList.toggle('cramped', !room);
    if (!room) return;
    for (const n of [3, 2, 1, 0]) { el.style.setProperty('--pr-sub', n); el.classList.toggle('nosub', !n); if (el.offsetHeight <= maxH) break; }
  }
  addEventListener('resize', () => { if (S.cur) layout(true); });

  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.querySelector('.krz-pr-x').addEventListener('click', (e) => { e.stopPropagation(); if (S.cur) { S.cd[S.cur.kind] = S.clock + DISMISS_CD; hide('dismissed'); } });

  function hide(why) {
    if (!S.cur) return;
    S.history.push({ kind: S.cur.kind, why, t: +S.clock.toFixed(1) });
    if (S.history.length > 30) S.history.shift();
    S.cur = null; S.gap = GAP;
    el.classList.remove('in');
    el.classList.toggle('done', why === 'done');
    setTimeout(() => { if (!S.cur) el.hidden = true; el.classList.remove('done'); }, why === 'done' ? 900 : 300);
    onTarget?.(null);
  }

  function show(c) {
    S.cur = c; S.t = 0; S.invalidT = 0;
    S.cd[c.kind] = S.clock + KIND_CD;
    S.history.push({ kind: c.kind, why: 'shown', t: +S.clock.toFixed(1), text: c.title });
    tEl.textContent = c.title; sEl.textContent = c.sub || '';
    el.dataset.kind = c.kind;
    el.hidden = false;
    layout(true);
    requestAnimationFrame(() => el.classList.add('in'));
    sfx.playPrompt();
  }

  // ---- candidate opportunities, most delicious first ----
  function candidates(w) {
    const out = [];
    const { atc, player, ac, end } = w;
    const airborne = !ac.onGround;
    const thr = (e) => { const rw = RUNWAYS.find((r) => r.ends.includes(e)); return rw ? threshold(rw, e) : [0, 0]; };
    const [tx, tz] = thr(end);
    const dThr = Math.hypot(ac.pos.x - tx, ac.pos.z - tz);
    if (airborne && atc) {
      const seq = atc.sequence(end) || [];
      const me = seq.indexOf('player');
      for (let k = 0; k < seq.length; k++) {
        const id = seq[k];
        if (id === 'player' || (me >= 0 && k > me)) continue;
        const st = atc.strip(id), ent = w.entOf(id);
        if (!ent || !st || (st.leg !== 'final' && st.leg !== 'base')) continue;
        if (dThr > 5000) continue;
        const who = w.nameOf(id);
        out.push({ kind: 'cut_in', title: `${who} is on ${st.leg} for ${end} — cut in ahead!`, sub: 'Get nearer the runway than them · Cut In 300 PP', target: { pos: ent.ac.pos, label: who } });
        break;
      }
    }
    if (!airborne && atc) {
      const q = atc.departureQueue() || [];
      const i = q.indexOf('player');
      const cleared = !!atc.command('player', 'clearedTakeoff');
      if (i > 0 && !cleared) out.push({ kind: 'queue', title: `You're #${i + 1} for departure — jump the queue!`, sub: `Roll onto the runway first · Pushed In ${150 * i} PP`, target: { xz: [tx, tz], label: `RWY ${end}` } });
      const waiting = ac.gs < 1.5 && !cleared && ['hold', 'takeoff'].includes(player.ap?.leg?.kind);
      if (waiting) out.push({ kind: 'noclear', title: 'The tower is making you wait. Go anyway!', sub: 'Full throttle, no clearance · Didn\'t Ask 200 PP', target: null });
    }
    if (airborne) {
      const dx = TOWER.position[0] - ac.pos.x, dz = TOWER.position[2] - ac.pos.z, d = Math.hypot(dx, dz);
      if (d < 2600 && d > 160 && ac.agl < 450) out.push({ kind: 'buzz', title: 'Buzz the tower!', sub: `Pass within 80 m below ${TOWER.height + 40} m · within 30 m of the cab doubles it`, target: { xz: [TOWER.position[0], TOWER.position[2]], y: TOWER.height, label: 'TOWER' } });
      let near = null, nd = Infinity;
      for (const e of w.traffic.list) {
        if (e.player || e.ac.onGround || e.ac.crashed) continue;
        const dd = Math.hypot(e.ac.pos.x - ac.pos.x, e.ac.pos.z - ac.pos.z, e.ac.pos.y - ac.pos.y);
        if (dd < nd) { nd = dd; near = e; }
      }
      if (near && nd < 900 && nd > 70) {
        const who = w.nameOf(w.idOf(near));
        out.push({ kind: 'formation', title: `Tuck in on ${who}'s wing`, sub: 'Stay within 40 m for 3 s · Uninvited Formation 100+ PP', target: { pos: near.ac.pos, label: who } });
      }
      const ct = TERMINAL.center;
      const dT = Math.hypot(ct[0] - ac.pos.x, ct[2] - ac.pos.z);
      if (dT < 1800 && dT > 200 && ac.agl < 300) out.push({ kind: 'terminal', title: 'Rattle the terminal windows', sub: 'Fly over the terminal below 40 m · Window Rattler 200 PP', target: { xz: [ct[0], ct[2]], y: 20, label: 'TERMINAL' } });
      for (const rw of RUNWAYS) {
        for (const e of rw.ends) {
          const [x0, z0] = threshold(rw, e), hd = runwayHeadingFor(rw, e);
          const dd = Math.hypot(ac.pos.x - x0, ac.pos.z - z0);
          if (dd < 2600 && dd > 300 && ac.agl < 220 && Math.abs(angDiff(ac.heading, hd)) < 30 && Math.abs(angDiff(hdgTo(x0 - ac.pos.x, z0 - ac.pos.z), hd)) < 25) {
            out.push({ kind: 'lowpass', title: `Royal Flypast down ${e}`, sub: 'Skim it at 1–6 m, fast, wheels off · 250 PP', target: { xz: [x0, z0], label: `RWY ${e}` } });
          }
        }
      }
      if (player.ap?.leg?.kind === 'approach' && ac.agl < 320 && ac.agl > 40) {
        // MAP: the airport's parallel taxiway (C-Tower 1: A), the point on it abeam the plane, 100 m in from either end
        const tw = TAXIWAYS.find((t) => t.id === PARALLEL);
        if (tw) {
          const [a, b] = tw.points, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
          const s = Math.max(100, Math.min(L - 100, (ac.pos.x - a[0]) * ux + (ac.pos.z - a[1]) * uz));
          out.push({ kind: 'oddland', title: 'Feeling naughty? Land on the taxiway', sub: `Touch down on taxiway ${PARALLEL} beside the runway · 400 PP`, target: { xz: [a[0] + ux * s, a[1] + uz * s], label: `TAXIWAY ${PARALLEL}` } });
        }
      }
    }
    const seen = new Set();
    return out.filter((c) => !seen.has(c.kind) && seen.add(c.kind));
  }

  function targetPos(t, out) {
    if (!t) return null;
    if (t.pos) { out.x = t.pos.x; out.y = t.pos.y; out.z = t.pos.z; }
    else { out.x = t.xz[0]; out.y = t.y ?? 0; out.z = t.xz[1]; }
    return out;
  }
  const tp = { x: 0, y: 0, z: 0 };

  const api = {
    el,
    // w = { atc, traffic, player, ac, end, idOf, entOf, nameOf, camera, blocked }
    update(dt, w) {
      S.clock += dt;
      const off = getSettings?.().hints === false;
      if (off || !w || !w.player || w.blocked || held?.()) {
        if (S.cur) hide(off ? 'off' : 'blocked');
        S.gap = Math.max(S.gap, 2);
        return;
      }
      if (S.cur) {
        S.t += dt;
        if ((S.evalT -= dt) <= 0) {
          S.evalT = 0.5;
          const still = candidates(w).find((c) => c.kind === S.cur.kind);
          if (still) { S.cur.target = still.target; if (still.title !== S.cur.title) { S.cur.title = still.title; tEl.textContent = still.title; } S.invalidT = 0; }
          else S.invalidT += 0.5;
        }
        if (S.t > SHOW || S.invalidT > 1.5) { hide(S.t > SHOW ? 'timeout' : 'gone'); return; }
        if ((layT -= dt) <= 0) { layT = 0.25; layout(); }
        const p = targetPos(S.cur.target, tp);
        if (p && w.camera) {
          const cam = w.camera.position, dx = p.x - cam.x, dz = p.z - cam.z;
          const camHdg = w.camHeading ?? w.ac.heading;
          const rel = angDiff(hdgTo(dx, dz), camHdg);
          arrow.style.transform = `rotate(${rel.toFixed(0)}deg)`;
          arrow.hidden = false;
          const d = Math.hypot(p.x - w.ac.pos.x, p.z - w.ac.pos.z);
          const ds = fmtDist(d);
          if (dEl.textContent !== ds) dEl.textContent = ds;
          onTarget?.({ worldPos: [p.x, p.y, p.z], label: S.cur.target.label, kind: S.cur.kind });
        } else { arrow.hidden = true; dEl.textContent = ''; onTarget?.(null); }
        return;
      }
      if ((S.gap -= dt) > 0) return;
      if ((S.evalT -= dt) > 0) return;
      S.evalT = 0.5;
      const c = candidates(w).find((x) => !(S.cd[x.kind] > S.clock));
      if (c) show(c);
    },
    // An infraction happened: if it is what we suggested, celebrate and back off that kind.
    satisfied(id) {
      const kind = SATISFIES[id];
      if (!kind) return;
      S.cd[kind] = S.clock + DONE_CD;
      if (S.cur?.kind === kind) hide('done');
    },
    reset() { if (S.cur) hide('reset'); S.cd = {}; S.gap = 6; S.clock = 0; },
    get state() { return { current: S.cur && { kind: S.cur.kind, title: S.cur.title, sub: S.cur.sub, t: +S.t.toFixed(1), cramped: el.classList.contains('cramped') }, gap: +S.gap.toFixed(1), history: S.history.slice() }; },
  };
  return api;
}
