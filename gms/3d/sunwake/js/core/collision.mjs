// Continuous swept-circle shore solver. PLAN §4: the solid shore is a circle,
// never the visual mesh, and motion is swept rather than sampled at 60 Hz.
// Pure — no THREE, no DOM. The Node harness imports this exact file.
export const CONTACT_SKIN=.001;
export const MAX_CONTACTS=4;
// Shore friction is a RATE, not a per-step constant. The old flat .92 was applied
// on every tick of sustained contact — 0.68% of tangential speed left after one
// second at 60 Hz — which glued the hull to any shore it brushed and made the
// second leg of the atlas route unsailable. Keep this as "fraction of tangential
// speed surviving one second of grinding" and scale it by the real step.
export const TANGENT_RETENTION=.45;
export const REFERENCE_DT=1/60;
export const TANGENT_DAMPING=Math.pow(TANGENT_RETENTION,REFERENCE_DT);
export const clearanceRadius=(island,radius)=>island.radius+radius+CONTACT_SKIN;

// How far a centre is inside the *hard* radius. The gate is radius+2.6, so the
// skin is deliberately excluded here: it is headroom, not part of the contract.
export function deepestOverlap(x,z,radius,candidates){
  let worst=0;
  for(const island of candidates){const penetration=island.radius+radius-Math.hypot(x-island.x,z-island.z);if(penetration>worst)worst=penetration;}
  return worst;
}

// PLAN §4.5. Push a centre out to the clearance radius in stable ID order, up
// to eight passes, so one push never leaves the centre inside a neighbour.
export function resolveOverlap(x,z,radius,candidates,out={}){
  out.x=x;out.z=z;out.pushed=0;
  for(let pass=0;pass<8;pass++){
    let moved=false;
    for(const island of candidates){
      const R=clearanceRadius(island,radius),dx=out.x-island.x,dz=out.z-island.z,distance=Math.hypot(dx,dz);
      if(distance>=R)continue;
      // +X for an exactly coincident centre, so a test spawn on the centre is defined.
      const nx=distance>1e-9?dx/distance:1,nz=distance>1e-9?dz/distance:0;
      out.x=island.x+nx*R;out.z=island.z+nz*R;moved=true;out.pushed++;
    }
    if(!moved)break;
  }
  return out;
}

// Earliest entering root of |p+s*d-C| = R for s in [0,1], or null.
// Stable quadratic: the large-magnitude root is computed first, the small one
// divided out of it, so a near-tangent sweep does not lose all its precision.
export function sweepIsland(px,pz,dx,dz,island,radius){
  const R=clearanceRadius(island,radius),ox=px-island.x,oz=pz-island.z;
  const a=dx*dx+dz*dz;if(a<=0)return null;
  const b=2*(ox*dx+oz*dz),c=ox*ox+oz*oz-R*R;
  if(c<=0)return b<0?0:null;               // touching already: contact only if still moving inward
  if(b>=0)return null;                     // moving away from this shore
  const discriminant=b*b-4*a*c;if(discriminant<0)return null;
  const q=-.5*(b-Math.sqrt(discriminant)); // b<0, so this never cancels
  const t=c/q;
  return t>=0&&t<=1?t:null;
}

/**
 * Sweep a circle of `radius` from `position` along `displacement`.
 * `queryIslands(x0,z0,x1,z1,out)` must return every descriptor that could
 * possibly be touched by the whole segment, in stable ID order.
 * Writes {x,z,vx,vz,contacts,island,exhausted,recovered,failed} into `out`.
 */
export function moveCircleSwept(position,displacement,velocity,radius,queryIslands,out={},scratch={},dt=REFERENCE_DT){
  let px=position.x,pz=position.z,dx=displacement.x,dz=displacement.z,vx=velocity.x,vz=velocity.z;
  out.contacts=0;out.exhausted=false;out.recovered=false;out.failed=false;out.island=null;
  if(![px,pz,dx,dz,vx,vz].every(Number.isFinite)){out.x=position.x;out.z=position.z;out.vx=0;out.vz=0;out.failed=true;return out;}
  // PLAN §4.3: a contact projects the remaining displacement along the shore, so
  // the rest of the step can leave the band that was queried for the original
  // segment. Candidates therefore ACCUMULATE over the step: every re-query adds
  // the chunks the new heading crosses, and the final validation still sees
  // every island the whole path could possibly have touched.
  const candidates=scratch.candidates||(scratch.candidates=[]);
  const extra=scratch.extra||(scratch.extra=[]);
  const known=scratch.known||(scratch.known=new Set());
  candidates.length=0;known.clear();
  const gather=(x0,z0,x1,z1)=>{
    queryIslands(x0,z0,x1,z1,extra);
    let added=false;
    for(const island of extra)if(!known.has(island.id)){known.add(island.id);candidates.push(island);added=true;}
    if(added)candidates.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  };
  gather(px,pz,px+dx,pz+dz);
  const push=scratch.push||(scratch.push={}),recheck=scratch.recheck||(scratch.recheck={});
  // 5. Resolve an imported, saved or test overlap before moving at all.
  resolveOverlap(px,pz,radius,candidates,push);px=push.x;pz=push.z;
  let safeX=px,safeZ=pz;
  const damped=scratch.damped||(scratch.damped=new Set());damped.clear();
  const retain=Number.isFinite(dt)&&dt>0?Math.pow(TANGENT_RETENTION,Math.min(dt,.25)):TANGENT_DAMPING;
  for(let contact=0;contact<=MAX_CONTACTS;contact++){
    if(dx===0&&dz===0)break;
    let best=null,bestT=Infinity;
    for(const island of candidates){
      const t=sweepIsland(px,pz,dx,dz,island,radius);if(t===null)continue;
      // Equal-time hits resolve by stable ID, never by query order.
      if(t<bestT-1e-12||(Math.abs(t-bestT)<=1e-12&&best!==null&&island.id<best.id)){bestT=t;best=island;}
    }
    if(best===null){px+=dx;pz+=dz;dx=0;dz=0;break;}
    // 4. Budget exhausted: keep the last verified safe position, drop the rest.
    if(contact===MAX_CONTACTS){out.exhausted=true;px=safeX;pz=safeZ;dx=0;dz=0;break;}
    px+=dx*bestT;pz+=dz*bestT;
    let nx=px-best.x,nz=pz-best.z,distance=Math.hypot(nx,nz);
    if(distance<1e-9){nx=1;nz=0;distance=1;}else{nx/=distance;nz/=distance;}
    // Land exactly on the clearance circle. Advancing by t alone can finish a
    // few ulps inside, and the invariant is asserted at 1e-6.
    const R=clearanceRadius(best,radius);px=best.x+nx*R;pz=best.z+nz*R;safeX=px;safeZ=pz;
    const inwardV=vx*nx+vz*nz;if(inwardV<0){vx-=inwardV*nx;vz-=inwardV*nz;}
    let rx=dx*(1-bestT),rz=dz*(1-bestT);const inwardD=rx*nx+rz*nz;if(inwardD<0){rx-=inwardD*nx;rz-=inwardD*nz;}
    if(!damped.has(best.id)){ // one step's worth of tangential friction, once per island
      damped.add(best.id);
      const vn=vx*nx+vz*nz;vx=(vx-vn*nx)*retain+vn*nx;vz=(vz-vn*nz)*retain+vn*nz;
      const rn=rx*nx+rz*nz;rx=(rx-rn*nx)*retain+rn*nx;rz=(rz-rn*nz)*retain+rn*nz;
    }
    dx=rx;dz=rz;out.contacts++;out.island=best.id;
    gather(px,pz,px+dx,pz+dz);        // the deflected remainder crosses new chunks
  }
  // Validate against every candidate, not only the island that was last hit.
  resolveOverlap(px,pz,radius,candidates,recheck);
  if(recheck.pushed>0){px=recheck.x;pz=recheck.z;out.recovered=true;}
  if(deepestOverlap(px,pz,radius,candidates)>0){px=safeX;pz=safeZ;vx=0;vz=0;out.recovered=true;}
  if(deepestOverlap(px,pz,radius,candidates)>0){resolveOverlap(position.x,position.z,radius,candidates,recheck);px=recheck.x;pz=recheck.z;vx=0;vz=0;out.failed=true;}
  out.x=px;out.z=pz;out.vx=vx;out.vz=vz;return out;
}
