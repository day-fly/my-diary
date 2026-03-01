---
layout: default
title: Write
permalink: /write/
---
<section class="writer-page">
  <section class="writer-panel writer-main-panel">
    <div class="writer-main-head">
      <h2>포스트 작성</h2>
      <div class="writer-main-actions">
        <button id="new-draft" type="button" class="btn-light">새 글 모드</button>
        <button id="publish-post" type="button" class="btn-strong">Publish To GitHub</button>
        <button id="delete-post" type="button" class="btn-danger">현재 글 삭제</button>
      </div>
    </div>

    <div class="writer-fields writer-fields-three">
      <label>
        제목
        <input id="post-title" type="text" placeholder="오늘의 기록 제목" autocomplete="off" />
      </label>
      <label>
        카테고리
        <select id="post-category">
          <option value="시">시</option>
          <option value="에세이">에세이</option>
          <option value="일기" selected>일기</option>
        </select>
      </label>
      <label>
        작성 시각
        <input id="post-date" type="datetime-local" />
      </label>
    </div>

    <div class="writer-fields writer-fields-two">
      <label>
        표지 사진 업로드
        <input id="cover-image" type="file" accept="image/*" />
      </label>
      <label>
        표지 URL (기존 글 수정용)
        <input id="cover-url" type="text" placeholder="/assets/photos/..." autocomplete="off" />
      </label>
    </div>

    <div class="writer-fields">
      <label>
        본문 내용 (Markdown)
        <textarea id="post-body" rows="18" placeholder="오늘 하루를 자유롭게 작성해보세요."></textarea>
      </label>
      <p class="writer-tip">
        본문 입력창에서 <code>Ctrl/Cmd + V</code>로 이미지를 붙여넣으면
        <code>assets/photos/</code>에 업로드되고 본문에 자동 삽입됩니다.
      </p>
    </div>

    <div class="writer-fields writer-fields-two">
      <label>
        본문 사진들 (선택)
        <input id="gallery-images" type="file" accept="image/*" multiple />
      </label>
      <label class="writer-check writer-check-box">
        <input id="append-gallery" type="checkbox" checked />
        본문 끝에 업로드한 사진 자동 추가
      </label>
    </div>

    <p id="writer-status" class="writer-status" aria-live="polite"></p>
  </section>

  <section class="writer-panel writer-manage-panel">
    <h2>기존 포스트 관리</h2>
    <p class="writer-help">목록에서 선택 후 불러오면 수정 모드로 전환됩니다.</p>
    <div class="writer-fields writer-fields-two">
      <label>
        포스트 목록
        <select id="post-list">
          <option value="">먼저 목록 새로고침</option>
        </select>
      </label>
      <label>
        현재 편집 파일
        <input id="current-post-path" type="text" readonly placeholder="_posts/YYYY-MM-DD-slug.md" />
      </label>
    </div>
    <div class="writer-inline">
      <button id="load-posts" type="button" class="btn-light">목록 새로고침</button>
      <button id="load-selected-post" type="button" class="btn-light">선택 글 불러오기</button>
    </div>
  </section>

  <details class="writer-panel writer-connection-panel">
    <summary>GitHub 연결 설정 (OAuth / PAT)</summary>
    <p class="writer-help writer-help-top">
      작성 화면이 좁아지지 않도록 기본은 접혀 있습니다.
    </p>
    <div class="writer-fields writer-fields-two">
      <label>
        OAuth Client ID
        <input id="oauth-client-id" type="text" placeholder="Ov23..." autocomplete="off" />
      </label>
      <label>
        OAuth Proxy URL
        <input id="oauth-proxy-url" type="url" placeholder="https://your-worker.workers.dev" autocomplete="off" />
      </label>
    </div>
    <div class="writer-inline">
      <button id="oauth-login" type="button" class="btn-strong">GitHub로 로그인</button>
      <button id="oauth-logout" type="button" class="btn-light">OAuth 로그아웃</button>
    </div>
    <p id="oauth-status" class="writer-status status-info" aria-live="polite">OAuth 미연결 상태</p>

    <div class="writer-fields writer-fields-three">
      <label>
        Owner
        <input id="gh-owner" type="text" placeholder="day-fly" autocomplete="off" />
      </label>
      <label>
        Repo
        <input id="gh-repo" type="text" placeholder="my-diary" autocomplete="off" />
      </label>
      <label>
        Branch
        <input id="gh-branch" type="text" value="main" autocomplete="off" />
      </label>
    </div>

    <div class="writer-fields writer-fields-two">
      <label>
        Token (자동/수동)
        <input id="gh-token" type="password" placeholder="OAuth 연결 시 자동 입력" autocomplete="off" />
      </label>
      <label class="writer-check writer-check-box">
        <input id="remember-token" type="checkbox" />
        토큰도 브라우저에 저장
      </label>
    </div>

    <div class="writer-inline">
      <button id="save-config" type="button" class="btn-light">연결 정보 저장</button>
    </div>
  </details>

  <section class="writer-panel writer-preview-panel">
    <h2>미리보기</h2>
    <article class="writer-preview">
      <p id="preview-date" class="preview-date"></p>
      <p id="preview-category" class="preview-category"></p>
      <h3 id="preview-title">제목을 입력하세요</h3>
      <div id="preview-cover" class="preview-cover"></div>
      <div id="preview-body" class="preview-body post-content"></div>
      <div id="preview-gallery" class="preview-gallery"></div>
    </article>
  </section>
</section>

<script src="{{ '/assets/js/writer.js' | relative_url }}" defer></script>
