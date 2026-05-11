// THE HOLLOW — story graph.
// Each room: { title, image, desc, choices[], onEnter?, type? }
// onEnter may: addItem, setFlag, addMemory
// choices each: { label, target, condition?(s)->bool }
// type 'ending' marks terminal nodes (with ending tag for save history).

window.STORY = {
  start: 'intro',
  // Endings catalogue — title shown on the death/finale card.
  endings: {
    acceptance: { title: 'Acceptance', kind: 'good' },
    watcher: { title: 'Taken by the Watcher', kind: 'bad' },
    drowned: { title: 'Drowned in Memory', kind: 'bad' },
    lost: { title: 'Lost in the Rocking', kind: 'bad' },
    forgotten: { title: 'Forgotten in the Chair', kind: 'bad' },
    fall: { title: 'The House Caught You', kind: 'bad' },
    unfinished: { title: 'You Left Pieces Behind', kind: 'neutral' },
  },

  rooms: {
    // ---------------- INTRO ----------------
    intro: {
      type: 'intro',
      title: 'Wake',
      image: null,
      desc: '',
    },

    // ---------------- UPSTAIRS ----------------
    bedroom: {
      title: 'Your Bedroom',
      image: 'bedroom.png',
      desc: 'You sit up in a bed that smells of dust and old rain. The wallpaper peels in long pale strips. Outside the window, no streetlight. No moon. Just a flat, papery dark — and the certainty that you have not been here in a very long time.',
      onEnter: { setFlag: 'wokenUp' },
      choices: [
        { label: 'Open the bedroom door', target: 'hallway_upper' },
        { label: 'Look out the window', target: 'window_view' },
        { label: 'Look under the bed', target: 'under_bed', condition: s => !s.inventory.includes('nightlight') },
        { label: 'Pull the covers back over your head', target: 'ending_lost_sleep' },
      ],
    },

    window_view: {
      title: 'The Window',
      image: 'bedroom.png',
      desc: 'You press your face to the cold pane. The yard is wrong. There are trees, but nothing beneath them — no shadows, no leaves. A figure stands at the treeline. When you blink, it is closer.',
      choices: [
        { label: 'Step back from the window', target: 'bedroom' },
        { label: 'Wave at it', target: 'ending_window' },
      ],
    },

    under_bed: {
      title: 'Under the Bed',
      image: 'bedroom.png',
      desc: 'On hands and knees you peer beneath. Something small and brass — a child\'s nightlight, ice-cold, unplugged. You pocket it.',
      onEnter: { addItem: 'nightlight' },
      choices: [
        { label: 'Stand up', target: 'bedroom' },
      ],
    },

    ending_lost_sleep: {
      type: 'ending',
      ending: 'lost',
      image: 'bedroom.png',
      desc: 'The covers are warm. The dark beneath them is warmer. You decide to wait. You are still waiting.',
    },

    hallway_upper: {
      title: 'Upstairs Hallway',
      image: 'hallway_upper.png',
      desc: 'Wall sconces flicker. A long red carpet bleeds into the dark. The wallpaper repeats a pattern of small grey faces — you only notice on the third look.',
      choices: [
        { label: 'Open the door across the hall', target: 'bathroom' },
        { label: 'Open the door at the end', target: 'bedroom2' },
        { label: 'Climb the narrow attic stairs', target: 'attic_stairs' },
        { label: 'Take the staircase down', target: 'staircase' },
        { label: 'Return to your bedroom', target: 'bedroom' },
      ],
    },

    bathroom: {
      title: 'The Bathroom',
      image: 'bathroom.png',
      desc: 'A single bulb buzzes over a porcelain sink. The mirror is cracked clean through the middle. Water drips into the tub even though the taps are shut.',
      choices: [
        { label: 'Look into the mirror', target: 'bathroom_mirror', condition: s => !s.flags.sawCarMemory },
        { label: 'Look into the mirror again', target: 'ending_drowned_mirror', condition: s => s.flags.sawCarMemory },
        { label: 'Approach the dripping tub', target: 'bathroom_tub' },
        { label: 'Leave the bathroom', target: 'hallway_upper' },
      ],
    },

    bathroom_mirror: {
      title: 'The Mirror',
      image: 'memory_car.png',
      desc: 'In the cracked glass: headlights. Rain on a black road. Something coming fast across the wet. A horn. Then silence — your silence. The mirror snaps back. In the sink, a small silver locket. You take it.',
      onEnter: { addItem: 'locket', setFlag: 'sawCarMemory', addMemory: 'car' },
      choices: [
        { label: 'Step back', target: 'bathroom' },
      ],
    },

    ending_drowned_mirror: {
      type: 'ending',
      ending: 'drowned',
      image: 'bathroom.png',
      desc: 'You stare. Water rises around your ankles. The tub overflows. The mirror floods. You cannot tell which side of the glass you are on. Your lungs fill with the answer.',
    },

    bathroom_tub: {
      title: 'The Tub',
      image: 'bathroom.png',
      desc: 'The water in the tub is dark and very still. Your reflection in it has its eyes open. You are sure your eyes are closed.',
      choices: [
        { label: 'Touch the water', target: 'ending_drowned_tub' },
        { label: 'Back away', target: 'bathroom' },
      ],
    },

    ending_drowned_tub: {
      type: 'ending',
      ending: 'drowned',
      image: 'bathroom.png',
      desc: 'Your finger breaks the surface. A hand from below closes around your wrist. The tub is deeper than the floor. Deeper than the world.',
    },

    ending_window: {
      type: 'ending',
      ending: 'watcher',
      image: 'watcher.png',
      desc: 'You wave. The figure waves back. Then it is in your room. Then it is the room.',
    },

    bedroom2: {
      title: 'The Other Bedroom',
      image: 'bedroom2.png',
      desc: 'Sheets are draped over the furniture like patient ghosts. A rocking chair moves, slightly, in no breeze.',
      choices: [
        { label: 'Lift one of the sheets', target: 'bedroom2_lift' },
        { label: 'Sit in the rocking chair', target: 'ending_chair' },
        { label: 'Leave', target: 'hallway_upper' },
      ],
    },

    bedroom2_lift: {
      title: 'Beneath the Sheet',
      image: 'bedroom2.png',
      desc: 'A child\'s vanity. On it, a brass nightlight identical to yours — except this one is plugged in, glowing faintly, with no cord behind it. You leave it where it is.',
      onEnter: { setFlag: 'sawTwin' },
      choices: [
        { label: 'Lower the sheet', target: 'bedroom2' },
      ],
    },

    ending_chair: {
      type: 'ending',
      ending: 'forgotten',
      image: 'bedroom2.png',
      desc: 'You sit. The chair rocks. Each forward swing is a year. You forget what year you began. You forget there were ever any other rooms.',
    },

    attic_stairs: {
      title: 'The Attic Stairs',
      image: 'attic_stairs.png',
      desc: 'A folding ladder you do not remember pulling down. The square of black above is colder than the rest of the house.',
      choices: [
        { label: 'Climb carefully, hand on the rail', target: 'attic' },
        { label: 'Climb without holding the rail', target: 'ending_fall' },
        { label: 'Step back', target: 'hallway_upper' },
      ],
    },

    ending_fall: {
      type: 'ending',
      ending: 'fall',
      image: 'attic_stairs.png',
      desc: 'You make the climb without a hand on the rail. Halfway up, the rung is not where you left it. The house has all the time it needs to wait for you to land.',
    },

    attic: {
      title: 'The Attic',
      image: 'attic.png',
      desc: 'Boxes. A rocking horse. A dollhouse — your dollhouse — that looks like this house, only smaller. In its tiny attic, a tiny figure of a tiny person.',
      choices: [
        { label: 'Open the dollhouse attic', target: 'attic_dollhouse' },
        { label: 'Look in the old hatbox', target: 'attic_hatbox', condition: s => !s.inventory.includes('photo') },
        { label: 'Climb back down', target: 'attic_stairs' },
      ],
    },

    attic_dollhouse: {
      title: 'The Dollhouse',
      image: 'attic.png',
      desc: 'The tiny figure is you. You know this because the little face is your face, painted with care. You set it down. The dollhouse begins, very gently, to tick.',
      onEnter: { setFlag: 'sawDollhouse' },
      choices: [
        { label: 'Step back', target: 'attic' },
      ],
    },

    attic_hatbox: {
      title: 'The Hatbox',
      image: 'attic.png',
      desc: 'A photograph of a small child holding a wooden train. On the back, in your mother\'s handwriting: "Our beautiful boy, before."\n\nIt is you. You take it.',
      onEnter: { addItem: 'photo' },
      choices: [
        { label: 'Close the box', target: 'attic' },
      ],
    },

    // ---------------- DOWNSTAIRS ----------------
    staircase: {
      title: 'The Staircase',
      image: 'staircase.png',
      desc: 'Wood groans under your weight. From below, the smell of cold ash. The banister is sticky in places.',
      choices: [
        { label: 'Continue down', target: 'hallway_lower' },
        { label: 'Climb back up', target: 'hallway_upper' },
      ],
    },

    hallway_lower: {
      title: 'Downstairs Hallway',
      image: 'hallway_lower.png',
      desc: 'A black-and-white tile floor. Three archways. A heavy door at the back, painted the colour of dried blood, with an iron lock.',
      choices: [
        { label: 'Approach the white door', target: 'threshold', condition: s => s.memories.length >= 3 },
        { label: 'Enter the kitchen', target: 'kitchen' },
        { label: 'Enter the living room', target: 'living_room' },
        { label: 'Enter the study', target: 'study' },
        { label: 'Approach the locked back door', target: 'cellar_door' },
        { label: 'Step out into the garden', target: 'garden' },
        { label: 'Climb the staircase', target: 'staircase' },
      ],
    },

    kitchen: {
      title: 'The Kitchen',
      image: 'kitchen.png',
      desc: 'Fruit blackens in a bowl. Family photos lean against a tin of tea. In each photo, the people smile at someone who is not quite where you would be standing.',
      choices: [
        { label: 'Pick up a photograph', target: 'kitchen_photo', condition: s => !s.flags.sawKitchenPhoto },
        { label: 'Open the cutlery drawer', target: 'kitchen_drawer', condition: s => !s.inventory.includes('ring') },
        { label: 'Leave', target: 'hallway_lower' },
      ],
    },

    kitchen_photo: {
      title: 'The Photograph',
      image: 'kitchen.png',
      desc: 'A woman who looks like your mother holds a child who is not you. On the back, in her hand: "We are still keeping his place at the table."',
      onEnter: { setFlag: 'sawKitchenPhoto' },
      choices: [
        { label: 'Put it back', target: 'kitchen' },
      ],
    },

    kitchen_drawer: {
      title: 'The Drawer',
      image: 'kitchen.png',
      desc: 'Among the silverware: a wedding ring, dulled with age. Engraved inside, your name. You take it.',
      onEnter: { addItem: 'ring' },
      choices: [
        { label: 'Close the drawer', target: 'kitchen' },
      ],
    },

    living_room: {
      title: 'The Living Room',
      image: 'living_room.png',
      desc: 'A grey CRT television hisses to itself. The armchair has the shape of someone in it, though no one is.',
      choices: [
        { label: 'Watch the television', target: 'tv_watch', condition: s => !s.flags.sawHospital },
        { label: 'Take the VHS tape from the floor', target: 'living_vhs', condition: s => !s.inventory.includes('vhs') },
        { label: 'Sit in the armchair', target: 'ending_armchair' },
        { label: 'Leave', target: 'hallway_lower' },
      ],
    },

    tv_watch: {
      title: 'The Television',
      image: 'memory_hospital.png',
      desc: 'The static thins. A hospital room, filmed from above. A heart monitor. A person on the bed who has your hands. The line goes flat. The static returns. From far away, someone is weeping.',
      onEnter: { setFlag: 'sawHospital', addMemory: 'hospital' },
      choices: [
        { label: 'Step away', target: 'living_room' },
      ],
    },

    living_vhs: {
      title: 'The Tape',
      image: 'living_room.png',
      desc: 'A VHS tape. The label is in your handwriting: DO NOT WATCH AGAIN. You take it anyway.',
      onEnter: { addItem: 'vhs' },
      choices: [
        { label: 'Step back', target: 'living_room' },
      ],
    },

    ending_armchair: {
      type: 'ending',
      ending: 'forgotten',
      image: 'living_room.png',
      desc: 'You settle into the chair. It fits you exactly. It always has. The TV hums you to a sleep that has no other side.',
    },

    study: {
      title: 'The Study',
      image: 'study.png',
      desc: 'Bookshelves to the ceiling. A green-shaded lamp throws a small circle of warmth onto a leather desk. Loose pages, in your handwriting, lie scattered.',
      choices: [
        { label: 'Read the journal pages', target: 'study_read', condition: s => !s.flags.sawDeath },
        { label: 'Re-read the pages', target: 'study_reread', condition: s => s.flags.sawDeath },
        { label: 'Pull the red book from the shelf', target: 'study_book', condition: s => !s.flags.knowKnock },
        { label: 'Leave', target: 'hallway_lower' },
      ],
    },

    study_read: {
      title: 'The Journal',
      image: 'study.png',
      desc: 'The pages span years. The handwriting decays from neat to frantic.\n\nThe last entry: "I survived. They told me I survived. So why are the rooms always empty when I enter them. Why does no one set a plate for me."',
      onEnter: { addItem: 'journal', setFlag: 'sawDeath', addMemory: 'death' },
      choices: [
        { label: 'Pocket the pages', target: 'study' },
      ],
    },

    study_reread: {
      title: 'The Journal',
      image: 'study.png',
      desc: 'You already read these. You already know.',
      choices: [
        { label: 'Leave them', target: 'study' },
      ],
    },

    study_book: {
      title: 'The Red Book',
      image: 'study.png',
      desc: 'The book has no title. Inside, one sentence repeats for hundreds of pages: "It is not an exit if you do not knock first."',
      onEnter: { setFlag: 'knowKnock' },
      choices: [
        { label: 'Close it', target: 'study' },
      ],
    },

    cellar_door: {
      title: 'The Locked Door',
      image: 'cellar_door.png',
      desc: 'The door breathes. Slowly. As if something behind it is asleep.',
      choices: [
        { label: 'Use the iron key', target: 'cellar', condition: s => s.inventory.includes('cellar_key') },
        { label: 'Try the handle', target: 'cellar_door_try', condition: s => !s.inventory.includes('cellar_key') },
        { label: 'Step away', target: 'hallway_lower' },
      ],
    },

    cellar_door_try: {
      title: 'The Locked Door',
      image: 'cellar_door.png',
      desc: 'The handle does not turn. The lock is brass and very old. You will need a key.',
      choices: [
        { label: 'Step back', target: 'cellar_door' },
      ],
    },

    cellar: {
      title: 'The Cellar',
      image: 'cellar.png',
      desc: 'Stone steps down. Cold air. At the bottom the dark thickens — and in it, a shape that is taller than the room.',
      choices: [
        { label: 'Hold up the nightlight', target: 'cellar_light', condition: s => s.inventory.includes('nightlight') && !s.inventory.includes('threshold_key') },
        { label: 'You already have what you came for — back away', target: 'cellar_door', condition: s => s.inventory.includes('threshold_key') },
        { label: 'Approach the shape', target: 'cellar_approach' },
        { label: 'Retreat up the steps', target: 'cellar_door' },
      ],
    },

    cellar_approach: {
      type: 'ending',
      ending: 'watcher',
      image: 'watcher.png',
      desc: 'It is not a person. It is the shape of every life you should have had. It opens what should be a mouth. It is hungry, and it has waited.',
    },

    cellar_light: {
      title: 'The Cellar',
      image: 'cellar.png',
      desc: 'You raise the nightlight. The brass warms in your hand. The shape recoils — not gone, but held. Behind it, on a small shelf, a wooden box. Inside: a pale brass key, smaller than the iron one. The threshold key.',
      onEnter: { addItem: 'threshold_key' },
      choices: [
        { label: 'Back out slowly', target: 'cellar_door' },
      ],
    },

    garden: {
      title: 'The Garden',
      image: 'garden.png',
      desc: 'The grass is the colour of grass. The trees are the shape of trees. None of them cast shadows. At the back, a glass house, half-collapsed.',
      choices: [
        { label: 'Walk to the greenhouse', target: 'greenhouse' },
        { label: 'Step out onto the lawn', target: 'garden_lawn' },
        { label: 'Go back inside', target: 'hallway_lower' },
      ],
    },

    garden_lawn: {
      title: 'The Lawn',
      image: 'garden.png',
      desc: 'You step into the centre. The ground gives slightly, like skin. You realise the house casts no shadow either. Something is watching from a window that should not be on the back wall.',
      choices: [
        { label: 'Wave at it', target: 'ending_window' },
        { label: 'Run back inside', target: 'hallway_lower' },
        { label: 'Continue to the greenhouse', target: 'greenhouse' },
      ],
    },

    greenhouse: {
      title: 'The Greenhouse',
      image: 'greenhouse.png',
      desc: 'Every plant inside is dead, kept upright by the wires that once trained them. On a workbench: gloves, shears, and an iron key the size of your palm.',
      choices: [
        { label: 'Take the iron key', target: 'greenhouse_key', condition: s => !s.inventory.includes('cellar_key') },
        { label: 'Look at the dead roses', target: 'greenhouse_rose' },
        { label: 'Leave', target: 'garden' },
      ],
    },

    greenhouse_key: {
      title: 'The Iron Key',
      image: 'greenhouse.png',
      desc: 'It is heavier than its size. The teeth are worn from one lock used many times. The cellar key.',
      onEnter: { addItem: 'cellar_key' },
      choices: [
        { label: 'Pocket it', target: 'greenhouse' },
      ],
    },

    greenhouse_rose: {
      title: 'The Roses',
      image: 'greenhouse.png',
      desc: 'They are dead, but their colour has not faded — as if the colour is what is keeping them upright.',
      choices: [
        { label: 'Step back', target: 'greenhouse' },
      ],
    },

    // ---------------- THRESHOLD ----------------
    threshold: {
      title: 'The White Door',
      image: 'threshold.png',
      desc: 'A door that was not in the hallway before. White. Warm. A small brass keyhole at its centre. From the other side, very faintly, voices you have always known.',
      choices: [
        { label: 'Knock first', target: 'threshold_knock', condition: s => s.flags.knowKnock && s.inventory.includes('threshold_key') },
        { label: 'Use the threshold key', target: 'threshold_open_unknock', condition: s => !s.flags.knowKnock && s.inventory.includes('threshold_key') },
        { label: 'Push the door anyway', target: 'ending_lost_in_light', condition: s => !s.inventory.includes('threshold_key') },
        { label: 'Step away', target: 'hallway_lower' },
      ],
    },

    threshold_knock: {
      title: 'You Knock',
      image: 'threshold.png',
      desc: 'Three soft knocks. The door opens for you. Into it walk a person who looks like you, and a child who looks like the photograph. They take your hands.',
      choices: [
        { label: 'Show the locket', target: 'ending_acceptance', condition: s => s.inventory.includes('locket') && s.inventory.includes('photo') && s.inventory.includes('journal') },
        { label: 'Step through with what you have', target: 'ending_unfinished' },
        { label: 'Step back', target: 'hallway_lower' },
      ],
    },

    threshold_open_unknock: {
      title: 'The Door Unbarred',
      image: 'threshold.png',
      desc: 'The key turns. The door swings inward, but you have not knocked. The light is colder than you expected.',
      choices: [
        { label: 'Step through', target: 'ending_lost_in_light' },
        { label: 'Close it and step back', target: 'hallway_lower' },
      ],
    },

    ending_acceptance: {
      type: 'ending',
      ending: 'acceptance',
      image: 'threshold.png',
      desc: 'You hold up the locket. Inside: the same child from the photograph. You remember the rain. You remember the headlights. You remember the soft voices around the bed who told you it was alright to go.\n\nYou were never trapped here. You were waiting until you were ready.\n\nYou are ready.',
    },

    ending_unfinished: {
      type: 'ending',
      ending: 'unfinished',
      image: 'threshold.png',
      desc: 'You step through, but you have left pieces of yourself behind in the rooms. The light closes over you like water over a stone. Somewhere in the house, a door clicks shut.',
    },

    ending_lost_in_light: {
      type: 'ending',
      ending: 'unfinished',
      image: 'threshold.png',
      desc: 'You did not knock. The light takes you on its own terms. The house keeps the rest of what you were.',
    },
  },
};
