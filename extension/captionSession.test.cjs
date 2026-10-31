const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const helper = source.slice(source.indexOf('async function warmUpCaptionSession('), source.indexOf('function captionRequestUrls('));
const fetchCode = source.slice(source.indexOf('async function fetchCaptionCues('), source.indexOf('function parseTranscriptXml('));
const url = 'https://www.youtube.com/api/timedtext?v=v&lang=en&kind=asr&pot=proof&fmt=json3';

function setup({cc = false, timeout = false, navigate = false, userChanges = false, broken = false} = {}) {
  let enabled = cc, clicks = 0, removed = false, hidden = false, videoId = 'v';
  const listeners = new Map(), entries = [];
  const button = { isConnected: true, contains: target => target === button,
    getAttribute: () => String(enabled), click() {
      clicks++; enabled = !enabled;
      if (broken) throw new Error('Player unavailable');
      if (navigate) videoId = 'next';
      if (userChanges) { enabled = false; listeners.get('click')({isTrusted:true,type:'click',target:button}); }
      if (!timeout) entries.push({name:url,startTime:11});
    } };
  const player = {querySelector: () => button, appendChild() {},
    classList: { add() {hidden = true;}, remove() {hidden = false;} } };
  const ctx = vm.createContext({URL, captionSessionWarmup:null, recentCaptionRequestUrls:[],
    getVideoId: () => videoId, performance: {now: () => 10, getEntriesByType: () => entries},
    document: {querySelector: () => player, createElement: () => ({remove() {removed = true;}}),
      addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)},
    setTimeout: fn => {queueMicrotask(fn);return 1;}
  });
  vm.runInContext(helper, ctx);
  return {ctx, state: () => ({enabled,clicks,removed,hidden,listeners:listeners.size})};
}

test('CC off initializes a caption session and restores off without playing video', async () => {
  const h = setup();
  assert.equal(await h.ctx.warmUpCaptionSession({baseUrl:url}),true);
  assert.deepEqual(h.state(),{enabled:false,clicks:2,removed:true,hidden:false,listeners:0});
  assert.equal(h.ctx.recentCaptionRequestUrls[0],url);
});

test('CC already on is preserved without toggling', async () => {
  const h = setup({cc:true});
  assert.equal(await h.ctx.warmUpCaptionSession({baseUrl:url}),false);
  assert.equal(h.state().clicks,0);
  assert.equal(h.state().enabled,true);
});

test('timeout restores CC and always removes temporary hiding and event listeners', async () => {
  const h = setup({timeout:true});
  assert.equal(await h.ctx.warmUpCaptionSession({baseUrl:url}),false);
  assert.deepEqual(h.state(),{enabled:false,clicks:2,removed:true,hidden:false,listeners:0});
});

test('navigation or a user CC change must not toggle captions back', async () => {
  for (const options of [{navigate:true},{userChanges:true}]) {
    const h = setup(options);
    assert.equal(await h.ctx.warmUpCaptionSession({baseUrl:url}),false);
    assert.equal(h.state().clicks,1);
    assert.equal(h.state().hidden,false);
    assert.equal(h.state().listeners,0);
  }
});

test('concurrent caption requests share one warmup', async () => {
  const h = setup();
  assert.deepEqual(await Promise.all([h.ctx.warmUpCaptionSession({baseUrl:url}),h.ctx.warmUpCaptionSession({baseUrl:url})]),[true,true]);
  assert.equal(h.state().clicks,2);
});

test('caption fetch retries with refreshed proof once, not recursively forever', async () => {
  let warmed = 0, calls = 0;
  const ctx = vm.createContext({captionRequestUrls: () => ['url'],
    fetchCaptionResponse: async () => ({status:200,ok:true,text:async()=>{calls++;return warmed?'fresh':'';}}),
    parseTranscriptXml: () => [{text:'Source captions'}],
    warmUpCaptionSession: async () => {warmed++;return true;}
  });
  vm.runInContext(fetchCode,ctx);
  assert.equal((await ctx.fetchCaptionCues({baseUrl:url}))[0].text,'Source captions');
  assert.equal(warmed,1); assert.equal(calls,2);
  ctx.fetchCaptionResponse = async () => ({status:200,ok:true,text:async()=>''});
  await assert.rejects(ctx.fetchCaptionCues({baseUrl:url}),/YouTube 未返回可用字幕内容/);
  assert.equal(warmed,2,'one warmup per fetch attempt');
});
