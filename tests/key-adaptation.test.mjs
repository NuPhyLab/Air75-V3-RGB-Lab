import test from 'node:test';
import assert from 'node:assert/strict';
import {KeyAdaptation,planKeyAdaptation} from '../server/key-adaptation.mjs';
import {fakeService,until} from './helpers/fake-service.mjs';

const keys=Array.from({length:12},(_,i)=>`F${i+1}`);
function keymap(media=false) {
  const standard=Array(98).fill(0);for(let i=1;i<=12;i++)standard[i]=57+i;
  const active=[...standard];
  if(media) active.splice(1,12,105,106,32262,32263,32264,32278,172,174,171,168,170,169);
  return {mode:0,locationId:1048576,firmwareVersion:'1.0.16.6',active,defaults:[standard,standard]};
}
test('standard F keys remain untouched; actual factory media keys are mapped with unsupported keys explicit',()=>{
  const standard=planKeyAdaptation(keymap(),keys);
  assert.equal(standard.mappings.length,0);assert.deepEqual(standard.ready,keys);
  const media=planKeyAdaptation(keymap(true),keys);
  assert.equal(media.mappings.length,11);assert.deepEqual(media.unsupported,['F4']);
  assert.deepEqual(media.mappings[0],{HIDKeyboardModifierMappingSrc:0x700000069,HIDKeyboardModifierMappingDst:0x70000003a});
  assert.deepEqual(media.mappings.at(-1),{HIDKeyboardModifierMappingSrc:0xc000000e9,HIDKeyboardModifierMappingDst:0x700000045});
});
test('custom bindings, aliasing and malformed/unverified keymaps do not silently become default F mappings',()=>{
  const custom=keymap(true);custom.active[96]=169;
  const plan=planKeyAdaptation(custom,['KeyA',...keys.slice(1)]);
  assert.equal(plan.mappings.length,10);assert.deepEqual(plan.shared,['F12']);
  custom.active[7]=4;assert.ok(planKeyAdaptation(custom,keys).unsupported.includes('F7'));
  custom.active[7]=171;assert.ok(planKeyAdaptation(custom,keys).unsupported.includes('F9'));
  for(const patch of [{firmwareVersion:'1.0.17.6'},{active:[]},{mode:2},{locationId:0}])
    assert.throws(()=>planKeyAdaptation({...keymap(),...patch},keys));
});
test('mapping lifecycle restores on disable, mode change and unplug; identical plans are not rewritten',async()=>{
  let now=0,map=keymap(true),leased=false;const calls=[];
  const hardware={child:{},state:{},async request(op,value){calls.push({op,value});
    if(op==='restoreFunctionKey'){leased=false;}
    if(op==='prepareFunctionKey'){leased=true;return {verified:true,leased:true};}
    if(op==='readKeymap'){const copy=structuredClone(map);if(leased){copy.active[4]=61;copy.functionKeyLease=true;}return copy;}
    if(op==='permissions')return {inputMonitoring:true,accessibility:true,canPostEvents:true};
    return {verified:true};}};
  const a=new KeyAdaptation(hardware,{now:()=>now});
  const config={enabled:true,active:true,connected:true,bindings:keys};
  assert.equal((await a.sync(config)).status,'ready');assert.equal(calls.filter(x=>x.op==='adaptKeys').length,1);
  now+=5000;await a.sync(config);assert.equal(calls.filter(x=>x.op==='adaptKeys').length,1);
  map=keymap();now+=5000;assert.equal((await a.sync(config)).status,'ready');assert.equal(a.owned,false);
  map=keymap(true);now+=5000;await a.sync(config);
  assert.equal((await a.sync({...config,connected:false})).status,'waitingDevice');assert.equal(a.owned,false);
  await a.sync(config);assert.equal((await a.sync({...config,active:false})).status,'paused');assert.equal(a.owned,false);
  await a.sync(config);assert.equal((await a.sync({...config,enabled:false})).status,'off');assert.equal(a.owned,false);
});
test('a keyboard that already sends standard F keys needs no permission and no write',async()=>{
  // Nothing has to be remapped, so holding the user at "waiting for
  // authorization" would ask for permissions that are never used.
  const calls=[];
  const a=new KeyAdaptation({child:{},state:{},async request(op){calls.push(op);
    if(op==='readKeymap')return keymap();
    if(op==='permissions')return {inputMonitoring:false,accessibility:false,canPostEvents:false};
    return {verified:true};
  }});
  const result=await a.sync({enabled:true,active:true,connected:true,bindings:keys});
  assert.equal(result.status,'ready');
  assert.equal(result.mapped,0);
  assert.deepEqual(result.ready,keys);
  assert.equal(calls.includes('adaptKeys'),false,'nothing may be written to the system');
});
test('missing permission, apply failures and unreadable maps never report ready',async()=>{
  for(const failure of ['permission','apply','read','unverified']) {
    const calls=[];
    const a=new KeyAdaptation({child:{},state:{},async request(op){calls.push(op);
      if(op==='readKeymap'){if(failure==='read')throw new Error('unreadable');const m=keymap(true);m.active[4]=61;return m;}
      if(op==='permissions')return {inputMonitoring:failure!=='permission',accessibility:true,canPostEvents:true};
      if(op==='adaptKeys'&&failure==='apply')throw new Error('denied');
      return {verified:failure!=='unverified'};
    }});
    const result=await a.sync({enabled:true,active:true,connected:true,bindings:keys});
    assert.equal(result.status,failure==='permission'?'permissions':'error');
    if(failure==='permission')assert.ok(!calls.includes('adaptKeys'));
    if(['apply','unverified'].includes(failure))assert.equal(calls.filter(op=>op==='restoreKeys').length,2);
  }
});
test('service setup persists intent, preserves custom bindings/scenes and restores when disabled',async t=>{
  const service=await fakeService(t,{permissions:{inputMonitoring:true,accessibility:true,canPostEvents:true},keymap:keymap(true)});
  await service.command({op:'connect'});
  await service.command({op:'codexBind',group:'task',index:0,code:'KeyA'});
  const before=await service.state();
  assert.equal((await service.command({op:'codexAdapt'})).ok,true);
  let state=await service.state();
  assert.equal(state.settings.codexKeyAdaptation,true);assert.equal(state.settings.codexEnabled,true);
  assert.deepEqual(state.settings.codexTaskKeys,before.settings.codexTaskKeys);
  assert.deepEqual(state.scenes,before.scenes);assert.equal(state.codex.adaptation.status,'ready');
  assert.equal(state.codex.adaptation.mapped,11);
  await service.command({op:'settings',settings:{codexEnabled:false}});
  state=await service.state();assert.equal(state.codex.adaptation.status,'paused');
  await service.command({op:'codexAdaptRestore'});
  state=await service.state();assert.equal(state.settings.codexKeyAdaptation,false);
  assert.equal(state.codex.adaptation.status,'off');
});
test('service waits for permission then resumes; replug and games restore and re-apply scoped mappings',async t=>{
  const service=await fakeService(t,{keymap:keymap(true)});
  await service.command({op:'connect'});await service.command({op:'codexAdapt'});
  assert.equal((await service.state()).codex.adaptation.status,'permissions');
  await service.configure({permissions:{inputMonitoring:true,accessibility:true,canPostEvents:true}});
  await service.command({op:'codexAdaptCheck'});
  assert.equal((await service.state()).codex.adaptation.status,'ready');
  await service.command({op:'gameStart',gameType:'snake'});
  await until(()=>service.state(),s=>s.codex.adaptation.status==='paused','game suspends mappings');
  await service.command({op:'gameStop'});
  await until(()=>service.state(),s=>s.codex.adaptation.status==='ready','game exit resumes mappings');
  await service.command({op:'disconnect'});
  assert.equal((await service.state()).codex.keys.enabled,false);
  await until(()=>service.state(),s=>s.codex.adaptation.status==='waitingDevice','disconnect clears active setup');
  await service.command({op:'connect'});
  await until(()=>service.state(),s=>s.codex.adaptation.status==='ready','reconnect resumes setup');
  assert.equal((await service.state()).codex.keys.enabled,true);
  await service.command({op:'codexAdaptDriver'});
  assert.equal((await service.state()).device.connected,false);
  assert.equal((await service.state()).device.connectionPaused,true);
});

test('new firmware adapts from verified geometry, not a version whitelist', () => {
  for (const firmwareVersion of ['1.0.23.6', '1.0.99.6']) {
    const map = {...keymap(true), firmwareVersion, protocol:'air75-s4-keymap',geometryVerified:true,readOnly:true};
    assert.equal(planKeyAdaptation(map,keys).mappings.length,11);
    for (const patch of [{geometryVerified:false},{protocol:'different'},{readOnly:false}])
      assert.throws(()=>planKeyAdaptation({...map,...patch},keys));
    map.defaults[1][2]=NaN;
    assert.throws(()=>planKeyAdaptation(map,keys));
  }
});


test('F4 lease is released when binding changes and even when OS restoration fails',async()=>{
 let leased=false,failRestore=false;const calls=[];
 const hardware={child:{},state:{},async request(op){calls.push(op);
  if(op==='permissions')return {inputMonitoring:true,accessibility:true,canPostEvents:true};
  if(op==='readKeymap'){const map=keymap(true);if(leased){map.active[4]=61;map.functionKeyLease=true;}return map;}
  if(op==='prepareFunctionKey'){leased=true;return {leased:true,verified:true};}
  if(op==='restoreFunctionKey'){leased=false;return {restored:true};}
  if(op==='restoreKeys'&&failRestore)throw new Error('OS restoration failed');
  return {verified:true};
 }};
 const a=new KeyAdaptation(hardware),config={enabled:true,active:true,connected:true,bindings:keys};
 assert.equal((await a.sync(config)).status,'ready');assert.equal(leased,true);
 assert.equal((await a.sync({...config,bindings:keys.filter(k=>k!=='F4')})).status,'ready');assert.equal(leased,false);
 await a.sync(config);failRestore=true;
 assert.equal((await a.sync({...config,active:false})).status,'error');
 assert.equal(leased,false);assert.equal(a.owned,true,'failed OS restore stays retryable');
 assert.ok(calls.includes('restoreFunctionKey'));
 failRestore=false;await a.sync({...config,active:false});assert.equal(a.owned,false);
});
