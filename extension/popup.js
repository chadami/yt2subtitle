const account = document.getElementById("account");
const accountState = document.getElementById("accountState");
const accountEmail = document.getElementById("accountEmail");

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function loadAccountState() {
  const { sessionToken, accountEmail: email } = await chrome.storage.local.get(["sessionToken", "accountEmail"]);
  if (!sessionToken) {
    renderLoggedOut();
    return;
  }
  const result = await chrome.runtime.sendMessage({ type: "GET_ENTITLEMENTS" }).catch(() => null);
  if (!result?.ok) {
    renderLoggedOut("登录已失效");
    return;
  }
  const planNames = { free: "免费版", standard: "年费会员", contributor: "贡献会员" };
  account.dataset.state = "active";
  accountState.textContent = result.status === "active" ? `已登录 · ${planNames[result.plan] || result.plan || "账号正常"}` : "会员已过期";
  accountEmail.textContent = email || "账号状态正常";
}

function renderLoggedOut(label = "未登录") {
  account.dataset.state = "logged-out";
  accountState.textContent = label;
  accountEmail.textContent = "打开设置后登录";
}

loadAccountState();
