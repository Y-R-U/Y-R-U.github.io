// Where you came from. Picking one sets the money, the fleet, what debt costs and who will
// take your call — and it is the first term every dialogue table matches on.
//
// `start` overrides content/balance.js `start`; `loan` overrides its `loan`. Anything omitted
// falls through to balance, so a number only lives here when the origin actually changes it.

export default Object.freeze([
  Object.freeze({
    id: 'silver', tier: 'easy', name: 'Silver Spoon', order: 0,
    lede: 'Your family has money and you have never once wondered where it goes.',
    body: Object.freeze([
      'Best schools in the Reach, a degree nobody checked, and a trust that pays out whether you get up or not.',
      'Your father guaranteed the line of credit before you finished asking. Everyone you meet already knows the surname.',
    ]),
    edge: Object.freeze([
      'A working fleet and real money in the bank',
      'Cheap, patient debt — the bank likes your father',
      'Doors open. You will be underestimated as harmless, which is not the same as being liked',
    ]),
    start: Object.freeze({
      cash: 96000, debt: 30000, rep: 0.62,
      ships: Object.freeze([]),
    }),
    loan: Object.freeze({ interestWeekly: 0.005, maxDraw: 110000, debtLimit: 38000, drawFee: 0.01 }),
    targets: Object.freeze({
      bust: Object.freeze({ min: 0.02, max: 0.16 }), share13: Object.freeze({ min: 0.20, max: 0.38 }),
      carelessBustMin: 0.15,
    }),
    lenders: Object.freeze(['halloway_trust', 'reach_mutual']),
    character: Object.freeze({ personality: 'warm', traits: Object.freeze(['posh', 'namedropper']) }),
  }),

  Object.freeze({
    id: 'saved', tier: 'medium', name: 'Saved Up', order: 1,
    lede: 'Eleven years of someone else’s freight, and you kept the payslips.',
    body: Object.freeze([
      'Middle of the middle. School, a certificate, a decent job at a yard that was never going to be yours.',
      'You have the deposit and nothing behind it. If this goes wrong there is no second envelope.',
    ]),
    edge: Object.freeze([
      'A working fleet and a real deposit, and nothing behind either',
      'Ordinary debt at an ordinary price',
      'Nobody owes you a favour and nobody is watching you either',
    ]),
    start: Object.freeze({
      cash: 82000, debt: 44000, rep: 0.5,
      ships: Object.freeze([]),
    }),
    loan: Object.freeze({ interestWeekly: 0.012, maxDraw: 96000, debtLimit: 26000 }),
    targets: Object.freeze({
      bust: Object.freeze({ min: 0.05, max: 0.18 }), share13: Object.freeze({ min: 0.12, max: 0.28 }),
      offerByWeek13: 0.75, carelessBustMin: 0.15,
    }),
    lenders: Object.freeze(['reach_mutual', 'kestrel_credit']),
    character: Object.freeze({ personality: 'blunt', traits: Object.freeze(['polite']) }),
  }),

  Object.freeze({
    id: 'gutter', tier: 'hard', name: 'Out of the Gutter', order: 2,
    lede: 'You have a record, a rig, and a man who wants his money on Thursday.',
    body: Object.freeze([
      'Dropped out, ran errands nobody wrote down, spent a while being useful to people who do not send invoices.',
      'You cleaned up enough to sign a lease. The contacts did not clean up with you, which is going to be useful and then it is going to be a problem.',
    ]),
    edge: Object.freeze([
      'One rig and one tired hauler, and that is the entire company',
      'The only money on offer is expensive and it is not from a bank',
      'You already know who to ask about the things banks will not finance',
    ]),
    start: Object.freeze({
      cash: 46000, debt: 24000, rep: 0.34,
      ships: Object.freeze([]),
    }),
    loan: Object.freeze({ interestWeekly: 0.017, maxDraw: 62000, debtLimit: 30000, drawFee: 0.05 }),
    // The contacts are the whole inheritance: a gutter company pays far less for the grey and
    // illegal bands. Legal tactics are full price for everybody.
    tacticCost: Object.freeze({ grey: 0.55, illegal: 0.5 }),
    tacticUnlock: Object.freeze({ grey: 0.34, illegal: 0.34 }),
    targets: Object.freeze({
      bust: Object.freeze({ min: 0.16, max: 0.40 }), share13: Object.freeze({ min: 0.06, max: 0.18 }),
      offerByWeek13: 0.45, carefulBustMax: 0.26, greyReachable: 0.70, illegalTaken: 0.03,
      greyReachableByWeek16: 0.55,
      carelessBustMin: 0.15,
    }),
    lenders: Object.freeze(['vosk', 'kestrel_credit']),
    character: Object.freeze({ personality: 'sly', traits: Object.freeze(['foulmouth', 'haggler']) }),
  }),
]);
