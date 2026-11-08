(() => {
  'use strict';
  const player=document.querySelector('.music-player'); if(!player)return;
  const key='diary:music:owner:'+player.dataset.base, lockName=key;
  const id=crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random();
  let channel, releaseLock, controller, heartbeat, generation=0, owned=false, onStop=()=>{}, observed=null;
  try { channel=new BroadcastChannel(key); } catch (_) {}
  function read(){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return observed;}}
  function send(type){const event={type,id,time:Date.now()};try{channel?.postMessage(event);}catch(_){}return event;}
  function writeOwner(){const value={id,time:Date.now()}; observed=value;try{localStorage.setItem(key,JSON.stringify(value));}catch(_){} }
  function release(){generation++;owned=false;clearInterval(heartbeat);controller?.abort();controller=null;releaseLock?.();releaseLock=null;try{if(read()?.id===id)localStorage.removeItem(key);}catch(_){} if(observed?.id===id)observed=null;}
  function receive(event){
    if(!event || event.id===id)return;
    if(event.type==='pause'){release();onStop('pause');}
    if(event.type==='claim'){observed={id:event.id,time:event.time};release();onStop('claim');}
    if(event.type==='playing'){observed={id:event.id,time:event.time};}
  }
  if(channel)channel.onmessage=event=>receive(event.data);
  window.addEventListener('storage',event=>{
    if(event.key===key && event.newValue){try{const owner=JSON.parse(event.newValue);if(owner.id!==id){observed=owner;if(owned){release();onStop('claim');}}}catch(_){} }
    if(event.key==='diary:music:playlist:v1:'+player.dataset.base+':preference' && event.newValue){try{if(JSON.parse(event.newValue).enabled===false)receive({type:'pause',id:'preference'});}catch(_){} }
  });
  function request(automatic,granted,blocked){
    release(); const attempt=generation;
    const other=read();
    if(automatic && other && other.id!==id && Date.now()-other.time<20000){blocked();return;}
    if(!automatic){send('claim');writeOwner();}
    function enter(){
      if(attempt!==generation)return;
      owned=true;writeOwner();send('playing');heartbeat=setInterval(()=>{if(owned){writeOwner();send('playing');}},5000);granted();
    }
    if(navigator.locks?.request){
      controller=new AbortController();
      navigator.locks.request(lockName,automatic ? {mode:'exclusive',ifAvailable:true} : {mode:'exclusive',signal:controller.signal},async lock=>{
        if(attempt!==generation)return;
        if(!lock){blocked();return;}
        await new Promise(resolve=>{releaseLock=resolve;enter();});
      }).catch(()=>{if(attempt===generation){release();blocked();}});
    } else {
      // Last claimant wins; storage events and BroadcastChannel stop the previous owner.
      if(automatic){writeOwner();send('claim');}
      enter();
    }
  }
  window.DiaryMusicCoordinator={request,release,onStop(callback){onStop=callback;},pauseAll(){send('pause');release();}};
  window.addEventListener('pagehide',release);
})();
