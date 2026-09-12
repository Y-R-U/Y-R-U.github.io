/* ═══════════════════════════════════════════════════════════════════════════
   THE COACH
   The opening is one sentence at a time and at most one button. Nothing else
   is on screen until it has been earned. Later it only speaks up when
   something genuinely new has appeared.
   ═══════════════════════════════════════════════════════════════════════════ */

import { $, el } from '../util.js';
import { waterScore } from '../sim/tank.js';
import { Audio } from '../audio.js';

export class Coach {
  constructor(G) {
    this.G = G; this.i = 0; this.shown = -1; this.busy = false;
    this.steps = buildSteps(G);
    this.done = new Set(G.save.coach || []);
  }
  /** Called a few times a second. Shows the first step whose gate is open. */
  update() {
    const G = this.G;
    if (this.busy || G.ui?.modalOpen) return;
    while (this.i < this.steps.length && this.done.has(this.steps[this.i].id)) this.i++;
    const s = this.steps[this.i];
    if (!s) { this.hide(); return; }
    if (s.when && !safe(s.when, G)) { this.hide(); return; }
    if (this.shown !== this.i) this.show(s);
    if (s.done && safe(s.done, G)) this.advance();
  }
  show(s) {
    this.shown = this.i;
    const p = $('prompt');
    p.innerHTML = '';
    p.appendChild(el('div', 'p-line', typeof s.text === 'function' ? s.text(this.G) : s.text));
    const acts = el('div', 'p-acts');
    if (s.act) {
      const b = el('button', 'btn go', s.act[0]);
      b.onclick = () => { Audio.click(); s.act[1](this.G, this); };
      acts.appendChild(b);
    }
    if (s.skip) {
      const b = el('button', 'btn quiet', s.skip);
      b.onclick = () => { Audio.click(); this.advance(); };
      acts.appendChild(b);
    }
    p.appendChild(acts);
    p.classList.add('on');
  }
  hide() { $('prompt').classList.remove('on'); this.shown = -1; }
  advance() {
    const s = this.steps[this.i];
    if (s) {
      this.done.add(s.id);
      this.G.save.coach = [...this.done];
      s.after?.(this.G);
    }
    this.i++; this.shown = -1;
    this.hide();
    this.G.persist();
  }
  /** Fire a one-off line out of band (used when a feature unlocks). */
  say(text, label = 'Got it') {
    const p = $('prompt');
    p.innerHTML = '';
    p.appendChild(el('div', 'p-line', text));
    const acts = el('div', 'p-acts');
    const b = el('button', 'btn go', label);
    b.onclick = () => { Audio.click(); this.busy = false; p.classList.remove('on'); };
    acts.appendChild(b);
    p.appendChild(acts);
    p.classList.add('on');
    this.busy = true;
  }
}
const safe = (fn, G) => { try { return !!fn(G); } catch (e) { return false; } };

function buildSteps(G) {
  return [
    { id: 'hello',
      text: 'This is forty litres of water, a light and a filter. Nothing lives in it yet.',
      act: ['Get a fish', (g, c) => { g.ui.openFirstFish(); c.advance(); }] },

    { id: 'bought',
      text: 'Pick the one you like. It is on the house.',
      when: () => true,
      done: g => g.totalFishEverAdded >= 1,
      after: g => { g.ui.closeSheet(); } },

    { id: 'meet',
      text: g => `That is yours. Drag to look around it, and tap it if you want to follow it.`,
      done: () => false,
      act: ['It will want feeding', (g, c) => c.advance()] },

    { id: 'feed1',
      text: 'Food goes in at the top and sinks. Watch where it goes — anything it misses ends up in the water.',
      act: ['Feed', (g, c) => { g.feed('flake', 1); }],
      done: g => g.stats.feeds >= 1 },

    { id: 'earn',
      text: 'People have started coming in to look at it. Every one of them pays.',
      done: g => g.stats.earned >= 12 },

    { id: 'watch',
      text: 'That is the loop. The tank earns while it is alive, and it is alive because you look after it.',
      act: ['I see', (g, c) => c.advance()] },

    { id: 'hungry',
      text: 'It is hungry again. Feed it whenever the fish card says so — a little, often.',
      when: g => g.T.fish.some(f => f.alive && f.hunger > 0.55),
      done: g => g.stats.feeds >= 2 },

    { id: 'water',
      text: 'Look at the water reading. Everything a fish eats comes back out again, and a new tank has no bacteria yet to deal with it.',
      when: g => waterScore(g.T) < 88 || g.T.day >= 2,
      act: ['Show me', (g, c) => { g.ui.flashVitals(); c.advance(); }] },

    { id: 'change',
      text: 'A part water change is the fix, and it always will be. It is under <b>Care</b>.',
      when: g => waterScore(g.T) < 92,
      act: ['Change some water', (g, c) => { g.waterChange(0.25); c.advance(); }],
      done: g => g.T.lastWaterChange > 0 },

    { id: 'settle',
      text: 'That is genuinely the whole job. Keep it fed, keep it clean, and it will keep paying for itself.',
      act: ['Leave me to it', (g, c) => c.advance()] },

    /* ── later nudges, gated on capability rather than on sequence ───────── */
    { id: 'tank2',
      when: g => g.can('tank2') && g.tanks.length < 2,
      text: 'You have earned a second tank. The first one carries on by itself — that is the point of it.',
      act: ['Set one up', (g, c) => { g.ui.openTankShop(); c.advance(); }],
      skip: 'Later' },

    { id: 'plants',
      when: g => g.can('plants') && g.tanks.every(T => T.plants.length === 0),
      text: 'Plants eat the same nitrate that feeds algae. A planted tank is a tank that mostly looks after its own water.',
      act: ['Go planting', (g, c) => { g.ui.openSheet('shop', 'plants'); c.advance(); }],
      skip: 'Later' },

    { id: 'trips',
      when: g => g.can('trips') && g.stats.trips === 0,
      text: 'A collector will go out for you. Three stops, one choice at each, and whatever survives the trip is yours to keep.',
      act: ['Fund a trip', (g, c) => { g.ui.openTrip(); c.advance(); }],
      skip: 'Later' },
  ];
}
