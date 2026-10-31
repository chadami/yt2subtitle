const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
function extract(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

async function refreshEngine(status, settings = {}) {
  const nodes = new Map();
  const messages = [];
  const panel = { querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { dataset: {} });
    return nodes.get(selector);
  } };
  const context = vm.createContext({
    document: { getElementById: () => panel }, PLAYER_PANEL_ID: 'panel',
    DEFAULT_SUBTITLE_STYLE: {}, panelVideoId: '', panelStateRevision: 0, panelActionInProgress: false,
    chrome: {
      storage: { local: { get: async () => ({ settings, sessionToken: 'token' }) } },
      runtime: { sendMessage: async message => {
        messages.push(message.type);
        if (status instanceof Error) throw status;
        return status;
      } }
    },
    syncPanelStyleControls() {}, getVideoId: () => '', setPanelState() {}
  });
  vm.runInContext(extract('async function refreshPlayerPanel(', 'function machineTranslationStatus('), context);
  await vm.runInContext('refreshPlayerPanel()', context);
  assert.deepEqual(messages, ['GET_LOCAL_STATUS']);
  return nodes.get('[data-role="engine"]').textContent;
}

test('player settings displays the app engine and model without extension AI settings', async () => {
  assert.equal(await refreshEngine({ ok: true, ai: {
    configured: true, provider: 'deepseek', model: 'deepseek-chat'
  } }), 'DeepSeek · deepseek-chat');
});

test('current app configuration takes precedence over stale extension settings', async () => {
  assert.equal(await refreshEngine({ ok: true, ai: {
    configured: true, provider: 'mimo', model: 'mimo-v2-flash'
  } }, { aiProvider: 'openai', aiModel: 'old-model' }), 'MiMo · mimo-v2-flash');
});

test('an unconfigured app does not display an old engine', async () => {
  assert.equal(await refreshEngine({ ok: true, ai: { configured: false } }, {
    aiProvider: 'openai', aiModel: 'old-model'
  }), '未设置');
});

test('connection failure leaves cached engine available and does not reject panel refresh', async () => {
  assert.equal(await refreshEngine(new Error('offline'), {
    aiProvider: 'gemini', aiModel: 'gemini-2.5-flash'
  }), 'Gemini · gemini-2.5-flash');
});

test('player settings keeps engine and subtitle styles while removing more settings entry', () => {
  const panel = { setAttribute() {}, addEventListener() {} };
  const context = vm.createContext({
    document: { getElementById: () => null, createElement: () => panel },
    PLAYER_PANEL_ID: 'panel', chrome: { runtime: { getURL: path => path } },
    panelIcon: () => '', handlePanelClick() {}, handlePanelChange() {}, handlePanelStyleInput() {}
  });
  vm.runInContext(extract('function createPlayerPanel(', 'function ensurePlayerControl('), context);
  vm.runInContext('createPlayerPanel()', context);
  assert.doesNotMatch(panel.innerHTML, /更多设置|data-action="settings"/);
  assert.match(panel.innerHTML, /data-role="engine"/);
  assert.match(panel.innerHTML, /data-action="style"/);
});
