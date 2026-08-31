// The four boards in the hall: three tiers of contract and the New Adventures notice. Pure data
// plus the gating that decides what a given rank may take, so node tools/test.mjs can hold the
// examples to the same standard as the screen does.
//
// Everything here is an EXAMPLE. Nothing is takeable yet — there is no quest runtime — so the
// screens exist to state the ladder and make the player want the next rung.

export const RANKS = ['none', 'iron', 'bronze', 'gold'];

export const RANK_LABEL = { none: 'Unranked', iron: 'Iron', bronze: 'Bronze', gold: 'Gold' };

export const rankIndex = r => Math.max(0, RANKS.indexOf(r));

export const BOARDS = {
  'board.iron': {
    id: 'board.iron',
    title: 'Iron Contracts',
    rank: 'iron',
    seal: 'Iron',
    strap: 'Work that pays little and forgives much.',
    note: 'Everyone starts on iron. The Academy underwrites these, which is why the fees are small '
      + 'and the client is usually somebody’s aunt.',
    jobs: [
      { id: 'iron.rats', name: 'Something in the Grain Loft',
        client: 'Marda Quill, miller', where: 'Lowford Mill, two hours west',
        reward: 14, difficulty: 1, days: 2,
        blurb: 'Rats, she says. Rats do not take a hen through a barred door. Bring a lantern.' },
      { id: 'iron.escort', name: 'Walk the Chandler to Market',
        client: 'The Chandlers’ Company', where: 'The Ashen Road',
        reward: 22, difficulty: 1, days: 1,
        blurb: 'Six miles of open road and a cart of tallow. Nobody has been robbed on it in a year, '
          + 'which is exactly how long the Company has been paying for company.' },
      { id: 'iron.well', name: 'The Well at Thistlebeck Answers Back',
        client: 'Thistlebeck parish', where: 'Thistlebeck, north of the meadow',
        reward: 18, difficulty: 2, days: 3,
        blurb: 'The village would like it to stop. They are not asking what it is saying, and would '
          + 'prefer you did not either.' },
      { id: 'iron.dogs', name: 'Count the Hounds at Vell’s Kennel',
        client: 'Sergeant Vell, retired', where: 'The kennel above the ford',
        reward: 9, difficulty: 1, days: 1,
        blurb: 'There should be eleven. There have been thirteen for a fortnight. Vell wants a name '
          + 'for the two extra before he wants them gone.' },
      { id: 'iron.debt', name: 'Recover One Ledger, Unopened',
        client: 'Housen & Daughter, factors', where: 'A rented room in Lowford',
        reward: 26, difficulty: 2, days: 2,
        blurb: 'The tenant left. The ledger did not. Read a page of it and the fee becomes a fine.' },
    ],
  },

  'board.bronze': {
    id: 'board.bronze',
    title: 'Bronze Contracts',
    rank: 'bronze',
    seal: 'Bronze',
    strap: 'Somebody has already tried and come back short.',
    note: 'Bronze work is signed for in person and the Academy does not underwrite it. Read the '
      + 'clause about remains.',
    jobs: [
      { id: 'bronze.barrow', name: 'The Barrow Above Hollowmere is Open',
        client: 'Reeve of Hollowmere', where: 'Hollowmere, four days north',
        reward: 180, difficulty: 3, days: 6,
        blurb: 'It was shut in spring by four people. Three of them signed this contract. Close it, '
          + 'and bring back whatever is holding it open.' },
      { id: 'bronze.river', name: 'The Ferryman Will Not Say Why',
        client: 'Crown surveyor', where: 'Bellow Crossing',
        reward: 140, difficulty: 3, days: 4,
        blurb: 'Three crossings a day for thirty years, and now none after dark. He is not '
          + 'frightened. He is being paid.' },
      { id: 'bronze.forge', name: 'Recover the Blackwater Pattern',
        client: 'The Smiths’ Hall', where: 'A drowned forge under the fen',
        reward: 240, difficulty: 4, days: 8,
        blurb: 'Two hundred years of it went into the water with the smith. The Hall wants the '
          + 'moulds. They have not mentioned the smith.' },
      { id: 'bronze.escort', name: 'Take the Widow Ansel Home',
        client: 'Private', where: 'Ashen Road to the high passes',
        reward: 165, difficulty: 3, days: 7,
        blurb: 'She is going back to a village that burned. She knows. She would like to arrive.' },
    ],
  },

  'board.gold': {
    id: 'board.gold',
    title: 'Gold Contracts',
    rank: 'gold',
    seal: 'Gold',
    strap: 'Gold pays little and forgives nothing.',
    note: 'Countersigned by the Chapter. A gold contract cannot be returned once taken, and the '
      + 'fee is paid to your named beneficiary whether or not you come back for it.',
    jobs: [
      { id: 'gold.siege', name: 'Break the Siege of Karn Ithel',
        client: 'The Chapter, under seal', where: 'Karn Ithel, the far march',
        reward: 2400, difficulty: 5, days: 30,
        blurb: 'Eleven weeks. Two relief columns. The wall is still standing and nobody has been '
          + 'able to say what is outside it.' },
      { id: 'gold.name', name: 'Bring Back the Name of the Thing in the Deep Cut',
        client: 'The Chapter, under seal', where: 'The Deep Cut',
        reward: 1800, difficulty: 5, days: 21,
        blurb: 'Not the thing. The name. Four adventurers of gold rank have gone down and two have '
          + 'come back, and neither would write it.' },
      { id: 'gold.crown', name: 'Stand at the Crowning and Do Nothing',
        client: 'The Chapter, under seal', where: 'The Old Capital',
        reward: 3000, difficulty: 5, days: 14,
        blurb: 'You will be armed, in the front rank, and instructed not to move. Every previous '
          + 'holder of this contract has moved.' },
    ],
  },
};

export const BOARD_IDS = Object.keys(BOARDS);

// Becoming an Adventurer. `flag` is the save flag that would tick the step off, so the checklist is
// live the moment a quest runtime exists rather than being a picture of one.
export const ADVENTURER_STEPS = [
  { id: 'register', label: 'Sign the register in the Academy hall',
    flag: 'academy.registered', how: 'The book is on the long table. Instructor Vail keeps the pen.' },
  { id: 'instructor', label: 'Be spoken to by an instructor, and answer',
    flag: 'academy.greeted', how: 'Vail is in this hall. She is expecting you and is not patient.' },
  { id: 'stance', label: 'Hold a guard stance for one full minute',
    flag: 'academy.trial.stance', how: 'In the yard, watched. Most fail this at forty seconds.' },
  { id: 'bouts', label: 'Three bouts in the yard, standing at the end of one',
    flag: 'academy.trial.bouts', how: 'You choose the one. Nobody has ever chosen the first.' },
  { id: 'kit', label: 'Own a weapon, a light, and something to carry water in',
    flag: 'academy.kit', how: 'The armoury will lend two of the three. It will not say which.' },
  { id: 'sponsor', label: 'Be sponsored by an adventurer of iron rank or better',
    flag: 'academy.sponsor', how: 'A sponsor signs beside your name and loses the fee if you run.' },
  { id: 'fee', label: 'Pay the Academy’s iron fee — 20 marks',
    flag: 'academy.fee', how: 'Refunded on your first completed contract. It is almost never refunded.' },
];

export const rankOf = (flags = {}) => {
  const r = flags['academy.rank'];
  return RANKS.includes(r) ? r : 'none';
};

// Why this job is not takeable, or null if it is. One reason at a time: a list of everything wrong
// reads as a telling-off, and rank is the only thing standing in the way today.
export function lockOf(job, board, rank) {
  if (rankIndex(rank) >= rankIndex(board.rank)) return null;
  return { need: board.rank, have: rank,
    why: `${RANK_LABEL[board.rank]} rank` };
}

export function boardView(id, flags = {}) {
  const board = BOARDS[id];
  if (!board) return null;
  const rank = rankOf(flags);
  const jobs = board.jobs.map(j => ({ ...j, lock: lockOf(j, board, rank) }));
  const open = jobs.filter(j => !j.lock).length;
  return { board, rank, jobs, open, locked: jobs.length - open,
    // The one sentence at the top of the screen. It states the gap and names the next rung, and it
    // never uses the word "cannot".
    headline: open ? `${open} of ${jobs.length} open to you.`
      : `Held for ${RANK_LABEL[board.rank].toLowerCase()} rank. You are ${RANK_LABEL[rank].toLowerCase()}.` };
}

export function adventurerView(flags = {}) {
  const steps = ADVENTURER_STEPS.map(s => ({ ...s, done: !!flags[s.flag] }));
  const done = steps.filter(s => s.done).length;
  return { steps, done, total: steps.length, eligible: done === steps.length,
    headline: done === steps.length ? 'Eligible. Present yourself to an instructor.'
      : `${done} of ${steps.length} met. Not yet eligible.` };
}
