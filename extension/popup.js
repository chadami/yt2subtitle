document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

const generate = document.getElementById("generate");
const generateText = document.getElementById("generateText");
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
let activeVideoId = "";
let subtitlesReady = false;
let pollTimer = null;

const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 24,
  backgroundOpacity: 82,
  fontWeight: "bold",
  positionPercent: 21
};

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  await loadSubtitleStyle();
  if (!tab?.url?.includes("youtube.com/watch")) {
    setButtonState("idle", false);
    status.textContent = "Open a YouTube video page to generate AI subtitles.";
    return;
  }
  activeTabId = tab.id;
  activeVideoId = new URL(tab.url).searchParams.get("v") || "";
  if (!activeVideoId) {
    setButtonState("idle", false);
    status.textContent = "No video detected.";
    return;
  }
  status.textContent = `Ready for video ${activeVideoId}`;
  await refreshInitialSubtitleState();
});

generate.addEventListener("click", async () => {
  if (!activeTabId) return;
  const forceRegenerate = subtitlesReady;
  setButtonState("extracting", false);
  status.textContent = "Extracting video title and captions...";
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, {
      type: "GENERATE_AI_SUBTITLES",
      forceRegenerate
    });
    if (!result?.ok) throw new Error(result?.error || "Failed to create subtitle job.");
    status.textContent = `Generating subtitles. ${result.rawCueCount} cues found from ${result.captionType} captions (${result.sourceLang}).`;
    setButtonState("generating", false);
    startJobPolling(result.jobId);
  } catch (error) {
    status.textContent = error.message || String(error);
    setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
  }
});

for (const control of [fontSize, positionPercent, backgroundOpacity, weightNormal, weightBold]) {
  control.addEventListener("input", saveAndApplySubtitleStyle);
  control.addEventListener("change", saveAndApplySubtitleStyle);
}

async function refreshInitialSubtitleState() {
  const pendingJob = await findPendingJobForActiveVideo();
  if (pendingJob) {
    status.textContent = "Generating subtitles...";
    setButtonState("generating", false);
    startJobPolling(pendingJob.jobId);
    return;
  }

  const existing = await getExistingSubtitle();
  if (existing?.status === "completed") {
    subtitlesReady = true;
    status.textContent = "AI subtitles are ready and loaded.";
    setButtonState("ready-regenerate", true);
    await loadSubtitlesIntoPage();
    return;
  }

  subtitlesReady = false;
  setButtonState("ready-generate", true);
}

async function findPendingJobForActiveVideo() {
  const { pendingJobs = [] } = await chrome.storage.local.get(["pendingJobs"]);
  return pendingJobs.find((job) => job.videoId === activeVideoId);
}

async function getExistingSubtitle() {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  return chrome.runtime.sendMessage({
    type: "GET_SUBTITLE_BY_VIDEO",
    videoId: activeVideoId,
    sourceLang: "en",
    targetLang: settings.targetLang || "zh-Hans",
    translationMode: settings.translationMode || "user",
    sessionToken
  }).catch(() => ({ status: "missing" }));
}

function startJobPolling(jobId) {
  clearJobPolling();
  pollTimer = setInterval(() => pollJob(jobId), 2500);
  pollJob(jobId);
}

async function pollJob(jobId) {
  try {
    const result = await chrome.runtime.sendMessage({ type: "GET_JOB_STATUS", jobId });
    if (!result?.ok) throw new Error(result?.error || "Could not check job status.");
    const job = result.job;
    status.textContent = `Generating subtitles: ${job.status} ${job.progress || 0}%`;
    if (job.status === "completed") {
      clearJobPolling();
      await chrome.runtime.sendMessage({ type: "CHECK_SUBTITLE_JOBS" }).catch(() => {});
      await loadSubtitlesIntoPage();
      subtitlesReady = true;
      status.textContent = "AI subtitles are ready and loaded.";
      setButtonState("ready-regenerate", true);
    } else if (job.status === "failed" || job.status === "cancelled") {
      clearJobPolling();
      status.textContent = job.error || `Subtitle job ${job.status}.`;
      setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
    } else {
      setButtonState("generating", false);
    }
  } catch (error) {
    clearJobPolling();
    status.textContent = error.message || String(error);
    setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
  }
}

function clearJobPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function loadSubtitlesIntoPage() {
  if (!activeTabId) return;
  await chrome.tabs.sendMessage(activeTabId, { type: "LOAD_AI_SUBTITLES" }).catch(() => {});
}

function setButtonState(state, enabled) {
  generate.disabled = !enabled;
  generate.classList.toggle("loading", state === "extracting" || state === "generating");
  if (state === "extracting") {
    generateText.textContent = "Extracting...";
  } else if (state === "generating") {
    generateText.textContent = "Generating...";
  } else if (state === "ready-regenerate") {
    generateText.textContent = "Regenerate AI subtitles";
  } else {
    generateText.textContent = "Generate AI subtitles";
  }
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
