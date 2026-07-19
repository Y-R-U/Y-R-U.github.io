// Racketeer — tuning constants. Court units are metres; y = depth (0 = near baseline), z = up.
export const COURT = {
  W: 8.23,          // singles width
  L: 23.77,         // baseline to baseline
  NET_Y: 23.77 / 2,
  NET_H: 0.95,
  SVC: 5.485,        // service line distance from the net (matches the drawn box)
  MARGIN_X: 3.4,    // run-off around court (visual + player roam)
  MARGIN_Y: 3.2,
};

export const CAM = {
  DEPTH: 7.5,       // virtual distance behind near baseline
  K: 6.0,           // perspective strength
  HORIZON: 0.30,    // fraction of canvas height where far court sits
  NEAR: 0.965,      // fraction of canvas height for near baseline
};

export const PHYS = {
  G: -22,           // exaggerated gravity — arcadey snappy ball
  BOUNCE: 0.62,
  AIR_DRAG: 0.995,
};

export const BALL_R = 0.11;

export const SWING = {
  REACH_X: 1.55,        // metres of lateral reach for contact
  WINDOW: 0.85,         // seconds before ideal contact that the swing window opens
  PERFECT: 0.07,        // |dt| for PERFECT
  GOOD: 0.18,           // |dt| for GOOD
  OK: 0.34,             // |dt| for OK; beyond = SHANK
};

// Shot flight times (seconds to reach target) by quality — lower = faster shot
export const SHOT_T = { perfect: 0.82, good: 0.98, ok: 1.22, shank: 1.5, lob: 1.9 };

export const PLAYER = {
  SPEED: 6.2,           // base m/s
  RECOVER: 2.2,         // drift back to centre m/s
};

export const METERS = {
  STAM_POWER_COST: 18,
  STAM_REGEN: 1.6,      // per second during points
  STAM_POINT_REST: 6,   // recovered between points
  COMP_ERR_PENALTY: 6,  // composure lost on unforced error
  HYPE_WINNER: 8,
  HYPE_OUTRAGEOUS: 26,
  MOJO_PER_RALLY_HIT: 9,
  MOJO_POINT_WIN: 16,
  MOJO_MAX: 100,
};

// Tennis point display
export const PTS = ["0", "15", "30", "40"];

export const SAVE_KEY = "racketeer_save_v1";

export const TIERS = [
  { id: 0, name: "Car Park Open",        venue: "Tesco Overflow Car Park", matches: 3,
    rankStart: null, rankEnd: 1000000, prize: 40,  games: 1, oppStars: [0.5, 1.2],
    oppSkills: [], crowd: 4,
    flavour: "Entry fee: one packet of crisps. The net is a washing line." },
  { id: 1, name: "Municipal Park Tour",  venue: "Bin-Adjacent Court #2", matches: 3,
    rankStart: 1000000, rankEnd: 250000, prize: 90, games: 1, oppStars: [1.0, 1.8],
    oppSkills: ["heckle"], crowd: 8,
    flavour: "There's a dog on the court. There is always a dog on the court." },
  { id: 2, name: "Regional Qualifiers",  venue: "Slightly Damp Leisure Centre", matches: 4,
    rankStart: 250000, rankEnd: 50000, prize: 180, games: 2, oppStars: [1.5, 2.4],
    oppSkills: ["heckle", "grunt"], crowd: 14,
    flavour: "Now with a real umpire! He's somebody's uncle." },
  { id: 3, name: "National Circuit",     venue: "The Big Shed Arena", matches: 4,
    rankStart: 50000, rankEnd: 10000, prize: 600, games: 2, oppStars: [2.2, 3.0],
    oppSkills: ["heckle", "grunt", "argue", "power"], crowd: 22,
    flavour: "Local TV coverage. Your nan is watching. No pressure." },
  { id: 4, name: "Challenger Tour",      venue: "Casino de Monte Squalor", matches: 5,
    rankStart: 10000, rankEnd: 1000, prize: 2500, games: 2, oppStars: [2.8, 3.6],
    oppSkills: ["heckle", "grunt", "argue", "power", "outrageous", "pigeon"], crowd: 32,
    flavour: "Prize money now exceeds your bus fare. Living the dream." },
  { id: 5, name: "World Tour",           venue: "Stade du Fromage, Paris", matches: 5,
    rankStart: 1000, rankEnd: 100, prize: 12000, games: 3, oppStars: [3.4, 4.2],
    oppSkills: ["heckle", "grunt", "argue", "power", "outrageous", "pigeon", "underarm", "zone"], crowd: 44,
    flavour: "Private jets, ice baths, and psychological warfare." },
  { id: 6, name: "Grand Slam of Slams",  venue: "Centre Court of Centre Courts", matches: 5,
    rankStart: 100, rankEnd: 2, prize: 60000, games: 3, oppStars: [4.0, 4.8],
    oppSkills: ["heckle", "grunt", "argue", "power", "outrageous", "pigeon", "underarm", "zone", "injury", "racketsmash"], crowd: 60,
    flavour: "Strawberries cost £45. The royal box judges you silently." },
  { id: 7, name: "THE FINAL BOSS",       venue: "The Server Room", matches: 1,
    rankStart: 2, rankEnd: 1, prize: 300000, games: 3, oppStars: [5.0, 5.0],
    oppSkills: ["grunt", "power", "zone", "outrageous"], crowd: 80, boss: true,
    flavour: "Rank #1 is not human. Rank #1 is THE BALL MACHINE 3000, and it has become self-aware." },
];

export const RACKETS = [
  { id: "pan",   name: "Frying Pan",       cost: 0,     pow: 0,    ctl: 0,    emo: "🍳" },
  { id: "wood",  name: "Wooden Classic",   cost: 150,   pow: 0.06, ctl: 0.05, emo: "🪵" },
  { id: "graph", name: "Graphite Zinger",  cost: 600,   pow: 0.12, ctl: 0.10, emo: "🎾" },
  { id: "laser", name: "The Laser 9000",   cost: 2500,  pow: 0.20, ctl: 0.14, emo: "⚡" },
  { id: "excal", name: "EXCALIBUR",        cost: 9000,  pow: 0.30, ctl: 0.20, emo: "⚔️" },
];

export const SHOES = [
  { id: "flip",  name: "Flip Flops",       cost: 0,    spd: 0,    emo: "🩴" },
  { id: "plims", name: "School Plimsolls", cost: 120,  spd: 0.07, emo: "👟" },
  { id: "run",   name: "Proper Trainers",  cost: 500,  spd: 0.14, emo: "🏃" },
  { id: "jet",   name: "Rocket Boots",     cost: 2200, spd: 0.24, emo: "🚀" },
];

export const OUTFITS = [
  { id: "vest",  name: "String Vest",      cost: 0,    hyp: 0,    emo: "🦺" },
  { id: "retro", name: "80s Headband Kit", cost: 200,  hyp: 0.15, emo: "🎽" },
  { id: "tux",   name: "Full Tuxedo",      cost: 900,  hyp: 0.35, emo: "🤵" },
  { id: "chick", name: "Chicken Suit",     cost: 3000, hyp: 0.60, emo: "🐔" },
];
