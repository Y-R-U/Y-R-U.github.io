// LASTWALL — narrative: intro slides + WARDEN transmissions per level.
// Beats show at level start (grace period, non-blocking typewriter).
// Phase 5 fills 11–100; the voice: WARDEN = dry, tired gate AI. SEVEN never speaks.

export const INTRO = [
  { from: 'ARCHIVE', text: 'The Halcyon Strain took the cities in nine days. It did not kill. It rewrote. The screaming below the wall has not stopped in three years.' },
  { from: 'ARCHIVE', text: 'The Longwall was built to keep an old empire out. Now it is the last road above the flood — one hundred sections, gate to gate, to the far bastion at Meridian.' },
  { from: 'WARDEN', text: 'Courier Seven. Your blood holds the seed of the cure. Meridian can grow it — if you arrive. Gate Zero opens in three. Two. Run.' },
];

export const BEATS = {
  1:  { from: 'WARDEN', text: 'Move north. Keep off the parapet edges — the fall is long and the ground is hungry.' },
  2:  { from: 'WARDEN', text: 'The infected climb. I do not know how. Sensors on the outer face are… loud.' },
  3:  { from: 'WARDEN', text: 'You will find caches on the branch spans. The old garrisons left in a hurry. Take everything.' },
  4:  { from: 'WARDEN', text: 'A crack ahead reads unstable. If you cross it, the span will not hold behind you. Choose your road with care.' },
  5:  { from: 'WARDEN', text: 'Your vitals adapt. The serum in your blood learns faster than I can log it. Choose what it becomes.' },
  6:  { from: 'LOG',    text: 'Found: a garrison log. "Day 40. We stopped counting the swarm. We count the merlons now. Fifty-two between towers. Fifty-two."' },
  7:  { from: 'WARDEN', text: 'The big ones — the garrison called them brutes. Do not let them hold you. They throw couriers like sandbags.' },
  8:  { from: 'LOG',    text: 'Found: a child\'s drawing. A wall. Stick figures on top, holding hands. All of them smiling. You pocket it.' },
  9:  { from: 'WARDEN', text: 'Gate Ten is sealed by an old quarantine order. Its guardian broke my leash years ago. I am sorry for what it has become.' },
  10: { from: 'WARDEN', text: 'GUARDIAN AHEAD. Kill it and Gate Ten opens — and stays open. I will remember your progress, Courier. Every ten gates, forever.' },
};

export const FINALE = { from: 'WARDEN', text: 'Meridian is lit. They are waiting. Run, Seven — the whole species is holding the door.' };
