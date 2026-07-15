const OVERLAY_ID = "yt-ai-subtitle-overlay";
const OVERLAY_CONTENT_ID = "yt-ai-subtitle-content";
const OVERLAY_AI_INDICATOR_ID = "yt-ai-subtitle-ai-indicator";
const DEFAULT_API_BASE = "https://api.vidlingo.online";
const LEGACY_API_BASE = "https://subtitle.invisiblewind.cn";
const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 24,
  backgroundOpacity: 25,
  fontWeight: "normal",
  positionPercent: 21,
  positionXPercent: 50,
  showSourceText: true
};
const PARTIAL_SUBTITLE_POLL_INTERVAL_MS = 2500;
const PENDING_TRANSLATION_TEXT = "字幕正在准备中，即将完成";
const SUBTITLE_PREPARATION_CACHE_MS = 30 * 1000;
const AUTO_AI_PLAY_DELAY_MS = 5_000;
const PLAYER_BUTTON_ID = "yt-ai-subtitle-control-button";
const PLAYER_PANEL_ID = "yt-ai-subtitle-control-panel";
const PLAYER_PANEL_STYLE_ID = "yt-ai-subtitle-control-style";
let renderGeneration = 0;
let partialSubtitlePollTimer = null;
let partialSubtitleJobId = "";
let partialSubtitleVideoId = "";
let loadedPartialChunkCount = 0;
let loadedMachineChunkCount = 0;
let partialSourceCues = [];
let activeRenderedCue = null;
let currentSubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE };
let subtitlePreparationCache = null;
let panelJobPollTimer = null;
let panelVideoId = "";
let autoTranslationVideoId = "";
let panelActionInProgress = false;
let autoTranslationRun = 0;
let autoAiDelayTimer = null;
let autoAiDelayVideo = null;
let autoAiPlayingHandler = null;
let autoAiPauseHandler = null;
let machinePreviewVideoId = "";
let machinePreviewCues = [];
let subtitleDragState = null;
let overlayHoverTrackingReady = false;

function getVideoId() {
  return parseVideoId(location.href);
}

function parseVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/").filter(Boolean)[1] || "";
    }
    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function getCurrentVideoContext() {
  const videoId = getVideoId();
  return {
    ok: true,
    videoId,
    url: location.href,
    isVideoPage: Boolean(videoId)
  };
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  const player = document.querySelector(".html5-video-player");
  if (overlay) {
    if (player && overlay.parentElement !== player) player.appendChild(overlay);
    if (player) overlay.style.position = "absolute";
    return overlay;
  }
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    player ? "position:absolute" : "position:fixed",
    "left:50%",
    "bottom:21%",
    "transform:translateX(-50%)",
    "z-index:70",
    "max-width:min(96%,1960px)",
    "padding:8px 16px 9px",
    "border-radius:8px",
    "background:rgba(18,28,25,.82)",
    "border:1px solid rgba(211,232,222,.32)",
    "box-shadow:0 12px 34px rgba(0,0,0,.34)",
    "color:#f6fff9",
    "font-family:Arial,'Microsoft YaHei',sans-serif",
    "line-height:1.42",
    "letter-spacing:0",
    "text-align:left",
    "text-shadow:0 2px 8px rgba(0,0,0,.5)",
    "pointer-events:none",
    "display:none",
    "backdrop-filter:blur(6px)",
    "-webkit-backdrop-filter:blur(6px)"
  ].join(";");
  const content = document.createElement("div");
  content.id = OVERLAY_CONTENT_ID;

  const aiIndicator = document.createElement("img");
  aiIndicator.id = OVERLAY_AI_INDICATOR_ID;
  aiIndicator.src = chrome.runtime.getURL("icons/ai-sparkle.png");
  aiIndicator.alt = "AI 生成";
  aiIndicator.title = "AI 生成字幕";
  aiIndicator.hidden = true;
  aiIndicator.style.cssText = [
    "position:absolute",
    "top:.28em",
    "right:.34em",
    "width:.72em",
    "height:.72em",
    "object-fit:contain",
    "opacity:.78",
    "pointer-events:none"
  ].join(";");

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.setAttribute("aria-label", "拖动字幕位置");
  dragHandle.title = "拖动字幕位置，双击恢复默认";
  dragHandle.dataset.role = "subtitle-drag-handle";
  dragHandle.innerHTML = '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M76 92a16 16 0 1 1-16-16 16 16 0 0 1 16 16m52-16a16 16 0 1 0 16 16 16 16 0 0 0-16-16m68 32a16 16 0 1 0-16-16 16 16 0 0 0 16 16M60 148a16 16 0 1 0 16 16 16 16 0 0 0-16-16m68 0a16 16 0 1 0 16 16 16 16 0 0 0-16-16m68 0a16 16 0 1 0 16 16 16 16 0 0 0-16-16"/></svg>';
  dragHandle.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:-25px",
    "transform:translateX(-50%)",
    "width:38px",
    "height:21px",
    "display:grid",
    "place-items:center",
    "padding:0",
    "border:1px solid rgba(255,255,255,.22)",
    "border-radius:999px",
    "background:rgba(24,24,26,.9)",
    "box-shadow:0 4px 12px rgba(0,0,0,.28)",
    "color:rgba(255,255,255,.92)",
    "cursor:grab",
    "pointer-events:auto",
    "opacity:0",
    "visibility:hidden",
    "transition:opacity .14s ease,transform .14s ease",
    "touch-action:none"
  ].join(";");
  dragHandle.querySelector("svg").style.cssText = "width:18px;height:18px;display:block";
  dragHandle.addEventListener("pointerdown", beginSubtitleDrag);
  dragHandle.addEventListener("pointermove", moveSubtitleDrag);
  dragHandle.addEventListener("pointerup", endSubtitleDrag);
  dragHandle.addEventListener("pointercancel", endSubtitleDrag);
  dragHandle.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetSubtitlePosition().catch(() => {});
  });

  overlay.append(content, aiIndicator, dragHandle);
  (player || document.body).appendChild(overlay);
  ensureOverlayHoverTracking();
  applySubtitleStyle(DEFAULT_SUBTITLE_STYLE);
  applyStoredSubtitleStyle();
  return overlay;
}

async function applyStoredSubtitleStyle() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  applySubtitleStyle(settings.subtitleStyle);
}

function applySubtitleStyle(style = {}) {
  const overlay = ensureOverlay();
  const nextStyle = {
    ...DEFAULT_SUBTITLE_STYLE,
    ...style
  };
  currentSubtitleStyle = nextStyle;
  const fontSize = clampNumber(Number(nextStyle.fontSize), 16, 36);
  const opacity = clampNumber(Number(nextStyle.backgroundOpacity), 15, 95) / 100;
  const position = clampNumber(Number(nextStyle.positionPercent), 2, 92);
  const positionX = clampNumber(Number(nextStyle.positionXPercent ?? 50), 0, 100);
  overlay.style.fontSize = `${fontSize}px`;
  overlay.style.fontWeight = "500";
  overlay.style.background = `rgba(18,28,25,${opacity})`;
  overlay.style.bottom = `${position}%`;
  overlay.style.left = `${positionX}%`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function setSubtitleDragHandleVisible(overlay, visible) {
  const handle = overlay?.querySelector('[data-role="subtitle-drag-handle"]');
  if (!handle) return;
  const shouldShow = visible || subtitleDragState?.overlay === overlay;
  handle.style.visibility = shouldShow ? "visible" : "hidden";
  handle.style.opacity = shouldShow ? "1" : "0";
  handle.style.transform = `translateX(-50%) translateY(${shouldShow ? "0" : "3px"})`;
}

function ensureOverlayHoverTracking() {
  if (overlayHoverTrackingReady) return;
  overlayHoverTrackingReady = true;
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || subtitleDragState) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || overlay.style.display === "none") return;
    const rect = overlay.getBoundingClientRect();
    const insideHoverZone = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top - 29
      && event.clientY <= rect.bottom;
    setSubtitleDragHandleVisible(overlay, insideHoverZone);
  }, { passive: true });
}

function subtitlePlayerForOverlay(overlay) {
  return overlay?.closest(".html5-video-player") || document.querySelector(".html5-video-player");
}

function constrainedSubtitlePosition(overlay, player, centerX, bottomDistance) {
  const overlayRect = overlay.getBoundingClientRect();
  const playerRect = player.getBoundingClientRect();
  const safe = 10;
  const halfWidth = overlayRect.width / 2;
  const clampedCenterX = clampNumber(centerX, safe + halfWidth, playerRect.width - safe - halfWidth);
  const maxBottom = Math.max(safe, playerRect.height - overlayRect.height - 35);
  const clampedBottom = clampNumber(bottomDistance, safe, maxBottom);
  return {
    xPercent: playerRect.width ? (clampedCenterX / playerRect.width) * 100 : 50,
    bottomPercent: playerRect.height ? (clampedBottom / playerRect.height) * 100 : DEFAULT_SUBTITLE_STYLE.positionPercent
  };
}

function constrainSubtitleOverlay(overlay) {
  if (!overlay || subtitleDragState?.overlay === overlay) return;
  const player = subtitlePlayerForOverlay(overlay);
  if (!player) return;
  const playerRect = player.getBoundingClientRect();
  const desiredCenterX = playerRect.width * clampNumber(Number(currentSubtitleStyle.positionXPercent ?? 50), 0, 100) / 100;
  const desiredBottom = playerRect.height * clampNumber(Number(currentSubtitleStyle.positionPercent), 2, 92) / 100;
  const position = constrainedSubtitlePosition(overlay, player, desiredCenterX, desiredBottom);
  overlay.style.left = `${position.xPercent}%`;
  overlay.style.bottom = `${position.bottomPercent}%`;
}

function beginSubtitleDrag(event) {
  if (event.button !== 0) return;
  const handle = event.currentTarget;
  const overlay = handle.closest(`#${OVERLAY_ID}`);
  const player = subtitlePlayerForOverlay(overlay);
  if (!overlay || !player) return;
  const overlayRect = overlay.getBoundingClientRect();
  const playerRect = player.getBoundingClientRect();
  subtitleDragState = {
    overlay,
    player,
    handle,
    pointerId: event.pointerId,
    startPointerX: event.clientX,
    startPointerY: event.clientY,
    startCenterX: overlayRect.left + overlayRect.width / 2 - playerRect.left,
    startBottom: playerRect.bottom - overlayRect.bottom
  };
  handle.setPointerCapture(event.pointerId);
  handle.style.cursor = "grabbing";
  overlay.dataset.dragging = "true";
  setSubtitleDragHandleVisible(overlay, true);
  event.preventDefault();
  event.stopPropagation();
}

function moveSubtitleDrag(event) {
  const state = subtitleDragState;
  if (!state || state.pointerId !== event.pointerId) return;
  const nextCenterX = state.startCenterX + event.clientX - state.startPointerX;
  const nextBottom = state.startBottom - (event.clientY - state.startPointerY);
  const position = constrainedSubtitlePosition(state.overlay, state.player, nextCenterX, nextBottom);
  state.overlay.style.left = `${position.xPercent}%`;
  state.overlay.style.bottom = `${position.bottomPercent}%`;
  currentSubtitleStyle = {
    ...currentSubtitleStyle,
    positionXPercent: Number(position.xPercent.toFixed(3)),
    positionPercent: Number(position.bottomPercent.toFixed(3))
  };
  syncPanelStyleControls(currentSubtitleStyle);
  event.preventDefault();
  event.stopPropagation();
}

function endSubtitleDrag(event) {
  const state = subtitleDragState;
  if (!state || state.pointerId !== event.pointerId) return;
  if (state.handle.hasPointerCapture(event.pointerId)) state.handle.releasePointerCapture(event.pointerId);
  state.handle.style.cursor = "grab";
  delete state.overlay.dataset.dragging;
  subtitleDragState = null;
  setSubtitleDragHandleVisible(state.overlay, true);
  persistSubtitlePosition().catch(() => {});
  event.preventDefault();
  event.stopPropagation();
}

async function persistSubtitlePosition() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({
    settings: {
      ...settings,
      subtitleStyle: {
        ...(settings.subtitleStyle || {}),
        positionXPercent: currentSubtitleStyle.positionXPercent,
        positionPercent: currentSubtitleStyle.positionPercent
      }
    }
  });
}

async function resetSubtitlePosition() {
  currentSubtitleStyle = {
    ...currentSubtitleStyle,
    positionXPercent: DEFAULT_SUBTITLE_STYLE.positionXPercent,
    positionPercent: DEFAULT_SUBTITLE_STYLE.positionPercent
  };
  applySubtitleStyle(currentSubtitleStyle);
  syncPanelStyleControls(currentSubtitleStyle);
  await persistSubtitlePosition();
}

function clearOverlay() {
  renderGeneration += 1;
  activeRenderedCue = null;
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    const content = overlay.querySelector(`#${OVERLAY_CONTENT_ID}`);
    if (content) content.textContent = "";
    const indicator = overlay.querySelector(`#${OVERLAY_AI_INDICATOR_ID}`);
    if (indicator) indicator.hidden = true;
    setSubtitleDragHandleVisible(overlay, false);
    overlay.style.display = "none";
  }
}

function findCurrentCue(cues, currentTime) {
  return cues.find((item) => currentTime >= item.start && currentTime <= item.end);
}

function sourceTextForTranslatedCue(cue, sourceCues) {
  if (cue?.sourceText) return cue.sourceText;
  const sourceCue = findCurrentCue(sourceCues, (cue.start + cue.end) / 2);
  return sourceCue?.text || "";
}

function renderOverlayCue(overlay, sourceText, translationText, isAiGenerated = false) {
  const normalizedSource = normalizeText(sourceText || "");
  const normalizedTranslation = normalizeText(translationText || "");
  const shouldShowSource = currentSubtitleStyle.showSourceText !== false;
  if ((!shouldShowSource || !normalizedSource) && !normalizedTranslation) {
    const content = overlay.querySelector(`#${OVERLAY_CONTENT_ID}`);
    if (content) content.textContent = "";
    const indicator = overlay.querySelector(`#${OVERLAY_AI_INDICATOR_ID}`);
    if (indicator) indicator.hidden = true;
    setSubtitleDragHandleVisible(overlay, false);
    overlay.style.display = "none";
    return;
  }

  const translationLine = document.createElement("div");
  translationLine.textContent = normalizedTranslation;
  translationLine.style.cssText = [
    "font-size:1em",
    "font-weight:300",
    "line-height:1.38",
    "color:#f6fff9",
    "overflow-wrap:anywhere"
  ].join(";");

  const content = overlay.querySelector(`#${OVERLAY_CONTENT_ID}`);
  const aiIndicator = overlay.querySelector(`#${OVERLAY_AI_INDICATOR_ID}`);
  if (!content || !aiIndicator) return;
  aiIndicator.hidden = !isAiGenerated;
  overlay.style.paddingRight = isAiGenerated ? "calc(16px + .78em)" : "16px";

  if (!shouldShowSource || !normalizedSource) {
    content.replaceChildren(translationLine);
  } else {
    const sourceLine = document.createElement("div");
    sourceLine.textContent = normalizedSource;
    sourceLine.style.cssText = [
      "font-size:1em",
      "font-weight:500",
      "line-height:1.38",
      "color:rgba(246,255,249,.82)",
      "margin-top:4px",
      "overflow-wrap:anywhere"
    ].join(";");
    content.replaceChildren(translationLine, sourceLine);
  }
  overlay.style.display = "block";
  requestAnimationFrame(() => constrainSubtitleOverlay(overlay));
}

function waitForVideoElement(timeoutMs = 6000) {
  const video = document.querySelector("video");
  if (video) return Promise.resolve(video);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const nextVideo = document.querySelector("video");
      if (nextVideo || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(nextVideo || null);
      }
    }, 100);
  });
}

function normalizeSourceCues(cues = []) {
  return cues
    .map((cue) => ({
      start: Number(cue.start),
      end: Number(cue.end),
      text: normalizeText(cue.sourceText || cue.text || "")
    }))
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text);
}

async function renderSubtitles(cues, videoId, options = {}) {
  const video = await waitForVideoElement();
  if (!video) {
    clearOverlay();
    return { loaded: false, reason: "video-not-ready", cueCount: cues.length };
  }
  const overlay = ensureOverlay();
  await applyStoredSubtitleStyle();
  const generation = ++renderGeneration;
  const translatedCues = Array.isArray(cues) ? cues : [];
  const machineCues = Array.isArray(options.machineCues) ? options.machineCues : [];
  const nativeTrack = options.nativeTrack === true;
  const sourceCues = normalizeSourceCues(options.sourceCues || []);
  const pendingText = options.pendingText || "";

  function tick() {
    if (generation !== renderGeneration || getVideoId() !== videoId) return;
    const current = video.currentTime;
    const keepCurrentMachineCue = activeRenderedCue?.videoId === videoId
      && activeRenderedCue.kind === "machine"
      && current >= activeRenderedCue.cue.start
      && current <= activeRenderedCue.cue.end;
    const aiCue = findCurrentCue(translatedCues, current);
    const machineCue = findCurrentCue(machineCues, current);
    const cue = keepCurrentMachineCue ? activeRenderedCue.cue : (aiCue || machineCue);
    if (cue) {
      const cueKind = keepCurrentMachineCue || (!aiCue && machineCue)
        ? "machine"
        : (nativeTrack ? "native" : "ai");
      activeRenderedCue = {
        videoId,
        kind: cueKind,
        cue
      };
      renderOverlayCue(overlay, sourceTextForTranslatedCue(cue, sourceCues), cue.text, cueKind === "ai");
    } else {
      activeRenderedCue = null;
      const sourceCue = pendingText ? findCurrentCue(sourceCues, current) : null;
      renderOverlayCue(overlay, sourceCue?.text || "", sourceCue ? pendingText : "", false);
    }
    requestAnimationFrame(tick);
  }
  tick();
  return { loaded: true, cueCount: translatedCues.length };
}

async function tryLoadSubtitle() {
  const videoId = getVideoId();
  if (!videoId) {
    clearOverlay();
    return { loaded: false, reason: "no-video-id" };
  }
  const preparation = await prepareAiSubtitles();
  const prepared = preparation.payload;
  if (prepared.usesNativeTargetTrack) {
    const rendered = await renderSubtitles(prepared.rawCues, videoId, { nativeTrack: true });
    return {
      ...rendered,
      status: "completed",
      accessSource: "youtube-native",
      nativeTrack: true,
      publicLabel: nativeTrackMessage(prepared.sourceLang)
    };
  }
  const data = await chrome.runtime.sendMessage({
    type: "RESOLVE_SUBTITLE",
    payload: prepared
  });
  if (data.status === "completed" && Array.isArray(data.cues) && data.cues.length) {
    const rendered = await renderSubtitles(data.cues, videoId);
    return { ...rendered, status: "completed", accessSource: data.accessSource, publicLabel: data.publicLabel };
  } else {
    clearOverlay();
    return { loaded: false, reason: data.status || "missing", cueCount: 0 };
  }
}

function startPartialSubtitlePolling(jobId, videoId = getVideoId(), sourceCues = [], initialMachineCues = []) {
  if (!jobId || !videoId) return;
  if (partialSubtitlePollTimer && partialSubtitleJobId === jobId && partialSubtitleVideoId === videoId) return;
  stopPartialSubtitlePolling();
  partialSubtitleJobId = jobId;
  partialSubtitleVideoId = videoId;
  partialSourceCues = normalizeSourceCues(sourceCues);
  if (Array.isArray(initialMachineCues) && initialMachineCues.length) {
    machinePreviewVideoId = videoId;
    machinePreviewCues = initialMachineCues;
  }
  loadedPartialChunkCount = 0;
  loadedMachineChunkCount = 0;
  partialSubtitlePollTimer = setInterval(() => {
    pollPartialSubtitles(jobId, videoId).catch(() => {});
  }, PARTIAL_SUBTITLE_POLL_INTERVAL_MS);
  if (partialSourceCues.length || machinePreviewCues.length) {
    renderSubtitles([], videoId, {
      machineCues: machinePreviewVideoId === videoId ? machinePreviewCues : [],
      sourceCues: partialSourceCues,
      pendingText: PENDING_TRANSLATION_TEXT
    }).catch(() => {});
  }
  pollPartialSubtitles(jobId, videoId).catch(() => {});
}

function stopPartialSubtitlePolling() {
  if (partialSubtitlePollTimer) clearInterval(partialSubtitlePollTimer);
  partialSubtitlePollTimer = null;
  partialSubtitleJobId = "";
  partialSubtitleVideoId = "";
  partialSourceCues = [];
  loadedPartialChunkCount = 0;
  loadedMachineChunkCount = 0;
}

async function pollPartialSubtitles(jobId, videoId) {
  if (getVideoId() !== videoId) {
    stopPartialSubtitlePolling();
    return;
  }

  const partial = await chrome.runtime.sendMessage({ type: "GET_PARTIAL_SUBTITLES", jobId });
  if (!partial?.ok) return;

  if (partial.status === "completed") {
    stopPartialSubtitlePolling();
    await tryLoadSubtitle();
    return;
  }
  if (partial.status === "failed" || partial.status === "cancelled") {
    stopPartialSubtitlePolling();
    return;
  }

  const chunkCount = Number(partial.aiChunkCount ?? partial.chunkCount ?? 0);
  const machineChunkCount = Number(partial.machineChunkCount || 0);
  const aiCues = Array.isArray(partial.aiCues) ? partial.aiCues : (Array.isArray(partial.cues) ? partial.cues : []);
  const serverMachineCues = Array.isArray(partial.machineCues) ? partial.machineCues : [];
  const machineCues = serverMachineCues.length
    ? serverMachineCues
    : (machinePreviewVideoId === videoId ? machinePreviewCues : []);
  const hasNewAiCues = aiCues.length > 0 && chunkCount > loadedPartialChunkCount;
  const hasNewMachineCues = serverMachineCues.length > 0 && machineChunkCount > loadedMachineChunkCount;
  if (!hasNewAiCues && !hasNewMachineCues) return;

  const result = await renderSubtitles(aiCues, videoId, {
    machineCues,
    sourceCues: partialSourceCues,
    pendingText: PENDING_TRANSLATION_TEXT
  });
  if (result.loaded) {
    loadedPartialChunkCount = chunkCount;
    loadedMachineChunkCount = machineChunkCount;
  }
}

async function resumePendingPartialPolling() {
  const videoId = getVideoId();
  if (!videoId) {
    stopPartialSubtitlePolling();
    return;
  }
  const { pendingJobs = [] } = await chrome.storage.local.get(["pendingJobs"]);
  const pendingJob = pendingJobs.find((job) => job.videoId === videoId);
  if (pendingJob?.jobId) {
    startPartialSubtitlePolling(pendingJob.jobId, videoId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CURRENT_VIDEO") {
    sendResponse(getCurrentVideoContext());
    return true;
  }

  if (message?.type === "PREPARE_AI_SUBTITLES") {
    prepareAiSubtitles().then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }

  if (message?.type === "GENERATE_AI_SUBTITLES") {
    generateAiSubtitles(message.forceRegenerate === true, message.preparedPayload).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }

  if (message?.type === "LOAD_AI_SUBTITLES") {
    tryLoadSubtitle().then(
      (result) => sendResponse({ ok: true, ...result }),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }

  if (message?.type === "LOAD_PARTIAL_AI_SUBTITLES") {
    const cues = Array.isArray(message.aiCues) ? message.aiCues : (Array.isArray(message.cues) ? message.cues : []);
    const machineCues = Array.isArray(message.machineCues) ? message.machineCues : [];
    if (!cues.length && !machineCues.length) {
      sendResponse({ ok: true, loaded: false, cueCount: 0 });
      return true;
    }
    renderSubtitles(cues, message.videoId || getVideoId(), { machineCues }).then(
      (result) => sendResponse({ ok: true, partial: true, ...result }),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }

  if (message?.type === "APPLY_SUBTITLE_STYLE") {
    applySubtitleStyle(message.style);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

async function prepareAiSubtitles() {
  const videoId = getVideoId();
  if (!videoId) throw new Error("No YouTube video detected.");

  if (
    subtitlePreparationCache?.videoId === videoId
    && Date.now() - subtitlePreparationCache.createdAt < SUBTITLE_PREPARATION_CACHE_MS
  ) {
    return subtitlePreparationCache.promise;
  }

  const cacheEntry = {
    videoId,
    createdAt: Date.now(),
    promise: prepareAiSubtitlesForVideo(videoId)
  };
  subtitlePreparationCache = cacheEntry;
  try {
    return await cacheEntry.promise;
  } catch (error) {
    if (subtitlePreparationCache === cacheEntry) subtitlePreparationCache = null;
    throw error;
  }
}

function normalizeApiBase(value) {
  const apiBase = (value || DEFAULT_API_BASE).replace(/\/$/, "");
  return apiBase === LEGACY_API_BASE ? DEFAULT_API_BASE : apiBase;
}

async function prepareAiSubtitlesForVideo(videoId) {
  const { settings = {}, clientId, sessionToken, pendingJobs = [] } = await chrome.storage.local.get([
    "settings",
    "clientId",
    "sessionToken",
    "pendingJobs"
  ]);
  const effectiveSettings = {
    ...settings,
    apiBase: normalizeApiBase(settings.apiBase)
  };

  if (!sessionToken) {
    throw new Error("Sign in from Settings before generating AI subtitles.");
  }

  const video = await collectVideoPayload(videoId);
  const targetLang = effectiveSettings.targetLang || "zh-Hans";
  const nativeTargetTrack = selectTargetCaptionTrack(video.captionTracks, targetLang);
  const track = nativeTargetTrack || selectCaptionTrack(video.captionTracks, effectiveSettings.sourceLang || "en");
  const rawCues = await fetchCaptionCues(track);
  if (!rawCues.length) throw new Error("Caption track exists, but no usable cues were downloaded.");

  const totalSeconds = rawCues.reduce((max, cue) => Math.max(max, cue.end || 0), 0);
  const characterCount = rawCues.reduce((sum, cue) => sum + (cue.text || "").length, 0);
  return {
    ok: true,
    payload: {
      clientId,
      sessionToken,
      pendingJobs,
      videoId,
      video: video.video,
      sourceLang: track.languageCode || effectiveSettings.sourceLang || "en",
      targetLang,
      usesNativeTargetTrack: Boolean(nativeTargetTrack),
      translationMode: "user",
      styleId: "accurate",
      captionType: track.isAuto ? "auto" : "manual",
      rawCues
    },
    summary: {
      rawCueCount: rawCues.length,
      characterCount,
      totalSeconds,
      captionType: track.isAuto ? "auto" : "manual",
      sourceLang: track.languageCode || effectiveSettings.sourceLang || "en",
      targetLang,
      usesNativeTargetTrack: Boolean(nativeTargetTrack),
      translationMode: "user"
    }
  };
}

async function generateAiSubtitles(forceRegenerate = false, preparedPayload = null, initialMachineCues = []) {
  const videoId = getVideoId();
  if (!videoId) throw new Error("No YouTube video detected.");
  clearOverlay();

  const preparation = preparedPayload
    ? { payload: preparedPayload, summary: summarizePreparedPayload(preparedPayload) }
    : await prepareAiSubtitles();
  const prepared = preparation.payload;
  if (prepared.usesNativeTargetTrack) {
    stopPartialSubtitlePolling();
    const rendered = await renderSubtitles(prepared.rawCues, videoId, { nativeTrack: true });
    return {
      ok: true,
      status: "native",
      nativeTrack: true,
      loaded: rendered.loaded,
      rawCueCount: prepared.rawCues.length,
      captionType: prepared.captionType,
      sourceLang: prepared.sourceLang,
      summary: preparation.summary
    };
  }
  const data = await chrome.runtime.sendMessage({
    type: "CREATE_SUBTITLE_JOB",
    payload: {
      ...prepared,
      forceRegenerate,
      machineCues: initialMachineCues,
    }
  });
  if (!data?.ok) throw new Error(data?.error || "Failed to create subtitle job.");
  startPartialSubtitlePolling(data.jobId, videoId, prepared.rawCues, initialMachineCues);
  return {
    ok: true,
    jobId: data.jobId,
    status: data.status,
    rawCueCount: prepared.rawCues.length,
    captionType: prepared.captionType,
    sourceLang: prepared.sourceLang,
    summary: preparation.summary
  };
}

function summarizePreparedPayload(prepared) {
  const rawCues = Array.isArray(prepared.rawCues) ? prepared.rawCues : [];
  return {
    rawCueCount: rawCues.length,
    characterCount: rawCues.reduce((sum, cue) => sum + (cue.text || "").length, 0),
    totalSeconds: rawCues.reduce((max, cue) => Math.max(max, cue.end || 0), 0),
    captionType: prepared.captionType,
    sourceLang: prepared.sourceLang,
    targetLang: prepared.targetLang,
    translationMode: prepared.translationMode
  };
}

async function collectVideoPayload(videoId) {
  const player = await fetchPlayerResponse(videoId);
  const details = player.videoDetails || {};
  const microformat = player.microformat?.playerMicroformatRenderer || {};
  const captionTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!captionTracks.length) throw new Error("No caption tracks found for this video.");

  return {
    video: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: normalizeText(details.title || textFromRuns(microformat.title) || document.title || ""),
      channel: normalizeText(details.author || microformat.ownerChannelName || ""),
      description: normalizeText(details.shortDescription || textFromRuns(microformat.description) || "")
    },
    captionTracks: captionTracks.map((track) => ({
      name: textFromRuns(track.name) || track.languageCode || "",
      languageCode: track.languageCode || "",
      isAuto: track.kind === "asr",
      baseUrl: track.baseUrl || ""
    })).filter((track) => track.baseUrl)
  };
}

async function fetchPlayerResponse(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const html = await fetch(watchUrl, { headers: { "Accept-Language": "en-US" } }).then((res) => res.text());
  const apiKey = html.match(/"INNERTUBE_API_KEY":\s*"([A-Za-z0-9_-]+)"/)?.[1];
  if (apiKey) {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId
      })
    });
    if (response.ok) return response.json();
  }
  return findBalancedJson(html, "ytInitialPlayerResponse");
}

function findBalancedJson(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Could not find ${marker}`);
  const start = text.indexOf("{", markerIndex);
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === "\"") inString = false;
    } else if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error(`Could not parse ${marker}`);
}

function selectCaptionTrack(tracks, preferredLanguage) {
  const candidates = tracks.filter((track) => track.baseUrl);
  const manual = candidates.filter((track) => !track.isAuto);
  const preferred = candidates.filter((track) => isLanguageMatch(track.languageCode, preferredLanguage));
  const preferredManual = preferred.filter((track) => !track.isAuto);
  return preferredManual[0] || preferred[0] || manual[0] || candidates[0] || null;
}

function selectTargetCaptionTrack(tracks, targetLanguage) {
  const matching = tracks
    .filter((track) => track.baseUrl && isTargetLanguageMatch(track.languageCode, targetLanguage))
    .sort((left, right) => Number(left.isAuto) - Number(right.isAuto));
  return matching[0] || null;
}

function normalizeLanguageCode(language) {
  return String(language || "").trim().replace(/_/g, "-").toLowerCase();
}

function chineseScript(language) {
  const normalized = normalizeLanguageCode(language);
  if (["zh-hans", "zh-cn", "zh-sg", "zh-my"].includes(normalized)) return "simplified";
  if (["zh-hant", "zh-tw", "zh-hk", "zh-mo"].includes(normalized)) return "traditional";
  return "";
}

function isTargetLanguageMatch(languageCode, targetLanguage) {
  const language = normalizeLanguageCode(languageCode);
  const target = normalizeLanguageCode(targetLanguage);
  if (!language || !target) return false;
  if (language === target) return true;

  const languagePrimary = primaryLanguageCode(language);
  const targetPrimary = primaryLanguageCode(target);
  if (languagePrimary !== targetPrimary) return false;
  if (targetPrimary === "zh") {
    const targetScript = chineseScript(target);
    const languageScript = chineseScript(language);
    return Boolean(targetScript && languageScript && targetScript === languageScript);
  }
  return true;
}

function isLanguageMatch(languageCode, preferredLanguage) {
  const language = (languageCode || "").toLowerCase();
  const preferred = (preferredLanguage || "").toLowerCase();
  if (!language || !preferred) return false;
  return language === preferred || language.startsWith(`${preferred}-`) || preferred.startsWith(`${language}-`);
}

function primaryLanguageCode(language) {
  return String(language || "").trim().replace("_", "-").toLowerCase().split("-")[0];
}

function isSameTranslationLanguage(sourceLanguage, targetLanguage) {
  return isTargetLanguageMatch(sourceLanguage, targetLanguage);
}

function sameLanguageMessage(sourceLanguage, targetLanguage) {
  return `字幕语言 ${sourceLanguage || "-"} 与目标语言 ${targetLanguage || "-"} 相同，无需翻译`;
}

function nativeTrackMessage(language) {
  return `已使用视频内置的 ${language || "目标语言"} 字幕，未调用谷歌翻译或 AI 翻译`;
}

async function fetchCaptionCues(track) {
  if (!track) throw new Error("No usable caption track found.");
  const xml = await fetch(track.baseUrl).then((res) => res.text());
  const cues = parseTranscriptXml(xml);
  if (cues.length) return cues;

  const jsonUrl = withQuery(track.baseUrl, { fmt: "json3" });
  const data = await fetch(jsonUrl).then((res) => res.json());
  return parseJson3Cues(data);
}

function parseTranscriptXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("text")]
    .map((node) => {
      const start = Number(node.getAttribute("start") || 0);
      const duration = Number(node.getAttribute("dur") || 0);
      return {
        start,
        end: start + duration,
        text: normalizeText(node.textContent || "")
      };
    })
    .filter((cue) => cue.text && cue.end > cue.start);
}

function parseJson3Cues(data) {
  return (data.events || [])
    .filter((event) => Array.isArray(event.segs))
    .map((event) => {
      const start = Number(event.tStartMs || 0) / 1000;
      const duration = Number(event.dDurationMs || 0) / 1000;
      return {
        start,
        end: start + duration,
        text: normalizeText(event.segs.map((seg) => seg.utf8 || "").join(""))
      };
    })
    .filter((cue) => cue.text && cue.end > cue.start);
}

function withQuery(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) parsed.searchParams.set(key, value);
  return parsed.toString();
}

function textFromRuns(value) {
  if (!value) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("");
  return "";
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function ensurePlayerControlStyles() {
  if (document.getElementById(PLAYER_PANEL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PLAYER_PANEL_STYLE_ID;
  style.textContent = `
    #${PLAYER_BUTTON_ID} {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      padding: 0;
      opacity: .9;
    }
    #${PLAYER_BUTTON_ID}:hover,
    #${PLAYER_BUTTON_ID}[aria-expanded="true"] { opacity: 1; }
    #${PLAYER_BUTTON_ID} img {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      display: block;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.28));
    }
    #${PLAYER_BUTTON_ID}[data-state="working"] img { animation: ytAiPulse 1.2s ease-in-out infinite; }
    @keyframes ytAiPulse { 50% { opacity: .52; transform: scale(.92); } }
    #${PLAYER_PANEL_ID} {
      --yt-ai-panel: rgba(28, 28, 30, .96);
      --yt-ai-line: rgba(255,255,255,.12);
      --yt-ai-muted: rgba(255,255,255,.66);
      position: absolute;
      right: 12px;
      bottom: 58px;
      z-index: 75;
      width: min(360px, calc(100% - 24px));
      border: 1px solid var(--yt-ai-line);
      border-radius: 14px;
      background: var(--yt-ai-panel);
      box-shadow: 0 18px 48px rgba(0,0,0,.48);
      color: #fff;
      font-family: "YouTube Sans", Roboto, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.35;
      overflow: hidden;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    #${PLAYER_PANEL_ID}[hidden] { display: none !important; }
    #${PLAYER_PANEL_ID} * { box-sizing: border-box; }
    .yt-ai-panel-page { padding: 8px; }
    .yt-ai-panel-row {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 10px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: inherit;
      text-align: left;
      font: inherit;
    }
    button.yt-ai-panel-row { width: 100%; cursor: pointer; }
    button.yt-ai-panel-row:hover { background: rgba(255,255,255,.1); }
    .yt-ai-panel-icon {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      display: grid;
      place-items: center;
      color: rgba(255,255,255,.94);
    }
    .yt-ai-panel-icon img { width: 26px; height: 26px; border-radius: 6px; }
    .yt-ai-panel-icon svg { width: 24px; height: 24px; fill: currentColor; }
    .yt-ai-row-label { flex: 1; min-width: 0; font-weight: 500; }
    .yt-ai-row-value { color: rgba(255,255,255,.92); max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 500; }
    .yt-ai-row-chevron { color: var(--yt-ai-muted); font-size: 24px; line-height: 1; }
    .yt-ai-action {
      min-width: 92px;
      height: 34px;
      border: 0;
      border-radius: 8px;
      padding: 0 13px;
      background: #f1f1f1;
      color: #171717;
      cursor: pointer;
      font: 600 13px/1 "YouTube Sans", Roboto, Arial, sans-serif;
      white-space: nowrap;
    }
    .yt-ai-action:hover { background: #fff; }
    .yt-ai-action:disabled { cursor: default; opacity: .72; }
    .yt-ai-switch { position: relative; width: 38px; height: 22px; flex: 0 0 38px; }
    .yt-ai-switch input { position: absolute; opacity: 0; pointer-events: none; }
    .yt-ai-switch span { position: absolute; inset: 0; border-radius: 99px; background: #717171; transition: .18s ease; }
    .yt-ai-switch span::after { content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,.35); transition: .18s ease; }
    .yt-ai-switch input:checked + span { background: #3ea6ff; }
    .yt-ai-switch input:checked + span::after { transform: translateX(16px); }
    .yt-ai-panel-status { margin: 1px 10px 6px 50px; color: var(--yt-ai-muted); font-size: 12px; min-height: 16px; }
    .yt-ai-style-head { min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 10px; font-weight: 600; }
    .yt-ai-back { width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: #fff; cursor: pointer; font-size: 27px; line-height: 1; }
    .yt-ai-back:hover { background: rgba(255,255,255,.1); }
    .yt-ai-slider-row { display: grid; grid-template-columns: 58px 1fr 48px; align-items: center; gap: 10px; min-height: 62px; padding: 6px 12px; }
    .yt-ai-slider-row input { width: 100%; accent-color: #fff; }
    .yt-ai-slider-value { text-align: right; color: rgba(255,255,255,.9); font-variant-numeric: tabular-nums; }
    .yt-ai-reset-position { width:calc(100% - 24px); min-height:36px; margin:6px 12px 10px; border:1px solid rgba(255,255,255,.16); border-radius:8px; background:rgba(255,255,255,.06); color:#fff; cursor:pointer; font:500 13px/1 "YouTube Sans",Roboto,Arial,sans-serif; }
    .yt-ai-reset-position:hover { background:rgba(255,255,255,.12); }
    @media (max-width: 640px) {
      #${PLAYER_BUTTON_ID} { width: 42px; }
      #${PLAYER_PANEL_ID} { right: 8px; bottom: 52px; width: min(340px, calc(100% - 16px)); }
    }
  `;
  document.documentElement.appendChild(style);
}

function panelIcon(path) {
  const icons = {
    translate: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="m247.15 212.42-56-112a8 8 0 0 0-14.31 0l-21.71 43.43A88 88 0 0 1 108 126.93 103.65 103.65 0 0 0 135.69 64H160a8 8 0 0 0 0-16h-56V32a8 8 0 0 0-16 0v16H32a8 8 0 0 0 0 16h87.63A87.76 87.76 0 0 1 96 116.35a87.7 87.7 0 0 1-19-31 8 8 0 1 0-15.08 5.34A103.6 103.6 0 0 0 84 127a87.55 87.55 0 0 1-52 17 8 8 0 0 0 0 16 103.46 103.46 0 0 0 64-22.08 104.2 104.2 0 0 0 51.44 21.31l-26.6 53.19a8 8 0 0 0 14.31 7.16L148.94 192h70.11l13.79 27.58A8 8 0 0 0 240 224a8 8 0 0 0 7.15-11.58M156.94 176 184 121.89 211.05 176Z"/></svg>',
    captions: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M224 48H32a16 16 0 0 0-16 16v128a16 16 0 0 0 16 16h192a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16m0 144H32V64h192zM48 136a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16H56a8 8 0 0 1-8-8m160 0a8 8 0 0 1-8 8h-96a8 8 0 0 1 0-16h96a8 8 0 0 1 8 8m-48 32a8 8 0 0 1-8 8H56a8 8 0 0 1 0-16h96a8 8 0 0 1 8 8m48 0a8 8 0 0 1-8 8h-16a8 8 0 0 1 0-16h16a8 8 0 0 1 8 8"/></svg>',
    bolt: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M175.84 111.54a8 8 0 0 0-4.56-5.7l-50-22.43L135 25.85a8 8 0 0 0-13.65-7.28L26.13 121.42a8 8 0 0 0 2.59 12.73l50 22.44L65 214.15a8 8 0 0 0 13.65 7.28l95.2-102.85a8 8 0 0 0 1.99-7.04m-88.22 76.67 8.16-34.36a8 8 0 0 0-4.5-9.15l-45.85-20.58 66.95-72.33-8.16 34.36a8 8 0 0 0 4.5 9.15l45.84 20.58Zm151.53 24.21-36-72a8 8 0 0 0-14.31 0l-36 72a8 8 0 0 0 14.31 7.16l9.79-19.58h38.11l9.79 19.58A8 8 0 0 0 232 224a8 8 0 0 0 7.15-11.58M184.94 184 196 161.89 207.05 184Z"/></svg>',
    text: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M87.24 52.59a8 8 0 0 0-14.48 0l-64 136a8 8 0 1 0 14.48 6.81L39.9 160h80.2l16.66 35.4a8 8 0 1 0 14.48-6.81ZM47.43 144 80 74.79 112.57 144ZM200 96c-12.76 0-22.73 3.47-29.63 10.32a8 8 0 0 0 11.26 11.36c3.8-3.77 10-5.68 18.37-5.68 13.23 0 24 9 24 20v3.22a42.76 42.76 0 0 0-24-7.22c-22.06 0-40 16.15-40 36s17.94 36 40 36a42.73 42.73 0 0 0 24-7.25 8 8 0 0 0 16-.75v-60c0-19.85-17.94-36-40-36m0 88c-13.23 0-24-9-24-20s10.77-20 24-20 24 9 24 20-10.77 20-24 20"/></svg>',
    settings: '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M128 80a48 48 0 1 0 48 48 48.05 48.05 0 0 0-48-48m0 80a32 32 0 1 1 32-32 32 32 0 0 1-32 32m109.94-52.79a8 8 0 0 0-3.89-5.4l-29.83-17-.12-33.62a8 8 0 0 0-2.83-6.08 111.9 111.9 0 0 0-36.72-20.67 8 8 0 0 0-6.46.59L128 41.85 97.88 25a8 8 0 0 0-6.47-.6 112.1 112.1 0 0 0-36.68 20.75 8 8 0 0 0-2.83 6.07l-.15 33.65-29.83 17a8 8 0 0 0-3.89 5.4 106.5 106.5 0 0 0 0 41.56 8 8 0 0 0 3.89 5.4l29.83 17 .12 33.62a8 8 0 0 0 2.83 6.08 111.9 111.9 0 0 0 36.72 20.67 8 8 0 0 0 6.46-.59L128 214.15 158.12 231a7.9 7.9 0 0 0 3.9 1 8.1 8.1 0 0 0 2.57-.42 112.1 112.1 0 0 0 36.68-20.73 8 8 0 0 0 2.83-6.07l.15-33.65 29.83-17a8 8 0 0 0 3.89-5.4 106.5 106.5 0 0 0-.03-41.52m-15 34.91-28.57 16.25a8 8 0 0 0-3 3c-.58 1-1.19 2.06-1.81 3.06a7.94 7.94 0 0 0-1.22 4.21l-.15 32.25a95.9 95.9 0 0 1-25.37 14.3L134 199.13a8 8 0 0 0-3.91-1h-3.83a8.1 8.1 0 0 0-4.1 1l-28.84 16.1A96 96 0 0 1 67.88 201l-.11-32.2a8 8 0 0 0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.1 8.1 0 0 0-3-3.06l-28.6-16.29a90.5 90.5 0 0 1 0-28.26l28.52-16.28a8 8 0 0 0 3-3c.58-1 1.19-2.06 1.81-3.06a7.94 7.94 0 0 0 1.22-4.21l.15-32.25a95.9 95.9 0 0 1 25.37-14.3L122 56.87a8 8 0 0 0 4.1 1h3.64a8.1 8.1 0 0 0 4.1-1l28.84-16.1A96 96 0 0 1 188.12 55l.11 32.2a8 8 0 0 0 1.22 4.22c.62 1 1.23 2 1.8 3.06a8.1 8.1 0 0 0 3 3.06l28.6 16.29a90.5 90.5 0 0 1 .05 28.29Z"/></svg>'
  };
  return icons[path] || "";
}

function createPlayerPanel() {
  let panel = document.getElementById(PLAYER_PANEL_ID);
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = PLAYER_PANEL_ID;
  panel.hidden = true;
  panel.setAttribute("aria-label", "AI 字幕设置");
  panel.innerHTML = `
    <div class="yt-ai-panel-page" data-page="main">
      <div class="yt-ai-panel-row">
        <span class="yt-ai-panel-icon"><img src="${chrome.runtime.getURL("icons/icon-32.png")}" alt=""></span>
        <span class="yt-ai-row-label">生成 AI 字幕</span>
        <button class="yt-ai-action" data-action="generate">开始翻译</button>
      </div>
      <div class="yt-ai-panel-status" data-role="status">就绪</div>
      <label class="yt-ai-panel-row">
        <span class="yt-ai-panel-icon">${panelIcon("translate")}</span>
        <span class="yt-ai-row-label">自动翻译</span>
        <span class="yt-ai-switch"><input type="checkbox" data-setting="autoTranslate"><span></span></span>
      </label>
      <label class="yt-ai-panel-row">
        <span class="yt-ai-panel-icon">${panelIcon("captions")}</span>
        <span class="yt-ai-row-label">显示原文字幕</span>
        <span class="yt-ai-switch"><input type="checkbox" data-setting="showSourceText"><span></span></span>
      </label>
      <div class="yt-ai-panel-row">
        <span class="yt-ai-panel-icon">${panelIcon("bolt")}</span>
        <span class="yt-ai-row-label">AI 引擎</span>
        <span class="yt-ai-row-value" data-role="engine">-</span>
      </div>
      <button class="yt-ai-panel-row" data-action="style">
        <span class="yt-ai-panel-icon">${panelIcon("text")}</span>
        <span class="yt-ai-row-label">字幕样式</span>
        <span class="yt-ai-row-chevron">›</span>
      </button>
      <button class="yt-ai-panel-row" data-action="settings">
        <span class="yt-ai-panel-icon">${panelIcon("settings")}</span>
        <span class="yt-ai-row-label">更多设置</span>
      </button>
    </div>
    <div class="yt-ai-panel-page" data-page="style" hidden>
      <div class="yt-ai-style-head"><button class="yt-ai-back" data-action="back" aria-label="返回">‹</button><span>字幕样式</span></div>
      <label class="yt-ai-slider-row"><span>字号</span><input type="range" min="16" max="36" step="1" data-style="fontSize"><span class="yt-ai-slider-value" data-value="fontSize">24px</span></label>
      <label class="yt-ai-slider-row"><span>位置</span><input type="range" min="2" max="92" step="1" data-style="positionPercent"><span class="yt-ai-slider-value" data-value="positionPercent">21%</span></label>
      <label class="yt-ai-slider-row"><span>透明度</span><input type="range" min="15" max="95" step="1" data-style="backgroundOpacity"><span class="yt-ai-slider-value" data-value="backgroundOpacity">25%</span></label>
      <button class="yt-ai-reset-position" data-action="reset-position" type="button">恢复默认位置</button>
    </div>
  `;
  panel.addEventListener("click", handlePanelClick);
  panel.addEventListener("change", handlePanelChange);
  panel.addEventListener("input", handlePanelStyleInput);
  return panel;
}

function ensurePlayerControl() {
  const player = document.querySelector(".html5-video-player");
  const controls = player?.querySelector(".ytp-right-controls");
  if (!player || !controls) return false;
  ensurePlayerControlStyles();

  let button = document.getElementById(PLAYER_BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.id = PLAYER_BUTTON_ID;
    button.className = "ytp-button";
    button.type = "button";
    button.title = "AI 字幕";
    button.setAttribute("aria-label", "AI 字幕");
    button.setAttribute("aria-expanded", "false");
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("icons/icon-32.png");
    icon.alt = "";
    button.appendChild(icon);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePlayerPanel();
    });
    const settingsButton = controls.querySelector(".ytp-settings-button");
    const settingsControl = settingsButton
      ? [...controls.children].find((child) => child === settingsButton || child.contains(settingsButton))
      : null;
    controls.insertBefore(button, settingsControl || controls.firstChild);
  }

  let panel = document.getElementById(PLAYER_PANEL_ID);
  if (!panel) {
    panel = createPlayerPanel();
    player.appendChild(panel);
  } else if (panel.parentElement !== player) {
    player.appendChild(panel);
  }
  return true;
}

async function togglePlayerPanel() {
  if (!ensurePlayerControl()) return;
  const panel = document.getElementById(PLAYER_PANEL_ID);
  const button = document.getElementById(PLAYER_BUTTON_ID);
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  button?.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    showPanelPage("main");
    await refreshPlayerPanel();
  }
}

function showPanelPage(pageName) {
  const panel = document.getElementById(PLAYER_PANEL_ID);
  if (!panel) return;
  for (const page of panel.querySelectorAll("[data-page]")) page.hidden = page.dataset.page !== pageName;
}

async function refreshPlayerPanel() {
  const panel = document.getElementById(PLAYER_PANEL_ID);
  if (!panel) return;
  const { settings = {}, sessionToken, pendingJobs = [] } = await chrome.storage.local.get(["settings", "sessionToken", "pendingJobs"]);
  const style = { ...DEFAULT_SUBTITLE_STYLE, ...(settings.subtitleStyle || {}) };
  panel.querySelector('[data-setting="autoTranslate"]').checked = settings.autoTranslate === true;
  panel.querySelector('[data-setting="showSourceText"]').checked = style.showSourceText !== false;
  panel.querySelector('[data-role="engine"]').textContent = engineDisplayName(settings.aiProvider, settings.aiModel);
  syncPanelStyleControls(style);

  const videoId = getVideoId();
  panelVideoId = videoId;
  if (!videoId) {
    setPanelState("idle", "请先打开 YouTube 视频");
    return;
  }
  if (!sessionToken) {
    setPanelState("login", "请先在更多设置中登录");
    return;
  }
  const entitlement = await chrome.runtime.sendMessage({ type: "GET_ENTITLEMENTS" }).catch(() => null);
  if (!entitlement?.ok) {
    setPanelState("login", "登录已失效，请重新登录");
    return;
  }
  const preparation = await prepareAiSubtitles().catch(() => null);
  if (panelVideoId !== getVideoId()) return;
  if (preparation?.payload?.usesNativeTargetTrack) {
    const rendered = await renderSubtitles(preparation.payload.rawCues, videoId, { nativeTrack: true });
    setPanelState("native", rendered.loaded
      ? nativeTrackMessage(preparation.payload.sourceLang)
      : "已找到目标语言原生字幕，但播放器尚未就绪");
    return;
  }
  const pendingJob = pendingJobs.find((job) => job.videoId === videoId);
  if (pendingJob) {
    setPanelState("working", "翻译任务进行中");
    startPanelJobPolling(pendingJob.jobId, videoId);
    return;
  }
  const loaded = await tryLoadSubtitle().catch(() => null);
  if (panelVideoId !== getVideoId()) return;
  if (preparation?.payload && isSameTranslationLanguage(preparation.payload.sourceLang, preparation.payload.targetLang)) {
    setPanelState("same-language", sameLanguageMessage(preparation.payload.sourceLang, preparation.payload.targetLang));
    return;
  }
  setPanelState(loaded?.loaded ? "ready" : "idle", loaded?.loaded ? "AI 字幕已加载" : "就绪");
}

function engineDisplayName(provider, model) {
  const normalized = String(provider || "").toLowerCase();
  const names = { deepseek: "DeepSeek", openai: "OpenAI", anthropic: "Claude", google: "Gemini", moonshot: "Kimi", xiaomi: "MiMo" };
  if (names[normalized]) return names[normalized];
  if (provider) return String(provider);
  if (model) return String(model).split("/").pop();
  return "未设置";
}

function setPanelState(state, message) {
  const panel = document.getElementById(PLAYER_PANEL_ID);
  const button = document.getElementById(PLAYER_BUTTON_ID);
  if (!panel) return;
  const action = panel.querySelector('[data-action="generate"]');
  const status = panel.querySelector('[data-role="status"]');
  const labels = { idle: "开始翻译", working: "翻译中", ready: "重新翻译", native: "原生字幕", login: "去登录", error: "重试", "same-language": "无需翻译" };
  action.textContent = labels[state] || labels.idle;
  action.disabled = state === "working" || state === "native" || state === "same-language";
  action.dataset.state = state;
  status.textContent = message || "";
  button?.setAttribute("data-state", state === "working" ? "working" : "idle");
}

async function handlePanelClick(event) {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  event.stopPropagation();
  if (action === "generate") {
    if (event.target.dataset.state === "login") {
      openExtensionOptions();
      return;
    }
    await startTranslationFromPlayer(event.target.dataset.state === "ready");
  } else if (action === "style") {
    showPanelPage("style");
  } else if (action === "back") {
    showPanelPage("main");
  } else if (action === "settings") {
    openExtensionOptions();
  } else if (action === "reset-position") {
    await resetSubtitlePosition();
  }
}

function openExtensionOptions() {
  chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch(() => {});
}

async function handlePanelChange(event) {
  const setting = event.target.dataset.setting;
  if (!setting) return;
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  if (setting === "autoTranslate") {
    await chrome.storage.local.set({ settings: { ...settings, autoTranslate: event.target.checked } });
    cancelAutoAiDelay();
    autoTranslationRun += 1;
    autoTranslationVideoId = "";
    if (event.target.checked) maybeAutoTranslateCurrentVideo();
    return;
  }
  if (setting === "showSourceText") {
    const style = { ...DEFAULT_SUBTITLE_STYLE, ...(settings.subtitleStyle || {}), showSourceText: event.target.checked };
    await chrome.storage.local.set({ settings: { ...settings, subtitleStyle: style } });
    applySubtitleStyle(style);
  }
}

function handlePanelStyleInput(event) {
  const key = event.target.dataset.style;
  if (!key) return;
  savePanelSubtitleStyle().catch(() => {});
}

async function savePanelSubtitleStyle() {
  const panel = document.getElementById(PLAYER_PANEL_ID);
  if (!panel) return;
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const style = {
    ...DEFAULT_SUBTITLE_STYLE,
    ...(settings.subtitleStyle || {}),
    fontSize: Number(panel.querySelector('[data-style="fontSize"]').value),
    positionPercent: Number(panel.querySelector('[data-style="positionPercent"]').value),
    backgroundOpacity: Number(panel.querySelector('[data-style="backgroundOpacity"]').value)
  };
  await chrome.storage.local.set({ settings: { ...settings, subtitleStyle: style } });
  applySubtitleStyle(style);
  syncPanelStyleControls(style);
}

function syncPanelStyleControls(style) {
  const panel = document.getElementById(PLAYER_PANEL_ID);
  if (!panel) return;
  const suffixes = { fontSize: "px", positionPercent: "%", backgroundOpacity: "%" };
  for (const key of Object.keys(suffixes)) {
    const input = panel.querySelector(`[data-style="${key}"]`);
    const value = panel.querySelector(`[data-value="${key}"]`);
    if (input) input.value = style[key];
    if (value) value.textContent = `${style[key]}${suffixes[key]}`;
  }
}

async function startTranslationFromPlayer(forceRegenerate = false, automatic = false, preparedPayload = null) {
  const videoId = getVideoId();
  if (!videoId || panelActionInProgress) return;
  if (!automatic) cancelAutoAiDelay();
  panelActionInProgress = true;
  setPanelState("working", automatic ? "已开启自动翻译，正在检查字幕…" : "正在提取视频字幕…");
  try {
    const entitlement = await chrome.runtime.sendMessage({ type: "GET_ENTITLEMENTS" });
    if (!entitlement?.ok) throw new Error(entitlement?.error || "请先登录");
    const preparation = preparedPayload
      ? { payload: preparedPayload }
      : await prepareAiSubtitles();
    if (preparation.payload.usesNativeTargetTrack) {
      const rendered = await renderSubtitles(preparation.payload.rawCues, videoId, { nativeTrack: true });
      setPanelState("native", rendered.loaded
        ? nativeTrackMessage(preparation.payload.sourceLang)
        : "已找到目标语言原生字幕，但播放器尚未就绪");
      return;
    }
    const { pendingJobs = [] } = await chrome.storage.local.get(["pendingJobs"]);
    const pending = pendingJobs.find((job) => job.videoId === videoId);
    if (pending) {
      startPanelJobPolling(pending.jobId, videoId);
      return;
    }
    if (isSameTranslationLanguage(preparation.payload.sourceLang, preparation.payload.targetLang)) {
      setPanelState("same-language", sameLanguageMessage(preparation.payload.sourceLang, preparation.payload.targetLang));
      return;
    }
    if (!forceRegenerate) {
      const existing = await tryLoadSubtitle().catch(() => null);
      if (existing?.loaded) {
        setPanelState("ready", "已加载现有 AI 字幕");
        return;
      }
    }
    const previewCues = machinePreviewVideoId === videoId ? machinePreviewCues : [];
    const result = await generateAiSubtitles(forceRegenerate, preparation.payload, previewCues);
    if (!result?.ok) throw new Error(result?.error || "创建翻译任务失败");
    if (result.nativeTrack) {
      setPanelState("native", nativeTrackMessage(result.sourceLang));
      return;
    }
    setPanelState("working", "翻译任务已开始");
    startPanelJobPolling(result.jobId, videoId);
  } catch (error) {
    const message = error?.message || String(error);
    const needsLogin = /sign in|login|session|401|登录/i.test(message);
    setPanelState(needsLogin ? "login" : "error", message);
  } finally {
    panelActionInProgress = false;
  }
}

function startPanelJobPolling(jobId, videoId) {
  stopPanelJobPolling();
  const poll = async () => {
    if (getVideoId() !== videoId) {
      stopPanelJobPolling();
      return;
    }
    const result = await chrome.runtime.sendMessage({ type: "GET_JOB_STATUS", jobId }).catch(() => null);
    const job = result?.job;
    if (!result?.ok || !job) return;
    if (job.status === "completed") {
      stopPanelJobPolling();
      await chrome.runtime.sendMessage({ type: "CHECK_SUBTITLE_JOBS" }).catch(() => {});
      const loaded = await tryLoadSubtitle().catch(() => null);
      setPanelState("ready", loaded?.loaded ? "AI 字幕已生成并加载" : "AI 字幕已生成");
    } else if (job.status === "failed" || job.status === "cancelled") {
      stopPanelJobPolling();
      setPanelState("error", job.error || "翻译失败，请重试");
    } else {
      setPanelState("working", `翻译中 · ${Number(job.progress || 0)}%`);
    }
  };
  panelJobPollTimer = setInterval(poll, 2500);
  poll();
}

function stopPanelJobPolling() {
  if (panelJobPollTimer) clearInterval(panelJobPollTimer);
  panelJobPollTimer = null;
}

function cancelAutoAiDelay() {
  if (autoAiDelayTimer) clearTimeout(autoAiDelayTimer);
  autoAiDelayTimer = null;
  if (autoAiDelayVideo && autoAiPlayingHandler) {
    autoAiDelayVideo.removeEventListener("playing", autoAiPlayingHandler);
  }
  if (autoAiDelayVideo && autoAiPauseHandler) {
    autoAiDelayVideo.removeEventListener("pause", autoAiPauseHandler);
    autoAiDelayVideo.removeEventListener("waiting", autoAiPauseHandler);
    autoAiDelayVideo.removeEventListener("ended", autoAiPauseHandler);
  }
  autoAiDelayVideo = null;
  autoAiPlayingHandler = null;
  autoAiPauseHandler = null;
}

async function startMachinePreview(preparedPayload, videoId, runId) {
  const result = await chrome.runtime.sendMessage({
    type: "TRANSLATE_MACHINE_PREVIEW",
    payload: preparedPayload
  }).catch(() => null);
  if (runId !== autoTranslationRun || getVideoId() !== videoId || !result?.ok || !Array.isArray(result.cues)) return;
  machinePreviewVideoId = videoId;
  machinePreviewCues = result.cues;
  if (loadedPartialChunkCount === 0) {
    await renderSubtitles([], videoId, {
      machineCues: machinePreviewCues,
      sourceCues: preparedPayload.rawCues
    });
  }
}

function scheduleAiAfterPlayback(video, preparedPayload, videoId, runId) {
  cancelAutoAiDelay();
  autoAiDelayVideo = video;
  let machineStarted = false;

  autoAiPlayingHandler = () => {
    if (runId !== autoTranslationRun || getVideoId() !== videoId) return;
    if (!machineStarted) {
      machineStarted = true;
      startMachinePreview(preparedPayload, videoId, runId).catch(() => {});
    }
    if (autoAiDelayTimer) clearTimeout(autoAiDelayTimer);
    setPanelState("idle", "谷歌翻译已启用 · 播放 5 秒后启用 AI");
    autoAiDelayTimer = setTimeout(() => {
      autoAiDelayTimer = null;
      if (runId !== autoTranslationRun || getVideoId() !== videoId || video.paused || video.ended) return;
      cancelAutoAiDelay();
      startTranslationFromPlayer(false, true, preparedPayload).catch(() => {});
    }, AUTO_AI_PLAY_DELAY_MS);
  };

  autoAiPauseHandler = () => {
    if (autoAiDelayTimer) clearTimeout(autoAiDelayTimer);
    autoAiDelayTimer = null;
    if (runId === autoTranslationRun && getVideoId() === videoId) {
      setPanelState("idle", machineStarted
        ? "谷歌翻译已启用 · 继续播放 5 秒后启用 AI"
        : "播放后将启用谷歌翻译");
    }
  };

  video.addEventListener("playing", autoAiPlayingHandler);
  video.addEventListener("pause", autoAiPauseHandler);
  video.addEventListener("waiting", autoAiPauseHandler);
  video.addEventListener("ended", autoAiPauseHandler);
  if (!video.paused && !video.ended) autoAiPlayingHandler();
  else autoAiPauseHandler();
}

async function maybeAutoTranslateCurrentVideo() {
  const videoId = getVideoId();
  if (!videoId || autoTranslationVideoId === videoId) return;
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  if (settings.autoTranslate !== true) return;
  cancelAutoAiDelay();
  const runId = ++autoTranslationRun;
  autoTranslationVideoId = videoId;
  machinePreviewVideoId = "";
  machinePreviewCues = [];

  const preparation = await prepareAiSubtitles().catch((error) => {
    setPanelState("error", error?.message || String(error));
    return null;
  });
  if (!preparation?.payload || runId !== autoTranslationRun || getVideoId() !== videoId) return;
  if (preparation.payload.usesNativeTargetTrack) {
    const rendered = await renderSubtitles(preparation.payload.rawCues, videoId, { nativeTrack: true });
    setPanelState("native", rendered.loaded
      ? nativeTrackMessage(preparation.payload.sourceLang)
      : "已找到目标语言原生字幕，但播放器尚未就绪");
    return;
  }
  const { pendingJobs = [] } = await chrome.storage.local.get(["pendingJobs"]);
  if (runId !== autoTranslationRun || getVideoId() !== videoId) return;
  const pending = pendingJobs.find((job) => job.videoId === videoId);
  if (pending) {
    startPartialSubtitlePolling(pending.jobId, videoId);
    startPanelJobPolling(pending.jobId, videoId);
    return;
  }
  const existing = await tryLoadSubtitle().catch(() => null);
  if (runId !== autoTranslationRun || getVideoId() !== videoId) return;
  if (existing?.loaded) {
    setPanelState("ready", "已加载现有 AI 字幕");
    return;
  }
  if (isSameTranslationLanguage(preparation.payload.sourceLang, preparation.payload.targetLang)) {
    setPanelState("same-language", sameLanguageMessage(preparation.payload.sourceLang, preparation.payload.targetLang));
    return;
  }
  const video = await waitForVideoElement();
  if (!video || runId !== autoTranslationRun || getVideoId() !== videoId) return;
  scheduleAiAfterPlayback(video, preparation.payload, videoId, runId);
}

function handlePlayerPageChange() {
  const videoId = getVideoId();
  if (panelVideoId && panelVideoId !== videoId) {
    stopPanelJobPolling();
    cancelAutoAiDelay();
    autoTranslationRun += 1;
    machinePreviewVideoId = "";
    machinePreviewCues = [];
    panelActionInProgress = false;
  }
  try {
    ensurePlayerControl();
  } catch (error) {
    console.warn("[YouTube AI Subtitle] Could not attach player control:", error);
  }
  if (videoId) {
    refreshPlayerPanel().catch(() => {});
    maybeAutoTranslateCurrentVideo().catch(() => {});
  }
}

document.addEventListener("click", (event) => {
  const panel = document.getElementById(PLAYER_PANEL_ID);
  const button = document.getElementById(PLAYER_BUTTON_ID);
  if (!panel || panel.hidden || panel.contains(event.target) || button?.contains(event.target)) return;
  panel.hidden = true;
  button?.setAttribute("aria-expanded", "false");
});

let lastUrl = "";
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    tryLoadSubtitle().catch(() => {});
    resumePendingPartialPolling().catch(() => {});
    handlePlayerPageChange();
  } else {
    try {
      ensurePlayerControl();
    } catch (error) {
      console.warn("[YouTube AI Subtitle] Could not attach player control:", error);
    }
  }
}, 250);

tryLoadSubtitle().catch(() => {});
resumePendingPartialPolling().catch(() => {});
handlePlayerPageChange();
