// Story mode: predefined chapters. Maps are deterministic (fixed seeds through
// the generator, or hand-authored land) so every player sees the same board.
import { disc } from './hex.js';
import { generateMap } from './mapgen.js';

export const STORY = [
  {
    id: 's1', name: 'First Steps', tutorial: true,
    sub: 'Learn the ways of empire against a timid neighbour.',
    intro: 'Every empire begins with a single banner. Raise yours, mind your coin, and show Braemar the Meek whose land this is.',
    tip: 'Follow the guide — it will walk you through your first conquest.',
    hand: () => ({
      land: disc(0, 0, 7),
      bases: [[-5, 1], [5, -1]],
    }),
    ais: [{ name: 'Braemar', personality: 'meek' }],
  },
  {
    id: 's2', name: 'The Green Shore',
    sub: 'A ragged coast, and Duskwood wants all of it.',
    intro: 'The tide carved this shore into crags and coves. Duskwood claims the far end — claim the rest first.',
    tip: 'Villages fund wars. Build two before you build soldiers.',
    gen: { style: 'jagged', size: 'small', seed: 20260709, players: 2 },
    ais: [{ name: 'Duskwood', personality: 'balanced' }],
  },
  {
    id: 's3', name: 'Twin Isles',
    sub: 'Two islands, one causeway, and Vael the Restless.',
    intro: 'Vael settles faster than rumour spreads. Hold the causeway or lose the map.',
    tip: 'A tower on a choke point pays for itself. Mortars cover three tiles.',
    gen: { style: 'islands', size: 'small', seed: 31337, players: 2 },
    ais: [{ name: 'Vael', personality: 'expansionist' }],
  },
  {
    id: 's4', name: 'The Broken Land',
    sub: 'Oldmere hoards. Ashfall burns. You are in between.',
    intro: 'Two rivals now: Oldmere counts coins behind walls while Ashfall raises armies. Strike the banker before the soldier strikes you.',
    tip: 'Arrows fire every turn for free — park enemies outside tower range.',
    gen: { style: 'jagged', size: 'medium', seed: 4242, players: 3 },
    ais: [{ name: 'Oldmere', personality: 'economist' }, { name: 'Ashfall', personality: 'warlord' }],
  },
  {
    id: 's5', name: 'Old Walls',
    sub: 'A drowned labyrinth. Corridors decide everything.',
    intro: 'The old kingdom left walls of water and stone. Stormhold turtles in the west; Wrenfell probes from the east.',
    tip: 'In tight corridors a single high-level army beats many small ones.',
    gen: { style: 'maze', size: 'medium', seed: 777003, players: 3 },
    ais: [{ name: 'Stormhold', personality: 'turtle' }, { name: 'Wrenfell', personality: 'balanced' }],
  },
  {
    id: 's6', name: 'Three Banners',
    sub: 'An open field. No excuses.',
    intro: 'Flat, rich, honest land — and three rivals who all believe it is theirs. Expansion is armour here; claim hexes and the coin follows.',
    tip: 'Upgrade your base early — every level claims more land and more income.',
    gen: { style: 'classic', size: 'medium', seed: 90125, players: 4 },
    ais: [{ name: 'Ironmoor', personality: 'balanced' }, { name: 'Vael', personality: 'expansionist' }, { name: 'Ashfall', personality: 'warlord' }],
  },
  {
    id: 's7', name: 'The Scattered Sea',
    sub: 'Islands and causeways. Whoever rules the bridges rules the sea.',
    intro: 'Empires here live and die by their crossings. Watch for the free level-1 base your empire raises when your land splits — it can save a colony.',
    tip: 'Split lands get a free level 1 base. Sometimes losing a bridge is fine.',
    gen: { style: 'islands', size: 'large', seed: 55801, players: 4 },
    ais: [{ name: 'Vael', personality: 'expansionist' }, { name: 'Oldmere', personality: 'economist' }, { name: 'Ashfall', personality: 'warlord' }],
  },
  {
    id: 's8', name: "Ashfall's Crown",
    sub: 'The finale. Four rivals, one crown.',
    intro: 'Ashfall has crowned himself and three warbands answer his horn. Raze every rival base. Take the crown.',
    tip: 'Merge armies before the final push — a level 10 host shrugs off arrows.',
    gen: { style: 'jagged', size: 'large', seed: 118999, players: 5 },
    ais: [{ name: 'Ashfall', personality: 'warlord' }, { name: 'Karst', personality: 'warlord' }, { name: 'Vael', personality: 'expansionist' }, { name: 'Stormhold', personality: 'turtle' }],
  },
];

export function storyById(id) { return STORY.find(s => s.id === id); }

// Build the {land, bases, ...} mapDef for a chapter.
export function storyMapDef(ch) {
  if (ch.hand) {
    const h = ch.hand();
    return { name: ch.name, mode: 'story', storyId: ch.id, land: h.land, bases: h.bases, treeChance: 0.13 };
  }
  const g = generateMap({ ...ch.gen, players: ch.gen.players });
  return { name: ch.name, mode: 'story', storyId: ch.id, land: g.land, bases: g.bases, treeChance: 0.13 };
}
