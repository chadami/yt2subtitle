import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('stop cancels queued, AI and macOS work without deleting completed subtitles', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vidlingo-stop-'));
  const helper = path.join(dir,'helper');
  const marker = path.join(dir,'running-helper');
  const calls = path.join(dir,'helper-calls');
  await writeFile(helper, `#!${process.execPath}
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0,'utf8'));
fs.appendFileSync(${JSON.stringify(calls)},'batch\\n');
if(input.texts[0]==='Line 50.') {
 fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));
 setInterval(()=>{},1000);
} else { input.texts.forEach((t,index)=>console.log(JSON.stringify({ok:true,index,translations:['译文 '+t]}))); console.log(JSON.stringify({ok:true,done:true})); }
`,{mode:0o755});
  Object.assign(process.env,{DATA_DIR:path.join(dir,'data'),LOCAL_MT_PROVIDER:'macos',LOCAL_TRANSLATE_HELPER:helper,
    LOCAL_AI_PROVIDER:'openai',LOCAL_AI_API_KEY:'test',LOCAL_AI_MODEL:'test'});
  const { initDatabase } = await import('./migrate.js');
  const { query, closeDatabase } = await import('./db.js');
  const { getLocalUserId } = await import('./auth.js');
  const { abortJobOperations } = await import('./jobControl.js');
  const { runSubtitleJobInProcess } = await import('./jobRunner.js');
  const { ensureJobMachineTranslation } = await import('./jobMachineTranslation.js');
  const queue = await import('./localQueue.js');
  const originalFetch = globalThis.fetch;
  let helperPid: number | undefined;
  try {
    await initDatabase();
    const userId = await getLocalUserId();
    async function create(video:string, raw:unknown[], status='queued') {
      await query('insert into videos(video_id,url) values($1,$2)',[video,`https://youtube.com/watch?v=${video}`]);
      const source = await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values($1,'en','manual',$2) returning id",[video,JSON.stringify(raw)]);
      return (await query<{id:string}>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status) values($1,$2,'en','zh-Hans',$3,$4) returning id",[userId,video,source.rows[0].id,status])).rows[0].id;
    }
    async function stop(id:string) {
      await query("update translation_jobs set status='cancelled',machine_translation_state='cancelled',machine_translation_retry_at=null where id=$1",[id]);
      queue.removePendingJob(id);
      abortJobOperations(id);
    }
    const queued=await create('queued',[{start:0,end:2,text:'Hello.'}]);
    await queue.enqueueLocalJob(queued);
    assert.equal(queue.localQueueSnapshot().pending,1);
    await stop(queued);
    assert.equal(queue.localQueueSnapshot().pending,0);
    globalThis.fetch=async()=>{assert.fail('cancelled queued job must not call AI');};
    await runSubtitleJobInProcess(queued,2);

    const ai=await create('active-ai',[{start:0,end:2,text:'Introduction. '.repeat(650)},{start:3,end:5,text:'Unfinished.'}]);
    await query('insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)',[ai,JSON.stringify([{start:0,end:2,text:'保留 AI 译文',sourceIndexes:[0]}])]);
    let started!:()=>void;
    const requestStarted=new Promise<void>(resolve=>{started=resolve;});
    let aborted=false, aiCalls=0;
    globalThis.fetch=async(_url,init)=>{
      const input=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      if(input.transcript!==undefined) return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}));
      aiCalls++;
      return {ok:true,json:()=>new Promise((_resolve,reject)=>{
        init!.signal!.addEventListener('abort',()=>{aborted=true;reject(init!.signal!.reason);},{once:true});
        started();
      })} as Response;
    };
    const running=runSubtitleJobInProcess(ai,2);
    await requestStarted;
    await stop(ai);
    await running;
    assert.equal(aborted,true);
    assert.equal(aiCalls,1,'stop must not retry AI');
    await assert.rejects(readFile(calls),{code:'ENOENT'},'stop must not trigger machine fallback');
    assert.equal((await query('select * from translation_job_chunks where job_id=$1',[ai])).rows.length,1);
    assert.equal((await query<{status:string}>('select status from translation_jobs where id=$1',[ai])).rows[0].status,'cancelled');

    const mt=await create('active-macos',Array.from({length:60},(_,i)=>({start:i*3,end:i*3+2,text:`Line ${i}.`})),'failed');
    await ensureJobMachineTranslation(mt);
    for(let i=0;i<500;i++) {
      try { helperPid=Number(await readFile(marker,'utf8')); break; } catch { await delay(10); }
    }
    assert.ok(helperPid,'macOS helper must have started second batch');
    await stop(mt);
    let stopped=false;
    for(let i=0;i<500;i++) {
      try { process.kill(helperPid!,0); } catch { stopped=true; break; }
      await delay(10);
    }
    assert.ok(stopped,'stop must terminate the running helper process');
    await delay(30);
    await ensureJobMachineTranslation(mt);
    const state=(await query<{status:string;machine_translation_state:string;machine_translation_retry_at:unknown}>('select status,machine_translation_state,machine_translation_retry_at from translation_jobs where id=$1',[mt])).rows[0];
    assert.equal(state.status,'cancelled');
    assert.equal(state.machine_translation_state,'cancelled');
    assert.equal(state.machine_translation_retry_at,null);
    const batches=await query<{cues_json:unknown[]}>('select cues_json from translation_job_machine_chunks where job_id=$1',[mt]);
    assert.equal(batches.rows.length,1);
    assert.equal(batches.rows[0].cues_json.length,50,'completed machine batch must be kept');
  } finally {
    globalThis.fetch=originalFetch;
    if(helperPid) {try {process.kill(helperPid);} catch { /* Already stopped. */ }}
    await closeDatabase();
    await rm(dir,{recursive:true,force:true});
  }
});
