document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

const generate = document.getElementById("generate");
const status = document.getElementById("status");
let activeTabId = null;

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.url?.includes("youtube.com/watch")) {
    status.textContent = "Open a YouTube video to use this extension.";
    return;
  }
  activeTabId = tab.id;
  const videoId = new URL(tab.url).searchParams.get("v");
  status.textContent = videoId ? `Current video: ${videoId}` : "No video detected.";
  generate.disabled = !videoId;
});

generate.addEventListener("click", async () => {
  if (!activeTabId) return;
  generate.disabled = true;
  status.textContent = "Extracting captions and creating job...";
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, { type: "GENERATE_AI_SUBTITLES" });
    if (!result?.ok) throw new Error(result?.error || "Failed to create subtitle job.");
    status.textContent = `Job ${result.status}: ${result.rawCueCount} cues (${result.captionType}, ${result.sourceLang}).`;
  } catch (error) {
    status.textContent = error.message || String(error);
  } finally {
    generate.disabled = false;
  }
});
