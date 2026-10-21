// Voice-agnostic stand-in lines (voice '*'), intents per docs/DESIGN.md §5. Used only where script.json has no entry.
const L = (intent, texts, extra = {}) => texts.map((text, i) => ({ id: `fb_${intent}${extra.tier ? '_t' + extra.tier : ''}_${i}`, voice: '*', intent, text, delivery: '', maxSeconds: 4, ...extra }));
const T = (intent, texts, extra) => L(intent, texts, { callsign: 'pre', ...extra });

export const FALLBACK_LINES = [
  // tower routine
  ...T('taxi', ['taxi to holding point, runway {runway}. Slowly. Like a normal person.']),
  ...T('hold_short', ['hold short runway {runway}. Hold. Short. Both words matter.', 'hold position. I am begging you.']),
  ...T('lineup', ['line up and wait, runway {runway}. Mostly the waiting part.']),
  ...T('clear_takeoff', ['runway {runway}, cleared for take-off. Do try to stay on it.', 'cleared for take-off. Mind the cows.']),
  ...T('clear_land', ['cleared to land runway {runway}. Wheels down this time, if you please.', 'number one, cleared to land.']),
  ...T('go_around', ['go around! Go around! Somebody is already on it!', 'abort, climb, and try again with dignity.']),
  ...T('traffic', ['traffic, two o’clock, close. Far too close.']),
  ...T('vacate', ['vacate the runway at the next turn. Any turn. Please.']),
  ...T('welcome', ['welcome to Krayzee. Do behave.']),
  ...T('impeccable', ['that was... a perfectly normal landing. I am suspicious.']),
  ...L('crown_change', ['All stations, we have a new monarch. Heaven help us.']),
  ...L('scandal', ['All stations. The newspapers are here. Everybody act natural.']),
  // tower scolds by tier
  ...['scold_queue', 'scold_takeoff', 'scold_cut', 'scold_runway', 'scold_landing', 'scold_buzz', 'scold_near_miss', 'scold_bump', 'scold_generic'].flatMap((s) => [
    ...T(s, ['that was not in accordance with my instructions.', 'noted. In ink.'], { tier: 1 }),
    ...T(s, ['for the SECOND time, that is not permitted.', 'I am writing your name in the big book.'], { tier: 2 }),
    ...T(s, ['why. Why are you LIKE this? I need my tea.', 'my therapist warned me about you.'], { tier: 3 }),
    ...T(s, ['STOP IT! Stop it! ...Sorry. Sorry. Please stop it.', 'I have a DEGREE in this!'], { tier: 4 }),
  ]),
  ...T('reply_priority', ['I know exactly who you are. That is the problem.', 'yes, Your Grace. And I am the tower. Hold.']),
  // pilot barks (never say names; subtitles show the target)
  ...L('greeting', ['Tower, good morning! Your favourite royal is on frequency.', 'Hello Tower, do try to keep up today.']),
  ...L('req_takeoff', ['Tower, ready for take-off. Chop chop.', 'Tower, at the hold. Let me go.']),
  ...L('req_land', ['Tower, inbound to land. Clear the way.', 'Tower, coming in. Do keep up.']),
  ...L('takeoff', ['Tally-ho!', 'Up, up and away, peasants!']),
  ...L('cut_in', ['After me, old bean. Always after me.', 'Was that your slot? Not any more!']),
  ...L('queue_jump', ['Queues are for commoners!', 'Excuse me, royalty coming through.']),
  ...L('apology', ['Terribly sorry. Not really.', 'Oops. My hand slipped. Onto the throttle.']),
  ...L('insult', ['You fly like a shopping trolley.', 'Nice plane. Is it a kit?', 'Move, you magnificent turnip!']),
  ...L('retort', ['Says the one with the wonky wings.', 'Fly better then, darling.', 'Cry me a runway.']),
  ...L('complain', ['Tower! Are you going to let them get away with that?', 'Tower, I wish to make a complaint!']),
  ...L('priority', ['Do you know who I am?', 'I outrank your runway, Tower.']),
  ...L('near_miss', ['Whoa! Watch it!', 'That was close enough to swap paint!']),
  ...L('landing_brag', ['Did everyone see that? Magnificent.', 'Smoothest touchdown in the kingdom.']),
  ...L('go_around', ['Going round. Again. Thanks ever so.', 'Round we go, I suppose.']),
  ...L('bump', ['Boing! Not a scratch!', 'Wheee! ImpossiRubber, darling!']),
];
