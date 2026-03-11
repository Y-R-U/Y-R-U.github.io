// ============================================================
// Transport Empire - Babylon.js 3D Scene Manager
// ============================================================

const SceneManager = {
    engine: null,
    scene: null,
    camera: null,
    loadedMeshes: {},
    vehicles: [],
    ground: null,
    buildings: [],
    activeRouteIdx: 0,

    init() {
        const canvas = document.getElementById('render-canvas');
        this.engine = new BABYLON.Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true
        });
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.44, 0.72, 0.87, 1);
        this.scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);

        this._setupCamera(canvas);
        this._setupLights();
        this._buildEnvironment();
        this.createBuildings();

        this.engine.runRenderLoop(() => this.scene.render());
        window.addEventListener('resize', () => this.engine.resize());

        return this.loadInitialVehicle();
    },

    _setupCamera(canvas) {
        this.camera = new BABYLON.ArcRotateCamera(
            'cam', Math.PI / 2, Math.PI / 3.2, 12,
            new BABYLON.Vector3(0, 0, 0), this.scene
        );
        this.camera.lowerRadiusLimit = 8;
        this.camera.upperRadiusLimit = 20;
        this.camera.attachControl(canvas, false);
        this.camera.inputs.clear();
    },

    _setupLights() {
        const hemi = new BABYLON.HemisphericLight(
            'hemi', new BABYLON.Vector3(0, 1, 0.3), this.scene
        );
        hemi.intensity = 0.9;

        const dir = new BABYLON.DirectionalLight(
            'dir', new BABYLON.Vector3(-0.5, -1, 0.5), this.scene
        );
        dir.intensity = 0.5;
    },

    _buildEnvironment() {
        // Ground plane
        this.ground = BABYLON.MeshBuilder.CreateGround(
            'ground', { width: 30, height: 8 }, this.scene
        );
        const groundMat = new BABYLON.StandardMaterial('groundMat', this.scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.35, 0.55, 0.25);
        this.ground.material = groundMat;

        // Road surface
        const road = BABYLON.MeshBuilder.CreateGround(
            'road', { width: 26, height: 2 }, this.scene
        );
        road.position.y = 0.01;
        const roadMat = new BABYLON.StandardMaterial('roadMat', this.scene);
        roadMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.35);
        road.material = roadMat;

        // Dashed center line
        for (let i = -11; i <= 11; i += 2.5) {
            const line = BABYLON.MeshBuilder.CreateGround(
                'line' + i, { width: 1.2, height: 0.08 }, this.scene
            );
            line.position.y = 0.02;
            line.position.x = i;
            const lineMat = new BABYLON.StandardMaterial('lineMat' + i, this.scene);
            lineMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.5);
            lineMat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.15);
            line.material = lineMat;
        }
    },

    _getRouteColors(routeIdx) {
        const palette = [
            [new BABYLON.Color3(0.6, 0.3, 0.2), new BABYLON.Color3(0.7, 0.2, 0.2)],
            [new BABYLON.Color3(0.3, 0.5, 0.3), new BABYLON.Color3(0.2, 0.6, 0.3)],
            [new BABYLON.Color3(0.4, 0.4, 0.6), new BABYLON.Color3(0.5, 0.3, 0.5)],
            [new BABYLON.Color3(0.5, 0.4, 0.2), new BABYLON.Color3(0.6, 0.5, 0.2)],
            [new BABYLON.Color3(0.2, 0.5, 0.6), new BABYLON.Color3(0.3, 0.4, 0.7)],
            [new BABYLON.Color3(0.6, 0.4, 0.5), new BABYLON.Color3(0.5, 0.3, 0.6)],
            [new BABYLON.Color3(0.4, 0.5, 0.4), new BABYLON.Color3(0.3, 0.6, 0.4)],
            [new BABYLON.Color3(0.3, 0.3, 0.5), new BABYLON.Color3(0.4, 0.3, 0.6)],
        ];
        return palette[routeIdx % palette.length];
    },

    createBuildings() {
        for (const b of this.buildings) b.dispose();
        this.buildings = [];

        const colors = this._getRouteColors(this.activeRouteIdx);

        // Source building (left)
        this._createBuilding(-10, 3, 2.5, 2.5, colors[0], 0.5, 0.2, 0.2);
        // Destination building (right)
        this._createBuilding(10, 3.5, 3, 2.5, colors[1], 0.2, 0.3, 0.5);
        // Chimney on source
        this._addChimney(-9, 0.5);
        // Decorative trees
        this._addTrees([-6, -3, 3, 6]);
    },

    _createBuilding(x, w, h, d, color, roofR, roofG, roofB) {
        const box = BABYLON.MeshBuilder.CreateBox('bldg_' + x, { width: w, height: h, depth: d }, this.scene);
        box.position.set(x, h / 2, 0);
        const mat = new BABYLON.StandardMaterial('bmat_' + x, this.scene);
        mat.diffuseColor = color;
        box.material = mat;
        this.buildings.push(box);

        const roof = BABYLON.MeshBuilder.CreateBox('roof_' + x, { width: w + 0.4, height: 0.3, depth: d + 0.4 }, this.scene);
        roof.position.set(x, h + 0.15, 0);
        const rmat = new BABYLON.StandardMaterial('rmat_' + x, this.scene);
        rmat.diffuseColor = new BABYLON.Color3(roofR, roofG, roofB);
        roof.material = rmat;
        this.buildings.push(roof);
    },

    _addChimney(x, zOffset) {
        const chimney = BABYLON.MeshBuilder.CreateBox('chimney', { width: 0.5, height: 1, depth: 0.5 }, this.scene);
        chimney.position.set(x, 3.15, zOffset);
        const mat = new BABYLON.StandardMaterial('chimneyMat', this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.2);
        chimney.material = mat;
        this.buildings.push(chimney);
    },

    _addTrees(positions) {
        for (const tx of positions) {
            const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk' + tx, { height: 1.2, diameter: 0.2 }, this.scene);
            trunk.position.set(tx, 0.6, 2.5);
            const tmat = new BABYLON.StandardMaterial('tmat' + tx, this.scene);
            tmat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);
            trunk.material = tmat;
            this.buildings.push(trunk);

            const leaves = BABYLON.MeshBuilder.CreateSphere('leaves' + tx, { diameter: 1.5, segments: 6 }, this.scene);
            leaves.position.set(tx, 1.6, 2.5);
            const lmat = new BABYLON.StandardMaterial('lmat' + tx, this.scene);
            lmat.diffuseColor = new BABYLON.Color3(0.2, 0.5 + Math.random() * 0.2, 0.15);
            leaves.material = lmat;
            this.buildings.push(leaves);
        }
    },

    async loadInitialVehicle() {
        await this.loadVehicle(BUSINESS_DEFS[0].vehicle);
    },

    async loadVehicle(filename) {
        if (this.loadedMeshes[filename]) return;
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '', 'assets/vehicles/', filename, this.scene
            );
            const root = result.meshes[0];
            root.scaling = new BABYLON.Vector3(1.5, 1.5, 1.5);
            root.position.y = 0.3;
            root.setEnabled(false);
            this.loadedMeshes[filename] = root;
        } catch (e) {
            console.warn('Failed to load vehicle:', filename, e);
        }
    },

    showRoute(routeIdx) {
        if (routeIdx === this.activeRouteIdx && this.vehicles.length > 0) {
            // Check vehicle still matches
            const def = BUSINESS_DEFS[routeIdx];
            const biz = game.businesses[def.id];
            if (biz && biz.level > 0) return;
        }
        this.activeRouteIdx = routeIdx;

        for (const v of this.vehicles) {
            if (v.mesh) v.mesh.dispose();
        }
        this.vehicles = [];
        this.createBuildings();

        const def = BUSINESS_DEFS[routeIdx];
        const biz = game.businesses[def.id];
        if (biz && biz.level > 0) {
            this.spawnVehicle(def);
        }
    },

    spawnVehicle(def) {
        const src = this.loadedMeshes[def.vehicle];
        if (!src) {
            this.loadVehicle(def.vehicle).then(() => {
                const loaded = this.loadedMeshes[def.vehicle];
                if (loaded) this._createVehicleInstance(def, loaded);
            });
            return;
        }
        this._createVehicleInstance(def, src);
    },

    _createVehicleInstance(def, srcMesh) {
        const clone = srcMesh.clone(def.id + '_vehicle');
        clone.setEnabled(true);
        clone.position.set(-8, 0.3, 0);
        clone.rotation.y = Math.PI / 2;
        this.vehicles = [{
            mesh: clone, bizId: def.id,
            progress: 0, goingRight: true
        }];
    },

    updateVehicles(dt) {
        for (const v of this.vehicles) {
            const biz = game.businesses[v.bizId];
            if (!biz || biz.level === 0) continue;

            const time = getBizTime(v.bizId);
            const normalizedProgress = (biz.progress || 0) / time;
            const startX = -8, endX = 8;

            if (v.goingRight) {
                v.mesh.position.x = startX + (endX - startX) * normalizedProgress;
            } else {
                v.mesh.position.x = endX - (endX - startX) * normalizedProgress;
            }

            const wasGoingRight = v.goingRight;
            v.goingRight = !biz.returning;
            if (wasGoingRight !== v.goingRight) {
                v.mesh.rotation.y = v.goingRight ? Math.PI / 2 : -Math.PI / 2;
            }
        }
    }
};
