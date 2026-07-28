// The games.br8t.com line-up. Curated — this is deliberately NOT /projects.js,
// which lists everything ever built. Only the ones good enough to headline.
//
// To bring a game across:
//   1. flip `soon` to false (or drop the field)
//   2. add its path to GAMES in ../deploy.sh so the files actually ship
//   3. wire its save to /lib/auth/ — see gms/2d/racketeer/js/cloud.js
//
// `path` is absolute and identical on GitHub Pages and games.br8t.com, so the
// same markup works on both origins.

export const GAMES = [
  {
    id: "racketeer", name: "Racketeer", tag: "Tennis, but dirty",
    path: "/gms/2d/racketeer/", shot: "racketeer", accent: "#3ecf6d",
    blurb: "You run automatically — just swipe. Curve the ball, heckle the umpire, and unleash Clive the attack pigeon across a 100-level story.",
  },
  {
    id: "hexpire", name: "Hexpire", tag: "Turn-based empire",
    path: "/gms/3d/hexpire/", shot: "hexpire", accent: "#f0a52c", soon: true,
    blurb: "Grow a kingdom one hex at a time. Muster armies, hold the chokepoints, and starve the other three out.",
  },
  {
    id: "prismbreak", name: "Prism Break", tag: "Glass match-3",
    path: "/gms/3d/prismbreak/", shot: "prismbreak", accent: "#63b8ff", soon: true,
    blurb: "Crush and forge coloured glass into specials. Daily rewards, weekly events, and a satisfying amount of shattering.",
  },
  {
    id: "towered", name: "Towered", tag: "Medieval tower defence",
    path: "/gms/3d/towered/", shot: "towered", accent: "#c9744a", soon: true,
    blurb: "Twenty levels across four realms, a rigged enemy horde, and a full level editor so you can build your own siege.",
  },
  {
    id: "sundayleague", name: "Sunday League", tag: "Pub football",
    path: "/gms/2d/sundayleague/", shot: "sundayleague", accent: "#7ee081", soon: true,
    blurb: "Sensible Soccer with mud on its boots. One-touch shooting, proper curve, and offside off by default.",
  },
  {
    id: "hotwire", name: "Hotwire", tag: "Isometric getaway",
    path: "/gms/3d/hotwire/", shot: "hotwire", accent: "#ff6b6b", soon: true,
    blurb: "Fourteen jobs, three endings, and a wanted level that never forgets. Steal the car, lose the tail.",
  },
  {
    id: "paperant", name: "Paper Ant", tag: "Pencil-line puzzler",
    path: "/gms/2d/paperant/", shot: "paperant", accent: "#e8d36a", soon: true,
    blurb: "Draw the ant's path in pencil across a hundred levels of magnets, freezes and ink.",
  },
  {
    id: "voidcast", name: "Voidcast", tag: "Eat the planet",
    path: "/gms/3d/voidcast/", shot: "voidcast", accent: "#b489ff", soon: true,
    blurb: "A hole that grows by swallowing a world — and the bigger you get, the bigger your audience.",
  },
];
