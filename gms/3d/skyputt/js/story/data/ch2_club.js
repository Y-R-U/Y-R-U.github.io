// Chapter 2 — "Club Tour": Cloudbury Club and the Sky Isles back nine. Rival: Lucky Lou.
// Same shape as ch1 (see ch1_muni.js for the event kinds and goals). Goals may use any helper id.
export default {
  id: 'club', name: 'Club Tour', title: 'Chapter 2 · Club Tour', course: 'sky', theme: 'sky',
  rankOnFinish: 'Club Player', trophy: 'The Cloudbury Cup',
  blurb: 'Cloudbury Club and the back nine of the Sky Isles. Members only, and they let you in.',
  intro: [
    ['mags', 'Pack a bag, {name}. Cloudbury Club has the back nine of the isles: ice, loops, a corkscrew, the lot.'],
    ['lou', 'Ooh, fresh blood! Lou Marlow. They call me Lucky. I call it skill wearing a funny hat.'],
    ['mags', "Lou once holed out off two walls and a seagull. Don't try to copy that."],
  ],
  outro: [
    ['lou', 'Club Champion! Drinks are on you. ...I mean on me. Next time.'],
    ['mags', "Club Player, {name}. The Regional Cup will want a look at you. It's cold up north."],
  ],
  tip: 'The back nine rewards a soft touch. Pace first, line second.',
  events: [
    {
      id: 'club-l1', kind: 'lesson', name: 'Lesson: On Thin Ice', holes: ['sky10'],
      goal: { maxStrokes: 4 }, goalText: 'Hole out in 4 strokes or fewer',
      before: [
        ['mags', 'The pale stretch is ice. Hardly any friction: the ball keeps going long after grass would stop it.'],
        ['mags', 'Hit it about half as hard as you think. The rise at the green will catch a slow ball.'],
      ],
      after: [['mags', 'Gentle hands. That will matter more and more.']],
      tips: ['Ice keeps the ball rolling: putt softer than usual'],
      reward: { coins: 30 },
    },
    {
      id: 'club-l2', kind: 'lesson', name: 'Lesson: Magnet Cup', holes: ['sky12'],
      goal: { use: 'magnet', maxStrokes: 4 }, goalText: 'Use a Magnet Cup, then hole out in 4 or fewer',
      grant: { magnet: 2 },
      before: [
        ['mags', 'The Corkscrew. The tube does the hard part; the green is where it gets fiddly.'],
        ['mags', "Here's two Magnet Cups. Arm one before a putt and the cup pulls in anything that rolls close."],
      ],
      after: [['mags', "Handy, eh? Save them for the putts that scare you."]],
      tips: ['Tap the magnet button before your putt'],
      reward: { coins: 30, helpers: { magnet: 1 } },
    },
    {
      id: 'club-l3', kind: 'lesson', name: 'Lesson: Steady Hands', holes: ['sky17'],
      goal: { use: 'steady', maxStrokes: 5 }, goalText: 'Use Steady Hands, then hole out in 5 or fewer',
      grant: { steady: 2 },
      before: [
        ['mags', 'Two windmills, two speeds. Most folk get swatted back at least once.'],
        ['mags', 'Steady Hands slows every moving thing on the hole for one shot. Watch the blades crawl.'],
      ],
      after: [['mags', 'Timing beats power. Remember that when Lou starts showing off.']],
      tips: ['Arm Steady Hands before you go through a windmill'],
      reward: { coins: 35, helpers: { steady: 1 } },
    },
    {
      id: 'club-r1', kind: 'round', name: 'Members’ Morning', holes: ['sky10', 'sky11', 'sky12'],
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [['mags', 'Ice, two loops and the corkscrew. Par on each and the members will stop staring.']],
      after: [['mags', 'They’re still staring. Good kind of staring.']],
      reward: { coins: 50 },
    },
    {
      id: 'club-r2', kind: 'round', name: 'Twilight Three', holes: ['sky13', 'sky14', 'sky15'],
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [['mags', 'The Fork, the islands and the switchback. Pick your lanes.']],
      after: [['lou', 'Not bad, newbie! Fancy a little match? Loser buys the lemonade.']],
      reward: { coins: 60, helpers: { longSight: 1, magnet: 1 } },
    },
    {
      id: 'club-rival', kind: 'rival', name: 'Rival: Lucky Lou', holes: ['sky10', 'sky12', 'sky15', 'sky16'],
      rival: 'lou_club', goal: { beat: true }, goalText: 'Beat Lou’s total over 4 holes',
      before: [
        ['lou', "Four holes, you and me: the ice, the corkscrew, the switchback and the pinball. I don't plan my shots. I just feel them."],
        ['lou', "Sometimes they feel terrible! But sometimes... whoosh."],
        ['mags', "Lou has good days and wild days. Play your own game and let Lou's luck run out."],
      ],
      after: [['lou', 'Whoosh, but for you. Fair and square, {name}. Take my lucky ball, it clearly works better for you.'], ['mags', "That's the Club Tour beaten. The Regional Cup is open now, whenever you're ready."]],
      lose: [['lou', "Ha! Luck's a muscle, kid. Gotta exercise it."], ['mags', 'Lou got the bounces. They even out. Go again.']],
      reward: { coins: 120, helpers: { magnet: 2, steady: 1, longSight: 1 }, cosmetic: 'ball:polka' },
    },
    {
      id: 'club-champ', kind: 'tournament', name: 'Cloudbury Club Championship', holes: ['sky10', 'sky11', 'sky12', 'sky15', 'sky16', 'sky17'],
      field: ['lou_club', 'carl_club', 'hattie', 'fitz', 'opal', 'milo', 'dot_club'], goal: { place: 3 }, goalText: 'Finish in the top 3 of 8',
      before: [
        ['sunny', 'Good afternoon from Cloudbury! Sunny Vale here, and what a field for the Club Championship.'],
        ['sunny', 'Eight players, six holes of the back nine, and a newcomer from the Muni. Let’s go!'],
      ],
      after: [['sunny', 'A newcomer on the podium at Cloudbury! Remember the name: {name}.'], ['mags', 'Told you the back nine suits you.']],
      lose: [['sunny', 'Not this year for {name}, but what a debut.'], ['mags', 'The ice got you. Shake it off and go again.']],
      reward: { coins: 200, helpers: { longSight: 2, mulligan: 2, magnet: 1 } },
    },
  ],
};
