const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { TextEncoder, TextDecoder } = require('node:util');
const html = readFileSync('_site/write/index.html', 'utf8');
const path = '_posts/2026-01-01-test.md';
const original = '---\ntitle: "공개된 글"\ndate: 2026-01-01 12:00:00 +0900\n---\n\n공개된 본문\n';
const secret = '---\ntitle: "나만의 기록"\ndate: 2026-01-01 12:00:00 +0900\n---\n\n개인적인 문장\n';
const key = 'myDiaryDraftV1:/my-diary:day-fly/my-diary:main';
const flush = async () => { for (let i=0;i<30;i++) await new Promise(resolve => setImmediate(resolve)); };
function response(data, status=200) { return { ok: status<400, status, headers:{get:()=> 'application/json'}, json:async()=>data, text:async()=>JSON.stringify(data) }; }
let revisionCounter = 0;
function setup({ stores, vaultState='private', privatePost, publicPost=original, failPrivateWrite=false, failDelete=false, privateDraft }={}) {
  const dom = new JSDOM(html, { url:'https://example.test/my-diary/write/', runScripts:'outside-only' });
  const w=dom.window, d=w.document;
  Object.assign(w,{ TextEncoder, TextDecoder, AbortController, File, Blob, confirm:()=>true });
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  const objectUrls=new Set(); let serial=0;
  w.URL.createObjectURL=()=>{ const url='blob:test-'+(++serial); objectUrls.add(url); return url; };
  w.URL.revokeObjectURL=url=>objectUrls.delete(url);
  let authenticated=true;
  const info={owner:'day-fly',repo:'my-diary',branch:'main',token:'test-private-token'};
  w.DiaryAuth={ ready:Promise.resolve(), getConnection:()=>authenticated?info:null,
    getState:()=>({status:authenticated?'authenticated':'guest',login:'day-fly'}),
    isAuthorized:value=>authenticated&&value.token===info.token&&value.owner===info.owner&&value.repo===info.repo,
    logout:()=>{authenticated=false;w.dispatchEvent(new w.CustomEvent('diary:auth'));} };
  const publicFiles=stores?.publicFiles || new Map(), privateFiles=stores?.privateFiles || new Map(), writes=[], requests=[];
  function put(files,p,content,sha='original-sha') { files.set(p,{sha,buffer:Buffer.from(content)}); }
  if(publicPost && !stores) put(publicFiles,path,publicPost);
  if(privatePost && !stores) put(privateFiles,path,privatePost,'private-sha');
  let deletionFails=failDelete, privateFails=failPrivateWrite, repoState=vaultState;
  w.fetch=async(url,options={})=>{
    requests.push({url,method:options.method||'GET'});
    if(url.endsWith('/posts.json')) return response(publicPost?[{path,title:'공개된 글',date:'2026.01.01'}]:[]);
    const u=new URL(url); const match=u.pathname.match(/^\/repos\/day-fly\/(my-diary(?:-private)?)(.*)$/);
    if(!match) throw new Error('Unexpected destination: '+url);
    const vault=match[1]==='my-diary-private', files=vault?privateFiles:publicFiles;
    if(!match[2]) {
      if(vault&&repoState==='missing') return response({message:'Not Found'},404);
      return response({private:vault&&repoState!=='public',owner:{login:'day-fly'},permissions:{push:repoState!=='read-only'}});
    }
    const p=decodeURIComponent(match[2].replace(/^\/contents\//,''));
    if(options.method==='PUT'||options.method==='DELETE') {
      const data=JSON.parse(options.body); writes.push({vault,path:p,method:options.method,data});
      if(vault&&privateFails) return response({message:'저장 장애'},500);
      if(options.method==='DELETE'&&deletionFails) return response({message:'일시적인 삭제 장애'},500);
      const existing=files.get(p);
      if(existing&&data.sha!==existing.sha) return response({message:'Conflict'},409);
      if(options.method==='DELETE') {files.delete(p);return response({});}
      put(files,p,Buffer.from(data.content,'base64'),'sha-'+(++revisionCounter));
      return response({content:{sha:files.get(p).sha}});
    }
    if(p==='_posts'||p==='_diary_drafts') return response([...files.keys()].filter(file=>file.startsWith(p+'/')).map(file=>({path:file,name:file.split('/').pop(),type:'file',sha:files.get(file).sha})));
    const file=files.get(p);
    if(!file) return response({message:'Not Found'},404);
    if(options.headers?.Accept==='application/vnd.github.raw+json') return {ok:true,status:200,blob:async()=>new Blob([file.buffer])};
    return response({sha:file.sha,content:file.buffer.toString('base64')});
  };
  if(privateDraft) w.sessionStorage.setItem(key+':private',JSON.stringify(privateDraft));
  w.eval(readFileSync('assets/js/cover-image.js','utf8'));
  w.eval(readFileSync('assets/js/private-posts.js','utf8'));
  w.eval(readFileSync('assets/js/writer-library.js','utf8'));
  w.eval(readFileSync('assets/js/writer.js','utf8'));
  const el=id=>d.getElementById(id);
  function input(id,value) {el(id).value=value;el(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
  async function load(visibility='public') {el('load-posts').click();await flush();el('post-list').value=(visibility==='private'?'private:':'')+path;el('load-selected-post').click();await flush();}
  async function save() {el('publish-post').click();await flush();}
  return {w,d,el,input,save,load,info,publicFiles,privateFiles,writes,requests,objectUrls,put,
    recover:()=>{deletionFails=false;privateFails=false;},setRepoState:value=>{repoState=value;},close:()=>w.close()};
}


module.exports={setup,path,original,secret,key,flush,response};
