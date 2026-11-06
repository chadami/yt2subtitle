const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const extract = (a,b) => source.slice(source.indexOf(a), source.indexOf(b,source.indexOf(a)));
const completedCode = extract('async function loadCompletedJobSubtitles(', 'async function pollPartialSubtitles(');

test('completion replaces playback preview with all final cues without downloading captions again', async () => {
 let rendered, stopped = 0;
 const ctx = vm.createContext({getVideoId:()=> 'v', stopPlaybackPreview:async()=>{stopped++;},stopPartialSubtitlePolling(){},
  playbackAiCues:[{text:'old'}],machinePreviewCues:[{text:'machine'}],machinePreviewFeedback:{},
  renderSubtitles:async(cues,id,options)=>{rendered={cues,id,options};return {loaded:true};},
  tryLoadSubtitle(){assert.fail('must not fetch source captions to load a completed job');}});
 vm.runInContext(completedCode,ctx);
 const cues=[{start:881.48,end:886.2,text:'这样这个视频就能有个完美的结尾。'}];
 assert.equal((await ctx.loadCompletedJobSubtitles({ok:true,status:'completed',aiCues:cues},'v')).loaded,true);
 assert.equal(stopped,1);assert.equal(rendered.cues,cues);
 assert.equal(rendered.options.pendingText,'');assert.equal(rendered.options.replaceCurrentCue,true);
 assert.equal(ctx.playbackAiCues.length,0);assert.equal(ctx.machinePreviewCues.length,0);
});

test('completed status alone cannot report successfully loaded subtitles', async () => {
 const ctx=vm.createContext({getVideoId:()=> 'v',renderSubtitles(){assert.fail('no cues');}});
 vm.runInContext(completedCode,ctx);
 assert.equal((await ctx.loadCompletedJobSubtitles({ok:true,status:'completed'},'v')).loaded,false);
});

test('a delayed pending render cannot replace the completed renderer',async()=>{
 let release;
 const delay=new Promise(resolve=>{release=resolve;});let calls=0;const shown=[];
 const ctx=vm.createContext({getVideoId:()=> 'v',renderGeneration:0,activeRenderedCue:null,
  waitForVideoElement:async()=>{if(++calls===1)await delay;return {currentTime:1};},
  ensureOverlay:()=>({}),refreshTranslationSourceProviders(){},translationSourceIndicator:()=>null,applyStoredSubtitleStyle:async()=>{},playbackPreview:null,
  normalizeSourceCues:()=>[],mergeSubtitleCues:(...lists)=>lists.flat(),findCurrentCue:(cues)=>cues[0],
  sourceTextForTranslatedCue:()=>'',renderOverlayCue:(_overlay,_source,text)=>shown.push(text),requestAnimationFrame(){},clearOverlay(){}});
 vm.runInContext(extract('async function renderSubtitles(', 'async function tryLoadSubtitle('),ctx);
 const pending=ctx.renderSubtitles([],'v',{pendingText:'准备中'});
 assert.equal((await ctx.renderSubtitles([{start:0,end:2,text:'完成译文'}],'v',{replaceCurrentCue:true})).loaded,true);
 release();assert.equal((await pending).loaded,false);
 assert.deepEqual(shown,['完成译文']);
});

test('panel reports a load failure and keeps retrying instead of showing ready', async () => {
 const states=[];let poll;
 const ctx=vm.createContext({stopPanelJobPolling(){ctx.panelJobPollGeneration++;},currentPanelJobId:'',panelJobPollGeneration:0,
  getVideoId:()=> 'v',setInterval:fn=>{poll=fn;return 1;},
  chrome:{runtime:{sendMessage:async message=>message.type==='GET_JOB_STATUS'?{ok:true,job:{status:'completed'}}:{ok:false}}},
  loadCompletedJobSubtitles:async()=>({loaded:false}),setPanelState:(...args)=>states.push(args)});
 vm.runInContext(extract('function startPanelJobPolling(', 'function stopPanelJobPolling('),ctx);
 ctx.startPanelJobPolling('job','v');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(states.at(-1)[0],'error');assert.match(states.at(-1)[1],/加载失败/);
 await poll();assert.equal(states.filter(x=>x[0]==='ready').length,0);
});

test('AI failure with playback preview exposes the error and an AI retry state', async () => {
 const states=[];
 const ctx=vm.createContext({stopPanelJobPolling(){ctx.panelJobPollGeneration++;},currentPanelJobId:'',panelJobPollGeneration:0,
  getVideoId:()=> 'v',setInterval:()=>1,playbackPreview:{videoId:'v'},
  chrome:{runtime:{sendMessage:async()=>({ok:true,job:{status:'failed',error:'AI 字幕批次等待超时'}})}},
  setPanelState:(...args)=>states.push(args)});
 vm.runInContext(extract('function startPanelJobPolling(', 'function stopPanelJobPolling('),ctx);
 ctx.startPanelJobPolling('job','v');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(states.at(-1)[0],'fallback');assert.match(states.at(-1)[1],/AI.*等待超时/);
 assert.equal(ctx.currentPanelJobId,'job','retry must target the existing job');
});

test('AI retry resumes the same job without fetching captions or stopping machine preview', async () => {
 let message,polled;
 const ctx=vm.createContext({getVideoId:()=> 'v',currentPanelJobId:'job',panelActionInProgress:false,
  document:{title:'Video'},setPanelState(){},
  chrome:{runtime:{sendMessage:async value=>{message=value;return {ok:true};}}},
  startPanelJobPolling:(...args)=>{polled=args;}});
 vm.runInContext(extract('async function retryAiTranslationFromPlayer(', 'async function stopTranslationFromPlayer('),ctx);
 await ctx.retryAiTranslationFromPlayer();
 assert.equal(message.type,'RETRY_SUBTITLE_JOB');assert.equal(message.jobId,'job');
 assert.deepEqual(polled,['job','v']);assert.equal(ctx.panelActionInProgress,false);
});
