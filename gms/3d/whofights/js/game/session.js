// The play session: the save document, the settings, the pause menu, the hotspot runtime and the
// dialogue bubble. Nothing here is constructed under ?shot= or in the editor (js/game/boot.js §0).

import { el, clear, toast } from './ui.js';
import { Menu } from './menu.js';
import { DialogueBox } from './dialoguebox.js';
import { Hotspots } from './hotspots.js';
import { runActions } from './actions.js';
import { blank } from './save.js';
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
    this.ctx = {
      flags: this.doc.flags,
      say: id => this.say(id),
      goto: (id, at) => this.gotoLevel(id, at),
      emit: (name, data) => this.bus.dispatchEvent(new CustomEvent(name, { detail: data })),
      characterAt: id => this.characters?.at(id) || null,
      world: () => ({ flags: this.doc.flags, items: this.doc.items, quests: this.doc.quests }),
    };

    this.hotspots = new Hotspots(this.level.hotspots || [], this.ctx);

    this.dialogue = new DialogueBox({
      host: this.host,
      player,
      names: opts.names || {},
      ctx: () => this.ctx.world(),
      effects: sets => runActions(sets, this.ctx),
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

    this.buildHud();
    this.applySettings();
    this.autosave = new Autosave(() => this.snapshot());
  }

  buildHud() {
    const bar = el('div', 'g-bar-top');
    const pause = el('button', 'g-round', '≡');
    pause.setAttribute('aria-label', 'Menu');
    pause.onclick = () => this.menu.toggle();
    bar.append(pause);
    this.prompt = el('div', 'g-prompt');
    this.prompt.hidden = true;
    this.prompt.onclick = () => this.interact();
    this.host.append(bar, this.prompt);
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
    if (!this.dialogue.play(nodeId)) return false;
    return true;
  }

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
    if (!this.dialogue.active) this.hotspots.update(dt, this.player.pos);
    this.showPrompt();
    this.autoDetect(dt);
    this.doc.played += dt;
    this.autosave.tick(dt);
  }

  // The only HUD element that changes: a tap target appears exactly when something is in reach.
  showPrompt() {
    const near = !this.dialogue.active && this.reachable();
    if (near === this.promptFor) return;
    this.promptFor = near;
    this.prompt.hidden = !near;
    if (near) clear(this.prompt).append(el('b', null, near));
  }

  reachable() {
    for (const h of this.hotspots.list) {
      if (h.trigger !== 'interact' && h.trigger !== 'click') continue;
      const shape = this.hotspots.shapeOf(h);
      if (!shape) continue;
      const p = this.player.pos;
      const cx = shape.k === 'circle' ? shape.x : (shape.x0 + shape.x1) / 2;
      const cz = shape.k === 'circle' ? shape.z : (shape.z0 + shape.z1) / 2;
      const r = shape.k === 'circle' ? shape.r : Math.max(shape.x1 - shape.x0, shape.z1 - shape.z0) / 2;
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 <= r * r) return h.name;
    }
    return null;
  }
}
