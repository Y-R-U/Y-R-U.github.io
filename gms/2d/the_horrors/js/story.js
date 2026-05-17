(function () {
  // ── Rooms ────────────────────────────────────────────────────────────────
  // Every non-hub room exits ONLY to the hallway. The hallway connects to all
  // rooms. This caps the transition video count at 2 × rooms.
  const rooms = {
    bedroom: {
      id: "bedroom",
      name: "Bedroom",
      kind: "sleeping",
      canStart: true,
      poster: "images/bedroom.jpg",
      idleVideo: "videos/bedroom_to_hallway.mp4",
      toHallway: "videos/bedroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_bedroom.mp4",
      text: "You wake in a small bed under thin sheets. The window across the room is open just enough for the curtain to move. Something nearby has your name written on it.",
    },
    bathroom: {
      id: "bathroom",
      name: "Bathroom",
      kind: "bath_like",
      poster: "images/bathroom.jpg",
      idleVideo: "videos/bathroom_to_hallway.mp4",
      toHallway: "videos/bathroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_bathroom.mp4",
      text: "Square white tiles, a basin under a square mirror, a tub with the curtain partway drawn. The tap drips on a count you can almost recognise.",
    },
    cellar: {
      id: "cellar",
      name: "Cellar",
      kind: "storage_like",
      canStart: true,
      poster: "images/cellar.jpg",
      idleVideo: "videos/cellar_to_hallway.mp4",
      toHallway: "videos/cellar_to_hallway.mp4",
      fromHallway: "videos/hallway_to_cellar.mp4",
      text: "Steps down end at a single bulb. The shelves were stocked by someone who knew the building would outlive them.",
    },
    kitchen: {
      id: "kitchen",
      name: "Kitchen",
      kind: "kitchen_like",
      poster: "images/kitchen.jpg",
      idleVideo: "videos/kitchen_to_hallway.mp4",
      toHallway: "videos/kitchen_to_hallway.mp4",
      fromHallway: "videos/hallway_to_kitchen.mp4",
      text: "An enamel sink, a kettle no one set down. A single chair pushed in as if the cook left to check the front door and never came back.",
    },
    study: {
      id: "study",
      name: "Study",
      kind: "study_like",
      canStart: true,
      poster: "images/study.jpg",
      idleVideo: "videos/study_to_hallway.mp4",
      toHallway: "videos/study_to_hallway.mp4",
      fromHallway: "videos/hallway_to_study.mp4",
      text: "A heavy desk, a lit oil lamp warm to the touch though the wick should be dead by now. The chair is pulled out as if you were sitting here a moment ago.",
    },
    attic: {
      id: "attic",
      name: "Attic",
      kind: "storage_like",
      poster: "images/attic.jpg",
      idleVideo: "videos/attic_to_hallway.mp4",
      toHallway: "videos/attic_to_hallway.mp4",
      fromHallway: "videos/hallway_to_attic.mp4",
      text: "Beams sloping in. A round window the colour of cold water. Dust-sheeted shapes that hold their breath when you do.",
    },
    dining_room: {
      id: "dining_room",
      name: "Dining Room",
      kind: "kitchen_like",
      poster: "images/dining_room.jpg",
      idleVideo: "videos/dining_room_to_hallway.mp4",
      toHallway: "videos/dining_room_to_hallway.mp4",
      fromHallway: "videos/hallway_to_dining_room.mp4",
      text: "A long table set for six who never arrived. The candelabra in the centre has not been lit in a long time. The plates are clean.",
    },
    library: {
      id: "library",
      name: "Library",
      kind: "study_like",
      canStart: true,
      poster: "images/library.jpg",
      idleVideo: "videos/library_to_hallway.mp4",
      toHallway: "videos/library_to_hallway.mp4",
      fromHallway: "videos/hallway_to_library.mp4",
      text: "Tall dark shelves of books no one has opened recently. An armchair faces the unlit fire. A single book is left face down on the side table — your place, kept.",
    },
    parlour: {
      id: "parlour",
      name: "Parlour",
      kind: "sleeping",
      canStart: true,
      poster: "images/parlour.jpg",
      idleVideo: "videos/parlour_to_hallway.mp4",
      toHallway: "videos/parlour_to_hallway.mp4",
      fromHallway: "videos/hallway_to_parlour.mp4",
      text: "A low couch, a small table with one empty teacup. The wall clock is silent — the pendulum hangs as if it had forgotten which way to swing.",
    },
    storeroom: {
      id: "storeroom",
      name: "Storeroom",
      kind: "storage_like",
      poster: "images/storeroom.jpg",
      idleVideo: "videos/storeroom_to_hallway.mp4",
      toHallway: "videos/storeroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_storeroom.mp4",
      text: "Shelves crowded with old boxes, folded linens, wrapped objects. Sheets cover taller shapes at the back. The bulb above buzzes faintly.",
    },
    conservatory: {
      id: "conservatory",
      name: "Conservatory",
      kind: "wild",
      poster: "images/conservatory.jpg",
      idleVideo: "videos/conservatory_to_hallway.mp4",
      toHallway: "videos/conservatory_to_hallway.mp4",
      fromHallway: "videos/hallway_to_conservatory.mp4",
      text: "Cold pale light through arched glass. Ferns in plain pots. A wicker chair beside an empty glass. Frost is still tracing the lower panes even though the door from the hallway is warm.",
    },
    // ── Expansion rooms (v0.3) — sleeping variants. All canStart so the
    // wake-up location varies wildly run to run.
    master_bedroom: {
      id: "master_bedroom",
      name: "Master Bedroom",
      kind: "sleeping",
      canStart: true,
      poster: "images/master_bedroom.jpg",
      idleVideo: "videos/master_bedroom_to_hallway.mp4",
      toHallway: "videos/master_bedroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_master_bedroom.mp4",
      text: "A wide four-poster bed under a heavy canopy. Twin armchairs face an unlit fire. The dressing table mirror is turned to the wall.",
    },
    childs_bedroom: {
      id: "childs_bedroom",
      name: "Child's Bedroom",
      kind: "sleeping",
      canStart: true,
      poster: "images/childs_bedroom.jpg",
      idleVideo: "videos/childs_bedroom_to_hallway.mp4",
      toHallway: "videos/childs_bedroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_childs_bedroom.mp4",
      text: "A small bed under a quilted patchwork. A rocking horse rests at the end of its rail. The wallpaper carries a faded animal alphabet — one letter has been scratched out.",
    },
    elegant_bedroom: {
      id: "elegant_bedroom",
      name: "Elegant Bedroom",
      kind: "sleeping",
      canStart: true,
      poster: "images/elegant_bedroom.jpg",
      idleVideo: "videos/elegant_bedroom_to_hallway.mp4",
      toHallway: "videos/elegant_bedroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_elegant_bedroom.mp4",
      text: "Damask wallpaper, brass fittings polished long ago. A silk dressing gown still draped on the chair as if to be put on any moment. Two glasses on the bedside table — only one was emptied.",
    },
    servants_quarters: {
      id: "servants_quarters",
      name: "Servants' Quarters",
      kind: "sleeping",
      canStart: true,
      poster: "images/servants_quarters.jpg",
      idleVideo: "videos/servants_quarters_to_hallway.mp4",
      toHallway: "videos/servants_quarters_to_hallway.mp4",
      fromHallway: "videos/hallway_to_servants_quarters.mp4",
      text: "Three plain cots, three foot-lockers, three sets of folded uniforms. Only one cot is unmade — and the boots beside it are turned the wrong way for someone leaving.",
    },
    nursery: {
      id: "nursery",
      name: "Nursery",
      kind: "sleeping",
      canStart: true,
      poster: "images/nursery.jpg",
      idleVideo: "videos/nursery_to_hallway.mp4",
      toHallway: "videos/nursery_to_hallway.mp4",
      fromHallway: "videos/hallway_to_nursery.mp4",
      text: "A wicker bassinet, recently rocked. A wooden mobile turns by itself, very slowly. The lullaby music box on the shelf is wound but not playing.",
    },
    // ── Bathing rooms — three variants. bath_like.
    elegant_bathroom: {
      id: "elegant_bathroom",
      name: "Elegant Bathroom",
      kind: "bath_like",
      poster: "images/elegant_bathroom.jpg",
      idleVideo: "videos/elegant_bathroom_to_hallway.mp4",
      toHallway: "videos/elegant_bathroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_elegant_bathroom.mp4",
      text: "Marble basin, brass swan taps, a deep clawfoot tub draped with a fresh white towel. The folded towel is still warm. The mirror is fogged from the inside.",
    },
    red_bathroom: {
      id: "red_bathroom",
      name: "Red Bathroom",
      kind: "bath_like",
      poster: "images/red_bathroom.jpg",
      idleVideo: "videos/red_bathroom_to_hallway.mp4",
      toHallway: "videos/red_bathroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_red_bathroom.mp4",
      text: "Deep oxblood-painted walls and a dim red-glass lamp. The mirror gives back too little of the room. The tap whistles, then stops, then whistles again on a different count.",
    },
    bloody_bathroom: {
      id: "bloody_bathroom",
      name: "Bloody Bathroom",
      kind: "bath_like",
      poster: "images/bloody_bathroom.jpg",
      idleVideo: "videos/bloody_bathroom_to_hallway.mp4",
      toHallway: "videos/bloody_bathroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_bloody_bathroom.mp4",
      text: "Dried dark stains run down the white tiles and pool around the drain. The tub holds a few inches of murky water. The room was washed, but not for long enough.",
    },
    // ── Kitchen-likes.
    butlers_kitchen: {
      id: "butlers_kitchen",
      name: "Butler's Kitchen",
      kind: "kitchen_like",
      poster: "images/butlers_kitchen.jpg",
      idleVideo: "videos/butlers_kitchen_to_hallway.mp4",
      toHallway: "videos/butlers_kitchen_to_hallway.mp4",
      fromHallway: "videos/hallway_to_butlers_kitchen.mp4",
      text: "A narrow prep kitchen lined with polished silverware racks and a hanging row of copper pans. A leather notebook of menus lies open on the bench, marked for tonight.",
    },
    grand_dining_hall: {
      id: "grand_dining_hall",
      name: "Grand Dining Hall",
      kind: "kitchen_like",
      poster: "images/grand_dining_hall.jpg",
      idleVideo: "videos/grand_dining_hall_to_hallway.mp4",
      toHallway: "videos/grand_dining_hall_to_hallway.mp4",
      fromHallway: "videos/hallway_to_grand_dining_hall.mp4",
      text: "A long polished table set for twelve. A chandelier draped in unlit candles hangs low. At one end, a single half-empty wine glass, the lip print fresh.",
    },
    pantry: {
      id: "pantry",
      name: "Pantry",
      kind: "storage_like",
      poster: "images/pantry.jpg",
      idleVideo: "videos/pantry_to_hallway.mp4",
      toHallway: "videos/pantry_to_hallway.mp4",
      fromHallway: "videos/hallway_to_pantry.mp4",
      text: "Floor-to-ceiling shelves of preserves and dried goods, labelled in a careful hand. One jar is missing from a row of identical jars; its outline still in the dust.",
    },
    // ── Lounges, music & games. Several canStart (couches available).
    music_room: {
      id: "music_room",
      name: "Music Room",
      kind: "lounge_like",
      canStart: true,
      poster: "images/music_room.jpg",
      idleVideo: "videos/music_room_to_hallway.mp4",
      toHallway: "videos/music_room_to_hallway.mp4",
      fromHallway: "videos/hallway_to_music_room.mp4",
      text: "A baby grand piano lid raised, sheet music open to a page no one is playing. A velvet daybed against the wall. The metronome on the piano ticks at a pace nobody set.",
    },
    billiard_room: {
      id: "billiard_room",
      name: "Billiard Room",
      kind: "lounge_like",
      canStart: true,
      poster: "images/billiard_room.jpg",
      idleVideo: "videos/billiard_room_to_hallway.mp4",
      toHallway: "videos/billiard_room_to_hallway.mp4",
      fromHallway: "videos/hallway_to_billiard_room.mp4",
      text: "A green-felted billiard table with the cues still in the rack. Three balls are arranged for an interrupted shot. A leather chesterfield sofa against the back wall.",
    },
    smoking_room: {
      id: "smoking_room",
      name: "Smoking Room",
      kind: "lounge_like",
      canStart: true,
      poster: "images/smoking_room.jpg",
      idleVideo: "videos/smoking_room_to_hallway.mp4",
      toHallway: "videos/smoking_room_to_hallway.mp4",
      fromHallway: "videos/hallway_to_smoking_room.mp4",
      text: "Dark wood panels, two leather wingbacks, and a low table with a glass ashtray. A cigar in the ashtray is still warm. The air sits heavy and sweet.",
    },
    // ── Study-likes.
    portrait_gallery: {
      id: "portrait_gallery",
      name: "Portrait Gallery",
      kind: "study_like",
      poster: "images/portrait_gallery.jpg",
      idleVideo: "videos/portrait_gallery_to_hallway.mp4",
      toHallway: "videos/portrait_gallery_to_hallway.mp4",
      fromHallway: "videos/hallway_to_portrait_gallery.mp4",
      text: "A long room of family portraits, faces lit by gilt-framed sconces. The portrait at the far end has been turned to face the wall. The frame is the right size for you.",
    },
    chapel: {
      id: "chapel",
      name: "Chapel",
      kind: "study_like",
      poster: "images/chapel.jpg",
      idleVideo: "videos/chapel_to_hallway.mp4",
      toHallway: "videos/chapel_to_hallway.mp4",
      fromHallway: "videos/hallway_to_chapel.mp4",
      text: "A small private chapel, six wooden pews and a plain altar. A single candle burns on the altar — wick fresh. The kneeler in the front pew shows the marks of recent use.",
    },
    // ── Storage-likes.
    wine_cellar: {
      id: "wine_cellar",
      name: "Wine Cellar",
      kind: "storage_like",
      poster: "images/wine_cellar.jpg",
      idleVideo: "videos/wine_cellar_to_hallway.mp4",
      toHallway: "videos/wine_cellar_to_hallway.mp4",
      fromHallway: "videos/hallway_to_wine_cellar.mp4",
      text: "Rows of dark bottles in stone alcoves, the air thirty years older than the house. A small stool, a single empty glass, a ledger of vintages with one entry crossed out.",
    },
    linen_closet: {
      id: "linen_closet",
      name: "Linen Closet",
      kind: "storage_like",
      poster: "images/linen_closet.jpg",
      idleVideo: "videos/linen_closet_to_hallway.mp4",
      toHallway: "videos/linen_closet_to_hallway.mp4",
      fromHallway: "videos/hallway_to_linen_closet.mp4",
      text: "Floor-to-ceiling shelves of folded sheets and pillowcases, each pile tied with ribbon. One ribbon is fresh; one pile has been unfolded and refolded with less care.",
    },
    // ── Outdoor / wild.
    greenhouse: {
      id: "greenhouse",
      name: "Greenhouse",
      kind: "wild",
      poster: "images/greenhouse.jpg",
      idleVideo: "videos/greenhouse_to_hallway.mp4",
      toHallway: "videos/greenhouse_to_hallway.mp4",
      fromHallway: "videos/hallway_to_greenhouse.mp4",
      text: "Long benches of seedling trays under cracked panes. A trowel still wet beside an unfinished pot. One plant has grown crookedly toward the door, not the light.",
    },
    hallway: {
      id: "hallway",
      name: "Central Hallway",
      kind: "hallway",
      poster: "images/hallway.jpg",
      idleVideo: "videos/hallway_to_bedroom.mp4",
      text: "A long corridor of plain walls. A few framed pictures the building forgot why it kept. Doors that close themselves softly when you turn your back.",
    },
  };

  // ── Procedural pickers ───────────────────────────────────────────────────
  // Visuals are intentionally diegesis-neutral so a single asset set can serve
  // hospital / asylum / haunted house runs. Per-run flavour comes from the
  // random selections below.
  const locations = [
    "Hospital",
    "Asylum",
    "Manor",
    "Boarding House",
    "Orphanage",
    "Sanitarium",
    "Country House",
    "Mountain Lodge",
  ];

  const facilityNames = [
    "Blackwell",
    "Saint Mary's",
    "Carrington",
    "Hollowbrook",
    "Whitlock",
    "Ashfield",
    "Marrow Hill",
    "Thornwood",
    "Greyfold",
    "Veylan",
    "Holcombe",
    "Shrike House",
    "Ravenrest",
    "Linmoor",
    "Kelvern",
    "Dunbarrow",
    "Wickfield",
    "Old Anson",
    "Pale Hollow",
    "Mire End",
  ];

  const playerNames = [
    "Margaret Hale",
    "Thomas Quill",
    "Elsie Voss",
    "Daniel Crane",
    "Iris Penn",
    "Walter Ashe",
    "Cora Linden",
    "Henry Vale",
    "Adelaide Brun",
    "Edmund Marsh",
  ];

  const threats = [
    {
      id: "pale_woman",
      name: "the pale woman",
      label: "presence detected",
      clue: "She is taller in the dark and wears the same nightgown each time you forget her name.",
    },
    {
      id: "lost_child",
      name: "the lost child",
      label: "small footsteps",
      clue: "A small voice keeps asking whose room this used to be.",
    },
    {
      id: "previous_tenant",
      name: "the previous tenant",
      label: "old occupant",
      clue: "They moved out without taking their reflection with them.",
    },
    {
      id: "white_shadow",
      name: "the white shadow",
      label: "thin silhouette",
      clue: "It only appears in light. It only stops in darkness.",
    },
    {
      id: "silent_companion",
      name: "the silent companion",
      label: "unseen guest",
      clue: "They will sit beside you in any chair you leave warm.",
    },
    {
      id: "hollow_one",
      name: "the hollow one",
      label: "faceless caller",
      clue: "Their face is the room they were last seen in.",
    },
    // ── Expansion v0.3 — six more.
    {
      id: "faceless_doctor",
      name: "the faceless doctor",
      label: "white coat",
      clue: "The doctor's notes are clean and current. The doctor has no face above the collar.",
    },
    {
      id: "bone_collector",
      name: "the bone collector",
      label: "small bag",
      clue: "A polite figure with a leather bag. They will ask if anything in here is yours.",
    },
    {
      id: "crawling_thing",
      name: "the crawling thing",
      label: "low movement",
      clue: "It moves only along the floor and only when no one is watching the floor.",
    },
    {
      id: "mourning_groom",
      name: "the mourning groom",
      label: "groom in black",
      clue: "He waits at the foot of the stairs in a black suit. He has been waiting for someone other than you.",
    },
    {
      id: "paper_mask",
      name: "the paper mask",
      label: "paper face",
      clue: "A figure who covers their face with a folded sheet of paper. The face under the paper is whichever face you last saw on the paper.",
    },
    {
      id: "red_lady",
      name: "the red lady",
      label: "red dress",
      clue: "A tall woman in a red dress that is never quite where she stands. She steps out of her dress when she steps out of the room.",
    },
  ];

  // roomCount caps how many rooms appear in any single run (always
  // clamped to the number actually defined in rooms{}). groupCount is
  // how many task chains get placed at run start.
  const difficulties = {
    easy:   { label: "Easy",   range: [100, 120], visibleGoals: 4, roomCount: 8,  groupCount: 1 },
    medium: { label: "Medium", range: [90, 110],  visibleGoals: 2, roomCount: 10, groupCount: 2 },
    hard:   { label: "Hard",   range: [70, 92],   visibleGoals: 1, roomCount: 12, groupCount: 3 },
  };

  const gameNames = [
    "The Horrors",
    "The White Hall",
    "What Came Back",
    "The Door Between",
    "Counted Steps",
    "The Other Hours",
    "Underneath The Lamp",
    "Whose Room",
  ];

  const goalPool = [
    { id: "identity", text: "Recover your name from a personal item.", requires: "identity", core: true },
    { id: "map", text: "Find a sketch of the building's layout.", requires: "map", core: true },
    { id: "escape", text: "Reach the front door at the end of the hallway.", requires: "escape", core: true },
    { id: "letter", text: "Find the unsent letter left on the writing desk.", requires: "letter" },
    { id: "chart", text: "Read the chart left in the cellar.", requires: "chart" },
    { id: "mirror", text: "Cover the bathroom mirror.", requires: "mirror" },
  ];

  // ── Transition + event metadata (drives the debug panel) ─────────────────
  const transitions = [
    {
      id: "bedroom_to_hallway",
      group: "room_transitions",
      label: "bedroom to hallway",
      file: "bedroom_to_hallway.mp4",
      src: "videos/bedroom_to_hallway.mp4",
      poster: "images/bedroom.jpg",
      startImage: "images/bedroom.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves a plain bedroom, passes through the only door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_bedroom",
      group: "room_transitions",
      label: "bedroom from hallway",
      file: "hallway_to_bedroom.mp4",
      src: "videos/hallway_to_bedroom.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/bedroom.jpg",
      promptText: "camera moves from the central hallway through a wooden door and ends inside a plain bedroom",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "bathroom_to_hallway",
      group: "room_transitions",
      label: "bathroom to hallway",
      file: "bathroom_to_hallway.mp4",
      src: "videos/bathroom_to_hallway.mp4",
      poster: "images/bathroom.jpg",
      startImage: "images/bathroom.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves a small white-tiled bathroom, passes through the only door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_bathroom",
      group: "room_transitions",
      label: "bathroom from hallway",
      file: "hallway_to_bathroom.mp4",
      src: "videos/hallway_to_bathroom.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/bathroom.jpg",
      promptText: "camera moves from the central hallway through a wooden door and ends inside a small white-tiled bathroom",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "cellar_to_hallway",
      group: "room_transitions",
      label: "cellar to hallway",
      file: "cellar_to_hallway.mp4",
      src: "videos/cellar_to_hallway.mp4",
      poster: "images/cellar.jpg",
      startImage: "images/cellar.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera climbs the steps out of a dim cellar, passes through the only door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_cellar",
      group: "room_transitions",
      label: "cellar from hallway",
      file: "hallway_to_cellar.mp4",
      src: "videos/hallway_to_cellar.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/cellar.jpg",
      promptText: "camera moves from the central hallway through a wooden door and descends a staircase into a dim cellar",
      status: "New 3.04s intended transition. Needs review.",
    },
  ];

  // ── v0.2 spoke rooms (8 more rooms × 2 transitions each) ───────────────
  // Generated by gen_transitions.py with seeds 241..312 and the prompts in
  // regen_config.json. Kept compact here — debug-panel rendering uses
  // transition.id / .file / .src / .startImage / .endImage / .promptText.
  const v02Spokes = [
    ["kitchen", "Kitchen"],
    ["study", "Study"],
    ["attic", "Attic"],
    ["dining_room", "Dining Room"],
    ["library", "Library"],
    ["parlour", "Parlour"],
    ["storeroom", "Storeroom"],
    ["conservatory", "Conservatory"],
  ];
  // v0.3 expansion — 19 new rooms (named variants + new types). Same
  // auto-registration pattern: transitions + manifest both fall out.
  const v03Spokes = [
    ["master_bedroom",    "Master Bedroom"],
    ["childs_bedroom",    "Child's Bedroom"],
    ["elegant_bedroom",   "Elegant Bedroom"],
    ["servants_quarters", "Servants' Quarters"],
    ["nursery",           "Nursery"],
    ["elegant_bathroom",  "Elegant Bathroom"],
    ["red_bathroom",      "Red Bathroom"],
    ["bloody_bathroom",   "Bloody Bathroom"],
    ["butlers_kitchen",   "Butler's Kitchen"],
    ["grand_dining_hall", "Grand Dining Hall"],
    ["pantry",            "Pantry"],
    ["music_room",        "Music Room"],
    ["billiard_room",     "Billiard Room"],
    ["smoking_room",      "Smoking Room"],
    ["portrait_gallery",  "Portrait Gallery"],
    ["chapel",            "Chapel"],
    ["wine_cellar",       "Wine Cellar"],
    ["linen_closet",      "Linen Closet"],
    ["greenhouse",        "Greenhouse"],
  ];
  const allSpokes = v02Spokes.concat(v03Spokes);
  allSpokes.forEach(([roomId, displayName]) => {
    transitions.push({
      id: `${roomId}_to_hallway`,
      group: "room_transitions",
      label: `${roomId} to hallway`,
      file: `${roomId}_to_hallway.mp4`,
      src: `videos/${roomId}_to_hallway.mp4`,
      poster: `images/${roomId}.jpg`,
      startImage: `images/${roomId}.jpg`,
      endImage: "images/hallway.jpg",
      promptText: `camera leaves the ${displayName.toLowerCase()}, passes through the only wooden door, and ends in the long central hallway`,
      status: "Generated 3.04s intended transition. Needs review.",
    });
    transitions.push({
      id: `hallway_to_${roomId}`,
      group: "room_transitions",
      label: `${roomId} from hallway`,
      file: `hallway_to_${roomId}.mp4`,
      src: `videos/hallway_to_${roomId}.mp4`,
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: `images/${roomId}.jpg`,
      promptText: `camera moves from the central hallway through a wooden door and ends inside the ${displayName.toLowerCase()}`,
      status: "Generated 3.04s intended transition. Needs review.",
    });
  });

  const introPlaylist = [
    transitions[1], // hallway_to_bedroom
    transitions[3], // hallway_to_bathroom
    transitions[5], // hallway_to_cellar
  ];

  // Per-threat clips. eventVideoFor() in game.js picks group[state.threat.id]
  // first, then falls back to group.default — so missing per-threat clips
  // gracefully reuse the pale_woman default until generation completes.
  const eventVideos = {
    release: {
      default: "videos/monster_release_pale_woman.mp4",
      pale_woman: "videos/monster_release_pale_woman.mp4",
      lost_child: "videos/monster_release_lost_child.mp4",
      previous_tenant: "videos/monster_release_previous_tenant.mp4",
      white_shadow: "videos/monster_release_white_shadow.mp4",
      silent_companion: "videos/monster_release_silent_companion.mp4",
      hollow_one: "videos/monster_release_hollow_one.mp4",
      faceless_doctor: "videos/monster_release_faceless_doctor.mp4",
      bone_collector: "videos/monster_release_bone_collector.mp4",
      crawling_thing: "videos/monster_release_crawling_thing.mp4",
      mourning_groom: "videos/monster_release_mourning_groom.mp4",
      paper_mask: "videos/monster_release_paper_mask.mp4",
      red_lady: "videos/monster_release_red_lady.mp4",
    },
    attack: {
      default: "videos/monster_attack_pale_woman.mp4",
      pale_woman: "videos/monster_attack_pale_woman.mp4",
      lost_child: "videos/monster_attack_lost_child.mp4",
      previous_tenant: "videos/monster_attack_previous_tenant.mp4",
      white_shadow: "videos/monster_attack_white_shadow.mp4",
      silent_companion: "videos/monster_attack_silent_companion.mp4",
      hollow_one: "videos/monster_attack_hollow_one.mp4",
      faceless_doctor: "videos/monster_attack_faceless_doctor.mp4",
      bone_collector: "videos/monster_attack_bone_collector.mp4",
      crawling_thing: "videos/monster_attack_crawling_thing.mp4",
      mourning_groom: "videos/monster_attack_mourning_groom.mp4",
      paper_mask: "videos/monster_attack_paper_mask.mp4",
      red_lady: "videos/monster_attack_red_lady.mp4",
    },
    endings: {
      window: "videos/ending_window.mp4",
      caught: "videos/monster_attack_pale_woman.mp4",
      // Success endings (one per plausible escape route). game.renderEnding
      // picks by state.escapeRoom when set; otherwise rotates for variety.
      escape: {
        default: "videos/ending_escape_front_door.mp4",
        wine_cellar: "videos/ending_escape_wine_cellar_tunnel.mp4",
        attic: "videos/ending_escape_attic_rescue.mp4",
        greenhouse: "videos/ending_escape_greenhouse_smash.mp4",
        chapel: "videos/ending_escape_chapel_sanctuary.mp4",
      },
    },
  };

  transitions.forEach(transition => {
    if (transition.group === "room_transitions" && typeof transition.trimEnd !== "number") {
      transition.trimStart = 0;
      transition.trimEnd = 3.04;
    }
  });

  const mediaManifest = [
    { type: "image", src: "images/bedroom.jpg", required: true, label: "Bedroom still" },
    { type: "image", src: "images/hallway.jpg", required: true, label: "Hallway still" },
    { type: "image", src: "images/bathroom.jpg", required: false, label: "Bathroom still" },
    { type: "image", src: "images/cellar.jpg", required: false, label: "Cellar still" },
    { type: "video", src: "videos/bedroom_to_hallway.mp4", required: true, label: "bedroom to hallway transition" },
    { type: "video", src: "videos/hallway_to_bedroom.mp4", required: true, label: "bedroom from hallway transition" },
    { type: "video", src: "videos/bathroom_to_hallway.mp4", required: false, label: "bathroom to hallway transition" },
    { type: "video", src: "videos/hallway_to_bathroom.mp4", required: false, label: "bathroom from hallway transition" },
    { type: "video", src: "videos/cellar_to_hallway.mp4", required: false, label: "cellar to hallway transition" },
    { type: "video", src: "videos/hallway_to_cellar.mp4", required: false, label: "cellar from hallway transition" },
    { type: "video", src: "videos/monster_release_pale_woman.mp4", required: false, label: "pale woman release" },
    { type: "video", src: "videos/monster_attack_pale_woman.mp4", required: false, label: "pale woman attack" },
    { type: "video", src: "videos/monster_release_lost_child.mp4", required: false, label: "lost child release" },
    { type: "video", src: "videos/monster_attack_lost_child.mp4", required: false, label: "lost child attack" },
    { type: "video", src: "videos/monster_release_previous_tenant.mp4", required: false, label: "previous tenant release" },
    { type: "video", src: "videos/monster_attack_previous_tenant.mp4", required: false, label: "previous tenant attack" },
    { type: "video", src: "videos/monster_release_white_shadow.mp4", required: false, label: "white shadow release" },
    { type: "video", src: "videos/monster_attack_white_shadow.mp4", required: false, label: "white shadow attack" },
    { type: "video", src: "videos/monster_release_silent_companion.mp4", required: false, label: "silent companion release" },
    { type: "video", src: "videos/monster_attack_silent_companion.mp4", required: false, label: "silent companion attack" },
    { type: "video", src: "videos/monster_release_hollow_one.mp4", required: false, label: "hollow one release" },
    { type: "video", src: "videos/monster_attack_hollow_one.mp4", required: false, label: "hollow one attack" },
    { type: "video", src: "videos/ending_window.mp4", required: false, label: "bedroom window ending" },
    { type: "video", src: "videos/ending_escape_front_door.mp4", required: false, label: "front door escape ending" },
    { type: "video", src: "videos/ending_escape_wine_cellar_tunnel.mp4", required: false, label: "wine cellar tunnel escape ending" },
    { type: "video", src: "videos/ending_escape_attic_rescue.mp4", required: false, label: "attic rescue escape ending" },
    { type: "video", src: "videos/ending_escape_greenhouse_smash.mp4", required: false, label: "greenhouse smash escape ending" },
    { type: "video", src: "videos/ending_escape_chapel_sanctuary.mp4", required: false, label: "chapel sanctuary escape ending" },
  ];

  // ── v0.2 + v0.3 spoke media (added in code so the room list above stays
  // the single source of truth) ────────────────────────────────────────
  allSpokes.forEach(([roomId, displayName]) => {
    mediaManifest.push({ type: "image", src: `images/${roomId}.jpg`, required: false, label: `${displayName} still` });
    mediaManifest.push({ type: "video", src: `videos/${roomId}_to_hallway.mp4`, required: false, label: `${roomId} to hallway transition` });
    mediaManifest.push({ type: "video", src: `videos/hallway_to_${roomId}.mp4`, required: false, label: `${roomId} from hallway transition` });
  });
  // v0.3 expansion monsters — release + attack clips for each new threat.
  const v03Monsters = ["faceless_doctor", "bone_collector", "crawling_thing", "mourning_groom", "paper_mask", "red_lady"];
  v03Monsters.forEach(monsterId => {
    const display = monsterId.replace(/_/g, " ");
    mediaManifest.push({ type: "video", src: `videos/monster_release_${monsterId}.mp4`, required: false, label: `${display} release` });
    mediaManifest.push({ type: "video", src: `videos/monster_attack_${monsterId}.mp4`, required: false, label: `${display} attack` });
  });

  // ── Per-room actions ─────────────────────────────────────────────────────
  const actions = {
    bedroom: [
      {
        id: "read_diary",
        label: "Open the bedside drawer",
        side: "sub",
        hint: "identity",
        turns: 1,
        once: true,
        run(state) {
          state.flags.identity = true;
          state.playerRevealed = true;
          addUnique(state.inventory, `${state.playerName}'s diary`);
          return `A small leather diary, your name in faded ink: ${state.playerName}.`;
        },
      },
      {
        id: "read_letter",
        label: "Read the desk letter",
        side: "sub",
        hint: "letter",
        turns: 1,
        once: true,
        run(state) {
          state.flags.letter = true;
          addUnique(state.inventory, "Unsent letter");
          return "An unfinished letter. Whoever wrote it stopped halfway through your name.";
        },
      },
      {
        id: "look_window",
        label: "Look out the window",
        side: "sub",
        hint: "watch",
        turns: 1,
        look: true,
        lookVideo: "videos/look_bedroom_window.mp4",
        run(state) {
          state.threatPressure += 1;
          return "Outside, the garden is too still. The curtain shifts though the window is closed.";
        },
      },
      {
        id: "wave_at_figure",
        label: "Wave at the figure outside",
        side: "sub",
        hint: "ending",
        turns: 1,
        once: true,
        guard(state) {
          // Only appears once the player has felt enough pressure.
          return state.threatPressure >= 3;
        },
        run(state) {
          state.ending = "window";
          return "It waves back. Slowly. With both hands.";
        },
      },
      {
        id: "bedroom_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    bathroom: [
      {
        id: "cover_mirror",
        label: "Cover the mirror",
        side: "sub",
        hint: "mirror",
        turns: 1,
        once: true,
        run(state) {
          state.flags.mirror = true;
          return "You drape a towel across the mirror. The drip in the basin pauses, then resumes a half-second slower.";
        },
      },
      {
        id: "check_cabinet",
        label: "Open the cabinet",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Box of matches");
          return "A box of matches, half full. Someone wrote DO NOT LIGHT THE LAMP across the lid.";
        },
      },
      {
        id: "bathroom_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    cellar: [
      {
        id: "read_chart",
        label: "Read the chart",
        side: "sub",
        hint: "chart",
        turns: 1,
        // Stays clickable after the reveal but does nothing — once
        // monster_revealed is set (either by reading the chart or by
        // the turn-5 auto-reveal), this just shows a "nothing new"
        // toast and doesn't burn a turn.
        noopIf: state => !!state.flags.monster_revealed,
        noopMessage: "The chart is unchanged. The room already knows what's outside.",
        event: "monster_release",
        run(state) {
          state.flags.chart = true;
          return `A medical chart, recent. The last entry is one line: ${state.threat.name.toUpperCase()} returned.`;
        },
      },
      {
        id: "check_shelf",
        label: "Search the shelves",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Brass key");
          return "Behind the jars, a brass key with no tag. It is warm.";
        },
      },
      {
        id: "cellar_to_hallway",
        label: "Climb the steps to the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    hallway: [
      {
        id: "find_layout",
        label: "Search behind a frame",
        side: "sub",
        hint: "map",
        turns: 1,
        once: true,
        run(state) {
          state.flags.map = true;
          addUnique(state.inventory, "Folded floor plan");
          return "A small folded plan of the building, hidden behind a portrait. The front door is at the far end of this corridor.";
        },
      },
      {
        id: "listen",
        label: "Listen at the doors",
        side: "sub",
        hint: "risk",
        turns: 1,
        look: true,
        lookVideo: "videos/look_hallway_listen.mp4",
        run(state) {
          state.threatPressure += 1;
          return `Behind one of the doors, breathing. ${state.threat.name} is closer than the building admits.`;
        },
      },
      {
        id: "reach_door",
        label: "Reach the front door",
        side: "exit",
        hint: "escape",
        turns: 1,
        run(state) {
          if (!state.flags.identity || !state.flags.map) {
            state.threatPressure += 2;
            return "The door will not open for someone without a name and without a route. Behind you, the corridor lengthens.";
          }
          state.ending = "escape";
          return "The door opens. Outside, the air is colder than you remember air being.";
        },
      },
      {
        id: "enter_bedroom",
        label: "Enter the bedroom",
        side: "exit",
        hint: "transition",
        target: "bedroom",
        turns: 1,
      },
      {
        id: "enter_bathroom",
        label: "Enter the bathroom",
        side: "exit",
        hint: "transition",
        target: "bathroom",
        turns: 1,
      },
      {
        id: "enter_cellar",
        label: "Descend to the cellar",
        side: "exit",
        hint: "transition",
        target: "cellar",
        turns: 1,
      },
      {
        id: "enter_kitchen",
        label: "Enter the kitchen",
        side: "exit",
        hint: "transition",
        target: "kitchen",
        turns: 1,
      },
      {
        id: "enter_study",
        label: "Enter the study",
        side: "exit",
        hint: "transition",
        target: "study",
        turns: 1,
      },
      {
        id: "enter_attic",
        label: "Climb to the attic",
        side: "exit",
        hint: "transition",
        target: "attic",
        turns: 1,
      },
      {
        id: "enter_dining_room",
        label: "Enter the dining room",
        side: "exit",
        hint: "transition",
        target: "dining_room",
        turns: 1,
      },
      {
        id: "enter_library",
        label: "Enter the library",
        side: "exit",
        hint: "transition",
        target: "library",
        turns: 1,
      },
      {
        id: "enter_parlour",
        label: "Enter the parlour",
        side: "exit",
        hint: "transition",
        target: "parlour",
        turns: 1,
      },
      {
        id: "enter_storeroom",
        label: "Enter the storeroom",
        side: "exit",
        hint: "transition",
        target: "storeroom",
        turns: 1,
      },
      {
        id: "enter_conservatory",
        label: "Enter the conservatory",
        side: "exit",
        hint: "transition",
        target: "conservatory",
        turns: 1,
      },
    ],
    kitchen: [
      {
        id: "kitchen_kettle",
        label: "Lift the kettle",
        side: "sub",
        hint: "warmth",
        turns: 1,
        once: true,
        run(state) {
          state.threatPressure += 1;
          return "The kettle is still warm. Whoever was here left it on long after the gas was off.";
        },
      },
      {
        id: "kitchen_drawer",
        label: "Open the cutlery drawer",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Bone-handled knife");
          return "A single bone-handled knife. The other slots in the felt are filled with folded paper.";
        },
      },
      {
        id: "kitchen_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    study: [
      {
        id: "study_lamp",
        label: "Turn down the oil lamp",
        side: "sub",
        hint: "watch",
        turns: 1,
        once: true,
        run(state) {
          state.threatPressure += 1;
          return "You twist the wick down. The lamp does not dim. The shadow under the desk does.";
        },
      },
      {
        id: "study_letter",
        label: "Read the desk letter",
        side: "sub",
        hint: "letter",
        turns: 1,
        once: true,
        guard(state) {
          return !state.flags.letter;
        },
        run(state) {
          state.flags.letter = true;
          addUnique(state.inventory, "Unsent letter");
          return "An unfinished letter on study paper. The handwriting is yours. The recipient is also yours.";
        },
      },
      {
        id: "study_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    attic: [
      {
        id: "attic_trunk",
        label: "Open the steamer trunk",
        side: "sub",
        hint: "identity",
        turns: 1,
        once: true,
        guard(state) {
          return !state.flags.identity;
        },
        run(state) {
          state.flags.identity = true;
          state.playerRevealed = true;
          addUnique(state.inventory, `${state.playerName}'s coat`);
          return `An old coat folded on top, the lining stitched: ${state.playerName}.`;
        },
      },
      {
        id: "attic_window",
        label: "Look through the round window",
        side: "sub",
        hint: "watch",
        turns: 1,
        look: true,
        lookVideo: "videos/look_attic_window.mp4",
        run(state) {
          state.threatPressure += 1;
          return "Below: the garden, empty. The garden, empty. The garden, with someone in it that wasn't there a moment ago.";
        },
      },
      {
        id: "attic_to_hallway",
        label: "Descend to the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    dining_room: [
      {
        id: "dining_chair",
        label: "Pull out a chair",
        side: "sub",
        hint: "watch",
        turns: 1,
        once: true,
        run(state) {
          state.threatPressure += 1;
          return "It moves more easily than a chair this old should. Something exhales as you sit, then stops when you do.";
        },
      },
      {
        id: "dining_candelabra",
        label: "Light a candle",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        guard(state) {
          return state.inventory.some(item => /matches/i.test(item));
        },
        run(state) {
          addUnique(state.inventory, "Lit candle");
          return "One candle catches. The other five lean a fraction toward it.";
        },
      },
      {
        id: "dining_room_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    library: [
      {
        id: "library_book",
        label: "Pick up the open book",
        side: "sub",
        hint: "map",
        turns: 1,
        once: true,
        guard(state) {
          return !state.flags.map;
        },
        run(state) {
          state.flags.map = true;
          addUnique(state.inventory, "Folded floor plan");
          return "A folded floor plan tucked between the pages — the front door is at the end of the hallway, marked in red.";
        },
      },
      {
        id: "library_fireplace",
        label: "Reach into the fireplace",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Iron poker");
          return "An iron poker still warm at the tip. The hearth is cold. You set the poker back down — and pick it up again.";
        },
      },
      {
        id: "library_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    parlour: [
      {
        id: "parlour_clock",
        label: "Wind the wall clock",
        side: "sub",
        hint: "watch",
        turns: 1,
        once: true,
        run(state) {
          state.threatPressure += 1;
          return "The pendulum lurches into motion. It ticks once, twice, then keeps perfect time with your breathing.";
        },
      },
      {
        id: "parlour_couch",
        label: "Lift the couch cushion",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Tarnished hand mirror");
          return "A small tarnished hand mirror, face down. You do not turn it over.";
        },
      },
      {
        id: "parlour_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    storeroom: [
      {
        id: "storeroom_sheet",
        label: "Lift a covering sheet",
        side: "sub",
        hint: "watch",
        turns: 1,
        once: true,
        run(state) {
          state.threatPressure += 1;
          return "Underneath: another covering sheet, fitted to a shape that does not match any furniture you have seen.";
        },
      },
      {
        id: "storeroom_box",
        label: "Open a labelled box",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Spare lantern");
          return "A spare lantern with oil still in it. The label on the box is your handwriting.";
        },
      },
      {
        id: "storeroom_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    conservatory: [
      {
        id: "conservatory_glass",
        label: "Touch the cold glass",
        side: "sub",
        hint: "watch",
        turns: 1,
        look: true,
        lookVideo: "videos/look_conservatory_glass.mp4",
        once: true,
        run(state) {
          state.threatPressure += 1;
          return "The frost on the inside of the pane retreats from your fingertip — and then writes a single word back: STAY.";
        },
      },
      {
        id: "conservatory_pot",
        label: "Reach into a fern pot",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Garden key");
          return "Buried in the soil, a small key. The label has been scrubbed off.";
        },
      },
      {
        id: "conservatory_to_hallway",
        label: "Step into the hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
  };

  // ── Procedural helpers ───────────────────────────────────────────────────
  function hashKey(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRng(key) {
    let seed = hashKey(key) || 1;
    return function rng() {
      seed += 0x6D2B79F5;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanRunKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  }

  function makeRunKey(difficultyId) {
    const randomPart = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, "0");
    return `${difficultyId}-${Date.now().toString(36)}-${randomPart}`;
  }

  function difficultyFromKey(key, fallback) {
    const prefix = String(key).split("-")[0];
    return difficulties[prefix] ? prefix : fallback;
  }

  function randomItem(list, rng = Math.random) {
    return list[Math.floor(rng() * list.length)];
  }

  function randomInt(min, max, rng = Math.random) {
    return Math.floor(min + rng() * (max - min + 1));
  }

  function shuffled(list, rng) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function addUnique(list, item) {
    if (!list.includes(item)) list.push(item);
  }

  function selectRunGoals(rng) {
    const core = goalPool.filter(goal => goal.core);
    const optional = shuffled(goalPool.filter(goal => !goal.core), rng).slice(0, 2);
    return core.concat(optional);
  }

  // ── Task groups (puzzle chains) ──────────────────────────────────────
  // Each group is a chain of steps placed at run start across rooms whose
  // kind matches step.roomKind. Steps may declare `requires` (an inventory
  // item id / flag name) and `provides` (the same shape — what doing this
  // step grants). The engine in game.js handles disabled-locked UI and
  // gating; story.js just declares the data.
  //
  // Authoring rules:
  // - A step's room MUST exist in the run (placement filters by runRooms).
  // - If no runRoom matches a step's roomKind, the whole group is skipped
  //   for that run (better to drop the chain than place a broken step).
  // - Keep steps small — 2–3 steps per chain plays best with current
  //   turn budgets. The auto-reveal at turn 5 still applies.
  // Step factory — keeps the data dense and consistent. Each step picks
  // up an inventory item (optional), sets a provides flag (optional),
  // and returns a one-line flavor message. `roomKind` "any" / omitted
  // means the step can land in any run room.
  function makeStep(opts) {
    return {
      id: opts.id,
      label: opts.label,
      roomKind: opts.roomKind || "any",
      requires: opts.requires,
      provides: opts.provides,
      run(state) {
        if (opts.item) addUnique(state.inventory, opts.item);
        if (opts.provides) state.flags[opts.provides] = true;
        return opts.text;
      },
    };
  }

  // ~35 chain puzzles. Most are 2-step "find X → use X" pairs that read
  // well in a haunted-house / asylum / manor context. Some have a third
  // assembly step. roomKind tags steer placement — "any" = anywhere,
  // others target rooms by kind. Edit/add/remove freely; createRun
  // picks K of these per run (1/2/3 by difficulty).
  const taskGroups = [
    { id: "lockbox_chain", label: "Lockbox & ledger", steps: [
      makeStep({ id: "find_brass_key", label: "Search the drawers", provides: "key_brass", item: "Brass key",
        text: "A small brass key tucked under folded linen, warm as if just handled." }),
      makeStep({ id: "open_lockbox", label: "Open the lockbox", roomKind: "study_like", requires: "key_brass", provides: "ledger", item: "Ledger page",
        text: "The lockbox clicks open. A single ledger page slides out — your name, dated yesterday." }),
    ]},
    { id: "diary_cipher", label: "Coded diary", steps: [
      makeStep({ id: "find_coded_diary", label: "Pick up the locked diary", provides: "diary_coded", item: "Coded diary",
        text: "A slim diary, every entry written in a child's substitution cipher." }),
      makeStep({ id: "find_decipher_sheet", label: "Find the slip of paper", requires: "diary_coded", provides: "diary_decoded", item: "Cipher sheet",
        text: "A torn slip lists letter pairs. The diary's last entry reads as a name." }),
    ]},
    { id: "sealed_letter", label: "Sealed letter", steps: [
      makeStep({ id: "find_sealed_letter", label: "Lift the sealed envelope", provides: "sealed_letter", item: "Sealed letter",
        text: "Wax seal, no addressee. Heavier than a single page should be." }),
      makeStep({ id: "find_letter_opener", label: "Take the letter opener", requires: "sealed_letter", provides: "letter_opened", item: "Letter contents",
        text: "The seal lifts whole. Inside: directions, in your own handwriting." }),
    ]},
    { id: "gramophone_message", label: "Gramophone record", steps: [
      makeStep({ id: "find_vinyl_record", label: "Lift the vinyl record", provides: "vinyl_record", item: "Vinyl record",
        text: "A record with no label, sleeve still warm from a hand that just held it." }),
      makeStep({ id: "play_gramophone", label: "Wind the gramophone", roomKind: "lounge_like", requires: "vinyl_record", provides: "record_heard", item: "Recorded voice",
        text: "The needle drops. The voice is yours. It is asking the room a question." }),
    ]},
    { id: "music_box", label: "Music box & key", steps: [
      makeStep({ id: "find_silver_key", label: "Take the tiny silver key", provides: "silver_key", item: "Silver key",
        text: "A key too small for any door, etched with a single initial." }),
      makeStep({ id: "open_music_box", label: "Open the music box", requires: "silver_key", provides: "music_box_open", item: "Music box note",
        text: "The lid lifts on a frozen ballerina. A folded note lies beneath the felt." }),
    ]},
    { id: "bible_bookmark", label: "Family bible & bookmark", steps: [
      makeStep({ id: "find_family_bible", label: "Take down the family bible", roomKind: "study_like", provides: "family_bible", item: "Family bible",
        text: "A bible with a family tree pencilled on the flyleaf. Your name is missing." }),
      makeStep({ id: "find_pressed_bookmark", label: "Pick up the pressed bookmark", requires: "family_bible", provides: "bible_decoded", item: "Pressed bookmark",
        text: "A pressed flower bookmark slips into a verse. The first letters spell a date." }),
    ]},
    { id: "photo_negative", label: "Photo negative", steps: [
      makeStep({ id: "find_negative", label: "Pick up the film negative", provides: "photo_negative", item: "Film negative",
        text: "A film negative held to the light shows a room missing one figure." }),
      makeStep({ id: "develop_photo", label: "Develop the photo", roomKind: "bath_like", requires: "photo_negative", provides: "photo_developed", item: "Developed photo",
        text: "The print resolves. Behind you in the picture, someone is standing very close." }),
    ]},
    { id: "pocket_watch", label: "Pocket watch", steps: [
      makeStep({ id: "find_pocket_watch", label: "Take the pocket watch", provides: "watch_held", item: "Pocket watch",
        text: "A pocket watch, stopped at a time you remember choosing." }),
      makeStep({ id: "wind_pocket_watch", label: "Wind it carefully", requires: "watch_held", provides: "watch_wound", item: "Engraved hour",
        text: "Wound, the watch ticks once and shows a future hour you have not lived yet." }),
    ]},
    { id: "wax_seal_kit", label: "Wax seal kit", steps: [
      makeStep({ id: "find_wax_stick", label: "Pick up the wax stick", provides: "wax_stick", item: "Wax stick",
        text: "A red wax stick, the tip already softened from use." }),
      makeStep({ id: "use_seal_matrix", label: "Press the seal matrix", roomKind: "study_like", requires: "wax_stick", provides: "seal_made", item: "Wax seal impression",
        text: "The brass matrix bites the wax. A family crest you do not recognise as yours." }),
    ]},
    { id: "liquor_cabinet", label: "Liquor cabinet", steps: [
      makeStep({ id: "find_liquor_key", label: "Pocket the liquor key", provides: "liquor_key", item: "Cabinet key",
        text: "A small key on a faded ribbon: the cabinet is for someone with steadier nerves." }),
      makeStep({ id: "open_liquor_cabinet", label: "Open the cabinet", roomKind: "kitchen_like", requires: "liquor_key", provides: "courage", item: "Courage shot",
        text: "One bottle, one glass. The taste is sharper than it should be. Your hands stop shaking." }),
    ]},
    { id: "wallpaper_message", label: "Wallpaper message", steps: [
      makeStep({ id: "peel_wallpaper", label: "Peel the loose wallpaper", provides: "wallpaper_strip", item: "Wallpaper strip",
        text: "The paper lifts cleanly. There is writing on the wall behind it." }),
      makeStep({ id: "match_wall_symbol", label: "Match the pencilled symbol", requires: "wallpaper_strip", provides: "wall_symbol_matched", item: "Matched glyph",
        text: "The pencilled glyph matches one you saw on a doorframe two rooms ago." }),
    ]},
    { id: "pet_collar", label: "Worn collar", steps: [
      makeStep({ id: "find_worn_collar", label: "Pick up the worn collar", provides: "worn_collar", item: "Worn pet collar",
        text: "A small leather collar, the buckle still warm. No tag." }),
      makeStep({ id: "call_the_dog", label: "Whistle softly", requires: "worn_collar", provides: "dog_called", item: "Soft footsteps",
        text: "Something patters in the hall — too small for the thing you are afraid of. It leaves a trail of pawprints toward a door." }),
    ]},
    { id: "broken_mirror", label: "Broken mirror", steps: [
      makeStep({ id: "find_shard_a", label: "Pick up the silvered shard", provides: "shard_a", item: "Mirror shard A",
        text: "A shard sharp enough to cut light. It reflects half a face that is not yours." }),
      makeStep({ id: "find_shard_b", label: "Pick up the matching shard", provides: "shard_b", item: "Mirror shard B",
        text: "A second shard, the edge matches the first. Together they show a whole stranger." }),
      makeStep({ id: "assemble_mirror", label: "Fit the shards together", requires: "shard_b", provides: "mirror_whole", item: "Mended mirror",
        text: "The shards seal. In the joined mirror, the stranger mouths a single word: run." }),
    ]},
    { id: "funeral_wreath", label: "Funeral wreath", steps: [
      makeStep({ id: "find_wreath_ribbon", label: "Pull the wreath ribbon", provides: "wreath_ribbon", item: "Wreath ribbon",
        text: "A black ribbon, embroidered with a date a week from now." }),
      makeStep({ id: "find_hairpin", label: "Pocket the hairpin", requires: "wreath_ribbon", provides: "hairpin", item: "Hairpin",
        text: "A hairpin too small for the ribbon's bow — but it fits a different lock." }),
    ]},
    { id: "apothecary_label", label: "Apothecary jar", steps: [
      makeStep({ id: "find_empty_jar", label: "Lift the empty jar", provides: "empty_jar", item: "Apothecary jar",
        text: "An empty jar with the residue of something faintly sweet inside." }),
      makeStep({ id: "match_label", label: "Match the faded label", requires: "empty_jar", provides: "label_matched", item: "Faded label",
        text: "The label, peeled and pocketed, names the contents and a dosage in a familiar hand." }),
    ]},
    { id: "calendar_date", label: "Calendar & safe", steps: [
      makeStep({ id: "find_calendar", label: "Take the wall calendar", roomKind: "study_like", provides: "calendar_date", item: "Marked calendar",
        text: "One date is circled twice. Two single digits scrawled beside it." }),
      makeStep({ id: "try_safe", label: "Try the safe combination", requires: "calendar_date", provides: "safe_open", item: "Safe contents",
        text: "The digits work. The safe holds one keepsake and one warning written for you." }),
    ]},
    { id: "doll_ritual", label: "Cursed doll", steps: [
      makeStep({ id: "find_cursed_doll", label: "Pick up the doll", provides: "cursed_doll", item: "Cursed doll",
        text: "A porcelain doll whose painted eyes follow you when you stop watching them." }),
      makeStep({ id: "find_hearth_pin", label: "Take the hearth pin", requires: "cursed_doll", provides: "hearth_pin", item: "Hearth pin",
        text: "An iron pin, blackened, found behind the hearth." }),
      makeStep({ id: "burn_the_doll", label: "Pin and burn the doll", requires: "hearth_pin", provides: "doll_burned", item: "Doll ashes",
        text: "Pinned through the chest, the doll burns quietly. The house feels half a tone lighter." }),
    ]},
    { id: "gardener_pruners", label: "Pruners & trellis", steps: [
      makeStep({ id: "find_pruners", label: "Take the pruners", roomKind: "storage_like", provides: "pruners", item: "Garden pruners",
        text: "Heavy pruners, oiled. Whoever last used them sharpened them recently." }),
      makeStep({ id: "climb_trellis", label: "Cut down the trellis vines", roomKind: "wild", requires: "pruners", provides: "trellis_clear", item: "Cleared path",
        text: "The vines part. There is a window behind the trellis no one has used in years." }),
    ]},
    { id: "wedding_ring", label: "Wedding ring", steps: [
      makeStep({ id: "find_wedding_ring", label: "Pick up the wedding ring", provides: "wedding_ring", item: "Wedding ring",
        text: "A wedding ring, engraved inside with a name. Not yours." }),
      makeStep({ id: "match_portrait", label: "Match it to the portrait", requires: "wedding_ring", provides: "portrait_matched", item: "Identification",
        text: "The ring matches the one painted on the portrait's left hand. The painted eyes seem to relax." }),
    ]},
    { id: "tea_arrangement", label: "Tea & seance", steps: [
      makeStep({ id: "set_tea", label: "Arrange the tea cups", roomKind: "kitchen_like", provides: "tea_arrangement", item: "Tea arrangement",
        text: "Three cups, three saucers — set the way someone here once set them." }),
      makeStep({ id: "speak_seance", label: "Speak the seance words", requires: "tea_arrangement", provides: "seance_done", item: "Whispered answer",
        text: "The spoon turns by itself. A whisper answers a question you only thought." }),
    ]},
    { id: "bell_jar", label: "Bell jar inscription", steps: [
      makeStep({ id: "lift_bell_jar", label: "Lift the bell jar", roomKind: "storage_like", provides: "bell_jar_lifted", item: "Bell jar contents",
        text: "Under the glass: a wax model of this house, with one door painted shut." }),
      makeStep({ id: "read_bell_jar", label: "Read the etched base", requires: "bell_jar_lifted", provides: "bell_jar_read", item: "Etched names",
        text: "The base lists every tenant in order. The last name is fresh — pencil, not ink." }),
    ]},
    { id: "snuff_box", label: "Snuff box", steps: [
      makeStep({ id: "find_snuff_box", label: "Pick up the snuff box", provides: "snuff_box", item: "Snuff box",
        text: "A silver snuff box, hinge worn from constant opening." }),
      makeStep({ id: "analyse_snuff", label: "Tip the powder onto paper", requires: "snuff_box", provides: "snuff_analysed", item: "Pinned powder note",
        text: "Not snuff. A dried herb that quiets dogs and dulls memory." }),
    ]},
    { id: "confession_password", label: "Confession password", steps: [
      makeStep({ id: "find_booth_screen", label: "Lift the booth screen", provides: "booth_screen", item: "Slipped confession",
        text: "A folded confession was wedged behind the screen. It names a room and a hour." }),
      makeStep({ id: "speak_password", label: "Speak the password aloud", requires: "booth_screen", provides: "booth_password", item: "Password",
        text: "Said aloud, the password makes a small click somewhere distant in the house." }),
    ]},
    { id: "portrait_recess", label: "Portrait recess", steps: [
      makeStep({ id: "loosen_portrait", label: "Loosen the loose portrait", provides: "portrait_moved", item: "Loose portrait",
        text: "The portrait slides sideways on a hidden track. There is a recess behind it." }),
      makeStep({ id: "open_recess", label: "Reach into the recess", requires: "portrait_moved", provides: "recess_opened", item: "Recess contents",
        text: "Inside the recess, a brooch and a single key still wearing a paper tag." }),
    ]},
    { id: "candle_count", label: "Three candles", steps: [
      makeStep({ id: "gather_candles", label: "Gather the three candles", provides: "three_candles", item: "Three black candles",
        text: "Three black candles, only one half-burnt — the other two have never been lit." }),
      makeStep({ id: "light_fourth", label: "Light the absent fourth", requires: "three_candles", provides: "fourth_lit", item: "Fourth flame",
        text: "Lit with the others, a fourth flame steadies where there is no candle. Something moves at the edge of the light." }),
    ]},
    { id: "gardeners_almanac", label: "Gardener's almanac", steps: [
      makeStep({ id: "find_almanac", label: "Pick up the almanac", roomKind: "study_like", provides: "almanac", item: "Gardener's almanac",
        text: "An old almanac, the planting beds annotated by a careful hand." }),
      makeStep({ id: "match_bed", label: "Match the bed to the page", roomKind: "wild", requires: "almanac", provides: "bed_marked", item: "Marked planting bed",
        text: "The bed in the almanac matches the one outside. Something has been buried under it recently." }),
    ]},
    { id: "family_recipe", label: "Family recipe & tonic", steps: [
      makeStep({ id: "find_recipe_card", label: "Pick up the recipe card", roomKind: "kitchen_like", provides: "recipe_card", item: "Recipe card",
        text: "A handwritten recipe, ingredients lined up too neatly. The last line is a warning." }),
      makeStep({ id: "brew_tonic", label: "Brew the tonic carefully", roomKind: "kitchen_like", requires: "recipe_card", provides: "tonic_brewed", item: "Bottled tonic",
        text: "The tonic comes out clear and bitter. According to the warning, it will keep a thing at bay for one passage." }),
    ]},
    { id: "child_drawing", label: "Child's drawing", steps: [
      makeStep({ id: "find_child_drawing", label: "Pick up the crayon drawing", provides: "child_drawing", item: "Crayon drawing",
        text: "A child's crayon drawing of this house. There is a smiling figure where no one stands." }),
      makeStep({ id: "find_marked_spot", label: "Find the spot the child drew", requires: "child_drawing", provides: "spot_found", item: "Mark on the floor",
        text: "The floorboard at the marked spot is loose. Under it, a tin of folded letters." }),
    ]},
    { id: "locked_chest", label: "Chest & locker key", steps: [
      makeStep({ id: "find_chest_tag", label: "Lift the chest tag", provides: "chest_tag", item: "Chest tag",
        text: "A paper tag tied to a brass chest. It names a person and asks for forgiveness." }),
      makeStep({ id: "find_locker_key", label: "Take the locker key", requires: "chest_tag", provides: "locker_key", item: "Locker key",
        text: "The key fits a locker upstairs. Whoever was forgiven left their coat behind." }),
    ]},
    { id: "stamped_envelope", label: "Stamped envelope", steps: [
      makeStep({ id: "find_stamped_envelope", label: "Pick up the stamped envelope", provides: "stamped_envelope", item: "Stamped envelope",
        text: "Stamps from a place the household has never been. The postmark is tomorrow." }),
      makeStep({ id: "reverse_stamp", label: "Steam the stamp loose", roomKind: "study_like", requires: "stamped_envelope", provides: "stamp_lifted", item: "Hidden microtext",
        text: "Behind the stamp, a square of writing too small to read without glass — but you have glass." }),
    ]},
    { id: "dressmaker_chain", label: "Dressmaker's hem", steps: [
      makeStep({ id: "find_pin_cushion", label: "Take the pin cushion", provides: "pin_cushion", item: "Pin cushion",
        text: "A pin cushion shaped like a tomato, bristling with pins of three different colours." }),
      makeStep({ id: "unstitch_hem", label: "Unstitch the embroidered hem", requires: "pin_cushion", provides: "hem_unstitched", item: "Embroidered hem",
        text: "The embroidery is a code. Picked apart, it spells a child's nickname." }),
      makeStep({ id: "read_hidden_note", label: "Read the hidden note", requires: "hem_unstitched", provides: "hem_note_read", item: "Hidden note",
        text: "Folded into the hem, a note: 'Do not let her wear this.' The handwriting is yours." }),
    ]},
    { id: "spirit_board", label: "Spirit board", steps: [
      makeStep({ id: "find_planchette", label: "Pick up the planchette", provides: "planchette", item: "Planchette",
        text: "A wooden planchette, the felt worn smooth from years of motion." }),
      makeStep({ id: "ask_spirit", label: "Sit and ask softly", roomKind: "lounge_like", requires: "planchette", provides: "spirit_spoke", item: "Spirit answer",
        text: "The planchette spells two words, then breaks. Two words are enough." }),
    ]},
    { id: "bird_cage", label: "Bird cage", steps: [
      makeStep({ id: "find_cage_key", label: "Pick up the cage key", provides: "cage_key", item: "Cage key",
        text: "A tiny key, the kind that fits a bird cage. The bird has been gone a long time." }),
      makeStep({ id: "open_cage", label: "Open the cage door", requires: "cage_key", provides: "cage_open", item: "Found feather",
        text: "Inside the cage: one feather and a folded slip of paper. The slip names a way out." }),
    ]},
    { id: "footprint_trail", label: "Muddy footprint", steps: [
      makeStep({ id: "find_muddy_print", label: "Look closely at the print", provides: "muddy_print", item: "Tracing of a footprint",
        text: "A muddy footprint, small, recent. You trace it onto paper." }),
      makeStep({ id: "compare_bootprint", label: "Compare against the boots", roomKind: "storage_like", requires: "muddy_print", provides: "print_matched", item: "Matched boot",
        text: "The print matches a child's boot tucked behind a coat. Today's mud is on the sole." }),
    ]},
    { id: "silverware_count", label: "Silverware count", steps: [
      makeStep({ id: "polish_spoons", label: "Polish the spoon set", roomKind: "kitchen_like", provides: "spoon_set", item: "Polished spoon set",
        text: "Polished, the spoons show a maker's mark that matches a date — a date you've seen circled." }),
      makeStep({ id: "read_engraving", label: "Read the inherited engraving", requires: "spoon_set", provides: "engraving_read", item: "Inherited initials",
        text: "The initials engraved on the handles are not the family's. They are yours." }),
    ]},
  ];

  // For each group picked for a run, walk its steps and assign each one
  // to a room whose kind matches. Returns placedActions:
  //   { roomId: [stepObject, ...] }
  // Group is dropped entirely if any step can't find a matching room
  // in the run — better than leaving a step orphaned in the hallway.
  function placeTaskGroups(difficulty, runRooms, rng) {
    const placed = {};
    const want = difficulty.groupCount || 0;
    if (!want || !taskGroups.length) return placed;
    const weighted = [];
    taskGroups.forEach(group => {
      const weight = group.weight || 1;
      for (let i = 0; i < weight; i += 1) weighted.push(group);
    });
    const picks = [];
    const seen = new Set();
    const pool = shuffled(weighted, rng);
    for (let i = 0; i < pool.length && picks.length < want; i += 1) {
      const group = pool[i];
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      picks.push(group);
    }
    const usedRooms = new Set();
    picks.forEach(group => {
      const stepRooms = [];
      let ok = true;
      group.steps.forEach(step => {
        if (!ok) return;
        const candidates = runRooms.filter(id => {
          const room = rooms[id];
          if (!room) return false;
          // "any" (or missing roomKind) means the step can be placed in
          // any room of the run — useful for items that could plausibly
          // be dropped anywhere: a diary, a brass key, a torn note.
          if (!step.roomKind || step.roomKind === "any") return true;
          return room.kind === step.roomKind;
        });
        // Prefer rooms not already used by another step (any group),
        // but fall back to reusing one if there's no unused match.
        const fresh = candidates.filter(id => !usedRooms.has(id));
        const pool2 = fresh.length ? fresh : candidates;
        if (!pool2.length) { ok = false; return; }
        const chosen = randomItem(pool2, rng);
        usedRooms.add(chosen);
        stepRooms.push([chosen, step]);
      });
      if (!ok) return;
      stepRooms.forEach(([roomId, step]) => {
        if (!placed[roomId]) placed[roomId] = [];
        // Persist only IDs — the live step (with `run` fn) is looked up
        // from Story.taskGroups at render time. Functions don't survive
        // JSON, so this is what lets the run resume from a saved state.
        placed[roomId].push({ groupId: group.id, stepId: step.id });
      });
    });
    return placed;
  }

  // Look up a placed step ({groupId, stepId}) back to the live step
  // object that has the run() function. Returns null if either id is
  // stale (e.g. content removed between releases).
  function resolveStep(ref) {
    if (!ref || !ref.groupId || !ref.stepId) return null;
    const group = taskGroups.find(g => g.id === ref.groupId);
    if (!group) return null;
    return group.steps.find(s => s.id === ref.stepId) || null;
  }

  // Walk placedActions to figure out which groups landed in this run,
  // then make one "chain goal" per group that completes when the last
  // step fires. Label-only — doesn't tell the player which room holds
  // which step, so it raises awareness without spoiling placement.
  function chainGoalsFromPlaced(placedActions) {
    const groupIds = new Set();
    Object.values(placedActions || {}).forEach(refs => {
      (refs || []).forEach(ref => { if (ref && ref.groupId) groupIds.add(ref.groupId); });
    });
    const out = [];
    groupIds.forEach(id => {
      const group = taskGroups.find(g => g.id === id);
      if (!group || !group.steps || !group.steps.length) return;
      const lastStep = group.steps[group.steps.length - 1];
      if (!lastStep || !lastStep.provides) return;
      out.push({
        id: `chain_${id}`,
        text: `Follow a clue trail somewhere in the building: ${group.label || id}.`,
        requires: lastStep.provides,
        synthetic: true,
      });
    });
    return out;
  }

  // Pick which rooms exist for this run. Always includes startRoom +
  // (hallway is implicit-always-in everywhere else). Capped by however
  // many rooms are actually defined, so a new game type with fewer
  // rooms than the difficulty target just uses everything it has.
  function selectRunRooms(difficulty, startRoom, rng) {
    const target = difficulty.roomCount || 99;
    const others = Object.keys(rooms).filter(id => id !== "hallway" && id !== startRoom);
    const want = Math.max(0, Math.min(others.length, target - 1));
    const picked = shuffled(others, rng).slice(0, want);
    return [startRoom, ...picked];
  }

  // ── Per-run dynamic layout ───────────────────────────────────────────
  // With ~30 rooms in the catalogue but only 8/10/12 chosen per run,
  // we build a compact 2-column grid AT RUN START — picked rooms get
  // tight positions (rows 1..N × left/right). This keeps the mini-map
  // and the nearbyRooms topology aligned per run without forcing all
  // 30 into a single static grid the player would never see whole.
  function buildRunLayout(runRooms, rng) {
    const candidates = runRooms.filter(id => id !== "hallway");
    const arranged = shuffled(candidates, rng);
    return arranged.map((id, index) => {
      const row = Math.floor(index / 2) + 1;
      const side = index % 2 === 0 ? "left" : "right";
      return { id, row, side, pos: `node-row${row}-${side}` };
    });
  }

  // Backwards-compatible static layout (used as a fallback for legacy
  // saves without state.runLayout). Covers the v0.1/v0.2 11 rooms.
  const roomLayout = [
    { id: "parlour",      row: 1, side: "wide",  pos: "node-wide-top" },
    { id: "bedroom",      row: 2, side: "left",  pos: "node-row1-left" },
    { id: "bathroom",     row: 2, side: "right", pos: "node-row1-right" },
    { id: "study",        row: 3, side: "left",  pos: "node-row2-left" },
    { id: "library",      row: 3, side: "right", pos: "node-row2-right" },
    { id: "kitchen",      row: 4, side: "left",  pos: "node-row3-left" },
    { id: "dining_room",  row: 4, side: "right", pos: "node-row3-right" },
    { id: "cellar",       row: 5, side: "left",  pos: "node-row4-left" },
    { id: "attic",        row: 5, side: "right", pos: "node-row4-right" },
    { id: "storeroom",    row: 6, side: "left",  pos: "node-row5-left" },
    { id: "conservatory", row: 6, side: "right", pos: "node-row5-right" },
  ];

  // nearbyRooms now takes the layout explicitly so it can work off the
  // per-run layout. Falls back to the static roomLayout when called
  // without a second argument (legacy callers, or pre-run lookups).
  function nearbyRooms(roomId, layout) {
    const useLayout = Array.isArray(layout) && layout.length ? layout : roomLayout;
    const me = useLayout.find(entry => entry.id === roomId);
    if (!me) return [];
    const out = [];
    const add = id => { if (id && !out.includes(id) && id !== roomId) out.push(id); };
    if (me.side === "left" || me.side === "right") {
      const opp = me.side === "left" ? "right" : "left";
      const across = useLayout.find(e => e.row === me.row && e.side === opp);
      if (across) add(across.id);
      const upSame = useLayout.find(e => e.row === me.row - 1 && e.side === me.side);
      if (upSame) add(upSame.id);
      else {
        const upWide = useLayout.find(e => e.row === me.row - 1 && e.side === "wide");
        if (upWide) add(upWide.id);
      }
      const downSame = useLayout.find(e => e.row === me.row + 1 && e.side === me.side);
      if (downSame) add(downSame.id);
    } else if (me.side === "wide") {
      const next = useLayout.filter(e => e.row === me.row + 1);
      next.forEach(e => add(e.id));
    }
    return out;
  }

  window.TheHorrorsStory = {
    version: "0.2",
    rooms,
    actions,
    goals: goalPool,
    transitions,
    eventVideos,
    introPlaylist,
    mediaManifest,
    gameNames,
    difficulties,
    roomLayout,
    nearbyRooms,
    buildRunLayout,
    taskGroups,
    resolveStep,
    createRun(difficultyId = "medium", seedKey = "") {
      const requestedKey = cleanRunKey(seedKey);
      const initialDifficulty = difficulties[difficultyId] ? difficultyId : "medium";
      const runKey = requestedKey || makeRunKey(initialDifficulty);
      difficultyId = difficultyFromKey(runKey, initialDifficulty);
      const difficulty = difficulties[difficultyId] || difficulties.medium;
      const rng = createRng(runKey);
      const location = randomItem(locations, rng);
      const prefix = randomItem(facilityNames, rng);
      const threat = randomItem(threats, rng);
      const limit = randomInt(difficulty.range[0], difficulty.range[1], rng);
      // Any room flagged canStart is eligible — lets new sleeping/lounge
      // rooms join the pool just by setting the flag, no list to update.
      const startCandidates = Object.keys(rooms).filter(id => rooms[id].canStart);
      const startRoom = startCandidates.length
        ? randomItem(startCandidates, rng)
        : "bedroom";
      const runRooms = selectRunRooms(difficulty, startRoom, rng);
      const runLayout = buildRunLayout(runRooms, rng);
      const placedActions = placeTaskGroups(difficulty, runRooms, rng);
      // Synthetic per-chain goal so the player sees a chain exists
      // without being told which room holds which step.
      const chainGoals = chainGoalsFromPlaced(placedActions);
      const baseGoals = selectRunGoals(rng);
      return {
        active: true,
        ended: false,
        version: "0.1",
        runKey,
        difficultyId,
        difficultyLabel: difficulty.label,
        turn: 1,
        turnLimit: limit,
        turnRange: difficulty.range.slice(),
        visibleGoals: difficulty.visibleGoals,
        facilityPrefix: prefix,
        location,
        facility: `${prefix} ${location}`,
        playerName: randomItem(playerNames, rng),
        playerRevealed: false,
        threat,
        threatPressure: 0,
        currentRoom: startRoom,
        startRoom,
        visitedRooms: [startRoom],
        runRooms,
        runLayout,
        placedActions,
        goals: baseGoals.concat(chainGoals),
        flags: {},
        inventory: [],
        history: [],
        ending: "",
        mapUnlocked: false,
        createdAt: Date.now(),
      };
    },
  };

})();
