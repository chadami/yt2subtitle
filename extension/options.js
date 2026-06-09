const DEFAULT_API_BASE = "https://subtitle.invisiblewind.cn";

const fields = {
  apiBase: document.getElementById("apiBase"),
  targetLang: document.getElementById("targetLang"),
  autoLoad: document.getElementById("autoLoad")
};

const nodes = {
  accountStatus: document.getElementById("accountStatus"),
  accountLoggedIn: document.getElementById("accountLoggedIn"),
  accountLoggedOut: document.getElementById("accountLoggedOut"),
  accountEmail: document.getElementById("accountEmail"),
  email: document.getElementById("email"),
  loginCode: document.getElementById("loginCode"),
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
  fields.targetLang.value = settings.targetLang || "zh-Hans";
  fields.autoLoad.checked = settings.autoLoad !== false;

  await chrome.storage.local.set({
    settings: {
      ...settings,
      apiBase: fields.apiBase.value
    }
  });

  await refreshAccount(sessionToken);
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
  } catch (error) {
    setLoggedOut();
    nodes.message.textContent = `Cannot verify account: ${error.message}`;
  }
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
  await chrome.storage.local.set({
    settings: {
      apiBase: normalizeApiBase(fields.apiBase.value),
      targetLang: fields.targetLang.value || "zh-Hans",
      autoLoad: fields.autoLoad.checked
    }
  });
  fields.apiBase.value = normalizeApiBase(fields.apiBase.value);
  nodes.message.textContent = "Settings saved.";
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
