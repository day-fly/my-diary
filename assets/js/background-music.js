(function () {
  "use strict";
  const player = document.querySelector(".music-player");
  if (!player) return;
  const audio = player.querySelector("audio");
  const select = player.querySelector("#music-track-select");
  if (!audio || !select) return;
  const tracks = Array.from(select.options).map(option => ({ id: option.value, ...option.dataset }));
  if (!tracks.length || new Set(tracks.map(track => track.id)).size !== tracks.length) return;
  const trackById = new Map(tracks.map(track => [track.id, track]));
  const ids = tracks.map(track => track.id);
  const toggles = Array.from(player.querySelectorAll("[data-music-toggle]"));
  const stateLabel = player.querySelector(".music-state");
  const panelToggle = player.querySelector(".music-panel-toggle");
  const details = player.querySelector(".music-details");
  const panel = player.querySelector(".music-panel");
  const volume = player.querySelector("#music-volume");
  const volumeValue = player.querySelector("#music-volume-value");
  const message = player.querySelector(".music-message");
  const help = player.querySelector(".music-help");
  const shuffleButton = player.querySelector(".music-shuffle");
  const previous = player.querySelector(".music-previous");
  const next = player.querySelector(".music-next");
  const storageKey = "diary:music:playlist:v1:" + player.dataset.base;
  const preferenceKey = storageKey + ":preference";
  const legacyKey = "diary:music:" + audio.dataset.src;
  const helpText = "한 곡이 끝나면 다음 곡으로 이어집니다. 듣던 곡과 위치, 소리 설정을 기억해요.";
  function read(storage, key) {
    try {
      const value = JSON.parse(window[storage].getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }
  const currentSaved = read("sessionStorage", storageKey);
  const saved = currentSaved || read("sessionStorage", legacyKey) || {};
  const preference = read("localStorage", preferenceKey) || read("localStorage", legacyKey + ":preference") || {};
  let enabled = typeof preference.enabled === "boolean" ? preference.enabled : saved.enabled !== false;
  let shuffle = typeof preference.shuffle === "boolean" ? preference.shuffle : true;
  const savedVolume = preference.volume ?? saved.volume;
  let level = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.2;
  const legacyId = tracks.find(track => track.src === audio.dataset.src)?.id;
  const savedId = trackById.has(saved.track) ? saved.track : !currentSaved && Number.isFinite(saved.position) ? legacyId : null;
  function shuffled(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const validQueue = Array.isArray(saved.queue) && saved.queue.length === ids.length && new Set(saved.queue).size === ids.length && saved.queue.every(id => trackById.has(id));
  let queue = shuffle && validQueue && saved.shuffle === shuffle ? [...saved.queue] : shuffle ? shuffled(ids) : [...ids];
  if (shuffle && !savedId && queue.length > 1 && queue[0] === preference.lastTrack) queue.push(queue.shift());
  let cursor = savedId ? queue.indexOf(savedId) : 0;
  let resumeAt = savedId && Number.isFinite(saved.position) && saved.position > 0 ? saved.position : 0;
  let wanted = false, request = 0, lastSaved = 0, leaving = false;
  audio.loop = false;
  function current() { return trackById.get(queue[cursor]); }
  function persist() {
    try {
      const position = resumeAt || (audio.hasAttribute("src") && Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
      sessionStorage.setItem(storageKey, JSON.stringify({ track: current().id, position, queue, shuffle, volume: level, enabled }));
    } catch (_) {}
  }
  function savePreference() {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ enabled, volume: level, shuffle, lastTrack: current().id })); } catch (_) {}
    persist();
  }
  function updateTrack() {
    const track = current();
    select.value = track.id;
    player.querySelector(".music-track").textContent = track.title;
    player.querySelector(".music-description").textContent = track.description;
    const credit = player.querySelector(".music-credit a");
    credit.textContent = track.artist + " · 곡 정보 ↗";
    credit.href = track.credit;
    shuffleButton.setAttribute("aria-pressed", String(shuffle));
    shuffleButton.textContent = shuffle ? "섞어 듣기 켜짐" : "섞어 듣기 꺼짐";
    previous.disabled = next.disabled = tracks.length < 2;
  }
  function showState(state) {
    player.dataset.state = state;
    const playing = state === "playing";
    const label = playing ? "배경음악 일시정지" : state === "loading" ? "배경음악 불러오기 취소" : "배경음악 재생";
    toggles.forEach(button => {
      button.setAttribute("aria-pressed", String(playing));
      button.setAttribute("aria-label", label);
    });
    stateLabel.textContent = playing ? "일시정지" : state === "loading" ? "불러오는 중" : "재생";
    panelToggle.textContent = playing ? "음악 일시정지" : state === "loading" ? "불러오기 취소" : "음악 재생";
  }
  function showMessage(text) { message.textContent = text; message.hidden = !text; }
  const coordinator = window.DiaryMusicCoordinator;
  coordinator?.onStop(reason => { if (reason === "pause") enabled = false; stop(); help.textContent = reason === "pause" ? "다른 탭에서도 음악을 멈췄어요." : "다른 탭에서 음악을 듣고 있어요. 이곳에서 재생하면 이어받습니다."; });
  function stop() {
    coordinator?.release();
    wanted = false;
    request++;
    persist();
    audio.pause();
    showState("paused");
  }
  function setVolume() {
    audio.volume = level;
    audio.muted = level === 0;
    volume.value = Math.round(level * 100);
    volumeValue.textContent = volume.value + "%";
    volume.setAttribute("aria-valuetext", volume.value + "%");
  }
  function restorePosition() {
    if (resumeAt && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.1));
      resumeAt = 0;
    }
  }
  function start(automatic = false) {
    if (wanted || leaving) return;
    wanted = true;
    const attempt = ++request;
    showMessage("");
    showState("loading");
    function playOwned() {
    if (attempt !== request || !wanted || leaving) return;
    if (!audio.hasAttribute("src")) audio.src = current().src;
    else if (audio.error) audio.load();
    if (audio.readyState >= 1) restorePosition();
    audio.play().then(() => {
      if (attempt === request && wanted) { showState("playing"); help.textContent = helpText; }
    }, error => {
      if (attempt !== request) return;
      wanted = false;
      coordinator?.release();
      showState("paused");
      const text = error.name === "NotAllowedError"
        ? "자동 재생이 제한된 브라우저예요. 재생 버튼을 누르면 음악이 시작됩니다."
        : "음악을 불러오지 못했어요. 다시 재생하거나 다음 곡을 골라 주세요.";
      help.textContent = text;
      if (!automatic) showMessage(text);
    });
    }
    if (coordinator) coordinator.request(automatic, playOwned, () => { if (attempt === request) { wanted = false; showState("paused"); help.textContent = "다른 탭에서 음악을 듣고 있어요. 재생을 누르면 이 탭에서 이어받습니다."; } });
    else playOwned();
  }
  function choose(index, automatic = false) {
    if (leaving) return;
    stop();
    cursor = (index + queue.length) % queue.length;
    resumeAt = 0;
    audio.removeAttribute("src");
    audio.load();
    updateTrack();
    showMessage("");
    help.textContent = helpText;
    savePreference();
    if (enabled) start(automatic);
  }
  toggles.forEach(button => button.addEventListener("click", () => {
    if (wanted) { enabled = false; coordinator?.pauseAll(); stop(); showMessage(""); }
    else { enabled = true; start(); }
    savePreference();
  }));
  player.querySelector(".music-stop-all")?.addEventListener("click", () => { enabled=false; coordinator?.pauseAll(); stop(); savePreference(); help.textContent="모든 탭에서 음악을 껐어요."; });
  previous.addEventListener("click", () => choose(cursor - 1));
  next.addEventListener("click", () => choose(cursor + 1));
  select.addEventListener("change", () => {
    const index = queue.indexOf(select.value);
    if (index >= 0 && index !== cursor) choose(index);
  });
  shuffleButton.addEventListener("click", () => {
    const id = current().id;
    shuffle = !shuffle;
    queue = shuffle ? [id, ...shuffled(ids.filter(value => value !== id))] : [...ids];
    cursor = queue.indexOf(id);
    updateTrack();
    savePreference();
  });
  audio.addEventListener("loadedmetadata", restorePosition);
  audio.addEventListener("playing", () => { if (wanted) showState("playing"); else audio.pause(); });
  audio.addEventListener("waiting", () => { if (wanted) showState("loading"); });
  audio.addEventListener("pause", () => {
    // A pause queued by the previous source must not cancel the new source's play().
    if (!audio.paused) return;
    coordinator?.release();
    wanted = false;
    request++;
    persist();
    showState("paused");
  });
  audio.addEventListener("ended", () => { if (enabled && !leaving && audio.ended) choose(cursor + 1, true); });
  audio.addEventListener("error", () => {
    if (!audio.error) return;
    stop();
    help.textContent = "음악을 불러오지 못했어요. 다시 재생하거나 다음 곡을 골라 주세요.";
    if (!panel.hidden) showMessage(help.textContent);
  });
  audio.addEventListener("timeupdate", () => {
    if (Date.now() - lastSaved < 5000) return;
    lastSaved = Date.now();
    persist();
  });
  volume.addEventListener("input", () => { level = Number(volume.value) / 100; setVolume(); savePreference(); });
  function closePanel() { panel.hidden = true; details.setAttribute("aria-expanded", "false"); }
  details.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    details.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("click", event => { if (!player.contains(event.target)) closePanel(); });
  player.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) { closePanel(); details.focus(); }
  });
  function compact() { player.classList.toggle("is-compact", window.scrollY > 120); }
  window.addEventListener("scroll", compact, { passive: true });
  window.addEventListener("pagehide", () => { leaving = true; stop(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) { const latest = read("localStorage", preferenceKey); if (typeof latest?.enabled === "boolean") enabled = latest.enabled; leaving = false; compact(); if (enabled) start(true); else stop(); }
  });
  updateTrack();
  setVolume();
  showState("paused");
  compact();
  player.hidden = false;
  document.body.classList.add("has-music");
  savePreference();
  if (enabled) start(true);
})();
