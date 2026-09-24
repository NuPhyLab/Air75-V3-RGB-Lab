import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ClaudeCodeAdapter} from '../server/claude-code.mjs';
import {HOOK_MARKER,shellQuote} from '../server/claude-hooks.mjs';

const exec=promisify(execFile);
async function harness(t,{install=true}={}) {
 const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-claude-adapter-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const claudeDir=path.join(dir,'claude home');
 const dataDir=path.join(dir,'数据');
 await mkdir(path.join(claudeDir,'sessions'),{recursive:true});
 await mkdir(dataDir,{recursive:true});
 await writeFile(path.join(claudeDir,'settings.json'),'{}');
 const supportDir=path.join(dir,'claude-support');
 await mkdir(path.join(supportDir,'claude-code-sessions','w','s'),{recursive:true});
 const adapter=new ClaudeCodeAdapter({dataDir,claudeDir,supportDir,pollIntervalMs:100000});
 t.after(()=>adapter.stop());
 if(install) await adapter.install();
 const script=path.join(dataDir,'claude-hook',HOOK_MARKER);
 const spool=path.join(dataDir,'claude-sessions');
 // Every event goes through the launcher Claude Code would actually run, with
 // this long-lived test process as its parent, exactly like a real session.
 const send=(payload)=>new Promise((resolve,reject)=>{
   const child=spawn(script,[spool],{stdio:['pipe','ignore','ignore']});
   child.on('error',reject);
   child.on('exit',code=>code===0?resolve():reject(new Error(`hook exited ${code}`)));
   child.stdin.end(JSON.stringify(payload));
 });
 const register=(id,extra={})=>writeFile(path.join(claudeDir,'sessions',`${extra.pid??process.pid}.json`),JSON.stringify({
   pid:extra.pid??process.pid,sessionId:id,cwd:extra.cwd??'/Users/x/proj',
   startedAt:Date.now()-Math.round(process.uptime()*1000),
   procStart:new Date(Date.now()-Math.round(process.uptime()*1000)).toUTCString(),
   version:'2.1.174',kind:'interactive',entrypoint:extra.entrypoint??'claude-desktop',name:extra.name,...extra,
 }));
 const tasks=async()=>{await adapter.refresh();return adapter.snapshot().tasks;};
 // Mirrors the Claude desktop application's own record for a Code session.
 const desktop=(cliSessionId,desktopId)=>writeFile(
   path.join(supportDir,'claude-code-sessions','w','s',`${desktopId}.json`),
   JSON.stringify({sessionId:desktopId,cliSessionId,title:'ignored',systemPrompt:'ignored'}));
 return {dir,claudeDir,dataDir,supportDir,adapter,send,register,spool,tasks,desktop};
}

test('sessions stay isolated: one session changing state never overwrites another',async t=>{
 const h=await harness(t);
 await h.send({hook_event_name:'SessionStart',session_id:'alpha',cwd:'/Users/x/alpha',source:'startup'});
 await h.send({hook_event_name:'SessionStart',session_id:'beta',cwd:'/Users/x/beta',source:'startup'});
 await h.send({hook_event_name:'UserPromptSubmit',session_id:'alpha'});
 await h.send({hook_event_name:'PreToolUse',session_id:'alpha',tool_name:'Bash'});
 await h.send({hook_event_name:'PermissionRequest',session_id:'beta',tool_name:'Write'});
 const byId=Object.fromEntries((await h.tasks()).map(task=>[task.id,task]));
 assert.equal(byId.alpha.status,'running');
 assert.equal(byId.beta.status,'awaitingApproval');
 assert.equal(byId.alpha.project,'alpha');
 assert.equal(byId.beta.project,'beta');
 await h.send({hook_event_name:'Stop',session_id:'alpha'});
 const after=Object.fromEntries((await h.tasks()).map(task=>[task.id,task]));
 assert.equal(after.alpha.status,'awaitingInput');
 assert.equal(after.beta.status,'awaitingApproval','the other session keeps its own state');
});
test('prompts, tool inputs and assistant text never reach the spool',async t=>{
 const h=await harness(t);
 await h.send({hook_event_name:'UserPromptSubmit',session_id:'privacy',cwd:'/Users/x/p',prompt:'TOP-SECRET-PROMPT',permission_mode:'default'});
 await h.send({hook_event_name:'PreToolUse',session_id:'privacy',tool_name:'Bash',tool_input:{command:'TOP-SECRET-COMMAND'}});
 await h.send({hook_event_name:'PostToolUse',session_id:'privacy',tool_name:'Bash',tool_response:'TOP-SECRET-OUTPUT'});
 await h.send({hook_event_name:'Stop',session_id:'privacy',last_assistant_message:'TOP-SECRET-ANSWER'});
 const raw=await readFile(path.join(h.spool,'privacy.jsonl'),'utf8');
 for(const secret of ['TOP-SECRET-PROMPT','TOP-SECRET-COMMAND','TOP-SECRET-OUTPUT','TOP-SECRET-ANSWER'])
  assert.equal(raw.includes(secret),false,`${secret} must not be stored`);
 assert.equal(JSON.stringify(await h.tasks()).includes('TOP-SECRET'),false);
 assert.match(raw,/"t":"Bash"/);
 assert.match(raw,/"m":"default"/);
});
test('a live registered session is recognised before any event arrives',async t=>{
 const h=await harness(t);
 await h.register('registered-1',{name:'proj-7a'});
 const [task]=await h.tasks();
 assert.equal(task.id,'registered-1');
 assert.equal(task.title,'proj-7a');
 assert.equal(task.status,'unknown');
 assert.equal(task.registered,true);
 assert.match(task.evidence,/还没有收到事件/);
});
test('a session whose process is gone is reported as ended, not as still running',async t=>{
 const h=await harness(t);
 await h.send({hook_event_name:'UserPromptSubmit',session_id:'gone',cwd:'/Users/x/p'});
 const running=(await h.tasks())[0];
 assert.equal(running.status,'running','the hook process is alive during the test');
 // Rewrite the record with a process id that cannot be running.
 await writeFile(path.join(h.spool,'gone.jsonl'),
   `${JSON.stringify({v:1,at:Date.now(),q:'zz',e:'UserPromptSubmit',s:'gone',c:'/Users/x/p',p:2147483646})}\n`);
 const [task]=await h.tasks();
 assert.equal(task.status,'ended');
 assert.equal(task.endedReason,'disconnected');
 assert.equal(task.live,false);
});
test('long silence alone never turns a live session into a disconnected one',async t=>{
 const h=await harness(t);
 await writeFile(path.join(h.spool,'slow.jsonl'),
   `${JSON.stringify({v:1,at:Date.now()-9*60*60*1000,q:'a',e:'PreToolUse',s:'slow',c:'/Users/x/p',t:'Bash',p:process.pid})}\n`);
 await h.register('slow');
 const [task]=await h.tasks();
 assert.equal(task.status,'running');
 assert.equal(task.live,true);
 assert.match(task.evidence,/正在执行 Bash/);
});
test('ended sessions disappear after the retention window',async t=>{
 const h=await harness(t);
 await h.send({hook_event_name:'SessionEnd',session_id:'old',cwd:'/Users/x/p',reason:'clear'});
 assert.equal((await h.tasks()).length,1);
 h.adapter.endedRetentionMs=0;
 assert.equal((await h.tasks()).length,0);
});
test('without an installed hook the integration reports itself unavailable instead of guessing',async t=>{
 const h=await harness(t,{install:false});
 await h.register('live-session');
 await h.adapter.refresh();
 const snapshot=h.adapter.snapshot();
 assert.equal(snapshot.available,false);
 assert.equal(snapshot.hooks.status,'missing');
 assert.equal(snapshot.tasks[0].status,'unknown');
 assert.match(snapshot.tasks[0].evidence,/尚未安装/);
});
test('account quota is reported as unsupported rather than estimated',async t=>{
 const h=await harness(t);
 const {quota}=h.adapter.snapshot();
 assert.equal(quota.supported,false);
 assert.equal(quota.available,false);
 assert.match(quota.reason,/暂不支持读取/);
 assert.equal(/\d+%/.test(JSON.stringify(quota)),false,'no invented percentage');
});
test('files that are not session spools are ignored',async t=>{
 const h=await harness(t);
 await writeFile(path.join(h.spool,'notes.txt'),'ignore me');
 await writeFile(path.join(h.spool,'../escape.jsonl'),'{}');
 await h.send({hook_event_name:'Stop',session_id:'real',cwd:'/Users/x/p'});
 const tasks=await h.tasks();
 assert.deepEqual(tasks.map(task=>task.id),['real']);
});
test('slots keep six positions and never share a session between two indexes',async t=>{
 const h=await harness(t);
 for(const id of ['s1','s2','s3'])
  await h.send({hook_event_name:'UserPromptSubmit',session_id:id,cwd:`/Users/x/${id}`});
 await h.adapter.refresh();
 const slots=h.adapter.snapshot().slots;
 assert.equal(slots.length,6);
 const used=slots.filter(slot=>slot.id).map(slot=>slot.id);
 assert.equal(new Set(used).size,used.length);
 assert.deepEqual(slots.slice(3).map(slot=>slot.status),['unassigned','unassigned','unassigned']);
});
test('the session deep link uses the id the Claude desktop app recorded, not the CLI id',async t=>{
 const h=await harness(t);
 const cli='72b867d4-e920-4a3d-82b7-9c3798c21b7e';
 const desk='local_34f11c53-685a-4748-83d2-99a78c5454cd';
 await h.desktop(cli,desk);
 await h.send({hook_event_name:'UserPromptSubmit',session_id:cli,cwd:'/Users/x/p'});
 const [task]=await h.tasks();
 assert.equal(task.desktopId,desk,'the adapter resolves the desktop id for the session');
 const action=h.adapter.action('openSession',{session:task});
 assert.equal(action.available,true);
 // The application's own router accepts "last" or /^local_[A-Za-z0-9-]{1,64}$/.
 assert.equal(action.url,`claude://code/continue?session=${desk}`);
 assert.ok(/^local_[A-Za-z0-9-]{1,64}$/.test(new URL(action.url).searchParams.get('session')));
});
test('without a desktop record the jump is refused instead of opening a new session',async t=>{
 const h=await harness(t);
 // A session started in a terminal has no record in the desktop application;
 // sending the CLI id would silently create a new session instead of jumping.
 await h.send({hook_event_name:'UserPromptSubmit',session_id:'no-desktop-record',cwd:'/Users/x/p'});
 const [task]=await h.tasks();
 assert.equal(task.desktopId,null);
 const action=h.adapter.action('openSession',{session:task});
 assert.equal(action.available,false);
 assert.match(action.reason,/没有这个会话的记录/);
});
