// Loads the packs, translates world events into quest events, applies the effects the pure
// reducer returns, and draws the tracker. No quest numbers live here.
//
// The save document is the game state: this writes straight into it rather than keeping a second
// copy that would have to be kept in step.

import { normaliseQuests, normaliseDialogue, normaliseAreas } from './questdef.js';
import { step, offered, progress, rewardFor, boardRoll, finishes } from './quest.js';
import { areasAt, centreOf } from './areas.js';
import { DAY_ROLL } from './clock.js';
import { itemCount, addItem } from './save.js';
import { award } from './journal.js';
import { applyStanding, newStanding, FACTIONS } from '../sim/faction.js';
import { el, clear } from './ui.js';

const tAt = (day, hour) => DAY_ROLL + 24 * day + ((hour - DAY_ROLL + 24) % 24);

export const offerId = id => `offer.${id}`;

// The chevron is a CSS rotation of ➤, and two things flip it: the camera looks along
// +(sin camYaw, cos camYaw), so screen-clockwise runs opposite the world bearing, and ➤ already
// points 90° clockwise of "ahead" at rotate(0).
export const chevronDeg = (at, pos, camYaw = 0) =>
  camYaw * 180 / Math.PI - Math.atan2(at.x - pos.x, at.z - pos.z) * 180 / Math.PI - 90;

// The packs put the giver's brief in step 0 as a `talk` at the giver, so taking the job and being
// told what it is are one conversation.
export function briefOf(def) {
  const first = def.steps?.find(s => !s.optional);
  return first?.objectives.find(o => o.k === 'talk' && o.npc === def.giver && o.node)?.node || null;
}

// RUNTIME §2.2's offered → active transition, drawn with the pieces the dialogue box already has:
// a node with no lines is a pure branch point, so the offer is two replies and no bubble.
export function offerNode(def) {
  return {
    id: offerId(def.id),
    cam: 'two',
    lines: [],
    choices: [
      { say: `${def.title} — take it on.`, goto: briefOf(def), if: null, sets: [['accept', def.id]] },
      { say: 'Not now.', goto: null, if: null, sets: null },
    ],
    once: false,
    sets: [],
    mark: null,
    next: null,
  };
}

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
    // A 404 used to surface three frames later as a JSON parse error naming nothing.
    const get = async p => {
      const r = await fetch(`${base}/${p}`);
      if (!r.ok) throw new Error(`${base}/${p} (${r.status})`);
      return r.json();
    };
    const packs = await get('quests/index.json');
    this.areas = normaliseAreas(await get('areas.json')).areas;
    this.truths = await get('truths.json');
    for (const pack of packs) {
      Object.assign(this.defs, normaliseQuests(await get(`quests/${pack}.json`), { pack }).defs);
      try {
        Object.assign(this.dialoguePack, normaliseDialogue(await get(`dialogue/${pack}.json`), { pack }).nodes);
      } catch { /* a quest pack need not have dialogue */ }
    }
    this.buildOffers();
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

  buildOffers() {
    for (const def of Object.values(this.defs)) {
      if (def.giver) this.dialoguePack[offerId(def.id)] = offerNode(def);
    }
  }

  // The job this NPC has for you: the first quest they give that is offered, and — for a board
  // template — posted today.
  offerFrom(npc) {
    for (const id of this.offers) {
      const def = this.defs[id];
      if (def?.giver !== npc) continue;
      if (def.board && !this.doc.board.ids.includes(id)) continue;
      return id;
    }
    return null;
  }

  offerSceneFor(npc) {
    const id = this.offerFrom(npc);
    return id && this.dialoguePack[offerId(id)] ? offerId(id) : null;
  }

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
  abandon(id) { return this.emit({ t: 'abandon', id }); }
  resetStep(id) { return this.emit({ t: 'reset', id }); }
  track(id) { return this.emit({ t: 'track', id }); }

  apply(e) {
    const d = this.doc;
    switch (e[0]) {
      case 'accept': this.accept(e[1]); break;
      // `cooling` is a repeatable finishing, so it is a job done and it pays the same Standing.
      case 'quest':
        if (e[2] === 'done' || e[2] === 'cooling') this.standing('quest', { faction: this.defs[e[1]]?.town });
        break;
      case 'xp': d.schools[e[1]] = (d.schools[e[1]] || 0) + e[2]; break;
      case 'mk': d.purse.marks += e[1]; break;
      case 'item': addItem(d, e[1], e[2]); break;
      case 'truth': this.awardTruth(e[1]); break;
      case 'flag': d.flags[e[1]] = e[2] === undefined ? true : e[2]; this.finish(e); break;
      case 'unlock': d.flags[`unlocked.${e[1]}`] = true; this.finish(e); break;
      case 'act': d.campaign.act = e[1]; break;
      case 'dialogue': this.dialogue?.play(e[1]); break;
      case 'wait': this.waitFor(e[1], e[2]); break;
      case 'merge': this.merge(e.slice(1)); break;
      case 'recover': this.recover(e[1]); break;
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

  // SYSTEMS §7.1: the town you work for thinks better of you, and its opposite a little worse.
  // The daily caps live on `daily.standing` so they roll over with the day; `standing` itself is
  // the flat three-faction map the save carries.
  standing(action, { faction, amount = 0 } = {}) {
    const d = this.doc;
    const st = applyStanding(
      { ...d.standing, caps: { ...newStanding().caps, ...d.daily.standing } },
      action,
      { faction: faction || d.campaign.current, amount },
    );
    for (const f of FACTIONS) d.standing[f] = st[f];
    d.daily.standing = st.caps;
  }

  // `campaign.done` is the ladder — it is what the slate reads. The `unlocked.*` flags are still
  // written for the packs' own bookkeeping and are nobody's gate.
  finish(effect) {
    const f = finishes(effect, this.doc.campaign.current);
    const done = this.doc.campaign.done;
    if (f && !done.includes(f)) done.push(f);
  }

  // §9.4's Reset this step. A verb the world does not implement is a broken promise, not a
  // no-op, so it says so rather than failing quietly.
  recover(list) {
    for (const a of list || []) {
      const fn = this.world[a[0]];
      if (fn) fn(...a.slice(1));
      else console.warn(`recover: this world has no ${a[0]}()`);
    }
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

  // Which board the player is reading: the town they are standing in, and the campaign's own town
  // when they are out in the countryside between the three.
  boardTown() {
    for (const a of this.here) {
      const town = this.areas[a]?.town;
      if (town) return town;
    }
    return this.doc.campaign.current;
  }

  // Keyed on the town as well as the day, so walking Whitewall → Blackstone on one day re-rolls
  // instead of serving Whitewall's posts at Blackstone's board. `boardRoll` is deterministic in
  // (seed, town, day), so walking back gives the first board back unchanged.
  rollBoard(town = this.boardTown()) {
    const day = this.clock?.day ?? 0;
    const b = this.doc.board;
    if (b.day === day && b.town === town) return b.ids;
    this.doc.board = { day, town, ids: boardRoll(this.defs, this.doc.seed, day, town) };
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
      if (entered.length || left.length) this.rollBoard();
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
  // The angle is a CSS rotation, not a world bearing — see chevronDeg.
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
    const next = Math.round(chevronDeg(at, pos, camYaw) / 5) * 5;
    if (next !== this.chevron) { this.chevron = next; this.draw(); }
  }
}
