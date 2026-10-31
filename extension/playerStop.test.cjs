const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }

test('working player action is an enabled stop button', () => {
  const action = { dataset: {} };
  const status = { dataset: {} };
  const panel = { querySelector: selector => selector.includes('generate') ? action : status };
  const context = vm.createContext({
    document: { getElementById: id => id === 'panel' ? panel : {setAttribute(){}} },
    PLAYER_PANEL_ID:'panel',PLAYER_BUTTON_ID:'button',machinePreviewFeedback:null,getVideoId:()=> 'v',panelStateRevision:0
  });
  vm.runInContext(extract('function setPanelState(', 'async function handlePanelClick('), context);
  vm.runInContext('setPanelState("working", "翻译中")', context);
  assert.equal(action.textContent,'停止任务');
  assert.equal(action.disabled,false);
  assert.equal(action.dataset.state,'working');
});

test('cancelled subtitle polling reloads saved cues and clears the translating placeholder', async () => {
  let rendered, stopped = false;
  const cue={start:0,end:2,text:'已完成译文'};
  const context=vm.createContext({
    getVideoId:()=> 'v', partialSubtitleJobId:'a',
    chrome:{runtime:{sendMessage:async()=>({ok:true,status:'cancelled',aiChunkCount:1,aiCues:[cue],machineChunkCount:0,machineCues:[],machineTranslation:{state:'cancelled'}})}},
    updateMachinePreviewFeedback(){}, loadedPartialChunkCount:1,loadedPartialCueCount:1,loadedMachineChunkCount:0,loadedMachineCueCount:0,
    machinePreviewVideoId:'',machinePreviewCues:[],partialSourceCues:[],PENDING_TRANSLATION_TEXT:'翻译中',
    renderSubtitles:async(cues,_videoId,options)=>{rendered={cues,options};return {loaded:true};},
    stopPartialSubtitlePolling:()=>{stopped=true;}
  });
  vm.runInContext(extract('async function pollPartialSubtitles(', 'async function resumePendingPartialPolling('),context);
  await vm.runInContext('pollPartialSubtitles("a","v")',context);
  assert.equal(rendered.cues[0].text,'已完成译文');
  assert.equal(rendered.options.pendingText,'');
  assert.equal(stopped,true);
});

test('a newly streamed machine cue updates the overlay within an existing batch', async () => {
  let rendered;
  const context=vm.createContext({
    getVideoId:()=> 'v',partialSubtitleJobId:'a',
    chrome:{runtime:{sendMessage:async()=>({ok:true,status:'failed',aiChunkCount:0,aiCues:[],machineChunkCount:1,
      machineCues:[{start:0,end:2,text:'第一句'},{start:3,end:5,text:'第二句'}],machineTranslation:{state:'running'}})},
      storage:{local:{get:async()=>({fallbackJobs:[{jobId:'a'}]})}}},
    updateMachinePreviewFeedback(){},loadedPartialChunkCount:0,loadedPartialCueCount:0,loadedMachineChunkCount:1,loadedMachineCueCount:1,
    machinePreviewVideoId:'',machinePreviewCues:[],partialSourceCues:[],PENDING_TRANSLATION_TEXT:'翻译中',
    renderSubtitles:async(cues,_videoId,options)=>{rendered=options.machineCues;return {loaded:true};},
    stopPartialSubtitlePolling(){assert.fail('running stream must not stop polling');}
  });
  vm.runInContext(extract('async function pollPartialSubtitles(', 'async function resumePendingPartialPolling('),context);
  await vm.runInContext('pollPartialSubtitles("a","v")',context);
  assert.equal(rendered.length,2);
  assert.equal(rendered[1].text,'第二句');
});

test('system translation status reports progress and completion without an AI failure banner', () => {
  const context=vm.createContext({});
  vm.runInContext(extract('function machineTranslationStatus(', 'function updateMachinePreviewFeedback('),context);
  assert.equal(vm.runInContext('machineTranslationStatus({state:"running",completedCues:70,totalCues:1392})',context),'系统翻译中 · 已完成 70/1392 条');
  assert.equal(vm.runInContext('machineTranslationStatus({state:"completed",completedCues:1392,totalCues:1392})',context),'系统翻译已完成 · 1392/1392 条');
});

test('partial AI updates display within the same saved batch', async () => {
  let rendered;
  const context=vm.createContext({
    getVideoId:()=> 'v',partialSubtitleJobId:'a',
    chrome:{runtime:{sendMessage:async()=>({ok:true,status:'translating',aiChunkCount:1,aiCues:[{text:'一'},{text:'二'},{text:'三'}],machineChunkCount:0,machineCues:[],machineTranslation:{state:'idle'}})}},
    updateMachinePreviewFeedback(){},loadedPartialChunkCount:1,loadedPartialCueCount:1,loadedMachineChunkCount:0,loadedMachineCueCount:0,
    machinePreviewVideoId:'',machinePreviewCues:[],partialSourceCues:[],PENDING_TRANSLATION_TEXT:'翻译中',
    renderSubtitles:async(cues)=>{rendered=cues;return {loaded:true};},stopPartialSubtitlePolling(){}
  });
  vm.runInContext(extract('async function pollPartialSubtitles(', 'async function resumePendingPartialPolling('),context);
  await vm.runInContext('pollPartialSubtitles("a","v")',context);
  assert.equal(rendered.length,3);
});

test('completed machine fallback is a ready task, not a failed task', async () => {
  let finish;
  const done=new Promise(resolve=>{finish=resolve;});
  const states=[];
  const context=vm.createContext({
    stopPanelJobPolling(){},playbackPreview:null,currentPanelJobId:'',panelJobPollGeneration:0, getVideoId:()=> 'v',
    chrome:{runtime:{sendMessage:async()=>({ok:true,job:{status:'failed',machineTranslation:{state:'completed',completedCues:20,totalCues:20}}})}},
    updateMachinePreviewFeedback(){},machineTranslationStatus:()=> '系统翻译已完成 · 20/20 条',
    pollPartialSubtitles:async()=>{},setPanelState:(state,message)=>{states.push({state,message});finish();},
    setInterval:()=>1,panelJobPollTimer:null
  });
  vm.runInContext(extract('function startPanelJobPolling(', 'function stopPanelJobPolling('),context);
  vm.runInContext('startPanelJobPolling("a","v")',context);
  await done;
  assert.equal(states[0].state,'ready');
  assert.doesNotMatch(states[0].message,/失败/);
});

test('an invalidated extension context asks for a page refresh instead of a retry', () => {
  const action = { dataset: {} };
  const status = { dataset: {} };
  const panel = { querySelector: selector => selector.includes('generate') ? action : status };
  const context = vm.createContext({
    document: { getElementById: id => id === 'panel' ? panel : {setAttribute(){}} },
    PLAYER_PANEL_ID:'panel',PLAYER_BUTTON_ID:'button',machinePreviewFeedback:null,getVideoId:()=> 'v',panelStateRevision:0
  });
  vm.runInContext(extract('function setPanelState(', 'async function handlePanelClick('), context);
  vm.runInContext('setPanelState("error", "Extension context invalidated.")', context);
  assert.equal(action.dataset.state,'reload');
  assert.equal(action.textContent,'刷新页面');
  assert.equal(action.disabled,false);
  assert.match(status.textContent,/请刷新页面/);
});
