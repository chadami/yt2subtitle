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
  const data = await chrome.runtime.sendMessage({
    type: "GET_SUBTITLE_BY_VIDEO",
    videoId,
    sourceLang: "en",
    targetLang
  });
  if (data.status === "completed" && Array.isArray(data.cues)) {
    renderSubtitles(data.cues);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GENERATE_AI_SUBTITLES") return;
  generateAiSubtitles().then(
    (result) => sendResponse(result),
    (error) => sendResponse({ ok: false, error: error.message || String(error) })
  );
  return true;
});

async function generateAiSubtitles() {
  const videoId = getVideoId();
  if (!videoId) throw new Error("No YouTube video detected.");

  const { settings = {}, clientId, sessionToken, pendingJobs = [] } = await chrome.storage.local.get([
    "settings",
    "clientId",
    "sessionToken",
    "pendingJobs"
  ]);
  if (!settings.apiBase) throw new Error("Backend API URL is not configured.");

  const video = await collectVideoPayload(videoId);
  const track = selectCaptionTrack(video.captionTracks, settings.sourceLang || "en");
  const rawCues = await fetchCaptionCues(track);
  if (!rawCues.length) throw new Error("Caption track exists, but no usable cues were downloaded.");

  const data = await chrome.runtime.sendMessage({
    type: "CREATE_SUBTITLE_JOB",
    payload: {
      clientId,
      sessionToken,
      pendingJobs,
      videoId,
      video: video.video,
      sourceLang: track.languageCode || settings.sourceLang || "en",
      targetLang: settings.targetLang || "zh-Hans",
      captionType: track.isAuto ? "auto" : "manual",
      rawCues
    }
  });
  if (!data?.ok) throw new Error(data?.error || "Failed to create subtitle job.");
  return {
    ok: true,
    jobId: data.jobId,
    status: data.status,
    rawCueCount: rawCues.length,
    captionType: track.isAuto ? "auto" : "manual",
    sourceLang: track.languageCode
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
  const preferred = candidates.filter((track) => track.languageCode === preferredLanguage);
  const preferredManual = preferred.filter((track) => !track.isAuto);
  return preferredManual[0] || preferred[0] || manual[0] || candidates[0] || null;
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
}, 1000);

tryLoadSubtitle();
