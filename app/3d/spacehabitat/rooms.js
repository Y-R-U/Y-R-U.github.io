/**
 * Room type definitions and management.
 * Each room type has a name, color, size in modules, and allocation percentage.
 */
const Rooms = (() => {
  // Default module cube size (meters)
  const DEFAULT_MODULE = { w: 3, d: 3, h: 3 };
  const DEFAULT_UTILITY = 1; // m crawl space per level
  const DEFAULT_WALL = 0.3;  // m wall/access between rooms

  function defaultTypes() {
    return [
      {
        id: 'residential',
        name: 'Residential',
        color: '#4488cc',
        modulesWide: 3,   // along circumference (9 m)
        modulesDeep: 4,   // axial width (12 m)
        levelsHigh: 1,    // single storey
        percent: 40,
        description: '9 m × 12 m living units',
      },
      {
        id: 'commercial',
        name: 'Commercial',
        color: '#cc8844',
        modulesWide: 4,
        modulesDeep: 4,
        levelsHigh: 1,
        percent: 15,
        description: '12 m × 12 m open-plan offices/shops',
      },
      {
        id: 'agriculture',
        name: 'Agriculture',
        color: '#44aa44',
        modulesWide: 3,
        modulesDeep: 4,
        levelsHigh: 2,    // double height for vertical farming
        percent: 25,
        description: '9 m × 12 m × 8 m tall grow bays',
      },
      {
        id: 'park',
        name: 'Park / Communal',
        color: '#66bb66',
        modulesWide: 10,
        modulesDeep: 6,
        levelsHigh: 3,    // triple height open space
        percent: 10,
        description: '30 m × 18 m × 12 m open areas',
      },
    ];
  }

  // Infrastructure is always the remainder to 100%
  function getInfraPercent(types) {
    const used = types.reduce((s, t) => s + t.percent, 0);
    return Math.max(0, 100 - used);
  }

  // Calculate effective room dimensions including walls
  function roomDimensions(type, moduleSize, wallThickness) {
    const ms = moduleSize || DEFAULT_MODULE;
    const wall = wallThickness || DEFAULT_WALL;
    return {
      outerW: type.modulesWide * ms.w + wall * 2,
      outerD: type.modulesDeep * ms.d + wall * 2,
      innerW: type.modulesWide * ms.w,
      innerD: type.modulesDeep * ms.d,
      height: type.levelsHigh * (ms.h + DEFAULT_UTILITY),
      roomHeight: type.levelsHigh * ms.h + (type.levelsHigh - 1) * DEFAULT_UTILITY,
    };
  }

  // Calculate how many rooms of each type fit given total modules and circumference
  function allocate(types, totalModulesPerLevel, levels, moduleSize) {
    const ms = moduleSize || DEFAULT_MODULE;
    const results = [];
    const infraPct = getInfraPercent(types);

    for (const type of types) {
      const fraction = type.percent / 100;
      const availableModules = Math.floor(totalModulesPerLevel * levels * fraction);
      const modulesPerRoom = type.modulesWide * type.modulesDeep * type.levelsHigh;
      const count = Math.floor(availableModules / modulesPerRoom);
      const dims = roomDimensions(type, ms);

      results.push({
        ...type,
        count,
        modulesPerRoom,
        totalModulesUsed: count * modulesPerRoom,
        dims,
        totalArea: count * dims.innerW * dims.innerD,
      });
    }

    return { rooms: results, infraPercent: infraPct };
  }

  return {
    DEFAULT_MODULE,
    DEFAULT_UTILITY,
    DEFAULT_WALL,
    defaultTypes,
    getInfraPercent,
    roomDimensions,
    allocate,
  };
})();
