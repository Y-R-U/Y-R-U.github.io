// D16 story intro. `text` is both caption and narration; `tts` overrides what the TTS reads where it needs help.
// The narrator never says the player's name (D1): the name appears only on the on-screen card.
// Clip durations live in audio/story/narration.json (tools/story/narrate.py).
// Shots: world metres (CONTRACT frame). `rel` shots are offsets from the player's plane parked on a stand (nose south).

export const NARRATOR = {
  id: 'narrator',
  design: 'A warm, deep, low-pitched mature British male narrator with received pronunciation. An ordinary adult male speaking voice at normal volume, unhurried storytelling pace, dry and gently amused, like a fond documentary presenter reading a fairy tale aloud.',
  audition: 'Once upon a time, in a kingdom with far too many aeroplanes, there lived a family who had never once waited their turn. This is their story, more or less.',
  f0: [80, 150],
};

export const INTRO = [
  { id: 'i01', shot: 'kingdom', text: 'Once upon a time, last Tuesday or thereabouts, there was a kingdom called Krayzee.' },
  { id: 'i02', shot: 'castle', text: 'Its royal family did not hunt, or fish, or open hospitals. They flew.' },
  { id: 'i03', shot: 'village', text: 'In 1907 the Royal Chemist, attempting a self-buttering crumpet, invented impossiRubber instead.',
    tts: 'In nineteen oh seven, the Royal Chemist, attempting a self-buttering crumpet, invented impossi-rubber instead.' },
  { id: 'i04', shot: 'cathedral', text: 'The King had a biplane made of it that afternoon, flew it into the cathedral, bounced off, and declared aviation perfectly safe.' },
  { id: 'i05', shot: 'airport', text: 'Every royal aircraft since has been made of the stuff. And every rule of the air was written for other people.' },
  { id: 'i06', shot: 'tower', text: 'Somebody still has to read those rules out. That is the control tower.' },
  { id: 'i07', shot: 'towerClose', text: 'The tower remains calm. Mostly. It has a therapist, and a great deal of tea.' },
  { id: 'i08', shot: 'rivals', text: 'The House of Pomfrey-Smythe has won the Royal Hangar for two hundred years. They fly in mauve. They are insufferable.',
    tts: 'The House of Pomfrey Smythe has won the Royal Hangar for two hundred years. They fly in mauve. They are insufferable.' },
  { id: 'i09', shot: 'you', card: true, text: 'Which brings us to you. This morning the Queen ennobled you, for reasons nobody can quite remember.',
    tts: 'Which brings us... to you. This morning, the Queen ennobled you, for reasons nobody can quite remember.' },
  { id: 'i10', shot: 'youSide', card: true, text: 'You have a title, an aeroplane, and absolutely no intention of waiting your turn.' },
  { id: 'i11', shot: 'title', title: true, text: 'Welcome to Krayzee.', tts: 'Welcome to Crazy.' },
];

export const SHOTS = {
  kingdom: { from: [-450, 380, -700], to: [-50, 300, -1250], look: [780, 90, -2300], lookTo: [760, 85, -2290], fov: 30 },
  castle: { from: [1230, 175, -1960], to: [420, 150, -1900], look: [780, 95, -2300], fov: 46 },
  village: { from: [-560, 75, -1050], to: [60, 70, -1170], look: [-120, 15, -1560], lookTo: [180, 15, -1600], fov: 52 },
  cathedral: { from: [380, 120, -1250], to: [560, 135, -1650], look: [120, 25, -1580], lookTo: [780, 80, -2300], fov: 50 },
  airport: { from: [-1100, 280, 650], to: [-450, 210, 520], look: [60, 0, -120], fov: 50 },
  tower: { from: [420, 110, -60], to: [380, 85, -420], look: [190, 30, -260], fov: 48 },
  towerClose: { from: [255, 46, -190], to: [250, 44, -330], look: [190, 36, -260], fov: 44 },
  rivals: { follow: 'ai', offset: [13, 3.5, 19], fov: 46, fallback: { from: [-700, 18, 70], to: [350, 24, 70], look: [600, 10, 0], fov: 52 } },
  you: { rel: true, from: [-20, 8, 32], to: [9, 4, 21], look: [0, 1.2, 0], fov: 42 },
  youSide: { rel: true, from: [11, 2.4, 4], to: [9.5, 2.8, -5], look: [0, 1.3, -1], fov: 44 },
  title: { rel: true, from: [-9, 3, 13], to: [-80, 150, 300], look: [0, 1.2, 0], lookTo: [0, 30, -1200], fov: 50 },
};

export const WORDS_PER_SEC = 2.5;
