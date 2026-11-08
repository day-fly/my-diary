const {test}=require('node:test');const assert=require('node:assert/strict');
const {setup,path,original,secret,flush}=require('./helpers/writer-fixture.cjs');
const trash=a=>[...a.privateFiles].filter(([p])=>p.startsWith('_diary_trash/'));
async function openTrash(a){a.el('open-trash').click();await flush();a.el('recovery-list').querySelector('button').click();await flush();}
test('public deletion writes a private recoverable copy first and restoration preserves its URL',async()=>{
 const a=setup();await flush();await a.load();a.el('delete-post').click();await flush();assert.equal(a.publicFiles.has(path),false);assert.equal(trash(a).length,1);assert.equal(a.writes[0].vault,true);assert.equal(a.writes[1].method,'DELETE');
 const record=JSON.parse(trash(a)[0][1].buffer);assert.equal(record.content,original);assert.doesNotMatch(JSON.stringify(record),/test-private-token/);
 await openTrash(a);a.el('restore-record').click();await flush();assert.match(a.publicFiles.get(path).buffer.toString(),/공개된 본문/);assert.match(a.publicFiles.get(path).buffer.toString(),/diary_revision/);assert.equal(trash(a).length,0);a.close();
});
test('private deletion and restoration never writes to public storage',async()=>{
 const a=setup({privatePost:secret});await flush();await a.load('private');a.el('delete-post').click();await flush();await openTrash(a);a.el('restore-record').click();await flush();assert.equal(a.writes.every(w=>w.vault),true);assert.equal(a.privateFiles.get(path).buffer.toString(),secret);a.close();
});
test('draft deletion is recoverable with source revisions, photos, and cover position intact',async()=>{
 const a=setup();await flush();a.input('post-title','보관된 초안');a.input('post-body','본문');a.input('cover-x','27');a.el('save-draft').click();await flush();const draft=[...a.privateFiles].find(([p])=>p.startsWith('_diary_drafts/'));a.d.querySelector('[data-kind="draft"] button:last-child').click();await flush();assert.equal(a.privateFiles.has(draft[0]),false);await openTrash(a);a.el('restore-record').click();await flush();assert.deepEqual(a.privateFiles.get(draft[0]).buffer,draft[1].buffer);a.close();
});
test('unavailable private trash prevents deleting a public post',async()=>{
 const a=setup({vaultState:'missing'});await flush();await a.load();a.el('delete-post').click();await flush();assert.equal(a.publicFiles.get(path).buffer.toString(),original);assert.equal(a.writes.length,0);a.close();
});
test('failed source deletion leaves a safe copy and retry does not multiply trash entries',async()=>{
 const a=setup({failDelete:true});await flush();await a.load();a.el('delete-post').click();await flush();assert.equal(a.publicFiles.has(path),true);assert.equal(trash(a).length,1);a.recover();a.el('delete-post').click();await flush();assert.equal(a.publicFiles.has(path),false);assert.equal(trash(a).length,1);a.close();
});
test('restoration refuses to overwrite a newer post or a changed trash entry',async()=>{
 const a=setup();await flush();await a.load();a.el('delete-post').click();await flush();await openTrash(a);a.put(a.publicFiles,path,'new content','newer');a.el('restore-record').click();await flush();assert.equal(a.publicFiles.get(path).buffer.toString(),'new content');assert.match(a.el('recovery-message').textContent,/덮어쓰지/);assert.equal(trash(a).length,1);a.close();
});
test('canceling public restoration writes nothing and logout clears recovery text',async()=>{
 const a=setup();await flush();await a.load();a.el('delete-post').click();await flush();await openTrash(a);const writes=a.writes.length;a.w.confirm=()=>false;a.el('restore-record').click();await flush();assert.equal(a.writes.length,writes);a.w.DiaryAuth.logout();assert.equal(a.el('recovery-text').value,'');assert.equal(a.el('recovery-panel').hidden,true);a.close();
});
const sha='a'.repeat(40),old='---\ntitle: "이전 제목"\ndate: 2026-01-01 12:00:00 +0900\ncover_x: 24\n---\n\n이전 본문\n';
const history=[{sha,commit:{author:{date:'2026-01-01T03:00:00Z'},message:'Save earlier version'}}];
test('history is previewed and restored into editing without publishing or losing conflict protection',async()=>{
 const a=setup({history,historical:{[sha]:{sha:'old-blob',buffer:Buffer.from(old)}}});await flush();await a.load();a.el('open-history').click();await flush();a.el('recovery-list').querySelector('button').click();await flush();assert.match(a.el('recovery-text').value,/이전 본문/);a.el('restore-record').click();await flush();assert.equal(a.el('post-title').value,'이전 제목');assert.equal(a.el('cover-x').value,'24');assert.equal(a.writes.length,0);await a.save();assert.equal(a.writes.find(w=>w.path===path).data.sha,'original-sha');a.close();
});
test('history restoration detects concurrent changes before replacing the current editor',async()=>{
 const a=setup({history,historical:{[sha]:{sha:'old-blob',buffer:Buffer.from(old)}}});await flush();await a.load();a.el('open-history').click();await flush();a.el('recovery-list').querySelector('button').click();await flush();a.publicFiles.get(path).sha='concurrent';a.el('restore-record').click();await flush();assert.equal(a.el('post-title').value,'공개된 글');assert.match(a.el('recovery-message').textContent,/다른 기기/);a.close();
});
