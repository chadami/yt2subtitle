const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function popup(responses, language = 'zh-CN') {
  const html = fs.readFileSync(`${__dirname}/popup.html`, 'utf8');
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
    textContent: '', hidden: false, disabled: false, classList: { toggle() {} },
    addEventListener(type, callback) { this[type] = callback; }
  }]));
  let calls = 0;
  const context = vm.createContext({
    navigator: { language }, document: { documentElement: {}, getElementById: id => nodes[id] },
    chrome: { runtime: { sendMessage: async message => {
      assert.equal(message.type, 'GET_LOCAL_STATUS');
      const result = responses[calls++];
      if (result instanceof Error) throw result;
      return result;
    } } }
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/popup.js`, 'utf8'), context);
  await new Promise(setImmediate);
  return { nodes, calls: () => calls };
}
const connected = { ok: true, ai: { configured: true, provider: 'openai', model: 'workbuddy/deepseek-v4.1-flash' } };

test('connected popup shows the current provider and full model and hides connection guide', async () => {
  const { nodes } = await popup([connected]);
  assert.equal(nodes.state.textContent, '已连接');
  assert.equal(nodes.detail.textContent, '本机应用已就绪');
  assert.equal(nodes.provider.textContent, 'openai');
  assert.equal(nodes.model.textContent, 'workbuddy/deepseek-v4.1-flash');
  assert.equal(nodes.engine.hidden, false);
  assert.equal(nodes.connection.hidden, true);
  assert.equal(nodes.statusIcon.src, 'icons/popup-check.svg');
});

test('offline popup retries the local connection and switches to connected', async () => {
  const h = await popup([new Error('offline'), connected]);
  assert.equal(h.nodes.state.textContent, '未连接');
  assert.equal(h.nodes.connection.hidden, false);
  assert.equal(h.nodes.engine.hidden, true);
  assert.equal(h.nodes.connect.disabled, false);
  await h.nodes.connect.click();
  assert.equal(h.calls(), 2);
  assert.equal(h.nodes.state.textContent, '已连接');
  assert.equal(h.nodes.connection.hidden, true);
});

test('unconfigured AI remains a connected app with a clear empty model state', async () => {
  const { nodes } = await popup([{ ok: true, ai: { configured: false, provider: 'openai', model: 'default' } }]);
  assert.equal(nodes.state.textContent, '已连接');
  assert.equal(nodes.provider.hidden, true);
  assert.equal(nodes.model.textContent, '尚未配置 AI 模型');
});

test('failed status response exposes the retry action and supports English', async () => {
  const { nodes } = await popup([{ ok: false, error: 'unavailable' }], 'en-US');
  assert.equal(nodes.state.textContent, 'Not connected');
  assert.equal(nodes.connection.hidden, false);
  assert.equal(nodes.connectLabel.textContent, 'Connect to local app');
});
