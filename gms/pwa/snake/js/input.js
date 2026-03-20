/**
 * Input handler - touch, mouse, keyboard
 * Both mobile touch and desktop mouse use a click-and-hold joystick.
 * Boost: right-click, Space, or ArrowUp on desktop; dedicated boost button on mobile.
 */
class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.active = false;
        this.angle = 0;
        this.boosting = false;

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

        // Prevent context menu during gameplay (so right-click boost works)
        window.addEventListener('contextmenu', e => {
            const gameScreen = document.getElementById('game-screen');
            if (gameScreen && gameScreen.classList.contains('active')) {
                e.preventDefault();
            }
        });
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
        const gameScreen = document.getElementById('game-screen');
        if (!gameScreen || !gameScreen.classList.contains('active')) return;

        if (e.button === 0) {
            // Left click: create joystick at click position
            this.mouseDown = true;
            this.joystickPos = { x: e.clientX, y: e.clientY };
            this.joystickCurrent = { x: e.clientX, y: e.clientY };
            this.active = true;
            e.preventDefault();
        } else if (e.button === 2) {
            // Right click: boost
            this.boosting = true;
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
        } else if (e.button === 2) {
            this.boosting = false;
        }
    }

    // ======================== KEYBOARD ========================

    _onKeyDown(e) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            this.boosting = true;
        }
    }

    _onKeyUp(e) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            this.boosting = false;
        }
    }

    // ======================== PUBLIC API ========================

    /**
     * Get the target angle for the player snake.
     * Uses unified joystick data from either touch or mouse input.
     */
    getAngle() {
        if (this.joystickCurrent && this.joystickPos) {
            const dx = this.joystickCurrent.x - this.joystickPos.x;
            const dy = this.joystickCurrent.y - this.joystickPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.joystickDeadzone) {
                this.angle = Math.atan2(dy, dx);
            }
        }
        return this.angle;
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
