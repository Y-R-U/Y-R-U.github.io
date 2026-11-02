// Chapter 4 — "National Tour": the Nationals at Spooky Hollow (spooky theme). Rival: Big Bertha.
export default {
  id: 'national', name: 'National Tour', title: 'Chapter 4 · National Tour', course: 'sky', theme: 'spooky',
  rankOnFinish: 'Pro', trophy: 'The Hollow Lantern',
  blurb: 'The Nationals play at Spooky Hollow. Lanterns, fog, and the longest hitter alive.',
  intro: [
    ['sunny', 'Welcome to the National Tour, live from Spooky Hollow! Mind the fog, folks.'],
    ['bertha', "So you're the one beating everybody. Bertha Okafor. I don't lay up. I don't bank. I go THROUGH."],
    ['mags', 'Bertha holds the record for aces and for balls lost to the void. Both in the same round, once.'],
  ],
  outro: [
    ['bertha', 'National champion! You hit it like a feather and it still went in. Unbelievable.'],
    ['mags', "Pro, {name}. A real pro. The World Tour wants you. So does the world number one, apparently."],
  ],
  tip: 'Power is a tool, not a plan. Take the big carry only when the landing is wide.',
  events: [
    {
      id: 'nat-l1', kind: 'lesson', name: 'Lesson: Power Tee', holes: ['sky14'],
      goal: { use: 'power', maxStrokes: 4 }, goalText: 'Use a Power Tee, then hole out in 4 or fewer',
      grant: { power: 2 },
      before: [
        ['bertha', 'Island Hop! Two jumps. Most people bounce off the edge. I clear the whole thing.'],
        ['mags', 'Power Tee lets you hit a little harder than your arms allow, for one shot. Long carries love it.'],
      ],
      after: [['bertha', 'Ha! You flew! Welcome to the fun side.']],
      tips: ['Arm Power Tee for the long jumps'],
      reward: { coins: 50, helpers: { power: 1 } },
    },
    {
      id: 'nat-l2', kind: 'lesson', name: 'Lesson: Bumper Guard', holes: ['sky7'],
      goal: { use: 'guard', maxStrokes: 4 }, goalText: 'Use a Bumper Guard, then hole out in 4 or fewer',
      grant: { guard: 2 },
      before: [
        ['mags', "The Shortcut. That plank's got no walls. Unless you bring your own."],
        ['mags', 'Bumper Guard puts rails on every open edge for one shot. Take the plank. Nobody will know.'],
      ],
      after: [['mags', 'See? Brave is easy when you have rails. Use them when it counts.']],
      tips: ['Arm Bumper Guard, then take the plank'],
      reward: { coins: 50, helpers: { guard: 1 } },
    },
    {
      id: 'nat-r1', kind: 'round', name: 'Lantern Round', holes: ['sky3', 'sky6', 'sky9'],
      goal: { starsAtLeast: 7 }, goalText: 'Earn 7 stars over 3 holes',
      before: [['sunny', 'A night round under the lanterns! Loops and leaps. Seven stars needed, so one birdie at least.']],
      after: [['sunny', 'What a round from {name}!']],
      reward: { coins: 70 },
    },
    {
      id: 'nat-r2', kind: 'round', name: 'Tour Card Round', holes: ['sky16', 'sky17', 'sky18'],
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [['mags', 'Earn your tour card. Pinball, Twin Mills and the Crown. Par on all three.']],
      after: [['bertha', 'Tour card! Now you have to play me. Bring snacks, it gets loud.']],
      reward: { coins: 80, helpers: { power: 1, guard: 1 } },
    },
    {
      id: 'nat-rival', kind: 'rival', name: 'Rival: Big Bertha', holes: ['sky6', 'sky13', 'sky14', 'sky17'],
      rival: 'bertha_nat', goal: { beat: true }, goalText: 'Beat Bertha’s total over 4 holes',
      before: [
        ['bertha', 'Boost pads, a fork, jumps and the Twin Mills. I go through windmills, not round them.'],
        ['mags', "She'll ace one and lose one to the void. Keep it on the island and let her gamble."],
      ],
      after: [['bertha', "Beaten by a feather! Here, take my ember trail. You'll need something flashy now you're famous."], ['mags', 'The World Tour is open, {name}. The big time.']],
      lose: [['bertha', 'BOOM. That one went in. Again!'], ['mags', 'She had a hot day. Hot days end.']],
      reward: { coins: 200, helpers: { power: 2, guard: 2, ghost: 1 }, cosmetic: 'trail:ember' },
    },
    {
      id: 'nat-champ', kind: 'tournament', name: 'National Championship', holes: ['sky1', 'sky2', 'sky3', 'sky4', 'sky5', 'sky6', 'sky7', 'sky8', 'sky9'],
      field: ['bertha_nat', 'banks_nat', 'vera', 'otis', 'yuki', 'wren', 'dex', 'june', 'basil'], goal: { place: 3 }, goalText: 'Finish in the top 3 of 10',
      before: [
        ['sunny', 'The National Championship! The full front nine in the Hollow, and the best ten players in the land.'],
        ['mags', 'You know these holes better than anyone here. You learned on them.'],
      ],
      after: [['sunny', 'From the Muni to the national podium: {name}!'], ['mags', 'I may have cried. Into the lemonade. Don’t tell anyone.']],
      lose: [['sunny', 'So close for {name} in the Hollow.'], ['mags', 'The fog gets everyone once. Go again.']],
      reward: { coins: 320, helpers: { longSight: 2, mulligan: 2, power: 1, guard: 1 } },
    },
  ],
};
