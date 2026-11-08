(() => {
  "use strict";
  const root = document.body;
  const owner = root.dataset.writerOwner;
  const repo = root.dataset.writerRepo;
  const branch = root.dataset.writerBranch || "main";
  if (!owner || !repo) return;
  const configKey = "myDiaryWriterConfigV3";
  const sessionKey = "myDiaryWriterSessionV1";
  const logoutKey = "myDiaryWriterLogoutV1";
  let connection = null;
  let state = { status: "guest", login: "", message: "작성자 계정으로 로그인해 주세요." };
  let version = 0;
  let lastCheck = 0;

  function read(storage, key) {
    try {
      const value = JSON.parse(window[storage].getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  function matches(value) {
    return !!value && typeof value.owner === "string" && value.owner.toLowerCase() === owner.toLowerCase() && value.repo === repo && (value.branch || "main") === branch;
  }
  function storedConnection() {
    const session = read("sessionStorage", sessionKey);
    const config = read("localStorage", configKey);
    const saved = matches(session) && session.token ? session : matches(config) && config.token ? config : null;
    return saved && typeof saved.token === "string" ? { owner, repo, branch, token: saved.token.trim() } : null;
  }
  function render(next) {
    state = next;
    const active = state.status === "authenticated";
    root.dataset.authorState = state.status;
    document.querySelectorAll("[data-author-only]").forEach(el => { el.hidden = !active; });
    document.querySelectorAll("[data-guest-only]").forEach(el => { el.hidden = active; });
    document.querySelectorAll("[data-author-status]").forEach(el => { el.textContent = state.message; });
    window.dispatchEvent(new CustomEvent("diary:auth", { detail: { ...state } }));
  }
  function clearCredentials() {
    try { sessionStorage.removeItem(sessionKey); } catch (_) {}
    try {
      const config = read("localStorage", configKey);
      delete config.token;
      localStorage.setItem(configKey, JSON.stringify(config));
    } catch (_) {}
  }
  function persist(token, remember) {
    let saved = false;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({ owner, repo, branch, token }));
      saved = true;
    } catch (_) {}
    try {
      const config = { ...read("localStorage", configKey), owner, repo, branch };
      delete config.token;
      if (remember) config.token = token;
      localStorage.setItem(configKey, JSON.stringify(config));
      if (remember) saved = true;
    } catch (_) {}
    return saved;
  }
  async function request(path, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("https://api.github.com" + path, {
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28" },
        cache: "no-store", credentials: "omit", signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(response.status === 401 ? "로그인이 만료되었거나 로그인 키가 올바르지 않아요. 다시 로그인해 주세요." : "GitHub에서 계정을 확인하지 못했어요. 연결과 계정 권한을 확인한 뒤 다시 시도해 주세요.");
        error.invalid = response.status === 401;
        throw error;
      }
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function login(token, options = {}) {
    token = typeof token === "string" ? token.trim() : "";
    const attempt = ++version;
    connection = null;
    lastCheck = Date.now();
    render({ status: "checking", login: "", message: "작성자 계정을 확인하고 있어요…" });
    try {
      if (!token) throw new Error("GitHub 로그인 키를 입력해 주세요.");
      const user = await request("/user", token);
      if (attempt !== version) return false;
      if (typeof user.login !== "string" || user.login.toLowerCase() !== owner.toLowerCase()) {
        const error = new Error("이 공간은 작성자 전용입니다. @" + owner + " 계정으로 로그인해 주세요.");
        error.invalid = true;
        throw error;
      }
      const repository = await request("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo), token);
      if (repository.permissions?.push !== true) throw new Error("이 블로그를 수정할 수 있는 GitHub 계정 권한이 필요해요.");
      if (attempt !== version) return false;
      connection = { owner, repo, branch, token };
      const saved = options.persist === false || persist(token, !!options.remember);
      render({ status: "authenticated", login: user.login, message: "@" + user.login + " 로그인됨" + (saved ? "" : " · 이 창에서만 유지됩니다") });
      return true;
    } catch (error) {
      if (attempt !== version) return false;
      if (error.invalid) clearCredentials();
      render({ status: "error", login: "", message: error.name === "AbortError" || error instanceof TypeError ? "계정을 확인할 수 없어요. 인터넷 연결을 확인하고 다시 로그인해 주세요." : error.message });
      return false;
    }
  }
  async function check() {
    const saved = storedConnection();
    if (!saved) {
      ++version;
      connection = null;
      render({ status: "guest", login: "", message: "작성자 계정으로 로그인해 주세요." });
      return false;
    }
    return login(saved.token, { persist: false });
  }
  function logout(broadcast = true) {
    ++version;
    connection = null;
    clearCredentials();
    try { sessionStorage.removeItem("myDiaryWriterOAuthPendingV1"); } catch (_) {}
    if (broadcast) {
      try { localStorage.setItem(logoutKey, String(Date.now())); } catch (_) {}
    }
    render({ status: "guest", login: "", message: "로그아웃했어요. 작성자 계정으로 다시 로그인할 수 있습니다." });
  }
  window.DiaryAuth = {
    login, logout, check,
    getState: () => ({ ...state }),
    getConnection: () => connection && { ...connection },
    isAuthorized: info => !!connection && state.status === "authenticated" && matches(info) && info.token === connection.token,
  };
  document.querySelectorAll("[data-author-logout]").forEach(button => button.addEventListener("click", () => logout()));
  window.addEventListener("storage", event => {
    if (event.key === logoutKey) logout(false);
    else if (event.key === configKey) check();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) check(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastCheck > 300000) check();
  });
  window.DiaryAuth.ready = check();
})();
