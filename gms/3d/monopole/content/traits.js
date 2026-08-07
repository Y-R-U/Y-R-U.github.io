// Who the player decided to be. Personality is exactly one; traits are up to `MAX_TRAITS`.
// Ids here are matched by `when` clauses in content/voice.js — renaming one silently kills a
// variant, so ids are additive only.

export const MAX_TRAITS = 3;

export const personalities = Object.freeze([
  Object.freeze({
    id: 'warm', name: 'Warm', blurb: 'You like people, and it mostly works.',
    edge: 'Contacts warm to you faster.',
  }),
  Object.freeze({
    id: 'blunt', name: 'Blunt', blurb: 'You say the number and wait.',
    edge: 'Fewer words, better prices.',
  }),
  Object.freeze({
    id: 'sly', name: 'Sly', blurb: 'You never quite say the whole thing.',
    edge: 'The grey side of the market opens sooner.',
  }),
  Object.freeze({
    id: 'hot', name: 'Hot-tempered', blurb: 'You have been asked to leave places.',
    edge: 'Nobody pushes you twice. Some doors shut anyway.',
  }),
  Object.freeze({
    id: 'deadpan', name: 'Deadpan', blurb: 'Impossible to read, occasionally on purpose.',
    edge: 'Hard to bluff.',
  }),
]);

export const traits = Object.freeze([
  Object.freeze({ id: 'polite', name: 'Always polite', blurb: 'Please, thank you, even to a loan shark.' }),
  Object.freeze({ id: 'shouts', name: 'Shouts a lot', blurb: 'VOLUME IS A NEGOTIATING POSITION.' }),
  Object.freeze({ id: 'posh', name: 'Posh', blurb: 'One does not haggle. One enquires.' }),
  Object.freeze({ id: 'touchy_gender', name: 'Touchy about gender', blurb: 'Call you love and find out.' }),
  Object.freeze({ id: 'namedropper', name: 'Name-dropper', blurb: 'You know a man who knows a man.' }),
  Object.freeze({ id: 'superstitious', name: 'Superstitious', blurb: 'You do not launch on a Sixthday.' }),
  Object.freeze({ id: 'haggler', name: 'Hard bargainer', blurb: 'The first price is an opening insult.' }),
  Object.freeze({ id: 'soft', name: 'Soft touch', blurb: 'You have never once collected a debt.' }),
  Object.freeze({ id: 'foulmouth', name: 'Foul-mouthed', blurb: 'Fluent, and unrepeatable.' }),
]);

export const genders = Object.freeze([
  Object.freeze({ id: 'm', name: 'Male' }),
  Object.freeze({ id: 'f', name: 'Female' }),
  Object.freeze({ id: 'x', name: 'What’s it to you' }),
]);

export default Object.freeze({ personalities, traits, genders, MAX_TRAITS });
