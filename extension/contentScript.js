const OVERLAY_ID = "yt-ai-subtitle-overlay";
const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";
const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 24,
  backgroundOpacity: 25,
  fontWeight: "normal",
  positionPercent: 21
};
let renderGeneration = 0;

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
    "text-align:left",
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
    const cues = Array.isArray(message.cues) ? message.cues : [];
    if (!cues.length) {
      sendResponse({ ok: true, loaded: false, cueCount: 0 });
      return true;
    }
    renderSubtitles(cues, message.videoId || getVideoId()).then(
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

  const preparation = preparedPayload
    ? { payload: preparedPayload, summary: summarizePreparedPayload(preparedPayload) }
    : await prepareAiSubtitles();
  const prepared = preparation.payload;
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

let lastUrl = "";
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    tryLoadSubtitle();
  }
}, 250);

tryLoadSubtitle();
