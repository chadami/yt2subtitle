const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";

const fields = {
  apiBase: document.getElementById("apiBase"),
  translationMode: document.getElementById("translationMode"),
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
  aiStatus: document.getElementById("aiStatus"),
  message: document.getElementById("message")
};

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
  fields.translationMode.value = settings.translationMode || "user";
  fields.targetLang.value = settings.targetLang || "zh-Hans";
  fields.autoLoad.checked = settings.autoLoad !== false;
  fields.aiProvider.value = settings.aiProvider || "gemini";
  setModelOptions(settings.aiModels || [], settings.aiModel || "");

  await chrome.storage.local.set({
    settings: {
      ...settings,
      apiBase: fields.apiBase.value,
      translationMode: fields.translationMode.value
    }
  });

  await refreshAccount(sessionToken);
  if (sessionToken) await loadAiSettings(sessionToken);
}

async function refreshAccount(sessionToken) {
  if (!sessionToken) {
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
      setLoggedOut();
      nodes.message.textContent = data.error || "Session expired. Please log in again.";
      return;
    }
    setLoggedIn(data.email || "Email verified");
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
      nodes.aiStatus.textContent = "No personal API saved yet.";
      return;
    }
    fields.aiProvider.value = data.provider || fields.aiProvider.value;
    setModelOptions(Array.isArray(data.models) ? data.models : [], data.model || "");
    fields.aiApiKey.value = "";
    nodes.aiStatus.textContent = `Personal API saved. Current model: ${data.model || "not selected"}.`;
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

function setLoggedIn(email) {
  nodes.accountStatus.textContent = "Logged in";
  nodes.accountEmail.textContent = email;
  nodes.accountLoggedIn.classList.remove("hidden");
  nodes.accountLoggedOut.classList.add("hidden");
}

function setLoggedOut() {
  nodes.accountStatus.textContent = "Not logged in";
  nodes.accountEmail.textContent = "";
  nodes.accountLoggedIn.classList.add("hidden");
  nodes.accountLoggedOut.classList.remove("hidden");
}

document.getElementById("save").addEventListener("click", async () => {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  await chrome.storage.local.set({
    settings: {
      ...settings,
      apiBase: normalizeApiBase(fields.apiBase.value),
      translationMode: fields.translationMode.value || "user",
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
    nodes.aiStatus.textContent = "Log in with email before fetching models.";
    return;
  }
  const apiKey = fields.aiApiKey.value.trim();
  if (!apiKey) {
    nodes.aiStatus.textContent = "Enter an API Key first.";
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
    nodes.aiStatus.textContent = "Log in with email before saving your API.";
    return;
  }
  const apiKey = fields.aiApiKey.value.trim();
  const model = fields.aiModel.value.trim();
  if (!apiKey || !model) {
    nodes.aiStatus.textContent = "Enter an API Key and fetch/select a model first.";
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
        apiKey,
        model,
        models
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      nodes.aiStatus.textContent = data.error || `Save failed: ${response.status}`;
      return;
    }
    fields.aiApiKey.value = "";
    await chrome.storage.local.set({
      settings: {
        ...settings,
        apiBase: normalizeApiBase(fields.apiBase.value),
        translationMode: fields.translationMode.value || "user",
        aiProvider: fields.aiProvider.value,
        aiModel: model,
        aiModels: models
      }
    });
    nodes.aiStatus.textContent = "Personal API saved for this email.";
  } catch (error) {
    nodes.aiStatus.textContent = `Save failed: ${error.message}`;
  }
});

fields.aiProvider.addEventListener("change", () => {
  setModelOptions([], "");
  fields.aiApiKey.value = "";
  nodes.aiStatus.textContent = "Enter an API Key, then fetch models for this brand.";
});

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

  const apiBase = normalizeApiBase(fields.apiBase.value || settings.apiBase);
  const response = await fetch(`${apiBase}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, clientId })
  });
  const data = await response.json().catch(() => ({}));
  nodes.message.textContent = response.ok ? "Login link sent. Check your email." : data.error || "Login link failed.";
});

document.getElementById("exchangeLoginCode").addEventListener("click", async () => {
  const apiBase = await getApiBase();
  const code = nodes.loginCode.value.trim().toUpperCase();
  if (!code) {
    nodes.message.textContent = "Enter the login code first.";
    return;
  }

  const response = await fetch(`${apiBase}/api/auth/exchange-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    nodes.message.textContent = data.error || "Login failed.";
    return;
  }
  await chrome.storage.local.set({ sessionToken: data.sessionToken });
  await refreshAccount(data.sessionToken);
  nodes.loginCode.value = "";
  nodes.message.textContent = "Logged in.";
});

document.getElementById("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["sessionToken"]);
  setLoggedOut();
  nodes.message.textContent = "Logged out.";
});

document.getElementById("clearCache").addEventListener("click", async () => {
  await chrome.storage.local.remove(["pendingJobs", "subtitleCache"]);
  nodes.message.textContent = "Local cache cleared.";
});

load();
