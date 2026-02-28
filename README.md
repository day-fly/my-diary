# My Diary

GitHub로 관리하는 감성 다이어리 블로그 템플릿입니다.  
사진 업로드 + 글 작성(마크다운) 중심으로 만들었고, 모바일 반응형까지 포함되어 있습니다.

## 포함된 기능

- 사진이 있는 포스트 카드형 홈 화면
- 감성적인 타이포그래피/배경/애니메이션
- 모바일 대응 레이아웃
- `/write` 웹 작성 UI (OAuth 로그인 + 사진 업로드 + GitHub 직접 발행)
- 마크다운 포스트 작성
- GitHub Pages 배포용 워크플로

## 폴더 구조

```text
.
├─ _posts/                # 다이어리 글 (YYYY-MM-DD-title.md)
├─ _layouts/              # 공통 레이아웃
├─ assets/
│  ├─ css/style.css       # 스타일
│  ├─ images/             # 대표 이미지/일러스트
│  └─ photos/             # 직접 올릴 사진 폴더
├─ index.html             # 홈
├─ write.md               # 웹 작성 UI
├─ oauth-proxy/           # OAuth token 교환 Worker
├─ about.md               # 소개 페이지
└─ _config.yml            # Jekyll 설정
```

## 새 글 작성 방법

### 가장 쉬운 방법: 웹 UI에서 작성/발행

`/write` 페이지에서 제목/본문/사진 입력 후 `Publish To GitHub`를 누르면:

- `assets/photos/`에 이미지 업로드
- `_posts/`에 포스트 파일 생성
- GitHub에 바로 커밋

#### 1) 작성 페이지 열기

- 로컬: `http://127.0.0.1:4001/write/`
- 배포 후: `https://<your-site>/write/`

#### 2) OAuth 로그인 방식 (토큰 입력 없음)

`oauth-proxy` 폴더의 Worker를 먼저 배포해야 합니다.

- 가이드: `oauth-proxy/README.md`
- 필요한 값:
  - OAuth Client ID (GitHub OAuth App)
  - OAuth Proxy URL (Cloudflare Worker 배포 URL)

`/write` 페이지에서 두 값을 입력하고 `GitHub로 로그인` 버튼을 누르면
토큰이 자동으로 연결됩니다.

배포 명령 예시:

```bash
cd oauth-proxy
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

#### 3) 수동 토큰 방식 (백업)

GitHub에서 Fine-grained personal access token을 만들고 아래 권한을 주세요.

- Repository access: 이 저장소 선택
- Repository permissions: `Contents` → `Read and write`

#### 4) 연결 정보 입력

- Owner: GitHub 사용자명
- Repo: 저장소 이름
- Branch: 보통 `main`
- Token: OAuth 자동 입력 또는 수동 토큰 입력

토큰 저장 체크를 켜면 현재 브라우저에만 저장됩니다.

### 추천: 자동 생성 스크립트 사용

수작업 대신 아래 명령으로 글 뼈대를 바로 만들 수 있습니다.

```bash
./scripts/new-post.sh "일요일의 기록" "따뜻한 햇살과 커피" "/절대경로/사진.jpg"
```

또는 대화형 입력:

```bash
./scripts/new-post.sh
```

실행하면 자동으로:

- `_posts/`에 날짜 기반 파일 생성
- (사진 입력 시) `assets/photos/`로 사진 복사
- `title`, `date`, `cover`, 본문 템플릿 자동 작성

### 수동 작성 방식

1. `_posts/` 안에 파일 생성  
   예: `_posts/2026-03-01-sunday-note.md`
2. 아래 형식으로 프론트매터 작성

```md
---
title: "일요일의 기록"
subtitle: "따뜻한 햇살과 커피"
date: 2026-03-01 21:30:00 +0900
cover: /assets/photos/2026-03-01-coffee.jpg
---

오늘의 기록을 자유롭게 씁니다.

![카페 사진](/assets/photos/2026-03-01-coffee.jpg)
```

3. 사진은 `assets/photos/` 폴더에 업로드
4. Git 커밋 후 GitHub에 푸시

## GitHub Pages 배포

이 저장소에는 `.github/workflows/pages.yml`이 포함되어 있어서,  
`main` 브랜치에 푸시하면 Pages가 자동 배포됩니다.

### GitHub에서 1회 설정

1. Repository `Settings` → `Pages`
2. `Build and deployment` 에서 `Source` 를 `GitHub Actions` 로 선택

이후 푸시할 때마다 자동 배포됩니다.

## 로컬 미리보기 (선택)

Ruby/Jekyll 환경이 있으면 로컬에서도 확인할 수 있습니다.

```bash
bundle install
bundle exec jekyll serve --host 127.0.0.1 --port 4001
```

브라우저에서 `http://127.0.0.1:4001` 접속.

## 감성 커스터마이징 포인트

- 색상: `assets/css/style.css`의 `:root` 변수
- 폰트: `/_layouts/default.html`의 Google Fonts 링크
- 카드/배경 느낌: `style.css`의 `.hero`, `.post-card`, `.bg-shape`
