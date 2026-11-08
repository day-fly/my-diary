(() => {
  'use strict';
  // One atomic snapshot per tab; opening a new tab copies the latest snapshot.
  const page = document.querySelector('.writer-page');
  if (!page) return;
  const scope = location.pathname.replace(/write\/?$/, '') + ':' + page.dataset.owner + '/' + page.dataset.repo;
  const name = 'diary-local-drafts-v1:' + scope;
  const tabKey = name + ':tab';
  let id, opening, queue = Promise.resolve(), epoch = 0;
  const knownFiles = new Set(), fileIds = new WeakMap();
  try { id = sessionStorage.getItem(tabKey); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(tabKey, id); } } catch (_) { id = crypto.randomUUID(); }
  let claiming, releaseSlot;
  function claimSlot() {
    if(!navigator.locks?.request)return Promise.resolve();
    if(!claiming)claiming=new Promise((resolve,reject)=>{
      const claim=()=>navigator.locks.request(name+':slot:'+id,{ifAvailable:true},async lock=>{
        if(!lock){id=crypto.randomUUID();try{sessionStorage.setItem(tabKey,id);}catch(_){}claim();return;}
        resolve();await new Promise(done=>{releaseSlot=done;});
      }).catch(reject);claim();
    });
    return claiming;
  }
  window.addEventListener('pagehide',()=>{releaseSlot?.();releaseSlot=null;claiming=null;});
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('이 브라우저에서는 사진 자동 임시저장을 사용할 수 없어요. 보관함 저장을 눌러 주세요.'));
      const request = indexedDB.open(name, 1);
      const timer = setTimeout(() => reject(new Error('자동 임시저장 공간을 열지 못했어요. 보관함 저장을 눌러 주세요.')), 5000);
      request.onupgradeneeded = () => { request.result.createObjectStore('drafts', { keyPath:'id' }); request.result.createObjectStore('files', { keyPath:'key' }); };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
      request.onblocked = () => { clearTimeout(timer); reject(new Error('다른 창에서 저장 공간을 사용 중입니다. 보관함 저장을 눌러 주세요.')); };
      request.onsuccess = () => { clearTimeout(timer); const db=request.result; db.onversionchange=()=>db.close(); resolve(db); };
    });
    return opening;
  }
  const result = request => new Promise((resolve,reject) => { request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
  const done = tx => new Promise((resolve,reject) => { tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || new Error('임시저장이 중단됐어요.')); });
  function enqueue(action) { const next=queue.then(action); queue=next.catch(()=>{}); return next; }
  function assert(version) { if(version!==epoch || !window.DiaryAuth?.getConnection()) throw new Error('로그인이 해제되어 자동 임시저장을 중단했어요.'); }
  async function read() {
    await claimSlot();
    const version=epoch, db=await open(); assert(version);
    const tx=db.transaction(['drafts','files'],'readonly'), completed=done(tx);
    const records=await result(tx.objectStore('drafts').getAll());
    const record=records.find(r=>r.id===id) || records.sort((a,b)=>b.savedAt-a.savedAt).find(r=>r.data.title || r.data.body || r.refs.length || r.coverKey);
    const files=record ? await Promise.all(record.refs.map(key=>result(tx.objectStore('files').get(key)))) : [];
    const cover=record?.coverKey ? await result(tx.objectStore('files').get(record.coverKey)) : null;
    await completed; assert(version);
    if(!record)return null;
    if(files.some(f=>!f) || (record.coverKey&&!cover)) throw new Error('임시저장 사진을 모두 읽지 못했어요. 보관함의 원본을 확인해 주세요.');
    const asFile=f=>new File([f.blob],f.name,{type:f.type,lastModified:f.lastModified});
    return {data:record.data,files:files.map(f=>({ref:f.ref,file:asFile(f)})),cover:cover?asFile(cover):null};
  }
  function write(data, files, cover, sensitive) {
    const version=epoch;
    return enqueue(async()=>{
      await claimSlot();
      const db=await open();assert(version);
      const tx=db.transaction(['drafts','files'],'readwrite'), completed=done(tx), store=tx.objectStore('files');
      const added=[], refs=[];
      function save(ref,file) { const key=id+':'+ref;refs.push(key); if(!knownFiles.has(key)){store.put({key,ref,blob:file,name:file.name,type:file.type,lastModified:file.lastModified});added.push(key);}return key; }
      for(const entry of files)save(entry.ref,entry.file);
      let coverKey=null;
      if(cover){if(!fileIds.has(cover))fileIds.set(cover,'cover-'+crypto.randomUUID());coverKey=save(fileIds.get(cover),cover);refs.pop();}
      tx.objectStore('drafts').put({id,data,refs,coverKey,sensitive,savedAt:Date.now()});
      const keep=new Set(refs.concat(coverKey?[coverKey]:[]));
      const cursor=store.openKeyCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(String(c.key).startsWith(id+':')&&!keep.has(c.key)){store.delete(c.key);knownFiles.delete(c.key);}c.continue();}};
      await completed;assert(version);added.forEach(key=>knownFiles.add(key));
    });
  }
  function clearSensitive() {
    epoch++;knownFiles.clear();
    return enqueue(async()=>{
      const db=await open(),tx=db.transaction(['drafts','files'],'readwrite'),completed=done(tx),drafts=tx.objectStore('drafts'),files=tx.objectStore('files');
      const cursor=drafts.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.value.sensitive){for(const key of c.value.refs.concat(c.value.coverKey?[c.value.coverKey]:[]))files.delete(key);c.delete();}c.continue();}};
      await completed;
    }).catch(()=>{});
  }
  window.DiaryLocalDrafts={read,write,clearSensitive,get tabId(){return id;}};
})();
