(() => {
  'use strict';
  const page = document.querySelector('.writer-page');
  if (!page) return;
  const scope = location.pathname.replace(/write\/?$/, '') + ':' + page.dataset.owner + '/' + page.dataset.repo;
  // Keep the database name and tab identity so existing drafts remain recoverable.
  const name = 'diary-local-drafts-v1:' + scope;
  const tabKey = name + ':tab';
  const stores = ['drafts', 'files', 'blobs'];
  const hashes = new WeakMap();
  let id, opening, queue = Promise.resolve(), epoch = 0, migrationAttempted = false;
  try { id = sessionStorage.getItem(tabKey); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(tabKey, id); } } catch (_) { id = crypto.randomUUID(); }
  let claiming, releaseSlot;
  function claimSlot() {
    if (!navigator.locks?.request) return Promise.resolve();
    if (!claiming) claiming = new Promise((resolve, reject) => {
      const claim = () => navigator.locks.request(name + ':slot:' + id, { ifAvailable: true }, async lock => {
        if (!lock) { id = crypto.randomUUID(); try { sessionStorage.setItem(tabKey, id); } catch (_) {} claim(); return; }
        resolve(); await new Promise(done => { releaseSlot = done; });
      }).catch(reject);
      claim();
    });
    return claiming;
  }
  window.addEventListener('pagehide', () => { releaseSlot?.(); releaseSlot = null; claiming = null; });
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('이 브라우저에서는 사진 자동 임시저장을 사용할 수 없어요. 보관함 저장을 눌러 주세요.'));
      // Version 2 closes old readers before shared photos can be introduced. An old
      // tab must never delete a shared photo using the previous per-tab cleanup.
      const request = indexedDB.open(name, 2);
      let expired = false;
      const fail = error => { expired = true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => fail(new Error('자동 임시저장 공간을 열지 못했어요. 보관함 저장을 눌러 주세요.')), 5000);
      request.onupgradeneeded = () => {
        for (const store of stores) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: store === 'drafts' ? 'id' : 'key' });
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('이전 글쓰기 창을 새로고침한 뒤 다시 저장해 주세요.'));
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        if (expired) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  const result = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  async function transaction(db, names, mode, action) {
    const tx = db.transaction(names, mode);
    const completed = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('임시저장이 중단됐어요.'));
      tx.onerror = () => {}; // onabort settles completion after the rollback.
    });
    completed.catch(() => {});
    try { const value = await action(tx); await completed; return value; }
    catch (error) { try { tx.abort(); } catch (_) {} await completed.catch(() => {}); throw error; }
  }
  function enqueue(action) { const next = queue.then(action); queue = next.catch(() => {}); return next; }
  function assert(version) { if (version !== epoch || !window.DiaryAuth?.getConnection()) throw new Error('로그인이 해제되어 자동 임시저장을 중단했어요.'); }
  async function describe(ref, file) {
    if (!hashes.has(file)) hashes.set(file, (async () => {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return 'sha256:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    })());
    return { key: await hashes.get(file), ref, name: file.name, type: file.type, lastModified: file.lastModified };
  }
  function prune(store, keep) {
    return new Promise((resolve, reject) => {
      const request = store.openKeyCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const cursor = request.result; if (!cursor) { resolve(); return; } if (!keep.has(cursor.key)) store.delete(cursor.key); cursor.continue(); };
    });
  }
  async function collect(tx) {
    const records = await result(tx.objectStore('drafts').getAll());
    const shared = new Set(), legacy = new Set();
    for (const record of records) {
      if (record.format === 2) {
        record.attachments.forEach(file => shared.add(file.key));
        if (record.cover) shared.add(record.cover.key);
      } else {
        record.refs.forEach(key => legacy.add(key));
        if (record.coverKey) legacy.add(record.coverKey);
      }
    }
    // All references are checked inside the same transaction as a write/delete.
    // Closed tabs' unique drafts are retained; only unreferenced bytes are removed.
    await Promise.all([prune(tx.objectStore('blobs'), shared), prune(tx.objectStore('files'), legacy)]);
  }
  async function putBlobs(tx, entries) {
    const store = tx.objectStore('blobs');
    for (const [key, file] of new Map(entries.map(entry => [entry.info.key, entry.file]))) {
      if (!await result(store.getKey(key))) store.put({ key, blob: file });
    }
  }
  async function readFiles(tx, record) {
    if (!record) return null;
    if (record.format === 2) {
      const restore = async info => {
        const stored = await result(tx.objectStore('blobs').get(info.key));
        if (!stored) throw new Error('임시저장 사진을 모두 읽지 못했어요. 보관함의 원본을 확인해 주세요.');
        const file = new File([stored.blob], info.name, { type: info.type, lastModified: info.lastModified });
        hashes.set(file, Promise.resolve(info.key));
        return { ref: info.ref, file };
      };
      const [files, cover] = await Promise.all([Promise.all(record.attachments.map(restore)), record.cover ? restore(record.cover) : null]);
      return { data: record.data, files, cover: cover?.file || null };
    }
    const restore = async key => {
      const stored = await result(tx.objectStore('files').get(key));
      if (!stored) throw new Error('임시저장 사진을 모두 읽지 못했어요. 보관함의 원본을 확인해 주세요.');
      return { ref: stored.ref, file: new File([stored.blob], stored.name, { type: stored.type, lastModified: stored.lastModified }) };
    };
    const [files, cover] = await Promise.all([Promise.all(record.refs.map(restore)), record.coverKey ? restore(record.coverKey) : null]);
    return { data: record.data, files, cover: cover?.file || null };
  }
  async function prepare(files, cover) {
    const entries = await Promise.all(files.map(async entry => ({ file: entry.file, info: await describe(entry.ref, entry.file) })));
    const coverEntry = cover ? { file: cover, info: await describe(null, cover) } : null;
    return { attachments: entries.map(entry => entry.info), cover: coverEntry?.info || null, blobs: entries.concat(coverEntry ? [coverEntry] : []) };
  }
  async function migrate(db, version) {
    if (migrationAttempted) return;
    migrationAttempted = true;
    const records = await transaction(db, ['drafts'], 'readonly', tx => result(tx.objectStore('drafts').getAll()));
    for (const old of records.filter(record => record.format !== 2)) {
      const loaded = await transaction(db, stores, 'readonly', tx => readFiles(tx, old));
      const prepared = await prepare(loaded.files, loaded.cover);
      assert(version);
      await transaction(db, stores, 'readwrite', async tx => {
        const drafts = tx.objectStore('drafts');
        const current = await result(drafts.get(old.id));
        // Another tab may have saved or logged out while the bytes were hashed.
        if (JSON.stringify(current) !== JSON.stringify(old)) return;
        assert(version);
        await putBlobs(tx, prepared.blobs);
        drafts.put({ id: old.id, data: old.data, format: 2, attachments: prepared.attachments, cover: prepared.cover, sensitive: old.sensitive, savedAt: old.savedAt });
        await collect(tx);
      });
    }
  }
  function read(selectedId) {
    const version = epoch;
    return enqueue(async () => {
      await claimSlot();
      const db = await open(); assert(version);
      // Failed compaction must not prevent recovery from the untouched old record.
      try { await migrate(db, version); } catch (_) { assert(version); }
      const restored = await transaction(db, stores, 'readonly', async tx => {
        const records = await result(tx.objectStore('drafts').getAll());
        const record = selectedId ? records.find(r => r.id === selectedId) : records.find(r => r.id === id) || records.sort((a, b) => b.savedAt - a.savedAt).find(hasContent);
        if (selectedId && !record) throw new Error('이 임시글을 찾을 수 없어요. 목록을 새로고침해 주세요.');
        return readFiles(tx, record);
      });
      assert(version); return restored;
    });
  }
  function hasContent(record) { return record.data.title || record.data.body || (record.format === 2 ? record.attachments.length || record.cover : record.refs.length || record.coverKey); }
  function list() {
    const version = epoch;
    return enqueue(async () => {
      const db = await open(); assert(version);
      const records = await transaction(db, ['drafts'], 'readonly', tx => result(tx.objectStore('drafts').getAll()));
      assert(version);
      return records.filter(hasContent).sort((a, b) => b.savedAt - a.savedAt).map(record => ({ id: record.id, title: record.data.title || '제목 없는 임시글', savedAt: record.savedAt, sensitive: !!record.sensitive, current: record.id === id }));
    });
  }
  // Restoring another draft must leave an independent copy of the current one.
  // Photo references are copied atomically; their bytes remain shared.
  function preserve() {
    const version = epoch;
    return enqueue(async () => {
      const db = await open(); assert(version);
      await transaction(db, ['drafts'], 'readwrite', async tx => {
        const drafts = tx.objectStore('drafts'), current = await result(drafts.get(id));
        assert(version);
        if (current && hasContent(current)) drafts.put({ ...current, id: crypto.randomUUID() });
      });
    });
  }
  function write(data, files, cover, sensitive) {
    const version = epoch;
    return enqueue(async () => {
      await claimSlot();
      const db = await open(), prepared = await prepare(files, cover); assert(version);
      await transaction(db, stores, 'readwrite', async tx => {
        await putBlobs(tx, prepared.blobs); assert(version);
        tx.objectStore('drafts').put({ id, data, format: 2, attachments: prepared.attachments, cover: prepared.cover, sensitive, savedAt: Date.now() });
        await collect(tx);
      });
      assert(version);
    });
  }
  function clearSensitive() {
    epoch++;
    return enqueue(async () => {
      const db = await open();
      await transaction(db, stores, 'readwrite', async tx => {
        const drafts = tx.objectStore('drafts');
        const records = await result(drafts.getAll());
        records.filter(record => record.sensitive).forEach(record => drafts.delete(record.id));
        await collect(tx);
      });
    }).catch(() => {});
  }
  window.DiaryLocalDrafts = { read, write, list, preserve, clearSensitive, get tabId() { return id; } };
})();
