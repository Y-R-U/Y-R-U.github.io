(function () {
  const rooms = {
    cryo_room: {
      id: "cryo_room",
      name: "Cryo Room",
      kind: "room",
      poster: "images/cryo_room.jpg",
      idleVideo: "videos/cryo_room_to_hallway.mp4",
      toHallway: "videos/cryo_room_to_hallway.mp4",
      fromHallway: "videos/hallway_to_cryo_room.mp4",
      text: "You wake inside a cracked suspension cradle. Frost runs upward across the glass. A medical band around your wrist keeps rebooting your name.",
    },
    med_bay: {
      id: "med_bay",
      name: "Med Bay",
      kind: "room",
      poster: "images/med_bay.jpg",
      idleVideo: "videos/med_bay_to_hallway.mp4",
      toHallway: "videos/med_bay_to_hallway.mp4",
      fromHallway: "videos/hallway_to_med_bay.mp4",
      text: "Empty diagnostic beds wait under soft surgical light. The med bay smells too clean for somewhere abandoned.",
    },
    hydroponic_biome: {
      id: "hydroponic_biome",
      name: "Hydroponic Biome",
      kind: "room",
      poster: "images/hydroponic_biome.jpg",
      idleVideo: "videos/hydroponic_biome_to_hallway.mp4",
      toHallway: "videos/hydroponic_biome_to_hallway.mp4",
      fromHallway: "videos/hallway_to_hydroponic_biome.mp4",
      text: "Mist clings to vertical plant towers. Something has learned to breathe through the roots.",
    },
    reactor_gallery: {
      id: "reactor_gallery",
      name: "Reactor Gallery",
      kind: "room",
      poster: "images/reactor_gallery.jpg",
      idleVideo: "videos/reactor_gallery_to_hallway.mp4",
      toHallway: "videos/reactor_gallery_to_hallway.mp4",
      fromHallway: "videos/hallway_to_reactor_gallery.mp4",
      text: "The reactor gallery hums behind ribbed glass. Each pulse of light turns the shadows into machinery.",
    },
    hallway: {
      id: "hallway",
      name: "Central Hallway",
      kind: "hallway",
      poster: "images/hallway.jpg",
      idleVideo: "videos/hallway_to_cryo_room.mp4",
      text: "The hallway breathes through vents in the floor. Every sign points somewhere that should not fit inside the facility. Something distant learns the rhythm of your steps.",
    },
  };

  const locations = [
    "Space Biome",
    "Space Station",
    "Mars Habitat",
    "Orbital Greenhouse",
    "Deep Range Relay",
    "Lunar Research Annex",
    "Asteroid Mining Habitat",
    "Europa Ice Station",
  ];

  const facilityNames = [
    "Nargpalm",
    "Eidolon",
    "Kestrel Nine",
    "Aster Vale",
    "Morrowglass",
    "Nyx Orchard",
    "Vanta Reef",
    "Helix Dawn",
    "Orison",
    "Caldera Array",
    "Blackwell",
    "Cinder Vault",
    "Kairo Spire",
    "Nadir Bloom",
    "Glass Meridian",
    "Warden Loop",
    "Oberon Gate",
    "Riven Halo",
    "Solace Yard",
    "Kestrel Verge",
  ];

  const playerNames = [
    "Dr. Mara Vale",
    "Eli Renn",
    "Sable Korr",
    "Jun Park",
    "Talia Voss",
    "Noah Quill",
    "Iris Halden",
    "Ren Ash",
  ];

  const threats = [
    {
      id: "gene",
      name: "genetically created monster",
      label: "bio-signature",
      clue: "The creature was grown from security tissue and trained on your voice.",
    },
    {
      id: "alien",
      name: "alien infiltrator",
      label: "unknown lifeform",
      clue: "The visitor only appears on cameras that are not connected to power.",
    },
    {
      id: "zombie",
      name: "reanimated crew",
      label: "crew echo",
      clue: "The dead walk slowly until they hear a door decide to open.",
    },
    {
      id: "machine",
      name: "maintenance intelligence",
      label: "machine pursuit",
      clue: "The station repair system has mistaken living bodies for broken parts.",
    },
    {
      id: "parasite",
      name: "black root parasite",
      label: "botanical breach",
      clue: "The growth remembers every room it has touched and keeps reaching for new lungs.",
    },
    {
      id: "shadow",
      name: "pressure-suit shadow",
      label: "suit signal",
      clue: "The suit is empty until a door opens. Then it walks like it has been waiting.",
    },
  ];

  const difficulties = {
    easy: { label: "Easy", range: [100, 120], visibleGoals: 4, hiddenRoomCount: 0 },
    medium: { label: "Medium", range: [90, 110], visibleGoals: 2, hiddenRoomCount: 2 },
    hard: { label: "Hard", range: [70, 92], visibleGoals: 1, hiddenRoomCount: 99 },
  };

  const gameNames = [
    "Wake Protocol",
    "The Last Corridor",
    "Echoes In The Biome",
    "Hallway Zero",
    "Nargpalm Wakes",
    "The Breathing Station",
    "Noon On Mars",
  ];

  const goalPool = [
    { id: "identity", text: "Recover your identity from the wrist band.", requires: "identity", core: true },
    { id: "map", text: "Restore a facility map or route cache.", requires: "map", core: true },
    { id: "escape", text: "Arm the emergency transport and leave.", requires: "escape", core: true },
    { id: "console", text: "Recover the release note from a damaged console.", requires: "console" },
    { id: "med_cache", text: "Find a medical record that explains why one patient remains.", requires: "med_cache" },
    { id: "biome_sample", text: "Seal a sample from the corrupted plant towers.", requires: "biome_sample" },
    { id: "reactor_reading", text: "Collect the reactor timing code.", requires: "reactor_reading" },
  ];

  const transitions = [
    {
      id: "cryo_room_to_hallway",
      group: "room_transitions",
      label: "cryo_room to hallway",
      file: "cryo_room_to_hallway.mp4",
      src: "videos/cryo_room_to_hallway.mp4",
      poster: "images/cryo_room.jpg",
      startImage: "images/cryo_room.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves a cracked cryogenic room, passes through the only exit door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_cryo_room",
      group: "room_transitions",
      label: "cryo_room from hallway",
      file: "hallway_to_cryo_room.mp4",
      src: "videos/hallway_to_cryo_room.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/cryo_room.jpg",
      promptText: "camera moves from the central hallway through a sealed cryogenic door and ends inside the cracked cryo_room",
      status: "Approved candidate for hallway-to-room transition.",
    },
    {
      id: "med_bay_to_hallway",
      group: "room_transitions",
      label: "med_bay to hallway",
      file: "med_bay_to_hallway.mp4",
      src: "videos/med_bay_to_hallway.mp4",
      poster: "images/med_bay.jpg",
      startImage: "images/med_bay.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves an abandoned futuristic med bay, passes through the only exit door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_med_bay",
      group: "room_transitions",
      label: "med_bay from hallway",
      file: "hallway_to_med_bay.mp4",
      src: "videos/hallway_to_med_bay.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/med_bay.jpg",
      promptText: "camera moves from the central hallway through a sealed medical door and ends inside the abandoned med bay",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hydroponic_biome_to_hallway",
      group: "room_transitions",
      label: "hydroponic_biome to hallway",
      file: "hydroponic_biome_to_hallway.mp4",
      src: "videos/hydroponic_biome_to_hallway.mp4",
      poster: "images/hydroponic_biome.jpg",
      startImage: "images/hydroponic_biome.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves an overgrown hydroponic biome chamber, passes through the airlock door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_hydroponic_biome",
      group: "room_transitions",
      label: "hydroponic_biome from hallway",
      file: "hallway_to_hydroponic_biome.mp4",
      src: "videos/hallway_to_hydroponic_biome.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/hydroponic_biome.jpg",
      promptText: "camera moves from the central hallway through a fogged airlock and ends inside the overgrown hydroponic biome",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "reactor_gallery_to_hallway",
      group: "room_transitions",
      label: "reactor_gallery to hallway",
      file: "reactor_gallery_to_hallway.mp4",
      src: "videos/reactor_gallery_to_hallway.mp4",
      poster: "images/reactor_gallery.jpg",
      startImage: "images/reactor_gallery.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves a narrow reactor gallery, passes through the reinforced exit door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_reactor_gallery",
      group: "room_transitions",
      label: "reactor_gallery from hallway",
      file: "hallway_to_reactor_gallery.mp4",
      src: "videos/hallway_to_reactor_gallery.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/reactor_gallery.jpg",
      promptText: "camera moves from the central hallway through a reinforced service door and ends inside the glowing reactor gallery",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "cryo_room_event_collapse",
      group: "possible_other_transition",
      label: "cryo_room collapse event",
      file: "cryo_room_event_collapse.mp4",
      src: "videos/cryo_room_event_collapse.mp4",
      poster: "images/cryo_room.jpg",
      status: "Visually strong but inaccurate as hallway exit. Candidate bad ending or room-event clip.",
    },
  ];

  const introPlaylist = [
    transitions[1],
    transitions[5],
    transitions[7],
  ];

  transitions.forEach(transition => {
    if (transition.group === "room_transitions" && typeof transition.trimEnd !== "number") {
      transition.trimStart = 0;
      transition.trimEnd = 3.04;
    }
  });

  const mediaManifest = [
    { type: "image", src: "images/cryo_room.jpg", required: true, label: "Cryo room still" },
    { type: "image", src: "images/hallway.jpg", required: false, label: "Hallway still" },
    { type: "image", src: "images/med_bay.jpg", required: false, label: "Med bay still" },
    { type: "image", src: "images/hydroponic_biome.jpg", required: false, label: "Hydroponic biome still" },
    { type: "image", src: "images/reactor_gallery.jpg", required: false, label: "Reactor gallery still" },
    { type: "video", src: "videos/cryo_room_to_hallway.mp4", required: true, label: "cryo_room to hallway transition" },
    { type: "video", src: "videos/hallway_to_cryo_room.mp4", required: true, label: "cryo_room from hallway transition" },
    { type: "video", src: "videos/med_bay_to_hallway.mp4", required: false, label: "med_bay to hallway transition" },
    { type: "video", src: "videos/hallway_to_med_bay.mp4", required: false, label: "med_bay from hallway transition" },
    { type: "video", src: "videos/hydroponic_biome_to_hallway.mp4", required: false, label: "hydroponic_biome to hallway transition" },
    { type: "video", src: "videos/hallway_to_hydroponic_biome.mp4", required: false, label: "hydroponic_biome from hallway transition" },
    { type: "video", src: "videos/reactor_gallery_to_hallway.mp4", required: false, label: "reactor_gallery to hallway transition" },
    { type: "video", src: "videos/hallway_to_reactor_gallery.mp4", required: false, label: "reactor_gallery from hallway transition" },
    { type: "video", src: "videos/cryo_room_event_collapse.mp4", required: false, label: "cryo_room event candidate" },
  ];

  const actions = {
    cryo_room: [
      {
        id: "scan_band",
        label: "Scan wrist band",
        side: "sub",
        hint: "identity",
        turns: 1,
        once: true,
        run(state) {
          state.flags.identity = true;
          addUnique(state.inventory, `${state.playerName} wrist band`);
          state.playerRevealed = true;
          return `The band resolves: ${state.playerName}. The facility redacts why you were asleep.`;
        },
      },
      {
        id: "check_locker",
        label: "Open equipment locker",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          addUnique(state.inventory, "Emergency light");
          addUnique(state.inventory, "Cryo-safe multitool");
          return "The locker pops open with a sigh. The light flickers green, then points itself toward the hall.";
        },
      },
      {
        id: "read_console",
        label: "Read cracked console",
        side: "sub",
        hint: "goals",
        turns: 1,
        once: true,
        run(state) {
          state.flags.console = true;
          return `The console prints one clean line: ${state.threat.name.toUpperCase()} released during evacuation.`;
        },
      },
      {
        id: "go_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    med_bay: [
      {
        id: "med_cache",
        label: "Search med console",
        side: "sub",
        hint: "clue",
        turns: 1,
        once: true,
        run(state) {
          state.flags.med_cache = true;
          addUnique(state.inventory, "Sedation log");
          return "The med console lists every patient as discharged except you.";
        },
      },
      {
        id: "med_to_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    hydroponic_biome: [
      {
        id: "biome_sample",
        label: "Check plant towers",
        side: "sub",
        hint: "sample",
        turns: 1,
        once: true,
        run(state) {
          state.flags.biome_sample = true;
          addUnique(state.inventory, "Black leaf sample");
          return "The plant sample curls toward your wrist band before you seal it away.";
        },
      },
      {
        id: "biome_to_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    reactor_gallery: [
      {
        id: "reactor_reading",
        label: "Read reactor pulse",
        side: "sub",
        hint: "power",
        turns: 1,
        once: true,
        run(state) {
          state.flags.reactor_reading = true;
          addUnique(state.inventory, "Reactor timing code");
          return "The reactor pulse repeats your missing name in machine timing.";
        },
      },
      {
        id: "reactor_to_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    hallway: [
      {
        id: "route_cache",
        label: "Pull route cache",
        side: "sub",
        hint: "map",
        turns: 1,
        once: true,
        run(state) {
          state.flags.map = true;
          addUnique(state.inventory, "Partial facility map");
          return "A wall panel unlocks. The map is incomplete, but it proves the emergency transport is one junction away.";
        },
      },
      {
        id: "listen",
        label: "Listen at the vents",
        side: "sub",
        hint: "risk",
        turns: 1,
        run(state) {
          state.threatPressure += 1;
          return `A sound answers from three vents at once. The ${state.threat.name} is closer than the map admits.`;
        },
      },
      {
        id: "escape",
        label: "Arm transport tube",
        side: "exit",
        hint: "escape",
        turns: 1,
        run(state) {
          if (!state.flags.identity || !state.flags.map) {
            state.threatPressure += 2;
            return "The tube refuses a nameless passenger on an unknown route. Somewhere behind you, claws find metal.";
          }
          state.ending = "escape";
          return "The tube accepts your band and burns a path through the dark.";
        },
      },
      {
        id: "return_cryo_room",
        label: "Enter cryo_room",
        side: "exit",
        hint: "transition",
        target: "cryo_room",
        turns: 1,
      },
      {
        id: "enter_med_bay",
        label: "Enter med_bay",
        side: "exit",
        hint: "transition",
        target: "med_bay",
        turns: 1,
      },
      {
        id: "enter_biome",
        label: "Enter biome",
        side: "exit",
        hint: "transition",
        target: "hydroponic_biome",
        turns: 1,
      },
      {
        id: "enter_reactor",
        label: "Enter reactor",
        side: "exit",
        hint: "transition",
        target: "reactor_gallery",
        turns: 1,
      },
    ],
  };

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

  window.CodexHorrorStory = {
    version: "0.1",
    rooms,
    actions,
    goals: goalPool,
    transitions,
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
      const startRoom = randomItem(["cryo_room", "med_bay"], rng);
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
