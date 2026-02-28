# OAuth Proxy (Cloudflare Worker)

`/write` 페이지의 "GitHub로 로그인" 버튼은 토큰 교환용 백엔드가 필요합니다.  
이 폴더의 Worker를 배포해서 OAuth exchange endpoint로 사용하세요.

## 1) GitHub OAuth App 생성

GitHub `Settings > Developer settings > OAuth Apps > New OAuth App`

- Application name: `My Diary Writer`
- Homepage URL: `https://day-fly.github.io/my-diary/`
- Authorization callback URL: `https://day-fly.github.io/my-diary/write/`

생성 후 `Client ID`를 `/write` 페이지의 `OAuth Client ID`에 입력합니다.

## 2) Worker 배포

1. `oauth-proxy/wrangler.toml.example`를 `oauth-proxy/wrangler.toml`로 복사
2. `ALLOWED_ORIGIN`을 블로그 도메인으로 수정
3. `GITHUB_CLIENT_SECRET`를 Worker secret으로 등록

```bash
cd oauth-proxy
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

참고: 이 폴더에는 `.npmrc`가 포함되어 있어서 `npx`가 public npm registry(`https://registry.npmjs.org/`)를 사용합니다.

배포 URL(예: `https://my-diary-oauth-proxy.<subdomain>.workers.dev`)을
`/write` 페이지 `OAuth Proxy URL`에 넣으면 로그인 버튼이 동작합니다.

## 보안 메모

- `GITHUB_CLIENT_SECRET`는 절대 프론트엔드/저장소에 평문으로 넣지 마세요.
- `ALLOWED_ORIGIN`을 반드시 설정해서 다른 도메인 요청을 차단하세요.
