import * as store from './store.js';
import { navigate } from './router.js';
import { formatShortDate, stripHtml } from './utils.js';
import { modalChoice, modalPrompt, modalConfirm, showModal } from './modal.js';

const gridEl        = document.getElementById('card-grid');
const breadcrumbsEl = document.getElementById('breadcrumbs');
const cancelBtn     = document.getElementById('drag-cancel');

// Track which folder level is currently visible so drag-drop can re-render
let _currentParentId = null;

// ─── Public ──────────────────────────────────────────────────────────────────

export function renderHome(parentId) {
  _currentParentId = parentId;
  renderBreadcrumbs(parentId);
  renderCards(parentId);
}

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

function renderBreadcrumbs(parentId) {
  breadcrumbsEl.innerHTML = '';
  if (!parentId) return;

  const crumbs = store.getBreadcrumbs(parentId);

  // "Home" link — also a drag drop zone for root level
  const homeLink = document.createElement('a');
  homeLink.textContent = 'Home';
  homeLink.className = 'breadcrumb-drop';
  homeLink.dataset.folderId = '';           // empty string = root (null parentId)
  homeLink.addEventListener('click', () => navigate('#/'));
  breadcrumbsEl.appendChild(homeLink);

  crumbs.forEach((crumb, i) => {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '›';
    breadcrumbsEl.appendChild(sep);

    const isLast = i === crumbs.length - 1;
    if (isLast) {
      // Current folder — not a drop zone (items are already here)
      const span = document.createElement('span');
      span.className = 'current';
      span.textContent = crumb.title || 'Untitled';
      breadcrumbsEl.appendChild(span);
    } else {
      const link = document.createElement('a');
      link.textContent = crumb.title || 'Untitled';
      link.className = 'breadcrumb-drop';
      link.dataset.folderId = crumb.id;
      link.addEventListener('click', () => navigate(`#/folder/${crumb.id}`));
      breadcrumbsEl.appendChild(link);
    }
  });
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function renderCards(parentId) {
  gridEl.innerHTML = '';

  // ── New Note / Folder card ──
  const newCard = document.createElement('div');
  newCard.className = 'card card-new';
  newCard.innerHTML = '<span class="card-icon">+</span><span class="card-label">New Note</span>';
  newCard.addEventListener('click', () => handleNewNote(parentId));
  gridEl.appendChild(newCard);

  // ── Existing items ──
  const children = store.getChildren(parentId);
  children.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.itemId = item.id;

    if (item.type === 'folder') {
      const icon = document.createElement('div');
      icon.className = 'card-folder-icon';
      icon.textContent = '\uD83D\uDCC1';
      card.appendChild(icon);

      const editBtn = document.createElement('button');
      editBtn.className = 'folder-edit-btn';
      editBtn.textContent = '✏';
      editBtn.title = 'Rename or delete folder';
      editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleFolderEdit(item, parentId);
      });
      card.appendChild(editBtn);
    }

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title
      ? item.title
      : item.content
        ? (stripHtml(item.content).trim().slice(0, 40) || 'Untitled')
        : 'Untitled';
    card.appendChild(title);

    const date = document.createElement('div');
    date.className = 'card-date';
    date.textContent = formatShortDate(item.updatedAt);
    card.appendChild(date);

    // Click to open (suppressed briefly after a drag ends)
    card.addEventListener('click', () => {
      if (_suppressNextClick) return;
      if (item.type === 'folder') navigate(`#/folder/${item.id}`);
      else navigate(`#/note/${item.id}`);
    });

    // Prevent native browser drag interference
    card.addEventListener('dragstart', e => e.preventDefault());

    // Pointer-based drag start
    card.addEventListener('pointerdown', (e) => dragStart(e, item));

    gridEl.appendChild(card);
  });
}

// ─── Folder edit ─────────────────────────────────────────────────────────────

async function handleFolderEdit(folder, parentId) {
  const result = await showModal({
    title: 'Edit Folder',
    inputs: [{ placeholder: 'Folder name', value: folder.title || '' }],
    buttons: [
      { label: 'Cancel', class: 'modal-btn-secondary', value: null        },
      { label: 'Delete', class: 'modal-btn-danger',    value: '__delete__' },
      { label: 'Rename', class: 'modal-btn-primary',   value: '__input__' },
    ],
  });

  if (result === '__delete__') {
    const ok = await modalConfirm(
      `Delete "${folder.title || 'Untitled'}" and everything inside it?`,
      'Delete Folder'
    );
    if (ok) { store.remove(folder.id); renderHome(parentId); }
  } else if (result && result !== null) {
    const name = result.trim();
    if (name && name !== folder.title) {
      folder.title = name;
      store.save(folder);
      renderHome(parentId);
    }
  }
}

// ─── New note / folder ────────────────────────────────────────────────────────

async function handleNewNote(parentId) {
  const choice = await modalChoice('Create New', ['Note', 'Folder']);
  if (!choice) return;

  if (choice === 'Folder') {
    const name = await modalPrompt('Enter folder name', 'Folder name', 'New Folder');
    if (name === null || !name.trim()) return;
    const folder = store.create('folder', parentId);
    folder.title = name.trim();
    store.save(folder);
    navigate(`#/folder/${folder.id}`);
  } else {
    const note = store.create('note', parentId);
    navigate(`#/note/${note.id}`);
  }
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
//
// Uses Pointer Events API — works on both desktop (mouse) and mobile (touch).
//
// Flow (mouse):
//   pointerdown on a card  → store drag candidate
//   pointermove (document) → if moved > THRESHOLD px, activate drag
//                            move ghost, highlight drop target under cursor
//   pointerup   (document) → commit move or cancel
//   pointercancel          → cancel
//
// Flow (touch):
//   pointerdown on a card  → start long-press timer (500ms)
//   pointermove before timer → if moved > THRESHOLD, cancel timer (it's a scroll)
//   pointerup before timer  → cancel timer (it was just a tap)
//   timer fires             → activate drag; subsequent pointermove moves ghost
//
// Drop zones:
//   • #drag-cancel button (top-left)   → cancel, no move
//   • .breadcrumb-drop links           → move to that ancestor level
//   • .card[data-item-id] folder cards → move into that folder
//     (cycle detection prevents dropping a folder into its own descendant)

const DRAG_THRESHOLD = 10;    // px movement before drag activates (mouse) / cancels long-press (touch)
const LONG_PRESS_MS  = 500;   // ms hold before touch drag activates

let _drag              = null; // active drag state object
let _suppressNextClick = false;

// ── Entry point ──────────────────────────────────────────────────────────────

function dragStart(e, item) {
  // Ignore edits and non-primary buttons
  if (e.target.closest('.folder-edit-btn')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  _drag = {
    item,
    pointerId:      e.pointerId,
    originCard:     e.currentTarget,
    startX:         e.clientX,
    startY:         e.clientY,
    active:         false,
    ghost:          null,
    dropTarget:     null,
    dropData:       null,
    longPressTimer: null,
  };

  if (e.pointerType === 'touch') {
    // Touch: require a long press to start drag so normal scrolling still works
    e.currentTarget.classList.add('long-press-pending');
    _drag.longPressTimer = setTimeout(() => _touchActivateDrag(), LONG_PRESS_MS);
    document.addEventListener('pointermove',   _touchEarlyMove,   { passive: true });
    document.addEventListener('pointerup',     _touchEarlyUp);
    document.addEventListener('pointercancel', _touchEarlyCancel);
  } else {
    // Mouse: activate drag once pointer moves past threshold
    document.addEventListener('pointermove',   onMove,   { passive: false });
    document.addEventListener('pointerup',     onUp);
    document.addEventListener('pointercancel', onCancel);
  }
}

// ── Touch long-press helpers ──────────────────────────────────────────────────

function _touchEarlyMove(e) {
  if (!_drag || e.pointerId !== _drag.pointerId) return;
  // If finger moves significantly it's a scroll — cancel the long press
  if (Math.hypot(e.clientX - _drag.startX, e.clientY - _drag.startY) > DRAG_THRESHOLD) {
    _clearLongPress();
    cleanupDrag();
  }
}

function _touchEarlyUp(e) {
  if (!_drag || e.pointerId !== _drag.pointerId) return;
  // Finger lifted before long press fired — treat as tap; let click fire normally
  _clearLongPress();
  cleanupDrag();
}

function _touchEarlyCancel() {
  _clearLongPress();
  cleanupDrag();
}

function _clearLongPress() {
  if (_drag?.longPressTimer) {
    clearTimeout(_drag.longPressTimer);
    _drag.longPressTimer = null;
  }
  if (_drag?.originCard) _drag.originCard.classList.remove('long-press-pending');
  document.removeEventListener('pointermove',   _touchEarlyMove);
  document.removeEventListener('pointerup',     _touchEarlyUp);
  document.removeEventListener('pointercancel', _touchEarlyCancel);
}

function _touchActivateDrag() {
  if (!_drag) return;
  _clearLongPress();
  // Position ghost at finger start location; onMove will track from here
  activateDrag({ clientX: _drag.startX, clientY: _drag.startY });
  document.addEventListener('pointermove',   onMove,   { passive: false });
  document.addEventListener('pointerup',     onUp);
  document.addEventListener('pointercancel', onCancel);
}

// ── Pointer move ─────────────────────────────────────────────────────────────

function onMove(e) {
  if (!_drag || e.pointerId !== _drag.pointerId) return;

  // Activate once the pointer moves past the threshold
  if (!_drag.active) {
    if (Math.hypot(e.clientX - _drag.startX, e.clientY - _drag.startY) < DRAG_THRESHOLD) return;
    activateDrag(e);
    return;
  }

  // Prevent scroll on mobile while dragging
  e.preventDefault();

  // Move ghost alongside pointer
  _drag.ghost.style.left = (e.clientX + 16) + 'px';
  _drag.ghost.style.top  = (e.clientY - 28) + 'px';

  highlightTarget(e.clientX, e.clientY);
}

// ── Pointer up ───────────────────────────────────────────────────────────────

function onUp(e) {
  if (!_drag || e.pointerId !== _drag.pointerId) return;
  if (!_drag.active) { cleanupDrag(); return; }  // was just a tap — no drag
  commitDrop();
}

function onCancel() { cleanupDrag(); }

// ── Activate drag ────────────────────────────────────────────────────────────

function activateDrag(e) {
  _drag.active = true;
  _drag.originCard.classList.add('dragging');
  document.body.classList.add('drag-active');

  // Create ghost label
  const ghost = document.createElement('div');
  ghost.className  = 'drag-ghost';
  ghost.textContent = (_drag.item.type === 'folder' ? '📁 ' : '📄 ')
    + (_drag.item.title || 'Untitled');
  ghost.style.left = (e.clientX + 16) + 'px';
  ghost.style.top  = (e.clientY - 28) + 'px';
  document.body.appendChild(ghost);
  _drag.ghost = ghost;

  cancelBtn.classList.add('active');
}

// ── Highlight drop target ─────────────────────────────────────────────────────

function highlightTarget(x, y) {
  // Remove previous highlight
  if (_drag.dropTarget) {
    _drag.dropTarget.classList.remove('drop-target');
    _drag.dropTarget = null;
    _drag.dropData   = null;
  }

  // Ghost has pointer-events:none so elementFromPoint sees through it
  const el = document.elementFromPoint(x, y);
  if (!el) return;

  // ── Cancel button ──
  const cancelEl = el.closest('#drag-cancel');
  if (cancelEl) {
    cancelEl.classList.add('drop-target');
    _drag.dropTarget = cancelEl;
    _drag.dropData   = { type: 'cancel' };
    return;
  }

  // ── Breadcrumb drop zone ──
  const crumbEl = el.closest('.breadcrumb-drop');
  if (crumbEl) {
    // Convert empty string back to null (root)
    const newParentId = crumbEl.dataset.folderId || null;
    // Don't highlight if item is already at this level
    if (_drag.item.parentId !== newParentId) {
      crumbEl.classList.add('drop-target');
      _drag.dropTarget = crumbEl;
      _drag.dropData   = { type: 'move', newParentId };
    }
    return;
  }

  // ── Folder card ──
  const card = el.closest('.card[data-item-id]');
  if (!card) return;

  const targetId = card.dataset.itemId;
  if (!targetId || targetId === _drag.item.id) return;     // can't drop on self

  const target = store.getById(targetId);
  if (!target || target.type !== 'folder') return;         // only drop into folders

  // Guard against creating a cycle (folder into its own descendant)
  if (_drag.item.type === 'folder' && wouldCycle(_drag.item.id, targetId)) return;

  // Already directly inside this folder — no-op
  if (_drag.item.parentId === targetId) return;

  card.classList.add('drop-target');
  _drag.dropTarget = card;
  _drag.dropData   = { type: 'move', newParentId: targetId };
}

// ── Commit drop ───────────────────────────────────────────────────────────────

function commitDrop() {
  if (!_drag) return;

  const { item, dropData } = _drag;
  cleanupDrag();

  if (!dropData || dropData.type === 'cancel') return;

  item.parentId = dropData.newParentId;
  store.save(item);

  // Suppress the click event that fires right after pointerup
  _suppressNextClick = true;
  setTimeout(() => { _suppressNextClick = false; }, 120);

  renderHome(_currentParentId);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function cleanupDrag() {
  document.removeEventListener('pointermove',   onMove);
  document.removeEventListener('pointerup',     onUp);
  document.removeEventListener('pointercancel', onCancel);

  if (_drag?.ghost)      _drag.ghost.remove();
  if (_drag?.originCard) _drag.originCard.classList.remove('dragging');
  if (_drag?.dropTarget) _drag.dropTarget.classList.remove('drop-target');

  cancelBtn.classList.remove('active', 'drop-target');
  document.body.classList.remove('drag-active');
  _drag = null;
}

// ── Cycle detection ───────────────────────────────────────────────────────────
// Returns true if moving draggedFolderId into targetFolderId would create a cycle
// (i.e. targetFolderId is the dragged folder itself, or one of its descendants).

function wouldCycle(draggedId, targetId) {
  if (draggedId === targetId) return true;
  let cur = store.getById(targetId);
  while (cur?.parentId) {
    if (cur.parentId === draggedId) return true;
    cur = store.getById(cur.parentId);
  }
  return false;
}
