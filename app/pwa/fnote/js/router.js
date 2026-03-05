const ROUTES = [
  { name: 'home',   pattern: /^#?\/?$/ },
  { name: 'folder', pattern: /^#\/folder\/([^/]+)$/ },
  { name: 'note',   pattern: /^#\/note\/([^/]+)$/ },
];

let currentHandler = null;

export function onRoute(handler) {
  currentHandler = handler;
}

export function navigate(hash) {
  location.hash = hash;
}

function resolve() {
  const hash = location.hash || '#/';
  for (const route of ROUTES) {
    const match = hash.match(route.pattern);
    if (match) {
      currentHandler?.({ name: route.name, params: match.slice(1) });
      return;
    }
  }
  currentHandler?.({ name: 'home', params: [] });
}

export function init() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
