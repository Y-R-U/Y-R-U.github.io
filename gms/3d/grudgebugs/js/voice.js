// GRUDGE BUGS — the talking. Speech bubbles projected over heads + squeaky
// gibberish chirps. Every faction has a personality and far too much to say.

import * as THREE from 'three';
import { $ } from './utils.js';
import * as audio from './audio.js';

const LINES = {
  mobster: {
    turn: ['You come to MY ledge, on the day of my picnic?', 'The Don sends his regards.',
      'Nothing personal. Okay, entirely personal.', 'Nice ledge. Shame if somethin’ happened to it.',
      'Fuggedaboutit.', 'We settle this the old way. Explosions.'],
    taunt: ['Ba-da-BOOM.', 'That’s amore!', 'Cannoli that, pal.', 'You crossed the family.',
      'Sleep with the fishes. Literally, down there.'],
    hurt: ['MY SUIT! I JUST GOT THIS SUIT!', 'You’re makin’ the list, buddy.', 'Ow. Capisce.',
      'I’ve had worse. From my mother.'],
    fear: ['Whoa whoa whoa, let’s talk numbers.', 'I know a guy. I AM the guy. Don’t.',
      'You wouldn’t hit a bug with glasses… I’ll get glasses.'],
    falling: ['TELL THE FAMILY I LOVED THE SANDWIIIICH', 'I REGRET EVERYTHIIIING',
      'THIS IS A HOSTILE EXIIIIT'],
    kill: ['It’s just business.', 'Badda bing.', 'One less plate at dinner.'],
    selfhit: ['Who put that there? I put that there.', 'We do not speak of this.'],
    win: ['The picnic is OURS.', 'Now THAT’S a family dinner.'],
    lose: ['We’ll be back. With cousins.'],
    idle: ['You smell that? Jam money.', 'I miss the old crumb.'],
  },
  builder: {
    turn: ['Right, tea break’s over.', 'Two loads, comin’ up.', 'I’ve got a licence for this. Somewhere.',
      'Quotin’ you a fair price for demolition: free.', 'Mind the gap. I’m about to make one.'],
    taunt: ['That’s comin’ out YOUR deposit.', 'Lovely bit of demolition, that.',
      'Sign here, here, and BOOM.', 'We do free estimates. That one’s free.'],
    hurt: ['NOT TO CODE! NOT TO CODE!', 'That was load-bearing! I was load-bearing!',
      'Right, that’s goin’ in the incident book.', 'HEALTH! AND! SAFETY!'],
    fear: ['Hold on, hold on, I’ve not signed off on this.', 'Where’s me hard hat. WHERE’S ME HARD HAT.',
      'This site is NOT insured for that.'],
    falling: ['SHOULD’VE SCAFFOLDEEED', 'TELL MY 40,000 KIDS I LOVE TH—', 'MIND THE SKIIIIP'],
    kill: ['Demolished. Invoice is in the post.', 'Down in one. Beautiful.'],
    selfhit: ['Right. Nobody logs that one.', 'Tools down. Tools DOWN.'],
    win: ['Job done. Kettle on.', 'Snag list: none. Casualties: several.'],
    lose: ['The union will hear about this.'],
    idle: ['This ledge? Cowboy job.', 'I could murder a biscuit.'],
  },
  goth: {
    turn: ['Darkness, my old friend, hold my hat.', 'I have foreseen this. I did nothing about it.',
      'Let the dread commence.', 'How tedious. How delicious.', 'The abyss whispers. It says: fire.'],
    taunt: ['Doom suits you.', 'Exquisite agony. Chef’s kiss.', 'You dance beautifully… downward.',
      'The void thanks you for your donation.'],
    hurt: ['My silk! My BEAUTIFUL silk!', 'Pain is just poetry with teeth.',
      'I felt that in all eight knees.', 'You DARE crease the Baroness?'],
    fear: ['Ah. Fate approaches, wearing boots.', 'I predicted this too. Ugh.',
      'Must we? …We must, mustn’t we.'],
    falling: ['At last… the abyss RSVPs.', 'Gravity, we meet agaaaain', 'How… predictable…'],
    kill: ['Another guest for the eternal gala.', 'Hush now. The web keeps you.'],
    selfhit: ['The prophecy said nothing of THIS.', 'We shall call it… performance art.'],
    win: ['The house always wins. House Silk, specifically.'],
    lose: ['Defeat… my second-favourite flavour.'],
    idle: ['I knitted a tiny coffin. For fun.', 'The moon owes me money.'],
  },
  corporate: {
    turn: ['Per my last sting—', 'Let’s circle back. With violence.', 'Looping in the artillery.',
      'This meeting could have been an ambush. It is.', 'Q3 targets: you.'],
    taunt: ['Synergy!', 'Consider that… actioned.', 'I’ve escalated you. Physically.',
      'KPIs: Kill, Pillage, Invoice.', 'Great feedback. Implementing more explosions.'],
    hurt: ['I’m raising a ticket about this.', 'THAT was out of scope!',
      'HR will hear about this. HR is dead. NEW HR will hear about this.'],
    fear: ['Can we take this offline?!', 'I’m marking myself as AWAY.',
      'This violates my calendar!'],
    falling: ['TELL HR IT’S A GRIEVANCE!', 'OUT OF OFFICE FOREVERRRR', 'CANCEL MY 3 O’CLOOOCK'],
    kill: ['Position eliminated. Nothing personal — restructuring.', 'You’ve been offboarded.'],
    selfhit: ['That’s… on brand, actually.', 'Do NOT minute that.'],
    win: ['Deliverables: delivered. Bodies: several.', 'Promotion pending.'],
    lose: ['We’ll pivot. We always pivot.'],
    idle: ['My calendar says “war (recurring)”.', 'I miss the printer.'],
  },
  zen: {
    turn: ['The ledge is narrow. So is fate.', 'Breathe in. Explode out.',
      'A sandwich divided cannot stand.'],
    taunt: ['You were the sandwich all along.', 'To fall is to arrive. Somewhere.',
      'I strike only where you are.'],
    hurt: ['Pain visits. It may not stay.', 'Interesting. Ow. Interesting.'],
    fear: ['A storm bows to no umbrella.', 'Hm. Spicy.'],
    falling: ['…enlightenment.', 'the void… smells of jam…'],
    kill: ['Rest now. The picnic is eternal.', 'The mantis prays for you. Briefly.'],
    selfhit: ['Even masters step on rakes.'],
    win: ['The crumb settles. Balance returns.'],
    lose: ['A lesson. An expensive one.'],
    idle: ['I have counted the crumbs. All of them.'],
  },
  shared: {
    turn: ['My turn? MY TURN.', 'Watch this. No, really, watch.'],
    taunt: ['Get absolutely dunked on.', 'That’s gotta sting.'],
    hurt: ['MY LEG! Which one? ALL OF THEM.', 'Rude. RUDE.'],
    fear: ['uh oh.', 'point that somewhere else. ANYWHERE else.'],
    falling: ['AAAAAAAAAAAAA', 'NOT LIKE THIIIIS', 'I CAN’T EVEN FLYYYY'],
    kill: ['Gone. Reduced to crumbs.'],
    selfhit: ['I meant to do that. (I did not.)'],
    win: ['GG. Go home.'], lose: ['We move.'],
    idle: ['Is it lunch yet?', '*aggressive tiny humming*'],
    wind: ['Whose hairdryer is that?!', 'The wind has OPINIONS today.', 'Hold onto your hats. Seriously.'],
    sudden: ['THE JAM. THE JAM IS RISING.', 'STRAWBERRY DOOM! IT’S STRAWBERRY!', 'High ground! HIGH GROUND!'],
    land: ['I’m okay! The ledge broke my fall. And my ribs.', 'Stuck the landing. Mostly.'],
    revenge: ['THAT was for earlier.', 'Revenge is a dish best served EXPLODING.'],
    slap: ['A SLAP? In THIS economy?', 'You slapped me. You actually slapped me.'],
  },
};

let camera = null, dom = null;
const bubbles = [];       // {el, target(Object3D), t, life}
const recent = new Map(); // avoid instant repeats per category

export function init(cam, rendererDom) { camera = cam; dom = rendererDom; }

export function pickLine(persona, cat, rng = Math.random) {
  const pools = [];
  if (LINES[persona]?.[cat]) pools.push(...LINES[persona][cat]);
  if (LINES.shared[cat]) pools.push(...LINES.shared[cat]);
  if (!pools.length) return null;
  const key = persona + cat;
  const last = recent.get(key);
  let line = pools[Math.floor(rng() * pools.length)];
  if (pools.length > 1 && line === last) line = pools[(pools.indexOf(line) + 1) % pools.length];
  recent.set(key, line);
  return line;
}

// bug needs: {faction:{persona,voice,ui}, name, headObj (Object3D)}
export function say(bug, cat, { shout = false, prob = 1, line = null } = {}) {
  if (Math.random() > prob || !camera) return;
  const text = line || pickLine(bug.faction.persona, cat);
  if (!text) return;
  // one bubble per bug at a time
  for (const b of bubbles) if (b.bug === bug) b.life = Math.min(b.life, 0.1);
  while (bubbles.length >= 3) killBubble(bubbles[0]);
  const el = document.createElement('div');
  el.className = 'bubble' + (shout || cat === 'falling' || cat === 'sudden' ? ' shout' : '');
  el.innerHTML = `<span class="who" style="color:${bug.faction.ui}">${bug.name}</span>${text}`;
  $('bubbles').appendChild(el);
  const life = 1.6 + Math.min(text.length * 0.045, 2.2);
  bubbles.push({ el, bug, target: bug.headObj, life, t: 0 });
  audio.speak(bug.faction.voice, Math.max(3, Math.round(text.length / 4)));
}

function killBubble(b) {
  b.el.remove();
  const i = bubbles.indexOf(b);
  if (i >= 0) bubbles.splice(i, 1);
}

const _v = new THREE.Vector3();
export function update(dt) {
  if (!camera || !dom) return;
  const w = dom.clientWidth, h = dom.clientHeight;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.life -= dt; b.t += dt;
    if (b.life <= 0 || !b.target.parent) { killBubble(b); continue; }
    b.target.getWorldPosition(_v);
    _v.y += 0.32;
    _v.project(camera);
    if (_v.z > 1) { b.el.style.opacity = '0'; continue; }
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    b.el.style.opacity = b.life < 0.3 ? String(b.life / 0.3) : '1';
    b.el.style.left = `${x}px`;
    b.el.style.top = `${y - 14}px`;
  }
}

export function clear() { while (bubbles.length) killBubble(bubbles[0]); }
