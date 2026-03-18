// Input system - Keyboard + Virtual Joystick

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.dx = 0;
        this.dy = 0;
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // Virtual joystick state
        this.joystick = {
            active: false,
            touchId: null,
            originX: 0,
            originY: 0,
            currentX: 0,
            currentY: 0,
            outerRadius: 70,
            innerRadius: 28,
            dx: 0,
            dy: 0
        };

        this._setupKeyboard();
        this._setupTouch();
    }

    _setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Prevent scrolling with arrows/space
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    _setupTouch() {
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (this.joystick.touchId === null) {
                    this.joystick.active = true;
                    this.joystick.touchId = touch.identifier;
                    this.joystick.originX = touch.clientX;
                    this.joystick.originY = touch.clientY;
                    this.joystick.currentX = touch.clientX;
                    this.joystick.currentY = touch.clientY;
                }
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.joystick.touchId) {
                    this.joystick.currentX = touch.clientX;
                    this.joystick.currentY = touch.clientY;

                    const jdx = this.joystick.currentX - this.joystick.originX;
                    const jdy = this.joystick.currentY - this.joystick.originY;
                    const dist = Math.sqrt(jdx * jdx + jdy * jdy);
                    const maxDist = this.joystick.outerRadius;

                    if (dist > 0) {
                        const clamped = Math.min(dist, maxDist);
                        this.joystick.dx = (jdx / dist) * (clamped / maxDist);
                        this.joystick.dy = (jdy / dist) * (clamped / maxDist);
                    }
                }
            }
        }, { passive: false });

        const endTouch = (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.joystick.touchId) {
                    this.joystick.active = false;
                    this.joystick.touchId = null;
                    this.joystick.dx = 0;
                    this.joystick.dy = 0;
                }
            }
        };

        this.canvas.addEventListener('touchend', endTouch, { passive: false });
        this.canvas.addEventListener('touchcancel', endTouch, { passive: false });
    }

    update() {
        // Keyboard input
        let kx = 0, ky = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) kx -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) kx += 1;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) ky -= 1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) ky += 1;

        // Normalize keyboard diagonal
        if (kx !== 0 && ky !== 0) {
            const inv = 1 / Math.sqrt(2);
            kx *= inv;
            ky *= inv;
        }

        // Combine: joystick takes priority on mobile
        if (this.joystick.active) {
            this.dx = this.joystick.dx;
            this.dy = this.joystick.dy;
        } else {
            this.dx = kx;
            this.dy = ky;
        }
    }

    drawJoystick(ctx) {
        if (!this.joystick.active) return;

        const j = this.joystick;

        // Outer circle
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(j.originX, j.originY, j.outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#f0d9a0';
        ctx.fill();
        ctx.strokeStyle = '#8b6914';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner circle (thumb)
        ctx.globalAlpha = 0.5;
        const thumbX = j.originX + j.dx * j.outerRadius;
        const thumbY = j.originY + j.dy * j.outerRadius;
        ctx.beginPath();
        ctx.arc(thumbX, thumbY, j.innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();
        ctx.strokeStyle = '#c4a035';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    get moving() {
        return Math.abs(this.dx) > 0.1 || Math.abs(this.dy) > 0.1;
    }

    get angle() {
        return Math.atan2(this.dy, this.dx);
    }

    get magnitude() {
        return Math.min(1, Math.sqrt(this.dx * this.dx + this.dy * this.dy));
    }
}
