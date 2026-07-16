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
  account.dataset.state = "active";
  accountState.textContent = "当前账号";
  accountEmail.textContent = result.status === "active" ? email || "账号状态正常" : "会员已过期";
}

function renderLoggedOut(label = "未登录") {
  account.dataset.state = "logged-out";
  accountState.textContent = "当前账号";
  accountEmail.textContent = label;
}

loadAccountState();
