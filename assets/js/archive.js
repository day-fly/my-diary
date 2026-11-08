(() => {
  const archive = document.querySelector('[data-archive]');
  if (!archive) return;
  const search = document.getElementById('post-search');
  const cards = Array.from(archive.querySelectorAll('[data-search]'));
  const years = Array.from(archive.querySelectorAll('[data-archive-year]'));
  let year = '';
  function readLocation() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('year') || '';
    year = years.some(button => button.dataset.archiveYear === requested) ? requested : '';
    search.value = params.get('q') || '';
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    cards.forEach(card => {
      const matches = (!year || card.dataset.year === year) && card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) count++;
    });
    years.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.archiveYear === year)));
    document.getElementById('result-count').textContent = (year ? year + '년 · ' : '') + (query || year ? count + '편의 기록' : '최신순 · ' + count + '편');
    document.getElementById('search-empty').hidden = count > 0;
  }
  function saveLocation(push) {
    const url = new URL(location.href);
    if (year) url.searchParams.set('year', year); else url.searchParams.delete('year');
    if (search.value.trim()) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
    try { if (url.href !== location.href) history[push ? 'pushState' : 'replaceState']({}, '', url.pathname + url.search + url.hash); } catch (_) { /* Filtering still works when history is unavailable. */ }
  }
  search.addEventListener('input', () => { render(); saveLocation(false); });
  years.forEach(button => button.addEventListener('click', () => { year = button.dataset.archiveYear; render(); saveLocation(true); }));
  document.getElementById('reset-search').addEventListener('click', () => {
    year = ''; search.value = ''; render(); saveLocation(true); search.focus();
  });
  window.addEventListener('popstate', () => { readLocation(); render(); });
  window.addEventListener('pageshow', render);
  const group = archive.querySelector('.archive-years');
  if (group) group.hidden = false;
  readLocation(); render();
})();
