// The contract boards, one rank to a storey of the Adventure Society, plus the New Adventures
// notice on the ground floor. Pure data and the gating that decides what a given rank may take,
// so node tools/test.mjs can hold the examples to the same standard as the screen does.
//
// Everything here is an EXAMPLE. Nothing is takeable yet — there is no quest runtime — so the
// screens exist to state the ladder and make the player want the next rung.
//
// The ladder thins as it climbs, and that is the point of it: iron has more work than anyone
// could take, and gold has four contracts in the whole province. `boardView` says so out loud.

export const RANKS = ['none', 'iron', 'bronze', 'silver', 'gold'];

export const RANK_LABEL = {
  none: 'Unranked', iron: 'Iron', bronze: 'Bronze', silver: 'Silver', gold: 'Gold',
};

// Which storey of the Society each board hangs on. The level document places the billboard and
// pins its hotspot to the same floor; this is what the screen says out loud so a player standing
// on the wrong one knows which way to walk.
export const RANK_FLOOR = { iron: 1, bronze: 2, silver: 3, gold: 4 };

export const rankIndex = r => Math.max(0, RANKS.indexOf(r));

export const BOARDS = {
  'board.iron': {
    id: 'board.iron',
    title: 'Iron Contracts',
    rank: 'iron',
    seal: 'Iron',
    strap: 'Work that pays little and forgives much.',
    note: 'Everyone starts on iron, and the second floor is never empty. The Society underwrites '
      + 'these, which is why the fees are small and the client is usually somebody’s aunt.',
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
          + 'rather you did not tell them.' },
      { id: 'iron.hens', name: 'Nine Hens, One Fox, No Fox',
        client: 'Baker Ost', where: 'The smallholdings east of the square',
        reward: 12, difficulty: 1, days: 2,
        blurb: 'Nine hens gone and not a print in the mud. Ost has stopped saying the word fox and '
          + 'has started leaving a light on.' },
      { id: 'iron.ledger', name: 'Sit With the Ledger Until It Stops',
        client: 'The Society, clerical', where: 'This building, fourth stair landing',
        reward: 16, difficulty: 1, days: 4,
        blurb: 'A tally book that adds a line overnight. The clerks want a witness, not a hero. '
          + 'Bring something to read.' },
      { id: 'iron.stones', name: 'Count the Standing Stones on Fell Bank',
        client: 'The Cartographers’ Table', where: 'Fell Bank',
        reward: 26, difficulty: 2, days: 3,
        blurb: 'There are eleven. The last four surveyors have brought back eleven, twelve, eleven '
          + 'and fourteen. Go in daylight and count twice.' },
      { id: 'iron.drain', name: 'Clear the Culvert Under the Old Road',
        client: 'The road wardens', where: 'A mile south of the market cross',
        reward: 20, difficulty: 2, days: 2,
        blurb: 'Whatever is in it has been in it since the spring floods and has stopped being '
          + 'silt. Wear boots you do not like.' },
      { id: 'iron.dog', name: 'The Miller’s Dog Will Not Come Inside',
        client: 'Marda Quill, miller', where: 'Lowford Mill',
        reward: 15, difficulty: 1, days: 2,
        blurb: 'It sits at the treeline and faces the same way all night. Marda would like to know '
          + 'what it is facing. She would not like to be told.' },
      { id: 'iron.lamps', name: 'Walk the Lamps for Eight Nights',
        client: 'The square’s householders', where: 'The market square',
        reward: 32, difficulty: 1, days: 8,
        blurb: 'Light them, walk the round, put them out. Eight nights. It is the most boring '
          + 'contract on the board and it has been taken every week since midwinter.' },
    ],
  },

  'board.bronze': {
    id: 'board.bronze',
    title: 'Bronze Contracts',
    rank: 'bronze',
    seal: 'Bronze',
    strap: 'Work that pays properly and asks properly.',
    note: 'Bronze is where the Society stops underwriting you. The board is still full — there is '
      + 'more of this than there are people to do it — but the client now expects a professional.',
    jobs: [
      { id: 'bronze.mire', name: 'Something Is Farming the Mire',
        client: 'The Fen Reeve', where: 'Blackrush Mire',
        reward: 70, difficulty: 3, days: 6,
        blurb: 'Cut reed, stacked in rows, half a mile from any village. Somebody is doing the '
          + 'work. Nobody in the fen admits to owning a sickle.' },
      { id: 'bronze.caravan', name: 'The Ashfield Caravan, and What Rides Behind It',
        client: 'Vell & Sons, factors', where: 'The Ashen Road to Ashfield',
        reward: 140, difficulty: 3, days: 9,
        blurb: 'Six wagons, eleven days, and a thing that has followed the last three caravans and '
          + 'taken one person off each. Never the same watch.' },
      { id: 'bronze.chapel', name: 'The Chapel at Winterbourne Is Warm',
        client: 'Diocesan office', where: 'Winterbourne',
        reward: 110, difficulty: 3, days: 5,
        blurb: 'Roofless for sixty years, and the flagstones are warm to the hand in frost. The '
          + 'office would like it surveyed, described, and left exactly as found.' },
      { id: 'bronze.quarry', name: 'Reopen the Coldbrook Quarry Face',
        client: 'Coldbrook Stone', where: 'Coldbrook',
        reward: 180, difficulty: 4, days: 12,
        blurb: 'The face has been shut since two cutters walked into it and one walked out backwards '
          + 'without turning round. The company will pay for an escort, not an answer.' },
      { id: 'bronze.tithe', name: 'Recover the Tithe Barn Rolls',
        client: 'The Reeve of Lowford', where: 'Lowford',
        reward: 95, difficulty: 2, days: 4,
        blurb: 'Stolen, and then returned one page at a time, in order, through the letterbox. '
          + 'Fourteen pages to go. The Reeve wants it stopped before page fifteen.' },
      { id: 'bronze.beacon', name: 'Hold the Fell Bank Beacon Through the Dark of the Month',
        client: 'The road wardens', where: 'Fell Bank',
        reward: 160, difficulty: 3, days: 14,
        blurb: 'Keep it lit. Do not go down to anything that calls up. Two wardens have gone down '
          + 'to something that called up.' },
      { id: 'bronze.astray', name: 'Bring the Ostler’s Boy Back From Wherever He Went',
        client: 'The Fleece, by the cross', where: 'Unknown',
        reward: 130, difficulty: 4, days: 7,
        blurb: 'He came back once already, for an hour, and could not say a word anyone knew. Then '
          + 'he went again. His mother has paid in advance and will not be talked out of it.' },
      { id: 'bronze.assay', name: 'Escort the Assayer and Her Findings',
        client: 'The Society, on behalf', where: 'Coldbrook, then here',
        reward: 210, difficulty: 3, days: 6,
        blurb: 'She has been threatened in writing, twice, by somebody with the seal of a company '
          + 'that no longer exists. Bring her and the sealed box. The box matters more.' },
    ],
  },

  'board.silver': {
    id: 'board.silver',
    title: 'Silver Contracts',
    rank: 'silver',
    seal: 'Silver',
    strap: 'Work that has already killed somebody competent.',
    note: 'The fourth floor is quieter. There is less silver work than bronze because most of it '
      + 'ends before it reaches a board — a silver contract is usually a bronze one that went '
      + 'wrong twice and was written up properly the third time.',
    jobs: [
      { id: 'silver.wake', name: 'The Thing Under Coldbrook Is Awake and Counting',
        client: 'The Society, under seal', where: 'Coldbrook, the sealed face',
        reward: 620, difficulty: 4, days: 16,
        blurb: 'It was asleep for eleven years. It has been awake for nine days and it has said '
          + 'four numbers, in order, one a day, with gaps. The gaps are the part nobody likes.' },
      { id: 'silver.procession', name: 'Break the Procession at Winterbourne',
        client: 'Diocesan office, under seal', where: 'Winterbourne',
        reward: 900, difficulty: 5, days: 10,
        blurb: 'It walks the old boundary on the first clear night of each month and it is longer '
          + 'every month. Two of the people in it are known to the office by name.' },
      { id: 'silver.envoy', name: 'Stand Behind the Envoy and Say Nothing',
        client: 'The Chapter', where: 'The Old Capital',
        reward: 750, difficulty: 3, days: 21,
        blurb: 'A silver adventurer at the shoulder is the whole message. You will be searched, '
          + 'seated, and expected to be visibly capable of ending the room.' },
      { id: 'silver.reservoir', name: 'Find What the Reservoir Is Filtering Out',
        client: 'The city water board', where: 'Highwater',
        reward: 1100, difficulty: 5, days: 18,
        blurb: 'The water is clean. It is cleaner than the river feeding it, by a margin that '
          + 'nobody can account for, and the intake screens are being taken off from the inside.' },
      { id: 'silver.name', name: 'Bring Back the Name of the Thing in the Deep Cut',
        client: 'The Chapter, under seal', where: 'The Deep Cut',
        reward: 1400, difficulty: 5, days: 21,
        blurb: 'Not the thing. The name. Four adventurers of silver rank have gone down and two '
          + 'have come back, and neither would write it.' },
    ],
  },

  'board.gold': {
    id: 'board.gold',
    title: 'Gold Contracts',
    rank: 'gold',
    seal: 'Gold',
    strap: 'Work that is on this board because there is nowhere else to put it.',
    note: 'There are three. There are usually two. A gold contract is not a job the Society wants '
      + 'done so much as a thing the Society has decided to stop pretending is not happening.',
    jobs: [
      { id: 'gold.crown', name: 'Stand at the Crowning and Do Nothing',
        client: 'The Chapter, under seal', where: 'The Old Capital',
        reward: 3000, difficulty: 5, days: 14,
        blurb: 'You will be armed, in the front rank, and instructed not to move. Every previous '
          + 'holder of this contract has moved.' },
      { id: 'gold.tide', name: 'The Tide at Marrow Sands Has Stopped Going Out',
        client: 'The Chapter', where: 'Marrow Sands',
        reward: 6500, difficulty: 5, days: 40,
        blurb: 'Nine days now. The sea is where it was, the moon is where it should be, and four '
          + 'villages are eating their seed corn. Something is holding it and it is not tired.' },
      { id: 'gold.ledger', name: 'Close the Ledger',
        client: 'The Chapter, under seal', where: 'Sealed',
        reward: 9000, difficulty: 5, days: 90,
        blurb: 'The brief is one page and you may read it once, here, standing, with a clerk. If '
          + 'you take it your name comes off the Society roll on the day you leave.' },
    ],
  },
};

export const BOARD_IDS = Object.keys(BOARDS);

// Becoming an adventurer. `flag` is the save flag that ticks the step off, so the checklist is
// live rather than a picture of one: every flag here is set by something the player actually does.
export const ADVENTURER_STEPS = [
  { id: 'registrar', label: 'Speak to the Registrar', flag: 'society.met.registrar',
    how: 'She is at the long desk on the ground floor, under the Registration board.' },
  { id: 'proving', label: 'Pass the proving', flag: 'society.test.passed',
    how: 'One monster, one knife, one room. The Society does not care how you win it.' },
  { id: 'essences', label: 'Take three essences and the confluence they make',
    flag: 'society.essences.chosen',
    how: 'Three are yours to choose. The fourth is whatever the three of them come to.' },
  { id: 'registered', label: 'Sign the register', flag: 'society.registered',
    how: 'Iron rank, and the second floor opens to you.' },
];

export const rankOf = (flags = {}) => {
  const r = flags?.['society.rank'];
  return RANKS.includes(r) ? r : 'none';
};

// Why this job is not takeable, or null if it is. One reason at a time: a list of everything wrong
// reads as a telling-off, and rank is the only thing standing in the way today.
export function lockOf(job, board, rank) {
  if (rankIndex(rank) >= rankIndex(board.rank)) return null;
  return { need: board.rank, have: rank, why: `${RANK_LABEL[board.rank]} rank` };
}

// Which storeys the stair will carry a rank to. The ground floor is open to anybody who can walk
// in off the square; every floor above it wants the rank whose board hangs on it.
export const floorRank = floor => Object.keys(RANK_FLOOR).find(r => RANK_FLOOR[r] === floor) || null;

// The highest storey a rank may stand on. js/world/doors.js hands this to the room every frame,
// so the flight itself is closed above it and not merely the auto-walk onto it.
export function topFloorFor(rank) {
  let top = 0;
  for (const [r, floor] of Object.entries(RANK_FLOOR)) {
    if (rankIndex(rank) >= rankIndex(r)) top = Math.max(top, floor);
  }
  return top;
}

export function mayEnterFloor(floor, rank) {
  const need = floorRank(floor);
  if (!need) return true;
  return rankIndex(rank) >= rankIndex(need);
}

export function boardView(id, flags = {}) {
  const board = BOARDS[id];
  if (!board) return null;
  const rank = rankOf(flags);
  const jobs = board.jobs.map(j => ({ ...j, lock: lockOf(j, board, rank) }));
  const open = jobs.filter(j => !j.lock).length;
  return {
    board, rank, jobs, open, locked: jobs.length - open, floor: RANK_FLOOR[board.rank],
    // The one sentence at the top of the screen. It states the gap and names the next rung, and it
    // never uses the word "cannot".
    headline: open ? `${open} of ${jobs.length} open to you.`
      : `Held for ${RANK_LABEL[board.rank].toLowerCase()} rank. You are ${RANK_LABEL[rank].toLowerCase()}.`,
  };
}

export function adventurerView(flags = {}) {
  const steps = ADVENTURER_STEPS.map(s => ({ ...s, done: !!flags[s.flag] }));
  const done = steps.filter(s => s.done).length;
  return {
    steps, done, total: steps.length, eligible: done === steps.length,
    headline: done === steps.length ? 'Registered. The second floor is open to you.'
      : `${done} of ${steps.length} met. Not yet an adventurer.`,
  };
}
