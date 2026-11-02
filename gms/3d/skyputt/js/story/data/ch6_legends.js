// Chapter 6 — "Legends": home to the Sky Isles. The Legends Cup, then the final match against Old Mags.
export default {
  id: 'legends', name: 'Legends', title: 'Chapter 6 · Legends', course: 'sky', theme: 'sky',
  rankOnFinish: 'Legend', trophy: 'The Sky Cup',
  blurb: 'Back to where it started. The Legends Cup, and one last match against your coach.',
  intro: [
    ['mags', 'Home again. The Legends Cup is played on the Sky Isles, front and back. Always has been.'],
    ['mags', 'I won it three times, {name}. And they still let past champions enter.'],
    ['you', 'Wait. You’re playing?'],
    ['mags', "Course I'm playing. Somebody has to see if I taught you properly."],
  ],
  outro: [
    ['mags', "Well. Look at that. Beaten by my own student. Best day I've had since the snack hut got a roof."],
    ['mags', 'Legend, {name}. The Sky Cup is yours. Come by the hut sometime. Lemonade is on the house. Forever.'],
  ],
  tip: 'Everything you know, all at once. Trust your pace.',
  events: [
    {
      id: 'leg-l1', kind: 'lesson', name: 'Mags’ Last Lesson', holes: ['sky18'],
      goal: { maxStrokes: 5 }, goalText: 'Hole out in 5 strokes or fewer (par)',
      before: [
        ['mags', 'The Sky Crown. Windmill, loop, blocks and bumpers. Everything you have learned, in one hole.'],
        ['mags', "No new tricks today. Par, and I'll say you're ready."],
      ],
      after: [['mags', "Ready. Don't let it go to your head."]],
      tips: ['Everything at once: time the windmill, commit to the loop'],
      reward: { coins: 80 },
    },
    {
      id: 'leg-r1', kind: 'round', name: 'Legends Practice: Front Nine', holes: ['sky1', 'sky2', 'sky3', 'sky4', 'sky5', 'sky6', 'sky7', 'sky8', 'sky9'],
      goal: { starsAtLeast: 20 }, goalText: 'Earn 20 stars over the front nine',
      before: [['mags', 'Where it all started. Par everywhere and a couple of birdies: 20 stars.']],
      after: [['mags', 'Remember your first putt on hole 1? I do. It went backwards.']],
      reward: { coins: 120 },
    },
    {
      id: 'leg-r2', kind: 'round', name: 'Legends Practice: Back Nine', holes: ['sky10', 'sky11', 'sky12', 'sky13', 'sky14', 'sky15', 'sky16', 'sky17', 'sky18'],
      goal: { starsAtLeast: 20 }, goalText: 'Earn 20 stars over the back nine',
      before: [['mags', 'Now the hard nine. Same target: 20 stars.']],
      after: [['sunny', 'The Legends field is set, and {name} is in it!']],
      reward: { coins: 140, helpers: { longSight: 2, magnet: 1, steady: 1 } },
    },
    {
      id: 'leg-cup', kind: 'tournament', name: 'The Legends Cup', holes: ['sky1', 'sky3', 'sky7', 'sky9', 'sky11', 'sky13', 'sky16', 'sky17', 'sky18'],
      field: ['pro_legend', 'prof_legend', 'bertha_legend', 'banks_legend', 'zoe_legend', 'lou_legend', 'carl_legend', 'ada', 'mags_legend'], goal: { place: 3 }, goalText: 'Finish in the top 3 of 10',
      before: [
        ['sunny', 'The Legends Cup! Every rival you have ever faced, plus a three-time champion from the snack hut.'],
        ['carl', 'I laid up all the way here, you know. Very carefully.'],
        ['mags', 'Make the top three, {name}, and you get your final match. Against me.'],
      ],
      after: [['sunny', '{name} makes the Legends final!'], ['mags', "Thought you might. Four holes, you and me. Whenever you're ready."]],
      lose: [['sunny', 'Not this time for {name} at the Legends Cup.'], ['mags', 'Legends are hard to beat. That’s the point. Go again.']],
      reward: { coins: 400, helpers: { longSight: 2, mulligan: 2, magnet: 2 } },
    },
    {
      id: 'leg-final', kind: 'rival', name: 'Final: Old Mags', holes: ['sky1', 'sky9', 'sky17', 'sky18'],
      rival: 'mags_legend', goal: { beat: true }, goalText: 'Beat Mags’s total over 4 holes',
      before: [
        ['mags', "Hole 1, where you started. Then the Grand Isle, the Twin Mills and the Crown."],
        ['mags', "I won't go easy on you, {name}. That would be an insult to us both."],
      ],
      after: [['mags', 'Ha! There it is. Take my old trail, the one I won the Sky Cup with. It suits you.']],
      lose: [['mags', "Not yet, kid. Not yet. But close. Go again."]],
      reward: { coins: 500, helpers: { longSight: 3, mulligan: 3, magnet: 2, ghost: 2 }, cosmetic: 'trail:sparkle' },
    },
  ],
};
