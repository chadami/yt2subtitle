import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

test("local access, complete startup recovery and history pagination", { timeout: 60000 }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "vidlingo-integration-"));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  const token = "integration-only-local-token";
  Object.assign(process.env, {
    PORT: String(port), DATA_DIR: dataDir,
    LOCAL_TOKEN: token, EXTENSION_ORIGIN: "*",
    LOCAL_AI_PROVIDER: "openai", LOCAL_AI_API_KEY: "integration-only-key", LOCAL_AI_MODEL: "test-model", LOCAL_MT_PROVIDER: "off"
  });
  const { initDatabase } = await import("./migrate.js");
  const { query, closeDatabase, execScript } = await import("./db.js");
  const { getLocalUserId } = await import("./auth.js");
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let logs = "";
  try {
    if (process.env.VIDLINGO_LEGACY_SCHEMA) {
      await execScript(await readFile(process.env.VIDLINGO_LEGACY_SCHEMA, 'utf8'));
    } else { await initDatabase(); }
    const userId = await getLocalUserId();
    await query("insert into videos (video_id, url, title) values ('integration', 'https://www.youtube.com/watch?v=integration', 'Integration')");
    const captions = await query<{ id: string }>(
      "insert into caption_sources (video_id, source_lang, caption_type, raw_cues_json) values ('integration', 'en', 'manual', '[]') returning id"
    );
    // More than two recovery/history pages, with identical microsecond timestamps.
    await query(`insert into translation_jobs
      (user_id, video_id, source_lang, target_lang, caption_source_id, status, created_at)
      select $1, 'integration', 'en', 'ja', $2, 'queued', '2026-01-01 00:00:00.123456+00'::timestamptz
      from generate_series(1, 205)`, [userId, captions.rows[0].id]);
    const other = await query<{ id: string }>("insert into users default values returning id");
    await query(`insert into translation_jobs (user_id, video_id, source_lang, target_lang, caption_source_id, status)
      values ($1, 'integration', 'en', 'ja', $2, 'completed')`, [other.rows[0].id, captions.rows[0].id]);
    const otherJob = await query<{id:string}>('select id from translation_jobs where user_id=$1 limit 1',[other.rows[0].id]);
    const raw = [{start:0,end:2,text:'Hello.'}];
    const { hashRawCues } = await import('./subtitleLibrary.js');
    await query("insert into videos(video_id,url,title) values('legacy-cache-test','https://www.youtube.com/watch?v=legacy-cache-test','Saved locally')");
    const savedCaption = await query<{id:string}>(`insert into caption_sources(video_id,source_lang,caption_type,cue_hash,raw_cues_json)
      values('legacy-cache-test','en','manual',$1,$2) returning id`,[hashRawCues(raw),JSON.stringify(raw)]);
    await query(`insert into translated_subtitles(video_id,source_lang,target_lang,provider_mode,provider,model,
      caption_source_id,created_by_user_id,cues_json,vtt_text)
      values('legacy-cache-test','en','ja','user','openai','test-model',$1,$2,$3,'WEBVTT')`,
      [savedCaption.rows[0].id,userId,JSON.stringify([{start:0,end:2,text:'こんにちは',sourceText:'Hello.'}])]);
    const chineseText = '先打开文件。然后点击保存。最后关闭窗口。';
    const chineseJob = (await query<{id:string}>('select id from translation_jobs where user_id=$1 limit 1',[userId])).rows[0].id;
    await query(`insert into translated_subtitles(video_id,source_lang,target_lang,provider_mode,provider,model,
      caption_source_id,created_by_user_id,cues_json,vtt_text,job_id)
      values('legacy-cache-test','en','zh-Hans','user','openai','test-model',$1,$2,$3,'WEBVTT',$4)`,
      [savedCaption.rows[0].id,userId,JSON.stringify([
        {start:0,end:2,text:'先打开文'}, {start:2,end:8,text:'件。然后点击保存。最后关闭窗口。'}
      ]),chineseJob]);
    await query('insert into translation_job_chunks(job_id,chunk_index,cues_json) values($1,0,$2)',[
      chineseJob,JSON.stringify([{start:0,end:8,text:chineseText,sourceText:'First open the file. Then save and close it.'}])
    ]);
    if (process.env.VIDLINGO_LEGACY_SCHEMA) {
      await query("insert into user_entitlements(user_id,plan,status,generation_video_limit) values($1,'standard','expired',0)",[userId]);
    }
    // Apply the new schema after saving data, and check it is idempotent.
    await initDatabase();
    assert.equal((await query("select * from translated_subtitles where video_id='legacy-cache-test'")).rows.length,2);
    assert.equal(await getLocalUserId(),userId);
    await closeDatabase();
    // No worker handler: recovered jobs remain pending for an exact count.
    child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("server.ts", import.meta.url))], {
      env: process.env, stdio: ["ignore", "pipe", "pipe"]
    });
    exited = new Promise((resolve) => child!.once("exit", resolve));
    child.stdout?.on("data", (chunk) => { logs += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { logs += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { ready = (await fetch(`${base}/health`)).ok; } catch { /* Starting. */ }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, logs);
    const origin = `chrome-extension://${"a".repeat(32)}`;
    const client = { Origin: origin, "X-VidLingo-Client": "extension" };
    for (const badOrigin of ["https://example.org", "https://www.youtube.com", "null"]) {
      const response = await fetch(`${base}/api/local/session`, { headers: { ...client, Origin: badOrigin } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    assert.equal((await fetch(`${base}/api/local/session`)).status, 403);
    const session = await fetch(`${base}/api/local/session`, { headers: client });
    assert.equal(session.status, 200);
    assert.equal(session.headers.get("access-control-allow-origin"), origin);
    assert.equal(session.headers.get("cache-control"), "no-store");
    const connected = await session.json();
    assert.equal(connected.token, token);
    assert.equal(connected.userId, userId, "existing local identity must survive an application update");
    const preflight = await fetch(`${base}/api/local/session`, { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-vidlingo-client"
    } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers") || "", /x-vidlingo-client/i);
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/local/preferences`)).status, 401);
    assert.equal((await fetch(`${base}/api/jobs/history`, { headers: { Authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/api/local/status`)).status, 401);
    const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
      http.get(`${base}/health`, { headers: { Host: `evil.example:${port}` } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    assert.equal(reboundStatus, 403);
    const deniedWrite = await fetch(`${base}/api/local/preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"targetLang":"ja"}' });
    assert.equal(deniedWrite.status, 401);
    const write = await fetch(`${base}/api/local/preferences`, { method: "PUT", headers: auth, body: JSON.stringify({ targetLang: "ja", showSourceText: false }) });
    assert.equal(write.status, 200);
    assert.deepEqual(await write.json(), { targetLang: "ja", showSourceText: false });
    const status = await (await fetch(`${base}/api/local/status`, { headers: auth })).json();
    assert.equal(status.queue.pending, 205);
    assert.match(logs, /Requeued 205 interrupted job/);
    let cursor: string | null = null;
    const ids: string[] = [];
    const sizes: number[] = [];
    do {
      const response: Response = await fetch(`${base}/api/jobs/history${cursor ? `?cursor=${cursor}` : ""}`, { headers: auth });
      assert.equal(response.status, 200, await response.clone().text());
      const page: { total: number; history: Array<{ jobId: string }>; nextCursor: string | null } = await response.json();
      assert.equal(page.total, 205);
      sizes.push(page.history.length);
      ids.push(...page.history.map((row: { jobId: string }) => row.jobId));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(sizes, [100, 100, 5]);
    assert.equal(new Set(ids).size, 205);
    assert.equal((await fetch(`${base}/api/jobs/history?cursor=invalid`, { headers: auth })).status, 400);
    const resolve = await fetch(base+'/api/subtitles/resolve',{method:'POST',headers:auth,body:JSON.stringify({
      video:{videoId:'legacy-cache-test',url:'https://www.youtube.com/watch?v=legacy-cache-test'},
      sourceLang:'en',targetLang:'ja',captionType:'manual',rawCues:raw
    })});
    assert.equal(resolve.status,200,await resolve.clone().text());
    const cachedSubtitle = await resolve.json();
    assert.equal(cachedSubtitle.accessSource,'local');
    assert.equal(cachedSubtitle.cues[0].text,'こんにちは','saved subtitles must remain readable');
    for (const response of [
      await fetch(base+'/api/subtitles/resolve',{method:'POST',headers:auth,body:JSON.stringify({
        video:{videoId:'legacy-cache-test',url:'https://www.youtube.com/watch?v=legacy-cache-test'},
        sourceLang:'en',targetLang:'zh-Hans',captionType:'manual',rawCues:raw
      })}),
      await fetch(base+'/api/subtitles/by-video/legacy-cache-test?sourceLang=en&targetLang=zh-Hans',{headers:auth})
    ]) {
      assert.equal(response.status,200);
      const chinese = await response.json();
      assert.deepEqual(chinese.cues.map((cue:{text:string})=>cue.text),['先打开文件。','然后点击保存。','最后关闭窗口。']);
      assert.equal(chinese.cues[0].start,0);
      assert.equal(chinese.cues.at(-1).end,8);
      assert.equal((chinese.vttText.match(/-->/g)||[]).length,3,'VTT and JSON must use identical estimated segments');
    }
    for (const route of ['/api/auth/me', '/api/admin/dashboard', '/api/account/entitlements', '/admin']) {
      assert.equal((await fetch(base + route, { headers: auth })).status, 404, route + ' must be removed');
    }
    assert.equal((await fetch(base + '/api/ai/settings', { method:'POST', headers:auth, body:'{}' })).status,404);
    const input = { video:{videoId:'local-flow-test',url:'https://www.youtube.com/watch?v=local-flow-test',title:'Local flow'},
      sourceLang:'en',targetLang:'ja',captionType:'manual',rawCues:[{start:0,end:2,text:'Hello.'}] };
    const create = async (payload: object) => {
      const response = await fetch(base+'/api/jobs',{method:'POST',headers:auth,body:JSON.stringify(payload)});
      assert.equal(response.status,200,await response.clone().text());
      return response.json();
    };
    const created = await create(input);
    const duplicate = await create(input);
    assert.equal(created.jobId,duplicate.jobId,'same request should reuse its local job');
    assert.notEqual((await create({...input,forceRegenerate:true})).jobId,created.jobId);
    const partial = await (await fetch(base+`/api/jobs/${created.jobId}/partial-subtitles`,{headers:auth})).json();
    assert.equal(partial.machineTranslation.state,'idle','normal AI jobs must not start machine translation');
    assert.equal(partial.machineTranslation.completedCues,0);
    assert.equal(partial.machineTranslation.totalCues,1);
    const stopURL = base+`/api/jobs/${created.jobId}/cancel`;
    assert.equal((await fetch(stopURL,{method:'POST'})).status,401);
    const stopped = await fetch(stopURL,{method:'POST',headers:auth});
    assert.equal(stopped.status,200);
    assert.equal((await fetch(stopURL,{method:'POST',headers:auth})).status,200,'stop must be idempotent');
    const stoppedJob = await (await fetch(base+`/api/jobs/${created.jobId}`,{headers:auth})).json();
    assert.equal(stoppedJob.status,'cancelled');
    assert.equal((await fetch(base+`/api/jobs/${otherJob.rows[0].id}/cancel`,{method:'POST',headers:auth})).status,404);
    const queueAfterStop = await (await fetch(base+'/api/local/status',{headers:auth})).json();
    assert.equal(queueAfterStop.queue.pending,206,'cancelled job must be removed from the pending queue');
    assert.equal((await fetch(base+'/api/subtitles/playback/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const preview=await fetch(base+'/api/subtitles/playback/open',{method:'POST',headers:auth,body:JSON.stringify({...input,clientId:'tab-test',position:0,paused:false})});
    assert.equal(preview.status,200,await preview.clone().text());
    assert.equal((await preview.json()).disabled,true,'preview is optional when system translation is disabled');
    const access = await fetch(base+'/api/jobs/history',{headers:{Authorization:'Bearer old-cloud-jwt'}});
    assert.equal(access.status,401,'JWT sessions must not be accepted');

  } finally {
    if (child && child.exitCode === null) { child.kill("SIGTERM"); await exited; }
    await closeDatabase().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});
