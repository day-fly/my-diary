const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const prefix=fs.readFileSync('tests/music.test.cjs','utf8').split('test("first visit')[0];
const {setup,key}=new Function('require',prefix+'\nreturn {setup,key};')(require);
const script=fs.readFileSync('assets/js/music-coordinator.js','utf8');
const flush=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
function hub({locks=true,blocked=false}={}){
 const data=new Map(),windows=[],channels=[],held=new Map(),queues=new Map(),tabs=[];
 const manager={request(name,opts,callback){
   if(opts.ifAvailable&&opts.signal)throw new Error('ifAvailable and signal cannot be combined');
   return new Promise((resolve,reject)=>{
    let cancelled=false;
    const grant=()=>{if(cancelled)return;held.set(name,true);Promise.resolve(callback({name})).then(resolve,reject).finally(()=>{held.delete(name);let next;while((next=queues.get(name)?.shift())){if(next())break;}});};
    const wait=()=>{if(cancelled)return false;grant();return true;};
    opts.signal?.addEventListener('abort',()=>{cancelled=true;reject(new Error('aborted'));},{once:true});
    if(held.has(name)){if(opts.ifAvailable){Promise.resolve(callback(null)).then(resolve,reject);}else{if(!queues.has(name))queues.set(name,[]);queues.get(name).push(wait);}}
    else grant();
   });
 }};
 function create(){
  const a=setup({configure(w){
   windows.push(w);
   if(blocked)Object.defineProperty(w,'localStorage',{get(){throw new Error('blocked');}});
   else Object.defineProperty(w,'localStorage',{value:{getItem:k=>data.get(k)||null,setItem(k,v){const old=data.get(k)||null;data.set(k,v);for(const other of windows)if(other!==w)queueMicrotask(()=>other.dispatchEvent(new other.StorageEvent('storage',{key:k,newValue:v,oldValue:old})));},removeItem(k){data.delete(k);}}});
   w.BroadcastChannel=class{constructor(name){this.name=name;channels.push(this);}postMessage(message){for(const ch of channels)if(ch!==this&&ch.name===this.name)queueMicrotask(()=>ch.onmessage?.({data:message}));}close(){this.onmessage=null;}};
   if(locks)Object.defineProperty(w.navigator,'locks',{value:manager});
   w.eval(script);
  }});tabs.push(a);return a;
 }
 function close(){tabs.forEach(a=>{a.w.dispatchEvent(new a.w.Event('pagehide'));a.w.close();});}
 return{create,close,held,data};
}
test('only one tab autoplays, manual play transfers ownership, and pause stops all tabs',async()=>{
 const h=hub(),a=h.create();await flush();a.requests[0].resolve();await flush();const b=h.create();await flush();assert.equal(a.state(),'playing');assert.equal(b.plays(),0);b.click();await flush();assert.equal(a.audio.paused,true);assert.equal(b.plays(),1);b.requests[0].resolve();await flush();b.click();await flush();assert.equal(a.audio.paused,true);assert.equal(b.audio.paused,true);assert.equal(h.data.has('diary:music:owner:/my-diary/'),false);h.close();
});
test('stop-all works from a silent tab and prevents later autoplay',async()=>{
 const h=hub(),a=h.create();await flush();a.requests[0].resolve();await flush();const b=h.create();await flush();b.q('.music-stop-all').click();await flush();assert.equal(a.audio.paused,true);assert.equal(h.create().plays(),0);h.close();
});
test('fallback coordination still transfers playback with storage blocked',async()=>{
 const h=hub({locks:false,blocked:true}),a=h.create();await flush();a.requests[0].resolve();await flush();const b=h.create();await flush();if(b.requests.length)b.requests[0].resolve();await flush();assert.ok(a.audio.paused||b.audio.paused);a.click();await flush();assert.equal(b.audio.paused,true);h.close();
});
test('a failed playback releases ownership for another tab',async()=>{
 const h=hub(),a=h.create();await flush();a.requests[0].reject({name:'NotAllowedError'});await flush();const b=h.create();await flush();assert.equal(b.plays(),1);h.close();
});
test('a canceled pending play cannot restart after a late response or page restoration',async()=>{
 const h=hub(),a=h.create();await flush();a.click();a.requests[0].resolve();await flush();assert.equal(a.audio.paused,true);const b=h.create();await flush();b.q('.music-stop-all').click();await flush();a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow',{persisted:true}));await flush();assert.equal(a.plays(),1);assert.equal(a.audio.paused,true);h.close();
});
