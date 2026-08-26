// Between-level story beats — hangar screen flavor text. Terse, dry, never earnest.
// Cast is small on purpose: a CO who is unimpressed by everything, a chief who narrates
// the requisitions list getting sillier, and a rival ace who should have died in Act 1
// and simply refuses to, escalating right alongside the player.

export const CAST = {
  player:  { callsign: 'Kestrel Lead' },
  co:      { name: 'Wing Commander Voss', voice: 'dry, unimpressed, technically always right' },
  chief:   { name: 'Chief Okafor', voice: 'ground crew, deadpan, keeps the receipts' },
  rival:   { name: 'The Baron', voice: 'melodramatic, alive against all odds and paperwork' },
};

// Shown once when an act's first level unlocks.
export const ACT_INTRO = {
  1: { speaker: 'co',
    text: "Command wants the front quiet by Christmas. It's currently on fire. Fix that, Lead." },
  2: { speaker: 'co',
    text: 'The Iron Duke is scrap and morale is up. Naturally, they gave us a bigger front.' },
  3: { speaker: 'chief',
    text: "Requisitions came back with a jet. A JET. Nobody will tell me which year we're fighting in any more." },
  4: { speaker: 'co',
    text: 'Sound barrier, gone. Front line, everywhere. Try to land on something that stays still.' },
  5: { speaker: 'chief',
    text: "New contractor delivered the aircraft. Didn't leave a name. Didn't leave an invoice either, which is somehow worse." },
};

// Shown once after an act's boss falls.
export const ACT_OUTRO = {
  1: { speaker: 'rival',
    text: "You have not seen the last of the Baron! (I have ejected. I am fine. Do not print that.)" },
  2: { speaker: 'co',
    text: 'Leviathan is on the seabed. The Admiralty is thrilled and slightly confused about the invoice for confetti.' },
  3: { speaker: 'chief',
    text: 'Black Sigma down. I have started a jar for every time someone says "that should not have been possible."' },
  4: { speaker: 'co',
    text: 'Behemoth grounded. Four engines, one hull, zero survivors, and yet somehow a strongly worded letter arrived.' },
  5: { speaker: 'rival',
    text: 'ORBITAL MOTHER offline. I regret nothing. I am also, once again, somehow fine. See you next war.' },
};

// One-line taunts shown as the boss level loads.
export const BOSS_TAUNT = {
  boss_ironduke:      "The Iron Duke doesn't dodge. It doesn't need to.",
  boss_leviathan:     'Leviathan carries more guns than the harbour it left from.',
  boss_blacksigma:    "Black Sigma shouldn't fly. It flies anyway, and it's angry about it.",
  boss_behemoth:      'Behemoth is four bombers stitched into one grudge.',
  boss_orbitalmother: 'ORBITAL MOTHER answers to nobody, least of all whoever built it.',
};

// Scattered milestone beats, roughly one per five levels. `after` is the level id that
// must be complete for the beat to show before the next level's hangar screen.
export const MILESTONE_BEATS = [
  { after: 'a1-04', speaker: 'chief', text: 'Requisitioned a heavier bomb. Filed it under "foundry problems."' },
  { after: 'a1-08', speaker: 'co', text: 'Radar down twice this week. They will build a third one out of spite.' },
  { after: 'a1-13', speaker: 'chief', text: 'Weather office says storms are unflyable. Weather office has met you.' },
  { after: 'a1-17', speaker: 'co', text: 'The river is close. So, apparently, is something much larger.' },
  { after: 'a2-05', speaker: 'rival', text: "The Baron sends regards, several curses, and a bill for his aircraft." },
  { after: 'a2-10', speaker: 'chief', text: "Someone signed off on a nuclear ordnance line item. I need everyone to stop asking me questions about it." },
  { after: 'a2-15', speaker: 'co', text: 'Naval command asks that you stop sinking things faster than they can rename them.' },
  { after: 'a3-03', speaker: 'chief', text: "The 'prototype jet' paperwork lists its top speed as 'yes.'" },
  { after: 'a3-08', speaker: 'co', text: 'Nobody remembers declaring war on whoever builds these interceptors. We are fighting them regardless.' },
  { after: 'a3-14', speaker: 'rival', text: 'The Baron has a new engine. The Baron would like you to know this before you find out the hard way.' },
  { after: 'a4-04', speaker: 'chief', text: 'Sonic booms are cracking windows on the base. The base has stopped complaining. It has given up.' },
  { after: 'a4-09', speaker: 'co', text: "Command asked for a status report. I told them the front line is 'everywhere, currently.'" },
  { after: 'a4-15', speaker: 'chief', text: 'The reactor targets keep glowing after they explode. I have stopped asking why.' },
  { after: 'a5-03', speaker: 'co', text: 'The enemy no longer has a flag. It has a logo. I do not know which is worse.' },
  { after: 'a5-08', speaker: 'chief', text: 'The drones do not eject pilots because there are no pilots. Somehow the Baron is still in there.' },
  { after: 'a5-14', speaker: 'co', text: 'Whatever is up there is the last one. After this, Lead, you can have a weekend.' },
];
