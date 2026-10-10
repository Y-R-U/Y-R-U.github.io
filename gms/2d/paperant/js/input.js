/* input.js - Unified pointer input handling (mouse + touch + pen)
 *
 * One contact owns the pen at a time (setPointerCapture). A second finger is
 * ignored mid-stroke, except that a newer contact may take over a stroke that
 * has barely started (a resting palm or a mis-touch). Very large contacts are
 * rejected outright as palms. Short, still contacts are reported as taps.
 */
'use strict';

const Input = (() => {
    const PALM_SIZE = 44;      // css px contact width/height treated as a palm
    const TAKEOVER_MOVE = 8;   // css px; a stroke that moved less can be taken over
    const TAKEOVER_POINTS = 3;
    const TAP_MOVE = 8;
    const TAP_MS = 300;

    let canvas = null;
    let activePointerId = null;
    let downX = 0, downY = 0, downT = 0, moved = 0;
    let onStrokeStart = null;
    let onStrokeMove = null;
    let onStrokeEnd = null;
    let onStrokeCancel = null;
    let onTap = null;
    let enabled = false;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function isPalm(e) {
        return e.pointerType === 'touch' && (e.width > PALM_SIZE || e.height > PALM_SIZE);
    }

    function release() {
        if (activePointerId === null) return;
        try { canvas.releasePointerCapture(activePointerId); } catch (err) {}
        activePointerId = null;
    }

    function handleStart(e) {
        if (!enabled) return;
        if (e.target !== canvas) return;
        e.preventDefault();
        if (isPalm(e)) return;
        if (activePointerId !== null) {
            const barelyStarted = moved < TAKEOVER_MOVE || Drawing.pointCount < TAKEOVER_POINTS;
            if (!barelyStarted) return;
            release();
            if (onStrokeCancel) onStrokeCancel();
        }
        activePointerId = e.pointerId;
        downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        if (onStrokeStart) onStrokeStart(getPos(e));
    }

    function handleMove(e) {
        if (!enabled) return;
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
        if (onStrokeMove) onStrokeMove(getPos(e));
    }

    function handleEnd(e) {
        if (!enabled) return;
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        const pos = getPos(e);
        release();
        if (onStrokeEnd) onStrokeEnd();
        if (e.type === 'pointerup' && moved < TAP_MOVE && performance.now() - downT < TAP_MS && onTap) {
            onTap(pos);
        }
    }

    function init(canvasEl) {
        canvas = canvasEl;
        canvas.addEventListener('pointerdown', handleStart);
        canvas.addEventListener('pointermove', handleMove);
        canvas.addEventListener('pointerup', handleEnd);
        canvas.addEventListener('pointercancel', handleEnd);
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function setCallbacks(start, move, end, cancel, tap) {
        onStrokeStart = start;
        onStrokeMove = move;
        onStrokeEnd = end;
        onStrokeCancel = cancel || null;
        onTap = tap || null;
    }

    function enable() { enabled = true; }
    function disable() {
        enabled = false;
        release();
    }

    return {
        init, setCallbacks, enable, disable,
        get isDrawing() { return activePointerId !== null; },
    };
})();
