const fields = {
  apiBase: document.getElementById("apiBase"),
  targetLang: document.getElementById("targetLang"),
  autoLoad: document.getElementById("autoLoad"),
  notifications: document.getElementById("notifications")
};
const message = document.getElementById("message");

async function load() {
  const { settings = {}, sessionToken } = await chrome.storage.local.get(["settings", "sessionToken"]);
  fields.apiBase.value = settings.apiBase || "";
  fields.targetLang.value = settings.targetLang || "zh-Hans";
  fields.autoLoad.checked = settings.autoLoad !== false;
  fields.notifications.checked = settings.notifications !== false;
  document.getElementById("accountStatus").textContent = sessionToken ? "Logged in" : "Anonymous user";

  const token = location.hash.match(/token=([^&]+)/)?.[1];
  if (token) {
    await chrome.storage.local.set({ sessionToken: decodeURIComponent(token) });
    history.replaceState(null, "", location.pathname);
    document.getElementById("accountStatus").textContent = "Logged in";
  }
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    settings: {
      apiBase: fields.apiBase.value.replace(/\/$/, ""),
      targetLang: fields.targetLang.value || "zh-Hans",
      autoLoad: fields.autoLoad.checked,
      notifications: fields.notifications.checked
    }
  });
  message.textContent = "Saved.";
});

document.getElementById("testConnection").addEventListener("click", async () => {
  try {
    const response = await fetch(`${fields.apiBase.value.replace(/\/$/, "")}/health`);
    message.textContent = response.ok ? "Connection OK." : `Connection failed: ${response.status}`;
  } catch (error) {
    message.textContent = `Connection failed: ${error.message}`;
  }
});

document.getElementById("sendMagicLink").addEventListener("click", async () => {
  const { clientId, settings = {} } = await chrome.storage.local.get(["clientId", "settings"]);
  const email = document.getElementById("email").value;
  const apiBase = fields.apiBase.value || settings.apiBase;
  await fetch(`${apiBase.replace(/\/$/, "")}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, clientId })
  });
  message.textContent = "Login link sent. Check your email.";
});

document.getElementById("clearCache").addEventListener("click", async () => {
  await chrome.storage.local.remove(["pendingJobs"]);
  message.textContent = "Local cache cleared.";
});

load();
