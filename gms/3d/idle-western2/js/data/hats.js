// "Big Hat Energy" (W14, proposal §1.3 rescaled to 9 businesses). Your hat tier follows OPEN businesses; Pomfrey's
// hat runs the other way down to a thimble (state.pomfrey = HATS.length − 1 − state.hat).
export const HATS = [
  { id: 'derby', name: 'Squashed Derby', owned: 0, mult: 1, scale: 0.8 },
  { id: 'bowler', name: 'Bowler', owned: 1, mult: 1.05, scale: 1 },
  { id: 'stetson', name: 'Stetson', owned: 3, mult: 1.1, scale: 1.25 },
  { id: 'ten', name: 'Ten-Gallon', owned: 5, mult: 1.16, scale: 1.6 },
  { id: 'twenty', name: 'Twenty-Gallon', owned: 6, mult: 1.22, scale: 2 },
  { id: 'fifty', name: 'Fifty-Gallon', owned: 7, mult: 1.28, scale: 2.6 },
  { id: 'seventy', name: 'Seventy-Gallon', owned: 8, mult: 1.34, scale: 3.2 },
  { id: 'hundred', name: 'Hundred-Gallon', owned: 9, mult: 1.5, scale: 4 },
];
// Indexed by Pomfrey's tier: 7 at the start of every life, 0 when you own Half the Town.
export const POMFREY_HATS = [
  { id: 'thimble', name: 'Thimble', scale: 0.2 },
  { id: 'bowler', name: 'Bowler', scale: 1 },
  { id: 'stetson', name: 'Stetson', scale: 1.3 },
  { id: 'ten', name: 'Ten-Gallon', scale: 1.7 },
  { id: 'twenty', name: 'Twenty-Gallon', scale: 2.2 },
  { id: 'fifty', name: 'Fifty-Gallon', scale: 2.9 },
  { id: 'seventy', name: 'Seventy-Gallon', scale: 3.6 },
  { id: 'twohundred', name: 'Two-Hundred-Gallon', scale: 4.6 },
];

// The 18 frontages of Main Street (W1): 9 can be yours (one per business), 7 are Pomfrey's, 2 are civic.
// Ownership metadata only; the street layout is data/plots.js (lane A).
export const FRONTAGES = [
  ...['shine', 'tubs', 'livery', 'saloon', 'dentist', 'garter', 'undertaker', 'jail', 'bank'].map((lineId) => ({ id: 'f_' + lineId, kind: 'line', lineId })),
  { id: 'p_emporium', kind: 'pomfrey', name: "Pomfrey's Emporium" },
  { id: 'p_hotel', kind: 'pomfrey', name: 'The Pomfrey Grand Hotel' },
  { id: 'p_feed', kind: 'pomfrey', name: 'Pomfrey Feed & Seed' },
  { id: 'p_gazette', kind: 'pomfrey', name: 'The Pomfrey Gazette' },
  { id: 'p_assay', kind: 'pomfrey', name: 'Pomfrey Assay Office' },
  { id: 'p_opera', kind: 'pomfrey', name: 'Pomfrey Opera House' },
  { id: 'p_hats', kind: 'pomfrey', name: 'Pomfrey & Sons, Hatters' },
  { id: 'c_church', kind: 'civic', name: 'Church' },
  { id: 'c_hall', kind: 'civic', name: 'Town Hall' },
];
