const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup,path,original,key,flush}=require('./helpers/writer-fixture.cjs');
const draftEntries=a=>[...a.privateFiles].filter(([p])=>p.startsWith('_diary_drafts/'));
const clickSave=async a=>{a.el('save-draft').click();await flush();};
const openDraft=async(a,title)=>{a.el('load-posts').click();await flush();const button=[...a.d.querySelectorAll('.library-row button')].find(b=>b.getAttribute('aria-label')===title+' · 이어 쓰기');assert.ok(button,'draft should be visible');button.click();await flush();};
function addFiles(a) {
  const cover=new File(['cover-bytes'],'cover.jpg',{type:'image/jpeg'});
  const gallery=new File(['gallery-bytes'],'gallery.png',{type:'image/png'});
  a.w.DiaryCoverImage.prepare=async file=>({file,width:1200,height:900});
  Object.defineProperty(a.el('cover-image'),'files',{configurable:true,get(){return this._used?[]:[cover];}});
  Object.defineProperty(a.el('gallery-images'),'files',{configurable:true,get(){return this._used?[]:[gallery];}});
  for(const id of ['cover-image','gallery-images'])Object.defineProperty(a.el(id),'value',{configurable:true,set(){this._used=true;},get(){return '';}});
}
test('private cloud drafts retain cover and gallery photos across two devices without publishing',async()=>{
  const a=setup();await flush();a.input('post-title','이어 쓸 기록');a.input('post-body','보관할 문장');addFiles(a);await clickSave(a);
  const entries=draftEntries(a);assert.equal(entries.length,1);assert.equal(a.writes.every(w=>w.vault),true);
  const data=JSON.parse(entries[0][1].buffer.toString());assert.match(data.cover,/^diary-private:/);assert.equal(data.galleryRefs.length,1);assert.doesNotMatch(JSON.stringify(data),/test-private-token/);
  assert.equal(a.el('cover-image').files.length,0);assert.equal(a.el('gallery-images').files.length,0);assert.equal(a.w.localStorage.getItem(key),null);
  const b=setup({stores:a});await flush();await openDraft(b,'이어 쓸 기록');assert.equal(b.el('post-title').value,'이어 쓸 기록');assert.equal(b.el('post-body').value,'보관할 문장');
  assert.match(b.el('preview-cover').querySelector('img').src,/^blob:/);assert.equal(b.el('photo-editor').querySelectorAll('img').length,1);assert.match(b.el('preview-gallery').querySelector('img').src,/^blob:/);
  assert.equal(b.w.localStorage.getItem(key),null);assert.equal(a.publicFiles.get(path).buffer.toString(),original);a.close();b.close();
});
test('multiple drafts, title search and status filters keep every saved draft accessible',async()=>{
  const a=setup();await flush();a.input('post-title','첫 번째 초안');a.input('post-body','첫 문장');await clickSave(a);
  a.el('new-draft').click();a.input('post-title','두 번째 초안');a.input('post-body','둘째 문장');await clickSave(a);assert.equal(draftEntries(a).length,2);
  a.d.querySelector('[data-library-filter="draft"]').click();assert.equal(a.d.querySelectorAll('.library-row').length,2);
  a.input('library-search','첫 번째');assert.equal(a.d.querySelectorAll('.library-row').length,1);assert.match(a.el('library-list').textContent,/첫 번째 초안/);
  a.d.querySelector('[data-library-filter="public"]').click();assert.equal(a.d.querySelectorAll('.library-row').length,0);a.input('library-search','');assert.equal(a.d.querySelectorAll('.library-row').length,1);a.close();
});
test('cross-device conflicts keep both texts and allow saving a new independent draft',async()=>{
  const a=setup();await flush();a.input('post-title','공동 기기의 초안');a.input('post-body','시작');await clickSave(a);
  const b=setup({stores:a});await flush();await openDraft(b,'공동 기기의 초안');a.input('post-body','폰에서 수정');await clickSave(a);
  b.input('post-body','PC에서 수정');await clickSave(b);assert.match(b.el('writer-status').textContent,/다른 기기에서/);assert.equal(b.el('post-body').value,'PC에서 수정');assert.equal(b.writes.length,0);
  b.el('save-draft-copy').click();await flush();assert.equal(draftEntries(b).length,2);assert.equal([...b.privateFiles.values()].some(v=>v.buffer.toString().includes('폰에서 수정')),true);a.close();b.close();
});
test('publishing a restored photo-only draft includes its gallery, converts paths, and removes only its own draft',async()=>{
  const a=setup();await flush();a.input('post-title','사진으로 남긴 날');addFiles(a);await clickSave(a);
  const b=setup({stores:a});await flush();await openDraft(b,'사진으로 남긴 날');await b.save();
  const publicPosts=b.writes.filter(w=>!w.vault&&w.path.startsWith('_posts/'));assert.equal(publicPosts.length,1);
  const text=Buffer.from(publicPosts[0].data.content,'base64').toString();assert.match(text,/## 사진 기록/);assert.match(text,/relative_url/);assert.doesNotMatch(text,/diary-private:|diary-pending:/);
  assert.equal(b.writes.filter(w=>!w.vault&&w.path.startsWith('assets/photos/')).length,2);assert.equal(draftEntries(b).length,0);assert.equal(a.publicFiles.get(path).buffer.toString(),original);a.close();b.close();
});
test('cloud storage failure or missing permission never sends an unpublished draft to the public repository',async()=>{
  for(const opts of [{vaultState:'missing'},{failPrivateWrite:true}]){
    const a=setup(opts);await flush();a.input('post-title','아직 쓰는 중');a.input('post-body','지킬 문장');await clickSave(a);
    assert.equal(a.writes.some(w=>!w.vault),false);assert.equal(a.el('post-body').value,'지킬 문장');assert.match(a.el('writer-status').textContent,/실패/);a.close();
  }
});
test('publishing fails safely if the original published post changed after its editing draft was saved',async()=>{
  const a=setup();await flush();await a.load();a.input('post-body','다듬을 내용');await clickSave(a);
  const b=setup({stores:a});await flush();await openDraft(b,'공개된 글');b.publicFiles.get(path).sha='other-device';await b.save();assert.equal(b.writes.length,0);assert.match(b.el('writer-status').textContent,/다른 곳에서/);a.close();b.close();
});
test('a stale cloud draft cannot be published over a newer device edit',async()=>{
  const a=setup();await flush();a.input('post-title','함께 이어 쓸 초안');a.input('post-body','처음');await clickSave(a);
  const b=setup({stores:a});await flush();await openDraft(b,'함께 이어 쓸 초안');a.input('post-body','폰에서 쓴 새 문장');await clickSave(a);
  await b.save();assert.equal(b.writes.length,0);assert.match(b.el('writer-status').textContent,/다른 기기에서 임시글이 변경/);assert.equal(draftEntries(b).length,1);a.close();b.close();
});
test('newly selected photos require confirmation before leaving an otherwise saved draft',async()=>{
  const a=setup();await flush();a.input('post-title','보관된 초안');a.input('post-body','본문');await clickSave(a);addFiles(a);
  let confirmations=0;a.w.confirm=()=>{confirmations++;return false;};a.el('new-draft').click();await flush();
  assert.equal(confirmations,1);assert.equal(a.el('post-title').value,'보관된 초안');assert.equal(a.el('gallery-images').files.length,1);a.close();
});
test('library row controls open and change visibility without replacing unsaved writing silently',async()=>{
  const a=setup();await flush();a.el('load-posts').click();await flush();a.input('post-title','저장하지 않은 글');a.input('post-body','잃으면 안 되는 문장');a.w.confirm=()=>false;
  a.d.querySelector('.library-row button').click();await flush();assert.equal(a.el('post-title').value,'저장하지 않은 글');
  a.w.confirm=()=>true;a.d.querySelector('.library-row-actions button:last-child').click();await flush();assert.equal(a.publicFiles.has(path),false);assert.equal(a.privateFiles.has(path),true);a.close();
});
test('cloud drafts survive logout remotely while their text, photos and row titles disappear from the page',async()=>{
  const a=setup();await flush();a.input('post-title','비밀 초안');a.input('post-body','비밀 문장');await clickSave(a);a.w.DiaryAuth.logout();await flush();
  assert.equal(draftEntries(a).length,1);assert.equal(a.el('post-title').value,'');assert.equal(a.el('post-body').value,'');assert.doesNotMatch(a.el('library-list').textContent,/비밀 초안/);assert.equal(a.w.sessionStorage.getItem(key+':private'),null);a.close();
});
test('deleting a cloud draft uses its loaded revision and never deletes a published post',async()=>{
  const a=setup();await flush();a.input('post-title','지울 초안');a.input('post-body','본문');await clickSave(a);const row=a.d.querySelector('.library-row[data-kind="draft"]');row.querySelector('button:last-child').click();await flush();
  assert.equal(draftEntries(a).length,0);assert.equal(a.publicFiles.has(path),true);assert.match(a.el('post-body').value,/본문/);a.close();
});
test('library titles are rendered as text, including markup-like titles',async()=>{
  const a=setup();await flush();a.w.DiaryLibrary.setItems([{kind:'draft',id:'a'.repeat(24),title:'<img src=x onerror=alert(1)>',date:'2026.11.08'}]);
  assert.equal(a.el('library-list').querySelector('img'),null);assert.match(a.el('library-list').textContent,/<img src=x/);a.close();
});
test('management search reads newly saved titles before site deployment and refreshes only changed files',async()=>{
  const a=setup();await flush();const fresh='_posts/2026-11-08-fresh.md';a.put(a.publicFiles,fresh,'---\ntitle: "아직 배포 중인 글"\n---\n\n본문','new-title');
  a.el('load-posts').click();await flush();a.input('library-search','아직 배포 중인');assert.equal(a.d.querySelectorAll('.library-row').length,1);
  const reads=()=>a.requests.filter(r=>r.url.includes('/contents/'+fresh)&&r.method==='GET').length;
  assert.equal(reads(),1);a.el('load-posts').click();await flush();assert.equal(reads(),1);
  a.put(a.publicFiles,fresh,'---\ntitle: "다른 기기에서 고친 제목"\n---\n본문','updated-title');a.el('load-posts').click();await flush();a.input('library-search','다른 기기에서');
  assert.equal(a.d.querySelectorAll('.library-row').length,1);assert.equal(reads(),2);a.close();
});
