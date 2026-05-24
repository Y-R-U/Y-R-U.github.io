(function () {
  const rooms = {
    cryo_room: {
      id: "cryo_room",
      name: "Cryo Room",
      kind: "sleeping",
      canStart: true,
      poster: "images/cryo_room.jpg",
      idleVideo: "videos/cryo_room_to_hallway.mp4",
      toHallway: "videos/cryo_room_to_hallway.mp4",
      fromHallway: "videos/hallway_to_cryo_room.mp4",
      text: "You wake inside a cracked suspension cradle. Frost runs upward across the glass. A medical band around your wrist keeps rebooting your name.",
    },
    med_bay: {
      id: "med_bay",
      name: "Med Bay",
      kind: "sleeping",
      canStart: true,
      poster: "images/med_bay.jpg",
      idleVideo: "videos/med_bay_to_hallway.mp4",
      toHallway: "videos/med_bay_to_hallway.mp4",
      fromHallway: "videos/hallway_to_med_bay.mp4",
      text: "Empty diagnostic beds wait under soft surgical light. The med bay smells too clean for somewhere abandoned.",
    },
    hydroponic_biome: {
      id: "hydroponic_biome",
      name: "Hydroponic Biome",
      kind: "wild",
      poster: "images/hydroponic_biome.jpg",
      idleVideo: "videos/hydroponic_biome_to_hallway.mp4",
      toHallway: "videos/hydroponic_biome_to_hallway.mp4",
      fromHallway: "videos/hallway_to_hydroponic_biome.mp4",
      text: "Mist clings to vertical plant towers. Something has learned to breathe through the roots.",
    },
    reactor_gallery: {
      id: "reactor_gallery",
      name: "Reactor Gallery",
      kind: "power_like",
      poster: "images/reactor_gallery.jpg",
      idleVideo: "videos/reactor_gallery_to_hallway.mp4",
      toHallway: "videos/reactor_gallery_to_hallway.mp4",
      fromHallway: "videos/hallway_to_reactor_gallery.mp4",
      text: "The reactor gallery hums behind ribbed glass. Each pulse of light turns the shadows into machinery.",
    },
    security_hub: {
      id: "security_hub",
      name: "Security Hub",
      kind: "study_like",
      canStart: true,
      poster: "images/security_hub.jpg",
      idleVideo: "videos/security_hub_to_hallway.mp4",
      toHallway: "videos/security_hub_to_hallway.mp4",
      fromHallway: "videos/hallway_to_security_hub.mp4",
      text: "Dark monitors tile the security hub. One camera still follows you even when you stop moving.",
    },
    observation_deck: {
      id: "observation_deck",
      name: "Observation Deck",
      kind: "lounge_like",
      canStart: true,
      poster: "images/observation_deck.jpg",
      idleVideo: "videos/observation_deck_to_hallway.mp4",
      toHallway: "videos/observation_deck_to_hallway.mp4",
      fromHallway: "videos/hallway_to_observation_deck.mp4",
      text: "The observation deck looks out over impossible distance. The glass shows stars, a red planet, and one reflection that is not yours.",
    },
    engineering_bay: {
      id: "engineering_bay",
      name: "Engineering Bay",
      kind: "power_like",
      poster: "images/engineering_bay.jpg",
      idleVideo: "videos/engineering_bay_to_hallway.mp4",
      toHallway: "videos/engineering_bay_to_hallway.mp4",
      fromHallway: "videos/hallway_to_engineering_bay.mp4",
      text: "Repair arms hang over the engineering bay like paused lightning. Every tool is clean except the one missing from its cradle.",
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

  const roomTemplates = {
    cryo_room: rooms.cryo_room,
    med_bay: rooms.med_bay,
    hydroponic_biome: rooms.hydroponic_biome,
    reactor_gallery: rooms.reactor_gallery,
    security_hub: rooms.security_hub,
    observation_deck: rooms.observation_deck,
    engineering_bay: rooms.engineering_bay,
  };

  function addRoom(id, opts) {
    if (rooms[id]) return;
    rooms[id] = {
      id,
      name: opts.name,
      kind: opts.kind,
      canStart: !!opts.canStart,
      poster: `images/${id}.jpg`,
      idleVideo: `videos/${id}_to_hallway.mp4`,
      toHallway: `videos/${id}_to_hallway.mp4`,
      fromHallway: `videos/hallway_to_${id}.mp4`,
      mediaTemplate: opts.template,
      text: opts.text,
    };
  }

  [
    ["science_lab", {
      name: "Science Lab",
      kind: "study_like",
      template: "med_bay",
      canStart: true,
      text: "A science lab waits under white panels and blue hazard glass. Every bench is clean except for one fresh smear beside the analyser.",
    }],
    ["bloody_lab", {
      name: "Bloody Lab",
      kind: "study_like",
      template: "med_bay",
      text: "The lab equipment is intact, but the floor tells a different story. Red streaks lead from the sample fridge to a sealed drain.",
    }],
    ["quarantine_lab", {
      name: "Quarantine Lab",
      kind: "sleeping",
      template: "med_bay",
      canStart: true,
      text: "Transparent quarantine curtains hang in layers. One isolation bed is strapped down as if the patient tried to leave with the whole room attached.",
    }],
    ["genetics_lab", {
      name: "Genetics Lab",
      kind: "study_like",
      template: "security_hub",
      text: "Gene sequencers blink in standby. The newest sample tray carries your old crew number beside a warning symbol nobody explained.",
    }],
    ["specimen_vault", {
      name: "Specimen Vault",
      kind: "storage_like",
      template: "engineering_bay",
      text: "Cold drawers line the specimen vault. Most labels are printed. Three are written by hand and crossed out twice.",
    }],
    ["cold_storage", {
      name: "Cold Storage",
      kind: "storage_like",
      template: "cryo_room",
      text: "Frost seals the cold storage lockers. Something inside one of them taps once, waits, then taps in the rhythm of your breathing.",
    }],
    ["supply_depot", {
      name: "Supply Depot",
      kind: "storage_like",
      template: "engineering_bay",
      text: "Stacked supply crates form narrow paths. The manifest says nothing is missing, which is worse than a theft.",
    }],
    ["cargo_lock", {
      name: "Cargo Lock",
      kind: "storage_like",
      template: "engineering_bay",
      text: "Magnetic cargo clamps hold empty pallets in place. The pressure door is dented from the inside.",
    }],
    ["mess_hall", {
      name: "Mess Hall",
      kind: "kitchen_like",
      template: "observation_deck",
      canStart: true,
      text: "The mess hall tables are set for a meal that never happened. Cups tremble each time the ventilation changes pitch.",
    }],
    ["galley", {
      name: "Galley",
      kind: "kitchen_like",
      template: "med_bay",
      text: "Compact ovens line the galley wall. One ration printer keeps trying to print a meal for someone not on the roster.",
    }],
    ["nutrient_kitchen", {
      name: "Nutrient Kitchen",
      kind: "kitchen_like",
      template: "hydroponic_biome",
      text: "Green nutrient tanks bubble behind sealed panels. The mixing paddle moves even though the power switch is off.",
    }],
    ["drone_workshop", {
      name: "Drone Workshop",
      kind: "power_like",
      template: "engineering_bay",
      text: "Small service drones hang from charging hooks. Their lenses turn toward you a second after you look away.",
    }],
    ["robotics_bay", {
      name: "Robotics Bay",
      kind: "power_like",
      template: "engineering_bay",
      text: "Half-built frames sleep in the robotics bay. One arm has scratched the same word into the bench until the metal thinned.",
    }],
    ["coolant_works", {
      name: "Coolant Works",
      kind: "power_like",
      template: "reactor_gallery",
      text: "Blue coolant tubes cross the ceiling like veins. The gauges dip whenever the hallway lights flicker.",
    }],
    ["airlock_control", {
      name: "Airlock Control",
      kind: "study_like",
      template: "security_hub",
      text: "Airlock controls glow behind a cracked shield. The last cycle log says someone opened the outer door from this side.",
    }],
    ["comms_array", {
      name: "Comms Array",
      kind: "study_like",
      template: "observation_deck",
      text: "The comms array listens to static from too many directions. A carrier signal repeats your wake-up time.",
    }],
    ["server_crypt", {
      name: "Server Crypt",
      kind: "study_like",
      template: "security_hub",
      text: "Server racks hum behind black mesh. The cold aisle smells like dust, ozone, and old secrets kept alive by backup power.",
    }],
    ["navigation_nest", {
      name: "Navigation Nest",
      kind: "lounge_like",
      template: "observation_deck",
      text: "A recessed navigation nest curves around the viewport. Someone left escape vectors pinned under a coffee mug.",
    }],
    ["crew_lounge", {
      name: "Crew Lounge",
      kind: "lounge_like",
      template: "observation_deck",
      canStart: true,
      text: "The crew lounge still tries to be comfortable. Collapsed cushions face the viewport, waiting for a shift change that never comes.",
    }],
    ["sleep_pods", {
      name: "Sleep Pods",
      kind: "sleeping",
      template: "cryo_room",
      canStart: true,
      text: "Sleep pods curve along the wall in neat rows. One pod door is open, and its blankets are folded with military care.",
    }],
    ["isolation_ward", {
      name: "Isolation Ward",
      kind: "sleeping",
      template: "med_bay",
      canStart: true,
      text: "The isolation ward smells of antiseptic and burnt plastic. The privacy screens show silhouettes even when nothing stands behind them.",
    }],
    ["algae_tanks", {
      name: "Algae Tanks",
      kind: "wild",
      template: "hydroponic_biome",
      text: "Tall algae tanks glow emerald in the dark. Air bubbles climb in patterns that look almost like code.",
    }],
    ["fungal_nursery", {
      name: "Fungal Nursery",
      kind: "wild",
      template: "hydroponic_biome",
      text: "Soft fungal trays pulse under amber lamps. Spores drift in the air and avoid the places your shadow falls.",
    }],
    ["terraforming_core", {
      name: "Terraforming Core",
      kind: "power_like",
      template: "reactor_gallery",
      text: "The terraforming core turns planetary weather into numbers. One storm cell on the display follows your movement room by room.",
    }],
    ["waste_reclamation", {
      name: "Waste Reclamation",
      kind: "power_like",
      template: "hydroponic_biome",
      text: "Waste reclamation tanks churn slowly. The filters are clogged with fibres that look too much like hair.",
    }],
    ["chapel_module", {
      name: "Chapel Module",
      kind: "lounge_like",
      template: "observation_deck",
      text: "A tiny chapel module faces the stars. The prayer wall has been overwritten with coordinates and apologies.",
    }],
    ["black_box_archive", {
      name: "Black Box Archive",
      kind: "storage_like",
      template: "security_hub",
      text: "Black boxes sit in padded slots from floor to ceiling. The newest slot is empty, and its status light is still warm.",
    }],
    ["eva_ready_room", {
      name: "EVA Ready Room",
      kind: "storage_like",
      template: "engineering_bay",
      text: "Suit lockers stand open in the EVA ready room. Each helmet faces the door as if waiting for inspection.",
    }],
  ].forEach(([id, opts]) => addRoom(id, opts));

  const locations = [
    "Space Biome",
    "Space Station",
    "Mars Habitat",
    "Orbital Greenhouse",
    "Deep Range Relay",
    "Lunar Research Annex",
    "Asteroid Mining Habitat",
    "Europa Ice Station",
    "Titan Methane Lab",
    "Venus Cloud Platform",
    "Kuiper Ark",
    "Oort Signal Station",
    "Deep Void Conservatory",
    "Phobos Quarantine Annex",
    "Deimos Relay Habitat",
    "Ceres Ice Refinery",
    "Io Radiation Shelter",
    "Ganymede Research Ring",
    "Enceladus Ocean Drill",
    "Rogue Planet Outpost",
    "Solar Mirror Array",
    "Generation Ship",
    "Terraforming Cradle",
    "Black Site Observatory",
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
    "Axiom Hollow",
    "Blue Casket",
    "Crownfall",
    "Dawn Needle",
    "Erebus Spoke",
    "Faraday Bloom",
    "Grief Lantern",
    "Harrow Nine",
    "Icarus Fold",
    "Juno Drift",
    "Kelvin Orchard",
    "Lazarus Reef",
    "Manta Spire",
    "Null Harbor",
    "Ossuary Loop",
    "Pale Meridian",
    "Quartz Warden",
    "Red Agnes",
    "Sable Gate",
    "Tarn Relay",
    "Umbral Yard",
    "Vesper Coil",
    "Winterglass",
    "Xeno Vale",
    "Yarrow Crown",
    "Zenith Hold",
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
    {
      id: "mimic",
      name: "voice mimic",
      label: "false rescue call",
      clue: "It speaks in every missing crew voice, but always uses your name first.",
    },
    {
      id: "swarm",
      name: "nanite swarm",
      label: "grey cloud",
      clue: "The swarm repairs the facility by taking apart anything warm enough to move.",
    },
    {
      id: "frost",
      name: "cryogenic wraith",
      label: "cold signature",
      clue: "Every room it enters drops below freezing, but the cameras show only condensation.",
    },
    {
      id: "radiant",
      name: "radiation revenant",
      label: "hot silhouette",
      clue: "Its outline blooms on radiation sensors long before anything visible arrives.",
    },
    {
      id: "mirror",
      name: "mirror duplicate",
      label: "identity echo",
      clue: "The duplicate wears your face badly, like it learned you from corrupted footage.",
    },
    {
      id: "siren",
      name: "emergency siren host",
      label: "alarm parasite",
      clue: "The alarm is not warning you about the creature. The alarm is how it hunts.",
    },
    {
      id: "warden",
      name: "containment warden",
      label: "lockdown body",
      clue: "The warden was built to keep experiments inside. It no longer distinguishes staff from breach.",
    },
    {
      id: "spore",
      name: "breathing spore mass",
      label: "spore bloom",
      clue: "The bloom follows airflow maps and gathers wherever frightened people would hide.",
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
    "Wake Protocol",
    "The Last Corridor",
    "Echoes In The Biome",
    "Hallway Zero",
    "Nargpalm Wakes",
    "The Breathing Station",
    "Noon On Mars",
  ];

  // Identity lives in taskGroups as the only mandatory task. Escape stays
  // here as the overall objective; room-specific entries are random
  // optional tasks.
  const goalPool = [
    { id: "escape", text: "Final objective: arm the emergency transport after the tasks are complete.", requires: "escape", core: true },
    { id: "console", text: "Recover the release note from a damaged console.", requires: "console", rooms: ["cryo_room"] },
    { id: "med_cache", text: "Find a medical record that explains why one patient remains.", requires: "med_cache", rooms: ["med_bay"] },
    { id: "biome_sample", text: "Seal a sample from the corrupted plant towers.", requires: "biome_sample", rooms: ["hydroponic_biome"] },
    { id: "reactor_reading", text: "Collect the reactor timing code.", requires: "reactor_reading", rooms: ["reactor_gallery"] },
    { id: "security_log", text: "Recover the last security log.", requires: "security_log", rooms: ["security_hub"] },
    { id: "starfix", text: "Find and align the navigation star fix.", requires: "starfix", rooms: ["observation_deck"] },
    { id: "toolmark", text: "Find the missing engineering tool.", requires: "toolmark", rooms: ["engineering_bay"] },
  ];

  function incompleteTaskGoals(state) {
    const goals = Array.isArray(state.goals) ? state.goals : [];
    return goals.filter(goal => {
      if (!goal || goal.id === "escape") return false;
      if (state.flags[`goal_${goal.id}`]) return false;
      return goal.requires && !state.flags[goal.requires];
    });
  }

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
      id: "security_hub_to_hallway",
      group: "room_transitions",
      label: "security_hub to hallway",
      file: "security_hub_to_hallway.mp4",
      src: "videos/security_hub_to_hallway.mp4",
      poster: "images/security_hub.jpg",
      startImage: "images/security_hub.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves a compact security hub with dark surveillance monitors, passes through the armored exit door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_security_hub",
      group: "room_transitions",
      label: "security_hub from hallway",
      file: "hallway_to_security_hub.mp4",
      src: "videos/hallway_to_security_hub.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/security_hub.jpg",
      promptText: "camera moves from the central hallway through an armored security door and ends inside the compact surveillance hub",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "observation_deck_to_hallway",
      group: "room_transitions",
      label: "observation_deck to hallway",
      file: "observation_deck_to_hallway.mp4",
      src: "videos/observation_deck_to_hallway.mp4",
      poster: "images/observation_deck.jpg",
      startImage: "images/observation_deck.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves a tall observation deck with a panoramic space window, passes through the sealed exit door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_observation_deck",
      group: "room_transitions",
      label: "observation_deck from hallway",
      file: "hallway_to_observation_deck.mp4",
      src: "videos/hallway_to_observation_deck.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/observation_deck.jpg",
      promptText: "camera moves from the central hallway through a sealed viewing door and ends inside the lonely observation deck",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "engineering_bay_to_hallway",
      group: "room_transitions",
      label: "engineering_bay to hallway",
      file: "engineering_bay_to_hallway.mp4",
      src: "videos/engineering_bay_to_hallway.mp4",
      poster: "images/engineering_bay.jpg",
      startImage: "images/engineering_bay.jpg",
      endImage: "images/hallway.jpg",
      promptText: "camera leaves an industrial engineering bay with suspended repair arms, passes through the heavy exit door, and ends in the central hallway",
      status: "New 3.04s intended transition. Needs review.",
    },
    {
      id: "hallway_to_engineering_bay",
      group: "room_transitions",
      label: "engineering_bay from hallway",
      file: "hallway_to_engineering_bay.mp4",
      src: "videos/hallway_to_engineering_bay.mp4",
      poster: "images/hallway.jpg",
      startImage: "images/hallway.jpg",
      endImage: "images/engineering_bay.jpg",
      promptText: "camera moves from the central hallway through a heavy maintenance door and ends inside the industrial engineering bay",
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

  function transitionPromptRoomName(room) {
    return room.name.toLowerCase().replace(/\s+/g, " ");
  }

  function ensureRoomTransitionPair(roomId) {
    const room = rooms[roomId];
    if (!room || roomId === "hallway") return;
    const roomName = transitionPromptRoomName(room);
    const toId = `${roomId}_to_hallway`;
    const fromId = `hallway_to_${roomId}`;
    if (!transitions.some(transition => transition.id === toId)) {
      transitions.push({
        id: toId,
        group: "room_transitions",
        label: `${roomId} to hallway`,
        file: `${toId}.mp4`,
        src: `videos/${toId}.mp4`,
        poster: `images/${roomId}.jpg`,
        startImage: `images/${roomId}.jpg`,
        endImage: "images/hallway.jpg",
        promptText: `camera leaves the ${roomName}, passes through the only exit door, and ends in the central hallway`,
        status: "Generated from expanded room catalogue. Needs review.",
      });
    }
    if (!transitions.some(transition => transition.id === fromId)) {
      transitions.push({
        id: fromId,
        group: "room_transitions",
        label: `${roomId} from hallway`,
        file: `${fromId}.mp4`,
        src: `videos/${fromId}.mp4`,
        poster: "images/hallway.jpg",
        startImage: "images/hallway.jpg",
        endImage: `images/${roomId}.jpg`,
        promptText: `camera moves from the central hallway through a sealed door and ends inside the ${roomName}`,
        status: "Generated from expanded room catalogue. Needs review.",
      });
    }
  }

  Object.keys(rooms).forEach(ensureRoomTransitionPair);

  const introPlaylist = [
    transitions[1],
    transitions[5],
    transitions[7],
  ];

  const eventVideos = {
    release: {
      gene: "videos/monster_release_gene.mp4",
      alien: "videos/monster_release_alien.mp4",
      zombie: "videos/monster_release_zombie.mp4",
      machine: "videos/monster_release_machine.mp4",
      parasite: "videos/monster_release_parasite.mp4",
      shadow: "videos/monster_release_shadow.mp4",
      mimic: "videos/monster_release_mimic.mp4",
      swarm: "videos/monster_release_swarm.mp4",
      frost: "videos/monster_release_frost.mp4",
      radiant: "videos/monster_release_radiant.mp4",
      mirror: "videos/monster_release_mirror.mp4",
      siren: "videos/monster_release_siren.mp4",
      warden: "videos/monster_release_warden.mp4",
      spore: "videos/monster_release_spore.mp4",
      default: "videos/monster_release_gene.mp4",
    },
    attack: {
      gene: "videos/monster_attack_gene.mp4",
      alien: "videos/monster_attack_alien.mp4",
      zombie: "videos/monster_attack_zombie.mp4",
      machine: "videos/monster_attack_machine.mp4",
      parasite: "videos/monster_attack_parasite.mp4",
      shadow: "videos/monster_attack_shadow.mp4",
      mimic: "videos/monster_attack_mimic.mp4",
      swarm: "videos/monster_attack_swarm.mp4",
      frost: "videos/monster_attack_frost.mp4",
      radiant: "videos/monster_attack_radiant.mp4",
      mirror: "videos/monster_attack_mirror.mp4",
      siren: "videos/monster_attack_siren.mp4",
      warden: "videos/monster_attack_warden.mp4",
      spore: "videos/monster_attack_spore.mp4",
      default: "videos/monster_attack_gene.mp4",
    },
    victory: [
      "videos/ending_victory_transport_tube.mp4",
      "videos/ending_victory_shuttle_launch.mp4",
      "videos/ending_victory_escape_pod_drift.mp4",
      "videos/ending_victory_surface_dawn.mp4",
    ],
  };

  transitions.forEach(transition => {
    if (transition.group === "room_transitions" && typeof transition.trimEnd !== "number") {
      transition.trimStart = 0;
      // Negative = stop this many seconds before the natural end; the last
      // ~0.4s of these clips is unreliable tail, so cut it and hold the still.
      transition.trimEnd = -0.4;
    }
  });

  function buildMediaManifest() {
    const seen = new Set();
    const manifest = [];
    const add = item => {
      if (!item || !item.src || seen.has(item.src)) return;
      seen.add(item.src);
      manifest.push(item);
    };
    Object.values(rooms).forEach(room => {
      add({ type: "image", src: room.poster, required: room.id === "cryo_room", label: `${room.name} still` });
    });
    transitions.forEach(transition => {
      add({ type: "video", src: transition.src, required: transition.id === "cryo_room_to_hallway" || transition.id === "hallway_to_cryo_room", label: transition.label || transition.id });
    });
    ["release", "attack"].forEach(group => {
      Object.entries(eventVideos[group] || {}).forEach(([id, src]) => {
        if (id === "default") return;
        add({ type: "video", src, required: false, label: `${id} monster ${group}` });
      });
    });
    (eventVideos.victory || []).forEach(src => {
      add({ type: "video", src, required: false, label: src.replace(/^videos\//, "").replace(/\.mp4$/, "") });
    });
    return manifest;
  }

  const mediaManifest = buildMediaManifest();

  const actions = {
    cryo_room: [
      // scan_band used to live here as the hardcoded identity action.
      // It moved into the identity_find taskGroup (any-room placement)
      // so the identity goal isn't tied to one specific start room.
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
          return `The console recovers one corrupted release note: ${state.threat.name.toUpperCase()} was listed as contained, then manually overwritten.`;
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
    security_hub: [
      {
        id: "security_log",
        label: "Review security log",
        side: "sub",
        hint: "clue",
        turns: 1,
        once: true,
        run(state) {
          state.flags.security_log = true;
          addUnique(state.inventory, "Last security log");
          return "The security log shows every evacuation route closing from the inside.";
        },
      },
      {
        id: "security_to_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    observation_deck: [
      {
        id: "starfix",
        label: "Align star fix",
        side: "sub",
        hint: "route",
        turns: 1,
        once: true,
        run(state) {
          state.flags.starfix = true;
          addUnique(state.inventory, "Emergency star fix");
          return "The deck aligns three stars and tells you the facility is not where the map says it is.";
        },
      },
      {
        id: "check_reflection",
        label: "Check reflection",
        side: "sub",
        hint: "risk",
        turns: 1,
        run(state) {
          state.threatPressure += 1;
          return `Your reflection turns its head late. The ${state.threat.name} has learned another angle.`;
        },
      },
      {
        id: "observation_to_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    engineering_bay: [
      {
        id: "toolmark",
        label: "Search tool cradle",
        side: "sub",
        hint: "supplies",
        turns: 1,
        once: true,
        run(state) {
          state.flags.toolmark = true;
          addUnique(state.inventory, "Mag-sealed cutter");
          return "One tool cradle is empty. The cutter you find nearby is still warm.";
        },
      },
      {
        id: "patch_transport",
        label: "Patch transport relay",
        side: "sub",
        hint: "escape",
        turns: 1,
        once: true,
        run(state) {
          state.flags.transport_patch = true;
          addUnique(state.inventory, "Transport relay patch");
          return "The relay patch gives the transport tube a second route, but something hears the reboot tone.";
        },
      },
      {
        id: "engineering_to_hallway",
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      },
    ],
    hallway: [
      {
        id: "listen",
        label: "Listen at the vents",
        side: "sub",
        hint: "risk",
        turns: 1,
        look: true,
        lookVideo: "videos/look_hallway_vents.mp4",
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
          const remainingTasks = incompleteTaskGoals(state);
          if (!state.flags.identity) {
            state.threatPressure += 2;
            return "The tube refuses a nameless passenger. Somewhere behind you, claws find metal.";
          }
          if (remainingTasks.length) {
            state.threatPressure += 1;
            const noun = remainingTasks.length === 1 ? "task" : "tasks";
            return `The tube opens halfway, then locks. ${remainingTasks.length} ${noun} still need finishing, including any challenge locks in your task list.`;
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
      {
        id: "enter_security",
        label: "Enter security",
        side: "exit",
        hint: "transition",
        target: "security_hub",
        turns: 1,
      },
      {
        id: "enter_observation",
        label: "Enter observation",
        side: "exit",
        hint: "transition",
        target: "observation_deck",
        turns: 1,
      },
      {
        id: "enter_engineering",
        label: "Enter engineering",
        side: "exit",
        hint: "transition",
        target: "engineering_bay",
        turns: 1,
      },
    ],
  };

  // ── Generic flavor "search slots" injected per room kind ─────────────
  // Pure atmosphere: no flag, no inventory, no `once`. The labels are
  // intentionally indistinguishable from placed-task labels so the
  // player can't tell which slots hide real tasks until they click.
  // Burns one turn per click.
  const flavorByKind = {
    sleeping: [
      { id: "open_cradle", label: "Check the cradle",
        text: "The cryo cradle is empty but warm — somebody else slept here recently." },
      { id: "scan_panel", label: "Scan the wall panel",
        text: "The panel cycles through diagnostic codes. None of them mean anything to you anymore." },
    ],
    bath_like: [
      { id: "check_basin", label: "Check the basin",
        text: "The drain holds a single dark hair, longer than yours." },
    ],
    kitchen_like: [
      { id: "check_locker", label: "Open a ration locker",
        text: "Sealed ration packs, all the dates reading next week." },
    ],
    study_like: [
      { id: "tap_terminal", label: "Tap the inactive terminal",
        text: "The screen wakes for a moment, shows a half-deleted log, then sleeps again." },
      { id: "open_filing", label: "Open a filing drawer",
        text: "Personnel folders. The tabs are coded in a colour scheme you don't recognise." },
    ],
    storage_like: [
      { id: "move_pallet", label: "Move a pallet",
        text: "Heavier than the manifest claims. You set it back exactly where it was." },
    ],
    lounge_like: [
      { id: "check_recliner", label: "Check the recliner",
        text: "A novel face-down on the armrest. The bookmark is a hand-drawn map." },
    ],
    wild: [
      { id: "test_humidity", label: "Test the humidity",
        text: "Hot, wet, breathing-back air. The plants tilt very slightly toward you." },
      { id: "probe_soil", label: "Probe the soil",
        text: "The probe meets something that isn't dirt or root — and pulses faintly under your hand." },
    ],
    power_like: [
      { id: "read_load", label: "Read the load gauge",
        text: "Power draw spikes when you look directly at the gauge, then settles when you look away." },
      { id: "check_conduit", label: "Check a conduit",
        text: "Warm. Humming a frequency just above what the human ear is supposed to manage." },
    ],
  };

  // Inject flavor slots into every non-hallway room of a known kind.
  // Goes BEFORE any existing exit action so the room's exit stays last
  // in the sub-action stack.
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];
    if (!room || !room.kind || roomId === "hallway") return;
    const pool = flavorByKind[room.kind] || [];
    if (!actions[roomId]) actions[roomId] = [];
    if (!actions[roomId].some(action => action.target === "hallway")) {
      actions[roomId].push({
        id: `exit_${roomId}`,
        label: "Exit to hallway",
        side: "exit",
        hint: "transition",
        target: "hallway",
        turns: 1,
      });
    }
    if (!pool.length) return;
    const exitIdx = actions[roomId].findIndex(a => a.side === "exit");
    const injected = pool.map(f => ({
      id: `${roomId}_${f.id}`,
      label: f.label,
      side: "sub",
      hint: "watch",
      turns: 1,
      // Repeatable: no `once`, no provides, no inventory.
      run() { return f.text; },
    }));
    if (exitIdx >= 0) actions[roomId].splice(exitIdx, 0, ...injected);
    else actions[roomId].push(...injected);
  });

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

  function selectRunGoals(runRooms, rng) {
    const core = goalPool.filter(goal => goal.core);
    const eligible = goalPool.filter(goal =>
      !goal.core && (!goal.rooms || goal.rooms.some(r => runRooms.includes(r)))
    );
    const optional = shuffled(eligible, rng).slice(0, 2);
    return core.concat(optional);
  }

  function normalTaskTarget(difficulty) {
    // Pre-challenge Awake expected: final objective + identity + up to
    // two room goals + difficulty.groupCount normal chains. The two
    // challenge puzzles are additive, so fill normal chains when the
    // randomized room subset cannot support both room-specific goals.
    return 1 + 2 + (difficulty.groupCount || 0);
  }

  // ── Task groups (puzzle chains) — see horror story.js for the
  // authoring rules. Same data shape; engine in game.js is identical.
  // Step factory — keeps the data dense and consistent. Each step picks
  // up an inventory item (optional), sets a provides flag (optional),
  // and returns a one-line flavor message. `roomKind` "any" / omitted
  // means the step can land in any run room.
  function makeStep(opts) {
    // Resolve a value that may be a literal or a function-of-state.
    const value = (v, state) => (typeof v === "function" ? v(state) : v);
    return {
      id: opts.id,
      label: opts.label,
      roomKind: opts.roomKind || "any",
      requires: opts.requires,
      provides: opts.provides,
      // event/noopIf/noopMessage are honoured by doPlacedStep the same
      // way doAction honours them — lets a placed step fire a cutscene
      // or stay clickable as a no-op after first use.
      event: opts.event,
      noopIf: opts.noopIf,
      noopMessage: opts.noopMessage,
      run(state) {
        const item = value(opts.item, state);
        if (item) addUnique(state.inventory, item);
        if (opts.provides) state.flags[opts.provides] = true;
        if (typeof opts.onRun === "function") opts.onRun(state);
        return value(opts.text, state) || "";
      },
    };
  }

  // ~35 chain puzzles. Most are 2-step "find X → use X" pairs that read
  // well in a derelict station / research facility / Mars habitat. Some
  // have a third assembly step. roomKind tags steer placement — "any"
  // = anywhere, others target rooms by kind. Edit/add/remove freely;
  // createRun picks K per run (1/2/3 by difficulty).
  const taskGroups = [
    // ── Must-place "core finds" ────────────────────────────────────────
    // identity used to be a hardcoded scan_band action in cryo_room. It
    // lives here now as a mandatory any-room placement so the identity
    // goal is satisfied wherever the player happens to be exploring.
    { id: "identity_find", mandatory: true, label: "Identity",
      goalText: "Discover your identity.",
      steps: [
        makeStep({
          // Generic button label — reads like the flavor "check the
          // cradle / tap the terminal" slots, so players have to click
          // around to discover where the task actually lives this run.
          id: "claim_identity",
          label: "Search for something familiar",
          roomKind: "any",
          provides: "identity",
          item: state => `${state.playerName}'s wrist band`,
          text: state => `Tucked into a panel: a wrist band. The band resolves: ${state.playerName}. The facility redacts why you were asleep.`,
          onRun(state) { state.playerRevealed = true; },
        }),
      ],
    },

    // ── Puzzle chains ──────────────────────────────────────────────────
    { id: "transport_unlock", label: "Access card & transport", steps: [
      makeStep({ id: "find_access_card", label: "Search the personal locker", provides: "access_card", item: "Access card",
        text: "An access card slides out of a tucked pocket — your name is half-rubbed off." }),
      makeStep({ id: "unlock_route", label: "Authorise transport route", roomKind: "study_like", requires: "access_card", provides: "route_auth", item: "Route authorisation",
        text: "The security panel accepts the card and unlocks one transport route." }),
    ]},
    { id: "id_biometric", label: "ID badge & biometric", steps: [
      makeStep({ id: "find_id_badge", label: "Pocket the ID badge", provides: "id_badge", item: "ID badge",
        text: "An ID badge dangles on a lanyard. The photo is too clean to be old, too scratched to be new." }),
      makeStep({ id: "scan_biometric", label: "Hold the badge to the scanner", roomKind: "study_like", requires: "id_badge", provides: "biometric_pass", item: "Biometric token",
        text: "The scanner reads green, then amber. It logs you in as someone whose record was scrubbed." }),
    ]},
    { id: "repair_kit_console", label: "Repair kit & console", steps: [
      makeStep({ id: "take_repair_kit", label: "Take the repair kit", roomKind: "storage_like", provides: "repair_kit", item: "Repair kit",
        text: "A repair kit with hand-labelled spares — someone packed this for one specific job." }),
      makeStep({ id: "fix_console", label: "Fix the broken console", roomKind: "study_like", requires: "repair_kit", provides: "console_fixed", item: "Restored console log",
        text: "The console resets, prints one line of log, then dies again — long enough to read." }),
    ]},
    { id: "sample_analysis", label: "Sample vial & analyser", steps: [
      makeStep({ id: "collect_sample", label: "Collect the sealed vial", roomKind: "wild", provides: "sample_vial", item: "Sample vial",
        text: "A sealed vial of pale fluid, label peeling. The contents hum faintly when you tilt it." }),
      makeStep({ id: "run_analyser", label: "Run the analyser", roomKind: "study_like", requires: "sample_vial", provides: "sample_analysed", item: "Lab readout",
        text: "The analyser pings a result you do not recognise. The printout names a creature." }),
    ]},
    { id: "backup_battery", label: "Spare cell & panel", steps: [
      makeStep({ id: "pocket_spare_cell", label: "Pocket the spare cell", provides: "spare_cell", item: "Spare power cell",
        text: "A power cell, still humming. Cradle warm enough to suggest recent use." }),
      makeStep({ id: "install_panel", label: "Install in the wall panel", roomKind: "power_like", requires: "spare_cell", provides: "panel_live", item: "Restored panel",
        text: "The panel boots. One light turns green — the route you couldn't see is suddenly mapped." }),
    ]},
    { id: "maintenance_log", label: "Maintenance log", steps: [
      makeStep({ id: "find_log_spool", label: "Take the log spool", provides: "log_spool", item: "Maintenance log spool",
        text: "A magnetic spool with a hand-written serial — the serial matches a door in the hub." }),
      makeStep({ id: "decode_schedule", label: "Decode the schedule", roomKind: "study_like", requires: "log_spool", provides: "schedule_decoded", item: "Vent schedule",
        text: "The schedule lists the next time the air vents open. You read it twice to be sure." }),
    ]},
    { id: "plant_cutting", label: "Sealed cutting", steps: [
      makeStep({ id: "find_sealed_flask", label: "Pick up the sealed flask", provides: "sealed_flask", item: "Sealed flask",
        text: "A flask sealed against contamination, contents glowing very faintly green." }),
      makeStep({ id: "harvest_cutting", label: "Take a clean cutting", roomKind: "wild", requires: "sealed_flask", provides: "cutting_done", item: "Plant cutting",
        text: "The cutting goes in cleanly. The plant's branch retracts as if it preferred not to lose it." }),
    ]},
    { id: "cracked_mug_code", label: "Cracked mug & tea code", steps: [
      makeStep({ id: "find_cracked_mug", label: "Lift the cracked mug", provides: "cracked_mug", item: "Cracked mug",
        text: "A mug with a hairline crack running through a hand-painted seal. Tea residue dried in spirals." }),
      makeStep({ id: "read_tea_code", label: "Read the dried pattern", requires: "cracked_mug", provides: "tea_code", item: "Crew tea code",
        text: "The dried tea spiral is a code the crew used in their off-hours. It names someone never to trust." }),
    ]},
    { id: "crew_helmet_audio", label: "Crew helmet audio", steps: [
      makeStep({ id: "find_crew_helmet", label: "Pick up the crew helmet", provides: "crew_helmet", item: "Crew helmet",
        text: "A helmet with a personal sticker peeled half off. The visor is cracked but clear." }),
      makeStep({ id: "plug_audio_jack", label: "Plug into the audio jack", roomKind: "study_like", requires: "crew_helmet", provides: "audio_log_heard", item: "Last audio log",
        text: "The helmet's last seconds play back: a long inhale, then someone calling your name." }),
    ]},
    { id: "coolant_pump", label: "Coolant flask & pump", steps: [
      makeStep({ id: "fill_coolant_flask", label: "Fill the coolant flask", roomKind: "storage_like", provides: "coolant_flask", item: "Coolant flask",
        text: "A flask of dense blue coolant, cold enough through the glove to feel its weight in your palm." }),
      makeStep({ id: "prime_pump", label: "Prime the pump", roomKind: "power_like", requires: "coolant_flask", provides: "pump_primed", item: "Cooled core",
        text: "The pump catches, then hums. The core's red bar slides down to amber. You have time you didn't have." }),
    ]},
    { id: "star_chart", label: "Star chart & sextant", steps: [
      makeStep({ id: "find_star_chart", label: "Take the rolled star chart", provides: "star_chart", item: "Star chart",
        text: "A rolled chart with one constellation circled in pencil. The circle is fresh." }),
      makeStep({ id: "shoot_sextant", label: "Shoot a bearing", requires: "star_chart", provides: "bearing_set", item: "Set bearing",
        text: "The sextant resolves a bearing that disagrees with what the bulkhead says you're facing." }),
    ]},
    { id: "solar_regulator", label: "Solar diode & regulator", steps: [
      makeStep({ id: "pull_diode", label: "Pull the solar diode", roomKind: "storage_like", provides: "solar_diode", item: "Solar diode",
        text: "A solar diode, the size of a fingernail, still warm with stored charge." }),
      makeStep({ id: "restart_regulator", label: "Restart the regulator", roomKind: "power_like", requires: "solar_diode", provides: "regulator_live", item: "Restored regulator",
        text: "The regulator catches, settles, and pushes one steady amber line of power across the wall." }),
    ]},
    { id: "toolbelt_spanner", label: "Toolbelt & spanner", steps: [
      makeStep({ id: "find_toolbelt", label: "Strap on the toolbelt", provides: "toolbelt", item: "Toolbelt",
        text: "A toolbelt loaded for someone bigger than you. The spanner balances anyway." }),
      makeStep({ id: "unbolt_door", label: "Unbolt the seized door", requires: "toolbelt", provides: "door_unbolted", item: "Cleared door",
        text: "The spanner finds purchase. The door gives, complaining, then opens onto a corridor that was on no plan." }),
    ]},
    { id: "visor_display", label: "Visor & display module", steps: [
      makeStep({ id: "find_recycled_visor", label: "Take the recycled visor", provides: "recycled_visor", item: "Recycled visor",
        text: "A scratched visor; the inside still warm. Whoever wore it last took it off in a hurry." }),
      makeStep({ id: "slot_display_module", label: "Slot the display module", roomKind: "study_like", requires: "recycled_visor", provides: "display_overlay", item: "AR overlay",
        text: "The visor wakes. Faint arrows hover in the air, pointing to a door you couldn't see was there." }),
    ]},
    { id: "drone_shell", label: "Power cell & drone shell", steps: [
      makeStep({ id: "take_power_cell", label: "Take the small power cell", roomKind: "storage_like", provides: "power_cell", item: "Small power cell",
        text: "A small power cell with a chewed label. The contacts gleam." }),
      makeStep({ id: "wake_drone_shell", label: "Wake the drone shell", requires: "power_cell", provides: "drone_alive", item: "Active drone",
        text: "The shell spins its rotor once, twice. A friend in the dark — or at least an extra eye." }),
    ]},
    { id: "override_key", label: "Override key & fuse", steps: [
      makeStep({ id: "find_override_key", label: "Pocket the override key", provides: "override_key", item: "Override key",
        text: "A heavy steel key with one notch filed off — someone wanted no record of using it." }),
      makeStep({ id: "slot_override_fuse", label: "Slot the override fuse", roomKind: "power_like", requires: "override_key", provides: "override_live", item: "Live override",
        text: "The override engages. A bulkhead two rooms over thuds open, and a vent above you hisses shut." }),
    ]},
    { id: "dna_swab", label: "DNA swab & matcher", steps: [
      makeStep({ id: "take_dna_swab", label: "Take a DNA swab", provides: "dna_swab", item: "DNA swab",
        text: "A swab in a sterile tube. The cap is pre-labelled with your old crew number." }),
      makeStep({ id: "run_matcher", label: "Run the matcher", roomKind: "study_like", requires: "dna_swab", provides: "identity_matched", item: "Identity match",
        text: "The matcher resolves an identity — almost yours. The mismatch is one letter long." }),
    ]},
    { id: "mining_drill", label: "Mining drill & door", steps: [
      makeStep({ id: "lift_mining_drill", label: "Lift the mining drill", roomKind: "storage_like", provides: "mining_drill", item: "Mining drill",
        text: "A mining drill, heavier than expected. The bit is new. It will be slow and very loud." }),
      makeStep({ id: "break_sealed_door", label: "Break the sealed door", requires: "mining_drill", provides: "door_broken", item: "Breached door",
        text: "The drill bites, screams, then pierces. You have made a door. You have also made noise." }),
    ]},
    { id: "drone_manual", label: "Drone manual & activation", steps: [
      makeStep({ id: "find_drone_manual", label: "Pick up the drone manual", provides: "drone_manual", item: "Drone manual",
        text: "A laminated manual with one page dogeared — the page on quiet mode." }),
      makeStep({ id: "activate_quiet_mode", label: "Activate quiet mode", requires: "drone_manual", provides: "drone_quiet", item: "Quiet drone",
        text: "The drone hums into quiet mode and tucks itself against the ceiling like a moth that learned the trick." }),
    ]},
    { id: "mag_boots", label: "Mag boots & grav panel", steps: [
      makeStep({ id: "wear_mag_boots", label: "Pull on the mag boots", roomKind: "storage_like", provides: "mag_boots", item: "Magnetic boots",
        text: "The boots clamp to the floor when you put them on. Walking is half a thought." }),
      makeStep({ id: "climb_grav_panel", label: "Climb the grav panel", requires: "mag_boots", provides: "climbed_panel", item: "New vantage",
        text: "The grav panel lets you walk a wall. There is a hatch up here no one was meant to use." }),
    ]},
    { id: "encryption_pad", label: "Encryption pad chain", steps: [
      makeStep({ id: "find_encryption_pad", label: "Take the encryption pad", provides: "encryption_pad", item: "Encryption pad",
        text: "A pocket pad, model number scratched off, still warm from a thumb." }),
      makeStep({ id: "find_scrambler", label: "Pair with the scrambler", requires: "encryption_pad", provides: "scrambler_paired", item: "Paired scrambler",
        text: "The scrambler answers the pad. They were a matched pair. You are missing the third tool." }),
      makeStep({ id: "decode_message", label: "Decode the captured message", requires: "scrambler_paired", provides: "message_decoded", item: "Decoded message",
        text: "Decoded, the message is short: 'Don't trust the medical band.' Yours is on your wrist." }),
    ]},
    { id: "backup_core", label: "Backup core & ignition", steps: [
      makeStep({ id: "find_ignition_strip", label: "Take the ignition strip", provides: "ignition_strip", item: "Ignition strip",
        text: "A long ignition strip with one end pre-fused. Whoever made it didn't have time to finish." }),
      makeStep({ id: "kickstart_core", label: "Kickstart the backup core", roomKind: "power_like", requires: "ignition_strip", provides: "core_alive", item: "Live backup core",
        text: "The strip catches the core. The room lights stutter, then steady. The hallway lights stay off." }),
    ]},
    { id: "glasswright_seal", label: "Sealant & cracked window", steps: [
      makeStep({ id: "take_sealant_tube", label: "Take the sealant tube", roomKind: "storage_like", provides: "sealant_tube", item: "Sealant tube",
        text: "A sealant tube nearly empty — but enough for one breach if you don't waste it." }),
      makeStep({ id: "seal_window", label: "Seal the cracked window", requires: "sealant_tube", provides: "window_sealed", item: "Sealed breach",
        text: "The sealant foams white, then sets clear. The whistling stops. The lights warm by half." }),
    ]},
    { id: "black_box", label: "Black box & reader", steps: [
      makeStep({ id: "find_black_box", label: "Pull the black box", provides: "black_box", item: "Black box",
        text: "A small black box, the kind crews always say they hope no one ever finds." }),
      makeStep({ id: "load_reader", label: "Load it into the reader", roomKind: "study_like", requires: "black_box", provides: "blackbox_played", item: "Last log",
        text: "The reader plays the captain's last 90 seconds. Most of it is silence. The last word is your name." }),
    ]},
    { id: "rations_message", label: "Rations & opener", steps: [
      makeStep({ id: "take_sealed_ration", label: "Take the sealed ration", provides: "sealed_ration", item: "Sealed ration",
        text: "A ration packet, heavier than rations should be. The seal is welded — not pressed." }),
      makeStep({ id: "use_opener", label: "Use the opener", roomKind: "kitchen_like", requires: "sealed_ration", provides: "ration_opened", item: "Folded note",
        text: "Inside, instead of food, a folded note: 'Don't eat the new batches. Trust nothing the panel says.'" }),
    ]},
    { id: "fuse_swap", label: "Spare fuse & circuit", steps: [
      makeStep({ id: "take_spare_fuse", label: "Take the spare fuse", roomKind: "storage_like", provides: "spare_fuse", item: "Spare fuse",
        text: "A spare fuse in its anti-static foam. One of two — someone removed the other." }),
      makeStep({ id: "swap_circuit", label: "Swap the burnt circuit", roomKind: "power_like", requires: "spare_fuse", provides: "circuit_fixed", item: "Restored circuit",
        text: "The circuit eats the fuse, then settles. A door three rooms away unlocks itself." }),
    ]},
    { id: "distress_signal", label: "Comm cable & panel", steps: [
      makeStep({ id: "coil_comm_cable", label: "Coil the comm cable", provides: "comm_cable", item: "Comm cable",
        text: "A coil of comm cable still on a portable spool. The end is freshly cut." }),
      makeStep({ id: "send_distress", label: "Send the distress signal", roomKind: "study_like", requires: "comm_cable", provides: "distress_sent", item: "Sent distress",
        text: "The signal goes out. The panel waits — and answers with the wrong voice, in the right format." }),
    ]},
    { id: "infiltrator_check", label: "Crew roster & infiltrator", steps: [
      makeStep({ id: "take_crew_roster", label: "Take the crew roster", roomKind: "study_like", provides: "crew_roster", item: "Crew roster",
        text: "A printed crew roster — paper, not screen. Someone trusted only what they could fold." }),
      makeStep({ id: "match_id_tag", label: "Match the loose ID tag", requires: "crew_roster", provides: "infiltrator_found", item: "Mismatched tag",
        text: "One tag matches no roster entry. Two letters off — close enough to pass a glance, not a check." }),
    ]},
    { id: "voiceprint", label: "Voice sample & authenticate", steps: [
      makeStep({ id: "record_voice_sample", label: "Speak into the recorder", provides: "voice_sample", item: "Voice sample",
        text: "A handheld recorder lights green when you speak. You haven't heard your own voice in a while." }),
      makeStep({ id: "authenticate_voice", label: "Authenticate at the booth", roomKind: "study_like", requires: "voice_sample", provides: "voice_passed", item: "Authenticated voice",
        text: "The booth accepts the voice. The door beyond it accepts you as someone who works here." }),
    ]},
    { id: "maintenance_bot", label: "Maintenance bot & distraction", steps: [
      makeStep({ id: "take_bot_remote", label: "Take the bot remote", provides: "bot_remote", item: "Bot remote",
        text: "A worn remote with a single yellow button. The crew labelled it 'last resort'." }),
      makeStep({ id: "send_bot_distract", label: "Send the bot to draw it", roomKind: "power_like", requires: "bot_remote", provides: "bot_sent", item: "Drawn pursuit",
        text: "The bot trundles into the hall, beeping like dinner. Something distant turns toward the sound." }),
    ]},
    { id: "heat_coil", label: "Heat coil & frozen lock", steps: [
      makeStep({ id: "take_heat_coil", label: "Take the heat coil", roomKind: "storage_like", provides: "heat_coil", item: "Heat coil",
        text: "A heat coil in a foam case. The case is sweating. The coil is not." }),
      makeStep({ id: "thaw_lock", label: "Thaw the frozen lock", requires: "heat_coil", provides: "lock_thawed", item: "Thawed lock",
        text: "Pressed to the lock, the coil hisses and the ice retreats. The lock takes a key it has not taken in years." }),
    ]},
    { id: "photolum_strip", label: "UV strip & dark scan", steps: [
      makeStep({ id: "take_uv_strip", label: "Take the UV strip", provides: "uv_strip", item: "UV strip",
        text: "A strip of UV emitter, no bigger than your finger. Lasts about a minute on its trickle cell." }),
      makeStep({ id: "scan_dark", label: "Scan the dark walls", requires: "uv_strip", provides: "uv_revealed", item: "Revealed writing",
        text: "Words bloom on the wall — instructions to yourself you do not remember writing." }),
    ]},
    { id: "lens_scope", label: "Lens cleaner & scope", steps: [
      makeStep({ id: "take_lens_cleaner", label: "Take the lens cleaner", provides: "lens_cleaner", item: "Lens cleaner",
        text: "A small bottle of lens cleaner — half full. Someone used the other half quickly." }),
      makeStep({ id: "look_through_scope", label: "Clean and use the scope", requires: "lens_cleaner", provides: "scope_clear", item: "Cleared scope",
        text: "The scope clears. Across the bay, a marker you couldn't see is suddenly the only thing you can." }),
    ]},
    { id: "assembled_diary", label: "Crew diary pages", steps: [
      makeStep({ id: "find_page_one", label: "Pick up the first page", provides: "page_one", item: "Diary page 1",
        text: "A torn page from a personal log. The handwriting is shaky. The date is yesterday." }),
      makeStep({ id: "find_page_two", label: "Pick up the second page", provides: "page_two", item: "Diary page 2",
        text: "The matching page. The two pages tape into a single legible entry." }),
      makeStep({ id: "assemble_diary", label: "Tape the pages together", requires: "page_two", provides: "diary_assembled", item: "Assembled diary entry",
        text: "Read in order: 'They will tell you you woke alone. You did not. Look for the other cradle.'" }),
    ]},
    { id: "magnet_crate", label: "Loose magnet & crate", steps: [
      makeStep({ id: "take_loose_magnet", label: "Pocket the loose magnet", provides: "loose_magnet", item: "Loose magnet",
        text: "A plain neodymium magnet — strong enough to pull a coin out of your hand." }),
      makeStep({ id: "open_tagged_crate", label: "Pop the tagged crate", roomKind: "storage_like", requires: "loose_magnet", provides: "crate_open", item: "Crate contents",
        text: "The magnet flips the hidden catch. The crate opens onto a pair of insulated gloves and a sealed flare." }),
    ]},

    // ── Additional agnostic puzzle chains (mostly roomKind "any" so
    // they can place anywhere — gives the placement system more options).
    { id: "anomaly_readout", label: "Anomaly readout", steps: [
      makeStep({ id: "read_anomaly_strip", label: "Read the anomaly strip", provides: "anomaly_strip", item: "Anomaly strip",
        text: "A printed strip of telemetry, half scrolled off the panel. A spike at the same hour you woke up." }),
    ]},
    { id: "crew_portrait_pair", label: "Crew portrait & roster", steps: [
      makeStep({ id: "find_crew_portrait", label: "Lift the crew portrait", provides: "crew_portrait", item: "Crew portrait",
        text: "A printed crew portrait peeled half off the bulkhead. Five faces — one of them is yours, slightly younger." }),
      makeStep({ id: "match_to_roster", label: "Match the portrait to a roster", requires: "crew_portrait", provides: "portrait_matched", item: "Matched name",
        text: "Four of the names match the roster you've seen elsewhere. Yours is missing." }),
    ]},
    { id: "sealed_cargo", label: "Sealed cargo crate", steps: [
      makeStep({ id: "find_cargo_chip", label: "Pocket the cargo chip", provides: "cargo_chip", item: "Cargo chip",
        text: "A small data chip taped under a workbench — labelled with a route code you don't recognise." }),
      makeStep({ id: "open_sealed_cargo", label: "Plug the chip into the cargo seal", requires: "cargo_chip", provides: "cargo_open", item: "Cargo contents",
        text: "The seal hisses open. Inside: a stack of pre-printed evacuation tags. The top one has your name." }),
    ]},
    { id: "calibration_crystal", label: "Calibration crystal", steps: [
      makeStep({ id: "lift_calibration_crystal", label: "Lift the calibration crystal", provides: "cal_crystal", item: "Calibration crystal",
        text: "A small calibration crystal still humming. Pull it from its cradle and the cradle goes dark." }),
      makeStep({ id: "slot_calibration", label: "Slot it into the bench", roomKind: "power_like", requires: "cal_crystal", provides: "bench_calibrated", item: "Calibrated bench reading",
        text: "The bench wakes up. One reading agrees with no other — and it is exactly your body temperature." }),
    ]},
    { id: "handprint_scan", label: "Handprint & scanner", steps: [
      makeStep({ id: "find_dust_handprint", label: "Note the dust handprint", provides: "dust_print", item: "Dust handprint",
        text: "A handprint in fine dust on a panel — smaller than yours, fresh. Someone else is awake." }),
      makeStep({ id: "match_scanner", label: "Match it on the scanner", requires: "dust_print", provides: "scanner_matched", item: "Scanned print",
        text: "The scanner returns a partial ID — half the crew number is yours. The other half is not." }),
    ]},
    { id: "echo_recording", label: "Echo recording", steps: [
      makeStep({ id: "find_echo_chip", label: "Pull the echo chip", provides: "echo_chip", item: "Echo chip",
        text: "A small recording chip slotted into a maintenance panel. Labelled with a hand-scrawled exclamation mark." }),
      makeStep({ id: "play_echo", label: "Play it back", requires: "echo_chip", provides: "echo_played", item: "Played echo",
        text: "The chip plays back a voice — yours — saying a sentence you do not remember saying. Then a single long breath." }),
    ]},
  ];

  function imageChoicesForRooms(runRooms) {
    const ids = Array.isArray(runRooms) && runRooms.length
      ? runRooms
      : Object.keys(rooms).filter(id => id !== "hallway");
    return ids
      .map(id => {
        const room = rooms[id];
        if (!room || !room.poster) return null;
        return { src: room.poster, label: room.name || id };
      })
      .filter(Boolean);
  }

  function challengeGroupsForRun(ctx) {
    if (window.HubPuzzles && typeof window.HubPuzzles.createChallengeGroups === "function") {
      return window.HubPuzzles.createChallengeGroups({
        ...ctx,
        imageChoices: ctx && ctx.imageChoices ? ctx.imageChoices : imageChoicesForRooms(ctx && ctx.runRooms),
      });
    }
    return [];
  }

  function allTaskGroups(extraGroups = []) {
    return taskGroups.concat(Array.isArray(extraGroups) ? extraGroups : []);
  }

  function placedGroupIds(placedActions) {
    const ids = new Set();
    Object.values(placedActions || {}).forEach(refs => {
      (refs || []).forEach(ref => { if (ref && ref.groupId) ids.add(ref.groupId); });
    });
    return ids;
  }

  function usedRoomsFromPlaced(placedActions) {
    return new Set(Object.keys(placedActions || {}).filter(roomId => {
      const refs = placedActions[roomId];
      return Array.isArray(refs) && refs.length;
    }));
  }

  function mergePlacedActions(base, added) {
    const merged = { ...(base || {}) };
    Object.entries(added || {}).forEach(([roomId, refs]) => {
      if (!Array.isArray(refs) || !refs.length) return;
      merged[roomId] = (merged[roomId] || []).concat(refs);
    });
    return merged;
  }

  function placePickedGroups(picks, runRooms, rng, usedRooms = new Set()) {
    const placed = {};
    picks.forEach(group => {
      const stepRooms = [];
      const reservedRooms = [];
      let ok = true;
      group.steps.forEach(step => {
        if (!ok) return;
        const candidates = runRooms.filter(id => {
          const room = rooms[id];
          if (!room) return false;
          // "any" (or missing roomKind) means the step can be placed in
          // any room of the run — useful for items that could plausibly
          // be dropped anywhere: a keycard, a torn page, a sample vial.
          if (!step.roomKind || step.roomKind === "any") return true;
          return room.kind === step.roomKind;
        });
        const fresh = candidates.filter(id => !usedRooms.has(id));
        const pool2 = fresh.length ? fresh : candidates;
        if (!pool2.length) { ok = false; return; }
        const chosen = randomItem(pool2, rng);
        reservedRooms.push(chosen);
        stepRooms.push([chosen, step]);
      });
      if (!ok) return;
      reservedRooms.forEach(roomId => usedRooms.add(roomId));
      stepRooms.forEach(([roomId, step]) => {
        if (!placed[roomId]) placed[roomId] = [];
        placed[roomId].push({ groupId: group.id, stepId: step.id });
      });
    });
    return placed;
  }

  function placeTaskGroups(difficulty, runRooms, rng, extraGroups = []) {
    const availableGroups = allTaskGroups(extraGroups);
    if (!availableGroups.length) return {};
    // Mandatory groups (identity in any room) are placed every run,
    // regardless of difficulty.groupCount. Optional puzzle chains then
    // fill up to groupCount additional slots. Mandatory ones are placed
    // first so they reserve a room before random chains start grabbing.
    const mandatory = availableGroups.filter(g => g.mandatory);
    const optional = availableGroups.filter(g => !g.mandatory);
    const want = difficulty.groupCount || 0;
    const weighted = [];
    optional.forEach(group => {
      const weight = group.weight || 1;
      for (let i = 0; i < weight; i += 1) weighted.push(group);
    });
    const picks = mandatory.slice();
    const seen = new Set(mandatory.map(g => g.id));
    const pool = shuffled(weighted, rng);
    const usedRooms = new Set();
    let placed = placePickedGroups(picks, runRooms, rng, usedRooms);
    let placedOptional = 0;
    for (let i = 0; i < pool.length && placedOptional < want; i += 1) {
      const group = pool[i];
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      const addition = placePickedGroups([group], runRooms, rng, usedRooms);
      if (!placedGroupIds(addition).has(group.id)) continue;
      placed = mergePlacedActions(placed, addition);
      placedOptional += 1;
    }
    return placed;
  }

  function resolveStep(ref, runState) {
    if (!ref || !ref.groupId || !ref.stepId) return null;
    const group = allTaskGroups(runState && runState.challengeGroups).find(g => g.id === ref.groupId);
    if (!group) return null;
    return group.steps.find(s => s.id === ref.stepId) || null;
  }

  // Walk placedActions to figure out which groups landed in this run,
  // then make one "chain goal" per group that completes when the last
  // step fires. Mirrors the helper in horror/story.js — label-only, so
  // the player sees a chain exists but not which room holds which step.
  function chainGoalsFromPlaced(placedActions, extraGroups = []) {
    const groupIds = new Set();
    Object.values(placedActions || {}).forEach(refs => {
      (refs || []).forEach(ref => { if (ref && ref.groupId) groupIds.add(ref.groupId); });
    });
    const out = [];
    const availableGroups = allTaskGroups(extraGroups);
    groupIds.forEach(id => {
      const group = availableGroups.find(g => g.id === id);
      if (!group || !group.steps || !group.steps.length) return;
      const lastStep = group.steps[group.steps.length - 1];
      if (!lastStep || !lastStep.provides) return;
      const text = group.goalText
        || (group.label || id);
      out.push({
        id: `chain_${id}`,
        text,
        requires: lastStep.provides,
        synthetic: true,
      });
    });
    return out;
  }

  function ensureChallengeTasks(runState) {
    if (!runState || runState.ended || runState.active === false || runState.ending) return runState;
    runState.flags = runState.flags || {};
    runState.placedActions = runState.placedActions && typeof runState.placedActions === "object" ? runState.placedActions : {};
    runState.challengeGroups = Array.isArray(runState.challengeGroups) ? runState.challengeGroups : [];
    runState.goals = Array.isArray(runState.goals) && runState.goals.length ? runState.goals : goalPool.filter(g => g.core);
    const generated = challengeGroupsForRun({
      gameId: "awake",
      runKey: runState.runKey || "legacy-run",
      difficultyId: runState.difficultyId || "medium",
      location: runState.location,
      facility: runState.facility,
      threat: runState.threat || {},
      runRooms: runState.runRooms,
    });
    if (!generated.length) return runState;

    const existingGroups = new Map(runState.challengeGroups.map(group => [group && group.id, group]).filter(([id]) => id));
    generated.forEach(group => {
      if (!existingGroups.has(group.id)) existingGroups.set(group.id, group);
    });
    runState.challengeGroups = Array.from(existingGroups.values());

    const existingPlacedIds = placedGroupIds(runState.placedActions);
    const missingPlacements = generated.filter(group => !existingPlacedIds.has(group.id));
    if (missingPlacements.length) {
      const runRooms = Array.isArray(runState.runRooms) && runState.runRooms.length
        ? runState.runRooms
        : Object.keys(rooms).filter(id => id !== "hallway");
      const rng = createRng(`${runState.runKey || "legacy-run"}-challenge-migration`);
      const added = placePickedGroups(missingPlacements, runRooms, rng, usedRoomsFromPlaced(runState.placedActions));
      runState.placedActions = mergePlacedActions(runState.placedActions, added);
    }

    const goalIds = new Set(runState.goals.map(goal => goal && goal.id));
    chainGoalsFromPlaced(runState.placedActions, runState.challengeGroups).forEach(goal => {
      if (!goalIds.has(goal.id)) {
        goalIds.add(goal.id);
        runState.goals.push(goal);
      }
    });
    return runState;
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

  // ── Mini-map layout + nearby topology ────────────────────────────────
  // The full catalogue is large, but each run gets its own compact
  // two-column hallway layout. This keeps replay keys meaningful: the
  // same key recreates the same room set and the same map positions.
  const roomLayout = [
    { id: "cryo_room",        row: 1, side: "left",  pos: "node-row1-left" },
    { id: "med_bay",          row: 1, side: "right", pos: "node-row1-right" },
    { id: "hydroponic_biome", row: 2, side: "left",  pos: "node-row2-left" },
    { id: "reactor_gallery",  row: 2, side: "right", pos: "node-row2-right" },
    { id: "security_hub",     row: 3, side: "left",  pos: "node-row3-left" },
    { id: "observation_deck", row: 3, side: "right", pos: "node-row3-right" },
    { id: "engineering_bay",  row: 4, side: "wide",  pos: "node-wide-bottom" },
  ];

  function buildRunLayout(runRooms) {
    const ids = (Array.isArray(runRooms) ? runRooms : [])
      .filter(id => id && id !== "hallway" && rooms[id]);
    const layout = [];
    ids.forEach((id, index) => {
      const row = Math.floor(index / 2) + 1;
      const side = index % 2 === 0 ? "left" : "right";
      layout.push({
        id,
        row,
        side,
        pos: `node-row${row}-${side}`,
      });
    });
    if (layout.length % 2 === 1 && layout.length > 1) {
      const last = layout[layout.length - 1];
      last.side = "wide";
      last.pos = `node-row${last.row}-wide`;
    }
    return layout;
  }

  function nearbyRooms(roomId, layout = roomLayout) {
    const activeLayout = Array.isArray(layout) && layout.length ? layout : roomLayout;
    const me = activeLayout.find(entry => entry.id === roomId);
    if (!me) return [];
    const out = [];
    const add = id => { if (id && !out.includes(id) && id !== roomId) out.push(id); };
    if (me.side === "left" || me.side === "right") {
      const opp = me.side === "left" ? "right" : "left";
      const across = activeLayout.find(e => e.row === me.row && e.side === opp);
      if (across) add(across.id);
      const upSame = activeLayout.find(e => e.row === me.row - 1 && e.side === me.side);
      if (upSame) add(upSame.id);
      else {
        const upWide = activeLayout.find(e => e.row === me.row - 1 && e.side === "wide");
        if (upWide) add(upWide.id);
      }
      const downSame = activeLayout.find(e => e.row === me.row + 1 && e.side === me.side);
      if (downSame) add(downSame.id);
      else {
        const downWide = activeLayout.find(e => e.row === me.row + 1 && e.side === "wide");
        if (downWide) add(downWide.id);
      }
    } else if (me.side === "wide") {
      const above = activeLayout.filter(e => e.row === me.row - 1);
      above.forEach(e => add(e.id));
      const below = activeLayout.filter(e => e.row === me.row + 1);
      below.forEach(e => add(e.id));
    }
    return out;
  }

  window.CodexHorrorStory = {
    version: "0.1",
    rooms,
    actions,
    // Fallback used by game.js when state.goals is missing (legacy
    // saves, dev mode). Only core entries — never the room-constrained
    // optional goals, which could otherwise surface in a run whose
    // rooms can't satisfy them.
    goals: goalPool.filter(g => g.core),
    transitions,
    eventVideos,
    introPlaylist,
    mediaManifest,
    gameNames,
    threats,
    difficulties,
    roomLayout,
    nearbyRooms,
    buildRunLayout,
    taskGroups,
    resolveStep,
    ensureChallengeTasks,
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
      // Any room flagged canStart is eligible — lets new sleeping rooms
      // (or any waking-up location) join the pool just by setting the
      // flag, no hardcoded list to update.
      const startCandidates = Object.keys(rooms).filter(id => rooms[id].canStart);
      const startRoom = startCandidates.length
        ? randomItem(startCandidates, rng)
        : "cryo_room";
      const runRooms = selectRunRooms(difficulty, startRoom, rng);
      const runLayout = buildRunLayout(runRooms);
      const baseGoals = selectRunGoals(runRooms, rng);
      const baseTaskCount = baseGoals.filter(goal => goal.id !== "escape").length;
      const placementDifficulty = {
        ...difficulty,
        groupCount: Math.max(difficulty.groupCount || 0, normalTaskTarget(difficulty) - baseTaskCount - 1),
      };
      const challengeGroups = challengeGroupsForRun({
        gameId: "awake",
        runKey,
        difficultyId,
        location,
        facility: `${prefix} ${location}`,
        threat,
        runRooms,
      });
      const placedActions = placeTaskGroups(placementDifficulty, runRooms, rng, challengeGroups);
      // Each placed group gets a synthetic goal (uses group.goalText if
      // present, otherwise a generic "follow a clue trail" line). This
      // is what makes the placed identity step visible as a real goal.
      const chainGoals = chainGoalsFromPlaced(placedActions, challengeGroups);
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
        // Per-run randomized auto-reveal turn (3-8). game.js falls back
        // to 5 if absent. Picking it here keeps the run reproducible
        // from the run key.
        revealTurn: randomInt(3, 8, rng),
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
        challengeGroups,
        goals: baseGoals.concat(chainGoals),
        flags: {},
        inventory: [],
        history: [],
        ending: "",
        mapUnlocked: true,
        createdAt: Date.now(),
      };
    },
  };

})();
