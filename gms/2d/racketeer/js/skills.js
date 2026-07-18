// Skill definitions. Actual in-match effects are applied in match.js via skill id.
// lvl runs 1..5; effect numbers are indexed by lvl-1.
export const SKILLS = {
  power: {
    id: "power", name: "Power Hit", emo: "💥", type: "active", start: true,
    desc: "Arm a monster hit — your next shot is a screamer. Costs stamina.",
    cost: [0, 120, 300, 700, 1500],
    mojo: 0, cd: 0,
    fx: { pow: [0.22, 0.3, 0.38, 0.46, 0.58], stam: [18, 17, 16, 14, 12] },
    flavour: "The oldest trick in the book: hit it really, really hard.",
  },
  grunt: {
    id: "grunt", name: "Grunt", emo: "📢", type: "active",
    desc: "Unleash a competition-grade grunt: extra pace, and at higher levels the sheer noise startles your opponent.",
    cost: [100, 200, 450, 900, 1800],
    mojo: 20, cd: 6,
    fx: { pow: [0.12, 0.16, 0.2, 0.24, 0.3], startle: [0, 0.15, 0.3, 0.45, 0.6] },
    flavour: "Sports scientists agree: louder = better.",
  },
  heckle: {
    id: "heckle", name: "Heckle", emo: "🗯️", type: "active",
    desc: "Yell something devastating between points. Torches opponent composure — rattled opponents spray errors.",
    cost: [120, 240, 500, 1000, 2000],
    mojo: 25, cd: 0, betweenPoints: true,
    fx: { comp: [10, 15, 20, 26, 34] },
    flavour: "\"YOUR SHORTS ARE ON BACKWARDS\" — devastating at any level of the sport.",
  },
  argue: {
    id: "argue", name: "Umpire Argument", emo: "👨‍⚖️", type: "active",
    desc: "After losing a point, contest it! The umpire may overturn it, replay it... or penalise your cheek.",
    cost: [150, 300, 600, 1200, 2400],
    mojo: 35, cd: 0, afterLoss: true,
    fx: { win: [0.22, 0.28, 0.34, 0.4, 0.48], replay: [0.3, 0.32, 0.34, 0.36, 0.38] },
    flavour: "Justice is blind. This umpire is also quite sleepy.",
  },
  outrageous: {
    id: "outrageous", name: "Outrageous Shot", emo: "🤸", type: "active",
    desc: "Tweener! Backflip smash! Massive hype and bonus cash if it lands — total faceplant if it doesn't.",
    cost: [200, 400, 800, 1600, 3200],
    mojo: 40, cd: 4,
    fx: { landChance: [0.55, 0.65, 0.72, 0.8, 0.9], hype: [22, 26, 30, 36, 45], cash: [15, 25, 40, 65, 100] },
    flavour: "The crowd didn't come for tennis. They came for THIS.",
  },
  underarm: {
    id: "underarm", name: "Underarm Serve", emo: "🥷", type: "active",
    desc: "The cheekiest serve in tennis. Great ace odds against a rattled opponent, and it infuriates them either way.",
    cost: [150, 300, 650, 1300, 2600],
    mojo: 25, cd: 0, serveOnly: true,
    fx: { ace: [0.3, 0.38, 0.46, 0.54, 0.65], tilt: [8, 10, 12, 15, 20] },
    flavour: "Not illegal. Just deeply, deeply rude.",
  },
  injury: {
    id: "injury", name: "Fake Injury", emo: "🤕", type: "active",
    desc: "Take a theatrical medical timeout: refills your stamina and composure. Overuse it and the crowd boos.",
    cost: [180, 350, 700, 1400, 2800],
    mojo: 45, cd: 0, betweenPoints: true,
    fx: { heal: [35, 45, 55, 70, 90] },
    flavour: "Both ankles. Somehow three ankles.",
  },
  pigeon: {
    id: "pigeon", name: "Pigeon Whisperer", emo: "🐦", type: "active",
    desc: "Release a trained pigeon to dive-bomb your opponent mid-rally. Their next shot will be garbage.",
    cost: [250, 500, 1000, 2000, 4000],
    mojo: 45, cd: 8,
    fx: { weaken: [0.5, 0.6, 0.7, 0.8, 0.9] },
    flavour: "His name is Clive. He has never missed.",
  },
  racketsmash: {
    id: "racketsmash", name: "Racket Smash", emo: "🎇", type: "active",
    desc: "Obliterate your racket on the court. Fully restores composure, thrills the crowd — but a new racket costs cash.",
    cost: [150, 300, 600, 1200, 2400],
    mojo: 30, cd: 0, betweenPoints: true,
    fx: { hype: [12, 15, 18, 22, 28], cashCost: [25, 22, 19, 15, 10] },
    flavour: "Therapy, but louder and more expensive.",
  },
  crowdwork: {
    id: "crowdwork", name: "Crowd Work", emo: "😘", type: "active",
    desc: "Blow kisses, dab, start the wave. Big hype boost — and hype multiplies every dollar you earn.",
    cost: [130, 260, 550, 1100, 2200],
    mojo: 20, cd: 0, betweenPoints: true,
    fx: { hype: [14, 18, 22, 28, 36] },
    flavour: "They love you. They just don't know it yet.",
  },
  zone: {
    id: "zone", name: "The Zone", emo: "🧠", type: "active",
    desc: "Time slows. Your swing window becomes enormous for the next few shots.",
    cost: [300, 600, 1200, 2400, 4800],
    mojo: 50, cd: 10,
    fx: { shots: [2, 2, 3, 3, 4], widen: [1.6, 1.8, 2.0, 2.2, 2.5] },
    flavour: "You can hear the ball's thoughts. It's scared.",
  },
  luckyballs: {
    id: "luckyballs", name: "Lucky Balls", emo: "🍀", type: "passive",
    desc: "PASSIVE: Your serves are faster and your shanks a little less shameful.",
    cost: [200, 400, 800, 1600, 3200],
    fx: { serve: [0.06, 0.1, 0.14, 0.18, 0.24], mercy: [0.1, 0.15, 0.2, 0.25, 0.3] },
    flavour: "Definitely not tampered with. Definitely.",
  },
  netcord: {
    id: "netcord", name: "Net Cord Karma", emo: "🕸️", type: "passive",
    desc: "PASSIVE: When the ball clips the tape, the universe leans your way.",
    cost: [250, 500, 1000, 2000, 4000],
    fx: { luck: [0.15, 0.25, 0.35, 0.45, 0.6] },
    flavour: "You apologised to the net once. It remembers.",
  },
};

export const SKILL_ORDER = ["power", "grunt", "heckle", "argue", "outrageous", "underarm",
  "injury", "pigeon", "racketsmash", "crowdwork", "zone", "luckyballs", "netcord"];

export function skillLvl(save, id) { return save.skills[id] || 0; }
export function skillFx(id, lvl, key) { return SKILLS[id].fx[key][Math.max(0, lvl - 1)]; }
export function upgradeCost(id, lvl) { return lvl >= 5 ? null : SKILLS[id].cost[lvl]; }
