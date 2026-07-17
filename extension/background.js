const DEFAULT_API_BASE = "https://api.vidlingo.online";
const LEGACY_API_BASE = "https://subtitle.invisiblewind.cn";
const SUBTITLE_CACHE_LIMIT = 8;

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "check-subtitle-jobs") return;
  await checkSubtitleJobs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
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
  if (message?.type === "TRANSLATE_MACHINE_PREVIEW") {
    translateMachinePreview(message.payload).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "RESOLVE_SUBTITLE") {
    resolveSubtitle(message.payload).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ status: "missing", error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "GET_ENTITLEMENTS") {
    getEntitlements().then(
      (result) => sendResponse({ ok: true, ...result }),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
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
  const { sessionToken } = await chrome.storage.local.get(["sessionToken"]);
  if (!sessionToken || !payload?.sessionToken) {
    throw new Error("Sign in from Settings before generating AI subtitles.");
  }
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await safeFetch(`${apiBase}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      video: payload.video,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      translationMode: "user",
      forceRegenerate: payload.forceRegenerate === true,
      captionType: payload.captionType,
      styleId: payload.styleId || "accurate",
      rawCues: payload.rawCues,
      machineCues: Array.isArray(payload.machineCues) ? payload.machineCues : undefined
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
      "user"
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
      translationMode: "user",
      captionType: payload.captionType,
      styleId: payload.styleId || "accurate",
      createdAt: Date.now()
    }
  ];
  await chrome.storage.local.set({ pendingJobs: nextPendingJobs });
  await checkSubtitleJobs();
  return { ok: true, ...data };
}

async function translateMachinePreview(payload) {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  if (!sessionToken) throw new Error("Sign in from Settings before translating subtitles.");
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await safeFetch(`${apiBase}/api/jobs/machine-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      captionType: payload.captionType,
      rawCues: payload.rawCues
    })
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) await clearAuthSession();
  if (!response.ok) throw new Error(data.error || `Machine translation failed: ${response.status}`);
  return { ok: true, cues: Array.isArray(data.cues) ? data.cues : [] };
}

async function resolveSubtitle(payload) {
  if (!payload.sessionToken) return { status: "missing", error: "Sign in to load subtitles." };
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const cueHash = await hashRawCues(payload.rawCues || []);
  const cacheKey = subtitleCacheKey(
    payload.video.videoId,
    payload.sourceLang || "en",
    payload.captionType || "manual",
    payload.targetLang || "zh-Hans",
    payload.styleId || "accurate",
    cueHash
  );
  try {
    const response = await safeFetch(`${apiBase}/api/subtitles/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.sessionToken}`
      },
      body: JSON.stringify({
        video: payload.video,
        sourceLang: payload.sourceLang || "en",
        targetLang: payload.targetLang || "zh-Hans",
        captionType: payload.captionType || "manual",
        styleId: payload.styleId || "accurate",
        rawCues: payload.rawCues
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await clearAuthSession();
      return { status: "missing", error: data.error || "Session expired." };
    }
    if (response.status === 404) return data;
    if (!response.ok) throw new Error(data.error || `Subtitle resolve failed: ${response.status}`);
    if (data.status === "completed" && Array.isArray(data.cues)) {
      await setCachedSubtitle(cacheKey, data);
    }
    return data;
  } catch (error) {
    const cached = await getCachedSubtitle(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

async function getEntitlements() {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  if (!sessionToken) throw new Error("Sign in required.");
  const response = await safeFetch(`${normalizeApiBase(settings.apiBase)}/api/account/entitlements`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) await clearAuthSession();
  if (!response.ok) throw new Error(data.error || `Entitlements failed: ${response.status}`);
  if (!data.canUsePublicSubtitles) await clearPublicSubtitleCache();
  await chrome.storage.local.set({
    entitlementsStatus: data.status || "active",
    entitlementsCanUsePublicSubtitles: data.canUsePublicSubtitles === true,
    entitlementsCheckedAt: Date.now()
  });
  return data;
}

async function getJobStatus(jobId) {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await safeFetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Job status failed: ${response.status}`);
  return { ok: true, job: data };
}

async function getPartialSubtitles(jobId) {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await safeFetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}/partial-subtitles`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
  });
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
      const response = await safeFetch(`${apiBase}/api/jobs/${job.jobId}`, {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
      });
      const status = await response.json();
      if (status.status === "completed") {
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
    message: job.title || "Subtitle generation did not complete. Please try again."
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
  await chrome.storage.local.remove([
    "sessionToken",
    "accountEmail",
    "entitlementsStatus",
    "entitlementsCanUsePublicSubtitles",
    "entitlementsCheckedAt"
  ]);
  await clearPublicSubtitleCache();
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
  const apiBase = (value || DEFAULT_API_BASE).replace(/\/$/, "");
  return apiBase === LEGACY_API_BASE ? DEFAULT_API_BASE : apiBase;
}

function subtitleCacheKey(videoId, sourceLang, captionType, targetLang, styleId, cueHash) {
  return `${videoId}:${sourceLang}:${captionType}:${targetLang}:${styleId}:${cueHash}`;
}

async function getCachedSubtitle(cacheKey) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const cached = subtitleCache[cacheKey];
  if (!cached?.data) return null;
  if (cached.data.accessSource === "public" && Date.now() - Number(cached.savedAt || 0) > 24 * 60 * 60 * 1000) {
    return null;
  }
  return cached.data;
}

async function clearPublicSubtitleCache() {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const privateEntries = Object.entries(subtitleCache).filter(([, entry]) => entry?.data?.accessSource !== "public");
  await chrome.storage.local.set({ subtitleCache: Object.fromEntries(privateEntries) });
}

async function hashRawCues(rawCues) {
  const stable = rawCues.map((cue) => ({
    start: Number(Number(cue.start).toFixed(3)),
    end: Number(Number(cue.end).toFixed(3)),
    text: String(cue.text || "").trim()
  }));
  const bytes = new TextEncoder().encode(JSON.stringify(stable));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function removeCachedSubtitlesForVideo(videoId, targetLang) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const nextCache = { ...subtitleCache };
  const prefix = `${videoId}:`;
  let changed = false;

  for (const cacheKey of Object.keys(nextCache)) {
    if (cacheKey.startsWith(prefix) && cacheKey.includes(`:${targetLang}:`)) {
      delete nextCache[cacheKey];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ subtitleCache: nextCache });
  }
}
