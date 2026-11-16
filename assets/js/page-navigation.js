(() => {
  "use strict";
  const base = document.body.dataset.navigationBase;
  const version = document.body.dataset.navigationVersion;
  if (!base || !version || document.body.classList.contains("is-writer") || !window.fetch) return;
  const metadata = 'link[rel="canonical"], meta[name="description"], meta[name="author"], meta[name="robots"], meta[property^="og:"], meta[property^="article:"], meta[name^="twitter:"]';
  const pages = new Map(), positions = new Map();
  let renderedPath = location.pathname, renderedUrl = location.href, entryId, entryIndex = 0, serial = 0, pending, timeout, recovery, rollback;
  function readable(url) {
    if (url.origin !== location.origin || !url.pathname.startsWith(base) || url.username || url.password) return false;
    const path = url.pathname.slice(base.length);
    return path === "" || path === "archive/" || path === "about/" || /^\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/.test(path);
  }
  if (!readable(new URL(location.href))) return;
  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  document.body.append(status);
  const notice = document.createElement("aside");
  notice.className = "navigation-notice";
  notice.hidden = true;
  notice.setAttribute("aria-label", "페이지 이동 안내");
  notice.innerHTML = '<p role="status" aria-live="polite"></p><div><button type="button" class="btn-strong" data-navigation-retry>다시 시도</button><a class="btn-light" data-navigation-reload hidden>새로 열기</a><a class="text-link" data-navigation-home>전체 기록으로</a><button type="button" class="text-link" data-navigation-dismiss>닫기</button></div>';
  notice.querySelector("[data-navigation-home]").href = base;
  document.body.append(notice);
  function clearNotice() { notice.hidden = true; recovery = null; }
  function showFailure(kind, url, retry) {
    recovery = retry;
    notice.querySelector("p").textContent = kind === "missing"
      ? "이 글을 찾을 수 없어요. 다른 기록을 읽어 보세요."
      : kind === "updated" ? "사이트가 새로 바뀌었어요. 새로 열기를 누르면 최신 화면으로 이동합니다."
      : "글을 불러오지 못했어요. 읽던 화면은 그대로 두었으니, 연결을 확인하고 다시 시도해 주세요.";
    notice.querySelector("[data-navigation-retry]").hidden = kind === "missing" || kind === "updated";
    const reload = notice.querySelector("[data-navigation-reload]");
    reload.hidden = kind !== "updated";
    reload.href = url.href;
    notice.hidden = false;
    status.textContent = "";
  }
  notice.querySelector("[data-navigation-retry]").addEventListener("click", () => { const retry = recovery; clearNotice(); retry?.(); });
  notice.querySelector("[data-navigation-dismiss]").addEventListener("click", () => { clearNotice(); document.querySelector("#main").focus({ preventScroll: true }); });
  const coordinates = () => ({ x: window.scrollX, y: window.scrollY });
  const newId = () => Date.now().toString(36) + "-" + (++serial);
  function state(id, position, index = entryIndex) {
    return { ...history.state, diaryNavigation: { ...position, id, index } };
  }
  function remember(write = true) {
    const position = coordinates();
    positions.set(entryId, position);
    if (positions.size > 100) positions.delete(positions.keys().next().value);
    if (write) history.replaceState(state(entryId, position), "", location.href);
  }
  function adoptEntry() {
    const saved = history.state?.diaryNavigation;
    entryId = typeof saved?.id === "string" ? saved.id : newId();
    entryIndex = Number.isInteger(saved?.index) ? saved.index : entryIndex + 1;
    history.replaceState(state(entryId, saved || coordinates()), "", location.href);
  }
  try { adoptEntry(); history.scrollRestoration = "manual"; } catch (_) { return; }
  function cache(path, html) {
    pages.delete(path);
    pages.set(path, html);
    if (pages.size > 8) pages.delete(pages.keys().next().value);
  }
  cache(renderedPath, document.documentElement.outerHTML);
  function cancel() {
    pending?.abort();
    pending = null;
    clearTimeout(timeout);
    document.querySelector("#main")?.removeAttribute("aria-busy");
  }
  function scroll(position, hash) {
    let target;
    try { target = hash && document.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) {}
    // Explicit instant scrolling overrides the site's smooth anchor scrolling before
    // saving history coordinates, including when leaving a long archive far down.
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
    else if (target) target.scrollIntoView({ behavior: "instant" });
    else window.scrollTo({ left: 0, top: 0, behavior: "instant" });
  }
  function updateHead(next) {
    document.title = next.title;
    document.head.querySelectorAll(metadata).forEach(node => node.remove());
    next.head.querySelectorAll(metadata).forEach(node => document.head.append(document.importNode(node, true)));
    document.querySelectorAll(".site-nav a").forEach(link => {
      const counterpart = Array.from(next.querySelectorAll(".site-nav a")).find(node => node.getAttribute("href") === link.getAttribute("href"));
      if (counterpart?.hasAttribute("aria-current")) link.setAttribute("aria-current", counterpart.getAttribute("aria-current"));
      else link.removeAttribute("aria-current");
    });
  }
  async function visit(url, { pop = false, replace = false, position } = {}) {
    cancel();
    clearNotice();
    // A new click can supersede a still-loading Back/Forward destination.
    if (!pop && location.href !== renderedUrl) {
      entryIndex = history.state?.diaryNavigation?.index ?? entryIndex;
      entryId = newId();
      history.replaceState(state(entryId, coordinates()), "", renderedUrl);
    }
    const controller = new AbortController();
    pending = controller;
    document.querySelector("#main")?.setAttribute("aria-busy", "true");
    status.textContent = "글을 불러오는 중입니다.";
    timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // Back/forward can restore a recently read page without another network request.
      // Ordinary links always check the server so newly published edits are visible.
      let html = pop && pages.get(url.pathname);
      if (!html) {
        const response = await fetch(url.href, { signal: controller.signal, headers: { Accept: "text/html" }, credentials: "same-origin" });
        if (response.status === 404 || response.status === 410) throw Object.assign(new Error("Missing page"), { kind: "missing" });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || (response.url && new URL(response.url).pathname !== url.pathname)) throw new Error("Not a reading page");
        html = await response.text();
      }
      if (pending !== controller) return;
      if (controller.signal.aborted) throw new Error("Timed out");
      const next = new DOMParser().parseFromString(html, "text/html");
      const main = next.querySelector("main#main");
      if (!main || next.body.classList.contains("is-writer") || next.body.dataset.navigationBase !== base) throw new Error("Not a reading page");
      if (next.body.dataset.navigationVersion !== version) throw Object.assign(new Error("Page version changed"), { kind: "updated" });
      // Public page behavior is initialized by the shared modules, never by re-running
      // fetched scripts. The player and its audio element stay attached throughout.
      main.querySelectorAll("script").forEach(script => script.remove());
      if (!pop) {
        remember();
        const id = newId();
        if (!replace) entryIndex++;
        history[replace ? "replaceState" : "pushState"](state(id, { x: 0, y: 0 }), "", url.href);
        entryId = id;
      } else adoptEntry();
      window.dispatchEvent(new Event("diary:page-unload"));
      document.querySelector("#main").replaceWith(document.importNode(main, true));
      renderedPath = url.pathname;
      renderedUrl = url.href;
      cache(renderedPath, html);
      updateHead(next);
      window.dispatchEvent(new Event("diary:page-load"));
      document.querySelector("#main").focus({ preventScroll: true });
      scroll(position, url.hash);
      remember();
      status.textContent = document.title;
    } catch (error) {
      // An obsolete request must never redirect over a newer click or Back action.
      if (pending === controller) {
        const targetIndex = history.state?.diaryNavigation?.index;
        if (pop && Number.isInteger(targetIndex) && targetIndex !== entryIndex) {
          // Restore the real history entry, not just its URL, so a retry and the
          // next Back/Forward action still point to the original destinations.
          const delta = entryIndex - targetIndex;
          rollback = { id: entryId, kind: error.kind, url, retry: () => history.go(-delta) };
          history.go(delta);
        } else {
          if (pop) history.replaceState(state(entryId, coordinates()), "", renderedUrl);
          showFailure(error.kind, url, () => visit(url, { replace: pop || replace, position }));
        }
      }
    } finally {
      if (pending === controller) cancel();
    }
  }
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self") || link.closest("[data-navigation-reload]")) return;
    const url = new URL(link.href, location.href);
    if (!readable(url)) { cancel(); return; }
    if (url.pathname === location.pathname && url.search === location.search) {
      cancel();
      clearNotice();
      remember();
      // Native anchors keep their usual keyboard and scrolling behavior.
      if (!url.hash) {
        event.preventDefault();
        if (location.hash) {
          entryId = newId();
          entryIndex++;
          history.pushState(state(entryId, { x: 0, y: 0 }), "", url.href);
        }
        scroll();
        remember();
        renderedUrl = location.href;
      }
      return;
    }
    event.preventDefault();
    visit(url);
  });
  window.addEventListener("popstate", () => {
    if (rollback && history.state?.diaryNavigation?.id === rollback.id && location.href === renderedUrl) {
      const failed = rollback; rollback = null;
      cancel();
      scroll(positions.get(entryId));
      showFailure(failed.kind, failed.url, failed.retry);
      return;
    }
    rollback = null;
    clearNotice();
    remember(false);
    cancel();
    const url = new URL(location.href);
    if (!readable(url)) { location.reload(); return; }
    const saved = history.state?.diaryNavigation;
    const position = positions.get(saved?.id) || saved;
    if (renderedPath === url.pathname) {
      adoptEntry();
      renderedUrl = url.href;
      // Search/year changes and anchors share the current page; refresh its controls.
      window.dispatchEvent(new Event("diary:page-unload"));
      window.dispatchEvent(new Event("diary:page-load"));
      scroll(position, url.hash);
      status.textContent = "";
    } else visit(url, { pop: true, position });
  });
  window.addEventListener("pagehide", () => { if (location.href === renderedUrl) remember(); cancel(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) { adoptEntry(); history.scrollRestoration = "manual"; }
  });
  window.DiaryNavigation = {
    updateQuery(url, push) {
      remember();
      const id = push ? newId() : entryId;
      if (push) entryIndex++;
      history[push ? "pushState" : "replaceState"](state(id, coordinates()), "", url.href);
      entryId = id;
      renderedUrl = url.href;
    },
  };
})();
