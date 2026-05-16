(function () {
  // ── Rooms ────────────────────────────────────────────────────────────────
  // Every non-hub room exits ONLY to the hallway. The hallway connects to all
  // rooms. This caps the transition video count at 2 × rooms.
  const rooms = {
    bedroom: {
      id: "bedroom",
      name: "Bedroom",
      kind: "room",
      poster: "images/bedroom.jpg",
      idleVideo: "videos/bedroom_to_hallway.mp4",
      toHallway: "videos/bedroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_bedroom.mp4",
      text: "You wake in a small bed under thin sheets. The window across the room is open just enough for the curtain to move. Something nearby has your name written on it.",
    },
    bathroom: {
      id: "bathroom",
      name: "Bathroom",
      kind: "room",
      poster: "images/bathroom.jpg",
      idleVideo: "videos/bathroom_to_hallway.mp4",
      toHallway: "videos/bathroom_to_hallway.mp4",
      fromHallway: "videos/hallway_to_bathroom.mp4",
      text: "Square white tiles, a basin under a square mirror, a tub with the curtain partway drawn. The tap drips on a count you can almost recognise.",
    },
    cellar: {
      id: "cellar",
      name: "Cellar",
      kind: "room",
      poster: "images/cellar.jpg",
      idleVideo: "videos/cellar_to_hallway.mp4",
      toHallway: "videos/cellar_to_hallway.mp4",
      fromHallway: "videos/hallway_to_cellar.mp4",
      text: "Steps down end at a single bulb. The shelves were stocked by someone who knew the building would outlive them.",
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
  ];

  const difficulties = {
    easy: { label: "Easy", range: [100, 120], visibleGoals: 4, hiddenRoomCount: 0 },
    medium: { label: "Medium", range: [90, 110], visibleGoals: 2, hiddenRoomCount: 1 },
    hard: { label: "Hard", range: [70, 92], visibleGoals: 1, hiddenRoomCount: 99 },
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
    },
    attack: {
      default: "videos/monster_attack_pale_woman.mp4",
      pale_woman: "videos/monster_attack_pale_woman.mp4",
      lost_child: "videos/monster_attack_lost_child.mp4",
      previous_tenant: "videos/monster_attack_previous_tenant.mp4",
      white_shadow: "videos/monster_attack_white_shadow.mp4",
      silent_companion: "videos/monster_attack_silent_companion.mp4",
      hollow_one: "videos/monster_attack_hollow_one.mp4",
    },
    endings: {
      window: "videos/ending_window.mp4",
      caught: "videos/monster_attack_pale_woman.mp4",
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
  ];

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
        once: true,
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

  function selectHiddenRooms(difficulty, startRoom, rng) {
    const candidates = Object.keys(rooms).filter(id => id !== "hallway" && id !== startRoom);
    const limit = Math.min(candidates.length, difficulty.hiddenRoomCount || 0);
    return shuffled(candidates, rng).slice(0, limit);
  }

  window.TheHorrorsStory = {
    version: "0.1",
    rooms,
    actions,
    goals: goalPool,
    transitions,
    eventVideos,
    introPlaylist,
    mediaManifest,
    gameNames,
    difficulties,
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
      const startRoom = "bedroom";
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
        hiddenRooms: selectHiddenRooms(difficulty, startRoom, rng),
        goals: selectRunGoals(rng),
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
