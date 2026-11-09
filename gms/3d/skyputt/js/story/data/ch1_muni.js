// Chapter 1 — "Muni". Pure data: later chapters are just more files like this one.
// Event kinds: lesson (one hole + a teaching goal), round (holes + a star target),
// rival (head-to-head vs one AI golfer), tournament (a field of AI golfers, finish in the top N).
// Goals: { maxStrokes } | { starsAtLeast } | { use: 'longSight'|'mulligan' } | { beat: true } | { place: n }
// Dialogue lines: [speakerId, text]; {name} is replaced with the player's name.
export default {
  id: 'muni', name: 'Muni', title: 'Chapter 1 · Muni', course: 'sky', rankOnFinish: 'Amateur', trophy: 'The Pineapple',
  blurb: 'The rundown Sky Isles municipal course. Everyone starts here.',
  intro: [
    ['mags', 'Well now. A new face at the Muni. The windmill sticks and the loop rattles, but she plays true.'],
    ['mags', "Name's Mags. Won the Sky Cup three times before you were born. Now I sell lemonade."],
    ['mags', "{name}, is it? Grab a putter. Let's see what you've got."],
  ],
  outro: [
    ['mags', "You beat the Muni Open. Folks are going to start calling you something other than 'kid'."],
    ['mags', 'The Club Tour won’t be so friendly. Rest up, {name}.'],
  ],
  events: [
    {
      id: 'muni-l1', kind: 'lesson', name: 'Lesson: Aim and Putt', holes: ['sky1'],
      goal: { maxStrokes: 3 }, goalText: 'Hole out in 3 strokes or fewer',
      before: [
        ['mags', 'Drag back anywhere on the screen, like pulling a slingshot. The ball goes the other way.'],
        ['mags', 'Pull further for more power. Slide back to where you started to cancel.'],
        ['mags', 'Soft hands near the cup. A ball rolling too fast hops right over it.'],
      ],
      after: [['mags', 'Not bad! You found the bottom of the cup. Next, the windmill.']],
      tips: ['Drag back to aim · release to putt'],
      reward: { coins: 20 },
    },
    {
      id: 'muni-l2', kind: 'lesson', name: 'Lesson: Long Sight', holes: ['sky2'],
      goal: { use: 'longSight', maxStrokes: 4 }, goalText: 'Use Long Sight, then hole out in 4 or fewer',
      grant: { longSight: 2 },
      before: [
        ['mags', 'See that windmill? Time it right and you slip through the tunnel.'],
        ['mags', "Here, take two Long Sights. Tap the arrow at the top of your helper column before a shot and your guide line stretches out and shows the bounce."],
        ['mags', 'Stack up to three for an even longer look. They don’t grow on trees, mind.'],
      ],
      after: [['mags', 'See how much easier it is when you know where it’s going? Use them wisely.']],
      tips: ['Tap Long Sight (top of the helper column) to aim'],
      reward: { coins: 25, helpers: { longSight: 1 } },
    },
    {
      id: 'muni-l3', kind: 'lesson', name: 'Lesson: Mulligan', holes: ['sky3'],
      goal: { use: 'mulligan', maxStrokes: 5 }, goalText: 'Take a Mulligan, then hole out in 5 or fewer',
      grant: { mulligan: 2 },
      before: [
        ['mags', "Everybody hits a stinker. The pros just pretend they didn't."],
        ['mags', 'A Mulligan puts your ball back where it was and forgets the stroke. Even a ball off the edge.'],
        ['mags', 'Try one on this loop. Go on, mess one up on purpose. I won’t tell.'],
      ],
      after: [['mags', "That's the spirit. Now let's see you play a proper round."]],
      tips: ['Putt, then tap Mulligan (2nd in the helper column)'],
      reward: { coins: 25, helpers: { mulligan: 1 } },
    },
    {
      id: 'muni-r1', kind: 'round', name: 'Morning Round', holes: ['sky1', 'sky2', 'sky3'],
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [['mags', 'Three holes, {name}. Par or better on each and you’ll get your stars.']],
      after: [['mags', 'Tidy. The regulars are watching you now.']],
      reward: { coins: 40 },
    },
    {
      id: 'muni-r2', kind: 'round', name: 'Afternoon Stretch', holes: ['sky4', 'sky5', 'sky6'],
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [['mags', 'Sand, a glass tube and a boost pad. The back of the Muni has some tricks.']],
      after: [['mags', 'Good. Carl’s been asking about you. He thinks you’re a fluke.']],
      reward: { coins: 50, helpers: { longSight: 1 } },
    },
    {
      id: 'muni-rival', kind: 'rival', name: 'Rival: Careful Carl', holes: ['sky1', 'sky2', 'sky3', 'sky7'],
      rival: 'carl', goal: { beat: true }, goalText: 'Beat Carl’s total over 4 holes',
      before: [
        ['carl', "So you're the new kid. I've played this course four thousand times."],
        ['carl', 'I never go for the risky shot. Never. That’s why I never lose.'],
        ['mags', 'He’s steady, but steady isn’t brave. Take the shortcut on the last hole if you dare.'],
      ],
      after: [['carl', 'Hmph. Beginner’s luck. ...Good putting, though.'], ['mags', 'Ha! I haven’t seen Carl lose since the snack hut got a roof.']],
      lose: [['carl', 'Steady wins, kid. Come back when you’ve learned patience.'], ['mags', 'Shake it off. Try again.']],
      reward: { coins: 80, helpers: { mulligan: 1, longSight: 1 }, cosmetic: 'ball:lime' },
    },
    {
      id: 'muni-open', kind: 'tournament', name: 'The Muni Open', holes: ['sky1', 'sky2', 'sky3', 'sky4', 'sky5', 'sky6'],
      field: ['carl', 'bertha', 'banks', 'lou', 'pip', 'gus', 'dot'], goal: { place: 3 }, goalText: 'Finish in the top 3 of 8',
      before: [
        ['mags', 'The Muni Open. Six holes, eight players, one silly trophy shaped like a pineapple.'],
        ['mags', 'Top three and I’ll sign you up for the Club Tour.'],
      ],
      after: [['mags', 'Look at that, {name} on the leaderboard! The pineapple suits you.']],
      lose: [['mags', 'Close, but the Open is a fickle thing. Have another go.']],
      reward: { coins: 150, helpers: { longSight: 2, mulligan: 2 } },
    },
  ],
};
