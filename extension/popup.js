const dot = document.getElementById("dot");
const state = document.getElementById("state");
const detail = document.getElementById("detail");
const openOptions = document.getElementById("openOptions");

const zh = (navigator.language || "en").toLowerCase().startsWith("zh");

function render(mode, title, subtitle) {
  state.textContent = title;
  detail.textContent = subtitle || "";
  dot.classList.toggle("ok", mode === "connected");
}

async function load() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const base = String(settings.apiBase || "").replace(/\/+$/, "");
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(base);

  if (!isLocal) {
    render("offline", zh ? "未连接" : "Not connected", zh ? "打开设置连接本机应用" : "Connect from settings");
    return;
  }

  try {
    const response = await fetch(`${base}/api/local/status`, { signal: AbortSignal.timeout(2500) });
    const data = await response.json();
    if (data?.ai?.configured) {
      render("connected", zh ? "已连接" : "Connected", `${data.ai.provider} · ${data.ai.model}`);
    } else {
      render("connected", zh ? "已连接" : "Connected", zh ? "尚未配置 AI 模型" : "No AI model configured");
    }
  } catch {
    render("offline", zh ? "未连接" : "Not connected", zh ? "VidLingo 应用没有运行" : "VidLingo app is not running");
  }
}

openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
load();
