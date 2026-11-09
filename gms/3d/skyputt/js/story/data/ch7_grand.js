// Chapter 7 — "Grand Tour" (story7): an invitational that travels Sunken Reef → Star Station → Jungle
// Temple, one rival per stop (Pearl Marlowe, Nova Reyes, Rocco Thorn), then the Grand Tour Final.
// No new rank (Legend is the top); the chapter gives a trophy, like the World Tour.
//
// Course locks (docs/notes/story7.md): the story opens courses the way it always has, by playing their
// gate hole (ch4 plays sky9 → Hollow Woods opens, ch5 then plays Hollow Woods). Here the qualifier plays
// fest9 then sugar9 (→ Sugar Summit, then Sunken Reef open), the Reef rival match ends on reef9 (→ Star
// Station) and the Star rival match ends on star9 (→ Jungle Temple). Every hole is played only once its
// course is open (career.js courseLock keeps an event locked otherwise; story_test checks the chain).
//
// New for the story: wall-less decks and bridges (Bumper Guard lesson on Gantry Walk), a sparring ball
// to knock (Tika's lesson) and the first rival match with ball hits (`battle`): in Battle a ball knocked
// out of bounds costs its OWNER +1. If the player has chosen Classic in Settings the match is played in
// Classic and the dialogue says so (`battle.on` / `battle.off` lines, `tipsClassic`).
export default {
  id: 'grand', name: 'Grand Tour', title: 'Chapter 7 · Grand Tour', course: 'reef', theme: 'reef',
  rankOnFinish: null, trophy: 'The Grand Tour Compass',
  blurb: 'An invitation for Legends only: under the sea, into orbit, deep in the jungle.',
  intro: [
    ['sunny', 'Folks, a brand-new invitational! The Grand Tour: Sunken Reef, Star Station and the Jungle Temple.'],
    ['sunny', 'Three courses nobody has putted on in a big event before. Three local champions waiting at each one.'],
    ['mags', 'They sent you an invitation, {name}. Legends get one. I kept mine in the snack hut for forty years.'],
    ['mags', 'New courses, new tricks. I’ll be in your ear the whole way. Lemonade’s packed.'],
  ],
  outro: [
    ['sunny', 'The Grand Tour Compass goes to {name}! Reef, stars and temple: all conquered!'],
    ['rocco', 'Best ball fight I’ve had all year. Come back and knock me off the bridge again sometime.'],
    ['mags', 'Every course there is, kid. I’m running out of places to send you.'],
  ],
  tip: 'New courses: watch the flyover, then trust what you’ve learned.',
  events: [
    {
      // plays the gate holes in order: fest9 opens Sugar Summit, sugar9 opens Sunken Reef (if not open yet)
      id: 'gt-qual', kind: 'round', name: 'Invitation Qualifier', holes: ['fest9', 'sugar9'], theme: 'candy',
      goal: { starsAtLeast: 4 }, goalText: 'Earn 4 stars over 2 holes',
      before: [
        ['sunny', 'Every invitation comes with a qualifier: the Festival Isles finale, then the peak of Sugar Summit.'],
        ['mags', 'Two finishing holes. Par on both and you’re in. They open the way to the Reef, too.'],
      ],
      after: [['sunny', '{name} qualifies! Next stop: under the sea.']],
      reward: { coins: 120 },
    },
    // ---- Stop 1: Sunken Reef
    {
      id: 'gt-reef-l1', kind: 'lesson', name: 'Lesson: Ride the Current', holes: ['reef2'], theme: 'reef',
      goal: { maxStrokes: 3 }, goalText: 'Hole out in 3 strokes or fewer',
      before: [
        ['pearl', 'Pearl Marlowe. I hold my breath for four minutes, so I can wait for a putt.'],
        ['pearl', 'Riptide Run climbs a steep sandbank. Anywhere else, a soft ball drifts back to your feet.'],
        ['pearl', 'See the glowing current on the left? Roll into it and it carries you over the top. Let the sea do the work.'],
      ],
      after: [['pearl', 'You went with the current instead of fighting it. Good. Most people fight it.']],
      tips: ['Aim into the current on the left of the slope'],
      reward: { coins: 80 },
    },
    {
      id: 'gt-reef-r1', kind: 'round', name: 'Wreck Round', holes: ['reef1', 'reef3', 'reef5'], theme: 'reef',
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [
        ['sunny', 'Three holes round the old wreck. The Shipwreck Deck has no walls at all, so mind the water!'],
        ['mags', 'No walls means a ball off the edge is out of bounds: back where you were, plus one. Soft and straight.'],
      ],
      after: [['pearl', 'You kept it on the deck. Now come and play me properly.']],
      reward: { coins: 130 },
    },
    {
      // ends on reef9, the gate of Star Station
      id: 'gt-reef-rival', kind: 'rival', name: 'Rival: Pearl', holes: ['reef4', 'reef6', 'reef8', 'reef9'], theme: 'reef',
      rival: 'pearl', goal: { beat: true }, goalText: 'Beat Pearl’s total over 4 holes',
      before: [
        ['pearl', 'The Temple Tunnel, the Sunken Loop, the Switchbacks and Poseidon’s Gate. My reef, my rules.'],
        ['pearl', 'I never rush and I never splash. You will have to make birdies.'],
        ['mags', 'Careful players hate being chased. Get ahead early, {name}.'],
      ],
      after: [['pearl', 'Out-swum on my own reef. Take this Glow Ball: it shines like the deep-sea lights. Star Station’s next.']],
      lose: [['pearl', 'The reef rewards patience. Come back when you have some.'], ['mags', 'She’s steady, not unbeatable. Go again.']],
      tip: 'Pearl never rushes. Beat her and the tour flies to Star Station.',
      reward: { coins: 300, helpers: { longSight: 2, magnet: 2 }, cosmetic: 'ball:glow' },
    },
    // ---- Stop 2: Star Station
    {
      id: 'gt-star-l1', kind: 'lesson', name: 'Lesson: Rails in Orbit', holes: ['star3'], theme: 'star',
      goal: { use: 'guard', maxStrokes: 3 }, goalText: 'Use Bumper Guard, then hole out in 3 or fewer',
      grant: { guard: 2 },
      before: [
        ['nova', 'Commander Nova Reyes. I have run the numbers on every hole up here. Twice.'],
        ['nova', 'Gantry Walk is a grating over empty space. No walls. Miss the line by a hand and your ball is in orbit.'],
        ['nova', 'Bumper Guard puts rails on every open edge for one shot. Tap it in the helper column before you putt.'],
      ],
      after: [['nova', 'Rails on, ball on. Engineering beats courage. Most of the time.']],
      tips: ['Tap Bumper Guard (the shield), then putt'],
      reward: { coins: 80, helpers: { guard: 1 } },
    },
    {
      id: 'gt-star-r1', kind: 'round', name: 'Docking Round', holes: ['star1', 'star2', 'star5', 'star6'], theme: 'star',
      goal: { starsAtLeast: 8 }, goalText: 'Earn 8 stars over 4 holes',
      before: [
        ['sunny', 'Four holes on the station: the Docking Bay, the Slingshot, the Orbit Loop and the Asteroid Hop.'],
        ['mags', 'The accelerator lanes are boost pads in a space suit. Hit them dead centre and commit.'],
      ],
      after: [['nova', 'Your numbers are... better than I calculated. Recalculating.']],
      reward: { coins: 140 },
    },
    {
      // ends on star9, the gate of Jungle Temple
      id: 'gt-star-rival', kind: 'rival', name: 'Rival: Nova', holes: ['star4', 'star7', 'star8', 'star9'], theme: 'star',
      rival: 'nova', goal: { beat: true }, goalText: 'Beat Nova’s total over 4 holes',
      before: [
        ['nova', 'The Airlock, the Docking Arms, the Wormhole Shortcut and the Star Gate. I have a plan for each.'],
        ['nova', 'I will lay it short of every drop. You may take the shortcuts. Statistically, you will fall off.'],
        ['mags', 'She plays the percentages. A brave line on the Wormhole could win it, {name}. Or lose it.'],
      ],
      after: [['nova', 'An outcome outside my model. Take the Starry Night ball. The jungle ship leaves at dawn.']],
      lose: [['nova', 'As calculated.'], ['mags', 'Numbers don’t make birdies, people do. Go again.']],
      tip: 'Nova never takes a risk. Beat her and the tour heads for the jungle.',
      reward: { coins: 340, helpers: { steady: 2, guard: 2 }, cosmetic: 'ball:starry' },
    },
    // ---- Stop 3: Jungle Temple
    {
      // Tika's ball parks on the bridge (her first shot only, fixed seed: story_test checks it rests there)
      id: 'gt-jungle-l1', kind: 'lesson', name: 'Lesson: Knock-outs', holes: ['jungle2'], theme: 'jungle',
      sparring: { golfer: 'tika', seed: 12, park: 1 },
      goal: { maxStrokes: 3 }, goalText: 'Hole out in 3 strokes or fewer',
      before: [
        ['tika', 'Welcome to the temple! I’m Tika, the guide. My brother Rocco is the champion. He likes to knock balls about.'],
        ['tika', 'I’ll putt first. My ball always stops out on the Rope Bridge. Always.'],
      ],
      battle: {
        on: [
          ['mags', 'Ball hits are on: that’s Battle mode, from Settings. Balls bump each other like real ones.'],
          ['mags', 'Knock her ball off the bridge and it’s +1 to her, not you. Your ball off the edge is +1 to you, same as always.'],
          ['mags', 'Clip it on the side. Hit it dead on and you just push it along the bridge.'],
        ],
        off: [
          ['mags', 'You’ve got Ball hits set to Classic in Settings, so balls pass straight through each other.'],
          ['mags', 'In Battle mode you could knock her ball off the bridge for +1 to her. Switch to Battle in Settings and come back if you want to try.'],
        ],
      },
      after: [['tika', 'Rocco’s waiting at the top of the temple. He will try that on you, you know.']],
      afterKnock: [['tika', 'Hey! Into the gorge, +1 to me. That’s exactly what Rocco does.']],
      tips: ['Battle: knock Tika’s ball off: +1 to her'],
      tipsClassic: ['Classic: balls pass through. Soft and straight'],
      reward: { coins: 80 },
    },
    {
      id: 'gt-jungle-r1', kind: 'round', name: 'Temple Round', holes: ['jungle1', 'jungle3', 'jungle4'], theme: 'jungle',
      goal: { starsAtLeast: 6 }, goalText: 'Earn 6 stars over 3 holes',
      before: [
        ['sunny', 'The Temple Steps, the Hollow Log over the gorge and the Serpent Ring!'],
        ['mags', 'The glowing glyph lanes push like boost pads. Mud slows you right down. Read them in the flyover.'],
      ],
      after: [['tika', 'Not bad for a visitor. Rocco’s stretching. He says to bring a helmet.']],
      reward: { coins: 140 },
    },
    {
      id: 'gt-jungle-rival', kind: 'rival', name: 'Rival: Rocco', holes: ['jungle5', 'jungle6', 'jungle8', 'jungle9'], theme: 'jungle',
      rival: 'rocco', battle: {
        on: [
          ['rocco', 'Ball hits are on? Good. Battle mode. My ball goes where it likes, and sometimes that’s through yours.'],
          ['mags', 'Same rules as Tika’s lesson: knocked out of bounds is +1 to the ball’s owner. Watch for his ball on the narrow bridge on Hidden Path.'],
          ['mags', 'And keep yours off the edges while his is rolling. A resting ball can be hit.'],
        ],
        off: [
          ['rocco', 'Classic mode? Balls passing through each other? Fine. I’ll beat you the boring way.'],
          ['mags', 'You’ve got Ball hits on Classic in Settings, so no knock-outs today. Switch to Battle if you want the full ball fight.'],
        ],
      },
      goal: { beat: true }, goalText: 'Beat Rocco’s total over 4 holes',
      before: [
        ['rocco', 'Rocco Thorn. Jade Slide, Rolling Stones, the Hidden Path and Idol Court. Hardest four in the jungle.'],
        ['rocco', 'I hit it hard and I hit it straight. Usually.'],
      ],
      after: [['rocco', 'You out-bashed the basher! Take my Rainbow trail. See you in the Final.']],
      lose: [['rocco', 'BONK! Better luck next time, Legend.'], ['mags', 'He swings for everything, so he misses some. Stay patient and go again.']],
      tips: ['Battle: knock Rocco out for +1 to him'],
      tipsClassic: ['Classic: no ball hits. Beat Rocco on strokes'],
      tip: 'Rocco loves a ball fight. Beat him and the Grand Tour Final is yours to play.',
      reward: { coins: 380, helpers: { mulligan: 2, power: 2 }, cosmetic: 'trail:rainbow' },
    },
    {
      id: 'gt-final', kind: 'tournament', name: 'Grand Tour Final', holes: ['reef7', 'reef9', 'star2', 'star5', 'star8', 'jungle3', 'jungle6', 'jungle7', 'jungle9'], theme: 'jungle',
      field: ['rocco_gt', 'nova_gt', 'pro_gt', 'pearl_gt', 'ada_gt', 'prof_gt', 'kenji', 'bertha_gt', 'banks_gt', 'zoe_gt', 'marisol'],
      goal: { place: 3 }, goalText: 'Finish in the top 3 of 12',
      before: [
        ['sunny', 'The Grand Tour Final, on the temple steps! Three holes from each stop, twelve players, one compass.'],
        ['pro', 'Sterling Vance. I read about you again. I have also read about these courses. Shall we?'],
        ['mags', 'You’ve played every one of these holes on this tour, {name}. That’s your edge.'],
      ],
      after: [['sunny', '{name} on the Grand Tour podium!'], ['mags', 'Sea, space and jungle. Not bad for a Muni kid.']],
      lose: [['sunny', 'Not quite for {name} at the Final.'], ['mags', 'Nine new holes against the best. Have another go.']],
      reward: { coins: 500, helpers: { longSight: 3, ghost: 3 } },
    },
  ],
};
