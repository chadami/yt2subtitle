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
const controlsPanel = document.querySelector(".controls");
let activeTabId = null;
let activeVideoId = "";
let subtitlesReady = false;
let pollTimer = null;
let currentLanguage = "en";

const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 24,
  backgroundOpacity: 25,
  fontWeight: "normal",
  positionPercent: 21
};

const translations = {
  en: {
    caption: "Translate current video",
    fontSize: "Font size",
    position: "Position",
    backgroundOpacity: "Background opacity",
    generate: "Generate AI subtitles",
    settings: "Settings",
    openYoutube: "Open a YouTube video page to generate AI subtitles.",
    noVideo: "No video detected.",
    readyVideo: "Click the button below to generate subtitles.",
    extractingStatus: "Extracting video title and captions...",
    generatingStatus: "Generating subtitles. {count} cues found from {type} captions ({lang}).",
    failedCreate: "Failed to create subtitle job.",
    generatingShort: "Generating subtitles...",
    readyLoaded: "AI subtitles are ready and loaded.",
    checkingJob: "Could not check job status.",
    generatingProgress: "Generating subtitles: {status} {progress}%",
    extracting: "Extracting...",
    generating: "Generating...",
    regenerate: "Regenerate AI subtitles",
    loginRequired: "Sign in from Settings before generating AI subtitles."
  },
  "zh-Hans": {
    caption: "翻译当前视频",
    fontSize: "字号",
    position: "位置",
    backgroundOpacity: "背景透明度",
    generate: "生成 AI 字幕",
    settings: "设置",
    openYoutube: "打开 YouTube 视频页面后生成 AI 字幕。",
    noVideo: "未检测到视频。",
    readyVideo: "请点击下方生成字幕按钮",
    extractingStatus: "正在提取视频标题和字幕...",
    generatingStatus: "正在生成字幕。已从{type}字幕中找到 {count} 条字幕（{lang}）。",
    failedCreate: "创建字幕任务失败。",
    generatingShort: "正在生成字幕...",
    readyLoaded: "AI 字幕已生成并加载。",
    checkingJob: "无法检查任务状态。",
    generatingProgress: "正在生成字幕：{status} {progress}%",
    extracting: "提取中...",
    generating: "生成中...",
    regenerate: "重新生成 AI 字幕",
    loginRequired: "请先在设置页登录，再生成 AI 字幕。"
  },
  ja: {
    caption: "現在の動画を翻訳",
    fontSize: "文字サイズ",
    position: "位置",
    backgroundOpacity: "背景の不透明度",
    generate: "AI 字幕を生成",
    settings: "設定",
    openYoutube: "YouTube の動画ページを開いて AI 字幕を生成してください。",
    noVideo: "動画が検出されません。",
    readyVideo: "下のボタンをクリックして字幕を生成してください。",
    extractingStatus: "動画タイトルと字幕を抽出中...",
    generatingStatus: "字幕を生成中。{type} 字幕から {count} 件を検出しました（{lang}）。",
    failedCreate: "字幕タスクの作成に失敗しました。",
    generatingShort: "字幕を生成中...",
    readyLoaded: "AI 字幕の生成と読み込みが完了しました。",
    checkingJob: "タスク状態を確認できません。",
    generatingProgress: "字幕を生成中：{status} {progress}%",
    extracting: "抽出中...",
    generating: "生成中...",
    regenerate: "AI 字幕を再生成",
    loginRequired: "AI 字幕を生成する前に設定でログインしてください。"
  }
};

function t(key, values = {}) {
  const template = translations[currentLanguage]?.[key] || translations.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function applyI18n() {
  document.documentElement.lang = currentLanguage;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
}

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  await loadSubtitleStyle();
  const { sessionToken, settings = {} } = await chrome.storage.local.get(["sessionToken", "settings"]);
  currentLanguage = settings.uiLanguage || "en";
  applyI18n();
  if (!sessionToken) {
    showLoggedOutState();
    return;
  }
  if (!tab?.url?.includes("youtube.com/watch")) {
    hideSubtitleControls();
    setButtonState("idle", false);
    status.textContent = t("openYoutube");
    return;
  }
  activeTabId = tab.id;
  activeVideoId = new URL(tab.url).searchParams.get("v") || "";
  if (!activeVideoId) {
    hideSubtitleControls();
    setButtonState("idle", false);
    status.textContent = t("noVideo");
    return;
  }
  status.textContent = t("readyVideo", { videoId: activeVideoId });
  await refreshInitialSubtitleState();
});

generate.addEventListener("click", async () => {
  if (!activeTabId) return;
  const forceRegenerate = subtitlesReady;
  setButtonState("extracting", false);
  status.textContent = t("extractingStatus");
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, {
      type: "GENERATE_AI_SUBTITLES",
      forceRegenerate
    });
    if (!result?.ok) throw new Error(result?.error || t("failedCreate"));
    status.textContent = t("generatingStatus", {
      count: result.rawCueCount,
      type: result.captionType,
      lang: result.sourceLang
    });
    setButtonState("generating", false);
    startJobPolling(result.jobId);
  } catch (error) {
    status.textContent = error.message || String(error);
    setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
  }
});

for (const control of [fontSize, positionPercent, backgroundOpacity]) {
  control.addEventListener("input", saveAndApplySubtitleStyle);
  control.addEventListener("change", saveAndApplySubtitleStyle);
}

async function refreshInitialSubtitleState() {
  const pendingJob = await findPendingJobForActiveVideo();
  if (pendingJob) {
    hideSubtitleControls();
    status.textContent = t("generatingShort");
    setButtonState("generating", false);
    startJobPolling(pendingJob.jobId);
    return;
  }

  const existing = await getExistingSubtitle();
  if (existing?.status === "completed") {
    subtitlesReady = true;
    showSubtitleControls();
    status.textContent = t("readyLoaded");
    setButtonState("ready-regenerate", true);
    await loadSubtitlesIntoPage();
    return;
  }

  subtitlesReady = false;
  hideSubtitleControls();
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
    if (!result?.ok) throw new Error(result?.error || t("checkingJob"));
    const job = result.job;
    status.textContent = t("generatingProgress", {
      status: job.status,
      progress: job.progress || 0
    });
    if (job.status === "completed") {
      clearJobPolling();
      await chrome.runtime.sendMessage({ type: "CHECK_SUBTITLE_JOBS" }).catch(() => {});
      await loadSubtitlesIntoPage();
      subtitlesReady = true;
      showSubtitleControls();
      status.textContent = t("readyLoaded");
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
    generateText.textContent = t("extracting");
  } else if (state === "generating") {
    generateText.textContent = t("generating");
  } else if (state === "ready-regenerate") {
    generateText.textContent = t("regenerate");
  } else {
    generateText.textContent = t("generate");
  }
}

function showLoggedOutState() {
  hideSubtitleControls();
  generate.classList.add("hidden");
  setButtonState("idle", false);
  status.textContent = t("loginRequired");
}

function showSubtitleControls() {
  controlsPanel.classList.remove("hidden");
}

function hideSubtitleControls() {
  controlsPanel.classList.add("hidden");
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
    fontWeight: "normal"
  };
}

function syncStyleLabels(style) {
  fontSizeValue.textContent = `${style.fontSize}px`;
  positionValue.textContent = `${style.positionPercent}%`;
  backgroundOpacityValue.textContent = `${style.backgroundOpacity}%`;
}
