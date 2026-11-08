(() => {
  const archive = document.querySelector("[data-archive]");
  if (!archive) return;
  const search = document.getElementById("post-search");
  const cards = Array.from(archive.querySelectorAll("[data-search]"));
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    cards.forEach((card) => {
      const matches = card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) count++;
    });
    document.getElementById("result-count").textContent =
      query ? count + "편의 기록" : "최신순";
    document.getElementById("search-empty").hidden = count > 0;
  }
  search.addEventListener("input", render);
  document.getElementById("reset-search").addEventListener("click", () => {
    search.value = "";
    render();
    search.focus();
  });
  window.addEventListener("pageshow", render);
  render();
})();
