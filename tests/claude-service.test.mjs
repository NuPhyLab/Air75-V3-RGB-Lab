import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fakeService,until} from './helpers/fake-service.mjs';
import {HOOK_MARKER} from '../server/claude-hooks.mjs';
import {HOOK_EVENTS} from '../server/claude-events.mjs';
import {CLAUDE_STATUS_COLORS} from '../shared/claude-lighting.mjs';

const hook=(service,payload)=>new Promise((resolve,reject)=>{
 const child=spawn(path.join(service.claudeHookDir,HOOK_MARKER),[service.claudeSpool],{stdio:['pipe','ignore','ignore']});
 child.on('error',reject);
 child.on('exit',code=>code===0?resolve():reject(new Error(`hook exited ${code}`)));
 child.stdin.end(JSON.stringify(payload));
});
async function claudeService(t,control={}) {
 const service=await fakeService(t,control);
 await mkdir(service.claudeDir,{recursive:true});
 await writeFile(path.join(service.claudeDir,'settings.json'),'{"model":"keep-me"}');
 const installed=await service.command({op:'claudeHookInstall'});
 assert.equal(installed.ok,true,JSON.stringify(installed));
 return service;
}
const claude=async(service)=>{
 await service.command({op:'refreshClaude'});
 return (await service.state()).claude;
};

test('the application installs, repairs and removes its own Claude Code hooks',async t=>{
 const service=await fakeService(t);
 await mkdir(service.claudeDir,{recursive:true});
 await writeFile(path.join(service.claudeDir,'settings.json'),
   JSON.stringify({model:'keep-me',hooks:{Stop:[{hooks:[{type:'command',command:'existing'}]}]}}));
 assert.equal((await service.command({op:'claudeHookStatus'})).result.status,'missing');
 const installed=await service.command({op:'claudeHookInstall'});
 assert.equal(installed.result.status,'installed');
 const settings=JSON.parse(await readFile(path.join(service.claudeDir,'settings.json'),'utf8'));
 assert.equal(settings.model,'keep-me');
 assert.equal(settings.hooks.Stop[0].hooks[0].command,'existing');
 assert.deepEqual(Object.keys(settings.hooks).sort(),[...HOOK_EVENTS].sort());
 assert.equal((await service.state()).claude.hooks.installed,true);
 const removed=await service.command({op:'claudeHookRemove'});
 assert.equal(removed.result.status,'missing');
 const after=JSON.parse(await readFile(path.join(service.claudeDir,'settings.json'),'utf8'));
 assert.equal(after.model,'keep-me');
 assert.equal(after.hooks.Stop[0].hooks[0].command,'existing');
});
test('real hook events drive session status, and the light follows the bound key',async t=>{
 const service=await claudeService(t);
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeSelectedPulse:false,
   claudeBrightness:100,brightness:100,claudeTaskAction:'selectOnly'}});
 await service.command({op:'settings',settings:{claudeEnabled:true}});
 await hook(service,{hook_event_name:'SessionStart',session_id:'s-one',cwd:'/Users/x/alpha',source:'startup'});
 let state=await until(service.state,v=>v.claude.tasks.length===1,'session did not appear');
 assert.equal(state.claude.tasks[0].status,'awaitingInput');
 assert.equal(state.claude.tasks[0].project,'alpha');
 await until(service.state,v=>v.colors[1]===CLAUDE_STATUS_COLORS.awaitingInput.toLowerCase(),'F1 did not show awaiting input');
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'s-one',cwd:'/Users/x/alpha',prompt:'secret'});
 await hook(service,{hook_event_name:'PreToolUse',session_id:'s-one',tool_name:'Bash',tool_input:{command:'secret'}});
 state=await until(service.state,v=>v.claude.tasks[0].status==='running','session did not switch to running');
 await until(service.state,v=>v.colors[1]===CLAUDE_STATUS_COLORS.running.toLowerCase(),'F1 did not show running');
 assert.equal(state.colors[20],'#000000','unrelated keys stay dark in task mode');
 await hook(service,{hook_event_name:'PermissionRequest',session_id:'s-one',tool_name:'Bash'});
 await until(service.state,v=>v.colors[1]===CLAUDE_STATUS_COLORS.awaitingApproval.toLowerCase(),'F1 did not show awaiting approval');
 await hook(service,{hook_event_name:'StopFailure',session_id:'s-one',error:'rate_limit'});
 state=await until(service.state,v=>v.claude.tasks[0].status==='error','failure was not reported');
 assert.equal(state.claude.tasks[0].errorType,'rate_limit');
 await service.command({op:'settings',settings:{claudeEnabled:false}});
 assert.equal((await service.state()).device.armed,false);
 await service.command({op:'preview',colors:Array(84).fill('#112233')});
 assert.deepEqual((await service.state()).colors,Array(84).fill('#112233'));
});
test('two sessions keep independent lights on their own keys',async t=>{
 const service=await claudeService(t);
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeSelectedPulse:false,
   claudeBrightness:100,brightness:100,claudeTaskSource:'custom',claudeTaskAction:'selectOnly'}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'left',cwd:'/Users/x/left'});
 await hook(service,{hook_event_name:'Stop',session_id:'right',cwd:'/Users/x/right'});
 await until(service.state,v=>v.claude.tasks.length===2,'both sessions did not appear');
 await service.command({op:'settings',settings:{claudeSlotIds:['left','right','','','','']}});
 const state=await until(service.state,v=>v.colors[1]===CLAUDE_STATUS_COLORS.running.toLowerCase()
   &&v.colors[2]===CLAUDE_STATUS_COLORS.awaitingInput.toLowerCase(),'each session did not light its own key');
 assert.equal(state.claude.slots[0].id,'left');
 assert.equal(state.claude.slots[1].id,'right');
 await hook(service,{hook_event_name:'SessionEnd',session_id:'left',reason:'clear'});
 const after=await until(service.state,v=>v.claude.slots[0].status==='ended','left session did not end');
 assert.equal(after.claude.slots[1].status,'awaitingInput','the other session is untouched');
});
test('single-session whole-keyboard mode follows one session only',async t=>{
 const service=await claudeService(t);
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeSelectedPulse:false,
   claudeBrightness:100,brightness:100,claudeLightMode:'whole',claudeTaskAction:'selectOnly'}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'solo',cwd:'/Users/x/solo'});
 const state=await until(service.state,v=>v.colors[0]===CLAUDE_STATUS_COLORS.running.toLowerCase(),'whole keyboard did not follow the session');
 assert.equal(new Set(state.colors.slice(0,83)).size,1);
 assert.equal(state.colors[83],'#000000');
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'second',cwd:'/Users/x/second'});
 await until(service.state,v=>v.claude.tasks.length===2,'second session did not appear');
 await service.command({op:'settings',settings:{claudeWholeTaskId:'missing-session'}});
 await until(service.state,v=>v.colors.every(color=>color==='#000000'),'a missing followed session must stay dark');
});
test('switching the source hands the keys over without leaving Codex holding one',async t=>{
 const service=await claudeService(t,{tasks:[{id:'codex-task',title:'Codex',status:'running'}]});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 assert.equal((await service.command({op:'codexKey',code:'F9',phase:'down'})).ok,true);
 assert.equal((await service.state()).codex.keys.held.source,'F9');
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true}});
 const state=await service.state();
 assert.equal(state.codex.keys.held,null,'the held Codex shortcut is released');
 assert.equal(state.codex.keys.source,'claude');
 assert.equal(state.claude.active,true);
 assert.equal(state.codex.active,false);
 await service.command({op:'settings',settings:{agentSource:'codex'}});
 assert.equal((await service.state()).codex.keys.source,'codex');
});
test('a task key in Claude Code mode acts on the Claude session, not on a Codex task',async t=>{
 const service=await claudeService(t,{tasks:[{id:'codex-task',title:'Codex',status:'running'}]});
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeTaskAction:'selectOnly'}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'bound',cwd:'/Users/x/bound'});
 await until(service.state,v=>v.claude.tasks.length===1,'session did not appear');
 const pressed=await service.command({op:'codexKey',code:'F1',phase:'down'});
 assert.equal(pressed.ok,true,JSON.stringify(pressed));
 assert.equal(pressed.result.selected,'bound');
 await service.command({op:'codexKey',code:'F1',phase:'up'});
 assert.equal((await service.state()).claude.lighting.selectedId,'bound');
 assert.equal((await service.operations()).filter(entry=>entry.op==='shortcut').length,0,
  'Claude Code mode must not send Codex shortcuts');
});
test('command keys run locally and never answer a permission request',async t=>{
 const service=await claudeService(t);
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeTaskAction:'selectOnly',
   claudeCommandIds:['nextAttention','nextTask','prevTask','toggleLightMode','wakeLights','refresh']}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'busy',cwd:'/Users/x/busy'});
 await hook(service,{hook_event_name:'PermissionRequest',session_id:'asking',tool_name:'Write'});
 await until(service.state,v=>v.claude.tasks.length===2,'sessions did not appear');
 const attention=await service.command({op:'codexKey',code:'F7',phase:'down'});
 await service.command({op:'codexKey',code:'F7',phase:'up'});
 assert.equal(attention.result.selected,'asking');
 const toggled=await service.command({op:'claudeAction',action:'toggleLightMode'});
 assert.equal(toggled.ok,true);
 assert.equal((await service.state()).settings.claudeLightMode,'whole');
 for(const action of ['approve','decline','sendInput','newSession']) {
  const refused=await service.command({op:'claudeAction',action,sessionId:'asking'});
  assert.equal(refused.ok,false,`${action} must not be executable`);
 }
 const refusal=await service.command({op:'claudeAction',action:'approve',sessionId:'asking'});
 assert.match(refusal.error,/不会代替你/);
 assert.equal((await service.operations()).filter(entry=>entry.op==='shortcut').length,0);
});
test('custom and swapped Claude task/command keys use their own bindings and preserve Codex bindings',async t=>{
 const service=await claudeService(t,{tasks:[{id:'codex-task',title:'Codex',status:'running'}]});
 const taskKeys=['KeyA','F7','F3','F4','F5','F6'];
 const commandKeys=['F2','F8','F9','F10','KeyZ','F12'];
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,
  claudeTaskAction:'selectOnly',claudeTaskSource:'custom',claudeSlotIds:['one','two','','','',''],
  claudeTaskKeys:taskKeys,claudeCommandKeys:commandKeys,
  claudeCommandIds:['toggleLightMode','nextTask','prevTask','refresh','toggleLightMode','refresh']}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'one',cwd:'/Users/x/one'});
 await hook(service,{hook_event_name:'Stop',session_id:'two',cwd:'/Users/x/two'});
 await until(service.state,v=>v.claude.tasks.length===2,'sessions did not appear');
 const press=async code=>{
  const result=await service.command({op:'codexKey',code,phase:'down'});
  await service.command({op:'codexKey',code,phase:'up'});
  return result;
 };
 assert.equal((await press('KeyA')).result.selected,'one');
 assert.equal((await press('F7')).result.selected,'two','F7 is a task key in this mode');
 assert.equal((await press('F1')).ok,false,'an old unbound key must not trigger anything');
 assert.equal((await press('F2')).ok,true);
 assert.equal((await service.state()).settings.claudeLightMode,'whole','F2 is a command key in this mode');
 assert.equal((await press('KeyZ')).ok,true);
 assert.equal((await service.state()).settings.claudeLightMode,'keys');
 assert.equal((await service.command({op:'codexSlot',index:0})).ok,false,'inactive Codex slots cannot intercept keys');
 assert.equal((await service.operations()).filter(entry=>entry.op==='shortcut').length,0);
 await service.command({op:'settings',settings:{agentSource:'codex',codexEnabled:true}});
 assert.equal((await press('KeyA')).ok,false);
 assert.equal((await press('F1')).ok,true);
 assert.equal((await service.operations()).filter(entry=>entry.op==='shortcut').at(-1).threadId,'codex-task');
 assert.equal((await service.command({op:'claudeSlot',index:0})).ok,false,'inactive Claude slots cannot intercept keys');
 const settings=(await service.state()).settings;
 assert.deepEqual(settings.claudeTaskKeys,taskKeys);
 assert.deepEqual(settings.claudeCommandKeys,commandKeys);
 assert.deepEqual(settings.codexTaskKeys,['F1','F2','F3','F4','F5','F6']);
});
test('jumping to a terminal session is refused with a reason instead of guessing a window',async t=>{
 const service=await claudeService(t);
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeTaskAction:'focusApp'}});
 await mkdir(path.join(service.claudeDir,'sessions'),{recursive:true});
 await writeFile(path.join(service.claudeDir,'sessions','424242.json'),JSON.stringify({
  pid:process.pid,sessionId:'terminal-session',cwd:'/Users/x/term',
  startedAt:Date.now()-Math.round(process.uptime()*1000),
  procStart:new Date(Date.now()-Math.round(process.uptime()*1000)).toUTCString(),
  version:'2.1.174',kind:'interactive',entrypoint:'cli',name:'term-1',
 }));
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'terminal-session',cwd:'/Users/x/term'});
 await until(service.state,v=>v.claude.tasks.some(task=>task.id==='terminal-session'),'terminal session did not appear');
 const result=await service.command({op:'claudeAction',action:'task',sessionId:'terminal-session'});
 assert.equal(result.ok,false);
 assert.match(result.error,/终端/);
 assert.equal((await service.state()).claude.lighting.selectedId,'terminal-session','the session is still selected');
});
test('games and key triggers take the lights back from Claude Code',async t=>{
 const service=await claudeService(t);
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true,claudeSelectedPulse:false,
   claudeBrightness:100,brightness:100,claudeTaskAction:'selectOnly'}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:'game-test',cwd:'/Users/x/g'});
 await until(service.state,v=>v.colors[1]===CLAUDE_STATUS_COLORS.running.toLowerCase(),'status light did not appear');
 await service.command({op:'gameStart',gameType:'snake'});
 const playing=await service.state();
 assert.ok(playing.colors.filter(color=>color!=='#000000').length<10,'game owns the keyboard');
 assert.equal((await service.command({op:'codexKey',code:'F1',phase:'down'})).ok,false,'task keys are suspended during a game');
 await service.command({op:'gameStop'});
 await until(service.state,v=>v.colors[1]===CLAUDE_STATUS_COLORS.running.toLowerCase(),'status light did not return after the game');
});
test('Codex mode keeps working unchanged while Claude Code hooks are installed',async t=>{
 const service=await claudeService(t,{tasks:[{id:'codex-task',title:'Codex',status:'running'}]});
 await service.command({op:'settings',settings:{codexEnabled:true,codexSelectedPulse:false,codexBrightness:100,brightness:100}});
 await until(service.state,v=>v.colors[1]==='#304ffe','Codex status light missing');
 assert.equal((await service.command({op:'codexSlot',index:0})).ok,true);
 assert.equal((await service.operations()).filter(entry=>entry.op==='shortcut').at(-1).threadId,'codex-task');
 assert.equal((await service.state()).codex.keys.source,'codex');
});
test('enabling one integration switches the other off in a single change',async t=>{
 const service=await claudeService(t,{tasks:[{id:'codex-task',title:'Codex',status:'running'}]});
 await service.command({op:'codexAdapt',source:'claude'});
 let settings=(await service.state()).settings;
 assert.equal(settings.claudeEnabled,true);
 assert.equal(settings.codexEnabled,false,'Codex must not be switched on by enabling Claude Code');
 assert.equal(settings.agentSource,'claude');
 await service.command({op:'codexAdapt',source:'codex'});
 settings=(await service.state()).settings;
 assert.equal(settings.codexEnabled,true);
 assert.equal(settings.claudeEnabled,false,'Claude Code must not stay on behind Codex');
 assert.equal(settings.agentSource,'codex');
 await service.command({op:'codexAdaptRestore'});
 settings=(await service.state()).settings;
 assert.equal(settings.codexEnabled,false);
 assert.equal(settings.claudeEnabled,false);
 assert.equal(settings.codexKeyAdaptation,false);
});
test('a task key opens the matching Claude Code session through its own deep link',async t=>{
 const service=await claudeService(t);
 const cli='11111111-2222-3333-4444-555555555555';
 const desk='local_99999999-8888-7777-6666-555555555555';
 await mkdir(path.join(service.claudeSupportDir,'claude-code-sessions','w','s'),{recursive:true});
 await writeFile(path.join(service.claudeSupportDir,'claude-code-sessions','w','s',`${desk}.json`),
   JSON.stringify({sessionId:desk,cliSessionId:cli,title:'ignored'}));
 await service.command({op:'settings',settings:{agentSource:'claude',claudeEnabled:true}});
 await hook(service,{hook_event_name:'UserPromptSubmit',session_id:cli,cwd:'/Users/x/deep'});
 await until(service.state,v=>v.claude.tasks.some(task=>task.desktopId===desk),'desktop id was not resolved');
 assert.equal((await service.state()).settings.claudeTaskAction,'openSession','the default action jumps to the session');
 const descriptor=await service.command({op:'claudeAction',action:'openSession',sessionId:cli});
 assert.equal(descriptor.ok,true,JSON.stringify(descriptor));
 assert.equal(descriptor.result.opened,`claude://code/continue?session=${desk}`);
 const actions=(await service.operations()).filter(entry=>entry.op==='claudeExternalAction');
 assert.deepEqual(actions.at(-1).args,['--',`claude://code/continue?session=${desk}`]);
});
