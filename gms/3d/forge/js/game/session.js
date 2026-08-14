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
import { blank, rollDay, checkPosition, POSITION, addItem } from './save.js';
import { appendLog } from './journal.js';
import { pins, basicOf, unlocked, outclassed } from './sheet.js';
import * as vitals from './vitals.js';
import { next as nextPrompt, settle, HOLD } from './onboard.js';
import { quote, rows as wareRows } from './sale.js';
import { FOOTSTEP_EVERY, RANGE } from './sounds.js';
import { focusCost } from '../sim/spells.js';
import { transactionXp, itemTier } from '../sim/economy.js';
import * as store from './savestore.js';
import { Autosave } from './savestore.js';

const LOOK_SCALE = 0.6;
const STUCK_SECONDS = 4;
const STUCK_METRES = 0.15;
const REACH = 400;

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
    this.ob = { looked: false, moved: false, cast: false, doorUsed: false, contextUsed: false, channelled: false };
    this.stuck = 0;
    this.lost = 0;
    this.told = new Set();
    this.context = null;
    this.faded = new Set();
    this.prompt = null;
    this.promptT = 0;
    this.stick = 0;

    const loaded = opts.fresh ? null : store.load();
    this.doc = loaded?.doc || blank(opts.seed);
    if (opts.campaign) { this.doc.campaign.current = opts.campaign; this.doc.faction = opts.campaign; }
    if (loaded?.error) this.notices.push(loaded.error);
    if (loaded?.warnings?.length) this.notices.push(...loaded.warnings);

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
      host: this.host, clock: this.clock, dialogue: this.dialogue,
      doc: this.doc, world: { ...this.world, sound: id => this.audio.play(id), uiBusy: () => this.uiBusy },
    });
    this.quests.onSave = () => this.autosave.flush();

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
  }

  async start(params = new URLSearchParams()) {
    this.dialogue.names = await fetch('data/cast.json').then(r => r.json()).catch(() => ({}));
    await this.quests.load();
    this.restorePosition();
    const want = params.get('quest');
    if (want && this.quests.defs[want]) this.jumpTo(want);
    this.doc.onboard = settle(this.obCtx(), this.doc.onboard);
    for (const bed of ['day', 'dusk', 'wind']) this.audio.ambience(bed, true);
    if (this.notices.length) this.notice(`This save was made by an older build. ${this.notices.length} things were adjusted.`);
    return this;
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
    const home = Object.values(areas).find(a => a.hearth)
      || (area && areas[area] ? areas[area] : null)
      || Object.values(areas)[0];
    if (!home || !this.player?.pos) return;
    const at = nearestAnchor({ [home.id]: home }, 0, 0);
    // The anchors are authored against the finished valley; Track A's world is still the demo,
    // and walking a player 500 m into terrain that does not exist yet is worse than not moving.
    if (!this.reachable(at)) return;
    const y = this.world.groundAt?.(at.x, at.z, 0);
    this.player.pos.set(at.x, Number.isFinite(y) ? y : this.player.pos.y, at.z);
  }

  // An anchor further away than the whole valley is an anchor from a world that is not loaded.
  reachable(at) {
    const p = this.player?.pos;
    return !!p && Number.isFinite(this.world.groundAt?.(at.x, at.z, 0))
      && Math.hypot(at.x - p.x, at.z - p.z) < REACH;
  }

  // §2.6's authoring loop: start any quest with its prereqs waived, standing in the right place.
  jumpTo(id) {
    this.quests.accept(id, true);
    const def = this.quests.defs[id];
    const area = def?.steps[0]?.in || def?.steps[0]?.objectives[0]?.area;
    const a = area && this.quests.areas[area];
    if (!a || !this.player?.pos) return;
    const at = nearestAnchor({ [a.id]: a }, 0, 0);
    if (!this.reachable(at)) return;
    const y = this.world.groundAt?.(at.x, at.z, 0);
    this.player.pos.set(at.x, Number.isFinite(y) ? y : this.player.pos.y, at.z);
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
    this.audio.play('uiConfirm');
    if (t?.id) this.quests.emit({ t: 'interact', id: t.id, verb: this.school });
  }

  channel(phase, kind) {
    if (phase === 'start') { this.audio.play(kind === 'work' ? 'lineCast' : 'cast'); return; }
    if (phase !== 'release') return;
    this.ob.channelled = true;
    this.act(kind);
  }

  talk(npc) {
    const node = this.quests.sceneFor(npc);
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
    this.quests.emit({ t: 'cast', school: this.school });
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
      this.quests.apply(['xp', 'barter', transactionXp(itemTier(all.find(r => r.id === line.id).value), line.marks)]);
    }
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

  retarget() {
    const p = this.player?.pos;
    const list = p ? (this.world.targets?.() || []) : [];
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
      buffs: 0,
      holdAssist: this.doc.settings.holdAssist,
      prompt: this.uiBusy || this.dialogue.active ? null : this.prompt,
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
