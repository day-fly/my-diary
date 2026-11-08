(function () {
  "use strict";

  var STORAGE_KEY = "myDiaryWriterConfigV3";
  var OAUTH_PENDING_KEY = "myDiaryWriterOAuthPendingV1";
  var API_BASE = "https://api.github.com";
  var draftStatus = document.getElementById("draft-status");
  var loadedSha = null;
  var loadedFrontMatter = "";
  var loadedVisibility = "public";
  var moveTarget = null;
  var previewRequest = 0;
  var savedGallery = [];
  var cloudDraftId = null, cloudDraftSha = null, cloudSnapshot = "";
  var privateWorkspace = false;
  var libraryDrafts = [], libraryVersion = 0, libraryLoaded = false, writerEpoch = 0;
  var publicTitleCache = new Map();
  var draftSaved = true;
  var busy = false;
  var publishedSnapshot = "";
  var disabledBefore = [];
  var workspaceInitialized = false;

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
  var visibilityInput = document.getElementById("post-visibility");
  var coverInput = document.getElementById("cover-image");
  var autoCoverInput = document.getElementById("auto-cover");
  var coverXInput = document.getElementById("cover-x"), coverYInput = document.getElementById("cover-y");
  function coverPosition(x, y) { coverXInput.value = Math.max(0,Math.min(100,Number.isFinite(Number(x)) ? Number(x) : 50)); coverYInput.value = Math.max(0,Math.min(100,Number.isFinite(Number(y)) ? Number(y) : 50)); }
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
    if (/^diary-(private|pending):/.test(url)) return window.DiaryPrivate ? window.DiaryPrivate.url(url) : "";
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
    if (window.DiaryAuth && window.DiaryAuth.getState().status !== "authenticated") {
      message = "작성자 계정으로 로그인해 주세요."; allowHtml = false;
    }
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
      var config = JSON.parse(raw);
      return config && typeof config === "object" && !Array.isArray(config) ? config : {};
    } catch (error) {
      return {};
    }
  }

  function loadConfig() {
    var config = getStoredConfig();
    var defaults = document.querySelector(".writer-page").dataset;
    ownerInput.value = defaults.owner;
    repoInput.value = defaults.repo;
    branchInput.value = defaults.branch || "main";
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
    if (config.token && config.owner === ownerInput.value && config.repo === repoInput.value && (config.branch || "main") === branchInput.value) {
      tokenInput.value = config.token;
      rememberTokenInput.checked = true;
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
    var verified = window.DiaryAuth && window.DiaryAuth.isAuthorized({ owner: config.owner, repo: config.repo, branch: config.branch, token: tokenInput.value.trim() });
    if (rememberTokenInput.checked && verified) {
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
          token: verified ? tokenInput.value.trim() : "",
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

    savedGallery.forEach(function (url, index) {
      var image = document.createElement("img"); image.alt = "보관된 본문 사진 " + (index + 1);
      var source = toSafePreviewUrl(url); if (source) image.src = source;
      previewGallery.appendChild(image);
    });
    renderSavedPhotos();
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
    var info = ensureConnectionInfo();
    var request = ++previewRequest;
    if (info && window.DiaryPrivate) window.DiaryPrivate.preview(info, bodyInput.value + "\n" + coverUrlInput.value + "\n" + savedGallery.join("\n")).then(function (changed) {
      if (changed && request === previewRequest && ensureConnectionInfo()) updatePreview();
    }).catch(function (error) {
      if (request === previewRequest && ensureConnectionInfo()) document.getElementById("cover-preview-note").textContent = error.message;
    });
  }

  function updateCoverCard() {
    var source = coverObjectUrl || toSafePreviewUrl(coverUrlInput.value.trim());
    var automatic = false;
    if (!source && autoCoverInput.checked) {
      var firstBodyImage = previewBody.querySelector("img");
      source = firstBodyImage
        ? firstBodyImage.getAttribute("src")
        : appendGalleryInput.checked
          ? toSafePreviewUrl(savedGallery[0] || "") || galleryObjectUrls[0]
          : "";
      automatic = !!source;
    }
    var image = document.getElementById("cover-card-preview");
    image.style.objectPosition = coverXInput.value + "% " + coverYInput.value + "%";
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
    if (window.DiaryPrivate && url.startsWith(API_BASE + "/repos/" + encodeURIComponent(ownerInput.value) + "/" + encodeURIComponent(document.querySelector(".writer-page").dataset.privateRepo) + "/")) {
      var privateInfo = { owner: ownerInput.value, repo: repoInput.value, branch: branchInput.value, token: token };
      window.DiaryPrivate.assert(privateInfo);
      if (finalOptions.method && finalOptions.method !== "GET") await window.DiaryPrivate.check(privateInfo);
    }
    if ((finalOptions.method === "PUT" || finalOptions.method === "DELETE") &&
        (!window.DiaryAuth || !window.DiaryAuth.isAuthorized({ owner: ownerInput.value, repo: repoInput.value, branch: branchInput.value, token: token })))
      throw new Error("로그인이 해제되어 저장을 중단했어요. 다시 로그인해 주세요.");
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
      cache: "no-store", credentials: "omit",
    });

    var payload = null;
    var contentType = response.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") >= 0) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      if (response.status === 401 && window.DiaryAuth) window.DiaryAuth.logout();
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
      cache: "no-store", credentials: "omit",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
      },
    });

    if (response.status === 404) return null;
    if (response.status === 401 && window.DiaryAuth) window.DiaryAuth.logout();

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
    if (Object.prototype.hasOwnProperty.call(params, "expectedSha") && existing.sha !== params.expectedSha)
      throw new Error("다른 곳에서 내용이 변경되었습니다. 최신 글을 다시 불러와 주세요.");

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
    var payload;
    try { payload = await githubFetch(url, token, { method: "GET" }); }
    catch (error) {
      if (window.DiaryPrivate && window.DiaryPrivate.isPrivate(repo) && error.message === "Not Found") return [];
      throw error;
    }
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
      option.value = (item.visibility === "private" ? "private:" : "") + item.path;
      option.dataset.visibility = item.visibility || "public";
      var indexed = postIndex.find(function (entry) {
        return item.visibility !== "private" && entry.path === item.path;
      });
      option.textContent = (item.visibility === "private" ? "[비공개] " : "[공개] ") + (item.title || (indexed
        ? indexed.date + " · " + indexed.title
        : item.name));
      postListSelect.appendChild(option);
    });
    if (window.DiaryLibrary) window.DiaryLibrary.setItems(posts.map(function (item) {
      var indexed = postIndex.find(function (post) { return item.visibility !== "private" && post.path === item.path; });
      return { kind:item.visibility || "public", path:item.path, title:item.title || (indexed && indexed.title) || item.name, date:(indexed && indexed.date) || (item.path.match(/\d{4}-\d{2}-\d{2}/) || [""])[0].replace(/-/g,"."), sortDate:((indexed && indexed.date) || (item.path.match(/\d{4}-\d{2}-\d{2}/) || [""])[0]).replace(/\./g,"-") };
    }).concat(libraryDrafts));
  }

  async function uploadImage(owner, repo, branch, token, file, prefix, index) {
    validateImage(file);
    var destination = owner + "/" + repo + ":" + branch;
    var sourceFile = file;
    var cached = imageUploadCache.get(sourceFile);
    if (cached && cached.destination === destination) return cached.url;
    if (window.DiaryPhotoImage) file = await window.DiaryPhotoImage.prepare(file);
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
    imageUploadCache.set(sourceFile, {
      destination: destination,
      url: (window.DiaryPrivate && window.DiaryPrivate.isPrivate(repo) ? "diary-private:" : "") + "/" + imagePath,
    });
    return imageUploadCache.get(sourceFile).url;
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
        keep = !/^(title|date|cover|cover_auto|cover_x|cover_y|diary_revision):/.test(line);
      if (keep) lines.push(line);
    });
    lines.push('title: "' + escapeYaml(payload.title) + '"');
    lines.push("date: " + payload.dateText);
    if (payload.revision) lines.push('diary_revision: "' + payload.revision + '"');
    if (payload.coverUrl)
      lines.push('cover: "' + escapeYaml(payload.coverUrl) + '"');
    lines.push("cover_x: " + coverXInput.value); lines.push("cover_y: " + coverYInput.value);
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
    var info = { owner: owner, repo: repo, branch: branch, token: token };
    if (!window.DiaryAuth || !window.DiaryAuth.isAuthorized(info)) {
      document.getElementById("connection").open = true;
      return null;
    }
    return info;
  }

  function resetDraftMode() {
    loadedSha = null;
    loadedFrontMatter = "";
    loadedVisibility = "public"; moveTarget = null;
    savedGallery = []; cloudDraftId = null; cloudDraftSha = null; cloudSnapshot = ""; privateWorkspace = false;
    visibilityInput.value = "public";
    if (window.DiaryPrivate) window.DiaryPrivate.clear();
    currentPostPathInput.value = "";
    titleInput.value = "";
    bodyInput.value = "";
    coverUrlInput.value = "";
    coverInput.value = "";
    autoCoverInput.checked = true; coverPosition(50,50);
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

  async function connectWriter() {
    if (!window.DiaryAuth) {
      setOAuthStatus("로그인 기능을 불러오지 못했어요. 페이지를 새로고침해 주세요.", "status-error");
      return;
    }
    saveConfigButton.disabled = true;
    saveConfigButton.textContent = "확인 중…";
    try {
      if (await window.DiaryAuth.login(tokenInput.value, { remember: rememberTokenInput.checked })) {
        saveConfig();
        setOAuthStatus("", "status-info");
        if (window.location.hash === "#profile") document.getElementById("profile").scrollIntoView({ block: "start" });
        else titleInput.focus();
      }
    } finally {
      saveConfigButton.disabled = false;
      saveConfigButton.textContent = "로그인";
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
    try {
      if (new URL(proxyUrl).protocol !== "https:") throw new Error("https required");
    } catch (_) {
      setOAuthStatus("간편 로그인 연결 주소는 https://로 시작하는 올바른 주소여야 해요.", "status-error");
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
          returnTo: window.location.pathname + window.location.search + window.location.hash,
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
        scope: "public_repo",
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
    try { sessionStorage.removeItem(OAUTH_PENDING_KEY); } catch (_) {}
    setOAuthStatus("", "status-info");
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

    var pendingRaw;
    try { pendingRaw = sessionStorage.getItem(OAUTH_PENDING_KEY); } catch (_) {}
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
    if (!state || state !== pending.state || !Number.isFinite(pending.createdAt) || Date.now() - pending.createdAt > 600000 || pending.createdAt > Date.now()) {
      setOAuthStatus("로그인 요청이 만료되었거나 일치하지 않아요. 다시 로그인해 주세요.", "status-error");
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
      if (pending.returnTo) {
        var returnUrl = new URL(pending.returnTo, window.location.origin);
        if (returnUrl.origin === window.location.origin && returnUrl.pathname === window.location.pathname)
          window.history.replaceState({}, document.title, returnUrl.pathname + returnUrl.search + returnUrl.hash);
      }
      if (window.DiaryAuth && await window.DiaryAuth.login(exchanged.access_token, { remember: rememberTokenInput.checked })) {
        saveConfig();
        setOAuthStatus("", "status-info");
      } else setOAuthStatus("작성자 계정을 확인하지 못했어요. 위의 로그인 안내를 확인해 주세요.", "status-error");

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

  async function loadPostList(quiet) {
    quiet = quiet === true;
    var request = ++libraryVersion;
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
      if (!quiet) setStatus("저장된 글과 임시글을 불러오는 중…", "status-info");
      var posts = await listPosts(
        info.owner,
        info.repo,
        info.branch,
        info.token,
      );
      for (var offset = 0; offset < posts.length; offset += 6) {
        if (!window.DiaryAuth.isAuthorized(info) || request !== libraryVersion) return;
        await Promise.all(posts.slice(offset, offset + 6).map(async function (item) {
          var cached = publicTitleCache.get(item.path);
          if (item.sha && cached && cached.sha === item.sha) { item.title = cached.title; return; }
          var meta = await getContentMeta(info.owner, info.repo, info.branch, item.path, info.token);
          if (!window.DiaryAuth.isAuthorized(info) || request !== libraryVersion) return;
          if (meta && meta.content) {
            item.title = parseMarkdown(base64ToUtf8(meta.content)).data.title;
            publicTitleCache.set(item.path, {sha:meta.sha, title:item.title});
          }
        }));
      }
      if (!window.DiaryAuth.isAuthorized(info) || request !== libraryVersion) return;
      var accessStatus = document.getElementById("private-access-status");
      accessStatus.textContent = "";
      libraryDrafts = [];
      try {
        var privateInfo = await window.DiaryPrivate.check(info);
        var privatePosts = await listPosts(privateInfo.owner, privateInfo.repo, privateInfo.branch, privateInfo.token);
        for (var item of privatePosts) {
          window.DiaryPrivate.assert(info);
          var metadata = await getContentMeta(privateInfo.owner, privateInfo.repo, privateInfo.branch, item.path, privateInfo.token);
          item.visibility = "private";
          if (metadata && metadata.content) item.title = parseMarkdown(base64ToUtf8(metadata.content)).data.title;
        }
        posts = posts.concat(privatePosts);
        var draftFiles = await getContentMeta(privateInfo.owner, privateInfo.repo, privateInfo.branch, "_diary_drafts", privateInfo.token) || [];
        if (!Array.isArray(draftFiles)) throw new Error("임시글 목록을 읽을 수 없어요.");
        var drafts = [];
        for (var file of draftFiles.filter(function (file) { return /^[a-f0-9]{24}\.json$/.test(file.name); })) {
          window.DiaryPrivate.assert(info);
          var meta = await getContentMeta(privateInfo.owner, privateInfo.repo, privateInfo.branch, file.path, privateInfo.token);
          if (!meta || !meta.content) continue;
          try {
            var data = validateCloudDraft(JSON.parse(base64ToUtf8(meta.content)));
            drafts.push({ kind:"draft", id:file.name.replace(/\.json$/, ""), sha:meta.sha, title:data.title || "제목 없는 임시글", date:data.updatedAt ? new Date(data.updatedAt).toLocaleDateString("ko-KR", {timeZone:"Asia/Seoul"}) : "", sortDate:data.updatedAt || "" });
          } catch (_) { accessStatus.textContent = "읽을 수 없는 임시글이 있어요. 다른 기록은 계속 이용할 수 있습니다."; }
        }
        if (request === libraryVersion) libraryDrafts = drafts;
      } catch (error) { if (ensureConnectionInfo()) accessStatus.textContent = error.message; }
      if (!ensureConnectionInfo() || request !== libraryVersion) return;
      libraryLoaded = true;
      renderPostOptions(posts);
      if (!quiet) setStatus(
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

    var selection = postListSelect.value;
    var visibility = selection.startsWith("private:") ? "private" : "public";
    var path = selection.replace(/^private:/, "");
    if (!path) {
      setStatus("불러올 포스트를 먼저 선택하세요.", "status-error");
      return;
    }

    if (
      hasUnstoredChanges() &&
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
      if (visibility === "private") info = await window.DiaryPrivate.check(info);

      var meta = await getContentMeta(
        info.owner,
        info.repo,
        info.branch,
        path,
        info.token,
      );
      if (!meta || !meta.content)
        throw new Error("포스트 내용을 찾지 못했습니다.");

      if (!ensureConnectionInfo()) return;
      savedGallery = []; cloudDraftId = null; cloudDraftSha = null; cloudSnapshot = ""; privateWorkspace = visibility === "private";
      loadedVisibility = visibility;
      visibilityInput.value = visibility;
      moveTarget = null;
      var markdown = base64ToUtf8(meta.content);
      var parsed = parseMarkdown(markdown);
      loadedSha = meta.sha;
      loadedFrontMatter = parsed.frontMatter || "";
      titleInput.value = parsed.data.title || "";
      coverUrlInput.value = parsed.data.cover || "";
      autoCoverInput.checked = parsed.data.cover_auto !== "false"; coverPosition(parsed.data.cover_x ?? 50,parsed.data.cover_y ?? 50);
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
        "‘" + titleInput.value + "’을 불러왔습니다. 수정 후 저장해 주세요.",
        "status-success",
      );
      return true;
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

    if (!window.confirm("이 글을 휴지통으로 옮길까요? 나중에 복원할 수 있습니다.")) return;

    try {
      setBusy(true);
      deleteButton.disabled = true;
      deleteButton.textContent = "삭제 중...";
      setStatus("포스트 삭제 중...", "status-info");

      if (loadedVisibility === "private") info = await window.DiaryPrivate.check(info);
      var trashSource = await getContentMeta(info.owner,info.repo,info.branch,path,info.token);
      if (!trashSource || trashSource.sha !== loadedSha) throw new Error("다른 곳에서 글이 변경됐어요. 다시 불러와 주세요.");
      await window.DiaryRecovery.capture(info,{kind:"post",path:path,sha:loadedSha,title:titleInput.value,visibility:loadedVisibility,content:base64ToUtf8(trashSource.content)});
      var deleted = await deleteContent({
        expectedSha: loadedSha,
        owner: info.owner,
        repo: info.repo,
        branch: info.branch,
        path: path,
        token: info.token,
        message: "Delete diary post: " + path,
      });

      if (loadedVisibility === "public" && window.DiaryPublication) window.DiaryPublication.start({path:path,visibility:"private",commit:deleted && deleted.commit && deleted.commit.sha}, ensureConnectionInfo());
      if (currentPostPathInput.value.trim() === path) resetDraftMode();
      await loadPostList();
      setStatus("휴지통으로 옮겼어요. 글 관리의 휴지통에서 복원할 수 있습니다.", "status-success");
    } catch (error) {
      setStatus("삭제 실패: " + error.message, "status-error");
    } finally {
      setBusy(false);
      updateMode();
      deleteButton.textContent = "현재 글 삭제";
    }
  }

  function handleBodyPaste(event) {
    var files = getClipboardImageFiles(event);
    if (!files.length || !ensureConnectionInfo()) return;
    event.preventDefault();
    try {
      files.forEach(validateImage);
      var inserted = files.map(function (file, index) {
        return "![붙여넣은 이미지 " + (index + 1) + "](" + window.DiaryPrivate.stage(file) + ")";
      });
      insertTextAtCursor(bodyInput, "\n" + inserted.join("\n\n") + "\n");
      updatePreview(); saveDraft();
      setStatus("사진을 추가했어요. 저장할 때 선택한 공개 범위에 맞춰 업로드됩니다.", "status-info");
    } catch (error) { setStatus(error.message, "status-error"); }
  }

  function cloudDraftPath(id) {
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error("임시글 정보를 다시 불러와 주세요.");
    return "_diary_drafts/" + id + ".json";
  }
  function newCloudDraftId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), function (n) { return n.toString(16).padStart(2, "0"); }).join("");
  }
  function validateCloudDraft(data) {
    if (!data || data.version !== 1 || typeof data.title !== "string" || typeof data.body !== "string" || !Array.isArray(data.galleryRefs)) throw new Error("이 임시글의 저장 형식을 읽을 수 없어요.");
    if (data.path && !/^_posts\/[A-Za-z0-9_.-]+\.md$/.test(data.path)) throw new Error("임시글의 원본 글 정보가 올바르지 않아요.");
    if (data.galleryRefs.some(function (url) { return typeof url !== "string" || !/^diary-private:\/assets\/photos\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp|gif)$/i.test(url); })) throw new Error("임시글의 사진 정보를 읽을 수 없어요.");
    return data;
  }
  function renderSavedPhotos() {
    window.DiaryPhotoEditor?.render({body:bodyInput.value,gallery:savedGallery.slice(),busy:busy,url:toSafePreviewUrl,
      stage:function(file){validateImage(file);return window.DiaryPrivate.stage(file);},
      change:function(body,gallery){bodyInput.value=body;savedGallery=gallery;updatePreview();saveDraft();},error:function(message){setStatus(message,"status-error");}});
  }
  async function saveCloudDraft(asCopy) {
    if (busy) return;
    var info = ensureConnectionInfo(); if (!info) return;
    if (!titleInput.value.trim() && !bodyInput.value.trim() && !coverInput.files.length && !galleryInput.files.length && !savedGallery.length) {
      setStatus("제목이나 본문을 적거나 사진을 추가한 뒤 보관해 주세요.", "status-info"); return;
    }
    var epoch = writerEpoch;
    var id = asCopy || !cloudDraftId ? newCloudDraftId() : cloudDraftId;
    var expectedSha = asCopy ? null : cloudDraftSha;
    saveDraft(); setBusy(true);
    setStatus("사진과 글을 비공개 보관함에 저장하고 있어요…", "status-info");
    try {
      var target = await window.DiaryPrivate.check(info);
      var current = await getContentMeta(target.owner, target.repo, target.branch, cloudDraftPath(id), target.token);
      if ((current ? current.sha : null) !== expectedSha) throw new Error("다른 기기에서 이 임시글이 변경됐어요. 새 임시글로 보관하거나 최신 내용을 다시 불러와 주세요.");
      var data = draftData();
      var upload = function (file) { return uploadImage(target.owner, target.repo, target.branch, target.token, file, "draft-" + id); };
      Array.from(coverInput.files).concat(Array.from(galleryInput.files)).forEach(validateImage);
      if (coverInput.files[0]) data.cover = await upload((await window.DiaryCoverImage.prepare(coverInput.files[0])).file);
      data.body = await window.DiaryPrivate.prepare(data.body, target, upload, true);
      data.cover = await window.DiaryPrivate.prepare(data.cover, target, upload, true);
      data.galleryRefs = [];
      for (var ref of savedGallery) data.galleryRefs.push(await window.DiaryPrivate.prepare(ref, target, upload, true));
      for (var file of Array.from(galleryInput.files)) data.galleryRefs.push(await upload(file));
      data.version = 1; data.hasFiles = false; data.privateWorkspace = true;
      delete data.cloudDraftId; delete data.cloudDraftSha; delete data.cloudSnapshot;
      if (asCopy) { data.path = ""; data.sha = null; data.frontMatter = ""; data.loadedVisibility = "public"; data.moveTarget = null; data.publishedSnapshot = ""; }
      var text = JSON.stringify(data, null, 2) + "\n";
      if (new TextEncoder().encode(text).length > 900000) throw new Error("임시글이 너무 길어요. 여러 글로 나눠 보관해 주세요.");
      window.DiaryPrivate.assert(info); if (epoch !== writerEpoch) return;
      var saved = await putContent({ owner:target.owner, repo:target.repo, branch:target.branch, token:target.token, path:cloudDraftPath(id), expectedSha:expectedSha, contentBase64:utf8ToBase64(text), message:"Save private diary draft" });
      if (!ensureConnectionInfo() || epoch !== writerEpoch) return;
      cloudDraftId = id; cloudDraftSha = saved.content.sha; privateWorkspace = true;
      bodyInput.value = data.body; coverUrlInput.value = data.cover; savedGallery = data.galleryRefs;
      coverInput.value = ""; galleryInput.value = "";
      if (asCopy) { currentPostPathInput.value = ""; loadedSha = null; loadedFrontMatter = ""; loadedVisibility = "public"; moveTarget = null; publishedSnapshot = ""; }
      cloudSnapshot = snapshot(); saveDraft(); updatePreview();
      await loadPostList(true);
      if (epoch !== writerEpoch || !ensureConnectionInfo()) return;
      draftStatus.textContent = "보관함에 저장됨 · 다른 기기에서 이어 쓸 수 있어요";
      setStatus("보관함에 저장했어요. 사진과 글을 다른 기기에서도 이어 쓸 수 있습니다.", "status-success");
    } catch (error) { setStatus("보관함 저장 실패: " + error.message + " 현재 작성 내용은 그대로 남아 있어요.", "status-error"); }
    finally { setBusy(false); }
  }
  async function readCloudDraft(item) {
    if (busy) return;
    var info = ensureConnectionInfo(); if (!info) return;
    if (hasUnstoredChanges() && !window.confirm("보관함의 글을 불러올까요? 현재 글도 남기려면 먼저 보관함에 저장해 주세요.")) return;
    var epoch = writerEpoch;
    setBusy(true);
    try {
      var target = await window.DiaryPrivate.check(info);
      var meta = await getContentMeta(target.owner, target.repo, target.branch, cloudDraftPath(item.id), target.token);
      if (!meta || !meta.content) throw new Error("임시글이 삭제되었거나 이동했어요. 목록을 새로고침해 주세요.");
      var data = validateCloudDraft(JSON.parse(base64ToUtf8(meta.content)));
      if (!ensureConnectionInfo() || epoch !== writerEpoch) return;
      titleInput.value = data.title; bodyInput.value = data.body; dateInput.value = data.date || formatDatetimeLocal(new Date());
      visibilityInput.value = data.visibility === "private" ? "private" : "public";
      loadedVisibility = data.loadedVisibility === "private" ? "private" : "public";
      currentPostPathInput.value = data.path || ""; loadedSha = data.sha || null;
      loadedFrontMatter = typeof data.frontMatter === "string" ? data.frontMatter : ""; moveTarget = data.moveTarget || null;
      coverUrlInput.value = data.cover || ""; autoCoverInput.checked = data.autoCover !== false; coverPosition(data.coverX ?? 50,data.coverY ?? 50);
      appendGalleryInput.checked = data.appendGallery !== false; savedGallery = data.galleryRefs;
      coverInput.value = ""; galleryInput.value = ""; cloudDraftId = item.id; cloudDraftSha = meta.sha; privateWorkspace = true;
      publishedSnapshot = data.publishedSnapshot || ""; cloudSnapshot = snapshot();
      saveDraft(); updatePreview(); updateMode(); showEditor(true);
      document.querySelector(".writing-sheet").scrollIntoView({ block:"start", behavior:"smooth" });
      setStatus("보관함에서 사진과 글을 불러왔어요. 이어서 작성해 주세요.", "status-success");
    } catch (error) { setStatus("임시글 불러오기 실패: " + error.message, "status-error"); }
    finally { setBusy(false); }
  }
  async function deleteCloudDraft(item) {
    if (busy || !window.confirm("이 임시글을 휴지통으로 옮길까요? 발행한 글은 그대로 유지됩니다.")) return;
    var info = ensureConnectionInfo(); if (!info) return;
    setBusy(true);
    try {
      var target = await window.DiaryPrivate.check(info);
      var trashDraft = await getContentMeta(target.owner,target.repo,target.branch,cloudDraftPath(item.id),target.token);
      if (!trashDraft || trashDraft.sha !== item.sha) throw new Error("다른 기기에서 임시글이 변경됐어요. 다시 불러와 주세요.");
      await window.DiaryRecovery.capture(info,{kind:"draft",path:cloudDraftPath(item.id),sha:item.sha,title:item.title,visibility:"private",content:base64ToUtf8(trashDraft.content)});
      await deleteContent({ owner:target.owner, repo:target.repo, branch:target.branch, token:target.token, path:cloudDraftPath(item.id), expectedSha:item.sha, message:"Remove private diary draft" });
      if (!ensureConnectionInfo()) return;
      if (cloudDraftId === item.id) { cloudDraftId = null; cloudDraftSha = null; cloudSnapshot = ""; saveDraft(); }
      await loadPostList(true); setStatus("임시글을 휴지통으로 옮겼어요.", "status-success");
    } catch (error) { setStatus("임시글 삭제 실패: " + error.message, "status-error"); }
    finally { setBusy(false); }
  }
  async function removePublishedDraft(info) {
    if (!cloudDraftId) return "";
    try {
      var target = await window.DiaryPrivate.check(info);
      await deleteContent({ owner:target.owner, repo:target.repo, branch:target.branch, token:target.token, path:cloudDraftPath(cloudDraftId), expectedSha:cloudDraftSha, message:"Archive published diary draft" });
      return "";
    } catch (_) { return " 보관함의 임시글은 남겨 두었어요. 글 관리에서 확인할 수 있습니다."; }
    finally { cloudDraftId = null; cloudDraftSha = null; cloudSnapshot = ""; }
  }

  async function publishPost() {
    if (busy) return;
    var info = ensureConnectionInfo();
    if (!info) {
      setStatus(
        "위의 ‘작성자 계정’에서 로그인해 주세요.",
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

    if (!body && !(appendGallery && ((galleryInput.files && galleryInput.files.length) || savedGallery.length))) {
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
      !/^diary-private:\/assets\//.test(coverUrlInput.value.trim()) && !toSafePreviewUrl(coverUrlInput.value.trim())
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
    var visibility = visibilityInput.value === "private" ? "private" : "public";
    var moving = currentPostPathInput.value && loadedVisibility !== visibility;
    if (moving && !window.confirm(visibility === "private"
      ? "이 글을 비공개로 전환할까요? 사이트 반영 후 목록과 본문에서 사라집니다. 이미 공개한 사진의 원본 주소는 유지되며, 글의 과거 기록이나 검색 캐시도 남을 수 있습니다."
      : "이 글의 제목, 본문과 첨부 사진을 누구나 볼 수 있도록 공개할까요?")) return;
    var sourceInfo = info;
    saveConfig();
    saveDraft();
    setBusy(true);
    publishButton.disabled = true;
    publishButton.textContent = "발행 중…";
    setStatus("업로드를 시작합니다...", "status-info");

    try {
      if (cloudDraftId) {
        var draftInfo = await window.DiaryPrivate.check(info);
        var remoteDraft = await getContentMeta(draftInfo.owner, draftInfo.repo, draftInfo.branch, cloudDraftPath(cloudDraftId), draftInfo.token);
        if (!remoteDraft || remoteDraft.sha !== cloudDraftSha) throw new Error("다른 기기에서 임시글이 변경됐어요. 보관함에서 다시 불러오거나 새 임시글로 보관한 뒤 발행해 주세요.");
      }
      if (visibility === "private") info = await window.DiaryPrivate.check(info);
      if (loadedVisibility === "private" && currentPostPathInput.value) sourceInfo = await window.DiaryPrivate.check(sourceInfo);
      var sourceAlreadyRemoved = false;
      if (currentPostPathInput.value) {
        var original = await getContentMeta(sourceInfo.owner, sourceInfo.repo, sourceInfo.branch, currentPostPathInput.value, sourceInfo.token);
        sourceAlreadyRemoved = !original && moving && moveTarget && moveTarget.path === currentPostPathInput.value && moveTarget.visibility === visibility;
        if (!sourceAlreadyRemoved && (!original || original.sha !== loadedSha)) throw new Error("다른 곳에서 내용이 변경되었습니다. 최신 글을 다시 불러와 주세요.");
      }
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
      var galleryUrls = savedGallery.slice();
      var revision = newCloudDraftId();

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
        revision: revision,
        dateText: formatFrontMatterDate(publishDate),
        coverUrl: coverUrl,
        body: body,
        appendGallery: appendGallery,
        galleryUrls: galleryUrls,
      });

      markdown = await window.DiaryPrivate.prepare(markdown, info, function (file) {
        return uploadImage(info.owner, info.repo, info.branch, info.token, file, slug);
      }, visibility === "private");
      if (visibility === "public") markdown = normalizeBodyAssetUrls(markdown);
      if (!ensureConnectionInfo()) throw new Error("로그인이 해제되어 저장을 중단했어요.");
      var savedPost = await putContent({
        expectedSha: moving ? (moveTarget && moveTarget.visibility === visibility && moveTarget.path === postPath ? moveTarget.sha : null) : currentPath ? loadedSha : null,
        owner: info.owner,
        repo: info.repo,
        branch: info.branch,
        path: postPath,
        token: info.token,
        contentBase64: utf8ToBase64(markdown),
        message: (currentPath ? "Update" : "Add") + " diary post: " + title,
      });

      var removalCommit = "";
      if (moving) {
        moveTarget = { path: postPath, visibility: visibility, sha: savedPost.content.sha };
        saveDraft();
        try {
          if (!sourceAlreadyRemoved) {
            var removed = await deleteContent({ owner: sourceInfo.owner, repo: sourceInfo.repo, branch: sourceInfo.branch, token: sourceInfo.token, path: currentPath, expectedSha: loadedSha, message: "Move diary post to " + visibility + " storage" });
            removalCommit = removed && removed.commit ? removed.commit.sha : "";
          }
        } catch (error) {
          throw new Error((visibility === "private" ? "비공개 사본은 저장했지만 공개 글이 내려갔는지 확인하지 못했어요. 아직 공개되어 있을 수 있습니다. " : "공개 글은 저장했지만 비공개 사본을 정리하지 못했어요. ") + error.message + " 다시 저장하면 이어서 처리합니다.");
        }
      }
      if (!ensureConnectionInfo()) return;
      var draftNotice = await removePublishedDraft(ensureConnectionInfo());
      if (!ensureConnectionInfo()) return;
      if (window.DiaryPublication) {
        if (visibility === "public" || moving) window.DiaryPublication.start({path:postPath, visibility:visibility, revision:revision, commit:visibility === "public" ? savedPost.commit && savedPost.commit.sha : removalCommit}, ensureConnectionInfo());
        else window.DiaryPublication.privateSaved();
      }
      moveTarget = null;
      loadedVisibility = visibility;
      savedGallery = [];
      currentPostPathInput.value = postPath;
      loadedSha = savedPost.content.sha;
      var savedMarkdown = parseMarkdown(markdown);
      loadedFrontMatter = savedMarkdown.frontMatter || "";
      coverUrlInput.value = savedMarkdown.data.cover || "";
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

      await loadPostList(true);
      setStatus(
        (visibility === "private" ? '비공개 저장 완료! ' + (moving ? '공개 사이트에서 내려가기까지 잠시 걸릴 수 있어요. ' : '') + '로그인 후 기존 글 관리에서 읽고 수정할 수 있어요. ' : '저장 완료! 사이트 반영까지 잠시 걸릴 수 있어요. ') + '<a href="' +
          githubFileUrl +
          '" target="_blank" rel="noopener">GitHub에서 파일 보기</a>' + draftNotice,
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
      cloudDraftId: cloudDraftId, cloudDraftSha: cloudDraftSha, cloudSnapshot: cloudSnapshot, privateWorkspace: privateWorkspace,
      galleryRefs: savedGallery.slice(),
      visibility: visibilityInput.value,
      loadedVisibility: loadedVisibility,
      moveTarget: moveTarget,
      title: titleInput.value,
      body: bodyInput.value,
      date: dateInput.value,
      cover: coverUrlInput.value,
      coverX: Number(coverXInput.value), coverY: Number(coverYInput.value),
      autoCover: autoCoverInput.checked,
      path: currentPostPathInput.value,
      sha: loadedSha,
      frontMatter: loadedFrontMatter,
      appendGallery: appendGalleryInput.checked,
      publishedSnapshot: publishedSnapshot,
      hasFiles: !!(coverInput.files.length || galleryInput.files.length || window.DiaryPrivate?.hasPending(bodyInput.value+"\n"+savedGallery.join("\n"))),
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
      visibilityInput.value,
      savedGallery, appendGalleryInput.checked, coverXInput.value, coverYInput.value,
    ]);
  }
  function hasChanges() {
    return (
      (!!titleInput.value ||
        !!bodyInput.value ||
        !!coverUrlInput.value ||
        !!savedGallery.length ||
        !!coverInput.files.length ||
        !!galleryInput.files.length) &&
      (snapshot() !== publishedSnapshot ||
        coverInput.files.length ||
        galleryInput.files.length)
    );
  }
  function hasUnstoredChanges() {
    return hasChanges() && (snapshot() !== cloudSnapshot || coverInput.files.length || galleryInput.files.length);
  }
  function saveDraft() {
    if (!workspaceInitialized) return;
    try {
      var privateDraft = privateWorkspace || visibilityInput.value === "private" || loadedVisibility === "private";
      if (privateDraft) {
        localStorage.removeItem(draftKey());
        sessionStorage.setItem(draftKey() + ":private", JSON.stringify(draftData()));
      } else {
        sessionStorage.removeItem(draftKey() + ":private");
        localStorage.setItem(draftKey(), JSON.stringify(draftData()));
      }
      draftSaved = true;
      draftStatus.textContent =
        "임시저장됨 · " +
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
      if (privateDraft) draftStatus.textContent += " · 이 탭에서만 보관";
      if (cloudDraftId) draftStatus.textContent += snapshot() === cloudSnapshot ? " · 보관함에도 저장됨" : " · 보관함 저장 필요";
      if (coverInput.files.length || galleryInput.files.length || (window.DiaryPrivate && window.DiaryPrivate.hasPending(bodyInput.value + "\n" + savedGallery.join("\n"))))
        draftStatus.textContent += " · 다시 열 때 사진 재첨부 필요";
    } catch (_) {
      draftSaved = false;
      draftStatus.textContent =
        "임시저장 실패 · 창을 닫기 전 내용을 복사해 주세요";
    }
  }
  function restoreDraft() {
    publishedSnapshot = snapshot();
    try {
      var draft = JSON.parse(sessionStorage.getItem(draftKey() + ":private") || localStorage.getItem(draftKey()) || "null");
      if (
        !draft ||
        typeof draft.body !== "string" ||
        typeof draft.title !== "string"
      )
        return;
      cloudDraftId = /^[a-f0-9]{24}$/.test(draft.cloudDraftId || "") ? draft.cloudDraftId : null;
      cloudDraftSha = cloudDraftId ? draft.cloudDraftSha : null; cloudSnapshot = draft.cloudSnapshot || "";
      privateWorkspace = !!draft.privateWorkspace || !!cloudDraftId;
      savedGallery = Array.isArray(draft.galleryRefs) ? draft.galleryRefs.filter(function (url) { return typeof url === "string" && /^diary-private:\/assets\//.test(url); }) : [];
      visibilityInput.value = draft.visibility === "private" ? "private" : "public";
      loadedVisibility = draft.loadedVisibility === "private" ? "private" : "public";
      moveTarget = draft.moveTarget || null;
      titleInput.value = draft.title;
      bodyInput.value = draft.body;
      dateInput.value = draft.date || formatDatetimeLocal(new Date());
      coverUrlInput.value = draft.cover || "";
      autoCoverInput.checked = draft.autoCover !== false; coverPosition(draft.coverX ?? 50,draft.coverY ?? 50);
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
    var privatePost = visibilityInput.value === "private";
    publishButton.textContent = privatePost ? (currentPostPathInput.value && loadedVisibility === "public" ? "비공개로 전환" : "비공개 저장") : currentPostPathInput.value && loadedVisibility === "private" ? "공개로 전환 ↗" : currentPostPathInput.value ? "수정 발행" : "발행하기 ↗";
    document.getElementById("visibility-help").textContent = privatePost
      ? "비공개 글과 새 사진은 나만 보는 저장 공간에 보관됩니다. 작성 중인 글은 보관함 저장을 누르면 다른 기기에서도 이어 쓸 수 있어요." + (currentPostPathInput.value && loadedVisibility === "public" ? " 이미 공개한 사진 주소와 글의 과거 기록·검색 캐시는 남을 수 있습니다." : "")
      : "발행하면 제목, 본문과 사진을 누구나 읽을 수 있습니다.";
    deleteButton.disabled = !currentPostPathInput.value;
    document.getElementById("open-history").disabled = !currentPostPathInput.value || busy;
  }
  function updateConnectionState() {
    var authState = window.DiaryAuth ? window.DiaryAuth.getState() : { status: "guest" };
    document.getElementById("connection-state").textContent =
      authState.status === "authenticated" ? "@" + authState.login + " 로그인됨" : authState.status === "checking" ? "계정 확인 중…" : "로그인이 필요해요";
    document.getElementById("oauth-ready-action").hidden = !(oauthClientIdInput.value.trim() && oauthProxyUrlInput.value.trim());
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
    if (window.DiaryLibrary) window.DiaryLibrary.setBusy(value);
    renderSavedPhotos();
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
  document.getElementById("save-draft").addEventListener("click", function () { saveCloudDraft(false); });
  document.getElementById("save-draft-copy").addEventListener("click", function () { saveCloudDraft(true); });
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
      if (!busy) saveCloudDraft(false);
    }
  });
  window.addEventListener("beforeunload", function (event) {
    if (
      busy ||
      (!draftSaved && hasChanges()) ||
      coverInput.files.length ||
      galleryInput.files.length ||
      ((privateWorkspace || visibilityInput.value === "private") && hasUnstoredChanges()) ||
      (window.DiaryPrivate && window.DiaryPrivate.hasPending(bodyInput.value + "\n" + savedGallery.join("\n"))) ||
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
      if (!libraryLoaded) renderPostOptions(
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

  window.DiaryRecovery?.init({
    info:ensureConnectionInfo,busy:function(){return busy;},setBusy:setBusy,
    get:function(info,path){return getContentMeta(info.owner,info.repo,info.branch,path,info.token);},
    put:function(info,path,sha,content,message){return putContent({owner:info.owner,repo:info.repo,branch:info.branch,token:info.token,path:path,expectedSha:sha,contentBase64:utf8ToBase64(content),message:message});},
    remove:function(info,path,sha,message){return deleteContent({owner:info.owner,repo:info.repo,branch:info.branch,token:info.token,path:path,expectedSha:sha,message:message});},
    commits:function(info,path,page){return githubFetch(API_BASE+"/repos/"+encodeURIComponent(info.owner)+"/"+encodeURIComponent(info.repo)+"/commits?sha="+encodeURIComponent(info.branch)+"&path="+encodeURIComponent(path)+"&per_page=20&page="+page,info.token);},
    decode:base64ToUtf8,parse:parseMarkdown,id:newCloudDraftId,refresh:function(){return loadPostList(true);},status:function(text){setStatus(text,"status-success");},
    context:function(){return {path:currentPostPathInput.value,sha:loadedSha,visibility:loadedVisibility};},
    apply:function(markdown){var parsed=parseMarkdown(markdown);titleInput.value=parsed.data.title||"";bodyInput.value=parsed.body.replace(/^\n+/,"");loadedFrontMatter=parsed.frontMatter;coverUrlInput.value=parsed.data.cover||"";autoCoverInput.checked=parsed.data.cover_auto!=="false";coverPosition(parsed.data.cover_x??50,parsed.data.cover_y??50);if(parsed.data.date){var date=new Date(parsed.data.date);if(!Number.isNaN(date.getTime()))dateInput.value=formatDatetimeLocal(date);}savedGallery=[];galleryInput.value="";coverInput.value="";cloudDraftId=null;cloudDraftSha=null;cloudSnapshot="";updatePreview();saveDraft();showEditor(true);document.querySelector(".writing-sheet").scrollIntoView({block:"start",behavior:"smooth"});}
  });
  if (saveConfigButton) saveConfigButton.addEventListener("click", connectWriter);
  tokenInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); connectWriter(); }
  });
  [oauthClientIdInput, oauthProxyUrlInput].forEach(function (input) { input.addEventListener("input", updateConnectionState); });

  if (oauthLoginButton)
    oauthLoginButton.addEventListener("click", beginOAuthLogin);
  if (oauthLogoutButton) {
    oauthLogoutButton.addEventListener("click", function () {
      if (workspaceInitialized) saveDraft();
      tokenInput.value = "";
      clearOAuthSession();
      if (window.DiaryAuth) window.DiaryAuth.logout();
    });
  }

  if (loadPostsButton) loadPostsButton.addEventListener("click", loadPostList);
  if (loadSelectedPostButton)
    loadSelectedPostButton.addEventListener("click", loadSelectedPost);
  if (newDraftButton)
    newDraftButton.addEventListener("click", function () {
      if (
        hasUnstoredChanges() &&
        !window.confirm("작성 중인 임시글을 비우고 새 글을 시작할까요?")
      )
        return;
      resetDraftMode();
    });
  if (deleteButton) deleteButton.addEventListener("click", deleteCurrentPost);
  if (bodyInput) bodyInput.addEventListener("paste", handleBodyPaste);

  document.getElementById("center-cover").addEventListener("click",function(){coverPosition(50,50);updatePreview();saveDraft();});
  galleryInput.addEventListener("change",function(){
    if(!galleryInput.files.length)return;
    try { var files=Array.from(galleryInput.files);files.forEach(validateImage);files.forEach(function(file){savedGallery.push(window.DiaryPrivate.stage(file));});galleryInput.value="";updatePreview();saveDraft(); }
    catch(error){setStatus(error.message,"status-error");}
  });
  [
    titleInput,
    dateInput,
    visibilityInput,
    bodyInput,
    coverInput,
    coverUrlInput,
    coverXInput, coverYInput,
    autoCoverInput,
    galleryInput,
    appendGalleryInput,
  ].forEach(function (element) {
    element.addEventListener("input", function () {
      updatePreview();
      updateMode();
      saveDraft();
    });
    element.addEventListener("change", function () {
      updatePreview();
      updateMode();
      saveDraft();
    });
  });

  if (window.DiaryLibrary) window.DiaryLibrary.onAction(async function (action, item) {
    if (busy || !ensureConnectionInfo()) return;
    if (item.kind === "draft") { if (action === "delete-draft") await deleteCloudDraft(item); else await readCloudDraft(item); return; }
    postListSelect.value = (item.kind === "private" ? "private:" : "") + item.path;
    if (await loadSelectedPost()) {
      if (action === "visibility") { visibilityInput.value = item.kind === "public" ? "private" : "public"; updateMode(); saveDraft(); await publishPost(); }
      else document.querySelector(".writing-sheet").scrollIntoView({block:"start",behavior:"smooth"});
    }
  });
  document.querySelectorAll("[data-library-view]").forEach(function (link) {
    link.addEventListener("click", function () {
      document.getElementById("manage").open = true;
      if (window.DiaryLibrary) window.DiaryLibrary.select(link.dataset.libraryView);
    });
  });
  document.getElementById("manage").addEventListener("toggle", function () {
    if (this.open && !libraryLoaded && !busy && ensureConnectionInfo()) loadPostList(true);
  });
  publishButton.addEventListener("click", publishPost);

  loadConfig();
  updateConnectionState();
  function handleAuthorState() {
    var info = window.DiaryAuth && window.DiaryAuth.getConnection();
    if (info) {
      tokenInput.value = info.token;
      if (!workspaceInitialized) {
        workspaceInitialized = true;
        if (!dateInput.value) dateInput.value = formatDatetimeLocal(new Date());
        restoreDraft();
        updatePreview();
        updateMode();
        renderProfilePreview();
        if (window.location.hash === "#profile") document.getElementById("profile").open = true;
        preparePostIndex();
        if (window.location.hash === "#manage") document.getElementById("manage").open = true;
      }
      if (window.DiaryPublication) window.DiaryPublication.resume(info);
      document.getElementById("connection").open = false;
    } else {
      if (workspaceInitialized && hasChanges()) saveDraft();
      var authStatus = window.DiaryAuth && window.DiaryAuth.getState().status;
      if (authStatus !== "checking" && workspaceInitialized) {
        window.DiaryRecovery?.clear();
        writerEpoch++; libraryVersion++; libraryLoaded = false; libraryDrafts = []; publicTitleCache.clear();
        if (privateWorkspace || visibilityInput.value === "private" || loadedVisibility === "private") {
          try { sessionStorage.removeItem(draftKey() + ":private"); } catch (_) {}
          titleInput.value = ""; bodyInput.value = ""; coverUrlInput.value = "";
          coverInput.value = ""; galleryInput.value = ""; currentPostPathInput.value = "";
          loadedSha = null; loadedFrontMatter = ""; loadedVisibility = "public"; moveTarget = null;
          visibilityInput.value = "public"; previewRequest++;
          savedGallery = []; cloudDraftId = null; cloudDraftSha = null; cloudSnapshot = ""; privateWorkspace = false;
          renderSavedPhotos();
          previewTitle.textContent = ""; previewBody.innerHTML = ""; previewCover.innerHTML = ""; previewGallery.innerHTML = "";
          document.getElementById("cover-card-preview").removeAttribute("src");
        }
        if (window.DiaryPrivate) window.DiaryPrivate.clear();
        renderPostOptions([]); statusElement.textContent = "";
        if (window.DiaryLibrary) window.DiaryLibrary.clear();
        if (window.DiaryPublication) window.DiaryPublication.stop(true);
        workspaceInitialized = false;
      }
      document.getElementById("connection").open = true;
      if (window.DiaryAuth && window.DiaryAuth.getState().status === "guest") tokenInput.value = "";
    }
    updateConnectionState();
  }
  window.addEventListener("diary:auth", handleAuthorState);
  if (window.DiaryAuth) {
    window.DiaryAuth.ready.then(function () { handleAuthorState(); finishOAuthIfReturned(); });
  }
})();
