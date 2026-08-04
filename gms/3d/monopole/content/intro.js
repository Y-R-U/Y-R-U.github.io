// Every word the onboarding says. Data only — no three, no DOM, no Math.random.
// `{token}` in any string is filled from js/ui/intro.js's NUMBERS, which reads content/balance.js,
// so the copy cannot drift away from the sim when a number moves.

export const cards = Object.freeze([
  Object.freeze({
    id: 'who',
    eyebrow: 'Week 0 · Tamber Reach',
    title: 'You are Ferrous Line',
    body: 'Two haulers, one mining rig, {cash} credits in the account and {debt} of debt against them. Everything you own is on screen behind this card.',
  }),
  Object.freeze({
    id: 'them',
    eyebrow: 'The incumbent',
    title: 'Corvain Drayage moves everything',
    body: 'They hold {rivalShare} of the freight in this system. You hold {playerShare}. The Reach is one pot of work — every tonne you carry is a tonne they do not.',
  }),
  Object.freeze({
    id: 'win',
    eyebrow: 'How this ends',
    title: 'Take a third of the Reach',
    body: 'From week {fromWeek}, hold {duopoly} of the Reach for {holdWeeks} straight weeks and you are a duopoly. Hold {monopoly} and it is a monopoly. Run the cash down first and the bank closes you instead.',
  }),
  Object.freeze({
    id: 'how',
    eyebrow: 'How you get there',
    title: 'Three ways to compete',
    body: 'Some tactics are ordinary business. Some get argued about in court for a decade. Some are flatly illegal — and they work. The regulator is watching the whole time, and every dirty week adds heat.',
  }),
]);

// The chain the objective chip walks. `dock` names the HUD dock button to pulse, or null.
// The condition for each id lives in js/ui/intro.js — this file stays free of state.
export const objectives = Object.freeze([
  Object.freeze({
    id: 'rig', dock: 'assign',
    label: 'Send the mining rig to Kestrel',
    why: 'Nothing in the Reach is worth anything until you have cut the ore yourself — tap the belt, or open Assign, and put the rig on a mine run.',
  }),
  Object.freeze({
    id: 'ore', dock: null,
    label: 'Wait for the ore to reach Ledger',
    why: 'The belt is a week out and a week back. Let the clock run at ×2 — the rig cuts on arrival and carries it home on its own.',
  }),
  Object.freeze({
    id: 'halide', dock: 'refinery',
    label: 'Turn the ore into halide',
    why: 'Ledger already has a refinery. It eats two tonnes of ore for every tonne of halide, and halide sells for a great deal more than rock.',
  }),
  Object.freeze({
    id: 'sell', dock: 'assign',
    label: 'Sell a load at Ossian',
    why: 'Ossian Orbitals is the only buyer in the system. Put a hauler on a sale run and the cargo turns into cash the week it docks.',
  }),
  Object.freeze({
    id: 'module', dock: 'refinery',
    label: 'Buy your first station module',
    why: 'A Coil Line draws halide into filament, and filament burns out in every lamp and drive coil in the Reach. It is the first decision that can actually hurt you.',
  }),
  Object.freeze({
    id: 'tactic', dock: 'tactics',
    label: 'Take your first tactic',
    why: 'Volume alone will not get you past Corvain. A tactic is how you change the rules of the market rather than just working harder inside them.',
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

export default Object.freeze({ cards, objectives, standing, guide });
