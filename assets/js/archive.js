(() => {
  const archive = document.querySelector("[data-archive]");
  if (!archive) return;
  const search = document.getElementById("post-search");
  const cards = Array.from(archive.querySelectorAll("[data-category]"));
  const filters = Array.from(archive.querySelectorAll("[data-filter]"));
  let category = "전체";
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    cards.forEach((card) => {
      const known = ["시", "에세이", "일기"].includes(card.dataset.category);
      const matches =
        (category === "전체" ||
          (category === "기록"
            ? !known
            : card.dataset.category === category)) &&
        card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) count++;
    });
    document.getElementById("result-count").textContent =
      query || category !== "전체" ? count + "편의 기록" : "최신순";
    document.getElementById("search-empty").hidden = count > 0;
    filters.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.filter === category),
      ),
    );
  }
  search.addEventListener("input", render);
  filters.forEach((button) =>
    button.addEventListener("click", () => {
      category = button.dataset.filter;
      render();
    }),
  );
  document.getElementById("reset-search").addEventListener("click", () => {
    search.value = "";
    category = "전체";
    render();
    search.focus();
  });
})();
