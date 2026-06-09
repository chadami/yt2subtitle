document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const status = document.getElementById("status");
  if (!tab?.url?.includes("youtube.com/watch")) {
    status.textContent = "Open a YouTube video to use this extension.";
    return;
  }
  const videoId = new URL(tab.url).searchParams.get("v");
  status.textContent = videoId ? `Current video: ${videoId}` : "No video detected.";
});
