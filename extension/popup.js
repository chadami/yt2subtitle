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
const notice = document.getElementById("notice");
const confirmPanel = document.getElementById("confirmPanel");
const summaryCaptionType = document.getElementById("summaryCaptionType");
const summarySourceLang = document.getElementById("summarySourceLang");
const summaryTargetLang = document.getElementById("summaryTargetLang");
const summaryApiMode = document.getElementById("summaryApiMode");
const summaryCueCount = document.getElementById("summaryCueCount");
const summaryEstimatedTime = document.getElementById("summaryEstimatedTime");
const summaryEstimatedCost = document.getElementById("summaryEstimatedCost");
let activeTabId = null;
let activeVideoId = "";
let subtitlesReady = false;
let pollTimer = null;
let currentLanguage = "en";
let pendingGeneration = null;

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
    confirmTitle: "Confirm generation",
    captionSource: "Caption source",
    sourceLanguage: "Source language",
    targetLanguage: "Target language",
    apiMode: "API mode",
    cueCount: "Cue count",
    estimatedTime: "Estimated time",
    estimatedCost: "Estimated cost",
    personalApiCost: "Provider billing",
    systemApiCost: "Platform credits",
    personalApiMode: "Personal API",
    systemApiMode: "System API",
    manualCaptions: "Manual captions",
    autoCaptions: "Auto captions",
    autoCaptionNotice: "This video only has YouTube auto captions. Translation quality may be limited by the original transcript.",
    longVideoNotice: "This may take a while. You can close this popup; Chrome will notify you when subtitles are ready.",
    readyToConfirm: "Review the subtitle source and generation estimate, then confirm.",
    settings: "Settings",
    openYoutube: "Open a YouTube video page to generate AI subtitles.",
    noVideo: "No video detected.",
    readyVideo: "Click the button below to generate subtitles.",
    extractingStatus: "Extracting video title and captions...",
    generatingStatus: "Generating subtitles. {count} cues found from {type} captions ({lang}).",
    checkingCaptions: "Checking available captions...",
    confirmGenerate: "Confirm and generate",
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
    confirmTitle: "确认生成",
    captionSource: "字幕来源",
    sourceLanguage: "原始语言",
    targetLanguage: "目标语言",
    apiMode: "API 模式",
    cueCount: "字幕条数",
    estimatedTime: "预计耗时",
    estimatedCost: "成本预期",
    personalApiCost: "服务商计费",
    systemApiCost: "平台额度",
    personalApiMode: "个人 API",
    systemApiMode: "系统 API",
    manualCaptions: "人工字幕",
    autoCaptions: "自动字幕",
    autoCaptionNotice: "当前使用 YouTube 自动识别字幕，翻译质量会受原始字幕准确度影响。",
    longVideoNotice: "生成可能需要一段时间。你可以关闭弹窗，完成后 Chrome 会通知你。",
    readyToConfirm: "请确认字幕来源和预计信息，然后开始生成。",
    settings: "设置",
    openYoutube: "打开 YouTube 视频页面后生成 AI 字幕。",
    noVideo: "未检测到视频。",
    readyVideo: "请点击下方生成字幕按钮",
    extractingStatus: "正在提取视频标题和字幕...",
    generatingStatus: "正在生成字幕。已从{type}字幕中找到 {count} 条字幕（{lang}）。",
    checkingCaptions: "正在检查可用字幕...",
    confirmGenerate: "确认并生成",
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
    confirmTitle: "生成を確認",
    captionSource: "字幕ソース",
    sourceLanguage: "元の言語",
    targetLanguage: "翻訳先言語",
    apiMode: "API モード",
    cueCount: "字幕数",
    estimatedTime: "推定時間",
    estimatedCost: "推定コスト",
    personalApiCost: "プロバイダー課金",
    systemApiCost: "プラットフォーム枠",
    personalApiMode: "個人 API",
    systemApiMode: "システム API",
    manualCaptions: "手動字幕",
    autoCaptions: "自動字幕",
    autoCaptionNotice: "YouTube の自動字幕を使用しています。翻訳品質は元字幕の精度に影響されます。",
    longVideoNotice: "時間がかかる場合があります。このポップアップを閉じても、完了時に Chrome が通知します。",
    readyToConfirm: "字幕ソースと見積もりを確認してから生成してください。",
    settings: "設定",
    openYoutube: "YouTube の動画ページを開いて AI 字幕を生成してください。",
    noVideo: "動画が検出されません。",
    readyVideo: "下のボタンをクリックして字幕を生成してください。",
    extractingStatus: "動画タイトルと字幕を抽出中...",
    generatingStatus: "字幕を生成中。{type} 字幕から {count} 件を検出しました（{lang}）。",
    checkingCaptions: "利用可能な字幕を確認中...",
    confirmGenerate: "確認して生成",
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
  if (!pendingGeneration) {
    setButtonState("extracting", false);
    status.textContent = t("checkingCaptions");
    hideNotice();
    hideConfirmPanel();
    try {
      const prepared = await chrome.tabs.sendMessage(activeTabId, {
        type: "PREPARE_AI_SUBTITLES"
      });
      if (!prepared?.ok) throw new Error(prepared?.error || t("failedCreate"));
      pendingGeneration = prepared;
      renderGenerationSummary(prepared.summary);
      status.textContent = t("readyToConfirm");
      setButtonState("confirm-generate", true);
    } catch (error) {
      status.textContent = actionableError(error);
      setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
    }
    return;
  }

  setButtonState("generating", false);
  status.textContent = t("extractingStatus");
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, {
      type: "GENERATE_AI_SUBTITLES",
      forceRegenerate,
      preparedPayload: pendingGeneration.payload
    });
    if (!result?.ok) throw new Error(result?.error || t("failedCreate"));
    const summary = pendingGeneration.summary;
    pendingGeneration = null;
    hideConfirmPanel();
    showWaitingNotice(summary);
    status.textContent = t("generatingStatus", {
      count: result.rawCueCount,
      type: result.captionType,
      lang: result.sourceLang
    });
    setButtonState("generating", false);
    startJobPolling(result.jobId);
  } catch (error) {
    status.textContent = actionableError(error);
    setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
  }
});

for (const control of [fontSize, positionPercent, backgroundOpacity]) {
  control.addEventListener("input", saveAndApplySubtitleStyle);
  control.addEventListener("change", saveAndApplySubtitleStyle);
}

async function refreshInitialSubtitleState() {
  pendingGeneration = null;
  hideConfirmPanel();
  hideNotice();
  const pendingJob = await findPendingJobForActiveVideo();
  if (pendingJob) {
    hideSubtitleControls();
    status.textContent = t("generatingShort");
    showNotice(t("longVideoNotice"));
    setButtonState("generating", false);
    startJobPolling(pendingJob.jobId);
    return;
  }

  const existing = await getExistingSubtitle();
  if (existing?.status === "completed") {
    subtitlesReady = true;
    showSubtitleControls();
    status.textContent = t("readyLoaded");
    showNotice("");
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
      pendingGeneration = null;
      showSubtitleControls();
      hideConfirmPanel();
      hideNotice();
      status.textContent = t("readyLoaded");
      setButtonState("ready-regenerate", true);
    } else if (job.status === "failed" || job.status === "cancelled") {
      clearJobPolling();
      hideNotice();
      status.textContent = actionableError(job.error || `Subtitle job ${job.status}.`);
      setButtonState(subtitlesReady ? "ready-regenerate" : "ready-generate", true);
    } else {
      setButtonState("generating", false);
    }
  } catch (error) {
    clearJobPolling();
    status.textContent = actionableError(error);
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
  } else if (state === "confirm-generate") {
    generateText.textContent = t("confirmGenerate");
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

function renderGenerationSummary(summary) {
  summaryCaptionType.textContent = summary.captionType === "auto" ? t("autoCaptions") : t("manualCaptions");
  summarySourceLang.textContent = summary.sourceLang || "-";
  summaryTargetLang.textContent = summary.targetLang || "-";
  summaryApiMode.textContent = summary.translationMode === "system" ? t("systemApiMode") : t("personalApiMode");
  summaryCueCount.textContent = String(summary.rawCueCount || 0);
  summaryEstimatedTime.textContent = estimateDurationText(summary);
  summaryEstimatedCost.textContent = summary.translationMode === "system" ? t("systemApiCost") : t("personalApiCost");
  confirmPanel.classList.remove("hidden");
  const notices = [];
  if (summary.captionType === "auto") notices.push(t("autoCaptionNotice"));
  if ((summary.totalSeconds || 0) >= 20 * 60 || (summary.rawCueCount || 0) >= 600) notices.push(t("longVideoNotice"));
  if (notices.length) showNotice(notices.join(" "));
  else hideNotice();
}

function estimateDurationText(summary) {
  const cues = summary.rawCueCount || 0;
  const minutes = Math.max(1, Math.ceil(cues / 140));
  if (minutes <= 1) return "< 1 min";
  return `${minutes}-${minutes + 2} min`;
}

function showWaitingNotice(summary) {
  const notices = [t("longVideoNotice")];
  if (summary?.captionType === "auto") notices.unshift(t("autoCaptionNotice"));
  showNotice(notices.join(" "));
}

function showNotice(text) {
  if (!text) {
    hideNotice();
    return;
  }
  notice.textContent = text;
  notice.classList.remove("hidden");
}

function hideNotice() {
  notice.textContent = "";
  notice.classList.add("hidden");
}

function hideConfirmPanel() {
  confirmPanel.classList.add("hidden");
}

function actionableError(error) {
  const message = typeof error === "string" ? error : error?.message || String(error);
  const lower = message.toLowerCase();
  if (lower.includes("no caption") || lower.includes("no usable caption")) {
    return `${message} Try another video or wait until YouTube provides captions.`;
  }
  if (lower.includes("missing auth") || lower.includes("sign in") || lower.includes("token")) {
    return `${message} Open Settings and sign in again.`;
  }
  if (lower.includes("api key") || lower.includes("model fetch") || lower.includes("ai request failed: 401") || lower.includes("ai request failed: 403")) {
    return `${message} Open Settings and check your API key and selected model.`;
  }
  if (lower.includes("cannot reach backend") || lower.includes("failed to fetch")) {
    return `${message} Check the Backend API URL in Settings, then try again.`;
  }
  if (lower.includes("ai response was not valid json") || lower.includes("ai request failed")) {
    return `${message} Retry once, or switch API mode/model in Settings.`;
  }
  return message;
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
