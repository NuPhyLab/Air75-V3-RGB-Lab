import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeService,until} from './helpers/fake-service.mjs';
import {heart} from '../shared/layout.mjs';

const tasks=[{id:'first',title:'First',status:'running'},{id:'second',title:'Second',status:'completed'}];
const drawing=heart('#ff0000');
const modes={
  drawing: s=>s.command({op:'preview',colors:drawing}),
  animation: s=>s.command({op:'play',colors:drawing,animation:{effect:'pulse',speed:4,loop:true}}),
  game: s=>s.command({op:'gameStart',gameType:'whack'}),
  trigger: async s=>{await s.command({op:'triggerArm',colors:drawing,trigger:{count:3,intervalMs:200}});return s.command({op:'triggerFire'});},
  audio: async s=>{await s.command({op:'audioInventory',systemSupported:true,devices:[],microphonePermission:true});return s.command({op:'audioStart'});},
};
for(const [name,start] of Object.entries(modes)) test(`Codex takes exclusive lighting ownership from ${name} and rejects stale output`,async t=>{
  const s=await fakeService(t,{tasks});
  await s.command({op:'settings',settings:{codexEnabled:true,brightness:100,codexBrightness:100,codexSelectedPulse:false,quotaSideEnabled:true}});
  assert.equal((await start(s)).ok,true);
  const oldAudio=(await s.state()).audio.session;
  const enabled=await s.command({op:'settings',settings:{codexEnabled:true}});
  assert.equal(enabled.ok,true,JSON.stringify(enabled));
  let state=await s.state();
  assert.equal(state.playback.mode,'agent');assert.equal(state.game.status,'idle');
  assert.equal(state.audio.capture.enabled,false);assert.equal(state.trigger.monitor,'off');
  assert.equal(state.colors[1],'#304ffe');assert.equal(state.colors[2],'#00ff4c');
  assert(state.colors.slice(13).every(c=>c==='#000000'));
  assert.equal(state.device.state[10],0,'side lighting is off');
  await s.configure({trigger:1});
  if(oldAudio) assert.equal((await s.command({op:'audioPacket',session:oldAudio,status:'listening',rms:1,bands:Array(8).fill(1)})).result.accepted,false);
  await s.command({op:'pause'});
  await new Promise(r=>setTimeout(r,180));
  state=await s.state();assert.equal(state.playback.mode,'agent');assert.equal(state.colors[20],'#000000');
  assert.equal((await s.command({op:'codexKey',code:'F2'})).ok,true);
  assert.equal((await s.operations()).filter(o=>o.op==='shortcut').at(-1).threadId,'second');
  await s.command({op:'settings',settings:{codexEnabled:false}});
  assert.equal((await s.state()).device.armed,false);
});

test('disconnect releases the transport despite deferred recovery and never auto-reconnects',async t=>{
  const s=await fakeService(t,{tasks});
  await s.command({op:'settings',settings:{autoConnect:true,codexEnabled:true}});
  await s.configure({deferRestore:true});
  const result=await s.command({op:'disconnect'});
  assert.equal(result.ok,true);
  let state=await s.state();assert.equal(state.device.connected,false);assert.equal(state.device.armed,false);
  assert.equal(state.device.recoveryPending,true);assert.equal(state.device.errorCode,'RESTORE_DEFERRED');
  const before=(await s.operations()).filter(o=>o.op==='connect').length;
  await new Promise(r=>setTimeout(r,3300));
  assert.equal((await s.operations()).filter(o=>o.op==='connect').length,before);
  assert.equal((await s.state()).device.connected,false);
  await s.configure({deferRestore:false});
  assert.equal((await s.command({op:'connect'})).ok,true);
  state=await until(s.state,x=>x.device.connected&&x.device.armed,'explicit reconnect recovers');
  assert.equal(state.device.error,null);assert.equal(state.playback.mode,'agent');
  const ops=await s.operations(),lastConnect=ops.findLastIndex(o=>o.op==='connect');
  const after=ops.slice(lastConnect+1);assert(after.findIndex(o=>o.op==='restore')<after.findIndex(o=>o.op==='arm'));
});
