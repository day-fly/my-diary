const {test}=require('node:test');const assert=require('node:assert/strict');const {unzipSync,strFromU8}=require('fflate');const {setup,flush,response}=require('./helpers/writer-fixture.cjs');
function fixture(options={}){
 const a=setup({...options,exporter:true});let blob,calls=[],cancelHook;
 const originalFetch=a.w.fetch;
 a.w.URL.createObjectURL=value=>{blob=value;return'blob:download-test';};a.w.HTMLAnchorElement.prototype.click=function(){};
 a.w.fetch=async(url,options={})=>{
  if(url.includes('/git/')||url.includes('/commits/main')){
   calls.push({url,options});if(cancelHook)await cancelHook();
   const privateRepo=url.includes('my-diary-private'),files=privateRepo?a.privateFiles:a.publicFiles,items=[...files].map(([path,file],i)=>({path,file,sha:(privateRepo?'private':'public')+'-'+i}));
   if(url.includes('/commits/'))return response({sha:'snapshot-commit',commit:{tree:{sha:'snapshot-tree'}}});
   if(url.includes('/git/trees/'))return response({truncated:!!a.truncated,tree:items.map(({path,file,sha})=>({path,sha,type:'blob',size:file.buffer.length}))});
   const item=items.find(item=>url.endsWith('/'+item.sha));if(!item)return response({},404);return{ok:true,status:200,arrayBuffer:async()=>item.file.buffer.buffer.slice(item.file.buffer.byteOffset,item.file.buffer.byteOffset+item.file.buffer.byteLength)};
  }
  return originalFetch(url,options);
 };
 return Object.assign(a,{calls,blob:()=>blob,block:fn=>cancelHook=fn,unzip:async()=>unzipSync(new Uint8Array(await blob.arrayBuffer()))});
}
test('public export contains exact originals, portable images, readable HTML, and no credentials or private files',async()=>{
 const a=fixture({publicPost:'---\ntitle: "사진 글"\ncover: "/assets/photos/one.jpg"\n---\n\n첫 줄\n둘째 줄\n\n![사진]({{ "/assets/photos/one.jpg" | relative_url }})\n'});a.put(a.publicFiles,'assets/photos/one.jpg','photo-data');await flush();a.el('start-export').click();await flush();assert.match(a.el('export-status').textContent,/1편/);const z=await a.unzip();assert.equal(strFromU8(z['public/assets/photos/one.jpg']),'photo-data');const text=strFromU8(z['public/posts/2026-01-01-test.md']);assert.match(text,/!\[사진\]\(\.\.\/assets\/photos\/one.jpg\)/);assert.doesNotMatch(text,/\.\.\.\.\/|relative_url/);assert.match(strFromU8(z['public/posts/2026-01-01-test.html']),/첫 줄<br>\n둘째 줄/);assert.equal(strFromU8(z['public/originals/2026-01-01-test.md']),a.publicFiles.values().next().value.buffer.toString());assert.ok(!Object.keys(z).some(k=>k.startsWith('private/')));assert.doesNotMatch(Object.values(z).map(strFromU8).join(''),/test-private-token/);assert.ok(a.calls.every(c=>c.url.startsWith('https://api.github.com/repos/day-fly/')));assert.equal(a.writes.length,0);a.close();
});
test('private export is opt-in, verifies the vault, and keeps private files in a separate folder',async()=>{
 const a=fixture({privatePost:'---\ntitle: "나만의 사진"\n---\n\n![비공개](diary-private:/assets/photos/secret.jpg)\n'});a.put(a.privateFiles,'assets/photos/secret.jpg','private-bytes');await flush();a.el('export-private').checked=true;a.el('start-export').click();await flush();const z=await a.unzip();assert.ok(z['private/posts/2026-01-01-test.md']);assert.equal(strFromU8(z['private/assets/photos/secret.jpg']),'private-bytes');assert.doesNotMatch(strFromU8(z['private/posts/2026-01-01-test.md']),/diary-private:/);assert.ok(a.requests.some(r=>r.url==='https://api.github.com/repos/day-fly/my-diary-private'));assert.match(a.el('download-export').download,/비공개포함/);a.close();
});
test('unavailable private storage, missing photos, and incomplete trees never produce a misleading archive',async()=>{
 for(const kind of ['vault','photo','tree']){const a=fixture({vaultState:kind==='vault'?'public':'private',publicPost:kind==='photo'?'---\ntitle: "사진"\n---\n![없음](/assets/photos/missing.jpg)\n':undefined});await flush();if(kind==='vault')a.el('export-private').checked=true;if(kind==='tree')a.truncated=true;a.el('start-export').click();await flush();assert.equal(a.blob(),undefined,kind);assert.equal(a.el('download-export').hidden,true);assert.match(a.el('export-status').textContent,/비공개|사진|목록/);a.close();}
});
test('canceling or logging out during an export produces no download',async()=>{for(const logout of [false,true]){const a=fixture();await flush();let release;a.block(()=>new Promise(r=>release=r));a.el('start-export').click();await flush();if(logout)a.w.DiaryAuth.logout();else a.el('cancel-export').click();a.block(null);release();await flush();assert.equal(a.blob(),undefined);assert.equal(a.el('download-export').hidden,true);a.close();}});
test('external images are listed without sending the login key to their hosts',async()=>{const a=fixture({publicPost:'---\ntitle: "외부 사진"\n---\n![링크](https://outside.test/photo.jpg)\n'});await flush();a.el('start-export').click();await flush();const z=await a.unzip(),manifest=JSON.parse(strFromU8(z['manifest.json']));assert.equal(manifest.externalImages.length,1);assert.ok(a.calls.every(c=>!c.url.includes('outside.test')));assert.doesNotMatch(strFromU8(z['public/posts/2026-01-01-test.html']),/<img/);a.close();});

test('a failed second export never leaves an old private download presented as the new result',async()=>{const a=fixture({privatePost:'---\ntitle: "개인 기록"\n---\n비공개 문장\n'});await flush();a.el('export-private').checked=true;a.el('start-export').click();await flush();assert.equal(a.el('download-export').hidden,false);a.truncated=true;a.el('export-private').checked=false;a.el('start-export').click();await flush();assert.equal(a.el('download-export').hidden,true);assert.equal(a.el('download-export').getAttribute('href'),null);a.close();});
