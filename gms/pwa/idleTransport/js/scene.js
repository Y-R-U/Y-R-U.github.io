// ============================================================
// Idle Transport Empire - Babylon.js Scene (Fallout Shelter rooms)
// ============================================================

const Scene = {
    engine: null,
    scene: null,
    camera: null,
    rooms: [],          // { meshes[], vehicles[], routeIdx }
    loadedGLB: {},      // filename -> root mesh
    camTargetY: 0,
    camCurrentY: 0,
    touchStartY: null,
    scrollVelocity: 0,
    lastTouchY: 0,
    lastTouchTime: 0,

    init() {
        const canvas = document.getElementById('render-canvas');
        this.engine = new BABYLON.Engine(canvas, true, {
            preserveDrawingBuffer: false,
            stencil: false,
            antialias: true
        });
        this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.09, 1);
        this.scene.ambientColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

        this._setupCamera(canvas);
        this._setupLights();
        this._setupTouch(canvas);

        this.engine.runRenderLoop(() => this.scene.render());
        window.addEventListener('resize', () => this.engine.resize());
    },

    _setupCamera(canvas) {
        // Front-facing cross-section view like Fallout Shelter
        // Camera positioned in front of rooms (+z), looking at -z
        this.camera = new BABYLON.ArcRotateCamera(
            'cam',
            Math.PI / 2,          // alpha - camera at +z looking toward -z
            Math.PI / 2.15,       // beta - slight downward angle
            14,                   // radius - closer for bigger rooms
            new BABYLON.Vector3(0, 1.5, 0),
            this.scene
        );
        this.camera.lowerRadiusLimit = 10;
        this.camera.upperRadiusLimit = 35;
        this.camera.fov = 1.2;
        this.camera.minZ = 0.1;
        this.camera.maxZ = 120;
        this.camera.attachControl(canvas, false);
        this.camera.inputs.clear();
    },

    _setupLights() {
        const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.3), this.scene);
        hemi.intensity = 0.7;
        hemi.groundColor = new BABYLON.Color3(0.1, 0.1, 0.15);

        const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.4, -0.8, 0.4), this.scene);
        dir.intensity = 0.45;
        dir.position = new BABYLON.Vector3(10, 20, -10);
    },

    _setupTouch(canvas) {
        const vp = document.getElementById('viewport');

        // Clicking on viewport = earn money
        vp.addEventListener('click', (e) => {
            if (e.target.closest('#event-banner') || e.target.closest('#tutorial') || e.target.closest('#bonus-bar')) return;
            const cv = getClickVal();
            G.money += cv;
            G.totalEarned += cv;
            G.totalClicks++;
            Audio.sfx('click');
            this._showEarnFloat(e.clientX, e.clientY, cv);
            UI.updateHUD();
            checkAchievements();
        });

        // Touch scroll for rooms
        vp.addEventListener('touchstart', (e) => {
            if (e.target.closest('#event-banner') || e.target.closest('#tutorial')) return;
            this.touchStartY = e.touches[0].clientY;
            this.lastTouchY = this.touchStartY;
            this.lastTouchTime = Date.now();
            this.scrollVelocity = 0;
        }, { passive: true });

        vp.addEventListener('touchmove', (e) => {
            if (this.touchStartY === null) return;
            const y = e.touches[0].clientY;
            const dy = y - this.lastTouchY;
            const now = Date.now();
            const dt = Math.max(1, now - this.lastTouchTime);
            this.scrollVelocity = dy / dt * 16; // px per frame
            this.camTargetY += dy * 0.035;
            this.lastTouchY = y;
            this.lastTouchTime = now;
        }, { passive: true });

        vp.addEventListener('touchend', () => {
            this.touchStartY = null;
        }, { passive: true });

        // Mouse wheel scroll
        vp.addEventListener('wheel', (e) => {
            this.camTargetY -= e.deltaY * 0.015;
            e.preventDefault();
        }, { passive: false });
    },

    _showEarnFloat(x, y, amount) {
        const el = document.createElement('div');
        el.className = 'earn-float';
        el.textContent = '+' + fmtMoney(amount);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        document.getElementById('viewport').appendChild(el);
        setTimeout(() => el.remove(), 900);
    },

    // ---- Room management ----
    buildAllRooms() {
        // Dispose old rooms
        for (const room of this.rooms) {
            for (const m of room.meshes) m.dispose();
            for (const v of room.vehicles) { if (v.mesh) v.mesh.dispose(); }
        }
        this.rooms = [];

        for (let i = 0; i < ROUTES.length; i++) {
            const def = ROUTES[i];
            const rt = G.routes[def.id];
            const isUnlocked = rt && rt.level > 0;
            const prevUnlocked = i === 0 || (G.routes[ROUTES[i - 1].id] && G.routes[ROUTES[i - 1].id].level > 0);

            // Only build room if unlocked or the next available to unlock
            if (!isUnlocked && !prevUnlocked) continue;

            const roomY = -i * (ROOM_HEIGHT + ROOM_GAP);
            const room = this._buildRoom(i, def, roomY, isUnlocked);
            this.rooms.push(room);
        }

        this._clampCamera();
    },

    _buildRoom(idx, def, y, unlocked) {
        const meshes = [];
        const W = ROOM_WIDTH;
        const H = ROOM_HEIGHT;
        const D = ROOM_DEPTH;

        const rc = def.roomColor;
        const fc = def.floorColor;
        const ac = def.accentColor;

        // Shared material creation helper
        const mat = (name, r, g, b, emit) => {
            const m = new BABYLON.StandardMaterial(name + idx, this.scene);
            m.diffuseColor = new BABYLON.Color3(r, g, b);
            if (emit) m.emissiveColor = new BABYLON.Color3(emit[0], emit[1], emit[2]);
            m.freeze();
            return m;
        };

        // Back wall
        const wall = BABYLON.MeshBuilder.CreatePlane('wall' + idx, { width: W, height: H }, this.scene);
        wall.position.set(0, y + H / 2, -D / 2);
        wall.material = mat('wallM', rc[0], rc[1], rc[2], [rc[0] * 0.15, rc[1] * 0.15, rc[2] * 0.15]);
        meshes.push(wall);

        // Floor
        const floor = BABYLON.MeshBuilder.CreateGround('floor' + idx, { width: W, height: D }, this.scene);
        floor.position.set(0, y, 0);
        floor.material = mat('floorM', fc[0], fc[1], fc[2]);
        meshes.push(floor);

        // Ceiling / divider beam
        const ceil = BABYLON.MeshBuilder.CreateBox('ceil' + idx, { width: W + 0.4, height: 0.25, depth: D + 0.2 }, this.scene);
        ceil.position.set(0, y + H, 0);
        ceil.material = mat('ceilM', 0.15, 0.15, 0.18);
        meshes.push(ceil);

        // Road surface
        const road = BABYLON.MeshBuilder.CreateGround('road' + idx, { width: W - 4, height: 1.8 }, this.scene);
        road.position.set(0, y + 0.01, 0);
        const roadMat = mat('roadM', 0.22, 0.22, 0.25);
        road.material = roadMat;
        meshes.push(road);

        // Road lines (dashes)
        for (let x = ROAD_START_X; x <= ROAD_END_X; x += 2) {
            const dash = BABYLON.MeshBuilder.CreateGround('dash' + idx + '_' + x, { width: 1, height: 0.06 }, this.scene);
            dash.position.set(x, y + 0.02, 0);
            dash.material = mat('dashM', 0.7, 0.7, 0.3, [0.2, 0.2, 0.08]);
            meshes.push(dash);
        }

        // Left building (source)
        const lb = this._createStructure(idx + 'L', -9.5, y, ac, unlocked);
        meshes.push(...lb);

        // Right building (destination)
        const rb = this._createStructure(idx + 'R', 9.5, y, [ac[0] * 0.7, ac[1] * 0.7, ac[2] * 0.7], unlocked);
        meshes.push(...rb);

        // Room label (using a thin plane with text - we'll just use colored label boxes)
        // Source label marker
        const srcMarker = BABYLON.MeshBuilder.CreateBox('srcM' + idx, { width: 0.3, height: 1.8, depth: 0.3 }, this.scene);
        srcMarker.position.set(-10.8, y + 1, 0);
        srcMarker.material = mat('srcMat', ac[0], ac[1], ac[2], [ac[0] * 0.3, ac[1] * 0.3, ac[2] * 0.3]);
        meshes.push(srcMarker);

        // Dest label marker
        const dstMarker = BABYLON.MeshBuilder.CreateBox('dstM' + idx, { width: 0.3, height: 1.8, depth: 0.3 }, this.scene);
        dstMarker.position.set(10.8, y + 1, 0);
        dstMarker.material = mat('dstMat', ac[0] * 0.7, ac[1] * 0.7, ac[2] * 0.7, [ac[0] * 0.2, ac[1] * 0.2, ac[2] * 0.2]);
        meshes.push(dstMarker);

        // Locked overlay (dark semi-transparent box)
        if (!unlocked) {
            const lock = BABYLON.MeshBuilder.CreatePlane('lock' + idx, { width: W, height: H }, this.scene);
            lock.position.set(0, y + H / 2, D / 2 - 0.5);
            const lockMat = new BABYLON.StandardMaterial('lockM' + idx, this.scene);
            lockMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            lockMat.alpha = 0.5;
            lock.material = lockMat;
            meshes.push(lock);
        }

        // Interior decorations (small boxes as crates/machines)
        if (unlocked) {
            const props = this._createProps(idx, y, def);
            meshes.push(...props);
        }

        // Point light per room for ambiance
        const light = new BABYLON.PointLight('rLight' + idx, new BABYLON.Vector3(0, y + H - 0.5, 1), this.scene);
        light.intensity = unlocked ? 0.3 : 0.08;
        light.diffuse = new BABYLON.Color3(ac[0], ac[1], ac[2]);
        light.range = W * 0.6;

        return { meshes, vehicles: [], routeIdx: idx, y, light, def };
    },

    _createStructure(id, x, y, color, lit) {
        const meshes = [];
        // Main building body
        const body = BABYLON.MeshBuilder.CreateBox('bldg' + id, { width: 2.5, height: 2.2, depth: 2.5 }, this.scene);
        body.position.set(x, y + 1.1, 0);
        const bm = new BABYLON.StandardMaterial('bldgM' + id, this.scene);
        bm.diffuseColor = new BABYLON.Color3(color[0], color[1], color[2]);
        if (lit) bm.emissiveColor = new BABYLON.Color3(color[0] * 0.1, color[1] * 0.1, color[2] * 0.1);
        bm.freeze();
        body.material = bm;
        meshes.push(body);

        // Roof
        const roof = BABYLON.MeshBuilder.CreateBox('roof' + id, { width: 2.8, height: 0.2, depth: 2.8 }, this.scene);
        roof.position.set(x, y + 2.3, 0);
        const rm = new BABYLON.StandardMaterial('roofM' + id, this.scene);
        rm.diffuseColor = new BABYLON.Color3(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5);
        rm.freeze();
        roof.material = rm;
        meshes.push(roof);

        // Door/loading dock (small colored rectangle)
        const door = BABYLON.MeshBuilder.CreatePlane('door' + id, { width: 1.2, height: 1.4 }, this.scene);
        door.position.set(x > 0 ? x - 1.26 : x + 1.26, y + 0.7, 0);
        door.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
        const dm = new BABYLON.StandardMaterial('doorM' + id, this.scene);
        dm.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.2);
        dm.emissiveColor = new BABYLON.Color3(color[0] * 0.2, color[1] * 0.2, color[2] * 0.15);
        dm.freeze();
        door.material = dm;
        meshes.push(door);

        return meshes;
    },

    _createProps(idx, y, def) {
        const meshes = [];
        const propMat = new BABYLON.StandardMaterial('propM' + idx, this.scene);
        propMat.diffuseColor = new BABYLON.Color3(def.accentColor[0] * 0.4, def.accentColor[1] * 0.4, def.accentColor[2] * 0.4);
        propMat.freeze();

        // Scatter small crate props
        const positions = [
            [-7, 0.3, 1.5], [-6, 0.25, -1.2], [6, 0.35, 1.3], [7, 0.2, -1.5],
            [-4, 0.2, 1.8], [4, 0.3, -1.8]
        ];
        for (const [px, ph, pz] of positions) {
            const s = 0.3 + Math.random() * 0.3;
            const crate = BABYLON.MeshBuilder.CreateBox('prop' + idx + px, { width: s, height: ph + s * 0.5, depth: s }, this.scene);
            crate.position.set(px, y + (ph + s * 0.5) / 2, pz);
            crate.material = propMat;
            meshes.push(crate);
        }
        return meshes;
    },

    // ---- Vehicle loading & management ----
    async loadVehicle(filename) {
        if (this.loadedGLB[filename]) return this.loadedGLB[filename];
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync('', 'assets/vehicles/', filename, this.scene);
            const root = result.meshes[0];
            root.scaling = new BABYLON.Vector3(2.0, 2.0, 2.0);
            root.setEnabled(false);
            this.loadedGLB[filename] = root;
            return root;
        } catch (e) {
            console.warn('Vehicle load failed:', filename, e);
            return null;
        }
    },

    async loadRouteVehicles() {
        const promises = [];
        for (const def of ROUTES) {
            const rt = G.routes[def.id];
            if (rt && rt.level > 0) {
                promises.push(this.loadVehicle(def.vehicle));
            }
        }
        await Promise.all(promises);
    },

    spawnVehiclesForRoom(room) {
        // Clean old vehicles
        for (const v of room.vehicles) { if (v.mesh) v.mesh.dispose(); }
        room.vehicles = [];

        const def = room.def;
        const rt = G.routes[def.id];
        if (!rt || rt.level === 0) return;

        const src = this.loadedGLB[def.vehicle];
        if (!src) return;

        const count = getVehicleCount(rt.level);
        const spacing = (ROAD_END_X - ROAD_START_X) / (count + 1);

        for (let i = 0; i < count; i++) {
            const clone = src.clone(def.id + '_v' + i);
            if (!clone) continue;
            clone.setEnabled(true);
            clone.position.set(ROAD_START_X + spacing * (i + 1), room.y + 0.35, 0);
            clone.rotation.y = Math.PI / 2;

            // Enable all child meshes
            clone.getChildMeshes().forEach(m => m.setEnabled(true));

            room.vehicles.push({
                mesh: clone,
                offset: i / count, // phase offset so vehicles are staggered
                goingRight: true
            });
        }
    },

    refreshRoomVehicles() {
        for (const room of this.rooms) {
            this.spawnVehiclesForRoom(room);
        }
    },

    // ---- Update loop ----
    update(dt) {
        // Smooth camera scroll with momentum
        if (this.touchStartY === null && Math.abs(this.scrollVelocity) > 0.01) {
            this.camTargetY += this.scrollVelocity;
            this.scrollVelocity *= 0.92; // friction
        }
        this._clampCamera();
        this.camCurrentY = lerp(this.camCurrentY, this.camTargetY, 0.12);
        this.camera.target.y = this.camCurrentY;

        // Animate vehicles in each room
        for (const room of this.rooms) {
            const def = room.def;
            const rt = G.routes[def.id];
            if (!rt || rt.level === 0) continue;

            const time = getRouteTime(def.id);
            const progress = (rt.progress || 0) / time;

            for (const v of room.vehicles) {
                // Each vehicle has a phase offset for visual stagger
                const phase = (progress + v.offset) % 1;
                // Ping-pong: 0->1 going right, 1->0 going left
                const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
                const goingRight = phase < 0.5;

                v.mesh.position.x = ROAD_START_X + (ROAD_END_X - ROAD_START_X) * t;
                v.mesh.position.y = room.y + 0.35;

                if (goingRight !== v.goingRight) {
                    v.goingRight = goingRight;
                    v.mesh.rotation.y = goingRight ? Math.PI / 2 : -Math.PI / 2;
                }
            }
        }
    },

    _clampCamera() {
        const maxDown = -(this.rooms.length - 1) * (ROOM_HEIGHT + ROOM_GAP);
        const maxUp = ROOM_HEIGHT;
        this.camTargetY = clamp(this.camTargetY, maxDown - 2, maxUp + 2);
    },

    // Scroll to show a specific room
    scrollToRoom(idx) {
        const targetY = -idx * (ROOM_HEIGHT + ROOM_GAP) + ROOM_HEIGHT / 2;
        this.camTargetY = targetY;
    },

    // Full rebuild after unlock/prestige
    async rebuildScene() {
        this.buildAllRooms();
        await this.loadRouteVehicles();
        this.refreshRoomVehicles();
    },

    dispose() {
        if (this.engine) this.engine.dispose();
    }
};
