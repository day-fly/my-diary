(function () {
  "use strict";

  var STORAGE_KEY = "myDiaryWriterConfigV3";
  var OAUTH_PENDING_KEY = "myDiaryWriterOAuthPendingV1";
  var API_BASE = "https://api.github.com";

  var siteTitleLink = document.querySelector(".site-title");
  var siteBase = "";
  if (siteTitleLink) {
    var href = siteTitleLink.getAttribute("href") || "/";
    siteBase = href === "/" ? "" : href.replace(/\/$/, "");
  }

  var ownerInput = document.getElementById("gh-owner");
  var repoInput = document.getElementById("gh-repo");
  var branchInput = document.getElementById("gh-branch");
  var tokenInput = document.getElementById("gh-token");
  var rememberTokenInput = document.getElementById("remember-token");
  var saveConfigButton = document.getElementById("save-config");

  var oauthClientIdInput = document.getElementById("oauth-client-id");
  var oauthProxyUrlInput = document.getElementById("oauth-proxy-url");
  var oauthLoginButton = document.getElementById("oauth-login");
  var oauthLogoutButton = document.getElementById("oauth-logout");
  var oauthStatusElement = document.getElementById("oauth-status");

  var titleInput = document.getElementById("post-title");
  var categoryInput = document.getElementById("post-category");
  var dateInput = document.getElementById("post-date");
  var coverInput = document.getElementById("cover-image");
  var coverUrlInput = document.getElementById("cover-url");
  var galleryInput = document.getElementById("gallery-images");
  var bodyInput = document.getElementById("post-body");
  var appendGalleryInput = document.getElementById("append-gallery");
  var publishButton = document.getElementById("publish-post");
  var deleteButton = document.getElementById("delete-post");
  var newDraftButton = document.getElementById("new-draft");
  var statusElement = document.getElementById("writer-status");

  var postListSelect = document.getElementById("post-list");
  var loadPostsButton = document.getElementById("load-posts");
  var loadSelectedPostButton = document.getElementById("load-selected-post");
  var currentPostPathInput = document.getElementById("current-post-path");

  var previewDate = document.getElementById("preview-date");
  var previewCategory = document.getElementById("preview-category");
  var previewTitle = document.getElementById("preview-title");
  var previewCover = document.getElementById("preview-cover");
  var previewBody = document.getElementById("preview-body");
  var previewGallery = document.getElementById("preview-gallery");

  if (!ownerInput || !repoInput || !titleInput || !categoryInput || !publishButton || !postListSelect) {
    return;
  }

  var coverObjectUrl = null;
  var galleryObjectUrls = [];

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDatetimeLocal(date) {
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      "T",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
    ].join("");
  }

  function formatDatePrefix(date) {
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
    ].join("");
  }

  function formatOffset(date) {
    var total = -date.getTimezoneOffset();
    var sign = total >= 0 ? "+" : "-";
    var abs = Math.abs(total);
    return sign + pad(Math.floor(abs / 60)) + pad(abs % 60);
  }

  function formatFrontMatterDate(date) {
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      " ",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
      ":",
      pad(date.getSeconds()),
      " ",
      formatOffset(date),
    ].join("");
  }

  function formatDisplayDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      ".",
      pad(date.getMonth() + 1),
      ".",
      pad(date.getDate()),
      " ",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
    ].join("");
  }

  function datetimeLocalFromString(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return formatDatetimeLocal(date);
  }

  function escapeYaml(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ").trim();
  }

  function unquoteYaml(value) {
    var text = (value || "").trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1);
    }
    return text.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  function slugify(value) {
    var cleaned = (value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!cleaned) return "entry-" + Date.now().toString().slice(-6);
    return cleaned;
  }

  function sanitizeName(value) {
    var cleaned = (value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || "photo";
  }

  function fileExtension(file) {
    var name = file.name || "";
    if (name.lastIndexOf(".") >= 0) return name.split(".").pop().toLowerCase();
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/gif") return "gif";
    return "jpg";
  }

  function extensionFromMime(type) {
    var mime = (type || "").toLowerCase();
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
    return "png";
  }

  function buildTimestamp(date) {
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
  }

  function encodePath(path) {
    return path
      .split("/")
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join("/");
  }

  function normalizeUrl(value) {
    return (value || "").trim().replace(/\/+$/, "");
  }

  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function clearOAuthParamsFromUrl() {
    var url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000;
    var binary = "";
    var i = 0;
    for (i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBase64Url(value) {
    return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function arrayBufferToBase64Url(buffer) {
    return base64ToBase64Url(arrayBufferToBase64(buffer));
  }

  function utf8ToBase64(text) {
    var encoded = new TextEncoder().encode(text);
    return arrayBufferToBase64(encoded.buffer);
  }

  function base64ToUtf8(base64Text) {
    var normalized = (base64Text || "").replace(/\n/g, "");
    var binary = atob(normalized);
    var bytes = new Uint8Array(binary.length);
    var i = 0;
    for (i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function insertTextAtCursor(textarea, text) {
    var start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;
    var end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : textarea.value.length;
    var before = textarea.value.slice(0, start);
    var after = textarea.value.slice(end);
    textarea.value = before + text + after;
    var cursor = start + text.length;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;
  }

  function getClipboardImageFiles(event) {
    var files = [];
    if (!event.clipboardData || !event.clipboardData.items) return files;

    Array.prototype.forEach.call(event.clipboardData.items, function (item, index) {
      if (!item || !item.type || item.type.indexOf("image/") !== 0) return;
      var file = item.getAsFile();
      if (!file) return;

      if (!file.name) {
        var ext = extensionFromMime(file.type);
        file = new File([file], "pasted-image-" + (index + 1) + "." + ext, { type: file.type || "image/png" });
      }
      files.push(file);
    });

    return files;
  }

  function randomString(size) {
    var bytes = new Uint8Array(size);
    window.crypto.getRandomValues(bytes);
    return arrayBufferToBase64Url(bytes.buffer);
  }

  async function createCodeChallenge(verifier) {
    var data = new TextEncoder().encode(verifier);
    var digest = await window.crypto.subtle.digest("SHA-256", data);
    return arrayBufferToBase64Url(digest);
  }

  function toPreviewAssetUrl(value) {
    var text = (value || "").trim();
    if (!text) return "";
    if (text.startsWith("http://") || text.startsWith("https://")) return text;
    if (text.startsWith("/")) return siteBase + text;
    return text;
  }

  function parseMarkdown(markdown) {
    var match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: markdown };

    var frontMatter = match[1];
    var body = match[2] || "";
    var data = {};
    frontMatter.split(/\r?\n/).forEach(function (line) {
      var parsed = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!parsed) return;
      data[parsed[1]] = unquoteYaml(parsed[2]);
    });

    return { data: data, body: body };
  }

  function setStatus(message, type, allowHtml) {
    statusElement.classList.remove("status-info", "status-error", "status-success");
    statusElement.classList.add(type || "status-info");
    if (allowHtml) {
      statusElement.innerHTML = message;
    } else {
      statusElement.textContent = message;
    }
  }

  function setOAuthStatus(message, type) {
    if (!oauthStatusElement) return;
    oauthStatusElement.classList.remove("status-info", "status-error", "status-success");
    oauthStatusElement.classList.add(type || "status-info");
    oauthStatusElement.textContent = message;
  }

  function getStoredConfig() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return {};
    }
  }

  function loadConfig() {
    var config = getStoredConfig();
    ownerInput.value = config.owner || "";
    repoInput.value = config.repo || "";
    branchInput.value = config.branch || "main";
    if (oauthClientIdInput) oauthClientIdInput.value = config.oauthClientId || "";
    if (oauthProxyUrlInput) oauthProxyUrlInput.value = config.oauthProxyUrl || "";
    if (config.token) {
      tokenInput.value = config.token;
      rememberTokenInput.checked = true;
      setOAuthStatus("저장된 토큰이 있습니다. 바로 발행할 수 있습니다.", "status-success");
    }
  }

  function saveConfig() {
    var config = {
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || "main",
      oauthClientId: oauthClientIdInput ? oauthClientIdInput.value.trim() : "",
      oauthProxyUrl: oauthProxyUrlInput ? normalizeUrl(oauthProxyUrlInput.value) : "",
    };
    if (rememberTokenInput.checked && tokenInput.value.trim()) {
      config.token = tokenInput.value.trim();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function clearPreviewUrls() {
    if (coverObjectUrl) {
      URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = null;
    }
    galleryObjectUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    galleryObjectUrls = [];
  }

  function updatePreview() {
    previewDate.textContent = formatDisplayDate(dateInput.value);
    previewCategory.innerHTML = "";
    var categoryText = categoryInput.value.trim() || "일기";
    var categoryChip = document.createElement("span");
    categoryChip.className = "category-chip";
    categoryChip.textContent = categoryText;
    previewCategory.appendChild(categoryChip);
    previewTitle.textContent = titleInput.value.trim() || "제목을 입력하세요";
    previewBody.textContent = bodyInput.value.trim() || "내용 미리보기가 여기에 표시됩니다.";

    clearPreviewUrls();
    previewCover.innerHTML = "";
    previewGallery.innerHTML = "";

    if (coverInput.files && coverInput.files[0]) {
      coverObjectUrl = URL.createObjectURL(coverInput.files[0]);
      var uploadedCover = document.createElement("img");
      uploadedCover.src = coverObjectUrl;
      uploadedCover.alt = "표지 미리보기";
      previewCover.appendChild(uploadedCover);
    } else if (coverUrlInput.value.trim()) {
      var existingCover = document.createElement("img");
      existingCover.src = toPreviewAssetUrl(coverUrlInput.value.trim());
      existingCover.alt = "표지 미리보기";
      previewCover.appendChild(existingCover);
    }

    if (galleryInput.files && galleryInput.files.length > 0) {
      Array.prototype.forEach.call(galleryInput.files, function (file, index) {
        var objectUrl = URL.createObjectURL(file);
        galleryObjectUrls.push(objectUrl);
        var frame = document.createElement("figure");
        var img = document.createElement("img");
        var caption = document.createElement("figcaption");
        img.src = objectUrl;
        img.alt = "본문 사진 " + (index + 1);
        caption.textContent = "사진 " + (index + 1);
        frame.appendChild(img);
        frame.appendChild(caption);
        previewGallery.appendChild(frame);
      });
    }
  }

  async function githubFetch(url, token, options) {
    var finalOptions = options || {};
    var headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (finalOptions.headers) Object.assign(headers, finalOptions.headers);

    var body = finalOptions.body;
    if (body && typeof body !== "string") {
      body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    var response = await fetch(url, {
      method: finalOptions.method || "GET",
      headers: headers,
      body: body,
    });

    var payload = null;
    var contentType = response.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") >= 0) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      var detail = payload && payload.message ? payload.message : "HTTP " + response.status;
      throw new Error(detail);
    }
    return payload;
  }

  async function proxyExchangeToken(proxyUrl, payload) {
    var response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    var contentType = response.headers.get("content-type") || "";
    var data = contentType.indexOf("application/json") >= 0 ? await response.json() : {};
    if (!response.ok) throw new Error(data.message || data.error || "OAuth token 교환 실패");
    if (!data.access_token) throw new Error("OAuth access token이 응답에 없습니다.");
    return data;
  }

  async function getContentMeta(owner, repo, branch, path, token) {
    var url =
      API_BASE +
      "/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/contents/" +
      encodePath(path) +
      "?ref=" +
      encodeURIComponent(branch);

    var response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
      },
    });

    if (response.status === 404) return null;

    var payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "파일 확인 실패");
    return payload;
  }

  async function putContent(params) {
    var existing = await getContentMeta(params.owner, params.repo, params.branch, params.path, params.token);
    var payload = {
      message: params.message,
      content: params.contentBase64,
      branch: params.branch,
    };
    if (existing && existing.sha) payload.sha = existing.sha;

    return githubFetch(
      API_BASE +
        "/repos/" +
        encodeURIComponent(params.owner) +
        "/" +
        encodeURIComponent(params.repo) +
        "/contents/" +
        encodePath(params.path),
      params.token,
      { method: "PUT", body: payload }
    );
  }

  async function deleteContent(params) {
    var existing = await getContentMeta(params.owner, params.repo, params.branch, params.path, params.token);
    if (!existing || !existing.sha) throw new Error("삭제할 파일을 찾지 못했습니다.");

    return githubFetch(
      API_BASE +
        "/repos/" +
        encodeURIComponent(params.owner) +
        "/" +
        encodeURIComponent(params.repo) +
        "/contents/" +
        encodePath(params.path),
      params.token,
      {
        method: "DELETE",
        body: {
          message: params.message,
          sha: existing.sha,
          branch: params.branch,
        },
      }
    );
  }

  async function listPosts(owner, repo, branch, token) {
    var url =
      API_BASE +
      "/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/contents/_posts?ref=" +
      encodeURIComponent(branch);
    var payload = await githubFetch(url, token, { method: "GET" });
    if (!Array.isArray(payload)) return [];
    return payload
      .filter(function (item) {
        return item.type === "file" && item.name.endsWith(".md");
      })
      .sort(function (a, b) {
        if (a.name < b.name) return 1;
        if (a.name > b.name) return -1;
        return 0;
      });
  }

  function renderPostOptions(posts) {
    postListSelect.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = posts.length ? "선택하세요" : "포스트 없음";
    postListSelect.appendChild(placeholder);

    posts.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.path;
      option.textContent = item.name;
      postListSelect.appendChild(option);
    });
  }

  async function uploadImage(owner, repo, branch, token, file, prefix, index) {
    var now = new Date();
    var ext = fileExtension(file);
    var fileBase = file.name.lastIndexOf(".") > 0 ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name;
    var safeBase = sanitizeName(fileBase);
    var imagePath =
      "assets/photos/" +
      buildTimestamp(now) +
      "-" +
      prefix +
      (typeof index === "number" ? "-" + (index + 1) : "") +
      "-" +
      safeBase +
      "." +
      ext;

    var base64 = arrayBufferToBase64(await file.arrayBuffer());
    await putContent({
      owner: owner,
      repo: repo,
      branch: branch,
      path: imagePath,
      token: token,
      contentBase64: base64,
      message: "Upload diary image: " + imagePath,
    });
    return "/" + imagePath;
  }

  async function buildUniquePostPath(owner, repo, branch, token, datePrefix, slug) {
    var path = "_posts/" + datePrefix + "-" + slug + ".md";
    var meta = await getContentMeta(owner, repo, branch, path, token);
    if (!meta) return path;
    return "_posts/" + datePrefix + "-" + slug + "-" + buildTimestamp(new Date()).slice(-6) + ".md";
  }

  function buildMarkdown(payload) {
    var lines = [];
    lines.push("---");
    lines.push('title: "' + escapeYaml(payload.title) + '"');
    lines.push('category: "' + escapeYaml(payload.category || "일기") + '"');
    lines.push("date: " + payload.dateText);
    if (payload.coverUrl) lines.push("cover: " + payload.coverUrl);
    lines.push("---");
    lines.push("");
    lines.push(payload.body || "오늘 하루를 기록해보세요.");

    if (payload.appendGallery && payload.galleryUrls.length > 0) {
      lines.push("");
      lines.push("## 사진 기록");
      lines.push("");
      payload.galleryUrls.forEach(function (url, index) {
        lines.push("![사진 " + (index + 1) + "](" + url + ")");
        lines.push("");
      });
    }

    return lines.join("\n").trim() + "\n";
  }

  function ensureConnectionInfo() {
    var owner = ownerInput.value.trim();
    var repo = repoInput.value.trim();
    var branch = branchInput.value.trim() || "main";
    var token = tokenInput.value.trim();
    if (!owner || !repo || !token) return null;
    return { owner: owner, repo: repo, branch: branch, token: token };
  }

  function resetDraftMode() {
    currentPostPathInput.value = "";
    titleInput.value = "";
    categoryInput.value = "일기";
    bodyInput.value = "";
    coverUrlInput.value = "";
    coverInput.value = "";
    galleryInput.value = "";
    appendGalleryInput.checked = true;
    dateInput.value = formatDatetimeLocal(new Date());
    updatePreview();
    setStatus("새 글 모드로 전환했습니다.", "status-info");
  }

  async function fillOwnerFromUser(token) {
    try {
      var me = await githubFetch(API_BASE + "/user", token, { method: "GET" });
      if (!ownerInput.value.trim() && me && me.login) ownerInput.value = me.login;
      if (me && me.login) {
        setOAuthStatus("OAuth 연결됨: @" + me.login, "status-success");
      } else {
        setOAuthStatus("OAuth 연결됨", "status-success");
      }
    } catch (_error) {
      setOAuthStatus("토큰은 저장됐지만 사용자 확인에 실패했습니다.", "status-info");
    }
  }

  async function beginOAuthLogin() {
    if (!oauthClientIdInput || !oauthProxyUrlInput) return;
    var clientId = oauthClientIdInput.value.trim();
    var proxyUrl = normalizeUrl(oauthProxyUrlInput.value);

    if (!clientId || !proxyUrl) {
      setOAuthStatus("OAuth Client ID와 OAuth Proxy URL을 먼저 입력하세요.", "status-error");
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      setOAuthStatus("이 브라우저는 OAuth PKCE를 지원하지 않습니다.", "status-error");
      return;
    }

    try {
      oauthLoginButton.disabled = true;
      oauthLoginButton.textContent = "이동 중...";

      var state = randomString(24);
      var verifier = randomString(48);
      var challenge = await createCodeChallenge(verifier);

      sessionStorage.setItem(
        OAUTH_PENDING_KEY,
        JSON.stringify({
          state: state,
          verifier: verifier,
          createdAt: Date.now(),
          clientId: clientId,
          proxyUrl: proxyUrl,
        })
      );

      saveConfig();

      var params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri(),
        scope: "repo",
        state: state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      window.location.assign("https://github.com/login/oauth/authorize?" + params.toString());
    } catch (error) {
      setOAuthStatus("OAuth 시작 실패: " + error.message, "status-error");
      oauthLoginButton.disabled = false;
      oauthLoginButton.textContent = "GitHub로 로그인";
    }
  }

  function clearOAuthSession() {
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    setOAuthStatus("OAuth 연결 해제됨", "status-info");
  }

  async function finishOAuthIfReturned() {
    if (!oauthClientIdInput || !oauthProxyUrlInput) return;

    var params = new URLSearchParams(window.location.search);
    if (!params.get("code") && !params.get("error")) return;

    if (params.get("error")) {
      setOAuthStatus("OAuth 승인 실패: " + (params.get("error_description") || params.get("error")), "status-error");
      clearOAuthParamsFromUrl();
      return;
    }

    var pendingRaw = sessionStorage.getItem(OAUTH_PENDING_KEY);
    if (!pendingRaw) {
      setOAuthStatus("OAuth 세션 정보가 없어 토큰 교환을 중단했습니다.", "status-error");
      clearOAuthParamsFromUrl();
      return;
    }

    var pending = null;
    try {
      pending = JSON.parse(pendingRaw);
    } catch (_error) {
      pending = null;
    }
    if (!pending) {
      setOAuthStatus("OAuth 세션을 해석하지 못했습니다.", "status-error");
      clearOAuthParamsFromUrl();
      return;
    }

    var state = params.get("state") || "";
    if (state !== pending.state) {
      setOAuthStatus("OAuth state 검증에 실패했습니다.", "status-error");
      clearOAuthParamsFromUrl();
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      return;
    }

    var code = params.get("code");
    var clientId = oauthClientIdInput.value.trim() || pending.clientId || "";
    var proxyUrl = normalizeUrl(oauthProxyUrlInput.value) || pending.proxyUrl || "";
    if (!clientId || !proxyUrl) {
      setOAuthStatus("OAuth 설정이 부족하여 토큰 교환을 할 수 없습니다.", "status-error");
      clearOAuthParamsFromUrl();
      return;
    }

    try {
      setOAuthStatus("OAuth 토큰 교환 중...", "status-info");
      var exchanged = await proxyExchangeToken(proxyUrl, {
        code: code,
        state: state,
        codeVerifier: pending.verifier,
        clientId: clientId,
        redirectUri: redirectUri(),
      });

      tokenInput.value = exchanged.access_token;
      await fillOwnerFromUser(exchanged.access_token);
      if (rememberTokenInput.checked) saveConfig();

      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      clearOAuthParamsFromUrl();
    } catch (error) {
      setOAuthStatus("OAuth 토큰 교환 실패: " + error.message, "status-error");
      clearOAuthParamsFromUrl();
    } finally {
      oauthLoginButton.disabled = false;
      oauthLoginButton.textContent = "GitHub로 로그인";
    }
  }

  async function loadPostList() {
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus("목록 조회 전 Owner/Repo/Token(또는 OAuth 로그인)을 설정하세요.", "status-error");
      return;
    }

    try {
      loadPostsButton.disabled = true;
      loadPostsButton.textContent = "조회 중...";
      setStatus("포스트 목록을 불러오는 중...", "status-info");
      var posts = await listPosts(info.owner, info.repo, info.branch, info.token);
      renderPostOptions(posts);
      setStatus("포스트 목록을 불러왔습니다. (" + posts.length + "개)", "status-success");
    } catch (error) {
      setStatus("목록 조회 실패: " + error.message, "status-error");
    } finally {
      loadPostsButton.disabled = false;
      loadPostsButton.textContent = "목록 새로고침";
    }
  }

  async function loadSelectedPost() {
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus("불러오기 전 Owner/Repo/Token(또는 OAuth 로그인)을 설정하세요.", "status-error");
      return;
    }

    var path = postListSelect.value;
    if (!path) {
      setStatus("불러올 포스트를 먼저 선택하세요.", "status-error");
      return;
    }

    try {
      loadSelectedPostButton.disabled = true;
      loadSelectedPostButton.textContent = "불러오는 중...";
      setStatus("포스트 내용을 불러오는 중...", "status-info");

      var meta = await getContentMeta(info.owner, info.repo, info.branch, path, info.token);
      if (!meta || !meta.content) throw new Error("포스트 내용을 찾지 못했습니다.");

      var markdown = base64ToUtf8(meta.content);
      var parsed = parseMarkdown(markdown);
      titleInput.value = parsed.data.title || "";
      categoryInput.value = parsed.data.category || "일기";
      coverUrlInput.value = parsed.data.cover || "";
      bodyInput.value = parsed.body.replace(/^\n+/, "");
      currentPostPathInput.value = path;
      coverInput.value = "";
      galleryInput.value = "";
      appendGalleryInput.checked = false;

      var loadedDate = datetimeLocalFromString(parsed.data.date);
      if (loadedDate) dateInput.value = loadedDate;

      updatePreview();
      setStatus("수정 모드로 불러왔습니다: " + path, "status-success");
    } catch (error) {
      setStatus("불러오기 실패: " + error.message, "status-error");
    } finally {
      loadSelectedPostButton.disabled = false;
      loadSelectedPostButton.textContent = "선택 글 불러오기";
    }
  }

  async function deleteCurrentPost() {
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus("삭제 전 Owner/Repo/Token(또는 OAuth 로그인)을 설정하세요.", "status-error");
      return;
    }

    var path = currentPostPathInput.value.trim() || postListSelect.value;
    if (!path) {
      setStatus("삭제할 포스트를 먼저 선택하거나 불러오세요.", "status-error");
      return;
    }

    if (!window.confirm("정말 삭제할까요?\n" + path)) return;

    try {
      deleteButton.disabled = true;
      deleteButton.textContent = "삭제 중...";
      setStatus("포스트 삭제 중...", "status-info");

      await deleteContent({
        owner: info.owner,
        repo: info.repo,
        branch: info.branch,
        path: path,
        token: info.token,
        message: "Delete diary post: " + path,
      });

      if (currentPostPathInput.value.trim() === path) resetDraftMode();
      await loadPostList();
      setStatus("삭제 완료: " + path, "status-success");
    } catch (error) {
      setStatus("삭제 실패: " + error.message, "status-error");
    } finally {
      deleteButton.disabled = false;
      deleteButton.textContent = "현재 글 삭제";
    }
  }

  async function handleBodyPaste(event) {
    var imageFiles = getClipboardImageFiles(event);
    if (!imageFiles.length) return;

    var info = ensureConnectionInfo();
    if (!info) {
      setStatus("이미지 붙여넣기를 쓰려면 먼저 GitHub 연결(OAuth/PAT)을 완료하세요.", "status-error");
      return;
    }

    event.preventDefault();

    var prefixBase = titleInput.value.trim() ? slugify(titleInput.value.trim()) : "pasted";
    var inserted = [];

    try {
      setStatus("붙여넣은 이미지 업로드 중...", "status-info");
      var i = 0;
      for (i = 0; i < imageFiles.length; i += 1) {
        var url = await uploadImage(info.owner, info.repo, info.branch, info.token, imageFiles[i], prefixBase, i);
        inserted.push("![붙여넣은 이미지 " + (i + 1) + "](" + url + ")");
      }

      var block = "\n" + inserted.join("\n\n") + "\n";
      bodyInput.focus();
      insertTextAtCursor(bodyInput, block);
      updatePreview();
      setStatus("붙여넣은 이미지 업로드 완료", "status-success");
    } catch (error) {
      setStatus("붙여넣기 업로드 실패: " + error.message, "status-error");
    }
  }

  async function publishPost() {
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus("Owner/Repo/Token(또는 OAuth 로그인)을 먼저 설정하세요.", "status-error");
      return;
    }

    var title = titleInput.value.trim();
    var category = categoryInput.value.trim() || "일기";
    var body = bodyInput.value.trim();
    var appendGallery = appendGalleryInput.checked;
    if (!title) {
      setStatus("제목은 필수입니다.", "status-error");
      return;
    }

    saveConfig();
    publishButton.disabled = true;
    publishButton.textContent = "Publishing...";
    setStatus("업로드를 시작합니다...", "status-info");

    try {
      var publishDate = dateInput.value ? new Date(dateInput.value) : new Date();
      if (Number.isNaN(publishDate.getTime())) publishDate = new Date();

      var currentPath = currentPostPathInput.value.trim();
      var slug = slugify(title);
      var postPath = currentPath;
      if (!postPath) {
        postPath = await buildUniquePostPath(
          info.owner,
          info.repo,
          info.branch,
          info.token,
          formatDatePrefix(publishDate),
          slug
        );
      }

      var coverUrl = coverUrlInput.value.trim();
      var galleryUrls = [];

      if (coverInput.files && coverInput.files[0]) {
        setStatus("표지 사진 업로드 중...", "status-info");
        coverUrl = await uploadImage(info.owner, info.repo, info.branch, info.token, coverInput.files[0], slug);
        coverUrlInput.value = coverUrl;
      }

      if (galleryInput.files && galleryInput.files.length > 0) {
        var i = 0;
        for (i = 0; i < galleryInput.files.length; i += 1) {
          setStatus("본문 사진 업로드 중... (" + (i + 1) + "/" + galleryInput.files.length + ")", "status-info");
          galleryUrls.push(
            await uploadImage(info.owner, info.repo, info.branch, info.token, galleryInput.files[i], slug, i)
          );
        }
      }

      var markdown = buildMarkdown({
        title: title,
        category: category,
        dateText: formatFrontMatterDate(publishDate),
        coverUrl: coverUrl,
        body: body,
        appendGallery: appendGallery,
        galleryUrls: galleryUrls,
      });

      await putContent({
        owner: info.owner,
        repo: info.repo,
        branch: info.branch,
        path: postPath,
        token: info.token,
        contentBase64: utf8ToBase64(markdown),
        message: (currentPath ? "Update" : "Add") + " diary post: " + title,
      });

      currentPostPathInput.value = postPath;
      var githubFileUrl =
        "https://github.com/" +
        encodeURIComponent(info.owner) +
        "/" +
        encodeURIComponent(info.repo) +
        "/blob/" +
        encodeURIComponent(info.branch) +
        "/" +
        postPath;

      await loadPostList();
      setStatus(
        '발행 완료. <a href="' +
          githubFileUrl +
          '" target="_blank" rel="noopener">GitHub에서 파일 보기</a>',
        "status-success",
        true
      );
    } catch (error) {
      setStatus("발행 실패: " + error.message, "status-error");
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = "Publish To GitHub";
    }
  }

  if (saveConfigButton) {
    saveConfigButton.addEventListener("click", function () {
      saveConfig();
      setStatus("연결 정보를 저장했습니다.", "status-success");
    });
  }

  if (oauthLoginButton) oauthLoginButton.addEventListener("click", beginOAuthLogin);
  if (oauthLogoutButton) {
    oauthLogoutButton.addEventListener("click", function () {
      tokenInput.value = "";
      clearOAuthSession();
      saveConfig();
    });
  }

  if (loadPostsButton) loadPostsButton.addEventListener("click", loadPostList);
  if (loadSelectedPostButton) loadSelectedPostButton.addEventListener("click", loadSelectedPost);
  if (newDraftButton) newDraftButton.addEventListener("click", resetDraftMode);
  if (deleteButton) deleteButton.addEventListener("click", deleteCurrentPost);
  if (bodyInput) bodyInput.addEventListener("paste", handleBodyPaste);

  [
    titleInput,
    categoryInput,
    dateInput,
    bodyInput,
    coverInput,
    coverUrlInput,
    galleryInput,
  ].forEach(function (element) {
    element.addEventListener("input", updatePreview);
    element.addEventListener("change", updatePreview);
  });

  publishButton.addEventListener("click", publishPost);

  loadConfig();
  if (!dateInput.value) dateInput.value = formatDatetimeLocal(new Date());
  updatePreview();
  finishOAuthIfReturned();
})();
