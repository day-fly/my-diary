const { test } = require('node:test');
const assert = require('node:assert/strict');
const {setup,path,original,secret,key,flush,response}=require('./helpers/writer-fixture.cjs');

test('private text is saved only in the private repository and drafts stay out of persistent local storage',async()=>{
  const a=setup();await flush();a.input('post-visibility','private');a.input('post-title','비밀 기록');a.input('post-body','나만 아는 문장');
  assert.equal(a.w.localStorage.getItem(key),null);
  assert.match(a.w.sessionStorage.getItem(key+':private'),/나만 아는 문장/);
  await a.save();assert.equal(a.writes.length,1);assert.equal(a.writes[0].vault,true);
  assert.match(Buffer.from(a.writes[0].data.content,'base64').toString(),/나만 아는 문장/);
  assert.equal(a.publicFiles.get(path).buffer.toString(),original);
  assert.match(a.el('writer-status').textContent,/비공개 저장 완료/);a.close();
});
test('missing access, read-only access, or a public vault fails closed before any write',async()=>{
  for(const vaultState of ['missing','read-only','public']) {
    const a=setup({vaultState});await flush();a.input('post-visibility','private');a.input('post-title','보호할 제목');a.input('post-body','보호할 본문');await a.save();
    assert.equal(a.writes.length,0);assert.match(a.el('writer-status').textContent,/접근|비공개 상태/);assert.equal(a.el('post-body').value,'보호할 본문');a.close();
  }
});
test('moving a public post first saves private content, then removes the exact public revision',async()=>{
  const a=setup();await flush();await a.load();a.input('post-visibility','private');a.input('post-body','비공개로 고친 본문');await a.save();
  assert.deepEqual(a.writes.map(v=>[v.vault,v.method]),[[true,'PUT'],[false,'DELETE']]);
  assert.equal(a.writes[1].data.sha,'original-sha');assert.equal(a.publicFiles.has(path),false);assert.match(a.privateFiles.get(path).buffer.toString(),/비공개로 고친 본문/);a.close();
});
test('a private save failure preserves the public source without deleting it',async()=>{
  const a=setup({failPrivateWrite:true});await flush();await a.load();a.input('post-visibility','private');await a.save();
  assert.equal(a.publicFiles.has(path),true);assert.equal(a.writes.some(v=>v.method==='DELETE'),false);assert.match(a.el('writer-status').textContent,/실패/);a.close();
});
test('an interrupted move truthfully reports still-public status and can safely resume',async()=>{
  const a=setup({failDelete:true});await flush();await a.load();a.input('post-visibility','private');await a.save();
  assert.equal(a.publicFiles.has(path),true);assert.equal(a.privateFiles.has(path),true);assert.match(a.el('writer-status').textContent,/아직 공개되어 있을 수/);
  const targetSha=a.privateFiles.get(path).sha;a.recover();a.input('post-body','재시도한 본문');await a.save();
  assert.equal(a.publicFiles.has(path),false);assert.equal(a.writes[2].data.sha,targetSha);assert.match(a.privateFiles.get(path).buffer.toString(),/재시도한 본문/);a.close();
});
test('concurrent changes and an unrelated existing destination never get overwritten',async()=>{
  const a=setup();await flush();await a.load();a.publicFiles.get(path).sha='changed';a.input('post-visibility','private');await a.save();assert.equal(a.writes.length,0);a.close();
  const b=setup({privatePost:secret});await flush();await b.load();b.input('post-visibility','private');await b.save();assert.equal(b.writes.length,0);assert.equal(b.privateFiles.get(path).buffer.toString(),secret);b.close();
});
test('authors can list, read, edit, and return a private post to public',async()=>{
  const a=setup({publicPost:null,privatePost:secret});await flush();await a.load('private');
  assert.equal(a.el('post-visibility').value,'private');assert.equal(a.el('post-title').value,'나만의 기록');
  assert.match(a.el('post-list').textContent,/\[비공개\] 나만의 기록/);a.el('show-preview').click();assert.match(a.el('preview-body').textContent,/개인적인 문장/);
  a.input('post-body','고친 비공개 문장');await a.save();assert.equal(a.writes[0].vault,true);
  a.input('post-visibility','public');await a.save();assert.equal(a.publicFiles.has(path),true);assert.equal(a.privateFiles.has(path),false);assert.equal(a.el('post-visibility').value,'public');a.close();
});
test('cancelling a visibility change writes nothing',async()=>{
  const a=setup();await flush();await a.load();a.w.confirm=()=>false;a.input('post-visibility','private');await a.save();assert.equal(a.writes.length,0);assert.equal(a.publicFiles.has(path),true);a.close();
});
test('pasted photos stay local until save and private photos never upload to the public repository',async()=>{
  const a=setup();await flush();a.input('post-visibility','private');a.input('post-title','사진과 기록');
  const file=new File([Buffer.from('test-image')],'photo.png',{type:'image/png'});
  const event=new a.w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[{type:file.type,getAsFile:()=>file}]}});
  a.el('post-body').dispatchEvent(event);await flush();assert.equal(a.writes.length,0);assert.match(a.el('post-body').value,/diary-pending:/);assert.match(a.el('preview-body').querySelector('img').src,/^blob:/);
  await a.save();assert.equal(a.writes.every(v=>v.vault),true);assert.equal(a.writes.length,2);const content=Buffer.from(a.writes[1].data.content,'base64').toString();assert.match(content,/diary-private:\/assets\/photos/);assert.doesNotMatch(content,/diary-pending:/);a.close();
});
test('private media uses authenticated API bytes and only becomes public after explicit publication',async()=>{
  const imageRef='diary-private:/assets/photos/secret.png';
  const a=setup({publicPost:null,privatePost:secret+'\n![비공개 사진]('+imageRef+')\n'});
  a.put(a.privateFiles,'assets/photos/secret.png','private-image-bytes');await flush();await a.load('private');
  assert.match(a.el('preview-body').querySelector('img').src,/^blob:/);
  assert.equal(a.requests.some(r=>r.url.includes('raw.githubusercontent.com')),false);
  a.input('post-visibility','public');await a.save();assert.equal(a.writes[0].vault,false);assert.match(a.writes[0].path,/^assets\/photos\//);
  const publicText=a.publicFiles.get(path).buffer.toString();assert.doesNotMatch(publicText,/diary-private:/);assert.match(publicText,/\/assets\/photos\//);a.close();
});
test('local public photos are copied into the vault when a post becomes private',async()=>{
  const a=setup({publicPost:original+"\n![사진]({{ '/assets/photos/old.png' | relative_url }})\n"});a.put(a.publicFiles,'assets/photos/old.png','public-image');await flush();await a.load();a.input('post-visibility','private');await a.save();
  assert.equal(a.writes[0].vault,true);assert.match(a.privateFiles.get(path).buffer.toString(),/diary-private:/);assert.equal(a.publicFiles.has(path),false);a.close();
});
test('logout clears private drafts, rendered content, list entries and image object URLs',async()=>{
  const a=setup({publicPost:null,privatePost:secret});await flush();await a.load('private');
  a.w.DiaryPrivate.stage(new File(['x'],'photo.png',{type:'image/png'}));a.w.DiaryAuth.logout();await flush();
  assert.equal(a.el('post-title').value,'');assert.equal(a.el('post-body').value,'');assert.equal(a.el('preview-body').textContent,'');assert.doesNotMatch(a.el('post-list').textContent,/나만의 기록/);
  assert.equal(a.w.sessionStorage.getItem(key+':private'),null);assert.equal(a.w.localStorage.getItem(key),null);assert.equal(a.objectUrls.size,0);a.close();
});
test('private data arriving after logout cannot repopulate the writer',async()=>{
  const a=setup({privatePost:secret});await flush();a.el('load-posts').click();await flush();
  const fetch=a.w.fetch;let release;a.w.fetch=(url,options)=>url.includes('my-diary-private/contents/_posts/')?new Promise(resolve=>{release=()=>resolve(response({sha:'late',content:Buffer.from(secret).toString('base64')}));}):fetch(url,options);
  a.el('post-list').value='private:'+path;a.el('load-selected-post').click();await flush();a.w.DiaryAuth.logout();release();await flush();
  assert.equal(a.el('post-title').value,'');assert.equal(a.el('post-body').value,'');assert.doesNotMatch(a.el('writer-status').textContent,/나만의 기록/);a.close();
});
test('changing the vault to public mid-upload aborts before private bytes are written',async()=>{
  const a=setup();await flush();a.input('post-visibility','private');a.input('post-title','제목');a.input('post-body','민감한 내용');
  const fetch=a.w.fetch;let checks=0;a.w.fetch=(url,options)=>{if(url==='https://api.github.com/repos/day-fly/my-diary-private'&&++checks===2)a.setRepoState('public');return fetch(url,options);};
  await a.save();assert.equal(a.writes.length,0);assert.match(a.el('writer-status').textContent,/비공개 상태/);a.close();
});

test('deleting a private post targets only its private revision and leaves public posts untouched',async()=>{
  const a=setup({privatePost:secret});await flush();await a.load('private');a.el('delete-post').click();await flush();
  assert.equal(a.writes.length,1);assert.equal(a.writes[0].vault,true);assert.equal(a.writes[0].method,'DELETE');assert.equal(a.writes[0].data.sha,'private-sha');
  assert.equal(a.privateFiles.has(path),false);assert.equal(a.publicFiles.get(path).buffer.toString(),original);a.close();
});
test('a private draft restores in the same tab without becoming public or losing its source revision',async()=>{
  const a=setup({privatePost:secret});await flush();await a.load('private');a.input('post-body','아직 저장하지 않은 문장');
  const draft=JSON.parse(a.w.sessionStorage.getItem(key+':private'));assert.equal(draft.visibility,'private');assert.equal(draft.loadedVisibility,'private');assert.equal(draft.sha,'private-sha');
  assert.equal(a.w.localStorage.getItem(key),null);
  const b=setup({privatePost:secret,privateDraft:draft});await flush();
  assert.equal(b.el('post-visibility').value,'private');assert.equal(b.el('post-body').value,'아직 저장하지 않은 문장');
  await b.save();assert.equal(b.writes[0].vault,true);assert.equal(b.writes[0].data.sha,'private-sha');a.close();b.close();
});

test('retry recovers if the source deletion succeeded but its response was lost',async()=>{
  const a=setup();await flush();await a.load();a.input('post-visibility','private');
  const fetch=a.w.fetch;let lost=false;
  a.w.fetch=async(url,options={})=>{const result=await fetch(url,options);if(options.method==='DELETE'&&!lost){lost=true;throw new TypeError('Connection lost');}return result;};
  await a.save();assert.equal(a.publicFiles.has(path),false);assert.equal(a.privateFiles.has(path),true);assert.match(a.el('writer-status').textContent,/확인하지 못했어요/);
  await a.save();assert.match(a.el('writer-status').textContent,/비공개 저장 완료/);assert.equal(a.writes.filter(v=>v.method==='DELETE').length,1);a.close();
});
