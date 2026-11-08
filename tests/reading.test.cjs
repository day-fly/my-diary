const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const { selectRelated } = require("../assets/js/related-posts.js");

function reader(saved, blocked = false) {
  const dom = new JSDOM('<article class="post"><div class="reading-controls" hidden><button data-reading-size="decrease"></button><output></output><button data-reading-size="increase"></button></div><div class="post-content"><p>첫 줄<br>둘째 줄</p></div></article>', { url: "https://example.com", runScripts: "outside-only" });
  if (saved !== undefined) dom.window.localStorage.setItem("diary:reading-size", saved);
  if (blocked) dom.window.Storage.prototype.setItem = () => { throw Error("blocked"); };
  dom.window.eval(readFileSync("assets/js/reading.js", "utf8"));
  return dom;
}
test("reading size persists within bounds without changing poem line breaks", () => {
  const a = reader();
  const d = a.window.document;
  const before = d.querySelector(".post-content").innerHTML;
  assert.equal(d.querySelector("output").textContent, "17px");
  for (let i = 0; i < 12; i++) d.querySelector('[data-reading-size="increase"]').click();
  assert.equal(d.querySelector("output").textContent, "22px");
  assert.equal(d.querySelector('[data-reading-size="increase"]').disabled, true);
  assert.equal(d.querySelector(".post-content").innerHTML, before);
  const b = reader(a.window.localStorage.getItem("diary:reading-size"));
  assert.equal(b.window.document.querySelector("output").textContent, "22px");
  for (let i = 0; i < 12; i++) d.querySelector('[data-reading-size="decrease"]').click();
  assert.equal(d.querySelector("output").textContent, "16px");
  assert.equal(d.querySelector('[data-reading-size="decrease"]').disabled, true);
  a.window.close(); b.window.close();
});
test("invalid saved sizes and unavailable storage do not break reading controls", () => {
  const a = reader("900", true);
  const d = a.window.document;
  assert.equal(d.querySelector("output").textContent, "17px");
  d.querySelector('[data-reading-size="increase"]').click();
  assert.equal(d.querySelector("output").textContent, "18px");
  a.window.close();
});
test("related posts use text similarity without categories and omit self and duplicates", () => {
  const posts = [
    { url: "/school", title: "교무실", text: "학교 선생님 교실 복도 학생 수업" },
    { url: "/food", title: "식탁", text: "식탁 음식 요리 반찬 국물" },
    { url: "/hall", title: "학교 복도", text: "학교 교실 선생님 학생 수업" },
    { url: "/books", title: "도서관", text: "학교 학생 도서관 독서" },
  ];
  const result = selectRelated([...posts, posts[2]], "/school");
  assert.deepEqual(result.map(p => p.url), ["/hall", "/books"]);
  assert.deepEqual(selectRelated([posts[0]], "/school"), []);
  assert.deepEqual(selectRelated(posts, "/missing"), []);
});
test("related cards render titles as text and keep existing navigation on network failure", async () => {
  const source = readFileSync("assets/js/related-posts.js", "utf8");
  const markup = '<nav class="post-pager"><a href="/previous">이전 글</a></nav><section class="related-posts" data-current-post="/here" data-reading-index="/index.json" hidden><div class="related-list"></div></section>';
  for (const fail of [false, true]) {
    const dom = new JSDOM(markup, { url: "https://example.com/here", runScripts: "outside-only" });
    dom.window.fetch = async () => {
      if (fail) throw Error("offline");
      return { ok: true, json: async () => [{ url: "/here", title: "학교", text: "학교" }, { url: "/other", title: "<img src=x onerror=alert(1)>", text: "학교", date: "2026.11.08", image: "javascript:alert(1)" }] };
    };
    dom.window.eval(source);
    await new Promise(resolve => setImmediate(resolve));
    const d = dom.window.document;
    assert.equal(d.querySelector(".post-pager a").getAttribute("href"), "/previous");
    assert.equal(d.querySelector(".related-posts").hidden, fail);
    assert.equal(d.querySelector(".related-list img"), null);
    if (!fail) assert.equal(d.querySelector(".related-card strong").textContent, "<img src=x onerror=alert(1)>");
    dom.window.close();
  }
});

function effects({ reduced = false, saved, blocked = false } = {}) {
  const dom = new JSDOM('<div class="season-effects" hidden></div><button data-season-effects-toggle hidden></button><button data-season-effects-toggle hidden></button>', { url: "https://example.com", runScripts: "outside-only" });
  const w = dom.window;
  const query = { matches: reduced, addEventListener: (_, handler) => query.change = handler };
  w.matchMedia = () => query;
  if (saved) w.localStorage.setItem("diary:season-effects", saved);
  if (blocked) w.Storage.prototype.setItem = () => { throw Error("blocked"); };
  w.eval(readFileSync("assets/js/season-effects.js", "utf8"));
  return { w, query, layer: w.document.querySelector(".season-effects"), buttons: w.document.querySelectorAll("button") };
}
test("season effects honor reduced motion on load and when the device setting changes", () => {
  const a = effects({ reduced: true });
  assert.equal(a.layer.hidden, true);
  assert.equal(a.buttons[0].disabled, true);
  a.query.matches = false; a.query.change();
  assert.equal(a.layer.hidden, false);
  assert.equal(a.buttons[0].disabled, false);
  a.query.matches = true; a.query.change();
  assert.equal(a.layer.hidden, true);
  a.w.close();
});
test("season effects can be stopped from either control and remain off across pages", () => {
  const a = effects();
  assert.equal(a.layer.children.length, 12);
  a.buttons[1].click();
  assert.equal(a.layer.hidden, true);
  assert.equal(a.buttons[0].getAttribute("aria-pressed"), "false");
  const b = effects({ saved: a.w.localStorage.getItem("diary:season-effects") });
  assert.equal(b.layer.hidden, true);
  b.buttons[0].click();
  assert.equal(b.layer.hidden, false);
  a.w.close(); b.w.close();
});
test("season effects pause in hidden tabs and remain operable with storage blocked", () => {
  const a = effects({ blocked: true });
  Object.defineProperty(a.w.document, "hidden", { configurable: true, value: true });
  a.w.document.dispatchEvent(new a.w.Event("visibilitychange"));
  assert.equal(a.layer.dataset.paused, "true");
  a.buttons[0].click();
  assert.equal(a.layer.hidden, true);
  a.w.close();
});
