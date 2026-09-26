// First-session coaching: one non-blocking hint pill at a time plus a pulse on the control it names.
// Each lesson shows once (persisted in sim.state.flags.coach) and clears itself when the player does the thing.
const FONT = "'Rajdhani', system-ui, sans-serif";
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const LESSONS = {
  move: { t: touch ? 'Drag the LEFT side to walk' : 'WASD to walk', s: 'or tap the ground to move there', pulse: touch ? '.hf-joyzone' : null },
  look: { t: touch ? 'Drag the RIGHT side to look around' : 'Right-drag or Q / E to look around', s: touch ? 'pinch to zoom · ⟲ resets the view' : 'mouse wheel zooms · ⟲ resets the view' },
  interact: { t: 'Tap the glowing button to interact', s: 'pick up, deliver, talk', pulse: '.hf-interact' },
  attack: { t: 'Tap ATTACK', s: 'the baton locks on to the nearest enemy · hold to keep swinging', pulse: '.hf-attack' },
  dodge: { t: 'Tap DODGE to roll', s: 'you can\'t be hit mid-roll', pulse: '.hf-dodge' },
  skill: { t: 'Skill 1: ZAP', s: 'a ranged shot · skills cost energy', pulse: '.hf-skill.s0' },
  board: { t: 'Tap CONTRACTS for your next job', s: 'top right · or visit Mara\'s kiosk', pulse: '.hf-menu [data-evt="contracts"]' },
  warehouse: { t: 'New gear! Open the WAREHOUSE', s: 'equip, compare and tune parts from anywhere', pulse: '.hf-menu [data-evt="warehouse"]' },
};

export function createCoach(G, { ui, rig, player }) {
  const style = document.createElement('style');
  style.textContent = `
  .hf-coach{position:fixed;left:50%;top:calc(92px + env(safe-area-inset-top));transform:translate(-50%,-6px);z-index:13;pointer-events:none;
    padding:7px 16px 8px;border-radius:999px;background:linear-gradient(180deg,rgba(40,30,10,.86),rgba(20,14,4,.9));
    border:1px solid rgba(255,210,122,.6);box-shadow:0 0 22px rgba(255,190,90,.25);color:#fff4dc;font:700 15px/1.2 ${FONT};
    letter-spacing:.03em;text-align:center;white-space:nowrap;max-width:92vw;opacity:0;transition:opacity .3s,transform .3s}
  .hf-coach.on{opacity:1;transform:translate(-50%,0)}
  .hf-coach small{display:block;font-weight:500;font-size:12px;color:#e8cf9c;letter-spacing:.04em}
  .hf-coach-ring{position:fixed;z-index:14;pointer-events:none;border:3px solid rgba(255,222,140,1);border-radius:999px;display:none;
    box-shadow:0 0 16px 2px rgba(255,200,100,.85),inset 0 0 12px rgba(255,200,100,.5);animation:hf-coachp 1.2s ease-in-out infinite;will-change:transform,opacity}
  .hf-coach-ring.big{border-radius:28px;animation-duration:1.8s}
  @keyframes hf-coachp{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.14);opacity:.45}}`;
  document.head.append(style);
  const el = document.createElement('div');
  el.className = 'hf-coach';
  const ring = document.createElement('div');
  ring.className = 'hf-coach-ring';
  document.body.append(el, ring);

  const C = { cur: null, shownT: 0, pending: new Set(), hits: 0, travelled: 0, last: null, yaw0: null, zoom0: null, gap: 0, pulsed: null, suppressed: false };
  const done = () => (G.sim.state.flags.coach ||= {});
  const isDone = (k) => !!done()[k];

  function finish(k) {
    if (!G.sim || isDone(k)) return;
    done()[k] = 1;
    C.pending.delete(k);
    if (C.cur === k) hide();
    if (k === 'warehouse') ui?.hud.badge('warehouse', 0);
  }
  function want(k) { if (G.sim && !isDone(k)) C.pending.add(k); }
  // a separate ring over the target (transform/opacity only, so it never repaints the target or the canvas)
  function setPulse(sel) { C.pulsed = sel ? document.querySelector(sel) : null; C.ringT = 0; placeRing(); }
  function placeRing() {
    const r = C.pulsed?.getBoundingClientRect();
    if (!r || !r.width) { ring.style.display = 'none'; return; }
    const big = r.width > 120, pad = big ? -10 : 4, w = big ? Math.min(r.width, 200) : r.width, hgt = big ? Math.min(r.height, 200) : r.height;
    const x = big ? r.left + r.width * 0.35 - w / 2 : r.left, y = big ? r.top + r.height * 0.6 - hgt / 2 : r.top;
    ring.classList.toggle('big', big);
    Object.assign(ring.style, { display: 'block', left: `${x - pad}px`, top: `${y - pad}px`, width: `${w + pad * 2}px`, height: `${hgt + pad * 2}px` });
  }
  function show(k) {
    const L = LESSONS[k];
    C.cur = k; C.shownT = 0;
    el.innerHTML = `${L.t}<small>${L.s}</small>`;
    el.classList.add('on');
    setPulse(L.pulse);
  }
  function hide() { C.cur = null; C.gap = 1.2; el.classList.remove('on'); setPulse(null); }

  // lessons in priority order; a lesson waits for its moment and for quiet (no dialogue, panel, card or screen; barks are fine)
  const ORDER = ['attack', 'dodge', 'interact', 'move', 'look', 'skill', 'warehouse', 'board'];
  const ready = {
    move: () => true,
    look: () => isDone('move') && C.travelled > 8,
    interact: () => !!G.lastInteract && G.lastInteract !== 'Contracts',
    attack: () => G.fighting,
    dodge: () => G.fighting && C.hits >= 1 && isDone('attack'),
    skill: () => G.fighting && isDone('attack') && (G.kills || 0) >= 1 && G.sim.playerCombatant().energy >= 20,
    warehouse: () => !G.fighting && !G.runner?.active?.step?.type?.startsWith('kill'),
    board: () => !G.fighting && !G.sim.state.contract && G.contractsDone >= 1 && isDone('warehouse'),
  };

  function update(dt) {
    if (!G.sim || G.state === 'intro' || G.state === 'title') return;
    const P = player.pos;
    if (C.last) C.travelled += Math.hypot(P.x - C.last.x, P.z - C.last.z);
    C.last = { x: P.x, z: P.z };
    if (C.travelled > 4) finish('move');
    if (isDone('move') && C.yaw0 === null) { C.yaw0 = rig.yaw; C.zoom0 = rig.zoom; }
    if (C.yaw0 !== null && (Math.abs(rig.yaw - C.yaw0) > 0.35 || Math.abs(rig.zoom - C.zoom0) > 0.08 || Math.abs(rig.pitchOff || 0) > 4)) finish('look');

    const quiet = G.state === 'free' && !ui?.panel.current && !ui?.dialogue.open && !G.overlay.cardOpen;
    // after a results card / death / intro, let the banners and toasts clear before coaching
    if (G.state !== 'free') C.gap = Math.max(C.gap, G.state === 'results' ? 3.5 : 1.5);
    if (quiet !== !C.suppressed) { C.suppressed = !quiet; el.style.visibility = quiet ? '' : 'hidden'; if (!quiet) setPulse(null); else if (C.cur) setPulse(LESSONS[C.cur].pulse); }
    if (!quiet) return;
    if (C.cur) {
      C.shownT += dt;
      if ((C.ringT -= dt) <= 0) { C.ringT = 0.5; placeRing(); }
      // context lessons vanish with their context; the rest time out so they never nag
      const k = C.cur;
      const gone = (k === 'interact' && !G.lastInteract) || ((k === 'attack' || k === 'dodge' || k === 'skill') && !G.fighting);
      const limit = k === 'move' ? 40 : k === 'warehouse' ? 30 : 14;
      if (gone || C.shownT > limit) { if (C.shownT > limit && k !== 'move') finish(k); hide(); }
      return;
    }
    if ((C.gap -= dt) > 0) return;
    for (const k of ORDER) {
      if (isDone(k)) continue;
      if ((k === 'warehouse' || k === 'board') && !C.pending.has(k)) continue;
      if (ready[k]()) { show(k); return; }
    }
  }

  return {
    update,
    finish,
    want,
    playerHit() { C.hits++; },
    lootItem() { if (!isDone('warehouse')) { want('warehouse'); ui?.hud.badge('warehouse', 1); } },
    contractDone() { want('board'); },
    get current() { return C.cur; },
  };
}
