// All the silly words live here.
import { pick, pickBag, randi } from "./util.js";

const FIRST = ["Gary", "Barry", "Trevor", "Deirdre", "Margaret", "Nigel", "Colin", "Sandra", "Keith",
  "Pam", "Derek", "Bruno", "Svetlana", "Chad", "Tarquin", "Bev", "Ludwig", "Consuela", "Kevin",
  "Doris", "Ricardo", "Ingrid", "Wayne", "Petunia", "Gustav", "Shirley", "Dmitri", "Cheryl",
  "Rodney", "Agnes", "Hans", "Tracey", "Vlad", "Norm", "Fifi", "Boris", "Linda", "Ravi", "Yuki", "Sven"];

const LAST = ["Postlethwaite", "McRacket", "Volleyovich", "Smashington", "Dinkworth", "Lobbins",
  "Netherbottom", "Acefield", "Grunterson", "Slicewell", "Bagelmann", "Faultby", "Tiebreaker",
  "Deuceberg", "Von Smashenberg", "Topspinelli", "Dropshotte", "Whiffington", "Serveson",
  "Baselinsky", "O'Overrule", "Letcord", "Chalkdust", "Racquetta", "Foreham", "Backhandy"];

const NICK = ["The Wall", "The Windmill", "Two Serves", "The Human Lob", "Wristy", "The Anaconda",
  "Captain Topspin", "The Baseline Bandit", "Old Thunder Elbow", "The Whisperer", "Deuce Goose",
  "The Microwave", "Sir Whiffs-a-Lot", "The Pigeon Magnet", "Momentum Mike", "The Drop Shot Menace",
  "Knees", "The Slice Queen", "Grandma's Favourite", "The Tiebreak Vampire", "Discount Federer",
  "The Sweatband", "Big Toe", "The Argument", "Half Volley Harry"];

const BIO_JOB = ["works in accounts", "is your neighbour's plumber", "teaches spin class illegally",
  "collects ceramic owls", "is banned from three leisure centres", "won a raffle once",
  "peaked in 1987", "is sponsored by a kebab van", "has never lost at swingball",
  "does their own stunts", "is technically two children in a coat", "invented a new kind of soup",
  "was raised by line judges", "claims to have beaten a horse at chess", "runs a suspicious car wash",
  "moonlights as a mall Santa", "owns 400 sweatbands", "is wanted in Belgium (tennis-related)"];

const BIO_STYLE = ["Hits everything as hard as possible.", "Refuses to run for any ball.",
  "Serves underarm exclusively, out of spite.", "Grunts in a minor key.",
  "Celebrates every point like a Grand Slam.", "Argues with the umpire, the crowd, and gravity.",
  "Has a forehand and a prayer.", "Plays better when angry. Is always angry.",
  "Once rallied for four hours because neither player knew the score.",
  "Communicates only through aggressive racket twirls.", "Their backhand has its own fan club.",
  "Weaponised the moonball.", "Sweats before the warm-up."];

const FACES = ["😤", "🧐", "😈", "🥸", "🤠", "😏", "👵", "🧔", "🦹", "🥶", "🤡", "👺", "💪", "🐺", "🧟", "🕺", "🤖"];

export function makeOpponent(tier, idx, total, stars) {
  if (tier.boss) {
    return {
      name: "THE BALL MACHINE 3000", face: "🤖", stars: 5,
      bio: "Rank #1. It has no weaknesses, no mercy, and no off switch. It has learned to grunt in binary.",
      boss: true,
    };
  }
  const useNick = stars > 1.6 || Math.random() < 0.4;
  const nm = useNick
    ? `${pick(FIRST)} "${pickBag("nick", NICK)}" ${pick(LAST)}`
    : `${pick(FIRST)} ${pick(LAST)}`;
  return {
    name: nm, face: pick(FACES), stars,
    bio: `${useNick ? "Word is this one" : "This one"} ${pickBag("bioj", BIO_JOB)}. ${pickBag("bios", BIO_STYLE)}`,
  };
}

// First-ever opponent is always Gary. It's tradition.
export function firstOpponent() {
  return { name: "Gary from Accounts", face: "🧑‍💼", stars: 0.5,
    bio: "Brought a frying pan by mistake and is doing his best. Left his lunch on the umpire chair." };
}

export const HECKLES = [
  "YOUR SHORTS ARE ON BACKWARDS!", "MY NAN SERVES HARDER THAN THAT!", "THE NET IS ON YOUR SIDE!",
  "I'VE SEEN BETTER SWINGS IN A PLAYGROUND!", "YOU RUN LIKE A FRIDGE!", "IS THAT A RACKET OR A SPATULA?",
  "THE BALL IS THE ROUND THING!", "EVEN THE PIGEONS ARE LAUGHING!", "NICE SERVE, WAS IT A GIFT?",
  "YOU CALL THAT TOPSPIN? I CALL IT A CRY FOR HELP!", "YOUR COACH JUST LEFT!", "0/10 FOOTWORK, 10/10 FALLING!",
];

export const GRUNTS = ["HNNGYAAA!", "WRYYAAAGH!", "EEEYUUURGH!", "BLAAARGH!", "HUUUURKKK!", "NYOOOM!",
  "GRAAAHHH!", "YEEEEET!", "WAAAHOOO!", "SKRRRAAA!"];

export const ARGUE_LINES = [
  "THAT BALL WAS SO IN IT BOUGHT PROPERTY THERE!", "ARE YOU BLIND OR JUST FASHIONABLY LATE?",
  "I DEMAND A RECOUNT!", "THE CHALK DUST FLEW! EVERYONE SAW THE DUST!",
  "MY LAWYER WILL HEAR ABOUT THIS!", "YOU CALL THAT A CALL? I CALL THAT A CRIME!",
];

export const UMPIRE_OK = ["The umpire squints... POINT OVERTURNED!", "\"Upon review... you're right, somehow.\"",
  "The umpire checks a coin. Heads! Point yours!"];
export const UMPIRE_BAD = ["\"CODE VIOLATION. Also your shoes are untied.\"", "Point docked. Snacks too.",
  "\"Overruled. And frankly, hurtful.\""];
export const UMPIRE_REPLAY = ["\"Play it again. Never speak of this.\"", "The umpire was asleep. REPLAY THE POINT."];

export const CROWD_LINES = ["The crowd goes WILD!", "A grown adult faints with excitement!",
  "Someone throws a bouquet! And a shoe!", "Nobody can stop the wave!",
  "A sponsor waves a contract!"];

export const COMMENT_WINNER = ["Outstanding winner!", "Painted the line!", "An absolute rocket!",
  "Still looking for that one!", "Kissed the chalk!"];
export const COMMENT_ERROR = ["Straight into the net. Oof.", "OUT. Different postcode out.",
  "The less said about that one, the better.", "A bold choice. The wrong one, but bold."];
export const COMMENT_ACE = ["ACE! Untouchable!", "ACE! Waved goodbye!", "Served like a legend!"];

export const INJURY_LINES = ["*clutches hamstring theatrically*", "*collapses like a deckchair*",
  "*points at ankle. Then the other ankle.*"];

export const OUTRAGEOUS_NAMES = ["THE TWEENER", "BACKFLIP SMASH", "BEHIND-THE-BACK BULLET",
  "NO-LOOK DROP SHOT", "THE HELICOPTER", "360° TORNADO SLICE"];

export const BOSS_LINES = ["HUMAN DETECTED. RESISTANCE: ADORABLE.", "CALCULATING YOUR DEFEAT... DONE.",
  "4,000,000 BALLS FIRED. I RECALL EACH.", "ERROR 404: YOUR RANKING NOT FOUND."];

export function rankDropForWin(current, target, matchesLeft) {
  // Big satisfying rank chunks each win, hitting `target` on the tier's final win.
  if (matchesLeft <= 1) return target;
  const ratio = Math.pow(target / current, 1 / matchesLeft);
  const next = Math.round(current * ratio * (0.9 + Math.random() * 0.2));
  return Math.max(target, Math.min(current - 1, next));
}

export function crowdName() {
  return pick(["Barbara", "Big Steve", "The Lads", "A Pigeon", "Row F", "Someone's Dad"]);
}
