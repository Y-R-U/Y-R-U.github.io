// Main game - Corsair's Fate

import { AssetLoader } from './utils.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { World } from './world.js';
import { EnemySpawner } from './enemies.js';
import { CombatSystem } from './combat.js';
import { TradingSystem } from './trading.js';
import { UpgradeSystem } from './upgrades.js';
import { StorySystem } from './story.js';
import { ParticleSystem } from './particles.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { dist } from './utils.js';

const ASSET_PATH = 'assets/';

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
        this.lastTime = 0;
        this.gameTime = 0;
        this.camX = 200;
        this.camY = 0;

        // Water animation
        this.waterOffset = 0;

        // Port interaction
        this.nearPort = null;
        this.portCooldown = 0;

        // Wake particle timer
        this.wakeTimer = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());

        this._loadAssets().then(() => {
            this.state = 'title';
            this.ui.showTitleScreen(
                () => this._startNewGame(),
                null,
                this.player
            );
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
            ['tile_water', 'tiles/tile_49.png'],
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

        this.state = 'playing';
        this.ui.showHUD();

        // Trigger intro chapter
        this.story.checkTriggers(0);
        if (this.story.isShowingDialogue) {
            this._showCurrentDialogue();
        }
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

    _enterPort(port) {
        if (this.portCooldown > 0) return;
        port.discovered = true;
        this.player.portsVisited.add(port.name);
        this.trading.openPort(port);
        this.state = 'port';
        this.audio.playPortEnter();

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
            }
        );
    }

    _loop(timestamp) {
        const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;
        this.gameTime += dt;

        this._update(dt);
        this._draw();

        requestAnimationFrame((t) => this._loop(t));
    }

    _update(dt) {
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
        this.combat.update(dt, this.player, this.enemySpawner.enemies, this.particles, this.audio);

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

        // Water animation
        this.waterOffset = (this.waterOffset + dt * 20) % 64;

        // Port proximity check
        this.nearPort = this.world.getNearestPort(this.player.x, this.player.y, 100);
        if (this.nearPort && !this.ui.hasPanel && this.portCooldown <= 0) {
            this._enterPort(this.nearPort);
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

        // Update HUD
        this.ui.updateHUD(this.player);
        this.ui.updateMinimap(this.world, this.enemySpawner, this.player);
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

        // Draw world
        this.world.draw(ctx, this.camX, this.camY, vw, vh, this.assets);

        // Draw enemies
        this.enemySpawner.draw(ctx, this.camX, this.camY, vw, vh, this.assets, this.gameTime);

        // Draw player
        if (this.player.alive) {
            this.player.draw(ctx, this.camX, this.camY, vw, vh, this.assets, this.gameTime);
        }

        // Draw projectiles
        this.combat.draw(ctx, this.camX, this.camY, vw, vh, this.assets);

        // Draw particles
        this.particles.draw(ctx, this.camX - vw / 2, this.camY - vh / 2);

        // Draw joystick (screen-space)
        this.input.drawJoystick(ctx);
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
