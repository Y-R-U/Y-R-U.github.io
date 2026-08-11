// Every line anyone says to you, and every line you say back.
//
// A table is an ordered variant list. The first variant whose `when` matches the player's profile
// wins, so tables are authored most-specific-first and the last entry has no `when` at all — that
// bare fallback is what stops the lists having to cover every combination.
//
// `when` keys: trait · noTrait · personality · gender · origin · said · notSaid. All keys in one
// `when` must hold. `said` matches a flag set by the previous beat, which is how a reply can know
// it was just called something.
//
// `{term}` is a term of address resolved from the speaker's register and the player's gender.
// `{lastTerm}` is the word the NPC actually used, so a comeback can quote it back.

export const registers = Object.freeze({
  plain: Object.freeze({ m: 'you', f: 'you', x: 'you', genderedFor: Object.freeze([]) }),
  rough: Object.freeze({ m: 'mate', f: 'love', x: 'friend', genderedFor: Object.freeze(['m', 'f']) }),
  // A formal register has no word for someone who declined to say, and defaults badly on purpose.
  formal: Object.freeze({ m: 'sir', f: 'ma’am', x: 'sir', genderedFor: Object.freeze(['m', 'f', 'x']) }),
  spacer: Object.freeze({ m: 'skip', f: 'skip', x: 'skip', genderedFor: Object.freeze([]) }),
});

// `face` names a portrait in assets/faces. Whoever is on the yard desk this run is drawn from
// `brokers` off the run seed — they all work the same board and read the same lines.
export const npcs = Object.freeze({
  brann: Object.freeze({
    id: 'brann', name: 'Brann Otey', role: 'Yard broker, Ledger', register: 'rough', face: 'brann',
    blurb: 'Sells hulls. Has never once described one as slow.',
  }),
  veya: Object.freeze({
    id: 'veya', name: 'Veya Kald', role: 'Yard broker, Ledger', register: 'rough', face: 'veya',
    blurb: 'Came up on the gantries. Knows exactly what she is selling you.',
  }),
  tolm: Object.freeze({
    id: 'tolm', name: 'Tolm Ashe', role: 'Yard broker, Ledger', register: 'rough', face: 'tolm',
    blurb: 'Talks about every hull as though he owned it personally.',
  }),
  hask: Object.freeze({
    id: 'hask', name: 'Ravi Hask', role: 'Yard broker, Ledger', register: 'spacer', face: 'hask',
    blurb: 'Forty years on this deck. Has sold the same Kite four times.',
  }),
  vosk: Object.freeze({
    id: 'vosk', name: 'Ilo Vosk', role: 'Private lender', register: 'rough', face: 'vosk',
    blurb: 'Lends fast, collects faster. Asks about your family and means it as a threat.',
  }),
  reach_mutual: Object.freeze({
    id: 'reach_mutual', name: 'Adjunct Merrow', role: 'Reach Mutual, lending desk', register: 'formal', face: 'merrow',
    blurb: 'A bank. Reads the file before you sit down.',
  }),
  halloway_trust: Object.freeze({
    id: 'halloway_trust', name: 'Mr Pell', role: 'The family trust', register: 'formal', face: 'pell',
    blurb: 'Has known you since you were four and has never stopped mentioning it.',
  }),
  kestrel_credit: Object.freeze({
    id: 'kestrel_credit', name: 'Sabe', role: 'Kestrel Credit Union', register: 'spacer', face: 'sabe',
    blurb: 'Belt co-op money. Cheap, slow, and they want to see the rig.',
  }),
});

export const brokers = Object.freeze(['brann', 'veya', 'tolm', 'hask']);

export const lines = Object.freeze({
  /* ── the yard ─────────────────────────────────────────────────────────── */

  yard_greet: Object.freeze([
    Object.freeze({ when: Object.freeze({ origin: 'silver', trait: 'namedropper' }),
      say: 'G’day {term} — you’ll be a {last}. Word gets here before you do.' }),
    Object.freeze({ when: Object.freeze({ origin: 'gutter' }),
      say: 'G’day {term}. Everything this side of the line is cash up front.' }),
    Object.freeze({ when: Object.freeze({ origin: 'silver' }),
      say: 'G’day {term}. Buying, or having a look on the family’s behalf?' }),
    Object.freeze({ say: 'G’day {term}, after a hull?' }),
  ]),

  yard_reply: Object.freeze([
    Object.freeze({ when: Object.freeze({ trait: 'touchy_gender', said: 'gendered' }),
      say: 'Don’t call me {lastTerm}.', flags: Object.freeze({ snapped: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }),
      say: 'One is looking, yes. Something with a hold and a little dignity to it.' }),
    Object.freeze({ when: Object.freeze({ personality: 'hot' }),
      say: 'I’m after a hull. I’m not after a conversation.', flags: Object.freeze({ snapped: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'haggler' }),
      say: 'After a hull. Not after your first price.', flags: Object.freeze({ hard: true }) }),
    Object.freeze({ when: Object.freeze({ personality: 'sly' }),
      say: 'Depends. What’s not on the board?' }),
    Object.freeze({ when: Object.freeze({ trait: 'polite' }),
      say: 'I am, thank you. Something that carries.' }),
    Object.freeze({ when: Object.freeze({ trait: 'foulmouth' }),
      say: 'After a hull that isn’t held together with paint. Is that everything you’ve got?' }),
    Object.freeze({ when: Object.freeze({ personality: 'deadpan' }), say: 'A hull. Yes.' }),
    Object.freeze({ say: 'Yeah. Something that flies.' }),
  ]),

  yard_back: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'snapped' }),
      say: 'Right you are. Board’s live, help yourself.' }),
    Object.freeze({ when: Object.freeze({ said: 'hard' }),
      say: 'Everyone says that. Board’s live — first price is on the board, second one’s in my head.' }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }),
      say: 'Dignity’s an extra. Board’s live.' }),
    Object.freeze({ say: 'Board’s live. Everything on it flies. Most of it twice.' }),
  ]),

  /* ── the sales floor ──────────────────────────────────────────────────── */

  // `{hull}` is the class in front of you, `{price}` what it is quoted at, `{cut}` a discount the
  // yard is already advertising. The pitch table is drawn on every hull the player swipes to.
  yard_connect: Object.freeze([
    Object.freeze({ when: Object.freeze({ origin: 'silver' }), say: 'Desk four. Go ahead, {term}.' }),
    Object.freeze({ when: Object.freeze({ origin: 'gutter' }), say: 'Yard desk. You buying or looking?' }),
    Object.freeze({ when: Object.freeze({ personality: 'warm' }), say: 'Ledger Yard, this is the desk. Take your time.' }),
    Object.freeze({ say: 'Yard desk. Go ahead.' }),
    Object.freeze({ say: 'Desk. You’re through, the board’s in front of you.' }),
    Object.freeze({ say: 'Ledger, sales. What are we looking at.' }),
  ]),

  // `{hold}` is the window on whatever price is in front of them — the board's or the desk's.
  yard_pitch: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'held' }),
      say: 'The {hull}, at your number — {price}. {hold}, then it’s the board’s again.' }),
    Object.freeze({ when: Object.freeze({ said: 'urgent' }),
      say: 'The {hull}, {price}. I’ll be straight with you: {hold}.' }),
    Object.freeze({ when: Object.freeze({ said: 'onSale', trait: 'haggler' }),
      say: '{cut} off, {hold}, and no I can’t stretch it. You’d ask, so I’m saying it first.' }),
    Object.freeze({ when: Object.freeze({ said: 'onSale' }),
      say: 'That one’s {cut} off and I’d take it myself if I had the room. {hold}.' }),
    Object.freeze({ when: Object.freeze({ said: 'onSale' }),
      say: 'The {hull} — {cut} off at {price}. {hold}, and then it goes back up.' }),
    Object.freeze({ when: Object.freeze({ trait: 'haggler' }),
      say: 'The {hull}. {price}, and before you start — that already has my number in it.' }),
    Object.freeze({ when: Object.freeze({ personality: 'sly' }),
      say: 'The {hull}. {price} on the board. What you do with that is your business.' }),
    Object.freeze({ when: Object.freeze({ personality: 'deadpan' }),
      say: 'The {hull}. {price}. That’s the whole pitch.' }),
    Object.freeze({ say: 'The {hull}. {price}, and it has never been laid up.' }),
    Object.freeze({ say: 'The {hull}, {price}. Two owners, both of them careful.' }),
    Object.freeze({ say: 'The {hull} at {price}. Surveyed last month, papers are clean.' }),
  ]),

  yard_ask: Object.freeze([
    Object.freeze({ when: Object.freeze({ trait: 'haggler' }), say: 'That’s the board price. What’s the yard price?' }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }), say: 'One imagines there is some latitude on that.' }),
    Object.freeze({ when: Object.freeze({ personality: 'hot' }), say: 'Come down or I walk.', flags: Object.freeze({ hard: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'foulmouth' }), say: 'For that? Do me a favour.', flags: Object.freeze({ hard: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'polite' }), say: 'Is there anything you can do on the price?' }),
    Object.freeze({ when: Object.freeze({ personality: 'sly' }), say: 'And if I were paying today?' }),
    Object.freeze({ when: Object.freeze({ personality: 'warm' }), say: 'Talk to me. Where can we get to on it?' }),
    Object.freeze({ say: 'What’s your best on it?' }),
    Object.freeze({ say: 'That’s the asking price. What’s the taking price?' }),
  ]),

  yard_push: Object.freeze([
    Object.freeze({ when: Object.freeze({ trait: 'haggler' }), say: 'You went once. Go again and it’s sold.' }),
    Object.freeze({ when: Object.freeze({ personality: 'sly' }), say: 'I hear Dray Yard has two of these sitting.' }),
    Object.freeze({ when: Object.freeze({ personality: 'hot' }), say: 'Don’t make me stand here. Last number.', flags: Object.freeze({ hard: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'foulmouth' }), say: 'That’s still daylight robbery and you know it.', flags: Object.freeze({ hard: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }), say: 'I feel we are very nearly there.' }),
    Object.freeze({ say: 'One more move and I sign today.' }),
    Object.freeze({ say: 'Meet me once more and it’s done in front of you.' }),
  ]),

  yard_deal: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'hard' }), say: 'Fine. {price}. Don’t tell the floor, and {hold}.' }),
    Object.freeze({ when: Object.freeze({ origin: 'silver' }), say: '{price}, for the family. {hold} — that is me being sentimental.' }),
    Object.freeze({ when: Object.freeze({ trait: 'haggler' }), say: '{price}. You’ve had that out of me and it’s {hold}, not a day past.' }),
    Object.freeze({ when: Object.freeze({ personality: 'warm' }), say: '{price}, then. {hold}. Don’t make me chase you.' }),
    Object.freeze({ say: '{price}. That’s me and the yard falling out, so take it — {hold}.' }),
    Object.freeze({ say: '{price}, and I’ll write it down. {hold}, after that I never said it.' }),
    Object.freeze({ say: 'Call it {price}. {hold}, then the board takes it back off me.' }),
  ]),

  yard_no: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'hard' }), say: 'Then walk. It’ll be gone Thursday.' }),
    Object.freeze({ when: Object.freeze({ trait: 'polite' }), say: 'I wish there were. The yard sets it, not me.' }),
    Object.freeze({ when: Object.freeze({ personality: 'deadpan' }), say: 'No.' }),
    Object.freeze({ say: 'Board price is the price. I don’t own the yard, I just stand in it.' }),
    Object.freeze({ say: 'Not on that one. It’ll sell at that by Friday without my help.' }),
  ]),

  yard_firm: Object.freeze([
    Object.freeze({ when: Object.freeze({ personality: 'hot' }), say: 'Shout at me all you like. It goes up, not down.' }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }), say: 'We are not very nearly there. We were there, and you kept walking.' }),
    Object.freeze({ say: 'I’ve moved once. Ask again and it goes back up.' }),
    Object.freeze({ say: 'That’s twice. The number just got worse and that’s on you.' }),
    Object.freeze({ say: 'No. And now I’ve had to take a bit back, because the yard watches me too.' }),
  ]),

  // The player let a price they had agreed run out.
  yard_lapsed: Object.freeze([
    Object.freeze({ when: Object.freeze({ trait: 'haggler' }),
      say: 'You had my number on the {hull} and you sat on it. It’s {price} again.' }),
    Object.freeze({ when: Object.freeze({ personality: 'warm' }),
      say: 'I did hold it as long as I could. The {hull}’s back to {price}, I’m sorry.' }),
    Object.freeze({ when: Object.freeze({ personality: 'deadpan' }),
      say: 'That price expired. {price}.' }),
    Object.freeze({ say: 'That was last week’s number. The {hull} is {price} today.' }),
    Object.freeze({ say: 'I can’t hold a price forever, {term}. Back to {price}.' }),
  ]),

  // The yard's own advertised discount came off the board while the player was elsewhere.
  yard_gone: Object.freeze([
    Object.freeze({ when: Object.freeze({ personality: 'sly' }),
      say: 'Sale’s over. Between us, they always run them short for exactly this reason.' }),
    Object.freeze({ say: 'That sale came off Tuesday. The {hull} is {price} now.' }),
    Object.freeze({ say: 'You’ve just missed it. Back to {price} on that one.' }),
    Object.freeze({ say: 'Board’s been redone since you last looked. {price}.' }),
  ]),

  yard_sold: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'first', origin: 'gutter' }),
      say: 'Your first one. Nobody forgets their first, and nobody ever pays that little again.' }),
    Object.freeze({ when: Object.freeze({ said: 'first' }), say: 'Your first. She’s on the pad by the end of the week.' }),
    Object.freeze({ say: 'Sold. Handover’s a week, same as always.' }),
    Object.freeze({ say: 'Done. I’ll have the yard walk her out to you.' }),
    Object.freeze({ say: 'Signed. Pleasure — and you got that in under the wire.' }),
  ]),

  /* ── money ────────────────────────────────────────────────────────────── */

  vosk_open: Object.freeze([
    Object.freeze({ when: Object.freeze({ origin: 'gutter' }),
      say: '{first}. Sit down. I know what you were, so let’s not do the part where you tell me.' }),
    Object.freeze({ say: 'Sit down, {term}. You came to me, so we both know how the banks went.' }),
  ]),

  vosk_reply: Object.freeze([
    Object.freeze({ when: Object.freeze({ trait: 'touchy_gender', said: 'gendered' }),
      say: 'Don’t call me {lastTerm}.', flags: Object.freeze({ snapped: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }),
      say: 'I’d rather we kept this brief and businesslike, if it’s all the same.' }),
    Object.freeze({ when: Object.freeze({ personality: 'hot' }),
      say: 'Name the rate. Skip the theatre.', flags: Object.freeze({ snapped: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'polite' }),
      say: 'They went badly, yes. Thank you for seeing me.' }),
    Object.freeze({ when: Object.freeze({ personality: 'sly' }),
      say: 'The banks and I have an understanding. They don’t call, I don’t call.' }),
    Object.freeze({ say: 'They went how they went. What’s the rate?' }),
  ]),

  vosk_terms: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'snapped' }),
      say: 'Good. I like a short conversation. {rate} a week, and I collect on Thursday.' }),
    Object.freeze({ when: Object.freeze({ trait: 'soft' }),
      say: '{rate} a week. You’ve a kind face. That is not a compliment in this room.' }),
    Object.freeze({ say: '{rate} a week. I collect Thursday. I have never had to explain that twice.' }),
  ]),

  mutual_open: Object.freeze([
    Object.freeze({ when: Object.freeze({ origin: 'silver' }),
      say: 'Good morning, {term}. Your father’s guarantee is already on the file.' }),
    Object.freeze({ when: Object.freeze({ origin: 'gutter' }),
      say: 'Good morning, {term}. I have read the file. All of it.' }),
    Object.freeze({ say: 'Good morning, {term}. Eleven years at the same yard. That reads well.' }),
  ]),

  mutual_reply: Object.freeze([
    Object.freeze({ when: Object.freeze({ trait: 'touchy_gender', said: 'gendered' }),
      say: 'It’s not {lastTerm}. It’s on the form in front of you.', flags: Object.freeze({ snapped: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'posh' }),
      say: 'Quite. Shall we discuss the facility?' }),
    Object.freeze({ when: Object.freeze({ trait: 'namedropper' }),
      say: 'It should do. Ask Pell at the trust, he’ll say the same.' }),
    Object.freeze({ when: Object.freeze({ personality: 'hot' }),
      say: 'Then you know I’m good for it. Rate.', flags: Object.freeze({ snapped: true }) }),
    Object.freeze({ when: Object.freeze({ trait: 'polite' }),
      say: 'Thank you. I’d like to talk about a facility.' }),
    Object.freeze({ say: 'Then you know what I’m here for.' }),
  ]),

  mutual_terms: Object.freeze([
    Object.freeze({ when: Object.freeze({ said: 'snapped' }),
      say: 'As you wish. {rate} a week, reviewed quarterly.' }),
    Object.freeze({ when: Object.freeze({ origin: 'silver' }),
      say: '{rate} a week. The committee will not be troubled.' }),
    Object.freeze({ say: '{rate} a week, reviewed quarterly. The committee is not sentimental.' }),
  ]),
});

export const conversations = Object.freeze({
  yard_first: Object.freeze({
    id: 'yard_first', npc: 'brann', label: 'Walking into the yard',
    beats: Object.freeze([
      Object.freeze({ npc: 'yard_greet' }),
      Object.freeze({ you: 'yard_reply' }),
      Object.freeze({ npc: 'yard_back' }),
    ]),
  }),
  vosk_first: Object.freeze({
    id: 'vosk_first', npc: 'vosk', label: 'Borrowing from Vosk',
    beats: Object.freeze([
      Object.freeze({ npc: 'vosk_open' }),
      Object.freeze({ you: 'vosk_reply' }),
      Object.freeze({ npc: 'vosk_terms' }),
    ]),
  }),
  mutual_first: Object.freeze({
    id: 'mutual_first', npc: 'reach_mutual', label: 'The lending desk',
    beats: Object.freeze([
      Object.freeze({ npc: 'mutual_open' }),
      Object.freeze({ you: 'mutual_reply' }),
      Object.freeze({ npc: 'mutual_terms' }),
    ]),
  }),
});

export default Object.freeze({ registers, npcs, brokers, lines, conversations });
