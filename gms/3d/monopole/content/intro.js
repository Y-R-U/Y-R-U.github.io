// Every word the onboarding says. Data only — no three, no DOM, no Math.random.
// `{token}` in any string is filled from js/ui/intro.js's NUMBERS, which reads content/balance.js,
// so the copy cannot drift away from the sim when a number moves.

// The title hold over the live system. `name` and `sub` are defaults only — once the player has
// been through character creation the company is theirs and js/ui/intro.js fills both from the
// profile. The four briefing cards below are the pre-verdict opening and only run for a player who
// never saw the Alliance ruling; the ruling does that job better and without a Next button.
export const title = Object.freeze({
  name: 'Ferrous Line',
  sub: 'Tamber Reach · week 0',
  titleMs: 2400,
});

export const cards = Object.freeze([
  Object.freeze({
    id: 'who',
    eyebrow: 'Week 0 · Tamber Reach',
    title: 'You are Ferrous Line',
    body: 'Two haulers, one mining rig, {cash} in the bank and {debt} owed against them. That is the whole company, and it is on screen behind this card.',
  }),
  Object.freeze({
    id: 'them',
    eyebrow: 'The incumbent',
    title: 'Corvain Drayage owns the run',
    body: 'They move {rivalShare} of the freight here. You move {playerShare}. One pot of work — every tonne you carry is a tonne they lose.',
  }),
  Object.freeze({
    id: 'win',
    eyebrow: 'How this ends',
    title: 'Take a third of the Reach',
    body: 'From week {fromWeek}: hold {duopoly} for {holdWeeks} straight weeks and it is a duopoly, {monopoly} and it is yours. Run out of money first and the bank closes you.',
  }),
  Object.freeze({
    id: 'how',
    eyebrow: 'How you get there',
    title: 'Three ways to compete',
    body: 'Some tactics are ordinary business. Some get argued in court for a decade. Some are flatly illegal — and they work. Every dirty week adds heat, and the regulator is reading.',
  }),
]);

// The chain the objective chip walks, and the first mission's guided tour: between them these
// steps open every panel in the dock once, in the order the game actually uses them.
//
// `dock` names the HUD dock button to pulse, or null. `mark` is an ordered list of selectors into
// the open sheet — the first one that matches and is not disabled gets the same pulse, so the
// coach follows the player *into* the panel instead of stopping at the door. The condition for
// each id lives in js/ui/intro.js; this file stays free of state.
export const objectives = Object.freeze([
  Object.freeze({
    id: 'quarters', look: true, dock: null, quartersStep: true,
    label: 'Go up to your quarters',
    why: 'You have a rented room on Ledger with a terminal in it. Everything that is about you rather than about the company happens there — the yard, the people who lend money, and the room itself.',
  }),
  Object.freeze({
    id: 'ship', dock: null,
    label: 'Buy your first hull',
    why: 'You own nothing that flies. Open the terminal, go to Ledger Yard, and pick something up. An Ossa-class rig is the only hull that can cut ore; a Kite-class hauler is the only thing that can carry a useful load. You want one of each, and you probably cannot afford both yet.',
  }),
  Object.freeze({
    id: 'rig', dock: 'assign',
    // the rig chip only matches while it is *not* the selected ship, so the mark walks the panel
    // in the order the player has to touch it: pick the rig, pick the loop, send
    mark: Object.freeze(['.chip:not(.on)[data-ship^="ossa"]', '[data-a="send"]:not([disabled])', '[data-loop="mine"]']),
    label: 'Send the mining rig to Kestrel',
    why: 'Nothing here is worth anything until you have cut the ore yourself. Open Assign, pick the rig, and put it on the mine run.',
  }),
  Object.freeze({
    id: 'market', look: true, dock: 'market',
    label: 'See what the Reach pays',
    why: 'Ossian is the only buyer in the system. Market shows what each of the three commodities is worth right now and which way it is moving — that is what decides what is worth carrying.',
  }),
  Object.freeze({
    id: 'ore', dock: null,
    label: 'Wait for the ore to reach Ledger',
    why: 'The belt is a week out and a week back. Let the clock run at ×2 — the rig cuts on arrival and brings it home on its own.',
  }),
  Object.freeze({
    id: 'halide', dock: 'refinery',
    label: 'Turn the ore into halide',
    why: 'Ledger already has a refinery. Two tonnes of ore make one of halide, and halide is worth far more than rock.',
  }),
  Object.freeze({
    id: 'sell', dock: 'assign',
    mark: Object.freeze(['[data-a="send"]:not([disabled])', '[data-loop="sell"]']),
    label: 'Sell a load at Ossian',
    why: 'Put a hauler on the sale run. The cargo turns into cash the week it docks.',
  }),
  Object.freeze({
    id: 'books', look: true, dock: 'holdings',
    label: 'Read the books',
    why: 'Holdings → Finance is cash, debt, the credit line and last week’s profit and loss. Wages run whether a hull is flying or tied up, so this is the number that quietly kills companies.',
  }),
  Object.freeze({
    id: 'module', dock: 'refinery',
    mark: Object.freeze(['.sheet-cta .primary:not([disabled])', '.buy-btn:not([disabled])']),
    label: 'Buy your first station module',
    why: 'A Coil Line draws halide into filament, and filament burns out in every lamp and drive coil in the Reach. The first decision that can actually hurt you.',
  }),
  Object.freeze({
    id: 'tactic', dock: 'tactics',
    mark: Object.freeze(['[data-a="take"]', '.tactic-head']),
    label: 'Take your first tactic',
    why: 'Volume alone will not get you past Corvain. A tactic changes the rules of the market rather than just working harder inside them.',
  }),
  Object.freeze({
    id: 'dossier', look: true, dock: 'dossier',
    label: 'Read the case behind it',
    why: 'Every tactic in this game is one a real company used. The Dossier holds the case — who did it, where, and what happened to them.',
  }),
]);

export const standing = Object.freeze({
  id: 'hold', dock: null,
  label: 'Hold {duopoly} of the Reach for {holdWeeks} weeks',
  why: 'From week {fromWeek} the count starts. {holdWeeks} straight weeks at {duopoly} is a duopoly, {monopoly} is a monopoly. Lose the share and the count goes back to zero.',
});

export const guide = Object.freeze({
  title: 'How to play',
  lede: 'You are one small freight company trying to take a system off the firm that already owns it. Everything below is the whole game.',
  sections: Object.freeze([
    Object.freeze({
      h: 'The clock',
      p: Object.freeze([
        'One tick is one week. The bar across the very top of the screen fills as the week runs; when it lands, ships move, the refinery runs, prices clear and Corvain takes a turn.',
        'The pill at the bottom right sets the pace — ❙❙ pauses, then ×1, ×2 and ×4. Speed changes nothing except how long you wait: the same week resolves identically at ×1 and ×4.',
        'Nothing happens while paused, so take as long as you like. Orders you give are queued and go out when the week ticks, and you can cancel one right up until it does.',
      ]),
    }),
    Object.freeze({
      h: 'The six buttons along the bottom',
      dock: true,
    }),
    Object.freeze({
      h: 'Ships and routes',
      p: Object.freeze([
        'Every ship sits on a route — a short loop between two or three places that it runs forever until you change it. Open Assign, pick a ship, then pick a destination or a named loop.',
        'The Ossa-class rig is the only hull that can cut ore, and it cuts {mine} tonnes a week at the belt. The Kite-class haulers carry {hold} tonnes each and cannot mine.',
        'Legs take a week or two. Ships cost wages whether they are flying or tied up, so an idle hull is a slow leak.',
      ]),
    }),
    Object.freeze({
      h: 'Ore, halide, filament',
      p: Object.freeze([
        'Rock out of Kestrel Belt is ore. Two tonnes of ore refine into one tonne of halide. Two tonnes of halide draw into one tonne of filament.',
        'Every step up the chain is worth far more per tonne than the step below it, and filament never stops selling — it burns out in every lamp and drive coil in the Reach.',
        'Ledger Station already has the Halide Refinery. The Coil Line that makes filament has to be bought, from the Refinery panel.',
        'A converter holds back {feedWeeks} weeks of feed so a hauler docking on the same tick cannot strip the station before production runs. That reserved tonnage is why a hold looks half empty.',
      ]),
    }),
    Object.freeze({
      h: 'Share of the Reach',
      p: Object.freeze([
        'The Reach is a fixed pot of freight work. Your share is the value you have actually delivered, averaged over the last {window} weeks, against what Corvain moved and what the small independents picked up.',
        'It is a share of value, not of hulls. Carrying filament instead of rock moves the bar much faster than buying another ship does.',
        'The three-colour strip under the top bar is the split: amber is you, grey is Corvain, faint is everybody else.',
      ]),
    }),
    Object.freeze({
      h: 'Heat and the regulator',
      p: Object.freeze([
        'Contested and illegal tactics add heat every week they are running. Legal ones add none.',
        'Past {heat} points of heat the regulator rolls each week on whether to open a file on you. Reputation shields you a little; a long clean record is worth real money.',
        'Being investigated is expensive. You pay a fine, you lose share straight to Corvain, your reputation drops, the tactic is torn up mid-term, and some of them are then banned for the rest of the game.',
        'The Dossier keeps the real-world case behind every tactic you have unlocked. They are all things companies actually did.',
      ]),
    }),
    Object.freeze({
      h: 'Winning, and going bust',
      p: Object.freeze([
        'From week {fromWeek}: {holdWeeks} straight weeks holding {duopoly} of the Reach wins it as a duopoly, {monopoly} as a monopoly. Drop below the line for one week and the count restarts.',
        'You go bust when cash falls more than {debtLimit} credits below zero. Debt costs {interest} a week on the balance, which is the fastest way there.',
        'The credit line in Holdings → Finance is real money and a real trap. Draw on it to buy something that earns; do not draw on it to pay wages.',
      ]),
    }),
  ]),
  dockRows: Object.freeze([
    Object.freeze({ id: 'assign', name: 'Assign', text: 'Send a ship somewhere, or put it on a loop. This is where every order starts.' }),
    Object.freeze({ id: 'holdings', name: 'Holdings', text: 'Your fleet, your station modules, the bond store, and the money — cash, debt, credit line and last week’s profit and loss.' }),
    Object.freeze({ id: 'market', name: 'Market', text: 'What the three commodities are worth at Ossian right now, which way each is moving, and any supply contracts you are signed to.' }),
    Object.freeze({ id: 'refinery', name: 'Refinery', text: 'The ore → halide → filament chain as a pipeline, what each stage is actually producing, and the button that buys the next converter.' }),
    Object.freeze({ id: 'tactics', name: 'Tactics', text: 'The three bands — legal, contested, illegal — with what each one costs, what it does, and how much heat it makes.' }),
    Object.freeze({ id: 'dossier', name: 'Dossier', text: 'The real case behind every tactic you have unlocked. Who did it, where, and what happened to them.' }),
  ]),
});

export default Object.freeze({ title, cards, objectives, standing, guide });
