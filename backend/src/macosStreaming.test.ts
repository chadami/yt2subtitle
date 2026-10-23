import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TranslatedCue } from './subtitles.js';

test('macOS publishes each cue before helper exits and resumes partial or old complete batches', {timeout:10000}, async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'vidlingo-stream-'));
  const helper=path.join(dir,'helper'), failed=path.join(dir,'failed'), calls=path.join(dir,'calls'), gate=path.join(dir,'gate');
  await writeFile(helper,`#!${process.execPath}
const fs=require('node:fs');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(input)+'\\n');
(async()=>{
for(let index=0;index<input.texts.length;index++) {
 const text=input.texts[index];
 if(text==='Second.'&&!fs.existsSync(${JSON.stringify(failed)})) {
  // If the parent waits for the entire process instead of streaming, this
  // gate is never released and the test times out.
  while(!fs.existsSync(${JSON.stringify(gate)})) await new Promise(r=>setTimeout(r,5));
  fs.writeFileSync(${JSON.stringify(failed)},'');
  console.log(JSON.stringify({ok:false,error:'temporary_failure'}));return;
 }
 const line=Buffer.from(JSON.stringify({ok:true,index,translations:['逐条译文 '+text]})+'\\n');
 // Deliberately split UTF-8 output across chunks.
 process.stdout.write(line.subarray(0,Math.floor(line.length/2)));
 await new Promise(r=>setTimeout(r,5));
 process.stdout.write(line.subarray(Math.floor(line.length/2)));
}
console.log(JSON.stringify({ok:true,done:true}));
})();
`,{mode:0o755});
  Object.assign(process.env,{DATA_DIR:path.join(dir,'data'),LOCAL_MT_PROVIDER:'macos',LOCAL_TRANSLATE_HELPER:helper});
  const {translateMachineCues}=await import('./machineTranslation.js');
  const cues=['First.','Second.','Third.'].map((text,index)=>({text,index,start:index*3,end:index*3+2}));
  let saved:TranslatedCue[]=[];
  const published:number[]=[];
  const onBatch=async({cues:translated}:{cues:TranslatedCue[]})=>{
    saved=translated; published.push(translated.length);
    if(translated.length===1) await writeFile(gate,'received-first-cue');
  };
  try {
    await assert.rejects(translateMachineCues({cues,sourceLanguage:'en',targetLanguage:'zh-Hans',onBatch}),/temporary_failure/);
    assert.equal(saved.length,1,'first cue must be persisted before later failure');
    await translateMachineCues({cues,sourceLanguage:'en',targetLanguage:'zh-Hans',onBatch,
      completedBatchIndexes:new Set([0]),completedBatchCues:new Map([[0,saved]])});
    assert.deepEqual(published,[1,2,3]);
    assert.equal(saved.length,3);
    assert.ok(saved.every(cue=>cue.text.startsWith('逐条译文')));
    const requests=(await readFile(calls,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(requests.map(r=>r.texts),[['First.','Second.','Third.'],['Second.','Third.']]);
    assert.ok(requests.every(r=>r.stream===true));
    // Old batched translations already contain the full list of cues.
    await translateMachineCues({cues,sourceLanguage:'en',targetLanguage:'zh-Hans',onBatch,
      completedBatchIndexes:new Set([0]),completedBatchCues:new Map([[0,saved]])});
    assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,2,'complete saved batches must not be translated again');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
