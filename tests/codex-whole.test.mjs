import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {CodexLights,resolveWholeTask,STATUS_COLORS} from '../shared/codex-lighting.mjs';
import {CodexAdapter} from '../server/codex.mjs';
import {Store,validateSettings} from '../server/storage.mjs';
import {fakeService,until} from './helpers/fake-service.mjs';

const blank=()=>Array(84).fill('#000000');
const settings={codexLightMode:'whole',codexSelectedPulse:false,codexBrightness:100};
const task=(id,status='running')=>({id,title:id,status});

test('whole-keyboard follows a sole or selected task; a pinned missing task never silently switches',()=>{
 const a=task('a'),b=task('b','completed');
 assert.equal(resolveWholeTask([a],{}),a);
 assert.equal(resolveWholeTask([a,b],{}),null);
 assert.equal(resolveWholeTask([a,b],{},'b'),b);
 assert.equal(resolveWholeTask([a],{},'deleted'),a);
 assert.equal(resolveWholeTask([a,b],{codexWholeTaskId:'b'},'a'),b);
 assert.equal(resolveWholeTask([a],{codexWholeTaskId:'b'},'a'),null);
 assert.equal(resolveWholeTask([],{}),null);
});

test('whole mode renders one color on every mapped key with shared custom colors and uniform pulse',()=>{
 let now=0;const lights=new CodexLights(()=>now),a=task('a');const input=Array(84).fill('#123456');
 for(const [status,color] of Object.entries(STATUS_COLORS)) {
  const frame=lights.render(input,[task('a',status)],{...settings,codexAmbient:true});
  assert.deepEqual(frame.slice(0,83),Array(83).fill(color.toLowerCase()));assert.equal(frame[83],'#000000');
 }
 const custom={...settings,codexStatusColors:{running:'#FF8000'},codexBrightness:50};
 assert.deepEqual(lights.render(input,[a],custom).slice(0,83),Array(83).fill('#804000'));
 lights.select('a');const start=lights.render(input,[a],{...custom,codexSelectedPulse:true});now=900;
 const low=lights.render(input,[a],{...custom,codexSelectedPulse:true});assert.notEqual(start[0],low[0]);assert.equal(new Set(low.slice(0,83)).size,1);
 assert.deepEqual(input,Array(84).fill('#123456'));
 const restored=lights.render(input,[a],{...settings,codexLightMode:'keys'});assert.equal(restored[20],'#123456');assert.equal(restored[1],'#304ffe');
});

test('whole mode and task choice persist independently and tracking retains six slots plus the whole-keyboard task',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'nuphy-whole-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await new Store(dir).load();await store.settings({codexLightMode:'whole',codexWholeTaskId:'seventh'});
 const loaded=await new Store(dir).load();assert.equal(loaded.data.settings.codexLightMode,'whole');assert.equal(loaded.data.settings.codexWholeTaskId,'seventh');
 await loaded.settings({codexLightMode:'keys'});assert.equal(loaded.data.settings.codexWholeTaskId,'seventh');
 for(const patch of [{codexLightMode:'bad'},{codexWholeTaskId:null},{codexWholeTaskId:'../bad'},{codexWholeTaskId:'x'.repeat(101)}])assert.throws(()=>validateSettings(patch));
 const adapter=new CodexAdapter({codexHome:dir,enableQuota:false});
 adapter.track(['a','b','c','d','e','f','seventh']);assert.equal(adapter.trackedIds.length,7);
});

test('service follows a task outside six slots, reacts to status changes, preserves the drawing and yields to games',async t=>{
 const tasks=Array.from({length:7},(_,i)=>task('task-'+i));const s=await fakeService(t,{tasks});
 await s.command({op:'settings',settings:{...settings,codexEnabled:true,codexWholeTaskId:'task-6',brightness:100,codexStatusColors:{running:'#FF0000',completed:'#00FF00'}}});
 await s.command({op:'preview',colors:Array(84).fill('#112233')});
 await s.command({op:'settings',settings:{codexEnabled:true}});
 let state=await s.state();assert.equal(state.codex.lighting.wholeTaskId,'task-6');assert.deepEqual(state.colors.slice(0,83),Array(83).fill('#ff0000'));
 await s.configure({tasks:tasks.map(t=>t.id==='task-6'?{...t,status:'completed'}:t)});
 await until(s.state,v=>v.colors[0]==='#00ff00','status change did not recolor keyboard');
 await s.configure({tasks:tasks.slice(0,6)});await until(s.state,v=>v.colors.every(c=>c==='#000000'),'missing task did not go dark');
 await s.configure({tasks});await until(s.state,v=>v.colors[0]==='#ff0000','returning task not restored');
 await s.command({op:'gameStart',gameType:'snake'});state=await s.state();assert.ok(state.colors.filter(c=>c!=='#000000').length<10);
 await s.command({op:'gameStop'});assert.equal((await s.state()).colors[0],'#ff0000');
 assert.equal((await s.state()).device.state[10],0,'returning to Codex keeps side lights off');
 await s.command({op:'settings',settings:{codexLightMode:'keys'}});state=await s.state();assert.equal(state.colors[20],'#000000');assert.equal(state.colors[1],'#ff0000');
 await s.command({op:'settings',settings:{codexEnabled:false}});assert.equal((await s.state()).device.armed,false);
 await s.command({op:'preview',colors:Array(84).fill('#112233')});assert.deepEqual((await s.state()).colors,Array(84).fill('#112233'));
});

test('whole mode shares idle timing and wakes only for the followed task, including one outside the task slots',async t=>{
 const tasks=Array.from({length:7},(_,i)=>task('task-'+i));const s=await fakeService(t,{tasks,systemIdleMs:100000});
 await s.command({op:'settings',settings:{...settings,codexEnabled:true,codexWholeTaskId:'task-6',brightness:100,lightIdleMs:1000}});
 await until(s.state,v=>v.lightPower.sleeping,'whole lighting did not idle');
 await s.configure({tasks:tasks.map(t=>t.id==='task-0'?{...t,status:'completed'}:t)});
 await new Promise(r=>setTimeout(r,150));assert.equal((await s.state()).lightPower.sleeping,true);
 await s.configure({tasks:tasks.map(t=>t.id==='task-6'?{...t,status:'completed'}:t)});
 const awake=await until(s.state,v=>!v.lightPower.sleeping&&v.colors[0]==='#00ff4c','followed task did not wake keyboard');
 assert.equal(new Set(awake.colors.slice(0,83)).size,1);
});
