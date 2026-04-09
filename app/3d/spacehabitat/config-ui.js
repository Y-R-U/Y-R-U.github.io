/**
 * Config panel — binds inputs to habitat config, manages room types, recalculates on change.
 */
const ConfigUI = (() => {
  // Geometry inputs
  const inp = {
    majorRadius: document.getElementById('inp-major-radius'),
    tubeRadius:  document.getElementById('inp-tube-radius'),
    floorWidth:  document.getElementById('inp-floor-width'),
    levels:      document.getElementById('inp-levels'),
    shield:      document.getElementById('inp-shield'),
    shieldType:  document.getElementById('inp-shield-type'),
    modW:        document.getElementById('inp-mod-w'),
    modD:        document.getElementById('inp-mod-d'),
    modH:        document.getElementById('inp-mod-h'),
    utility:     document.getElementById('inp-utility'),
    wall:        document.getElementById('inp-wall'),
  };

  // Output elements
  const out = {
    circumference: document.getElementById('hint-circumference'),
    rpm:           document.getElementById('out-rpm'),
    gravity:       document.getElementById('out-gravity'),
    coriolis:      document.getElementById('out-coriolis'),
    shieldMass:    document.getElementById('out-shield-mass'),
    allocTotal:    document.getElementById('hint-alloc-total'),
    summary:       document.getElementById('summary-output'),
    allocBar:      document.getElementById('alloc-bar'),
  };

  const roomListEl = document.getElementById('room-types-list');
  const btnAddType = document.getElementById('btn-add-room-type');

  let currentProjectId = null;
  let roomTypes = Rooms.defaultTypes();

  function loadFromConfig(cfg) {
    inp.majorRadius.value = cfg.majorRadius;
    inp.tubeRadius.value = cfg.tubeRadius;
    inp.floorWidth.value = cfg.floorWidth;
    inp.levels.value = cfg.levels;
    inp.shield.value = cfg.shieldThickness;
    inp.shieldType.value = cfg.shieldType;

    // Module defaults
    const mod = cfg.moduleSize || Rooms.DEFAULT_MODULE;
    inp.modW.value = mod.w;
    inp.modD.value = mod.d;
    inp.modH.value = mod.h;
    inp.utility.value = cfg.utilityHeight ?? Rooms.DEFAULT_UTILITY;
    inp.wall.value = cfg.wallThickness ?? Rooms.DEFAULT_WALL;

    roomTypes = cfg.roomTypes || Rooms.defaultTypes();
    renderRoomTypes();
    recalc();
  }

  function readConfig() {
    return {
      majorRadius: Math.max(50, parseFloat(inp.majorRadius.value) || 500),
      tubeRadius: Math.max(5, parseFloat(inp.tubeRadius.value) || 50),
      floorWidth: Math.max(6, parseFloat(inp.floorWidth.value) || 40),
      levels: Math.max(1, parseInt(inp.levels.value) || 5),
      shieldThickness: Math.max(1, parseFloat(inp.shield.value) || 1),
      shieldType: inp.shieldType.value,
      moduleSize: {
        w: Math.max(1, parseFloat(inp.modW.value) || 3),
        d: Math.max(1, parseFloat(inp.modD.value) || 3),
        h: Math.max(2, parseFloat(inp.modH.value) || 3),
      },
      utilityHeight: Math.max(0.5, parseFloat(inp.utility.value) || 1),
      wallThickness: Math.max(0.1, parseFloat(inp.wall.value) || 0.3),
      roomTypes: roomTypes,
    };
  }

  // ---- Room type rendering ----
  function renderRoomTypes() {
    roomListEl.innerHTML = '';
    roomTypes.forEach((rt, i) => {
      const card = document.createElement('div');
      card.className = 'room-type-card';
      card.innerHTML = `
        <div class="rt-header">
          <input type="color" class="rt-color" value="${rt.color}" data-i="${i}" title="Color">
          <input type="text" class="rt-name" value="${escapeAttr(rt.name)}" data-i="${i}" maxlength="30">
          <button class="rt-delete" data-i="${i}" title="Remove">&times;</button>
        </div>
        <div class="rt-fields">
          <div class="rt-field">
            <span>Wide <span class="unit">(modules)</span></span>
            <input type="number" class="rt-wide" value="${rt.modulesWide}" min="1" max="50" data-i="${i}">
          </div>
          <div class="rt-field">
            <span>Deep <span class="unit">(modules)</span></span>
            <input type="number" class="rt-deep" value="${rt.modulesDeep}" min="1" max="50" data-i="${i}">
          </div>
          <div class="rt-field">
            <span>Levels high</span>
            <input type="number" class="rt-levels" value="${rt.levelsHigh}" min="1" max="10" data-i="${i}">
          </div>
          <div class="rt-field">
            <span>Alloc <span class="unit">(%)</span></span>
            <input type="number" class="rt-percent" value="${rt.percent}" min="0" max="100" step="5" data-i="${i}">
          </div>
        </div>
        <div class="rt-info" id="rt-info-${i}"></div>
      `;
      roomListEl.appendChild(card);
    });
    bindRoomInputs();
    recalc();
  }

  function bindRoomInputs() {
    roomListEl.querySelectorAll('.rt-color').forEach(el => {
      el.addEventListener('input', (e) => {
        roomTypes[+e.target.dataset.i].color = e.target.value;
        recalc();
      });
    });
    roomListEl.querySelectorAll('.rt-name').forEach(el => {
      el.addEventListener('input', (e) => {
        roomTypes[+e.target.dataset.i].name = e.target.value;
      });
    });
    roomListEl.querySelectorAll('.rt-wide').forEach(el => {
      el.addEventListener('input', (e) => {
        roomTypes[+e.target.dataset.i].modulesWide = Math.max(1, parseInt(e.target.value) || 1);
        recalc();
      });
    });
    roomListEl.querySelectorAll('.rt-deep').forEach(el => {
      el.addEventListener('input', (e) => {
        roomTypes[+e.target.dataset.i].modulesDeep = Math.max(1, parseInt(e.target.value) || 1);
        recalc();
      });
    });
    roomListEl.querySelectorAll('.rt-levels').forEach(el => {
      el.addEventListener('input', (e) => {
        roomTypes[+e.target.dataset.i].levelsHigh = Math.max(1, parseInt(e.target.value) || 1);
        recalc();
      });
    });
    roomListEl.querySelectorAll('.rt-percent').forEach(el => {
      el.addEventListener('input', (e) => {
        roomTypes[+e.target.dataset.i].percent = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
        recalc();
      });
    });
    roomListEl.querySelectorAll('.rt-delete').forEach(el => {
      el.addEventListener('click', (e) => {
        roomTypes.splice(+e.target.dataset.i, 1);
        renderRoomTypes();
      });
    });
  }

  btnAddType.addEventListener('click', () => {
    const colors = ['#cc6644', '#44aacc', '#aa44cc', '#cccc44', '#cc4488', '#44ccaa'];
    roomTypes.push({
      id: 'custom_' + Date.now(),
      name: 'New Room Type',
      color: colors[roomTypes.length % colors.length],
      modulesWide: 3,
      modulesDeep: 3,
      levelsHigh: 1,
      percent: 5,
      description: '',
    });
    renderRoomTypes();
  });

  // ---- Recalculate everything ----
  function recalc() {
    const cfg = readConfig();
    const r = Habitat.calc(cfg);
    const fmt = Habitat.formatNum;
    const ms = cfg.moduleSize;
    const levelH = ms.h + cfg.utilityHeight;

    // Geometry hints
    out.circumference.textContent = `C = ${fmt(r.circumference)} m`;

    // Physics
    out.rpm.textContent = r.rpm.toFixed(3) + ' RPM';
    out.gravity.textContent = (r.levelGravities[0]?.gFraction || 0).toFixed(3) + ' g';
    out.coriolis.textContent = r.coriolisNote;

    // Shield
    out.shieldMass.textContent = Habitat.formatMass(r.shieldMass);

    // Allocation total
    const usedPct = roomTypes.reduce((s, t) => s + t.percent, 0);
    const infraPct = Math.max(0, 100 - usedPct);
    out.allocTotal.textContent = usedPct > 100
      ? `Total: ${usedPct}% (over by ${usedPct - 100}%!)`
      : `Total: ${usedPct}% + ${infraPct}% infrastructure = 100%`;
    out.allocTotal.className = usedPct > 100 ? 'hint warn' : 'hint';

    // Allocation bar
    let barHTML = '';
    for (const rt of roomTypes) {
      barHTML += `<div class="alloc-bar-seg" style="width:${rt.percent}%;background:${rt.color};" title="${rt.name}: ${rt.percent}%"></div>`;
    }
    if (infraPct > 0) {
      barHTML += `<div class="alloc-bar-seg" style="width:${infraPct}%;background:#555;" title="Infrastructure: ${infraPct}%"></div>`;
    }
    out.allocBar.innerHTML = barHTML;

    // Room info per type
    const allocation = Rooms.allocate(roomTypes, r.modulesPerLevel, cfg.levels, ms);
    allocation.rooms.forEach((room, i) => {
      const infoEl = document.getElementById(`rt-info-${i}`);
      if (infoEl) {
        const dimW = room.modulesWide * ms.w;
        const dimD = room.modulesDeep * ms.d;
        const dimH = room.levelsHigh * levelH;
        infoEl.innerHTML = `
          <span><strong>${dimW}×${dimD}×${dimH.toFixed(1)} m</strong></span>
          <span>${fmt(room.count)} units</span>
          <span>${fmt(room.totalArea)} m² total</span>
        `;
      }
    });

    // Summary
    const estPop = Math.floor((allocation.rooms.find(r => r.id === 'residential')?.totalArea || 0) / 30);
    renderSummary(r, allocation, estPop, cfg);

    return cfg;
  }

  function renderSummary(r, alloc, estPop, cfg) {
    const fmt = Habitat.formatNum;
    const rows = [
      ['Circumference (floor)', fmt(r.circumference) + ' m'],
      ['Floor area per level', fmt(r.floorAreaPerLevel) + ' m²'],
      ['Total floor area', fmt(r.totalFloorArea) + ' m²'],
      ['Total hab. volume', fmt(r.totalVolume) + ' m³'],
      ['Modules per level', fmt(r.modulesPerLevel)],
      ['Total modules', fmt(r.totalModules)],
    ];
    for (const room of alloc.rooms) {
      rows.push([room.name + ' units', fmt(room.count)]);
    }
    rows.push(
      ['Infrastructure', alloc.infraPercent + '%'],
      ['Est. population', fmt(estPop)],
      ['Shield water', Habitat.formatMass(r.shieldMass)],
      ['Spin period', r.periodSec.toFixed(1) + ' s'],
    );
    out.summary.innerHTML = rows.map(([lbl, val]) =>
      `<div class="row"><span class="lbl">${lbl}</span><span class="val">${val}</span></div>`
    ).join('');
  }

  // Bind geometry inputs
  Object.values(inp).forEach(el => {
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });

  function escapeAttr(str) { return str.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function setProject(id) { currentProjectId = id; }
  function getProjectId() { return currentProjectId; }
  function getRoomTypes() { return roomTypes; }

  return { loadFromConfig, readConfig, recalc, setProject, getProjectId, getRoomTypes };
})();
