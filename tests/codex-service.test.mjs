import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeService,until} from './helpers/fake-service.mjs';
import {SHORTCUTS} from '../server/codex.mjs';

const tasks=[{id:'working',title:'Working',status:'running'},{id:'waiting',title:'Waiting',status:'needsInput',pendingKind:'approval',pinned:true,pinOrder:0},{id:'unread',title:'Unread',status:'completed'}];
test('duplicate physical terminal press sends only one toggle',async t=>{
 const service=await fakeService(t,{tasks});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 await service.command({op:'codexKey',code:'F11',phase:'down'});
 await service.command({op:'codexKey',code:'F11',phase:'up'});
 const duplicate=await service.command({op:'codexKey',code:'F11',phase:'down'});
 await service.command({op:'codexKey',code:'F11',phase:'up'});
 assert.equal(duplicate.result.ignored,true);
 assert.equal((await service.operations()).filter(x=>x.op==='shortcut').length,1);
});
test('dictation release survives binding changes and mode changes without an orphan keydown',async t=>{
 const service=await fakeService(t,{tasks});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 assert.equal((await service.command({op:'codexKey',code:'F9',phase:'down'})).ok,true);
 assert.equal((await service.state()).codex.keys.held.source,'F9');
 assert.equal((await service.operations()).filter(x=>x.op==='shortcut').at(-1).phase,'down');
 await service.command({op:'codexBind',group:'command',index:2,code:'KeyA'});
 assert.equal((await service.state()).codex.keys.held,null);
 assert.equal((await service.operations()).filter(x=>x.op==='shortcut').at(-1).phase,'up');
 assert.equal((await service.command({op:'codexKey',code:'F9',phase:'up'})).ok,true);
 await service.command({op:'codexKey',code:'KeyA',phase:'down'});
 await service.command({op:'gameStart',gameType:'snake'});
 assert.equal((await service.state()).codex.keys.held,null);
 assert.equal((await service.command({op:'codexKey',code:'KeyA',phase:'up'})).ok,true);
});
test('native command failures return a visible localized status instead of failing silently',async t=>{
 const service=await fakeService(t,{tasks,shortcutPermissionError:true});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 const result=await service.command({op:'codexKey',code:'F12'});
 assert.equal(result.ok,false);assert.match(result.error,/辅助功能权限/);
 const event=(await service.state()).codex.keys.lastEvent;
 assert.equal(event.code,'F12');assert.equal(event.ok,false);assert.match(event.error,/辅助功能权限/);
});
test('current Codex global dictation receives exactly one down/up and is released when mode is disabled',async t=>{
 const service=await fakeService(t,{tasks,codexKeybindings:[
  {command:'composer.startDictation',key:'F11'},
  {command:'globalDictationHold',key:'Ctrl+Shift+D'},
 ]});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 assert.equal((await service.command({op:'codexKey',code:'F9',phase:'down'})).ok,true);
 await service.command({op:'codexKey',code:'F9',phase:'down'});
 let events=(await service.operations()).filter(x=>x.op==='shortcut');
 assert.equal(events.length,1);assert.equal(events[0].delivery,'globalHold');
 assert.equal(events[0].keyCode,2);assert.equal(events[0].phase,'down');
 await service.command({op:'settings',settings:{codexEnabled:false}});
 await service.command({op:'codexKey',code:'F9',phase:'up'});
 events=(await service.operations()).filter(x=>x.op==='shortcut');
 assert.deepEqual(events.map(x=>x.phase),['down','up']);
 assert.equal((await service.state()).codex.keys.held,null);
});
test('single-tap dictation keeps key-release and repeat events from immediately stopping recording',async t=>{
 const service=await fakeService(t,{tasks,codexKeybindings:[
  {command:'globalDictationHold',key:null},
  {command:'globalDictationSingleTap',key:'Ctrl+Shift+D'},
 ]});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 await until(service.state,s=>s.codex.keys.dictation.mode==='toggle','toggle UI did not follow current keymap');
 await service.command({op:'codexKey',code:'F9',phase:'down'});
 await service.command({op:'codexKey',code:'F9',phase:'down'});
 await service.command({op:'codexKey',code:'F9',phase:'up'});
 let events=(await service.operations()).filter(x=>x.op==='shortcut');
 assert.equal(events.length,1);assert.equal(events[0].delivery,'globalTap');assert.equal(events[0].phase,'tap');
 assert.equal((await service.state()).codex.keys.held,null);
 await service.command({op:'codexAction',action:'dictation',phase:'down',source:'button'});
 await service.command({op:'settings',settings:{codexEnabled:false}});
 events=(await service.operations()).filter(x=>x.op==='shortcut');
 assert.deepEqual(events.map(x=>x.phase),['tap','tap']);
});
test('Micro slot mappings and command keys use the centralized action path without inventing approval',async t=>{
 const service=await fakeService(t,{tasks});
 await service.command({op:'settings',settings:{codexEnabled:true,codexTaskSource:'priority'}});
 assert.deepEqual((await service.state()).codex.slots.slice(0,3).map(t=>t.id),['waiting','unread','working']);
 assert.equal((await service.command({op:'codexSlot',index:0})).ok,true);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'waiting');
 assert.equal((await service.state()).codex.lighting.selectedId,'waiting');
 assert.equal((await service.command({op:'codexSelect',threadId:'missing'})).ok,false);
 for (const action of SHORTCUTS.filter(s=>s.available)) {
  const result=await service.command({op:'codexAction',action:action.id,...(action.id==='dictation'?{phase:'down'}:{})});
  assert.equal(result.ok,true,action.id);
  const sent=(await service.operations()).filter(o=>o.op==='shortcut').at(-1);
  assert.ok(Number.isInteger(sent.keyCode),action.id);
  assert.deepEqual(sent.modifiers,action.keys.slice(0,-1).map(s=>s.toLowerCase()));
 }
 const count=(await service.operations()).filter(o=>o.op==='shortcut').length;
 for(const action of ['approve','decline','toggleFastMode']) assert.equal((await service.command({op:'codexAction',action})).ok,false);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').length,count);
 await service.command({op:'settings',settings:{codexCommandIds:Array(6).fill('toggleTerminal')}});
 assert.equal((await service.command({op:'codexSlot',index:11})).ok,true);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).keyCode,50);
 await service.command({op:'settings',settings:{codexEnabled:false}});
 assert.equal((await service.command({op:'codexSlot',index:0})).ok,false);
});
test('preview exposes acknowledged RGB, scales brightness once and diagnoses real readback differences',async t=>{
 const service=await fakeService(t,{tasks});
 await service.command({op:'settings',settings:{brightness:100,codexEnabled:false}});
 const frame=Array.from({length:84},(_,i)=>i===83?'#000000':['#ff0000','#00ff00','#0000ff','#123456'][i%4]);
 await service.command({op:'preview',colors:frame});
 assert.deepEqual((await service.state()).colors,frame);
 assert.equal((await service.command({op:'verifyColors'})).result.matches,true);
 await service.configure({customColorScale:200});
 const scaled=(await service.command({op:'verifyColors'})).result;
 assert.equal(scaled.matches,true);assert.equal(scaled.expected[0],'#c80000');
 await service.configure({mismatchIndex:7});
 assert.deepEqual((await service.command({op:'verifyColors'})).result.mismatches,[7]);
 await service.configure({customColorScale:255,mismatchIndex:null});
 await service.configure({mismatchIndex:7});
 assert.deepEqual((await service.command({op:'verifyColors'})).result.mismatches,[7]);
 await service.configure({mismatchIndex:null});
 await service.command({op:'settings',settings:{brightness:50,codexEnabled:true,codexBrightness:50,codexSelectedPulse:false}});
 const state=await until(service.state,s=>s.colors[1]==='#0c1440','Micro brightness was not applied once per level');
 assert.equal(state.colors[0],'#000000','Codex turns unrelated lighting off');
 assert.equal(state.colors[2],'#401c00');
 assert.equal((await service.command({op:'verifyColors'})).result.matches,true);
 await service.command({op:'settings',settings:{codexEnabled:false}});
 assert.equal((await service.state()).device.armed,false,'disabling Codex restores the board');
 await service.command({op:'preview',colors:frame});
 assert.equal((await service.state()).colors[1],'#008000','the saved drawing can still be played');
 await service.command({op:'stop'});
 assert.equal((await service.command({op:'verifyColors'})).ok,false);
});
test('enabling Codex cancels a paused animation and clears non-task keys',async t=>{
 const service=await fakeService(t,{tasks:[tasks[0]]});
 await service.command({op:'play',colors:Array(84).fill('#112233'),animation:{effect:'pulse',speed:4,loop:true}});
 await service.command({op:'pause'});
 await service.command({op:'settings',settings:{brightness:100,codexEnabled:true,codexSelectedPulse:false}});
 const active=await service.state();
 assert.equal(active.playback.mode,'agent');assert.equal(active.playback.playing,false);assert.equal(active.colors[20],'#000000');
 await service.configure({tasks:[{...tasks[0],status:'completed'}]});
 await until(service.state,s=>s.colors[1]==='#00ff4c','task state stayed blue');
 await service.command({op:'settings',settings:{codexEnabled:false}});
 assert.equal((await service.state()).device.armed,false);
});

test('direct task keys and commands remap atomically, move lights, and pause for games',async t=>{
 const service=await fakeService(t,{tasks});
 await service.command({op:'settings',settings:{codexEnabled:true,brightness:100,codexBrightness:100,codexSelectedPulse:false}});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 assert.equal((await service.command({op:'codexKey',code:'F1'})).ok,true);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'working');
 assert.equal((await service.command({op:'codexBind',group:'task',index:0,code:'KeyA'})).ok,true);
 const remapped=await service.state();
 const led=remapped.codex.keys.bindings[0].ledIndex;
 assert.equal(remapped.settings.codexTaskKeys[0],'KeyA');
 assert.equal(remapped.colors[led],'#304ffe');
 assert.equal(remapped.colors[1],'#000000');
 assert.equal((await service.command({op:'codexKey',code:'F1'})).ok,false);
 assert.equal((await service.command({op:'codexKey',code:'KeyA'})).ok,true);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'working');
 await service.command({op:'codexBind',group:'command',index:0,code:'KeyA'});
 const swapped=await service.state();
 assert.equal(swapped.settings.codexTaskKeys[0],'F7');
 assert.equal(swapped.settings.codexCommandKeys[0],'KeyA');
 assert.equal((await service.command({op:'codexKey',code:'F7'})).ok,true);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'working');
 assert.equal((await service.command({op:'codexKey',code:'KeyA'})).ok,true);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).keyCode,46);
 const count=(await service.operations()).filter(o=>o.op==='shortcut').length;
 await service.command({op:'gameStart',gameType:'snake'});
 assert.equal((await service.state()).codex.keys.enabled,false);
 assert.equal((await service.command({op:'codexKey',code:'F7'})).ok,false);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').length,count);
 await service.command({op:'gameStop'});
 await service.command({op:'settings',settings:{codexEnabled:false}});
 assert.equal((await service.command({op:'codexKey',code:'F7'})).ok,false);
});


test('a recent-task reorder keeps UI, physical key routing and status LEDs on one identity',async t=>{
 const service=await fakeService(t,{tasks});
 await service.command({op:'settings',settings:{codexEnabled:true,codexTaskSource:'recent',brightness:100,codexBrightness:100,codexSelectedPulse:false}});
 await service.command({op:'settings',settings:{codexEnabled:true}});
 const before=(await service.state()).codex.slots.map(t=>t?.id??null);
 await service.configure({tasks:[{...tasks[2],status:'error'},tasks[0],tasks[1]]});
 const state=await until(service.state,s=>s.codex.slots[2]?.status==='error','updated status did not reach its original slot');
 assert.deepEqual(state.codex.slots.map(t=>t?.id??null),before);
 await until(service.state,s=>s.colors[3]==='#ff0033','LED did not follow original F3 task');
 await service.command({op:'codexKey',code:'F3'});
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'unread');
 assert.equal((await service.command({op:'verifyColors'})).result.matches,true);
});

test('an F2 press during a delayed frame opens the task whose light was visible at receipt',async t=>{
 const initial=Array.from('abcdef',id=>({id,title:'Same title',status:id==='b'?'needsInput':'idle'}));
 const service=await fakeService(t,{tasks:initial});
 await service.command({op:'settings',settings:{codexEnabled:true,brightness:100,codexSelectedPulse:false}});
 assert.equal((await service.state()).colors[2],'#ff6d00');
 const paints=(await service.operations()).filter(o=>o.op==='paint').length;
 await service.configure({paintDelayMs:600,tasks:[{id:'g',title:'Same title',status:'completed'},...initial.filter(t=>t.id!=='b'),initial[1]]});
 await until(service.operations,ops=>ops.filter(o=>o.op==='paint').length>paints,'replacement frame did not start');
 const pending=await service.state();
 const pressed=service.command({op:'codexKey',code:'F2',phase:'down'});
 assert.equal((await pressed).ok,true);
 assert.equal(pending.colors[2],'#ff6d00');
 assert.equal(pending.codex.slots[1].id,'b','UI must not publish a target before its LED frame');
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'b','queued F2 was redirected by a later frame');
 const updated=await until(service.state,s=>s.codex.slots[1]?.id==='g','replacement was never published');
 assert.equal(updated.colors[2],'#00ff4c');
 assert.equal(updated.codex.keys.lastEvent.threadId,'b');
});

test('same-colour replacements publish new task identities even without an RGB write',async t=>{
 const initial=Array.from('abcdef',id=>({id,status:'running'}));
 const service=await fakeService(t,{tasks:initial});
 await service.command({op:'settings',settings:{codexEnabled:true,codexSelectedPulse:false}});
 const paints=(await service.operations()).filter(o=>o.op==='paint').length;
 await service.configure({tasks:[{id:'g',status:'running'},...initial.filter(t=>t.id!=='b'),initial[1]]});
 await until(service.state,s=>s.codex.slots[1]?.id==='g','equal-colour identity never published');
 assert.equal((await service.operations()).filter(o=>o.op==='paint').length,paints);
 await service.command({op:'codexKey',code:'F2'});
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'g');
});

test('a task removed while an F2 press waits never falls back to its replacement',async t=>{
 const initial=Array.from('abcdef',id=>({id,status:id==='b'?'running':'idle'}));
 const service=await fakeService(t,{tasks:initial});
 await service.command({op:'settings',settings:{codexEnabled:true,codexSelectedPulse:false}});
 const paints=(await service.operations()).filter(o=>o.op==='paint').length;
 await service.configure({paintDelayMs:500,tasks:[{id:'g',status:'completed'},...initial.filter(t=>t.id!=='b')]});
 await until(service.operations,ops=>ops.filter(o=>o.op==='paint').length>paints,'replacement frame did not start');
 const result=await service.command({op:'codexKey',code:'F2'});
 assert.equal(result.ok,false);
 assert.equal((await service.operations()).filter(o=>o.op==='shortcut').length,0);
});
