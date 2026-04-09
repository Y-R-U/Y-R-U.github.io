/**
 * Interior scene builder — generates hallways, floors, room blocks for walk-through view.
 * Multi-level rooms (agriculture, parks) get their full height with open ceilings.
 *
 * PERFORMANCE: Only renders ~100m of arc, shares materials, uses low-poly geometry.
 */
const Interior = (() => {
  let group = null;
  let cfg = null;
  let currentFloor = 0;
  let tallRoomPositions = [];

  const HALLWAY_W = 5;
  const VISIBLE_ARC = 100; // metres — keep low for mobile perf

  // Shared materials (created once, reused)
  let mats = null;
  function getMats() {
    if (mats) return mats;
    mats = {
      floor:    new THREE.MeshLambertMaterial({ color: 0x444455 }),
      ceil:     new THREE.MeshLambertMaterial({ color: 0x333344 }),
      wall:     new THREE.MeshLambertMaterial({ color: 0x555566 }),
      hall:     new THREE.MeshLambertMaterial({ color: 0x3a3a4a }),
      hallCeil: new THREE.MeshLambertMaterial({ color: 0x505060, emissive: 0x111122, emissiveIntensity: 0.3 }),
      div:      new THREE.MeshLambertMaterial({ color: 0x666677 }),
      grass:    new THREE.MeshLambertMaterial({ color: 0x336622 }),
      grass2:   new THREE.MeshLambertMaterial({ color: 0x447733 }),
      sky:      new THREE.MeshLambertMaterial({ color: 0x88bbee, emissive: 0x446688, emissiveIntensity: 0.8 }),
      tallCeil: new THREE.MeshLambertMaterial({ color: 0x444455 }),
      trunk:    new THREE.MeshLambertMaterial({ color: 0x5c3a1a }),
      leaf1:    new THREE.MeshLambertMaterial({ color: 0x338833 }),
      leaf2:    new THREE.MeshLambertMaterial({ color: 0x2a7a2a }),
    };
    return mats;
  }

  // Shared low-poly geometries
  let sharedGeo = null;
  function getSharedGeo() {
    if (sharedGeo) return sharedGeo;
    sharedGeo = {
      trunk:  new THREE.CylinderBufferGeometry(0.15, 0.2, 1, 5),  // scale Y per tree
      canopy: new THREE.SphereBufferGeometry(1, 6, 4),             // scale per tree
    };
    return sharedGeo;
  }

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

    const M = getMats();
    const circumference = 2 * Math.PI * (floorR - floorIdx * levelH);
    const visibleArc = Math.min(circumference, VISIBLE_ARC);
    const halfArc = visibleArc / 2;
    const floorWidth = cfg.floorWidth || 40;
    const halfWidth = floorWidth / 2;
    const roomH = ms.h;
    const utilH = cfg.utilityHeight || 1;
    const wallThick = cfg.wallThickness || 0.3;
    const sideWidth = (floorWidth - HALLWAY_W) / 2;

    // ---- Floor + hallway stripe (single meshes) ----
    const floorGeo = new THREE.PlaneBufferGeometry(visibleArc, floorWidth);
    const floor = new THREE.Mesh(floorGeo, M.floor);
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    const hallGeo = new THREE.PlaneBufferGeometry(visibleArc, HALLWAY_W);
    const hall = new THREE.Mesh(hallGeo, M.hall);
    hall.rotation.x = -Math.PI / 2;
    hall.position.y = 0.005;
    group.add(hall);

    // ---- Hallway ceiling ----
    const hallCeil = new THREE.Mesh(hallGeo.clone(), M.hallCeil);
    hallCeil.rotation.x = Math.PI / 2;
    hallCeil.position.y = roomH - 0.005;
    group.add(hallCeil);

    // ---- Outer walls ----
    const maxLevels = roomTypes ? Math.max(...roomTypes.map(rt => rt.levelsHigh), 1) : 1;
    const maxRoomH = maxLevels * (roomH + utilH);
    const outerWallGeo = new THREE.PlaneBufferGeometry(visibleArc, maxRoomH);

    const wallL = new THREE.Mesh(outerWallGeo, M.wall);
    wallL.position.set(0, maxRoomH / 2, -halfWidth);
    group.add(wallL);

    const wallR = new THREE.Mesh(outerWallGeo.clone(), M.wall);
    wallR.rotation.y = Math.PI;
    wallR.position.set(0, maxRoomH / 2, halfWidth);
    group.add(wallR);

    // ---- Room blocks ----
    buildRoomBlocks(visibleArc, sideWidth, roomH, utilH, ms, roomTypes, HALLWAY_W, wallThick);

    // ---- Lighting (fewer lights, wider spacing) ----
    const lightSpacing = 25;
    const lightCount = Math.ceil(visibleArc / lightSpacing);
    for (let i = 0; i < lightCount; i++) {
      const lx = -halfArc + i * lightSpacing + lightSpacing / 2;
      const light = new THREE.PointLight(0xddeeff, 0.8, 30);
      light.position.set(lx, roomH - 0.3, 0);
      group.add(light);
    }

    // One extra light per tall room (max 4)
    const tallLightMax = Math.min(tallRoomPositions.length, 4);
    for (let i = 0; i < tallLightMax; i++) {
      const tp = tallRoomPositions[i];
      const tl = new THREE.PointLight(tp.isNature ? 0xcceeaa : 0xddeeff, 0.6, tp.height * 1.2);
      tl.position.set(tp.x, tp.height - 1, tp.z);
      group.add(tl);
    }

    group.add(new THREE.AmbientLight(0x667788, 0.6));
  }

  function buildRoomBlocks(arcLen, sideWidth, roomH, utilH, ms, roomTypes, hallwayW, wallThick) {
    if (!roomTypes || roomTypes.length === 0) return;
    const M = getMats();
    const halfArc = arcLen / 2;

    for (let side = 0; side < 2; side++) {
      const zBase = side === 0 ? -(hallwayW / 2 + wallThick) : (hallwayW / 2 + wallThick);
      const zDir = side === 0 ? -1 : 1;

      let x = -halfArc + wallThick;
      let typeIdx = side * 2;

      while (x < halfArc - 2) {
        const rt = roomTypes[typeIdx % roomTypes.length];
        const roomW = rt.modulesWide * ms.w;
        const roomD = Math.min(rt.modulesDeep * ms.d, sideWidth - wallThick);
        if (x + roomW > halfArc) break;

        const isTall = rt.levelsHigh > 1;
        const fullH = rt.levelsHigh * (roomH + utilH) - utilH;
        const thisRoomH = isTall ? fullH : roomH;
        const isNature = rt.id === 'park' || rt.name.toLowerCase().includes('park') ||
                         rt.name.toLowerCase().includes('garden');

        const color = new THREE.Color(rt.color);
        const cx = x + roomW / 2;
        const cz = zBase + zDir * (roomD / 2);

        // ---- Room floor ----
        const rfGeo = new THREE.PlaneBufferGeometry(roomW - wallThick, roomD - wallThick);
        if (isNature) {
          const rf = new THREE.Mesh(rfGeo, M.grass);
          rf.rotation.x = -Math.PI / 2;
          rf.position.set(cx, 0.01, cz);
          group.add(rf);
          addParkDecor(cx, roomD, cz, thisRoomH, roomW);
        } else {
          // Reuse a per-type material if possible (cache on rt)
          if (!rt._floorMat) rt._floorMat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.6 });
          const rf = new THREE.Mesh(rfGeo, rt._floorMat);
          rf.rotation.x = -Math.PI / 2;
          rf.position.set(cx, 0.01, cz);
          group.add(rf);
        }

        // ---- Room ceiling ----
        const rcGeo = new THREE.PlaneBufferGeometry(roomW - wallThick, roomD - wallThick);
        const rcMat = (isTall && isNature) ? M.sky : (isTall ? M.tallCeil : M.ceil);
        const rc = new THREE.Mesh(rcGeo, rcMat);
        rc.rotation.x = Math.PI / 2;
        rc.position.set(cx, thisRoomH, cz);
        group.add(rc);

        // ---- Side dividers ----
        const divGeo = new THREE.PlaneBufferGeometry(roomD, thisRoomH);
        const divL = new THREE.Mesh(divGeo, M.div);
        divL.rotation.y = Math.PI / 2;
        divL.position.set(x, thisRoomH / 2, cz);
        group.add(divL);

        // Skip right divider for most rooms — next room's left divider covers it
        // Only add if last room in row
        if (x + roomW + wallThick >= halfArc - 2) {
          const divR = new THREE.Mesh(divGeo.clone(), M.div);
          divR.rotation.y = -Math.PI / 2;
          divR.position.set(x + roomW, thisRoomH / 2, cz);
          group.add(divR);
        }

        // ---- Back wall ----
        const backGeo = new THREE.PlaneBufferGeometry(roomW, thisRoomH);
        const back = new THREE.Mesh(backGeo, M.div);
        back.rotation.y = side === 0 ? Math.PI : 0;
        back.position.set(cx, thisRoomH / 2, zBase + zDir * roomD);
        group.add(back);

        // ---- Door wall (simplified: one wall with no geometry door, just shorter) ----
        const doorH = 2.2;
        const aboveH = thisRoomH - doorH;
        // Full wall above door height
        if (aboveH > 0.1) {
          const abGeo = new THREE.PlaneBufferGeometry(roomW, aboveH);
          const ab = new THREE.Mesh(abGeo, M.div);
          ab.rotation.y = side === 0 ? 0 : Math.PI;
          ab.position.set(cx, doorH + aboveH / 2, zBase);
          group.add(ab);
        }
        // Two side panels at door height (skip door opening in centre)
        const doorW = isTall ? 2.0 : 1.2;
        const segW = (roomW - doorW) / 2;
        if (segW > 0.1) {
          const segGeo = new THREE.PlaneBufferGeometry(segW, doorH);
          const s1 = new THREE.Mesh(segGeo, M.div);
          s1.rotation.y = side === 0 ? 0 : Math.PI;
          s1.position.set(x + segW / 2, doorH / 2, zBase);
          group.add(s1);

          const s2 = new THREE.Mesh(segGeo.clone(), M.div);
          s2.rotation.y = side === 0 ? 0 : Math.PI;
          s2.position.set(x + roomW - segW / 2, doorH / 2, zBase);
          group.add(s2);
        }

        // ---- Color label ----
        if (!rt._labelMat) rt._labelMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
        const labelGeo = new THREE.PlaneBufferGeometry(Math.min(roomW * 0.6, 3), 0.3);
        const label = new THREE.Mesh(labelGeo, rt._labelMat);
        label.rotation.y = side === 0 ? 0 : Math.PI;
        label.position.set(cx, doorH + 0.3, zBase + (side === 0 ? 0.02 : -0.02));
        group.add(label);

        // Track tall rooms
        if (isTall) {
          tallRoomPositions.push({ x: cx, z: cz, width: roomW, depth: roomD, height: thisRoomH, isNature, name: rt.name });
        }

        x += roomW + wallThick;
        typeIdx++;
      }
    }
  }

  function addParkDecor(cx, depth, cz, height, width) {
    const M = getMats();
    const G = getSharedGeo();
    // Fewer trees on mobile
    const treeCount = Math.min(Math.max(1, Math.floor((width * depth) / 150)), 5);

    for (let i = 0; i < treeCount; i++) {
      const tx = cx + (Math.random() - 0.5) * (width * 0.7);
      const tz = cz + (Math.random() - 0.5) * (depth * 0.5);
      const treeH = 2 + Math.random() * Math.min(height * 0.4, 5);
      const canopyR = 1.0 + Math.random() * 1.2;

      const trunk = new THREE.Mesh(G.trunk, M.trunk);
      trunk.position.set(tx, treeH / 2, tz);
      trunk.scale.y = treeH;
      group.add(trunk);

      const canopy = new THREE.Mesh(G.canopy, i % 2 === 0 ? M.leaf1 : M.leaf2);
      canopy.position.set(tx, treeH + canopyR * 0.5, tz);
      canopy.scale.setScalar(canopyR);
      group.add(canopy);
    }
  }

  function setFloor(floorIdx, scene, habitatCfg, roomTypes) {
    currentFloor = floorIdx;
    if (cfg && group) build(scene, habitatCfg, roomTypes);
    return currentFloor;
  }

  function getFloor() { return currentFloor; }

  function cleanup(scene) {
    if (group) { scene.remove(group); group = null; }
  }

  function getCameraStart() { return { x: 0, y: 1.7, z: 0 }; }

  function getRoofViewPosition() {
    if (tallRoomPositions.length === 0) return null;
    const best = tallRoomPositions.reduce((a, b) => {
      if (a.isNature && !b.isNature) return a;
      if (!a.isNature && b.isNature) return b;
      return a.height > b.height ? a : b;
    });
    return { x: best.x, y: best.height - 0.5, z: best.z, lookY: 0, name: best.name };
  }

  function getTallRoomPositions() { return tallRoomPositions; }

  return { build, setFloor, getFloor, cleanup, getCameraStart, getRoofViewPosition, getTallRoomPositions };
})();
