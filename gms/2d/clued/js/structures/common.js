import { makeSpec } from '../core/spec.js?v=202610050144';
import { getFormat } from '../formats/registry.js?v=202610050144';

export const roundOf = c => ({ format: c.format, packs: c.packs || 'all', count: c.count || 10, opts: c.opts || {}, difficulty: c.difficulty || 0 });
export const specFor = (structure, c, rounds = [roundOf(c)], seed) => makeSpec(structure, rounds, seed, { kids: !!c.kids });
export const fmtTitle = id => getFormat(id)?.title || id;
