// Progression areas, in unlock order. The first is open from the start; each later one is bought with a permit
// (the gate card under the list). A business row's `district` must name one of these.
export const DISTRICTS = [
  { id: 'main', name: 'Main Street', emoji: '🌵', permitCost: 0, verbText: '' },
];

// Tip carriers: every gap a random owned business sends out a tippable courier (tap it within `life` s).
export const COURIER = { gap: [25, 45], life: 12, rewardSec: 6 };
