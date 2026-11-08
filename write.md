---
layout: default
title: "글쓰기"
permalink: /write/
---

<div class="writer-page" data-owner="{{ site.writer.owner | escape }}" data-repo="{{ site.writer.repo | escape }}" data-branch="{{ site.writer.branch | escape }}" data-private-repo="{{ site.writer.private_repo | escape }}" data-private-branch="{{ site.writer.private_branch | escape }}">
  <header class="writer-heading"><div><p class="eyebrow">YOUR WRITING ROOM</p><h1><span data-guest-only>작성자 로그인</span><span data-author-only hidden>한 편의 기록</span></h1></div><a class="text-link" href="{{ '/' | relative_url }}">기록으로 돌아가기 ↗</a></header>
  <p class="writer-login-help" data-guest-only>하루살이의 글을 쓰고 다듬는 공간입니다.<br />작성자 계정으로 로그인하면 글쓰기와 수정 메뉴가 열립니다.</p>
  <noscript><p class="writer-help">로그인하려면 브라우저의 자바스크립트를 켜 주세요.</p></noscript>
  <p id="writer-status" class="writer-status" role="status" aria-live="polite"></p>
  <details class="writer-panel writer-connection-panel" id="connection" open>
    <summary><span>작성자 계정</span><span class="summary-note" id="connection-state">로그인이 필요해요</span></summary>
    <p id="author-status" class="writer-status" role="status" data-author-status>작성자 계정으로 로그인해 주세요.</p>
    <div class="writer-fields"><label>GitHub 로그인 키<input id="gh-token" type="password" placeholder="기존 발행에 사용하던 GitHub 토큰" autocomplete="off" spellcheck="false" /><span class="writer-tip">@{{ site.writer.owner }} 계정의 이 블로그 발행용 토큰을 사용하세요.</span></label><label class="writer-check"><input id="remember-token" type="checkbox" /> 이 기기에 로그인 정보 기억하기 (개인 기기에서만)</label></div>
    <div class="writer-inline"><button id="save-config" type="button" class="btn-strong">로그인</button><button id="oauth-logout" type="button" class="btn-light" data-author-only hidden>로그아웃</button></div>
    <input id="gh-owner" type="hidden" /><input id="gh-repo" type="hidden" /><input id="gh-branch" type="hidden" />
    <div id="oauth-ready-action" class="writer-inline" hidden><button id="oauth-login" type="button" class="btn-light">GitHub로 로그인</button></div>
    <details class="advanced-settings"><summary>GitHub 간편 로그인 설정</summary>
      <p class="writer-help">GitHub 간편 로그인을 연결해 둔 경우에만 입력하세요.</p>
      <div class="writer-fields writer-fields-two"><label>OAuth Client ID<input id="oauth-client-id" type="text" placeholder="GitHub OAuth App의 Client ID" autocomplete="off" /></label><label>OAuth Proxy URL<input id="oauth-proxy-url" type="url" placeholder="https://your-worker.workers.dev" autocomplete="off" /></label></div>
    </details>
    <p id="oauth-status" class="writer-status" aria-live="polite"></p>
  </details>
  <div class="writer-workspace" data-author-only hidden>
  <nav class="writer-shortcuts" aria-label="작성자 메뉴"><a class="text-link" href="#manage" data-library-view="all">글 관리 ↗</a><a class="text-link" href="#manage" data-library-view="draft">임시글 보관함 ↗</a></nav>
  <div class="writer-actionbar"><div><span id="draft-status" role="status">이 브라우저에 자동 임시저장</span><span id="word-count" class="muted">0자</span></div><div class="writer-main-actions"><button id="new-draft" type="button" class="btn-light">새 글</button><button id="save-draft" type="button" class="btn-light">보관함 저장</button><button id="publish-post" type="button" class="btn-strong">발행하기 <span aria-hidden="true">↗</span></button></div></div>
  <section class="publication-status" id="publication-status" aria-label="사이트 반영 상태" hidden>
    <ol class="publication-steps"><li data-publication-step="saved">저장됨</li><li data-publication-step="pending">사이트 반영 중</li><li data-publication-step="complete">반영 완료</li></ol>
    <p id="publication-message" role="status" aria-live="polite"></p>
    <div class="writer-inline"><a id="publication-link" class="text-link" hidden>글 확인하기 ↗</a><button id="publication-retry" class="btn-light" type="button" hidden>다시 확인</button></div>
  </section>
  <p class="draft-cloud-help">작성 중에는 이 기기에 자동 임시저장됩니다. <strong>보관함 저장</strong>을 누르면 사진까지 비공개로 보관되어, 폰과 PC에서 이어 쓸 수 있어요.</p>
  <section class="writer-panel writing-sheet">
    <div class="editor-tabs" role="group" aria-label="편집 화면"><button id="show-editor" type="button" aria-pressed="true" aria-controls="editor-pane">작성</button><button id="show-preview" type="button" aria-pressed="false" aria-controls="preview-pane">미리보기</button></div>
    <div id="editor-pane">
      <label class="title-field"><span class="sr-only">글 제목</span><input id="post-title" type="text" placeholder="어떤 제목을 붙여볼까요?" autocomplete="off" maxlength="200" /></label>
      <div class="editor-meta writer-fields"><label>기록 날짜<input id="post-date" type="datetime-local" /></label><label>공개 범위<select id="post-visibility" aria-describedby="visibility-help"><option value="public">공개 · 누구나 읽을 수 있어요</option><option value="private">비공개 · 나만 볼 수 있어요</option></select></label></div>
      <p id="visibility-help" class="writer-help visibility-help" role="status">발행하면 누구나 읽을 수 있습니다.</p>
      <div class="format-toolbar" role="group" aria-label="본문 서식"><button type="button" data-format="bold" aria-label="굵게"><strong>B</strong></button><button type="button" data-format="heading" aria-label="소제목">H</button><button type="button" data-format="quote" aria-label="인용문">❝</button><button type="button" data-format="list" aria-label="목록">☷</button><button type="button" data-format="link" aria-label="링크 삽입">링크</button><span>문장에 마음을 담아보세요</span></div>
      <label class="body-field"><span class="sr-only">본문</span><textarea id="post-body" rows="16" placeholder="완벽한 문장이 아니어도 괜찮아요.&#10;오늘 마음에 남은 것부터 천천히 적어보세요."></textarea></label>
    </div>
    <article id="preview-pane" class="writer-preview" hidden><p id="preview-date" class="post-date"></p><h2 id="preview-title">제목을 입력하세요</h2><div id="preview-cover" class="preview-cover"></div><div id="preview-body" class="preview-body post-content"></div><div id="preview-gallery" class="preview-gallery"></div></article>
    <details class="attachment-options"><summary>사진 추가 <span class="summary-note">표지 · 본문 사진</span></summary><div class="writer-fields writer-fields-two"><label>표지 사진<input id="cover-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" /><span class="writer-tip" id="cover-file-status">긴 변 1,600px 이내로 줄여 JPG로 저장해요. 작은 사진은 확대하지 않아요.</span></label><label>표지 사진 주소 (선택)<input id="cover-url" type="text" placeholder="사진 주소 (선택)" autocomplete="off" /></label><label>본문 사진<input id="gallery-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple /></label><label class="writer-check"><input id="append-gallery" type="checkbox" checked /> 본문 끝에 사진 추가</label></div><div class="cover-preferences"><label class="writer-check"><input id="auto-cover" type="checkbox" checked /> 별도 표지가 없으면 본문 첫 사진을 표지로</label><button id="clear-cover" type="button" class="btn-light">표지 없이 표시</button></div><div id="photo-editor" class="photo-editor" hidden></div><p class="writer-tip">사진을 끌거나 앞으로·뒤로 버튼으로 순서를 바꿀 수 있어요. 교체와 빼기는 저장 후 반영됩니다.</p><div class="cover-position-controls"><label>표지 가로 위치<input id="cover-x" type="range" min="0" max="100" value="50" /></label><label>표지 세로 위치<input id="cover-y" type="range" min="0" max="100" value="50" /></label><button id="center-cover" class="btn-light" type="button">표지 가운데로</button></div><figure class="cover-choice-preview"><img id="cover-card-preview" alt="목록에 표시될 표지 미리보기" width="160" height="120" hidden /><figcaption><strong>목록 표지 미리보기</strong><p id="cover-preview-note">사진을 추가하면 여기에 표시됩니다.</p><span>목록에서는 4:3 비율로 보여요. 위의 위치 조절로 중요한 부분을 맞출 수 있습니다.</span></figcaption></figure><p class="writer-tip">사진은 저장할 때 긴 변 1,600px 이내로 줄여 업로드됩니다. GIF는 움직임을 보존합니다. 표지는 정지 이미지로 저장되며 투명한 부분은 흰색으로 표시됩니다. 사진까지 이어 쓰려면 창을 닫기 전에 보관함 저장을 눌러 주세요. 붙여넣은 사진도 저장 버튼을 누를 때 선택한 공개 범위에 맞춰 업로드됩니다.</p></details>
  </section>
  <details class="writer-panel writer-manage-panel" id="manage"><summary>글 관리 · 임시글 보관함 <span class="summary-note">검색 · 공개 범위 · 이어 쓰기</span></summary>
    <p class="writer-help">저장된 글을 찾아 바로 수정하거나 공개 범위를 바꿀 수 있어요. 임시글은 모두 비공개로 보관됩니다.</p>
    <div class="library-toolbar"><label class="search-field"><span class="sr-only">관리할 글 검색</span><input id="library-search" type="search" placeholder="제목으로 찾기" autocomplete="off" /></label><button id="load-posts" type="button" class="btn-light">목록 새로고침</button></div>
    <div class="library-filters" role="group" aria-label="글 상태"><button type="button" data-library-filter="all" aria-pressed="true">전체</button><button type="button" data-library-filter="draft" aria-pressed="false">임시글</button><button type="button" data-library-filter="public" aria-pressed="false">공개</button><button type="button" data-library-filter="private" aria-pressed="false">비공개</button></div>
    <p id="library-count" class="writer-help" role="status"></p><p id="private-access-status" class="writer-help" role="status"></p><div id="library-list" class="library-list"></div>
    <div hidden><select id="post-list" aria-label="저장된 글"><option value="">글을 선택하세요</option></select><button id="load-selected-post" type="button">선택 글 불러오기</button></div><input id="current-post-path" type="hidden" />
    <div class="writer-inline library-current-actions"><button id="delete-post" type="button" class="btn-danger" disabled>현재 글 삭제</button><button id="open-history" type="button" class="btn-light" disabled>이전 버전</button><button id="open-trash" type="button" class="btn-light">휴지통</button><button id="save-draft-copy" type="button" class="btn-light">새 임시글로 보관</button></div>
  </details>
  <details class="writer-panel recovery-panel" id="recovery-panel" hidden><summary id="recovery-title">기록 복구</summary><p id="recovery-message" role="status" class="writer-help"></p><div id="recovery-list"></div><button id="history-more" type="button" class="btn-light" hidden>더 오래된 버전</button><section id="recovery-preview" hidden><h3 id="recovery-preview-title"></h3><label>선택한 내용<textarea id="recovery-text" readonly rows="10"></textarea></label><button id="restore-record" type="button" class="btn-strong">복원</button></section></details>
  <details class="writer-panel" id="profile"><summary>내 프로필 <span class="summary-note">사진 · 이름 · 소개</span></summary><p class="writer-help">저장하면 홈과 소개 페이지에 공개됩니다.</p><div class="profile-editor-preview"><span id="profile-avatar-preview" class="profile-avatar"></span><div><strong id="profile-name-preview"></strong><p id="profile-tagline-preview" class="muted"></p></div></div><div class="writer-fields writer-fields-two"><label>표시 이름<input id="profile-name" type="text" maxlength="60" value="{{ site.data.profile.name | escape }}" /></label><label>한 줄 소개<input id="profile-tagline" type="text" maxlength="120" value="{{ site.data.profile.tagline | escape }}" placeholder="나를 소개하는 짧은 한 문장" /></label></div><div class="writer-fields"><label>자기소개<textarea id="profile-bio" rows="5" maxlength="3000" placeholder="어떤 마음으로 글을 쓰고 있나요?">{{ site.data.profile.bio | escape }}</textarea></label></div><div class="writer-fields writer-fields-two"><label>프로필 사진<input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" /></label><label>웹사이트<input id="profile-website" type="url" value="{{ site.data.profile.website | escape }}" placeholder="https://" /></label></div><input id="profile-avatar" type="hidden" value="{{ site.data.profile.avatar | escape }}" /><div class="writer-inline"><button id="remove-profile-photo" class="btn-light" type="button">사진 지우기</button><button id="load-profile" class="btn-light" type="button">저장된 프로필 불러오기</button><button id="save-profile" class="btn-strong" type="button">프로필 저장</button></div><p id="profile-status" class="writer-status" role="status"></p></details>
</div>
</div>
<script src="{{ '/assets/js/cover-image.js' | relative_url }}" defer></script>
<script src="{{ '/assets/js/photo-image.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/assets/js/photo-editor.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/assets/js/private-posts.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/assets/js/writer-library.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/assets/js/publication.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/assets/js/writer-recovery.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
<script src="{{ '/assets/js/writer.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
