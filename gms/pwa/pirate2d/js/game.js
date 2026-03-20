// Main game - Corsair's Fate

import { AssetLoader } from './utils.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { World } from './world.js';
import { EnemySpawner, Enemy } from './enemies.js';
import { CombatSystem } from './combat.js';
import { TradingSystem } from './trading.js';
import { UpgradeSystem } from './upgrades.js';
import { StorySystem } from './story.js';
import { ParticleSystem } from './particles.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
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
        this.enemySpawner = new EnemySpawner();

        this.player = new Player(200, 0);
        this.world = new World();
        this.ui = new UIManager(this);

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

        this._resize();
        window.addEventListener('resize', () => this._resize());

        this._loadAssets().then(() => {
            this.state = 'title';
            this.ui.showTitleScreen(
                () => this._startNewGame(),
                null,
                this.player
            );
            // Fade out loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.classList.add('fade-out');
                setTimeout(() => loadingScreen.remove(), 600);
            }
            this._loop(0);
        });
    }

    async _loadAssets() {
        const loads = [];

        // Ship sprites - use the Kenney pirate pack ships
        const shipFiles = [
            ['player_ship', 'ships/ship (1).png'],
            ['enemy_ship_1', 'ships/ship (3).png'],
            ['enemy_ship_2', 'ships/ship (5).png'],
            ['enemy_ship_3', 'ships/ship (7).png'],
            ['enemy_ship_4', 'ships/ship (9).png'],
            ['enemy_ship_5', 'ships/ship (11).png'],
            ['enemy_ship_6', 'ships/ship (13).png'],
        ];

        // Tile sprites
        const tileFiles = [
            ['tile_beach', 'tiles/tile_42.png'],
            ['tile_land', 'tiles/tile_01.png'],
        ];

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
        this.viewW = window.innerWidth;
        this.viewH = window.innerHeight;
    }

    _startNewGame() {
        this.audio.init();
        this.audio.resume();
        this.audio.stopMusic();
        if (this.audio.musicTracks.length > 0 && this.audio.musicEnabled) {
            this.audio.playRandomMusic();
        }

        this.player.reset();
        this.world = new World();
        this.enemySpawner.clear();
        this.combat.clear();
        this.particles.clear();
        this.story.reset();

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

        this.portCooldown = 0;
        this.saveTimer = 0;
        this.state = 'playing';
        this.ui.showHUD();
    }

    _showCurrentDialogue() {
        const line = this.story.getCurrentLine();
        if (!line) return;

        this.state = 'dialogue';
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
            }
        );
    }

    _handleDeath() {
        this.state = 'dead';
        this.audio.playDeath();
        const stats = this.player.onDeath();
        setTimeout(() => {
            this.ui.showDeathScreen(stats, () => {
                // Reload player persistent data
                this.player = new Player(200, 0);
                this.state = 'title';
                this.ui.showTitleScreen(
                    () => this._startNewGame(),
                    null,
                    this.player
                );
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
        this.ui.updateMinimap(this.world, this.enemySpawner, this.player);

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
                story: this.story.serialize()
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

            // Restore player state
            this.player.deserializeState(data.player);

            // Restore enemies
            this.enemySpawner.clear();
            if (data.enemies) {
                for (const eData of data.enemies) {
                    const enemy = Enemy.deserialize(eData);
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
        const vw = this.viewW;
        const vh = this.viewH;

        // Clear
        ctx.fillStyle = '#0d2137';
        ctx.fillRect(0, 0, vw, vh);

        if (this.state === 'loading') {
            this._drawLoading(ctx, vw, vh);
            return;
        }

        if (this.state === 'title' || this.state === 'dead') return;

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

        // Draw player
        if (this.player.alive) {
            this.player.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets, this.gameTime);
        }

        // Draw projectiles
        this.combat.draw(ctx, drawCamX, drawCamY, vw, vh, this.assets);

        // Draw particles
        this.particles.draw(ctx, drawCamX - vw / 2, drawCamY - vh / 2);

        // Draw joystick (screen-space)
        this.input.drawJoystick(ctx);
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
