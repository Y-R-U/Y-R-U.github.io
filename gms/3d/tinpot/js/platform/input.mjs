export function bindInput(canvas,send){canvas.addEventListener('pointerdown',e=>{e.preventDefault();send({type:'ground',x:e.clientX,y:e.clientY});});}
