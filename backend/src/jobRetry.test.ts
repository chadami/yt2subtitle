import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';

test('retry preserves paid AI batches, checks ownership and only queues a failed job once', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'vidlingo-retry-'));
  const token='retry-test-local-token-only';
  Object.assign(process.env,{DATA_DIR:dir,LOCAL_TOKEN:token,LOCAL_MT_PROVIDER:'off'});
  const {initDatabase}=await import('./migrate.js');
  const {query,closeDatabase}=await import('./db.js');
  const {getLocalUserId}=await import('./auth.js');
  const {jobsRouter}=await import('./routes/jobs.js');
  const {localQueueSnapshot}=await import('./localQueue.js');
  const app=express();app.use(express.json());app.use('/api/jobs',jobsRouter);
  app.use((error:Error & {status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.status||500).json({error:error.message}));
  let server:ReturnType<typeof app.listen>|undefined;
  try {
    await initDatabase();
    const owner=await getLocalUserId();
    const other=(await query<{id:string}>('insert into users default values returning id')).rows[0].id;
    await query("insert into videos(video_id,url) values('retry-test','https://youtube.com/watch?v=retry-test')");
    const caption=(await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values('retry-test','en','manual','[]') returning id")).rows[0].id;
    const create=async(user:string)=>(await query<{id:string}>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status,error) values($1,'retry-test','en','zh-Hans',$2,'failed','timeout') returning id",[user,caption])).rows[0].id;
    const job=await create(owner),foreign=await create(other);
    await query('insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)',[job,JSON.stringify([{start:0,end:2,text:'已生成',sourceIndexes:[0]}])]);
    server=app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve=>server!.once('listening',resolve));
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jobs`;
    const retry=(id:string,authorized=true)=>fetch(`${base}/${id}/retry`,{method:'POST',headers:authorized?{Authorization:`Bearer ${token}`}:{}});
    assert.equal((await retry(job,false)).status,401);
    assert.equal((await retry(foreign)).status,404);
    assert.equal((await retry(job)).status,200);
    assert.equal((await retry(job)).status,409,'repeated retry must not enqueue duplicates');
    assert.equal(localQueueSnapshot().pending,1);
    const row=(await query<{status:string;error:string|null}>('select status,error from translation_jobs where id=$1',[job])).rows[0];
    assert.equal(row.status,'queued');assert.equal(row.error,null);
    const saved=(await query<{cues_json:Array<{text:string}>}>('select cues_json from translation_job_chunks where job_id=$1',[job])).rows[0];
    assert.equal(saved.cues_json[0].text,'已生成');
  } finally {
    if(server) await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
    await closeDatabase();await rm(dir,{recursive:true,force:true});
  }
});
