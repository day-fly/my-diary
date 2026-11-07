const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const source = readFileSync("assets/js/seasons.js", "utf8");
function setup(instant) {
  let now = instant,
    timerId = 0;
  const timers = new Map();
  const dom = new JSDOM(
    '<!doctype html><html data-season="autumn"><head><meta name="theme-color" content="#ffffff"></head><body><span data-season-name></span><span data-season-note></span></body></html>',
    { runScripts: "outside-only" },
  );
  const w = dom.window;
  const RealDate = Date;
  w.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return new RealDate(now).getTime();
    }
  };
  w.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  w.clearTimeout = (id) => timers.delete(id);
  w.getComputedStyle = () => ({
    getPropertyValue: () =>
      ({
        spring: "#faf6f5",
        summer: "#f3f7f3",
        autumn: "#faf5ee",
        winter: "#f3f6f9",
      })[w.document.documentElement.dataset.season],
  });
  w.eval(source);
  return {
    w,
    dom,
    timers,
    setTime: (value) => {
      now = value;
    },
    season: () => w.document.documentElement.dataset.season,
  };
}
test("all twelve Korean calendar months map to the intended season", () => {
  const expected = [
    "winter",
    "winter",
    "spring",
    "spring",
    "spring",
    "summer",
    "summer",
    "summer",
    "autumn",
    "autumn",
    "autumn",
    "winter",
  ];
  expected.forEach((season, index) => {
    const a = setup(`2026-${String(index + 1).padStart(2, "0")}-15T00:00:00Z`);
    assert.equal(a.season(), season);
    a.w.close();
  });
});
test("season boundaries change at Korean midnight, nine hours before UTC midnight", () => {
  [
    ["2026-02-28", "winter", "spring"],
    ["2026-05-31", "spring", "summer"],
    ["2026-08-31", "summer", "autumn"],
    ["2026-11-30", "autumn", "winter"],
  ].forEach(([day, before, after]) => {
    const a = setup(day + "T14:59:59.999Z");
    assert.equal(a.season(), before);
    a.w.close();
    const b = setup(day + "T15:00:00.000Z");
    assert.equal(b.season(), after);
    b.w.close();
  });
});
test("a page kept open updates its season, labels, and browser color at midnight", () => {
  const a = setup("2026-08-31T14:59:59.999Z");
  const timer = [...a.timers.values()][0];
  assert.equal(timer.delay, 51);
  a.setTime("2026-08-31T15:00:00.050Z");
  timer.callback();
  assert.equal(a.season(), "autumn");
  assert.equal(
    a.w.document.querySelector("[data-season-name]").textContent,
    "가을의 기록",
  );
  assert.match(
    a.w.document.querySelector("[data-season-note]").textContent,
    /깊어지는/,
  );
  assert.equal(a.w.document.querySelector("meta").content, "#faf5ee");
  assert.equal(a.timers.size, 1);
  a.w.close();
});
test("returning to a suspended page refreshes the season and reschedules a single timer", () => {
  const a = setup("2026-11-30T14:00:00Z");
  a.setTime("2026-12-01T05:00:00Z");
  Object.defineProperty(a.w.document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  a.w.document.dispatchEvent(new a.w.Event("visibilitychange"));
  assert.equal(a.season(), "winter");
  assert.equal(a.timers.size, 1);
  a.setTime("2027-03-01T00:00:00Z");
  a.w.dispatchEvent(new a.w.Event("pageshow"));
  assert.equal(a.season(), "spring");
  assert.equal(a.timers.size, 1);
  a.w.close();
});
test("leap day and the winter year boundary do not switch seasons early", () => {
  const a = setup("2028-02-28T15:00:00Z");
  assert.equal(a.season(), "winter");
  a.w.close();
  const b = setup("2026-12-31T15:00:00Z");
  assert.equal(b.season(), "winter");
  b.w.close();
});
test("all seasonal palettes keep text and primary buttons above WCAG AA contrast", () => {
  const css = readFileSync("assets/css/style.css", "utf8");
  const luminance = (hex) => {
    const values = hex
      .match(/[a-f\d]{2}/gi)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrast = (a, b) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  for (const season of ["spring", "summer", "autumn", "winter"]) {
    const block = css.match(
      new RegExp(':root\\[data-season="' + season + '"\\]\\s*\\{([^}]+)\\}'),
    )[1];
    const colors = Object.fromEntries(
      [...block.matchAll(/--([a-z-]+):\s*(#[a-f\d]{6})/gi)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    for (const background of ["bg", "paper", "feature-bg", "profile-bg"]) {
      for (const foreground of ["ink", "ink-soft", "accent"])
        assert.ok(
          contrast(colors[foreground], colors[background]) >= 4.5,
          `${season}: ${foreground} on ${background}`,
        );
    }
    assert.ok(
      contrast("#ffffff", colors.accent) >= 4.5,
      `${season}: primary button`,
    );
  }
});
