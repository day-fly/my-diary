const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
const {setup,flush,response,key}=require('./helpers/writer-fixture.cjs');
const settle=async()=>{await new Promise(r=>setTimeout(r,240));await flush();};
const values=storage=>Object.fromEntries(Array.from({length:storage.length},(_,i)=>{const key=storage.key(i);return[key,storage.getItem(key)];}));
function shortRequests(a){const schedule=a.w.setTimeout.bind(a.w);a.w.setTimeout=(fn,ms,...args)=>schedule(fn,ms===20000?15:ms,...args);}

test('automatic account rechecks preserve private text and photos during network and server failures, but explicit logout still clears them',async(t)=>{
 const db=new IDBFactory(),a=setup({localDB:db});t.after(()=>a.close());await flush();
 a.input('post-title','기기에만 저장한 비공개 글');const ref=a.w.DiaryPrivate.stage(new File(['photo'],'private.png',{type:'image/png'}));a.input('post-body','비공개 문장\n![]('+ref+')');a.input('post-visibility','private');await settle();
 a.w.sessionStorage.setItem('myDiaryWriterSessionV1',JSON.stringify(a.info));const fetch=a.w.fetch;let failure='';
 a.w.fetch=async(url,options)=>{if(url==='https://api.github.com/user'){if(failure==='network')throw new a.w.TypeError('offline');if(failure)return response({},Number(failure));return response({login:'day-fly'});}return fetch(url,options);};
 a.w.eval(readFileSync('assets/js/author-auth.js','utf8'));await a.w.DiaryAuth.ready;await flush();
 for(const mode of ['network','503','403']){
  failure=mode;await a.w.DiaryAuth.check();await flush();
  assert.equal(a.w.DiaryAuth.getState().temporary,true);assert.equal(a.w.DiaryAuth.getConnection(),null);assert.equal(a.d.querySelector('.writer-workspace').hidden,true);assert.equal(a.el('writer-status').hidden,true);
  assert.equal(a.el('post-title').value,'기기에만 저장한 비공개 글');assert.ok(a.w.DiaryPrivate.url(ref));assert.equal(a.writes.length,0);assert.equal(a.d.querySelector('[data-auth-retry]').hidden,false);
  failure='';a.d.querySelector('[data-auth-retry]').click();await flush();assert.equal(a.d.querySelector('.writer-workspace').hidden,false);
  const restored=await a.w.DiaryLocalDrafts.read();assert.equal(restored.files.length,1);assert.equal(await restored.files[0].file.text(),'photo');
 }
 failure='network';await a.w.DiaryAuth.check();a.w.DiaryAuth.logout();await flush();assert.equal(a.el('post-title').value,'');assert.equal(a.w.DiaryPrivate.url(ref),'');
 failure='';await a.w.DiaryAuth.login(a.info.token);await flush();assert.equal((await a.w.DiaryLocalDrafts.list()).length,0);
});

test('an expired login still locks the workspace and clears private local copies',async(t)=>{
 const a=setup({localDB:new IDBFactory()});t.after(()=>a.close());await flush();a.input('post-title','만료 시 정리');a.input('post-body','private');a.input('post-visibility','private');await settle();
 a.w.sessionStorage.setItem('myDiaryWriterSessionV1',JSON.stringify(a.info));a.w.fetch=async()=>response({},401);a.w.eval(readFileSync('assets/js/author-auth.js','utf8'));await a.w.DiaryAuth.ready;await flush();
 assert.equal(a.w.DiaryAuth.getState().temporary,false);assert.equal(a.el('post-body').value,'');assert.equal(a.d.querySelector('.writer-workspace').hidden,true);
});

test('old closed-tab drafts can be chosen by title; restoring keeps the current text and both sets of photos',async(t)=>{
 const db=new IDBFactory(),first=setup({localDB:db});await flush();first.input('post-title','먼저 닫은 글');first.input('post-body','첫 사진 ![]('+first.w.DiaryPrivate.stage(new File(['old-photo'],'old.png',{type:'image/png'}))+')');await settle();const oldId=first.w.DiaryLocalDrafts.tabId;first.close();
 const a=setup({localDB:db});t.after(()=>a.close());await flush();a.input('post-title','지금 쓰던 글');a.input('post-body','지킬 사진 ![]('+a.w.DiaryPrivate.stage(new File(['new-photo'],'new.png',{type:'image/png'}))+')');await settle();
 a.el('refresh-local-drafts').click();await flush();let rows=[...a.d.querySelectorAll('#local-drafts-list .library-row')];assert.equal(rows.length,2);
 rows.find(row=>row.textContent.includes('먼저 닫은 글')).querySelector('button').click();await flush();
 assert.equal(a.el('post-title').value,'먼저 닫은 글');assert.match(a.el('post-body').value,/첫 사진/);
 const records=await a.w.DiaryLocalDrafts.list(),prior=records.find(r=>r.title==='지금 쓰던 글');assert.ok(prior);assert.notEqual(prior.id,a.w.DiaryLocalDrafts.tabId);
 const current=await a.w.DiaryLocalDrafts.read(),saved=await a.w.DiaryLocalDrafts.read(prior.id);assert.equal(await current.files[0].file.text(),'old-photo');assert.equal(await saved.files[0].file.text(),'new-photo');
 a.input('post-body','복원한 뒤 수정');await settle();assert.match((await a.w.DiaryLocalDrafts.read(oldId)).data.body,/첫 사진/);assert.equal(a.writes.length,0);
});

test('local draft listing escapes titles and cannot be read after logout',async(t)=>{
 const a=setup({localDB:new IDBFactory()});t.after(()=>a.close());await flush();a.input('post-title','<img src=x onerror=alert(1)>');a.input('post-body','body');await settle();a.el('refresh-local-drafts').click();await flush();
 assert.equal(a.el('local-drafts-list').querySelector('img'),null);assert.match(a.el('local-drafts-list').textContent,/<img/);a.w.DiaryAuth.logout();await flush();assert.equal(a.el('local-drafts-list').textContent,'');await assert.rejects(a.w.DiaryLocalDrafts.list(),/로그인/);
});
test('restoration stops without replacing current text when its safety copy cannot be saved',async(t)=>{
 const db=new IDBFactory(),old=setup({localDB:db});await flush();old.input('post-title','복원할 초안');old.input('post-body','old');await settle();old.close();
 const a=setup({localDB:db});t.after(()=>a.close());await flush();a.input('post-title','지켜야 할 초안');a.input('post-body','current');await settle();a.el('refresh-local-drafts').click();await flush();
 a.w.DiaryLocalDrafts.preserve=()=>Promise.reject(new Error('저장 공간 부족'));a.d.querySelector('[aria-label="복원할 초안 · 복원"]').click();await flush();
 assert.equal(a.el('post-title').value,'지켜야 할 초안');assert.equal(a.el('post-body').value,'current');assert.match(a.el('writer-status').textContent,/복원 실패/);assert.equal(a.el('publish-post').disabled,false);
});

test('a stalled fetch or response body releases the editor, offers retry and ignores late results',async(t)=>{
 for(const stallBody of [false,true]){
  const a=setup();t.after(()=>a.close());await flush();shortRequests(a);a.input('post-title','연결 지연');a.input('post-body','보존할 본문');const fetch=a.w.fetch;let finish,signal;
  a.w.fetch=(url,options)=>{if(url.includes('/contents/')){signal=options.signal;return stallBody?Promise.resolve({...response({}),json:()=>new Promise(r=>finish=r)}):new Promise(r=>finish=r);}return fetch(url,options);};
  a.el('publish-post').click();await new Promise(r=>setTimeout(r,40));await flush();assert.equal(signal.aborted,true);assert.equal(a.el('publish-post').disabled,false);assert.equal(a.el('writer-retry').hidden,false);assert.equal(a.el('post-body').value,'보존할 본문');
  finish(stallBody?{}:response({},404));await flush();assert.equal(a.writes.length,0);
  a.w.fetch=fetch;a.el('writer-retry').click();await flush();assert.equal(a.writes.filter(w=>w.method==='PUT'&&w.path.startsWith('_posts/')).length,1);assert.equal(a.el('writer-retry').hidden,true);
 }
});

test('a committed PUT whose response was lost is verified instead of being written twice',async(t)=>{
 for(const kind of ['post','draft']){
  const a=setup();t.after(()=>a.close());await flush();a.input('post-title','한 번만 저장');a.input('post-body','응답만 사라진 문장');const fetch=a.w.fetch;
  a.w.fetch=async(url,options)=>{const result=await fetch(url,options);if(options?.method==='PUT'&&url.includes(kind==='post'?'/contents/_posts/':'/contents/_diary_drafts/'))throw new a.w.TypeError('response lost');return result;};
  a.el(kind==='post'?'publish-post':'save-draft').click();await flush();assert.equal(a.writes.filter(w=>w.method==='PUT'&&w.path.startsWith(kind==='post'?'_posts/':'_diary_drafts/')).length,1);assert.match(a.el('writer-status').className,/status-success/);assert.equal(a.el('writer-retry').hidden,true);
 }
});
test('photo response loss is confirmed using its Git blob hash when inline content is absent',async(t)=>{
 const a=setup({localDB:new IDBFactory()});t.after(()=>a.close());await flush();a.input('post-title','사진 저장 확인');a.input('post-body','![]('+a.w.DiaryPrivate.stage(new File(['photo bytes'],'photo.png',{type:'image/png'}))+')');
 const fetch=a.w.fetch;let photoPath;
 a.w.fetch=async(url,options)=>{
  if(photoPath&&url.includes('/contents/'+photoPath)&&options?.method!=='PUT')return response({sha:a.publicFiles.get(photoPath).sha,content:''});
  const result=await fetch(url,options);
  if(options?.method==='PUT'&&url.includes('/contents/assets/photos/')){
   photoPath=a.writes.at(-1).path;const record=a.publicFiles.get(photoPath);record.sha=require('node:crypto').createHash('sha1').update('blob '+record.buffer.length+'\0').update(record.buffer).digest('hex');throw new a.w.TypeError('lost');
  }return result;
 };
 a.el('publish-post').click();await flush();await settle();assert.match(a.el('writer-status').className,/status-success/);assert.equal(a.writes.filter(w=>w.path.startsWith('assets/photos/')).length,1);
});

test('unconfirmed new posts and cloud drafts reuse their address after reload, including private posts',async(t)=>{
 for(const kind of ['post','private-post','draft']){
  const a=setup();await flush();a.input('post-title','응답 유실 후 복원');a.input('post-body','중복 없이 보관');if(kind==='private-post')a.input('post-visibility','private');const fetch=a.w.fetch;let committed=false,path;
  a.w.fetch=async(url,options)=>{if(committed&&url.includes('/contents/'))throw new a.w.TypeError('offline');const result=await fetch(url,options);if(options?.method==='PUT'&&url.includes(kind==='draft'?'/contents/_diary_drafts/':'/contents/_posts/')){committed=true;path=a.writes.at(-1).path;throw new a.w.TypeError('lost');}return result;};
  a.el(kind==='draft'?'save-draft':'publish-post').click();await flush();assert.equal(a.el('writer-retry').hidden,false);const localValues=values(a.w.localStorage),privateDraft=JSON.parse(a.w.sessionStorage.getItem(key+':private')||'null'),stores={publicFiles:a.publicFiles,privateFiles:a.privateFiles};a.close();
  const b=setup({localValues,privateDraft,stores});t.after(()=>b.close());await flush();b.el(kind==='draft'?'save-draft':'publish-post').click();await flush();assert.match(b.el('writer-status').className,/status-success/);const writes=b.writes.filter(w=>w.method==='PUT'&&w.path.startsWith(kind==='draft'?'_diary_drafts/':'_posts/'));assert.equal(writes.length,1);assert.equal(writes[0].path,path);
 }
});

test('retry never overwrites a different remote edit after an uncertain save',async(t)=>{
 const a=setup();t.after(()=>a.close());await flush();a.input('post-title','충돌 검사');a.input('post-body','local');const fetch=a.w.fetch;let committed=false,path;
 a.w.fetch=async(url,options)=>{if(committed&&url.includes('/contents/'))throw new a.w.TypeError('offline');const result=await fetch(url,options);if(options?.method==='PUT'){committed=true;path=a.writes.at(-1).path;throw new a.w.TypeError('lost');}return result;};
 a.el('publish-post').click();await flush();a.put(a.publicFiles,path,'---\ntitle: "다른 기기 수정"\ndiary_revision: "someone-else"\n---\nremote','remote-new-sha');a.w.fetch=fetch;a.el('writer-retry').click();await flush();assert.match(a.el('writer-status').textContent,/다른 곳에서 수정/);assert.equal(a.writes.length,1);assert.match(a.publicFiles.get(path).buffer.toString(),/remote/);
});
test('explicitly saving a new copy after an uncertain cloud save leaves the earlier copy untouched',async(t)=>{
 const a=setup();t.after(()=>a.close());await flush();a.input('post-title','두 사본');a.input('post-body','첫 내용');const fetch=a.w.fetch;let committed=false,path;
 a.w.fetch=async(url,options)=>{if(committed&&url.includes('/contents/'))throw new a.w.TypeError('offline');const result=await fetch(url,options);if(options?.method==='PUT'){committed=true;path=a.writes.at(-1).path;throw new a.w.TypeError('lost');}return result;};
 a.el('save-draft').click();await flush();const original=a.privateFiles.get(path).buffer.toString();a.w.fetch=fetch;a.input('post-body','새 사본의 내용');a.el('save-draft-copy').click();await flush();
 assert.match(a.el('writer-status').className,/status-success/);assert.equal(a.privateFiles.get(path).buffer.toString(),original);assert.equal([...a.privateFiles.keys()].filter(p=>p.startsWith('_diary_drafts/')).length,2);
});
