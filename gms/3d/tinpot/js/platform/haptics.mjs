// A phone in one hand is the whole point, so the game should be felt as well as heard. Wrapped
// in try/catch and feature-checked: Safari has no Vibration API at all, and a failed buzz must
// never be allowed to take a frame down with it.
export function createHaptics(){
 const can=typeof navigator!=='undefined'&&typeof navigator.vibrate==='function';
 let last=0,count=0,enabled=true,armed=false;
 // Chrome logs a console warning for every vibrate() before the first real gesture, which the
 // release gate counts as an error and a player would see in their console. Wait for the tap.
 if(typeof addEventListener==='function')addEventListener('pointerup',()=>{armed=true;},{once:true});
 const allowed=()=>armed&&(typeof navigator==='undefined'||!navigator.userActivation||navigator.userActivation.hasBeenActive);
 const PATTERN={kill:[11],loss:[34,52,90],explosion:[46],alight:[9,24,9],tank:[26,40,70]};
 function buzz(kind,now){const p=PATTERN[kind];if(!p||!enabled||!allowed())return;
  // one buzz per 60 ms, or a busy firefight turns the phone into a doorbell
  if(now-last<60)return;last=now;count++;
  if(can)try{navigator.vibrate(p);}catch{}}
 return {enabled(v){enabled=v;},supported:can,count(){return count;},
  update(w,events,sfxOn){if(!sfxOn)return;const now=(typeof performance!=='undefined'?performance.now():Date.now());
   for(const e of events){
    if(e.type==='death')buzz(e.team==='blue'&&!e.escort?'loss':'kill',now);
    else if(e.type==='explosion')buzz(e.tank?'tank':'explosion',now);
    else if(e.type==='alight'&&e.team==='blue')buzz('alight',now);
   }}};
}
