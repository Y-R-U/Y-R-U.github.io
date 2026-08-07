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

export const npcs = Object.freeze({
  brann: Object.freeze({
    id: 'brann', name: 'Brann Otey', role: 'Yard broker, Ledger', register: 'rough',
    blurb: 'Sells hulls. Has never once described one as slow.',
  }),
  vosk: Object.freeze({
    id: 'vosk', name: 'Ilo Vosk', role: 'Private lender', register: 'rough',
    blurb: 'Lends fast, collects faster. Asks about your family and means it as a threat.',
  }),
  reach_mutual: Object.freeze({
    id: 'reach_mutual', name: 'Adjunct Merrow', role: 'Reach Mutual, lending desk', register: 'formal',
    blurb: 'A bank. Reads the file before you sit down.',
  }),
  halloway_trust: Object.freeze({
    id: 'halloway_trust', name: 'Mr Pell', role: 'The family trust', register: 'formal',
    blurb: 'Has known you since you were four and has never stopped mentioning it.',
  }),
  kestrel_credit: Object.freeze({
    id: 'kestrel_credit', name: 'Sabe', role: 'Kestrel Credit Union', register: 'spacer',
    blurb: 'Belt co-op money. Cheap, slow, and they want to see the rig.',
  }),
});

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

export default Object.freeze({ registers, npcs, lines, conversations });
