/* input.js - Unified touch/mouse input handling */
'use strict';

const Input = (() => {
    let canvas = null;
    let isDown = false;
    let points = []; // current stroke points
    let onStrokeStart = null;
    let onStrokeMove = null;
    let onStrokeEnd = null;
    let enabled = false;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    function handleStart(e) {
        if (!enabled) return;
        // Don't capture if it started on a UI element
        if (e.target !== canvas) return;
        e.preventDefault();
        isDown = true;
        const pos = getPos(e);
        points = [pos];
        if (onStrokeStart) onStrokeStart(pos);
    }

    function handleMove(e) {
        if (!enabled || !isDown) return;
        e.preventDefault();
        const pos = getPos(e);
        points.push(pos);
        if (onStrokeMove) onStrokeMove(pos, points);
    }

    function handleEnd(e) {
        if (!enabled || !isDown) return;
        e.preventDefault();
        isDown = false;
        if (onStrokeEnd) onStrokeEnd([...points]);
        points = [];
    }

    function init(canvasEl) {
        canvas = canvasEl;
        // Touch
        canvas.addEventListener('touchstart', handleStart, { passive: false });
        canvas.addEventListener('touchmove', handleMove, { passive: false });
        canvas.addEventListener('touchend', handleEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleEnd, { passive: false });
        // Mouse
        canvas.addEventListener('mousedown', handleStart);
        canvas.addEventListener('mousemove', handleMove);
        canvas.addEventListener('mouseup', handleEnd);
        canvas.addEventListener('mouseleave', handleEnd);
    }

    function setCallbacks(start, move, end) {
        onStrokeStart = start;
        onStrokeMove = move;
        onStrokeEnd = end;
    }

    function enable() { enabled = true; }
    function disable() { enabled = false; isDown = false; points = []; }

    return { init, setCallbacks, enable, disable, get isDrawing() { return isDown; } };
})();
