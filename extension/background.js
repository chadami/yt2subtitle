const DEFAULT_API_BASE = "http://127.0.0.1:3000";
const SUBTITLE_CACHE_LIMIT = 8;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLocalApiBase(apiBase) {
  try {
    const url = new URL(apiBase);
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const sessionRequests = new Map();

async function ensureSessionToken(explicitApiBase, forceRefresh = false) {
  const { settings = {}, sessionToken, localMode } = await chrome.storage.local.get(["settings", "sessionToken", "localMode"]);
  const apiBase = normalizeApiBase(explicitApiBase || settings.apiBase);
  if (!forceRefresh && sessionToken && localMode === true && isLocalApiBase(settings.apiBase)
      && normalizeApiBase(settings.apiBase) === apiBase) return sessionToken;
  if (sessionRequests.has(apiBase)) return sessionRequests.get(apiBase);
  const request = (async () => {
    try {
      const response = await fetch(`${apiBase}/api/local/session`, {
        headers: { "X-VidLingo-Client": "extension" }, signal: AbortSignal.timeout(2500)
      });
      if (!response.ok) return "";
      const data = await response.json().catch(() => ({}));
      if (!data.token) return "";
      const { settings: latestSettings = {} } = await chrome.storage.local.get(["settings"]);
      // Do not overwrite a connection changed in settings while this request was running.
      if (normalizeApiBase(latestSettings.apiBase) !== apiBase) return "";
      await chrome.storage.local.set({
        sessionToken: data.token, localMode: true,
        settings: { ...latestSettings, apiBase }
      });
      return data.token;
    } catch {
      return "";
    }
  })();
  sessionRequests.set(apiBase, request);
  try { return await request; }
  finally { sessionRequests.delete(apiBase); }
}

// All API requests share the current local token. A rejected token is refreshed
// once, including after the app is reinstalled or its Keychain token changes.
async function localFetch(apiBase, path, options = {}) {
  const token = await ensureSessionToken(apiBase);
  if (!token) throw new Error("无法连接 VidLingo，请打开本机应用后重试。");
  const request = (value) => safeFetch(`${apiBase}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
    headers: { ...options.headers, Authorization: `Bearer ${value}` }
  });
  let response = await request(token);
  if (response.status !== 401) return response;
  const { sessionToken: currentToken } = await chrome.storage.local.get(["sessionToken"]);
  const refreshed = currentToken && currentToken !== token
    ? currentToken : await ensureSessionToken(apiBase, true);
  if (!refreshed) throw new Error("无法重新连接 VidLingo，请确认本机应用已打开。");
  response = await request(refreshed);
  if (response.status === 401) throw new Error("本机连接验证失败，请在插件设置中重新连接 VidLingo。");
  return response;
}

async function getLocalStatus() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const response = await localFetch(normalizeApiBase(settings.apiBase), "/api/local/status");
  if (!response.ok) throw new Error("无法读取本机应用状态。");
  return { ok: true, ...await response.json() };
}

async function syncLocalPreferences() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  if (!isLocalApiBase(apiBase)) return { ok: false };
  try {
    const response = await localFetch(apiBase, "/api/local/preferences");
    if (!response.ok) return { ok: false };
    const prefs = await response.json();
    const next = {
      ...settings,
      apiBase,
      targetLang: prefs.targetLang || settings.targetLang || "zh-Hans"
    };
    await chrome.storage.local.set({ settings: next });
    return { ok: true, settings: next };
  } catch {
    return { ok: false };
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "check-subtitle-jobs") return;
  await checkSubtitleJobs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  if (message?.type === "RESOLVE_SUBTITLE") {
    resolveSubtitle(message.payload).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ status: "missing", error: error.message || String(error) })
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
  if (["OPEN_PLAYBACK_PREVIEW", "UPDATE_PLAYBACK_PREVIEW", "CLOSE_PLAYBACK_PREVIEW"].includes(message?.type)) {
    const endpoint = {OPEN_PLAYBACK_PREVIEW:"open",UPDATE_PLAYBACK_PREVIEW:"update",CLOSE_PLAYBACK_PREVIEW:"close"}[message.type];
    const payload = {...message.payload};
    if(endpoint === "open") payload.clientId = `tab-${sender.tab?.id ?? "extension"}`;
    playbackRequest(endpoint, payload).then(sendResponse,
      error=>sendResponse({ok:false,error:error.message||String(error)}));
    return true;
  }
  if (message?.type === "RETRY_SUBTITLE_JOB") {
    retrySubtitleJob(message).then(sendResponse,
      error => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "STOP_SUBTITLE_JOB") {
    stopSubtitleJob(message.jobId).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "GET_LOCAL_STATUS") {
    getLocalStatus().then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "ENSURE_SESSION") {
    ensureSessionToken().then(
      (token) => sendResponse({ ok: Boolean(token), sessionToken: token || "" }),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  if (message?.type === "SYNC_PREFERENCES") {
    syncLocalPreferences().then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message || String(error) })
    );
    return true;
  }
  return false;
});

async function retrySubtitleJob(payload) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const response = await localFetch(normalizeApiBase(settings.apiBase), `/api/jobs/${encodeURIComponent(payload.jobId)}/retry`, { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Retry failed: ${response.status}`);
  const { pendingJobs = [] } = await chrome.storage.local.get(["pendingJobs"]);
  if (!pendingJobs.some(job => job.jobId === payload.jobId)) {
    await chrome.storage.local.set({ pendingJobs: [...pendingJobs, { jobId: payload.jobId, videoId: payload.videoId, title: payload.title || "", createdAt: Date.now() }] });
  }
  ensureJobAlarm();
  return { ok: true, ...data };
}

async function createSubtitleJob(payload) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await localFetch(apiBase, "/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      video: payload.video,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      forceRegenerate: payload.forceRegenerate === true,
      captionType: payload.captionType,
      styleId: payload.styleId || "accurate",
      rawCues: payload.rawCues
    })
  });
  const data = await response.json().catch(() => ({}));
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
      captionType: payload.captionType,
      styleId: payload.styleId || "accurate",
      createdAt: Date.now()
    }
  ];
  await chrome.storage.local.set({ pendingJobs: nextPendingJobs });
  await checkSubtitleJobs();
  return { ok: true, ...data };
}

async function resolveSubtitle(payload) {
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
    const response = await localFetch(apiBase, "/api/subtitles/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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

async function playbackRequest(endpoint, payload) {
  const {settings={}}=await chrome.storage.local.get(["settings"]);
  const response=await localFetch(normalizeApiBase(settings.apiBase), `/api/subtitles/playback/${endpoint}`, {
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,status:response.status,error:data.error||"本地翻译暂不可用"};
  return data;
}

async function stopSubtitleJob(jobId) {
  if (!jobId) throw new Error("没有正在运行的任务");
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const response = await localFetch(normalizeApiBase(settings.apiBase), `/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "停止任务失败");
  const { pendingJobs = [], fallbackJobs = [] } = await chrome.storage.local.get(["pendingJobs", "fallbackJobs"]);
  await chrome.storage.local.set({
    pendingJobs: pendingJobs.filter(job => job.jobId !== jobId),
    fallbackJobs: fallbackJobs.filter(job => job.jobId !== jobId)
  });
  return { ok: true };
}

async function getJobStatus(jobId) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await localFetch(apiBase, `/api/jobs/${encodeURIComponent(jobId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Job status failed: ${response.status}`);
  return { ok: true, job: data };
}

async function getPartialSubtitles(jobId) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const apiBase = normalizeApiBase(settings.apiBase);
  const response = await localFetch(apiBase, `/api/jobs/${encodeURIComponent(jobId)}/partial-subtitles`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Partial subtitles failed: ${response.status}`);
  return { ok: true, ...data };
}

async function checkSubtitleJobs() {
  const { pendingJobs = [], settings = {} } = await chrome.storage.local.get([
    "pendingJobs",
    "settings"
  ]);
  if (!pendingJobs.length) return;
  const apiBase = normalizeApiBase(settings.apiBase);

  const stillPending = [];
  for (const job of pendingJobs) {
    try {
      const response = await localFetch(apiBase, `/api/jobs/${encodeURIComponent(job.jobId)}`);
      if (!response.ok) throw new Error(`Job status failed: ${response.status}`);
      const status = await response.json();
      if (status.status === "completed" || (status.status === "failed" && status.machineTranslation?.state === "completed")) {
        await notifySubtitleReady(job).catch(() => {});
      } else if (status.status === "failed" && !["running", "waiting"].includes(status.machineTranslation?.state)) {
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
    title: "Subtitles ready",
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
    throw new Error(isLocalApiBase(url)
      ? "无法连接 VidLingo，请打开本机应用并在插件设置中重新连接。"
      : "无法连接翻译服务，请稍后重试。");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureJobAlarm();
  ensureSessionToken(undefined, true).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureJobAlarm();
  ensureSessionToken(undefined, true).catch(() => {});
});

function ensureJobAlarm() {
  chrome.alarms.create("check-subtitle-jobs", { periodInMinutes: 1 });
}

function normalizeApiBase(value) {
  return isLocalApiBase(value) ? String(value).replace(/\/$/, "") : DEFAULT_API_BASE;
}

function subtitleCacheKey(videoId, sourceLang, captionType, targetLang, styleId, cueHash) {
  return `${videoId}:${sourceLang}:${captionType}:${targetLang}:${styleId}:${cueHash}`;
}

async function getCachedSubtitle(cacheKey) {
  const { subtitleCache = {} } = await chrome.storage.local.get(["subtitleCache"]);
  const cached = subtitleCache[cacheKey];
  if (!cached?.data) return null;
  return cached.data;
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
