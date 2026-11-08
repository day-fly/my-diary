const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync,statSync,readdirSync,existsSync}=require('node:fs');const {JSDOM}=require('jsdom');
const {setup,flush}=require('./helpers/writer-fixture.cjs');
test('photo buttons reorder and remove body images while preserving every prose paragraph',async()=>{
 const a=setup();await flush();const body='첫 문장\n![하나](/assets/photos/one.jpg)\n중간 문장\n![둘](/assets/photos/two.jpg)\n끝 문장';a.input('post-body',body);
 a.d.querySelector('[aria-label="본문 속 사진 1 · 뒤로"]').click();assert.match(a.el('post-body').value,/two.jpg[\s\S]*중간 문장[\s\S]*one.jpg/);a.d.querySelector('[aria-label="본문 속 사진 1 · 빼기"]').click();assert.doesNotMatch(a.el('post-body').value,/two.jpg/);for(const text of ['첫 문장','중간 문장','끝 문장'])assert.ok(a.el('post-body').value.includes(text));a.close();
});
test('replacing a body photo stages it privately until save and leaves the prose untouched',async()=>{
 const a=setup();await flush();a.input('post-body','문장\n![원래](/assets/photos/one.jpg)\n마지막');const input=a.d.querySelector('#photo-editor input[type=file]');Object.defineProperty(input,'files',{value:[new File(['replacement'],'replacement.jpg',{type:'image/jpeg'})]});input.dispatchEvent(new a.w.Event('change'));assert.match(a.el('post-body').value,/diary-pending:/);assert.equal(a.writes.length,0);assert.match(a.el('post-body').value,/마지막/);a.close();
});
test('cover focal point persists through cloud save and publication',async()=>{
 const a=setup();await flush();a.input('post-title','표지 위치');a.input('post-body','본문');a.input('cover-x','23');a.input('cover-y','78');a.el('save-draft').click();await flush();const draft=JSON.parse([...a.privateFiles].find(([p])=>p.startsWith('_diary_drafts/'))[1].buffer);assert.equal(draft.coverX,23);assert.equal(draft.coverY,78);await a.save();const text=Buffer.from(a.writes.find(w=>!w.vault&&w.path.startsWith('_posts/')).data.content,'base64').toString();assert.match(text,/cover_x: 23/);assert.match(text,/cover_y: 78/);a.close();
});
test('newly uploaded body photos pass through optimization before any upload',async()=>{
 const a=setup();await flush();a.input('post-title','사진 최적화');a.input('post-body','본문');a.w.DiaryPhotoImage={prepare:async()=>new File(['small'],'optimized.jpg',{type:'image/jpeg'})};a.input('post-body','![사진]('+a.w.DiaryPrivate.stage(new File(['large original'],'large.jpg',{type:'image/jpeg'}))+')');await a.save();const upload=a.writes.find(w=>w.path.startsWith('assets/photos/'));assert.equal(Buffer.from(upload.data.content,'base64').toString(),'small');a.close();
});
test('the large photo post uses small responsive files, lazy loading, and reserved image dimensions',()=>{
 const html=readFileSync('_site/2026/11/08/entry-268015/index.html','utf8'),d=new JSDOM(html).window.document;
 const photos=[...d.querySelectorAll('.post-content img')];assert.equal(photos.length,7);let total=0;
 for(const img of photos){assert.equal(img.getAttribute('loading'),'lazy');assert.ok(Number(img.getAttribute('width'))>0);assert.ok(img.srcset.includes('640'));const src=img.getAttribute('src').replace('/my-diary/','');total+=statSync(src).size;}
 const originals=Object.keys(JSON.parse(readFileSync('_data/photos.json','utf8'))).filter(p=>p.includes('entry-268015')&&!p.includes('cover'));const originalBytes=originals.reduce((sum,p)=>sum+statSync(p.slice(1)).size,0);assert.ok(total<originalBytes*.1,`photos should be at least 90% smaller: ${total} / ${originalBytes}`);
});
test('public share metadata has absolute image and canonical URLs; writer is excluded from indexing',()=>{
 const post=new JSDOM(readFileSync('_site/2026/11/08/entry-268015/index.html','utf8')).window.document;
 assert.equal(post.querySelector('[property="og:title"]').content,'꾸이');assert.equal(post.querySelector('[property="og:type"]').content,'article');assert.match(post.querySelector('[property="og:image"]').content,/^https:\/\/day-fly.github.io\/my-diary\/assets\//);assert.match(post.querySelector('[property="og:description"]').content,/너구리/);assert.doesNotMatch(post.querySelector('[rel="canonical"]').href,/\?/);
 const writer=new JSDOM(readFileSync('_site/write/index.html','utf8')).window.document;assert.equal(writer.querySelector('[name="robots"]').content,'noindex,nofollow');
});

test('selected gallery photos retain their edited order when saved and opened on another device',async()=>{
 const a=setup();await flush();a.input('post-title','사진 순서');a.input('post-body','본문 문장');
 const input=a.el('gallery-images');let selected=[new File(['one'],'one.jpg',{type:'image/jpeg'}),new File(['two'],'two.jpg',{type:'image/jpeg'})];
 Object.defineProperty(input,'files',{get:()=>selected});Object.defineProperty(input,'value',{get:()=>'',set:()=>{selected=[];}});
 input.dispatchEvent(new a.w.Event('change'));assert.equal(a.d.querySelectorAll('#photo-editor img').length,2);
 a.d.querySelector('[aria-label="추가한 사진 1 · 뒤로"]').click();a.el('save-draft').click();await flush();
 const saved=JSON.parse([...a.privateFiles].find(([p])=>p.startsWith('_diary_drafts/'))[1].buffer);
 const firstPath=saved.galleryRefs[0].replace('diary-private:/','');assert.equal(a.privateFiles.get(firstPath).buffer.toString(),'two');
 const b=setup({stores:a});await flush();b.el('load-posts').click();await flush();b.d.querySelector('[aria-label="사진 순서 · 이어 쓰기"]').click();await flush();
 assert.equal(b.d.querySelectorAll('#photo-editor img').length,2);assert.equal(b.el('post-body').value,'본문 문장');await b.save();
 const published=Buffer.from(b.writes.find(w=>!w.vault&&w.path.startsWith('_posts/')).data.content,'base64').toString();assert.doesNotMatch(published,/diary-pending:|diary-private:/);a.close();b.close();
});

test('every public page has valid share image URLs without duplicate site paths',()=>{
 let count=0;function check(dir){for(const name of readdirSync(dir)){const path=dir+'/'+name;if(statSync(path).isDirectory()){check(path);continue;}if(!path.endsWith('.html'))continue;count++;
 const d=new JSDOM(readFileSync(path,'utf8')).window.document;for(const selector of ['meta[property="og:image"]','link[rel="canonical"]']){const el=d.querySelector(selector);assert.ok(el,path);const url=new URL(el.content||el.href);assert.ok(!url.pathname.includes('/my-diary/my-diary/'),url.href);if(selector.includes('og:image')&&url.hostname==='day-fly.github.io')assert.ok(existsSync('_site/'+url.pathname.replace(/^\/my-diary\//,'')),url.href);}}}check('_site');assert.ok(count>=60);
});
