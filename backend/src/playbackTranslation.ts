import crypto from 'node:crypto';
import { query } from './db.js';
import { abortJobOperations } from './jobControl.js';
import { machineTranslationProvider, translateMachineCues } from './machineTranslation.js';
import { prepareSourceCues, coveredSourceIndexes, finalizeTranslatedCues, type RawCue, type CleanCue, type TranslatedCue } from './subtitles.js';
import { isChineseTarget } from './chineseSubtitles.js';

type Playback = {
  id:string; owner:string; clientId:string; captionId:string; source:string; target:string; jobId?:string;
  cues:CleanCue[]; cached:Map<number,TranslatedCue>; ai:TranslatedCue[]; covered:Set<number>;
  position:number; paused:boolean; seeking:boolean; warmup:boolean; sequence:number; seen:number; retryAt?:number;
  controller?:AbortController; running?:Promise<void>; state:string; error?:string;
};
const sessions=new Map<string,Playback>();
const live=(s:Playback)=>Date.now()-s.seen<15000;
const windowCues=(s:Playback)=>s.cues.filter(c=>c.end>s.position && c.start<=s.position+(s.paused?0:30)).slice(0,16);
const selectedCues=(s:Playback)=>s.seeking?[]:s.paused ? (s.warmup?s.cues.filter(c=>c.end>s.position).slice(0,1):[]) : windowCues(s);
const missing=(s:Playback)=>selectedCues(s).filter(c=>!s.cached.has(c.index)&&!s.covered.has(c.index));
function cancel(s:Playback) {s.controller?.abort(new Error('播放位置已改变'));}
function close(s:Playback) {cancel(s);sessions.delete(s.id);}
const cleanup=setInterval(()=>{for(const s of sessions.values())if(!live(s))close(s);},5000);
cleanup.unref();

export function hasPlaybackWindow(owner:string,captionId:string,target:string) {
  return [...sessions.values()].some(s=>s.owner===owner&&s.captionId===captionId&&s.target===target&&live(s));
}
export function attachPlaybackJob(owner:string,captionId:string,target:string,jobId:string) {
  for(const s of sessions.values())if(s.owner===owner&&s.captionId===captionId&&s.target===target&&live(s))s.jobId=jobId;
}
export function activePlaybackJobIds() {return [...new Set([...sessions.values()].filter(live).flatMap(s=>s.jobId?[s.jobId]:[]))];}
export function playbackProgressForJob(jobId:string) {
  const s=[...sessions.values()].find(value=>value.jobId===jobId&&live(value));
  if(!s)return null;
  const progress=response(s);
  return {mode:'playback',state:s.error?'waiting':'running',error:s.error||null,completedCues:progress.completedCues,totalCues:progress.totalCues};
}
export async function closePlaybackForJob(jobId:string) {
  for(const s of sessions.values())if(s.jobId===jobId)close(s);
}

async function refreshAI(s:Playback) {
  const rows=await query<{cues_json:TranslatedCue[]|string}>(
    `select a.cues_json from translation_job_chunks a join translation_jobs j on j.id=a.job_id
     where j.user_id=$1 and j.caption_source_id=$2 and j.target_lang=$3 and j.status<>'cancelled'
     order by j.created_at desc,a.chunk_index`,[s.owner,s.captionId,s.target]);
  const all=rows.rows.flatMap(row=>typeof row.cues_json==='string'?JSON.parse(row.cues_json):row.cues_json);
  s.covered=coveredSourceIndexes(all);
  const unique=new Map<string,TranslatedCue>();
  for(const cue of all){const key=JSON.stringify([cue.start,cue.end]);if(!unique.has(key))unique.set(key,cue);}
  s.ai=[...unique.values()].sort((a,b)=>a.start-b.start);
}
function start(s:Playback) {
  if(s.error&&Date.now()<(s.retryAt||0))return;
  if(s.running||!live(s)||!sessions.has(s.id)||!missing(s).length){if(!s.running)s.state=s.paused?'paused':'ready';return;}
  const controller=new AbortController();s.controller=controller;s.state='running';s.error=undefined;
  const pending=missing(s);
  s.running=(async()=>{
    try {
      await translateMachineCues({cues:pending,sourceLanguage:s.source,targetLanguage:s.target,signal:controller.signal,
        shouldContinue:async()=>live(s)&&sessions.has(s.id)&&(!s.paused||s.warmup),
        onBatch:async({cues})=>{
          controller.signal.throwIfAborted();
          for(const cue of cues){
            const index=cue.sourceIndexes?.[0];if(index===undefined||s.cached.has(index))continue;
            s.cached.set(index,cue);
            if(s.paused)s.warmup=false;
            await query(`insert into local_machine_cue_cache(user_id,caption_source_id,target_lang,provider,source_index,cue_json)
              values($1,$2,$3,'macos',$4,$5) on conflict(user_id,caption_source_id,target_lang,provider,source_index)
              do update set cue_json=excluded.cue_json,updated_at=now()`,[s.owner,s.captionId,s.target,index,JSON.stringify(cue)]);
          }
        }});
    }catch(error){if(!controller.signal.aborted){s.state='waiting';s.error=error instanceof Error?error.message:String(error);s.retryAt=Date.now()+30000;}}
    finally{
      if(s.controller===controller)s.controller=undefined;
      s.running=undefined;
      if(sessions.has(s.id)&&live(s)&&!s.error)start(s);
    }
  })();
}
function response(s:Playback) {
  const around=s.cues.filter(c=>c.end>=s.position-10&&c.start<=s.position+40);
  // Format only the response. Persistent caches and coverage still use original source cues.
  const format=(cues:TranslatedCue[])=>isChineseTarget(s.target)?finalizeTranslatedCues(cues,s.target):cues;
  return {ok:true,sessionId:s.id,sequence:s.sequence,state:s.state,error:s.error||null,
    aiCues:format(s.ai.filter(c=>c.end>=s.position-10&&c.start<=s.position+40)),
    machineCues:format(around.flatMap(c=>{const value=s.cached.get(c.index);return value?[value]:[];})),
    completedCues:selectedCues(s).filter(c=>s.cached.has(c.index)||s.covered.has(c.index)).length,totalCues:selectedCues(s).length};
}
export async function openPlayback(input:{owner:string;clientId:string;captionId:string;source:string;target:string;raw:RawCue[];captionType:'auto'|'manual';position:number;paused:boolean}) {
  if(machineTranslationProvider()!=='macos')return {ok:true,disabled:true};
  for(const old of sessions.values())if(old.owner===input.owner&&old.clientId===input.clientId)close(old);
  const s:Playback={id:crypto.randomUUID(),owner:input.owner,clientId:input.clientId,captionId:input.captionId,source:input.source,target:input.target,
    cues:prepareSourceCues(input.raw,input.captionType),cached:new Map(),ai:[],covered:new Set(),position:input.position,
    paused:input.paused,seeking:false,warmup:true,sequence:0,seen:Date.now(),state:'ready'};
  const cached=await query<{cue_json:TranslatedCue|string}>(
    `select cue_json from local_machine_cue_cache where user_id=$1 and caption_source_id=$2 and target_lang=$3 and provider='macos'
     union all select value as cue_json from translation_job_machine_chunks m join translation_jobs j on j.id=m.job_id,
     lateral jsonb_array_elements(m.cues_json) value
     where j.user_id=$1 and j.caption_source_id=$2 and j.target_lang=$3 and m.provider='macos'`,[s.owner,s.captionId,s.target]);
  for(const row of cached.rows){
    const value=typeof row.cue_json==='string'?JSON.parse(row.cue_json):row.cue_json;
    const source=s.cues.find(c=>c.start===value.start&&c.end===value.end&&c.text===value.sourceText);
    if(source&&value.text?.trim()&&!s.cached.has(source.index))s.cached.set(source.index,{...value,sourceIndexes:[source.index]});
  }
  const latest=(await query<{id:string}>("select id from translation_jobs where user_id=$1 and caption_source_id=$2 and target_lang=$3 and status<>'cancelled' order by created_at desc limit 1",[s.owner,s.captionId,s.target])).rows[0];
  s.jobId=latest?.id;
  sessions.set(s.id,s);
  // A foreground playback window replaces the old whole-video fallback work.
  await query("update translation_jobs set machine_translation_mode='playback' where user_id=$1 and caption_source_id=$2 and target_lang=$3 and status<>'cancelled'",[s.owner,s.captionId,s.target]);
  const oldJobs=await query<{id:string}>(`select id from translation_jobs where user_id=$1 and caption_source_id=$2 and target_lang=$3
    and status='failed' and machine_translation_state in ('running','waiting')`,[s.owner,s.captionId,s.target]);
  for(const row of oldJobs.rows){abortJobOperations(row.id);await query("update translation_jobs set machine_translation_state='idle',machine_translation_retry_at=null where id=$1 and status='failed'",[row.id]);}
  await refreshAI(s);start(s);return response(s);
}
export async function updatePlayback(owner:string,id:string,input:{position:number;paused:boolean;seeking:boolean;sequence:number}) {
  const s=sessions.get(id);if(!s||s.owner!==owner)throw Object.assign(new Error('播放翻译会话已过期'),{status:404});
  if(input.sequence<=s.sequence)return response(s);
  const moved=Math.abs(input.position-s.position)>3;
  const pauseChanged=s.paused!==input.paused;
  s.sequence=input.sequence;s.position=input.position;s.paused=input.paused;s.seeking=input.seeking;s.seen=Date.now();
  if(!s.paused||pauseChanged)s.warmup=false;
  if(moved||(s.paused&&!s.warmup)||input.seeking)cancel(s);
  await refreshAI(s);
  if(input.sequence!==s.sequence)return response(s);
  if(!missing(s).length)cancel(s);
  if(input.seeking){s.state='seeking';return response(s);}
  if(s.error&&Date.now()>=(s.retryAt||0)){s.error=undefined;} // Heartbeats may retry recoverable system errors.
  start(s);return response(s);
}
export function closePlayback(owner:string,id:string) {
  const s=sessions.get(id);if(s&&s.owner===owner)close(s);return {ok:true};
}
