import * as store from './store.js';
import { navigate } from './router.js';
import { formatShortDate, stripHtml } from './utils.js';
import { modalChoice, modalPrompt, modalConfirm, showModal } from './modal.js';

const gridEl = document.getElementById('card-grid');
const breadcrumbsEl = document.getElementById('breadcrumbs');

export function renderHome(parentId) {
  renderBreadcrumbs(parentId);
  renderCards(parentId);
}

function renderBreadcrumbs(parentId) {
  breadcrumbsEl.innerHTML = '';
  if (!parentId) return;

  const crumbs = store.getBreadcrumbs(parentId);

  const homeLink = document.createElement('a');
  homeLink.textContent = 'Home';
  homeLink.addEventListener('click', () => navigate('#/'));
  breadcrumbsEl.appendChild(homeLink);

  crumbs.forEach((crumb, i) => {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '›';
    breadcrumbsEl.appendChild(sep);

    const isLast = i === crumbs.length - 1;
    if (isLast) {
      const span = document.createElement('span');
      span.className = 'current';
      span.textContent = crumb.title || 'Untitled';
      breadcrumbsEl.appendChild(span);
    } else {
      const link = document.createElement('a');
      link.textContent = crumb.title || 'Untitled';
      link.addEventListener('click', () => navigate(`#/folder/${crumb.id}`));
      breadcrumbsEl.appendChild(link);
    }
  });
}

function renderCards(parentId) {
  gridEl.innerHTML = '';

  // New Note card
  const newCard = document.createElement('div');
  newCard.className = 'card card-new';
  newCard.innerHTML = '<span class="card-icon">+</span><span class="card-label">New Note</span>';
  newCard.addEventListener('click', () => handleNewNote(parentId));
  gridEl.appendChild(newCard);

  // Existing items
  const children = store.getChildren(parentId);
  children.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';

    if (item.type === 'folder') {
      const icon = document.createElement('div');
      icon.className = 'card-folder-icon';
      icon.textContent = '\uD83D\uDCC1';
      card.appendChild(icon);

      // Edit icon — opens rename/delete panel
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
    if (item.title) {
      title.textContent = item.title;
    } else if (item.content) {
      const text = stripHtml(item.content).trim();
      title.textContent = text.slice(0, 40) || 'Untitled';
    } else {
      title.textContent = 'Untitled';
    }
    card.appendChild(title);

    const date = document.createElement('div');
    date.className = 'card-date';
    date.textContent = formatShortDate(item.updatedAt);
    card.appendChild(date);

    card.addEventListener('click', () => {
      if (item.type === 'folder') {
        navigate(`#/folder/${item.id}`);
      } else {
        navigate(`#/note/${item.id}`);
      }
    });

    gridEl.appendChild(card);
  });
}

async function handleFolderEdit(folder, parentId) {
  const result = await showModal({
    title: 'Edit Folder',
    inputs: [{ placeholder: 'Folder name', value: folder.title || '' }],
    buttons: [
      { label: 'Cancel', class: 'modal-btn-secondary', value: null },
      { label: 'Delete', class: 'modal-btn-danger',    value: '__delete__' },
      { label: 'Rename', class: 'modal-btn-primary',   value: '__input__' },
    ],
  });

  if (result === '__delete__') {
    const confirmed = await modalConfirm(
      `Delete "${folder.title || 'Untitled'}" and everything inside it?`,
      'Delete Folder'
    );
    if (confirmed) {
      store.remove(folder.id);
      renderHome(parentId);
    }
  } else if (result && result !== null) {
    const newName = result.trim();
    if (newName && newName !== folder.title) {
      folder.title = newName;
      store.save(folder);
      renderHome(parentId);
    }
  }
}

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
