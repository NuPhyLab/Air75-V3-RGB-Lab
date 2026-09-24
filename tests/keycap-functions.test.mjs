import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planKeycapFunctions} from '../server/key-adaptation.mjs';
import {KEYCAP_USAGES,FACTORY_MAC_ROW,extendedKeycapMappings} from '../shared/keycap-functions.mjs';
import {fakeService} from './helpers/fake-service.mjs';

const keys=Array.from({length:12},(_,i)=>`F${i+1}`),standard=Array(98).fill(0),mac=[...standard],extended=[...standard];
keys.forEach((_,i)=>{standard[i+1]=58+i;mac[i+1]=FACTORY_MAC_ROW[i];extended[i+1]=104+i;});
const keymap={mode:0,locationId:17825792,firmwareVersion:'1.0.16.6',active:extended,defaults:[mac,standard]};

test('off mode follows physical keycap order, including distinct brightness and volume pairs',async()=>{
  const p=planKeycapFunctions(keymap);
  assert.deepEqual(p.mappings,extendedKeycapMappings());assert.equal(p.keycapsMapped,true);
  assert.deepEqual(p.mappings.map(m=>m.HIDKeyboardModifierMappingDst),[0xc00000070,0xc0000006f,0xff0100000010,0xc00000221,0xc000000cf,0x10000009b,0xc000000b6,0xc000000cd,0xc000000b5,0xc000000e2,0xc000000ea,0xc000000e9]);
  const swift=await readFile(new URL('../native/HIDBridge.swift',import.meta.url),'utf8');
  const values=swift.match(/static let keycapUsages:\[UInt64\] = \[([^\]]+)\]/)[1].split(',').map(x=>Number(x.trim()));
  assert.deepEqual(values,KEYCAP_USAGES,'native allowlist and planner use the same physical order');
});
test('keycap fallback does not reinterpret custom, standard, factory, Windows or unsupported maps',()=>{
  for(const patch of [{active:standard},{active:mac},{active:[...extended.slice(0,1),4,...extended.slice(2)]},{mode:1}])
    assert.deepEqual(planKeycapFunctions({...keymap,...patch}).mappings,[]);
  assert.throws(()=>planKeycapFunctions({...keymap,firmwareVersion:'unknown'}));
  assert.throws(()=>planKeycapFunctions({...keymap,defaults:[standard,standard]}));
});
test('off, on, recorder and off switch between exact profiles without changing user bindings or firmware',async t=>{
  const service=await fakeService(t,{keymap,permissions:{inputMonitoring:true,accessibility:true,canPostEvents:true}});
  await service.command({op:'settings',settings:{codexEnabled:false,codexKeyAdaptation:true,codexKeycapFallback:true}});
  let s=await service.state();const settings=s.settings;
  assert.equal(s.codex.adaptation.status,'keycaps');assert.equal(s.codex.adaptation.mapped,12);assert.equal(s.codex.keys.enabled,false);
  let applied=(await service.operations()).filter(o=>o.op==='adaptKeys').at(-1);
  assert.equal(applied.profile,'keycaps');assert.deepEqual(applied.mappings,extendedKeycapMappings());
  await service.command({op:'codexAdapt'});
  s=await service.state();assert.equal(s.codex.adaptation.status,'ready');assert.equal(s.codex.keys.enabled,true);
  applied=(await service.operations()).filter(o=>o.op==='adaptKeys').at(-1);
  assert.equal(applied.profile,undefined);assert.deepEqual(applied.mappings.map(x=>x.HIDKeyboardModifierMappingDst),keys.map((_,i)=>0x70000003a+i));
  await service.command({op:'settings',settings:{codexEnabled:false}});
  await service.command({op:'codexCapture',session:'test-recording',active:true});
  assert.equal((await service.state()).codex.adaptation.status,'ready');
  await service.command({op:'codexCapture',session:'test-recording',active:false});
  s=await service.state();assert.equal(s.codex.adaptation.status,'keycaps');assert.equal(s.codex.keys.enabled,false);
  assert.deepEqual(s.settings.codexTaskKeys,settings.codexTaskKeys);assert.deepEqual(s.settings.codexCommandKeys,settings.codexCommandKeys);
  assert.ok(!(await service.operations()).some(o=>/writeKey|setKey|shortcut/.test(o.op)));
  await service.command({op:'settings',settings:{codexKeycapFallback:false}});
  assert.equal((await service.state()).codex.adaptation.status,'paused');
});
test('Bluetooth uses the same explicit keycap profile and restores Codex keys when enabled',async t=>{
  const service=await fakeService(t,{skipInitialConnect:true,present:false,bluetoothDevices:[{id:'1234',model:'Air75 V3',transport:'bluetooth'}],permissions:{inputMonitoring:true,accessibility:true,canPostEvents:true}});
  await service.command({op:'refreshBluetooth'});
  await service.command({op:'settings',settings:{codexEnabled:false,codexKeycapFallback:true,codexKeyAdaptation:true}});
  const state=await service.state();assert.equal(state.codex.adaptation.status,'keycaps');assert.equal(state.codex.adaptation.transport,'bluetooth');
  const applied=(await service.operations()).filter(o=>o.op==='adaptKeys').at(-1);
  assert.equal(applied.transport,'bluetooth');assert.deepEqual(applied.mappings,extendedKeycapMappings());
  await service.command({op:'codexAdapt'});assert.equal((await service.state()).codex.adaptation.status,'ready');
});
