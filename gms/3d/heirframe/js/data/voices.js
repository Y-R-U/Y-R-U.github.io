// P6 Voice Hunts (DESIGN §11.4): five of the seven Voices fled the Helm in A6-M2 (Plenty and Order were silenced).
// After the finale one Voice at a time hides in a district as a roaming boss; each carries a unique Relic.
export const VOICES = [
  { id: 'mercy', name: 'The Voice of Mercy', epithet: 'who signed the Renewal orders', relic: 'voice_mercy', paint: { body: { color: 0xf4e3b0, metal: 1, rough: 0.22, coat: 0.6 }, trim: { color: 0xc9a24a, metal: 1, rough: 0.2 }, mech: { color: 0x2a2320, metal: 0.8, rough: 0.4 }, glow: 0xbff4ff, eye: 0xbff4ff } },
  { id: 'unity', name: 'The Voice of Unity', epithet: 'who wrote the slogan', relic: 'voice_unity', paint: { body: { color: 0xffd27a, metal: 1, rough: 0.22, coat: 0.6 }, trim: { color: 0x8c5a12, metal: 1, rough: 0.2 }, mech: { color: 0x2a2320, metal: 0.8, rough: 0.4 }, glow: 0xffe9a8, eye: 0xffe9a8 } },
  { id: 'vigil', name: 'The Voice of Vigil', epithet: 'who watched the Wards', relic: 'voice_vigil', paint: { body: { color: 0xe9eef4, metal: 1, rough: 0.22, coat: 0.6 }, trim: { color: 0x9aa7b8, metal: 1, rough: 0.2 }, mech: { color: 0x2a2320, metal: 0.8, rough: 0.4 }, glow: 0x8fd6ff, eye: 0x8fd6ff } },
  { id: 'renewal', name: 'The Voice of Renewal', epithet: 'who counted the days', relic: 'voice_renewal', paint: { body: { color: 0xd9b8ff, metal: 1, rough: 0.22, coat: 0.6 }, trim: { color: 0x7c4bb8, metal: 1, rough: 0.2 }, mech: { color: 0x2a2320, metal: 0.8, rough: 0.4 }, glow: 0xe8d0ff, eye: 0xe8d0ff } },
  { id: 'tomorrow', name: 'The Voice of Tomorrow', epithet: 'who deferred Landfall', relic: 'voice_tomorrow', paint: { body: { color: 0xb8ffd9, metal: 1, rough: 0.22, coat: 0.6 }, trim: { color: 0x2f8a5c, metal: 1, rough: 0.2 }, mech: { color: 0x2a2320, metal: 0.8, rough: 0.4 }, glow: 0xc8ffe4, eye: 0xc8ffe4 } },
];

export const VOICE_HUNT = {
  everyShifts: 7,        // a new Voice surfaces a week of play (7 shifts) after the last one was caught
  moveShifts: 7,         // an uncaught Voice changes district after this many shifts
  districts: ['aurum_plaza', 'brightline', 'terraces', 'portside', 'stacks', 'spine', 'hullside', 'landfall'],
  pay: 3,                // × an elite bounty's credits
  cycleLevel: 2,         // each full cycle of five brings them back this many levels stronger
};
