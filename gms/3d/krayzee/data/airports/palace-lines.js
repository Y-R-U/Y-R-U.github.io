// C-Tower 3: Mr Fennimore, the Royal Butler, on the gilded folly with a silver-tray radio (docs/AIRPORTS.md §1). Text
// lines for js/radio (voice 'tower_butler'); no clips yet, so the radio shows them as subtitles until a BARKS run voices them.
const V = 'tower_butler';
const D = 'impeccably deferential English butler, quiet, scolds by being ever more polite';
const T = (intent, texts, extra = {}) => texts.map((text, i) => ({ id: `${V}.${intent}${extra.tier ? '_t' + extra.tier : ''}.${i}`, voice: V, intent, text, delivery: D, maxSeconds: 5, callsign: 'pre', ...extra }));
const L = (intent, texts) => texts.map((text, i) => ({ id: `${V}.${intent}.${i}`, voice: V, intent, text, delivery: D, maxSeconds: 5 }));
const scold = (k, a, b, c, d) => [T(k, [a], { tier: 1 }), T(k, [b], { tier: 2 }), T(k, [c], { tier: 3 }), T(k, [d], { tier: 4 })].flat();

export const PALACE_LINES = [
  ...L('welcome', ['The Palace Lawn. Fennimore speaking. Do mind the croquet hoops.', 'Good afternoon. The lawn has been rolled, the tea is brewing.']),
  ...T('taxi', ['along the gravel walk to the end of the lawn, if you would be so kind.', 'the gravel walk, please. Gently. It was raked this morning.']),
  ...T('hold_short', ['might one wait by the box hedge?', 'hold there, by the topiary peacock, if you please.']),
  ...T('lineup', ['onto the lawn and wait, if it isn\'t too much trouble.']),
  ...T('clear_takeoff', ['you may depart. Kindly clear the fountain.', 'cleared to take off. The roses thank you in advance.']),
  ...T('clear_land', ['cleared to land on the lawn. Between the stripes, ideally.', 'you may alight. The hoops have been forewarned.']),
  ...T('go_around', ['might I suggest... going around? Someone is on the lawn.', 'round again, if you please. The lawn is occupied.']),
  ...T('traffic', ['a guest is circling over the rose garden.']),
  ...T('vacate', ['onto the gravel, if you would. The lawn needs its rest.']),
  ...T('extend', ['do continue past the folly. I shall call you in.']),
  ...T('sequence_1', ['you are next to be received.']),
  ...T('sequence_2', ['second to be announced, after the guest ahead.']),
  ...T('sequence_3', ['third. Perhaps admire the topiary.']),
  ...T('sequence_4', ['fourth. I shall have cucumber sandwiches sent up.']),
  ...L('impeccable', ['Not a blade disturbed. Most gratifying.']),
  ...L('scandal', ['The press are at the gates. I have locked them. The gates, not the press.']),
  ...L('crown_change', ['Long live the new... I shall fetch the other tablecloth.']),
  ...T('reply_priority', ['Of course, Your Grace. After the guest ahead, Your Grace.', 'Your Grace\'s importance has been noted. In pencil.']),
  ...scold('scold_queue', 'there is, I fear, a queue.', 'one does not push in at the Palace.', 'Her Majesty would be... disappointed.', 'I have dropped the tray. I never drop the tray.'),
  ...scold('scold_takeoff', 'I don\'t recall clearing you, Your Grace.', 'a departure without leave. How novel.', 'the croquet party saw that. All of it.', 'THE TRAY. ON THE GRAVEL. Do you see what you have done?'),
  ...scold('scold_cut', 'you appear to have cut in.', 'that was, with respect, someone else\'s turn.', 'cutting in at a garden party. Gracious.', 'I shall have to inform Housekeeping.'),
  ...scold('scold_runway', 'might you vacate the lawn?', 'the lawn, Your Grace, is not a car park.', 'the gardeners are weeping. Openly.', 'I shall summon the footmen to push you.'),
  ...scold('scold_landing', 'an... energetic arrival.', 'the hoops, Your Grace. You have collected the hoops.', 'that was the rose bed. It was the rose bed.', 'THE ROSES. The Queen\'s own roses.'),
  ...scold('scold_buzz', 'rather low over the terrace, Your Grace.', 'the tea has gone cold with fright.', 'you have blown the Duchess\'s hat into the fountain.', 'THE HAT. IN THE FOUNTAIN.'),
  ...scold('scold_near_miss', 'that was a trifle close.', 'one could have passed the sugar between you.', 'I have spilled the Darjeeling.', 'I require a sit down. Immediately.'),
  ...scold('scold_bump', 'you have bumped a guest.', 'guests are not for bumping, Your Grace.', 'this is a garden party, not a joust.', 'I shall be writing to your mother.'),
  ...scold('scold_nudge', 'a touch, Your Grace? How familiar.', 'one doesn\'t nudge. One nods.', 'nudging! On the lawn! In daylight!', 'I am resigning. Again. Effective after tea.'),
  ...scold('scold_generic', 'that is not quite how it\'s done.', 'I shall pretend I did not see that.', 'my composure is, briefly, under review.', 'I am going to stand in the shrubbery for a while.'),
];
