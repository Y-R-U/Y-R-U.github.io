// ── Input System ── Touch (mobile) + Keyboard/Mouse (desktop) ──
const Input = (() => {
    let moveDir = 0;        // -1 up, 0 none, 1 down
    let moveAnalog = 0;     // -1..1 analog
    let shootPressed = false;
    let shootHeld = false;
    let canvasEl = null;
    let canvasRect = null;
    let isMobile = false;
    let touchMoveId = null;
    let touchMoveStartY = 0;
    let touchMoveCurrentY = 0;
    let touchShootId = null;
    let keysDown = {};

    function init(canvas) {
        canvasEl = canvas;
        isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        updateRect();
        window.addEventListener('resize', updateRect);

        // Touch events
        canvasEl.addEventListener('touchstart', onTouchStart, { passive: false });
        canvasEl.addEventListener('touchmove', onTouchMove, { passive: false });
        canvasEl.addEventListener('touchend', onTouchEnd, { passive: false });
        canvasEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

        // Mouse events
        canvasEl.addEventListener('mousedown', onMouseDown);
        canvasEl.addEventListener('mouseup', onMouseUp);

        // Keyboard
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
    }

    function updateRect() {
        if (canvasEl) canvasRect = canvasEl.getBoundingClientRect();
    }

    // ── Touch ──
    function onTouchStart(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const x = touch.clientX - canvasRect.left;
            const halfW = canvasRect.width / 2;
            if (x > halfW) {
                // Right half = movement
                if (touchMoveId === null) {
                    touchMoveId = touch.identifier;
                    touchMoveStartY = touch.clientY;
                    touchMoveCurrentY = touch.clientY;
                }
            } else {
                // Left half = shoot
                if (touchShootId === null) {
                    touchShootId = touch.identifier;
                    shootPressed = true;
                    shootHeld = true;
                }
            }
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchMoveId) {
                touchMoveCurrentY = touch.clientY;
                const delta = touchMoveCurrentY - touchMoveStartY;
                const sensitivity = canvasRect.height * 0.15;
                moveAnalog = Math.max(-1, Math.min(1, delta / sensitivity));
            }
        }
    }

    function onTouchEnd(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchMoveId) {
                touchMoveId = null;
                moveAnalog = 0;
            }
            if (touch.identifier === touchShootId) {
                touchShootId = null;
                shootHeld = false;
            }
        }
    }

    // ── Mouse ──
    function onMouseDown(e) {
        if (e.button === 0) {
            shootPressed = true;
            shootHeld = true;
        }
    }

    function onMouseUp(e) {
        if (e.button === 0) {
            shootHeld = false;
        }
    }

    // ── Keyboard ──
    function onKeyDown(e) {
        keysDown[e.code] = true;
        if (e.code === 'Space') {
            e.preventDefault();
            if (!shootPressed) shootPressed = true;
            shootHeld = true;
        }
    }

    function onKeyUp(e) {
        keysDown[e.code] = false;
        if (e.code === 'Space') {
            shootHeld = false;
        }
    }

    function update() {
        // Keyboard movement
        if (keysDown['ArrowUp'] || keysDown['KeyW']) {
            moveDir = -1;
        } else if (keysDown['ArrowDown'] || keysDown['KeyS']) {
            moveDir = 1;
        } else if (touchMoveId === null) {
            moveDir = 0;
        }
    }

    function consumeShoot() {
        if (shootPressed) {
            shootPressed = false;
            return true;
        }
        return false;
    }

    function getMoveInput() {
        // Prefer touch analog if active
        if (touchMoveId !== null) return moveAnalog;
        return moveDir;
    }

    function destroy() {
        if (canvasEl) {
            canvasEl.removeEventListener('touchstart', onTouchStart);
            canvasEl.removeEventListener('touchmove', onTouchMove);
            canvasEl.removeEventListener('touchend', onTouchEnd);
            canvasEl.removeEventListener('touchcancel', onTouchEnd);
            canvasEl.removeEventListener('mousedown', onMouseDown);
            canvasEl.removeEventListener('mouseup', onMouseUp);
        }
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    }

    return {
        init, update, consumeShoot, getMoveInput, destroy, updateRect,
        get shootHeld() { return shootHeld; },
        get isMobile() { return isMobile; },
    };
})();
