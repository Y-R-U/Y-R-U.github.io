/**
 * Input handler - touch, mouse, keyboard
 *
 * Steering, in order of precedence — whichever the player last used wins:
 *   - touch / mouse: click-and-hold floating joystick, absolute heading
 *   - keyboard: hold Left/Right (or A/D) to rotate, like a classic Asteroids ship
 *
 * Boost: Space, ArrowUp/W, right-click, or the on-screen button. It is a
 * one-shot press, not a hold — the button fires a charged ability now rather
 * than burning mass for as long as you lean on it.
 *
 * Pause: P or Escape.
 *
 * The keyboard integrates a *target* heading rather than driving the snake
 * directly, and that target is clamped to a small window ahead of the snake's
 * real heading. Without the clamp the target races off while you hold the key
 * and the snake keeps curving for a moment after you let go.
 */
class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.active = false;
        this.angle = 0;
        this.boosting = false;      // bots still use this; the player no longer does
        this.boostPressed = false;  // one-shot, cleared by consumeBoostPress()
        this.pausePressed = false;

        // Touch state
        this.touchId = null;

        // Mouse joystick state
        this.mouseDown = false;

        // Unified joystick state (used by both touch and mouse)
        this.joystickPos = null;    // Base position {x, y} where input started
        this.joystickCurrent = null; // Current drag position {x, y}

        // Joystick config
        this.joystickRadius = 50;
        this.joystickDeadzone = 10;

        // Keyboard steering
        this.turnLeft = false;
        this.turnRight = false;
        this.source = 'pointer';    // 'pointer' | 'keys'
        this.keyTurnRate = CONFIG.SNAKE_MAX_TURN_RATE * 1.2;  // rad/sec
        this.keyLeadClamp = 0.35;   // rad the target may run ahead of the snake

        this._bindEvents();
    }

    _bindEvents() {
        // Touch events on canvas
        this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', e => this._onTouchEnd(e), { passive: false });

        // Mouse events - bind to window so we catch moves/releases outside the canvas
        window.addEventListener('mousedown', e => this._onMouseDown(e));
        window.addEventListener('mousemove', e => this._onMouseMove(e));
        window.addEventListener('mouseup', e => this._onMouseUp(e));

        // Keyboard events
        window.addEventListener('keydown', e => this._onKeyDown(e));
        window.addEventListener('keyup', e => this._onKeyUp(e));
        // Losing focus with a key held would otherwise leave the snake spinning.
        window.addEventListener('blur', () => {
            this.turnLeft = this.turnRight = false;
            this.boosting = false;
        });

        // Prevent context menu during gameplay (so right-click boost works)
        window.addEventListener('contextmenu', e => {
            const gameScreen = document.getElementById('game-screen');
            if (gameScreen && gameScreen.classList.contains('active')) {
                e.preventDefault();
            }
        });
    }

    _inGame() {
        const gameScreen = document.getElementById('game-screen');
        return !!(gameScreen && gameScreen.classList.contains('active'));
    }

    // ======================== TOUCH ========================

    _onTouchStart(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (this.touchId === null) {
                this.touchId = touch.identifier;
                const x = touch.clientX;
                const y = touch.clientY;
                this.joystickPos = { x, y };
                this.joystickCurrent = { x, y };
                this.active = true;
                this.source = 'pointer';
            }
        }
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.touchId) {
                this.joystickCurrent = {
                    x: touch.clientX,
                    y: touch.clientY
                };
            }
        }
    }

    _onTouchEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.touchId) {
                this.touchId = null;
                this.joystickPos = null;
                this.joystickCurrent = null;
                this.active = false;
            }
        }
    }

    // ======================== MOUSE ========================

    _onMouseDown(e) {
        // Only handle during gameplay (game-screen is active)
        if (!this._inGame()) return;

        if (e.button === 0) {
            // Left click: create joystick at click position
            this.mouseDown = true;
            this.joystickPos = { x: e.clientX, y: e.clientY };
            this.joystickCurrent = { x: e.clientX, y: e.clientY };
            this.active = true;
            this.source = 'pointer';
            e.preventDefault();
        } else if (e.button === 2) {
            this.boostPressed = true;
            e.preventDefault();
        }
    }

    _onMouseMove(e) {
        if (this.mouseDown) {
            this.joystickCurrent = {
                x: e.clientX,
                y: e.clientY
            };
        }
    }

    _onMouseUp(e) {
        if (e.button === 0 && this.mouseDown) {
            this.mouseDown = false;
            // Only clear joystick if no touch is active
            if (this.touchId === null) {
                this.joystickPos = null;
                this.joystickCurrent = null;
                this.active = false;
            }
        }
    }

    // ======================== KEYBOARD ========================

    _onKeyDown(e) {
        if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) return;
        switch (e.code) {
            case 'Space':
            case 'ArrowUp':
            case 'KeyW':
                this.boostPressed = true;
                if (this._inGame()) e.preventDefault();
                break;
            case 'KeyP':
            case 'Escape':
                this.pausePressed = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.turnLeft = true;
                this.source = 'keys';
                if (this._inGame()) e.preventDefault();
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.turnRight = true;
                this.source = 'keys';
                if (this._inGame()) e.preventDefault();
                break;
        }
    }

    _onKeyUp(e) {
        switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':
                this.turnLeft = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.turnRight = false;
                break;
        }
    }

    // ======================== PUBLIC API ========================

    /**
     * Advance the steering target and return it.
     * @param {number} dt        frame time in ms
     * @param {number} snakeAngle the player snake's actual heading, for clamping
     */
    update(dt, snakeAngle) {
        // A live joystick always wins — picking up the mouse mid-game should just work.
        if (this.joystickCurrent && this.joystickPos) {
            const dx = this.joystickCurrent.x - this.joystickPos.x;
            const dy = this.joystickCurrent.y - this.joystickPos.y;
            if (dx * dx + dy * dy > this.joystickDeadzone * this.joystickDeadzone) {
                this.angle = Math.atan2(dy, dx);
                this.source = 'pointer';
                return this.angle;
            }
        }

        const dir = (this.turnRight ? 1 : 0) - (this.turnLeft ? 1 : 0);
        if (dir !== 0) {
            this.source = 'keys';
            this.angle += dir * this.keyTurnRate * (dt / 1000);
        }

        if (this.source === 'keys' && typeof snakeAngle === 'number') {
            // Keep the target within a short lead of where the snake actually
            // points, so releasing the key stops the turn immediately.
            const lead = Utils.angleDiff(snakeAngle, this.angle);
            if (Math.abs(lead) > this.keyLeadClamp) {
                this.angle = snakeAngle + Math.sign(lead) * this.keyLeadClamp;
            }
        }
        return this.angle;
    }

    /** Last computed steering target. */
    getAngle() {
        return this.angle;
    }

    /** True once per press, so a held key can't fire the ability repeatedly. */
    consumeBoostPress() {
        const v = this.boostPressed;
        this.boostPressed = false;
        return v;
    }

    consumePausePress() {
        const v = this.pausePressed;
        this.pausePressed = false;
        return v;
    }

    /** Seed the steering target, so a new run does not inherit the last one. */
    reset(angle) {
        this.angle = angle || 0;
        this.turnLeft = this.turnRight = false;
        this.boosting = false;
        this.boostPressed = false;
        this.pausePressed = false;
        this.mouseDown = false;
        this.touchId = null;
        this.joystickPos = null;
        this.joystickCurrent = null;
        this.active = false;
        this.source = 'pointer';
    }

    /** Get joystick visual data for rendering */
    getJoystickData() {
        if (!this.joystickPos || !this.joystickCurrent) return null;
        const dx = this.joystickCurrent.x - this.joystickPos.x;
        const dy = this.joystickCurrent.y - this.joystickPos.y;
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), this.joystickRadius);
        const angle = Math.atan2(dy, dx);
        return {
            baseX: this.joystickPos.x,
            baseY: this.joystickPos.y,
            stickX: this.joystickPos.x + Math.cos(angle) * dist,
            stickY: this.joystickPos.y + Math.sin(angle) * dist,
            radius: this.joystickRadius
        };
    }

    /** Clean up event listeners */
    destroy() {
        // Events are on canvas/window, will be GC'd with canvas
    }
}
