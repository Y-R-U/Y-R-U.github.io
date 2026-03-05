import { initTheme } from './theme.js';
import { onRoute, init as initRouter } from './router.js';
import { renderHome } from './home.js';
import { renderEditor, flushSave } from './editor.js';
import { openSettings } from './settings.js';

const viewHome = document.getElementById('view-home');
const viewEditor = document.getElementById('view-editor');
const settingsBtn = document.getElementById('btn-settings');

let currentView = null;
let currentParentId = null;

function showView(name) {
  if (currentView === 'editor' && name !== 'editor') {
    flushSave();
  }
  viewHome.classList.toggle('active', name === 'home');
  viewEditor.classList.toggle('active', name === 'editor');
  currentView = name;
}

onRoute(({ name, params }) => {
  if (name === 'home') {
    currentParentId = null;
    showView('home');
    renderHome(null);
  } else if (name === 'folder') {
    currentParentId = params[0];
    showView('home');
    renderHome(params[0]);
  } else if (name === 'note') {
    showView('editor');
    renderEditor(params[0]);
  }
});

settingsBtn.addEventListener('click', () => {
  openSettings(() => {
    renderHome(currentParentId);
  });
});

// Init
initTheme();
initRouter();

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
