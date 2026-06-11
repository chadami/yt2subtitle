const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";
const API_KEY_MASK = "********";

const fields = {
  apiBase: document.getElementById("apiBase"),
  uiLanguage: document.getElementById("uiLanguage"),
  translationMode: document.querySelectorAll("input[name='translationMode']"),
  targetLang: document.getElementById("targetLang"),
  autoLoad: document.getElementById("autoLoad"),
  aiProvider: document.getElementById("aiProvider"),
  aiApiKey: document.getElementById("aiApiKey"),
  aiModel: document.getElementById("aiModel")
};

const nodes = {
  accountLoggedIn: document.getElementById("accountLoggedIn"),
  accountLoggedOut: document.getElementById("accountLoggedOut"),
  accountEmail: document.getElementById("accountEmail"),
  email: document.getElementById("email"),
  loginCode: document.getElementById("loginCode"),
  sendMagicLink: document.getElementById("sendMagicLink"),
  sendMagicLinkText: document.getElementById("sendMagicLinkText"),
  exchangeLoginCode: document.getElementById("exchangeLoginCode"),
  exchangeLoginCodeText: document.getElementById("exchangeLoginCodeText"),
  personalAiSection: document.getElementById("personalAiSection"),
  basicNav: document.getElementById("basicNav"),
  historyNav: document.getElementById("historyNav"),
  basicView: document.getElementById("basicView"),
  historyView: document.getElementById("historyView"),
  historyRows: document.getElementById("historyRows"),
  aiStatus: document.getElementById("aiStatus"),
  message: document.getElementById("message")
};

let hasVerifiedSession = false;
let currentLanguage = "en";
let lastHistoryRows = [];

const translations = {
  en: {
    uiLanguage: "Language",
    settingsNav: "Settings",
    historyNav: "History",
    accountTitle: "Account",
    accountCopy: "Sign in to sync your API and history",
    currentAccount: "Current account",
    signOut: "Sign out",
    emailLabel: "Email",
    sendCode: "Send sign-in code",
    codeLabel: "Sign-in code",
    signIn: "Sign in",
    translationApiTitle: "Translation API",
    translationApiCopy: "Choose which provider handles translation",
    personalApi: "Personal API key",
    systemApi: "System API",
    aiProvider: "AI provider",
    modelLabel: "Model",
    apiKeyLabel: "API key",
    aiStatusDefault: "Sign in, enter an API key, then fetch models.",
    fetchModels: "Fetch models",
    saveApiSettings: "Save API settings",
    subtitleOutputTitle: "Subtitle Output",
    subtitleOutputCopy: "Language and display behavior",
    translationLanguage: "Translation language",
    autoLoad: "Auto-load completed subtitles",
    cacheTitle: "Cache",
    cacheCopy: "Local subtitle task state",
    clearCache: "Clear local cache",
    saveSettings: "Save settings",
    historyTitle: "History",
    historyCopy: "Subtitle jobs for this account",
    refresh: "Refresh",
    generatedAt: "Generated at",
    video: "Video",
    link: "Link",
    status: "Status",
    historySignIn: "Sign in to view history.",
    noPersonalApi: "No personal API key saved yet.",
    apiSavedModel: "Personal API key saved. Current model: {model}.",
    notSelected: "not selected",
    cannotLoadAi: "Cannot load AI settings: {message}",
    settingsSaved: "Settings saved.",
    signInFetch: "Sign in before fetching models.",
    enterApiAgain: "Enter the API key again to fetch models.",
    enterApiFirst: "Enter an API key first.",
    fetchingModels: "Fetching models...",
    fetchFailed: "Fetch failed: {message}",
    modelCount: "{count} models fetched.",
    signInSave: "Sign in before saving your API settings.",
    selectModelFirst: "Fetch and select a model first.",
    apiSettingsSaved: "Personal API settings saved for this account.",
    saveFailed: "Save failed: {message}",
    providerChanged: "Enter an API key, then fetch models for this provider.",
    loadingHistory: "Loading history...",
    historyLoadFailed: "Failed to load history.",
    noHistory: "No generated subtitles yet.",
    untitledVideo: "Untitled video",
    openVideo: "Open video",
    completed: "Completed",
    failed: "Failed",
    processing: "Processing",
    sessionExpired: "Session expired. Please sign in again.",
    missingEmail: "Account email is missing. Please sign in again.",
    cannotVerify: "Cannot verify account: {message}",
    connectionOk: "Connection OK.",
    connectionFailed: "Connection failed: {message}",
    enterEmail: "Enter your email first.",
    codeSentMessage: "Sign-in code sent. Check your email.",
    sendCodeFailed: "Could not send sign-in code.",
    sendCodeFailedMessage: "Could not send sign-in code: {message}",
    codeSent: "Code sent",
    sending: "Sending",
    enterCode: "Enter the sign-in code first.",
    signInFailed: "Sign-in failed.",
    signInFailedMessage: "Sign-in failed: {message}",
    signingIn: "Signing in",
    cacheCleared: "Local cache cleared."
  },
  "zh-Hans": {
    uiLanguage: "语言",
    settingsNav: "设置",
    historyNav: "历史记录",
    accountTitle: "账号",
    accountCopy: "登录后同步 API 设置和历史记录",
    currentAccount: "当前账号",
    signOut: "退出登录",
    emailLabel: "邮箱",
    sendCode: "发送登录码",
    codeLabel: "登录码",
    signIn: "登录",
    translationApiTitle: "翻译 API",
    translationApiCopy: "选择用于翻译的服务",
    personalApi: "个人 API Key",
    systemApi: "系统 API",
    aiProvider: "AI 服务商",
    modelLabel: "模型",
    apiKeyLabel: "API Key",
    aiStatusDefault: "登录后输入 API Key，然后抓取模型。",
    fetchModels: "抓取模型",
    saveApiSettings: "保存 API 设置",
    subtitleOutputTitle: "字幕输出",
    subtitleOutputCopy: "语言和显示行为",
    translationLanguage: "翻译语言",
    autoLoad: "自动加载已完成字幕",
    cacheTitle: "缓存",
    cacheCopy: "本地字幕任务状态",
    clearCache: "清空本地缓存",
    saveSettings: "保存设置",
    historyTitle: "历史记录",
    historyCopy: "当前账号的字幕任务",
    refresh: "刷新",
    generatedAt: "生成时间",
    video: "视频",
    link: "链接",
    status: "状态",
    historySignIn: "登录后查看历史记录。",
    noPersonalApi: "还没有保存个人 API Key。",
    apiSavedModel: "个人 API Key 已保存。当前模型：{model}。",
    notSelected: "未选择",
    cannotLoadAi: "无法加载 AI 设置：{message}",
    settingsSaved: "设置已保存。",
    signInFetch: "登录后才能抓取模型。",
    enterApiAgain: "请重新输入真实 API Key 后再抓取模型。",
    enterApiFirst: "请先输入 API Key。",
    fetchingModels: "正在抓取模型...",
    fetchFailed: "抓取失败：{message}",
    modelCount: "已抓取 {count} 个模型。",
    signInSave: "登录后才能保存 API 设置。",
    selectModelFirst: "请先抓取并选择模型。",
    apiSettingsSaved: "当前账号的个人 API 设置已保存。",
    saveFailed: "保存失败：{message}",
    providerChanged: "请输入 API Key，然后抓取该服务商的模型。",
    loadingHistory: "正在加载历史记录...",
    historyLoadFailed: "历史记录加载失败。",
    noHistory: "还没有生成过字幕。",
    untitledVideo: "未命名视频",
    openVideo: "打开视频",
    completed: "已完成",
    failed: "失败",
    processing: "处理中",
    sessionExpired: "登录已过期，请重新登录。",
    missingEmail: "账号邮箱缺失，请重新登录。",
    cannotVerify: "无法验证账号：{message}",
    connectionOk: "连接正常。",
    connectionFailed: "连接失败：{message}",
    enterEmail: "请先输入邮箱。",
    codeSentMessage: "登录码已发送，请检查邮箱。",
    sendCodeFailed: "无法发送登录码。",
    sendCodeFailedMessage: "无法发送登录码：{message}",
    codeSent: "已发送",
    sending: "发送中",
    enterCode: "请先输入登录码。",
    signInFailed: "登录失败。",
    signInFailedMessage: "登录失败：{message}",
    signingIn: "登录中",
    cacheCleared: "本地缓存已清空。"
  },
  ja: {
    uiLanguage: "言語",
    settingsNav: "設定",
    historyNav: "履歴",
    accountTitle: "アカウント",
    accountCopy: "ログインして API 設定と履歴を同期",
    currentAccount: "現在のアカウント",
    signOut: "ログアウト",
    emailLabel: "メール",
    sendCode: "ログインコードを送信",
    codeLabel: "ログインコード",
    signIn: "ログイン",
    translationApiTitle: "翻訳 API",
    translationApiCopy: "翻訳に使うプロバイダーを選択",
    personalApi: "個人 API キー",
    systemApi: "システム API",
    aiProvider: "AI プロバイダー",
    modelLabel: "モデル",
    apiKeyLabel: "API キー",
    aiStatusDefault: "ログイン後、API キーを入力してモデルを取得してください。",
    fetchModels: "モデルを取得",
    saveApiSettings: "API 設定を保存",
    subtitleOutputTitle: "字幕出力",
    subtitleOutputCopy: "言語と表示の設定",
    translationLanguage: "翻訳言語",
    autoLoad: "完了した字幕を自動読み込み",
    cacheTitle: "キャッシュ",
    cacheCopy: "ローカル字幕タスクの状態",
    clearCache: "ローカルキャッシュを削除",
    saveSettings: "設定を保存",
    historyTitle: "履歴",
    historyCopy: "このアカウントの字幕タスク",
    refresh: "更新",
    generatedAt: "生成日時",
    video: "動画",
    link: "リンク",
    status: "状態",
    historySignIn: "ログインすると履歴を表示できます。",
    noPersonalApi: "個人 API キーはまだ保存されていません。",
    apiSavedModel: "個人 API キーは保存済みです。現在のモデル：{model}。",
    notSelected: "未選択",
    cannotLoadAi: "AI 設定を読み込めません：{message}",
    settingsSaved: "設定を保存しました。",
    signInFetch: "モデル取得にはログインが必要です。",
    enterApiAgain: "モデル取得には API キーを再入力してください。",
    enterApiFirst: "先に API キーを入力してください。",
    fetchingModels: "モデルを取得中...",
    fetchFailed: "取得に失敗しました：{message}",
    modelCount: "{count} 件のモデルを取得しました。",
    signInSave: "API 設定の保存にはログインが必要です。",
    selectModelFirst: "先にモデルを取得して選択してください。",
    apiSettingsSaved: "このアカウントの API 設定を保存しました。",
    saveFailed: "保存に失敗しました：{message}",
    providerChanged: "API キーを入力して、このプロバイダーのモデルを取得してください。",
    loadingHistory: "履歴を読み込み中...",
    historyLoadFailed: "履歴を読み込めませんでした。",
    noHistory: "生成済み字幕はまだありません。",
    untitledVideo: "無題の動画",
    openVideo: "動画を開く",
    completed: "完了",
    failed: "失敗",
    processing: "処理中",
    sessionExpired: "セッションが切れました。再ログインしてください。",
    missingEmail: "アカウントのメールがありません。再ログインしてください。",
    cannotVerify: "アカウントを確認できません：{message}",
    connectionOk: "接続 OK。",
    connectionFailed: "接続失敗：{message}",
    enterEmail: "先にメールを入力してください。",
    codeSentMessage: "ログインコードを送信しました。メールを確認してください。",
    sendCodeFailed: "ログインコードを送信できませんでした。",
    sendCodeFailedMessage: "ログインコードを送信できませんでした：{message}",
    codeSent: "送信済み",
    sending: "送信中",
    enterCode: "先にログインコードを入力してください。",
    signInFailed: "ログインに失敗しました。",
    signInFailedMessage: "ログインに失敗しました：{message}",
    signingIn: "ログイン中",
    cacheCleared: "ローカルキャッシュを削除しました。"
  }
};

function normalizeApiBase(value) {
  return (value || DEFAULT_API_BASE).replace(/\/$/, "");
}

function t(key, values = {}) {
  const template = translations[currentLanguage]?.[key] || translations.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function applyI18n() {
  document.documentElement.lang = currentLanguage;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  nodes.aiStatus.textContent = nodes.aiStatus.dataset.dynamicText || t("aiStatusDefault");
  if (nodes.message.dataset.dynamicText) nodes.message.textContent = nodes.message.dataset.dynamicText;
  renderHistoryRows(lastHistoryRows);
}

function setDynamicText(node, value) {
  node.dataset.dynamicText = value;
  node.textContent = value;
}

function clearDynamicText(node) {
  delete node.dataset.dynamicText;
  node.textContent = "";
}

async function getApiBase() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  return normalizeApiBase(fields.apiBase.value || settings.apiBase);
}

async function load() {
  const { settings = {}, sessionToken, accountEmail } = await chrome.storage.local.get([
    "settings",
    "sessionToken",
    "accountEmail"
  ]);
  currentLanguage = settings.uiLanguage || "en";
  fields.uiLanguage.value = currentLanguage;
  applyI18n();
  fields.apiBase.value = normalizeApiBase(settings.apiBase);
  setTranslationMode(settings.translationMode || "user");
  fields.targetLang.value = settings.targetLang || "zh-Hans";
  fields.autoLoad.checked = settings.autoLoad !== false;
  clearPersonalAiFields();

  await chrome.storage.local.set({
    settings: {
      ...settings,
      apiBase: fields.apiBase.value,
      uiLanguage: currentLanguage,
      translationMode: getTranslationMode()
    }
  });

  if (sessionToken && accountEmail) {
    setLoggedIn(accountEmail);
  }
  await refreshAccount(sessionToken);
}

async function refreshAccount(sessionToken) {
  if (!sessionToken) {
    await chrome.storage.local.remove(["accountEmail"]);
    await clearPersonalAiLocalSettings();
    setLoggedOut();
    return;
  }

  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      await chrome.storage.local.remove(["sessionToken", "accountEmail"]);
      await clearPersonalAiLocalSettings();
      setLoggedOut();
      setDynamicText(nodes.message, data.error || t("sessionExpired"));
      return;
    }
    if (!data.email) {
      await chrome.storage.local.remove(["sessionToken", "accountEmail"]);
      await clearPersonalAiLocalSettings();
      setLoggedOut();
      setDynamicText(nodes.message, t("missingEmail"));
      return;
    }
    setLoggedIn(data.email);
    await chrome.storage.local.set({ accountEmail: data.email });
    await loadAiSettings(sessionToken);
  } catch (error) {
    setLoggedOut();
    setDynamicText(nodes.message, t("cannotVerify", { message: error.message }));
  }
}

async function loadAiSettings(sessionToken) {
  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/ai/settings`, {
      headers: authHeaders(sessionToken)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.configured) {
      await clearPersonalAiLocalSettings();
      setDynamicText(nodes.aiStatus, t("noPersonalApi"));
      return;
    }
    fields.aiProvider.value = data.provider || fields.aiProvider.value;
    setModelOptions(Array.isArray(data.models) ? data.models : [], data.model || "");
    fields.aiApiKey.value = data.hasApiKey ? API_KEY_MASK : "";
    setDynamicText(nodes.aiStatus, t("apiSavedModel", { model: data.model || t("notSelected") }));
  } catch (error) {
    setDynamicText(nodes.aiStatus, t("cannotLoadAi", { message: error.message }));
  }
}

function setModelOptions(models, selectedModel) {
  const uniqueModels = [...new Set(models.filter(Boolean))];
  if (selectedModel && !uniqueModels.includes(selectedModel)) uniqueModels.unshift(selectedModel);
  fields.aiModel.innerHTML = "";
  for (const model of uniqueModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    fields.aiModel.appendChild(option);
  }
  if (!uniqueModels.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Fetch models first";
    fields.aiModel.appendChild(option);
  }
  fields.aiModel.value = selectedModel || uniqueModels[0] || "";
}

function authHeaders(sessionToken) {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}

function getTranslationMode() {
  return [...fields.translationMode].find((input) => input.checked)?.value || "user";
}

function setTranslationMode(value) {
  for (const input of fields.translationMode) {
    input.checked = input.value === value;
  }
  updatePersonalAiVisibility();
}

function updatePersonalAiVisibility() {
  nodes.personalAiSection.classList.toggle("hidden", getTranslationMode() !== "user" || !hasVerifiedSession);
}

function clearPersonalAiFields() {
  fields.aiProvider.value = "gemini";
  setModelOptions([], "");
  fields.aiApiKey.value = "";
  clearDynamicText(nodes.aiStatus);
  nodes.aiStatus.textContent = t("aiStatusDefault");
}

async function clearPersonalAiLocalSettings() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  const { aiProvider, aiModel, aiModels, ...rest } = settings;
  await chrome.storage.local.set({ settings: rest });
  clearPersonalAiFields();
}

function getEnteredApiKey() {
  const value = fields.aiApiKey.value.trim();
  return value === API_KEY_MASK ? "" : value;
}

function hasMaskedApiKey() {
  return fields.aiApiKey.value.trim() === API_KEY_MASK;
}

function setLoggedIn(email) {
  hasVerifiedSession = true;
  nodes.accountEmail.textContent = email;
  nodes.accountLoggedIn.classList.remove("hidden");
  nodes.accountLoggedOut.classList.add("hidden");
  updatePersonalAiVisibility();
}

function setLoggedOut() {
  hasVerifiedSession = false;
  nodes.accountEmail.textContent = "";
  nodes.accountLoggedIn.classList.add("hidden");
  nodes.accountLoggedOut.classList.remove("hidden");
  clearPersonalAiFields();
  renderHistoryRows([]);
  updatePersonalAiVisibility();
}

function showView(view) {
  const isHistory = view === "history";
  nodes.basicView.classList.toggle("hidden", isHistory);
  nodes.historyView.classList.toggle("hidden", !isHistory);
  nodes.basicNav.classList.toggle("active", !isHistory);
  nodes.historyNav.classList.toggle("active", isHistory);
  if (isHistory) loadHistory();
}

document.getElementById("save").addEventListener("click", async () => {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({
    settings: {
      ...settings,
      apiBase: normalizeApiBase(fields.apiBase.value),
      translationMode: getTranslationMode(),
      targetLang: fields.targetLang.value || "zh-Hans",
      autoLoad: fields.autoLoad.checked,
      aiProvider: fields.aiProvider.value,
      aiModel: fields.aiModel.value,
      aiModels: [...fields.aiModel.options].map((option) => option.value).filter(Boolean)
    }
  });
  fields.apiBase.value = normalizeApiBase(fields.apiBase.value);
  setDynamicText(nodes.message, t("settingsSaved"));
});

document.getElementById("fetchModels").addEventListener("click", async () => {
  const { sessionToken } = await chrome.storage.local.get(["sessionToken"]);
  if (!sessionToken) {
    setDynamicText(nodes.aiStatus, t("signInFetch"));
    return;
  }
  const apiKey = getEnteredApiKey();
  if (!apiKey) {
    setDynamicText(nodes.aiStatus, hasMaskedApiKey() ? t("enterApiAgain") : t("enterApiFirst"));
    return;
  }
  setDynamicText(nodes.aiStatus, t("fetchingModels"));
  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/ai/models`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(sessionToken)
      },
      body: JSON.stringify({
        provider: fields.aiProvider.value,
        apiKey
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDynamicText(nodes.aiStatus, data.error || t("fetchFailed", { message: response.status }));
      return;
    }
    setModelOptions(data.models || [], data.models?.[0] || "");
    setDynamicText(nodes.aiStatus, t("modelCount", { count: data.models?.length || 0 }));
  } catch (error) {
    setDynamicText(nodes.aiStatus, t("fetchFailed", { message: error.message }));
  }
});

document.getElementById("saveAiSettings").addEventListener("click", async () => {
  const { sessionToken, settings = {} } = await chrome.storage.local.get(["sessionToken", "settings"]);
  if (!sessionToken) {
    setDynamicText(nodes.aiStatus, t("signInSave"));
    return;
  }
  const apiKey = getEnteredApiKey();
  const model = fields.aiModel.value.trim();
  if (!model) {
    setDynamicText(nodes.aiStatus, t("selectModelFirst"));
    return;
  }
  if (!apiKey && !hasMaskedApiKey()) {
    setDynamicText(nodes.aiStatus, t("enterApiFirst"));
    return;
  }
  try {
    const models = [...fields.aiModel.options].map((option) => option.value).filter(Boolean);
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/ai/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(sessionToken)
      },
      body: JSON.stringify({
        provider: fields.aiProvider.value,
        ...(apiKey ? { apiKey } : {}),
        model,
        models
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDynamicText(nodes.aiStatus, data.error || t("saveFailed", { message: response.status }));
      return;
    }
    fields.aiApiKey.value = API_KEY_MASK;
    await chrome.storage.local.set({
      settings: {
        ...settings,
        apiBase: normalizeApiBase(fields.apiBase.value),
        translationMode: getTranslationMode(),
        aiProvider: fields.aiProvider.value,
        aiModel: model,
        aiModels: models
      }
    });
    setDynamicText(nodes.aiStatus, t("apiSettingsSaved"));
  } catch (error) {
    setDynamicText(nodes.aiStatus, t("saveFailed", { message: error.message }));
  }
});

fields.aiProvider.addEventListener("change", () => {
  setModelOptions([], "");
  fields.aiApiKey.value = "";
  setDynamicText(nodes.aiStatus, t("providerChanged"));
});

for (const input of fields.translationMode) {
  input.addEventListener("change", updatePersonalAiVisibility);
}

nodes.basicNav.addEventListener("click", () => showView("basic"));
nodes.historyNav.addEventListener("click", () => showView("history"));
document.getElementById("refreshHistory").addEventListener("click", () => loadHistory());
fields.uiLanguage.addEventListener("change", async () => {
  currentLanguage = fields.uiLanguage.value;
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({ settings: { ...settings, uiLanguage: currentLanguage } });
  applyI18n();
});

async function loadHistory() {
  const { sessionToken } = await chrome.storage.local.get(["sessionToken"]);
  if (!sessionToken) {
    renderHistoryRows([]);
    return;
  }

  nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(t("loadingHistory"))}</td></tr>`;
  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/jobs/history`, {
      headers: authHeaders(sessionToken)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(data.error || t("historyLoadFailed"))}</td></tr>`;
      return;
    }
    lastHistoryRows = Array.isArray(data.history) ? data.history : [];
    renderHistoryRows(lastHistoryRows);
  } catch (error) {
    nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message || String(error))}</td></tr>`;
  }
}

function renderHistoryRows(rows) {
  if (!hasVerifiedSession) {
    nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(t("historySignIn"))}</td></tr>`;
    return;
  }
  if (!rows.length) {
    nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(t("noHistory"))}</td></tr>`;
    return;
  }
  nodes.historyRows.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(formatDate(row.createdAt))}</td>
      <td>${escapeHtml(row.title || t("untitledVideo"))}</td>
      <td><a href="${escapeAttribute(row.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(t("openVideo"))}</a></td>
      <td><span class="status-text">${escapeHtml(formatJobStatus(row.status))}</span></td>
    </tr>
  `).join("");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatJobStatus(status) {
  if (status === "completed") return t("completed");
  if (status === "failed") return t("failed");
  if (status === "cancelled") return t("failed");
  return t("processing");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

document.getElementById("testConnection").addEventListener("click", async () => {
  try {
    const response = await fetch(`${normalizeApiBase(fields.apiBase.value)}/health`);
    setDynamicText(nodes.message, response.ok ? t("connectionOk") : t("connectionFailed", { message: response.status }));
  } catch (error) {
    setDynamicText(nodes.message, t("connectionFailed", { message: error.message }));
  }
});

document.getElementById("sendMagicLink").addEventListener("click", async () => {
  const { clientId, settings = {} } = await chrome.storage.local.get(["clientId", "settings"]);
  const email = nodes.email.value.trim();
  if (!email) {
    setDynamicText(nodes.message, t("enterEmail"));
    return;
  }

  setSendMagicLinkPending();
  const apiBase = normalizeApiBase(fields.apiBase.value || settings.apiBase);
  try {
    const response = await fetch(`${apiBase}/api/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, clientId })
    });
    const data = await response.json().catch(() => ({}));
    setDynamicText(nodes.message, response.ok ? t("codeSentMessage") : data.error || t("sendCodeFailed"));
  } catch (error) {
    setDynamicText(nodes.message, t("sendCodeFailedMessage", { message: error.message }));
  } finally {
    nodes.sendMagicLink.classList.remove("loading");
    nodes.sendMagicLinkText.textContent = t("codeSent");
  }
});

function setSendMagicLinkPending() {
  nodes.sendMagicLink.disabled = true;
  nodes.sendMagicLink.classList.add("loading");
  nodes.sendMagicLinkText.textContent = t("sending");
}

document.getElementById("exchangeLoginCode").addEventListener("click", async () => {
  const apiBase = await getApiBase();
  const code = nodes.loginCode.value.trim().toUpperCase();
  if (!code) {
    setDynamicText(nodes.message, t("enterCode"));
    return;
  }

  setExchangeLoginPending(true);
  try {
    const response = await fetch(`${apiBase}/api/auth/exchange-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDynamicText(nodes.message, data.error || t("signInFailed"));
      return;
    }
    await chrome.storage.local.set({ sessionToken: data.sessionToken });
    await refreshAccount(data.sessionToken);
    nodes.loginCode.value = "";
    clearDynamicText(nodes.message);
  } catch (error) {
    setDynamicText(nodes.message, t("signInFailedMessage", { message: error.message }));
  } finally {
    setExchangeLoginPending(false);
  }
});

function setExchangeLoginPending(isPending) {
  nodes.exchangeLoginCode.disabled = isPending;
  nodes.exchangeLoginCode.classList.toggle("loading", isPending);
  nodes.exchangeLoginCodeText.textContent = isPending ? t("signingIn") : t("signIn");
}

document.getElementById("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["sessionToken", "accountEmail"]);
  await clearPersonalAiLocalSettings();
  setLoggedOut();
  clearDynamicText(nodes.message);
});

document.getElementById("clearCache").addEventListener("click", async () => {
  await chrome.storage.local.remove(["pendingJobs", "subtitleCache"]);
  setDynamicText(nodes.message, t("cacheCleared"));
});

load();
