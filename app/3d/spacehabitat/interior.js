/**
 * Interior scene builder — generates hallways, floors, room blocks for walk-through view.
 * Multi-level rooms (agriculture, parks) get their full height with open ceilings.
 */
const Interior = (() => {
  let group = null;
  let cfg = null;
  let currentFloor = 0;
  let tallRoomPositions = []; // track tall rooms for roof view

  const HALLWAY_W = 5;

  function build(scene, habitatCfg, roomTypes) {
    cleanup(scene);
    cfg = habitatCfg;
    group = new THREE.Group();
    tallRoomPositions = [];

    const ms = cfg.moduleSize || { w: 3, d: 3, h: 3 };
    const utilH = cfg.utilityHeight || 1;
    const levelH = ms.h + utilH;
    const R = cfg.majorRadius;
    const r = cfg.tubeRadius;
    const floorR = R + r;

    buildFloor(currentFloor, floorR, levelH, ms, roomTypes, R);

    scene.add(group);
    return group;
  }

  function buildFloor(floorIdx, floorR, levelH, ms, roomTypes, R) {
    while (group.children.length) group.remove(group.children[0]);
    tallRoomPositions = [];

    const circumference = 2 * Math.PI * (floorR - floorIdx * levelH);
    const visibleArc = Math.min(circumference, 300);
    const halfArc = visibleArc / 2;
    const floorWidth = cfg.floorWidth || 40;
    const halfWidth = floorWidth / 2;
    const roomH = ms.h;
    const utilH = cfg.utilityHeight || 1;
    const wallThick = cfg.wallThickness || 0.3;
    const sideWidth = (floorWidth - HALLWAY_W) / 2;

    // ---- Materials ----
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.9 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.8 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.7 });
    const hallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.9 });
    const hallCeilMat = new THREE.MeshStandardMaterial({
      color: 0x505060, roughness: 0.6, emissive: 0x111122, emissiveIntensity: 0.3,
    });

    // ---- Floor ----
    const floorGeo = new THREE.PlaneGeometry(visibleArc, floorWidth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    group.add(floor);

    // ---- Hallway floor stripe ----
    const hallGeo = new THREE.PlaneGeometry(visibleArc, HALLWAY_W);
    const hall = new THREE.Mesh(hallGeo, hallMat);
    hall.rotation.x = -Math.PI / 2;
    hall.position.set(0, 0.005, 0);
    group.add(hall);

    // ---- Hallway ceiling (standard height) ----
    const hallCeil = new THREE.Mesh(hallGeo.clone(), hallCeilMat);
    hallCeil.rotation.x = Math.PI / 2;
    hallCeil.position.set(0, roomH - 0.005, 0);
    group.add(hallCeil);

    // ---- Outer walls (full height of tallest possible room) ----
    const maxLevels = roomTypes ? Math.max(...roomTypes.map(rt => rt.levelsHigh), 1) : 1;
    const maxRoomH = maxLevels * (roomH + utilH);
    const outerWallGeo = new THREE.PlaneGeometry(visibleArc, maxRoomH);

    const wallL = new THREE.Mesh(outerWallGeo, wallMat);
    wallL.position.set(0, maxRoomH / 2, -halfWidth);
    group.add(wallL);

    const wallR = new THREE.Mesh(outerWallGeo.clone(), wallMat);
    wallR.rotation.y = Math.PI;
    wallR.position.set(0, maxRoomH / 2, halfWidth);
    group.add(wallR);

    // ---- Build room blocks on both sides ----
    buildRoomBlocks(visibleArc, sideWidth, roomH, utilH, ms, roomTypes, HALLWAY_W, wallThick, ceilMat);

    // ---- Ceiling for standard-height gaps (between tall rooms) ----
    // Already handled per-room in buildRoomBlocks

    // ---- Lighting ----
    const lightSpacing = 15;
    const lightCount = Math.ceil(visibleArc / lightSpacing);
    for (let i = 0; i < lightCount; i++) {
      const lx = -halfArc + i * lightSpacing + lightSpacing / 2;
      // Hallway lights
      const light = new THREE.PointLight(0xddeeff, 0.7, 35);
      light.position.set(lx, roomH - 0.3, 0);
      group.add(light);
    }

    // Extra lights for tall rooms
    for (const tp of tallRoomPositions) {
      const tallLight = new THREE.PointLight(
        tp.isNature ? 0xcceeaa : 0xddeeff,
        tp.isNature ? 1.0 : 0.6,
        tp.height * 1.5
      );
      tallLight.position.set(tp.x, tp.height - 1, tp.z);
      group.add(tallLight);
    }

    const amb = new THREE.AmbientLight(0x667788, 0.5);
    group.add(amb);
  }

  function buildRoomBlocks(arcLen, sideWidth, roomH, utilH, ms, roomTypes, hallwayW, wallThick, ceilMat) {
    if (!roomTypes || roomTypes.length === 0) return;
    const halfArc = arcLen / 2;

    for (let side = 0; side < 2; side++) {
      const zBase = side === 0
        ? -(hallwayW / 2 + wallThick)
        : (hallwayW / 2 + wallThick);
      const zDir = side === 0 ? -1 : 1;

      let x = -halfArc + wallThick;
      let typeIdx = side * 2;

      while (x < halfArc - 2) {
        const rt = roomTypes[typeIdx % roomTypes.length];
        const roomW = rt.modulesWide * ms.w;
        const roomD = Math.min(rt.modulesDeep * ms.d, sideWidth - wallThick);
        if (x + roomW > halfArc) break;

        const isTall = rt.levelsHigh > 1;
        const fullH = rt.levelsHigh * (roomH + utilH) - utilH; // total interior height
        const thisRoomH = isTall ? fullH : roomH;
        const isNature = rt.id === 'park' || rt.name.toLowerCase().includes('park') ||
                         rt.name.toLowerCase().includes('garden');

        const color = new THREE.Color(rt.color);

        // ---- Room floor ----
        const rfGeo = new THREE.PlaneGeometry(roomW - wallThick, roomD - wallThick);
        if (isNature) {
          // Green ground for parks
          const grassMat = new THREE.MeshStandardMaterial({ color: 0x336622, roughness: 1.0 });
          const rf = new THREE.Mesh(rfGeo, grassMat);
          rf.rotation.x = -Math.PI / 2;
          rf.position.set(x + roomW / 2, 0.01, zBase + zDir * (roomD / 2));
          group.add(rf);

          // Add some "tree" cylinders and canopy spheres for parks
          addParkDecor(x + roomW / 2, roomD, zBase + zDir * (roomD / 2), thisRoomH, roomW);
        } else {
          const roomFloorMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: true, opacity: 0.6 });
          const rf = new THREE.Mesh(rfGeo, roomFloorMat);
          rf.rotation.x = -Math.PI / 2;
          rf.position.set(x + roomW / 2, 0.01, zBase + zDir * (roomD / 2));
          group.add(rf);
        }

        // ---- Room ceiling (at THIS room's height) ----
        const rcGeo = new THREE.PlaneGeometry(roomW - wallThick, roomD - wallThick);
        if (isTall && isNature) {
          // Sky-like ceiling for parks — emissive blue
          const skyMat = new THREE.MeshStandardMaterial({
            color: 0x88bbee, emissive: 0x446688, emissiveIntensity: 0.8, roughness: 0.3,
          });
          const rc = new THREE.Mesh(rcGeo, skyMat);
          rc.rotation.x = Math.PI / 2;
          rc.position.set(x + roomW / 2, thisRoomH, zBase + zDir * (roomD / 2));
          group.add(rc);
        } else {
          const rcMat = isTall
            ? new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.7 })
            : ceilMat;
          const rc = new THREE.Mesh(rcGeo, rcMat);
          rc.rotation.x = Math.PI / 2;
          rc.position.set(x + roomW / 2, thisRoomH, zBase + zDir * (roomD / 2));
          group.add(rc);
        }

        // ---- Side divider walls (full room height) ----
        const divMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.7 });
        const divGeo = new THREE.PlaneGeometry(roomD, thisRoomH);
        const divL = new THREE.Mesh(divGeo, divMat);
        divL.rotation.y = Math.PI / 2;
        divL.position.set(x, thisRoomH / 2, zBase + zDir * (roomD / 2));
        group.add(divL);

        // Right divider
        const divR = new THREE.Mesh(divGeo.clone(), divMat);
        divR.rotation.y = -Math.PI / 2;
        divR.position.set(x + roomW, thisRoomH / 2, zBase + zDir * (roomD / 2));
        group.add(divR);

        // ---- Back wall (at outer edge) ----
        const backGeo = new THREE.PlaneGeometry(roomW, thisRoomH);
        const backWall = new THREE.Mesh(backGeo, divMat);
        backWall.rotation.y = side === 0 ? Math.PI : 0;
        backWall.position.set(x + roomW / 2, thisRoomH / 2, zBase + zDir * roomD);
        group.add(backWall);

        // ---- Hallway-facing wall with door (standard hallway height) ----
        const doorW = isTall ? 2.0 : 1.2;
        const doorH = 2.2;
        buildDoorWall(x, roomW, thisRoomH, doorW, doorH, zBase, side, divMat);

        // ---- If tall, fill the gap between hallway ceiling and room top ----
        if (isTall) {
          // The hallway ceiling is at roomH. Above the hallway-facing wall
          // there's already the full-height wall with a door. But we need
          // a ceiling panel for the hallway area outside this room at standard height.
          // This is handled by the hallway ceiling strip already.

          // Track for roof view
          tallRoomPositions.push({
            x: x + roomW / 2,
            z: zBase + zDir * (roomD / 2),
            width: roomW,
            depth: roomD,
            height: thisRoomH,
            isNature,
            name: rt.name,
          });
        }

        // ---- Color label above door ----
        const labelGeo = new THREE.PlaneGeometry(Math.min(roomW * 0.6, 3), 0.3);
        const labelMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
        const label = new THREE.Mesh(labelGeo, labelMat);
        label.rotation.y = side === 0 ? 0 : Math.PI;
        label.position.set(x + roomW / 2, doorH + 0.3, zBase + (side === 0 ? 0.02 : -0.02));
        group.add(label);

        x += roomW + wallThick;
        typeIdx++;
      }
    }
  }

  function buildDoorWall(x, roomW, roomH, doorW, doorH, zBase, side, mat) {
    const wSegW = (roomW - doorW) / 2;

    // Left of door (full height)
    if (wSegW > 0.1) {
      const geo = new THREE.PlaneGeometry(wSegW, roomH);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = side === 0 ? 0 : Math.PI;
      m.position.set(x + wSegW / 2, roomH / 2, zBase);
      group.add(m);
    }

    // Right of door (full height)
    if (wSegW > 0.1) {
      const geo = new THREE.PlaneGeometry(wSegW, roomH);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = side === 0 ? 0 : Math.PI;
      m.position.set(x + roomW - wSegW / 2, roomH / 2, zBase);
      group.add(m);
    }

    // Above door
    const aboveH = roomH - doorH;
    if (aboveH > 0) {
      const geo = new THREE.PlaneGeometry(doorW, aboveH);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = side === 0 ? 0 : Math.PI;
      m.position.set(x + roomW / 2, doorH + aboveH / 2, zBase);
      group.add(m);
    }
  }

  function addParkDecor(cx, depth, cz, height, width) {
    // Scatter some simple trees (trunk cylinders + canopy spheres)
    const treeCount = Math.max(2, Math.floor((width * depth) / 80));
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x338833, roughness: 0.8 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.8 });

    for (let i = 0; i < treeCount; i++) {
      const tx = cx + (Math.random() - 0.5) * (width * 0.7);
      const tz = cz + (Math.random() - 0.5) * (depth * 0.5);
      const treeH = 2 + Math.random() * Math.min(height * 0.4, 6);
      const canopyR = 1.0 + Math.random() * 1.5;

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, treeH, 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, treeH / 2, tz);
      group.add(trunk);

      // Canopy
      const canopyGeo = new THREE.SphereGeometry(canopyR, 8, 6);
      const canopy = new THREE.Mesh(canopyGeo, i % 2 === 0 ? leafMat : leafMat2);
      canopy.position.set(tx, treeH + canopyR * 0.5, tz);
      group.add(canopy);
    }

    // A couple of "grass patches" — slightly raised green planes
    const patchCount = Math.max(1, Math.floor((width * depth) / 120));
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x447733, roughness: 1.0 });
    for (let i = 0; i < patchCount; i++) {
      const pw = 3 + Math.random() * 5;
      const pd = 2 + Math.random() * 4;
      const geo = new THREE.PlaneGeometry(pw, pd);
      const patch = new THREE.Mesh(geo, grassMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(
        cx + (Math.random() - 0.5) * (width * 0.6),
        0.02,
        cz + (Math.random() - 0.5) * (depth * 0.4)
      );
      group.add(patch);
    }
  }

  function setFloor(floorIdx, scene, habitatCfg, roomTypes) {
    currentFloor = floorIdx;
    if (cfg && group) {
      build(scene, habitatCfg, roomTypes);
    }
    return currentFloor;
  }

  function getFloor() { return currentFloor; }

  function cleanup(scene) {
    if (group) {
      scene.remove(group);
      group = null;
    }
  }

  function getCameraStart() {
    return { x: 0, y: 1.7, z: 0 };
  }

  // Roof view — position camera above a tall room looking down
  function getRoofViewPosition() {
    if (tallRoomPositions.length === 0) return null;
    // Pick the first (usually largest) park/nature area, or just the tallest
    const best = tallRoomPositions.reduce((a, b) => {
      if (a.isNature && !b.isNature) return a;
      if (!a.isNature && b.isNature) return b;
      return a.height > b.height ? a : b;
    });
    return {
      x: best.x,
      y: best.height - 0.5,
      z: best.z,
      lookY: 0,
      name: best.name,
    };
  }

  function getTallRoomPositions() { return tallRoomPositions; }

  return { build, setFloor, getFloor, cleanup, getCameraStart, getRoofViewPosition, getTallRoomPositions };
})();
