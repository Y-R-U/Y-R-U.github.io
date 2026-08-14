// Loads the packs, translates world events into quest events, applies the effects the pure
// reducer returns, and draws the tracker. No quest numbers live here.
//
// The save document is the game state: this writes straight into it rather than keeping a second
// copy that would have to be kept in step.

import { normaliseQuests, normaliseDialogue, normaliseAreas } from './questdef.js';
import { step, offered, progress, rewardFor, boardRoll } from './quest.js';
import { areasAt, centreOf } from './areas.js';
import { DAY_ROLL } from './clock.js';
import { itemCount, addItem } from './save.js';
import { award } from './journal.js';
import { el, clear } from './ui.js';

const tAt = (day, hour) => DAY_ROLL + 24 * day + ((hour - DAY_ROLL + 24) % 24);

export class QuestRunner {
  constructor({ host, clock, dialogue, doc, journal, world = {} }) {
    this.clock = clock;
    this.dialogue = dialogue;
    this.doc = doc;
    this.journal = journal || { get: () => doc, set: () => {} };
    this.world = world;
    this.defs = {};
    this.areas = {};
    this.truths = {};
    this.dialoguePack = {};
    this.here = [];
    this.damage = 0;
    this.el = el('div', 'g-track');
    host?.append(this.el);
  }

  get state() { return { quests: this.doc.quests, tracked: this.doc.tracked }; }

  async load(base = 'data') {
    const get = async p => (await fetch(`${base}/${p}`)).json();
    const packs = await get('quests/index.json');
    this.areas = normaliseAreas(await get('areas.json')).areas;
    this.truths = await get('truths.json');
    for (const pack of packs) {
      Object.assign(this.defs, normaliseQuests(await get(`quests/${pack}.json`), { pack }).defs);
      try {
        Object.assign(this.dialoguePack, normaliseDialogue(await get(`dialogue/${pack}.json`), { pack }).nodes);
      } catch { /* a quest pack need not have dialogue */ }
    }
    this.dialogue?.load(this.dialoguePack);
    this.rollBoard();
    this.draw();
    return this;
  }

  ctx() {
    const d = this.doc;
    return {
      quests: d.quests,
      flags: d.flags,
      truths: d.truths.map(t => t.id),
      schools: d.schools,
      standing: d.standing,
      items: Object.fromEntries(d.items.map(e => [e.id, e.n])),
      marks: d.purse.marks,
      campaign: d.campaign,
      worn: d.worn,
      day: this.clock?.day ?? 0,
      hour: this.clock?.hour ?? 0,
      damageDealt: this.damage,
      areas: this.here,
      seen: this.dialogue?.seen || [],
    };
  }

  get offers() { return offered(this.defs, this.state, this.ctx()); }

  emit(event) {
    const r = step(this.defs, this.state, event, this.ctx());
    this.doc.quests = r.state.quests;
    this.doc.tracked = r.state.tracked;
    for (const e of r.effects) this.apply(e);
    this.draw();
    if (r.effects.some(e => e[0] === 'quest' || e[0] === 'act')) this.onSave?.();
    return r.effects;
  }

  accept(id, force = false) { return this.emit({ t: 'accept', id, force }); }
  retry(id) { return this.emit({ t: 'retry', id }); }
  resetStep(id) { return this.emit({ t: 'reset', id }); }
  track(id) { return this.emit({ t: 'track', id }); }

  apply(e) {
    const d = this.doc;
    switch (e[0]) {
      case 'xp': d.schools[e[1]] = (d.schools[e[1]] || 0) + e[2]; break;
      case 'mk': d.purse.marks += e[1]; break;
      case 'item': addItem(d, e[1], e[2]); break;
      case 'truth': this.awardTruth(e[1]); break;
      case 'flag': d.flags[e[1]] = e[2] === undefined ? true : e[2]; break;
      case 'unlock': d.flags[`unlocked.${e[1]}`] = true; break;
      case 'act': d.campaign.act = e[1]; break;
      case 'dialogue': this.dialogue?.play(e[1]); break;
      case 'wait': this.waitFor(e[1], e[2]); break;
      case 'merge': this.merge(e.slice(1)); break;
      case 'recover': for (const a of e[1]) this.world[a[0]]?.(...a.slice(1)); break;
      case 'sound': this.world.sound?.(e[1]); break;
      default: break;
    }
  }

  // RUNTIME §4.4: the faces the player knew separately turn out to be one person. The last id is
  // who they really are; the ones before it become aliases of them. The journal's cast strip is
  // still deferred, so today this records the reveal rather than drawing it.
  merge(names) {
    const to = names[names.length - 1];
    if (!to || names.length < 2) return;
    const merged = this.doc.campaign.merged || (this.doc.campaign.merged = {});
    for (const from of names.slice(0, -1)) if (from !== to) merged[from] = to;
  }

  awardTruth(id, scene = null) {
    const j = award({ truths: this.doc.truths, log: this.doc.log }, id, this.truths, {
      day: this.clock?.day ?? 0,
      campaign: this.doc.campaign.current,
      quest: this.doc.tracked,
      scene: scene || this.dialogue?.scene?.id || null,
    });
    this.doc.truths = j.truths;
  }

  // STORY §4: the eighth day is a fiction, not a wait — find the next one and fade to it.
  waitFor(hour, onDay) {
    if (!this.clock) return 0;
    if (!onDay) return this.clock.advanceTo(hour);
    for (let d = this.clock.day; d < this.clock.day + onDay * 2 + 2; d++) {
      if (((d % onDay) + onDay) % onDay !== onDay - 1) continue;
      const t = tAt(d, hour);
      if (t > this.clock.t) return this.clock.waitUntil(t);
    }
    return 0;
  }

  rollBoard(town = 'light') {
    const day = this.clock?.day ?? 0;
    if (this.doc.board.day === day) return this.doc.board.ids;
    this.doc.board = { day, ids: boardRoll(this.defs, this.doc.seed, day, town) };
    return this.doc.board.ids;
  }

  has(id, n = 1) { return itemCount(this.doc, id) >= n; }

  // What this NPC is waiting to say: the dialogue node the current step of any live quest names
  // for them. The context button opens that and nothing else, so talking never gets ahead of the
  // quest it belongs to.
  sceneFor(npc) {
    for (const [id, rec] of Object.entries(this.doc.quests)) {
      const def = this.defs[id];
      if (!def || (rec.s !== 'active' && rec.s !== 'turnin')) continue;
      const steps = def.steps.filter(s => !s.optional);
      const step = rec.s === 'turnin' ? null : steps[rec.i];
      for (const o of step?.objectives || []) if (o.k === 'talk' && o.npc === npc && o.node) return o.node;
      if (rec.s === 'turnin' && def.turnin === npc) return def.turninScene || null;
    }
    return null;
  }

  // The only world events wired today: where the player is, and time passing. Kills, gathers,
  // deliveries and interactions call `emit` from their own systems as those land.
  update(dt, pos) {
    if (pos) {
      const now = areasAt(this.areas, pos.x, pos.z);
      const entered = now.filter(a => !this.here.includes(a));
      const left = this.here.filter(a => !now.includes(a));
      this.here = now;
      for (const a of entered) this.emit({ t: 'enter', area: a });
      for (const a of left) this.emit({ t: 'leave', area: a });
    }
    this.emit({ t: 'tick', dt });
  }

  rewardText(id) {
    const r = rewardFor(this.defs[id], this.ctx());
    const bits = Object.keys(r.xp).map(s => s[0].toUpperCase() + s.slice(1));
    if (r.mk) bits.push(`${r.mk} mk`);
    return bits.join(' · ') || '—';
  }

  // Called on every event, so it rebuilds only when the two rendered lines actually change.
  draw() {
    const id = this.doc.tracked;
    const p = id ? progress(this.defs, this.state, id) : null;
    const hidden = !p || !!this.dialogue?.active || !!this.world.uiBusy?.();
    const sig = hidden ? 'hidden' : `${p.title}|${p.text}|${p.have}|${p.need}|${this.chevron || ''}`;
    if (sig === this.sig) return;
    this.sig = sig;
    clear(this.el);
    this.el.classList.toggle('gone', hidden);
    if (!p) return;
    this.el.append(el('b', null, p.title));
    const row = el('span');
    row.append(p.text);
    if (this.chevron) {
      const c = el('u', 'g-chev', '➤');
      c.style.transform = `rotate(${this.chevron}deg)`;
      row.append(c);
    }
    if (p.need > 1) row.append(el('i', null, `${p.have}/${p.need}`));
    this.el.append(row);
  }

  // §9.4: after 90 s on one step with nothing to show for it, the tracker grows a chevron. It is
  // never forced and it never becomes a quest arrow — it points, once you are already lost.
  lost(dt, pos, camYaw = 0) {
    const id = this.doc.tracked;
    const p = id ? progress(this.defs, this.state, id) : null;
    const key = p ? `${id}.${p.index}.${p.have}` : '';
    if (key !== this.lostKey) { this.lostKey = key; this.lostFor = 0; this.chevron = null; return; }
    this.lostFor = (this.lostFor || 0) + dt;
    if (this.lostFor < 90 || !pos || !p?.area) return;
    const a = this.areas[p.area];
    if (!a) return;
    const at = centreOf(a);
    const deg = (Math.atan2(at.x - pos.x, at.z - pos.z) - camYaw) * 180 / Math.PI;
    const next = Math.round(deg / 5) * 5;
    if (next !== this.chevron) { this.chevron = next; this.draw(); }
  }
}
