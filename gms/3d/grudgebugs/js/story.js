// GRUDGE BUGS — story mode. "THE LAST SANDWICH": an in-engine intro cutscene
// (the fumble that started the war), ten chapters of escalating grudge, and
// letterboxed pre-battle trash talk.

import * as THREE from 'three';
import { FACTIONS, AI } from './config.js';
import { $ } from './utils.js';
import * as voice from './voice.js';
import * as audio from './audio.js';
import { Battle } from './game.js';

const T = THREE;
const V = (x, y, z) => new T.Vector3(x, y, z);

export const CHAPTERS = [
  {
    id: 's1', emoji: '🥪', name: 'Crumbs of War', sub: 'The first shots. Keep it polite. Or not.',
    theme: 'garden', seed: 101, playerCount: 2, enemies: [{ f: 'beetles', count: 2, diff: 'mild' }],
    dialog: [
      ['e0', 'Oi! This fence is a REGISTERED work site. Clear off.'],
      ['p', 'Funny. It’s about to be a demolition site.'],
      ['e0', 'Right. GARY! FETCH THE DUNG.'],
    ],
  },
  {
    id: 's2', emoji: '🌿', name: 'Backyard Brawl', sub: 'Dung & Sons bring the whole crew.',
    theme: 'garden', seed: 202, playerCount: 3, enemies: [{ f: 'beetles', count: 3, diff: 'mild' }],
    dialog: [
      ['e0', 'You blew up me apprentice. He had ONE day till retirement.'],
      ['p', 'He was an intern. He started yesterday.'],
      ['e0', 'IT’S THE PRINCIPLE!'],
    ],
  },
  {
    id: 's3', emoji: '🧦', name: 'The Clothesline', sub: 'Sting Corp. schedules a hostile takeover.',
    theme: 'garden', seed: 303, playerCount: 3, enemies: [{ f: 'wasps', count: 3, diff: 'spicy' }],
    dialog: [
      ['e0', 'Thanks for coming to this quick sync. Agenda: your destruction.'],
      ['p', 'Can’t make it. Send minutes.'],
      ['e0', 'The minutes are BOMBS.'],
    ],
  },
  {
    id: 's4', emoji: '🍳', name: 'Kitchen Nightmares', sub: 'House Silk waits in the dark. Dramatically.',
    theme: 'kitchen', seed: 404, playerCount: 3, enemies: [{ f: 'spiders', count: 3, diff: 'spicy' }],
    dialog: [
      ['e0', 'Welcome to my parlour. Mind the doom.'],
      ['p', 'Nice place. Very… cobwebby.'],
      ['e0', 'IT’S CALLED AMBIENCE.'],
    ],
  },
  {
    id: 's5', emoji: '🕸️', name: 'Silk Road', sub: 'The Baroness demands satisfaction.',
    theme: 'kitchen', seed: 505, playerCount: 3, enemies: [{ f: 'spiders', count: 4, diff: 'spicy' }],
    dialog: [
      ['e0', 'You have creased my second-best cape.'],
      ['p', 'You have seven more capes. And eight legs. You’ll cope.'],
      ['e0', 'COPE?! Release the widows.'],
    ],
  },
  {
    id: 's6', emoji: '📊', name: 'Corporate Restructuring', sub: 'Sting Corp. pivots to open warfare.',
    theme: 'bbq', seed: 606, playerCount: 3, enemies: [{ f: 'wasps', count: 4, diff: 'spicy' }],
    dialog: [
      ['e0', 'Per my last sting: you are now a cost centre.'],
      ['p', 'Per MY last acorn: duck.'],
      ['e0', 'Duck is not on the agenda!'],
    ],
  },
  {
    id: 's7', emoji: '🥧', name: 'Two-Front Picnic', sub: 'Two rivals. One you. Standard Tuesday.',
    theme: 'picnic', seed: 707, playerCount: 3, sandwich: 0.9,
    enemies: [{ f: 'beetles', count: 2, diff: 'spicy' }, { f: 'spiders', count: 2, diff: 'spicy' }],
    dialog: [
      ['e0', 'Temporary alliance, spider. We split the sandwich 60/40.'],
      ['e1', 'The prophecy says 50/50, beetle.'],
      ['p', 'The prophecy says you both lose.'],
    ],
  },
  {
    id: 's8', emoji: '💩', name: 'The Dung Dynasty', sub: 'Big Keith’s elite crew. Jam rises early.',
    theme: 'bbq', seed: 808, playerCount: 3, suddenDeathRound: 6,
    enemies: [{ f: 'beetles', count: 4, diff: 'nuclear' }],
    dialog: [
      ['e0', 'We’ve unionised, trained, and stockpiled dung.'],
      ['p', 'That’s three more things than last time.'],
      ['e0', 'FOUR. We also learned to aim.'],
    ],
  },
  {
    id: 's9', emoji: '🧺', name: 'Everybody Wants the Sandwich', sub: 'Four armies. One blanket. No survivors.',
    theme: 'picnic', seed: 909, playerCount: 2, sandwich: 1.1,
    enemies: [{ f: 'beetles', count: 2, diff: 'nuclear' }, { f: 'spiders', count: 2, diff: 'nuclear' }, { f: 'wasps', count: 2, diff: 'nuclear' }],
    dialog: [
      ['e0', 'Everyone here for the sandwich?'],
      ['e1', 'The sandwich is FORETOLD.'],
      ['e2', 'The sandwich is Q4 REVENUE.'],
      ['p', 'The sandwich is MINE.'],
    ],
  },
  {
    id: 's10', emoji: '🦗', name: 'The Mantis', sub: 'The sandwich has a guardian. It prays.',
    theme: 'picnic', seed: 1010, playerCount: 3, sandwich: 1.4, sandwichPos: { x: 0, z: -11 },
    enemies: [{ f: 'mantis', count: 1, diff: 'nuclear' }],
    dialog: [
      ['e0', 'Many came for the sandwich. All became… mulch.'],
      ['p', 'We brought explosives.'],
      ['e0', 'Hm. The mulch usually says that.'],
    ],
  },
];

// build the enemy list, swapping any faction that clashes with the player's
export function chapterTeams(ch, playerFactionId, playerHat) {
  const used = new Set([playerFactionId]);
  const teams = [{ factionId: playerFactionId, count: ch.playerCount, isAI: false, hat: playerHat }];
  for (const e of ch.enemies) {
    let f = e.f;
    if (used.has(f)) f = FACTIONS.find(x => !used.has(x.id) && !x.boss)?.id || f;
    used.add(f);
    teams.push({ factionId: f, count: e.count, isAI: true, diff: AI.diffs[{ mild: 0, spicy: 1, nuclear: 2 }[e.diff]] });
  }
  return teams;
}

// stars: win=1, +1 nobody lost, +1 finished fast
export function starsFor(res) {
  if (!res.playerWon) return 0;
  let s = 1;
  if (res.playerBugsAlive >= 2 && res.kills) s++;
  if (res.rounds <= 7) s++;
  return Math.min(3, Math.max(1, s));
}

// ---------------- letterboxed pre-battle trash talk ----------------
export function playDialog(battle, dialog, cams, done) {
  const bugFor = (side) => {
    const ti = side === 'p' ? 0 : 1 + Number(side.slice(1));
    const team = battle.teams[Math.min(ti, battle.teams.length - 1)];
    return team.bugs.find(b => b.alive) || battle.allBugs[0];
  };
  cams.bars(true);
  $('cine-skip').classList.remove('hidden');
  let i = 0, alive = true;
  const step = () => {
    if (!alive) return;
    if (i >= dialog.length) return finish();
    const [side, text] = dialog[i++];
    const bug = bugFor(side);
    const p = battle.bugPos(bug);
    const c = V(p.x, p.y, p.z);
    const a = i * 1.9 + battle.rng() * 2;
    cams.setMode('cine', {
      from: V(c.x + Math.sin(a) * 4.2, c.y + 1.4, c.z + Math.cos(a) * 4.2),
      to: V(c.x + Math.sin(a + 0.5) * 3.4, c.y + 1.1, c.z + Math.cos(a + 0.5) * 3.4),
      lookFrom: V(c.x, c.y + 0.5, c.z), lookTo: V(c.x, c.y + 0.5, c.z), dur: 2.4,
    });
    voice.say(bug, 'turn', { line: text, shout: text === text.toUpperCase() });
    timer = setTimeout(step, 2400);
  };
  let timer = setTimeout(step, 200);
  const finish = () => {
    if (!alive) return;
    alive = false;
    clearTimeout(timer);
    cams.bars(false);
    $('cine-skip').classList.add('hidden');
    voice.clear();
    done();
  };
  return { skip: finish };
}

// ---------------- the intro cutscene ----------------
// "One perfect summer picnic…" — the sandwich falls, four leaders claim it.
export function playIntro(scene, deps, done) {
  const battle = new Battle(scene, deps, {
    cinematic: true, theme: 'picnic', seed: 42,
    sandwich: 1.3, sandwichPos: { x: 0, z: -12 },
    teams: [
      { factionId: 'ants', count: 1, isAI: true },
      { factionId: 'beetles', count: 1, isAI: true },
      { factionId: 'spiders', count: 1, isAI: true },
      { factionId: 'wasps', count: 1, isAI: true },
    ],
  });
  const cams = deps.cams, fx = deps.fx;
  const sandwich = battle.arena.sandwich;
  const restY = sandwich.position.y;
  sandwich.position.y = restY + 18;
  const leaders = battle.teams.map(t => t.bugs[0]);
  const CLAIMS = [
    'The sandwich belongs to the FAMILY.',
    'We’ve got planning permission for that sandwich, sunshine.',
    'The prophecy speaks… of BREAD.',
    'Per the picnic bylaws, that is Q3 REVENUE.',
  ];
  cams.bars(true);
  $('cine-skip').classList.remove('hidden');
  const sPos = () => sandwich.position;

  const steps = [
    { at: 0, run() {
      cams.banner('ONE PERFECT SUMMER PICNIC…', 3);
      cams.setMode('cine', { from: V(16, 9, 16), to: V(11, 5, 12), lookFrom: V(0, 0, -6), lookTo: V(0, 1, -8), dur: 4 });
    } },
    { at: 3.6, run() {
      cams.banner('…UNTIL THE HUMANS FUMBLED', 2.4);
      cams.setMode('cine', { from: V(11, 2.5, -1), to: V(9.5, 0.5, -3), lookFrom: V(0, 9, -12), lookTo: V(0, -1.5, -12), dur: 2.8 });
      fallActive = true;
      audio.fallWhistle(1.2);
    } },
    { at: 6.6, run() {
      for (let i = 0; i < leaders.length; i++) {
        const bug = leaders[i];
        setTimeout(() => {
          if (skipped) return;
          const p = battle.bugPos(bug);
          const c = V(p.x, p.y, p.z);
          const a = i * 2.4;
          cams.setMode('cine', {
            from: V(c.x + Math.sin(a) * 3.6, c.y + 1.2, c.z + Math.cos(a) * 3.6),
            to: V(c.x + Math.sin(a + 0.4) * 2.9, c.y + 0.9, c.z + Math.cos(a + 0.4) * 2.9),
            lookFrom: V(c.x, c.y + 0.5, c.z), lookTo: V(c.x, c.y + 0.5, c.z), dur: 2.5,
          });
          voice.say(bug, 'turn', { line: CLAIMS[i], shout: i === 2 });
        }, i * 2500);
      }
    } },
    { at: 17.2, run() {
      cams.banner('TALKS BROKE DOWN IMMEDIATELY', 2.2);
      cams.setMode('cine', { from: V(-14, 7, 10), to: V(-10, 5, 14), lookFrom: V(0, 1, 0), lookTo: V(0, 1, -4), dur: 3 });
      for (let i = 0; i < 5; i++) setTimeout(() => {
        if (skipped) return;
        const L = battle.ledges[i % battle.ledges.length];
        const p = { x: L.pts[0].x + Math.random() * 3, y: L.pts[0].y + 0.3, z: L.pts[0].z + Math.random() * 3 };
        fx.explosion(p, 1.2); audio.boom(0.7); cams.addShake(0.3);
      }, 400 + i * 450);
    } },
    { at: 20.4, run() {
      cams.banner('🐜 GRUDGE BUGS 🪲', 2.6);
      audio.fanfare(true);
    } },
    { at: 22.8, run() { finish(); } },
  ];

  let t = 0, si = 0, skipped = false, fallT = 0, landed = false, fallActive = false;
  const finish = () => {
    if (skipped) return;
    skipped = true;
    $('cine-skip').classList.add('hidden');
    cams.bars(false);
    voice.clear();
    battle.dispose();
    done();
  };
  $('cine-skip').onclick = finish;

  return {
    update(dt) {
      if (skipped) return;
      t += dt;
      while (si < steps.length && t >= steps[si].at) steps[si++].run();
      if (fallActive && !landed) {
        fallT += dt;
        const y = Math.max(restY, restY + 18 - 22 * fallT * fallT);
        sandwich.position.y = y;
        sandwich.rotation.z = Math.max(0, 0.3 - fallT * 0.2);
        if (y <= restY + 0.01) {
          landed = true;
          audio.boom(1.6); audio.splash();
          cams.addShake(1.2);
          fx.splash({ x: sPos().x, y: restY + 0.5, z: sPos().z }, 0xc9302f);
          fx.explosion({ x: sPos().x + 3, y: restY + 1, z: sPos().z + 2 }, 1.4);
          sandwich.scale.y = 0.85;
          for (const b of leaders) { b.rig.flinchT = 0.6; }
        }
      }
      battle.update(dt, dt);
    },
    skip: finish,
  };
}
