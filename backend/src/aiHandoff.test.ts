import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('AI deadlines bypass retries, cancel AI first and hand missing batches to macOS', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vidlingo-ai-handoff-'));
  const marker = path.join(dir, 'ai-active');
  const calls = path.join(dir, 'machine-calls');
  const helper = path.join(dir, 'helper');
  await writeFile(helper, `#!${process.execPath}
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0,'utf8'));
if (fs.existsSync(${JSON.stringify(marker)})) { console.log(JSON.stringify({ok:false,error:'ai_still_active'})); process.exit(); }
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(input.texts)+'\\n');
{ input.texts.forEach((t,index)=>console.log(JSON.stringify({ok:true,index,translations:['本机 '+t]}))); console.log(JSON.stringify({ok:true,done:true})); }
`, { mode: 0o755 });
  Object.assign(process.env, { DATA_DIR: path.join(dir, 'data'), LOCAL_MT_PROVIDER: 'macos', LOCAL_TRANSLATE_HELPER: helper,
    LOCAL_AI_PROVIDER: 'openai', LOCAL_AI_API_KEY: 'test-only', LOCAL_AI_MODEL: 'test' });
  const { initDatabase } = await import('./migrate.js');
  const { query, closeDatabase } = await import('./db.js');
  const { getLocalUserId } = await import('./auth.js');
  const { runSubtitleJobInProcess } = await import('./jobRunner.js');
  const originalFetch = globalThis.fetch;
  const originalTimer = globalThis.setTimeout;
  // Accelerate production deadlines without changing the configured policy.
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
    originalTimer(fn, ms && ((ms > 2500 && ms <= 5000) || ms === 60000) ? 15 : ms, ...args)) as typeof setTimeout;
  try {
    await initDatabase();
    const userId = await getLocalUserId();
    for (const savedFirst of [false, true]) {
      const video = savedFirst ? 'later-stall' : 'first-stall';
      const raw = [{start:0,end:2,text:'Introduction. '.repeat(650)}, {start:3,end:5,text:'Unfinished sentence.'}];
      await query('insert into videos(video_id,url) values($1,$2)',[video,`https://youtube.com/watch?v=${video}`]);
      const source = await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values($1,'en','manual',$2) returning id",[video,JSON.stringify(raw)]);
      const job = await query<{id:string}>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status) values($1,$2,'en','zh-Hans',$3,'queued') returning id",[userId,video,source.rows[0].id]);
      const id = job.rows[0].id;
      if (savedFirst) await query('insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)',[id,JSON.stringify([{start:0,end:2,text:'保留 AI 译文',sourceIndexes:[0]}])]);
      let aiRequests = 0;
      let analysisRequests = 0;
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const input = JSON.parse(body.messages[1].content);
        if (input.transcript !== undefined) {
          analysisRequests++;
          return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}));
        }
        aiRequests++;
        await writeFile(marker,'active');
        return { ok:true, json: () => new Promise((_resolve,reject) => {
          init!.signal!.addEventListener('abort', () => {
            void rm(marker).then(() => reject(init!.signal!.reason));
          },{once:true});
        }) } as Response;
      };
      await runSubtitleJobInProcess(id,2);
      for (let i=0;i<500;i++) {
        const row = (await query<{machine_translation_state:string}>('select machine_translation_state from translation_jobs where id=$1',[id])).rows[0];
        if (row.machine_translation_state==='completed') break;
        if (row.machine_translation_state==='failed' || row.machine_translation_state==='waiting') assert.fail('machine helper failed');
        await delay(10);
      }
      const row = (await query<{status:string;machine_translation_state:string;error:string}>('select status,machine_translation_state,error from translation_jobs where id=$1',[id])).rows[0];
      assert.equal(row.status,'failed');
      assert.equal(row.machine_translation_state,'completed');
      assert.match(row.error,/等待超时/);
      assert.equal(aiRequests,1,'deadline must not retry AI');
      assert.equal(analysisRequests,0,'translation must start without a separate context request');
      const ai = (await query('select * from translation_job_chunks where job_id=$1',[id])).rows;
      assert.equal(ai.length,savedFirst?1:0);
      const machine = await query<{cues_json:unknown[]}>('select cues_json from translation_job_machine_chunks where job_id=$1',[id]);
      const contents = JSON.stringify(machine.rows);
      assert.ok(contents.includes('Unfinished sentence.'));
      if (savedFirst) assert.ok(!contents.includes('Introduction.'));
    }
    assert.ok((await readFile(calls,'utf8')).length>0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimer;
    await closeDatabase();
    await rm(dir,{recursive:true,force:true});
  }
});
