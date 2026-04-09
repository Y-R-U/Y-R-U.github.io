/**
 * Habitat calculation engine — all physics, geometry, and room allocation math.
 */
const Habitat = (() => {
  const G = 9.81; // m/s²

  function defaults() {
    return {
      majorRadius: 500,    // m, center of rotation axis to tube center
      tubeRadius: 50,      // m, radius of the circular cross-section
      floorWidth: 40,      // m, habitable width along rotation axis
      levels: 5,           // radial layers from outer floor inward
      shieldThickness: 1,  // m water-equivalent
      shieldType: 'circulating',
    };
  }

  function calc(cfg) {
    const R = cfg.majorRadius;
    const r = cfg.tubeRadius;
    const ms = cfg.moduleSize || { w: 3, d: 3, h: 3 };
    const utilH = cfg.utilityHeight || 1;
    const levelHeight = ms.h + utilH;

    // Floor radius is at the outermost point of the tube
    const Rfloor = R + r;

    // Circumference at floor level
    const circumference = 2 * Math.PI * Rfloor;

    // Spin rate
    const omega = Math.sqrt(G / Rfloor);            // rad/s
    const rpm = (omega * 60) / (2 * Math.PI);       // RPM
    const periodSec = (2 * Math.PI) / omega;

    // Coriolis assessment
    let coriolisNote = 'Negligible';
    if (R < 200) coriolisNote = 'Noticeable — occupants may feel dizzy when moving radially';
    if (R < 100) coriolisNote = 'Significant — disorientation likely, not recommended for long-term habitation';
    if (rpm > 2) coriolisNote = 'WARNING: >2 RPM — most humans will experience motion sickness';

    // Gravity at each level (decreases inward)
    const levelGravities = [];
    for (let i = 0; i < cfg.levels; i++) {
      const Rlevel = Rfloor - i * levelHeight;
      const gLevel = omega * omega * Rlevel;
      levelGravities.push({ level: i + 1, radius: Rlevel, gravity: gLevel, gFraction: gLevel / G });
    }

    // Modules along circumference at floor level
    const modulesCirc = Math.floor(circumference / ms.w);
    const modulesWidth = Math.floor(cfg.floorWidth / ms.d);
    const modulesPerLevel = modulesCirc * modulesWidth;
    const totalModules = modulesPerLevel * cfg.levels;

    // Floor area per level
    const floorAreaPerLevel = circumference * cfg.floorWidth;
    const totalFloorArea = floorAreaPerLevel * cfg.levels;

    // Total habitable volume
    const totalVolume = totalFloorArea * ms.h;

    // Radiation shield
    const torusSurfaceArea = 4 * Math.PI * Math.PI * R * r;
    const shieldVolume = torusSurfaceArea * cfg.shieldThickness;
    const shieldMass = shieldVolume * 1000;

    return {
      majorRadius: R,
      tubeRadius: r,
      floorRadius: Rfloor,
      circumference,
      floorWidth: cfg.floorWidth,
      levels: cfg.levels,
      levelHeight,
      omega, rpm, periodSec,
      coriolisNote,
      levelGravities,
      modulesCirc, modulesWidth, modulesPerLevel, totalModules,
      floorAreaPerLevel, totalFloorArea, totalVolume,
      torusSurfaceArea,
      shieldThickness: cfg.shieldThickness,
      shieldType: cfg.shieldType,
      shieldVolume, shieldMass,
    };
  }

  function formatNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M';
    if (n >= 1e4) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (Number.isInteger(n)) return n.toLocaleString('en-US');
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function formatMass(kg) {
    if (kg >= 1e12) return (kg / 1e12).toFixed(2) + ' Gt';
    if (kg >= 1e9) return (kg / 1e9).toFixed(2) + ' Mt';
    if (kg >= 1e6) return (kg / 1e6).toFixed(2) + ' kt';
    if (kg >= 1e3) return (kg / 1e3).toFixed(1) + ' t';
    return kg.toFixed(0) + ' kg';
  }

  return { defaults, calc, formatNum, formatMass };
})();
