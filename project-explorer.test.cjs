// node project-explorer.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'projects.js'),'utf8')+';this.projects=PROJECTS',context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'project-taxonomy.js'),'utf8'),context);
const projects=context.projects.filter(p=>p.type!=='other'), taxonomy=context.window.PROJECT_TAXONOMY;
test('Every registered project has valid discovery metadata and a small preview',()=>{
  for(const p of projects){
    const meta=taxonomy.get(p);
    assert.ok(['2d','3d','apps'].includes(meta.category),p.name);
    assert.ok(meta.tags.length,p.name);
    assert.ok(meta.tags.every(tag=>taxonomy.labels[tag]),p.name);
    const preview=path.join(__dirname,'assets/project-previews',p.screenshot+'.webp');
    assert.ok(fs.statSync(preview).size<40000, p.name+' preview budget');
  }
  for(const id of Object.keys(taxonomy.entries))assert.ok(projects.some(p=>p.screenshot===id),'Stale metadata: '+id);
});
test('Version links have existing parents, chronological order, and no cycles',()=>{
  const byId=new Map(projects.map(p=>[p.screenshot,p]));
  for(const p of projects){
    const seen=new Set([p.screenshot]);let child=p;
    while(taxonomy.get(child).parent){
      const parent=byId.get(taxonomy.get(child).parent);
      assert.ok(parent,'Missing parent for '+child.name);
      assert.ok(parent.date<=child.date,'Parent newer than '+child.name);
      assert.ok(!seen.has(parent.screenshot),'Cycle at '+parent.name);
      seen.add(parent.screenshot);child=parent;
    }
  }
});
