(function () {
  "use strict";
  const root = document.documentElement;
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const seasons = {
    spring: { name: "봄", note: "새로운 마음이 피어나는 계절." },
    summer: { name: "여름", note: "초록이 짙어지는 날들의 기록." },
    autumn: { name: "가을", note: "마음이 깊어지는 계절의 문장." },
    winter: { name: "겨울", note: "고요한 날들에 남기는 온기." },
  };
  let midnightTimer;
  function apply(date) {
    const month = Number(monthFormatter.format(date));
    const key =
      month >= 3 && month <= 5
        ? "spring"
        : month >= 6 && month <= 8
          ? "summer"
          : month >= 9 && month <= 11
            ? "autumn"
            : "winter";
    root.dataset.season = key;
    document.querySelectorAll("[data-season-name]").forEach((node) => {
      node.textContent = seasons[key].name + "의 기록";
    });
    document.querySelectorAll("[data-season-note]").forEach((node) => {
      node.textContent = seasons[key].note;
    });
    // The stylesheet is ready after DOMContentLoaded; keep browser chrome in sync.
    const background = getComputedStyle(root).getPropertyValue("--bg").trim();
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (background && themeColor) themeColor.content = background;
  }
  function refresh() {
    const now = new Date();
    apply(now);
    clearTimeout(midnightTimer);
    const parts = Object.fromEntries(
      timeFormatter.formatToParts(now).map((part) => [part.type, part.value]),
    );
    const elapsed =
      (Number(parts.hour) * 3600 +
        Number(parts.minute) * 60 +
        Number(parts.second)) *
        1000 +
      now.getMilliseconds();
    // Recheck at Korea's next midnight, even when the page stays open across a season boundary.
    midnightTimer = setTimeout(refresh, 86400000 - elapsed + 50);
  }
  refresh();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
})();
