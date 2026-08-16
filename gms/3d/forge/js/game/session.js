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
import { nearestAnchor, lineage, contains } from './areas.js';
import { pickContext } from './context.js';
import { blank, rollDay, checkPosition, POSITION, addItem, itemCount, clampQuests } from './save.js';
import { acquire, power, critChance, resolveHit, damageTaken } from '../sim/combat.js';
import { ENEMIES, PERISHABLE } from '../sim/tables.js';
import { appendLog } from './journal.js';
import { pins, basicOf, unlocked, outclassed, levelIn } from './sheet.js';
import * as vitals from './vitals.js';
import { next as nextPrompt, settle, HOLD } from './onboard.js';
import { quote, rows as wareRows, itemName } from './sale.js';
import {
  KIND, COOK_SECONDS, NodeSet, harvest, newRun, tickRun, strike, cookChoice, cookOne, eat,
  handovers, gatherWants, rawOf, gatherEvent, cookEvent, deliverEvent,
} from './gathering.js';
import { nameOf, started } from './towns.js';
import { ESCORT, escortActors, escortWants, escortEvent, newEscort, stepEscort } from './escort.js';
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
const HEAL_SECONDS = 3;
const HOLD_RANGE = 5;

// The three ways a cast comes back with nothing. `nothing` is a strike inside the window that the
// catch table simply did not answer.
const MISS = {
  early: 'Too soon — the line comes back empty.',
  late: 'Too late — the line has gone slack.',
  nothing: 'Gone.',
};

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
    arm: id => world.arm?.(id) || hooks.missing('arm', id),
  };
}

export class Session {
  constructor(app, player, opts = {}) {
    this.app = app;
    this.player = player;
    this.world = opts.world || {};
    // The one source of chance on the combat side of the seam, injectable the way `Spawner` already
    // takes one: a crit is 1.3× and a level-1 bolt is 8 of a grain rat's 10 HP, so an unseeded 6 %
    // decides whether the opening shot of L01 kills outright, and a test that cannot pin it is a
    // test that fails one run in sixteen.
    this.rng = opts.rng || Math.random;
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
    this.nodes = new NodeSet(this.world.gatherNodes?.() || []);
    this.run = null;
    this.escorts = {};
    this.shown = new Set();
    this.working = null;
    this.cooking = null;
    this.healing = null;
    this.buffs = [];

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
    // Read here and not in `start()`: the session is in the frame loop while `start()` is still
    // fetching the packs, and `doc.played` counting those frames made every new game look like a
    // save in progress — so `beginCampaign()` never ran and light.01 was never accepted.
    this.resumed = started(this.doc);

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
    else if (this.switched || !this.resumed) this.beginCampaign();
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

  notice(text) {
    const n = el('div', 'g-card');
    n.append(el('p', null, text));
    const b = el('button', null, 'Go on');
    b.onclick = () => n.remove();
    n.append(b);
    this.host.append(n);
  }

  // The rig moves creatures from its own place in the frame loop, which this flag does not reach:
  // without `freeze` a rat caught mid-chase keeps walking at chase speed behind an open menu.
  pause(reason = 'menu') {
    this.pauses.add(reason);
    this.paused = true;
    this.clock.pause();
    this.world.freeze?.(true);
  }

  resume(reason = 'menu') {
    this.pauses.delete(reason);
    if (this.pauses.size) return;
    this.paused = false;
    this.clock.resume();
    this.world.freeze?.(false);
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
    if (t?.kind === 'give') return this.give(t.give);
    if (t?.kind === 'eat') return this.eatOne();
    if (t?.kind === 'work' || t?.kind === 'cook') return this.workTap();
    this.audio.play('uiConfirm');
    if (!t?.id) return;
    this.world.interact?.(t.id, this.school);
    this.quests.emit({ t: 'interact', id: t.id, verb: this.school });
  }

  // The hold ends on the kind that *started* it. `kind` here is whatever the context happens to be
  // when the HUD fires, and the context changes under a held thumb all the time — a delivery target
  // appearing, or walking out of range, which arrives as `cancel, null`. Dispatching on that let a
  // fire keep cooking and a line keep casting with nothing held, because `workStop` never ran.
  channel(phase, kind) {
    if (phase === 'start') {
      this.holdKind = kind;
      if (kind === 'graft') return this.graftStart();
      if (kind === 'work' || kind === 'cook') return this.workStart();
      this.audio.play('cast');
      return;
    }
    const held = this.holdKind ?? kind;
    this.holdKind = null;
    // Belt and braces: a run, a cook or an armed patch is a gather hold whatever either kind says.
    const gathering = !!(this.run || this.cooking || this.working);
    // A pointercancel is a phone call, not a mistake: nothing was charged, so nothing is taken.
    if (phase === 'cancel') {
      if (held === 'graft') this.graftFail(null);
      if (gathering || held === 'work' || held === 'cook') this.workStop();
      return;
    }
    if (phase !== 'release') return;
    this.ob.channelled = true;
    if (held === 'graft') return this.graftRelease();
    if (gathering || held === 'work' || held === 'cook') return this.workRelease();
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
    this.strike(spell);
    this.quests.emit({ t: 'cast', school: this.school, spell: idOf(spell) });
  }

  // ── the seam ────────────────────────────────────────────────────────────

  // A cast picks one target out of the world's living creatures with §4.6's cone-and-range picker
  // and tells the world what it took. Spells with no `coef` — Line, Forage, the Ward braces — pass
  // straight through: they are cast at the world, not at anything in it.
  //
  // One target only, so `split_bolt`'s second target and the `radius` of `cinderfall` and `bloom`
  // resolve as a single hit and `ember`'s burning ground does not exist. None of them is reachable
  // at tier 1; all of them are in NOTES_COMBAT.md's gap list.
  strike(spell) {
    const p = this.player?.pos;
    if (!spell?.coef || spell.cone == null || spell.range == null || !p) return null;
    const target = acquire(this.visibleFoes(), this.player.camYaw ?? 0, p, spell);
    if (!target) return null;
    const level = levelIn(this.doc, this.school);
    const r = resolveHit({
      power: power(level),
      coef: spell.coef,
      armour: target.armour || 0,
      critChance: critChance(level),
      rng: this.rng,
    });
    const killed = this.world.hit?.(target, r.damage)?.killed;
    this.audio.play(killed ? 'kill' : 'impact', { at: target });
    if (killed) this.kill(target);
    return { ...r, target, killed: !!killed };
  }

  // SYSTEMS §3.2's kill payout, the same one `tools/soak.mjs` models: every school the row pays
  // and is not immune to, its drops, its marks, and the vermin bounty toward Standing.
  kill(target) {
    const e = ENEMIES[target.enemy];
    if (!e) return;
    const streak = this.streakOf(`cull:${target.enemy}`);
    for (const [school, base] of Object.entries(e.xp)) {
      if (e.immune?.includes(school)) continue;
      this.gainXp(school, base, { sourceLevel: e.level, streak });
    }
    for (const [item, n] of e.drops || []) addItem(this.doc, item, n);
    this.doc.purse.marks += e.mk || 0;
    this.quests.standing('vermin', { faction: this.doc.campaign.current });
    this.buzz(18);
    // Where the body belongs, not where the player stands: the corpse's own area and the areas
    // that contain it. A rat shot from the granary doorway counts and one lured out into the
    // street still counts, but a rat that never entered the granary cannot tick a granary step
    // because the player happens to be standing in one. Only a creature nothing placed — no area
    // of its own — falls back to the player's.
    const where = lineage(this.quests.areas, target.area);
    this.quests.emit({
      t: 'kill', kind: target.enemy, area: target.area || null,
      areas: where.length ? where : this.quests.here,
    });
    this.autosave.mark();
  }

  // One action is one source key however many schools it pays, or a rat paying both Cull and
  // Kindle would reset its own streak. `tools/soak.mjs` counts them the same way.
  streakOf(key) {
    if (this.streakKey !== key) { this.streakKey = key; this.streakN = 0; }
    return this.streakN++;
  }

  // ── gathering, SYSTEMS §6 ───────────────────────────────────────────────

  nodeAt(id) { return id ? this.nodes.get(id) : null; }

  held() { return Object.fromEntries(this.doc.items.map(e => [e.id, e.n])); }

  // 0.9 s to strike on a thumb, 0.6 s on a mouse. `pointer: coarse` is the only test that gets a
  // touch laptop and a desktop with a touchscreen the right way round.
  touch() { return typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : true; }

  // A node costs its own school's tier-1 spell — this is fishing magic, not a button. §6.2 prices
  // a cast that draws no bite at full: no refund.
  spendFocus(kind) {
    const after = vitals.spend(this.vitals, focusCost(SPELLS[KIND[kind].spell],
      { guttered: this.vitals.guttered > 0 }), this.limits);
    if (!after.spent) { this.audio.play('uiError'); this.hud.say('Nothing left to cast with.'); return false; }
    this.vitals = after;
    return true;
  }

  // Says so out loud rather than answering quietly: a button that does nothing is the worst
  // feedback there is.
  nodeReady(node) {
    if (node.state === 'ready') return true;
    this.audio.play('uiError');
    this.hud.say('Nothing here yet.');
    return false;
  }

  setNode(node) {
    if (node) this.world.nodeState?.(node.id, node.state);
  }

  // The tap. Fishing and cooking are holds and say so; a patch or a seam is one action, so a tap
  // works the pick as well as the hold does.
  workTap() {
    if (this.run || this.cooking || this.working) return this.workRelease();
    const node = this.nodeAt(this.context?.id);
    if (!node) return;
    if (node.kind === 'fish') { this.audio.play('uiBlip'); this.hud.say('Hold the button to cast.'); return; }
    if (node.kind === 'hearth') { this.audio.play('uiBlip'); this.hud.say('Hold it over the fire.'); return; }
    if (!this.nodeReady(node) || !this.spendFocus(node.kind)) return;
    this.takeFrom(node);
  }

  workStart() {
    const node = this.nodeAt(this.context?.id);
    if (!node) { this.hud.finish(false); return; }
    if (node.kind === 'hearth') { this.cooking = { id: node.id, t: 0 }; this.audio.play('cast'); return; }
    if (!this.nodeReady(node)) { this.hud.finish(false); return; }
    if (node.kind !== 'fish') { this.working = node.id; this.audio.play('cast'); return; }
    if (!this.spendFocus('fish')) { this.hud.finish(false); return; }
    this.setNode(this.nodes.begin(node.id, this.doc.played));
    this.run = newRun(node, levelIn(this.doc, 'line'), { touch: this.touch() });
    this.audio.play('lineCast', { at: node });
  }

  workRelease() {
    const run = this.run, patch = this.nodeAt(this.working);
    this.workStop();
    if (run) {
      const r = strike(run, this.rng);
      if (r.caught) return this.landed(this.nodeAt(run.node), r.caught);
      this.audio.play('uiError');
      this.hud.say(MISS[r.why] || MISS.nothing);
      return;
    }
    if (patch && this.nodeReady(patch) && this.spendFocus(patch.kind)) this.takeFrom(patch);
  }

  // Ends the hold without working anything: a pointercancel is a phone call. The line coming in
  // puts a fishing spot straight back, because a spot is never used up.
  workStop() {
    this.hud.bite(false);
    if (this.run) { this.setNode(this.nodes.release(this.run.node)); this.run = null; }
    this.cooking = null;
    this.working = null;
  }

  takeFrom(node) {
    const levels = { forage: levelIn(this.doc, 'forage'), setting: levelIn(this.doc, 'setting') };
    const got = harvest(node, this.rng, levels);
    if (!got) { this.audio.play('uiError'); return; }
    this.setNode(this.nodes.begin(node.id, this.doc.played));
    this.setNode(this.nodes.finish(node.id, this.doc.played, this.rng, levels.forage));
    this.landed(node, got);
  }

  // Everything a node yields lands the same way. The event carries the *node's* area, not the
  // player's: a fish taken off the chalk stand credits a step scoped to the chalk stand however
  // far up the bank the player is standing.
  landed(node, got) {
    addItem(this.doc, got.item, got.n, got.perishable ? Date.now() : undefined);
    this.gainXp(got.school, got.xp, {
      sourceLevel: got.sourceLevel, streak: this.streakOf(`${got.school}:${node.id}`),
    });
    this.audio.play('uiConfirm');
    this.buzz(14);
    this.flash(`+${got.n} ${itemName(got.item)}`);
    this.quests.emit(gatherEvent(node, got));
    this.autosave.mark();
  }

  // §6.4. The cook steps are authored `via: "craft"`, so the event says so or the reducer refuses
  // it — a fish cooked at a fire is not a fish caught.
  cookOnce() {
    const node = this.nodeAt(this.cooking?.id);
    if (!node) return;
    const raw = cookChoice(gatherWants(this.quests.defs, this.doc.quests, this.quests.ctx()),
      this.held(), levelIn(this.doc, 'hearth'));
    if (!raw) { this.audio.play('uiError'); this.hud.say('Nothing to cook.'); this.hud.finish(false); return; }
    if (!this.spendFocus('hearth')) { this.hud.finish(false); return; }
    const r = cookOne(this.rng, raw, levelIn(this.doc, 'hearth'));
    addItem(this.doc, raw, -1);
    this.gainXp('hearth', r.xp, { sourceLevel: r.sourceLevel, streak: this.streakOf('hearth') });
    if (r.burnt) {
      this.audio.play('uiError');
      this.hud.say(`${itemName(raw)}, burnt.`);
      this.autosave.mark();
      return;
    }
    addItem(this.doc, r.item, 1);
    this.audio.play('uiConfirm');
    this.buzz(10);
    this.flash(`+1 ${itemName(r.item)}`);
    this.quests.emit(cookEvent(node, r.item));
    this.autosave.mark();
  }

  cookedInBag() { return this.doc.items.find(e => e.n > 0 && rawOf(e.id))?.id || null; }

  // The other half of Hearth. Dialling it with cooked food in the bag makes your own hands the
  // thing the context button acts on, which is also what `neutral.05`'s `interact self` asks for.
  eatOne() {
    const id = this.cookedInBag();
    const r = id && eat(id, levelIn(this.doc, 'hearth'));
    if (!r) { this.audio.play('uiError'); return; }
    addItem(this.doc, id, -1);
    this.healing = { rate: r.heal / HEAL_SECONDS, left: r.heal };
    if (r.buff) {
      this.buffs = [...this.buffs.filter(b => b.family !== r.buff.family),
        { family: r.buff.family, left: r.buff.seconds }].slice(-r.slots);
    }
    this.audio.play('uiConfirm');
    this.buzz(12);
    this.hud.say(`${itemName(id)}. That will hold.`);
    this.quests.emit({ t: 'interact', id: 'self', verb: 'hearth' });
    this.autosave.mark();
  }

  // §6.4's dish families. Only the two that are a limit are live: Ward and Kindle power are held
  // and shown on the HUD and change no damage — see NOTES_GATHER.md.
  buffed(l) {
    let out = l;
    for (const b of this.buffs) {
      if (b.family === 'focus') out = { ...out, regen: out.regen * 1.25 };
      if (b.family === 'hp') out = { ...out, hp: Math.round(out.hp * 1.12) };
    }
    return out;
  }

  // The last way a hold can outlive the thing it is working: walking from one fishing spot to
  // another swaps the target without changing the button's kind or its label, so `setContext`
  // returns early and no cancel is ever fired. HOLD_RANGE is the node's own 3.6 m reach plus slack,
  // so a step sideways does not put the line down.
  strayed() {
    const node = this.nodeAt(this.run?.node || this.cooking?.id || this.working);
    const p = this.player?.pos;
    if (!node || !p) return false;
    return Math.hypot(node.x - p.x, node.z - p.z) > HOLD_RANGE;
  }

  gatherTick(dt) {
    for (const id of this.nodes.tick(this.doc.played)) this.world.nodeState?.(id, 'ready');
    if (this.healing) {
      const step = Math.min(this.healing.left, this.healing.rate * dt);
      this.vitals = { ...this.vitals, hp: Math.min(this.limits.hp, this.vitals.hp + step) };
      this.healing.left -= step;
      if (this.healing.left <= 0) this.healing = null;
    }
    if (this.buffs.length) this.buffs = this.buffs.map(b => ({ ...b, left: b.left - dt })).filter(b => b.left > 0);
    if (this.strayed()) { this.hud.finish(false); this.workStop(); }
    if (this.cooking) {
      this.cooking.t += dt;
      if (this.cooking.t >= COOK_SECONDS) { this.cooking.t = 0; this.cookOnce(); }
      return;
    }
    if (!this.run) return;
    const r = tickRun(this.run, dt, this.rng);
    this.run = r.run;
    const at = this.nodeAt(this.run.node);
    if (r.event === 'bite') { this.hud.bite(true); this.audio.play('bite', { at }); this.buzz(20); }
    else if (r.event === 'lost') { this.hud.bite(false); this.audio.play('uiBlip'); }
    else if (r.event === 'recast') {
      if (this.spendFocus('fish')) this.audio.play('lineCast', { at });
      else this.hud.finish(false);
    }
  }

  // ── escort, the eighth verb ──────────────────────────────────────────────

  // `world.escort` owns the bodies; js/game/escort.js owns the rules. Arrival is judged on the
  // actor's own position, so walking to the destination without it credits nothing — and an actor
  // left far enough behind for long enough stops following until you come back for it.
  escortTick(dt) {
    const w = this.world.escort;
    const p = this.player?.pos;
    if (!w || !p) return;
    const wanted = escortActors(this.quests.defs, this.doc.quests);
    for (const npc of this.shown) {
      if (wanted.includes(npc)) continue;
      // A repeatable board job goes straight to `cooling` the moment it credits, and the player is
      // necessarily inside 30 m or the escort would have been lost — so taking the body away here
      // deleted the hen at the hen house door and snapped Fen back to Millbridge while they
      // watched. It waits until nobody is near enough to see it happen.
      const at = w.at(npc);
      if (at && Math.hypot(at.x - p.x, at.z - p.z) < ESCORT.lose) continue;
      // Park before hiding: hiding the hen takes its agent away, and `park` has nothing to move.
      w.park(npc);
      w.show(npc, false);
      this.shown.delete(npc);
    }
    for (const npc of wanted) if (!this.shown.has(npc)) { w.show(npc, true); this.shown.add(npc); }

    const live = escortWants(this.quests.defs, this.doc.quests, this.quests.ctx());
    for (const npc of Object.keys(this.escorts)) {
      if (!live.some(l => l.npc === npc)) delete this.escorts[npc];
    }
    for (const l of live) {
      const at = w.at(l.npc);
      if (!at) continue;
      const st = this.escorts[l.npc] || (this.escorts[l.npc] = newEscort(l.npc, l.path));
      const r = stepEscort(st, dt, {
        px: p.x, pz: p.z, ax: at.x, az: at.z, speed: w.speed(l.npc),
        inPath: !l.path || contains(this.quests.areas[l.path], at.x, at.z),
      });
      this.escorts[l.npc] = r.state;
      w.move(l.npc, r.x, r.z, r.heading);
      if (r.event === 'arrive') {
        this.quests.emit(escortEvent(r.state));
        this.audio.play('uiConfirm');
        this.autosave.mark();
      } else if (r.event === 'lost') {
        this.hud.say(`${this.dialogue.names[l.npc] || l.npc} is not with you.`);
        this.audio.play('uiError');
      } else if (r.event === 'found') this.audio.play('uiBlip');
    }
  }

  // The hand-overs a live step is waiting for right here. A target that is an area is handed over
  // by standing in it, so it sits on the player at zero distance and `yields` like the eat target
  // does — without that it wins every tie and hides the fire, the seams and the stall it is
  // standing on top of. A target that is a person or a prop sits on their body and takes the place
  // of talking to them, which is the point: carrying Hana's loaves to Hana is not small talk.
  giveTargets(from) {
    const p = this.player?.pos;
    if (!p || !this.doc.items.length) return [];
    const body = id => from.find(t => t.id === id) || null;
    const out = [];
    const list = handovers(this.quests.defs, this.doc.quests, this.quests.ctx(),
      { held: this.held(), here: this.quests.here, at: body });
    for (const h of list) {
      if (out.some(o => o.id === h.to)) continue;
      out.push({
        id: h.to, kind: 'give', label: 'give', give: h, yields: !h.body,
        x: h.body ? h.body.x : p.x, z: h.body ? h.body.z : p.z, range: h.body ? 3.6 : 1,
      });
    }
    return out;
  }

  give(h) {
    const n = h ? Math.min(h.n, itemCount(this.doc, h.item)) : 0;
    if (n <= 0) { this.audio.play('uiError'); return; }
    addItem(this.doc, h.item, -n);
    this.audio.play('uiConfirm');
    this.buzz(12);
    this.flash(`${n} ${itemName(h.item)}`);
    this.quests.emit(deliverEvent({ ...h, n }));
    this.autosave.mark();
  }

  // The enemy's side. Driven from here rather than from the frame loop so that everything that
  // pauses the game — a menu, the journal, the market, a hidden tab — also stops the creatures.
  combat(dt) {
    this.world.tick?.(dt);
    for (const blow of this.world.strikes?.() || []) {
      this.vitals = vitals.hurt(this.vitals, damageTaken(blow.damage, this.limits.ward));
      this.audio.play('impact', { at: blow, level: 0.7 });
      this.buzz(24);
      if (vitals.down(this.vitals)) { this.gutter(); return; }
    }
  }

  // SYSTEMS §5.3: the staff goes out and you wake at the hearth, 8% of your carried marks and half
  // your unbanked perishables lighter. No XP loss, no corpse run — §9.4 calls it a lesson.
  gutter() {
    const loss = vitals.gutter(this.doc, this.doc.campaign.echoes?.includes('white_cord'));
    this.doc.purse.marks = Math.max(0, this.doc.purse.marks - loss.marks);
    for (const e of this.doc.items) if (PERISHABLE.has(e.id)) e.n = Math.floor(e.n * loss.perishables);
    this.doc.items = this.doc.items.filter(e => e.n > 0);
    this.spawnAtHearth(this.quests.here[0]);
    this.vitals = vitals.blank(this.doc.schools, { hp: null, focus: 0 });
    this.audio.play('uiError');
    this.buzz(60);
    this.hud.say('The staff goes out. You wake at the hearth.');
    this.autosave.flush();
    return loss;
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
    if (!p) return null;
    if (this.school === 'hearth' && this.cookedInBag()) {
      return { id: 'self', kind: 'eat', label: 'eat', x: p.x, z: p.z, range: 1, yields: true };
    }
    if (this.school !== 'glamour') return null;
    // The grant walks every quest record, so it is cached and dropped when a quest state moves.
    if (this.canGraft === undefined) this.canGraft = this.graftGranted();
    if (!this.canGraft) return null;
    return { id: 'self', kind: 'graft', label: this.graft.worn ? 'unveil' : 'graft', x: p.x, z: p.z, range: 1 };
  }

  retarget() {
    const p = this.player?.pos;
    const from = p ? (this.world.targets?.() || []) : [];
    const give = p ? this.giveTargets(from) : [];
    // A hand-over replaces whatever else that body offers: carrying Hana's loaves to Hana should
    // not open her small talk instead.
    const list = p
      ? [...give, ...from.filter(t => !give.some(g => g.id === t.id)), this.selfTarget()]
      : [];
    const best = pickContext(list, p);
    this.context = best;
    const wants = best?.kind === 'interact' ? this.quests.verbFor(best.id) : null;
    this.hud.setContext(best?.kind || null, wants || best?.label || '');
  }

  // What the bolt can reach, not what the cone covers: without this the damage lands on a rat 14 m
  // away through a wall the bolt visibly stops 2.8 m in front of.
  visibleFoes() {
    const p = this.player?.pos;
    if (!p) return [];
    return (this.world.foes?.() || []).filter(f => this.world.sight?.(p, f) !== false);
  }

  // Range and line of sight — the two gates `strike()` applies before its cone, so the prompt can
  // no longer arm for a rat through a wall and teach the tap with a bolt that hits nothing. Not the
  // cone as well: measured over 40 granary fills it flips six times in thirty seconds of turning,
  // and a teaching prompt that blinks teaches nothing.
  foeNear() {
    const p = this.player?.pos;
    const range = basicOf(this.school, this.doc.worn || this.doc.faction)?.range;
    if (!p || !range) return false;
    return this.visibleFoes().some(f => Math.hypot(f.x - p.x, f.z - p.z) <= range);
  }

  obCtx() {
    this.ctxOb = {
      ...this.ob,
      // A raycast per creature, so it is not asked once the only prompt that reads it is retired.
      foe: !(this.ob.cast || this.doc.onboard.cast) && this.foeNear(),
      target: !!this.context,
      contextKind: this.context?.kind || null,
      cleared: !!this.doc.flags['wwa.granary.clear'],
      schools: unlocked(this.doc).length,
      dialUsed: !!this.doc.onboard.dial,
    };
    return this.ctxOb;
  }

  // What the charge ring is measuring this frame. On a bite it measures the strike window, and
  // `hud.bite` inverts it, so the ring drains as the fish decides.
  channelSeconds() {
    if (this.context?.kind === 'graft') return this.knob.channel;
    if (this.run) return this.run.phase === 'bite' ? this.run.window : this.run.wait;
    if (this.cooking) return COOK_SECONDS;
    return 1.2;
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
      channelSeconds: this.channelSeconds(),
      graft: this.graft,
      buffs: this.buffs.length + (this.graft.worn ? 1 : 0),
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

    this.limits = this.buffed(vitals.limits(this.doc.schools));
    this.vitals = vitals.tick(this.vitals, dt, this.limits);
    this.combat(dt);
    this.gatherTick(dt);
    this.escortTick(dt);
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
