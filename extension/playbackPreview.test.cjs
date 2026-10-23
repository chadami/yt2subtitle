const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/contentScript.js`,'utf8');
const code=source.slice(source.indexOf('function mergeSubtitleCues('),source.indexOf('async function renderSubtitles('));
test('local preview starts immediately while paused; seeking is cancelled then debounced 500ms',async()=>{
 const listeners=new Map(),messages=[],timers=[];
 const video={currentTime:0,paused:true,ended:false,seeking:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:()=>{}};
 const context=vm.createContext({playbackPreview:null,playbackPreviewEpoch:0,playbackAiCues:[],machinePreviewVideoId:'',machinePreviewCues:[],
  waitForVideoElement:async()=>video,getVideoId:()=> 'video-1',isSameTranslationLanguage:()=>false,PENDING_TRANSLATION_TEXT:'准备中',renderSubtitles:async()=>({loaded:true}),
  chrome:{runtime:{sendMessage:async message=>{messages.push(message);return {ok:true,sessionId:'session',sequence:message.payload.sequence||0,machineCues:[],aiCues:[]};}}},
  setInterval:fn=>{context.tick=fn;return 1;},clearInterval(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}
 });
 vm.runInContext(code,context);
 await vm.runInContext('startPlaybackPreview({videoId:"video-1",sourceLang:"en",targetLang:"zh-Hans",rawCues:[]})',context);
 assert.equal(messages[0].type,'OPEN_PLAYBACK_PREVIEW');assert.equal(messages[0].payload.paused,true);
 assert.equal(timers.length,0,'no five-second startup delay');
 video.currentTime=100;video.seeking=true;listeners.get('seeking')();await new Promise(r=>setImmediate(r));
 assert.equal(messages.at(-1).payload.seeking,true);
 video.currentTime=500;video.seeking=false;listeners.get('seeked')();
 assert.equal(timers.at(-1).ms,500);
 const before=messages.length;context.tick();assert.equal(messages.length,before,'heartbeat must not bypass seek debounce');
 timers.at(-1).fn();await new Promise(r=>setImmediate(r));
 assert.equal(messages.at(-1).payload.position,500);assert.equal(messages.at(-1).payload.seeking,false);
 await vm.runInContext('stopPlaybackPreview()',context);assert.equal(messages.at(-1).type,'CLOSE_PLAYBACK_PREVIEW');
});
