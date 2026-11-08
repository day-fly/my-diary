const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const source = readFileSync("assets/js/background-music.js", "utf8");
const built = new JSDOM(readFileSync("_site/index.html", "utf8"));
const markup = built.window.document.querySelector(".music-player").outerHTML;
built.window.close();
const tracks = JSON.parse(readFileSync("_data/music.json", "utf8"));
const ids = tracks.map(track => track.id);
const key = "diary:music:playlist:v1:/my-diary/";
const legacyKey = "diary:music:/my-diary/assets/audio/touching-moments-one-pulse.mp3";
function setup({ saved, preference, legacySaved, legacyPreference, blocked = false, configure } = {}) {
  const dom = new JSDOM(markup, { url: "https://example.com/my-diary/", runScripts: "outside-only" });
  const w = dom.window, q = selector => w.document.querySelector(selector), audio = q("audio");
  let plays = 0, paused = true, ended = false, error = null;
  const requests = [];
  w.Math.random = () => 0.37;
  Object.defineProperties(audio, {
    paused: { get: () => paused }, ended: { get: () => ended },
    duration: { value: 102 }, error: { get: () => error },
  });
  audio.play = () => {
    plays++; paused = false; ended = false;
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  };
  audio.pause = () => { if (!paused) { paused = true; audio.dispatchEvent(new w.Event("pause")); } };
  audio.load = () => { audio.currentTime = 0; ended = false; error = null; };
  if (saved) w.sessionStorage.setItem(key, JSON.stringify(saved));
  if (preference) w.localStorage.setItem(key + ":preference", JSON.stringify(preference));
  if (legacySaved) w.sessionStorage.setItem(legacyKey, JSON.stringify(legacySaved));
  if (legacyPreference) w.localStorage.setItem(legacyKey + ":preference", JSON.stringify(legacyPreference));
  if (blocked) ["sessionStorage", "localStorage"].forEach(name => Object.defineProperty(w, name, { get() { throw new Error("blocked"); } }));
  if(configure)configure(w);
  w.eval(source);
  return {
    w, q, audio, requests, plays: () => plays, click: () => q(".music-toggle").click(),
    state: () => q(".music-player").dataset.state, track: () => q("#music-track-select").value,
    saved: () => JSON.parse(w.sessionStorage.getItem(key)), preference: () => JSON.parse(w.localStorage.getItem(key + ":preference")),
    next: () => q(".music-next").click(), previous: () => q(".music-previous").click(),
    choose: id => { q("#music-track-select").value = id; q("#music-track-select").dispatchEvent(new w.Event("change")); },
    finish: () => { paused = true; ended = true; audio.currentTime = 102; audio.dispatchEvent(new w.Event("pause")); audio.dispatchEvent(new w.Event("ended")); },
    fail: () => { error = { code: 4 }; audio.dispatchEvent(new w.Event("error")); },
  };
}
test("first visit attempts quiet autoplay with a complete shuffled playlist, not a single-track loop", async () => {
  const a = setup();
  assert.equal(a.plays(), 1);
  assert.equal(a.audio.volume, 0.2);
  assert.equal(a.audio.loop, false);
  assert.equal(a.state(), "loading");
  assert.deepEqual([...a.saved().queue].sort(), [...ids].sort());
  assert.equal(a.q(".music-shuffle").getAttribute("aria-pressed"), "true");
  a.requests[0].resolve(); await Promise.resolve();
  assert.equal(a.state(), "playing");
  assert.equal(a.q(".music-toggle").getAttribute("aria-label"), "배경음악 일시정지"); a.w.close();
});
test("explicit off remains off and choosing a different song does not download or play it", () => {
  const a = setup({ preference: { enabled: false, volume: 0.35 } });
  a.next(); a.choose("meditation");
  assert.equal(a.plays(), 0);
  assert.equal(a.audio.hasAttribute("src"), false);
  assert.equal(a.audio.volume, 0.35);
  a.click(); assert.equal(a.plays(), 1);
  assert.equal(a.preference().enabled, true);
  a.click(); assert.equal(a.preference().enabled, false); a.w.close();
});
test("canceling slow autoplay cannot be undone by its late result", async () => {
  const a = setup(); a.click();
  a.requests[0].resolve(); await Promise.resolve();
  a.audio.dispatchEvent(new a.w.Event("playing"));
  assert.equal(a.audio.paused, true);
  assert.equal(a.state(), "paused");
  assert.equal(a.preference().enabled, false); a.w.close();
});
test("page navigation restores the same song, listening position, shuffle order and muted volume", async () => {
  const a = setup({ saved: { track: "dream", position: 38, volume: 0.25, shuffle: true, queue: [...ids].reverse() } });
  a.audio.dispatchEvent(new a.w.Event("loadedmetadata"));
  assert.equal(a.track(), "dream"); assert.equal(a.audio.currentTime, 38);
  a.requests[0].resolve(); await Promise.resolve();
  a.q("#music-volume").value = "0";
  a.q("#music-volume").dispatchEvent(new a.w.Event("input"));
  a.audio.currentTime = 51; a.w.dispatchEvent(new a.w.Event("pagehide"));
  const saved = a.saved(), preference = a.preference();
  assert.equal(saved.position, 51); assert.equal(saved.enabled, true);
  assert.equal(a.audio.paused, true); a.w.close();
  const b = setup({ saved, preference });
  assert.equal(b.track(), "dream"); assert.equal(b.plays(), 1); assert.equal(b.audio.muted, true);
  assert.deepEqual(b.saved().queue, saved.queue);
  b.audio.dispatchEvent(new b.w.Event("loadedmetadata")); assert.equal(b.audio.currentTime, 51); b.w.close();
});
test("existing single-song listeners retain their off preference, volume, and position", () => {
  const a = setup({ legacySaved: { position: 38, volume: 0.3 }, legacyPreference: { enabled: false, volume: 0.4 } });
  assert.equal(a.track(), "pulse"); assert.equal(a.plays(), 0); assert.equal(a.audio.volume, 0.4);
  a.click(); a.audio.dispatchEvent(new a.w.Event("loadedmetadata"));
  assert.equal(a.audio.currentTime, 38); assert.equal(a.saved().track, "pulse"); a.w.close();
});
test("autoplay restrictions stay quiet and manual playback recovers with storage blocked", async () => {
  const a = setup({ blocked: true });
  a.requests[0].reject({ name: "NotAllowedError" }); await Promise.resolve();
  assert.equal(a.state(), "paused"); assert.equal(a.q(".music-message").hidden, true);
  assert.match(a.q(".music-help").textContent, /재생 버튼/);
  a.click(); a.requests[1].resolve(); await Promise.resolve(); assert.equal(a.state(), "playing");
  a.q(".music-details").click(); a.fail();
  assert.equal(a.state(), "paused"); assert.match(a.q(".music-message").textContent, /다음 곡/);
  const old = a.track(); a.next(); assert.notEqual(a.track(), old);
  assert.equal(a.q(".music-message").hidden, true); a.w.close();
});
test("compact controls retain song selection, playback, credits, and keyboard dismissal", async () => {
  const a = setup();
  Object.defineProperty(a.w, "scrollY", { value: 300 }); a.w.dispatchEvent(new a.w.Event("scroll"));
  assert.equal(a.q(".music-player").classList.contains("is-compact"), true);
  a.requests[0].resolve(); await Promise.resolve();
  const details = a.q(".music-details"); details.click();
  assert.equal(a.q(".music-panel").hidden, false);
  a.q(".music-panel-toggle").click(); assert.equal(a.audio.paused, true);
  a.choose("evening");
  assert.match(a.q(".music-credit a").href, /USUAN1100236/);
  assert.equal(a.q(".music-track").textContent, "Evening Fall (Harp)");
  assert.equal(a.q(".music-license").href, "https://creativecommons.org/licenses/by/4.0/");
  a.q("#music-track-select").dispatchEvent(new a.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(a.q(".music-panel").hidden, true); assert.equal(a.w.document.activeElement, details); a.w.close();
});
test("back-forward cache resumes only when the listener kept music enabled", () => {
  const a = setup(); a.w.dispatchEvent(new a.w.Event("pagehide"));
  const event = new a.w.Event("pageshow"); Object.defineProperty(event, "persisted", { value: true });
  a.w.dispatchEvent(event); assert.equal(a.plays(), 2);
  a.click(); a.w.dispatchEvent(new a.w.Event("pagehide")); a.w.dispatchEvent(event);
  assert.equal(a.plays(), 2); a.w.close();
});
test("ended songs advance through every track before the playlist repeats", () => {
  const a = setup(); const order = a.saved().queue, first = a.track();
  const heard = [first];
  for (let i = 1; i < ids.length; i++) { a.finish(); heard.push(a.track()); assert.equal(a.audio.currentTime, 0); }
  assert.deepEqual(heard, order);
  a.finish(); assert.equal(a.track(), first); assert.equal(a.plays(), ids.length + 1); a.w.close();
});
test("previous, next, and direct selection update the source and attribution and reset position", () => {
  const a = setup({ preference: { shuffle: false } });
  a.audio.currentTime = 42; a.next(); assert.equal(a.track(), "meditation"); assert.equal(a.audio.currentTime, 0);
  assert.match(a.audio.src, /meditation-impromptu-01.mp3$/);
  a.previous(); assert.equal(a.track(), "pulse");
  a.previous(); assert.equal(a.track(), "melody");
  a.choose("porch"); assert.match(a.q(".music-credit a").href, /USUAN1100715/);
  assert.match(a.audio.src, /porch-swing-days-slower.mp3$/); a.w.close();
});
test("changing shuffle mode preserves the current song and playback position", () => {
  const a = setup(); const current = a.track(); a.audio.currentTime = 31;
  a.q(".music-shuffle").click(); assert.deepEqual(a.saved().queue, ids);
  assert.equal(a.track(), current); assert.equal(a.audio.currentTime, 31); assert.equal(a.plays(), 1);
  a.q(".music-shuffle").click(); assert.equal(a.track(), current); assert.equal(a.audio.currentTime, 31);
  assert.deepEqual([...a.saved().queue].sort(), [...ids].sort());
  assert.equal(a.plays(), 1); a.w.close();
});
test("a fresh visit avoids starting with the last song when shuffle is enabled", () => {
  const a = setup(); const last = a.track(), preference = a.preference(); a.w.close();
  const b = setup({ preference }); assert.notEqual(b.track(), last); b.w.close();
});
test("invalid saved song and queue data safely fall back to a complete playlist", () => {
  const a = setup({ saved: { track: "removed", position: -90, queue: ["pulse", "pulse"], shuffle: true }, preference: { volume: 99 } });
  assert.equal(ids.includes(a.track()), true); assert.equal(a.audio.volume, 0.2);
  assert.deepEqual([...a.saved().queue].sort(), [...ids].sort());
  a.audio.dispatchEvent(new a.w.Event("loadedmetadata")); assert.equal(a.audio.currentTime, 0); a.w.close();
});
test("late pause and play rejection from the old song cannot stop the new song", async () => {
  const a = setup(); a.next();
  a.audio.dispatchEvent(new a.w.Event("pause"));
  a.requests[0].reject({ name: "AbortError" }); a.requests[1].resolve(); await Promise.resolve();
  assert.equal(a.state(), "playing"); assert.equal(a.audio.paused, false); a.w.close();
});
test("ended events after stopping or leaving cannot restart playback", () => {
  const a = setup(); const first = a.track(); a.click(); a.finish();
  assert.equal(a.track(), first); assert.equal(a.plays(), 1);
  a.click(); a.w.dispatchEvent(new a.w.Event("pagehide")); a.finish();
  assert.equal(a.track(), first); assert.equal(a.plays(), 2); a.w.close();
});
test("every playlist file exists locally and has explicit source and license credits", () => {
  const credits = readFileSync("assets/audio/CREDITS.txt", "utf8");
  for (const track of tracks) {
    assert.ok(statSync(track.src.slice(1)).size > 100000);
    assert.ok(credits.includes(track.title)); assert.ok(credits.includes(track.isrc)); assert.ok(credits.includes(track.original));
  }
  assert.match(credits, /creativecommons.org\/licenses\/by\/4.0/);
});
