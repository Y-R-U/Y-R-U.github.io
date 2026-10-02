/* DOM/CSS tree: no animation loop, canvas dependency, or full-size image loads. */
window.ProjectExplorer = (() => {
  const taxonomy = window.PROJECT_TAXONOMY;
  const categories = { all: 'All types', '2d': '2D games', '3d': '3D games', apps: 'Apps' };
  const cameras = {};
  let disposeCamera = () => {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const ascending = (a, b) => (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name);
  const date = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
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
  function render({ mode, projects, available, container, onView, onClose }) {
    const byId = new Map(available.map(p => [p.screenshot, p]));
    const visible = projects.slice().sort(ascending);
    const months = new Map();
    for (const p of visible) {
      const key = p.date.slice(0,7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(p);
    }
    close();
    const tree = buildTree(months, mode, byId);
    container.innerHTML = `<div class="atlas-shell" role="dialog" aria-modal="true" aria-label="${mode === 'timeline' ? 'Project timeline' : 'Projects by type'}">
      <div class="atlas-actions">
        <div class="atlas-switch" aria-label="Graph view">
          <button type="button" data-graph-view="timeline" aria-pressed="${mode === 'timeline'}">Timeline</button>
          <button type="button" data-graph-view="type" aria-pressed="${mode === 'type'}">Type</button>
        </div>
        <button type="button" class="atlas-close" aria-label="Close graph" title="Close graph (Escape)">×</button>
      </div>
      <div class="atlas-viewport" tabindex="0" role="region" aria-label="Horizontal project graph. Drag or swipe to pan, pinch or Ctrl plus wheel to zoom. Arrow keys pan; plus and minus zoom.">
        <div class="atlas-space"><div class="atlas-world" style="width:${tree.width}px;height:${tree.height}px">${tree.html}</div></div>
      </div>
      ${visible.length ? '' : '<div class="atlas-empty">No projects in this selection.</div>'}
    </div>`;
    container.querySelectorAll('[data-graph-view]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.graphView !== mode) onView(button.dataset.graphView);
    }));
    container.querySelector('.atlas-close').addEventListener('click', onClose);
    container.querySelector('.atlas-shell').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const targets = [...container.querySelectorAll('button, a, [tabindex="0"]')];
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    disposeCamera = mountCamera(container, tree, mode);
    container.querySelector('.atlas-viewport').focus({ preventScroll:true });
  }
  function buildTree(months, mode, byId) {
    const branchFor = p => mode === 'timeline' ? p.creator || 'Creator unknown' : categories[taxonomy.get(p).category];
    const cardWidth = 280, cardHeight = 332, columnWidth = 312, rowHeight = 390, spineY = 120;
    let x = 240, height = 650;
    const lines = [], nodes = [], positions = new Map();
    nodes.push(`<div class="atlas-origin" style="left:24px;top:84px">PROJECT ORIGINS<span>time →</span></div>`);
    for (const [key, projects] of months) {
      const label = new Date(`${key}-01T12:00:00`).toLocaleDateString('en-AU', { month:'long', year:'numeric' });
      const branches = new Map();
      for (const project of projects) {
        const label = branchFor(project);
        if (!branches.has(label)) branches.set(label, []);
        branches.get(label).push(project);
      }
      const bus = x+30;
      nodes.push(`<div class="atlas-date" style="left:${x}px;top:65px"><strong>${esc(label)}</strong><span>${projects.length} projects</span></div>`);
      lines.push(`<circle cx="${bus}" cy="${spineY}" r="6" class="atlas-dot"/>`);
      let row = 0, longest = 0;
      for (const [label, branch] of branches) {
        const top = 210+row*rowHeight, center = top+cardHeight/2;
        longest = Math.max(longest, branch.length);
        lines.push(`<path d="M${bus} ${spineY} V${center} H${x+80+(branch.length-1)*columnWidth}"/>`);
        nodes.push(`<div class="atlas-branch-heading" style="left:${x+80}px;top:${top-34}px">${esc(label)} <span>${branch.length}</span></div>`);
        branch.forEach((project, index) => {
          const left = x+80+index*columnWidth;
          lines.push(`<circle cx="${left-12}" cy="${center}" r="3"/>`);
          positions.set(project.screenshot, { x:left, y:top });
          nodes.push(`<div class="atlas-project" style="left:${left}px;top:${top}px;width:${cardWidth}px;height:${cardHeight}px">${card(project, byId)}</div>`);
        });
        height = Math.max(height, top+cardHeight+90); row++;
      }
      x += 180+longest*columnWidth;
    }
    const width = Math.max(1000,x+40);
    lines.unshift(`<path d="M180 ${spineY} H${width-60}" class="atlas-spine"/>`);
    for (const [id, pos] of positions) {
      const parent = positions.get(taxonomy.entries[id]?.parent);
      if (!parent) continue;
      const sx=parent.x+cardWidth/2, sy=parent.y+cardHeight+5, ex=pos.x+cardWidth/2, ey=pos.y+cardHeight+5;
      lines.push(`<path d="M${sx} ${sy} C${sx+60} ${sy+28},${ex-60} ${ey+28},${ex} ${ey}" class="atlas-successor"/>`);
    }
    return { width, height, signature:[...positions.keys()].join(','), html:`<svg class="atlas-connectors" width="${width}" height="${height}" aria-hidden="true">${lines.join('')}</svg>${nodes.join('')}` };
  }
  function mountCamera(container, tree, mode) {
    const viewport = container.querySelector('.atlas-viewport'), world = container.querySelector('.atlas-world'), space = container.querySelector('.atlas-space');
    const previous = cameras[mode]?.signature === tree.signature ? cameras[mode] : null;
    const fitHeight = () => Math.max(.5,Math.min(.95,(viewport.clientHeight-55)/560));
    let responsiveScale = fitHeight();
    let scale = previous ? previous.scale * responsiveScale/(previous.responsiveScale || responsiveScale) : responsiveScale;
    let drag = null, moved = false;
    const save = () => cameras[mode] = { scale, responsiveScale, left:viewport.scrollLeft, top:viewport.scrollTop, signature:tree.signature };
    const paint = () => {
      world.style.transform = `scale(${scale})`;
      space.style.width = `${tree.width*scale}px`; space.style.height = `${tree.height*scale}px`;
      viewport.dataset.zoom = String(scale);
    };
    const zoom = (next, cx=viewport.clientWidth/2, cy=viewport.clientHeight/2) => {
      const wx=(viewport.scrollLeft+cx)/scale, wy=(viewport.scrollTop+cy)/scale;
      scale=Math.max(.04,Math.min(1.6,next)); paint();
      viewport.scrollLeft=wx*scale-cx; viewport.scrollTop=wy*scale-cy; save();
    };
    paint();
    if (previous) { viewport.scrollLeft=previous.left*scale/previous.scale; viewport.scrollTop=previous.top*scale/previous.scale; }
    else { viewport.scrollLeft=215*scale; }
    viewport.addEventListener('scroll',save,{passive:true});
    viewport.addEventListener('wheel',event=>{
      if(event.ctrlKey || event.metaKey) {
        event.preventDefault(); const r=viewport.getBoundingClientRect(); zoom(scale*Math.exp(-event.deltaY*.006),event.clientX-r.left,event.clientY-r.top);
      } else if (!event.deltaX) {
        event.preventDefault(); viewport.scrollLeft += event.deltaY;
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
      const next = fitHeight();
      if (next !== responsiveScale) {
        const ratio = next/responsiveScale; responsiveScale = next;
        zoom(scale*ratio,0,0);
      } else paint();
    }); resize.observe(viewport);
    return () => { save(); resize.disconnect();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up); };
  }
  function close() { disposeCamera(); disposeCamera = () => {}; }
  return { render, close };
})();
