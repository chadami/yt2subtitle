import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("language-pack retry resumes machine batches without modifying AI progress", { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vidlingo-machine-retry-"));
  const helper = path.join(dir, 'helper');
  const ready = path.join(dir, 'ready');
  const failedOnce = path.join(dir, 'failed-once');
  const calls = path.join(dir, 'calls');
  await writeFile(helper, `#!${process.execPath}
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.appendFileSync(${JSON.stringify(calls)}, input.texts[0] + '\\n');
if (!fs.existsSync(${JSON.stringify(ready)})) console.log(JSON.stringify({ok:false,error:'not_installed'}));
else if (input.texts[0] === 'source 50.' && !fs.existsSync(${JSON.stringify(failedOnce)})) {
 fs.writeFileSync(${JSON.stringify(failedOnce)},'');console.log(JSON.stringify({ok:false,error:'temporary_failure'}));
} else console.log(JSON.stringify({ok:true,translations:input.texts.map(t=>'译文 '+t)}));
`, { mode: 0o755 });
  Object.assign(process.env, { LOCAL_MODE:'1', DATA_DIR:path.join(dir,'data'), LOCAL_MT_PROVIDER:'macos', LOCAL_TRANSLATE_HELPER:helper,
    LOCAL_AI_PROVIDER:'openai', LOCAL_AI_API_KEY:'test-only-key', LOCAL_AI_MODEL:'test-model',
    JWT_SECRET:'machine-retry-test-only-secret-24' });
  const { initDatabase } = await import('./migrate.js');
  const { query, closeDatabase } = await import('./db.js');
  const { getLocalUserId } = await import('./auth.js');
  const { ensureJobMachineTranslation } = await import('./jobMachineTranslation.js');
  try {
    await initDatabase();
    const userId = await getLocalUserId();
    await query("insert into videos(video_id,url) values('retry-test','https://www.youtube.com/watch?v=retry-test')");
    const source = await query<{id:string}>(`insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json)
      values('retry-test','en','manual',$1) returning id`, [JSON.stringify(Array.from({length:120},(_,i)=>({start:i*3,end:i*3+2,text:`source ${i}.`})))]);
    const job = await query<{id:string}>(`insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status,progress)
      values($1,'retry-test','en','zh-Hans',$2,'translating',47) returning id`, [userId, source.rows[0].id]);
    const id = job.rows[0].id;
    await query("insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)",
      [id,JSON.stringify([{start:0,end:2,text:'已有 AI 字幕',sourceIndexes:[0]}])]);
    async function waitFor(state: string) {
      for (let i=0;i<500;i++) {
        const found = await query<{machine_translation_state:string;machine_translation_code:string}>("select machine_translation_state,machine_translation_code from translation_jobs where id=$1",[id]);
        if (found.rows[0].machine_translation_state === state) { await delay(10); return found.rows[0]; }
        await delay(10);
      }
      assert.fail(`Did not reach ${state}`);
    }
    await Promise.all([ensureJobMachineTranslation(id),ensureJobMachineTranslation(id)]);
    assert.equal((await waitFor('waiting')).machine_translation_code,'macos_language_not_installed');
    await ensureJobMachineTranslation(id);
    assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,1,'must respect retry delay');
    await writeFile(ready,'');
    await query('update translation_jobs set machine_translation_retry_at = null where id=$1',[id]);
    await ensureJobMachineTranslation(id);
    await waitFor('waiting');
    assert.equal((await query('select * from translation_job_machine_chunks where job_id=$1',[id])).rows.length,1);
    await query('update translation_jobs set machine_translation_retry_at = null where id=$1',[id]);
    await ensureJobMachineTranslation(id);
    await waitFor('completed');
    const batches=await query<{provider:string;cues_json:unknown[]}>('select provider,cues_json from translation_job_machine_chunks where job_id=$1 order by chunk_index',[id]);
    assert.equal(batches.rows.length,3);
    assert.equal(batches.rows.reduce((n,r)=>n+r.cues_json.length,0),120);
    assert.ok(batches.rows.every(r=>r.provider==='macos'));
    const invocations=(await readFile(calls,'utf8')).trim().split('\n');
    assert.deepEqual(invocations,['source 0.','source 0.','source 50.','source 50.','source 100.']);
    const ai=await query<{status:string;progress:number}>('select status,progress from translation_jobs where id=$1',[id]);
    assert.equal(ai.rows[0].status,'translating');
    assert.equal(ai.rows[0].progress,47);
    assert.equal((await query('select * from translation_job_chunks where job_id=$1',[id])).rows.length,1);
    await ensureJobMachineTranslation(id);
    assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,5,'completed previews must not restart');
    await query("update translation_jobs set status='completed',machine_translation_state='idle',machine_translation_retry_at=null where id=$1",[id]);
    await ensureJobMachineTranslation(id);
    assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,5,'completed AI must not trigger more machine work');
    // Updating the desktop app must also preserve already saved AI chunks.
    const { processSubtitleJob } = await import('./jobRunner.js');
    const { prepareSourceCues, chunkCues } = await import('./subtitles.js');
    const rawCues = Array.from({length:120},(_,i)=>({start:i*3,end:i*3+2,text:`source ${i}.`}));
    const aiChunks = chunkCues(prepareSourceCues(rawCues,'manual'));
    for (let index=0;index<aiChunks.length;index++) {
      await query(`insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,$2,$3)
        on conflict(job_id,chunk_index) do update set cues_json=excluded.cues_json`,
      [id,index,JSON.stringify(aiChunks[index].map(cue=>({...cue,text:`已有 AI 译文 ${cue.index}`,sourceIndexes:[cue.index]})))]);
    }
    await query("update translation_jobs set status='translating',provider_mode='user',machine_translation_state='completed' where id=$1",[id]);
    const originalFetch = globalThis.fetch;
    let aiRequests = 0;
    globalThis.fetch = async () => {
      aiRequests++;
      return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
    };
    try { await processSubtitleJob(id); } finally { globalThis.fetch = originalFetch; }
    assert.equal(aiRequests,1,'only the context request is needed; saved AI chunks must not be regenerated');
    assert.equal((await query<{status:string}>('select status from translation_jobs where id=$1',[id])).rows[0].status,'completed');
    assert.equal((await query('select * from translation_job_chunks where job_id=$1',[id])).rows.length,aiChunks.length);

  } finally {
    await closeDatabase();
    await rm(dir,{recursive:true,force:true});
  }
});
