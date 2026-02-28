---
layout: default
title: Write
permalink: /write/
---
<section class="writer-page">
  <div class="writer-hero">
    <p class="writer-kicker">DIARY WRITER</p>
    <h1>UI로 편하게 일상을 작성하고 발행하기</h1>
    <p>
      제목, 글, 사진을 입력하고 Publish 버튼을 누르면 GitHub 저장소에
      포스트 파일과 이미지를 자동으로 업로드합니다.
    </p>
  </div>

  <div class="writer-grid">
    <section class="writer-panel">
      <h2>GitHub 연결</h2>
      <p class="writer-help">
        OAuth 로그인 버튼으로 연결하거나, 수동 토큰(PAT)을 입력할 수 있습니다.
      </p>
      <div class="writer-fields writer-fields-two">
        <label>
          OAuth Client ID
          <input id="oauth-client-id" type="text" placeholder="Ov23..." autocomplete="off" />
        </label>
        <label>
          OAuth Proxy URL
          <input id="oauth-proxy-url" type="url" placeholder="https://your-worker.example.workers.dev" autocomplete="off" />
        </label>
      </div>
      <div class="writer-inline">
        <button id="oauth-login" type="button" class="btn-strong">GitHub로 로그인</button>
        <button id="oauth-logout" type="button" class="btn-light">OAuth 로그아웃</button>
      </div>
      <p id="oauth-status" class="writer-status status-info" aria-live="polite">
        OAuth 미연결 상태
      </p>
      <div class="writer-fields writer-fields-two">
        <label>
          Owner
          <input id="gh-owner" type="text" placeholder="예: al03175874" autocomplete="off" />
        </label>
        <label>
          Repo
          <input id="gh-repo" type="text" placeholder="예: my-diary" autocomplete="off" />
        </label>
      </div>
      <div class="writer-fields writer-fields-two">
        <label>
          Branch
          <input id="gh-branch" type="text" value="main" autocomplete="off" />
        </label>
        <label>
          Token (자동 입력/수동 입력)
          <input id="gh-token" type="password" placeholder="OAuth 연결 시 자동 입력" autocomplete="off" />
        </label>
      </div>
      <div class="writer-inline">
        <label class="writer-check">
          <input id="remember-token" type="checkbox" />
          토큰도 이 브라우저에 저장
        </label>
        <button id="save-config" type="button" class="btn-light">연결 정보 저장</button>
      </div>
    </section>

    <section class="writer-panel">
      <h2>포스트 작성</h2>
      <div class="writer-fields">
        <label>
          제목
          <input id="post-title" type="text" placeholder="오늘의 기록 제목" autocomplete="off" />
        </label>
        <label>
          부제목
          <input id="post-subtitle" type="text" placeholder="선택 사항" autocomplete="off" />
        </label>
        <label>
          작성 시각
          <input id="post-date" type="datetime-local" />
        </label>
        <label>
          표지 사진
          <input id="cover-image" type="file" accept="image/*" />
        </label>
        <label>
          본문 사진들
          <input id="gallery-images" type="file" accept="image/*" multiple />
        </label>
        <label>
          본문 내용 (Markdown)
          <textarea id="post-body" rows="12" placeholder="오늘 하루를 자유롭게 작성해보세요."></textarea>
        </label>
      </div>
      <div class="writer-inline">
        <label class="writer-check">
          <input id="append-gallery" type="checkbox" checked />
          본문 끝에 본문 사진 자동 추가
        </label>
        <button id="publish-post" type="button" class="btn-strong">Publish To GitHub</button>
      </div>
      <p id="writer-status" class="writer-status" aria-live="polite"></p>
    </section>
  </div>

  <section class="writer-panel writer-preview-panel">
    <h2>미리보기</h2>
    <article class="writer-preview">
      <p id="preview-date" class="preview-date"></p>
      <h3 id="preview-title">제목을 입력하세요</h3>
      <p id="preview-subtitle" class="preview-subtitle"></p>
      <div id="preview-cover" class="preview-cover"></div>
      <div id="preview-body" class="preview-body"></div>
      <div id="preview-gallery" class="preview-gallery"></div>
    </article>
  </section>
</section>

<script src="{{ '/assets/js/writer.js' | relative_url }}" defer></script>
