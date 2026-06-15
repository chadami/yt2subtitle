const OVERLAY_ID = "yt-ai-subtitle-overlay";
const QUICK_QUEUE_CLASS = "yt-ai-subtitle-quick-queue";
const QUICK_QUEUE_PROCESSED_ATTR = "data-ai-subtitle-queue-ready";
const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";
const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 24,
  backgroundOpacity: 25,
  fontWeight: "normal",
  positionPercent: 21
};
let renderGeneration = 0;

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
    "bottom:21%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:min(96vw,1960px)",
    "padding:8px 16px 9px",
    "border-radius:8px",
    "background:rgba(18,28,25,.82)",
    "border:1px solid rgba(211,232,222,.32)",
    "box-shadow:0 12px 34px rgba(0,0,0,.34)",
    "color:#f6fff9",
    "font-family:Arial,'Microsoft YaHei',sans-serif",
    "line-height:1.42",
    "letter-spacing:0",
    "text-align:center",
    "text-shadow:0 2px 8px rgba(0,0,0,.5)",
    "pointer-events:none",
    "display:none",
    "backdrop-filter:blur(6px)",
    "-webkit-backdrop-filter:blur(6px)"
  ].join(";");
  document.body.appendChild(overlay);
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
  const fontSize = clampNumber(Number(nextStyle.fontSize), 16, 36);
  const opacity = clampNumber(Number(nextStyle.backgroundOpacity), 15, 95) / 100;
  const position = clampNumber(Number(nextStyle.positionPercent), 2, 42);
  overlay.style.fontSize = `${fontSize}px`;
  overlay.style.fontWeight = "500";
  overlay.style.background = `rgba(18,28,25,${opacity})`;
  overlay.style.bottom = `${position}%`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clearOverlay() {
  renderGeneration += 1;
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.textContent = "";
    overlay.style.display = "none";
  }
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

async function renderSubtitles(cues, videoId) {
  const video = await waitForVideoElement();
  if (!video) {
    clearOverlay();
    return { loaded: false, reason: "video-not-ready", cueCount: cues.length };
  }
  const overlay = ensureOverlay();
  const generation = ++renderGeneration;

  function tick() {
    if (generation !== renderGeneration || getVideoId() !== videoId) return;
    const current = video.currentTime;
    const cue = cues.find((item) => current >= item.start && current <= item.end);
    overlay.textContent = cue?.text || "";
    overlay.style.display = cue ? "block" : "none";
    requestAnimationFrame(tick);
  }
  tick();
  return { loaded: true, cueCount: cues.length };
}

async function tryLoadSubtitle() {
  const videoId = getVideoId();
  if (!videoId) {
    clearOverlay();
    return { loaded: false, reason: "no-video-id" };
  }
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  const targetLang = settings.targetLang || "zh-Hans";
  const data = await chrome.runtime.sendMessage({
    type: "GET_SUBTITLE_BY_VIDEO",
    videoId,
    targetLang,
    translationMode: settings.translationMode || "user",
    sessionToken
  });
  if (data.status === "completed" && Array.isArray(data.cues) && data.cues.length) {
    return renderSubtitles(data.cues, videoId);
  } else {
    clearOverlay();
    return { loaded: false, reason: data.status || "missing", cueCount: 0 };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
  return prepareAiSubtitlesForVideo(videoId);
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
    apiBase: (settings.apiBase || DEFAULT_API_BASE).replace(/\/$/, "")
  };

  const video = await collectVideoPayload(videoId);
  const track = selectCaptionTrack(video.captionTracks, effectiveSettings.sourceLang || "en");
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
      targetLang: effectiveSettings.targetLang || "zh-Hans",
      translationMode: effectiveSettings.translationMode || "user",
      captionType: track.isAuto ? "auto" : "manual",
      rawCues
    },
    summary: {
      rawCueCount: rawCues.length,
      characterCount,
      totalSeconds,
      captionType: track.isAuto ? "auto" : "manual",
      sourceLang: track.languageCode || effectiveSettings.sourceLang || "en",
      targetLang: effectiveSettings.targetLang || "zh-Hans",
      translationMode: effectiveSettings.translationMode || "user"
    }
  };
}

async function generateAiSubtitles(forceRegenerate = false, preparedPayload = null) {
  const videoId = getVideoId();
  if (!videoId) throw new Error("No YouTube video detected.");
  clearOverlay();
  return generateAiSubtitlesForVideo(videoId, forceRegenerate, preparedPayload);
}

async function generateAiSubtitlesForVideo(videoId, forceRegenerate = false, preparedPayload = null) {
  const prepared = preparedPayload || (await prepareAiSubtitlesForVideo(videoId)).payload;
  const data = await chrome.runtime.sendMessage({
    type: "CREATE_SUBTITLE_JOB",
    payload: {
      ...prepared,
      forceRegenerate,
    }
  });
  if (!data?.ok) throw new Error(data?.error || "Failed to create subtitle job.");
  return {
    ok: true,
    jobId: data.jobId,
    status: data.status,
    rawCueCount: prepared.rawCues.length,
    captionType: prepared.captionType,
    sourceLang: prepared.sourceLang
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

function isLanguageMatch(languageCode, preferredLanguage) {
  const language = (languageCode || "").toLowerCase();
  const preferred = (preferredLanguage || "").toLowerCase();
  if (!language || !preferred) return false;
  return language === preferred || language.startsWith(`${preferred}-`) || preferred.startsWith(`${language}-`);
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

function installQuickQueueStyles() {
  if (document.getElementById("yt-ai-subtitle-quick-queue-style")) return;
  const style = document.createElement("style");
  style.id = "yt-ai-subtitle-quick-queue-style";
  style.textContent = `
    .${QUICK_QUEUE_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      position: absolute;
      right: 8px;
      bottom: 8px;
      z-index: 20;
      border: .5px solid rgba(15, 23, 42, .10);
      border-radius: 999px;
      background: rgba(255, 255, 255, .94);
      color: #0f172a;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .08);
      transition: background .16s ease, border-color .16s ease, color .16s ease, opacity .16s ease, transform .16s ease;
    }
    ytd-rich-item-renderer[${QUICK_QUEUE_PROCESSED_ATTR}],
    ytd-video-renderer[${QUICK_QUEUE_PROCESSED_ATTR}],
    ytd-grid-video-renderer[${QUICK_QUEUE_PROCESSED_ATTR}] {
      position: relative;
    }
    ytd-rich-item-renderer[${QUICK_QUEUE_PROCESSED_ATTR}]:hover > .${QUICK_QUEUE_CLASS},
    ytd-video-renderer[${QUICK_QUEUE_PROCESSED_ATTR}]:hover > .${QUICK_QUEUE_CLASS},
    ytd-grid-video-renderer[${QUICK_QUEUE_PROCESSED_ATTR}]:hover > .${QUICK_QUEUE_CLASS},
    .${QUICK_QUEUE_CLASS}:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }
    .${QUICK_QUEUE_CLASS}:hover {
      background: rgba(243, 244, 246, .96);
      border-color: rgba(15, 23, 42, .16);
      color: #111827;
      transform: translateY(-1px);
    }
    .${QUICK_QUEUE_CLASS}:disabled {
      cursor: default;
      opacity: .78;
      transform: none;
    }
    .${QUICK_QUEUE_CLASS}[data-state="loading"] {
      background: rgba(243, 244, 246, .96);
      border-color: rgba(15, 23, 42, .16);
      pointer-events: none;
    }
    .${QUICK_QUEUE_CLASS}[data-state="queued"] {
      background: rgba(243, 244, 246, .96);
      border-color: rgba(34, 197, 94, .42);
      color: #111827;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, .16), 0 1px 2px rgba(15, 23, 42, .08);
    }
    .${QUICK_QUEUE_CLASS}[data-state="error"] {
      background: #fee2e2;
      border-color: #fecaca;
      color: #991b1b;
    }
    .${QUICK_QUEUE_CLASS} svg {
      width: 22px;
      height: 22px;
      display: block;
      filter: drop-shadow(0 0 2px rgba(255,255,255,.34));
    }
    .${QUICK_QUEUE_CLASS} .yt-ai-subtitle-mark-stroke {
      fill: none;
      stroke: #e0e0e0;
      stroke-width: 16;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .${QUICK_QUEUE_CLASS}[data-state="loading"] .yt-ai-subtitle-mark-s1 {
      stroke-dasharray: 30;
      animation: ytAiSubtitleDrawS1 2.4s ease-out infinite;
    }
    .${QUICK_QUEUE_CLASS}[data-state="loading"] .yt-ai-subtitle-mark-s2 {
      stroke-dasharray: 144;
      animation: ytAiSubtitleDrawS2 2.4s ease-out infinite;
    }
    .${QUICK_QUEUE_CLASS}[data-state="loading"] .yt-ai-subtitle-mark-s3 {
      stroke-dasharray: 222;
      animation: ytAiSubtitleDrawS3 2.4s ease-out infinite;
    }
    .${QUICK_QUEUE_CLASS}[data-state="loading"] .yt-ai-subtitle-mark-s4 {
      stroke-dasharray: 122;
      animation: ytAiSubtitleDrawS4 2.4s ease-out infinite;
    }
    @keyframes ytAiSubtitleDrawS1 {
      0%, 5% { stroke-dashoffset: 30; }
      12%, 100% { stroke-dashoffset: 0; }
    }
    @keyframes ytAiSubtitleDrawS2 {
      0%, 12% { stroke-dashoffset: 144; }
      28%, 100% { stroke-dashoffset: 0; }
    }
    @keyframes ytAiSubtitleDrawS3 {
      0%, 28% { stroke-dashoffset: 222; }
      56%, 100% { stroke-dashoffset: 0; }
    }
    @keyframes ytAiSubtitleDrawS4 {
      0%, 56% { stroke-dashoffset: 122; }
      76%, 100% { stroke-dashoffset: 0; }
    }
    ytd-video-renderer .${QUICK_QUEUE_CLASS} {
      right: 12px;
      bottom: 12px;
    }
  `;
  document.documentElement.appendChild(style);
}

function scanVideoCardsForQuickQueue() {
  installQuickQueueStyles();
  const cards = document.querySelectorAll([
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer"
  ].join(","));

  for (const card of cards) {
    const videoId = getVideoIdFromCard(card);
    if (!videoId) continue;
    const existingButton = card.querySelector(`.${QUICK_QUEUE_CLASS}`);
    if (existingButton) {
      if (existingButton.dataset.videoId !== videoId) {
        existingButton.replaceWith(createQuickQueueButton(videoId));
      }
      card.setAttribute(QUICK_QUEUE_PROCESSED_ATTR, "true");
      continue;
    }
    if (card.getAttribute(QUICK_QUEUE_PROCESSED_ATTR) === "true") continue;
    card.setAttribute(QUICK_QUEUE_PROCESSED_ATTR, "true");
    card.appendChild(createQuickQueueButton(videoId));
  }
}

function getVideoIdFromCard(card) {
  const link = card.querySelector([
    "a#thumbnail[href*='/watch']",
    "a#video-title[href*='/watch']",
    "a.yt-lockup-view-model-wiz__content-image[href*='/watch']",
    "a[href*='/watch?v=']"
  ].join(","));
  if (!link) return "";
  try {
    const url = new URL(link.getAttribute("href"), location.origin);
    return url.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function createQuickQueueButton(videoId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = QUICK_QUEUE_CLASS;
  button.dataset.videoId = videoId;
  button.dataset.state = "idle";
  button.title = "Add to AI subtitle queue";
  button.setAttribute("aria-label", "Add to AI subtitle queue");
  setQuickQueueIcon(button, "idle");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await queueVideoFromCard(videoId, button);
  });
  return button;
}

async function queueVideoFromCard(videoId, button) {
  try {
    const { pendingJobs = [] } = await chrome.storage.local.get(["pendingJobs"]);
    if (pendingJobs.some((job) => job.videoId === videoId)) {
      setQuickQueueState(button, "queued", "Already in AI subtitle queue");
      return;
    }
    setQuickQueueState(button, "loading", "Adding to AI subtitle queue");
    const prepared = await prepareAiSubtitlesForVideo(videoId);
    const result = await generateAiSubtitlesForVideo(videoId, false, prepared.payload);
    if (!result?.ok) throw new Error(result?.error || "Failed to create subtitle job.");
    setQuickQueueState(button, "queued", "Added to AI subtitle queue");
  } catch (error) {
    setQuickQueueState(button, "error", error?.message || String(error));
    setTimeout(() => setQuickQueueState(button, "idle", "Add to AI subtitle queue"), 3500);
  }
}

function setQuickQueueState(button, state, label) {
  button.dataset.state = state;
  button.disabled = state === "loading" || state === "queued";
  button.title = label;
  button.setAttribute("aria-label", label);
  setQuickQueueIcon(button, state);
}

function setQuickQueueIcon(button, state) {
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" aria-hidden="true">
      <circle cx="128" cy="128" r="128" fill="#C20C0D"/>
      <path class="yt-ai-subtitle-mark-stroke yt-ai-subtitle-mark-s1" d="M122 64 L127 77"/>
      <path class="yt-ai-subtitle-mark-stroke yt-ai-subtitle-mark-s2" d="M64 96 L192 96"/>
      <path class="yt-ai-subtitle-mark-stroke yt-ai-subtitle-mark-s3" d="M160 96 C160 149 117 192 64 192"/>
      <path class="yt-ai-subtitle-mark-stroke yt-ai-subtitle-mark-s4" d="M101.47 128 C115 166 151 192 192 192"/>
    </svg>
  `;
}

function observeQuickQueueTargets() {
  scanVideoCardsForQuickQueue();
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanVideoCardsForQuickQueue();
    }, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

let lastUrl = "";
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    tryLoadSubtitle();
    scanVideoCardsForQuickQueue();
  }
}, 250);

tryLoadSubtitle();
observeQuickQueueTargets();
