(function () {
  const rooms = {
    suspension: {
      id: "suspension",
      name: "Suspension Room",
      kind: "room",
      poster: "images/suspension_room.jpg",
      idleVideo: "videos/room_to_hallway.mp4",
      toHallway: "videos/room_to_hallway.mp4",
      text: "You wake inside a cracked suspension cradle. Frost runs upward across the glass. A medical band around your wrist keeps rebooting your name.",
    },
    hallway: {
      id: "hallway",
      name: "Central Hallway",
      kind: "hallway",
      poster: "images/hallway.jpg",
      idleVideo: "videos/hallway_to_room.mp4",
      toRoom: "videos/hallway_to_room.mp4",
      text: "The hallway breathes through vents in the floor. Every sign points somewhere that should not fit inside the facility. Something distant learns the rhythm of your steps.",
    },
  };

  const locations = [
    "Space Biome",
    "Space Station",
    "Mars Habitat",
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
  ];

  const difficulties = {
    easy: { label: "Easy", range: [100, 120], visibleGoals: 3 },
    medium: { label: "Medium", range: [90, 110], visibleGoals: 2 },
    hard: { label: "Hard", range: [70, 92], visibleGoals: 1 },
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

  const goals = [
    { id: "identity", text: "Recover your identity from the wrist band." },
    { id: "map", text: "Restore a facility map or route cache." },
    { id: "escape", text: "Arm the emergency transport and leave." },
  ];

  const transitions = [
    {
      id: "room_to_hallway",
      label: "Suspension Room to Hallway",
      file: "room_to_hallway.mp4",
      src: "videos/room_to_hallway.mp4",
      poster: "images/suspension_room.jpg",
      status: "Review: visually strong, inaccurate as hallway exit, candidate bad ending.",
    },
    {
      id: "hallway_to_room",
      label: "Hallway to Suspension Room",
      file: "hallway_to_room.mp4",
      src: "videos/hallway_to_room.mp4",
      poster: "images/hallway.jpg",
      status: "Approved candidate for hallway-to-room transition.",
    },
  ];

  const introPlaylist = [
    transitions[1],
    transitions[0],
  ];

  const mediaManifest = [
    { type: "image", src: "images/suspension_room.jpg", required: true, label: "Suspension room still" },
    { type: "image", src: "images/hallway.jpg", required: false, label: "Hallway still" },
    { type: "video", src: "videos/room_to_hallway.mp4", required: true, label: "Room to hallway transition" },
    { type: "video", src: "videos/hallway_to_room.mp4", required: false, label: "Hallway to room transition" },
  ];

  const actions = {
    suspension: [
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
        id: "return_room",
        label: "Return to room",
        side: "exit",
        hint: "transition",
        target: "suspension",
        turns: 1,
      },
    ],
  };

  function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function addUnique(list, item) {
    if (!list.includes(item)) list.push(item);
  }

  window.CodexHorrorStory = {
    version: "0.1",
    rooms,
    actions,
    goals,
    transitions,
    introPlaylist,
    mediaManifest,
    gameNames,
    difficulties,
    createRun(difficultyId = "medium") {
      const difficulty = difficulties[difficultyId] || difficulties.medium;
      const location = randomItem(locations);
      const prefix = randomItem(facilityNames);
      const threat = randomItem(threats);
      const limit = randomInt(difficulty.range[0], difficulty.range[1]);
      return {
        active: true,
        ended: false,
        version: "0.1",
        difficultyId,
        difficultyLabel: difficulty.label,
        turn: 1,
        turnLimit: limit,
        turnRange: difficulty.range.slice(),
        visibleGoals: difficulty.visibleGoals,
        facilityPrefix: prefix,
        location,
        facility: `${prefix} ${location}`,
        playerName: randomItem(playerNames),
        playerRevealed: false,
        threat,
        threatPressure: 0,
        currentRoom: "suspension",
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
