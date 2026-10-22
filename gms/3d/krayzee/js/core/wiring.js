// Gameplay services around the flight core: ATC (js/atc), radio (js/radio), score + career (js/game).
// Every call is guarded: a failing service must never take the flying down with it.
import { createATC } from '../atc/index.js';
import { linkTraffic } from '../atc/bridge.js';
import { createRadio, PILOT_VOICES } from '../radio/index.js';
import { createGame, difficultyFor } from '../game/index.js';
import { DIFFICULTY } from '../../data/rules.js';
import { RANKS } from '../../data/ranks.js';
import { STANDS } from '../world/layout.js';
import { KT } from '../flight/vmath.js';

const safe = (f, fallback) => { try { return f(); } catch (e) { console.warn('[krayzee]', e); return fallback; } };

export function createWiring({ ui, audio, world, traffic, hud, ghud, career, log }) {
  const W = { atc: null, link: null, radio: null, game: null, pilots: new Map(), barked: false };
  // The player's two-digit radio number (D1): never ends in 0, kept for the whole visit so the ceremony can quote it.
  W.flightNo = (() => { let n; do n = 11 + Math.floor(Math.random() * 89); while (!(n % 10)); return n; })();
  const off = [];

  W.atc = safe(() => createATC({ wind: world.wind, surfaceAt: world.surfaceAt, detectCollisions: false }), null);
  const mischiefOf = (s) => (['off', 'low', 'high'].includes(s?.aiMischief) ? s.aiMischief : 'low');
  if (W.atc) W.link = safe(() => linkTraffic(W.atc, traffic, { playerId: 'player', mischief: mischiefOf(ui.getSettings()) }), null);
  W.setMischief = (s) => safe(() => W.link?.setMischief(mischiefOf(s)));
  safe(() => traffic.setAIProtection?.('rubber'));
  if (W.atc) W.atc.on('runwayChange', (e) => safe(() => hud.flash?.(`RUNWAY CHANGE · NOW ${e.to}`, 'info', 3)));

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
    return { phase, nearest, runway: safe(() => p.ap?.status().end, null) || W.activeEnd?.() || '09' };
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
    return { ...p, title: p.flightTitle || p.title, flightNo: W.flightNo };
  }

  // ----- AI pilots -----
  W.addAI = (ent) => safe(() => {
    const id = idOf(ent);
    const used = new Set([ui.getProfile().voice]);
    const voice = PILOT_VOICES.filter((v) => !used.has(v))[Math.floor(Math.random() * (PILOT_VOICES.length - 1))] || 'bubba';
    const rank = RANKS[Math.min(RANKS.length - 2, Math.floor(Math.random() ** 2 * 6))];
    const lv = ent.rig?.livery?.() || {};
    const female = Math.random() < 0.45;
    const reg = String(lv.registration || ent.name || '').replace(/^K-/, '');
    const pname = lv.name || (reg ? reg[0] + reg.slice(1).toLowerCase() : 'Nobody');
    W.radio?.registerPilot({ id, name: pname, title: female ? rank.f : rank.m, voice, color: lv.primary, registration: lv.registration || ent.name });
    W.pilots.set(id, { title: female ? rank.f : rank.m, name: pname });
    W.game?.setPilotRank?.(id, RANKS.indexOf(rank));
    ent.rankIndex = RANKS.indexOf(rank);
  });
  W.removeAI = (ent) => safe(() => { const id = idOf(ent); W.radio?.removePilot(id); W.atc?.remove(id); W.pilots.delete(id); });
  W.idOf = idOf;
  W.entOf = (id) => traffic.list.find((e) => idOf(e) === id) || null;
  W.nameOf = (id) => { const p = W.pilots.get(id); return p ? `${p.title} ${p.name}` : W.entOf(id)?.name || 'Someone'; };

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
    // D19: Free Flight difficulty (settings) → protection; DEMAND IT is the finish, a 15 s stop is only the fallback.
    W.difficulty = difficultyFor({ difficulty: ui.getSettings().difficulty });
    const protection = DIFFICULTY[W.difficulty]?.protection || 'rubber';
    safe(() => traffic.setAIProtection?.(protection === 'realistic' ? null : protection));
    W.game = createGame({ mode, career, playerId: 'player', name: p.name, gender: p.gender, protection, autoBank: mode === 'free' ? 15 : false });
    const g = W.game;
    for (const e of traffic.list) if (!e.player && e.rankIndex != null) g.setPilotRank?.(idOf(e), e.rankIndex);
    if (W.atc) {
      off.push(W.atc.on('event', (e) => safe(() => g.handleEvent(e))));
      // STORY tuning: a Royal Scandal in the tutorial / a beginner's first flights wiped their PP. Easy+Medium story and
      // careers under 1,500 PP get a warning instead: the tower calms down a little and nothing is forfeited.
      W.scandalGrace = mode === 'story' ? W.difficulty !== 'hard' : mode === 'free' && (career?.lifetimePP ?? 0) < 1500;
      off.push(W.atc.on('scandal', (e) => safe(() => {
        if (!W.scandalGrace) return g.handleEvent(e);
        W.atc.addOutrage?.(-35, 'player');
        hud.flash?.('THE PRESS ARE SNIFFING ABOUT · STEADY ON', 'warn', 3);
      })));
      off.push(W.atc.on('composure', (e) => safe(() => g.handleEvent(e))));
      g.on('outrageDelta', (d) => safe(() => W.atc.addOutrage(d.amount, 'player')));
    }
    W.barked = false; W.banked = false;
    if (W.radio) off.push(W.radio.on?.('barked', (b) => { W.barked = true; safe(() => g.handleEvent({ type: 'barked', ...b })); }));
    safe(() => ghud?.score.attach(g, { flightNo: W.flightNo, gender: p.gender, name: p.name }));
    g.on('pp', (e) => { log?.('pp', e); safe(() => ghud?.prompts.satisfied(e.id)); });
    g.on('loss', (e) => log?.('loss', e));
    g.on('banked', (e) => { W.banked = true; log?.('banked', e); });
    g.on('finished', (e) => log?.('finished', e));
    g.on('scandal', (e) => log?.('scandal', e));
    g.on('rankUp', (e) => {
      log?.('rankUp', { to: e.to, title: e.title });
      safe(() => ui.refreshProfile?.());
      safe(() => W.radio?.setPlayer(radioProfile()));
      safe(() => ghud?.score.setContext({ gender: ui.getProfile().gender }));
    });
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
    safe(() => ghud?.score.detach());
    W.game = null;
    safe(() => W.radio?.setVisible(false));
    safe(() => traffic.setAIProtection?.('rubber'));
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
