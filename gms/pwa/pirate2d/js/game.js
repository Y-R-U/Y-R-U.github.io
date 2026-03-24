// Main game - Corsair's Fate

import { AssetLoader } from './utils.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { World } from './world.js';
import { EnemySpawner, Enemy, ENEMY_TYPES, BOSS_TYPE_LIEUTENANT, BOSS_TYPE_BLACKTIDE, BOSS_TYPE_ESCORT } from './enemies.js';
import { CombatSystem } from './combat.js';
import { TradingSystem } from './trading.js';
import { UpgradeSystem } from './upgrades.js';
import { StorySystem, RUN_NAMES } from './story.js';
import { ParticleSystem } from './particles.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { Kraken } from './kraken.js';
import { DebugPanel } from './debug.js';
import { dist } from './utils.js';

const ASSET_PATH = 'assets/';
const SAVE_INTERVAL = 5; // seconds between auto-saves

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Systems
        this.assets = new AssetLoader(ASSET_PATH);
        this.input = new InputManager(this.canvas);
        this.audio = new AudioManager();
        this.particles = new ParticleSystem();
        this.combat = new CombatSystem();
        this.trading = new TradingSystem();
        this.upgradeSystem = new UpgradeSystem();
        this.story = new StorySystem();
        this.debug = new DebugPanel(this);

        this.player = new Player(200, 0);
        this.world = new World();
        this.enemySpawner = new EnemySpawner(this.world);
        this.ui = new UIManager(this);
        this.kraken = null;

        this.state = 'loading'; // loading, title, playing, paused, dead, dialogue, port
        this.lastTime = -1; // -1 signals first frame
        this.gameTime = 0;
        this.camX = 200;
        this.camY = 0;

        // Port interaction
        this.nearPort = null;
        this.portCooldown = 0;

        // Wake particle timer
        this.wakeTimer = 0;

        // Screen shake
        this.shakeIntensity = 0;
        this.shakeDecay = 5;

        // Auto-save timer
        this.saveTimer = 0;

        // Zoom levels: 1.0 = default (close), 0.75 = medium, 0.5 = far
        this.zoomLevels = [1.0, 0.75, 0.5];
        this.zoomIndex = 0;
        this.zoomScale = 1.0;
        this.pinchZoomEnabled = true;
        this._loadZoomSettings();
        this._setupPinchZoom();

        this._resize();
        window.addEventListener('resize', () => this._resize());

        this._loadAssets().then(() => {
            this.state = 'title';
            // Show name input if player hasn't set a name yet
            if (!this.player.playerName) {
                this.ui.showNameInput((prefix, name) => {
                    this.player.setName(prefix, name);
                    this.debug.checkActivation(name);
                    this._showTitleScreen();
                });
            } else {
                this.debug.checkActivation(this.player.playerName);
                this._showTitleScreen();
            }
            // Fade out loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.classList.add('fade-out');
                setTimeout(() => loadingScreen.remove(), 600);
            }
            this._loop(0);
        });
    }

    _showTitleScreen() {
        this.ui.showTitleScreen(
            (runNumber) => this._startNewGame(runNumber),
            null,
            this.player
        );
    }

    async _loadAssets() {
        const loads = [];

        // Ship sprites - use the Kenney pirate pack ships
        const shipFiles = [
            // Player ship (white): undamaged, dmg1, dmg2
            ['player_ship', 'ships/ship (1).png'],
            ['player_ship_dmg', 'ships/ship (7).png'],
            ['player_ship_heavy_dmg', 'ships/ship (13).png'],
            // Enemy ships: undamaged, dmg1, dmg2 (grid: 6 colors x 3 rows)
            // Sloop (red sail)
            ['enemy_ship_1', 'ships/ship (3).png'],
            ['damaged_ship_1', 'ships/ship (9).png'],
            ['heavy_dmg_ship_1', 'ships/ship (15).png'],
            // Brigantine (blue sail)
            ['enemy_ship_2', 'ships/ship (5).png'],
            ['damaged_ship_2', 'ships/ship (11).png'],
            ['heavy_dmg_ship_2', 'ships/ship (17).png'],
            // Galleon (green sail)
            ['enemy_ship_3', 'ships/ship (4).png'],
            ['damaged_ship_3', 'ships/ship (10).png'],
            ['heavy_dmg_ship_3', 'ships/ship (16).png'],
            // Man-o-War (yellow sail)
            ['enemy_ship_4', 'ships/ship (6).png'],
            ['damaged_ship_4', 'ships/ship (12).png'],
            ['heavy_dmg_ship_4', 'ships/ship (18).png'],
            // Ghost Ship (black sail)
            ['enemy_ship_5', 'ships/ship (2).png'],
            ['damaged_ship_5', 'ships/ship (8).png'],
            ['heavy_dmg_ship_5', 'ships/ship (14).png'],
            // Kraken (procedural, no sprite needed)
            ['enemy_ship_6', 'ships/ship (13).png'],
            // Boss ships (dark row 4): standard=24, dmg1=20, dmg2=19
            ['boss_ship_std', 'ships/ship (24).png'],
            ['boss_ship_dmg', 'ships/ship (20).png'],
            ['boss_ship_heavy', 'ships/ship (19).png'],
            // Additional dark boss variants
            ['boss_ship_alt1', 'ships/ship (22).png'],
            ['boss_ship_alt2', 'ships/ship (21).png'],
        ];

        // Tile sprites (lazy-loaded by world.js tile cache)
        const tileFiles = [];

        // Effect sprites
        const effectFiles = [
            ['explosion1', 'effects/explosion1.png'],
            ['explosion2', 'effects/explosion2.png'],
            ['explosion3', 'effects/explosion3.png'],
            ['fire1', 'effects/fire1.png'],
        ];

        // Ship parts
        const partFiles = [
            ['cannonBall', 'parts/cannonBall.png'],
            ['cannon', 'parts/cannon.png'],
        ];

        for (const [key, path] of [...shipFiles, ...tileFiles, ...effectFiles, ...partFiles]) {
            loads.push(this.assets.loadImage(key, path));
        }

        await Promise.all(loads);

        // Discover music
        await this.audio.discoverMusic(ASSET_PATH + 'music/');
        this.audio.restoreUnlockedCreepy();

        // Pre-load first music track so it's ready to play immediately
        if (this.audio.musicTracks.length > 0) {
            try {
                const firstTrack = this.audio.musicTracks[0];
                const resp = await fetch(firstTrack);
                const buf = await resp.arrayBuffer();
                this.audio._preloadedBuffer = { url: firstTrack, buffer: buf };
            } catch(e) {}
        }
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.viewW = window.innerWidth / this.zoomScale;
        this.viewH = window.innerHeight / this.zoomScale;
    }

    _loadZoomSettings() {
        try {
            const saved = localStorage.getItem('pirate2d_zoom');
            if (saved) {
                const data = JSON.parse(saved);
                this.zoomIndex = data.zoomIndex || 0;
                this.zoomScale = this.zoomLevels[this.zoomIndex] || 1.0;
                this.pinchZoomEnabled = data.pinchZoomEnabled !== false;
            }
        } catch(e) {}
    }

    _saveZoomSettings() {
        try {
            localStorage.setItem('pirate2d_zoom', JSON.stringify({
                zoomIndex: this.zoomIndex,
                pinchZoomEnabled: this.pinchZoomEnabled
            }));
        } catch(e) {}
    }

    setZoomLevel(index) {
        this.zoomIndex = Math.max(0, Math.min(this.zoomLevels.length - 1, index));
        this.zoomScale = this.zoomLevels[this.zoomIndex];
        this._resize();
        this._saveZoomSettings();
    }

    _setupPinchZoom() {
        let lastPinchDist = 0;
        let pinching = false;

        this.canvas.addEventListener('touchstart', (e) => {
            if (!this.pinchZoomEnabled) return;
            if (e.touches.length === 2) {
                pinching = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.pinchZoomEnabled || !pinching || e.touches.length !== 2) return;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDist = Math.sqrt(dx * dx + dy * dy);
            const delta = currentDist - lastPinchDist;

            if (Math.abs(delta) > 50) {
                if (delta > 0 && this.zoomIndex > 0) {
                    // Pinch out = zoom in (closer)
                    this.setZoomLevel(this.zoomIndex - 1);
                    this.ui.showToast(`Zoom: ${Math.round(this.zoomScale * 100)}%`);
                } else if (delta < 0 && this.zoomIndex < this.zoomLevels.length - 1) {
                    // Pinch in = zoom out (farther)
                    this.setZoomLevel(this.zoomIndex + 1);
                    this.ui.showToast(`Zoom: ${Math.round(this.zoomScale * 100)}%`);
                }
                lastPinchDist = currentDist;
            }
        }, { passive: true });

        this.canvas.addEventListener('touchend', () => {
            pinching = false;
        }, { passive: true });
    }

    _startNewGame(runNumber) {
        this.audio.init();
        this.audio.resume();
        this.audio.stopMusic();
        if (this.audio.musicTracks.length > 0 && this.audio.musicEnabled) {
            this.audio.playRandomMusic();
        }

        this.player.reset();
        this.world = new World();
        this.enemySpawner.world = this.world;
        this.enemySpawner.clear();
        this.combat.clear();
        this.particles.clear();
        this.story.reset();
        this.kraken = null;

        // Set run and scaling
        const run = runNumber || this.player.currentRun || 1;
        this.story.setRun(run);
        this.enemySpawner.runScaling = 1 + (run - 1) * 0.3;

        // Story completion callback
        this.story.onDialogueComplete = (chapter) => this._onChapterComplete(chapter);

        this.camX = this.player.x;
        this.camY = this.player.y;
        this.portCooldown = 0;
        this.saveTimer = 0;

        this.state = 'playing';
        this.ui.showHUD();

        // Trigger intro chapter
        this.story.checkTriggers(0);
        if (this.story.isShowingDialogue) {
            this._showCurrentDialogue();
        }
    }

    // Continue from saved game state
    _continueGame() {
        this.audio.init();
        this.audio.resume();
        this.audio.stopMusic();
        if (this.audio.musicTracks.length > 0 && this.audio.musicEnabled) {
            this.audio.playRandomMusic();
        }

        const loaded = this._loadGameState();
        if (!loaded) {
            // Fallback to new game if load fails
            this._startNewGame();
            return;
        }

        // Wire up story callback
        this.story.onDialogueComplete = (chapter) => this._onChapterComplete(chapter);

        this.portCooldown = 0;
        this.saveTimer = 0;
        this.state = 'playing';
        this.ui.showHUD();

        // Show finish run button if boss was already defeated
        if (this.player.bossDefeated) {
            this.ui.showFinishRunButton(() => this._finishRun());
        }
    }

    _onChapterComplete(chapter) {
        if (!chapter) return;

        // Spawn boss if chapter triggers it
        if (chapter.spawnBoss) {
            const spawnDist = 500;
            const spawnX = this.player.x + Math.cos(this.player.angle) * spawnDist;
            const spawnY = this.player.y + Math.sin(this.player.angle) * spawnDist;

            if (chapter.spawnBoss === 3) {
                this.spawnKraken(spawnX, spawnY);
            } else {
                this.spawnRunBoss(chapter.spawnBoss, spawnX, spawnY);
            }
        }

        // Unlock creepy music track
        if (chapter.unlockCreepy) {
            this.audio.unlockCreepyTrack(chapter.unlockCreepy);
        }
    }

    spawnRunBoss(bossNumber, x, y) {
        const run = this.story.currentRun || 1;
        const level = Math.max(1, Math.round(3 * (1 + (run - 1) * 0.3)));

        if (bossNumber === 1) {
            // Lieutenant - single boss
            const boss = new Enemy(ENEMY_TYPES[BOSS_TYPE_LIEUTENANT], x, y, level);
            boss._world = this.world;
            this.enemySpawner.enemies.push(boss);
        } else if (bossNumber === 2) {
            // Captain Blacktide with 3 escorts
            const boss = new Enemy(ENEMY_TYPES[BOSS_TYPE_BLACKTIDE], x, y, level);
            boss._world = this.world;
            this.enemySpawner.enemies.push(boss);

            for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 / 3) * i;
                const ex = x + Math.cos(angle) * 150;
                const ey = y + Math.sin(angle) * 150;
                const escort = new Enemy(ENEMY_TYPES[BOSS_TYPE_ESCORT], ex, ey, Math.max(1, level - 1));
                escort._world = this.world;
                this.enemySpawner.enemies.push(escort);
            }
        }
    }

    spawnKraken(x, y) {
        const run = this.story.currentRun || 3;
        const level = Math.max(1, Math.round(3 * (1 + (run - 1) * 0.3)));
        this.kraken = new Kraken(x, y, level);
    }

    onRunBossDefeated(boss) {
        this.player.onBossDefeated();
        this.audio.playVictoryFanfare();

        const runName = RUN_NAMES[(this.story.currentRun || 1) - 1] || 'Unknown';
        this.ui.showBossVictory(runName, boss.isKraken ? 'THE KRAKEN' : boss.type ? boss.type.name : 'Boss');

        // Show finish run button
        setTimeout(() => {
            this.ui.showFinishRunButton(() => this._finishRun());
        }, 3000);
    }

    _finishRun() {
        this.player.finishRun();
        this.ui.hideFinishRunButton();
        try { localStorage.removeItem('pirate2d_state'); } catch(e) {}
        // Return to title
        this.player = new Player(200, 0);
        this.kraken = null;
        this.state = 'title';
        if (!this.player.playerName) {
            this.ui.showNameInput((prefix, name) => {
                this.player.setName(prefix, name);
                this.debug.checkActivation(name);
                this._showTitleScreen();
            });
        } else {
            this.debug.checkActivation(this.player.playerName);
            this._showTitleScreen();
        }
    }

    _showCurrentDialogue() {
        const line = this.story.getCurrentLine();
        if (!line) return;

        this.state = 'dialogue';

        // Boss chapters get longer display time with screen shake
        const chapter = this.story.currentDialogue;
        const isBossChapter = chapter && chapter.spawnBoss;
        const minDisplayTime = isBossChapter ? 3000 : 0;

        if (isBossChapter) {
            this.addShake(4);
        }

        this.ui.showDialogue(
            line.speaker,
            line.text,
            this.story.dialogueIndex === 0 ? this.story.getChapterTitle() : null,
            () => {
                this.story.advance();
                if (this.story.isShowingDialogue) {
                    this._showCurrentDialogue();
                } else {
                    this.ui.closePanel();
                    this.state = 'playing';
                }
            },
            minDisplayTime
        );
    }

    _handleDeath() {
        this.state = 'dead';
        this.audio.playDeath();
        this.kraken = null;
        const stats = this.player.onDeath();
        setTimeout(() => {
            this.ui.hideFinishRunButton();
            this.ui.showDeathScreen(stats, () => {
                // Reload player persistent data
                this.player = new Player(200, 0);
                this.state = 'title';
                if (!this.player.playerName) {
                    this.ui.showNameInput((prefix, name) => {
                        this.player.setName(prefix, name);
                        this.debug.checkActivation(name);
                        this._showTitleScreen();
                    });
                } else {
                    this.debug.checkActivation(this.player.playerName);
                    this._showTitleScreen();
                }
            });
        }, 800);
    }

    _enterPort(port, fromSubmenu) {
        if (!fromSubmenu && this.portCooldown > 0) return;
        this.ui.closeDockPrompt();
        port.discovered = true;
        this.player.portsVisited.add(port.name);
        this.trading.openPort(port);
        this.state = 'port';
        if (!fromSubmenu) this.audio.playPortEnter();

        this.ui.showPortPrompt(
            port,
            () => {
                this.ui.showTradePanel(port, this.player, this.trading, this.audio);
            },
            () => {
                this.ui.showUpgradePanel(this.player, this.upgradeSystem, this.audio);
            },
            () => {
                this.ui.closePanel();
                this.trading.closePort();
                this.state = 'playing';
                this.portCooldown = 2; // Prevent instant re-entry
                this._saveGameState(); // Save on leaving port
            }
        );
    }

    _getEnemyImports() {
        return { Enemy, ENEMY_TYPES };
    }

    addShake(intensity) {
        this.shakeIntensity = Math.min(15, this.shakeIntensity + intensity);
    }

    _loop(timestamp) {
        // Skip first frame to avoid huge dt
        if (this.lastTime < 0) {
            this.lastTime = timestamp;
            requestAnimationFrame((t) => this._loop(t));
            return;
        }
        const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;
        this.gameTime += dt;

        this._update(dt);
        this._draw();

        requestAnimationFrame((t) => this._loop(t));
    }

    pause() {
        if (this.state !== 'paused' && this.state !== 'loading' && this.state !== 'title' && this.state !== 'dead') {
            this._stateBeforePause = this.state;
            this._dialogueBeforePause = null;
            // If we're in dialogue, save dialogue state so we can re-show it
            if (this.state === 'dialogue' && this.story.isShowingDialogue) {
                this._dialogueBeforePause = {
                    line: this.story.getCurrentLine(),
                    chapterTitle: this.story.dialogueIndex === 0 ? this.story.getChapterTitle() : null
                };
            }
            this.state = 'paused';
        }
    }

    resume() {
        if (this.state === 'paused') {
            const prevState = this._stateBeforePause || 'playing';
            this.state = prevState;
            // Re-show dialogue if we were in dialogue state
            if (prevState === 'dialogue' && this._dialogueBeforePause) {
                this._showCurrentDialogue();
            }
            // Re-show port prompt if we were in port state
            if (prevState === 'port') {
                const port = this.trading.currentPort;
                if (port) this._enterPort(port, true);
            }
            this._dialogueBeforePause = null;
        }
    }

    _update(dt) {
        // Always update HUD when in game (so trades/upgrades show immediately)
        if (this.state === 'playing' || this.state === 'port' || this.state === 'dialogue') {
            this.ui.updateHUD(this.player);
        }

        if (this.state !== 'playing') return;

        this.input.update();

        // Port cooldown
        if (this.portCooldown > 0) this.portCooldown -= dt;

        // Player update
        this.player.update(dt, this.input, this.world);

        // Camera follow
        const camLerp = 1 - Math.pow(0.001, dt);
        this.camX += (this.player.x - this.camX) * camLerp;
        this.camY += (this.player.y - this.camY) * camLerp;

        // World chunk loading
        this.world.ensureChunksAround(this.camX, this.camY, this.viewW, this.viewH);

        // Enemies
        this.enemySpawner.update(dt, this.player.x, this.player.y);
        for (const enemy of this.enemySpawner.enemies) {
            if (enemy.alive) {
                enemy.update(dt, this.player.x, this.player.y);
            }
        }

        // Kraken update
        if (this.kraken && this.kraken.alive) {
            this.kraken.update(dt, this.player.x, this.player.y);
        } else if (this.kraken && !this.kraken.alive) {
            this.kraken = null;
        }

        // Combat
        this.combat.update(dt, this.player, this.enemySpawner.enemies, this.particles, this.audio, this);

        // Screen shake decay
        if (this.shakeIntensity > 0) {
            this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
        }

        // Particles
        this.particles.update(dt);

        // Wake effect
        if (this.input.moving) {
            this.wakeTimer -= dt;
            if (this.wakeTimer <= 0) {
                this.particles.addWake(this.player.x, this.player.y, this.player.angle);
                this.wakeTimer = 0.08;
            }
        }

        // HP regen near home (within safe zone)
        if (this.player.distFromHome < 400) {
            this.player.heal(5 * dt); // 5 HP/sec in safe zone
        }

        // Port proximity check - show dock prompt, don't auto-enter
        const prevPort = this.nearPort;
        this.nearPort = this.world.getNearestPort(this.player.x, this.player.y, 120);
        if (this.nearPort && !this.ui.hasPanel && this.portCooldown <= 0) {
            if (prevPort !== this.nearPort) {
                this.ui.showDockPrompt(this.nearPort, () => this._enterPort(this.nearPort));
            }
        } else if (!this.nearPort && prevPort && this.ui._dockPrompt) {
            this.ui.closeDockPrompt();
        }

        // Discover ports
        for (const port of this.world.ports) {
            if (!port.discovered && dist(this.player.x, this.player.y, port.x, port.y) < 300) {
                port.discovered = true;
                this.ui.showToast(`Discovered: ${port.name}`);
            }
        }

        // Story triggers
        if (this.story.checkTriggers(this.player.distFromHome)) {
            this._showCurrentDialogue();
        }

        // Death check
        if (!this.player.alive) {
            this._handleDeath();
        }

        // Minimap
        this.ui.updateMinimap(this.world, this.enemySpawner, this.player, this.kraken);

        // Auto-save
        this.saveTimer += dt;
        if (this.saveTimer >= SAVE_INTERVAL) {
            this.saveTimer = 0;
            this._saveGameState();
        }
    }

    // Save full game state to localStorage
    _saveGameState() {
        if (this.state !== 'playing' && this.state !== 'port') return;
        try {
            const state = {
                player: this.player.serializeState(),
                world: this.world.serializeState(),
                enemies: this.enemySpawner.enemies.filter(e => e.alive).map(e => e.serialize()),
                projectiles: this.combat.projectiles.map(p => ({
                    x: p.x, y: p.y, vx: p.vx, vy: p.vy,
                    damage: p.damage, life: p.life,
                    isPlayer: p.isPlayer, size: p.size
                })),
                gameTime: this.gameTime,
                camX: this.camX,
                camY: this.camY,
                story: this.story.serialize(),
                kraken: this.kraken ? this.kraken.serialize() : null
            };
            localStorage.setItem('pirate2d_state', JSON.stringify(state));
        } catch(e) {}
    }

    // Load game state from localStorage
    _loadGameState() {
        try {
            const raw = localStorage.getItem('pirate2d_state');
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !data.player || !data.world) return false;

            // Restore world (with saved seed, ports, islands)
            this.world = new World(data.world);
            this.enemySpawner.world = this.world;

            // Restore player state
            this.player.deserializeState(data.player);

            // Restore enemies
            this.enemySpawner.clear();
            if (data.enemies) {
                for (const eData of data.enemies) {
                    const enemy = Enemy.deserialize(eData);
                    enemy._world = this.world;
                    this.enemySpawner.enemies.push(enemy);
                }
            }

            // Restore projectiles
            this.combat.clear();
            if (data.projectiles) {
                this.combat.projectiles = data.projectiles;
            }

            // Restore game time and camera
            this.gameTime = data.gameTime || 0;
            this.camX = data.camX || this.player.x;
            this.camY = data.camY || this.player.y;

            // Restore story
            if (data.story) {
                this.story.deserialize(data.story);
            }

            // Restore Kraken
            if (data.kraken) {
                this.kraken = Kraken.deserialize(data.kraken);
            } else {
                this.kraken = null;
            }

            // Restore run scaling
            const run = this.story.currentRun || 1;
            this.enemySpawner.runScaling = 1 + (run - 1) * 0.3;

            // Ensure chunks are loaded around player position
            this.world.ensureChunksAround(this.camX, this.camY, this.viewW, this.viewH);

            this.particles.clear();
            return true;
        } catch(e) {
            return false;
        }
    }

    _draw() {
        const ctx = this.ctx;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const vw = this.viewW;
        const vh = this.viewH;

        // Clear at screen resolution
        ctx.fillStyle = '#0d2137';
        ctx.fillRect(0, 0, screenW, screenH);

        if (this.state === 'loading') {
            this._drawLoading(ctx, screenW, screenH);
            return;
        }

        if (this.state === 'title' || this.state === 'dead') return;

        // Apply zoom
        ctx.save();
        ctx.scale(this.zoomScale, this.zoomScale);

        // Apply screen shake offset
        let shakeDx = 0, shakeDy = 0;
        if (this.shakeIntensity > 0.1) {
            shakeDx = (Math.random() - 0.5) * this.shakeIntensity * 2;
            shakeDy = (Math.random() - 0.5) * this.shakeIntensity * 2;
        }
        const drawCamX = this.camX + shakeDx;
        const drawCamY = this.camY + shakeDy;

        // Draw world
        this.world.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets);

        // Draw safe zone indicator near home
        this._drawSafeZone(ctx, drawCamX, drawCamY, vw, vh);

        // Draw enemies
        this.enemySpawner.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets, this.gameTime);

        // Draw Kraken
        if (this.kraken && this.kraken.alive) {
            this.kraken.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets, this.gameTime);
        }

        // Draw player
        if (this.player.alive) {
            this.player.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets, this.gameTime);
        }

        // Draw projectiles
        this.combat.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets);

        // Draw particles
        this.particles.draw(ctx, drawCamX - vw / 2, drawCamY - vh / 2);

        ctx.restore();

        // Draw low health glow (screen-space, no zoom)
        this._drawLowHealthGlow(ctx, screenW, screenH);

        // Draw joystick (screen-space, no zoom)
        this.input.drawJoystick(ctx);
    }

    _drawLowHealthGlow(ctx, screenW, screenH) {
        if (!this.player.alive) return;
        const ratio = this.player.hpRatio;
        if (ratio >= 0.25) return;

        // Intensity increases as HP drops: 0 at 25%, max at ~5%
        const intensity = 1 - (ratio / 0.25);
        const pulse = 0.5 + 0.5 * Math.sin(this.gameTime * 4);
        const baseAlpha = intensity * 0.6 * (0.5 + 0.5 * pulse);

        ctx.save();
        // Strong vignette effect - red glow from edges
        const cx = screenW / 2;
        const cy = screenH / 2;
        const r = Math.max(screenW, screenH) * 0.65;
        const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
        grad.addColorStop(0, 'rgba(200, 0, 0, 0)');
        grad.addColorStop(0.6, `rgba(180, 0, 0, ${baseAlpha * 0.3})`);
        grad.addColorStop(1, `rgba(200, 0, 0, ${baseAlpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, screenW, screenH);

        // Additional heartbeat pulse overlay at very low HP (<15%)
        if (ratio < 0.15) {
            const heartbeat = Math.pow(Math.sin(this.gameTime * 5), 2);
            ctx.globalAlpha = heartbeat * intensity * 0.15;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, screenW, screenH);
        }

        ctx.restore();
    }

    _drawSafeZone(ctx, camX, camY, vw, vh) {
        // Draw a subtle circle around the home area (400px radius safe zone)
        const sx = 200 - camX + vw / 2;
        const sy = 200 - camY + vh / 2;
        const radius = 400;

        // Only draw if on screen
        if (sx + radius < 0 || sx - radius > vw || sy + radius < 0 || sy - radius > vh) return;

        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = '#44cc44';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 12]);
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.03;
        ctx.fillStyle = '#44cc44';
        ctx.fill();
        ctx.restore();
    }

    _drawLoading(ctx, vw, vh) {
        ctx.fillStyle = '#0d2137';
        ctx.fillRect(0, 0, vw, vh);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', vw / 2, vh / 2 - 20);

        // Progress bar
        const barW = 200;
        const barH = 10;
        const bx = vw / 2 - barW / 2;
        const by = vh / 2 + 10;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(bx, by, barW * this.assets.progress(), barH);
    }
}
