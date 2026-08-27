// The six modes as the SHELL knows them: name, one line, a feel.
//
// This is a catalogue, not a source of truth. Lane C owns js/modes/**, and the
// modes land one at a time — so anything present there wins (name, blurb), and
// anything absent shows as SOON rather than as a button that boots nothing.

export const CATALOGUE = [
  {
    id: 'flow', name: 'FLOW', tag: 'endless',
    blurb: 'Sand, and only sand. Span the board with one colour before the stack reaches the top.',
  },
  {
    id: 'tide', name: 'TIDE', tag: 'rising',
    blurb: 'The floor floods. Water carries colour, so what drowns you is also your bridge.',
  },
  {
    id: 'jelly', name: 'JELLY LAB', tag: 'soft body',
    blurb: 'Blobs that wobble, squash and refuse to settle. Pin them down and line them up.',
  },
  {
    id: 'hourglass', name: 'HOURGLASS', tag: 'gravity',
    blurb: 'Gravity turns on a timer. Everything you built falls the other way.',
  },
  {
    id: 'alchemy', name: 'ALCHEMY', tag: 'puzzles',
    blurb: 'Hand-built boards of lava, ice and oil. One solution each, and no clock.',
  },
  {
    id: 'zen', name: 'ZEN', tag: 'no fail',
    blurb: 'Nothing stacks, nothing ends. Pour sand and watch where it runs.',
  },
];

/** Merge lane C's shipped modes over the catalogue. */
export function mergeModes(shipped) {
  const by = new Map((shipped || []).map((m) => [m.id, m]));
  return CATALOGUE.map((c) => {
    const m = by.get(c.id);
    return {
      ...c,
      name: (m && m.name) || c.name,
      blurb: (m && m.blurb) || c.blurb,
      ready: !!m,
    };
  });
}
