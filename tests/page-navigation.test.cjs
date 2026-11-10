const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const base = 'https://example.test/my-diary/';
const html = path => readFileSync('_site/' + path.replace(/^\/my-diary\//, '') + (path.endsWith('/') ? 'index.html' : ''), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup({ path = '/my-diary/', fetchPage, authorized = false } = {}) {
  const errors = [], requests = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html(path), { url: new URL(path, base).href, runScripts: 'outside-only', virtualConsole: console });
  const w = dom.window, d = w.document, audio = d.querySelector('audio');
  let plays = 0, pauses = 0, paused = true, loads = 0;
  Object.defineProperties(audio, { paused: { get: () => paused }, duration: { value: 300 } });
  audio.play = async () => { plays++; paused = false; };
  audio.pause = () => { pauses++; paused = true; };
  audio.load = () => { loads++; };
  w.scrollTo = (x, y) => {
    if (typeof x === 'object') { assert.equal(x.behavior, 'instant'); w.scrollX = x.left; w.scrollY = x.top; }
    else { w.scrollX = x; w.scrollY = y; }
  };
  w.HTMLElement.prototype.scrollIntoView = function () { w.scrollY = this.id === 'archive-title' ? 500 : 100; };
  w.fetch = async (url, options = {}) => {
    const parsed = new URL(url, w.location.href);
    requests.push({ url: parsed, options });
    if (parsed.origin === 'https://api.github.com') return { ok: true, json: async () => parsed.pathname === '/user' ? { login: 'day-fly' } : { permissions: { push: true } } };
    if (parsed.pathname.endsWith('/reading-index.json')) return { ok: true, json: async () => JSON.parse(html(parsed.pathname)) };
    if (fetchPage) return fetchPage(parsed, options);
    return response(parsed.pathname);
  };
  if (authorized) w.sessionStorage.setItem('myDiaryWriterSessionV1', JSON.stringify({ owner: 'day-fly', repo: 'my-diary', branch: 'main', token: 'fake-local-test' }));
  for (const file of ['author-auth', 'seasons', 'background-music', 'archive', 'reading', 'related-posts', 'page-navigation']) w.eval(readFileSync('assets/js/' + file + '.js', 'utf8'));
  return { w, d, audio, errors, requests, counts: () => ({ plays, pauses, loads }), click: selector => d.querySelector(selector).click(), close: () => w.close() };
}
function response(path, overrides = {}) {
  return { ok: true, headers: { get: () => 'text/html; charset=utf-8' }, url: new URL(path, base).href, text: async () => html(path), ...overrides };
}
async function back(a, forward = false) {
  a.w.history[forward ? 'forward' : 'back']();
  await new Promise(resolve => setTimeout(resolve, 30));
  await flush();
}
test('home, articles and about preserve the connected audio, playback, metadata and reader controls', async () => {
  const a = setup(); await flush();
  const source = a.audio.src, player = a.d.querySelector('.music-player');
  a.audio.currentTime = 43;
  a.click('.post-card-link'); await flush();
  assert.ok(a.d.querySelector('.post-content'));
  assert.equal(a.d.querySelector('audio'), a.audio);
  assert.equal(a.d.querySelector('.music-player'), player);
  assert.equal(a.audio.isConnected, true);
  assert.equal(a.audio.currentTime, 43); assert.equal(a.audio.src, source);
  assert.deepEqual(a.counts(), { plays: 1, pauses: 0, loads: 0 });
  assert.match(a.d.querySelector('link[rel="canonical"]').href, /\/2026\//);
  assert.equal(a.d.querySelector('meta[property="og:type"]').content, 'article');
  assert.equal(a.d.activeElement.id, 'main');
  a.click('[data-reading-size="increase"]'); assert.equal(a.d.querySelector('#reading-size').textContent, '18px');
  a.click('.post-pager-link'); await flush();
  assert.equal(a.d.querySelector('#reading-size').textContent, '18px');
  a.click('.post-header .text-link'); await flush();
  assert.ok(a.d.querySelector('.about-page'));
  assert.equal(a.d.querySelector('.site-nav [aria-current="page"]').textContent, '소개');
  assert.equal(a.d.querySelector('meta[property="article:published_time"]'), null);
  assert.equal(a.d.querySelector('meta[property="og:type"]').content, 'website');
  a.click('.site-title'); await flush();
  assert.ok(a.d.querySelector('[data-archive]'));
  assert.equal(a.d.querySelectorAll('audio').length, 1);
  assert.deepEqual(a.counts(), { plays: 1, pauses: 0, loads: 0 });
  assert.equal(a.errors.length, 0); a.close();
});
test('Back and Forward restore search, year and scroll without starting the music again', async () => {
  const a = setup(); await flush();
  a.click('[data-archive-year="2025"]');
  const field = a.d.querySelector('#post-search'); field.value = '소고기'; field.dispatchEvent(new a.w.Event('input'));
  a.w.scrollTo(0, 650);
  a.click('.post-card:not([hidden]) .post-card-link'); await flush();
  const post = a.w.location.pathname;
  a.w.scrollTo(0, 320);
  a.click('.back-link'); await flush();
  assert.equal(a.w.scrollY, 0);
  await back(a); assert.equal(a.w.location.pathname, post); assert.equal(a.w.scrollY, 320);
  await back(a);
  assert.equal(a.d.querySelector('#post-search').value, '소고기');
  assert.equal(a.d.querySelector('[data-archive-year="2025"]').getAttribute('aria-pressed'), 'true');
  assert.equal(a.d.querySelectorAll('.post-card:not([hidden])').length, 1);
  assert.equal(a.w.scrollY, 650);
  await back(a, true); assert.equal(a.w.location.pathname, post); assert.equal(a.w.scrollY, 320);
  assert.deepEqual(a.counts(), { plays: 1, pauses: 0, loads: 0 });
  assert.equal(a.errors.length, 0); a.close();
});
test('archive controls work after returning repeatedly and do not accumulate handlers', async () => {
  const a = setup(); await flush();
  for (let i = 0; i < 3; i++) { a.click('.post-card-link'); await flush(); a.click('.back-link'); await flush(); }
  const before = a.w.history.length;
  a.click('[data-archive-year="2024"]');
  assert.equal(a.w.history.length, before + 1);
  await back(a);
  a.click('[data-archive-year="2023"]');
  assert.ok([...a.d.querySelectorAll('.post-card:not([hidden])')].every(card => card.dataset.year === '2023'));
  assert.equal(a.errors.length, 0); a.close();
});
test('verified author links and guest visibility are applied to newly loaded pages', async () => {
  for (const authorized of [false, true]) {
    const a = setup({ authorized }); await flush();
    a.click('.post-card-link'); await flush();
    assert.equal(a.d.querySelector('.post-author [data-author-only]').hidden, !authorized);
    a.click('.post-header .text-link'); await flush();
    assert.equal(a.d.querySelector('.about-bottom [data-author-only]').hidden, !authorized);
    assert.equal(a.requests.filter(request => request.url.origin === 'https://api.github.com').length, authorized ? 2 : 0);
    assert.equal(a.errors.length, 0); a.close();
  }
});
test('rapid navigation aborts stale requests so a late page cannot overwrite the chosen page', async () => {
  const waiting = [];
  const a = setup({ fetchPage: (url, options) => new Promise(resolve => waiting.push({ url, options, resolve })) });
  a.click('.post-card-link'); a.click('.profile-identity');
  assert.equal(waiting.length, 2); assert.equal(waiting[0].options.signal.aborted, true);
  waiting[1].resolve(response('/my-diary/about/')); await flush();
  waiting[0].resolve(response(waiting[0].url.pathname)); await flush();
  assert.equal(a.w.location.pathname, '/my-diary/about/'); assert.ok(a.d.querySelector('.about-page'));
  assert.equal(a.errors.length, 0); a.close();
});
test('Back cancels a pending link request and cannot be redirected by its late result', async () => {
  let resolve, path;
  const a = setup({ fetchPage: url => { path = url.pathname; return new Promise(done => resolve = done); } });
  a.click('[data-archive-year="2025"]'); a.click('.post-card-link');
  await back(a);
  resolve(response(path)); await flush();
  assert.equal(a.w.location.pathname, '/my-diary/'); assert.equal(a.w.location.search, '');
  assert.ok(a.d.querySelector('[data-archive]')); assert.equal(a.errors.length, 0); a.close();
});
test('external links, new tabs, downloads, writer and anchors keep native navigation', async () => {
  const a = setup(); await flush();
  const cases = [
    ['https://example.org/', {}], ['/my-diary/write/', {}], ['/my-diary/assets/image.jpg', {}],
    ['/my-diary/about/', { target: '_blank' }], ['/my-diary/about/', { download: '' }],
    ['/my-diary/about/', {}, { ctrlKey: true }], ['/my-diary/about/', {}, { metaKey: true }],
    ['/my-diary/#archive-title', {}],
  ];
  let intercepted;
  a.d.addEventListener('click', event => { intercepted = event.defaultPrevented; event.preventDefault(); });
  for (const [href, attrs, options] of cases) {
    const link = a.d.createElement('a'); link.href = href; Object.entries(attrs).forEach(([key, value]) => link.setAttribute(key, value)); a.d.body.append(link);
    link.dispatchEvent(new a.w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options }));
    assert.equal(intercepted, false, href); link.remove();
  }
  assert.equal(a.requests.length, 0);
  a.click('.site-title'); assert.equal(intercepted, true); assert.equal(a.requests.length, 0);
  assert.deepEqual(a.counts(), { plays: 1, pauses: 0, loads: 0 }); a.close();
});
test('failed, changed or invalid pages fall back without replacing the readable page', async () => {
  for (const mode of ['network', '404', 'version', 'writer', 'wrong-content']) {
    const a = setup({ fetchPage: async url => {
      if (mode === 'network') throw Error('offline');
      if (mode === '404') return response(url.pathname, { ok: false });
      if (mode === 'wrong-content') return response(url.pathname, { headers: { get: () => 'application/json' } });
      return response(url.pathname, { text: async () => html(url.pathname).replace(mode === 'version' ? /data-navigation-version="[^"]+"/ : /<body /, mode === 'version' ? 'data-navigation-version="old"' : '<body class="is-writer" ') });
    } });
    a.click('.post-card-link'); await flush();
    assert.ok(a.d.querySelector('[data-archive]'), mode);
    assert.equal(a.d.querySelector('#main').hasAttribute('aria-busy'), false);
    assert.ok(a.errors.some(error => error.message.includes('navigation')), mode);
    a.close();
  }
});
test('paused music stays paused across reading navigation and the next-track control still works', async () => {
  const a = setup(); await flush(); a.click('.music-toggle');
  a.click('.post-card-link'); await flush(); a.click('.back-link'); await flush();
  assert.equal(a.audio.paused, true); assert.equal(a.counts().plays, 1);
  a.click('.music-next'); assert.equal(a.counts().plays, 1);
  a.click('.music-toggle'); await flush(); assert.equal(a.counts().plays, 2); assert.equal(a.audio.paused, false);
  assert.equal(a.errors.length, 0); a.close();
});
