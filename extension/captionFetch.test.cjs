const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const playerCode = source.slice(source.indexOf('async function fetchCaptionResponse('), source.indexOf('function selectCaptionTrack('));
const cueCode = source.slice(source.indexOf('function captionRequestUrls('), source.indexOf('function parseTranscriptXml('));
const helpers = source.slice(source.indexOf('function parseJson3Cues('), source.indexOf('function ensurePlayerControlStyles('));
const videoId = 'test-video';
const baseUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`;
const player = { videoDetails: { videoId }, playabilityStatus: { status: 'OK' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl }] } } };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body });
const html = value => `var ytInitialPlayerResponse = ${JSON.stringify(value)}; "INNERTUBE_API_KEY":"test-key"`;
function context(fetch, entries = []) {
 const ctx = vm.createContext({ fetch, URL, AbortSignal, recentCaptionRequestUrls: [], performance: { getEntriesByType: () => entries }, parseTranscriptXml: () => [], warmUpCaptionSession: async () => false });
 vm.runInContext(playerCode + cueCode + helpers, ctx);
 return ctx;
}
test('web captions are used before calling an alternate client', async () => {
 let calls = 0;
 const ctx = context(async () => { calls++; return response(html(player)); });
 const result = await ctx.fetchPlayerResponse(videoId);
 assert.equal(result.videoDetails.videoId, videoId);
 assert.equal(calls, 1);
});
test('missing web captions fall back to a usable alternate response', async () => {
 let calls = 0;
 const ctx = context(async () => response(++calls === 1 ? html({ videoDetails: { videoId }, playabilityStatus: { status: 'OK' } }) : player));
 assert.equal((await ctx.fetchPlayerResponse(videoId)).videoDetails.videoId, videoId);
 assert.equal(calls, 2);
});
test('HTTP 200 with LOGIN_REQUIRED is reported as verification, not missing captions', async () => {
 let calls = 0;
 const blocked = { playabilityStatus: { status: 'LOGIN_REQUIRED' } };
 const ctx = context(async () => response(++calls === 1 ? html(blocked) : blocked));
 await assert.rejects(ctx.fetchPlayerResponse(videoId), /验证当前访问/);
});
test('captions for another video are not accepted', async () => {
 const wrong = { ...player, videoDetails: { videoId: 'old-video' } };
 const ctx = context(async () => response(html(wrong)));
 await assert.rejects(ctx.fetchPlayerResponse(videoId), /未返回可用字幕轨道/);
});
test('empty XML response falls back to JSON3 without parsing empty JSON', async () => {
 let calls = 0;
 const ctx = context(async () => response(++calls === 1 ? '' : { events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] }] }));
 const cues = await ctx.fetchCaptionCues({ baseUrl });
 assert.equal(cues.length, 1);
 assert.equal(cues[0].start, 1);
 assert.equal(cues[0].end, 3);
 assert.equal(cues[0].text, 'Hello');
});
test('native session URL is reused only for the exact video, language and variant', async () => {
 const matching = baseUrl + '&pot=session&fmt=json3';
 const ctx = context(async url => {
  assert.equal(url, matching);
  return response({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Native' }] }] });
 }, [{ name: matching }, { name: matching.replace('lang=en', 'lang=ja') }, { name: matching.replace(videoId, 'other') }, { name: matching + '&variant=other' }]);
 assert.equal((await ctx.fetchCaptionCues({ baseUrl }))[0].text, 'Native');
});
test('empty responses give a recovery message instead of a JSON parse error', async () => {
 const ctx = context(async () => response(''));
 await assert.rejects(ctx.fetchCaptionCues({ baseUrl }), /已找到字幕轨道.*开启原生字幕/);
});
test('HTTP failures retain diagnostic status', async () => {
 const ctx = context(async () => response('', 429));
 await assert.rejects(ctx.fetchCaptionCues({ baseUrl }), /HTTP 429/);
});

test('native auto-translated captions are never reused as source text', async () => {
 const translatedUrl = baseUrl + '&tlang=zh-Hans&fmt=json3';
 const seen = [];
 const ctx = context(async url => {
  seen.push(url);
  assert.equal(new URL(url).searchParams.has('tlang'), false);
  return response({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'English source' }] }] });
 }, [{ name: translatedUrl }]);
 assert.equal((await ctx.fetchCaptionCues({ baseUrl }))[0].text, 'English source');
 assert.equal(seen.length, 1);
});
test('translation parameters in a supplied track URL are removed before downloading source', async () => {
 const ctx = context(async url => {
  assert.equal(new URL(url).searchParams.has('tlang'), false);
  return response({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Original' }] }] });
 });
 assert.equal((await ctx.fetchCaptionCues({ baseUrl: baseUrl + '&tlang=zh' }))[0].text, 'Original');
});

test('automatic source captions reuse the current video player session from an author track', async () => {
 const native = 'https://www.youtube.com/api/timedtext?v=' + videoId + '&lang=en&name=CC1&pot=proof&potc=1&c=WEB&cver=current&fmt=json3';
 const ctx = context(async url => {
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('pot'), 'proof');
  assert.equal(parsed.searchParams.get('kind'), 'asr');
  assert.equal(parsed.searchParams.has('name'), false);
  assert.equal(parsed.searchParams.get('lang'), 'en');
  return response({events:[{tStartMs:0,dDurationMs:1000,segs:[{utf8:'Automatic source'}]}]});
 }, [{ name: native }]);
 assert.equal((await ctx.fetchCaptionCues({ baseUrl }))[0].text,'Automatic source');
});

test('session parameters from another video or an auto-translated request are not reused', () => {
 const native = baseUrl + '&pot=proof';
 const ctx = context(async()=>response(''), [
  { name: native.replace(videoId, 'other-video') },
  { name: native + '&tlang=zh' },
  { name: native.replace('https://www.youtube.com','https://example.com') }
 ]);
 assert.ok(ctx.captionRequestUrls({baseUrl}).every(url=>!new URL(url).searchParams.has('pot')));
});

test('observed caption sessions survive eviction from the resource timing buffer', async () => {
 const ctx=context(async url=>{
  assert.equal(new URL(url).searchParams.get('pot'),'retained');
  return response({events:[{tStartMs:0,dDurationMs:1000,segs:[{utf8:'Retained'}]}]});
 });
 ctx.recentCaptionRequestUrls.push(baseUrl+'&pot=retained&fmt=json3');
 assert.equal((await ctx.fetchCaptionCues({baseUrl}))[0].text,'Retained');
});
