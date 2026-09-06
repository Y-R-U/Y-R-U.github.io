// The play session: the save document, the settings, the pause menu, the hotspot runtime and the
// dialogue bubble. Nothing here is constructed under ?shot= or in the editor (js/game/boot.js §0).

import { toast } from './ui.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { DialogueBox } from './dialoguebox.js';
import { Anchors } from './bubble.js';
import { Voice } from './voice.js';
import { Barks } from './barks.js';
import { Noticeboard, nudge } from './noticeboard.js';
import { WorldTap } from './worldtap.js';
import { Hotspots } from './hotspots.js';
import { runActions } from './actions.js';
import { blank, docView } from './save.js';
import { load, Autosave } from './savestore.js';
import { resolve, setDial, pickPreset, autoChoice, DIALS, AUTO_AFTER } from './graphics.js';
import { floorRank, mayEnterFloor, topFloorFor, rankOf, RANK_LABEL } from './contracts.js';
import { el } from './ui.js';
import { Combat } from './combat.js';
import { EssenceSheet } from './essencesheet.js';
import { InteractMenu, SpellList, optionsFor } from './interactmenu.js';
import { load as loadEssences, held as heldEssences } from './essences.js';
import { Casting } from './casting.js';
import { HealthBars } from './healthbars.js';
import { ARENA, jobFor, briefOf, patchArena, worthOf, wavesOf, objectiveOf, secondsOf } from './missions.js';
import { award, promote as promoteRank, sheet as progressSheet, XP_FLAG, STARS } from './progress.js';
import { PlayerSheet } from './sheet.js';
import { MissionPanel } from './missionpanel.js';

// Where the proving puts you back: in front of the Registrar's desk on the ground floor, facing
// her, and inside the building rather than out on the road. `inside` is the door index the swap
// stands the room up through — see js/game/levelswap.js.
const BACK_TO_DESK = { x: -9.5, z: -22.5, yaw: 3.14159, inside: 0 };

export class Session {
  constructor(app, player, opts) {
    this.app = app;
    this.player = player;
    this.o = opts;
    this.host = opts.host;
    this.level = opts.level;
    this.characters = opts.characters;
    this.swap = opts.swap || null;

    const restored = load()?.doc;
    this.doc = restored || blank(Date.now());
    this.doc.level = this.doc.level || this.level.id;

    this.bus = new EventTarget();
    // Object.assign, not a spread: a spread would read docView's getters once and hand the
    // context the very objects it exists to stop it holding.
    this.ctx = Object.assign(docView(() => this.doc), {
      say: id => this.say(id),
      goto: (id, at) => this.gotoLevel(id, at),
      emit: (name, data) => this.bus.dispatchEvent(new CustomEvent(name, { detail: data })),
      characterAt: id => this.characters?.at(id) || null,
      screen: id => this.showScreen(id),
      bark: a => this.bark(a),
      promote: () => this.promote(),
    });

    this.hotspots = new Hotspots(this.level.hotspots || [], this.ctx);

    this.board = new Noticeboard({
      host: this.host,
      flags: () => this.doc.flags,
      onOpen: id => { if (id === 'board.new') nudge(this.host); },
      onTake: id => this.takeContract(id),
    });

    this.voice = new Voice({
      cast: this.characters?.cast || {},
      settings: () => this.doc.settings,
    });

    this.barks = new Barks({
      voice: this.voice,
      cast: this.characters?.cast || {},
      busy: () => this.dialogue.active || this.board.open || !!this.essences?.open || this.menuAt.open || this.spells.open,
    });

    this.anchors = new Anchors({
      app,
      characters: this.characters,
      obstacles: [opts.world?.object3D, opts.doors?.object3D].filter(Boolean),
    });

    this.dialogue = new DialogueBox({
      host: this.host,
      player,
      names: opts.names || {},
      ctx: () => this.ctx.world(),
      // The results were dropped, so a bad action in authored data failed in total silence —
      // runActions deliberately never throws, which means this is the only place it can be seen.
      effects: sets => runActions(sets, this.ctx)
        .filter(r => !r.ok)
        .map(r => (console.warn(`action "${r.k}" did nothing: ${r.why}`), r)),
      anchors: this.anchors,
      voice: this.voice,
    });
    this.dialogue.load(opts.conversations || {});

    // What the engine picked off the device, kept as the fallback for a save that has never
    // chosen — so a desktop stays on the high it booted at and a phone on medium.
    this.autoPreset = app.quality.presetName;

    this.menu = new Menu({
      host: this.host,
      settings: () => this.doc.settings,
      autoPreset: () => this.autoPreset,
      presetNote: () => 'Lower the graphics preset if the game stutters. It is remembered.',
      where: () => this.level.name,
      onSetting: (k, v) => this.setSetting(k, v),
      onFree: () => this.freePlayer(),
      onOpen: () => { this.paused = true; document.body.classList.add('paused'); },
      onClose: () => { this.paused = false; document.body.classList.remove('paused'); },
    });

    this.hud = new Hud({
      host: this.host,
      onMenu: () => this.menu.toggle(),
      onInteract: () => this.interact(),
      // The essence table is loaded lazily, so opening the sheet is what pays for it — a save that
      // never registers never loads a table of sixty abilities to show four of them.
      onSheet: () => this.openSheet(),
    });

    // A tap in the 3D view fires whichever `click` hotspot contains the point the ray landed on,
    // which is what makes the boards tappable from across the hall as well as from arm's length.
    this.tap = new WorldTap({
      app,
      stage: document.getElementById('stage'),
      blocked: () => this.menu.open || this.board.open || this.dialogue.active
        || !!this.essences?.open || this.spells.open || !!this.sheet?.open,
      onPoint: p => this.hotspots.press(p, ['click']),
      onAlt: (p, screen) => this.openInteract(p, screen),
    });

    this.menuAt = new InteractMenu({
      host: this.host,
      onPick: id => this.interactPick(id),
    });
    this.spells = new SpellList({
      host: this.host,
      abilities: () => this.awakened(),
      state: a => this.casting?.state(a),
      onCast: a => this.castSpell(a),
    });

    this.heads = new HealthBars({ app, host: this.host });
    this.mission = new MissionPanel({ host: this.host });
    this.sheet = new PlayerSheet({
      host: this.host,
      progress: () => this.progress(),
      essences: () => (this.essences?.doc ? heldEssences(this.essences.doc, this.doc.essences) : null),
      abilities: () => this.awakened(),
      marks: () => this.doc.items.marks || 0,
      contract: () => this.activeContract(),
      played: () => this.doc.played,
    });

    this.installStairGate(opts.doors);
    this.combat = new Combat({ app, player, level: this.level, session: this });
    // Casting is installed on every level, not only ones with something to fight: Vail tells you
    // to go and try it somewhere the ceiling is not hers, and a game that answers that with
    // nothing would be lying about what it just gave you.
    this.casting = new Casting({ app, player, session: this, combat: this.combat });
    this.installCombat();
    this.installMissions();
    // A save reloaded mid-contract still has one in hand.
    this.mission.set(this.activeContract());
    // A save from before the ladder existed has no standing flags, and the Registrar's promotion
    // hotspot is gated on them. Derived rather than stored is the rule; these are the cache.
    this.syncStanding();
    this.applySettings();
    this.autosave = new Autosave(() => this.snapshot());
  }

  // The proving, as the only thing in the game that currently cares who won a fight. `combat.js`
  // reports an outcome and knows nothing about ranks or registers; what an outcome *means* is a
  // question about this quest, and it is answered here.
  installCombat() {
    this.bus.addEventListener('proving.begin', () => {
      if (this.combat.begin()) this.toast('Keep it off the dirt.', { ms: 5000 });
    });
    this.bus.addEventListener('combat.end', e => {
      const won = e.detail?.outcome === 'won';
      if (this.level.id === ARENA) return this.finishContract(won);
      if (this.level.id !== 'proving') return;
      if (won) {
        this.doc.flags['society.test.passed'] = true;
        this.autosave.mark();
        this.toast('The elemental is gravel. Back to the desk.', { ms: 4200 });
        // Long enough to watch it come apart. `at` puts the player back in front of the Registrar
        // rather than at the Society's own start, which is out on the road.
        setTimeout(() => this.gotoLevel('society', BACK_TO_DESK), 2600);
      } else {
        this.toast('Down. The Society picks you up and charges you for it.', { ms: 4200 });
        setTimeout(() => this.gotoLevel('society', BACK_TO_DESK), 2600);
      }
    });
  }

  // ── contracts ────────────────────────────────────────────────────────────
  // Taking one off the board is a level swap into the arena with the contract's own four axes
  // painted on it (js/game/missions.js). What comes back is an outcome, and what an outcome means
  // is a question about the Society — which is why it is answered here and not in combat.js.

  takeContract(jobId) {
    const job = jobFor(jobId);
    if (!job?.mission) { this.toast('Nothing to walk to on that one yet.', { ms: 3000, level: 'g-low' }); return false; }
    if (this.level.id === ARENA) { this.toast('Finish the one you are on.', { ms: 2600, level: 'g-low' }); return false; }
    this.board.close();
    this.doc.flags['contract.active'] = jobId;
    this.autosave.mark();
    const brief = briefOf(jobId);
    this.mission?.set(brief);
    this.gotoLevel(ARENA, null, raw => patchArena(raw, job.mission, job));
    // No toast here: the panel names the contract the moment it is taken, and the arrival at the
    // gate says what is being asked and what is in the room. Two of them landed together.
    return true;
  }

  activeContract() {
    const id = this.doc.flags['contract.active'];
    return id ? briefOf(id) : null;
  }

  // Both the arena and the proving room begin their fight on a hotspot rather than on load, so a
  // player who walks in and reads the room is not jumped by something that spawned behind them.
  installMissions() {
    this.bus.addEventListener('mission.begin', () => {
      const b = this.activeContract();
      if (!this.combat.begin()) return;
      // The mission's own clock, which is what a `survive` contract is and what sends the waves.
      // Null for a contract with neither, so a plain `clear` pays nothing for the feature.
      this.run = (b && (b.objective === 'survive' || b.waves))
        ? { t: 0, seconds: b.seconds, objective: b.objective, waves: wavesOf(b.mission) }
        : null;
      this.combat.expecting = !!this.run?.waves.length;
      this.toast(b ? `${b.asks} — ${b.foes}. ${b.note}` : 'Clear the floor.', { ms: 6000 });
    });
  }

  // One frame of the contract in hand. Waves arrive on it, and a `survive` contract is won on it —
  // by outlasting the clock, or by clearing the floor early once nothing more is coming.
  runMission(dt) {
    const r = this.run;
    if (!r || this.combat.ended) return;
    r.t += dt;
    // On a contract you *clear*, an empty floor with a wave still to come is the player standing
    // about waiting for a clock they cannot see. The next group comes forward instead — the wave
    // exists to make the fight two acts, not to make it longer. A `survive` contract keeps its
    // clock, because there the clock is the whole objective.
    if (r.objective !== 'survive' && r.waves.length && !this.combat.active) {
      r.waves[0].at = Math.min(r.waves[0].at, r.t + 1.2);
    }
    while (r.waves.length && r.t >= r.waves[0].at) {
      const w = r.waves.shift();
      this.combat.reinforce(w.spawns);
      this.toast('Something else is coming.', { ms: 2600, level: 'g-low' });
    }
    this.combat.expecting = r.waves.length > 0;
    if (r.objective === 'survive' && r.t >= r.seconds) {
      this.run = null;
      this.combat.finish('won');
    }
  }

  // What the panel counts down. Null when there is nothing to count.
  missionLeft() {
    const r = this.run;
    if (!r || r.objective !== 'survive') return null;
    return Math.max(0, Math.ceil(r.seconds - r.t));
  }

  // Won, and the Society writes it down. Experience is the room's own worth, off the bestiary, so
  // a contract that swapped in a bigger monster pays more without a number being edited anywhere.
  finishContract(won) {
    const id = this.doc.flags['contract.active'];
    const job = id ? jobFor(id) : null;
    if (!job) return this.gotoLevel('society', BACK_TO_DESK);
    if (!won) {
      this.toast('Down, and the contract stands unfinished.', { ms: 4400 });
      return void setTimeout(() => this.gotoLevel('society', BACK_TO_DESK), 2600);
    }
    this.run = null;
    const gain = worthOf(job.mission);
    const r = award(this.doc.flags, gain);
    this.doc.flags[XP_FLAG] = r.xp;
    this.doc.flags[`contract.done.${id}`] = true;
    this.doc.flags['contract.active'] = null;
    this.syncStanding();
    this.doc.items.marks = (this.doc.items.marks || 0) + job.reward;
    this.autosave.mark();
    this.mission?.set(null);
    // One line, not three. The toast slot holds one at a time now, and a win, a star and a
    // promotion inside four seconds used to be three of them drawn on top of each other.
    const star = r.starGained
      ? ` ${r.after.stars} ${r.after.stars === 1 ? 'star' : 'stars'} at ${r.after.rankLabel}.`
      : '';
    this.toast(`${job.name} — closed. ${gain} experience, ${job.reward} marks.${star}`, { ms: 5600 });
    // The promotion is its own beat and worth waiting for: it is the only thing on the ladder the
    // player has to go and ask a person for.
    if (r.rankReady) {
      setTimeout(() => this.toast(`Four stars. Speak to the desk about ${r.after.nextRankLabel} rank.`, { ms: 6500 }), 6000);
    }
    setTimeout(() => this.gotoLevel('society', BACK_TO_DESK), 2800);
  }

  progress() { return progressSheet(this.doc.flags); }

  // Two derived flags, written whenever the ladder moves. The predicate language compares a flag
  // to a value and cannot do arithmetic (js/game/predicate.js), so "four stars and there is a rung
  // above" has to be a flag rather than a rule a hotspot can express — and a hotspot is where the
  // Registrar's promotion conversation has to be gated.
  syncStanding() {
    const p = this.progress();
    this.doc.flags['society.stars'] = p.stars;
    this.doc.flags['society.promotable'] = p.registered && p.stars >= STARS && !!p.nextRank;
    return p;
  }

  // The Society raising you. `progress.promote()` is the ladder and answers null below four stars,
  // so a conversation reachable in a state it should not have been fails loudly rather than
  // handing out a rank.
  promote() {
    const up = promoteRank(this.doc.flags);
    if (!up) return false;
    Object.assign(this.doc.flags, { 'society.rank': up.to });
    this.syncStanding();
    this.autosave.mark();
    this.bus.dispatchEvent(new CustomEvent('society.promoted', { detail: up }));
    return up;
  }

  // The stair is the rank ladder. js/world/climb.js asks before it takes the player over, so a
  // floor you have not earned is a walk that never starts rather than a climb that is undone at
  // the top — and the answer is a conversation, because being turned back by a person is the
  // whole point of having a warden standing at the foot of the flight.
  installStairGate(doors) {
    if (!doors) return;
    // Two halves of one rule. `floorLimit` closes the flight itself, so a rank you have not earned
    // cannot be walked past by hand; `gate` refuses the scripted climb before it starts, so being
    // turned back is a person saying so rather than a wall you bounce off.
    doors.floorLimit = () => topFloorFor(rankOf(this.doc.flags));
    const climb = doors.climb;
    if (!climb) return;
    climb.gate = (from, to) => {
      if (to <= from) return null;                       // going down is always allowed
      const rank = rankOf(this.doc.flags);
      if (mayEnterFloor(to, rank)) return null;
      return floorRank(to) || 'higher';
    };
  }

  // Drained rather than handled inside the gate: the gate runs deep in the movement update, and
  // opening a dialogue box from there would fire it on the frame the player is still being
  // resolved against the world.
  stairRefusal() {
    const climb = this.o.doors?.climb;
    const r = climb?.refused;
    if (!r) return;
    climb.refused = null;
    if (this.dialogue.active || this.board.open || this.menu.open) return;
    const node = `society.stair.refuse.${r.why}`;
    if (!this.say(node)) {
      this.toast(`${RANK_LABEL[r.why]} rank and above beyond this point.`);
    }
  }

  snapshot() {
    this.doc.level = this.level.id;
    this.doc.at = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
    return this.doc;
  }

  // Graphics keys go through js/game/graphics.js, which decides whether a change is a new preset
  // or an override of one of that preset's two dials. Everything else is written straight down.
  setSetting(key, value) {
    const patch = key === 'preset' ? pickPreset(value)
      : DIALS.includes(key) ? setDial(this.doc.settings, key, value, this.autoPreset)
        : { [key]: value };
    Object.assign(this.doc.settings, patch);
    this.applySettings();
    this.autosave.mark();
  }

  applySettings() {
    const s = this.doc.settings;
    const g = resolve(s, this.autoPreset);
    if (g.preset !== this.app.quality.presetName) this.app.quality.usePreset(g.preset);
    for (const k of DIALS) if (this.app.quality.get(k) !== g[k]) this.app.quality.set(k, g[k]);
    document.documentElement.style.setProperty('--ui', String(s.uiScale));
    document.body.classList.toggle('flip', !!s.flip);
    if (this.player.input) this.player.input.flip = !!s.flip;
    this.app.quality.set('flipTouch', !!s.flip);
  }

  // One-off, and only for a save that has never chosen: six seconds of measured frames on a
  // machine that cannot hold 40 fps steps the preset down once and writes that down, so the
  // player is not left staring at the one control they have not found yet.
  autoDetect(dt) {
    if (this.doc.settings.preset || this.autoDone) return;
    this.autoAge = (this.autoAge || 0) + dt;
    if (this.autoAge < AUTO_AFTER) return;
    this.autoDone = true;
    const pick = autoChoice(this.app.stats.read().fps, this.autoPreset);
    if (!pick) return;
    Object.assign(this.doc.settings, pickPreset(pick.preset));
    this.applySettings();
    this.autosave.mark();
    if (pick.lowered) this.toast(`Graphics set to ${resolve(this.doc.settings).label} — change it in Settings.`);
  }

  // data/barks.json and the bark half of data/vo.json are fetched on the first bark and never at
  // all if nothing barks, so a level with no bark action pays nothing for the feature. The request
  // that triggered the load is replayed once it lands rather than dropped.
  bark(a) {
    const who = a?.who, category = a?.category || 'idle';
    if (this.barks.docs) return this.barks.say(who, category);
    this.loadBarks().then(() => this.barks.say(who, category));
    return null;
  }

  loadBarks() {
    if (!this.barkLoad) {
      const get = p => fetch(p).then(r => (r.ok ? r.json() : null)).catch(() => null);
      this.barkLoad = Promise.all([get('data/barks.json'), get('data/vo.json')])
        .then(([b, v]) => this.barks.setDocs(b, v));
    }
    return this.barkLoad;
  }

  say(nodeId) {
    if (this.board.open) this.board.close();
    this.essences?.close();
    return !!this.dialogue.play(nodeId);
  }

  // Which NPCs a conversation on screen is holding still. js/main.js hands this to the crowd rig,
  // which asks it every frame — see DialogueBox.talkers().
  talkers() { return this.dialogue.talkers(); }

  // `screen` ids are a flat space (DEV_CONTRACT §10). The boards own theirs; the essence table
  // owns one, and is loaded on the first request rather than at boot — a save that never reaches
  // the proving never pays for a table of sixty abilities.
  // Right-click, or a long press. `p` is where the ray landed in the world and `screen` where the
  // pointer was, because the menu is placed on screen and its contents come from the world.
  openInteract(p, screen) {
    // What is under the pointer first, then whatever is within reach of the player: a right-click
    // on empty floor beside somebody should still offer to talk to them.
    const target = (p && this.hotspots.candidates(p, ['interact', 'click'])[0])
      || this.hotspots.candidates(this.player.pos, ['interact'])[0]
      || null;
    this.altTarget = target;
    this.menuAt.show(screen || { x: innerWidth / 2, y: innerHeight / 2 }, optionsFor({
      target,
      abilities: this.awakened(),
      // No economy yet, and no character declares itself a trader. It stays honestly closed.
      canTrade: false,
    }));
  }

  interactPick(id) {
    if (id === 'spell') return this.spells.show();
    if (id === 'talk') {
      const h = this.altTarget;
      if (h) this.hotspots.fire(h, this.hotspots.state.get(h.id));
      else this.toast('Nobody in reach.', { ms: 2400, level: 'g-low' });
      return true;
    }
    return false;
  }

  // What the save has actually awakened, resolved against the table if it is loaded. Before the
  // essence table has ever been opened this is empty, which is the honest answer.
  // Memoised on the exact list the save holds and the table that resolved it: this is read every
  // frame for the mana bar, and it walks every essence and confluence row to do it.
  awakened() {
    const doc = this.essences?.doc;
    const saved = this.doc.essences;
    if (!doc || !saved?.abilities?.length) return [];
    const key = `${saved.abilities.join(',')}|${saved.confluence}`;
    if (this.awokeKey === key && this.awokeDoc === doc) return this.awoke;
    const out = [];
    const rows = [...Object.values(doc.essences), ...doc.confluences];
    for (const id of saved.abilities) {
      for (const r of rows) {
        const a = r.abilities.find(x => x.id === id);
        // `from` is what js/game/spells.js looks the palette up by, and `confluence` is what tells
        // it to blend the three instead. Dropping either was why the fourth spell came out white.
        if (a) { out.push({ ...a, from: r.id, fromName: r.name, confluence: !doc.essences[r.id] }); break; }
      }
    }
    this.awokeKey = key;
    this.awokeDoc = doc;
    this.awoke = out;
    this.casting?.setSlots(out);
    return out;
  }

  // One route in for both ways of casting — the sheet under the interact menu, and the number
  // keys. A refusal is said out loud: mana that quietly does nothing is the same to a player as a
  // broken button.
  castSpell(a) {
    if (!a) return false;
    const r = this.casting.cast(a);
    if (!r.ok) { this.toast(r.why, { ms: 2600, level: 'g-low' }); return false; }
    this.bus.dispatchEvent(new CustomEvent('spell.cast', { detail: { id: a.id, target: r.target } }));
    return true;
  }

  // Drained here rather than in the player, for the reason stairRefusal() is: the press happens
  // deep inside the movement update, and a cast resolved from there would spawn particles against
  // a player position that is still being pushed out of a wall.
  drainCast() {
    const slot = this.player.spellEdge;
    if (slot == null) return;
    this.player.spellEdge = null;
    if (this.dialogue.active || this.board.open || this.menu.open || this.essences?.open) return;
    const list = this.awakened();
    const a = list[slot];
    if (!a) {
      if (list.length) this.toast(`Nothing in slot ${slot + 1}.`, { ms: 2000, level: 'g-low' });
      else this.toast('No essences yet.', { ms: 2400, level: 'g-low' });
      return;
    }
    this.castSpell(a);
  }

  // The sheet needs the essence table to name what the player took, and that table is fetched on
  // first use. Opening twice while the fetch is in flight must not open two of them.
  openSheet() {
    if (this.sheet.open) return this.sheet.close();
    if (this.essences || !this.doc.essences?.picked?.length) return this.sheet.show();
    return this.loadEssenceTable().then(() => this.sheet.show());
  }

  showScreen(id) {
    if (id !== 'essences') return this.board.show(id);
    if (this.essences) return this.essences.show();
    this.loadEssenceTable().then(ok => { if (ok) this.essences.show(); });
    return true;
  }

  loadEssenceTable() {
    if (!this.essenceLoad) {
      this.essenceLoad = loadEssences()
        .then(({ doc, warnings }) => {
          for (const w of warnings) console.warn(`essences: ${w}`);
          this.essences = new EssenceSheet({
            host: this.host,
            doc,
            saved: () => (this.doc.essences?.picked?.length ? this.doc.essences : null),
            onChoose: r => this.takeEssences(r),
          });
          return true;
        })
        .catch(e => {
          console.warn(`essences: ${e.message}`);
          this.toast('The essence table could not be opened.');
          return false;
        });
    }
    return this.essenceLoad;
  }

  // The one irreversible choice in the game. The confluence is written down with the three that
  // made it so a later build whose table has moved on can still say what the player is.
  takeEssences(r) {
    this.doc.essences = { picked: r.picked, confluence: r.confluence, abilities: r.abilities };
    this.doc.flags['society.essences.chosen'] = true;
    this.autosave.mark();
    this.toast(`${r.confluenceName}. Four essences, four abilities.`, { ms: 5200 });
    // She has something new to say the moment this lands — the hotspot that answers on her is
    // gated on the same flag.
    this.bus.dispatchEvent(new CustomEvent('essences.chosen', { detail: r }));
  }

  // In place, not a page reload. The proving is a round trip in the middle of a conversation and a
  // reload there is a black screen, a boot splash and the world built twice for a fight that lasts
  // a minute. The fade is not decoration: the swap takes a few frames whatever happens, and a cut
  // straight from the Society's hall to a walled yard reads as a glitch rather than as a door.
  gotoLevel(id, at, patch = null) {
    if (!this.swap || this.swap.busy) return false;
    this.dialogue.close?.();
    this.board.close();
    this.fade(1);
    // Two frames of fade before the work starts, or the swap's own hitch eats the transition and
    // the screen goes black only after it has already happened.
    setTimeout(() => {
      this.swap.to(id, at, (doc, built) => this.adoptLevel(doc, built), patch)
        .catch(e => {
          console.warn(`level ${id}: ${e.message}`);
          this.toast(`Could not open ${id}.`);
        })
        .finally(() => setTimeout(() => this.fade(0), 120));
    }, 260);
    return true;
  }

  // Everything that reads the level, re-pointed. `hotspots.load` resets the fired/cooldown state
  // with it, which is right: a `once` hotspot in the arena is once per visit to the arena.
  adoptLevel(doc, built) {
    // Particles in flight were drawn against a world that is about to be disposed, and a banked
    // spell hit names a foe index in a fight that no longer exists.
    this.casting.reset();
    this.run = null;
    this.level = doc;
    this.o.level = doc;
    this.o.world = built.world;
    this.o.doors = built.doors;
    this.characters = built.characters;
    this.doc.level = doc.id;
    this.hotspots.load(doc.hotspots || []);
    this.combat.load(doc);
    this.anchors?.setObstacles?.([built.world?.object3D, built.doors?.object3D].filter(Boolean));
    this.installStairGate(built.doors);
    // The debug handle is what every dev tool, every UI test and the level editor read the world
    // through. Left pointing at the document boot loaded, a swapped level is invisible to all of
    // them — and to anything that asks `__wf.level.id` which level it is in, which is the first
    // question a test asks and the first one it got wrong.
    if (window.__wf) {
      Object.assign(window.__wf, {
        level: doc, world: built.world, doors: built.doors, characters: built.characters,
      });
    }
    this.bus.dispatchEvent(new CustomEvent('level', { detail: { id: doc.id } }));
    this.autosave.mark();
  }

  fade(on) {
    if (!this.fadeEl) {
      this.fadeEl = el('div', 'g-fade');
      this.host.append(this.fadeEl);
    }
    this.fadeEl.classList.toggle('on', !!on);
  }

  freePlayer() {
    const s = this.level.start;
    this.player.pos.x = s.x;
    this.player.pos.z = s.z;
    this.player.yaw = this.player.camYaw = s.yaw;
  }

  interact() { return this.hotspots.press(this.player.pos); }

  // One at a time. `toast()` puts every one at the same place and nothing dismisses the last, so
  // two raised within a few seconds of each other are simply drawn on top of one another — which
  // is what closing a contract did, because the win, the star and the promotion are three of them
  // inside four seconds. The session raises nearly all of them, so it is the right place to hold
  // the slot.
  toast(text, opts) {
    this.lastToast?.dismiss?.();
    this.lastToast = toast(this.host, text, opts);
    return this.lastToast;
  }

  update(dt) {
    if (this.menu.open) return;
    this.dialogue.tick?.(dt);
    // The fight runs whether or not a bubble is up: a conversation that starts mid-swing must not
    // freeze the elemental with its arm back.
    this.combat.update(dt);
    this.runMission(dt);
    this.drainCast();
    this.casting.update(dt);
    const busy = this.dialogue.active || this.board.open || !!this.essences?.open
      || this.menuAt.open || this.spells.open || !!this.sheet?.open;
    if (!busy) this.hotspots.update(dt, this.player.pos);
    this.stairRefusal();
    this.hud.setPrompt(busy ? null : this.reachable());
    this.heads.track(this.headBars());
    const live = this.combat.foes.filter(f => f.state !== 'dead' && f.hp > 0).length;
    this.mission.progress(live, this.combat.foes.length, this.missionLeft());
    this.autoDetect(dt);
    this.doc.played += dt;
    this.autosave.tick(dt);
  }

  // Who has a bar over their head this frame. The player's own appears when there is anything to
  // say with it — a fight, a wound, or mana that is not full — and otherwise the hall is left
  // clean, which is the whole reason these are not two permanent bars in a corner.
  headBars() {
    const out = [];
    const P = this.player;
    const [me] = this.combat.bars();
    const mana = this.awakened().length ? this.casting.mana : null;
    const fighting = this.combat.foes.length > 0 && !this.combat.ended;
    const hurt = me != null && me < 0.999;
    const spent = mana != null && mana < 0.999;
    if (P.enabled && !P.free && (fighting || hurt || spent)) {
      out.push({
        key: 'player', kind: 'me', name: '',
        // Tighter to the head than a foe's is, because the player is always the nearest body to
        // the camera and the same world offset is three times the pixels there — at +0.34 the bar
        // floated half a metre clear of the hood.
        world: { x: P.pos.x, y: P.pos.y + P.height + 0.08, z: P.pos.z },
        fraction: me == null ? 1 : me, mana,
      });
    }
    for (let i = 0; i < this.combat.foes.length; i++) {
      const f = this.combat.foes[i];
      if (f.state === 'dead' || f.hp <= 0) continue;
      const spec = this.combat.spec[i] || {};
      out.push({
        key: `foe${i}`, kind: 'foe', name: this.combat.nameOf(i),
        world: { x: f.x, y: this.combat.groundY(f.x, f.z) + 2.5 * (spec.scale || 1), z: f.z },
        fraction: f.max > 0 ? f.hp / f.max : 0,
      });
    }
    return out;
  }

  // The prompt names whatever pressing would actually answer — same geometry, same predicates,
  // same `once` and cooldown as press(). A second copy of that test drifted from it at once.
  reachable() { return this.hotspots.prompt(this.player.pos); }
}
