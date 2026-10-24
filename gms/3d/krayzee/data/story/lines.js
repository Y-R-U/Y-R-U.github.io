// Story missions 2–4: narrator lines (mission briefings) and story radio lines in the saved Qwen voices.
// Rendered by tools/story/narrate.py into audio/story/<id>.mp3 (durations in audio/story/narration.json).
// `say` = the TTS spelling when it differs from the subtitle. Tower lines with callsign 'pre' get the player's
// spliced callsign in front ("Baron Four-Two, …"), like every other tower line.

export const BRIEF_LINES = [
  { id: 'n21', voice: 'narrator', text: 'Lord Rupert Pomfrey-Smythe cut in front of you on your first day. He has not apologised. He never will.' },
  { id: 'n22', voice: 'narrator', text: 'He is on final approach now. Return the favour.' },
  { id: 'n31', voice: 'narrator', text: 'The Bishop is waiting for his blessing flypast. There is a queue for the runway, and nobody has filled up your tank.' },
  { id: 'n32', voice: 'narrator', text: 'Commoners queue. You have a button.' },
  { id: 'n41', voice: 'narrator', text: 'Lord Rupert has bought a biplane. It is mauve. He has challenged you to a race: the church, the castle, and home.' },
  { id: 'n42', voice: 'narrator', text: 'He has already started.' },
];

export const RADIO_LINES = [
  { id: 'g_cut', voice: 'tower_m', callsign: 'pre', text: 'that was a cut-in. On my final. It has been noted. In ink.' },
  { id: 'g_land', voice: 'tower_m', callsign: 'pre', text: 'you are number one. Apparently. Cleared to land, I suppose.' },
  { id: 'r_cut', voice: 'toff', text: 'I say! That was my approach, you jumped-up little baronet!' },
  { id: 'i_jump', voice: 'tower_f', callsign: 'pre', text: 'you were number five for departure. You are now, it seems, airborne.' },
  { id: 'i_fuel', voice: 'tower_f', callsign: 'pre', text: 'refuelled, on the Crown\'s account. The Crown has been informed.' },
  { id: 'i_bowser', voice: 'tower_f', callsign: 'pre', text: 'a fuel bowser is being driven up the runway after you. Please do not ask how.' },
  { id: 't_race', voice: 'tower_trainee', callsign: 'pre', text: 'um, there are two of you on the runway. Is this a race? Are we allowed races?' },
  { id: 't_win', voice: 'tower_trainee', text: 'And the winner is... sorry. Sorry! I\'m not supposed to say that on frequency.' },
  { id: 'r_race', voice: 'toff', text: 'Do keep up, new money. The church, the castle, and home!' },
  { id: 'r_lose', voice: 'toff', text: 'Mother will hear about this. Mother hears about everything.' },
  { id: 'r_win', voice: 'toff', text: 'Ha! Two hundred years of breeding, darling. Better luck next season.' },
];

export const STORY_AUDIO = new URL('../../audio/story/', import.meta.url).href;
