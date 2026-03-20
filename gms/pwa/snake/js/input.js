/**
 * Input handler - touch, mouse, keyboard
 */
class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.active = false;
        this.angle = 0;
        this.boosting = false;

        // Touch state
        this.touchId = null;
        this.touchStart = null;
        this.touchCurrent = null;
        this.boostTouchId = null;

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseActive = false;

        // Joystick config
        this.joystickRadius = 50;
        this.joystickDeadzone = 10;
        this.joystickPos = null; // Set dynamically on touch

        this._bindEvents();
    }

    _bindEvents() {
        // Touch events
        this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', e => this._onTouchEnd(e), { passive: false });

        // Mouse events
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup', e => this._onMouseUp(e));

        // Keyboard events
        window.addEventListener('keydown', e => this._onKeyDown(e));
        window.addEventListener('keyup', e => this._onKeyUp(e));

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    _onTouchStart(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // Check if it's the boost button area (bottom-right)
            const boostBtn = document.getElementById('boost-btn');
            if (boostBtn) {
                const btnRect = boostBtn.getBoundingClientRect();
                if (touch.clientX >= btnRect.left && touch.clientX <= btnRect.right &&
                    touch.clientY >= btnRect.top && touch.clientY <= btnRect.bottom) {
                    this.boostTouchId = touch.identifier;
                    this.boosting = true;
                    boostBtn.classList.add('active');
                    continue;
                }
            }

            if (this.touchId === null) {
                this.touchId = touch.identifier;
                this.touchStart = { x, y };
                this.touchCurrent = { x, y };
                this.joystickPos = { x, y };
                this.active = true;
            }
        }
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.touchId) {
                const rect = this.canvas.getBoundingClientRect();
                this.touchCurrent = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };
            }
        }
    }

    _onTouchEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.touchId) {
                this.touchId = null;
                this.touchStart = null;
                this.touchCurrent = null;
                this.joystickPos = null;
                this.active = false;
            }
            if (touch.identifier === this.boostTouchId) {
                this.boostTouchId = null;
                this.boosting = false;
                const boostBtn = document.getElementById('boost-btn');
                if (boostBtn) boostBtn.classList.remove('active');
            }
        }
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        this.mouseActive = true;
        this.active = true;
    }

    _onMouseDown(e) {
        if (e.button === 0) { // Left click = boost
            this.boosting = true;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this.boosting = false;
        }
    }

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

    /**
     * Get the target angle for the player snake.
     * Returns angle relative to the center of the canvas (where the snake head is rendered).
     */
    getAngle() {
        // Use CSS pixel dimensions, not physical canvas pixels (DPR-safe)
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        if (this.touchCurrent && this.joystickPos) {
            const dx = this.touchCurrent.x - this.joystickPos.x;
            const dy = this.touchCurrent.y - this.joystickPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.joystickDeadzone) {
                this.angle = Math.atan2(dy, dx);
            }
        } else if (this.mouseActive) {
            this.angle = Math.atan2(this.mouseY - cy, this.mouseX - cx);
        }
        return this.angle;
    }

    /** Get joystick visual data for rendering */
    getJoystickData() {
        if (!this.joystickPos || !this.touchCurrent) return null;
        const dx = this.touchCurrent.x - this.joystickPos.x;
        const dy = this.touchCurrent.y - this.joystickPos.y;
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
