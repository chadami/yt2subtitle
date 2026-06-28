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
  if (message?.type === "GET_PARTIAL_SUBTITLES") {
    getPartialSubtitles(message.jobId).then(
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
      ...(translationMode === "user" && payload.sessionToken ? { Authorization: `Bearer ${payload.sessionToken}` } : {})
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
  if (response.status === 401) {
    await clearAuthSession();
    throw new Error(data.error || "Session expired. Open Settings and sign in again.");
  }
  if (!response.ok) throw new Error(data.error || `Job request failed: ${response.status}`);
  if (payload.forceRegenerate === true) {
    await removeCachedSubtitlesForVideo(
      payload.videoId,
      payload.targetLang || "zh-Hans",
      translationMode
    );
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
  const sourceLang = message.sourceLang || "";
  const targetLang = message.targetLang || "zh-Hans";
  const modes = [translationMode, translationMode === "user" ? "system" : "user"];
  for (const mode of modes) {
    const cacheKey = subtitleCacheKey(message.videoId, sourceLang || "any", targetLang, mode);
    try {
      const data = await fetchSubtitleByVideo({
        apiBase,
        videoId: message.videoId,
        sourceLang,
        targetLang,
        translationMode: mode,
        sessionToken: message.sessionToken
      });
      if (data.status === "completed") return data;
    } catch {
      const cached = await getCachedSubtitle(cacheKey);
      if (cached) return cached;
    }
  }
  return { status: "missing" };
}

async function fetchSubtitleByVideo({ apiBase, videoId, sourceLang, targetLang, translationMode, sessionToken }) {
  if (translationMode === "user" && !sessionToken) return { status: "missing" };
  const cacheKey = subtitleCacheKey(videoId, sourceLang || "any", targetLang, translationMode);
  const params = new URLSearchParams({ targetLang, translationMode });
  if (sourceLang) params.set("sourceLang", sourceLang);
  const url = `${apiBase}/api/subtitles/by-video/${videoId}?${params.toString()}`;
  const response = await safeFetch(url, {
    headers: translationMode === "user" && sessionToken
      ? { Authorization: `Bearer ${sessionToken}` }
      : {}
  });
  if (response.status === 401) {
    await clearAuthSession();
    return { status: "missing" };
  }
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

async function getPartialSubtitles(jobId) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await safeFetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}/partial-subtitles`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Partial subtitles failed: ${response.status}`);
  return { ok: true, ...data };
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
  const apiBase = normalizeApiBase(settings.apiBase);
  const sourceLang = job.sourceLang || "en";
  const targetLang = job.targetLang || settings.targetLang || "zh-Hans";
  const translationMode = job.translationMode || settings.translationMode || "user";
  await removeCachedSubtitlesForVideo(job.videoId, targetLang, translationMode);
  await fetchSubtitleByVideo({
    apiBase,
    videoId: job.videoId,
    sourceLang,
    targetLang,
    translationMode,
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

async function clearAuthSession() {
  await chrome.storage.local.remove(["sessionToken", "accountEmail"]);
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

async function removeCachedSubtitlesForVideo(videoId, targetLang, translationMode) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const nextCache = { ...subtitleCache };
  const prefix = `${videoId}:`;
  const suffix = `:${targetLang}:${translationMode}`;
  let changed = false;

  for (const cacheKey of Object.keys(nextCache)) {
    if (cacheKey.startsWith(prefix) && cacheKey.endsWith(suffix)) {
      delete nextCache[cacheKey];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ subtitleCache: nextCache });
  }
}
