/* DOM/CSS tree: no animation loop, canvas dependency, or full-size image loads. */
window.ProjectExplorer = (() => {
  const taxonomy = window.PROJECT_TAXONOMY;
  const categories = { all: 'All types', '2d': '2D games', '3d': '3D games', apps: 'Apps' };
  let category = 'all', genre = 'all', model = 'all', lineage = 'all';
  const cameras = {};
  let disposeCamera = () => {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const ascending = (a, b) => (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name);
  const date = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
  function select(label, id, values, active) {
    return `<label class="explorer-select">${label}<select id="${id}">${Object.entries(values).map(([key, text]) => `<option value="${esc(key)}" ${key === active ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  }
  function family(project, byId) {
    let id = project.screenshot;
    const seen = new Set();
    while (taxonomy.entries[id]?.parent && byId.has(taxonomy.entries[id].parent) && !seen.has(id)) {
      seen.add(id); id = taxonomy.entries[id].parent;
    }
    return id;
  }
  function card(project, byId) {
    const meta = taxonomy.get(project), parent = byId.get(meta.parent);
    const status = project.status === 'cancelled' ? 'Cancelled' : project.wip ? 'In progress' : '';
    const visual = meta.visual || (project.desc || '').split(/(?<=[.!?])\s/)[0];
    return `<article class="evolution-card" data-project="${esc(project.screenshot)}">
      <a class="evolution-launch" href="${esc(project.path)}" aria-label="Open ${esc(project.name)}">
        <img src="assets/project-previews/${esc(project.screenshot)}.webp" alt="${esc(project.name)} preview" width="320" height="180" loading="lazy" decoding="async">
        <div class="evolution-copy"><div class="evolution-date">${esc(date(project.date))}${status ? ` · <span class="evolution-status">${status}</span>` : ''}</div>
        <h3>${esc(project.name)}</h3><div class="evolution-credit">${esc(project.creator || 'Creator unknown')}</div>
        <p>${esc(visual)}</p><div class="evolution-tags">${esc([categories[meta.category], ...meta.tags.slice(0,2).map(t => taxonomy.labels[t])].join(' · '))}</div>
        <span class="evolution-open">Open project ↗</span></div></a>
      ${parent ? `<div class="evolution-parent">↳ ${esc(meta.evolution)} from <a href="${esc(parent.path)}">${esc(parent.name)}</a></div>` : ''}
    </article>`;
  }
  function render({ mode, projects, available, container, onChange }) {
    const byId = new Map(available.map(p => [p.screenshot, p]));
    const models = { all: 'All models', ...Object.fromEntries([...new Set(available.map(p => p.creator || 'Creator unknown'))].sort().map(m => [m, m])) };
    const families = { all: 'All projects', ...Object.fromEntries(available.filter(p => available.some(child => taxonomy.get(child).parent === p.screenshot)).sort(ascending).map(p => [p.screenshot, `${p.name} → successors`])) };
    if (!models[model]) model = 'all';
    if (!families[lineage]) lineage = 'all';
    const controls = mode === 'timeline' ? select('Model credit', 'explorer-model', models, model) + select('Version family', 'explorer-lineage', families, lineage) :
      select('High-level type', 'explorer-category', categories, category) + select('Also filter by', 'explorer-genre', { all:'All styles & genres', ...taxonomy.labels }, genre);
    // Type filters apply only to Type; model/family filters apply only to Timeline.
    const visible = projects.filter(p => mode === 'timeline' ?
      (model === 'all' || (p.creator || 'Creator unknown') === model) && (lineage === 'all' || family(p, byId) === lineage) :
      (category === 'all' || taxonomy.get(p).category === category) && (genre === 'all' || taxonomy.get(p).tags.includes(genre))).sort(ascending);
    const title = mode === 'timeline' ? 'The evolution tree' : 'Similar games, through time';
    const subtitle = mode === 'timeline' ? 'Follow model credits, versions and visual changes. Branches group projects by their credited model; arrows identify sequels and rebuilds.' : 'Start with 2D, 3D or Apps. Add a style or genre to trace related projects from the earliest experiments to the latest releases.';
    const months = new Map();
    for (const p of visible) {
      const key = p.date.slice(0,7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(p);
    }
    close();
    const tree = buildTree(months, mode, byId);
    container.innerHTML = `<header class="explorer-intro"><div class="explorer-eyebrow">Y-R-U / PROJECT ATLAS</div><h1>${title}</h1><p>${subtitle}</p></header>
      <div class="explorer-toolbar">${controls}<div class="explorer-result" role="status">${visible.length} projects · oldest → newest</div></div>
      ${visible.length ? `<div class="atlas-shell">
        <div class="atlas-navigation" aria-label="Tree navigation">
          <button type="button" data-camera="out" aria-label="Zoom out">−</button><output class="atlas-zoom" aria-live="polite">100%</output><button type="button" data-camera="in" aria-label="Zoom in">+</button>
          <button type="button" data-camera="fit">Fit width</button><button type="button" data-camera="origin">Origins</button><button type="button" data-camera="latest">Latest</button>
          <label class="atlas-jump">Jump to<select aria-label="Jump to timeline month">${tree.jumps.map(j => `<option value="${j.y}" data-x="${j.x}">${esc(j.label)}</option>`).join('')}</select></label>
        </div>
        <div class="atlas-hint">Drag or swipe to explore · pinch or Ctrl + wheel to zoom · arrow keys to pan</div>
        <div class="atlas-viewport" tabindex="0" role="region" aria-label="Interactive project tree. Use arrow keys to pan, plus or minus to zoom.">
          <div class="atlas-space"><div class="atlas-world" style="width:${tree.width}px;height:${tree.height}px">${tree.html}</div></div>
        </div>
      </div><p class="explorer-footnote">Dates and model credits come from the project registry. Previews show the current graphics of each project, rather than historical snapshots.</p>` : '<div class="explorer-empty">No projects match these filters. Try All months or a broader type.</div>'}`;
    if (visible.length) disposeCamera = mountCamera(container, tree, mode);
    for (const [id, update] of Object.entries({ 'explorer-model': v => model = v, 'explorer-lineage': v => lineage = v, 'explorer-category': v => category = v, 'explorer-genre': v => genre = v })) {
      container.querySelector(`#${id}`)?.addEventListener('change', event => {
        const restoreId = event.target.id;
        update(event.target.value); onChange();
        container.querySelector(`#${restoreId}`)?.focus({ preventScroll:true });
      });
    }
  }
  function buildTree(months, mode, byId) {
    const branchFor = p => mode === 'timeline' ? p.creator || 'Creator unknown' : categories[taxonomy.get(p).category];
    const lanes = [...new Set([...months.values()].flat().map(branchFor))];
    const laneWidth = 330, cardWidth = 280, cardHeight = 332, rowHeight = 362;
    const width = Math.max(700, 250 + lanes.length * laneWidth);
    let y = 140;
    const lines = [], nodes = [], jumps = [], positions = new Map();
    nodes.push(`<div class="atlas-origin" style="left:32px;top:24px">PROJECT ORIGINS<span>↓ time</span></div>`);
    lanes.forEach((label, i) => nodes.push(`<div class="atlas-lane-heading" style="left:${250 + i*laneWidth}px;top:28px;width:${cardWidth}px">${esc(label)}</div>`));
    for (const [key, projects] of months) {
      const label = new Date(`${key}-01T12:00:00`).toLocaleDateString('en-AU', { month:'long', year:'numeric' });
      jumps.push({ y, label, x:250+lanes.indexOf(branchFor(projects[0]))*laneWidth });
      nodes.push(`<div class="atlas-date" style="left:25px;top:${y}px"><strong>${esc(label)}</strong><span>${projects.length} projects</span></div>`);
      lines.push(`<circle cx="105" cy="${y+54}" r="6" class="atlas-dot"/>`);
      let longest = 0;
      lanes.forEach((lane, i) => {
        const branch = projects.filter(p => branchFor(p) === lane);
        if (!branch.length) return;
        longest = Math.max(longest, branch.length);
        const x = 250+i*laneWidth, bus = x-20;
        lines.push(`<path d="M105 ${y+54} H${bus} V${y+120+(branch.length-1)*rowHeight+cardHeight/2}"/>`);
        nodes.push(`<div class="atlas-branch-heading" style="left:${x}px;top:${y+38}px">${esc(lane)} <span>${branch.length}</span></div>`);
        branch.forEach((project, index) => {
          const top = y+120+index*rowHeight;
          lines.push(`<path d="M${bus} ${top+cardHeight/2} H${x}"/><circle cx="${bus}" cy="${top+cardHeight/2}" r="3"/>`);
          positions.set(project.screenshot, { x, y:top });
          nodes.push(`<div class="atlas-project" style="left:${x}px;top:${top}px;width:${cardWidth}px;height:${cardHeight}px">${card(project, byId)}</div>`);
        });
      });
      y += 180 + longest*rowHeight;
    }
    const height = y+40;
    lines.unshift(`<path d="M105 90 V${height-70}" class="atlas-spine"/>`);
    // Successor edges are separate from chronological/model branches.
    for (const [id, pos] of positions) {
      const parent = positions.get(taxonomy.entries[id]?.parent);
      if (!parent) continue;
      const sx = parent.x+cardWidth+5, sy = parent.y+cardHeight-16;
      const ex = pos.x+cardWidth+5, ey = pos.y+cardHeight-16;
      lines.push(`<path d="M${sx} ${sy} C${sx+26} ${sy+60},${ex+26} ${ey-60},${ex} ${ey}" class="atlas-successor"/>`);
    }
    return { width, height, jumps, signature:[...positions.keys()].join(','), html:`<svg class="atlas-connectors" width="${width}" height="${height}" aria-hidden="true">${lines.join('')}</svg>${nodes.join('')}` };
  }
  function mountCamera(container, tree, mode) {
    const viewport = container.querySelector('.atlas-viewport'), world = container.querySelector('.atlas-world'), space = container.querySelector('.atlas-space'), output = container.querySelector('.atlas-zoom');
    const previous = cameras[mode]?.signature === tree.signature ? cameras[mode] : null;
    let scale = previous?.scale || (innerWidth < 600 ? .55 : .85);
    let drag = null, moved = false;
    const save = () => cameras[mode] = { scale, left:viewport.scrollLeft, top:viewport.scrollTop, signature:tree.signature };
    const paint = () => {
      world.style.transform = `scale(${scale})`;
      space.style.width = `${tree.width*scale}px`; space.style.height = `${tree.height*scale}px`;
      output.textContent = `${Math.round(scale*100)}%`;
    };
    const zoom = (next, cx=viewport.clientWidth/2, cy=viewport.clientHeight/2) => {
      const wx=(viewport.scrollLeft+cx)/scale, wy=(viewport.scrollTop+cy)/scale;
      scale=Math.max(.04,Math.min(1.6,next)); paint();
      viewport.scrollLeft=wx*scale-cx; viewport.scrollTop=wy*scale-cy; save();
    };
    paint();
    if (previous) { viewport.scrollLeft=previous.left; viewport.scrollTop=previous.top; }
    viewport.addEventListener('scroll',save,{passive:true});
    container.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click',()=>{
      const action=button.dataset.camera;
      if(action==='in') zoom(scale*1.25);
      if(action==='out') zoom(scale/1.25);
      if(action==='fit') { zoom(viewport.clientWidth/tree.width,0,0); viewport.scrollLeft=0; }
      if(action==='origin') { viewport.scrollTop=0; viewport.scrollLeft=0; }
      if(action==='latest') { const last=tree.jumps.at(-1); viewport.scrollTop=last.y*scale; viewport.scrollLeft=Math.max(0,last.x-220)*scale; }
      save();
    }));
    container.querySelector('.atlas-jump select').addEventListener('change',event=>{ viewport.scrollTop=Number(event.target.value)*scale; viewport.scrollLeft=Math.max(0,Number(event.target.selectedOptions[0].dataset.x)-220)*scale; save(); });
    viewport.addEventListener('wheel',event=>{
      if(event.ctrlKey || event.metaKey) {
        event.preventDefault(); const r=viewport.getBoundingClientRect(); zoom(scale*Math.exp(-event.deltaY*.006),event.clientX-r.left,event.clientY-r.top);
      }
    },{passive:false});
    viewport.addEventListener('keydown',event=>{
      if(event.target!==viewport) return;
      const pans={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]};
      if(pans[event.key]) { event.preventDefault(); viewport.scrollBy(...pans[event.key]); }
      if(['+','=','-'].includes(event.key)) { event.preventDefault(); zoom(scale*(event.key==='-' ? .8 : 1.25)); }
    });
    viewport.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='mouse' || event.button!==0) return;
      drag={ x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,id:event.pointerId }; moved=false;
    });
    const move = event => {
      if(!drag || event.pointerId!==drag.id) return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(Math.hypot(dx,dy)>5) { moved=true; viewport.classList.add('is-dragging'); }
      if(moved) { event.preventDefault(); viewport.scrollLeft=drag.left-dx; viewport.scrollTop=drag.top-dy; }
    };
    const up = () => { drag=null; viewport.classList.remove('is-dragging'); };
    window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',up);
    viewport.addEventListener('click',event=>{if(moved){event.preventDefault();event.stopPropagation();moved=false;}},true);
    viewport.addEventListener('dragstart',event=>event.preventDefault());
    let pinch = null;
    viewport.addEventListener('touchstart',event=>{
      if(event.touches.length===2) {
        const [a,b]=event.touches;
        pinch={ distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY), scale };
      }
    },{passive:true});
    viewport.addEventListener('touchmove',event=>{
      if(event.touches.length!==2 || !pinch || !pinch.distance) return;
      event.preventDefault(); const [a,b]=event.touches, r=viewport.getBoundingClientRect();
      zoom(pinch.scale*Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/pinch.distance,(a.clientX+b.clientX)/2-r.left,(a.clientY+b.clientY)/2-r.top);
    },{passive:false});
    viewport.addEventListener('touchend',()=>{pinch=null;},{passive:true});
    const resize = new ResizeObserver(()=>{
      container.style.setProperty('--atlas-sticky-top', `${60+document.getElementById('projects-controls').offsetHeight}px`);
      paint();
    }); resize.observe(viewport);
    return () => { save(); resize.disconnect();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up); };
  }
  function close() { disposeCamera(); disposeCamera = () => {}; }
  return { render, close };
})();
