// Owns the run/pause state, the save document and the §10.5 tick order. Constructed only when a
// real game session starts — never under ?shot= and never in the editor.

import { WorldClock } from './worldclock.js';
import { QuestRunner } from './questrunner.js';
import { DialogueBox } from './dialoguebox.js';
import { JournalScreen } from './journalscreen.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Market } from './market.js';
import { Audio } from './audio.js';
import { gameHost, el } from './ui.js';
import { nearestAnchor } from './areas.js';
import { blank, rollDay, checkPosition, POSITION, addItem, itemCount, clampQuests } from './save.js';
import { appendLog } from './journal.js';
import { pins, basicOf, unlocked, outclassed, levelIn } from './sheet.js';
import * as vitals from './vitals.js';
import { next as nextPrompt, settle, HOLD } from './onboard.js';
import { quote, rows as wareRows } from './sale.js';
import { nameOf, started } from './towns.js';
import { FOOTSTEP_EVERY, RANGE } from './sounds.js';
import { focusCost, canCast, idOf, SPELLS } from '../sim/spells.js';
import { grantXp } from '../sim/xp.js';
import { transactionXp, itemTier } from '../sim/economy.js';
import {
  FACTIONS, GRAFT, SUSPICION, WATCH_WEIGHT, BLOCKED,
  newGraft, graftBlocked, startGraft, tickGraft, endGraft, graftEvent, breakGraft,
} from '../sim/faction.js';
import { fail, RELOAD } from './failure.js';
import * as store from './savestore.js';
import { Autosave } from './savestore.js';

const LOOK_SCALE = 0.6;
const STUCK_SECONDS = 4;
const STUCK_METRES = 0.15;
const REACH = 400;
const ASH = 'hearth_ash';

// What the player is told when `recover` asks the world for something it cannot do yet. §9.4's
// promise is that Reset this step puts the world back; when it cannot, it says so.
const NO_HOOK = {
  moveTo: 'There is nowhere to put you back.',
  respawn: 'Nothing has come back yet.',
  arm: 'It will not go back the way it was.',
};

// Every verb `recover` dispatches on — `tools/lintQuests.mjs` RECOVER is the same table — built in
// one place so the contract test can prove the world the game hands the runner covers it.
export function questWorld(world, hooks) {
  return {
    ...world,
    sound: id => hooks.sound(id),
    uiBusy: () => hooks.uiBusy(),
    grant: (item, n = 1) => hooks.grant(item, n),
    flag: (key, value = true) => hooks.flag(key, value),
    moveTo: area => hooks.moveTo(area),
    respawn: (kind, n = 1) => (world.respawn ? world.respawn(kind, n) : hooks.missing('respawn', kind, n)),
    arm: id => (world.arm ? world.arm(id) : hooks.missing('arm', id)),
  };
}

export class Session {
  constructor(app, player, opts = {}) {
    this.app = app;
    this.player = player;
    this.world = opts.world || {};
    this.paused = false;
    this.pauses = new Set();
    this.advanceRequest = false;
    this.host = gameHost();
    this.notices = [];
    this.gaps = [];
    this.ob = { looked: false, moved: false, cast: false, doorUsed: false, contextUsed: false, channelled: false };
    this.stuck = 0;
    this.lost = 0;
    this.told = new Set();
    this.context = null;
    this.faded = new Set();
    this.prompt = null;
    this.promptT = 0;
    this.stick = 0;
    // A Graft is combat-timescale (SYSTEMS §9.2): it never crosses a load, so it is built here and
    // never read back off the document.
    this.graft = newGraft();
    this.suspicion = 0;
    this.knob = { duration: 1, suspicion: 1, channel: GRAFT.channel };

    const loaded = opts.fresh ? null : store.load();
    this.doc = loaded?.doc || blank(opts.seed);
    // Picking a different town off the slate is starting the next chapter on the same character:
    // the acts start again from one, and `start()` opens on that campaign's first quest.
    this.switched = !!opts.campaign && opts.campaign !== this.doc.campaign.current;
    if (opts.campaign) { this.doc.campaign.current = opts.campaign; this.doc.faction = opts.campaign; }
    if (this.switched) this.doc.campaign.act = 1;
    if (loaded?.error) this.notices.push(loaded.error);
    if (loaded?.warnings?.length) this.notices.push(...loaded.warnings);

    this.doc.worn = null;
    this.clock = new WorldClock(player);
    this.clock.load(this.doc.clock);
    this.doc = rollDay(this.doc, this.clock.day);

    this.limits = vitals.limits(this.doc.schools);
    this.vitals = vitals.blank(this.doc.schools, this.doc.vitals);
    this.school = pins(this.doc)[0] || 'kindle';
    this.audio = new Audio();

    this.dialogue = new DialogueBox({
      host: this.host,
      player,
      names: opts.names || {},
      ctx: () => this.quests.ctx(),
      effects: e => this.quests.apply(e),
      line: (scene, line) => {
        const j = appendLog({ truths: this.doc.truths, log: this.doc.log },
          { day: this.clock.day, scene, line });
        this.doc.log = j.log;
      },
      done: ({ node, nodes, npc }) => {
        this.quests.emit({ t: 'talk', npc, node, nodes });
        this.quests.draw();
        this.autosave.mark();
      },
    });

    this.quests = new QuestRunner({
      host: this.host, clock: this.clock, dialogue: this.dialogue, doc: this.doc,
      world: questWorld(this.world, {
        sound: id => this.audio.play(id),
        uiBusy: () => this.uiBusy,
        grant: (item, n) => this.regrant(item, n),
        flag: (key, value) => { this.doc.flags[key] = value; },
        moveTo: area => this.recoverTo(area),
        missing: (verb, ...args) => this.noHook(verb, args),
      }),
    });
    this.quests.onSave = () => { this.canGraft = undefined; this.autosave.flush(); };

    this.journal = new JournalScreen({
      host: this.host,
      quests: this.quests,
      journal: () => ({ truths: this.doc.truths, log: this.doc.log }),
      clock: this.clock,
      names: () => this.dialogue.names,
      onClose: () => { this.resume('journal'); this.quests.draw(); },
    });

    this.hud = new Hud({
      host: this.host,
      state: () => this.hudState(),
      onMenu: () => this.menu.toggle(),
      onDial: (school, fromRadial) => this.pick(school, fromRadial),
      onAct: kind => this.act(kind),
      onChannel: (phase, kind) => this.channel(phase, kind),
      onFlip: () => this.setting('flip', true),
      onPrompt: () => this.audio.play('uiBlip'),
    });

    this.menu = new Menu({
      host: this.host,
      clock: this.clock,
      doc: () => this.doc,
      truths: () => this.quests.truths,
      canWait: () => !this.hud.held,
      hasStep: () => !!this.doc.tracked,
      onOpen: () => { this.pause('menu'); this.autosave.flush(); this.hud.show(false); this.quests.draw(); },
      onClose: () => { this.resume('menu'); this.hud.show(true); this.quests.draw(); },
      onJournal: () => this.toggleJournal(),
      onWait: hour => this.clock.advanceTo(hour),
      onSetting: (k, v) => this.setting(k, v),
      onFree: () => this.free(),
      onShow: () => this.journal.show('quests'),
      onReset: () => this.quests.resetStep(this.doc.tracked),
    });

    this.market = new Market({
      host: this.host,
      doc: () => this.doc,
      sound: id => this.audio.play(id),
      onOpen: () => { this.pause('market'); this.hud.show(false); this.quests.draw(); },
      onClose: () => { this.resume('market'); this.hud.show(true); this.quests.draw(); },
      onSell: list => this.sell(list),
    });

    this.rotate();
    this.autosave = new Autosave(() => this.snapshot());
    this.bind();
    this.applySettings();
  }

  registerKnobs(q) {
    this.q = q;
    this.clock.registerKnobs(q);
    this.audio.registerKnobs(q, this.doc.settings);
    q.register({ key: 'graftDuration', label: 'Graft duration ×', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1, group: 'Graft' },
      v => { this.knob.duration = v; });
    q.register({ key: 'graftSuspicion', label: 'Suspicion rate ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: 'Graft' },
      v => { this.knob.suspicion = v; });
    q.register({ key: 'graftChannel', label: 'Graft channel (s)', type: 'range', min: 0.2, max: 6, step: 0.1, default: GRAFT.channel, group: 'Graft' },
      v => { this.knob.channel = v; });
  }

  async start(params = new URLSearchParams()) {
    this.dialogue.names = await fetch('data/cast.json').then(r => r.json()).catch(() => ({}));
    // Without the packs there is no game, so this is the one failure that stops rather than
    // degrades — and it names the file, because the usual cause is a typo in one of them.
    try {
      await this.quests.load();
    } catch (e) {
      fail(`The quest packs did not load — ${e.message}. ${RELOAD}`);
      throw e;
    }
    this.reconcile();
    this.restorePosition();
    const want = params.get('quest');
    if (want && this.quests.defs[want]) this.jumpTo(want);
    else if (this.switched || !started(this.doc)) this.beginCampaign();
    this.doc.onboard = settle(this.obCtx(), this.doc.onboard);
    for (const bed of ['day', 'dusk', 'wind']) this.audio.ambience(bed, true);
    if (this.notices.length) this.notice(`This save was made by an older build. ${this.notices.length} things were adjusted.`);
    return this;
  }

  // §5.2's untrusted-input pass, minus the half of it that needs the quest definitions: those load
  // after the document does, so the checks that need them run here instead of in `normalise`.
  reconcile() {
    const warnings = [];
    this.doc.quests = clampQuests(this.doc.quests, this.quests.defs, warnings);
    if (this.doc.tracked && !this.doc.quests[this.doc.tracked]) this.doc.tracked = null;
    for (const w of warnings) console.warn(`save: ${w}`);
    this.notices.push(...warnings);
    return warnings;
  }

  get uiBusy() { return this.journal.open || this.menu.open || this.market.open; }

  snapshot() {
    this.doc.clock = this.clock.toJSON();
    this.doc.at = this.positionNow();
    this.doc.vitals = { hp: Math.round(this.vitals.hp), focus: Math.round(this.vitals.focus) };
    this.doc.pins = pins(this.doc);
    return this.doc;
  }

  positionNow() {
    const p = this.player;
    if (!p?.pos) return null;
    return {
      x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
      yaw: +(p.yaw || 0).toFixed(3),
      area: this.quests.here[0] || null,
      door: this.world.doorIndex?.() ?? null,
      rev: this.world.rev?.() ?? -1,
    };
  }

  // §5.3. Track A is rebuilding the world while saves exist, so a stored position is only used
  // when the scene revision matches and the ground is still where the save says it was.
  restorePosition() {
    const r = checkPosition(this.doc.at, { rev: this.world.rev?.() ?? null, groundAt: this.world.groundAt });
    this.spawn = r.reason;
    if (r.ok && r.door != null && this.world.jumpDoor?.(r.door)) return r.reason;
    if (r.ok && r.door == null) {
      this.player.pos.set(r.x, r.y, r.z);
      this.player.yaw = r.yaw;
      // One collider step pushes out of anything the world grew around the stored point.
      const w = this.world.walkStep?.(r.x, r.z, r.x, r.z, r.y, this.player.walkRadius);
      if (w) this.player.pos.set(w.x, r.y, w.z);
      return r.reason;
    }
    this.spawnAtHearth(r.area);
    return r.reason;
  }

  // Waking at a hearth is already the gutter behaviour, so a discarded position reads as intended
  // rather than as an error. It is never reported to the player.
  spawnAtHearth(area) {
    const areas = this.quests.areas || {};
    const town = this.doc.campaign.current;
    const home = Object.values(areas).find(a => a.hearth && a.town === town)
      || Object.values(areas).find(a => a.hearth)
      || (area && areas[area] ? areas[area] : null)
      || Object.values(areas)[0];
    // The anchors are authored against the finished valley; Track A's world is still the demo,
    // and walking a player 500 m into terrain that does not exist yet is worse than not moving.
    this.placeAtArea(home?.id);
  }

  // An anchor further away than the whole valley is an anchor from a world that is not loaded.
  reachable(at) {
    const p = this.player?.pos;
    return !!p && Number.isFinite(this.world.groundAt?.(at.x, at.z, 0))
      && Math.hypot(at.x - p.x, at.z - p.z) < REACH;
  }

  // `far` is for the two moves that are the point of the move: a new game, and `recover`'s
  // `moveTo`. Both are putting the player somewhere specific, so the REACH gate — which exists to
  // stop a *stale stored position* dragging him across a world that has moved — does not apply.
  placeAtArea(id, { far = false } = {}) {
    const a = id && this.quests.areas?.[id];
    if (!a || !this.player?.pos) return false;
    const at = nearestAnchor({ [a.id]: a }, 0, 0);
    const y = this.world.groundAt?.(at.x, at.z, 0);
    if (!Number.isFinite(y) || (!far && !this.reachable(at))) return false;
    this.player.pos.set(at.x, y, at.z);
    return true;
  }

  startAreaOf(id) {
    const first = this.quests.defs[id]?.steps.find(s => !s.optional);
    return first?.in || first?.objectives.find(o => o.area)?.area || null;
  }

  // §2.6's authoring loop: start any quest with its prereqs waived, standing in the right place.
  jumpTo(id) {
    this.quests.accept(id, true);
    this.placeAtArea(this.startAreaOf(id), { far: true });
  }

  // RUNTIME §7: a new game opens *inside* its first quest — the granary, tracker already reading
  // `Cull the rodent` — not wherever the player mesh happens to default to. Whichever quest the
  // chosen campaign opens with is the one that is handed over.
  beginCampaign() {
    const id = this.quests.offers.find(q => this.quests.defs[q]?.campaign === this.doc.campaign.current);
    if (!id) return null;
    this.quests.accept(id);
    this.placeAtArea(this.startAreaOf(id), { far: true });
    return id;
  }

  bind() {
    const inp = this.player?.input;
    if (inp && !inp.__session) {
      inp.__session = this;
      const read = inp.read.bind(inp);
      // Dialogue is non-modal: movement and casting go off, look-drag stays live at 0.6×.
      inp.read = () => {
        const c = read();
        if (this.paused) { c.mx = c.my = c.lx = c.ly = 0; c.attack = false; return c; }
        if (this.dialogue.active) {
          c.mx = c.my = 0;
          c.sprint = false;
          c.lx *= LOOK_SCALE;
          c.ly *= LOOK_SCALE;
          if (c.attack) { this.advanceRequest = true; c.attack = false; }
          return c;
        }
        if (c.lx || c.ly) this.ob.looked = true;
        this.stick = Math.hypot(c.mx, c.my);
        if (this.stick > 0.1) this.ob.moved = true;
        if (c.attack) this.castRequest = true;
        return c;
      };
    }

    addEventListener('keydown', e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      if (e.code === 'KeyJ') this.toggleJournal();
      if (e.code === 'KeyE') this.act(this.context?.kind);
      if (e.code === 'Escape') this.escape();
    });
    let held = 0;
    this.quests.el.style.pointerEvents = 'auto';
    this.quests.el.addEventListener('pointerdown', () => { held = setTimeout(() => this.toggleJournal(), 500); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      this.quests.el.addEventListener(ev, () => clearTimeout(held));
    }

    // iOS will not start an AudioContext outside a gesture, so the first real tap is the unlock.
    const wake = () => { this.audio.unlock(); removeEventListener('pointerdown', wake); };
    addEventListener('pointerdown', wake);

    this.clock.on('bell', b => this.ringBell(b));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.pause('hidden'); this.autosave.flush(); } else this.resume('hidden');
    });
    addEventListener('pagehide', () => this.autosave.flush());
    addEventListener('orientationchange', () => this.rotate());
    addEventListener('resize', () => this.rotate());
  }

  escape() {
    if (this.journal.open) return this.toggleJournal();
    if (this.market.open) return this.market.close();
    return this.menu.toggle();
  }

  toggleJournal() {
    if (this.journal.open) return this.journal.close();
    this.pause('journal');
    this.autosave.flush();
    this.journal.show();
  }

  // No screen.orientation.lock in Safari on iOS, so the card is CSS and the pause is here.
  rotate() {
    if (!this.rotateCard) {
      this.rotateCard = el('div', 'g-rotate');
      this.rotateCard.append(el('u', null, '⟳'), el('p', null, 'Turn the phone sideways.'));
      this.host.append(this.rotateCard);
    }
    const portrait = innerHeight > innerWidth;
    if (portrait) this.pause('portrait'); else this.resume('portrait');
  }

  notice(text) {
    const n = el('div', 'g-card');
    n.append(el('p', null, text));
    const b = el('button', null, 'Go on');
    b.onclick = () => n.remove();
    n.append(b);
    this.host.append(n);
  }

  pause(reason = 'menu') { this.pauses.add(reason); this.paused = true; this.clock.pause(); }

  resume(reason = 'menu') {
    this.pauses.delete(reason);
    if (this.pauses.size) return;
    this.paused = false;
    this.clock.resume();
  }

  // ── settings ────────────────────────────────────────────────────────────

  setting(key, value) {
    if (key === 'devPanel') { document.body.classList.toggle('devpanel', !!value); return; }
    this.doc.settings[key] = value;
    this.applySettings();
    this.autosave.mark();
  }

  applySettings() {
    const s = this.doc.settings;
    this.host.style.setProperty('--ui', s.uiScale);
    document.body.classList.toggle('calm', !s.motion);
    if (this.q?.knobs.has('flipTouch')) this.q.set('flipTouch', !!s.flip);
    else if (this.player?.input) { this.player.input.flip = !!s.flip; document.body.classList.toggle('flip', !!s.flip); }
    for (const k of ['volume', 'mute', 'ambience']) {
      if (s[k] === undefined) continue;
      if (this.q?.knobs.has(k)) this.q.set(k, s[k]); else this.audio[k === 'ambience' ? 'ambient' : k] = s[k];
    }
  }

  buzz(ms) { if (this.doc.settings.haptics) navigator.vibrate?.(ms); }

  // ── the two buttons ─────────────────────────────────────────────────────

  pick(school, fromRadial) {
    this.school = school;
    if (fromRadial) this.doc.pins = [school, ...pins(this.doc).filter(p => p !== school)].slice(0, 3);
    this.doc.onboard.dial = true;
    this.audio.play('uiBlip');
    this.buzz(8);
  }

  act(kind) {
    if (!kind) { this.audio.play('uiError'); return; }
    this.ob.contextUsed = true;
    this.buzz(10);
    const t = this.context;
    if (t?.kind === 'talk') return this.talk(t.id);
    if (t?.kind === 'trade') return this.market.show(t.stall);
    if (t?.kind === 'graft') return this.graftTap();
    this.audio.play('uiConfirm');
    if (t?.id) this.quests.emit({ t: 'interact', id: t.id, verb: this.school });
  }

  channel(phase, kind) {
    if (phase === 'start') {
      if (kind === 'graft') return this.graftStart();
      this.audio.play(kind === 'work' ? 'lineCast' : 'cast');
      return;
    }
    // A pointercancel is a phone call, not a mistake: nothing was charged, so nothing is taken.
    if (phase === 'cancel') { if (kind === 'graft') this.graftFail(null); return; }
    if (phase !== 'release') return;
    this.ob.channelled = true;
    if (kind === 'graft') return this.graftRelease();
    this.act(kind);
  }

  // A live step's node comes first: talking never gets ahead of the quest it belongs to. Only when
  // this NPC has nothing to say about a quest you are on does their offer come up.
  talk(npc) {
    const node = this.quests.sceneFor(npc) || this.quests.offerSceneFor(npc);
    if (node && this.dialogue.play(node)) return;
    this.quests.emit({ t: 'talk', npc });
    this.audio.play('uiBlip');
  }

  cast() {
    const spell = basicOf(this.school, this.doc.worn || this.doc.faction);
    if (!spell) return;
    const cost = focusCost(spell, { guttered: this.vitals.guttered > 0 });
    const after = vitals.spend(this.vitals, cost, this.limits);
    if (!after.spent) { this.audio.play('uiError'); return; }
    this.vitals = after;
    this.ob.cast = true;
    this.audio.play('cast');
    this.buzz(6);
    this.suspect(this.tell(spell));
    this.quests.emit({ t: 'cast', school: this.school, spell: idOf(spell) });
  }

  // ── the Graft, SYSTEMS §8.3 ─────────────────────────────────────────────

  // What a cast gives away while you are wearing someone else's face. A spell with no `factionId`
  // is nobody's in particular, and the worn faction's own bolt is the point of the disguise.
  tell(spell) {
    const worn = this.graft.worn;
    if (!worn || !spell?.factionId || spell.factionId === worn) return null;
    return spell.factionId === this.doc.faction ? 'ownField' : 'wrongProjectile';
  }

  suspect(event) {
    if (!event || !this.graft.worn) return;
    this.graft = graftEvent(this.graft, event);
    this.suspicion = this.graft.susp;
    if (this.graft.susp >= SUSPICION.breakAt) this.onBreak();
  }

  graftGranted() {
    const done = Object.entries(this.doc.quests)
      .filter(([, r]) => r.s === 'done')
      .map(([id]) => this.quests.defs[id]?.story)
      .filter(Boolean);
    return canCast('graft', { schools: this.doc.schools, grasp: 0, standingBand: null, questsDone: done })
      || this.graftAsked();
  }

  // N07's fifth step *is* the first Graft, and N07 is what grants the spell — so the grant cannot
  // only come from the quest being done or the campaign never starts. A live step asking for a
  // graft is the lesson, and the lesson grants it.
  graftAsked() {
    for (const [id, rec] of Object.entries(this.doc.quests)) {
      if (rec.s !== 'active') continue;
      const steps = this.quests.defs[id]?.steps.filter(s => !s.optional);
      if (steps?.[rec.i]?.verb === 'graft') return true;
    }
    return false;
  }

  // STORY §12: Hearth Ash is free at any Longacre hearth, which is the Tithe Barn and nowhere else.
  atHomeHearth() {
    return this.quests.here.some(a => {
      const area = this.quests.areas[a];
      return area?.hearth && area.town === 'neutral';
    });
  }

  blocked() {
    return graftBlocked(this.graft, {
      granted: this.graftGranted(),
      ash: itemCount(this.doc, ASH) + (this.atHomeHearth() ? 1 : 0),
      seen: this.watch().seen,
    });
  }

  // Every Watchman inside line-of-sight range, split into the band that raises suspicion and the
  // band that merely stops it falling. Kesta counts double and Warden Alder barely counts.
  watch() {
    const out = { n: 0, hold: 0, weight: 1, seen: false };
    const p = this.player?.pos;
    if (!p) return out;
    const list = [
      ...(this.world.watch?.() || []),
      ...(this.world.targets?.() || []).filter(t => t.kind === 'watch'),
    ];
    let heaviest = 0;
    for (const w of list) {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d > GRAFT.losRadius) continue;
      out.seen = true;
      if (d <= SUSPICION.radius) {
        out.n++;
        heaviest = Math.max(heaviest, w.weight ?? WATCH_WEIGHT[w.id] ?? WATCH_WEIGHT.watch);
      } else if (d <= SUSPICION.holdRadius) out.hold++;
    }
    if (out.n) out.weight = heaviest;
    return out;
  }

  indoorsHome() {
    if (!this.player?.floorY) return false;
    return this.quests.here.some(a => this.quests.areas[a]?.town === 'neutral');
  }

  graftStart() {
    const why = this.blocked();
    if (why) { this.hud.finish(false); this.audio.play('uiError'); this.hud.say(BLOCKED[why]); return; }
    this.audio.play('cast');
  }

  graftTap() {
    if (this.graft.worn) return this.unGraft();
    this.audio.play('uiError');
    this.hud.say('Hold it. Three counts.');
  }

  // Focus and the ash are spent on completion, never on the attempt: SYSTEMS §8.3 prices a Graft
  // at one Hearth Ash and nothing in the game makes ash, so a channel broken by a phone call must
  // not eat one. A failed channel costs the short cooldown and that is all.
  graftFail(text) {
    if (this.graft.worn) return;
    this.dropFace();
    if (!text) return;
    this.graft = { ...this.graft, cd: GRAFT.cooldown };
    this.audio.play('uiError');
    this.hud.say(text);
  }

  graftRelease() {
    if (this.graft.worn) return;
    if (this.hud.charge < 1) return this.graftFail('The channel broke.');
    const why = this.blocked();
    if (why) { this.audio.play('uiError'); this.hud.say(BLOCKED[why]); return; }
    this.chooseFace();
  }

  // The whole of spell selection. A Graft borrows one of the two sides and never Longacre, which
  // is the face you already have — so it is two buttons, not a spellbook.
  faces() { return FACTIONS.filter(f => f !== 'neutral' && f !== this.doc.faction); }

  chooseFace() {
    if (this.face) return;
    const card = el('div', 'g-prompt g-faces');
    // `.g-prompt` is a 55%-opacity hint sitting on the bottom edge, which is not what a choice
    // looks like. The rule belongs in game.css beside it; game.css is not mine this pass.
    card.style.cssText = 'opacity:1; flex-direction:row; justify-content:center; bottom:24%';
    card.append(el('span', null, 'Whose face?'));
    for (const f of this.faces()) {
      const b = el('button', null, nameOf(f));
      b.onclick = () => { this.dropFace(); this.graftInto(f); };
      card.append(b);
    }
    this.host.append(card);
    this.face = card;
    this.faceT = setTimeout(() => this.graftFail('The moment passed.'), 8000);
  }

  dropFace() {
    clearTimeout(this.faceT);
    this.face?.remove();
    this.face = null;
  }

  graftInto(faction) {
    const why = this.blocked();
    if (why) { this.audio.play('uiError'); this.hud.say(BLOCKED[why]); return false; }
    const after = vitals.spend(this.vitals, focusCost(SPELLS.graft, { guttered: this.vitals.guttered > 0 }), this.limits);
    if (!after.spent) { this.audio.play('uiError'); return false; }
    this.vitals = after;
    if (!this.atHomeHearth()) addItem(this.doc, ASH, -1);
    this.graft = startGraft(this.graft, faction, {
      glamour: levelIn(this.doc, 'glamour'),
      durationMul: this.knob.duration,
    });
    this.wear(faction);
    this.audio.play('uiConfirm');
    this.buzz(16);
    this.hud.say(`${nameOf(faction)}, until they look twice.`);
    this.quests.emit({ t: 'interact', id: 'self', verb: this.school, spell: 'graft' });
    this.autosave.mark();
    return true;
  }

  // `setZone` takes the APPEARANCE id (SYSTEMS §8.3) — it is what swaps the robe and the bolt
  // colour. The true faction never moves off `doc.faction`.
  wear(faction) {
    this.doc.worn = faction;
    this.suspicion = this.graft.susp;
    this.player?.setZone?.(faction || this.doc.faction);
    this.quests.draw();
  }

  unGraft(reason = 'voluntary') {
    if (!this.graft.worn) return 0;
    const r = endGraft(this.graft, { reason });
    this.graft = r.graft;
    this.wear(null);
    if (r.xp) this.gainXp('glamour', r.xp);
    this.audio.play(reason === 'expire' ? 'uiBlip' : 'uiConfirm');
    this.hud.say(reason === 'expire' ? 'Your own face, back again.' : 'You put your own face on.');
    this.autosave.mark();
    return r.xp;
  }

  // §8.3's comeback: the punishment lands and the game immediately hands back the other faction
  // for twenty seconds, with no ash and no channel.
  onBreak() {
    const worn = this.graft.worn;
    if (!worn) return;
    const b = breakGraft(this.doc.standing, worn);
    for (const f of FACTIONS) this.doc.standing[f] = b.standing[f];
    const r = endGraft(this.graft, { reason: 'break' });
    this.graft = startGraft(r.graft, b.freeGraft.faction, { seconds: b.freeGraft.seconds, free: true });
    this.wear(this.graft.worn);
    this.world.aggro?.(b.aggroRadius, this.player?.pos);
    this.audio.play('uiError');
    this.buzz(40);
    this.hud.say(`They have you. ${nameOf(b.freeGraft.faction)}, and be quick.`);
    this.autosave.mark();
  }

  graftTick(dt) {
    const near = this.watch();
    // §8.3's precondition holds for the whole channel, not just its first frame: a Watchman who
    // walks into line of sight while you are mid-cast ends it.
    if (!this.graft.worn && this.hud.held && this.context?.kind === 'graft' && near.seen) {
      this.hud.finish(false);
      this.graftFail('Someone saw you.');
    }
    const r = tickGraft(this.graft, dt, {
      watchmen: near.n,
      nearby: near.hold,
      watchWeight: near.weight,
      glamour: levelIn(this.doc, 'glamour'),
      indoorsLongacre: this.indoorsHome(),
      rateKnob: this.knob.suspicion,
    });
    this.graft = r.graft;
    this.suspicion = r.graft.susp;
    for (const e of r.events) {
      if (e === 'break') this.onBreak();
      else if (e === 'expire') this.unGraft('expire');
      else if (e.startsWith('tick')) this.audio.play('uiBlip');
    }
  }

  // ── the market ──────────────────────────────────────────────────────────

  sell(list) {
    const stall = this.market.stall;
    const all = wareRows(this.doc, { district: stall.town, now: Date.now() });
    const picked = list.map(l => ({ ...all.find(r => r.id === l.id), n: l.n }));
    const q = quote(picked, picked.map(p => p.id), this.doc, this.market.opts());
    this.doc.purse.marks += q.marks;
    this.doc.ledger = q.ledger;
    for (const line of q.lines) {
      addItem(this.doc, line.id, -line.n);
      this.quests.emit({ t: 'deliver', item: line.id, n: line.n, to: stall.vendor, via: 'sell' });
      this.gainXp('barter', transactionXp(itemTier(all.find(r => r.id === line.id).value), line.marks));
    }
    this.quests.standing('sell', { faction: stall.town, amount: q.marks });
    this.audio.play('uiConfirm');
    this.flash(`+${q.marks} mk`);
    this.autosave.flush();
  }

  // Marks are not on the HUD; they appear for two seconds after a transaction and go away again.
  flash(text) {
    const n = el('div', 'g-telegraph', text);
    this.host.append(n);
    setTimeout(() => n.remove(), 2400);
  }

  // ── §9.4 ────────────────────────────────────────────────────────────────

  free() {
    const areas = this.quests.areas || {};
    const p = this.player?.pos;
    if (!p || !Object.keys(areas).length) return;
    const at = nearestAnchor(areas, p.x, p.z);
    const y = this.world.groundAt?.(at.x, at.z, p.y);
    p.set(at.x, Number.isFinite(y) ? y : p.y, at.z);
    this.stuck = 0;
  }

  // The one door XP comes through outside the reducer. `sourceLevel` is only meaningful where
  // there is a source to out-level — a kill, a fishing spot — so it defaults to the player's own
  // level, which makes `tierMul` 1 and leaves the affinity row doing the work.
  gainXp(school, base, { sourceLevel = null, streak = 0 } = {}) {
    const playerLevel = levelIn(this.doc, school);
    this.quests.apply(['xp', school, grantXp({
      base, school, playerLevel, sourceLevel: sourceLevel ?? playerLevel, streak,
      faction: this.doc.faction, worn: this.doc.worn,
    })]);
  }

  // §9.4's `recover`, the four verbs the packs use 326 times. `grant` tops the stack up to what
  // the step needs instead of adding to it, so resetting a step twice cannot mint items.
  regrant(item, n = 1) {
    addItem(this.doc, item, Math.max(0, n - itemCount(this.doc, item)));
    return true;
  }

  recoverTo(area) {
    return this.placeAtArea(area, { far: true }) || this.noHook('moveTo', [area]);
  }

  // A verb the world cannot carry out yet — there is no enemy spawner and no armable-object
  // registry. Never a silent no-op: the player is told the reset did nothing, the console names
  // the hook that is missing, and `gaps` is the list the tests and the panel read.
  noHook(verb, args) {
    this.gaps.push([verb, ...args]);
    console.warn(`recover: the world has no ${verb}() — ${verb}(${args.join(', ')}) did nothing`);
    this.hud?.say(NO_HOOK[verb] || 'Nothing to put back.');
    return false;
  }

  // §9.4: pushing the stick and going nowhere for four seconds. Detected rather than waited for,
  // because a player wedged in a wall will not think to open a menu — but never teleported
  // without being asked, which would read as the game moving you for no reason.
  watchStuck(dt) {
    const p = this.player?.pos;
    if (!p || this.stick < 0.5) { this.from = null; return; }
    if (!this.from) this.from = { x: p.x, z: p.z, t: 0 };
    this.from.t += dt;
    if (Math.hypot(p.x - this.from.x, p.z - this.from.z) > STUCK_METRES) { this.from = null; return; }
    if (this.from.t < STUCK_SECONDS || this.freeing) return;
    this.from = null;
    this.freeing = true;
    const card = el('div', 'g-prompt');
    const b = el('button', null, 'Free yourself');
    b.onclick = () => { card.remove(); this.freeing = false; this.free(); };
    card.append(b);
    this.host.append(card);
    setTimeout(() => { card.remove(); this.freeing = false; }, 8000);
  }

  // ── audio beds and the bell ─────────────────────────────────────────────

  ringBell(bell) {
    this.hud.pulse('bell');
    const town = this.doc.campaign.current;
    if (town === 'neutral') return;               // Longacre rings nothing, and the silence is the point
    const n = { rising: 1, high: 2, setting: 3, low: 4 }[bell.id] || 1;
    if (town === 'dark') this.audio.play('horn', { level: 0.8 });
    else this.audio.strikes(n, { level: 0.9, range: RANGE.bell });
  }

  footsteps(dt) {
    const v = this.player?.vel;
    if (!v) return;
    const speed = Math.hypot(v.x, v.z);
    if (speed < 0.6) { this.step = 0; return; }
    this.step = (this.step || 0) + dt * (speed / (this.player.speed || 5));
    if (this.step < FOOTSTEP_EVERY) return;
    this.step = 0;
    this.audio.play(this.player.floorY ? 'footWood' : 'footGrass');
  }

  // ── the context button's target ─────────────────────────────────────────

  // Dialling Glamour is the spell selection: with Graft granted, your own face becomes the thing
  // the context button acts on, which is exactly how the pack authors it — `interact("self", 1)`.
  selfTarget() {
    const p = this.player?.pos;
    if (!p || this.school !== 'glamour') return null;
    // The grant walks every quest record, so it is cached and dropped when a quest state moves.
    if (this.canGraft === undefined) this.canGraft = this.graftGranted();
    if (!this.canGraft) return null;
    return { id: 'self', kind: 'graft', label: this.graft.worn ? 'unveil' : 'graft', x: p.x, z: p.z, range: 1 };
  }

  retarget() {
    const p = this.player?.pos;
    const list = p ? [...(this.world.targets?.() || []), this.selfTarget()].filter(Boolean) : [];
    let best = null, cost = Infinity;
    for (const t of list) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > (t.range || 4)) continue;
      // The same cost function the aim picker uses, so the button and the bolt agree on "nearest".
      const c = d * 0.06;
      if (c < cost) { cost = c; best = t; }
    }
    this.context = best;
    this.hud.setContext(best?.kind || null, best?.label || '');
  }

  obCtx() {
    this.ctxOb = {
      ...this.ob,
      target: !!this.context,
      contextKind: this.context?.kind || null,
      cleared: !!this.doc.flags['wwa.granary.clear'],
      schools: unlocked(this.doc).length,
      dialUsed: !!this.doc.onboard.dial,
    };
    return this.ctxOb;
  }

  hudState() {
    return {
      doc: this.doc,
      vitals: this.vitals,
      limits: this.limits,
      school: this.school,
      unlocked: unlocked(this.doc),
      faction: this.doc.worn || this.doc.faction,
      town: this.doc.campaign.current,
      t: this.clock.t,
      day: this.clock.day,
      suspicion: this.suspicion || 0,
      channelSeconds: this.context?.kind === 'graft' ? this.knob.channel : 1.2,
      graft: this.graft,
      buffs: this.graft.worn ? 1 : 0,
      holdAssist: this.doc.settings.holdAssist,
      prompt: this.uiBusy || this.dialogue.active || this.face ? null : this.prompt,
    };
  }

  update(dt) {
    if (this.paused) return;
    this.clock.tick(dt);
    const day = this.clock.day;
    if (day > this.doc.ledger.day) { this.doc = rollDay(this.doc, day); this.quests.doc = this.doc; this.quests.rollBoard(); }
    if (this.castRequest) { this.castRequest = false; this.cast(); }
    this.quests.update(dt, this.player?.pos);
    if (this.advanceRequest) { this.advanceRequest = false; this.dialogue.next(); }
    this.dialogue.tick(dt);

    this.limits = vitals.limits(this.doc.schools);
    this.vitals = vitals.tick(this.vitals, dt, this.limits);
    this.graftTick(dt);
    this.retarget();
    this.watchStuck(dt);
    this.footsteps(dt);
    this.quests.lost(dt, this.player?.pos, this.player?.camYaw);
    if (this.player?.pos) this.audio.at(this.player.pos.x, this.player.pos.z);
    this.audio.tick(dt, { hour: this.clock.hour, outdoor: !this.player?.floorY });

    const ctx = this.obCtx();
    const want = nextPrompt(ctx, this.doc.onboard);
    // A prompt stays up for four seconds and then goes, whether or not it was obeyed. It is not
    // retired — that only happens when the gesture is performed — it just stops shouting.
    if (want?.id !== this.prompt?.id) this.promptT = 0; else this.promptT += dt;
    if (want && this.promptT > HOLD) this.faded.add(want.id);
    this.prompt = want && !this.faded.has(want.id) ? want : null;
    if (!want) this.doc.onboard = settle(ctx, this.doc.onboard);
    this.hud.update(dt);

    this.doc.played += dt;
    this.autosave.tick(dt);
  }

  // §9.4's telegraph. One calm line, once per session, per band.
  telegraph(bandLevel) {
    const key = `band.${bandLevel}`;
    if (this.told.has(key) || !outclassed(this.doc, bandLevel)) return;
    this.told.add(key);
    this.hud.say('The Watch keeps this road.');
  }
}

export { POSITION };
