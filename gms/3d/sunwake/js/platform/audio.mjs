// Synthesized on the first enabling gesture; silent by default, no asset requests.
export function createAudio(){
 let ctx,master,engine,wind,active=false;
 function init(){if(ctx)return;ctx=new AudioContext();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
  engine=ctx.createOscillator();engine.type='sine';engine.frequency.value=44;const gain=ctx.createGain();gain.gain.value=.12;engine.connect(gain).connect(master);engine.start();
  const data=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),a=data.getChannelData(0);let n=0;
  for(let i=0;i<a.length;i++){n=(n+(Math.random()*2-1)*.025)/1.025;a[i]=n;}
  const source=ctx.createBufferSource();source.buffer=data;source.loop=true;wind=ctx.createBiquadFilter();wind.type='lowpass';wind.frequency.value=700;source.connect(wind).connect(master);source.start();
 }
 return {enable(value){active=value;if(value){init();ctx.resume().catch(()=>{});}if(master)master.gain.setTargetAtTime(value?.3:0,ctx.currentTime,.15);},
 pause(value){if(ctx){if(value)ctx.suspend().catch(()=>{});else if(active)ctx.resume().catch(()=>{});}},
 update(speed){if(engine)engine.frequency.setTargetAtTime(38+Math.abs(speed)*9,ctx.currentTime,.2);},
 discover(index){if(!active||!ctx)return;for(let j=0;j<2;j++){const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+j*.22;o.frequency.value=220*2**((index+j*7)/12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.3,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+1.5);o.connect(g).connect(master);o.start(t);o.stop(t+1.6);o.onended=()=>{o.disconnect();g.disconnect();};}}
 };
}
