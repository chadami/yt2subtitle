const dot = document.getElementById("dot");
const state = document.getElementById("state");
const detail = document.getElementById("detail");
const statusIcon = document.getElementById("statusIcon");
const engine = document.getElementById("engine");
const provider = document.getElementById("provider");
const model = document.getElementById("model");
const connection = document.getElementById("connection");
const connect = document.getElementById("connect");
const connectLabel = document.getElementById("connectLabel");
const zh = (navigator.language || "en").toLowerCase().startsWith("zh");

if (!zh) {
  document.documentElement.lang = "en";
  document.getElementById("engineLabel").textContent = "Current AI engine";
  document.getElementById("connectionHint").textContent = "Open VidLingo on your Mac and keep it running.";
  document.getElementById("hint").textContent = "Adjust subtitle display and style in the YouTube player.";
}

function render(mode, title, subtitle) {
  const connected = mode === "connected";
  state.textContent = title;
  detail.textContent = subtitle;
  dot.classList.toggle("ok", connected);
  statusIcon.src = connected ? "icons/popup-check.svg" : "icons/popup-plugs.svg";
  engine.hidden = !connected;
  connection.hidden = mode !== "offline";
}

async function load() {
  if (connect.disabled) return;
  connect.disabled = true;
  connectLabel.textContent = zh ? "连接中…" : "Connecting…";
  render("checking", zh ? "检查中…" : "Checking…", zh ? "正在连接本机应用" : "Connecting to the local app");
  try {
    const data = await chrome.runtime.sendMessage({ type: "GET_LOCAL_STATUS" });
    if (!data?.ok) throw new Error(data?.error || "Connection unavailable");
    provider.textContent = data.ai?.configured ? (data.ai.provider || "") : "";
    provider.hidden = !provider.textContent;
    model.textContent = data.ai?.configured
      ? (data.ai.model || (zh ? "未设置模型" : "No model selected"))
      : (zh ? "尚未配置 AI 模型" : "No AI model configured");
    render("connected", zh ? "已连接" : "Connected", zh ? "本机应用已就绪" : "Local app is ready");
  } catch {
    render("offline", zh ? "未连接" : "Not connected", zh ? "尚未连接到本机应用" : "Not connected to the local app");
  } finally {
    connect.disabled = false;
    connectLabel.textContent = zh ? "连接本机应用" : "Connect to local app";
  }
}

connect.addEventListener("click", load);
load();
