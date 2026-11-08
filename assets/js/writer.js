(function () {
  "use strict";

  var STORAGE_KEY = "myDiaryWriterConfigV3";
  var OAUTH_PENDING_KEY = "myDiaryWriterOAuthPendingV1";
  var API_BASE = "https://api.github.com";
  var draftStatus = document.getElementById("draft-status");
  var loadedSha = null;
  var loadedFrontMatter = "";
  var draftSaved = true;
  var busy = false;
  var publishedSnapshot = "";
  var disabledBefore = [];

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
  var dateInput = document.getElementById("post-date");
  var coverInput = document.getElementById("cover-image");
  var autoCoverInput = document.getElementById("auto-cover");
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
  var previewTitle = document.getElementById("preview-title");
  var previewCover = document.getElementById("preview-cover");
  var previewBody = document.getElementById("preview-body");
  var previewGallery = document.getElementById("preview-gallery");

  if (
    !ownerInput ||
    !repoInput ||
    !titleInput ||
    !publishButton ||
    !postListSelect
  ) {
    return;
  }

  var coverObjectUrl = null;
  var galleryObjectUrls = [];
  var imageUploadCache = new WeakMap();

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
    var normalized = String(value).replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
      "$1T$2$3:$4",
    );
    var date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return "";
    return formatDatetimeLocal(date);
  }

  function escapeYaml(value) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, " ")
      .trim();
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
    window.history.replaceState(
      {},
      document.title,
      url.pathname + url.search + url.hash,
    );
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000;
    var binary = "";
    var i = 0;
    for (i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize),
      );
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
    var start =
      typeof textarea.selectionStart === "number"
        ? textarea.selectionStart
        : textarea.value.length;
    var end =
      typeof textarea.selectionEnd === "number"
        ? textarea.selectionEnd
        : textarea.value.length;
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

    Array.prototype.forEach.call(
      event.clipboardData.items,
      function (item, index) {
        if (!item || !item.type || item.type.indexOf("image/") !== 0) return;
        var file = item.getAsFile();
        if (!file) return;

        if (!file.name) {
          var ext = extensionFromMime(file.type);
          file = new File([file], "pasted-image-" + (index + 1) + "." + ext, {
            type: file.type || "image/png",
          });
        }
        files.push(file);
      },
    );

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
    if (text.startsWith("//")) return "";
    if (text.startsWith("/"))
      return text.startsWith(siteBase + "/") ? text : siteBase + text;
    return text;
  }

  function toMarkdownAssetUrl(value) {
    var text = (value || "").trim();
    if (!text) return "";
    if (/^\{\{\s*['"][^'"]+['"]\s*\|\s*relative_url\s*\}\}$/.test(text))
      return text;
    if (text.startsWith("/assets/")) {
      return "{{ '" + text + "' | relative_url }}";
    }
    return text;
  }

  function normalizeBodyAssetUrls(markdown) {
    var text = String(markdown || "");
    return text.replace(
      /(!?\[[^\]]*\]\()\/assets\/([^) \t]+)(\))/g,
      function (_match, open, pathPart, close) {
        return (
          open +
          toMarkdownAssetUrl("/assets/" + pathPart.replace(/^\/+/, "")) +
          close
        );
      },
    );
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function extractMarkdownUrl(rawUrl) {
    var url = (rawUrl || "").trim();
    if (!url) return "";
    var liquidRelativeMatch = url.match(
      /^\{\{\s*['"]([^'"]+)['"]\s*\|\s*relative_url\s*\}\}$/,
    );
    if (liquidRelativeMatch) return liquidRelativeMatch[1];
    if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
    if (/\s+/.test(url)) url = url.split(/\s+/)[0];
    return url;
  }

  function toSafePreviewUrl(rawUrl) {
    var url = extractMarkdownUrl(rawUrl);
    if (!url || /[\u0000-\u001f]/.test(url) || url.startsWith("//")) return "";
    if (!/^(https?:\/\/|\/(?!\/)|\.\.?\/)/i.test(url)) return "";
    return toPreviewAssetUrl(url);
  }

  function renderInlineMarkdown(text) {
    var tokens = [];
    var source = String(text).replace(
      /`([^`]+)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)/g,
      function (match, code, alt, imageUrl, label, linkUrl) {
        var html;
        if (code !== undefined) html = "<code>" + escapeHtml(code) + "</code>";
        else {
          var url = toSafePreviewUrl(imageUrl || linkUrl);
          html = url
            ? imageUrl
              ? '<img src="' +
                escapeHtml(url) +
                '" alt="' +
                escapeHtml(alt) +
                '" loading="lazy" />'
              : '<a href="' +
                escapeHtml(url) +
                '" target="_blank" rel="noopener noreferrer">' +
                escapeHtml(label) +
                "</a>"
            : escapeHtml(alt || label || "");
        }
        tokens.push(html);
        return "\u0000" + (tokens.length - 1) + "\u0000";
      },
    );
    return escapeHtml(source)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\u0000(\d+)\u0000/g, function (_, index) {
        return tokens[Number(index)] || "";
      });
  }

  function renderMarkdownPreview(markdown) {
    var source = String(markdown || "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!source) {
      return '<p class="preview-empty">내용 미리보기가 여기에 표시됩니다.</p>';
    }

    var lines = source.split("\n");
    var htmlParts = [];
    var paragraphLines = [];
    var quoteLines = [];
    var listType = "";
    var listItems = [];
    var inCodeFence = false;
    var codeLines = [];
    var i = 0;

    function flushParagraph() {
      if (!paragraphLines.length) return;
      htmlParts.push(
        "<p>" +
          paragraphLines.map(renderInlineMarkdown).join("<br />") +
          "</p>",
      );
      paragraphLines = [];
    }

    function flushQuote() {
      if (!quoteLines.length) return;
      htmlParts.push(
        "<blockquote><p>" +
          quoteLines.map(renderInlineMarkdown).join("<br />") +
          "</p></blockquote>",
      );
      quoteLines = [];
    }

    function flushList() {
      if (!listItems.length || !listType) return;
      htmlParts.push("<" + listType + ">");
      listItems.forEach(function (item) {
        htmlParts.push("<li>" + renderInlineMarkdown(item) + "</li>");
      });
      htmlParts.push("</" + listType + ">");
      listType = "";
      listItems = [];
    }

    function flushCodeFence() {
      if (!inCodeFence) return;
      htmlParts.push(
        "<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>",
      );
      inCodeFence = false;
      codeLines = [];
    }

    for (i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      var quoteMatch = null;
      var headingMatch = null;
      var orderedMatch = null;
      var unorderedMatch = null;

      if (inCodeFence) {
        if (/^\s*```/.test(line)) {
          flushCodeFence();
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (/^\s*```/.test(line)) {
        flushParagraph();
        flushQuote();
        flushList();
        inCodeFence = true;
        codeLines = [];
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushQuote();
        flushList();
        continue;
      }

      quoteMatch = line.match(/^\s*>\s?(.*)$/);
      if (quoteMatch) {
        flushParagraph();
        flushList();
        quoteLines.push(quoteMatch[1]);
        continue;
      }
      flushQuote();

      headingMatch = line.match(/^\s*(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        htmlParts.push(
          "<h" +
            headingMatch[1].length +
            ">" +
            renderInlineMarkdown(headingMatch[2].trim()) +
            "</h" +
            headingMatch[1].length +
            ">",
        );
        continue;
      }

      orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (orderedMatch) {
        flushParagraph();
        if (listType && listType !== "ol") flushList();
        listType = "ol";
        listItems.push(orderedMatch[1]);
        continue;
      }

      unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
      if (unorderedMatch) {
        flushParagraph();
        if (listType && listType !== "ul") flushList();
        listType = "ul";
        listItems.push(unorderedMatch[1]);
        continue;
      }

      flushList();
      paragraphLines.push(line);
    }

    flushCodeFence();
    flushParagraph();
    flushQuote();
    flushList();

    return htmlParts.join("");
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

    return { data: data, body: body, frontMatter: frontMatter };
  }

  function setStatus(message, type, allowHtml) {
    statusElement.classList.remove(
      "status-info",
      "status-error",
      "status-success",
    );
    statusElement.classList.add(type || "status-info");
    if (allowHtml) {
      statusElement.innerHTML = message;
    } else {
      statusElement.textContent = message;
    }
    if (type === "status-error")
      statusElement.scrollIntoView({ block: "nearest" });
  }

  function setOAuthStatus(message, type) {
    if (!oauthStatusElement) return;
    oauthStatusElement.classList.remove(
      "status-info",
      "status-error",
      "status-success",
    );
    oauthStatusElement.classList.add(type || "status-info");
    oauthStatusElement.textContent = message;
  }

  function getStoredConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (error) {
      return {};
    }
  }

  function loadConfig() {
    var config = getStoredConfig();
    ownerInput.value =
      config.owner || document.querySelector(".writer-page").dataset.owner;
    repoInput.value =
      config.repo || document.querySelector(".writer-page").dataset.repo;
    branchInput.value = config.branch || "main";
    if (oauthClientIdInput)
      oauthClientIdInput.value = config.oauthClientId || "";
    if (oauthProxyUrlInput)
      oauthProxyUrlInput.value = config.oauthProxyUrl || "";
    try {
      var session = JSON.parse(
        sessionStorage.getItem("myDiaryWriterSessionV1") || "null",
      );
      if (
        session &&
        session.owner === ownerInput.value &&
        session.repo === repoInput.value &&
        session.branch === branchInput.value
      )
        tokenInput.value = session.token;
    } catch (_) {}
    if (config.token) {
      tokenInput.value = config.token;
      rememberTokenInput.checked = true;
      setOAuthStatus(
        "저장된 토큰이 있습니다. 바로 발행할 수 있습니다.",
        "status-success",
      );
    }
  }

  function saveConfig() {
    var config = {
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || "main",
      oauthClientId: oauthClientIdInput ? oauthClientIdInput.value.trim() : "",
      oauthProxyUrl: oauthProxyUrlInput
        ? normalizeUrl(oauthProxyUrlInput.value)
        : "",
    };
    if (rememberTokenInput.checked && tokenInput.value.trim()) {
      config.token = tokenInput.value.trim();
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      sessionStorage.setItem(
        "myDiaryWriterSessionV1",
        JSON.stringify({
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          token: tokenInput.value.trim(),
        }),
      );
      updateConnectionState();
      return true;
    } catch (_) {
      setStatus(
        "브라우저 저장 공간을 사용할 수 없어 연결 정보를 기억하지 못합니다. 현재 창에서는 계속 작성할 수 있어요.",
        "status-error",
      );
      return false;
    }
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
    document.getElementById("word-count").textContent =
      bodyInput.value.replace(/\s/g, "").length.toLocaleString("ko-KR") + "자";
    previewDate.textContent = formatDisplayDate(dateInput.value);
    previewTitle.textContent = titleInput.value.trim() || "제목을 입력하세요";
    previewBody.innerHTML = renderMarkdownPreview(bodyInput.value);

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
      existingCover.src = toSafePreviewUrl(coverUrlInput.value.trim());
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
    if (!coverInput.files.length)
      document.getElementById("cover-file-status").textContent =
        "긴 변 1,600px 이내로 줄여 JPG로 저장해요. 작은 사진은 확대하지 않아요.";
    updateCoverCard();
  }

  function updateCoverCard() {
    var source = coverObjectUrl || toSafePreviewUrl(coverUrlInput.value.trim());
    var automatic = false;
    if (!source && autoCoverInput.checked) {
      var firstBodyImage = previewBody.querySelector("img");
      source = firstBodyImage
        ? firstBodyImage.getAttribute("src")
        : appendGalleryInput.checked
          ? galleryObjectUrls[0]
          : "";
      automatic = !!source;
    }
    var image = document.getElementById("cover-card-preview");
    image.hidden = !source;
    if (source) image.src = source;
    else image.removeAttribute("src");
    document.getElementById("cover-preview-note").textContent = source
      ? automatic
        ? "본문 첫 사진을 자동으로 사용합니다."
        : "선택한 사진을 표지로 사용합니다."
      : autoCoverInput.checked
        ? "사진을 추가하면 여기에 표시됩니다."
        : "이 글은 표지 없이 표시됩니다.";
  }

  coverInput.addEventListener("change", async function () {
    var file = coverInput.files[0];
    var status = document.getElementById("cover-file-status");
    if (!file) {
      status.textContent = "긴 변 1,600px 이내로 줄여 JPG로 저장해요.";
      return;
    }
    try {
      validateImage(file);
      status.textContent = "표지 사진 크기를 조정하고 있어요…";
      var prepared = await window.DiaryCoverImage.prepare(file);
      if (coverInput.files[0] !== file) return;
      status.textContent =
        prepared.width +
        " × " +
        prepared.height +
        "px · " +
        Math.ceil(prepared.file.size / 1024) +
        "KB · 발행할 때 저장됩니다.";
    } catch (error) {
      if (coverInput.files[0] === file) status.textContent = error.message;
    }
  });
  document.getElementById("clear-cover").addEventListener("click", function () {
    coverInput.value = "";
    coverUrlInput.value = "";
    autoCoverInput.checked = false;
    document.getElementById("cover-file-status").textContent =
      "표지 사진을 다시 선택할 수 있어요.";
    updatePreview();
    saveDraft();
  });

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
      var detail =
        payload && payload.message
          ? payload.message
          : "HTTP " + response.status;
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
    var data =
      contentType.indexOf("application/json") >= 0 ? await response.json() : {};
    if (!response.ok)
      throw new Error(data.message || data.error || "OAuth token 교환 실패");
    if (!data.access_token)
      throw new Error("OAuth access token이 응답에 없습니다.");
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
    var existing = await getContentMeta(
      params.owner,
      params.repo,
      params.branch,
      params.path,
      params.token,
    );
    if (
      Object.prototype.hasOwnProperty.call(params, "expectedSha") &&
      (existing ? existing.sha : null) !== params.expectedSha
    ) {
      throw new Error(
        "다른 곳에서 내용이 변경되었습니다. 현재 내용을 임시저장한 뒤 최신 글을 다시 불러와 주세요.",
      );
    }
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
      { method: "PUT", body: payload },
    );
  }

  async function deleteContent(params) {
    var existing = await getContentMeta(
      params.owner,
      params.repo,
      params.branch,
      params.path,
      params.token,
    );
    if (!existing || !existing.sha)
      throw new Error("삭제할 파일을 찾지 못했습니다.");

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
      },
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
      var indexed = postIndex.find(function (entry) {
        return entry.path === item.path;
      });
      option.textContent = indexed
        ? indexed.date + " · " + indexed.title
        : item.name;
      postListSelect.appendChild(option);
    });
  }

  async function uploadImage(owner, repo, branch, token, file, prefix, index) {
    validateImage(file);
    var destination = owner + "/" + repo + ":" + branch;
    var cached = imageUploadCache.get(file);
    if (cached && cached.destination === destination) return cached.url;
    var now = new Date();
    var ext = fileExtension(file);
    var fileBase =
      file.name.lastIndexOf(".") > 0
        ? file.name.slice(0, file.name.lastIndexOf("."))
        : file.name;
    var safeBase = sanitizeName(fileBase);
    var imagePath =
      "assets/photos/" +
      buildTimestamp(now) +
      "-" +
      randomString(6) +
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
    imageUploadCache.set(file, {
      destination: destination,
      url: "/" + imagePath,
    });
    return "/" + imagePath;
  }

  async function buildUniquePostPath(
    owner,
    repo,
    branch,
    token,
    datePrefix,
    slug,
  ) {
    var path = "_posts/" + datePrefix + "-" + slug + ".md";
    var meta = await getContentMeta(owner, repo, branch, path, token);
    if (!meta) return path;
    return (
      "_posts/" +
      datePrefix +
      "-" +
      slug +
      "-" +
      buildTimestamp(new Date()).slice(-6) +
      ".md"
    );
  }

  function buildMarkdown(payload) {
    var lines = [];
    lines.push("---");
    // Keep unrelated front matter, including multiline values, when editing.
    var keep = false;
    loadedFrontMatter.split("\n").forEach(function (line) {
      if (/^[^\s#][^:]*:/.test(line))
        keep = !/^(title|date|cover|cover_auto):/.test(line);
      if (keep) lines.push(line);
    });
    lines.push('title: "' + escapeYaml(payload.title) + '"');
    lines.push("date: " + payload.dateText);
    if (payload.coverUrl)
      lines.push('cover: "' + escapeYaml(payload.coverUrl) + '"');
    if (!autoCoverInput.checked) lines.push("cover_auto: false");
    lines.push("---");
    lines.push("");
    lines.push(payload.body || "");

    if (payload.appendGallery && payload.galleryUrls.length > 0) {
      lines.push("");
      lines.push("## 사진 기록");
      lines.push("");
      payload.galleryUrls.forEach(function (url, index) {
        lines.push(
          "![사진 " + (index + 1) + "](" + toMarkdownAssetUrl(url) + ")",
        );
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
    if (!owner || !repo || !token) {
      document.getElementById("connection").open = true;
      return null;
    }
    return { owner: owner, repo: repo, branch: branch, token: token };
  }

  function resetDraftMode() {
    loadedSha = null;
    loadedFrontMatter = "";
    currentPostPathInput.value = "";
    titleInput.value = "";
    bodyInput.value = "";
    coverUrlInput.value = "";
    coverInput.value = "";
    autoCoverInput.checked = true;
    galleryInput.value = "";
    appendGalleryInput.checked = true;
    dateInput.value = formatDatetimeLocal(new Date());
    updatePreview();
    publishedSnapshot = snapshot();
    saveDraft();
    updateMode();
    showEditor(true);
    titleInput.focus();
    setStatus("새 페이지를 열었습니다.", "status-info");
  }

  async function fillOwnerFromUser(token) {
    try {
      var me = await githubFetch(API_BASE + "/user", token, { method: "GET" });
      if (!ownerInput.value.trim() && me && me.login)
        ownerInput.value = me.login;
      if (me && me.login) {
        setOAuthStatus("OAuth 연결됨: @" + me.login, "status-success");
      } else {
        setOAuthStatus("OAuth 연결됨", "status-success");
      }
    } catch (_error) {
      setOAuthStatus(
        "토큰은 저장됐지만 사용자 확인에 실패했습니다.",
        "status-info",
      );
    }
  }

  async function beginOAuthLogin() {
    if (!oauthClientIdInput || !oauthProxyUrlInput) return;
    var clientId = oauthClientIdInput.value.trim();
    var proxyUrl = normalizeUrl(oauthProxyUrlInput.value);

    if (!clientId || !proxyUrl) {
      setOAuthStatus(
        "OAuth Client ID와 OAuth Proxy URL을 먼저 입력하세요.",
        "status-error",
      );
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      setOAuthStatus(
        "이 브라우저는 OAuth PKCE를 지원하지 않습니다.",
        "status-error",
      );
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
        }),
      );

      saveConfig();
      saveDraft();
      if (!draftSaved && hasChanges())
        throw new Error(
          "임시저장에 실패했습니다. 로그인 전에 작성한 내용을 복사해 주세요.",
        );

      var params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri(),
        scope: "repo",
        state: state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      window.location.assign(
        "https://github.com/login/oauth/authorize?" + params.toString(),
      );
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
      setOAuthStatus(
        "OAuth 승인 실패: " +
          (params.get("error_description") || params.get("error")),
        "status-error",
      );
      clearOAuthParamsFromUrl();
      return;
    }

    var pendingRaw = sessionStorage.getItem(OAUTH_PENDING_KEY);
    if (!pendingRaw) {
      setOAuthStatus(
        "OAuth 세션 정보가 없어 토큰 교환을 중단했습니다.",
        "status-error",
      );
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
    var proxyUrl =
      normalizeUrl(oauthProxyUrlInput.value) || pending.proxyUrl || "";
    if (!clientId || !proxyUrl) {
      setOAuthStatus(
        "OAuth 설정이 부족하여 토큰 교환을 할 수 없습니다.",
        "status-error",
      );
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
      saveConfig();
      updateConnectionState();

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
      setStatus(
        "목록 조회 전 Owner/Repo/Token(또는 OAuth 로그인)을 설정하세요.",
        "status-error",
      );
      return;
    }

    try {
      loadPostsButton.disabled = true;
      loadPostsButton.textContent = "조회 중...";
      setStatus("포스트 목록을 불러오는 중...", "status-info");
      var posts = await listPosts(
        info.owner,
        info.repo,
        info.branch,
        info.token,
      );
      renderPostOptions(posts);
      setStatus(
        "포스트 목록을 불러왔습니다. (" + posts.length + "개)",
        "status-success",
      );
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
      setStatus(
        "불러오기 전 Owner/Repo/Token(또는 OAuth 로그인)을 설정하세요.",
        "status-error",
      );
      return;
    }

    var path = postListSelect.value;
    if (!path) {
      setStatus("불러올 포스트를 먼저 선택하세요.", "status-error");
      return;
    }

    if (
      hasChanges() &&
      !window.confirm(
        "현재 임시글 대신 선택한 글을 불러올까요? 필요한 내용은 먼저 복사해 주세요.",
      )
    )
      return;
    try {
      setBusy(true);
      loadSelectedPostButton.disabled = true;
      loadSelectedPostButton.textContent = "불러오는 중...";
      setStatus("포스트 내용을 불러오는 중...", "status-info");

      var meta = await getContentMeta(
        info.owner,
        info.repo,
        info.branch,
        path,
        info.token,
      );
      if (!meta || !meta.content)
        throw new Error("포스트 내용을 찾지 못했습니다.");

      var markdown = base64ToUtf8(meta.content);
      var parsed = parseMarkdown(markdown);
      loadedSha = meta.sha;
      loadedFrontMatter = parsed.frontMatter || "";
      titleInput.value = parsed.data.title || "";
      coverUrlInput.value = parsed.data.cover || "";
      autoCoverInput.checked = parsed.data.cover_auto !== "false";
      bodyInput.value = parsed.body.replace(/^\n+/, "");
      currentPostPathInput.value = path;
      coverInput.value = "";
      galleryInput.value = "";
      appendGalleryInput.checked = false;

      var loadedDate = datetimeLocalFromString(parsed.data.date);
      if (loadedDate) dateInput.value = loadedDate;

      updatePreview();
      publishedSnapshot = snapshot();
      saveDraft();
      updateMode();
      showEditor(true);
      setStatus(
        "‘" + titleInput.value + "’을 불러왔습니다. 수정 후 발행해 주세요.",
        "status-success",
      );
    } catch (error) {
      setStatus("불러오기 실패: " + error.message, "status-error");
    } finally {
      setBusy(false);
      loadSelectedPostButton.disabled = false;
      loadSelectedPostButton.textContent = "선택 글 불러오기";
    }
  }

  async function deleteCurrentPost() {
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus(
        "삭제 전 Owner/Repo/Token(또는 OAuth 로그인)을 설정하세요.",
        "status-error",
      );
      return;
    }

    var path = currentPostPathInput.value.trim();
    if (!path) {
      setStatus("삭제할 포스트를 먼저 선택하거나 불러오세요.", "status-error");
      return;
    }

    if (!window.confirm("정말 삭제할까요?\n" + path)) return;

    try {
      setBusy(true);
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
      setBusy(false);
      updateMode();
      deleteButton.textContent = "현재 글 삭제";
    }
  }

  async function handleBodyPaste(event) {
    var imageFiles = getClipboardImageFiles(event);
    if (!imageFiles.length) return;

    var info = ensureConnectionInfo();
    if (!info) {
      setStatus(
        "이미지 붙여넣기를 쓰려면 먼저 GitHub 연결(OAuth/PAT)을 완료하세요.",
        "status-error",
      );
      return;
    }

    event.preventDefault();

    var prefixBase = titleInput.value.trim()
      ? slugify(titleInput.value.trim())
      : "pasted";
    var inserted = [];

    try {
      setBusy(true);
      setStatus("붙여넣은 이미지 업로드 중...", "status-info");
      var i = 0;
      for (i = 0; i < imageFiles.length; i += 1) {
        var url = await uploadImage(
          info.owner,
          info.repo,
          info.branch,
          info.token,
          imageFiles[i],
          prefixBase,
          i,
        );
        inserted.push(
          "![붙여넣은 이미지 " + (i + 1) + "](" + toMarkdownAssetUrl(url) + ")",
        );
      }

      var block = "\n" + inserted.join("\n\n") + "\n";
      bodyInput.focus();
      insertTextAtCursor(bodyInput, block);
      updatePreview();
      saveDraft();
      setStatus("붙여넣은 이미지 업로드 완료", "status-success");
    } catch (error) {
      setStatus("붙여넣기 업로드 실패: " + error.message, "status-error");
    } finally {
      setBusy(false);
    }
  }

  async function publishPost() {
    if (busy) return;
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus(
        "위의 ‘발행 계정 연결’을 열어 로그인해 주세요. 글은 임시저장되어 있습니다.",
        "status-error",
      );
      return;
    }

    var title = titleInput.value.trim();
    var body = normalizeBodyAssetUrls(bodyInput.value.trim());
    var appendGallery = appendGalleryInput.checked;
    if (!title) {
      showEditor(true);
      titleInput.focus();
      setStatus("제목을 입력해 주세요.", "status-error");
      return;
    }

    if (!body && !(galleryInput.files && galleryInput.files.length)) {
      setStatus("본문을 쓰거나 사진을 추가해 주세요.", "status-error");
      bodyInput.focus();
      return;
    }
    var chosenDate = new Date(dateInput.value);
    if (
      Number.isNaN(chosenDate.getTime()) ||
      chosenDate.getTime() > Date.now() + 60000
    ) {
      setStatus(
        "기록 날짜는 현재 또는 과거로 선택해 주세요. 예약 발행은 지원하지 않습니다.",
        "status-error",
      );
      dateInput.focus();
      return;
    }
    if (
      coverUrlInput.value.trim() &&
      !toSafePreviewUrl(coverUrlInput.value.trim())
    ) {
      setStatus(
        "표지 주소는 https:// 또는 /assets/로 시작하는 사진 주소를 입력해 주세요.",
        "status-error",
      );
      return;
    }
    try {
      Array.from(coverInput.files)
        .concat(Array.from(galleryInput.files))
        .forEach(validateImage);
    } catch (error) {
      setStatus(error.message, "status-error");
      return;
    }
    saveConfig();
    saveDraft();
    setBusy(true);
    publishButton.disabled = true;
    publishButton.textContent = "발행 중…";
    setStatus("업로드를 시작합니다...", "status-info");

    try {
      var publishDate = dateInput.value
        ? new Date(dateInput.value)
        : new Date();
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
          slug,
        );
      }

      var coverUrl = coverUrlInput.value.trim();
      var galleryUrls = [];

      if (coverInput.files && coverInput.files[0]) {
        setStatus("표지 사진 업로드 중...", "status-info");
        var preparedCover = await window.DiaryCoverImage.prepare(
          coverInput.files[0],
        );
        coverUrl = await uploadImage(
          info.owner,
          info.repo,
          info.branch,
          info.token,
          preparedCover.file,
          slug,
        );
        coverUrlInput.value = coverUrl;
        coverInput.value = "";
        saveDraft();
      }

      if (galleryInput.files && galleryInput.files.length > 0) {
        var i = 0;
        for (i = 0; i < galleryInput.files.length; i += 1) {
          setStatus(
            "본문 사진 업로드 중... (" +
              (i + 1) +
              "/" +
              galleryInput.files.length +
              ")",
            "status-info",
          );
          galleryUrls.push(
            await uploadImage(
              info.owner,
              info.repo,
              info.branch,
              info.token,
              galleryInput.files[i],
              slug,
              i,
            ),
          );
        }
      }

      var markdown = buildMarkdown({
        title: title,
        dateText: formatFrontMatterDate(publishDate),
        coverUrl: coverUrl,
        body: body,
        appendGallery: appendGallery,
        galleryUrls: galleryUrls,
      });

      var savedPost = await putContent({
        expectedSha: currentPath ? loadedSha : null,
        owner: info.owner,
        repo: info.repo,
        branch: info.branch,
        path: postPath,
        token: info.token,
        contentBase64: utf8ToBase64(markdown),
        message: (currentPath ? "Update" : "Add") + " diary post: " + title,
      });

      currentPostPathInput.value = postPath;
      loadedSha = savedPost.content.sha;
      var savedMarkdown = parseMarkdown(markdown);
      loadedFrontMatter = savedMarkdown.frontMatter || "";
      bodyInput.value = savedMarkdown.body.replace(/^\n+/, "");
      galleryInput.value = "";
      appendGalleryInput.checked = false;
      publishedSnapshot = snapshot();
      saveDraft();
      updatePreview();
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
        '저장 완료! 사이트 반영까지 잠시 걸릴 수 있어요. <a href="' +
          githubFileUrl +
          '" target="_blank" rel="noopener">GitHub에서 파일 보기</a>',
        "status-success",
        true,
      );
    } catch (error) {
      setStatus("발행 실패: " + error.message, "status-error");
    } finally {
      setBusy(false);
      updateMode();
    }
  }

  var postIndex = [];
  var profileObjectUrl = null;
  var profileFields = ["name", "tagline", "bio", "avatar", "website"];
  var profileBaseline = JSON.stringify(readProfile());

  function draftKey() {
    return (
      "myDiaryDraftV1:" +
      siteBase +
      ":" +
      ownerInput.value +
      "/" +
      repoInput.value +
      ":" +
      branchInput.value
    );
  }
  function draftData() {
    return {
      title: titleInput.value,
      body: bodyInput.value,
      date: dateInput.value,
      cover: coverUrlInput.value,
      autoCover: autoCoverInput.checked,
      path: currentPostPathInput.value,
      sha: loadedSha,
      frontMatter: loadedFrontMatter,
      appendGallery: appendGalleryInput.checked,
      publishedSnapshot: publishedSnapshot,
      hasFiles: !!(coverInput.files.length || galleryInput.files.length),
      updatedAt: new Date().toISOString(),
    };
  }
  function snapshot() {
    return JSON.stringify([
      titleInput.value,
      bodyInput.value,
      dateInput.value,
      coverUrlInput.value,
      autoCoverInput.checked,
    ]);
  }
  function hasChanges() {
    return (
      (!!titleInput.value ||
        !!bodyInput.value ||
        !!coverInput.files.length ||
        !!galleryInput.files.length) &&
      (snapshot() !== publishedSnapshot ||
        coverInput.files.length ||
        galleryInput.files.length)
    );
  }
  function saveDraft() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify(draftData()));
      draftSaved = true;
      draftStatus.textContent =
        "임시저장됨 · " +
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
      if (coverInput.files.length || galleryInput.files.length)
        draftStatus.textContent += " · 사진은 다시 선택 필요";
    } catch (_) {
      draftSaved = false;
      draftStatus.textContent =
        "임시저장 실패 · 창을 닫기 전 내용을 복사해 주세요";
    }
  }
  function restoreDraft() {
    publishedSnapshot = snapshot();
    try {
      var draft = JSON.parse(localStorage.getItem(draftKey()) || "null");
      if (
        !draft ||
        typeof draft.body !== "string" ||
        typeof draft.title !== "string"
      )
        return;
      titleInput.value = draft.title;
      bodyInput.value = draft.body;
      dateInput.value = draft.date || formatDatetimeLocal(new Date());
      coverUrlInput.value = draft.cover || "";
      autoCoverInput.checked = draft.autoCover !== false;
      currentPostPathInput.value = draft.path || "";
      loadedSha = draft.sha || null;
      loadedFrontMatter = draft.frontMatter || "";
      appendGalleryInput.checked = draft.appendGallery !== false;
      publishedSnapshot = draft.publishedSnapshot || "";
      draftStatus.textContent = "이 브라우저의 임시글을 복원했어요";
      if (draft.hasFiles)
        setStatus(
          "글을 복원했습니다. 이전에 선택한 사진 파일은 다시 선택해 주세요.",
          "status-info",
        );
    } catch (_) {
      draftStatus.textContent = "임시저장에 접근할 수 없어요";
    }
  }
  function updateMode() {
    publishButton.textContent = currentPostPathInput.value
      ? "수정 발행"
      : "발행하기 ↗";
    deleteButton.disabled = !currentPostPathInput.value;
  }
  function updateConnectionState() {
    document.getElementById("connection-state").textContent =
      tokenInput.value.trim()
        ? "연결 정보 준비됨"
        : "로그인 후 발행할 수 있어요";
  }
  function setBusy(value) {
    if (value && !busy) {
      disabledBefore = Array.from(
        document.querySelectorAll(
          ".writer-page input, .writer-page textarea, .writer-page select, .writer-page button",
        ),
      ).map(function (element) {
        return [element, element.disabled];
      });
      disabledBefore.forEach(function (entry) {
        entry[0].disabled = true;
      });
    } else if (!value && busy) {
      disabledBefore.forEach(function (entry) {
        entry[0].disabled = entry[1];
      });
      disabledBefore = [];
    }
    busy = value;
    if (!value) updateMode();
    document
      .querySelector(".writer-page")
      .setAttribute("aria-busy", String(value));
  }
  function validateImage(file) {
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    )
      throw new Error("JPG, PNG, WebP, GIF 사진을 선택해 주세요.");
    if (file.size > 10 * 1024 * 1024)
      throw new Error("사진 한 장은 10MB 이하로 선택해 주세요.");
  }
  function showEditor(editing) {
    document.getElementById("editor-pane").hidden = !editing;
    document.getElementById("preview-pane").hidden = editing;
    document
      .getElementById("show-editor")
      .setAttribute("aria-pressed", String(editing));
    document
      .getElementById("show-preview")
      .setAttribute("aria-pressed", String(!editing));
    if (!editing) updatePreview();
  }
  document.getElementById("show-editor").addEventListener("click", function () {
    showEditor(true);
  });
  document
    .getElementById("show-preview")
    .addEventListener("click", function () {
      showEditor(false);
    });
  document.getElementById("save-draft").addEventListener("click", saveDraft);
  document.querySelectorAll("[data-format]").forEach(function (button) {
    button.addEventListener("click", function () {
      var start = bodyInput.selectionStart;
      var end = bodyInput.selectionEnd;
      var selected = bodyInput.value.slice(start, end);
      var format = button.dataset.format;
      var value;
      if (format === "bold") value = "**" + (selected || "강조할 문장") + "**";
      if (format === "heading") value = "\n## " + (selected || "소제목") + "\n";
      if (format === "quote")
        value =
          "\n" +
          (selected || "인용할 문장")
            .split("\n")
            .map(function (line) {
              return "> " + line;
            })
            .join("\n") +
          "\n";
      if (format === "list")
        value =
          "\n" +
          (selected || "첫 번째 기록")
            .split("\n")
            .map(function (line) {
              return "- " + line;
            })
            .join("\n") +
          "\n";
      if (format === "link")
        value = "[" + (selected || "링크 이름") + "](https://example.com)";
      insertTextAtCursor(bodyInput, value);
      bodyInput.focus();
      updatePreview();
      saveDraft();
    });
  });
  document.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!busy) saveDraft();
    }
  });
  window.addEventListener("beforeunload", function (event) {
    if (
      busy ||
      (!draftSaved && hasChanges()) ||
      coverInput.files.length ||
      galleryInput.files.length ||
      document.getElementById("profile-photo").files.length ||
      JSON.stringify(readProfile()) !== profileBaseline
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", function () {
    if (hasChanges()) saveDraft();
  });
  tokenInput.addEventListener("input", updateConnectionState);
  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#profile")
      document.getElementById("profile").open = true;
  });

  async function preparePostIndex() {
    try {
      var response = await fetch(siteBase + "/posts.json");
      if (!response.ok) return;
      postIndex = await response.json();
      renderPostOptions(
        postIndex.map(function (post) {
          return { path: post.path, name: post.title };
        }),
      );
      var requested = new URLSearchParams(window.location.search).get("edit");
      if (
        requested &&
        postIndex.some(function (post) {
          return post.path === requested;
        })
      ) {
        postListSelect.value = requested;
        document.getElementById("manage").open = true;
        if (tokenInput.value.trim()) await loadSelectedPost();
        else
          setStatus(
            "수정할 글을 선택했어요. 계정 연결 후 ‘선택 글 불러오기’를 눌러주세요.",
            "status-info",
          );
      }
    } catch (_) {
      /* The manual refresh still works if the public index is unavailable. */
    }
  }

  function readProfile() {
    var profile = {};
    profileFields.forEach(function (field) {
      profile[field] = document.getElementById("profile-" + field).value.trim();
    });
    return profile;
  }
  function profileStatus(message, error) {
    var element = document.getElementById("profile-status");
    element.textContent = message;
    element.className =
      "writer-status " + (error ? "status-error" : "status-success");
  }
  function renderProfilePreview() {
    var profile = readProfile();
    document.getElementById("profile-name-preview").textContent =
      profile.name || "나의 이름";
    document.getElementById("profile-tagline-preview").textContent =
      profile.tagline || "한 줄 소개를 남겨보세요";
    var avatar = document.getElementById("profile-avatar-preview");
    avatar.replaceChildren();
    if (profileObjectUrl) URL.revokeObjectURL(profileObjectUrl);
    profileObjectUrl = null;
    var file = document.getElementById("profile-photo").files[0];
    var url = file
      ? (profileObjectUrl = URL.createObjectURL(file))
      : toSafePreviewUrl(profile.avatar);
    if (url) {
      var image = document.createElement("img");
      image.src = url;
      image.alt = "프로필 미리보기";
      avatar.appendChild(image);
    } else
      avatar.textContent = (profile.name || "나").slice(0, 1).toUpperCase();
  }
  profileFields.forEach(function (field) {
    document
      .getElementById("profile-" + field)
      .addEventListener("input", renderProfilePreview);
  });
  document
    .getElementById("profile-photo")
    .addEventListener("change", renderProfilePreview);
  document
    .getElementById("remove-profile-photo")
    .addEventListener("click", function () {
      document.getElementById("profile-photo").value = "";
      document.getElementById("profile-avatar").value = "";
      renderProfilePreview();
    });
  document
    .getElementById("load-profile")
    .addEventListener("click", async function () {
      if (busy) return;
      var info = ensureConnectionInfo();
      if (!info) {
        profileStatus("위의 발행 계정을 먼저 연결해 주세요.", true);
        return;
      }
      if (
        (JSON.stringify(readProfile()) !== profileBaseline ||
          document.getElementById("profile-photo").files.length) &&
        !window.confirm("수정 중인 프로필 대신 저장된 프로필을 불러올까요?")
      )
        return;
      try {
        setBusy(true);
        var meta = await getContentMeta(
          info.owner,
          info.repo,
          info.branch,
          "_data/profile.json",
          info.token,
        );
        if (!meta)
          throw new Error(
            "저장된 프로필이 없습니다. 이름과 소개를 입력해 저장해 주세요.",
          );
        var profile = JSON.parse(base64ToUtf8(meta.content));
        profileFields.forEach(function (field) {
          document.getElementById("profile-" + field).value =
            profile[field] || "";
        });
        document.getElementById("profile-photo").value = "";
        profileBaseline = JSON.stringify(readProfile());
        renderProfilePreview();
        profileStatus("저장된 프로필을 불러왔어요.");
      } catch (error) {
        profileStatus(error.message, true);
      } finally {
        setBusy(false);
      }
    });
  document
    .getElementById("save-profile")
    .addEventListener("click", async function () {
      if (busy) return;
      var info = ensureConnectionInfo();
      if (!info) {
        profileStatus("위의 발행 계정을 먼저 연결해 주세요.", true);
        return;
      }
      var profile = readProfile();
      if (!profile.name) {
        profileStatus("표시 이름을 입력해 주세요.", true);
        document.getElementById("profile-name").focus();
        return;
      }
      if (profile.website) {
        try {
          var website = new URL(profile.website);
          if (website.protocol !== "https:") throw new Error();
        } catch (_) {
          profileStatus(
            "웹사이트 주소는 https://로 시작하는 올바른 주소를 입력해 주세요.",
            true,
          );
          return;
        }
      }
      try {
        var file = document.getElementById("profile-photo").files[0];
        if (file) validateImage(file);
        setBusy(true);
        profileStatus("프로필을 저장하고 있어요…");
        var existing = await getContentMeta(
          info.owner,
          info.repo,
          info.branch,
          "_data/profile.json",
          info.token,
        );
        if (existing) {
          var remote = JSON.parse(base64ToUtf8(existing.content));
          var remoteProfile = {};
          profileFields.forEach(function (field) {
            remoteProfile[field] = String(remote[field] || "").trim();
          });
          if (JSON.stringify(remoteProfile) !== profileBaseline)
            throw new Error(
              "다른 곳에서 프로필이 변경됐어요. ‘저장된 프로필 불러오기’ 후 다시 수정해 주세요.",
            );
        }
        if (file)
          profile.avatar = await uploadImage(
            info.owner,
            info.repo,
            info.branch,
            info.token,
            file,
            "profile",
          );
        await putContent({
          owner: info.owner,
          repo: info.repo,
          branch: info.branch,
          token: info.token,
          path: "_data/profile.json",
          expectedSha: existing ? existing.sha : null,
          contentBase64: utf8ToBase64(JSON.stringify(profile, null, 2) + "\n"),
          message: "Update author profile",
        });
        document.getElementById("profile-avatar").value = profile.avatar;
        document.getElementById("profile-photo").value = "";
        profileBaseline = JSON.stringify(profile);
        renderProfilePreview();
        saveConfig();
        profileStatus(
          "프로필을 저장했어요. 사이트에 반영되기까지 잠시 기다려 주세요.",
        );
      } catch (error) {
        profileStatus("저장하지 못했어요. " + error.message, true);
      } finally {
        setBusy(false);
      }
    });

  if (saveConfigButton) {
    saveConfigButton.addEventListener("click", function () {
      if (saveConfig())
        setStatus("연결 정보를 저장했습니다.", "status-success");
    });
  }

  if (oauthLoginButton)
    oauthLoginButton.addEventListener("click", beginOAuthLogin);
  if (oauthLogoutButton) {
    oauthLogoutButton.addEventListener("click", function () {
      tokenInput.value = "";
      clearOAuthSession();
      saveConfig();
    });
  }

  if (loadPostsButton) loadPostsButton.addEventListener("click", loadPostList);
  if (loadSelectedPostButton)
    loadSelectedPostButton.addEventListener("click", loadSelectedPost);
  if (newDraftButton)
    newDraftButton.addEventListener("click", function () {
      if (
        hasChanges() &&
        !window.confirm("작성 중인 임시글을 비우고 새 글을 시작할까요?")
      )
        return;
      resetDraftMode();
    });
  if (deleteButton) deleteButton.addEventListener("click", deleteCurrentPost);
  if (bodyInput) bodyInput.addEventListener("paste", handleBodyPaste);

  [
    titleInput,
    dateInput,
    bodyInput,
    coverInput,
    coverUrlInput,
    autoCoverInput,
    galleryInput,
    appendGalleryInput,
  ].forEach(function (element) {
    element.addEventListener("input", function () {
      updatePreview();
      saveDraft();
    });
    element.addEventListener("change", function () {
      updatePreview();
      saveDraft();
    });
  });

  publishButton.addEventListener("click", publishPost);

  loadConfig();
  if (!dateInput.value) dateInput.value = formatDatetimeLocal(new Date());
  restoreDraft();
  updatePreview();
  updateMode();
  updateConnectionState();
  renderProfilePreview();
  if (window.location.hash === "#profile")
    document.getElementById("profile").open = true;
  preparePostIndex();
  finishOAuthIfReturned();
})();
