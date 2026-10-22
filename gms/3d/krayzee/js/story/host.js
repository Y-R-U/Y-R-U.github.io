// Story ↔ game adapter. Everything goes through window.__game (main.js) and the objects it exposes, so the story
// modules need no edits to main.js beyond calling them. Every call is guarded: story must never break the flying.
import { planLandAhead } from '../assist/landahead.js';
import * as layout from '../world/layout.js';
import { RIVALS } from '../../data/story.js';

const KT = 0.514444;
const safe = (f, d) => { try { return f(); } catch (e) { console.warn('[story]', e); return d; } };

export function createHost(G, o = {}) {
  const H = { G };
  const ent = () => G.S?.player || null;
  const traffic = () => G.traffic;
  const wiring = () => G.wiring;
  H.player = ent;
  H.difficulty = () => o.difficulty || wiring()?.difficulty || 'easy';
  H.career = () => wiring()?.game?.career || null;
  H.game = () => wiring()?.game || null;
  H.activeEnd = () => safe(() => wiring().activeEnd(), '27') || '27';

  H.snap = () => {
    const P = ent();
    if (!P) return null;
    const ac = P.ac, ap = P.ap, axis = P.axis;
    const finEl = document.querySelector('.krz-finish');
    return {
      x: ac.pos.x, y: ac.pos.y, z: ac.pos.z, alt: ac.alt, agl: ac.agl, heading: ac.heading, speedKt: ac.speed / KT, gsKt: ac.gs / KT,
      onGround: ac.onGround, surface: ac.surface, crashed: ac.crashed,
      apMode: traffic().modeOf(P), stick: ['aileron', 'elevator', 'rudder'].some((k) => axis[k].mode === 'manual'),
      leg: ap?.leg?.kind || null, legIndex: ap?.i ?? -1, sub: ap?.sub, phase: ap?.phase, landing: !!ap?.landing, demanded: !!ap?.demand,
      canDemandTakeoff: !!document.querySelector('.krz-gbtn-to:not([hidden])') || (!!ap?.demandTakeoff && !document.querySelector('.krz-gbtn-to')),
      finishState: finEl ? finEl.dataset.state || (finEl.hidden ? 'hidden' : null) : null,
      radioWindow: !!document.querySelector('.krz-r-panel:not([hidden])'),
      paused: !!G.S?.paused,
    };
  };

  // type: 'pp' | 'finished' | 'banked' | 'scandal' | 'loss' (score) · 'barked' | 'window' | 'line' (radio). Returns off().
  H.on = (type, fn) => {
    const radioTypes = ['barked', 'window', 'line'];
    const src = radioTypes.includes(type) ? wiring()?.radio : wiring()?.game;
    return safe(() => src?.on(type, fn), null) || (() => {});
  };

  H.placeAtStand = (stand, heading = 180) => safe(() => {
    const P = ent(); if (!P) return false;
    const T = traffic();
    const busy = (s) => T.list.some((e) => e !== P && Math.hypot(e.ac.pos.x - s.position[0], e.ac.pos.z - s.position[2]) < 25);
    const want = layout.STANDS.find((x) => x.id === stand) || layout.STANDS[5];
    const s = busy(want) ? [...layout.STANDS].sort((a, b) => Math.abs(a.position[0] - want.position[0]) - Math.abs(b.position[0] - want.position[0])).find((x) => !busy(x)) || want : want;
    P.ac.place({ x: s.position[0], z: s.position[2], heading }, T.env);
    T.standOwner?.set(s.id, P.ac);
    for (const k of Object.keys(P.axis)) { P.axis[k].mode = 'auto'; P.manual[k] = null; }
    G.release?.();
    return s.id;
  }, false);

  H.setRoute = (route, start = 0) => safe(() => { const P = ent(); P?.ap?.setRoute(route, { start }); }, null);
  H.taxiTo = (stand) => safe(() => {
    const P = ent(); if (!P?.ap) return;
    P.ap.landing = null; P.ap._landPrev = null;
    P.ap.setRoute({ name: 'to stand', legs: [{ kind: 'taxi', dest: { stand }, label: 'TAXI IN' }, { kind: 'park', seconds: 9999, label: 'PARKED' }], loop: null });
  });

  // LAND assist (D13) when the host has no LAND button of its own: ASSIST's planner → TRAFFIC's ap.landAt.
  H.requestLand = () => safe(() => {
    const P = ent(); if (!P?.ap) return { fail: 'noPlayer' };
    if (o.requestLand) return o.requestLand();
    const ac = P.ac;
    const plan = planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.pos.y, world: G.world || traffic().env, layout, onGround: ac.onGround });
    if (plan.fail) return plan;
    P.ap.landAt(plan);
    return plan;
  }, { fail: 'error' });

  H.demand = () => safe(() => { const b = document.querySelector('.krz-finish'); if (b && !b.hidden) { b.click(); return true; } return false; }, false);

  // A rival (Lord Rupert) speaks to the player: opens RADIO's "Insulted" response window.
  H.rivalBark = (intent = 'insult', who = 'rupert') => safe(() => {
    const radio = wiring()?.radio; if (!radio) return false;
    const m = RIVALS.members.find((x) => x.id === who) || RIVALS.members[0];
    const [title, ...rest] = m.name.split(' ');
    radio.registerPilot({ id: m.id, name: rest.join(' '), title, voice: m.voice, color: RIVALS.livery.primary, rival: true, registration: 'K-POMF' });
    radio.handleEvent({ type: 'bark', actor: m.id, intent, target: 'player' });
    return true;
  }, false);

  H.setTowerVoice = (voice) => safe(() => wiring()?.radio?.setTower({ voice }));
  return H;
}
