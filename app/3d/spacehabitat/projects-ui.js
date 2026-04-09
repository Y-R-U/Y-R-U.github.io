/**
 * Project list screen — rendering project cards, new/delete/open actions.
 */
const ProjectsUI = (() => {
  const listEl = document.getElementById('project-list');
  const btnNew = document.getElementById('btn-new-project');

  function render() {
    const projects = Storage.loadAll();
    listEl.innerHTML = '';

    if (projects.length === 0) {
      listEl.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:20px;">No projects yet. Create one to get started.</p>';
      return;
    }

    // Sort newest first
    projects.sort((a, b) => b.modified - a.modified);

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card-info">
          <div class="project-card-name">${escapeHTML(p.name)}</div>
          <div class="project-card-meta">R=${p.config.majorRadius}m &bull; ${formatDate(p.modified)}</div>
        </div>
        <div class="project-card-actions">
          <button class="btn btn-danger btn-delete-project" data-id="${p.id}" title="Delete">&#x2715;</button>
        </div>
      `;
      // Open project on card click (but not on delete button)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-project')) return;
        App.openProject(p.id);
      });
      listEl.appendChild(card);
    });

    // Attach delete handlers
    listEl.querySelectorAll('.btn-delete-project').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const proj = Storage.get(id);
        Modal.show({
          title: 'Delete Project',
          bodyHTML: `<p style="color:var(--text-dim);">Delete <strong>${escapeHTML(proj?.name || '')}</strong>? This cannot be undone.</p>`,
          confirmText: 'Delete',
          onOk() {
            Storage.remove(id);
            Modal.hide();
            render();
          }
        });
      });
    });
  }

  btnNew.addEventListener('click', () => {
    Modal.show({
      title: 'New Project',
      bodyHTML: `<label>Project Name<input type="text" id="inp-project-name" placeholder="e.g. Elysium Station" maxlength="60" autocomplete="off"></label>`,
      confirmText: 'Create',
      onOk() {
        const nameInput = document.getElementById('inp-project-name');
        const name = (nameInput?.value || '').trim();
        if (!name) {
          nameInput.style.borderColor = 'var(--danger)';
          nameInput.focus();
          return;
        }
        const project = Storage.create(name);
        Modal.hide();
        App.openProject(project.id);
      }
    });
  });

  function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return { render };
})();
