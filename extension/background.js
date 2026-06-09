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
  return false;
});

async function createSubtitleJob(payload) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  if (!settings.apiBase) throw new Error("Backend API URL is not configured.");
  const response = await safeFetch(`${settings.apiBase}/api/jobs`, {
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
      captionType: payload.captionType,
      rawCues: payload.rawCues
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Job request failed: ${response.status}`);

  const nextPendingJobs = [
    ...(payload.pendingJobs || []).filter((job) => job.jobId !== data.jobId),
    {
      jobId: data.jobId,
      videoId: payload.videoId,
      title: payload.video.title,
      url: payload.video.url,
      createdAt: Date.now()
    }
  ];
  await chrome.storage.local.set({ pendingJobs: nextPendingJobs });
  await checkSubtitleJobs();
  return { ok: true, ...data };
}

async function getSubtitleByVideo(message) {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  if (!settings.apiBase) return { status: "missing" };
  const url = `${settings.apiBase}/api/subtitles/by-video/${message.videoId}?sourceLang=${encodeURIComponent(message.sourceLang || "en")}&targetLang=${encodeURIComponent(message.targetLang || "zh-Hans")}`;
  const response = await safeFetch(url);
  if (!response.ok) return { status: "missing" };
  return response.json();
}

async function checkSubtitleJobs() {
  const { pendingJobs = [], settings = {}, notificationTargets = {} } = await chrome.storage.local.get([
    "pendingJobs",
    "settings",
    "notificationTargets"
  ]);
  if (!settings.apiBase || !pendingJobs.length) return;

  const stillPending = [];
  const nextNotificationTargets = { ...notificationTargets };
  for (const job of pendingJobs) {
    try {
      const response = await safeFetch(`${settings.apiBase}/api/jobs/${job.jobId}`);
      const status = await response.json();
      if (status.status === "completed") {
        nextNotificationTargets[job.jobId] = job.url;
        await chrome.notifications.create(`subtitle-${job.jobId}`, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icon.svg"),
          title: "AI subtitles ready",
          message: job.title || "Open the video to load subtitles."
        });
      } else if (status.status !== "failed" && status.status !== "cancelled") {
        stillPending.push(job);
      }
    } catch {
      stillPending.push(job);
    }
  }
  await chrome.storage.local.set({ pendingJobs: stillPending, notificationTargets: nextNotificationTargets });
  if (stillPending.length) ensureJobAlarm();
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

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith("subtitle-")) return;
  const { notificationTargets = {} } = await chrome.storage.local.get(["notificationTargets"]);
  const jobId = notificationId.replace("subtitle-", "");
  const url = notificationTargets[jobId];
  if (url) {
    await chrome.tabs.create({ url });
  }
  chrome.notifications.clear(notificationId);
});

function ensureJobAlarm() {
  chrome.alarms.create("check-subtitle-jobs", { periodInMinutes: 1 });
}
