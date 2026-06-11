const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";
const SUBTITLE_CACHE_LIMIT = 8;

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "check-subtitle-jobs") return;
  await checkSubtitleJobs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CHECK_SUBTITLE_JOBS") {
    checkSubtitleJobs().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "CREATE_SUBTITLE_JOB") {
    createSubtitleJob(message.payload).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "GET_SUBTITLE_BY_VIDEO") {
    getSubtitleByVideo(message).then(
      (result) => sendResponse(result),
      () => sendResponse({ status: "missing" })
    );
    return true;
  }
  if (message?.type === "GET_JOB_STATUS") {
    getJobStatus(message.jobId).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  return false;
});

async function createSubtitleJob(payload) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const translationMode = payload.translationMode || "user";
  const response = await safeFetch(`${apiBase}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(payload.sessionToken ? { Authorization: `Bearer ${payload.sessionToken}` } : {})
    },
    body: JSON.stringify({
      clientId: payload.clientId,
      video: payload.video,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      translationMode,
      forceRegenerate: payload.forceRegenerate === true,
      captionType: payload.captionType,
      rawCues: payload.rawCues
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Job request failed: ${response.status}`);
  if (payload.forceRegenerate === true) {
    await removeCachedSubtitle(subtitleCacheKey(
      payload.videoId,
      payload.sourceLang || "en",
      payload.targetLang || "zh-Hans",
      translationMode
    ));
  }

  const nextPendingJobs = [
    ...(payload.pendingJobs || []).filter((job) => job.jobId !== data.jobId),
    {
      jobId: data.jobId,
      videoId: payload.videoId,
      title: payload.video.title,
      url: payload.video.url,
      sourceLang: payload.sourceLang || "en",
      targetLang: payload.targetLang || "zh-Hans",
      translationMode,
      createdAt: Date.now()
    }
  ];
  await chrome.storage.local.set({ pendingJobs: nextPendingJobs });
  await checkSubtitleJobs();
  return { ok: true, ...data };
}

async function getSubtitleByVideo(message) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const translationMode = message.translationMode || settings.translationMode || "user";
  const cacheKey = subtitleCacheKey(
    message.videoId,
    message.sourceLang || "en",
    message.targetLang || "zh-Hans",
    translationMode
  );
  const cached = await getCachedSubtitle(cacheKey);
  if (cached) return cached;

  const url = `${apiBase}/api/subtitles/by-video/${message.videoId}?sourceLang=${encodeURIComponent(message.sourceLang || "en")}&targetLang=${encodeURIComponent(message.targetLang || "zh-Hans")}&translationMode=${encodeURIComponent(translationMode)}`;
  const response = await safeFetch(url, {
    headers: translationMode === "user" && message.sessionToken
      ? { Authorization: `Bearer ${message.sessionToken}` }
      : {}
  });
  if (!response.ok) return { status: "missing" };
  const data = await response.json();
  if (data.status === "completed" && Array.isArray(data.cues)) {
    setCachedSubtitle(cacheKey, data).catch(() => {});
  }
  return data;
}

async function getJobStatus(jobId) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await safeFetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Job status failed: ${response.status}`);
  return { ok: true, job: data };
}

async function checkSubtitleJobs() {
  const { pendingJobs = [], settings = {}, sessionToken } = await chrome.storage.local.get([
    "pendingJobs",
    "settings",
    "sessionToken"
  ]);
  if (!pendingJobs.length) return;
  const apiBase = normalizeApiBase(settings.apiBase);

  const stillPending = [];
  for (const job of pendingJobs) {
    try {
      const response = await safeFetch(`${apiBase}/api/jobs/${job.jobId}`);
      const status = await response.json();
      if (status.status === "completed") {
        await cacheCompletedSubtitle(job, settings, sessionToken).catch(() => {});
        await notifySubtitleReady(job).catch(() => {});
      } else if (status.status === "failed") {
        await notifySubtitleFailed(job, status.error).catch(() => {});
      } else if (status.status !== "cancelled") {
        stillPending.push(job);
      }
    } catch {
      stillPending.push(job);
    }
  }
  await chrome.storage.local.set({ pendingJobs: stillPending });
  if (stillPending.length) ensureJobAlarm();
}

async function cacheCompletedSubtitle(job, settings, sessionToken) {
  if (!job.videoId) return;
  await getSubtitleByVideo({
    videoId: job.videoId,
    sourceLang: job.sourceLang || "en",
    targetLang: job.targetLang || settings.targetLang || "zh-Hans",
    translationMode: job.translationMode || settings.translationMode || "user",
    sessionToken
  });
}

async function notifySubtitleReady(job) {
  if (!chrome.notifications) return;
  await chrome.notifications.create(`subtitle-ready-${job.jobId}`, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "AI subtitles ready",
    message: job.title || "Your translated subtitles are ready."
  });
}

async function notifySubtitleFailed(job, error) {
  if (!chrome.notifications) return;
  await chrome.notifications.create(`subtitle-failed-${job.jobId}`, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "AI subtitle generation failed",
    message: error || job.title || "Open the extension popup to try again."
  });
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(`Cannot reach backend API. Check Backend API URL, extension host permissions, and Render service status. URL: ${url}`);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { clientId } = await chrome.storage.local.get(["clientId"]);
  if (!clientId) {
    await chrome.storage.local.set({ clientId: crypto.randomUUID() });
  }
  ensureJobAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureJobAlarm();
});

function ensureJobAlarm() {
  chrome.alarms.create("check-subtitle-jobs", { periodInMinutes: 1 });
}

function normalizeApiBase(value) {
  return (value || DEFAULT_API_BASE).replace(/\/$/, "");
}

function subtitleCacheKey(videoId, sourceLang, targetLang, translationMode) {
  return `${videoId}:${sourceLang}:${targetLang}:${translationMode}`;
}

async function getCachedSubtitle(cacheKey) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const cached = subtitleCache[cacheKey];
  if (!cached?.data) return null;
  return cached.data;
}

async function setCachedSubtitle(cacheKey, data) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const nextCache = {
    ...subtitleCache,
    [cacheKey]: {
      savedAt: Date.now(),
      data
    }
  };
  const entries = Object.entries(nextCache)
    .sort(([, left], [, right]) => (right.savedAt || 0) - (left.savedAt || 0))
    .slice(0, SUBTITLE_CACHE_LIMIT);
  await chrome.storage.local.set({ subtitleCache: Object.fromEntries(entries) });
}

async function removeCachedSubtitle(cacheKey) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  if (!subtitleCache[cacheKey]) return;
  const nextCache = { ...subtitleCache };
  delete nextCache[cacheKey];
  await chrome.storage.local.set({ subtitleCache: nextCache });
}
