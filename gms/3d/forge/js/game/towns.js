// The three towns as the UI names them, and the faction-select slate's state table.
// Pure. STORY.md §11 owns the table; §9.2 owns the marks.

export const TOWNS = [
  { id: 'light', name: 'Whitewall', mark: '( )', ground: 'pale limestone' },
  { id: 'neutral', name: 'Longacre', mark: '[ ]', ground: 'thatch' },
  { id: 'dark', name: 'Blackstone', mark: '/\\', ground: 'slate' },
];

export const townOf = id => TOWNS.find(t => t.id === id) || TOWNS[0];
export const markOf = id => townOf(id).mark;
export const nameOf = id => townOf(id).name;

export const NOT_YET = 'Longacre has nothing to teach you yet.';

// STORY §11's table. Every panel answers a tap; only `playable` ones start a campaign, and
// Longacre is never disabled — the dismissal is the foreshadowing.
export function slate(doc) {
  const done = doc?.campaign?.done || [];
  const has = f => done.includes(f);
  const trilogy = has('light') && has('dark') && has('neutral');
  return [
    {
      ...townOf('light'),
      state: 'lit',
      playable: true,
      line: has('light') ? 'Where you started.' : 'Start here. Everyone does.',
      reply: null,
    },
    {
      ...townOf('neutral'),
      state: has('dark') ? 'lit' : 'dim',
      playable: has('light') && has('dark'),
      line: has('dark') ? 'Nothing to teach you. Come in anyway.' : '',
      reply: has('dark') ? null : NOT_YET,
    },
    {
      ...townOf('dark'),
      state: has('light') ? 'lit' : 'shadow',
      playable: has('light'),
      line: has('light') ? 'Now stand where you were standing at the end.' : 'Finish Whitewall.',
      reply: has('light') ? null : 'Finish Whitewall first.',
    },
  ].map(p => ({ ...p, trilogy }));
}

export const started = doc => !!doc && (doc.played > 0 || Object.keys(doc.quests || {}).length > 0);
