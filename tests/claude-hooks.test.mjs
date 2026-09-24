import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir,stat} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ClaudeHookInstaller,HOOK_MARKER,shellQuote} from '../server/claude-hooks.mjs';
import {HOOK_EVENTS} from '../server/claude-events.mjs';

const exec=promisify(execFile);
async function workspace(t,{settings}={}) {
 // Paths deliberately contain a space and Chinese characters.
 const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-claude-hooks-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const claudeDir=path.join(dir,'claude 主目录');
 const dataDir=path.join(dir,'数据 目录');
 await mkdir(claudeDir,{recursive:true});
 await mkdir(dataDir,{recursive:true});
 if(settings!==undefined) await writeFile(path.join(claudeDir,'settings.json'),settings);
 return {dir,claudeDir,dataDir,installer:new ClaudeHookInstaller({dataDir,claudeDir}),
  read:async()=>JSON.parse(await readFile(path.join(claudeDir,'settings.json'),'utf8'))};
}
const ourEntries=(hooks)=>Object.values(hooks??{}).flat()
 .flatMap(group=>group.hooks??[]).filter(entry=>String(entry.command).includes(HOOK_MARKER));

test('single quoting keeps spaces and Chinese characters intact for the shell',async t=>{
 const value="/a b/中文/x'y";
 const {stdout}=await exec('/bin/sh',['-c',`printf '%s' ${shellQuote(value)}`]);
 assert.equal(stdout,value);
});
test('install writes runnable scripts and registers every lifecycle event once',async t=>{
 const w=await workspace(t);
 assert.equal((await w.installer.status()).status,'missing');
 const result=await w.installer.install();
 assert.equal(result.status,'installed');
 assert.equal(result.installed,true);
 const settings=await w.read();
 assert.deepEqual(Object.keys(settings.hooks).sort(),[...HOOK_EVENTS].sort());
 assert.equal(ourEntries(settings.hooks).length,HOOK_EVENTS.length);
 const script=path.join(w.dataDir,'claude-hook',HOOK_MARKER);
 assert.ok((await stat(script)).mode & 0o100,'launcher must be executable');
 const spool=path.join(w.dataDir,'claude-sessions');
 const {stdout}=await exec('/bin/sh',['-c',`printf '%s' '{"hook_event_name":"Stop","session_id":"abc"}' | ${shellQuote(script)} ${shellQuote(spool)}`]);
 assert.equal(stdout,'{}');
 assert.ok((await readdir(spool)).includes('abc.jsonl'));
});
test('the hook finishes quickly even if its input stream never closes',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 const script=path.join(w.dataDir,'claude-hook',HOOK_MARKER);
 const spool=path.join(w.dataDir,'claude-sessions');
 const started=Date.now();
 const {code,out}=await new Promise(resolve=>{
  const child=spawn(script,[spool],{stdio:['pipe','pipe','ignore']});
  let out='';
  child.stdout.on('data',chunk=>{out+=chunk;});
  // Deliberately never end stdin: Claude Code must not be held by the hook.
  child.stdin.write('{"hook_event_name":"Stop","session_id":"never-closed"}');
  child.on('exit',value=>resolve({code:value,out}));
 });
 assert.equal(code,0);
 assert.equal(out,'{}');
 assert.ok(Date.now()-started<5000,'the hook must not wait for a stream that stays open');
 assert.ok((await readdir(spool)).includes('never-closed.jsonl'));
});
test('a payload the hook does not understand is ignored without failing',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 const script=path.join(w.dataDir,'claude-hook',HOOK_MARKER);
 const spool=path.join(w.dataDir,'claude-sessions');
 for(const input of ['not json at all','','{"hook_event_name":"Unknown","session_id":"a"}','{"session_id":"a"}','[]']) {
  const {stdout}=await exec('/bin/sh',['-c',`printf '%s' ${shellQuote(input)} | ${shellQuote(script)} ${shellQuote(spool)}`]);
  assert.equal(stdout,'{}',`input ${JSON.stringify(input)} must still answer {}`);
 }
 assert.deepEqual(await readdir(spool),[]);
});
test('concurrent hook runs never interleave a line',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 const script=path.join(w.dataDir,'claude-hook',HOOK_MARKER);
 const spool=path.join(w.dataDir,'claude-sessions');
 await Promise.all(Array.from({length:12},(_,index)=>exec('/bin/sh',['-c',
  `printf '%s' '{"hook_event_name":"PreToolUse","session_id":"race","tool_name":"T${index}"}' | ${shellQuote(script)} ${shellQuote(spool)}`])));
 const lines=(await readFile(path.join(spool,'race.jsonl'),'utf8')).trim().split('\n');
 assert.equal(lines.length,12);
 for(const line of lines) assert.equal(typeof JSON.parse(line).t,'string');
 assert.equal(new Set(lines.map(line=>JSON.parse(line).t)).size,12);
});
test('re-running install never produces duplicates',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 await w.installer.install();
 await w.installer.install();
 assert.equal(ourEntries((await w.read()).hooks).length,HOOK_EVENTS.length);
 assert.equal((await w.installer.status()).status,'installed');
});
test('other hooks, other settings and their order are preserved',async t=>{
 const w=await workspace(t,{settings:JSON.stringify({
  model:'claude-opus-4-8',
  hooks:{
   PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'/usr/local/bin/audit.sh'}]}],
   Stop:[{hooks:[{type:'command',command:'say done'}]}],
   PreCompact:[{hooks:[{type:'command',command:'keep-me'}]}],
  },
  theme:'dark',
 },null,2)});
 await w.installer.install();
 const after=await w.read();
 assert.equal(after.model,'claude-opus-4-8');
 assert.equal(after.theme,'dark');
 assert.equal(Object.keys(after).indexOf('model'),0,'existing key order is kept');
 assert.equal(after.hooks.PreToolUse[0].hooks[0].command,'/usr/local/bin/audit.sh');
 assert.equal(after.hooks.Stop[0].hooks[0].command,'say done');
 assert.deepEqual(after.hooks.PreCompact,[{hooks:[{type:'command',command:'keep-me'}]}]);
 assert.equal((await w.installer.status()).otherHooks,3);
 const removed=await w.installer.remove();
 assert.equal(removed.removed,HOOK_EVENTS.length);
 const final=await w.read();
 assert.equal(final.hooks.PreToolUse[0].hooks[0].command,'/usr/local/bin/audit.sh');
 assert.equal(final.hooks.Stop[0].hooks[0].command,'say done');
 assert.deepEqual(final.hooks.PreCompact,[{hooks:[{type:'command',command:'keep-me'}]}]);
 assert.equal(ourEntries(final.hooks).length,0);
 assert.equal(final.model,'claude-opus-4-8');
});
test('remove drops the hooks key only when nothing else is left',async t=>{
 const w=await workspace(t,{settings:'{"model":"x"}'});
 await w.installer.install();
 await w.installer.remove();
 const after=await w.read();
 assert.equal('hooks' in after,false);
 assert.equal(after.model,'x');
});
test('every change is backed up before the file is rewritten',async t=>{
 const w=await workspace(t,{settings:'{"model":"before"}'});
 const result=await w.installer.install();
 assert.ok(result.backup,'install must record a backup path');
 assert.equal(JSON.parse(await readFile(result.backup,'utf8')).model,'before');
 const removal=await w.installer.remove();
 assert.ok(removal.backup);
 assert.ok(ourEntries(JSON.parse(await readFile(removal.backup,'utf8')).hooks).length>0);
});
test('a settings file that is not valid JSON is reported instead of overwritten',async t=>{
 const w=await workspace(t,{settings:'{ this is not json'});
 const status=await w.installer.status();
 assert.equal(status.status,'error');
 await assert.rejects(()=>w.installer.install(),/无法读取 Claude Code 配置文件/);
 assert.equal(await readFile(path.join(w.claudeDir,'settings.json'),'utf8'),'{ this is not json');
});
test('a stale command path is reported as needing repair and repaired by install',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 const settings=await w.read();
 settings.hooks.Stop[0].hooks[0].command=`'/old/place/${HOOK_MARKER}' '/old/spool'`;
 delete settings.hooks.PreToolUse;
 await writeFile(path.join(w.claudeDir,'settings.json'),JSON.stringify(settings,null,2));
 const status=await w.installer.status();
 assert.equal(status.status,'needsRepair');
 assert.deepEqual(status.outdated,['Stop']);
 assert.deepEqual(status.missing,['PreToolUse']);
 assert.equal((await w.installer.install()).status,'installed');
 assert.equal(ourEntries((await w.read()).hooks).length,HOOK_EVENTS.length);
});
test('missing hook scripts are detected even when the configuration is present',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 await rm(path.join(w.dataDir,'claude-hook'),{recursive:true,force:true});
 const status=await w.installer.status();
 assert.equal(status.status,'needsRepair');
 assert.equal(status.scripts,false);
 assert.match(status.reason,/钩子脚本缺失/);
});
test('disableAllHooks is surfaced rather than silently ignored',async t=>{
 const w=await workspace(t,{settings:'{"disableAllHooks":true}'});
 await w.installer.install();
 const status=await w.installer.status();
 assert.equal(status.status,'disabled');
 assert.equal(status.installed,false);
 assert.match(status.reason,/disableAllHooks/);
});
test('install works when no Claude Code settings file exists yet',async t=>{
 const w=await workspace(t);
 const result=await w.installer.install();
 assert.equal(result.backup,null);
 assert.equal(result.status,'installed');
 assert.equal(ourEntries((await w.read()).hooks).length,HOOK_EVENTS.length);
});
test('remove clears our scripts and spool but never the Claude Code directory',async t=>{
 const w=await workspace(t);
 await w.installer.install();
 await writeFile(path.join(w.dataDir,'claude-sessions','x.jsonl'),'{}\n');
 await w.installer.remove();
 await assert.rejects(()=>stat(path.join(w.dataDir,'claude-hook')));
 await assert.rejects(()=>stat(path.join(w.dataDir,'claude-sessions')));
 assert.ok((await stat(w.claudeDir)).isDirectory());
});
