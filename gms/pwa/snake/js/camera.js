/**
 * Camera - follows player, handles world-to-screen transform
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
    }

    /** Update logical dimensions (call on window resize) */
    updateViewSize() {
        this.viewWidth = window.innerWidth;
        this.viewHeight = window.innerHeight;
    }

    /** Follow a target position, zoom based on snake mass */
    follow(targetX, targetY, mass) {
        this.x = Utils.lerp(this.x, targetX, CONFIG.CAMERA_LERP);
        this.y = Utils.lerp(this.y, targetY, CONFIG.CAMERA_LERP);

        // Zoom out as snake grows
        this.targetZoom = Utils.clamp(
            CONFIG.CAMERA_ZOOM_MAX - (mass - CONFIG.SNAKE_START_LENGTH) * 0.003,
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

    /** Get the visible world bounds */
    getViewBounds() {
        const halfW = (this.viewWidth / 2) / this.zoom;
        const halfH = (this.viewHeight / 2) / this.zoom;
        return {
            left: this.x - halfW - 100,
            right: this.x + halfW + 100,
            top: this.y - halfH - 100,
            bottom: this.y + halfH + 100
        };
    }

    /** Check if a world point is visible on screen (with padding) */
    isVisible(wx, wy, padding = 50) {
        const bounds = this.getViewBounds();
        return wx >= bounds.left - padding && wx <= bounds.right + padding &&
               wy >= bounds.top - padding && wy <= bounds.bottom + padding;
    }

    /** Reset camera */
    reset() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.targetZoom = 1;
        this.shakeIntensity = 0;
        this.updateViewSize();
    }
}
