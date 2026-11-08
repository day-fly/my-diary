const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const script=readFileSync('assets/js/publication.js','utf8');
const source='a'.repeat(40),older='b'.repeat(40),newer='c'.repeat(40),path='_posts/2026-01-01-test.md';
const info={owner:'day-fly',repo:'my-diary',branch:'main',token:'test-token'};
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
function setup({saved,manifest={revision:older,posts:[]},status='behind'}={}){
 const dom=new JSDOM(readFileSync('_site/write/index.html','utf8'),{url:'https://example.test/my-diary/write/',runScripts:'outside-only'});
 const w=dom.window;w.AbortController=AbortController;let authorized=true;w.DiaryAuth={isAuthorized:i=>authorized&&i.token===info.token};
 const timers=new Map();let serial=0;w.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;};w.clearTimeout=id=>timers.delete(id);
 Object.defineProperty(w.document,'hidden',{configurable:true,value:false});const requests=[];
 let documentData=manifest,comparison=status;
 w.fetch=async(url,opts)=>{requests.push({url,opts});if(url.startsWith('/my-diary/publication-status.json'))return{ok:true,json:async()=>documentData};if(url.includes('/compare/'))return{ok:true,json:async()=>({status:comparison})};if(url.includes('/commits/main'))return{ok:true,json:async()=>({sha:source})};throw Error('Unexpected URL');};
 if(saved)w.sessionStorage.setItem('diary:publication:v1:day-fly/my-diary',JSON.stringify(saved));
 w.eval(script);
 async function tick(ms){const found=[...timers].find(([,t])=>t.ms===ms);assert.ok(found,'expected a timer for '+ms);timers.delete(found[0]);await found[1].fn();await flush();}
 return{w,requests,timers,tick,panel:w.document.getElementById('publication-status'),message:w.document.getElementById('publication-message'),setManifest:m=>{documentData=m;},setComparison:s=>{comparison=s;},logout:()=>{authorized=false;w.DiaryPublication.stop(true);},close:()=>w.close()};
}
const job={path,commit:source,revision:'post-revision',visibility:'public'};
test('saved and pending states wait for the exact deployed post version; tokens never go to the public site',async()=>{
 const a=setup();a.w.DiaryPublication.start(job,info);assert.equal(a.panel.dataset.state,'saved');await a.tick(500);assert.equal(a.panel.dataset.state,'pending');
 a.setManifest({revision:newer,posts:[{path,revision:'post-revision',url:'/my-diary/2026/01/01/test/'}]});await a.tick(15000);assert.equal(a.panel.dataset.state,'complete');assert.equal(a.w.document.getElementById('publication-link').hidden,false);
 assert.equal(a.requests.filter(r=>r.url.startsWith('/')).every(r=>!r.opts.headers.Authorization),true);assert.doesNotMatch(a.w.sessionStorage.getItem('diary:publication:v1:day-fly/my-diary'),/test-token/);a.close();
});
test('an absent post in an older deployment cannot count as a completed privacy change',async()=>{
 const a=setup();a.w.DiaryPublication.start({...job,visibility:'private'},info);await a.tick(500);assert.equal(a.panel.dataset.state,'pending');
 a.setManifest({revision:source,posts:[]});await a.tick(15000);assert.equal(a.panel.dataset.state,'complete');assert.match(a.message.textContent,/본문에서 글이 내려갔어요/);a.close();
});
test('a newer deployed commit can confirm removal but a later re-publication is reported as changed',async()=>{
 for(const posts of [[],[{path,revision:'later-revision',url:'/my-diary/other/'}]]){
  const a=setup({manifest:{revision:newer,posts},status:'ahead'});a.w.DiaryPublication.start({...job,visibility:'private'},info);await a.tick(500);assert.equal(a.panel.dataset.state,posts.length?'changed':'complete');a.close();
 }
});
test('network failures and delays never claim completion and offer an explicit recheck',async()=>{
 const a=setup({saved:{...job,startedAt:Date.now()-600000,state:'pending'}});a.w.fetch=async()=>{throw Error('offline');};a.w.DiaryPublication.resume(info);await flush();assert.equal(a.panel.dataset.state,'error');assert.equal(a.w.document.getElementById('publication-retry').hidden,false);
 a.w.fetch=async()=>({ok:true,json:async()=>({revision:source,posts:[{path,revision:'post-revision',url:'/my-diary/test/'}]})});a.w.document.getElementById('publication-retry').click();await flush();assert.equal(a.panel.dataset.state,'complete');a.close();
});
test('logout invalidates an in-flight response and clears saved status',async()=>{
 const a=setup();let finish;a.w.fetch=()=>new Promise(r=>{finish=r;});a.w.DiaryPublication.start(job,info);const checking=a.tick(500);await flush();a.logout();finish({ok:true,json:async()=>({revision:source,posts:[{path,revision:'post-revision',url:'/my-diary/test/'}]})});await checking;assert.equal(a.panel.hidden,true);assert.equal(a.w.sessionStorage.getItem('diary:publication:v1:day-fly/my-diary'),null);a.close();
});
test('overlapping checks cannot let an old response undo a completed deployment',async()=>{
 const a=setup();const original=a.w.fetch;let release;a.w.fetch=()=>new Promise(r=>{release=r;});a.w.DiaryPublication.start(job,info);const first=a.tick(500);await flush();
 a.w.fetch=original;a.setManifest({revision:source,posts:[{path,revision:'post-revision',url:'/my-diary/test/'}]});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));await flush();assert.equal(a.panel.dataset.state,'complete');
 release({ok:true,json:async()=>({revision:older,posts:[]})});await first;assert.equal(a.panel.dataset.state,'complete');a.close();
});
test('malformed manifests and unsafe links cannot produce a false verification or external result link',async()=>{
 const a=setup({manifest:{revision:'bad',posts:[]}});a.w.DiaryPublication.start(job,info);await a.tick(500);assert.equal(a.panel.dataset.state,'pending');
 a.setManifest({revision:source,posts:[{path,revision:'post-revision',url:'https://external.example/'}]});await a.tick(15000);assert.equal(a.w.document.getElementById('publication-link').hidden,true);a.close();
});
test('pending publication checks resume after navigating back to the writer',async()=>{
 const a=setup({saved:{...job,state:'pending',startedAt:Date.now()},manifest:{revision:source,posts:[{path,revision:'post-revision',url:'/my-diary/test/'}]}});a.w.DiaryPublication.resume(info);await flush();assert.equal(a.panel.dataset.state,'complete');a.close();
});
