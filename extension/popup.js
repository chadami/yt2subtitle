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
  try {
    const data = await chrome.runtime.sendMessage({ type: "GET_LOCAL_STATUS" });
    if (!data?.ok) throw new Error(data?.error || "Connection unavailable");
    if (data?.ai?.configured) {
      render("connected", zh ? "已连接" : "Connected", `${data.ai.provider} · ${data.ai.model}`);
    } else {
      render("connected", zh ? "已连接" : "Connected", zh ? "尚未配置 AI 模型" : "No AI model configured");
    }
  } catch (error) {
    render("offline", zh ? "未连接" : "Not connected", zh ? (error.message || "请打开 VidLingo 本机应用") : "Open VidLingo and try again");
  }
}

openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
load();
