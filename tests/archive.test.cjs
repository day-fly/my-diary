const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const html=readFileSync('_site/index.html','utf8');
function setup(query=''){
 const dom=new JSDOM(html,{url:'https://example.test/my-diary/'+query,runScripts:'outside-only'}),w=dom.window;w.eval(readFileSync('assets/js/archive.js','utf8'));
 return{w,d:w.document,visible:()=>[...w.document.querySelectorAll('.post-card')].filter(c=>!c.hidden),close:()=>w.close()};
}
test('year navigation is generated from dates and combines with title and body search',()=>{
 const a=setup();a.d.querySelector('[data-archive-year="2025"]').click();assert.ok(a.visible().length>0);assert.ok(a.visible().every(c=>c.dataset.year==='2025'));
 const field=a.d.getElementById('post-search');field.value='소고기';field.dispatchEvent(new a.w.Event('input'));assert.equal(a.visible().length,1);assert.match(a.visible()[0].textContent,/소고기 무국/);assert.equal(new URL(a.w.location.href).searchParams.get('year'),'2025');assert.equal(new URL(a.w.location.href).searchParams.get('q'),'소고기');a.close();
});
test('shared filter URLs, clearing, and back navigation restore the right records',()=>{
 const a=setup('?year=2024&q=생라면');assert.equal(a.visible().length,1);a.d.getElementById('reset-search').click();assert.equal(a.visible().length,a.d.querySelectorAll('.post-card').length);
 a.w.history.replaceState({},'','?year=2023');a.w.dispatchEvent(new a.w.PopStateEvent('popstate'));assert.ok(a.visible().every(c=>c.dataset.year==='2023'));assert.equal(a.d.querySelector('[data-archive-year="2023"]').getAttribute('aria-pressed'),'true');a.close();
});
test('unknown years and unavailable browser history keep records readable',()=>{
 const a=setup('?year=9999');assert.equal(a.visible().length,a.d.querySelectorAll('.post-card').length);a.w.history.replaceState=()=>{throw Error('blocked');};const input=a.d.getElementById('post-search');input.value='없는 문장 000';input.dispatchEvent(new a.w.Event('input'));assert.equal(a.visible().length,0);assert.equal(a.d.getElementById('search-empty').hidden,false);a.close();
});
