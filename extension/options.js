const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";
const API_KEY_MASK = "********";

const fields = {
  apiBase: document.getElementById("apiBase"),
  translationMode: document.querySelectorAll("input[name='translationMode']"),
  targetLang: document.getElementById("targetLang"),
  autoLoad: document.getElementById("autoLoad"),
  aiProvider: document.getElementById("aiProvider"),
  aiApiKey: document.getElementById("aiApiKey"),
  aiModel: document.getElementById("aiModel")
};

const nodes = {
  accountStatus: document.getElementById("accountStatus"),
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

function normalizeApiBase(value) {
  return (value || DEFAULT_API_BASE).replace(/\/$/, "");
}

async function getApiBase() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  return normalizeApiBase(fields.apiBase.value || settings.apiBase);
}

async function load() {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  fields.apiBase.value = normalizeApiBase(settings.apiBase);
  setTranslationMode(settings.translationMode || "user");
  fields.targetLang.value = settings.targetLang || "zh-Hans";
  fields.autoLoad.checked = settings.autoLoad !== false;
  clearPersonalAiFields();

  await chrome.storage.local.set({
    settings: {
      ...settings,
      apiBase: fields.apiBase.value,
      translationMode: getTranslationMode()
    }
  });

  await refreshAccount(sessionToken);
}

async function refreshAccount(sessionToken) {
  if (!sessionToken) {
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
      await chrome.storage.local.remove(["sessionToken"]);
      await clearPersonalAiLocalSettings();
      setLoggedOut();
      nodes.message.textContent = data.error || "Session expired. Please sign in again.";
      return;
    }
    if (!data.email) {
      await chrome.storage.local.remove(["sessionToken"]);
      await clearPersonalAiLocalSettings();
      setLoggedOut();
      nodes.message.textContent = "Account email is missing. Please sign in again.";
      return;
    }
    setLoggedIn(data.email);
    await loadAiSettings(sessionToken);
  } catch (error) {
    setLoggedOut();
    nodes.message.textContent = `Cannot verify account: ${error.message}`;
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
      nodes.aiStatus.textContent = "No personal API key saved yet.";
      return;
    }
    fields.aiProvider.value = data.provider || fields.aiProvider.value;
    setModelOptions(Array.isArray(data.models) ? data.models : [], data.model || "");
    fields.aiApiKey.value = data.hasApiKey ? API_KEY_MASK : "";
    nodes.aiStatus.textContent = `Personal API key saved. Current model: ${data.model || "not selected"}.`;
  } catch (error) {
    nodes.aiStatus.textContent = `Cannot load AI settings: ${error.message}`;
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
  nodes.aiStatus.textContent = "Sign in, enter an API key, then fetch models.";
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
  nodes.accountStatus.textContent = "Signed in";
  nodes.accountEmail.textContent = email;
  nodes.accountLoggedIn.classList.remove("hidden");
  nodes.accountLoggedOut.classList.add("hidden");
  updatePersonalAiVisibility();
}

function setLoggedOut() {
  hasVerifiedSession = false;
  nodes.accountStatus.textContent = "Signed out";
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
  nodes.message.textContent = "Settings saved.";
});

document.getElementById("fetchModels").addEventListener("click", async () => {
  const { sessionToken } = await chrome.storage.local.get(["sessionToken"]);
  if (!sessionToken) {
    nodes.aiStatus.textContent = "Sign in before fetching models.";
    return;
  }
  const apiKey = getEnteredApiKey();
  if (!apiKey) {
    nodes.aiStatus.textContent = hasMaskedApiKey()
      ? "Enter the API key again to fetch models."
      : "Enter an API key first.";
    return;
  }
  nodes.aiStatus.textContent = "Fetching models...";
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
      nodes.aiStatus.textContent = data.error || `Fetch failed: ${response.status}`;
      return;
    }
    setModelOptions(data.models || [], data.models?.[0] || "");
    nodes.aiStatus.textContent = `${data.models?.length || 0} models fetched.`;
  } catch (error) {
    nodes.aiStatus.textContent = `Fetch failed: ${error.message}`;
  }
});

document.getElementById("saveAiSettings").addEventListener("click", async () => {
  const { sessionToken, settings = {} } = await chrome.storage.local.get(["sessionToken", "settings"]);
  if (!sessionToken) {
    nodes.aiStatus.textContent = "Sign in before saving your API settings.";
    return;
  }
  const apiKey = getEnteredApiKey();
  const model = fields.aiModel.value.trim();
  if (!model) {
    nodes.aiStatus.textContent = "Fetch and select a model first.";
    return;
  }
  if (!apiKey && !hasMaskedApiKey()) {
    nodes.aiStatus.textContent = "Enter an API key first.";
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
      nodes.aiStatus.textContent = data.error || `Save failed: ${response.status}`;
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
    nodes.aiStatus.textContent = "Personal API settings saved for this account.";
  } catch (error) {
    nodes.aiStatus.textContent = `Save failed: ${error.message}`;
  }
});

fields.aiProvider.addEventListener("change", () => {
  setModelOptions([], "");
  fields.aiApiKey.value = "";
  nodes.aiStatus.textContent = "Enter an API key, then fetch models for this provider.";
});

for (const input of fields.translationMode) {
  input.addEventListener("change", updatePersonalAiVisibility);
}

nodes.basicNav.addEventListener("click", () => showView("basic"));
nodes.historyNav.addEventListener("click", () => showView("history"));
document.getElementById("refreshHistory").addEventListener("click", () => loadHistory());

async function loadHistory() {
  const { sessionToken } = await chrome.storage.local.get(["sessionToken"]);
  if (!sessionToken) {
    renderHistoryRows([]);
    return;
  }

  nodes.historyRows.innerHTML = `<tr><td colspan="4">Loading history...</td></tr>`;
  try {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/jobs/history`, {
      headers: authHeaders(sessionToken)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(data.error || "Failed to load history.")}</td></tr>`;
      return;
    }
    renderHistoryRows(Array.isArray(data.history) ? data.history : []);
  } catch (error) {
    nodes.historyRows.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message || String(error))}</td></tr>`;
  }
}

function renderHistoryRows(rows) {
  if (!hasVerifiedSession) {
    nodes.historyRows.innerHTML = `<tr><td colspan="4">Sign in to view history.</td></tr>`;
    return;
  }
  if (!rows.length) {
    nodes.historyRows.innerHTML = `<tr><td colspan="4">No generated subtitles yet.</td></tr>`;
    return;
  }
  nodes.historyRows.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(formatDate(row.createdAt))}</td>
      <td>${escapeHtml(row.title || "Untitled video")}</td>
      <td><a href="${escapeAttribute(row.url || "#")}" target="_blank" rel="noreferrer">Open video</a></td>
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
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "失败";
  return "处理中";
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
    nodes.message.textContent = response.ok ? "Connection OK." : `Connection failed: ${response.status}`;
  } catch (error) {
    nodes.message.textContent = `Connection failed: ${error.message}`;
  }
});

document.getElementById("sendMagicLink").addEventListener("click", async () => {
  const { clientId, settings = {} } = await chrome.storage.local.get(["clientId", "settings"]);
  const email = nodes.email.value.trim();
  if (!email) {
    nodes.message.textContent = "Enter your email first.";
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
    nodes.message.textContent = response.ok ? "Sign-in code sent. Check your email." : data.error || "Could not send sign-in code.";
  } catch (error) {
    nodes.message.textContent = `Could not send sign-in code: ${error.message}`;
  } finally {
    nodes.sendMagicLink.classList.remove("loading");
    nodes.sendMagicLinkText.textContent = "Code sent";
  }
});

function setSendMagicLinkPending() {
  nodes.sendMagicLink.disabled = true;
  nodes.sendMagicLink.classList.add("loading");
  nodes.sendMagicLinkText.textContent = "Sending";
}

document.getElementById("exchangeLoginCode").addEventListener("click", async () => {
  const apiBase = await getApiBase();
  const code = nodes.loginCode.value.trim().toUpperCase();
  if (!code) {
    nodes.message.textContent = "Enter the sign-in code first.";
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
      nodes.message.textContent = data.error || "Sign-in failed.";
      return;
    }
    await chrome.storage.local.set({ sessionToken: data.sessionToken });
    await refreshAccount(data.sessionToken);
    nodes.loginCode.value = "";
    nodes.message.textContent = "Signed in.";
  } catch (error) {
    nodes.message.textContent = `Sign-in failed: ${error.message}`;
  } finally {
    setExchangeLoginPending(false);
  }
});

function setExchangeLoginPending(isPending) {
  nodes.exchangeLoginCode.disabled = isPending;
  nodes.exchangeLoginCode.classList.toggle("loading", isPending);
  nodes.exchangeLoginCodeText.textContent = isPending ? "Signing in" : "Sign in";
}

document.getElementById("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["sessionToken"]);
  await clearPersonalAiLocalSettings();
  setLoggedOut();
  nodes.message.textContent = "Signed out.";
});

document.getElementById("clearCache").addEventListener("click", async () => {
  await chrome.storage.local.remove(["pendingJobs", "subtitleCache"]);
  nodes.message.textContent = "Local cache cleared.";
});

load();
