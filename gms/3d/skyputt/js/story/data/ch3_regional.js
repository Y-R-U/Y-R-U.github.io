// Chapter 3 — "Regional Cup": up north at the Frost Fair grounds (frost theme). Rival: Remy Banks.
export default {
  id: 'regional', name: 'Regional Cup', title: 'Chapter 3 · Regional Cup', course: 'sky', theme: 'frost',
  rankOnFinish: 'Semi-pro', trophy: 'The Frostpeak Regional Cup',
  blurb: 'Up north to the Frost Fair grounds. Snow on the walls, ice in the veins.',
  intro: [
    ['mags', 'Brr. Welcome to the Regional Cup, {name}. Same holes you know, dressed for winter.'],
    ['banks', 'Remy Banks. Regional champion, three years running. You play the middle of the fairway?'],
    ['banks', "Cute. I play the walls. Every wall is a cushion, and I always know the angle."],
    ['mags', "Banks was a billiards prodigy before golf. Watch the walls this chapter."],
  ],
  outro: [
    ['banks', 'Regional champion. ...Says so on the trophy. Not my name, for once.'],
    ['mags', 'Semi-pro, {name}! The National Tour has sent a letter. And a pumpkin. Odd people.'],
  ],
  tip: 'Walls are friends here. A bank shot can be safer than a straight one.',
  events: [
    {
      id: 'reg-l1', kind: 'lesson', name: 'Lesson: Ride the Banks', holes: ['sky15'],
      goal: { maxStrokes: 3 }, goalText: 'Hole out in 3 strokes or fewer',
      before: [
        ['mags', "The Switchback's corners are banked: the floor tilts up on the outside."],
        ['mags', 'Roll a good pace into a corner and the bank carries you round. Too slow and you fall to the inside.'],
      ],
      after: [['mags', "Banks would've hit both walls on purpose. You did fine without."]],
      tips: ['Banked corners: keep your pace up through the turns'],
      reward: { coins: 40 },
    },
    {
      id: 'reg-l2', kind: 'lesson', name: 'Lesson: Sticky Ball', holes: ['sky16'],
      goal: { use: 'sticky', maxStrokes: 4 }, goalText: 'Use a Sticky Ball, then hole out in 4 or fewer',
      grant: { sticky: 2 },
      before: [
        ['banks', 'Pinball, my favourite. Bumpers are just angry walls.'],
        ['mags', 'Sticky Ball takes the bounce out of walls and bumpers for one shot. Nice for the rubbery ones.'],
      ],
      after: [['mags', 'Less bounce, more control. Banks hates that trick.']],
      tips: ['Arm Sticky Ball to soften the bumpers'],
      reward: { coins: 40, helpers: { sticky: 1 } },
    },
    {
      id: 'reg-r1', kind: 'round', name: 'Qualifying Round', holes: ['sky4', 'sky5', 'sky6', 'sky7'],
      goal: { starsAtLeast: 8 }, goalText: 'Earn 8 stars over 4 holes',
      before: [['sunny', 'Qualifying at the Frost Fair! Four holes from the front nine, par on each to make the cut.']],
      after: [['sunny', "{name} is through to the Regional Cup!"]],
      reward: { coins: 60 },
    },
    {
      id: 'reg-r2', kind: 'round', name: 'Practice in the Snow', holes: ['sky15', 'sky16', 'sky17'],
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [['mags', 'The hard end of the back nine. Banks will play all three of these against you.']],
      after: [['banks', 'Not bad. You use the walls like you are scared of them. We can fix that. By beating you.']],
      reward: { coins: 70, helpers: { sticky: 1, steady: 1 } },
    },
    {
      id: 'reg-rival', kind: 'rival', name: 'Rival: Remy Banks', holes: ['sky13', 'sky15', 'sky16', 'sky2'],
      rival: 'banks_reg', goal: { beat: true }, goalText: 'Beat Banks’s total over 4 holes',
      before: [
        ['banks', 'Watch the ghost, {name}. It will hit more walls than you think possible and still find the cup.'],
        ['mags', 'Banks takes the long way round on purpose. Go straight where you can and let the extra bounces cost Remy.'],
      ],
      after: [['banks', "Straight lines. Who knew. Here, take my checkered ball. It's seen every angle there is."], ['mags', 'The National Tour is open now. Banks will be there too, mind.']],
      lose: [['banks', 'Two cushions and in. Physics, kid.'], ['mags', 'Remy got the angles today. Go again.']],
      reward: { coins: 160, helpers: { sticky: 2, guard: 1, longSight: 2 }, cosmetic: 'ball:checker' },
    },
    {
      id: 'reg-cup', kind: 'tournament', name: 'The Regional Cup', holes: ['sky10', 'sky11', 'sky12', 'sky13', 'sky14', 'sky15', 'sky16', 'sky17', 'sky18'],
      field: ['banks_reg', 'lou_reg', 'ivy', 'stan', 'rosa', 'kai', 'gwen', 'hugo', 'tess'], goal: { place: 3 }, goalText: 'Finish in the top 3 of 10',
      before: [
        ['sunny', "It's the Regional Cup! The full back nine, ten players, and snow on the windmills."],
        ['mags', 'Nine holes is a long time. Bad hole? Forget it by the next tee.'],
      ],
      after: [['sunny', '{name} takes a podium spot at the Regional Cup! The crowd is thawing out to cheer.'], ['mags', 'That’s the north conquered.']],
      lose: [['sunny', 'A tough day in the cold for {name}.'], ['mags', 'Nine holes is a marathon. Have another go.']],
      reward: { coins: 260, helpers: { longSight: 2, mulligan: 2, sticky: 1, magnet: 1 } },
    },
  ],
};
