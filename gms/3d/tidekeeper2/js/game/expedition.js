/* ═══════════════════════════════════════════════════════════════════════════
   COLLECTING TRIPS
   The roguelite bit. Three stops, one of three cards at each, and a condition
   meter that some cards damage. Run out of condition and the trip comes home
   empty. It is the main way new species enter the book.
   ═══════════════════════════════════════════════════════════════════════════ */

import { rnd, ri, pick, shuffled, clamp, money$ } from '../util.js';
import { SPECIES, SP } from '../data/species.js';
import { SPECIES_RENOWN } from '../data/progress.js';

export const tripCost = n => Math.round(120 * Math.pow(1.7, n));

export class Trip {
  constructor(G) {
    this.G = G;
    this.stage = 0;
    this.condition = 100;
    this.haul = { species: [], money: 0, renown: 0 };
    this.log = [];
    this.over = false; this.won = false;
    this.depth = 0;
  }

  /** Three cards for the current stop. */
  offer() {
    const G = this.G;
    const locked = SPECIES.filter(s => !G.speciesAvailable(s.id) && s.tier <= 3 + this.depth)
                          .filter(s => !this.haul.species.includes(s.id));
    const cards = [];

    if (locked.length) {
      const sp = pick(shuffled(locked).slice(0, 4));
      const risk = 8 + sp.tier * 7 + this.depth * 5;
      cards.push({ kind: 'species', id: sp.id, icon: '🐠', title: sp.name,
        body: `Unlocks it in the shop for good.<br><span style="color:var(--red)">−${risk} condition</span>`,
        risk, take: t => { t.haul.species.push(sp.id); } });
    }
    cards.push({ kind: 'money', icon: '💰', title: 'A crate of supplies',
      body: `${money$(90 + this.depth * 120 + ri(0, 60))} of stock to sell on.<br><span style="color:var(--green)">no risk</span>`,
      risk: 0, take: t => { t.haul.money += 90 + t.depth * 120 + ri(0, 60); } });
    cards.push({ kind: 'rest', icon: '⛺', title: 'Make camp',
      body: `Repair the boat and the nets.<br><span style="color:var(--green)">+22 condition</span>`,
      risk: -22, take: () => {} });
    cards.push({ kind: 'deep', icon: '🌊', title: 'Push out deeper',
      body: `Rarer things further out, and a harder trip home.<br><span style="color:var(--red)">−14 condition</span>`,
      risk: 14, take: t => { t.depth++; t.haul.renown += 3; } });
    cards.push({ kind: 'renown', icon: '◆', title: 'Survey the reef',
      body: `Notes worth <b>${4 + this.depth * 3} renown</b> to the society.<br><span style="color:var(--amber)">−6 condition</span>`,
      risk: 6, take: t => { t.haul.renown += 4 + t.depth * 3; } });

    return shuffled(cards).slice(0, 3);
  }

  choose(card) {
    card.take(this);
    this.condition = clamp(this.condition - card.risk, 0, 100);
    this.log.push(card.title);
    this.stage++;
    if (this.condition <= 0) { this.over = true; this.won = false; }
    else if (this.stage >= 3) { this.over = true; this.won = true; }
    return this.over;
  }

  /** Pay out. Returns a list of reward rows for the results screen. */
  settle() {
    const G = this.G, rows = [];
    if (!this.won) {
      rows.push({ ic: '💧', b: 'Nothing came back', s: 'The boat limped home empty. The money is gone.' });
      return rows;
    }
    G.save.unlockedSpecies = G.save.unlockedSpecies || [];
    for (const id of this.haul.species) {
      if (!G.save.unlockedSpecies.includes(id)) G.save.unlockedSpecies.push(id);
      rows.push({ ic: '🐠', b: SP[id].name, s: 'Now in the shop permanently.' });
    }
    if (this.haul.money) { G.money += this.haul.money; G.stats.earned += this.haul.money;
      rows.push({ ic: '💰', b: money$(this.haul.money), s: 'Stock sold on.' }); }
    if (this.haul.renown) { G.renown += this.haul.renown; G.stats.renownEver += this.haul.renown;
      rows.push({ ic: '◆', b: this.haul.renown + ' renown', s: 'Notes filed with the society.' }); }
    G.stats.trips++;
    G.persist();
    return rows;
  }
}
