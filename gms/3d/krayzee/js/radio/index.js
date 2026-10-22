// Radio director (DESIGN §5–6): turns game events into tower/AI chatter and offers the player bark chips.
import { LineBank, fillTemplate } from './lines.js';
import { createRadioHud } from './hud.js';
import { createFallbackPlayer, estimateSeconds } from './playback.js';
import * as RULES from '../../data/rules.js';

const CFG = {
  priority: { tower: 3, player: 2, human: 2, ai: 1 }, staleAfter: 3, towerClearanceStaleAfter: 8,
  playerCooldown: 6, sameIntentCooldown: 15, responseWindow: 5, inboundWindowGap: 8,
  scoldDelay: [0.6, 1.2], scoldReplaceWithin: 4, aiChance: { complain: 0.6, insult: 0.35, rivalInsult: 0.7, routine: 1.0 },
  ...(RULES.RADIO || {}),
};
const INFRACTIONS = RULES.INFRACTIONS || {};
const TIERS = RULES.OUTRAGE?.tiers || [{ tier: 1, min: 0, name: 'Professional' }, { tier: 2, min: 25, name: 'Strained' }, { tier: 3, min: 50, name: 'Cracking' }, { tier: 4, min: 80, name: 'Meltdown' }];
export const CHATTER = { quiet: 12, normal: 6, chatty: 3 };
export const PILOT_VOICES = ['toff', 'duchess', 'bubba', 'darlene', 'wingco', 'geezer', 'sheila', 'laird', 'heiress', 'comte', 'baronin', 'tex', 'nan', 'prince', 'charmer'];
const PALETTE = ['#ff7a59', '#6ad1ff', '#b48cff', '#7be38b', '#ffb84d', '#ff6fb1', '#4de0c8', '#e9e36b'];
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];

// to: who the bark is addressed to. 'pilot' needs someone in context; 'victim' = the plane you just wronged.
export const INTENTS = {
  greeting: { label: 'Greeting', to: 'tower', icon: 'wave' },
  req_takeoff: { label: 'Request take-off', to: 'tower', icon: 'tower' },
  req_land: { label: 'Request landing', to: 'tower', icon: 'tower' },
  takeoff: { label: 'Tally-ho!', to: 'all', icon: 'plane' },
  cut_in: { label: 'Boast: cut in', to: 'victim', icon: 'star' },
  queue_jump: { label: 'Boast: pushed in', to: 'all', icon: 'star' },
  apology: { label: 'Apology (ish)', to: 'tower', icon: 'sorry' },
  insult: { label: 'Insult', to: 'pilot', icon: 'zap' },
  retort: { label: 'Retort', to: 'pilot', icon: 'chat' },
  complain: { label: 'Complain', to: 'tower', icon: 'tower' },
  priority: { label: 'Do you know who I am?', to: 'tower', icon: 'crown' },
  near_miss: { label: 'Near-miss!', to: 'pilot', icon: 'zap' },
  landing_brag: { label: 'Landing brag', to: 'all', icon: 'star' },
  go_around: { label: 'Go-around grumble', to: 'all', icon: 'chat' },
  bump: { label: 'Boing!', to: 'all', icon: 'bump' },
};
const TOWER_ROUTINE_LONG = new Set(['clear_takeoff', 'clear_land', 'taxi', 'lineup', 'hold_short', 'go_around']);
const BOAST = { cut_in_final: 'cut_in', runway_steal: 'cut_in', forced_goaround: 'cut_in', queue_jump: 'queue_jump', unauth_takeoff: 'queue_jump' };

export const EVENT_ALIASES = {
  cutIn: 'cut_in_final', cut_in: 'cut_in_final', queueJump: 'queue_jump', runwayIncursion: 'runway_steal', unauthorisedTakeoff: 'unauth_takeoff',
  unauthorizedTakeoff: 'unauth_takeoff', nearMiss: 'near_miss', bounce: 'collision', bump: 'collision', prang: 'collision', go_around: 'goAround',
  clearedToLand: 'clearance', clearedForTakeoff: 'clearance', composure: 'outrage', crown: 'crownChange',
};

// Defaults for every createRadio() call (main.js sets { deferLoad: true } before core/wiring.js builds the radio).
const DEFAULTS = {};
export function configureRadio(o = {}) { Object.assign(DEFAULTS, o); }

export function createRadio(opts = {}) {
  const o = { parent: document.body, base: '', rng: Math.random, keys: true, chatter: 'normal', getContext: () => ({}), roomTime: null, mode: 'local', deferLoad: false, ...DEFAULTS, ...opts };
  const bank = new LineBank();
  const fallback = createFallbackPlayer();
  const listeners = new Map();
  const pilots = new Map();
  const speakerFree = new Map();
  const intentFree = new Map();
  let player = null;
  let tower = { id: 'tower', voice: 'tower_m', name: 'C-Tower 1', color: '#9fb8ff' };
  let outrage = 0, tier = 1, scandal = false;
  let t = 0, gapUntil = 0, lastAi = -99, lastInbound = -99, playerFree = 0, token = 0;
  let queue = [], current = null, win = null, pendingScold = null, scheduled = [];
  let lastInteractor = null, lastCrime = null, enabled = true, voicesData = null;
  const nameTower = () => {
    const n = voicesData?.towers?.[tower.voice]?.name;
    if (n && !tower.fixedName) tower.name = `Tower \u00b7 ${n.split(' ')[0]}`;
  };

  const hud = createRadioHud(o.parent, {
    onChoose: (i) => choose(i),
    onOpenMenu: () => (win?.kind === 'menu' ? closeWindow('closed') : openMenu()),
    onClose: () => closeWindow('closed'),
  });
  hud.setComposure(0, TIERS[0].name, 0);

  const emit = (type, data) => { for (const fn of listeners.get(type) || []) try { fn(data); } catch (e) { console.error(e); } };
  const isPlayer = (id) => !!player && id === player.id;
  const speaker = (id) => (id === 'tower' ? tower : isPlayer(id) ? player : id == null || id === 'all' ? null : pilots.get(id) || autoPilot(id));
  const fullName = (p) => (!p ? '' : p === tower ? p.name : [p.title, p.name].filter(Boolean).join(' '));
  const tierOf = (v) => [...TIERS].reverse().find((x) => v >= x.min)?.tier ?? 1;
  const chatterGap = () => CHATTER[o.chatter] ?? +o.chatter ?? 6;

  function autoPilot(id) {
    const used = new Set([player?.voice, ...[...pilots.values()].map((p) => p.voice)]);
    const voice = PILOT_VOICES.find((v) => !used.has(v)) || PILOT_VOICES[pilots.size % PILOT_VOICES.length];
    return registerPilot({ id, voice, name: String(id) });
  }

  function flightNo() {
    const taken = new Set([player?.flightNo, ...[...pilots.values()].map((p) => p.flightNo)]);
    for (let i = 0; i < 200; i++) { const n = 11 + Math.floor(o.rng() * 89); if (n % 10 && !taken.has(n)) return n; }
    return 42;
  }

  function registerPilot(p) {
    const rec = { title: '', color: PALETTE[pilots.size % PALETTE.length], ...p };
    rec.callsign ||= rec.registration || String(rec.name).toUpperCase().slice(0, 7);
    rec.flightNo ||= flightNo();
    pilots.set(rec.id, rec);
    return rec;
  }

  function setPlayer(profile = {}) {
    player = { id: 'player', ...player, ...profile };
    player.color = profile.primary ? readable(profile.primary) : player.color || '#ffd75e';
    player.callsign = profile.registration || player.callsign || 'K-YOU';
    player.voice = profile.voice || player.voice || 'toff';
    player.flightNo = profile.flightNo || player.flightNo || flightNo();
    o.audio?.preload?.(bank.urlsForVoice(player.voice));
  }

  const spokenCallsign = (p) => {
    if (!p || p === tower) return '';
    const n = String(p.flightNo || 42);
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    return `${p.title || 'Your Grace'} ${cap(DIGITS[+n[0]])}-${cap(DIGITS[+n[1]])}`;
  };

  // ---------- queue ----------
  function makeItem(speakerId, intent, { target, about, priority, entry, ctx, after, stale, variant, tierHint } = {}) {
    const sp = speaker(speakerId);
    if (!sp) return null;
    const isTower = sp === tower;
    const e = entry || (variant != null ? bank.variant(sp.voice, intent, variant) : bank.pick(sp.voice, intent, { tier: tierHint ?? (isTower ? tier : undefined) }));
    if (!e) return null;
    const addressee = isTower ? speaker(about ?? target) : null;
    const rwy = e.rwy === 'post' ? String(ctx?.runway ?? o.getContext().runway ?? '27') : null;
    let text = fillTemplate(e.text, { runway: o.getContext().runway ?? '27', ...ctx });
    if (isTower && e.callsign === 'pre' && addressee) text = `${spokenCallsign(addressee)}, ${text}`;
    if (rwy) text = `${text} ${bank.list(sp.voice, 'splice_rwy')?.find((x) => x.id.endsWith(`rwy_${rwy}`))?.text || `runway ${rwy}.`}`;
    text = text.charAt(0).toUpperCase() + text.slice(1);
    const toId = isTower ? about ?? target : target;
    const to = toId === 'tower' ? tower : speaker(toId);
    return {
      sp, speakerId, intent, entry: e, text, target: toId, to, priority: priority ?? (isTower ? CFG.priority.tower : CFG.priority.ai),
      queuedAt: t, after, addressee, stale: stale ?? (isTower && TOWER_ROUTINE_LONG.has(intent) ? CFG.towerClearanceStaleAfter : CFG.staleAfter),
      rwy,
    };
  }

  function enqueue(item) {
    if (!item) return false;
    if (item.speakerId === 'tower' && queue.some((q) => q.speakerId === 'tower' && q.intent === item.intent)) return false;
    queue.push(item);
    queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    if (current && item.priority > current.priority && item.priority >= CFG.priority.player) startNext();
    return true;
  }

  function aiSay(id, intent, { chance = 1, target, after, priority } = {}) {
    if (!enabled || id == null || id === 'tower' || isPlayer(id)) return false;
    const p = speaker(id);
    if (!p || p.human) return false;
    if (o.rng() > chance || t - lastAi < chatterGap() || (speakerFree.get(id) || 0) > t) return false;
    const ok = enqueue(makeItem(id, intent, { target, after, priority }));
    if (ok) { lastAi = t; speakerFree.set(id, t + 5); }
    return ok;
  }

  function towerSay(intent, { about, target, priority, after, ctx, delay = 0 } = {}) {
    if (!enabled) return false;
    const item = makeItem('tower', intent, { about, target, priority, after, ctx });
    if (!item) { after?.(); return false; }
    if (!delay) return enqueue(item);
    // A second scold within scoldReplaceWithin replaces the pending one instead of stacking.
    if (pendingScold && t - pendingScold.created < CFG.scoldReplaceWithin) pendingScold.item = item;
    else pendingScold = { created: t, at: t + delay, item };
    pendingScold.at = Math.max(pendingScold.at, t + delay * 0.5);
    return true;
  }

  const scoldDelay = () => CFG.scoldDelay[0] + o.rng() * (CFG.scoldDelay[1] - CFG.scoldDelay[0]);

  function startNext() {
    queue = queue.filter((q) => t - q.queuedAt <= q.stale || (q.priority >= CFG.priority.player && q.speakerId === player?.id));
    const item = queue.shift();
    if (!item) return;
    if (current) { current.cut = true; fallback.stop(); }
    const my = ++token;
    current = item;
    let row = null, started = false;
    const onStart = (info) => {
      if (started) return;
      started = true;
      row = hud.addLog({ speaker: fullName(item.sp), to: item.to ? fullName(item.to) : '', color: item.sp.color, text: item.text, isTower: item.sp === tower, isPlayer: item.sp === player, tier });
      if (item.sp === tower) hud.setTowerTalking(true);
      emit('line', { speaker: item.speakerId, voice: item.sp.voice, intent: item.intent, id: item.entry.id, variant: item.entry.variant, text: item.text, target: item.target, missing: info?.missing });
    };
    const onEnd = (info) => {
      if (!started) onStart(info);
      row?.end(info?.steppedOn ? 1.5 : 0.8 + 2.4);
      if (item.sp === tower) hud.setTowerTalking(false);
      if (my === token) { current = null; gapUntil = t + 0.25; }
      item.after?.();
    };
    play(item, onStart).then(onEnd, onEnd);
  }

  async function play(item, onStart) {
    const { sp, entry } = item;
    const body = bank.clip(sp.voice, entry.id);
    const dur = body?.duration || estimateSeconds(item.text, entry.maxSeconds);
    const prio = item.priority;
    if (o.audio?.playRadio) {
      let src = body?.url || null;
      const parts = [];
      const sc = (key) => bank.clip(sp.voice, `${sp.voice}.${key}`) || bank.clip(sp.voice, key);
      if (sp === tower && entry.callsign === 'pre' && item.addressee) {
        const n = String(item.addressee.flightNo || 42);
        const word = String(item.addressee.splice || item.addressee.title || 'grace').toLowerCase().replace(/\s+/g, '_');
        parts.push(sc(`cs_title_${word}`) || sc('cs_title_grace'), sc(`cs_digit_${DIGITS[+n[0]]}`), sc(`cs_digit_${DIGITS[+n[1]]}`));
      }
      const tail = item.rwy ? [sc(`rwy_${item.rwy}`)] : [];
      const seq = [...(parts.every(Boolean) ? parts : []), body, ...tail.filter(Boolean)];
      if (src && seq.length > 1 && o.audio.loadBuffer) {
        try { src = await splice(seq.map((c) => c.url), o.audio.loadBuffer); } catch { src = body.url; }
      }
      return o.audio.playRadio(src, { speaker: sp === tower ? 'tower' : 'pilot', voiceId: sp.voice, text: item.text, priority: prio, duration: dur, onStart });
    }
    onStart({ missing: !body });
    return fallback.play({ url: body?.url, text: item.text, maxSeconds: entry.maxSeconds, duration: body?.duration }).done;
  }

  // ---------- player chips ----------
  function chipTarget(intent, ctxTarget) {
    const to = INTENTS[intent]?.to || 'all';
    if (to === 'tower') return 'tower';
    if (to === 'all') return null;
    return ctxTarget ?? null;
  }

  function buildChips(specs, ctxTarget, { ignoreCooldown = false } = {}) {
    const out = [];
    for (const s of specs) {
      if (out.length >= 4) break;
      const intent = typeof s === 'string' ? s : s.intent;
      const meta = INTENTS[intent];
      if (!meta || !bank.has(player.voice, intent)) continue;
      const target = typeof s === 'object' && 'target' in s ? s.target : chipTarget(intent, ctxTarget);
      if ((meta.to === 'pilot' || meta.to === 'victim') && target == null) continue;
      const tgt = target === 'tower' ? tower : speaker(target);
      const cooling = !ignoreCooldown && (intentFree.get(intent) || 0) > t;
      out.push({ intent, target, label: meta.label, icon: meta.icon, targetName: tgt ? (tgt === tower ? 'Tower' : fullName(tgt)) : 'all', color: tgt?.color, disabled: cooling });
    }
    return out;
  }

  function openResponse(kind, specs, { target, cause, title, force = false } = {}) {
    if (!player || !enabled || o.mode === 'follower' && !force) return false;
    if (!force && t - lastInbound < CFG.inboundWindowGap) return false;
    const chips = buildChips(specs, target, { ignoreCooldown: true });
    if (!chips.length) return false;
    lastInbound = t;
    win = { kind: 'response', chips, t0: t, dur: CFG.responseWindow, cause, target };
    hud.showChoices({ kind: 'response', title: title || 'Respond!', subtitle: kind, chips, countdown: true });
    emit('window', { open: true, kind: 'response', cause, intents: chips.map((c) => c.intent) });
    return true;
  }

  function contextChips() {
    const ctx = o.getContext() || {};
    const near = lastInteractor && t - lastInteractor.t < 30 ? lastInteractor.id : ctx.nearest ?? null;
    if (lastCrime && t - lastCrime.t < 10) {
      return [{ intent: BOAST[lastCrime.id] || 'cut_in', target: BOAST[lastCrime.id] === 'queue_jump' ? null : lastCrime.victim ?? near }, 'apology', { intent: 'insult', target: lastCrime.victim ?? near }, 'priority'];
    }
    switch (ctx.phase) {
      case 'hold': return ['req_takeoff', 'queue_jump', 'priority', { intent: 'insult', target: near }];
      case 'air': return ['req_land', { intent: 'insult', target: near }, 'priority', 'complain'];
      case 'landed': return ['landing_brag', { intent: 'insult', target: near }, 'greeting', 'priority'];
      default: return ['greeting', 'priority', { intent: 'insult', target: near }, 'req_takeoff'];
    }
  }

  function openMenu() {
    load();
    if (!player || !enabled || t < playerFree) return false;
    const chips = buildChips(contextChips(), null);
    if (!chips.length) return false;
    win = { kind: 'menu', chips, t0: t, dur: 12 };
    hud.showChoices({ kind: 'menu', title: 'Radio', subtitle: 'pick a bark', chips, countdown: false });
    emit('window', { open: true, kind: 'menu', intents: chips.map((c) => c.intent) });
    return true;
  }

  function closeWindow(reason) {
    if (!win) return;
    const w = win;
    win = null;
    hud.hideChoices();
    emit('window', { open: false, kind: w.kind, reason });
  }

  function choose(i) {
    if (!win) return false;
    const c = win.chips[i];
    if (!c || c.disabled) return false;
    const w = win;
    const item = makeItem(player.id, c.intent, { target: c.target, priority: CFG.priority.player, stale: 30 });
    if (!item) return false;
    hud.flashChoice(i);
    enqueue(item);
    if (!current) startNext();
    playerFree = t + CFG.playerCooldown;
    intentFree.set(c.intent, t + CFG.sameIntentCooldown);
    setTimeout(() => { if (win === w) closeWindow('chosen'); }, 140);
    const payload = {
      intent: c.intent, target: c.target, targetType: c.target === 'tower' ? 'tower' : c.target == null ? 'all' : 'pilot',
      voice: player.voice, variant: item.entry.variant, lineId: item.entry.id, source: w.kind, cause: w.cause,
      reaction: w.kind === 'response' ? +(t - w.t0).toFixed(2) : undefined,
    };
    emit('barked', payload);
    if (o.mode !== 'follower') reactToPlayer(payload);
    return true;
  }

  function reactToPlayer(b) {
    if (b.targetType === 'tower') {
      if (b.intent === 'priority') towerSay('reply_priority', { about: player.id, delay: 0.6 + o.rng() * 0.4 });
    } else if (b.targetType === 'pilot') {
      const back = { insult: 'retort', cut_in: 'complain', retort: 'retort', near_miss: 'insult' }[b.intent];
      if (back) aiSay(b.target, back, { target: back === 'complain' ? 'tower' : player.id, chance: 0.55 });
    }
  }

  // ---------- event adapter ----------
  function handleEvent(raw) {
    if (!raw || !enabled) return;
    let type = EVENT_ALIASES[raw.type] || raw.type;
    let id = raw.id ?? raw.rule ?? raw.infraction;
    if (INFRACTIONS[type]) { id = type; type = 'infraction'; }
    if (type === 'infraction' && EVENT_ALIASES[id]) id = EVENT_ALIASES[id];
    const ev = { ...raw, type, id, actor: raw.actor ?? raw.who ?? raw.plane, victim: raw.victim ?? raw.other };
    if (ev.outrage != null && type !== 'outrage') setOutrage(ev.outrage);
    const other = isPlayer(ev.actor) ? ev.victim ?? ev.target : isPlayer(ev.victim ?? ev.target) ? ev.actor : null;
    if (other != null && other !== 'tower') lastInteractor = { id: other, t };
    if (o.mode === 'follower' && type !== 'outrage' && type !== 'scandal') { emit('event', ev); return; }
    rules[type]?.(ev);
    emit('event', ev);
  }

  const rules = {
    infraction(ev) {
      const { actor, victim, id } = ev;
      const def = INFRACTIONS[id] || {};
      const scold = def.scold || 'scold_generic';
      if (id === 'near_miss') return rules.nearMiss(ev);
      if (isPlayer(actor)) {
        lastCrime = { id, victim, t };
        towerSay(scold, { about: actor, delay: scoldDelay(), after: () => openResponse('Tower is cross', ['apology', 'priority', 'complain'], { target: 'tower', cause: id, title: 'Scolded!' }) });
        if (victim != null) aiSay(victim, speaker(victim)?.rival ? 'insult' : 'complain', { target: speaker(victim)?.rival ? actor : 'tower', chance: CFG.aiChance.complain });
      } else if (isPlayer(victim)) {
        towerSay(scold, { about: actor, delay: scoldDelay() });
        const boast = BOAST[id];
        const respond = () => openResponse(id === 'forced_goaround' ? 'You were sent round' : 'You were cut in on', ['complain', { intent: 'insult', target: actor }, id === 'forced_goaround' ? 'go_around' : { intent: 'retort', target: actor }], { target: actor, cause: id, title: 'Outrageous!' });
        if (!(boast && aiSay(actor, boast, { target: victim, chance: speaker(actor)?.rival ? CFG.aiChance.rivalInsult : 0.6, after: respond }))) setTimeout(respond, 1500);
      } else {
        if (o.rng() < 0.5) towerSay(scold, { about: actor, delay: scoldDelay(), priority: CFG.priority.ai });
        if (victim != null) aiSay(victim, 'complain', { target: 'tower', chance: CFG.aiChance.complain });
      }
    },
    nearMiss(ev) {
      const { actor, victim } = ev;
      towerSay(INFRACTIONS.near_miss?.scold || 'scold_near_miss', { about: actor, target: victim, delay: scoldDelay(), priority: isPlayer(actor) || isPlayer(victim) ? undefined : CFG.priority.ai });
      if (isPlayer(actor) || isPlayer(victim)) {
        const other = isPlayer(actor) ? victim : actor;
        const respond = () => openResponse('Near miss', [{ intent: 'near_miss', target: other }, { intent: 'insult', target: other }, 'apology'], { target: other, cause: 'near_miss', title: 'Close shave!' });
        if (!aiSay(other, 'near_miss', { target: player.id, chance: 0.8, after: respond })) setTimeout(respond, 900);
      } else aiSay(victim, 'near_miss', { target: actor, chance: 0.4 });
    },
    collision(ev) {
      const { actor, victim } = ev;
      const mine = isPlayer(actor) || isPlayer(victim);
      if (mine || o.rng() < 0.4) towerSay('scold_bump', { about: actor, target: victim, delay: scoldDelay(), priority: mine ? undefined : CFG.priority.ai });
      if (mine) {
        const other = isPlayer(actor) ? victim : actor;
        const respond = () => openResponse('Boing!', ['bump', { intent: 'insult', target: other }, 'apology'], { target: other, cause: 'collision', title: 'Boing!' });
        if (!(other != null && other !== 'tower' && aiSay(other, 'bump', { chance: 0.7, after: respond }))) setTimeout(respond, 900);
      } else aiSay(actor, 'bump', { chance: 0.5 });
    },
    goAround(ev) {
      towerSay('go_around', { about: ev.actor, priority: CFG.priority.tower });
      if (isPlayer(ev.actor)) openResponseAfterTower('Sent round', ['complain', { intent: 'insult', target: ev.cause ?? ev.victim }, 'go_around'], 'goAround');
      else if (isPlayer(ev.cause)) aiSay(ev.actor, o.rng() < 0.5 ? 'insult' : 'go_around', { target: player.id, chance: CFG.aiChance.complain, after: () => openResponse('Pilot is livid', [{ intent: 'retort', target: ev.actor }, { intent: 'insult', target: ev.actor }, 'complain'], { target: ev.actor, cause: 'goAround' }) });
      else aiSay(ev.actor, 'go_around', { chance: 0.4 });
    },
    tower(ev) {
      const mine = isPlayer(ev.actor);
      towerSay(ev.intent || ev.line, { about: ev.actor, target: ev.target, priority: ev.priority ?? (mine ? CFG.priority.tower : CFG.priority.ai), ctx: { runway: ev.runway } });
    },
    clearance(ev) {
      const intent = ev.intent || (ev.kind === 'land' || /land/i.test(ev.rawType || '') ? 'clear_land' : 'clear_takeoff');
      rules.tower({ ...ev, intent });
    },
    phase(ev) {
      if (isPlayer(ev.actor)) return;
      const intent = { taxi: 'greeting', hold: 'req_takeoff', pattern: 'req_land', rotate: 'takeoff', landed: 'landing_brag' }[ev.phase];
      if (intent) aiSay(ev.actor, intent, { target: INTENTS[intent].to === 'tower' ? 'tower' : null, chance: intent === 'landing_brag' ? 0.3 : CFG.aiChance.routine });
    },
    landed(ev) {
      if (ev.impeccable) towerSay('impeccable', { about: ev.actor, priority: isPlayer(ev.actor) ? CFG.priority.tower : CFG.priority.ai });
      if (!isPlayer(ev.actor)) aiSay(ev.actor, 'landing_brag', { chance: 0.3 });
    },
    bark(ev) {
      const at = ev.target ?? ev.victim;
      aiSay(ev.actor, ev.intent, {
        target: at, chance: ev.chance ?? 1,
        after: isPlayer(at) && ['insult', 'cut_in', 'retort', 'near_miss', 'queue_jump'].includes(ev.intent)
          ? () => openResponse('A pilot insulted you', [{ intent: 'retort', target: ev.actor }, { intent: 'insult', target: ev.actor }, 'complain'], { target: ev.actor, cause: 'bark', title: 'Insulted!' }) : undefined,
      });
    },
    outrage(ev) { setOutrage(ev.value ?? ev.outrage, ev.tier); },
    scandal() { setScandal(true); towerSay('scandal', { priority: CFG.priority.tower + 1 }); },
    crownChange(ev) {
      towerSay('crown_change', { about: ev.actor });
      if (isPlayer(ev.actor)) openResponseAfterTower('You have the Crown', ['landing_brag', { intent: 'insult', target: o.getContext().nearest }], 'crown');
    },
  };

  function openResponseAfterTower(kind, specs, cause) {
    const item = queue.find((q) => q.speakerId === 'tower') || (pendingScold?.item);
    const open = () => openResponse(kind, specs, { target: 'tower', cause });
    if (item) { const prev = item.after; item.after = () => { prev?.(); open(); }; } else open();
  }

  function setOutrage(v, tierOverride) {
    if (v == null && tierOverride == null) return;
    if (v != null) outrage = Math.max(0, Math.min(100, +v || 0));
    const nt = tierOverride ?? tierOf(outrage);
    if (v == null) outrage = TIERS.find((x) => x.tier === nt)?.min ?? outrage;
    if (scandal && outrage < 100) scandal = false;
    tier = Math.max(1, Math.min(4, nt));
    const name = scandal ? 'SCANDAL' : TIERS.find((x) => x.tier === tier)?.name || '';
    hud.setComposure(scandal ? 4 : tier - 1, name, outrage);
  }
  function setScandal(on) { scandal = !!on; setOutrage(on ? 100 : outrage); }

  // ---------- online (ONLINE §5/§10) ----------
  // msg: { speaker, intent, variant, target } for a bark, or { tower:true, line|intent, about, rwy } for a tower line.
  function schedule(at, msg) {
    if (!msg) return;
    if (msg.speaker != null && isPlayer(msg.speaker)) return; // own bark already played locally
    scheduled.push({ at, msg });
    scheduled.sort((a, b) => a.at - b.at);
  }
  function runScheduled() {
    if (!scheduled.length) return;
    const now = o.roomTime ? o.roomTime() : performance.now();
    while (scheduled.length && scheduled[0].at <= now) {
      const { at, msg } = scheduled.shift();
      if (now - at > 1500) continue;
      const item = msg.tower
        ? makeItem('tower', msg.line || msg.intent, { about: msg.about, target: msg.target, ctx: { runway: msg.rwy }, priority: CFG.priority.tower, stale: 1.5 })
        : makeItem(msg.speaker, msg.intent, { target: msg.target, variant: msg.variant, priority: speaker(msg.speaker)?.human ? CFG.priority.human : CFG.priority.ai, stale: 1.5 });
      if (item) { enqueue(item); if (msg.respond && isPlayer(msg.target)) item.after = () => openResponse(msg.respond.kind || 'Respond', msg.respond.intents, { target: msg.speaker, cause: msg.intent, force: true }); }
    }
  }

  function update(dt) {
    t += Math.min(dt, 0.25);
    if (pendingScold && t >= pendingScold.at) { const p = pendingScold; pendingScold = null; enqueue(p.item); }
    runScheduled();
    if (!current && t >= gapUntil && queue.length) startNext();
    if (win) {
      const left = win.dur - (t - win.t0);
      if (win.kind === 'response') hud.setCountdown(left / win.dur, left);
      if (left <= 0) closeWindow('timeout');
    }
    hud.setButtonCooldown(playerFree > t ? (playerFree - t) / CFG.playerCooldown : 0);
    hud.update(dt);
  }

  function onKey(e) {
    if (e.target?.closest?.('input,textarea,select,[contenteditable]')) return;
    if (e.key >= '1' && e.key <= '4' && win) { choose(+e.key - 1); e.preventDefault(); }
    else if ((e.key === 'r' || e.key === 'R') && !e.repeat) { if (win?.kind === 'menu') closeWindow('closed'); else if (!win) openMenu(); }
    else if ((e.key === 'l' || e.key === 'L') && !e.repeat) hud.toggleLog();
    else if (e.key === 'Escape' && win) closeWindow('closed');
  }
  if (o.keys) window.addEventListener('keydown', onKey);

  if (o.profile) setPlayer(o.profile);
  // deferLoad: the script + clip manifest wait for load() (or the radio being shown / opened); fallback lines cover the gap.
  let loading = null, release;
  const ready = new Promise((r) => { release = r; });
  function load() {
    if (loading) return ready;
    loading = bank.fetchAll({
      scriptUrl: o.scriptUrl ?? `${o.base}data/barks/script.json`,
      manifestUrl: o.manifestUrl ?? `${o.base}audio/voices/barks.json`,
      voicesUrl: o.voicesUrl ?? `${o.base}data/voices.json`,
    }).then((r) => {
      voicesData = r.voices;
      nameTower();
      if (player) o.audio?.preload?.(bank.urlsForVoice(player.voice));
      return r;
    });
    release(loading);
    return ready;
  }
  if (!o.deferLoad) load();

  return {
    ready, load, get loaded() { return !!loading; }, bank, rules, handleEvent, update, schedule,
    say(who, intent, opt = {}) { return who === 'tower' ? towerSay(intent, opt) : enqueue(makeItem(who, intent, opt)); },
    setPlayer, registerPilot, removePilot: (id) => pilots.delete(id),
    setTower(tw) { tower = { ...tower, ...tw, fixedName: tw.name ? true : tower.fixedName }; nameTower(); o.audio?.preload?.(bank.urlsForVoice(tower.voice)); },
    setOutrage: (v) => setOutrage(v), setTier: (n) => setOutrage(null, n), setScandal,
    getOutrage: () => ({ outrage, tier, scandal }),
    openMenu, openResponse: (kind, intents, opt = {}) => openResponse(kind, intents, { force: true, ...opt }), closeWindow, choose,
    preloadVoice: (v) => o.audio?.preload?.(bank.urlsForVoice(v)),
    setVolume: (v) => fallback.setVolume(v),
    setChatter(level) { o.chatter = level; },
    setSubtitles: (on) => hud.setSubtitles(on),
    setMode(m) { o.mode = m; },
    setEnabled(on) { enabled = !!on; if (!on) { queue = []; pendingScold = null; closeWindow('disabled'); } hud.setVisible(on); },
    setVisible: (on) => { if (on) load(); hud.setVisible(on); },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    get state() {
      return { t: +t.toFixed(2), outrage, tier, scandal, queue: queue.map((q) => `${q.speakerId}:${q.intent}`), pending: pendingScold && pendingScold.item.intent, current: current && `${current.speakerId}:${current.intent}`, window: win && { kind: win.kind, intents: win.chips.map((c) => c.intent), left: +(win.dur - (t - win.t0)).toFixed(2) } };
    },
    dispose() { if (o.keys) window.removeEventListener('keydown', onKey); fallback.stop(); hud.dispose(); listeners.clear(); },
  };
}

async function splice(urls, loadBuffer) {
  const bufs = await Promise.all(urls.map((u) => loadBuffer(u)));
  const sr = bufs[0].sampleRate;
  const fade = Math.floor(sr * 0.04);
  const len = bufs.reduce((n, b) => n + b.length, 0) - fade * (bufs.length - 1);
  const out = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
  const dst = out.getChannelData(0);
  let off = 0;
  bufs.forEach((b, i) => {
    const src = b.getChannelData(0);
    for (let j = 0; j < src.length; j++) {
      let g = 1;
      if (i > 0 && j < fade) g = j / fade;
      if (i < bufs.length - 1 && j > src.length - fade) g = (src.length - j) / fade;
      dst[off + j] += src[j] * g;
    }
    off += b.length - fade;
  });
  return out;
}

function readable(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (isNaN(n)) return '#ffd75e';
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = 0.299 * ch[0] + 0.587 * ch[1] + 0.114 * ch[2];
  if (lum > 120) return hex;
  const k = Math.min(0.7, (120 - lum) / 255 + 0.35);
  return '#' + ch.map((c) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0')).join('');
}
