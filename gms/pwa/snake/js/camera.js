/**
 * Camera - follows player, handles world-to-screen transform
 *
 * Zoom tracks the player's *body radius*, not raw mass. The old formula
 * (ZOOM_MAX - mass * 0.003) bottomed out at about mass 310 and then never
 * changed again, so from there on the snake grew and grew while the view stayed
 * put and you could no longer see your own body.
 *
 * View bounds are cached and returned as the same object every call. This is
 * read once per segment during rendering — allocating a fresh object each time
 * was thousands of short-lived objects per frame.
 */
class Camera {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.targetZoom = 1;
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeIntensity = 0;
        // Store logical (CSS pixel) dimensions - NOT physical canvas pixels
        this.viewWidth = window.innerWidth;
        this.viewHeight = window.innerHeight;

        this._bounds = { left: 0, right: 0, top: 0, bottom: 0 };
        this._boundsDirty = true;
    }

    /** Update logical dimensions (call on window resize) */
    updateViewSize() {
        this.viewWidth = window.innerWidth;
        this.viewHeight = window.innerHeight;
        this._boundsDirty = true;
    }

    /** Follow a target position, zooming out as the snake gets fatter. */
    follow(targetX, targetY, bodyRadius) {
        this.x = Utils.lerp(this.x, targetX, CONFIG.CAMERA_LERP);
        this.y = Utils.lerp(this.y, targetY, CONFIG.CAMERA_LERP);

        const r = Math.max(1, bodyRadius || CONFIG.SNAKE_BODY_RADIUS);
        this.targetZoom = Utils.clamp(
            CONFIG.CAMERA_ZOOM_RADIUS_REF / r,
            CONFIG.CAMERA_ZOOM_MIN,
            CONFIG.CAMERA_ZOOM_MAX
        );
        this.zoom = Utils.lerp(this.zoom, this.targetZoom, CONFIG.CAMERA_ZOOM_LERP);

        // Shake decay
        if (this.shakeIntensity > 0) {
            this.shakeX = Utils.rand(-this.shakeIntensity, this.shakeIntensity);
            this.shakeY = Utils.rand(-this.shakeIntensity, this.shakeIntensity);
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        this._boundsDirty = true;
    }

    /** Trigger screen shake */
    shake(intensity) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }

    /** Convert world coordinates to screen coordinates (CSS pixels) */
    worldToScreen(wx, wy) {
        const cx = this.viewWidth / 2;
        const cy = this.viewHeight / 2;
        return {
            x: (wx - this.x) * this.zoom + cx + this.shakeX,
            y: (wy - this.y) * this.zoom + cy + this.shakeY
        };
    }

    /** Convert screen coordinates to world coordinates */
    screenToWorld(sx, sy) {
        const cx = this.viewWidth / 2;
        const cy = this.viewHeight / 2;
        return {
            x: (sx - cx - this.shakeX) / this.zoom + this.x,
            y: (sy - cy - this.shakeY) / this.zoom + this.y
        };
    }

    /**
     * Get the visible world bounds.
     * Returns a SHARED object — read it, do not keep it across camera changes.
     */
    getViewBounds() {
        if (this._boundsDirty) {
            const halfW = (this.viewWidth / 2) / this.zoom;
            const halfH = (this.viewHeight / 2) / this.zoom;
            const b = this._bounds;
            b.left = this.x - halfW - 100;
            b.right = this.x + halfW + 100;
            b.top = this.y - halfH - 100;
            b.bottom = this.y + halfH + 100;
            this._boundsDirty = false;
        }
        return this._bounds;
    }

    /** Check if a world point is visible on screen (with padding) */
    isVisible(wx, wy, padding = 50) {
        const b = this.getViewBounds();
        return wx >= b.left - padding && wx <= b.right + padding &&
               wy >= b.top - padding && wy <= b.bottom + padding;
    }

    /** Reset camera */
    reset() {
        this.x = 0;
        this.y = 0;
        this.zoom = CONFIG.CAMERA_ZOOM_MAX;
        this.targetZoom = CONFIG.CAMERA_ZOOM_MAX;
        this.shakeIntensity = 0;
        this._boundsDirty = true;
        this.updateViewSize();
    }
}
