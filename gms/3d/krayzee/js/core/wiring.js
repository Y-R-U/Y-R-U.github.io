// Gameplay services around the flight core: ATC (js/atc), radio (js/radio), score + career (js/game).
// Every call is guarded: a failing service must never take the flying down with it.
import { createATC } from '../atc/index.js';
import { linkTraffic } from '../atc/bridge.js';
import { createRadio, PILOT_VOICES } from '../radio/index.js';
import { createGame } from '../game/index.js';
import { RANKS } from '../../data/ranks.js';
import { STANDS } from '../world/layout.js';
import { KT } from '../flight/vmath.js';

const safe = (f, fallback) => { try { return f(); } catch (e) { console.warn('[krayzee]', e); return fallback; } };

export function createWiring({ ui, audio, world, traffic, hud, career, log }) {
  const W = { atc: null, link: null, radio: null, game: null };
  const off = [];

  W.atc = safe(() => createATC({ wind: world.wind, surfaceAt: world.surfaceAt, detectCollisions: false }), null);
  if (W.atc) W.link = safe(() => linkTraffic(W.atc, traffic, { playerId: 'player' }), null);

  const playerEnt = () => traffic.list.find((e) => e.player);
  const contextOf = () => {
    const p = playerEnt();
    if (!p) return { phase: 'air' };
    const l = p.ap?.leg, ac = p.ac;
    let phase = 'air';
    if (ac.onGround) phase = l?.kind === 'park' ? 'stand' : l?.kind === 'hold' || /HOLD/.test(p.ap?.phase) ? 'hold' : l?.kind === 'approach' ? 'landed' : 'taxi';
    let nearest = null, nd = Infinity;
    for (const e of traffic.list) {
      if (e === p) continue;
      const d = Math.hypot(e.ac.pos.x - ac.pos.x, e.ac.pos.z - ac.pos.z);
      if (d < nd) { nd = d; nearest = idOf(e); }
    }
    return { phase, nearest, runway: l?.end || '09' };
  };
  const idOf = (e) => (W.link ? W.link.idOf(e) : e.player ? 'player' : e.ac.id);

  W.radio = safe(() => createRadio({ audio, profile: radioProfile(), getContext: contextOf, chatter: 'normal' }), null);
  if (W.radio) {
    safe(() => W.radio.setTower({ voice: 'tower_m' }));
    safe(() => W.radio.setVisible(false));
    if (W.atc) W.atc.on('radio', (ev) => safe(() => W.radio.handleEvent(ev)));
  }

  function radioProfile() {
    const p = ui.getProfile();
    return { ...p, title: p.flightTitle || p.title };
  }

  // ----- AI pilots -----
  W.addAI = (ent) => safe(() => {
    const id = idOf(ent);
    const used = new Set([ui.getProfile().voice]);
    const voice = PILOT_VOICES.filter((v) => !used.has(v))[Math.floor(Math.random() * (PILOT_VOICES.length - 1))] || 'bubba';
    const rank = RANKS[Math.min(RANKS.length - 2, Math.floor(Math.random() ** 2 * 6))];
    const lv = ent.rig?.livery?.() || {};
    const female = Math.random() < 0.45;
    W.radio?.registerPilot({ id, name: lv.name || ent.name, title: female ? rank.f : rank.m, voice, color: lv.primary, registration: lv.registration || ent.name });
    W.game?.setPilotRank?.(id, RANKS.indexOf(rank));
    ent.rankIndex = RANKS.indexOf(rank);
  });
  W.removeAI = (ent) => safe(() => { const id = idOf(ent); W.radio?.removePilot(id); W.atc?.remove(id); });

  // ----- contacts (both aircraft) -----
  traffic.onContact = (ev) => safe(() => {
    const actor = ev.a.player ? ev.a : ev.b.player ? ev.b : ev.a;
    const victim = actor === ev.a ? ev.b : ev.a;
    W.atc?.report('collision', idOf(actor), { victim: idOf(victim), severity: ev.relSpeed });
  });

  // ----- play session -----
  W.startPlay = (mode, ent) => safe(() => {
    const p = ui.getProfile();
    W.radio?.setPlayer(radioProfile());
    W.radio?.setVisible(true);
    W.game = createGame({ mode, career, playerId: 'player', name: p.name, gender: p.gender });
    const g = W.game;
    for (const e of traffic.list) if (!e.player && e.rankIndex != null) g.setPilotRank?.(idOf(e), e.rankIndex);
    if (W.atc) {
      off.push(W.atc.on('event', (e) => safe(() => g.handleEvent(e))));
      off.push(W.atc.on('scandal', (e) => safe(() => g.handleEvent(e))));
      off.push(W.atc.on('composure', (e) => safe(() => g.handleEvent(e))));
      g.on('outrageDelta', (d) => safe(() => W.atc.addOutrage(d.amount, 'player')));
    }
    if (W.radio) off.push(W.radio.on?.('barked', (b) => safe(() => g.handleEvent({ type: 'barked', ...b }))));
    g.on('pp', (e) => { if (e.amount > 0) hud.flash(e.text || `+${Math.round(e.amount)} PP`, 'good', 1.8); log?.('pp', e); });
    g.on('loss', (e) => hud.flash(e.text || `−${Math.round(e.amount)} PP`, 'warn', 2));
    g.on('banked', (e) => { hud.flash(e.text || `BANKED ${e.amount}`, 'good', 2.5); log?.('banked', e); });
    g.on('rankUp', (e) => { hud.flash(e.text || 'PROMOTED!', 'good', 4); safe(() => ui.refreshProfile?.()); safe(() => W.radio?.setPlayer(radioProfile())); });
    ent.ac.impactHandler = (i) => {
      const r = g.reportImpact({ speedKt: i.speedKt, onGear: i.onGear, other: i.other });
      if (r?.shake) hud.shake?.(r.shake);
      if (r?.result === 'bounce') safe(() => audio.playBoing(Math.min(1, i.speedKt / 60)));
      W.lastImpact = r;
      return r;
    };
  });

  W.endPlay = () => {
    for (const f of off.splice(0)) safe(() => f?.());
    W.game = null;
    safe(() => W.radio?.setVisible(false));
  };

  W.refreshProfile = () => safe(() => W.radio?.setPlayer(radioProfile()));

  // per frame, game time
  W.update = (dt, P) => {
    if (W.link) safe(() => W.link.update(dt));
    if (W.radio) safe(() => W.radio.update(dt));
    if (W.game && P) safe(() => {
      const ac = P.ac;
      const atStand = ac.onGround && STANDS.some((s) => Math.hypot(ac.pos.x - s.position[0], ac.pos.z - s.position[2]) < 12);
      W.game.update(dt, { gsKt: ac.gs / KT, onGround: ac.onGround, surface: ac.surface, atStand, calm: P.ap && !P.ap.overridden });
    });
  };
  W.activeEnd = () => safe(() => W.atc?.activeRunway().end, null) || '09';
  W.state = () => ({ atc: !!W.atc, radio: !!W.radio, game: W.game ? safe(() => W.game.state(), null) : null });
  return W;
}
