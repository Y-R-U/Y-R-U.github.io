// Skill definitions. Actual in-match effects are applied in match.js via skill id.
// lvl runs 1..10; effect numbers are indexed by lvl-1.
// Actives are simple: tap to fire (or arm before a shot), then a cooldown (cd, seconds).
// `uses` caps activations per match. Passives always apply.
export const MAX_LVL = 10;

// Level curves are generated rather than hand-written — 13 skills x 10 levels of
// hand-typed numbers is a typo farm. `ramp` eases off so late levels cost a fortune
// for a smaller gain; `costs` triples each level, landing in the millions at 10.
const ramp = (from, to, curve = 0.75) =>
  Array.from({ length: MAX_LVL }, (_, i) =>
    Math.round((from + (to - from) * Math.pow(i / (MAX_LVL - 1), curve)) * 1000) / 1000);
const steps = (from, to) =>            // integer curves (cooldowns, uses)
  Array.from({ length: MAX_LVL }, (_, i) =>
    Math.round(from + (to - from) * (i / (MAX_LVL - 1))));
const costs = (base) =>
  Array.from({ length: MAX_LVL }, (_, i) => {
    const c = base * Math.pow(3, i);
    return c < 1000 ? Math.round(c / 10) * 10 : Math.round(c / 100) * 100;
  });

export const SKILLS = {
  power: {
    id: "power", name: "Power Hit", emo: "💥", type: "active", start: true, arm: true,
    desc: "Arm it, and your next shot is a monster. Costs stamina.",
    cost: [0, ...costs(150).slice(0, MAX_LVL - 1)],
    cd: steps(6, 3),
    fx: { pow: ramp(0.22, 0.9), stam: ramp(18, 8) },
    flavour: "The oldest trick in the book: hit it really, really hard.",
  },
  grunt: {
    id: "grunt", name: "Grunt", emo: "📢", type: "active", arm: true,
    desc: "Arm a competition-grade grunt: extra pace on your next shot, and at higher levels the sheer noise startles your opponent.",
    cost: costs(100),
    cd: steps(10, 4),
    fx: { pow: ramp(0.12, 0.45), startle: ramp(0, 0.8) },
    flavour: "Sports scientists agree: louder = better.",
  },
  heckle: {
    id: "heckle", name: "Heckle", emo: "🗯️", type: "active",
    desc: "Yell something devastating between points. Torches opponent composure — rattled opponents mistime everything.",
    cost: costs(120),
    cd: steps(14, 6), betweenPoints: true,
    fx: { comp: ramp(10, 55) },
    flavour: "\"YOUR SHORTS ARE ON BACKWARDS\" — devastating at any level of the sport.",
  },
  argue: {
    id: "argue", name: "Umpire Argument", emo: "👨‍⚖️", type: "active", noSlot: true,
    desc: "NO SLOT: lose a point and the option to contest it pops up on court. The umpire may overturn it, replay it... or penalise your cheek. 3 arguments per match.",
    cost: costs(150),
    cd: steps(0, 0), uses: 3, afterLoss: true,
    fx: { win: ramp(0.22, 0.7), replay: ramp(0.3, 0.45) },
    flavour: "Justice is blind. This umpire is also quite sleepy.",
  },
  outrageous: {
    id: "outrageous", name: "Outrageous Shot", emo: "🤸", type: "active", arm: true,
    desc: "Arm it: your next ball becomes a tweener/backflip smash. Massive hype and bonus cash if it lands — total faceplant if it doesn't.",
    cost: costs(200),
    cd: steps(12, 6),
    fx: { landChance: ramp(0.55, 0.97), hype: ramp(22, 70), cash: ramp(15, 400) },
    flavour: "The crowd didn't come for tennis. They came for THIS.",
  },
  underarm: {
    id: "underarm", name: "Underarm Serve", emo: "🥷", type: "active",
    desc: "The cheekiest serve in tennis. Great ace odds against a rattled opponent, and it infuriates them either way.",
    cost: costs(150),
    cd: steps(18, 8), serveOnly: true,
    fx: { ace: ramp(0.3, 0.85), tilt: ramp(8, 35) },
    flavour: "Not illegal. Just deeply, deeply rude.",
  },
  injury: {
    id: "injury", name: "Fake Injury", emo: "🤕", type: "active",
    desc: "Take a theatrical medical timeout: refills your stamina and composure. Twice per match, and the crowd boos the sequel.",
    cost: costs(180),
    cd: steps(0, 0), uses: 2, betweenPoints: true,
    fx: { heal: ramp(35, 100) },
    flavour: "Both ankles. Somehow three ankles.",
  },
  pigeon: {
    id: "pigeon", name: "Pigeon Whisperer", emo: "🐦", type: "active",
    desc: "Release a trained pigeon to dive-bomb your opponent. Their next shot will be garbage.",
    cost: costs(250),
    cd: steps(20, 9),
    fx: { weaken: ramp(0.5, 0.98) },
    flavour: "His name is Clive. He has never missed.",
  },
  racketsmash: {
    id: "racketsmash", name: "Racket Smash", emo: "🎇", type: "active",
    desc: "Obliterate your racket on the court. Fully restores composure, thrills the crowd — but a new racket costs cash.",
    cost: costs(150),
    cd: steps(20, 9), betweenPoints: true,
    fx: { hype: ramp(12, 45), cashCost: ramp(25, 5) },
    flavour: "Therapy, but louder and more expensive.",
  },
  crowdwork: {
    id: "crowdwork", name: "Crowd Work", emo: "😘", type: "active",
    desc: "Blow kisses, dab, start the wave. Big hype boost — and hype multiplies every dollar you earn.",
    cost: costs(130),
    cd: steps(16, 7), betweenPoints: true,
    fx: { hype: ramp(14, 60) },
    flavour: "They love you. They just don't know it yet.",
  },
  zone: {
    id: "zone", name: "The Zone", emo: "🧠", type: "active",
    desc: "Time slows. Your swing timing becomes very forgiving for the next few shots.",
    cost: costs(300),
    cd: steps(22, 10),
    fx: { shots: steps(2, 6), widen: ramp(1.6, 3.5) },
    flavour: "You can hear the ball's thoughts. It's scared.",
  },
  luckyballs: {
    id: "luckyballs", name: "Lucky Balls", emo: "🍀", type: "passive",
    desc: "PASSIVE: Your serves are faster and your shanks a little less shameful.",
    cost: costs(200),
    fx: { serve: ramp(0.06, 0.35), mercy: ramp(0.1, 0.5) },
    flavour: "Definitely not tampered with. Definitely.",
  },
  netcord: {
    id: "netcord", name: "Net Cord Karma", emo: "🕸️", type: "passive",
    desc: "PASSIVE: When the ball clips the tape, the universe leans your way.",
    cost: costs(250),
    fx: { luck: ramp(0.15, 0.9) },
    flavour: "You apologised to the net once. It remembers.",
  },
};

export const SKILL_ORDER = ["power", "grunt", "heckle", "argue", "outrageous", "underarm",
  "injury", "pigeon", "racketsmash", "crowdwork", "zone", "luckyballs", "netcord"];

// Passives are always on once owned, and `noSlot` actives (the umpire argument) offer
// themselves on court when they're valid — neither ever costs you a dock slot.
export function takesSlot(id) {
  const d = SKILLS[id];
  return !!d && d.type === "active" && !d.noSlot;
}

export function skillLvl(save, id) { return save.skills[id] || 0; }
export function skillFx(id, lvl, key) { return SKILLS[id].fx[key][Math.max(0, lvl - 1)]; }
export function skillCd(id, lvl) { const c = SKILLS[id].cd; return c ? c[Math.max(0, lvl - 1)] : 0; }
export function upgradeCost(id, lvl) { return lvl >= MAX_LVL ? null : SKILLS[id].cost[lvl]; }
