(() => {
  "use strict";
  const page = document.querySelector(".writer-page");
  if (!page) return;
  const config = page.dataset;
  const repository = config.privateRepo;
  const branch = config.privateBranch || "main";
  const root = "https://api.github.com/repos/" + encodeURIComponent(config.owner) + "/";
  const urls = new Map(), pending = new Map(), loading = new Map();
  let generation = 0;
  const accessMessage = "비공개 저장소에 접근할 수 없어요. GitHub 로그인 키의 저장소 선택에 my-diary-private를 추가하고 Contents 읽기·쓰기 권한을 허용한 뒤 다시 로그인해 주세요.";

  function assert(info) {
    if (!info || info.owner !== config.owner || ![config.repo, repository].includes(info.repo) ||
        !window.DiaryAuth?.isAuthorized({ ...info, repo: config.repo, branch: config.branch || "main" }))
      throw new Error("로그인이 해제되어 작업을 중단했어요. 다시 로그인해 주세요.");
  }
  async function request(info, path, raw = false) {
    assert(info);
    const version = generation;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(root + encodeURIComponent(info.repo) + path, {
        headers: { Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", Authorization: "Bearer " + info.token },
        credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      assert(info);
      if (version !== generation) throw new Error("로그인 상태가 바뀌었어요. 다시 시도해 주세요.");
      if (!response.ok) throw new Error(response.status === 404 || response.status === 403 ? accessMessage : "비공개 저장소를 확인하지 못했어요. 연결 상태를 확인해 주세요.");
      const result = raw ? await response.blob() : await response.json();
      assert(info);
      if (version !== generation) throw new Error("로그인 상태가 바뀌었어요. 다시 시도해 주세요.");
      return result;
    } finally { clearTimeout(timer); }
  }
  async function check(info) {
    if (!repository || repository === config.repo) throw new Error("비공개 저장 공간이 설정되지 않았어요.");
    const target = { ...info, repo: repository, branch };
    const meta = await request(target, "");
    if (meta.private !== true || meta.owner?.login?.toLowerCase() !== config.owner.toLowerCase())
      throw new Error("저장소가 비공개 상태인지 확인할 수 없어 저장을 중단했어요. 공개 저장소에는 비공개 글을 보내지 않습니다.");
    if (meta.permissions?.push !== true) throw new Error(accessMessage);
    return target;
  }
  function imagePath(value) {
    const path = value.replace(/^diary-private:/, "").replace(/^\//, "");
    if (!/^assets\/(photos|images|illustrations)\/[A-Za-z0-9_./-]+\.(png|jpe?g|webp|gif)$/i.test(path) || path.split("/").includes(".."))
      throw new Error("지원하지 않는 사진 주소예요. 사진을 다시 첨부해 주세요.");
    return path;
  }
  async function imageFile(info, value) {
    const path = imagePath(value);
    const blob = await request(info, "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(info.branch), true);
    if (blob.size > 10 * 1024 * 1024) throw new Error("사진 한 장은 10MB 이하로 선택해 주세요.");
    const extension = path.split(".").pop().toLowerCase();
    const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[extension];
    return new File([blob], path.split("/").pop(), { type });
  }
  function references(text) {
    return [...new Set(String(text).match(/diary-private:\/assets\/[A-Za-z0-9_./-]+|diary-pending:[a-f0-9]+/g) || [])];
  }
  function stage(file) {
    const id = "diary-pending:" + Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, "0")).join("");
    pending.set(id, file);
    urls.set(id, URL.createObjectURL(file));
    return id;
  }
  async function preview(info, text) {
    const refs = references(text).filter(ref => ref.startsWith("diary-private:") && !urls.has(ref));
    if (!refs.length) return false;
    const target = await check(info);
    const version = generation;
    for (const ref of refs) {
      if (!loading.has(ref)) loading.set(ref, imageFile(target, ref).then(file => {
        assert(target);
        if (version !== generation) return;
        urls.set(ref, URL.createObjectURL(file));
      }).finally(() => loading.delete(ref)));
      await loading.get(ref);
    }
    return version === generation;
  }
  async function prepare(text, info, upload, importPublic) {
    let result = text;
    const refs = references(text);
    if (importPublic) {
      const local = text.match(/(?<![A-Za-z0-9:/.-])\/assets\/(?:photos|images|illustrations)\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif)/gi) || [];
      refs.push(...local);
    }
    let privateInfo;
    for (const ref of new Set(refs)) {
      if (ref.startsWith("diary-private:") && info.repo === repository) continue;
      let file;
      if (ref.startsWith("diary-pending:")) {
        file = pending.get(ref);
        if (!file) throw new Error("붙여넣은 사진이 이 탭에 남아 있지 않아요. 해당 사진을 다시 붙여넣어 주세요.");
      } else if (ref.startsWith("diary-private:")) {
        privateInfo = privateInfo || await check(info);
        file = await imageFile(privateInfo, ref);
      } else {
        file = await imageFile({ ...info, repo: config.repo, branch: config.branch || "main" }, ref);
      }
      assert(info);
      const url = await upload(file);
      result = result.split(ref).join(url);
    }
    if (info.repo !== repository && /diary-(private|pending):/.test(result))
      throw new Error("비공개 사진을 공개용으로 준비하지 못했어요. 글은 발행하지 않았습니다.");
    return result;
  }
  function clear() {
    generation++;
    urls.forEach(url => URL.revokeObjectURL(url));
    urls.clear(); pending.clear(); loading.clear();
  }
  window.DiaryPrivate = {
    check, assert, stage, preview, prepare, clear,
    pendingFiles: text => references(text).filter(ref => ref.startsWith("diary-pending:")).map(ref => { const file=pending.get(ref); if(!file) throw new Error("첨부 사진을 찾지 못했어요. 다시 선택해 주세요."); return {ref,file}; }),
    restoreFiles: files => { for(const {ref,file} of files) { if(!/^diary-pending:[a-f0-9]{24}$/.test(ref)) continue; if(urls.has(ref)) URL.revokeObjectURL(urls.get(ref)); pending.set(ref,file); urls.set(ref,URL.createObjectURL(file)); } },
    isPrivate: repo => repo === repository,
    url: ref => urls.get(ref) || "",
    hasPending: text => references(text).some(ref => ref.startsWith("diary-pending:")),
  };
})();
