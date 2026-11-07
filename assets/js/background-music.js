(function () {
  "use strict";
  const player = document.querySelector(".music-player");
  if (!player) return;
  const audio = player.querySelector("audio");
  const toggle = player.querySelector(".music-toggle");
  const stateLabel = player.querySelector(".music-state");
  const details = player.querySelector(".music-details");
  const panel = player.querySelector(".music-panel");
  const volume = player.querySelector("#music-volume");
  const volumeValue = player.querySelector("#music-volume-value");
  const message = player.querySelector(".music-message");
  const storageKey = "diary:music:" + audio.dataset.src;
  let saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(storageKey)) || {};
  } catch (_) {
    // Playback also works when browser storage is unavailable.
  }
  let resumeAt =
    Number.isFinite(saved.position) && saved.position > 0 ? saved.position : 0;
  let level =
    Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1
      ? saved.volume
      : 0.25;
  let wanted = false;
  let request = 0;
  let lastSaved = 0;

  function persist() {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          position: resumeAt || audio.currentTime || 0,
          volume: level,
        }),
      );
    } catch (_) {}
  }
  function showState(state) {
    player.dataset.state = state;
    const playing = state === "playing";
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.setAttribute(
      "aria-label",
      playing
        ? "배경음악 일시정지"
        : state === "loading"
          ? "배경음악 불러오기 취소"
          : "배경음악 재생",
    );
    stateLabel.textContent = playing
      ? "일시정지"
      : state === "loading"
        ? "불러오는 중"
        : "재생";
  }
  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
  }
  function stop() {
    wanted = false;
    request += 1;
    audio.pause();
    persist();
    showState("paused");
  }
  function setVolume() {
    audio.volume = level;
    // Muting works even on browsers that reserve volume control for the device.
    audio.muted = level === 0;
    volume.value = Math.round(level * 100);
    volumeValue.textContent = volume.value + "%";
    volume.setAttribute("aria-valuetext", volume.value + "%");
  }

  toggle.addEventListener("click", () => {
    if (wanted) {
      stop();
      return;
    }
    wanted = true;
    const attempt = ++request;
    showMessage("");
    showState("loading");
    if (!audio.hasAttribute("src")) audio.src = audio.dataset.src;
    else if (audio.error) audio.load();
    // Start within the click handler, as required by mobile playback policies.
    audio.play().then(
      () => {
        if (attempt === request && wanted) showState("playing");
      },
      (error) => {
        if (attempt !== request) return;
        wanted = false;
        showState("paused");
        showMessage(
          error.name === "NotAllowedError"
            ? "재생 버튼을 다시 눌러 음악을 시작해 주세요."
            : "음악을 불러오지 못했어요. 잠시 후 다시 재생해 주세요.",
        );
      },
    );
  });
  audio.addEventListener("loadedmetadata", () => {
    if (resumeAt && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.1));
      resumeAt = 0;
    }
  });
  audio.addEventListener("playing", () => {
    if (wanted) showState("playing");
    else audio.pause();
  });
  audio.addEventListener("waiting", () => {
    if (wanted) showState("loading");
  });
  audio.addEventListener("pause", () => {
    wanted = false;
    request += 1;
    persist();
    showState("paused");
  });
  audio.addEventListener("error", () => {
    stop();
    showMessage("음악을 불러오지 못했어요. 잠시 후 다시 재생해 주세요.");
  });
  audio.addEventListener("timeupdate", () => {
    if (Date.now() - lastSaved < 5000) return;
    lastSaved = Date.now();
    persist();
  });
  volume.addEventListener("input", () => {
    level = Number(volume.value) / 100;
    setVolume();
    persist();
  });
  function closePanel() {
    panel.hidden = true;
    details.setAttribute("aria-expanded", "false");
  }
  details.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    details.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!player.contains(event.target)) closePanel();
  });
  player.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
      details.focus();
    }
  });
  window.addEventListener("pagehide", stop);
  setVolume();
  showState("paused");
  player.hidden = false;
  document.body.classList.add("has-music");
})();
