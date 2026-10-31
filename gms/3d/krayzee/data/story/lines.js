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
  // STORY3 (missions 5–10), voiced by VOICE2 2026-10-30
  { id: 'n51', voice: 'narrator', text: 'The Queen has announced a coronation. Somebody will be crowned Sovereign of the Skies, and the tea must be perfect.' },
  { id: 'n52', voice: 'narrator', text: 'The cream comes from Muckle Bottom. Through the magic clouds, in Grandfather\'s Moth.' },
  { id: 'n61', voice: 'narrator', text: 'The coronation robes weigh four hundred pounds, and need pressing by the Royal Air Force.' },
  { id: 'n62', voice: 'narrator', text: 'Only the Wardrobe can carry them. The runway at Much Snoring points one way. You prefer the other.' },
  { id: 'n71', voice: 'narrator', text: 'Lord Rupert has told Farmer Mudge that jets cannot hover. Mudge has stopped the cream.' },
  { id: 'n72', voice: 'narrator', text: 'Take the Tantrum to Muckle Bottom and land it straight down. Somewhere he will notice.' },
  { id: 'n81', voice: 'narrator', text: 'Four hundred foreign royals are waiting at Much Snoring, with luggage. Only the Jumbo will do.' },
  { id: 'n82', voice: 'narrator', text: 'Fly them home, and give the tower a proper view of the wings.' },
  { id: 'n91', voice: 'narrator', text: 'Lord Rupert is un-inviting people from the coronation. Personally. In mauve.' },
  { id: 'n92', voice: 'narrator', text: 'Re-invite them. Low over every tower in the kingdom, in one flight.' },
  { id: 'n101', voice: 'narrator', text: 'Coronation Day. By the statute of 1907, the crown goes to the winner of the Royal Bathtub Derby.' },
  { id: 'n102', voice: 'narrator', text: 'Lord Rupert has been practising in the bath since he was four. The Queen is watching.' },
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

  // ---- STORY3, text only (subtitles) until VOICE2 renders them ----
  // M5 Cream Tea at Muckle Bottom
  { id: 't_leave', voice: 'tower_trainee', callsign: 'pre', text: 'you are leaving the circuit? Nobody leaves the circuit. Is that allowed? Have a lovely time!' },
  { id: 'm_hello', voice: 'tower_farm', callsign: 'pre', text: 'Muckle Bottom. You\'re after the cream, are you. Land on the grass and wipe your wheels.' },
  { id: 'm_buzz', voice: 'tower_farm', callsign: 'pre', text: 'that was my water tank. My hat\'s in the pond. The cream\'s gone and turned to butter.' },
  { id: 'm_cream', voice: 'tower_farm', callsign: 'pre', text: 'two pots of clotted cream, on the Crown\'s account. The Crown owes me for a hat.' },
  // M6 The Royal Wardrobe
  { id: 'g_robes', voice: 'tower_m', callsign: 'pre', text: 'the Royal Wardrobe is airborne. With the robes. Please do not open the back in flight.' },
  { id: 'i_wrong', voice: 'tower_f', callsign: 'pre', text: 'Much Snoring. You are landing on runway zero-nine. Everyone else is landing on two-seven. Towards you.' },
  { id: 'i_wrong2', voice: 'tower_f', callsign: 'pre', text: 'wrong way, at seventy tonnes. It has been filed. In triplicate. With a diagram.' },
  { id: 'i_robes', voice: 'tower_f', callsign: 'pre', text: 'the robes are delivered. The pressing squadron has fainted. Standard procedure.' },
  // M7 Not Till That Jet Learns to Hover
  { id: 'm_nojets', voice: 'tower_farm', callsign: 'pre', text: 'a jet? On my grass? Not till that thing learns to hover, Your Highness.' },
  { id: 'm_hover', voice: 'tower_farm', callsign: 'pre', text: 'it\'s... stopped. In the air. Doreen, come and look at this. Bring the bucket.' },
  { id: 'm_landed', voice: 'tower_farm', callsign: 'pre', text: 'right on the turnips. Straight down, like a tractor from heaven. The cream\'s back on.' },
  { id: 'r_jets', voice: 'toff', text: 'Hover? Nonsense. Jets cannot hover. I read it in a book. Mother wrote the book.' },
  // M8 The Owls Evacuate
  { id: 'i_jumbo', voice: 'tower_f', callsign: 'pre', text: 'four hundred royal guests, cleared to depart. Eventually. Do not wait for it.' },
  { id: 't_jumbo', voice: 'tower_trainee', callsign: 'pre', text: 'that is a very big aeroplane and it is very close to my window. Is it supposed to be this close?' },
  { id: 'g_owls', voice: 'tower_m', callsign: 'pre', text: 'the owls have evacuated. All forty. In an orderly line. I am going with them.' },
  // M9 Please Do Come
  { id: 'r_uninvite', voice: 'toff', text: 'Frightfully sorry, the coronation is cancelled. Moths. Do pass it on.' },
  { id: 'm_invite', voice: 'tower_farm', callsign: 'pre', text: 'an invitation, dropped through the tank. The purple one said it was off. I\'ll bring the cream.' },
  { id: 'i_invite', voice: 'tower_f', callsign: 'pre', text: 'invitation received, at forty feet. RAF Much Snoring will attend. In uniform. Pressed.' },
  // M10 Coronation Day
  { id: 'h_derby', voice: 'duchess', text: 'Rupert, darling, do win. It is terribly common to lose at one\'s own coronation.' },
  { id: 'r_derby', voice: 'toff', text: 'Two hundred years of bath-time, darling. The crown is as good as on my head.' },
  { id: 't_derby', voice: 'tower_trainee', callsign: 'pre', text: 'two bathtubs on my runway. I have a laminated card for this. It just says "why".' },
  { id: 't_crown', voice: 'tower_trainee', text: 'And the new Sovereign of the Skies is... sorry! Sorry. I\'m allowed to say it this time!' },
  { id: 'r_crown', voice: 'toff', text: 'Mother will hear about this.' },
  { id: 'h_crown', voice: 'duchess', text: 'I heard, darling. I thought it was marvellous.' },
  { id: 'r_crownwin', voice: 'toff', text: 'And the crown goes to the bath of Pomfrey-Smythe! As was always intended.' },
];

export const STORY_AUDIO = new URL('../../audio/story/', import.meta.url).href;
