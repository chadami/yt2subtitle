const account = document.getElementById("account");
const accountState = document.getElementById("accountState");
const accountEmail = document.getElementById("accountEmail");
const popupSubtitle = document.getElementById("popupSubtitle");
const popupHint = document.getElementById("popupHint");
const openOptions = document.getElementById("openOptions");

const translations = {
  en: {
    subtitle: "AI translation for YouTube subtitles",
    currentAccount: "Current account",
    checkingAccount: "Checking account…",
    accountActive: "Account is active",
    membershipExpired: "Membership expired",
    signedOut: "Not signed in",
    sessionExpired: "Session expired",
    openSettings: "Open settings",
    hint: "Subtitle display, auto-translation, and subtitle style are available in the YouTube player controls."
  },
  "zh-Hans": {
    subtitle: "YouTube 字幕 AI 翻译插件",
    currentAccount: "当前账号",
    checkingAccount: "正在检查账号…",
    accountActive: "账号状态正常",
    membershipExpired: "会员已过期",
    signedOut: "未登录",
    sessionExpired: "登录已失效",
    openSettings: "打开设置",
    hint: "字幕开启、自动翻译和字幕样式已移到 YouTube 播放器控制栏。"
  },
  ja: {
    subtitle: "YouTube 字幕の AI 翻訳拡張機能",
    currentAccount: "現在のアカウント",
    checkingAccount: "アカウントを確認中…",
    accountActive: "アカウントは有効です",
    membershipExpired: "メンバーシップの有効期限が切れています",
    signedOut: "ログインしていません",
    sessionExpired: "セッションの有効期限が切れました",
    openSettings: "設定を開く",
    hint: "字幕表示、自動翻訳、字幕スタイルは YouTube プレーヤーのコントロールから設定できます。"
  }
};

let currentLanguage = "en";

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "en";
  document.documentElement.lang = currentLanguage;
  popupSubtitle.textContent = t("subtitle");
  accountState.textContent = t("currentAccount");
  accountEmail.textContent = t("checkingAccount");
  openOptions.textContent = t("openSettings");
  popupHint.textContent = t("hint");
}

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function loadAccountState() {
  const {
    sessionToken,
    accountEmail: email,
    entitlementsStatus
  } = await chrome.storage.local.get(["sessionToken", "accountEmail", "entitlementsStatus"]);
  if (!sessionToken) {
    renderLoggedOut();
    return;
  }

  renderAccount(email, entitlementsStatus);

  const result = await chrome.runtime.sendMessage({ type: "GET_ENTITLEMENTS" }).catch(() => null);
  if (!result?.ok) {
    const { sessionToken: currentToken } = await chrome.storage.local.get(["sessionToken"]);
    if (!currentToken) renderLoggedOut(t("sessionExpired"));
    return;
  }
  renderAccount(email, result.status);
}

function renderAccount(email, status = "active") {
  account.dataset.state = "active";
  accountState.textContent = t("currentAccount");
  accountEmail.textContent = status === "active" ? email || t("accountActive") : t("membershipExpired");
}

function renderLoggedOut(label = t("signedOut")) {
  account.dataset.state = "logged-out";
  accountState.textContent = t("currentAccount");
  accountEmail.textContent = label;
}

async function load() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  applyLanguage(settings.uiLanguage || "en");
  await loadAccountState();
}

load();
