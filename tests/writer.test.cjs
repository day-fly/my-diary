const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const { TextEncoder, TextDecoder } = require("node:util");
const html = readFileSync("_site/write/index.html", "utf8");
const script = readFileSync("assets/js/writer.js", "utf8");
const profile = {
  name: "day-fly",
  tagline: "",
  bio: "",
  avatar: "",
  website: "",
};
const postPath = "_posts/2026-01-01-test.md";
const oldPost =
  '---\ntitle: "원래 제목"\ncategory: "시"\ndate: 2026-01-01 12:00:00 +0900\ntags: [가족, 일상]\ncustom: |\n  첫 줄\n\n  둘째 줄\n---\n\n원래 본문\n';
const flush = async () => {
  for (let i = 0; i < 12; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
function response(payload, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}
function setup({
  draft,
  blockedStorage = false,
  post = oldPost,
  failWrite = false,
} = {}) {
  const dom = new JSDOM(html, {
    url: "https://example.test/my-diary/write/",
    runScripts: "outside-only",
  });
  const w = dom.window,
    d = w.document;
  Object.assign(w, { TextEncoder, TextDecoder, AbortController, confirm: () => true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  // These writer unit tests start with a verified author. Real authentication
  // and unauthenticated writer access are covered in author-auth.test.cjs.
  w.DiaryAuth = {
    ready: Promise.resolve(true),
    getState: () => ({ status: "authenticated", login: "day-fly" }),
    getConnection: () => ({ owner: "day-fly", repo: "my-diary", branch: "main", token: "test-only-token" }),
    isAuthorized: info => info.owner === "day-fly" && info.repo === "my-diary" && info.token === "test-only-token",
    logout: () => {},
  };
  const writes = [];
  let remoteProfile = profile,
    remotePost = post,
    sha = "post-sha";
  w.fetch = async (url, options = {}) => {
    if (url.endsWith("/posts.json"))
      return response([
        { path: postPath, title: "원래 제목", date: "2026.01.01" },
      ]);
    if (url.includes("/contents/_posts?"))
      return response([
        { path: postPath, name: "2026-01-01-test.md", type: "file" },
      ]);
    const isProfile = url.includes("_data/profile.json");
    if (options.method === "PUT") {
      writes.push({ url, payload: JSON.parse(options.body) });
      if (failWrite) return response({ message: "저장 실패" }, 500);
      const data = JSON.parse(options.body);
      if (isProfile)
        remoteProfile = JSON.parse(
          Buffer.from(data.content, "base64").toString(),
        );
      else {
        remotePost = Buffer.from(data.content, "base64").toString();
        sha = "new-sha";
      }
      return response({ content: { sha: "new-sha" } });
    }
    if (url.includes("/contents/assets/photos/"))
      return response({ message: "Not Found" }, 404);
    if (isProfile)
      return response({
        sha: "profile-sha",
        content: Buffer.from(JSON.stringify(remoteProfile)).toString("base64"),
      });
    if (url.includes("/contents/_posts/2026-01-01-test.md"))
      return response({
        sha,
        content: Buffer.from(remotePost).toString("base64"),
      });
    if (url.includes("/contents/_posts/"))
      return response({ message: "Not Found" }, 404);
    throw new Error("Unexpected request: " + url);
  };
  const key = "myDiaryDraftV1:/my-diary:day-fly/my-diary:main";
  if (draft) w.localStorage.setItem(key, JSON.stringify(draft));
  if (blockedStorage) {
    w.Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    w.Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
  }
  Object.entries(profile).forEach(([field, value]) => {
    d.getElementById("profile-" + field).value = value;
  });
  w.eval(readFileSync("assets/js/cover-image.js", "utf8"));
  w.eval(readFileSync("assets/js/private-posts.js", "utf8"));
  w.eval(script);
  function input(id, value) {
    d.getElementById(id).value = value;
    d.getElementById(id).dispatchEvent(new w.Event("input", { bubbles: true }));
  }
  return {
    w,
    d,
    writes,
    input,
    key,
    changeRemote: () => {
      sha = "different-sha";
    },
    changeProfile: () => {
      remoteProfile = { ...profile, name: "다른 이름" };
    },
  };
}
test("draft restores Korean text without classification; credentials stay out of drafts", async () => {
  const a = setup();
  await flush();
  a.input("post-title", "오늘의 기록");
  a.input("post-body", "한글과 **마음**\n둘째 줄");
  a.input("gh-token", "test-only-token");
  const draft = JSON.parse(a.w.localStorage.getItem(a.key));
  assert.equal(draft.title, "오늘의 기록");
  assert.equal(draft.category, undefined);
  assert.ok(!JSON.stringify(draft).includes("test-only-token"));
  const b = setup({ draft });
  await flush();
  assert.equal(b.d.getElementById("post-body").value, draft.body);
  assert.equal(b.d.getElementById("post-category"), null);
  a.w.close();
  b.w.close();
});
test("blocked storage does not stop editing and reports unsaved text", async () => {
  const a = setup({ blockedStorage: true });
  await flush();
  a.input("post-title", "저장 공간 없음");
  a.input("post-body", "본문");
  assert.match(a.d.getElementById("draft-status").textContent, /실패/);
  a.d.getElementById("show-preview").click();
  assert.equal(
    a.d.getElementById("preview-title").textContent,
    "저장 공간 없음",
  );
  a.w.close();
});
test("preview renders safe Markdown and Liquid image paths without executing HTML", async () => {
  const a = setup();
  await flush();
  a.input(
    "post-body",
    '**굵게**\n![사진]({{ "/assets/photos/example.png" | relative_url }})\n[위험](javascript:alert)\n<script>bad()</script>',
  );
  const preview = a.d.getElementById("preview-body");
  assert.equal(preview.querySelector("strong").textContent, "굵게");
  assert.equal(
    preview.querySelector("img").getAttribute("src"),
    "/my-diary/assets/photos/example.png",
  );
  assert.equal(preview.querySelector("script"), null);
  assert.equal(preview.querySelector("a"), null);
  a.w.close();
});
test("editing preserves category and multiline front matter and uses the loaded revision", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  a.d.getElementById("post-list").value = postPath;
  a.d.getElementById("load-selected-post").click();
  await flush();
  assert.equal(a.d.getElementById("post-category"), null);
  assert.equal(a.d.getElementById("delete-post").disabled, false);
  a.input("post-body", "수정한 문장");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].payload.sha, "post-sha");
  const saved = Buffer.from(a.writes[0].payload.content, "base64").toString();
  assert.match(saved, /category: "시"/);
  assert.match(saved, /tags: \[가족, 일상\]/);
  assert.match(saved, /custom: \|\n  첫 줄\n\n  둘째 줄/);
  assert.match(saved, /수정한 문장/);
  assert.match(a.d.getElementById("writer-status").textContent, /저장 완료/);
  assert.equal(a.d.getElementById("publish-post").disabled, false);
  a.w.close();
});
test("concurrent edits cannot silently overwrite remote content and keep local draft", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  a.d.getElementById("post-list").value = postPath;
  a.d.getElementById("load-selected-post").click();
  await flush();
  a.changeRemote();
  a.input("post-body", "내 수정");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.match(a.d.getElementById("writer-status").textContent, /다른 곳/);
  assert.equal(JSON.parse(a.w.localStorage.getItem(a.key)).body, "내 수정");
  a.w.close();
});
test("failed publication retains the draft and re-enables controls", async () => {
  const a = setup({ failWrite: true });
  await flush();
  a.input("gh-token", "test-only-token");
  a.input("post-title", "새 기록");
  a.input("post-body", "잃지 않을 내용");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.match(a.d.getElementById("writer-status").textContent, /발행 실패/);
  assert.equal(
    JSON.parse(a.w.localStorage.getItem(a.key)).body,
    "잃지 않을 내용",
  );
  assert.equal(a.d.getElementById("post-body").disabled, false);
  a.w.close();
});
test("profile persists as public data, strips no Korean text, and supports reloading", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  a.input("profile-name", "기록하는 사람");
  a.input("profile-bio", "첫 줄\n둘째 줄");
  a.input("profile-website", "https://example.com");
  a.d.getElementById("save-profile").click();
  await flush();
  assert.equal(a.writes.length, 1);
  const saved = JSON.parse(
    Buffer.from(a.writes[0].payload.content, "base64").toString(),
  );
  assert.equal(saved.name, "기록하는 사람");
  assert.equal(saved.bio, "첫 줄\n둘째 줄");
  assert.equal(a.writes[0].payload.sha, "profile-sha");
  a.input("profile-name", "임시 수정");
  a.d.getElementById("load-profile").click();
  await flush();
  assert.equal(a.d.getElementById("profile-name").value, "기록하는 사람");
  a.w.close();
});
test("profile rejects unsafe links and conflicting remote updates", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  a.input("profile-website", "javascript:alert(1)");
  a.d.getElementById("save-profile").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.match(a.d.getElementById("profile-status").textContent, /https/);
  a.input("profile-website", "");
  a.changeProfile();
  a.d.getElementById("save-profile").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.match(a.d.getElementById("profile-status").textContent, /다른 곳/);
  a.w.close();
});
test("search matches title and body without classification and resets empty results", () => {
  const dom = new JSDOM(readFileSync("_site/index.html", "utf8"), {
      runScripts: "outside-only",
    }),
    w = dom.window,
    d = w.document;
  w.eval(readFileSync("assets/js/archive.js", "utf8"));
  const total = d.querySelectorAll(".post-card").length;
  const search = d.getElementById("post-search");
  search.value = "교무실";
  search.dispatchEvent(new w.Event("input"));
  assert.equal(d.querySelectorAll(".post-card:not([hidden])").length, 1);
  assert.equal(d.querySelector("[data-filter]"), null);
  search.value = "없는 문장 xyz123";
  search.dispatchEvent(new w.Event("input"));
  assert.equal(d.querySelectorAll(".post-card:not([hidden])").length, 0);
  assert.equal(d.getElementById("search-empty").hidden, false);
  d.getElementById("reset-search").click();
  assert.equal(d.querySelectorAll(".post-card:not([hidden])").length, total);
  assert.equal(search.value, "");
  w.close();
});

test("a new post validates content and future dates before any repository write", async () => {
  const a = setup();
  await flush();
  a.input("post-title", "아직 로그인 전");
  a.input("post-body", "임시로 남기는 글");
  a.input("gh-token", "");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.equal(a.d.getElementById("connection").open, true);
  a.input("gh-token", "test-only-token");
  a.input("post-date", "2099-01-01T12:00");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.match(a.d.getElementById("writer-status").textContent, /예약 발행/);
  a.input("post-date", "2026-01-01T12:00");
  a.input("post-body", "");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.match(a.d.getElementById("writer-status").textContent, /본문/);
  a.w.close();
});

test("canceling new draft keeps the existing text", async () => {
  const a = setup();
  await flush();
  a.input("post-title", "계속 쓸 글");
  a.input("post-body", "보존할 내용");
  a.w.confirm = () => false;
  a.d.getElementById("new-draft").click();
  assert.equal(a.d.getElementById("post-body").value, "보존할 내용");
  a.w.close();
});

test("logging out during publication stops subsequent repository writes and keeps the draft", async () => {
  const a = setup();
  await flush();
  a.input("post-title", "보존할 글");
  a.input("post-body", "로그아웃 뒤에는 발행하지 않습니다.");
  a.input("post-date", "2026-01-01T12:00");
  const originalFetch = a.w.fetch;
  a.w.fetch = async (url, options = {}) => {
    const result = await originalFetch(url, options);
    if (url.includes("/contents/_posts/") && options.method !== "PUT")
      a.w.DiaryAuth.isAuthorized = () => false;
    return result;
  };
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 0);
  assert.match(a.d.getElementById("writer-status").textContent, /로그인이 해제/);
  assert.equal(JSON.parse(a.w.localStorage.getItem(a.key)).title, "보존할 글");
  a.w.close();
});

test("a successful new post stays editable and does not persist credentials in local storage by default", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  a.input("post-title", "새 글");
  a.input("post-body", "첫 문장");
  a.input("post-date", "2026-01-01T12:00");
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].payload.sha, undefined);
  assert.doesNotMatch(Buffer.from(a.writes[0].payload.content, "base64").toString(), /^category:/m);
  assert.equal(a.d.getElementById("publish-post").textContent, "수정 발행");
  assert.equal(
    JSON.parse(a.w.localStorage.getItem("myDiaryWriterConfigV3")).token,
    undefined,
  );
  assert.equal(JSON.parse(a.w.localStorage.getItem(a.key)).sha, "new-sha");
  a.w.close();
});

test("profile photo uploads before the profile record and oversized photos are rejected", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  const file = new a.w.File(["test image bytes"], "portrait.png", {
    type: "image/png",
  });
  file.arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer;
  let files = [file];
  const picker = a.d.getElementById("profile-photo");
  Object.defineProperty(picker, "files", { get: () => files });
  Object.defineProperty(picker, "value", {
    get: () => (files.length ? "portrait.png" : ""),
    set: (value) => {
      if (!value) files = [];
    },
  });
  a.d.getElementById("save-profile").click();
  await flush();
  assert.equal(a.writes.length, 2);
  assert.match(a.writes[0].url, /assets\/photos\//);
  const saved = JSON.parse(
    Buffer.from(a.writes[1].payload.content, "base64").toString(),
  );
  assert.match(saved.avatar, /^\/assets\/photos\/.+portrait\.png$/);
  assert.equal(picker.files.length, 0);
  const large = new a.w.File(["x"], "large.png", { type: "image/png" });
  Object.defineProperty(large, "size", { value: 11 * 1024 * 1024 });
  files = [large];
  a.d.getElementById("save-profile").click();
  await flush();
  assert.equal(a.writes.length, 2);
  assert.match(a.d.getElementById("profile-status").textContent, /10MB/);
  a.w.close();
});

test("automatic cover preview uses the first body image, explicit cover wins, and opt-out survives reload", async () => {
  const a = setup();
  await flush();
  a.input(
    "post-body",
    '사진 기록\n![첫 사진]({{ "/assets/photos/first.jpg" | relative_url }})\n![두 번째](/assets/photos/second.jpg)',
  );
  const image = a.d.getElementById("cover-card-preview");
  assert.equal(image.getAttribute("src"), "/my-diary/assets/photos/first.jpg");
  a.input("cover-url", "/assets/photos/custom.jpg");
  assert.equal(image.getAttribute("src"), "/my-diary/assets/photos/custom.jpg");
  a.d.getElementById("clear-cover").click();
  assert.equal(image.hidden, true);
  assert.equal(a.d.getElementById("auto-cover").checked, false);
  const b = setup({ draft: JSON.parse(a.w.localStorage.getItem(a.key)) });
  await flush();
  assert.equal(b.d.getElementById("cover-card-preview").hidden, true);
  assert.equal(b.d.getElementById("auto-cover").checked, false);
  a.w.close();
  b.w.close();
});

test("cover opt-out is retained on existing posts and saved as front matter", async () => {
  const a = setup({
    post: oldPost.replace(
      'category: "시"',
      'category: "시"\ncover_auto: false',
    ),
  });
  await flush();
  a.input("gh-token", "test-only-token");
  a.d.getElementById("post-list").value = postPath;
  a.d.getElementById("load-selected-post").click();
  await flush();
  assert.equal(a.d.getElementById("auto-cover").checked, false);
  a.input("post-body", "수정한 기록");
  a.d.getElementById("publish-post").click();
  await flush();
  const markdown = Buffer.from(
    a.writes[0].payload.content,
    "base64",
  ).toString();
  assert.equal((markdown.match(/cover_auto: false/g) || []).length, 1);
  a.w.close();
});

test("cover sizing preserves landscape and portrait ratios and never enlarges small images", async () => {
  const a = setup();
  await flush();
  const size = a.w.DiaryCoverImage.dimensions;
  assert.deepEqual(JSON.parse(JSON.stringify(size(4032, 3024))), {
    width: 1600,
    height: 1200,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(size(3000, 4000))), {
    width: 1200,
    height: 1600,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(size(640, 480))), {
    width: 640,
    height: 480,
  });
  assert.throws(() => size(0, 100), /크기/);
  a.w.close();
});

test("cover publication uploads the optimized file and keeps the body photograph unchanged", async () => {
  const a = setup();
  await flush();
  a.input("gh-token", "test-only-token");
  a.input("post-title", "사진이 있는 기록");
  a.input("post-body", "![본문 사진](/assets/photos/original.png)");
  a.input("post-date", "2026-01-01T12:00");
  const original = new a.w.File(["original"], "photo.png", {
    type: "image/png",
  });
  const optimized = new a.w.File(["jpeg"], "photo-cover.jpg", {
    type: "image/jpeg",
  });
  optimized.arrayBuffer = async () => new Uint8Array([10, 20, 30]).buffer;
  let files = [original];
  const picker = a.d.getElementById("cover-image");
  Object.defineProperty(picker, "files", { get: () => files });
  Object.defineProperty(picker, "value", {
    get: () => (files.length ? "photo.png" : ""),
    set: (value) => {
      if (!value) files = [];
    },
  });
  let selected;
  a.w.DiaryCoverImage.prepare = async (file) => {
    selected = file;
    return { file: optimized, width: 1600, height: 1200 };
  };
  a.d.getElementById("publish-post").click();
  await flush();
  assert.equal(selected, original);
  assert.equal(a.writes.length, 2);
  assert.match(a.writes[0].url, /photo-cover\.jpg$/);
  const markdown = Buffer.from(
    a.writes[1].payload.content,
    "base64",
  ).toString();
  assert.match(markdown, /cover: "\/assets\/photos\/.+photo-cover\.jpg"/);
  assert.match(markdown, /original\.png/);
  assert.equal(picker.files.length, 0);
  a.w.close();
});

test("built archive uses each existing photo without duplicating the GitHub Pages base path", () => {
  const home = new JSDOM(readFileSync("_site/index.html", "utf8"));
  const cards = Array.from(home.window.document.querySelectorAll(".post-card"));
  for (const card of cards) {
    const link = card.querySelector("a").getAttribute("href");
    const post = new JSDOM(
      readFileSync(
        "_site/" + decodeURI(link.replace("/my-diary/", "")) + "index.html",
        "utf8",
      ),
    );
    const source =
      post.window.document.querySelector(".post-cover img") ||
      post.window.document.querySelector(".post-content img");
    const thumbnail = card.querySelector(".post-card-image");
    if (thumbnail) {
      assert.ok(source);
      const photos = Object.values(JSON.parse(readFileSync("_data/photos.json", "utf8")));
      const photo = photos.find(photo => "/my-diary" + photo.display === source.getAttribute("src"));
      assert.equal(thumbnail.getAttribute("src"), photo ? "/my-diary" + photo.small : source.getAttribute("src"));
      assert.equal(thumbnail.getAttribute("loading"), "lazy");
      assert.ok(!thumbnail.getAttribute("src").includes("/my-diary/my-diary/"));
    }
    post.window.close();
  }
  home.window.close();
});
