const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const source = readFileSync("assets/js/background-music.js", "utf8");
const markup = readFileSync("_includes/background-music.html", "utf8").replace(
  /{{.*?}}/g,
  "/my-diary/assets/audio/touching-moments-one-pulse.mp3",
);
const key = "diary:music:/my-diary/assets/audio/touching-moments-one-pulse.mp3";
function setup(saved, blocked = false) {
  const dom = new JSDOM(markup, {
    url: "https://example.com/my-diary/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  const q = (selector) => w.document.querySelector(selector);
  const audio = q("audio");
  let plays = 0;
  let resolvePlay, rejectPlay;
  let paused = true;
  Object.defineProperty(audio, "paused", { get: () => paused });
  Object.defineProperty(audio, "duration", { value: 102 });
  audio.play = () => {
    plays += 1;
    paused = false;
    return new Promise((resolve, reject) => {
      resolvePlay = resolve;
      rejectPlay = reject;
    });
  };
  audio.pause = () => {
    if (paused) return;
    paused = true;
    audio.dispatchEvent(new w.Event("pause"));
  };
  audio.load = () => {};
  if (saved) w.sessionStorage.setItem(key, JSON.stringify(saved));
  if (blocked)
    Object.defineProperty(w, "sessionStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  w.eval(source);
  return {
    w,
    q,
    audio,
    plays: () => plays,
    resolve: () => resolvePlay(),
    reject: (error) => rejectPlay(error),
    click: () => q(".music-toggle").click(),
    state: () => q(".music-player").dataset.state,
  };
}
test("music stays silent and does not request its file before an explicit click", () => {
  const a = setup({ position: 38, volume: 0.4 });
  assert.equal(a.plays(), 0);
  assert.equal(a.audio.hasAttribute("src"), false);
  assert.equal(a.audio.autoplay, false);
  assert.equal(a.audio.preload, "none");
  assert.equal(a.audio.loop, true);
  assert.equal(a.audio.volume, 0.4);
  assert.equal(a.q(".music-toggle").getAttribute("aria-pressed"), "false");
  assert.equal(a.q(".music-player").hidden, false);
  a.w.close();
});
test("canceling a slow start cannot turn the player back on when an old promise resolves", async () => {
  const a = setup();
  a.click();
  assert.equal(a.state(), "loading");
  assert.equal(
    a.audio.getAttribute("src"),
    "/my-diary/assets/audio/touching-moments-one-pulse.mp3",
  );
  a.click();
  a.resolve();
  await Promise.resolve();
  assert.equal(a.state(), "paused");
  assert.equal(a.audio.paused, true);
  assert.equal(a.q(".music-toggle").getAttribute("aria-pressed"), "false");
  a.w.close();
});
test("playback, pause, volume and position survive a page change without autoplay", async () => {
  const a = setup({ position: 38, volume: 0.25 });
  a.click();
  a.audio.dispatchEvent(new a.w.Event("loadedmetadata"));
  assert.equal(a.audio.currentTime, 38);
  a.resolve();
  await Promise.resolve();
  assert.equal(a.state(), "playing");
  assert.equal(
    a.q(".music-toggle").getAttribute("aria-label"),
    "배경음악 일시정지",
  );
  a.q("#music-volume").value = "0";
  a.q("#music-volume").dispatchEvent(new a.w.Event("input"));
  assert.equal(a.audio.muted, true);
  a.audio.currentTime = 51;
  a.w.dispatchEvent(new a.w.Event("pagehide"));
  assert.equal(a.audio.paused, true);
  const saved = JSON.parse(a.w.sessionStorage.getItem(key));
  assert.deepEqual(saved, { position: 51, volume: 0 });
  a.w.close();
  const b = setup(saved);
  assert.equal(b.plays(), 0);
  assert.equal(b.audio.muted, true);
  b.click();
  b.audio.dispatchEvent(new b.w.Event("loadedmetadata"));
  assert.equal(b.audio.currentTime, 51);
  b.w.close();
});
test("blocked playback and media failure offer retry even when browser storage is blocked", async () => {
  const a = setup(null, true);
  a.click();
  a.reject({ name: "NotAllowedError" });
  await Promise.resolve();
  assert.equal(a.state(), "paused");
  assert.match(a.q(".music-message").textContent, /다시 눌러/);
  a.click();
  a.resolve();
  await Promise.resolve();
  assert.equal(a.state(), "playing");
  a.audio.dispatchEvent(new a.w.Event("error"));
  assert.equal(a.state(), "paused");
  assert.match(a.q(".music-message").textContent, /불러오지 못/);
  a.click();
  assert.equal(a.q(".music-message").hidden, true);
  a.w.close();
});
test("music information is keyboard dismissible and provides visible source and license links", () => {
  const a = setup();
  const details = a.q(".music-details");
  details.click();
  assert.equal(a.q(".music-panel").hidden, false);
  assert.equal(details.getAttribute("aria-expanded"), "true");
  assert.match(a.q(".music-credit a").href, /incompetech.com.*USUAN1100039/);
  assert.equal(
    a.q(".music-license").href,
    "https://creativecommons.org/licenses/by/4.0/",
  );
  a.q("#music-volume").focus();
  a.q("#music-volume").dispatchEvent(
    new a.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(a.q(".music-panel").hidden, true);
  assert.equal(a.w.document.activeElement, details);
  a.w.close();
});
