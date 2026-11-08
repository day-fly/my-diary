const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { TextEncoder, TextDecoder } = require("node:util");
const { JSDOM } = require("jsdom");
const source = readFileSync("assets/js/author-auth.js", "utf8");
const configKey = "myDiaryWriterConfigV3";
const sessionKey = "myDiaryWriterSessionV1";
const draftKey = "myDiaryDraftV1:/my-diary:day-fly/my-diary:main";
const token = "test-only-author-token";
const connection = { owner: "day-fly", repo: "my-diary", branch: "main", token };
const response = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };

function setup({ saved, session, user = "day-fly", push = true, fail, storageBlocked = false, html, url, pending, draft } = {}) {
  const markup = html || '<body data-writer-owner="day-fly" data-writer-repo="my-diary" data-writer-branch="main"><a data-author-only hidden>글쓰기</a><a data-guest-only>로그인</a><p data-author-status></p><button data-author-logout data-author-only hidden>로그아웃</button></body>';
  const dom = new JSDOM(markup, { url: url || "https://example.test/my-diary/", runScripts: "outside-only" });
  const w = dom.window;
  Object.assign(w, { TextEncoder, TextDecoder, AbortController, confirm: () => true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  if (saved) w.localStorage.setItem(configKey, JSON.stringify(saved));
  if (session) w.sessionStorage.setItem(sessionKey, JSON.stringify(session));
  if (pending) w.sessionStorage.setItem("myDiaryWriterOAuthPendingV1", JSON.stringify(pending));
  if (draft) w.localStorage.setItem(draftKey, JSON.stringify(draft));
  if (storageBlocked) {
    for (const name of ["sessionStorage", "localStorage"]) Object.defineProperty(w, name, { get() { throw new w.DOMException("blocked", "SecurityError"); } });
  }
  const requests = [];
  w.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET" });
    if (fail) { if (fail === "network") throw new w.TypeError("offline"); return response({}, fail); }
    if (url === "https://api.github.com/user") return response({ login: user });
    if (url === "https://api.github.com/repos/day-fly/my-diary") return response({ permissions: { push } });
    if (url.endsWith("/posts.json")) return response([]);
    if (url === "https://oauth.example.test") return response({ access_token: token });
    throw new Error("Unexpected request: " + url);
  };
  w.eval(source);
  return { w, d: w.document, requests, close: () => w.close() };
}

test("visitors see login, never author controls, and make no authenticated requests", async () => {
  const a = setup(); await a.w.DiaryAuth.ready;
  assert.equal(a.d.querySelector("[data-author-only]").hidden, true);
  assert.equal(a.d.querySelector("[data-guest-only]").hidden, false);
  assert.equal(a.w.DiaryAuth.getConnection(), null);
  assert.equal(a.requests.length, 0); a.close();
});
test("saved login is checked with GitHub before showing author controls", async () => {
  const a = setup({ saved: { ...connection, authenticated: true, login: "day-fly" } });
  assert.equal(a.d.querySelector("[data-author-only]").hidden, true);
  await a.w.DiaryAuth.ready;
  assert.equal(a.d.querySelector("[data-author-only]").hidden, false);
  assert.equal(a.w.DiaryAuth.isAuthorized(connection), true);
  assert.equal(a.w.DiaryAuth.isAuthorized({ ...connection, repo: "another" }), false);
  assert.equal(a.w.DiaryAuth.isAuthorized({ ...connection, token: "changed" }), false);
  assert.equal(a.requests.length, 2); a.close();
});
test("other accounts, expired tokens, missing permissions, and network errors stay locked", async () => {
  for (const options of [{ user: "visitor" }, { fail: 401 }, { push: false }, { fail: "network" }, { fail: 403 }]) {
    const a = setup({ saved: connection, ...options }); await a.w.DiaryAuth.ready;
    assert.equal(a.w.DiaryAuth.getState().status, "error");
    assert.equal(a.d.querySelector("[data-author-only]").hidden, true);
    assert.equal(a.w.DiaryAuth.getConnection(), null);
    if (options.user || options.fail === 401) assert.equal(JSON.parse(a.w.localStorage.getItem(configKey)).token, undefined);
    a.close();
  }
});
test("wrong repository and malformed saved data do not grant access or break login", async () => {
  for (const saved of [{ ...connection, repo: "other" }, { owner: {}, token }, [connection], "invalid"]) {
    const a = setup({ saved }); await a.w.DiaryAuth.ready;
    assert.equal(a.w.DiaryAuth.getState().status, "guest");
    assert.equal(a.requests.length, 0); a.close();
  }
});
test("login stores only verified credentials and keeps long-term storage opt-in", async () => {
  const a = setup(); await a.w.DiaryAuth.ready;
  assert.equal(await a.w.DiaryAuth.login(token), true);
  assert.equal(JSON.parse(a.w.sessionStorage.getItem(sessionKey)).token, token);
  assert.equal(JSON.parse(a.w.localStorage.getItem(configKey)).token, undefined);
  assert.equal(await a.w.DiaryAuth.login(token, { remember: true }), true);
  assert.equal(JSON.parse(a.w.localStorage.getItem(configKey)).token, token);
  a.close();
});
test("blocked browser storage stays locked initially and permits verified in-memory login", async () => {
  const a = setup({ storageBlocked: true }); await a.w.DiaryAuth.ready;
  assert.equal(a.w.DiaryAuth.getState().status, "guest");
  assert.equal(await a.w.DiaryAuth.login(token), true);
  assert.match(a.w.DiaryAuth.getState().message, /이 창에서만/);
  a.w.DiaryAuth.logout(); assert.equal(a.w.DiaryAuth.getConnection(), null); a.close();
});
test("logout clears both credential stores and OAuth state, but preserves drafts", async () => {
  const a = setup({ saved: connection, session: connection, pending: { state: "pending" }, draft: { title: "보관할 글" } }); await a.w.DiaryAuth.ready;
  a.d.querySelector("[data-author-logout]").click();
  assert.equal(a.d.querySelector("[data-author-only]").hidden, true);
  assert.equal(a.w.sessionStorage.getItem(sessionKey), null);
  assert.equal(a.w.sessionStorage.getItem("myDiaryWriterOAuthPendingV1"), null);
  assert.equal(JSON.parse(a.w.localStorage.getItem(configKey)).token, undefined);
  assert.equal(JSON.parse(a.w.localStorage.getItem(draftKey)).title, "보관할 글"); a.close();
});
test("logout cannot be undone by an older in-flight account check", async () => {
  const a = setup(); await a.w.DiaryAuth.ready;
  let resolve;
  a.w.fetch = () => new Promise(done => { resolve = done; });
  const login = a.w.DiaryAuth.login(token);
  a.w.DiaryAuth.logout();
  a.w.fetch = async () => response({ permissions: { push: true } });
  resolve(response({ login: "day-fly" }));
  assert.equal(await login, false);
  assert.equal(a.w.DiaryAuth.getState().status, "guest");
  assert.equal(a.w.sessionStorage.getItem(sessionKey), null); a.close();
});
test("other-tab logout clears this tab and BFCache restore rechecks expired credentials", async () => {
  const a = setup({ saved: connection, session: connection }); await a.w.DiaryAuth.ready;
  a.w.dispatchEvent(new a.w.StorageEvent("storage", { key: "myDiaryWriterLogoutV1", newValue: "now" }));
  assert.equal(a.w.DiaryAuth.getState().status, "guest");
  await a.w.DiaryAuth.login(token);
  a.w.fetch = async () => response({}, 401);
  a.w.dispatchEvent(new a.w.PageTransitionEvent("pageshow", { persisted: true })); await flush();
  assert.equal(a.w.DiaryAuth.getState().status, "error");
  assert.equal(a.d.querySelector("[data-author-only]").hidden, true); a.close();
});

function runWriter(a) {
  a.w.eval(readFileSync("assets/js/cover-image.js", "utf8"));
  a.w.eval(readFileSync("assets/js/writer.js", "utf8"));
}
test("direct writer access stays locked, preserves drafts, and unlocks only after verified login", async () => {
  const a = setup({ html: readFileSync("_site/write/index.html", "utf8"), url: "https://example.test/my-diary/write/", draft: { title: "이어 쓸 글", body: "아직 발행하지 않은 문장" } });
  runWriter(a); await flush();
  assert.equal(a.d.querySelector(".writer-workspace").hidden, true);
  assert.equal(a.d.getElementById("post-title").value, "");
  a.d.getElementById("publish-post").click(); await flush();
  assert.equal(a.requests.length, 0);
  a.d.getElementById("gh-token").value = token;
  a.d.getElementById("save-config").click(); await flush();
  assert.equal(a.d.querySelector(".writer-workspace").hidden, false);
  assert.equal(a.d.getElementById("post-title").value, "이어 쓸 글");
  a.d.getElementById("oauth-logout").click();
  assert.equal(a.d.querySelector(".writer-workspace").hidden, true);
  a.d.getElementById("publish-post").click(); await flush();
  assert.equal(a.requests.some(r => r.method === "PUT"), false);
  assert.equal(JSON.parse(a.w.localStorage.getItem(draftKey)).title, "이어 쓸 글"); a.close();
});
test("OAuth callbacks reject mismatched or expired state and verify the exchanged account", async () => {
  for (const mode of ["mismatch", "expired", "valid"]) {
    const pending = { state: "expected", verifier: "verifier", createdAt: Date.now() - (mode === "expired" ? 700000 : 0), clientId: "public-client-id", proxyUrl: "https://oauth.example.test", returnTo: "/my-diary/write/#profile" };
    const a = setup({ html: readFileSync("_site/write/index.html", "utf8"), url: "https://example.test/my-diary/write/?code=test-code&state=" + (mode === "mismatch" ? "wrong" : "expected"), pending });
    runWriter(a); await flush();
    assert.equal(a.d.querySelector(".writer-workspace").hidden, mode !== "valid");
    assert.equal(a.requests.some(r => r.url === "https://oauth.example.test"), mode === "valid");
    assert.equal(a.w.location.search, "");
    if (mode === "valid") assert.equal(a.w.location.hash, "#profile"); a.close();
  }
});
