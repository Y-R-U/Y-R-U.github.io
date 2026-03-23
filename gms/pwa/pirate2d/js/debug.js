// Debug panel - import this file to enable debug buttons
// Activated when player name contains "abdebugt3st"

export class DebugPanel {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.panel = null;
    }

    checkActivation(playerName) {
        if (playerName && playerName.toLowerCase().includes('abdebugt3st')) {
            this.show();
            return true;
        }
        this.hide();
        return false;
    }

    show() {
        if (this.panel) return;
        this.visible = true;

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            position: fixed;
            top: 50%;
            right: max(8px, env(safe-area-inset-right, 0px));
            transform: translateY(-50%);
            z-index: 999;
            display: flex;
            flex-direction: column;
            gap: 4px;
            pointer-events: auto;
        `;

        const buttons = [
            { label: 'GOD', color: '#8b2020', action: () => this._godMode() },
            { label: 'B1', color: '#4a2080', action: () => this._spawnBoss(1) },
            { label: 'B2', color: '#204a80', action: () => this._spawnBoss(2) },
            { label: 'KRK', color: '#206040', action: () => this._spawnBoss(3) },
        ];

        for (const btn of buttons) {
            const el = document.createElement('button');
            el.textContent = btn.label;
            el.style.cssText = `
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 2px solid rgba(255,255,255,0.3);
                background: ${btn.color};
                color: #fff;
                font-size: 10px;
                font-weight: bold;
                font-family: 'Pirata One', Georgia, serif;
                cursor: pointer;
                opacity: 0.7;
                pointer-events: auto;
            `;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.action();
            });
            this.panel.appendChild(el);
        }

        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.panel);
    }

    hide() {
        if (this.panel) {
            if (this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
            this.panel = null;
        }
        this.visible = false;
    }

    _godMode() {
        const player = this.game.player;
        player.hp = 999999;
        player.gold += 999999;
        // Temporarily boost maxHp via base stats
        player.baseStats.maxHp = 999999;
        this.game.ui.showToast('GOD MODE: 999k HP + 999k Gold');
        this.game.ui.updateHUD(player);
    }

    _spawnBoss(runBoss) {
        const player = this.game.player;
        const spawnDist = 300;
        const spawnX = player.x + Math.cos(player.angle) * spawnDist;
        const spawnY = player.y + Math.sin(player.angle) * spawnDist;

        if (runBoss === 3) {
            // Kraken
            this.game.spawnKraken(spawnX, spawnY);
            this.game.ui.showToast('DEBUG: Kraken spawned!');
        } else {
            this.game.spawnRunBoss(runBoss, spawnX, spawnY);
            this.game.ui.showToast(`DEBUG: Boss ${runBoss} spawned!`);
        }
    }
}
