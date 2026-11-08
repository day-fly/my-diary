import {zip, strToU8} from 'fflate';
import MarkdownIt from 'markdown-it';
const md=new MarkdownIt({html:false,breaks:true,linkify:false});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api,controller,generation=0,zipCancel=null,downloadURL=null;
const message=document.getElementById('export-status');
function assert(info,version){window.DiaryPrivate.assert(info);if(version!==generation||controller?.signal.aborted)throw new Error('내려받기를 취소했어요.');}
async function request(info,path,version,raw=false){
 assert(info,version);const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),30000);const cancel=()=>timeout.abort();controller.signal.addEventListener('abort',cancel,{once:true});
 try{const res=await fetch('https://api.github.com/repos/'+encodeURIComponent(info.owner)+'/'+encodeURIComponent(info.repo)+path,{headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',Authorization:'Bearer '+info.token},credentials:'omit',cache:'no-store',signal:timeout.signal});assert(info,version);if(!res.ok)throw new Error('기록을 읽지 못했어요 ('+res.status+'). 연결과 저장소 접근 권한을 확인해 주세요.');const data=raw?new Uint8Array(await res.arrayBuffer()):await res.json();assert(info,version);return data;}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);}
}
async function repository(info,version){
 const commit=await request(info,'/commits/'+encodeURIComponent(info.branch),version);
 const tree=await request(info,'/git/trees/'+commit.commit.tree.sha+'?recursive=1',version);
 if(tree.truncated)throw new Error('기록이 많아 전체 목록을 읽지 못했어요. 불완전한 파일은 내려받지 않았습니다.');
 return {info,revision:commit.sha,files:new Map(tree.tree.filter(f=>f.type==='blob').map(f=>[f.path,f]))};
}
function imageReferences(text){
 const refs=new Set();
 for(const match of text.matchAll(/(?:diary-private:)?(?:https?:\/\/[^\s"'<>)}]+)?\/(?:my-diary\/)?assets\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp|gif|svg)/gi)){
  const value=match[0];if(/^https?:/.test(value)&&!value.startsWith('https://day-fly.github.io/my-diary/'))continue;
  const path=value.slice(value.indexOf('/assets/')+1);if(!path.split('/').includes('..'))refs.add({value,path,private:value.startsWith('diary-private:')});
 }
 return [...refs];
}
function page(title,body){return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;background:#fffefa;color:#303b37;font:17px/1.9 serif}h1{font-size:28px}img{max-width:100%;height:auto}a{color:#4a6253}pre{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{border-left:3px solid #ccc;padding-left:16px}small{color:#737971}</style>'+body+'</html>';}
async function collect(options,info,version){
 const roots=[];let publicRoot;
 if(options.public){publicRoot=await repository(info,version);roots.push({...publicRoot,kind:'public',label:'공개 글'});}
 if(options.private){const privateInfo=await window.DiaryPrivate.check(info);assert(info,version);roots.push({...await repository(privateInfo,version),kind:'private',label:'비공개 글'});}
 const files=Object.create(null),manifest={createdAt:new Date().toISOString(),repositories:[],posts:[],externalImages:[]};let bytes=0,totalPosts=0;
 const add=(path,data)=>{if(files[path])return;bytes+=data.length;if(bytes>200*1024*1024)throw new Error('사진을 포함한 용량이 200MB를 넘어요. 공개 글과 비공개 글을 나누어 내려받아 주세요.');files[path]=[data,{level:/\.(jpe?g|png|webp|gif)$/i.test(path)?0:6}];};
 for(const root of roots){
  manifest.repositories.push({kind:root.kind,revision:root.revision});
  const posts=[...root.files.values()].filter(f=>/^_posts\/[A-Za-z0-9_.-]+\.md$/.test(f.path));
  for(let i=0;i<posts.length;i++){
   assert(info,version);message.textContent=root.label+' '+(i+1)+' / '+posts.length+' · 글과 사진을 모으고 있어요…';
   const file=posts[i],original=new TextDecoder().decode(await request(root.info,'/git/blobs/'+file.sha,version,true)),parsed=api.parse(original),name=file.path.split('/').pop(),title=parsed.data.title||name;
   let portable=original;const localImages=new Map();
   for(const ref of imageReferences(original)){
    let assetRoot=root,asset=root.files.get(ref.path);
    if(!asset&&root.kind==='private'&&!ref.private){publicRoot=publicRoot||await repository(info,version);assetRoot=publicRoot;asset=publicRoot.files.get(ref.path);}
    if(!asset)throw new Error('사진 파일을 찾지 못했어요: '+ref.path+'. 원본을 확인한 뒤 다시 내려받아 주세요.');
    const archivePath=root.kind+'/'+ref.path;
    if(!files[archivePath]){if(asset.size>200*1024*1024-bytes)throw new Error('사진 용량이 너무 커요. 공개·비공개 글을 나누어 내려받아 주세요.');add(archivePath,await request(assetRoot.info,'/git/blobs/'+asset.sha,version,true));}
    const relative='../'+ref.path;localImages.set(ref.value,relative);
   }
   // Replace Liquid wrappers as a whole, then plain URLs, so Markdown opens outside Jekyll.
   const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const alternatives=[...localImages.keys()].sort((a,b)=>b.length-a.length).map(escapePattern);
   const matcher=new RegExp('\\{\\{\\s*[\\"\']([^\\"\']+)[\\"\']\\s*\\|\\s*relative_url\\s*\\}\\}'+(alternatives.length?'|'+alternatives.join('|'):''),'g');
   portable=portable.replace(matcher,(all,liquidURL)=>localImages.get(liquidURL||all)||liquidURL||all);
   const portableParsed=api.parse(portable),cover=portableParsed.data.cover;
   let body=portableParsed.body;
   body=body.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,(all,alt,url)=>{manifest.externalImages.push({post:root.kind+'/posts/'+name,url});return '['+(alt||'외부 사진')+']('+url+')';});
   add(root.kind+'/originals/'+name,strToU8(original));add(root.kind+'/posts/'+name,strToU8(portable));
   const coverHTML=cover?.startsWith('../assets/')?'<img src="'+escape(cover)+'" alt="대표 사진">':'';
   add(root.kind+'/posts/'+name.replace(/\.md$/,'.html'),strToU8(page(title,'<a href="../../index.html">← 기록 목록</a><h1>'+escape(title)+'</h1><small>'+escape(root.label)+' · '+escape(parsed.data.date||'')+'</small>'+coverHTML+md.render(body))));
   manifest.posts.push({title,kind:root.kind,path:file.path,sha:file.sha});totalPosts++;
  }
 }
 if(!totalPosts)throw new Error('선택한 범위에 내려받을 글이 없어요.');
 const list=manifest.posts.map(p=>'<li><a href="'+escape(p.kind+'/posts/'+p.path.split('/').pop().replace(/\.md$/,'.html'))+'">'+escape(p.title)+'</a> <small>'+(p.kind==='private'?'비공개':'공개')+'</small></li>').join('');
 add('index.html',strToU8(page('하루살이의 기록','<h1>하루살이의 기록</h1><p>'+totalPosts+'편 · '+escape(new Date().toLocaleDateString('ko-KR'))+'</p><ul>'+list+'</ul>')));
 add('manifest.json',strToU8(JSON.stringify(manifest,null,2)));
 add('읽어주세요.txt',strToU8('압축을 풀고 index.html을 열면 글과 사진을 함께 읽을 수 있습니다.\npublic: 공개 글 / private: 비공개 글\nposts: 사진 경로를 연결한 문서 / originals: 저장소 원문 / assets: 사진\n로그인 키는 포함하지 않습니다. 비공개 글을 포함했다면 이 파일도 개인적으로 보관해 주세요.\n외부 서비스의 사진은 원래 주소를 유지하며 manifest.json의 externalImages에 기록합니다. 임시글·휴지통·과거 버전은 이 묶음에 포함하지 않습니다.\n'));
 return {files,totalPosts,external:manifest.externalImages.length};
}
async function run(){
 if(api.busy())return;const info=api.info();if(!info)return;
 const options={public:document.getElementById('export-public').checked,private:document.getElementById('export-private').checked};
 if(!options.public&&!options.private){message.textContent='내려받을 글의 공개 범위를 선택해 주세요.';return;}
 if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;const oldLink=document.getElementById('download-export');oldLink.hidden=true;oldLink.removeAttribute('href');
 const version=++generation;controller=new AbortController();api.setBusy(true);const cancel=document.getElementById('cancel-export');cancel.hidden=false;cancel.disabled=false;
 try{
  message.textContent='저장된 기록을 확인하고 있어요…';const data=await collect(options,info,version);assert(info,version);message.textContent='사진과 글을 하나의 파일로 묶고 있어요…';
  const zipped=await new Promise((resolve,reject)=>{const abort=()=>{zipCancel?.();reject(new Error('내려받기를 취소했어요.'));};controller.signal.addEventListener('abort',abort,{once:true});zipCancel=zip(data.files,{level:6},(error,output)=>{controller.signal.removeEventListener('abort',abort);error?reject(error):resolve(output);});});assert(info,version);
  if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=URL.createObjectURL(new Blob([zipped],{type:'application/zip'}));
  const link=document.getElementById('download-export');link.href=downloadURL;link.download='하루살이-기록-'+new Date().toISOString().slice(0,10)+(options.private?'-비공개포함':'')+'.zip';link.hidden=false;link.click();
  message.textContent=data.totalPosts+'편과 사진을 묶었습니다.'+(data.external?' 외부 사진 '+data.external+'개는 원래 주소를 함께 기록했어요.':'')+' 내려받기가 시작되지 않으면 아래 링크를 눌러 주세요.';
 }catch(error){if(version===generation)message.textContent=controller.signal.aborted?'내려받기를 취소했어요.':error.message;}
 finally{zipCancel=null;cancel.hidden=true;api.setBusy(false);}
}
function clear(){generation++;controller?.abort();zipCancel?.();if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;const link=document.getElementById('download-export');if(link){link.removeAttribute('href');link.hidden=true;}if(message)message.textContent='';}
window.DiaryExport={init(bridge){api=bridge;document.getElementById('start-export').addEventListener('click',run);document.getElementById('cancel-export').addEventListener('click',()=>controller?.abort());},clear};
