// js/data/story.js — the whole storyline. CONTRACTS §8.4.
//
// STORY = { [key]: { title, lines: [{who, portrait, text}], art? } }
//
// Keys:
//   s1_intro … s12_outro   the VN strip either side of each stage (stages.js)
//   act1 … act4            the four act cards
//   ending_choice          the fork, shown after s12_outro
//   ending_cut             you cut your own thread
//   ending_hand            you take the Ninth's hand
//   tut_*                  tutorial beats fired by the sim as {t:'say', key}
//   bark_*                 in-run one-liners, same channel
//
// `portrait` is an art key from tools/gen_art.mjs or null for narration.
// `who: null` is narration too.
//
// Every strip is ~6 lines and every line is one or two sentences, because this
// is read on a phone with a thumb over the skip button. tut_* and bark_* are a
// single short line each: they land mid-combat on a 390px screen and anything
// longer is a wall in front of the fight.
//
// Voice: grim, spare, concrete. Short sentences. The horror is what is not
// said. Nothing in here explains itself and nothing in here is funny.

const N = (text) => ({ who: null, portrait: null, text });
const speaker = (who, portrait) => (text) => ({ who, portrait, text });

const You = speaker('You', 'char_wick');   // the player is Wick for the story's length
const Ilse = speaker('Ilse', 'char_ilse');
const Vane = speaker('Sister Vane', 'char_vane');
const Dredge = speaker('Dredge', 'char_dredge');
const Ash = speaker('Cardinal Ash', 'char_ash');
const Ninth = speaker('The Ninth', 'boss_ninth');

const beat = (text) => ({ title: null, lines: [N(text)], art: null });

export const STORY = Object.freeze({

  // ══════════════════════════════════════════════ ACT I — THE TOWN

  act1: {
    title: 'ACT ONE · The Town', art: 'act1',
    lines: [
      N('They are calling it a plague.'),
      N('There is no fever. There is no rash. Nobody is coughing.'),
      N('People die in the usual numbers and then they get up, and that is the whole of the symptom.')
    ]
  },

  s1_intro: {
    title: 'Bellfield Lane', art: 'act1',
    lines: [
      N('Half past eleven. The seventeenth lamp.'),
      N('You have done this round every night for four years and you could do it blind.'),
      You('Mrs Harrow is standing in her doorway.'),
      You('She has been standing there since Tuesday.'),
      N('She steps down into the road.'),
      N('So does everyone else on Bellfield Lane.')
    ]
  },

  s1_outro: {
    title: 'Bellfield Lane', art: 'act1',
    lines: [
      N('It takes a long time to stop moving. Longer than a body should need.'),
      Ilse('You saw it.'),
      You('There was something above her. Like a wire, but lit.'),
      Ilse('A thread. It runs up and away and it does not end anywhere in this town.'),
      Ilse('Everyone sees them eventually. Most people see them from the other end.'),
      Ilse('Come on. The Row is worse.')
    ]
  },

  s2_intro: {
    title: 'The Flooded Row', art: 'act1',
    lines: [
      N('The Row went under in a night in March and the water never went back down.'),
      Ilse('Forty houses. Two hundred and nine people.'),
      You('How many got out?'),
      Ilse('All of them. Eventually.'),
      N('Something breaks the surface at the far end of the street.'),
      N('It does not come up for air. It just keeps walking.')
    ]
  },

  s2_outro: {
    title: 'The Flooded Row', art: 'act1',
    lines: [
      You('They were under for six weeks.'),
      Ilse('Drowning is not a disease. Neither is this.'),
      Ilse('Watch where the threads go. Not one of them points down.'),
      You('They all lean the same way.'),
      Ilse('Yes.'),
      N('East. Towards the gate, and the bones behind it.')
    ]
  },

  s3_intro: {
    title: 'Ossuary Gate', art: 'act1',
    lines: [
      N('They stopped burying them in February. After that they stacked them.'),
      Vane('Four hundred and six. I read for every one.'),
      Vane('Then I watched every one of them stand up and walk out of the yard.'),
      You('The rite did not hold.'),
      Vane('The rite held perfectly. Something else had already been agreed.'),
      N('The gate is standing open. It was locked from the inside.')
    ]
  },

  s3_outro: {
    title: 'Hollowth, the First Note', art: 'boss_hollowth',
    lines: [
      N('Hollowth comes apart slowly, the way a held note ends.'),
      N('Every thread in the yard goes slack at once. Four hundred bodies lie down in the dirt.'),
      Vane('They are not sick.'),
      Vane('None of them were. No fever, no swelling, nothing in the blood. I looked.'),
      You('Then what is it.'),
      Ilse('Obedience.')
    ]
  },

  // ══════════════════════════════════════════════ ACT II — THE MARSH

  act2: {
    title: 'ACT TWO · The Marsh', art: 'act2',
    lines: [
      N('The plague is obedience.'),
      N('It is not caught and it cannot be nursed. It is given, the way an order is given.'),
      N('Which means there is somebody giving it.')
    ]
  },

  s4_intro: {
    title: "Widow's Marsh", art: 'act2',
    lines: [
      Dredge('You came out here for an answer. You will get mud.'),
      N('The marsh has been taking the town’s overflow since the yard filled up.'),
      Dredge('Three hundred and eleven in this ground. My own hands, my own shovel.'),
      Dredge('Two hundred and ninety of them have been back out to say hello.'),
      You('Then why do you keep digging.'),
      Dredge('Because somebody has to know where they are.')
    ]
  },

  s4_outro: {
    title: "Widow's Marsh", art: 'act2',
    lines: [
      Ilse('Hold out your hand.'),
      N('She lays a cut length of thread across your palm. It is warm. It is wet.'),
      Ilse('It is not rope and it is not light. Somebody made this.'),
      You('Made it where.'),
      Dredge('Downstream. Everything in this marsh is downstream of something.'),
      N('The water is moving. It has not moved in six weeks.')
    ]
  },

  s5_intro: {
    title: 'The Drowned Chapel', art: 'act2',
    lines: [
      Vane('They were at Vespers when the water came in under the door.'),
      Vane('It is in the register. Nobody left.'),
      N('The nave is flooded to your knees. The pews are still full.'),
      You('They stayed for the whole service.'),
      Vane('They are still in it.'),
      N('At the altar, something that is kneeling stops kneeling.')
    ]
  },

  s5_outro: {
    title: 'The Drowned Chapel', art: 'act2',
    lines: [
      N('The water goes flat and stays flat.'),
      Vane('Did you hear the note.'),
      You('I thought it was the building settling.'),
      Ilse('It was not the building.'),
      Vane('They are not an army. An army is for taking a thing.'),
      Vane('This is a choir. A choir is for being heard.')
    ]
  },

  s6_intro: {
    title: 'Threadworks', art: 'act2',
    lines: [
      N('The Threadworks made hemp line for the harbour for ninety years.'),
      N('Since February it has been making something else.'),
      Dredge('The machines are running and there is nobody feeding them.'),
      You('Then what is on the spools.'),
      Ilse('Do not touch the spools.'),
      N('At the far end of the floor something very tall is working, with too many hands.')
    ]
  },

  s6_outro: {
    title: 'Vellish the Weaver', art: 'boss_vellish',
    lines: [
      N('Vellish folds up small. Its hands keep spinning for a while afterwards.'),
      You('It was mending them. While I was cutting, it was mending them behind me.'),
      Ilse('It was tidying. You were the mess.'),
      Dredge('Look at the spools.'),
      N('Every thread on every spool leaves the building on the same bearing. East, over the marsh, towards the city.'),
      You('They go somewhere.')
    ]
  },

  // ══════════════════════════════════════════════ ACT III — THE CITY

  act3: {
    title: 'ACT THREE · The City', art: 'act3',
    lines: [
      N('The strings run somewhere.'),
      N('Not up. Not to heaven, and not to hell either, which people find harder.'),
      N('East, over the rooftops, and then down.')
    ]
  },

  s7_intro: {
    title: 'Ashgate', art: 'act3',
    lines: [
      N('Ashgate burned for nine days. The order came from a cardinal.'),
      Ash('Nine hundred souls inside the wall. I signed for all of them.'),
      You('Did it work.'),
      Ash('No.'),
      Ash('They walked out of the fire still burning, and they are burning now, and they are still walking.'),
      Ash('I am going to be extremely useful to you.')
    ]
  },

  s7_outro: {
    title: 'Ashgate', art: 'act3',
    lines: [
      Ash('I have been watching you work. You cut the thread. Not the man.'),
      You('The man is already gone.'),
      Ash('Yes.'),
      Ash('I would have liked to have known that in February.'),
      N('He stands in the road and follows one thread with his eyes for a long time.'),
      Ash('Over the rooftops. Every one of them. Towards the hall.')
    ]
  },

  s8_intro: {
    title: 'The Long Hospital', art: 'act3',
    lines: [
      N('The Long Hospital is four wards deep from the street.'),
      N('It has been eleven wards deep since February.'),
      Vane('The building has not grown. Something is making room in it.'),
      Dredge('Room for what.'),
      N('Nobody answers that one.'),
      Ilse('Keep walking. Do not count the doors.')
    ]
  },

  s8_outro: {
    title: 'The Long Hospital', art: 'act3',
    lines: [
      N('There is a ledger on the desk in the eleventh ward. It is a list of names.'),
      N('It is not a list of the dead.'),
      Vane('I know four of these people. I spoke to one of them on Sunday.'),
      You('Then why are they written down in here.'),
      Ilse('Because being written down is the first part.'),
      N('Your name is not in it. You check twice.')
    ]
  },

  s9_intro: {
    title: 'Choir Hall', art: 'act3',
    lines: [
      N('The Choir Hall was built for the sound, and not at all for the people in it.'),
      Ash('Two thousand seats. No windows. Doors that open one way.'),
      Vane('It was always a strange building.'),
      Ilse('It was always this building.'),
      N('There is somebody on the podium with his arms already raised.'),
      Ash('Do not let him start.')
    ]
  },

  s9_outro: {
    title: 'Cantor Morrow', art: 'boss_morrow',
    lines: [
      N('Morrow keeps conducting for four bars after he stops existing. Then he stops.'),
      You('He was holding me. For a moment I was on the end of one.'),
      Ash('Then you know what they are for.'),
      Vane('A choir needs somebody to sing to.'),
      N('The floor of the hall is not a floor. You can hear how thin it is.'),
      Ilse('It goes down. It has always gone down.')
    ]
  },

  // ══════════════════════════════════════════════ ACT IV — BELOW

  act4: {
    title: 'ACT FOUR · Below', art: 'act4',
    lines: [
      N('The Loom is under the city and it holds every thread there is.'),
      N('There is one on it with your name against it.'),
      N('It is not new.')
    ]
  },

  s10_intro: {
    title: 'The Descent', art: 'act4',
    lines: [
      N('The stairs were cut from the inside. The tool marks all point up.'),
      Dredge('Somebody dug out of here. Not into it.'),
      Ash('Somebody dug out of here a very long time before this town was put up.'),
      N('The threads come down beside you the whole way, in their thousands, close enough to touch.'),
      You('They are thicker down here.'),
      Ilse('They are closer to the spool.')
    ]
  },

  s10_outro: {
    title: 'The Descent', art: 'act4',
    lines: [
      N('At the bottom the air is warm, and it moves. In, and out, slowly.'),
      Vane('That is breathing.'),
      Ash('That is a room.'),
      Vane('It is both.'),
      Dredge('I will wait at the stairs.'),
      Dredge('Somebody has to know where you are.')
    ]
  },

  s11_intro: {
    title: 'The Loom of Names', art: 'act4',
    lines: [
      N('It is not a machine. It is the size of a cathedral, and it is a loom.'),
      N('Every thread on it is labelled, in ink, by hand.'),
      Ilse('Do not read them.'),
      You('Why.'),
      Ilse('Because you will find yours, and then you will want to know how long it has been up there.'),
      N('You read them.')
    ]
  },

  s11_outro: {
    title: 'The Loom of Names', art: 'act4',
    lines: [
      N('Eastern frame. Eye height. Your name, in a hand you have never seen.'),
      N('The ink has gone brown.'),
      You('It is dated.'),
      Ilse('Mine is too. Mine is older than I am.'),
      You('Then we were never—'),
      Ilse('No. We are the ones they left slack. Down here that is all being alive means.')
    ]
  },

  s12_intro: {
    title: 'The Ninth Throne', art: 'act4',
    lines: [
      N('The last door is not locked. There is no sign it ever has been.'),
      Ash('It has been waiting.'),
      N('The Ninth is seated, and has been seated for a very long time.'),
      N('It is made of thread. All of it. Every strand pulled tight, every strand going somewhere.'),
      Ninth('You came all the way down.'),
      Ninth('Most of them stop at the hospital.')
    ]
  },

  s12_outro: {
    title: 'The Ninth', art: 'boss_ninth',
    lines: [
      N('The Ninth does not fall. It comes undone one thread at a time, and it takes a while.'),
      N('The last of it is a hand, still open.'),
      Ninth('There is a thread out of the top of my head as well.'),
      Ninth('I have never once been able to reach it.'),
      Ninth('You can reach yours.'),
      N('Behind you, on the eastern frame, at eye height, your name.')
    ]
  },

  // ══════════════════════════════════════════════ THE FORK (DESIGN §7)

  ending_choice: {
    title: 'Eastern Frame, Eye Height', art: 'act4',
    lines: [
      N('Two things are within reach.'),
      N('Your own thread, labelled and dated and browning.'),
      N('And the hand, still open.'),
      N('There is nobody left down here to see which you take.')
    ]
  },

  ending_cut: {
    title: 'Cut', art: 'act4',
    lines: [
      N('You cut your own thread.'),
      N('Nothing happens for a moment. That is the worst moment.'),
      N('Then the whole Loom goes slack at once, from the top down, the way a held note ends.'),
      N('In Bellfield Lane, four hundred people lie down in the road and stay down.'),
      N('Ilse finds you at the foot of the stairs an hour later. You do not know her.'),
      N('You do not know your own name either. It was written on the thread.')
    ]
  },

  ending_hand: {
    title: 'Held', art: 'act4',
    lines: [
      N('You take the Ninth’s hand.'),
      N('It is warm, and wet, and it is exactly the thread you have spent all week cutting.'),
      N('The weight comes on. Two hundred thousand of them at once, all of them waiting.'),
      N('It is not heavy. That is the part nobody warns you about.'),
      N('Above Bellfield Lane, at half past eleven, the seventeenth lamp goes out.'),
      N('Everyone in the road turns to face the same way, and waits to be told.')
    ]
  },

  // ══════════════════════════════════════════════ TUTORIAL BEATS (DESIGN §4)
  // One line each. These land mid-combat on a phone; anything longer is a wall
  // in front of the fight.

  tut_move: beat('Hold anywhere. You walk where your thumb is.'),
  tut_weapon: beat('You do not aim. Stay alive.'),
  tut_levelup: beat('One of them. Not both.'),
  tut_shard: beat('Pick them up. It is what is left of her.'),
  tut_string: beat('Above it. That thread is what is holding it up.'),
  tut_cut: beat('Cut the thread. Not the body.'),
  tut_cut_done: beat('It drops. Anything can finish it now.'),
  tut_conductor: beat('The one in the air is holding all of them.'),
  tut_conductor_down: beat('Every thread it was holding is on the ground.'),
  tut_chest: beat('Open it.'),
  tut_souls: beat('Souls. They keep, when nothing else does.'),
  tut_freed: beat('That one is yours for a few seconds. Use them.'),
  tut_sigil: beat('This one changes a rule. Read it properly.'),
  tut_relic: beat('You choose before you go in. Never after.'),
  tut_curse: beat('Harder. It pays for itself.'),

  // ══════════════════════════════════════════════ BARKS

  bark_chorus: beat('They are all moving together. Do not be in the middle of it.'),
  bark_boss: beat('It is holding the whole room.'),
  bark_lowhp: beat('You are nearly out.'),
  bark_revive: beat('Get up.'),
  bark_evolve: beat('It has become something else.'),
  bark_horde: beat('Too many to fight. Cut, and keep walking.'),
  bark_restrung: beat('It has been strung again. Somebody is watching you work.')

});

export const list = Object.freeze(Object.keys(STORY));

// Keys the sim may fire as {t:'say', key} (CONTRACTS §7.3). Exported so the
// sim can assert at boot that every key it intends to fire actually exists,
// rather than firing into a silent hole.
export const SAY_KEYS = Object.freeze(list.filter(k => k.startsWith('tut_') || k.startsWith('bark_')));
