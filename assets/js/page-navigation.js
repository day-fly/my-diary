(() => {
  "use strict";
  const base = document.body.dataset.navigationBase;
  const version = document.body.dataset.navigationVersion;
  if (!base || !version || document.body.classList.contains("is-writer") || !window.fetch) return;
  const metadata = 'link[rel="canonical"], meta[name="description"], meta[name="author"], meta[property^="og:"], meta[property^="article:"], meta[name^="twitter:"]';
  const pages = new Map(), positions = new Map();
  let renderedPath = location.pathname, entryId, serial = 0, pending, timeout;
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
  const coordinates = () => ({ x: window.scrollX, y: window.scrollY });
  const newId = () => Date.now().toString(36) + "-" + (++serial);
  function state(id, position) {
    return { ...history.state, diaryNavigation: { id, ...position } };
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
  async function visit(url, { pop = false, position } = {}) {
    cancel();
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
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || (response.url && new URL(response.url).pathname !== url.pathname)) throw new Error("Not a reading page");
        html = await response.text();
      }
      if (pending !== controller || controller.signal.aborted) return;
      const next = new DOMParser().parseFromString(html, "text/html");
      const main = next.querySelector("main#main");
      if (!main || next.body.classList.contains("is-writer") || next.body.dataset.navigationBase !== base || next.body.dataset.navigationVersion !== version) throw new Error("Page version changed");
      // Public page behavior is initialized by the shared modules, never by re-running
      // fetched scripts. The player and its audio element stay attached throughout.
      main.querySelectorAll("script").forEach(script => script.remove());
      if (!pop) {
        remember();
        const id = newId();
        history.pushState(state(id, { x: 0, y: 0 }), "", url.href);
        entryId = id;
      }
      window.dispatchEvent(new Event("diary:page-unload"));
      document.querySelector("#main").replaceWith(document.importNode(main, true));
      renderedPath = url.pathname;
      cache(renderedPath, html);
      updateHead(next);
      window.dispatchEvent(new Event("diary:page-load"));
      document.querySelector("#main").focus({ preventScroll: true });
      scroll(position, url.hash);
      remember();
      status.textContent = document.title;
    } catch (_) {
      // An obsolete request must never redirect over a newer click or Back action.
      if (pending === controller) {
        if (pop) location.replace(url.href);
        else location.assign(url.href);
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
      remember();
      // Native anchors keep their usual keyboard and scrolling behavior.
      if (!url.hash) {
        event.preventDefault();
        if (location.hash) {
          entryId = newId();
          history.pushState(state(entryId, { x: 0, y: 0 }), "", url.href);
        }
        scroll();
        remember();
      }
      return;
    }
    event.preventDefault();
    visit(url);
  });
  window.addEventListener("popstate", () => {
    remember(false);
    cancel();
    const url = new URL(location.href);
    if (!readable(url)) { location.reload(); return; }
    const saved = history.state?.diaryNavigation;
    const position = positions.get(saved?.id) || saved;
    adoptEntry();
    if (renderedPath === url.pathname) {
      // Search/year changes and anchors share the current page; refresh its controls.
      window.dispatchEvent(new Event("diary:page-unload"));
      window.dispatchEvent(new Event("diary:page-load"));
      scroll(position, url.hash);
      status.textContent = "";
    } else visit(url, { pop: true, position });
  });
  window.addEventListener("pagehide", () => { remember(); cancel(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) { adoptEntry(); history.scrollRestoration = "manual"; }
  });
  window.DiaryNavigation = {
    updateQuery(url, push) {
      remember();
      const id = push ? newId() : entryId;
      history[push ? "pushState" : "replaceState"](state(id, coordinates()), "", url.href);
      entryId = id;
    },
  };
})();
