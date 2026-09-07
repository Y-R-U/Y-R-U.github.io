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
        blurb: 'Rats, she says. Rats do not take a hen through a barred door. Bring a lantern.',
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'shade', variant: 'lesser', count: 2 }],
          note: 'A loft, in the dark, with two things in it that are not rats.' } },
      { id: 'iron.escort', name: 'Walk the Chandler to Market',
        client: 'The Chandlers’ Company', where: 'The Ashen Road',
        reward: 22, difficulty: 1, days: 1,
        blurb: 'Six miles of open road and a cart of tallow. Nobody has been robbed on it in a year, '
          + 'which is exactly how long the Company has been paying for company.',
        mission: { zone: 'light', floor: 'grass', patch: 'sand',
          objective: 'survive', seconds: 50,
          spawns: [{ kind: 'rust', variant: 'lesser', count: 2 }],
          waves: [{ at: 18, spawns: [{ kind: 'rust', variant: 'none', count: 2 }] },
            { at: 34, spawns: [{ kind: 'gale', variant: 'quick' }] }],
          note: 'The cart does not stop, so neither do you. Six miles of it.' } },
      { id: 'iron.well', name: 'The Well at Thistlebeck Answers Back',
        client: 'Thistlebeck parish', where: 'Thistlebeck, north of the meadow',
        reward: 18, difficulty: 2, days: 3,
        blurb: 'The village would like it to stop. They are not asking what it is saying, and would '
          + 'rather you did not tell them.',
        mission: { zone: 'neutral', floor: 'stone', patch: 'water',
          spawns: [{ kind: 'brine', variant: 'none' }],
          note: 'It knits faster than you can cut. Keep it away from the standing water.' } },
      { id: 'iron.hens', name: 'Nine Hens, One Fox, No Fox',
        client: 'Baker Ost', where: 'The smallholdings east of the square',
        reward: 12, difficulty: 1, days: 2,
        blurb: 'Nine hens gone and not a print in the mud. Ost has stopped saying the word fox and '
          + 'has started leaving a light on.',
        mission: { zone: 'light', floor: 'grass', patch: 'dirt',
          spawns: [{ kind: 'gale', variant: 'quick' }],
          waves: [{ at: 14, spawns: [{ kind: 'gale', variant: 'lesser', count: 2 }] }],
          note: 'Whatever took the hens is fast and turns on the spot. And there is more than one.' } },
      { id: 'iron.ledger', name: 'Sit With the Ledger Until It Stops',
        client: 'The Society, clerical', where: 'This building, fourth stair landing',
        reward: 16, difficulty: 1, days: 4,
        blurb: 'A tally book that adds a line overnight. The clerks want a witness, not a hero. '
          + 'Bring something to read.',
        mission: { zone: 'dark', floor: 'stone', patch: 'stone',
          objective: 'survive', seconds: 60,
          spawns: [{ kind: 'shade', variant: 'lesser' }],
          waves: [{ at: 22, spawns: [{ kind: 'shade', variant: 'lesser' }] },
            { at: 42, spawns: [{ kind: 'shade', variant: 'starved', count: 2 }] }],
          note: 'Sit with it. Bare stone, nothing mends, and it keeps adding a line.' } },
      { id: 'iron.stones', name: 'Count the Standing Stones on Fell Bank',
        client: 'The Cartographers’ Table', where: 'Fell Bank',
        reward: 26, difficulty: 2, days: 3,
        blurb: 'There are eleven. The last four surveyors have brought back eleven, twelve, eleven '
          + 'and fourteen. Go in daylight and count twice.',
        mission: { zone: 'neutral', floor: 'grass', patch: 'dirt',
          spawns: [{ kind: 'earth', variant: 'lesser', count: 2 }],
          waves: [{ at: 20, spawns: [{ kind: 'earth', variant: 'lesser' }] }],
          note: 'The twelfth and the thirteenth stone. Count again after. Fight them off the turned earth.' } },
      { id: 'iron.drain', name: 'Clear the Culvert Under the Old Road',
        client: 'The road wardens', where: 'A mile south of the market cross',
        reward: 20, difficulty: 2, days: 2,
        blurb: 'Whatever is in it has been in it since the spring floods and has stopped being '
          + 'silt. Wear boots you do not like.',
        mission: { zone: 'dark', floor: 'dirt', patch: 'water',
          spawns: [{ kind: 'mire', variant: 'stubborn' }],
          note: 'Heavy, slow, and it mends off every inch of this floor. Bring patience.' } },
      { id: 'iron.dog', name: 'The Miller’s Dog Will Not Come Inside',
        client: 'Marda Quill, miller', where: 'Lowford Mill',
        reward: 15, difficulty: 1, days: 2,
        blurb: 'It sits at the treeline and faces the same way all night. Marda would like to know '
          + 'what it is facing. She would not like to be told.',
        mission: { zone: 'dark', floor: 'grass', patch: 'grass',
          spawns: [{ kind: 'shade', variant: 'none' }],
          note: 'It has been watching the treeline for a week. It notices you from the gate.' } },
      { id: 'iron.lamps', name: 'Walk the Lamps for Eight Nights',
        client: 'The square’s householders', where: 'The market square',
        reward: 32, difficulty: 1, days: 8,
        blurb: 'Light them, walk the round, put them out. Eight nights. It is the most boring '
          + 'contract on the board and it has been taken every week since midwinter.',
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          objective: 'survive', seconds: 55,
          spawns: [{ kind: 'ember', variant: 'lesser', count: 2 }],
          waves: [{ at: 15, spawns: [{ kind: 'ember', variant: 'lesser', count: 2 }] },
            { at: 30, spawns: [{ kind: 'ember', variant: 'lesser', count: 2 }] },
            { at: 44, spawns: [{ kind: 'ember', variant: 'none' }] }],
          note: 'Light them, walk the round, put them out. Eight nights of it, and every one mends in its own ash.' } },
      { id: 'iron.kiln', name: 'The Brickfield Kiln Will Not Go Out',
        client: 'Halder & Daughter, brickmakers', where: 'The brickfield, south of the ford',
        reward: 20, difficulty: 2, days: 3,
        blurb: 'Banked on Sunday, cold by Monday, and lit again by Tuesday morning with nobody '
          + 'near it. Halder has stopped banking it and started sleeping elsewhere.',
        mission: { zone: 'light', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'ember', variant: 'lesser', count: 2 }],
          note: 'Two of them, and the ash they are standing in is what keeps putting them back together.' } },
      { id: 'iron.tide', name: 'Something in the Tide Pools at Saltmere',
        client: 'The Saltmere cockle-women', where: 'Saltmere flats, at low water',
        reward: 24, difficulty: 2, days: 2,
        blurb: 'They work the flats barefoot and they have started working them in boots. When '
          + 'cockle-women put boots on, somebody should go and look.',
        mission: { zone: 'neutral', floor: 'sand', patch: 'water',
          spawns: [{ kind: 'brine', variant: 'lesser' }],
          waves: [{ at: 16, spawns: [{ kind: 'brine', variant: 'lesser' }] }],
          note: 'The water is its floor. Fight it on the sand or do not fight it.' } },
      { id: 'iron.orchard', name: 'Watch the Orchard at Nettlefold for Three Nights',
        client: 'Widow Anse', where: 'Nettlefold, the old orchard',
        reward: 19, difficulty: 1, days: 3,
        blurb: 'Three nights, sitting under a tree. She will feed you. She would like somebody '
          + 'there and she would rather not say why, which is the part worth the fee.',
        mission: { zone: 'dark', floor: 'grass', patch: 'dirt',
          objective: 'survive', seconds: 55,
          spawns: [{ kind: 'gale', variant: 'lesser' }],
          waves: [{ at: 20, spawns: [{ kind: 'shade', variant: 'lesser' }] },
            { at: 38, spawns: [{ kind: 'gale', variant: 'quick', count: 2 }] }],
          note: 'Three nights of nothing and then one night of something. Stay under the trees.' } },
      { id: 'iron.forge', name: 'The Smithy at Coldbrook Has Rats That Are Not Rats',
        client: 'Smith Toller', where: 'Coldbrook, the village smithy',
        reward: 26, difficulty: 2, days: 2,
        blurb: 'Toller has been a smith for thirty years and has never once asked for help. He '
          + 'has asked for help.',
        mission: { zone: 'neutral', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'rust', variant: 'stubborn' }],
          note: 'Something that eats iron, in a room made of it. Keep it off the ash bed.' } },
      { id: 'iron.causeway', name: 'Walk the Causeway Lamps at Fell Bank',
        client: 'The Society, on behalf of the parish', where: 'Fell Bank causeway',
        reward: 21, difficulty: 2, days: 4,
        blurb: 'Eight lamps, one causeway, four nights. Light them going out and count them '
          + 'coming back. The count is the job.',
        mission: { zone: 'dark', floor: 'stone', patch: 'water',
          objective: 'survive', seconds: 58,
          spawns: [{ kind: 'shade', variant: 'starved', count: 2 }],
          waves: [{ at: 24, spawns: [{ kind: 'brine', variant: 'lesser' }] }],
          note: 'The water either side of the causeway is not empty and the lamps do not reach it.' } },
      { id: 'iron.millrace', name: 'Clear Whatever Is in the Mill Race at Lowford',
        client: 'Marda Quill, miller', where: 'Lowford Mill, the head race',
        reward: 23, difficulty: 2, days: 2,
        blurb: 'The wheel has stopped twice this week and both times the race was clear by the '
          + 'time she got down to it. She would like a witness who is not her son.',
        mission: { zone: 'neutral', floor: 'stone', patch: 'water',
          spawns: [{ kind: 'brine', variant: 'lesser', count: 2 }],
          note: 'Two of them, and the race they are sitting in is what keeps mending them. There '
            + 'is a dry sill at the head of it.' } },
      { id: 'iron.crossing', name: 'Stand at the Ford Until the Carters Stop Complaining',
        client: 'The parish of Lowford', where: 'The ford below the mill',
        reward: 17, difficulty: 1, days: 3,
        blurb: 'Nobody has been hurt. Four carters in a fortnight have crossed and arrived without '
          + 'a load, and none of them can say when it went.',
        mission: { zone: 'light', floor: 'grass', patch: 'water',
          objective: 'survive', seconds: 52,
          spawns: [{ kind: 'gale', variant: 'lesser' }],
          waves: [{ at: 18, spawns: [{ kind: 'gale', variant: 'quick', count: 2 }] },
            { at: 36, spawns: [{ kind: 'brine', variant: 'lesser' }] }],
          note: 'Fast, light, and there is a great deal of standing water for the one that mends.' } },
      { id: 'iron.skeps', name: 'The Bees at Nettlefold Have Stopped Coming Out',
        client: 'Widow Anse', where: 'Nettlefold, the skep row',
        reward: 15, difficulty: 1, days: 2,
        blurb: 'Nine skeps, all of them warm, none of them working. She has not opened one and she '
          + 'is not going to.',
        mission: { zone: 'light', floor: 'grass', patch: 'dirt',
          spawns: [{ kind: 'mire', variant: 'lesser' }],
          waves: [{ at: 20, spawns: [{ kind: 'rust', variant: 'lesser', count: 2 }] }],
          note: 'Whatever is in the skeps is slow and it is heavy, and the ground it came up '
            + 'through is what puts it back.' } },
      { id: 'iron.claypit', name: 'Count the Barrows Out of the Clay Pit',
        client: 'Halder & Daughter, brickmakers', where: 'The clay pit, south of the ford',
        reward: 25, difficulty: 2, days: 4,
        blurb: 'Eleven barrows go down the ramp every day and eleven come up. Halder has counted '
          + 'twelve up on four separate days and has stopped counting out loud.',
        story: { arc: 'count', step: 2 },
        mission: { zone: 'neutral', floor: 'dirt', patch: 'stone',
          objective: 'survive', seconds: 62,
          spawns: [{ kind: 'earth', variant: 'stubborn' }],
          waves: [{ at: 22, spawns: [{ kind: 'earth', variant: 'lesser', count: 2 }] },
            { at: 44, spawns: [{ kind: 'shade', variant: 'lesser' }] }],
          note: 'Turned clay everywhere and one ramp of laid stone. Count them as they come, and '
            + 'do not be surprised when the number is wrong.' } },
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
          + 'work. Nobody in the fen admits to owning a sickle.',
        mission: { zone: 'dark', floor: 'dirt', patch: 'water',
          spawns: [{ kind: 'mire', variant: 'greater' }],
          waves: [{ at: 22, spawns: [{ kind: 'mire', variant: 'lesser', count: 2 }] }],
          note: 'Whatever is cutting the reed mends off every inch of this fen. There is nowhere to stand it does not like.' } },
      { id: 'bronze.caravan', name: 'The Ashfield Caravan, and What Rides Behind It',
        client: 'Vell & Sons, factors', where: 'The Ashen Road to Ashfield',
        reward: 140, difficulty: 3, days: 9,
        blurb: 'Six wagons, eleven days, and a thing that has followed the last three caravans and '
          + 'taken one person off each. Never the same watch.',
        mission: { zone: 'dark', floor: 'grass', patch: 'sand',
          objective: 'survive', seconds: 75,
          spawns: [{ kind: 'hollow', variant: 'lesser' }],
          waves: [{ at: 16, spawns: [{ kind: 'hollow', variant: 'none' }] },
            { at: 34, spawns: [{ kind: 'hollow', variant: 'quick' }] },
            { at: 52, spawns: [{ kind: 'hollow', variant: 'none', count: 2 }] }],
          note: 'It takes one a night and never the same watch. Eleven days of that. Do not let it get behind you.' } },
      { id: 'bronze.chapel', name: 'The Chapel at Winterbourne Is Warm',
        client: 'Diocesan office', where: 'Winterbourne',
        reward: 110, difficulty: 3, days: 5,
        blurb: 'Roofless for sixty years, and the flagstones are warm to the hand in frost. The '
          + 'office would like it surveyed, described, and left exactly as found.',
        mission: { zone: 'neutral', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'ember', variant: 'greater' }],
          waves: [{ at: 20, spawns: [{ kind: 'ember', variant: 'quick', count: 2 }] }],
          note: 'The flagstones are warm in frost, and now you know why. Keep it off the ash.' } },
      { id: 'bronze.quarry', name: 'Reopen the Coldbrook Quarry Face',
        client: 'Coldbrook Stone', where: 'Coldbrook',
        reward: 180, difficulty: 4, days: 12,
        blurb: 'The face has been shut since two cutters walked into it and one walked out backwards '
          + 'without turning round. The company will pay for an escort, not an answer.',
        mission: { zone: 'neutral', floor: 'stone', patch: 'dirt',
          spawns: [{ kind: 'warden', variant: 'none' }],
          waves: [{ at: 30, spawns: [{ kind: 'earth', variant: 'stubborn' }] }],
          note: 'It mends off the quarry floor, which is everything but the four corners. Make it come to the dirt.' } },
      { id: 'bronze.tithe', name: 'Recover the Tithe Barn Rolls',
        client: 'The Reeve of Lowford', where: 'Lowford',
        reward: 95, difficulty: 2, days: 4,
        blurb: 'Stolen, and then returned one page at a time, in order, through the letterbox. '
          + 'Fourteen pages to go. The Reeve wants it stopped before page fifteen.',
        mission: { zone: 'dark', floor: 'stone', patch: 'stone',
          objective: 'survive', seconds: 70,
          spawns: [{ kind: 'shade', variant: 'none' }],
          waves: [{ at: 14, spawns: [{ kind: 'shade', variant: 'starved' }] },
            { at: 28, spawns: [{ kind: 'shade', variant: 'quick' }] },
            { at: 42, spawns: [{ kind: 'hollow', variant: 'lesser' }] },
            { at: 56, spawns: [{ kind: 'shade', variant: 'greater' }] }],
          note: 'One page at a time, in order, and something has to be posting them. Bare stone: nothing mends here, including you.' } },
      { id: 'bronze.beacon', name: 'Hold the Fell Bank Beacon Through the Dark of the Month',
        client: 'The road wardens', where: 'Fell Bank',
        reward: 160, difficulty: 3, days: 14,
        blurb: 'Keep it lit. Do not go down to anything that calls up. Two wardens have gone down '
          + 'to something that called up.',
        mission: { zone: 'dark', floor: 'grass', patch: 'ash',
          objective: 'survive', seconds: 90,
          spawns: [{ kind: 'ember', variant: 'none', count: 2 }],
          waves: [{ at: 20, spawns: [{ kind: 'hollow', variant: 'lesser', count: 2 }] },
            { at: 40, spawns: [{ kind: 'ember', variant: 'greater' }] },
            { at: 58, spawns: [{ kind: 'hollow', variant: 'quick', count: 2 }] },
            { at: 76, spawns: [{ kind: 'barrow', variant: 'lesser' }] }],
          note: 'Keep it lit. Do not go down to anything that calls up. Two wardens went down to something that called up.' } },
      { id: 'bronze.astray', name: 'Bring the Ostler’s Boy Back From Wherever He Went',
        client: 'The Fleece, by the cross', where: 'Unknown',
        reward: 130, difficulty: 4, days: 7,
        blurb: 'He came back once already, for an hour, and could not say a word anyone knew. Then '
          + 'he went again. His mother has paid in advance and will not be talked out of it.',
        mission: { zone: 'dark', floor: 'grass', patch: 'dirt',
          spawns: [{ kind: 'hollow', variant: 'greater' }],
          waves: [{ at: 24, spawns: [{ kind: 'barrow', variant: 'lesser' }] }],
          note: 'Wherever he went, this came back instead. It knows where you are from the gate.' } },
      { id: 'bronze.assay', name: 'Escort the Assayer and Her Findings',
        client: 'The Society, on behalf', where: 'Coldbrook, then here',
        reward: 210, difficulty: 3, days: 6,
        blurb: 'She has been threatened in writing, twice, by somebody with the seal of a company '
          + 'that no longer exists. Bring her and the sealed box. The box matters more.',
        mission: { zone: 'light', floor: 'grass', patch: 'sand',
          objective: 'survive', seconds: 65,
          spawns: [{ kind: 'rust', variant: 'greater', count: 2 }],
          waves: [{ at: 18, spawns: [{ kind: 'gale', variant: 'quick', count: 2 }] },
            { at: 38, spawns: [{ kind: 'barrow', variant: 'starved' }] }],
          note: 'She walks, you stand between her and the road. The box matters more than either of you.' } },
      { id: 'bronze.barrow', name: 'The Barrow at Ninefields Has Been Opened',
        client: 'The Ninefields commons', where: 'Ninefields, the long barrow',
        reward: 118, difficulty: 4, days: 7,
        blurb: 'Opened from the inside, which the commons would like somebody to explain to them '
          + 'in words that are not the words they have been using.',
        mission: { zone: 'dark', floor: 'stone', patch: 'dirt',
          spawns: [{ kind: 'barrow', variant: 'none' }],
          waves: [{ at: 26, spawns: [{ kind: 'barrow', variant: 'lesser', count: 2 }] }],
          note: 'Turned earth is its ground. The flags are yours. Make it come to you.' } },
      { id: 'bronze.wardens', name: 'Two Quarry Wardens, One Face',
        client: 'Coldbrook Stone', where: 'Coldbrook, the upper face',
        reward: 152, difficulty: 5, days: 8,
        blurb: 'The company reopened the face. The face has an opinion about that, and now it has '
          + 'two of them.',
        mission: { zone: 'neutral', floor: 'dirt', patch: 'stone',
          spawns: [{ kind: 'warden', variant: 'lesser', count: 2 }],
          note: 'They mend off cut stone and the whole face is cut stone. Fight them on the spoil.' } },
      { id: 'bronze.hollows', name: 'Something Walked Into Marrowgate and Did Not Walk Out',
        client: 'The Marrowgate watch', where: 'Marrowgate, inside the wall',
        reward: 134, difficulty: 4, days: 5,
        blurb: 'The watch counted it in. The watch has counted everything out twice since and the '
          + 'numbers are right, which is what is frightening them.',
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          objective: 'survive', seconds: 70,
          spawns: [{ kind: 'hollow', variant: 'lesser' }],
          waves: [{ at: 24, spawns: [{ kind: 'shade', variant: 'greater' }] },
            { at: 48, spawns: [{ kind: 'hollow', variant: 'quick' }] }],
          note: 'It knows where you are from anywhere in the town, and it is faster than you.' } },
      { id: 'bronze.saltings', name: 'The Saltings Are Coming Up the Dyke',
        client: 'The Fen Reeve', where: 'Blackrush, the sea dyke',
        reward: 126, difficulty: 4, days: 6,
        blurb: 'Salt water in the ditches four miles inland, and something in the salt water that '
          + 'the reeve is not calling a tide.',
        mission: { zone: 'neutral', floor: 'sand', patch: 'water',
          objective: 'survive', seconds: 66,
          spawns: [{ kind: 'brine', variant: 'greater' }],
          waves: [{ at: 22, spawns: [{ kind: 'mire', variant: 'none' }] },
            { at: 44, spawns: [{ kind: 'brine', variant: 'stubborn', count: 2 }] }],
          note: 'Standing water everywhere it can reach. Hold the dry line and make them cross it.' } },
      { id: 'bronze.secondledger', name: 'The Same Hand Is Writing in Marrowgate',
        client: 'The Society, clerical', where: 'Marrowgate, the toll house',
        reward: 128, difficulty: 4, days: 6,
        blurb: 'A second tally book, ninety miles from the first, adding a line on the same nights '
          + 'in the same hand. The clerks would like somebody to sit with this one too.',
        story: { arc: 'count', step: 2.5 },
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          objective: 'survive', seconds: 75,
          spawns: [{ kind: 'shade', variant: 'greater' }],
          waves: [{ at: 24, spawns: [{ kind: 'tally', variant: 'lesser' }] },
            { at: 50, spawns: [{ kind: 'shade', variant: 'starved', count: 2 }] }],
          note: 'Sit with it. Something comes to do the writing and it mends off the ash in the '
            + 'grate, so keep it out on the flags.' } },
      { id: 'bronze.kennels', name: 'Something Got Into the Kennels at Ashfield',
        client: 'Vell & Sons, factors', where: 'Ashfield, the coaching kennels',
        reward: 96, difficulty: 3, days: 4,
        blurb: 'Twenty-two dogs, and every one of them is alive, fed and unwilling to go outside. '
          + 'The kennelman will not go out either and he is being paid to.',
        mission: { zone: 'neutral', floor: 'dirt', patch: 'dirt',
          spawns: [{ kind: 'rust', variant: 'greater', count: 2 }],
          waves: [{ at: 20, spawns: [{ kind: 'rust', variant: 'quick', count: 3 }] }],
          note: 'Fast, several, and none of them mends. Everything they have is in the first half '
            + 'minute — the trick is being alive at the end of it.' } },
      { id: 'bronze.lantern', name: 'Walk the Fell Bank Lantern for Eight Nights',
        client: 'Fell Bank parish', where: 'Fell Bank, the upper path',
        reward: 112, difficulty: 3, days: 8,
        blurb: 'Eight nights, one lantern, the same path. Seven of the nights are a walk. The '
          + 'parish will not say which one is not, because they do not know.',
        mission: { zone: 'dark', floor: 'stone', patch: 'dirt',
          objective: 'survive', seconds: 80,
          spawns: [{ kind: 'barrow', variant: 'lesser' }],
          waves: [{ at: 26, spawns: [{ kind: 'shade', variant: 'greater' }] },
            { at: 54, spawns: [{ kind: 'barrow', variant: 'none' }] }],
          note: 'The path is laid stone with turned earth either side of it, and what comes up out '
            + 'of the earth is put back by it. Stay on the path.' } },
      { id: 'bronze.weir', name: 'Reopen the Weir at Highwater',
        client: 'The city water board', where: 'Highwater, the lower weir',
        reward: 145, difficulty: 4, days: 7,
        blurb: 'The gates were sound in spring. They are shut now, from the downstream side, and '
          + 'the board has stopped sending men in twos.',
        mission: { zone: 'neutral', floor: 'stone', patch: 'water',
          spawns: [{ kind: 'mire', variant: 'greater' }, { kind: 'brine', variant: 'stubborn' }],
          waves: [{ at: 30, spawns: [{ kind: 'brine', variant: 'greater' }] }],
          note: 'Two things that mend off standing water, in a weir. The apron is dry. Everything '
            + 'else in this contract is not.' } },
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
          + 'four numbers, in order, one a day, with gaps. The gaps are the part nobody likes.',
        story: { arc: 'count', step: 3 },
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'tally', variant: 'none' }],
          waves: [{ at: 26, spawns: [{ kind: 'tally', variant: 'lesser', count: 2 }] },
            { at: 52, spawns: [{ kind: 'shade', variant: 'greater' }] }],
          note: 'It is under the ash and putting itself back together out of it faster than you '
            + 'can take it apart. Somewhere on this floor there is bare stone. Get it there.' } },
      { id: 'silver.procession', name: 'Break the Procession at Winterbourne',
        client: 'Diocesan office, under seal', where: 'Winterbourne',
        reward: 900, difficulty: 5, days: 10,
        blurb: 'It walks the old boundary on the first clear night of each month and it is longer '
          + 'every month. Two of the people in it are known to the office by name.',
        story: { arc: 'count', step: 4 },
        mission: { zone: 'neutral', floor: 'dirt', patch: 'stone',
          objective: 'survive', seconds: 90,
          spawns: [{ kind: 'chant', variant: 'lesser', count: 2 }],
          waves: [{ at: 30, spawns: [{ kind: 'chant', variant: 'none' }] },
            { at: 62, spawns: [{ kind: 'chant', variant: 'lesser', count: 2 }] }],
          note: 'They walk the boundary and the boundary is flagged, so every stone they cross '
            + 'mends them. You do not break a procession. You stand in it until it is over.' } },
      { id: 'silver.envoy', name: 'Stand Behind the Envoy and Say Nothing',
        client: 'The Chapter', where: 'The Old Capital',
        reward: 750, difficulty: 3, days: 21,
        blurb: 'A silver adventurer at the shoulder is the whole message. You will be searched, '
          + 'seated, and expected to be visibly capable of ending the room.',
        mission: { zone: 'light', floor: 'stone', patch: 'stone',
          objective: 'survive', seconds: 85,
          spawns: [{ kind: 'glass', variant: 'lesser' }],
          waves: [{ at: 20, spawns: [{ kind: 'glass', variant: 'quick' }] },
            { at: 44, spawns: [{ kind: 'glass', variant: 'none', count: 2 }] },
            { at: 66, spawns: [{ kind: 'glass', variant: 'greater' }] }],
          note: 'Nothing in the room mends and nothing in the room is slow. You are not clearing '
            + 'anything — you are standing where you were put until the envoy has finished.' } },
      { id: 'silver.reservoir', name: 'Find What the Reservoir Is Filtering Out',
        client: 'The city water board', where: 'Highwater',
        reward: 1100, difficulty: 5, days: 18,
        blurb: 'The water is clean. It is cleaner than the river feeding it, by a margin that '
          + 'nobody can account for, and the intake screens are being taken off from the inside.',
        mission: { zone: 'dark', floor: 'stone', patch: 'water',
          spawns: [{ kind: 'brine', variant: 'greater' }, { kind: 'glass', variant: 'lesser' }],
          waves: [{ at: 28, spawns: [{ kind: 'brine', variant: 'stubborn', count: 2 }] }],
          note: 'Whatever is cleaning the water is standing in it, and standing in it is what '
            + 'keeps it whole. There is a dry apron round the intake. Fight on that.' } },
      { id: 'silver.name', name: 'Bring Back the Name of the Thing in the Deep Cut',
        client: 'The Chapter, under seal', where: 'The Deep Cut',
        reward: 1400, difficulty: 5, days: 21,
        blurb: 'Not the thing. The name. Four adventurers of silver rank have gone down and two '
          + 'have come back, and neither would write it.',
        mission: { zone: 'dark', floor: 'ash', patch: 'stone',
          objective: 'survive', seconds: 100,
          spawns: [{ kind: 'hollow', variant: 'greater' }],
          waves: [{ at: 24, spawns: [{ kind: 'chant', variant: 'lesser' }] },
            { at: 50, spawns: [{ kind: 'hollow', variant: 'quick', count: 2 }] },
            { at: 76, spawns: [{ kind: 'glass', variant: 'greater' }] }],
          note: 'You are not here to kill it. You are here for a hundred seconds and a name, and '
            + 'the two who came back had both of those and would only give one.' } },
      { id: 'silver.tithe', name: 'The Tithe Barn at Winterbourne Is Full and Nobody Filled It',
        client: 'Diocesan office', where: 'Winterbourne, the tithe barn',
        reward: 780, difficulty: 4, days: 12,
        blurb: 'Corn to the rafters in a bad year, in a barn that was empty at Michaelmas, with '
          + 'the doors barred from outside the whole time.',
        mission: { zone: 'light', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'tally', variant: 'greater' }],
          waves: [{ at: 28, spawns: [{ kind: 'mire', variant: 'greater', count: 2 }] },
            { at: 58, spawns: [{ kind: 'tally', variant: 'lesser', count: 2 }] }],
          note: 'It has been counting the corn in and it will count you too. Every scrap of chaff '
            + 'on this floor is somewhere it can mend.' } },
      { id: 'silver.glasshouse', name: 'The Glasshouse at Highwater Is Still Making Things',
        client: 'The Chapter', where: 'Highwater, the burnt glassworks',
        reward: 1050, difficulty: 5, days: 9,
        blurb: 'It burnt eleven years ago and the furnaces are cold. Somebody is buying finished '
          + 'work out of it in quantity and paying the going rate.',
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'glass', variant: 'greater' }, { kind: 'glass', variant: 'quick' }],
          waves: [{ at: 26, spawns: [{ kind: 'glass', variant: 'none', count: 3 }] },
            { at: 54, spawns: [{ kind: 'ember', variant: 'greater' }] }],
          note: 'Nothing in here mends and nothing in here is slow, and there is going to be more '
            + 'of it than there is of you.' } },
      { id: 'silver.bells', name: 'Stop the Bells at Marrowgate Ringing Themselves',
        client: 'The Marrowgate watch', where: 'Marrowgate, the tower',
        reward: 890, difficulty: 4, days: 6,
        blurb: 'Four in the morning, all six bells, in an order. The watch has written the order '
          + 'down for nine nights and it has not repeated.',
        story: { arc: 'count', step: 4.5 },
        mission: { zone: 'dark', floor: 'stone', patch: 'stone',
          objective: 'survive', seconds: 95,
          spawns: [{ kind: 'chant', variant: 'none' }],
          waves: [{ at: 28, spawns: [{ kind: 'hollow', variant: 'greater' }] },
            { at: 58, spawns: [{ kind: 'chant', variant: 'lesser', count: 2 }] }],
          note: 'The whole tower floor is laid stone and the thing pulling the ropes mends off '
            + 'every inch of it. You cannot win this one. You can outlast it.' } },
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
          + 'holder of this contract has moved.',
        mission: { zone: 'light', floor: 'stone', patch: 'stone',
          objective: 'survive', seconds: 120,
          spawns: [{ kind: 'glass', variant: 'greater' }],
          waves: [{ at: 26, spawns: [{ kind: 'glass', variant: 'quick', count: 2 }] },
            { at: 55, spawns: [{ kind: 'chant', variant: 'none' }] },
            { at: 84, spawns: [{ kind: 'glass', variant: 'greater', count: 2 }] }],
          note: 'Front rank, armed, and told not to move. Two minutes. Every previous holder of '
            + 'this contract moved, and the Chapter would like to know at which minute.' } },
      { id: 'gold.tide', name: 'The Tide at Marrow Sands Has Stopped Going Out',
        client: 'The Chapter', where: 'Marrow Sands',
        reward: 6500, difficulty: 5, days: 40,
        blurb: 'Nine days now. The sea is where it was, the moon is where it should be, and four '
          + 'villages are eating their seed corn. Something is holding it and it is not tired.',
        mission: { zone: 'neutral', floor: 'sand', patch: 'grass',
          spawns: [{ kind: 'verge', variant: 'none' }],
          waves: [{ at: 34, spawns: [{ kind: 'brine', variant: 'greater', count: 2 }] },
            { at: 68, spawns: [{ kind: 'verge', variant: 'lesser' }] }],
          note: 'It is standing in the marram and the marram is what is holding it up. The sand '
            + 'is yours. Everything green on this beach is its.' } },
      { id: 'gold.ledger', name: 'Close the Ledger',
        client: 'The Chapter, under seal', where: 'Sealed',
        reward: 9000, difficulty: 5, days: 90,
        blurb: 'The brief is one page and you may read it once, here, standing, with a clerk. If '
          + 'you take it your name comes off the Society roll on the day you leave.',
        story: { arc: 'count', step: 5, last: true },
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          spawns: [{ kind: 'verge', variant: 'stubborn' }, { kind: 'tally', variant: 'greater' }],
          waves: [{ at: 30, spawns: [{ kind: 'chant', variant: 'greater' }] },
            { at: 60, spawns: [{ kind: 'tally', variant: 'stubborn', count: 2 }] },
            { at: 92, spawns: [{ kind: 'glass', variant: 'greater', count: 2 }] }],
          note: 'The last page. Everything that has been counting is in this room, and the ash '
            + 'under it is what has been keeping the count. Close it.' } },
      { id: 'gold.verge', name: 'The Verge Has Come Down Off Fell Bank',
        client: 'The Chapter, under seal', where: 'Between Fell Bank and Lowford',
        reward: 7500, difficulty: 5, days: 30,
        blurb: 'It has been on the bank since before the bank had a name. It is nine miles from '
          + 'there now, moving at the speed of grass, and Lowford is in the way.',
        mission: { zone: 'light', floor: 'stone', patch: 'grass',
          spawns: [{ kind: 'verge', variant: 'greater' }],
          waves: [{ at: 40, spawns: [{ kind: 'mire', variant: 'greater', count: 2 }] },
            { at: 80, spawns: [{ kind: 'verge', variant: 'lesser', count: 2 }] }],
          note: 'It is the size of a gatehouse and every blade of grass it stands on is putting '
            + 'it back together. There is a paved drove road through the middle of this field.' } },
      { id: 'gold.roll', name: 'Take Four Names Off the Society Roll',
        client: 'The Chapter, under seal', where: 'Sealed',
        reward: 8200, difficulty: 5, days: 60,
        blurb: 'Four gold adventurers, all of them known to you by reputation, none of them dead. '
          + 'The Chapter is not asking you to bring them in.',
        mission: { zone: 'dark', floor: 'stone', patch: 'ash',
          objective: 'survive', seconds: 130,
          spawns: [{ kind: 'glass', variant: 'greater' }, { kind: 'hollow', variant: 'greater' }],
          waves: [{ at: 32, spawns: [{ kind: 'chant', variant: 'greater' }] },
            { at: 66, spawns: [{ kind: 'verge', variant: 'lesser' }] },
            { at: 100, spawns: [{ kind: 'glass', variant: 'greater', count: 2 }] }],
          note: 'Four of them, one at a time, and every one of them was better than you when the '
            + 'Chapter wrote their name down. Two minutes and ten seconds.' } },
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
