document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

const generate = document.getElementById("generate");
const status = document.getElementById("status");
const fontSize = document.getElementById("fontSize");
const fontSizeValue = document.getElementById("fontSizeValue");
const positionPercent = document.getElementById("positionPercent");
const positionValue = document.getElementById("positionValue");
const backgroundOpacity = document.getElementById("backgroundOpacity");
const backgroundOpacityValue = document.getElementById("backgroundOpacityValue");
const weightNormal = document.getElementById("weightNormal");
const weightBold = document.getElementById("weightBold");
let activeTabId = null;

const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 24,
  backgroundOpacity: 82,
  fontWeight: "bold",
  positionPercent: 21
};

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  await loadSubtitleStyle();
  if (!tab?.url?.includes("youtube.com/watch")) {
    status.textContent = "Open a YouTube video page to generate AI subtitles.";
    return;
  }
  activeTabId = tab.id;
  const videoId = new URL(tab.url).searchParams.get("v");
  status.textContent = videoId ? `Ready for video ${videoId}` : "No video detected.";
  generate.disabled = !videoId;
});

generate.addEventListener("click", async () => {
  if (!activeTabId) return;
  generate.disabled = true;
  status.textContent = "Extracting captions and creating translation job...";
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, { type: "GENERATE_AI_SUBTITLES" });
    if (!result?.ok) throw new Error(result?.error || "Failed to create subtitle job.");
    status.textContent = `Job ${result.status}. ${result.rawCueCount} cues found from ${result.captionType} captions (${result.sourceLang}).`;
  } catch (error) {
    status.textContent = error.message || String(error);
  } finally {
    generate.disabled = false;
  }
});

for (const control of [fontSize, positionPercent, backgroundOpacity, weightNormal, weightBold]) {
  control.addEventListener("input", saveAndApplySubtitleStyle);
  control.addEventListener("change", saveAndApplySubtitleStyle);
}

async function loadSubtitleStyle() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const style = {
    ...DEFAULT_SUBTITLE_STYLE,
    ...(settings.subtitleStyle || {})
  };
  fontSize.value = style.fontSize;
  positionPercent.value = style.positionPercent;
  backgroundOpacity.value = style.backgroundOpacity;
  weightNormal.checked = style.fontWeight === "normal";
  weightBold.checked = style.fontWeight !== "normal";
  syncStyleLabels(style);
}

async function saveAndApplySubtitleStyle() {
  const style = getSubtitleStyleFromControls();
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({
    settings: {
      ...settings,
      subtitleStyle: style
    }
  });
  syncStyleLabels(style);

  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: "APPLY_SUBTITLE_STYLE", style }).catch(() => {});
  }
}

function getSubtitleStyleFromControls() {
  return {
    fontSize: Number(fontSize.value),
    positionPercent: Number(positionPercent.value),
    backgroundOpacity: Number(backgroundOpacity.value),
    fontWeight: weightNormal.checked ? "normal" : "bold"
  };
}

function syncStyleLabels(style) {
  fontSizeValue.textContent = `${style.fontSize}px`;
  positionValue.textContent = `${style.positionPercent}%`;
  backgroundOpacityValue.textContent = `${style.backgroundOpacity}%`;
}
