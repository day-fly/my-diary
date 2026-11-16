const {test}=require('node:test');const assert=require('node:assert/strict');const {IDBFactory}=require('fake-indexeddb');const {setup,flush}=require('./helpers/writer-fixture.cjs');
const settled=async()=>{await new Promise(r=>setTimeout(r,230));await flush();};
const session=a=>Object.fromEntries(Array.from({length:a.w.sessionStorage.length},(_,i)=>{const k=a.w.sessionStorage.key(i);return[k,a.w.sessionStorage.getItem(k)];}));
test('body, gallery, and cover files automatically survive reload without any network upload',async()=>{
 const db=new IDBFactory(),a=setup({localDB:db});await flush();a.input('post-title','사진까지 복원');a.input('post-body','시의 첫 줄\n두 번째 줄\n\n![사진]('+a.w.DiaryPrivate.stage(new File(['body-bytes'],'body.jpg',{type:'image/jpeg'}))+')');
 const gallery=a.el('gallery-images');let photos=[new File(['gallery-bytes'],'gallery.png',{type:'image/png'})];Object.defineProperty(gallery,'files',{get:()=>photos});Object.defineProperty(gallery,'value',{get:()=>'',set:()=>photos=[]});gallery.dispatchEvent(new a.w.Event('change'));
 const cover=new File(['cover-bytes'],'cover.jpg',{type:'image/jpeg'});Object.defineProperty(a.el('cover-image'),'files',{value:[cover]});a.w.DiaryCoverImage.prepare=async file=>({file,width:10,height:10});a.el('cover-image').dispatchEvent(new a.w.Event('change'));await settled();assert.match(a.el('draft-status').textContent,/자동 임시저장 완료/);assert.equal(a.writes.length,0);
 const state=session(a);a.close();const b=setup({localDB:db,localSession:state});await flush();assert.equal(b.el('post-title').value,'사진까지 복원');assert.match(b.el('post-body').value,/첫 줄\n두 번째 줄\n\n/);assert.equal(b.el('photo-editor').querySelectorAll('img').length,2);assert.ok(b.el('preview-cover').querySelector('img').src.startsWith('blob:'));assert.match(b.el('draft-status').textContent,/함께 복원/);
 b.w.DiaryCoverImage.prepare=async file=>({file,width:10,height:10});b.el('save-draft').click();await flush();assert.ok([...b.privateFiles.values()].some(v=>v.buffer.toString()==='body-bytes'));assert.ok([...b.privateFiles.values()].some(v=>v.buffer.toString()==='gallery-bytes'));assert.ok([...b.privateFiles.values()].some(v=>v.buffer.toString()==='cover-bytes'));b.close();
});
test('tabs keep independent snapshots and a newly opened tab can recover the latest one',async()=>{const db=new IDBFactory(),a=setup({localDB:db});await flush();a.input('post-title','첫 탭');a.input('post-body','첫 내용');await settled();const b=setup({localDB:db});await flush();assert.equal(b.el('post-title').value,'첫 탭');b.input('post-title','둘째 탭');b.input('post-body','둘째 내용');await settled();const shared=Object.fromEntries(Array.from({length:b.w.localStorage.length},(_,i)=>{const k=b.w.localStorage.key(i);return[k,b.w.localStorage.getItem(k)];}));const c=setup({localDB:db,localSession:session(a),localValues:shared});await flush();assert.equal(c.el('post-body').value,'첫 내용');a.close();b.close();c.close();});
test('logout removes private local snapshots and photo data, while public snapshots stay separate',async()=>{const db=new IDBFactory(),a=setup({localDB:db});await flush();a.input('post-title','비공개 초안');a.input('post-body','비밀 문장');a.input('post-visibility','private');await settled();a.w.DiaryAuth.logout();await flush();const b=setup({localDB:db});await flush();assert.equal(b.el('post-body').value,'');assert.equal(a.el('post-body').value,'');a.close();b.close();});
test('unavailable local photo storage shows a fallback message and still protects unsaved attachments',async()=>{const a=setup({localDB:{open(){throw new Error('quota');}}});await flush();a.input('post-title','저장 공간 부족');a.input('post-body','![사진]('+a.w.DiaryPrivate.stage(new File(['photo'],'a.jpg',{type:'image/jpeg'}))+')');await settled();assert.match(a.el('draft-status').textContent,/실패/);const event=new a.w.Event('beforeunload',{cancelable:true});a.w.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.match(a.el('post-body').value,/diary-pending:/);a.close();});

test('duplicating a tab does not let two editors overwrite the same local snapshot',async()=>{
 const held=new Set(),locks={async request(name,options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
 const db=new IDBFactory(),a=setup({localDB:db,locks});await flush();a.input('post-title','원래 창');a.input('post-body','원래 글');await settled();
 const b=setup({localDB:db,locks,localSession:session(a)});await flush();assert.notEqual(a.w.DiaryLocalDrafts.tabId,b.w.DiaryLocalDrafts.tabId);assert.equal(b.el('post-body').value,'원래 글');b.input('post-body','복제 창에서만 바꿈');await settled();const record=await a.w.DiaryLocalDrafts.read();assert.equal(record.data.body,'원래 글');a.w.dispatchEvent(new a.w.Event('pagehide'));b.w.dispatchEvent(new b.w.Event('pagehide'));a.close();b.close();
});

const {JSDOM}=require('jsdom'),{readFileSync}=require('node:fs'),{webcrypto}=require('node:crypto');
const {IDBObjectStore}=require('fake-indexeddb');
const dbName='diary-local-drafts-v1:/my-diary/:day-fly/my-diary';
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
function local(db,{tab,subtle=webcrypto.subtle}={}){
 const {window:w}=new JSDOM('<div class="writer-page" data-owner="day-fly" data-repo="my-diary"></div>',{url:'https://example.test/my-diary/write/',runScripts:'outside-only'});
 Object.assign(w,{indexedDB:db,File,Blob,DiaryAuth:{getConnection:()=>({owner:'day-fly'})}});
 Object.defineProperty(w.crypto,'subtle',{value:subtle});
 if(tab)w.sessionStorage.setItem(dbName+':tab',tab);
 w.eval(readFileSync('assets/js/local-drafts.js','utf8'));
 return {api:w.DiaryLocalDrafts,close(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}
async function inspect(db){
 const connection=await req(db.open(dbName));
 const names=Array.from(connection.objectStoreNames),tx=connection.transaction(names,'readonly');
 const entries=await Promise.all(names.map(async name=>[name,await req(tx.objectStore(name).getAll())]));
 connection.close();return Object.fromEntries(entries);
}
async function seedLegacy(db){
 const open=db.open(dbName,1);open.onupgradeneeded=()=>{open.result.createObjectStore('drafts',{keyPath:'id'});open.result.createObjectStore('files',{keyPath:'key'});};
 const connection=await req(open),tx=connection.transaction(['drafts','files'],'readwrite');
 for(let i=1;i<=2;i++){
  const id='legacy-'+i,ref='diary-pending:'+i,key=id+':'+ref,coverKey=id+':cover';
  const data={title:'원래 초안 '+i,body:'사진 '+i,updatedAt:i};
  tx.objectStore('drafts').put({id,data,refs:[key],coverKey,sensitive:false,savedAt:i});
  tx.objectStore('files').put({key,ref,blob:new Blob(['same-old-photo']),name:'본문'+i+'.jpg',type:'image/jpeg',lastModified:i});
  tx.objectStore('files').put({key:coverKey,ref:'cover',blob:new Blob(['same-old-photo']),name:'표지'+i+'.png',type:'image/png',lastModified:10+i});
 }
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});connection.close();
}
test('five tabs share one photo blob while retaining each filename, reference, cover and independent text',async()=>{
 const db=new IDBFactory(),tabs=[];
 for(let i=0;i<5;i++){
  const tab=local(db);tabs.push(tab);await tab.api.read();
  const file=new File([new Uint8Array(1024*1024)],'사진'+i+'.jpg',{type:'image/jpeg',lastModified:i+1});
  await tab.api.write({title:'초안 '+i,body:'서로 다른 글 '+i},[{ref:'diary-pending:'+i,file}],file,false);
 }
 const stored=await inspect(db);assert.equal(stored.drafts.length,5);assert.equal(stored.blobs.length,1);assert.equal(stored.blobs[0].blob.size,1024*1024);
 for(let i=0;i<5;i++){const r=await tabs[i].api.read();assert.equal(r.data.body,'서로 다른 글 '+i);assert.equal(r.files[0].ref,'diary-pending:'+i);assert.equal(r.files[0].file.name,'사진'+i+'.jpg');assert.equal(r.cover.lastModified,i+1);tabs[i].close();}
});
test('upgrading legacy drafts deduplicates existing copies without changing text, cover or file metadata',async()=>{
 const db=new IDBFactory();await seedLegacy(db);const a=local(db,{tab:'legacy-1'}),b=local(db,{tab:'legacy-2'});
 const [one,two]=await Promise.all([a.api.read(),b.api.read()]);assert.equal(one.data.title,'원래 초안 1');assert.equal(two.data.title,'원래 초안 2');assert.equal(one.cover.name,'표지1.png');assert.equal(two.files[0].file.name,'본문2.jpg');assert.equal(await two.cover.text(),'same-old-photo');assert.equal(one.cover.type,'image/png');
 const stored=await inspect(db);assert.equal(stored.files.length,0);assert.equal(stored.blobs.length,1);assert.equal(stored.drafts.length,2);assert.ok(stored.drafts.every(d=>d.format===2));a.close();b.close();
});
test('concurrent saves and replacing one draft keep shared photos until their final reference is removed',async()=>{
 const db=new IDBFactory(),a=local(db),b=local(db),file=new File(['shared'],'a.jpg',{type:'image/jpeg'});
 await Promise.all([a.api.write({body:'첫 글'},[{ref:'a',file}],null,false),b.api.write({body:'다른 글'},[{ref:'b',file}],null,false)]);
 assert.equal((await inspect(db)).blobs.length,1);
 await a.api.write({body:'사진을 뺀 글'},[],null,false);assert.equal((await inspect(db)).blobs.length,1);assert.equal(await (await b.api.read()).files[0].file.text(),'shared');
 await b.api.write({body:'다른 글도 사진을 뺌'},[],null,false);assert.equal((await inspect(db)).blobs.length,0);assert.equal((await inspect(db)).drafts.length,2);a.close();b.close();
});
test('logout removes private-only bytes without removing a photo still used by a public draft',async()=>{
 const db=new IDBFactory(),a=local(db),b=local(db),file=new File(['shared'],'a.jpg'),secret=new File(['private-only'],'b.jpg');
 await a.api.write({body:'공개 초안'},[{ref:'a',file}],null,false);await b.api.write({body:'비공개 초안'},[{ref:'b',file},{ref:'c',file:secret}],null,true);
 await b.api.clearSensitive();const stored=await inspect(db);assert.equal(stored.drafts.length,1);assert.equal(stored.blobs.length,1);assert.equal(await (await a.api.read()).files[0].file.text(),'shared');a.close();b.close();
});
test('a failed migration or atomic save leaves the previous draft and photos recoverable',async()=>{
 const originalPut=IDBObjectStore.prototype.put;let fail=true;
 IDBObjectStore.prototype.put=function(value,...rest){if(fail&&this.name==='blobs')throw new DOMException('No space','QuotaExceededError');return originalPut.call(this,value,...rest);};
 const db=new IDBFactory();await seedLegacy(db);const a=local(db,{tab:'legacy-1'});
 try{
  const legacy=await a.api.read();assert.equal(await legacy.files[0].file.text(),'same-old-photo');let stored=await inspect(db);assert.equal(stored.files.length,4);assert.equal(stored.blobs.length,0);
  fail=false;await a.api.write(legacy.data,legacy.files,legacy.cover,false);
  fail=true;await assert.rejects(a.api.write({body:'저장되지 않은 변경'},[{ref:'new',file:new File(['new-photo'],'new.jpg')}],null,false),/No space/);
  const restored=await a.api.read();assert.equal(restored.data.title,'원래 초안 1');assert.equal(await restored.cover.text(),'same-old-photo');stored=await inspect(db);assert.equal(stored.blobs.length,1);
 }finally{IDBObjectStore.prototype.put=originalPut;a.close();}
});
test('logout during photo hashing cannot recreate a cleared private draft',async()=>{
 const db=new IDBFactory();let release,started;
 const hashing=new Promise(resolve=>started=resolve);
 const a=local(db,{subtle:{digest(...args){started();return new Promise(resolve=>release=()=>webcrypto.subtle.digest(...args).then(resolve));}}});
 const saving=a.api.write({body:'비밀'},[{ref:'x',file:new File(['secret'],'x.jpg')}],null,true);const rejected=assert.rejects(saving,/로그인/);
 await hashing;const clearing=a.api.clearSensitive();release();await rejected;await clearing;const stored=await inspect(db);assert.equal(stored.drafts.length,0);assert.equal(stored.blobs.length,0);a.close();
});
