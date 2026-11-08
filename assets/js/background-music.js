(function () {
  "use strict";
  const player = document.querySelector(".music-player");
  if (!player) return;
  const audio = player.querySelector("audio");
  const toggles = Array.from(player.querySelectorAll("[data-music-toggle]"));
  const stateLabel = player.querySelector(".music-state");
  const panelToggle = player.querySelector(".music-panel-toggle");
  const details = player.querySelector(".music-details");
  const panel = player.querySelector(".music-panel");
  const volume = player.querySelector("#music-volume");
  const volumeValue = player.querySelector("#music-volume-value");
  const message = player.querySelector(".music-message");
  const help = player.querySelector(".music-help");
  const storageKey = "diary:music:" + audio.dataset.src;
  const preferenceKey = storageKey + ":preference";
  let saved = {}, preference = {};
  try { saved = JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch (_) {}
  try { preference = JSON.parse(localStorage.getItem(preferenceKey)) || {}; } catch (_) {}
  let enabled = typeof preference.enabled === "boolean" ? preference.enabled : saved.enabled !== false;
  let resumeAt = Number.isFinite(saved.position) && saved.position > 0 ? saved.position : 0;
  const savedVolume = preference.volume ?? saved.volume;
  let level = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.2;
  let wanted = false, request = 0, lastSaved = 0;
  let leaving = false;
  function persist() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ position: resumeAt || audio.currentTime || 0, volume: level, enabled }));
    } catch (_) {}
  }
  function savePreference() {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ enabled, volume: level })); } catch (_) {}
    persist();
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
  function stop() {
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
    if (!audio.hasAttribute("src")) audio.src = audio.dataset.src;
    else if (audio.error) audio.load();
    if (audio.readyState >= 1) restorePosition();
    // A rejected autoplay attempt leaves a normal, usable play button.
    audio.play().then(() => {
      if (attempt === request && wanted) {
        showState("playing");
        help.textContent = "음악을 끄거나 소리 크기를 바꾸면 다음 방문에도 기억해요. 휴대폰에서는 기기의 음량 버튼도 이용하세요.";
      }
    }, error => {
      if (attempt !== request) return;
      wanted = false;
      showState("paused");
      const text = error.name === "NotAllowedError"
        ? "자동 재생이 제한된 브라우저예요. 재생 버튼을 누르면 음악이 시작됩니다."
        : "음악을 불러오지 못했어요. 잠시 후 다시 재생해 주세요.";
      help.textContent = text;
      if (!automatic) showMessage(text);
    });
  }
  toggles.forEach(button => button.addEventListener("click", () => {
    if (wanted) {
      enabled = false;
      stop();
      showMessage("");
    } else {
      enabled = true;
      start();
    }
    savePreference();
  }));
  audio.addEventListener("loadedmetadata", restorePosition);
  audio.addEventListener("playing", () => { if (wanted) showState("playing"); else audio.pause(); });
  audio.addEventListener("waiting", () => { if (wanted) showState("loading"); });
  audio.addEventListener("pause", () => {
    wanted = false;
    request++;
    persist();
    showState("paused");
  });
  audio.addEventListener("error", () => {
    stop();
    help.textContent = "음악을 불러오지 못했어요. 잠시 후 다시 재생해 주세요.";
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
    if (event.persisted) { leaving = false; compact(); if (enabled) start(true); }
  });
  setVolume();
  showState("paused");
  compact();
  player.hidden = false;
  document.body.classList.add("has-music");
  if (enabled) start(true);
})();
