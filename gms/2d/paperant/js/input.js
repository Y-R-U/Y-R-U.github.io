/* input.js - Unified pointer input handling (mouse + touch + pen)
 *
 * Uses Pointer Events with setPointerCapture so a stroke is locked to the
 * originating pointer until release. This fixes:
 *  - touchcancel (browser gesture interception) ending strokes mid-drag
 *  - second finger taps orphaning the in-progress stroke
 *  - mouseleave ending the stroke when the cursor crosses the canvas edge
 */
'use strict';

const Input = (() => {
    let canvas = null;
    let activePointerId = null;
    let onStrokeStart = null;
    let onStrokeMove = null;
    let onStrokeEnd = null;
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

    function handleStart(e) {
        if (!enabled) return;
        // Ignore if a pointer is already drawing (don't let a second finger hijack)
        if (activePointerId !== null) return;
        // Don't start strokes that originate on UI elements
        if (e.target !== canvas) return;
        e.preventDefault();
        activePointerId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        const pos = getPos(e);
        if (onStrokeStart) onStrokeStart(pos);
    }

    function handleMove(e) {
        if (!enabled) return;
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        const pos = getPos(e);
        if (onStrokeMove) onStrokeMove(pos);
    }

    function handleEnd(e) {
        if (!enabled) return;
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
        activePointerId = null;
        if (onStrokeEnd) onStrokeEnd();
    }

    function init(canvasEl) {
        canvas = canvasEl;
        canvas.addEventListener('pointerdown', handleStart);
        canvas.addEventListener('pointermove', handleMove);
        canvas.addEventListener('pointerup', handleEnd);
        canvas.addEventListener('pointercancel', handleEnd);
        // Prevent context menu on long-press
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function setCallbacks(start, move, end) {
        onStrokeStart = start;
        onStrokeMove = move;
        onStrokeEnd = end;
    }

    function enable() { enabled = true; }
    function disable() {
        enabled = false;
        if (activePointerId !== null) {
            try { canvas.releasePointerCapture(activePointerId); } catch (e) {}
            activePointerId = null;
        }
    }

    return {
        init, setCallbacks, enable, disable,
        get isDrawing() { return activePointerId !== null; },
    };
})();
