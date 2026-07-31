/**
 * Camera - follows player, handles world-to-screen transform
 *
 * Zoom comes from the player's LEVEL, in steps, so growing is punctuated rather
 * than a slow drift you never notice. It still lerps between steps — the point
 * is that the pull-back happens at a moment, not that it snaps.
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

    /** Follow a target position at the zoom its level asks for. */
    follow(targetX, targetY, levelZoom) {
        this.x = Utils.lerp(this.x, targetX, CONFIG.CAMERA_LERP);
        this.y = Utils.lerp(this.y, targetY, CONFIG.CAMERA_LERP);

        this.targetZoom = Utils.clamp(
            levelZoom || CONFIG.CAMERA_ZOOM_MAX,
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
        this.zoom = CONFIG.LEVELS[0].zoom;
        this.targetZoom = this.zoom;
        this.shakeIntensity = 0;
        this._boundsDirty = true;
        this.updateViewSize();
    }
}
