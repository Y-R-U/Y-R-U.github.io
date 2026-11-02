// Chapter 5 — "World Tour": the tour travels, so events pick their own theme. Rival: The Pro.
// No new rank here (Pro stays Pro); the chapter gives a trophy instead. Legend waits in chapter 6.
export default {
  id: 'world', name: 'World Tour', title: 'Chapter 5 · World Tour', course: 'sky', theme: 'sky',
  rankOnFinish: null, trophy: 'The World Tour Globe',
  blurb: 'Sky, snow and the Hollow, one stop after another. The world number one is waiting.',
  intro: [
    ['sunny', 'Ladies and gentlemen, the World Tour! Three stops, the best players alive, one globe-shaped trophy.'],
    ['pro', 'Sterling Vance. They call me The Pro. I have read about you. I read about everyone.'],
    ['pro', 'I do not miss short putts. I do not take silly risks. I simply play every hole correctly.'],
    ['mags', "He's very good, {name}. But correct isn't the same as brave. You'll see."],
  ],
  outro: [
    ['pro', 'World Tour champion. ...I will need to read about you again.'],
    ['mags', "One more door, {name}. The Legends. And I've got the key."],
  ],
  tip: 'At this level everyone makes par. The birdies decide it.',
  events: [
    {
      id: 'world-l1', kind: 'lesson', name: 'Clinic: Ghost Ball', holes: ['sky8'], theme: 'sky',
      goal: { use: 'ghost', maxStrokes: 3 }, goalText: 'Use a Ghost Ball, then hole out in 3 or fewer',
      grant: { ghost: 2 },
      before: [
        ['pro', 'A tour clinic. I am told I must teach. Very well.'],
        ['pro', 'Ghost Ball passes through the first moving obstacle it touches. The sliding blocks here, for example.'],
        ['mags', "Don't tell him, but I taught him that one."],
      ],
      after: [['pro', 'Adequate. More than adequate.']],
      tips: ['Arm Ghost Ball and putt straight through the blocks'],
      reward: { coins: 60, helpers: { ghost: 1 } },
    },
    {
      id: 'world-l2', kind: 'lesson', name: 'Clinic: Two Loops, One Putt', holes: ['sky11'], theme: 'frost',
      goal: { maxStrokes: 2 }, goalText: 'Hole out in 2 strokes or fewer',
      before: [
        ['pro', 'The Double Loop. Most players take three. I take one, sometimes two.'],
        ['pro', 'Hit the boost pad dead centre and commit. A half-hearted putt rolls back to your feet.'],
      ],
      after: [['pro', 'Two loops, no fear. Correct.']],
      tips: ['Full commitment: centre of the boost pad'],
      reward: { coins: 60 },
    },
    {
      id: 'world-r1', kind: 'round', name: 'Frostpeak Stop', holes: ['sky10', 'sky12', 'sky14', 'sky15'], theme: 'frost',
      goal: { starsAtLeast: 9 }, goalText: 'Earn 9 stars over 4 holes',
      before: [['sunny', 'First stop: Frostpeak! Four holes in the snow. Nine stars to stay in touch with the leaders.']],
      after: [['sunny', '{name} stays right in the hunt at Frostpeak!']],
      reward: { coins: 90 },
    },
    {
      id: 'world-r2', kind: 'round', name: 'Hollow Masters', holes: ['sky7', 'sky16', 'sky17'], theme: 'spooky',
      goal: { starsAtLeast: 7 }, goalText: 'Earn 7 stars over 3 holes',
      before: [['sunny', 'The Hollow Masters, at midnight of course. Three of the meanest holes on the tour.']],
      after: [['pro', 'You took the plank on seven. I never take the plank. ...I may reconsider.']],
      reward: { coins: 100, helpers: { ghost: 1, magnet: 1 } },
    },
    {
      id: 'world-rival', kind: 'rival', name: 'Rival: The Pro', holes: ['sky7', 'sky13', 'sky17', 'sky18'], theme: 'sky',
      rival: 'pro_world', goal: { beat: true }, goalText: 'Beat The Pro’s total over 4 holes',
      before: [
        ['pro', 'Four holes. The Shortcut, the Fork, the Twin Mills and the Crown. Shall we?'],
        ['mags', "He won't give you anything. Make birdies. Use what you've earned: that's what helpers are for."],
      ],
      after: [['pro', 'Well played. Truly. Take this gold ball. I have several. I have never given one away.'], ['mags', 'The Legends are open, {name}. I’ll see you there.']],
      lose: [['pro', 'Correct golf wins. Come back when you are more correct.'], ['mags', 'He’s the best for a reason. Go again.']],
      reward: { coins: 260, helpers: { longSight: 2, magnet: 2, ghost: 1, steady: 1 }, cosmetic: 'ball:gold' },
    },
    {
      id: 'world-final', kind: 'tournament', name: 'World Tour Final', holes: ['sky2', 'sky5', 'sky7', 'sky9', 'sky11', 'sky13', 'sky15', 'sky17', 'sky18'], theme: 'frost',
      field: ['pro_world', 'bertha_world', 'professor', 'zoe', 'nico', 'ezra', 'lena', 'arlo', 'rhea', 'sol', 'lou_world'], goal: { place: 3 }, goalText: 'Finish in the top 3 of 12',
      before: [
        ['sunny', 'The World Tour Final! Nine holes from both nines, twelve players, one globe.'],
        ['mags', 'Plenty of them will go under par today. Stay patient, take the birdies when they come.'],
      ],
      after: [['sunny', '{name} on the World Tour podium! What a story!'], ['mags', 'From the Muni to the world. Not bad, kid.']],
      lose: [['sunny', 'Not quite for {name} at the Final.'], ['mags', "The world's best had a good day. Have another go."]],
      reward: { coins: 400, helpers: { longSight: 3, mulligan: 2, magnet: 2, ghost: 1 } },
    },
  ],
};
