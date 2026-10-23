import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

test('playback preview is bounded, follows latest seek, pauses, reuses cache and yields to AI', {timeout:20000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vidlingo-playback-'));
 const helper=path.join(dir,'helper'),log=path.join(dir,'calls');
 await writeFile(helper,`#!${process.execPath}
const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(input.texts)+'\\n');
(async()=>{for(let index=0;index<input.texts.length;index++){
 console.log(JSON.stringify({ok:true,index,translations:[input.texts[index]==='Line 70.'?'先打开文件。然后点击保存。最后关闭窗口。':'预翻 '+input.texts[index]]}));
 await new Promise(r=>setTimeout(r,70));
}console.log(JSON.stringify({ok:true,done:true}));})();
`,{mode:0o755});
 Object.assign(process.env,{DATA_DIR:path.join(dir,'data'),LOCAL_MT_PROVIDER:'macos',LOCAL_TRANSLATE_HELPER:helper,LOCAL_AI_PROVIDER:'openai',LOCAL_AI_API_KEY:'test',LOCAL_AI_MODEL:'test'});
 const {initDatabase}=await import('./migrate.js');const {query,closeDatabase}=await import('./db.js');
 const {getLocalUserId}=await import('./auth.js');
 const {openPlayback,updatePlayback,closePlayback,hasPlaybackWindow}=await import('./playbackTranslation.js');
 const {ensureJobMachineTranslation}=await import('./jobMachineTranslation.js');
 let session='';
 try{
  await initDatabase();const owner=await getLocalUserId();
  const raw=Array.from({length:100},(_,index)=>({start:index*10,end:index*10+8,text:`Line ${index}.`}));
  await query("insert into videos(video_id,url) values('playback-test','https://youtube.com/watch?v=playback-test')");
  const caption=(await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values('playback-test','en','manual',$1) returning id",[JSON.stringify(raw)])).rows[0].id;
  const job=(await query<{id:string}>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status) values($1,'playback-test','en','zh-Hans',$2,'failed') returning id",[owner,caption])).rows[0].id;
  const input={owner,clientId:'tab-1',captionId:caption,source:'en',target:'zh-Hans',raw,captionType:'manual' as const,position:0,paused:false};
  const opened=await openPlayback(input);assert.ok('sessionId' in opened);session=(opened as {sessionId:string}).sessionId;
  const calls=async()=>{try{return (await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as string[]);}catch{return [];}};
  for(let i=0;i<500&&(await calls()).length===0;i++)await delay(10);
  if(!(await calls()).length)assert.fail(JSON.stringify(await updatePlayback(owner,session,{position:0,paused:false,seeking:false,sequence:1})));
  assert.deepEqual((await calls())[0],['Line 0.','Line 1.','Line 2.','Line 3.']);
  await updatePlayback(owner,session,{position:500,paused:false,seeking:true,sequence:1});
  await updatePlayback(owner,session,{position:700,paused:false,seeking:true,sequence:2});
  await delay(120);assert.equal((await calls()).length,1,'seeking must not start intermediate positions');
  const stale=await updatePlayback(owner,session,{position:0,paused:false,seeking:false,sequence:1});assert.equal(stale.sequence,2);
  await updatePlayback(owner,session,{position:700,paused:false,seeking:false,sequence:3});
  for(let i=0;i<500;i++){const count=(await query<{count:number}>("select count(*)::int as count from local_machine_cue_cache where source_index between 70 and 73")).rows[0].count;if(count===4)break;await delay(10);}
  assert.deepEqual((await calls())[1],['Line 70.','Line 71.','Line 72.','Line 73.']);
  const ready=await updatePlayback(owner,session,{position:700,paused:false,seeking:false,sequence:4});
  assert.equal(ready.machineCues.length,6,'machine preview must split one source cue into three short Chinese sentences');
  assert.equal(ready.completedCues,4,'display splitting must not change source coverage');
  assert.deepEqual(ready.machineCues.slice(0,3).map(cue=>cue.text),['先打开文件。','然后点击保存。','最后关闭窗口。']);
  assert.equal((await calls()).length,2,'cached window must not run again');
  await updatePlayback(owner,session,{position:900,paused:true,seeking:false,sequence:5});await delay(100);
  assert.equal((await calls()).length,2,'paused video must not pretranslate another position');
  await assert.rejects(updatePlayback('wrong-owner',session,{position:0,paused:false,seeking:false,sequence:6}),/会话已过期/);
  await query('insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)',[job,JSON.stringify(raw.slice(90,94).map((cue,offset)=>({...cue,text:offset===0?'先打开文件。然后点击保存。最后关闭窗口。':'AI 字幕',sourceIndexes:[90+offset]})))]);
  const ai=await updatePlayback(owner,session,{position:900,paused:false,seeking:false,sequence:6});
  assert.equal(ai.aiCues.length,6,'AI playback must use the same short Chinese display policy');
  assert.equal(ai.completedCues,4);
  await delay(100);assert.equal((await calls()).length,2,'AI covered window must not be machine translated');
  closePlayback(owner,session);assert.equal(hasPlaybackWindow(owner,caption,'zh-Hans'),false);
  await ensureJobMachineTranslation(job);assert.equal((await calls()).length,2,'closing browser must not trigger whole-video fallback');
  const reopened=await openPlayback({...input,position:700,paused:true});assert.ok('sessionId' in reopened);session=(reopened as {sessionId:string}).sessionId;
  assert.ok('machineCues' in reopened && reopened.machineCues.length>=4);await delay(100);
  assert.equal((await calls()).length,2,'new session must reuse persisted machine cues');
  closePlayback(owner,session);
  const warm=await openPlayback({...input,position:800,paused:true});assert.ok('sessionId' in warm);session=(warm as {sessionId:string}).sessionId;
  await updatePlayback(owner,session,{position:800,paused:true,seeking:false,sequence:1});
  for(let i=0;i<500;i++){const count=(await query<{count:number}>("select count(*)::int as count from local_machine_cue_cache where source_index=80")).rows[0].count;if(count===1)break;await delay(10);}
  assert.deepEqual((await calls())[2],['Line 80.'],'enabling translation while paused prepares the current cue only');
  const warmed=await updatePlayback(owner,session,{position:800,paused:true,seeking:false,sequence:2});
  assert.ok(warmed.machineCues.some(cue=>cue.start===800));
  await delay(100);assert.equal((await calls()).length,3,'paused warmup must not run ahead');
  // A foreground preview lets AI finish normally instead of aborting after 5s.
  const fresh=(await query<{id:string}>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status) values($1,'playback-test','en','zh-Hans',$2,'queued') returning id",[owner,caption])).rows[0].id;
  const {processSubtitleJob}=await import('./jobRunner.js');
  const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;
  const budgets:number[]=[];
  globalThis.setTimeout=((fn:(...args:unknown[])=>void,ms?:number,...args:unknown[])=>{if(ms===5000||ms===60000)budgets.push(ms);return originalTimer(fn,ms,...args);}) as typeof setTimeout;
  globalThis.fetch=async(_url,init)=>{
    const input=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    await delay(30);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({cues:input.rawCues.map((cue:{index:number;text:string})=>({source_indexes:[cue.index],source:cue.text,translation:'AI 完整译文'}))})}}]}));
  };
  try {await processSubtitleJob(fresh);assert.equal(budgets[0],60000);assert.ok(!budgets.includes(5000));}
  finally {globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;}

 }finally{
  if(session){try{const owner=await getLocalUserId();closePlayback(owner,session);}catch{}}
  await delay(80);await closeDatabase();await rm(dir,{recursive:true,force:true});
 }
});
