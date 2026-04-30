/* Pointer-event drag-and-drop for the library grid + breadcrumbs.

   - On touch/pen: long-press (~400ms) to lift before scrolling kicks in.
   - On mouse: small movement threshold then we own the gesture.
   - Drop targets are any element with data-drop-folder-id (folder cards,
     breadcrumb crumbs) for "move into folder", or another card with
     data-node-id for "reorder before this card". The trailing "+" card
     gets data-drop-append=1 to mean "append at end of current parent".
*/

const LONG_PRESS_MS = 350;
const MOVE_THRESHOLD_PX = 6;

let active = null;       // current drag gesture
let onMoveCb = null;     // callback fired when a successful move completes

export function init({ onMove }) {
  onMoveCb = onMove;
}

export function attachAll(rootEl) {
  rootEl.querySelectorAll('[data-draggable="1"]').forEach((el) => attachOne(el));
}

function attachOne(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return; // only primary
    if (e.target.closest('button')) return;  // tapping a card button shouldn't start drag
    startGesture(el, e);
  });
}

function startGesture(srcEl, ev) {
  active = {
    srcEl,
    pointerId: ev.pointerId,
    pointerType: ev.pointerType,
    startX: ev.clientX,
    startY: ev.clientY,
    lastX: ev.clientX,
    lastY: ev.clientY,
    started: false,
    timer: null,
    ghost: null,
    lastDropTarget: null,
  };
  // For mouse, allow short delay too — tapping shouldn't trigger drag mistakenly.
  active.timer = setTimeout(() => maybeStart(), LONG_PRESS_MS);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
}

function maybeStart() {
  if (!active || active.started) return;
  beginDrag();
}

function beginDrag() {
  if (!active) return;
  active.started = true;
  const rect = active.srcEl.getBoundingClientRect();
  const ghost = active.srcEl.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.position = 'fixed';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '9999';
  ghost.style.transform = 'scale(1.04)';
  ghost.style.opacity = '0.9';
  document.body.appendChild(ghost);
  active.ghost = ghost;
  active.offsetX = active.lastX - rect.left;
  active.offsetY = active.lastY - rect.top;
  active.srcEl.classList.add('drag-source');
  // Try to suppress page scroll while we're dragging.
  document.body.classList.add('dragging-active');
  try { active.srcEl.setPointerCapture?.(active.pointerId); } catch (_) {}
}

function onPointerMove(ev) {
  if (!active || ev.pointerId !== active.pointerId) return;
  active.lastX = ev.clientX;
  active.lastY = ev.clientY;
  if (!active.started) {
    const dx = ev.clientX - active.startX;
    const dy = ev.clientY - active.startY;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
      // For touch we abort: a swipe means "scroll", not drag.
      if (active.pointerType === 'touch' || active.pointerType === 'pen') {
        cancelGesture();
        return;
      }
      // For mouse: this counts as starting drag.
      clearTimeout(active.timer);
      beginDrag();
    } else {
      return;
    }
  }
  // Once dragging, prevent default to stop scroll on touch.
  ev.preventDefault();
  active.ghost.style.left = (ev.clientX - active.offsetX) + 'px';
  active.ghost.style.top = (ev.clientY - active.offsetY) + 'px';
  highlightDrop(ev);
}

function highlightDrop(ev) {
  if (!active) return;
  // Briefly hide the ghost so elementFromPoint sees the underlying element.
  active.ghost.style.display = 'none';
  const under = document.elementFromPoint(ev.clientX, ev.clientY);
  active.ghost.style.display = '';
  const target = findDropTarget(under);
  if (active.lastDropTarget && active.lastDropTarget !== target) {
    active.lastDropTarget.classList.remove('drop-target');
  }
  if (target && target !== active.lastDropTarget) {
    target.classList.add('drop-target');
  }
  active.lastDropTarget = target;
}

function findDropTarget(node) {
  let cur = node;
  while (cur && cur !== document.body) {
    if (cur === active.srcEl) return null; // can't drop onto yourself
    if (cur.dataset?.dropFolderId || cur.dataset?.dropAppend || cur.dataset?.nodeType === 'item') {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

async function onPointerUp(ev) {
  if (!active || ev.pointerId !== active.pointerId) return;
  const a = active;
  cleanup();
  if (!a.started) return;
  if (a.lastDropTarget) {
    a.lastDropTarget.classList.remove('drop-target');
    const op = describeDrop(a.srcEl, a.lastDropTarget);
    if (op && onMoveCb) {
      try { await onMoveCb(op); } catch (e) { console.warn('move failed', e); }
    }
  }
}

function describeDrop(srcEl, dropEl) {
  const nodeId = srcEl.dataset.nodeId;
  if (!nodeId) return null;
  if (dropEl.dataset.dropFolderId) {
    return { kind: 'into', nodeId, folderId: dropEl.dataset.dropFolderId };
  }
  if (dropEl.dataset.dropAppend) {
    return { kind: 'append-current', nodeId };
  }
  if (dropEl.dataset.nodeType === 'item' || dropEl.dataset.nodeType === 'folder') {
    return { kind: 'before', nodeId, beforeNodeId: dropEl.dataset.nodeId };
  }
  return null;
}

function cancelGesture() {
  cleanup();
}

function cleanup() {
  if (!active) return;
  clearTimeout(active.timer);
  if (active.ghost) active.ghost.remove();
  if (active.srcEl) active.srcEl.classList.remove('drag-source');
  if (active.lastDropTarget) active.lastDropTarget.classList.remove('drop-target');
  document.body.classList.remove('dragging-active');
  try { active.srcEl?.releasePointerCapture?.(active.pointerId); } catch (_) {}
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp, true);
  window.removeEventListener('pointercancel', onPointerUp, true);
  active = null;
}
