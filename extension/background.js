chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "check-subtitle-jobs") return;
  await checkSubtitleJobs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CHECK_SUBTITLE_JOBS") return;
  checkSubtitleJobs().then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({ ok: false, error: error.message || String(error) })
  );
  return true;
});

async function checkSubtitleJobs() {
  const { pendingJobs = [], settings = {} } = await chrome.storage.local.get(["pendingJobs", "settings"]);
  if (!settings.apiBase || !pendingJobs.length) return;

  const stillPending = [];
  for (const job of pendingJobs) {
    try {
      const response = await fetch(`${settings.apiBase}/api/jobs/${job.jobId}`);
      const status = await response.json();
      if (status.status === "completed") {
        chrome.notifications.create(`subtitle-${job.jobId}`, {
          type: "basic",
          iconUrl: "icon.png",
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
  await chrome.storage.local.set({ pendingJobs: stillPending });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { clientId } = await chrome.storage.local.get(["clientId"]);
  if (!clientId) {
    await chrome.storage.local.set({ clientId: crypto.randomUUID() });
  }
  chrome.alarms.create("check-subtitle-jobs", { periodInMinutes: 3 });
});
