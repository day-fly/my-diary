(() => {
  "use strict";
  const layer = document.querySelector(".season-effects");
  const buttons = Array.from(document.querySelectorAll("[data-season-effects-toggle]"));
  if (!layer || !buttons.length) return;
  const key = "diary:season-effects";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let enabled = true;
  try { enabled = localStorage.getItem(key) !== "off"; } catch (_) {}
  for (let index = 0; index < 18; index++) {
    const particle = document.createElement("span");
    particle.className = "season-particle";
    particle.style.setProperty("--x", (4 + (index * 0.618034 % 1) * 92).toFixed(2) + "%");
    particle.style.setProperty("--drift", ((index % 2 ? -1 : 1) * (20 + index % 5 * 9)) + "px");
    particle.style.setProperty("--duration", (19 + index % 5 * 4) + "s");
    particle.style.setProperty("--delay", (-index * 3.7) + "s");
    particle.style.setProperty("--turn", (index % 2 ? -210 : 240) + "deg");
    particle.style.setProperty("--size", (7 + index % 3 * 2) + "px");
    layer.append(particle);
  }
  function render() {
    const active = enabled && !motion.matches;
    layer.hidden = !active;
    layer.dataset.paused = String(document.hidden);
    buttons.forEach(button => {
      button.disabled = motion.matches;
      button.setAttribute("aria-pressed", String(active));
      button.textContent = motion.matches ? "계절 효과 꺼짐 · 기기 설정" : active ? "계절 효과 끄기" : "계절 효과 켜기";
    });
  }
  buttons.forEach(button => button.addEventListener("click", () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? "on" : "off"); } catch (_) {}
    render();
  }));
  motion.addEventListener("change", render);
  document.addEventListener("visibilitychange", render);
  buttons.forEach(button => button.hidden = false);
  render();
})();
