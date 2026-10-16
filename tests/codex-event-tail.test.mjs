import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readEventLines,findLatestEvent} from '../server/codex-event-tail.mjs';

test('incremental reader retains split UTF-8, processes each line once and resets on replacement/truncation',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-event-tail-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'events.jsonl'),line=Buffer.from('{"type":"你好"}\n');let previous,lines=[],resets=0;
 const read=async()=>previous=await readEventLines(file,{previous,onReset:()=>resets++,onLine:line=>lines.push(line)});
 const cut=line.indexOf(Buffer.from('好'))+1;
 await writeFile(file,line.subarray(0,cut));await read();assert.deepEqual(lines,[]);
 await appendFile(file,line.subarray(cut));await read();assert.deepEqual(lines,[line.toString().trim()]);
 await read();assert.equal(lines.length,1);assert.equal(resets,1);
 await writeFile(path.join(dir,'next'),'{}\n');await rename(path.join(dir,'next'),file);await read();assert.equal(resets,2);
 await writeFile(file,'\n');await read();assert.equal(resets,3);assert.equal(previous.fragment.length,0);
});
test('oversized initial tail and bounded backlog advance without retaining giant records',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-event-tail-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'events.jsonl');let previous,lines=[];
 const read=async()=>previous=await readEventLines(file,{previous,tailBytes:4096,maxReadBytes:65536,onLine:line=>lines.push(line)});
 await writeFile(file,'x'.repeat(1100000));await read();assert.equal(previous.fragment.length,0);
 await appendFile(file,'\n{"done":true}\n');await read();assert.deepEqual(lines,['{"done":true}']);
 await appendFile(file,'x'.repeat(1200000)+'\n{"next":true}\n');
 do{const before=previous.offset;await read();assert.ok(previous.offset-before<=65536);assert.ok(previous.fragment.length<=1048576);}while(previous.offset<previous.size);
 assert.deepEqual(lines,['{"done":true}','{"next":true}']);
});

test('cold-start reverse search skips huge records, partial final lines and respects a finite IO budget',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-event-search-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'events.jsonl');
 const target='{"kind":"完成你好"}';
 await writeFile(file,'{"kind":"old"}\n'+target+'\n'+('x'.repeat(1400000))+'\n{"ignored":true}\n{"kind":"partial');
 const snapshot=await readEventLines(file);let previous,calls=0;
 do {
  const before=previous?.offset??snapshot.size;
  previous=await findLatestEvent(file,{snapshot,previous,maxReadBytes:65536,isEventLine:line=>{
   try{return Boolean(JSON.parse(line).kind);}catch{return false;}
  }});
  if(!previous.done)assert.ok(before-previous.offset<=65536);
  assert.ok((previous.fragment?.length??0)<=1048576);calls++;
 }while(!previous.done);
 assert.ok(calls>1);assert.equal(previous.line,target);
 const capped=await findLatestEvent(file,{snapshot,maxSearchBytes:131072,isEventLine:line=>line===target});
 assert.equal(capped.done,true);assert.equal(capped.line,null);assert.equal(capped.fragment.length,0);
 await writeFile(file,'{"kind":"first"}\n');
 const small=await readEventLines(file);
 assert.equal((await findLatestEvent(file,{snapshot:small,isEventLine:()=>true})).line,'{"kind":"first"}');
});
