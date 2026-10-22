// Synthetic airports that falsify layout assumptions (docs/AIRPORTS.md §3.3): C-Tower 1 rotated 37° (runways 13/31 and
// 08/26, taxiway K, stands G1–G8), and the same mirrored east-west first (31/13, 36/18). Not for players.
import royal from './royal.js';
import { transformAirport } from './transform.js';

const rename = { A: 'K', A1: 'K1', A2: 'K2', A3: 'K3', A4: 'K4', ...Object.fromEntries(royal.stands.map((s, i) => [s.id, `G${i + 1}`])) };
export const royal_rot37 = transformAirport(royal, { id: 'royal_rot37', name: 'Royal (rotated 37°)', rotate: 37, rename });
export const royal_rot37m = transformAirport(royal, { id: 'royal_rot37m', name: 'Royal (mirrored, rotated 37°)', rotate: 37, mirror: true, rename });
// Control: the identity transform. Its runs are C-Tower 1's own behaviour on the same scenario list.
export const royal_rot0 = transformAirport(royal, { id: 'royal_rot0', name: 'Royal (identity)' });
export const TEST_AIRPORTS = { royal_rot37, royal_rot37m, royal_rot0 };
