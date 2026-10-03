// W18 economy hooks on the game clock. The clock itself is lane A's pure data/clock.js (simTime → phase, hour, night).
// Witching Hour is the first `witching` share of the night: in the Ghost Town season ghosts come twice as often and
// pay double ectoplasm. `night` mirrors clock.js gameClock()'s night window (cycle fractions), for p01 only.
export const DAY = {
  night: [0.17, 0.42],
  witching: 0.5,
  witchingGhostGap: 0.5,
  witchingEcto: 2,
};
