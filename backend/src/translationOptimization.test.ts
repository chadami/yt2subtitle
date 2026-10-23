import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('small first AI request is saved immediately; machine cache respects source, owner, language and provider', {timeout:30000}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'vidlingo-optimization-'));
  const helper=path.join(dir,'helper'),calls=path.join(dir,'helper-calls');
  await writeFile(helper,`#!${process.execPath}
const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(input.texts)+'\\n');
input.texts.forEach((text,index)=>console.log(JSON.stringify({ok:true,index,translations:['新机翻 '+text]})));
console.log(JSON.stringify({ok:true,done:true}));
`,{mode:0o755});
  Object.assign(process.env,{DATA_DIR:path.join(dir,'data'),LOCAL_MT_PROVIDER:'macos',LOCAL_TRANSLATE_HELPER:helper,
    LOCAL_AI_PROVIDER:'openai',LOCAL_AI_API_KEY:'test',LOCAL_AI_MODEL:'test'});
  const {initDatabase}=await import('./migrate.js');
  const {query,closeDatabase}=await import('./db.js');
  const {getLocalUserId}=await import('./auth.js');
  const {processSubtitleJob,markJobAttemptFailed}=await import('./jobRunner.js');
  const {ensureJobMachineTranslation}=await import('./jobMachineTranslation.js');
  const {restoreMachineTranslationCache}=await import('./machineTranslationCache.js');
  const {machineProgress}=await import('./jobProgress.js');
  const {prepareSourceCues}=await import('./subtitles.js');
  const originalFetch=globalThis.fetch;
  try {
    await initDatabase();
    const owner=await getLocalUserId();
    const other=(await query<{id:string}>('insert into users default values returning id')).rows[0].id;
    const raw=Array.from({length:20},(_,index)=>({start:index*3,end:index*3+2,text:`Sentence ${index}.`}));
    const clean=prepareSourceCues(raw,'manual');
    await query("insert into videos(video_id,url) values('optimization','https://youtube.com/watch?v=optimization')");
    const source=(await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values('optimization','en','manual',$1) returning id",[JSON.stringify(raw)])).rows[0].id;
    const changedSource=(await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values('optimization','en','manual',$1) returning id",[JSON.stringify(raw.map(c=>({...c,text:c.text+' edited'})))])).rows[0].id;
    async function job(user=owner,caption=source,target='zh-Hans',status='failed') {
      return (await query<{id:string}>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status) values($1,'optimization','en',$2,$3,$4) returning id",[user,target,caption,status])).rows[0].id;
    }
    const cached=await job();
    await query("update translation_jobs set machine_translation_state='completed',machine_translation_provider='macos' where id=$1",[cached]);
    const oldCues=clean.map(cue=>({...cue,text:`缓存译文 ${cue.index}`,sourceText:cue.text,sourceIndexes:[cue.index]}));
    await query("insert into translation_job_machine_chunks(job_id,chunk_index,provider,cues_json) values($1,0,'macos',$2)",[cached,JSON.stringify(oldCues)]);
    const current=await job(owner,source,'zh-Hans','queued');
    const sizes:number[]=[];
    globalThis.fetch=async(_url,init)=>{
      const input=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      assert.equal(input.transcript,undefined,'no preceding context analysis request');
      sizes.push(input.rawCues.length);
      if(sizes.length===1) return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({cues:input.rawCues.map((cue:{index:number;text:string})=>({source_indexes:[cue.index],source:cue.text,translation:'首批 AI 译文'}))})}}]}));
      const partial=(await query<{cues_json:unknown[]}>('select cues_json from translation_job_chunks where job_id=$1',[current])).rows[0];
      assert.equal(partial.cues_json.length,3,'first three cues must be saved before the next request');
      return new Response('{}',{status:500});
    };
    await assert.rejects(processSubtitleJob(current),/AI request failed: 500/);
    assert.deepEqual(sizes,[3,17]);
    await markJobAttemptFailed(current,new Error('later request failed'),true);
    for(let i=0;i<500;i++) {
      const state=(await query<{machine_translation_state:string}>('select machine_translation_state from translation_jobs where id=$1',[current])).rows[0].machine_translation_state;
      if(state==='completed') break;
      await delay(10);
    }
    const machine=(await query<{cues_json:Array<{sourceIndexes:number[];text:string}>}>('select cues_json from translation_job_machine_chunks where job_id=$1',[current])).rows.flatMap(row=>row.cues_json);
    assert.equal(machine.length,17,'partial AI coverage must be excluded from fallback');
    assert.ok(machine.every(cue=>cue.sourceIndexes[0]>=3 && cue.text.startsWith('缓存译文')));
    await assert.rejects(readFile(calls),{code:'ENOENT'},'matching local cache must avoid invoking macOS');
    assert.deepEqual(await machineProgress(current),{completedCues:17,totalCues:17});
    for(const [user,caption,target,provider] of [[other,source,'zh-Hans','macos'],[owner,changedSource,'zh-Hans','macos'],[owner,source,'ja','macos'],[owner,source,'zh-Hans','google']] as const) {
      const unrelated=await job(user,caption,target);
      const restored=await restoreMachineTranslationCache(unrelated,provider,clean,new AbortController().signal);
      assert.equal(restored.size,0,'unrelated results must not be reused');
    }
    // Even with a matching caption ID, corrupted timing/source text is not safe.
    const stale=await job();
    await query("insert into translation_job_machine_chunks(job_id,chunk_index,provider,cues_json) values($1,0,'google',$2)",[stale,JSON.stringify([{...oldCues[0],sourceText:'wrong source'},{...oldCues[1],start:999}])]);
    const fresh=await job();
    assert.equal((await restoreMachineTranslationCache(fresh,'google',clean,new AbortController().signal)).size,0);
    await ensureJobMachineTranslation(current);
    await assert.rejects(readFile(calls),{code:'ENOENT'},'completed cache must not start a new helper');
    // With no matching-language cache, translate only the missing source cues.
    const uncached=await job(owner,source,'zh-Hant');
    await query('insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)',
      [uncached,JSON.stringify(oldCues.slice(0,3))]);
    await ensureJobMachineTranslation(uncached);
    for(let i=0;i<500;i++) {
      const state=(await query<{machine_translation_state:string}>('select machine_translation_state from translation_jobs where id=$1',[uncached])).rows[0].machine_translation_state;
      if(state==='completed') break;
      await delay(10);
    }
    const requested=JSON.parse((await readFile(calls,'utf8')).trim());
    assert.deepEqual(requested,clean.slice(3).map(cue=>cue.text),'partial AI cues must not be translated again by macOS');
    const successful=await job(owner,source,'zh-Hans','queued');
    const successSizes:number[]=[];
    globalThis.fetch=async(_url,init)=>{
      const input=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      successSizes.push(input.rawCues.length);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({cues:input.rawCues.map((cue:{index:number;text:string})=>({source_indexes:[cue.index],source:cue.text,translation:'成功的 AI 译文'}))})}}]}));
    };
    await processSubtitleJob(successful);
    assert.deepEqual(successSizes,[3,17]);
    assert.equal((await query<{status:string}>('select status from translation_jobs where id=$1',[successful])).rows[0].status,'completed');
    assert.equal((await query('select * from translated_subtitles where job_id=$1',[successful])).rows.length,1);

  } finally {globalThis.fetch=originalFetch;await closeDatabase();await rm(dir,{recursive:true,force:true});}
});
