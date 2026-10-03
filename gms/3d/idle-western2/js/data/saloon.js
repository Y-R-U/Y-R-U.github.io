// Saloon Row verbs. Ejections (W4/W6): once the Thirsty Gizzard is open, Mabel holds a drunk at the doors every gap
// (shrinking with the saloon's milestones); swipe to fling him at a target, or she throws him herself after holdSec.
// `dir` from the swipe picks the target. Auto throws land on the no-repeat landing table and pay no bonus.
export const EJECT = {
  gap: [25, 45],
  gapFloor: 0.55,
  gapPerMilestone: 0.06,
  holdSec: 2.2,
  kinds: [
    { id: 'drunk', minLv: 1, w: 6 },
    { id: 'cowboy', minLv: 1, w: 3 },
    { id: 'cardsharp', minLv: 10, w: 3 },
    { id: 'dentist', minLv: 25, w: 2 },
    { id: 'goat', minLv: 50, w: 1.5 },
    { id: 'sheriff', minLv: 50, w: 1.5 },
    { id: 'pianist', minLv: 100, w: 0.4 },
  ],
  targets: {
    trough: { dir: 'left', sec: 2, emoji: '💦', text: 'Into the trough' },
    dentist: { dir: 'right', sec: 1, emoji: '🦷', text: 'Pull & Pray ×1.5', lineMult: { lineId: 'dentist', mult: 1.5, sec: 20 } },
    jail: { dir: 'down', sec: 1, emoji: '🚓', text: 'Jail ×1.5', lineMult: { lineId: 'jail', mult: 1.5, sec: 20 } },
    pomfrey: { dir: 'up', sec: 1, emoji: '🪟', text: "Through Pomfrey's window", teeth: 1, teethChance: 0.25 },
  },
  landing: ['trough', 'haycart', 'dentist', 'jail', 'pomfrey'],
  noRepeat: 2,
};

// Fingers's piano (W11). Phrase choice is the audio layer's; state counts taps, tempo, frenzies and the rare wrong note.
export const PIANO = { frenzyTaps: 8, frenzyWindow: 6, frenzyCooldown: 120, wrongChance: 0.05, tempoWindow: 3, tempoMax: 1.6 };
