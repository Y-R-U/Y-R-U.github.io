// C-Tower 4: RAF Much Snoring. Squadron Leader Imogen Frost on a military frequency: tower_f's own cloned voice, its own
// script (voice key 'tower_raf' so these lines never mix into C-Tower 1's tower_f). Same shape as data/barks/script.json.
// Clips: audio/voices/tower_raf/<id>.mp3 via data/barks/build_towers2.py; the callsign/runway splices are tower_f's.
const V = 'tower_raf';
const DELIVERY = 'icy precise female RAF controller, clipped military phraseology';
const secs = (t) => Math.round(Math.min(5.5, 0.6 + t.split(/\s+/).length / 2.9) * 10) / 10;
const mk = (intent, texts, extra = {}) => texts.map((text, i) => ({ id: `${V}.${intent}${extra.tier ? '_t' + extra.tier : ''}.${i}`, voice: V, intent, text, delivery: DELIVERY, maxSeconds: secs(extra.say?.[i] || text), ...extra, say: extra.say?.[i] }))
  .map((e) => { if (!e.say) delete e.say; else e.subtitle = e.text; return e; });
const T = (intent, texts, extra = {}) => mk(intent, texts, { callsign: 'pre', ...extra });
const L = (intent, texts, extra = {}) => mk(intent, texts, extra);
const scold = (k, a, b, c, d) => [T(k, [a], { tier: 1 }), T(k, [b], { tier: 2 }), mk(k, [c], { tier: 3 }), mk(k, [d], { tier: 4 })].flat();

export const AIRBASE_LINES = [
  ...L('welcome', ['C-Tower 4, Much Snoring. Military aerodrome. Civilian manners will not be tolerated.', 'C-Tower 4. Much Snoring is open. Behave as if the Air Marshal were watching.'],
    { say: ['See Tower Four, Much Snoring. Military aerodrome. Civilian manners will not be tolerated.', 'See Tower Four. Much Snoring is open. Behave as if the Air Marshal were watching.'] }),
  ...T('taxi', ['taxi Alpha One via Alpha. Stay on the yellow line.', 'taxi via Alpha. The grass is Crown property.']),
  ...T('hold_short', ['hold short. Heavy traffic on final.', 'hold short. That is an order.']),
  ...T('lineup', ['line up and wait. Smartly.', 'line up and wait. Eyes front.']),
  ...T('clear_takeoff', ['cleared for takeoff,', 'surface wind westerly, cleared for takeoff,'], { rwy: 'post' }),
  ...T('clear_land', ['cleared to land,', 'wind westerly, nine knots, cleared to land,'], { rwy: 'post' }),
  ...T('go_around', ['go around. Execute. Now.', 'go around, climb runway heading. Questions afterwards.']),
  ...T('traffic', ['traffic, heavy, two miles, closing. Act on it.', 'traffic, a Hercules, on your left. It will not move for you.']),
  ...T('vacate', ['vacate at the next stub. Taxi to dispersal.', 'vacate promptly. This runway has work to do.']),
  ...T('extend', ['extend downwind. Consider it a sortie.', 'extend downwind. I will call your base.']),
  ...T('sequence_1', ["number one. Don't squander it."]),
  ...T('sequence_2', ['number two, behind the heavy. Mind the wake.']),
  ...T('sequence_3', ['number three. Hold your formation.']),
  ...T('sequence_4', ['number four. The Jumbo has seniority.']),
  ...T('impeccable', ['textbook. I shall mention it in dispatches.', 'acceptable. The Station Commander may even nod.']),
  ...T('scandal', ['taxi to the hangar. The Ministry would like a word.']),
  ...L('crown_change', ['All stations. New Commander-in-Chief. Standing orders remain.']),
  ...T('reply_priority', ['rank is noted. You are still number three.', 'I have saluted better than you. Hold.']),
  ...scold('scold_queue', 'you are not first. Hold position.', 'there is an order of battle. You are not at the front of it.', 'Queue-jumping on a military station. Bold.', 'HOLD! ...Position. Thank you.'),
  ...scold('scold_takeoff', 'you are not cleared. Stop immediately.', 'unauthorised departure. Logged, timed and filed.', 'Nobody scrambled you. Nobody.', 'I am filing this in TRIPLICATE!'),
  ...scold('scold_cut', 'you have cut in. Extend downwind.', 'that slot belonged to a Hercules. Extend.', 'Cutting up a heavy. How very brave.', 'To the back. The very BACK.'),
  ...scold('scold_runway', 'runway occupied. Vacate immediately.', 'you are on an active runway. Unwise.', 'Off. My. Runway. That is not a request.', 'GET OFF IT! ...Much Snoring, out.'),
  ...scold('scold_landing', 'that was not the runway. Note the large concrete strip.', 'you have landed on the parade ground.', 'Three kilometres of runway and you missed it.', 'It is THREE KILOMETRES long! You MISSED it!'),
  ...scold('scold_buzz', 'too low over the tower. Climb now.', 'my tea has ripples in it. Climb.', 'This is not an air show. Not yet.', 'I CAN READ YOUR WRISTWATCH! Climb!'),
  ...scold('scold_near_miss', 'traffic alert. Turn away now.', 'separation is not optional on this station.', 'Close enough to borrow their sugar.', 'I am counting to ten. One. Two. THREE.'),
  ...scold('scold_bump', 'contact noted. Report damage.', 'you have bounced off another aircraft. On my station.', 'This is an airfield, not a rugby scrum.', 'Stop BOUNCING! That is an ORDER!'),
  ...scold('scold_nudge', 'contact noted. Keep your wingtips to yourself.', 'you touched another aircraft. Deliberately. I saw.', 'A love tap. On an RAF station. Remarkable.', 'HANDS OFF the other aircraft! ...Thank you.'),
  ...scold('scold_generic', 'comply with instructions.', 'I shall repeat that. Slowly.', 'I am smiling. It is not a nice smile.', "Court martial. I'm finding out if I can."),
  // runway tails for rwy:'post' (subtitle text); the clips are tower_f's, copied by build_towers2.py
  ...['09', '27'].map((r) => ({ id: `${V}.rwy_${r}`, voice: V, intent: 'splice_rwy', text: r === '09' ? 'runway zero niner.' : 'runway two seven.', delivery: 'ATC cadence, sentence-final fall', maxSeconds: 1.6 })),
];
