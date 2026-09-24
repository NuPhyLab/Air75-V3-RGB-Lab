import test from 'node:test';
import assert from 'node:assert/strict';
import {KeyCapture} from '../server/key-capture.mjs';
import {planKeyAdaptation} from '../server/key-adaptation.mjs';
import {fakeService} from './helpers/fake-service.mjs';

const keys=Array.from({length:12},(_,i)=>`F${i+1}`);
const standard=Array(98).fill(0);keys.forEach((_,i)=>standard[i+1]=58+i);
const extended=[...standard];keys.forEach((_,i)=>extended[i+1]=104+i);
const keymap={mode:0,locationId:17825792,firmwareVersion:'1.0.16.6',active:extended,defaults:[standard,standard]};

test('all twelve USB extended keys follow physical F-row positions without changing custom bindings',()=>{
  const plan=planKeyAdaptation(keymap,keys);
  assert.deepEqual(plan.ready,keys);assert.deepEqual(plan.unsupported,[]);
  assert.deepEqual(plan.mappings,keys.map((_,i)=>({HIDKeyboardModifierMappingSrc:0x700000068+i,HIDKeyboardModifierMappingDst:0x70000003a+i})));
  assert.equal(planKeyAdaptation(keymap,['Digit2',...keys.slice(1)]).mappings.length,11);
  const unrelated=[...extended];unrelated[1]=115;
  assert.deepEqual(planKeyAdaptation({...keymap,active:unrelated},keys).unsupported,['F1']);
});

test('recording expires, renews, and ignores cancellation from an older modal',()=>{
  let now=0;const capture=new KeyCapture(()=>now);
  assert.equal(capture.active,false);capture.update('first',true);
  now=14999;assert.equal(capture.active,true);capture.update('first',true);
  now=15001;assert.equal(capture.active,true);
  capture.update('second',true);capture.update('first',false);assert.equal(capture.active,true);
  now+=15000;assert.equal(capture.active,false);
  capture.update('third',true);capture.update('third',false);assert.equal(capture.active,false);
  assert.throws(()=>capture.update(null,true));assert.throws(()=>capture.update('valid','yes'));
});

test('mode and recorder transitions restore functions and never dispatch commands while recording',async t=>{
  const service=await fakeService(t,{keymap,permissions:{inputMonitoring:true,accessibility:true,canPostEvents:true},tasks:[{id:'example',title:'Example',status:'idle'}]});
  await service.command({op:'codexBind',group:'task',index:0,code:'Digit2'});
  await service.command({op:'codexAdapt'});
  let state=await service.state();const saved=state.settings.codexTaskKeys;
  assert.equal(state.codex.adaptation.mapped,11);assert.equal(state.codex.adaptation.status,'ready');
  assert.equal((await service.command({op:'codexKey',code:'Digit2'})).ok,true);
  await service.command({op:'codexCapture',session:'recorder',active:true});
  await service.command({op:'codexKeyStatus',registered:[],failed:[],suspended:true});
  state=await service.state();
  assert.equal(state.codex.keys.enabled,false);assert.equal(state.settings.codexEnabled,true);
  assert.equal(state.codex.adaptation.mapped,12,'unbound F1 must be ready immediately, including during the polling cooldown');
  const actions=(await service.operations()).filter(x=>x.op==='shortcut').length;
  assert.equal((await service.command({op:'codexKey',code:'F11'})).ok,false);
  assert.equal((await service.operations()).filter(x=>x.op==='shortcut').length,actions);
  await service.command({op:'codexCapture',session:'recorder',active:false});
  await service.command({op:'codexKeyStatus',registered:['Digit2',...keys.slice(1)],failed:[],suspended:false});
  state=await service.state();assert.equal(state.codex.adaptation.mapped,11);assert.equal(state.codex.keys.enabled,true);
  await service.command({op:'settings',settings:{codexEnabled:false}});
  state=await service.state();assert.equal(state.codex.keys.enabled,false);assert.equal(state.codex.adaptation.status,'paused');
  assert.equal((await service.command({op:'codexKey',code:'F11'})).ok,false);
  assert.equal((await service.operations()).filter(x=>x.op==='shortcut').length,actions);
  await service.command({op:'codexCapture',session:'off-mode',active:true});
  state=await service.state();assert.equal(state.codex.adaptation.mapped,12);assert.equal(state.settings.codexEnabled,false);
  await service.command({op:'codexCapture',session:'off-mode',active:false});
  state=await service.state();assert.equal(state.codex.adaptation.status,'paused');
  assert.deepEqual(state.settings.codexTaskKeys,saved);
  await service.command({op:'codexAdapt'});
  assert.equal((await service.state()).codex.adaptation.mapped,11);
  await service.command({op:'codexAdaptRestore'});
  state=await service.state();assert.equal(state.settings.codexEnabled,false);assert.equal(state.codex.adaptation.status,'off');
});
