/**
 * ShipController
 * Handles virtual joystick input and ship movement physics.
 * Designed to be reusable across projects.
 *
 * Usage:
 *   const ctrl = new ShipController(canvas, { speed: 8, islandRadius: 18, waterSize: 200 });
 *   // In game loop:
 *   ctrl.update(dt, time);
 *   // Read state:
 *   ctrl.position   // BABYLON.Vector3
 *   ctrl.angle      // radians
 *   ctrl.turnRate   // for visual tilt
 */
class ShipController {
    constructor(canvas, opts = {}) {
        this.canvas = canvas;

        // Config
        this.speed       = opts.speed       ?? 8;
        this.waterSize   = opts.waterSize   ?? 200;
        this.islandRadius = opts.islandRadius ?? 0;  // 0 = no island collision
        this.islandPos   = opts.islandPos   ?? { x: 0, z: 0 };

        // Ship state
        this.position  = opts.startPos ?? new BABYLON.Vector3(0, 0, 0);
        this.angle     = 0;
        this.velocity  = 0;
        this.turnRate  = 0;

        // Joystick state
        this._active       = false;
        this._center       = { x: 0, y: 0 };
        this._dir          = { x: 0, y: 0 };
        this._pointerId    = -1;

        this._buildJoystickUI();
        this._bindEvents();
    }

    _buildJoystickUI() {
        const outer = document.createElement("div");
        outer.style.cssText = [
            "position:absolute",
            "width:100px",
            "height:100px",
            "border-radius:50%",
            "border:3px solid rgba(255,255,255,0.5)",
            "background:rgba(255,255,255,0.1)",
            "pointer-events:none",
            "display:none",
            "transform:translate(-50%,-50%)",
            "z-index:10"
        ].join(";");
        document.body.appendChild(outer);
        this._outer = outer;

        const inner = document.createElement("div");
        inner.style.cssText = [
            "position:absolute",
            "width:36px",
            "height:36px",
            "border-radius:50%",
            "background:rgba(255,255,255,0.6)",
            "pointer-events:none",
            "display:none",
            "transform:translate(-50%,-50%)",
            "z-index:11"
        ].join(";");
        document.body.appendChild(inner);
        this._inner = inner;
    }

    _bindEvents() {
        const canvas = this.canvas;

        canvas.addEventListener("pointerdown", (e) => {
            // Only start joystick on single-touch (pinch handled externally)
            if (!this._active) {
                this._active    = true;
                this._pointerId = e.pointerId;
                this._center    = { x: e.clientX, y: e.clientY };
                this._dir       = { x: 0, y: 0 };
                this._outer.style.display = "block";
                this._outer.style.left    = e.clientX + "px";
                this._outer.style.top     = e.clientY + "px";
                this._inner.style.display = "block";
                this._inner.style.left    = e.clientX + "px";
                this._inner.style.top     = e.clientY + "px";
                canvas.setPointerCapture(e.pointerId);
            }
        });

        canvas.addEventListener("pointermove", (e) => {
            if (!this._active || e.pointerId !== this._pointerId) return;
            const dx   = e.clientX - this._center.x;
            const dy   = e.clientY - this._center.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxR = 50;
            const clamped = Math.min(dist, maxR);
            const ang  = Math.atan2(dy, dx);
            this._inner.style.left = (this._center.x + Math.cos(ang) * clamped) + "px";
            this._inner.style.top  = (this._center.y + Math.sin(ang) * clamped) + "px";
            this._dir = dist > 8
                ? { x: Math.cos(ang), y: Math.sin(ang) }
                : { x: 0, y: 0 };
        });

        const end = (e) => {
            if (e.pointerId !== this._pointerId) return;
            this._active    = false;
            this._pointerId = -1;
            this._dir       = { x: 0, y: 0 };
            this._outer.style.display = "none";
            this._inner.style.display = "none";
        };
        canvas.addEventListener("pointerup",     end);
        canvas.addEventListener("pointercancel", end);
    }

    /** Call once per frame. dt = seconds elapsed. time = total elapsed seconds. */
    update(dt) {
        const prevAngle = this.angle;

        if (this._dir.x !== 0 || this._dir.y !== 0) {
            // Map joystick screen-up → forward (world-space doesn't depend on camera)
            const target  = this.angle + Math.atan2(this._dir.x, -this._dir.y);
            let diff = target - this.angle;
            while (diff >  Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.angle += diff * Math.min(1, dt * 4);
            this.velocity = this.speed;
        } else {
            this.velocity *= 0.95;
            if (this.velocity < 0.1) this.velocity = 0;
        }

        // Track turn rate for visual tilt
        let angleDelta = this.angle - prevAngle;
        while (angleDelta >  Math.PI) angleDelta -= Math.PI * 2;
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
        this.turnRate += (angleDelta / Math.max(dt, 0.001) - this.turnRate) * Math.min(1, dt * 8);

        if (this.velocity > 0) {
            this.position.x += Math.sin(this.angle) * this.velocity * dt;
            this.position.z += Math.cos(this.angle) * this.velocity * dt;

            // Boundary clamp
            const halfW = this.waterSize / 2 - 5;
            this.position.x = Math.max(-halfW, Math.min(halfW, this.position.x));
            this.position.z = Math.max(-halfW, Math.min(halfW, this.position.z));

            // Island collision
            if (this.islandRadius > 0) {
                const ix = this.position.x - this.islandPos.x;
                const iz = this.position.z - this.islandPos.z;
                const distToIsland = Math.sqrt(ix * ix + iz * iz);
                const minDist = this.islandRadius + 2;
                if (distToIsland < minDist) {
                    const pushAngle = Math.atan2(ix, iz);
                    this.position.x = this.islandPos.x + Math.sin(pushAngle) * minDist;
                    this.position.z = this.islandPos.z + Math.cos(pushAngle) * minDist;
                }
            }
        }
    }

    /** Cancel any active joystick input (e.g. when pinch starts). */
    cancelInput() {
        this._active    = false;
        this._pointerId = -1;
        this._dir       = { x: 0, y: 0 };
        this._outer.style.display = "none";
        this._inner.style.display = "none";
    }

    destroy() {
        this._outer.remove();
        this._inner.remove();
    }
}
