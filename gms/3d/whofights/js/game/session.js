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
import { load as loadEssences } from './essences.js';

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
    });

    this.hotspots = new Hotspots(this.level.hotspots || [], this.ctx);

    this.board = new Noticeboard({
      host: this.host,
      flags: () => this.doc.flags,
      onOpen: id => { if (id === 'board.new') nudge(this.host); },
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
    });

    // A tap in the 3D view fires whichever `click` hotspot contains the point the ray landed on,
    // which is what makes the boards tappable from across the hall as well as from arm's length.
    this.tap = new WorldTap({
      app,
      stage: document.getElementById('stage'),
      blocked: () => this.menu.open || this.board.open || this.dialogue.active || !!this.essences?.open || this.spells.open,
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
      // Nothing casts yet: js/game/combat.js knows about a knife and nothing else. Saying so is
      // better than a button that appears to work and does not.
      onCast: a => this.toast(`${a.name} — no target, and nothing to spend yet.`, { ms: 3600, level: 'g-low' }),
    });

    this.installStairGate(opts.doors);
    this.combat = new Combat({ app, player, level: this.level, session: this });
    this.installCombat();
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
  awakened() {
    const doc = this.essences?.doc;
    const saved = this.doc.essences;
    if (!doc || !saved?.abilities?.length) return [];
    const out = [];
    const rows = [...Object.values(doc.essences), ...doc.confluences];
    for (const id of saved.abilities) {
      for (const r of rows) {
        const a = r.abilities.find(x => x.id === id);
        if (a) { out.push({ ...a, fromName: r.name }); break; }
      }
    }
    return out;
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
  gotoLevel(id, at) {
    if (!this.swap || this.swap.busy) return false;
    this.dialogue.close?.();
    this.board.close();
    this.fade(1);
    // Two frames of fade before the work starts, or the swap's own hitch eats the transition and
    // the screen goes black only after it has already happened.
    setTimeout(() => {
      this.swap.to(id, at, (doc, built) => this.adoptLevel(doc, built))
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

  toast(text, opts) { return toast(this.host, text, opts); }

  update(dt) {
    if (this.menu.open) return;
    this.dialogue.tick?.(dt);
    // The fight runs whether or not a bubble is up: a conversation that starts mid-swing must not
    // freeze the elemental with its arm back.
    this.combat.update(dt);
    const busy = this.dialogue.active || this.board.open || !!this.essences?.open || this.menuAt.open || this.spells.open;
    if (!busy) this.hotspots.update(dt, this.player.pos);
    this.stairRefusal();
    this.hud.setPrompt(busy ? null : this.reachable());
    this.hud.setVitals(...this.combat.bars());
    this.autoDetect(dt);
    this.doc.played += dt;
    this.autosave.tick(dt);
  }

  // The prompt names whatever pressing would actually answer — same geometry, same predicates,
  // same `once` and cooldown as press(). A second copy of that test drifted from it at once.
  reachable() { return this.hotspots.prompt(this.player.pos); }
}
