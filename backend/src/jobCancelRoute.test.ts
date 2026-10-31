import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';

test('stop cancels running work but leaves a finished failed job retryable', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'vidlingo-cancel-'));
  const token='cancel-test-local-token-only';
  Object.assign(process.env,{DATA_DIR:dir,LOCAL_TOKEN:token,LOCAL_MT_PROVIDER:'off'});
  const {initDatabase}=await import('./migrate.js');
  const {query,closeDatabase}=await import('./db.js');
  const {getLocalUserId}=await import('./auth.js');
  const {jobsRouter}=await import('./routes/jobs.js');
  const app=express();app.use(express.json());app.use('/api/jobs',jobsRouter);
  app.use((error:Error & {status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.status||500).json({error:error.message}));
  let server:ReturnType<typeof app.listen>|undefined;
  try {
    await initDatabase();
    const owner=await getLocalUserId();
    await query("insert into videos(video_id,url) values('cancel-test','https://youtube.com/watch?v=cancel-test')");
    const caption=(await query<{id:string}>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values('cancel-test','en','manual','[]') returning id")).rows[0].id;
    const create=async(status:string,machineState='idle')=>(await query<{id:string}>(
      "insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status,error,machine_translation_state) values($1,'cancel-test','en','zh-Hans',$2,$3,$4,$5) returning id",
      [owner,caption,status,status==='failed'?'timeout':null,machineState])).rows[0].id;
    const row=async(id:string)=>(await query<{status:string;error:string|null}>('select status,error from translation_jobs where id=$1',[id])).rows[0];
    server=app.listen(0,'127.0.0.1');
    await new Promise<void>(resolve=>server!.once('listening',resolve));
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jobs`;
    const post=(id:string,action:string)=>fetch(`${base}/${id}/${action}`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});

    const translating=await create('translating');
    const stopped=await post(translating,'cancel');
    assert.equal(stopped.status,200);
    assert.equal((await stopped.json()).status,'cancelled');
    assert.equal((await row(translating)).status,'cancelled');
    const again=await post(translating,'cancel');
    assert.equal(again.status,200,'a repeated stop is not an error');
    assert.equal((await again.json()).status,'cancelled');

    const fallback=await create('failed','running');
    assert.equal((await post(fallback,'cancel')).status,200);
    assert.equal((await row(fallback)).status,'cancelled','running machine fallback must stop');

    const finished=await create('failed');
    const late=await post(finished,'cancel');
    assert.equal(late.status,200);
    assert.equal((await late.json()).status,'failed');
    assert.deepEqual(await row(finished),{status:'failed',error:'timeout'},'a finished failed job keeps its error');
    assert.equal((await post(finished,'retry')).status,200,'a finished failed job stays retryable after stop');
  } finally {
    if(server) await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
    await closeDatabase();await rm(dir,{recursive:true,force:true});
  }
});
