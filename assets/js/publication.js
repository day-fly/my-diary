(() => {
  'use strict';
  const panel = document.getElementById('publication-status');
  if (!panel) return;
  const config = document.querySelector('.writer-page').dataset;
  const base = (document.querySelector('.site-title').getAttribute('href') || '/').replace(/\/$/, '');
  const key = 'diary:publication:v1:' + config.owner + '/' + config.repo;
  const message = document.getElementById('publication-message');
  const retry = document.getElementById('publication-retry');
  const link = document.getElementById('publication-link');
  const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  let current = null, info = null, timer = null, version = 0, checkSequence = 0, compareCache = new Map();
  function authorized() { return info && window.DiaryAuth?.isAuthorized(info); }
  function persist() { try { sessionStorage.setItem(key, JSON.stringify(current)); } catch (_) {} }
  function render(state, text) {
    panel.hidden = false; panel.dataset.state = state;
    message.textContent = text;
    panel.querySelectorAll('[data-publication-step]').forEach(step => {
      const active = step.dataset.publicationStep === state;
      if (active) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
    retry.hidden = !['delayed','error'].includes(state);
    link.hidden = true;
    if (current) { current.state = state; persist(); }
  }
  function showLink(url) {
    try {
      const safe = new URL(url, location.origin);
      if (safe.origin !== location.origin || !safe.pathname.startsWith(base + '/')) return;
      link.href = safe.pathname + safe.search; link.hidden = false;
    } catch (_) {}
  }
  async function json(url, token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { headers: token ? {Accept:'application/vnd.github+json',Authorization:'Bearer '+token} : {}, cache:'no-store', credentials:'omit', signal:controller.signal });
      if (!response.ok) throw new Error('Unable to check publication');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function schedule() { clearTimeout(timer); if (current && authorized() && !document.hidden) timer = setTimeout(check, 15000); }
  async function check() {
    if (!current || !authorized()) return;
    clearTimeout(timer);
    const attempt = version, sequence = ++checkSequence, job = current;
    try {
      const manifest = await json(base + '/publication-status.json?v=' + Date.now());
      if (attempt !== version || sequence !== checkSequence || !authorized()) return;
      if (!Array.isArray(manifest.posts) || !validSha(manifest.revision)) throw new Error('Invalid publication manifest');
      const post = manifest.posts.find(post => post.path === job.path);
      if (job.visibility === 'public' && job.revision && post?.revision === job.revision) {
        render('complete','사이트 반영 완료 · 새로 저장한 글을 확인했어요.'); showLink(post.url); return;
      }
      if (!validSha(job.commit)) {
        const head = await json('https://api.github.com/repos/' + encodeURIComponent(info.owner) + '/' + encodeURIComponent(info.repo) + '/commits/' + encodeURIComponent(info.branch), info.token);
        if (attempt !== version || sequence !== checkSequence || !authorized()) return;
        if (!validSha(head.sha)) throw new Error('Missing source revision');
        job.commit = head.sha; persist();
      }
      let included = manifest.revision === job.commit;
      if (!included) {
        const cacheKey = job.commit + ':' + manifest.revision;
        if (!compareCache.has(cacheKey)) {
          const comparison = await json('https://api.github.com/repos/' + encodeURIComponent(info.owner) + '/' + encodeURIComponent(info.repo) + '/compare/' + job.commit + '...' + manifest.revision + '?per_page=1', info.token);
          if (attempt !== version || sequence !== checkSequence || !authorized()) return;
          compareCache.set(cacheKey, comparison.status === 'ahead' || comparison.status === 'identical');
        }
        included = compareCache.get(cacheKey);
      }
      if (included) {
        if (job.visibility === 'private' && !post) { render('complete','사이트 반영 완료 · 공개 목록과 본문에서 글이 내려갔어요.'); return; }
        render('changed', '사이트에 이후 변경 사항이 반영되었어요. 현재 공개 상태를 확인해 주세요.');
        if (post) showLink(post.url);
        return;
      }
      if (Date.now() - job.startedAt > 480000) { render('delayed','저장은 완료됐지만 사이트 반영이 늦어지고 있어요. 잠시 뒤 다시 확인해 주세요.'); return; }
      render('pending',job.visibility === 'private' ? '저장됨 · 공개 사이트에서 글이 내려가는지 확인하고 있어요.' : '저장됨 · 사이트에 새 내용이 반영되는지 확인하고 있어요.');
      schedule();
    } catch (_) {
      if (attempt !== version || sequence !== checkSequence || !authorized()) return;
      if (Date.now() - job.startedAt > 480000) render('error','저장은 완료됐지만 반영 여부를 확인하지 못했어요. 연결 상태를 확인하고 다시 확인을 눌러 주세요.');
      else { render('pending','저장됨 · 사이트에 연결해 반영 상태를 확인하고 있어요.'); schedule(); }
    }
  }
  function stop(clear) {
    version++; clearTimeout(timer); timer = null; info = null; current = null; compareCache.clear(); panel.hidden = true; message.textContent = ''; link.removeAttribute('href');
    if (clear) try { sessionStorage.removeItem(key); } catch (_) {}
  }
  window.DiaryPublication = {
    start(job, connection) {
      stop(false); info = connection;
      if (!authorized()) return;
      current = {path:job.path,commit:job.commit || '',revision:job.revision || '',visibility:job.visibility,startedAt:Date.now(),state:'saved'};
      render('saved','저장 완료 · 실제 사이트 반영 여부를 확인합니다.'); timer = setTimeout(check, 500);
    },
    resume(connection) {
      if (current) return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (!saved || !/^_posts\/[A-Za-z0-9_.-]+\.md$/.test(saved.path) || !['public','private'].includes(saved.visibility) || !Number.isFinite(saved.startedAt)) return;
        info = connection; if (!authorized()) return; current = saved; version++;
        if (saved.state === 'complete') render('complete','이전에 저장한 글의 사이트 반영을 확인했어요.');
        else { render('pending','저장한 글의 사이트 반영 상태를 다시 확인합니다.'); check(); }
      } catch (_) {}
    },
    privateSaved() { stop(true); render('complete','비공개 저장 완료 · 이 글은 공개 사이트에 올라가지 않습니다.'); },
    stop,
  };
  retry.addEventListener('click', () => { if (current) { current.startedAt = Date.now(); render('pending','반영 상태를 다시 확인합니다.'); check(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (current && ['pending','saved'].includes(current.state)) check(); });
  window.addEventListener('pagehide', () => { version++; clearTimeout(timer); });
  window.addEventListener('pageshow', event => { if (event.persisted && current && authorized() && ['pending','saved'].includes(current.state)) check(); });
})();
