/**
 * App controller — screen navigation, project open/save, wiring everything together.
 */
const App = (() => {
  const screens = {
    project: document.getElementById('project-screen'),
    config: document.getElementById('config-screen'),
    viewer: document.getElementById('viewer-screen'),
  };

  let currentProjectId = null;

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    if (name === 'viewer') {
      Viewer.start();
    } else {
      Viewer.stop();
    }
    if (name === 'project') {
      ProjectsUI.render();
    }
  }

  function openProject(id) {
    const project = Storage.get(id);
    if (!project) return;
    currentProjectId = id;
    ConfigUI.setProject(id);
    ConfigUI.loadFromConfig(project.config);
    document.getElementById('project-title').textContent = project.name;
    showScreen('config');
  }

  function saveProject() {
    if (!currentProjectId) return;
    const cfg = ConfigUI.readConfig();
    Storage.update(currentProjectId, { config: cfg });
    // Brief save feedback
    const btn = document.getElementById('btn-save');
    btn.textContent = 'Saved!';
    btn.style.borderColor = 'var(--success)';
    setTimeout(() => { btn.textContent = 'Save'; btn.style.borderColor = ''; }, 1200);
  }

  // Navigation buttons
  document.getElementById('btn-back-to-projects').addEventListener('click', () => {
    saveProject();
    currentProjectId = null;
    showScreen('project');
  });

  document.getElementById('btn-toggle-3d').addEventListener('click', () => {
    // Build habitat from current config and show viewer
    const cfg = ConfigUI.readConfig();
    Viewer.buildHabitat(cfg, cfg.roomTypes);
    const proj = Storage.get(currentProjectId);
    document.getElementById('viewer-title').textContent = proj ? proj.name + ' — 3D' : '3D View';
    showScreen('viewer');
  });

  document.getElementById('btn-back-to-config').addEventListener('click', () => {
    showScreen('config');
  });

  // View mode toggles
  document.querySelectorAll('.btn-view-mode').forEach(btn => {
    btn.addEventListener('click', () => Viewer.setMode(btn.dataset.mode));
  });

  // Save button
  document.getElementById('btn-save').addEventListener('click', saveProject);

  // Init — show project screen
  function boot() {
    showScreen('project');
  }

  boot();

  return { openProject, saveProject, showScreen };
})();
