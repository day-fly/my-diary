(() => {
  "use strict";
  const controls = document.querySelector(".reading-controls");
  const content = document.querySelector(".post > .post-content");
  if (!controls || !content) return;
  const key = "diary:reading-size";
  let size = 17;
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isInteger(saved) && saved >= 16 && saved <= 22) size = saved;
  } catch (_) {}
  function render() {
    content.style.setProperty("--reading-size", size + "px");
    controls.querySelector("output").textContent = size + "px";
    controls.querySelector('[data-reading-size="decrease"]').disabled = size === 16;
    controls.querySelector('[data-reading-size="increase"]').disabled = size === 22;
  }
  controls.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      size = Math.max(16, Math.min(22, size + (button.dataset.readingSize === "increase" ? 1 : -1)));
      render();
      try { localStorage.setItem(key, String(size)); } catch (_) {}
    });
  });
  render();
  controls.hidden = false;
})();
