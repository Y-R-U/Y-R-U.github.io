// The games.br8t.com line-up. Curated — this is deliberately NOT /projects.js,
// which lists everything ever built. Only the ones good enough to headline.
//
// To bring a game across:
//   1. flip `soon` to false (or drop the field)
//   2. add its path to GAMES in ../deploy.sh so the files actually ship
//   3. wire its save to /lib/auth/ — see lib/auth/localsync.js
//
// `path` is absolute and identical on GitHub Pages and games.br8t.com, so the
// same markup works on both origins.
//
// Deliberately NOT here yet: Prism Break, Towered and Hotwire want more play
// testing and tweaking before they headline the hub.

export const GAMES = [
  {
    id: "racketeer", name: "Racketeer", tag: "Tennis, but dirty",
    path: "/gms/2d/racketeer/", shot: "racketeer", accent: "#3ecf6d",
    blurb: "You run automatically — just swipe. Curve the ball, heckle the umpire, and unleash Clive the attack pigeon across a 100-level story.",
  },
  {
    id: "ironhail", name: "Ironhail", tag: "Drone-spotted tank warfare",
    path: "/gms/3d/opus5_ironhail/", shot: "opus5-ironhail", accent: "#d8823c",
    blurb: "Real firing solutions over a diggable battlefield: spot with the drone, range the target, drop a shell on it. Thirty missions across five acts.",
  },
  {
    id: "hexpire", name: "Hexpire", tag: "Turn-based empire",
    path: "/gms/3d/hexpire/", shot: "hexpire", accent: "#f0a52c",
    blurb: "Grow a kingdom one hex at a time. Muster armies, hold the chokepoints, and starve the other three out.",
  },
  {
    id: "grudgebugs", name: "Grudge Bugs", tag: "Artillery with antennae",
    path: "/gms/3d/grudgebugs/", shot: "grudgebugs", accent: "#8fd14f",
    blurb: "Worms with insect factions, fought along narrow crumbling ledges. Every shot is replayed from the shell's point of view.",
  },
  {
    id: "sundayleague", name: "Sunday League", tag: "Pub football",
    path: "/gms/2d/sundayleague/", shot: "sundayleague", accent: "#7ee081",
    blurb: "Sensible Soccer with mud on its boots. One-touch shooting, proper curve, and offside off by default.",
  },
  {
    id: "paperant", name: "Paper Ant", tag: "Pencil-line puzzler",
    path: "/gms/2d/paperant/", shot: "paperant", accent: "#e8d36a",
    blurb: "Draw the ant's path in pencil across a hundred levels of magnets, freezes and ink.",
  },
  {
    id: "sudoku", name: "Sudoku", tag: "Graded, not guessed",
    path: "/gms/pwa/sudoku/", shot: "sudoku", accent: "#4a90e2",
    blurb: "Six difficulties set by what solving actually demands, not by how many cells are blank. Pencil marks, hints and a board that waits for you.",
  },
  {
    id: "snakeeee", name: "Snake-eee", tag: "Grow, hunt, dominate",
    path: "/gms/pwa/snake/", shot: "snake-io", accent: "#4CAF50",
    blurb: "An arena of snakes with a 10,000 finish line. Steer with a thumb or the arrow keys, spend your winnings on a very long upgrade ladder, and watch the bots get cleverer as you do.",
  },
  {
    id: "crazyspace", name: "Crazy Space", tag: "Neon dogfights",
    path: "/gms/2d/crazyspace/", shot: "crazyspace", accent: "#39c0ed",
    blurb: "Subspace in your browser. Five ships, four modes, energy that is both your health and your ammo, and bots that play the objective.",
  },
  {
    id: "murderroyale", name: "Murder Royale", tag: "Last tank standing",
    path: "/gms/3d/fable5_crow_tank_battle/", shot: "fable5-crow-tank-battle", accent: "#c2603a",
    blurb: "A dusk farm, nine AI personalities and a circling murder of crows closing the field. Duel, skirmish, royale or frenzy.",
  },
  {
    id: "outpace", name: "Outpace", tag: "Run the gauntlet",
    path: "/gms/3d/outpace/", shot: "outpace", accent: "#6ea8ff",
    blurb: "Haul cargo through asteroid fields to pay off a ship you cannot afford. Dock, bank the credits, and take the next route out.",
  },
  {
    id: "voidcast", name: "Voidcast", tag: "Eat the planet",
    path: "/gms/3d/voidcast/", shot: "voidcast", accent: "#b489ff", soon: true,
    blurb: "A hole that grows by swallowing a world — and the bigger you get, the bigger your audience.",
  },
];
