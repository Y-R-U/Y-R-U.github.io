// STORY: one story a calendar month, six chapters, each a winding track of circles. Event
// points walk you along it (a point is a circle: win 3, close loss 2, loss 1); reaching a
// chapter's last circle opens its picture and its page of story. Three stories take turns by
// month. The text is not a secret — only the art is drawn in code (storyart.js).

export const STORIES = [
  {
    id: 'bandana', title: 'THE STOLEN BANDANA',
    chapters: [
      { title: 'A Missing Knot', circles: 13,
        text: "The night before the Grand Doodle Tournament, the Ink Master's black bandana vanished from its peg. Only a trail of pencil shavings led out of the dojo door. The Ink Master looked straight at you and said, \"White belts notice things. Go and notice.\"" },
      { title: 'The Shavings Trail', circles: 14,
        text: 'The shavings led into the Scrap Yard, where Smudge swore he had seen nothing — while standing on a very suspicious pile of shavings. One friendly sparring match later, he remembered quite a lot. "A tall shape," he said. "Went up the margin. Hummed badly."' },
      { title: 'Up the Red Margin', circles: 14,
        text: 'The red margin is the tallest cliff on the page, and climbing it breaks at least three dojo rules. You climbed it anyway, with a borrowed shoelace for a rope. At the top somebody had written NOT HERE in tiny letters, which is exactly what somebody who was here would write.' },
      { title: 'The Eraser Guards', circles: 15,
        text: 'Two Eraser Guards blocked the way to the Top Corner. They rubbed out your footprints, your shadow and very nearly your left ear. But erasers are slow to turn around, and a good flip kick is very, very fast.' },
      { title: 'The Top Corner', circles: 15,
        text: 'In the Top Corner sat an enormous paper crane on a nest of string, ribbons and one black bandana. The crane hissed. You bowed. It is very hard to fight something that is basically a folded napkin with opinions.' },
      { title: 'The Grand Doodle Tournament', circles: 16,
        text: 'You swapped the crane a shiny ribbon for the bandana, and everyone agreed it was a fair trade, especially the crane. You sprinted back just as the tournament bell rang. The Ink Master tied the bandana on, nodded once and said, "You noticed." Then you won your first round, which everybody noticed too.' },
    ],
  },
  {
    id: 'spill', title: 'THE GREAT SPILL',
    chapters: [
      { title: 'Rain on the Desk', circles: 12,
        text: 'It started with a wobble. High above the page a giant coffee mug leaned, leaned a bit more, and then poured a brown flood across the Scrap Yard. Everyone ran. You ran too, but in the useful direction.' },
      { title: 'The Paper Boat', circles: 13,
        text: 'Grandmaster Nib remembered an old dojo trick: fold the homework. Together you folded a boat big enough for twelve students, two pencils and one very nervous snail.' },
      { title: 'Whirlpool Row', circles: 14,
        text: 'The flood spun into a whirlpool round the pencil sharpener. You paddled with a ruler, the snail steered, and twelve students screamed in perfect harmony. Somehow, it worked.' },
      { title: 'The Biro Bridge', circles: 14,
        text: 'At Biro Heights a bridge drawn in blue pen still stood above the coffee. One by one you carried the little doodles across. Nobody looked down except the snail, who looked everywhere.' },
      { title: 'Sugar Cube Mountain', circles: 15,
        text: 'The last dry place on the whole page was a mountain of sugar cubes. It was sticky, it was crunchy and it was slowly dissolving. You organised a sugar-cube relay, which is now an official dojo sport.' },
      { title: 'The Blotter', circles: 16,
        text: 'Then you spotted it: a giant sheet of blotting paper at the edge of the desk. With a running jump and the best flying kick of your life, you knocked it flat onto the flood. The page drank every drop, the sun came out, and the snail got a medal.' },
    ],
  },
  {
    id: 'dragon', title: 'THE DRAWING DRAGON',
    chapters: [
      { title: 'Doodle in the Margin', circles: 12,
        text: 'During a very boring lesson, somebody drew a dragon in the margin. Then the dragon sneezed, and a spark scorched the corner of the page. Then it winked at you. Lessons were never boring again.' },
      { title: 'The Hungry Doodle', circles: 13,
        text: 'The dragon was hungry, and it ate the only food it could find: crayons. With every crayon it grew bigger and brighter, and the art cupboard emptied like a bowl of crisps at a party.' },
      { title: 'Smoke over the Dojo', circles: 14,
        text: 'By morning the dragon was the size of the dojo and was sitting on its roof, blowing smoke rings. The Ink Master stood below with a bucket of water and his most serious face. "Do NOT," he said, "let it near the homework."' },
      { title: 'Training a Dragon', circles: 15,
        text: 'Fighting a dragon seemed rude, so you taught it a kata instead. It learned the bow quickly, the punch slowly and the jump far too well. The ceiling still has a dragon-shaped dent.' },
      { title: 'The Eraser Storm', circles: 15,
        text: 'Then the Eraser Storm came, rubbing out everything in its path. The dragon spread its wings over the whole class and took every scrub on its own scales. It came out a little paler and a lot braver.' },
      { title: 'The Dragon Belt', circles: 16,
        text: 'The dojo held a ceremony. The Ink Master tied a bandana round the dragon\'s neck — it took four bandanas knotted together — and named it guardian of the dojo. You got to ride it home. Your family had questions.' },
    ],
  },
];

export const STORY_INK = 500;

/** Which story a month tells: they take turns, by calendar month. `key` is 'YYYY-MM'. */
export function storyIndex(key) {
  const [y, m] = String(key).split('-').map(Number);
  return (((y * 12 + (m - 1)) % STORIES.length) + STORIES.length) % STORIES.length;
}
export const storyOf = (key) => STORIES[storyIndex(key)];
export const totalCircles = (story) => story.chapters.reduce((s, c) => s + c.circles, 0);

/**
 * Where `points` puts you: the chapter you are walking (or 6 = finished), the circle reached in
 * it, and how many chapters are open. Overflow past a chapter's end walks into the next one.
 */
export function progress(story, points) {
  let left = Math.max(0, points | 0), ch = 0;
  while (ch < story.chapters.length && left >= story.chapters[ch].circles) { left -= story.chapters[ch].circles; ch++; }
  const done = ch >= story.chapters.length;
  return { chapter: ch, circle: done ? 0 : left, opened: ch, done, walked: Math.min(points | 0, totalCircles(story)) };
}

/** Finishing the story pays once: ink, and the last chapter's picture as a backdrop prize. */
export function rewardsOwed(story, points, claimed = []) {
  if (!progress(story, points).done) return [];
  return [{ id: 'end', kind: 'ink', amount: STORY_INK }, { id: 'endbg', kind: 'arenaBackground' }].filter((r) => !claimed.includes(r.id));
}
