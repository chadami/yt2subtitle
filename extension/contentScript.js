const OVERLAY_ID = "yt-ai-subtitle-overlay";

function getVideoId() {
  return new URL(location.href).searchParams.get("v");
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:12%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:72vw",
    "padding:6px 12px",
    "border-radius:6px",
    "background:rgba(0,0,0,.72)",
    "color:white",
    "font-size:22px",
    "line-height:1.35",
    "text-align:center",
    "pointer-events:none",
    "display:none"
  ].join(";");
  document.body.appendChild(overlay);
  return overlay;
}

function renderSubtitles(cues) {
  const video = document.querySelector("video");
  const overlay = ensureOverlay();
  if (!video) return;

  function tick() {
    const current = video.currentTime;
    const cue = cues.find((item) => current >= item.start && current <= item.end);
    overlay.textContent = cue?.text || "";
    overlay.style.display = cue ? "block" : "none";
    requestAnimationFrame(tick);
  }
  tick();
}

async function tryLoadSubtitle() {
  const videoId = getVideoId();
  if (!videoId) return;
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  if (!settings.apiBase || settings.autoLoad === false) return;
  const targetLang = settings.targetLang || "zh-Hans";
  const response = await fetch(`${settings.apiBase}/api/subtitles/by-video/${videoId}?sourceLang=en&targetLang=${targetLang}`);
  if (!response.ok) return;
  const data = await response.json();
  if (data.status === "completed" && Array.isArray(data.cues)) {
    renderSubtitles(data.cues);
  }
}

let lastUrl = "";
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    tryLoadSubtitle();
  }
}, 1000);

tryLoadSubtitle();
