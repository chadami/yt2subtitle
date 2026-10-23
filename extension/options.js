const LOCAL_CANDIDATES = ["http://127.0.0.1:3000", "http://localhost:3000"];

const copy = {
  zh: {
    subtitle: "YouTube 字幕 AI 翻译",
    disconnected: "未连接",
    disconnectedHint: "打开 macOS 版 VidLingo，然后点下面的按钮。",
    connecting: "正在连接…",
    connectingHint: "正在检测本机服务",
    connected: "已连接",
    connectedHint: "翻译引擎 · {engine}",
    noEngine: "尚未配置 AI 模型，请在 VidLingo 应用里设置。",
    connect: "连接本机应用",
    reconnect: "重新连接",
    connectingButton: "连接中…",
    notFound: "没检测到本机应用",
    notFoundHint: "确认 VidLingo.app 已打开且状态是「运行中」，然后重试。",
    moreTitle: "更多设置",
    moreBody: "字幕语言、原文字幕、翻译历史都在 macOS 应用的「字幕输出」和「历史记录」里。",
    advanced: "连接诊断（高级）",
    save: "保存并连接",
    saved: "地址已保存，正在连接…",
    badAddress: "请填写本机地址（localhost 或 127.0.0.1）"
  },
  en: {
    subtitle: "AI subtitles for YouTube",
    disconnected: "Not connected",
    disconnectedHint: "Open the VidLingo macOS app, then press the button below.",
    connecting: "Connecting…",
    connectingHint: "Looking for the local service",
    connected: "Connected",
    connectedHint: "Engine · {engine}",
    noEngine: "No AI model configured yet. Set it up in the VidLingo app.",
    connect: "Connect to VidLingo",
    reconnect: "Reconnect",
    connectingButton: "Connecting…",
    notFound: "VidLingo app not found",
    notFoundHint: "Make sure VidLingo.app is running, then try again.",
    moreTitle: "More settings",
    moreBody: "Subtitle language, source text and history live in the app's Subtitles and History sections.",
    advanced: "Connection diagnostics (Advanced)",
    save: "Save and connect",
    saved: "Address saved, connecting…",
    badAddress: "Use a local address (localhost or 127.0.0.1)"
  }
};

const language = (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
const t = (key, values = {}) =>
  (copy[language][key] || copy.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));

const nodes = {
  card: document.getElementById("card"),
  statusTitle: document.getElementById("statusTitle"),
  statusDetail: document.getElementById("statusDetail"),
  connect: document.getElementById("connect"),
  reconnect: document.getElementById("reconnect"),
  apiBase: document.getElementById("apiBase"),
  saveBase: document.getElementById("saveBase"),
  message: document.getElementById("message"),
  version: document.getElementById("version")
};

function normalizeBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isLocalBase(value) {
  try {
    const url = new URL(normalizeBase(value));
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function setState(state, title, detail) {
  nodes.card.dataset.state = state;
  nodes.statusTitle.textContent = title;
  nodes.statusDetail.textContent = detail;
}

function renderConnected(base, ai) {
  setState(
    "connected",
    t("connected"),
    ai?.configured
      ? t("connectedHint", { engine: `${ai.provider} · ${ai.model}` })
      : t("noEngine")
  );
  nodes.connect.hidden = true;
  nodes.reconnect.hidden = false;
  nodes.reconnect.textContent = t("reconnect");
  nodes.connect.textContent = t("connect");
}

function renderDisconnected(title = t("notFound"), detail = t("notFoundHint")) {
  setState("error", title, detail);
  nodes.connect.hidden = false;
  nodes.reconnect.hidden = true;
  nodes.connect.textContent = t("connect");
}

async function probe(base) {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1400) });
    return response.ok;
  } catch {
    return false;
  }
}

async function connectTo(base) {
  const response = await fetch(`${base}/api/local/session`, { headers: { "X-VidLingo-Client": "extension" }, signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const session = await response.json();
  if (!session?.token) throw new Error("missing token");

  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({
    settings: { ...settings, apiBase: base, autoLoad: true },
    sessionToken: session.token,
    localMode: true
  });

  chrome.runtime.sendMessage({ type: "SYNC_PREFERENCES" }).catch(() => {});
  renderConnected(base, session.ai);
  nodes.version.textContent = `插件 v${chrome.runtime.getManifest().version}`;
  return session;
}

async function autoConnect() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const candidates = [];
  const saved = normalizeBase(settings.apiBase);
  if (saved && isLocalBase(saved)) candidates.push(saved);
  for (const base of LOCAL_CANDIDATES) {
    if (!candidates.includes(base)) candidates.push(base);
  }

  setState("connecting", t("connecting"), t("connectingHint"));
  nodes.connect.disabled = true;
  try {
    for (const base of candidates) {
      if (!(await probe(base))) continue;
      try {
        await connectTo(base);
        return;
      } catch {
        // Try the next candidate.
      }
    }
    renderDisconnected();
  } finally {
    nodes.connect.disabled = false;
  }
}

nodes.connect.addEventListener("click", autoConnect);
nodes.reconnect.addEventListener("click", autoConnect);

nodes.saveBase.addEventListener("click", async () => {
  const base = normalizeBase(nodes.apiBase.value);
  if (!/^https?:\/\//i.test(base) || !isLocalBase(base)) {
    nodes.message.textContent = t("badAddress");
    return;
  }
  nodes.message.textContent = t("saved");
  setState("connecting", t("connecting"), t("connectingHint"));
  try {
    if (!(await probe(base))) throw new Error(t("notFound"));
    await connectTo(base);
    nodes.message.textContent = "";
  } catch (error) {
    renderDisconnected();
    nodes.message.textContent = error.message || "";
  }
});

async function init() {
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  nodes.connect.textContent = t("connect");

  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  nodes.apiBase.value = isLocalBase(settings.apiBase) ? normalizeBase(settings.apiBase) : "";

  await autoConnect();
}

init();
