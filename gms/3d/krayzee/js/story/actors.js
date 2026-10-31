// Story missions 2+: extra host calls (rival planes, airborne starts, fuel, story radio lines, ATC reports).
// Kept apart from host.js so the shared adapter stays small; createStory() merges these onto the host object.
import { Aircraft } from '../flight/aircraft.js';
import { Autopilot } from '../flight/autopilot.js';
import { RIVALS } from '../../data/story.js';
import { onRunway } from '../flight/routes.js';

const KT = 0.514444;
const safe = (f, d) => { try { return f(); } catch (e) { console.warn('[story]', e); return d; } };

/** o: { scene, createPlane, prepareRig, quality } (createStory's opts) */
export function extendHost(H, G, o = {}) {
  const T = () => G.traffic;
  const W = () => G.wiring;
  const mine = new Set();

  // A named rival (data/story.js RIVALS) or a nameless queue-filler. Not in attract's list, so attract never recycles it.
  H.spawn = async ({ id, who = null, type = 'c172', livery = null, place, route, noAvoid = false, gate = null, rankIndex = 4 }) => {
    const createPlane = o.createPlane, scene = o.scene || G.S?.player?.rig.root.parent;
    if (!createPlane || !scene) return null;
    const m = who ? RIVALS.members.find((x) => x.id === who) : null;
    const lv = livery || (m ? { name: m.name.split(' ')[1], company: RIVALS.house, ...RIVALS.livery, registration: 'K-POMF' } : null);
    const rig = await createPlane({ type, livery: lv, quality: 'low', cockpit: false });
    rig.setView?.('chase');
    rig.root.traverse((x) => { if (x.isMesh) x.castShadow = true; });
    safe(() => o.prepareRig?.(rig));
    const ac = new Aircraft({ id: id || who, type, dims: rig.dims });
    const ap = new Autopilot(ac);
    ac.place(place, T().env);
    scene.add(rig.root);
    const ent = T().add({ aircraft: ac, ap, rig, name: lv?.registration || id });
    ent.story = true; ent.rival = !!m; ent.type = type;
    if (noAvoid) ap.noAvoid = true;
    if (gate) { ap.gate = gate; ap.__atcGate = true; }
    ap.setRoute(route);
    mine.add(ent);
    safe(() => {
      const w = W(), wid = w.idOf(ent);
      w.addAI(ent);
      if (m) {
        const [title, ...rest] = m.name.split(' ');
        w.radio?.registerPilot({ id: wid, name: rest.join(' '), title, voice: m.voice, color: RIVALS.livery.primary, rival: true, registration: lv.registration });
        w.pilots.set(wid, { title, name: rest[0] });
      }
      w.game?.setPilotRank?.(wid, rankIndex);
      w.link?.placed(ent, 3);
    });
    return ent;
  };

  H.despawn = (ent) => safe(() => {
    if (!ent || !mine.has(ent)) return;
    mine.delete(ent);
    W()?.removeAI(ent);
    T().remove(ent);
    ent.rig.root.parent?.remove(ent.rig.root);
    ent.rig.dispose();
  });
  H.despawnAll = () => { for (const e of [...mine]) H.despawn(e); };
  H.spawned = () => [...mine];

  // Background (attract) traffic that would spoil a set piece: sent off-stage so attract despawns and replaces it later.
  H.clearTraffic = (pred = () => true) => safe(() => {
    let n = 0;
    for (const e of T().list) {
      if (e.player || e.remote || mine.has(e) || !e.ap || !pred(e)) continue;
      e.ap.setRoute({ name: 'story-clear', legs: [{ kind: 'despawn' }], loop: null });
      n++;
    }
    return n;
  }, 0);

  // Story pacing: arrivals that would land on top of the player are sent round (near) or off-stage (far).
  H.clearArrivals = () => safe(() => {
    const P = H.player(); if (!P) return 0;
    let n = 0;
    for (const e of T().list) {
      if (e.player || e.remote || mine.has(e) || !e.ap) continue;
      if (e.ac.onGround) {
        // departures: hold them short; one already sitting on the runway (lined up) goes away
        const k = e.ap.leg?.kind;
        if (k === 'takeoff' && e.ac.gs < 8 && onRunway(e.ac.pos.x, e.ac.pos.z)) { e.ap.setRoute({ name: 'story-clear', legs: [{ kind: 'despawn' }], loop: null }); n++; }
        else if (k === 'takeoff' || k === 'hold') e.ap.holdPosition?.('story', 90);
        continue;
      }
      const near = Math.hypot(e.ac.pos.x - P.ac.pos.x, e.ac.pos.z - P.ac.pos.z) < 900;
      if (!near) { e.ap.setRoute({ name: 'story-clear', legs: [{ kind: 'despawn' }], loop: null }); n++; }
      else if (e.ap.leg?.kind === 'approach') { e.ap.goAround?.('story'); n++; }
    }
    return n;
  }, 0);

  // Airborne start: { x, z, alt, heading, speedKt, throttle?, flaps? }
  H.placeAir = (p) => safe(() => {
    const P = H.player(); if (!P) return false;
    for (const k of Object.keys(P.axis)) { P.axis[k].mode = 'auto'; P.manual[k] = null; }
    G.release?.();
    if (G.teleport) G.teleport(p);
    else { P.ac.place({ x: p.x, z: p.z, alt: p.alt, heading: p.heading, speed: (p.speedKt || 0) * KT, throttle: p.throttle }, T().env); W()?.link?.placed(P, 8); }
    return true;
  }, false);
  H.placeGround = ({ x, z, heading }) => safe(() => {
    const P = H.player(); if (!P) return false;
    for (const k of Object.keys(P.axis)) { P.axis[k].mode = 'auto'; P.manual[k] = null; }
    G.release?.();
    P.ac.place({ x, z, heading }, T().env);
    W()?.link?.placed(P, 6);
    return true;
  }, false);

  // D20: fraction 0..1 of both tanks; burn = fuel burn multiplier (1 = real). Returns the previous { fraction, burn }.
  H.fuel = (fraction = null, burn = null) => safe(() => {
    const ac = H.player()?.ac; if (!ac?.fuel) return null;
    const prev = { fraction: ac.fuelFraction, burn: ac.fuelBurnScale ?? 1 };
    if (fraction != null) { ac.fuel.L = ac.fuel.R = ac.fuel.cap * fraction; ac.fuel.lowSent = false; if (fraction > 0) ac.engineOut = false; }
    if (burn != null) ac.fuelBurnScale = burn;
    return prev;
  }, null);

  // hand a latched throttle lever back to the autopilot (the lever's AUTO detent)
  H.autoThrottle = () => safe(() => { const P = H.player(), t = T(); if (!P) return; (t.autoThrottle || t.releaseThrottle)?.call(t, P); });
  H.skipToRunway = () => safe(() => { const P = H.player(); if (!P?.ap) return false; P.ap.landing = null; P.ap._landPrev = null; return W()?.link?.skipToRunway ? W().link.skipToRunway(P) : P.ap.skipToRunway(H.activeEnd()); }, false);
  H.demandTakeoff = () => safe(() => { const P = H.player(); if (!P?.ap) return false; return W()?.link?.demandTakeoff ? W().link.demandTakeoff(P) : P.ap.demandTakeoff(); }, false);
  H.fuelLeft = () => safe(() => H.player()?.ac.fuelFraction ?? null, null);
  H.cancelLand = () => safe(() => { const ap = H.player()?.ap; if (ap?.landing) ap.cancelLand(); });

  H.throttle = () => safe(() => { const P = H.player(); const a = P?.axis.throttle; return a ? { mode: a.mode, val: a.val, ctl: P.ac.ctl.throttle } : null; }, null);

  H.atcReport = (type, extra) => safe(() => W()?.atc?.report(type, 'player', extra), null);
  H.idOf = (ent) => safe(() => W().idOf(ent), null);

  // Story radio lines (data/story/lines.js): loaded into RADIO's bank once, then said like any bark.
  const loaded = new Set();
  H.addLines = (lines, base) => safe(() => {
    const radio = W()?.radio; if (!radio?.bank) return false;
    const fresh = lines.filter((l) => !loaded.has(l.id));
    if (!fresh.length) return true;
    radio.bank.load(fresh.map((l) => ({ id: l.id, voice: l.voice, intent: l.id, text: l.text, callsign: l.callsign, maxSeconds: 12 })));
    // a text-only tower line works whoever is in the tower (the airport's voice may change under it: VOICE2's tower_raf)
    const TOWERS = ['tower_m', 'tower_f', 'tower_trainee', 'tower_farm', 'tower_raf'];
    radio.bank.load(fresh.filter((l) => l.textOnly && TOWERS.includes(l.voice)).flatMap((l) => TOWERS.filter((v) => v !== l.voice).map((v) => ({ id: l.id, voice: v, intent: l.id, text: l.text, callsign: l.callsign, maxSeconds: 12 }))));
    const man = {};
    // textOnly: no clip yet (subtitles only, docs/STORY.md "lines needing VO")
    for (const l of fresh) { if (!l.textOnly) (man[l.voice] ||= {})[l.id] = { file: base + l.id + '.mp3', duration: l.dur || 0 }; loaded.add(l.id); }
    radio.bank.loadManifest(man, '');
    return true;
  }, false);
  // who: 'tower' or a pilot id ('rupert'). about: whom the tower addresses (callsign splice).
  H.say = (who, id, { about = 'player', target = 'player' } = {}) => safe(() => W()?.radio?.say(who, id, who === 'tower' ? { about, target } : { target, priority: 2 }), false);
  // a rival on frequency without a plane in the sky (he rings in from the clubhouse)
  H.voiceRival = (who) => safe(() => {
    const m = RIVALS.members.find((x) => x.id === who); if (!m) return false;
    const [title, ...rest] = m.name.split(' ');
    W()?.radio?.registerPilot({ id: m.id, name: rest.join(' '), title, voice: m.voice, color: RIVALS.livery.primary, rival: true, registration: 'K-POMF' });
    return true;
  }, false);

  // STORY3: Kingdom Map trips (js/map/index.js trip) and the loaded airport
  const K = () => (typeof window !== 'undefined' ? window.__kingdom : null);
  H.airport = () => safe(() => K()?.state().airport || 'royal', 'royal');
  H.trip = (to, o) => safe(() => !!K()?.trip(to, o), false);
  H.tripTarget = () => safe(() => K()?.target(H.player()), null);
  H.tripPhase = () => safe(() => K()?.state().phase || null, null);
  H.type = () => H.player()?.ac.type || null;
  // F-35 STOVL (docs/STOVL.md): mode, and the hover's hold point (Easy: the story walks the hover over the pad)
  H.stovl = () => safe(() => H.player()?.ap?.stovlMode ?? null, null);
  H.hoverHold = (x, z) => safe(() => { const st = H.player()?.ap?.stovl; if (st?.mode !== 'hover') return false; st.hold = { x, z }; return true; }, false);
  H.verticalTakeoff = () => safe(() => !!H.player()?.ap?.verticalTakeoff({ end: H.activeEnd() }), false);

  return H;
}
