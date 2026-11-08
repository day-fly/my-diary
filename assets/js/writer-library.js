(() => {
  'use strict';
  const list = document.getElementById('library-list');
  if (!list) return;
  const search = document.getElementById('library-search');
  const filters = Array.from(document.querySelectorAll('[data-library-filter]'));
  let items = [], selected = 'all', busy = false, onAction = () => {};
  const labels = { draft: '임시글', public: '공개', private: '비공개' };
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => (selected === 'all' || item.kind === selected) && item.title.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    filters.forEach(button => {
      const kind = button.dataset.libraryFilter;
      button.textContent = (kind === 'all' ? '전체' : labels[kind]) + ' ' + items.filter(item => kind === 'all' || item.kind === kind).length;
      button.setAttribute('aria-pressed', String(kind === selected)); button.disabled = busy;
    });
    document.getElementById('library-count').textContent = visible.length + '편의 기록';
    if (!visible.length) {
      const empty = document.createElement('p'); empty.className = 'library-empty';
      empty.textContent = query ? '일치하는 제목이 없어요. 검색어를 바꿔 보세요.' : selected === 'draft' ? '보관함 저장을 누르면 임시글이 여기에 모입니다.' : '목록 새로고침으로 저장된 기록을 불러오세요.';
      list.appendChild(empty);
    }
    for (const item of visible) {
      const row = document.createElement('article'); row.className = 'library-row'; row.dataset.kind = item.kind;
      const text = document.createElement('div'); text.className = 'library-row-text';
      const meta = document.createElement('p'); meta.className = 'library-row-meta';
      const badge = document.createElement('span'); badge.className = 'library-badge'; badge.textContent = labels[item.kind];
      const date = document.createElement('span'); date.textContent = item.date || '';
      const title = document.createElement('h3'); title.textContent = item.title || '제목 없는 임시글';
      meta.append(badge, date); text.append(meta, title);
      const actions = document.createElement('div'); actions.className = 'library-row-actions';
      const choices = item.kind === 'draft' ? [['open', '이어 쓰기'], ['delete-draft', '삭제']] : [['open', '수정'], ['visibility', item.kind === 'public' ? '비공개로' : '공개로']];
      for (const [action, label] of choices) {
        const button = document.createElement('button'); button.type = 'button'; button.className = action === 'open' ? 'btn-light' : 'text-link'; button.textContent = label;
        button.setAttribute('aria-label', item.title + ' · ' + label); button.disabled = busy;
        button.addEventListener('click', () => { if (!busy) onAction(action, item); }); actions.appendChild(button);
      }
      row.append(text, actions); list.appendChild(row);
    }
  }
  search.addEventListener('input', render);
  filters.forEach(button => button.addEventListener('click', () => { selected = button.dataset.libraryFilter; render(); }));
  window.DiaryLibrary = {
    setItems(next) { items = next.map(item => ({...item, title: String(item.title || '제목 없는 임시글')})).sort((a,b) => (b.sortDate || b.date || '').localeCompare(a.sortDate || a.date || '')); render(); },
    onAction(callback) { onAction = callback; },
    setBusy(value) { busy = value; search.disabled = value; render(); },
    select(kind) { selected = kind; search.value = ''; render(); },
    clear() { items = []; search.value = ''; selected = 'all'; render(); },
  };
  render();
})();
