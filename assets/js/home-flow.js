(() => {
  const container = document.querySelector("[data-post-flow]");
  if (!container) return;

  const posts = Array.from(container.querySelectorAll("[data-flow-post]"));
  if (posts.length === 0) return;

  const prevButton = container.querySelector("[data-flow-prev]");
  const nextButton = container.querySelector("[data-flow-next]");
  const currentText = container.querySelector("[data-flow-current]");
  const totalText = container.querySelector("[data-flow-total]");

  let currentIndex = 0;

  const render = () => {
    posts.forEach((post, index) => {
      const isActive = index === currentIndex;
      post.classList.toggle("is-active", isActive);
      post.setAttribute("aria-hidden", isActive ? "false" : "true");
    });

    if (currentText) {
      currentText.textContent = String(currentIndex + 1);
    }
    if (totalText) {
      totalText.textContent = String(posts.length);
    }
  };

  prevButton?.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + posts.length) % posts.length;
    render();
  });

  nextButton?.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % posts.length;
    render();
  });

  render();
})();
