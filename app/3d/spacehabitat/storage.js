/**
 * Project storage — localStorage CRUD for habitat projects.
 */
const Storage = (() => {
  const KEY = 'spacehabitat_projects';

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch { return []; }
  }

  function saveAll(projects) {
    localStorage.setItem(KEY, JSON.stringify(projects));
  }

  function create(name) {
    const projects = loadAll();
    const project = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      created: Date.now(),
      modified: Date.now(),
      config: {
        ...Habitat.defaults(),
        moduleSize: { ...Rooms.DEFAULT_MODULE },
        utilityHeight: Rooms.DEFAULT_UTILITY,
        wallThickness: Rooms.DEFAULT_WALL,
        roomTypes: Rooms.defaultTypes(),
      },
    };
    projects.push(project);
    saveAll(projects);
    return project;
  }

  function get(id) {
    return loadAll().find(p => p.id === id) || null;
  }

  function update(id, updates) {
    const projects = loadAll();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    Object.assign(projects[idx], updates, { modified: Date.now() });
    saveAll(projects);
    return projects[idx];
  }

  function remove(id) {
    const projects = loadAll().filter(p => p.id !== id);
    saveAll(projects);
  }

  return { loadAll, create, get, update, remove };
})();
