// The play session: the save document, the settings, the pause menu, the hotspot runtime and the
// dialogue bubble. Nothing here is constructed under ?shot= or in the editor (js/game/boot.js §0).

import { toast } from './ui.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { DialogueBox } from './dialoguebox.js';
import { Anchors } from './bubble.js';
import { Voice } from './voice.js';
import { Noticeboard, nudge } from './noticeboard.js';
import { WorldTap } from './worldtap.js';
import { Hotspots } from './hotspots.js';
import { runActions } from './actions.js';
import { blank, docView } from './save.js';
import { load, Autosave } from './savestore.js';
import { resolve, setDial, pickPreset, autoChoice, DIALS, AUTO_AFTER } from './graphics.js';

export class Session {
  constructor(app, player, opts) {
    this.app = app;
    this.player = player;
    this.o = opts;
    this.host = opts.host;
    this.level = opts.level;
    this.characters = opts.characters;

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
      effects: sets => runActions(sets, this.ctx),
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
      blocked: () => this.menu.open || this.board.open || this.dialogue.active,
      onPoint: p => this.hotspots.press(p, ['click']),
    });

    this.applySettings();
    this.autosave = new Autosave(() => this.snapshot());
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

  say(nodeId) {
    if (this.board.open) this.board.close();
    return !!this.dialogue.play(nodeId);
  }

  showScreen(id) { return this.board.show(id); }

  gotoLevel(id, at) {
    const url = new URL(location.href);
    url.searchParams.set('level', id);
    if (at) url.searchParams.set('at', `${at.x},${at.z},${at.yaw ?? 0}`);
    location.href = url.toString();
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
    const busy = this.dialogue.active || this.board.open;
    if (!busy) this.hotspots.update(dt, this.player.pos);
    this.hud.setPrompt(busy ? null : this.reachable());
    this.autoDetect(dt);
    this.doc.played += dt;
    this.autosave.tick(dt);
  }

  // The prompt names whatever pressing would actually answer — same geometry, same predicates,
  // same `once` and cooldown as press(). A second copy of that test drifted from it at once.
  reachable() { return this.hotspots.prompt(this.player.pos); }
}
