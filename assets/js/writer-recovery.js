(() => {
  'use strict';
  let api, generation=0, selected=null, context=null, page=1;
  const panel=document.getElementById('recovery-panel'),list=document.getElementById('recovery-list'),preview=document.getElementById('recovery-preview'),message=document.getElementById('recovery-message'),more=document.getElementById('history-more');
  if(!panel)return;
  const validPost=p=>typeof p==='string'&&/^_posts\/[A-Za-z0-9_.-]+\.md$/.test(p);
  const validDraft=p=>typeof p==='string'&&/^_diary_drafts\/[a-f0-9]{24}\.json$/.test(p);
  const validTrash=p=>typeof p==='string'&&/^_diary_trash\/[a-z0-9-]{1,120}\.json$/.test(p);
  function check(info,version){window.DiaryPrivate.assert(info);if(version!==generation)throw new Error('화면이 변경되어 작업을 중단했어요. 다시 열어 주세요.');}
  async function target(info,visibility){return visibility==='private'?window.DiaryPrivate.check(info):info;}
  function validate(record){if(!record||record.version!==1||!['public','private'].includes(record.visibility)||typeof record.content!=='string'||!(record.kind==='post'?validPost(record.path):record.kind==='draft'&&record.visibility==='private'&&validDraft(record.path)))throw new Error('휴지통 항목을 읽을 수 없어요.');return record;}
  function identity(record){let hash=2166136261;for(const c of record.path)hash=Math.imul(hash^c.charCodeAt(0),16777619);return record.kind+'-'+record.visibility+'-'+record.sha+'-'+(hash>>>0).toString(16);}
  async function capture(info,record){
    validate({...record,version:1});const version=generation,vault=await window.DiaryPrivate.check(info);check(info,version);
    const path='_diary_trash/'+identity(record)+'.json';if(!validTrash(path))throw new Error('글의 저장 정보를 다시 불러와 주세요.');
    const existing=await api.get(vault,path);check(info,version);
    if(existing){const old=validate(JSON.parse(api.decode(existing.content)));if(old.path!==record.path||old.content!==record.content)throw new Error('휴지통 사본이 달라 삭제를 중단했어요.');return;}
    const text=JSON.stringify({version:1,kind:record.kind,path:record.path,sha:record.sha,title:record.title,visibility:record.visibility,content:record.content,deletedAt:new Date().toISOString()});
    if(new TextEncoder().encode(text).length>900000)throw new Error('글이 너무 길어 휴지통에 보관하지 못했어요. 내용을 따로 보관해 주세요.');
    await api.put(vault,path,null,text,'Move diary item to private trash');check(info,version);
  }
  function show(title){panel.hidden=false;panel.open=true;document.getElementById('recovery-title').textContent=title;list.replaceChildren();preview.hidden=true;selected=null;message.textContent='불러오는 중…';more.hidden=true;panel.scrollIntoView({block:'start',behavior:'smooth'});}
  async function task(action){if(api.busy())return;api.setBusy(true);try{await action();}catch(error){message.textContent=error.message;}finally{api.setBusy(false);}}
  function row(title,date,action){const item=document.createElement('div');item.className='recovery-row';const text=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small'),button=document.createElement('button');name.textContent=title;detail.textContent=date;button.type='button';button.className='btn-light';button.textContent='내용 확인';button.addEventListener('click',()=>task(action));text.append(name,detail);item.append(text,button);list.append(item);}
  function showPreview(record,content,kind){selected={record,content,kind};preview.hidden=false;document.getElementById('recovery-text').value=kind==='draft'?JSON.parse(content).body:api.parse(content).body;const title=kind==='draft'?JSON.parse(content).title:api.parse(content).data.title;document.getElementById('recovery-preview-title').textContent=title||'제목 없는 기록';document.getElementById('restore-record').textContent=record.trashPath?'원래 위치로 복원':'이 내용으로 편집';message.textContent=record.trashPath?'복원하면 원래 공개 범위로 돌아갑니다. 사진도 함께 다시 연결됩니다.':'이전 내용을 편집 화면으로 가져옵니다. 직접 발행하기 전에는 현재 글이 바뀌지 않습니다.';}
  async function trash(){
    const info=api.info();if(!info)return;const version=++generation;context=null;show('휴지통');
    const vault=await window.DiaryPrivate.check(info),files=await api.get(vault,'_diary_trash')||[];check(info,version);if(!Array.isArray(files))throw new Error('휴지통 목록을 읽을 수 없어요.');let count=0;
    for(const file of files.filter(f=>validTrash(f.path)).reverse()){
      const meta=await api.get(vault,file.path);check(info,version);if(!meta?.content)continue;
      let record;try{record=validate(JSON.parse(api.decode(meta.content)));}catch(_){continue;}
      count++;row(record.title||'제목 없는 기록',(record.kind==='draft'?'임시글':record.visibility==='private'?'비공개 글':'공개 글')+' · '+new Date(record.deletedAt).toLocaleString('ko-KR'),async()=>{const fresh=await api.get(vault,file.path);check(info,version);if(!fresh)throw new Error('이미 복원된 항목입니다. 휴지통을 다시 열어 주세요.');const data=validate(JSON.parse(api.decode(fresh.content)));showPreview({...data,trashPath:file.path,trashSha:fresh.sha},data.content,data.kind);});
    }
    message.textContent=count?count+'개의 기록 · 삭제한 사진 파일은 원래 저장 공간에 보존됩니다.':'휴지통이 비어 있어요.';
  }
  async function history(append=false){
    const info=api.info();if(!info)return;
    if(!append){context=api.context();if(!validPost(context.path)){message.textContent='먼저 수정할 글을 열어 주세요.';return;}generation++;page=1;show('이전 버전');}
    const version=generation,destination=await target(info,context.visibility);
    const commits=await api.commits(destination,context.path,page);check(info,version);if(!Array.isArray(commits))throw new Error('이전 버전 목록을 읽지 못했어요.');
    for(const commit of commits){if(!/^[a-f0-9]{40}$/.test(commit.sha))continue;row(new Date(commit.commit.author.date).toLocaleString('ko-KR'),String(commit.commit.message).split('\n')[0],async()=>{const meta=await api.get({...destination,branch:commit.sha},context.path);check(info,version);if(!meta?.content)throw new Error('이 버전에는 글이 없습니다. 다른 시점을 선택해 주세요.');showPreview({...context},api.decode(meta.content),'post');});}
    more.hidden=commits.length<20;page++;message.textContent=list.children.length?'확인할 시점을 선택해 주세요.':'저장된 이전 버전이 없어요.';
  }
  function withoutRevision(text){return text.replace(/^diary_revision:.*\n/gm,'').trim();}
  async function restore(){
    if(!selected)return;const info=api.info();if(!info)return;const version=generation,item=selected;
    if(!item.record.trashPath){
      const now=api.context();if(now.path!==item.record.path||now.sha!==item.record.sha||now.visibility!==item.record.visibility)throw new Error('편집 중인 글이 바뀌었어요. 이전 버전을 다시 열어 주세요.');
      const destination=await target(info,now.visibility),meta=await api.get(destination,now.path);check(info,version);if(!meta||meta.sha!==now.sha)throw new Error('다른 기기에서 글이 수정됐어요. 최신 글을 다시 열어 주세요.');
      if(!window.confirm('현재 편집 내용을 선택한 이전 버전으로 바꿀까요? 발행하기 전까지 공개 글은 유지됩니다.'))return;
      api.apply(item.content);preview.hidden=true;message.textContent='이전 내용을 편집 화면으로 가져왔어요. 확인 후 저장해 주세요.';return;
    }
    if(!window.confirm(item.record.visibility==='public'?'공개 글로 복원할까요? 제목·본문·사진을 다시 누구나 볼 수 있게 됩니다.':'선택한 기록을 비공개 저장 공간에 복원할까요?'))return;
    const vault=await window.DiaryPrivate.check(info),fresh=await api.get(vault,item.record.trashPath);check(info,version);if(!fresh||fresh.sha!==item.record.trashSha)throw new Error('휴지통 항목이 변경됐어요. 다시 열어 주세요.');
    const record=validate(JSON.parse(api.decode(fresh.content))),destination=await target(info,record.visibility),existing=await api.get(destination,record.path);check(info,version);
    let content=record.content,revision='';
    if(record.kind==='post'&&record.visibility==='public'){
      if(/diary-(private|pending):/.test(content))throw new Error('사진 정보를 확인해야 해서 복원을 중단했어요.');
      revision=api.id();content=content.replace(/^diary_revision:.*\n/gm,'').replace(/^---\r?\n/,'---\ndiary_revision: "'+revision+'"\n');
    }
    if(existing && withoutRevision(api.decode(existing.content))!==withoutRevision(record.content))throw new Error('같은 위치에 다른 내용의 글이 있어요. 기존 글을 덮어쓰지 않았습니다.');
    let result;if(!existing){result=await api.put(destination,record.path,null,content,'Restore diary item from private trash');check(info,version);}
    let cleanup='';try{await api.remove(vault,item.record.trashPath,item.record.trashSha,'Remove restored trash entry');}catch(_){cleanup=' 휴지통 정리는 완료하지 못했어요. 다시 복원하면 남은 항목만 정리합니다.';}
    check(info,version);
    if(result&&record.kind==='post'){if(record.visibility==='public')window.DiaryPublication?.start({path:record.path,visibility:'public',revision,commit:result.commit?.sha},info);else window.DiaryPublication?.privateSaved();}
    preview.hidden=true;selected=null;await api.refresh();check(info,version);message.textContent='복원 완료. 글 관리에서 다시 열 수 있어요.'+cleanup;api.status(message.textContent);
  }
  window.DiaryRecovery={capture,init(bridge){api=bridge;document.getElementById('open-trash').addEventListener('click',()=>task(trash));document.getElementById('open-history').addEventListener('click',()=>task(()=>history()));more.addEventListener('click',()=>task(()=>history(true)));document.getElementById('restore-record').addEventListener('click',()=>task(restore));},clear(){generation++;selected=null;context=null;list.replaceChildren();document.getElementById('recovery-text').value='';document.getElementById('recovery-preview-title').textContent='';message.textContent='';panel.hidden=true;preview.hidden=true;}};
})();
