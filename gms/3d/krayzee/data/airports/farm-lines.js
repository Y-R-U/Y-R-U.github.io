// C-Tower 2: Farmer Mudge, grumpy, runs the radio between milkings. Lines for js/radio (voice 'tower_farm'), same shape as
// data/barks/script.json entries. Clips: audio/voices/tower_farm/<id>.mp3, rendered by data/barks/build_towers2.py
// (docs/VOICES.md "New towers"); edit a line here, rebuild, re-render and only that line changes.
const V = 'tower_farm';
// Mudge is slow: ~2.6 words/s, capped at 6 s (a take past this is sped up, at most 1.25x).
const secs = (t) => Math.round(Math.min(6, 0.8 + t.split(/\s+/).length / 2.6) * 10) / 10;
const T = (intent, texts, extra = {}) => texts.map((text, i) => ({ id: `${V}.${intent}${extra.tier ? '_t' + extra.tier : ''}.${i}`, voice: V, intent, text, delivery: 'grumpy West Country farmer', maxSeconds: secs(text), callsign: 'pre', ...extra }));
const L = (intent, texts) => texts.map((text, i) => ({ id: `${V}.${intent}.${i}`, voice: V, intent, text, delivery: 'grumpy West Country farmer', maxSeconds: secs(text) }));
const scold = (k, a, b, c, d) => [T(k, [a], { tier: 1 }), T(k, [b], { tier: 2 }), T(k, [c], { tier: 3 }), T(k, [d], { tier: 4 })].flat();

export const FARM_LINES = [
  ...L('welcome', ['Muckle Bottom. Shut the gate behind you.', "This is Mudge. Land on the grass, not the cows."]),
  ...T('taxi', ['along the hedge to the end of the strip. Mind the muck.', 'down the track by the hedge. Slowly. The ewes are nervous.']),
  ...T('hold_short', ['hold there, by the gatepost. Don\'t you touch my grass.', 'stop. Stop! Right there, where the cowpat is.']),
  ...T('lineup', ['on the strip and wait. Like a bus. A tractor, rather.']),
  ...T('clear_takeoff', ['off you go then. Clear the hedge, if it\'s all the same.', 'cleared away. Don\'t frighten Doreen.']),
  ...T('clear_land', ['cleared to land. Grass is short, so\'s my patience.', 'land then. Mind the molehills.']),
  ...T('go_around', ['go round! There\'s a sheep on it! Go ROUND!', 'not now! Round again, the flock\'s crossing.']),
  ...T('traffic', ['traffic over the top field. And over my washing.']),
  ...T('vacate', ['off the strip, onto the track. I\'ve a field to cut.']),
  ...T('extend', ['keep going past the copse. I\'ll tell you when.']),
  ...T('sequence_1', ['you\'re next. Don\'t make a meal of it.']),
  ...T('sequence_2', ['number two, behind that one. Like the cows do.']),
  ...T('sequence_3', ['number three. Go and look at the scenery.']),
  ...T('sequence_4', ['number four. Put the kettle on, it\'ll be a while.']),
  ...L('impeccable', ['Huh. Didn\'t even wake the dog.']),
  ...L('scandal', ['All of you. The papers are in my yard. Again.']),
  ...L('crown_change', ['New king, is it. Same muck on the boots.']),
  ...T('reply_priority', ['I know who you are. Turnips don\'t care.', 'Your Grace can wait like the rest of the herd.']),
  ...scold('scold_queue', 'there\'s a queue. Like at market.', 'that\'s twice you\'ve pushed in. I\'ve seen pigs with better manners.', 'one more time and I\'m letting the bull out.', 'RIGHT. That\'s it. The bull is OUT.'),
  ...scold('scold_takeoff', 'nobody said go. I\'d remember.', 'I said wait! The strip\'s not yours!', 'you went without asking. My mother would turn in her grave.', 'GET OFF MY LAND! ...in the air, I mean. Go on!'),
  ...scold('scold_cut', 'you cut in. Rude, that.', 'that\'s not your turn, that\'s theirs.', 'cutting up a neighbour. In Muckle Bottom. Shameful.', 'I\'m writing to the parish council. In CAPITALS.'),
  ...scold('scold_runway', 'off the strip when I say.', 'that\'s my strip you\'re sat on.', 'shift it before I hitch you to the tractor.', 'I WILL tow you. Don\'t think I won\'t.'),
  ...scold('scold_landing', 'that weren\'t a landing, that were a ploughing.', 'you\'ve gone and landed in the wrong field.', 'that\'s the barley! You\'ve landed in the barley!', 'MY BARLEY! Have you no shame?'),
  ...scold('scold_buzz', 'too low over the yard.', 'the hens\'ve stopped laying, thanks to you.', 'you\'ve blown my hat clean into the pond.', 'THE HENS! THINK OF THE HENS!'),
  ...scold('scold_near_miss', 'that was close.', 'that was close enough to shear.', 'nearly had a collision over my best pasture.', 'I\'ve gone white. Whiter than the ewes.'),
  ...scold('scold_bump', 'you\'ve bumped him. Say sorry.', 'bumping again. Like rams in spring.', 'stop butting each other!', 'RAMS! The lot of you! RAMS!'),
  ...scold('scold_nudge', 'you touched him. Keep your hands to yourself.', 'that\'s no way to say hello. Not even to a ewe.', 'nudging! Like heifers at the feed trough!', 'LOVE TAP, is it? The bull said that. Look where it got him.'),
  ...scold('scold_generic', 'not how we do it round here.', 'I\'ll be having words.', 'my nerves won\'t stand much more of this.', 'I\'m going to milk the cows. Don\'t talk to me.'),
];
