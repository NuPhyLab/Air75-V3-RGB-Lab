import test from 'node:test';
import assert from 'node:assert/strict';
import {BluetoothInput} from '../server/bluetooth-input.mjs';
import {KeyAdaptation,planBluetoothKeys} from '../server/key-adaptation.mjs';
import {fakeService,until} from './helpers/fake-service.mjs';

const device={id:'1234',model:'Air75 V3',transport:'bluetooth'};
const permissions={inputMonitoring:true,accessibility:true,canPostEvents:true};
const task={id:'11111111-1111-4111-8111-111111111111',title:'Isolated Bluetooth fixture',status:'idle'};
const keys=Array.from({length:12},(_,i)=>`F${i+1}`);

test('Bluetooth inventory distinguishes one, multiple, removed and malformed devices without retaining stale availability',async()=>{
  let now=0,calls=0,devices=[device];
  const hardware={child:{},async request(op){assert.equal(op,'bluetoothDevices');calls++;return {devices};}};
  const input=new BluetoothInput(hardware,{now:()=>now});
  assert.equal((await input.refresh()).connected,true);
  await input.refresh();assert.equal(calls,1);
  devices=[device,{...device,id:'5678'}];now=2001;
  assert.equal((await input.refresh()).status,'ambiguous');assert.equal(input.value.connected,false);
  devices=[];assert.equal((await input.refresh(true)).connected,false);assert.equal(input.signature,'');
  devices=[{...device,transport:'USB'}];assert.equal((await input.refresh(true)).status,'unavailable');
  devices=[device];hardware.child={};assert.equal((await input.refresh()).connected,true);
  assert.equal(input.snapshot().id,undefined,'registry identity remains internal');
});

test('Bluetooth extended F row follows logical bindings without mapping ordinary or standard keys',()=>{
  const plan=planBluetoothKeys(keys,'1234');
  assert.equal(plan.mappings.length,12);
  for(let i=0;i<12;i++)assert.deepEqual(plan.mappings[i],{
    HIDKeyboardModifierMappingSrc:0x700000068+i,HIDKeyboardModifierMappingDst:0x70000003a+i});
  const custom=planBluetoothKeys(['KeyA',...keys.slice(1)],'1234');
  assert.equal(custom.mappings.length,11);assert.ok(!custom.ready.includes('F1'));
  assert.notEqual(plan.signature,planBluetoothKeys(keys,'5678').signature);
});

test('switching to Bluetooth restores USB mappings and verifies only scoped extended-key OS mappings',async()=>{
  const calls=[],standard=Array(98).fill(0);for(let i=1;i<=12;i++)standard[i]=57+i;
  const active=[...standard];active[1]=105;
  const hardware={child:{},state:{},async request(op){calls.push(op);
    if(op==='permissions')return permissions;
    if(op==='readKeymap')return {mode:0,locationId:1,firmwareVersion:'1.0.16.6',active,defaults:[standard,standard]};
    return {verified:true};}};
  const a=new KeyAdaptation(hardware),config={enabled:true,active:true,connected:true,bindings:keys};
  await a.sync(config);assert.equal(a.owned,true);calls.length=0;
  assert.equal((await a.sync({...config,connected:false,bluetooth:true},true)).status,'ready');
  assert.deepEqual(calls,['permissions','restoreKeys','adaptKeys']);assert.equal(a.owned,true);
  calls.length=0;await a.sync(config,true);
  assert.ok(calls.includes('readKeymap'));assert.ok(calls.includes('adaptKeys'));
});

test('Bluetooth runs task/custom keys and all command routes without USB; duplicate F11 and dictation releases remain correct',async t=>{
  const s=await fakeService(t,{skipInitialConnect:true,present:false,bluetoothDevices:[device],permissions,tasks:[task]});
  await s.command({op:'codexAdapt'});
  let state=await s.state();
  assert.equal(state.device.connected,false);assert.equal(state.bluetooth.connected,true);
  assert.equal(state.codex.keys.enabled,true);assert.equal(state.codex.adaptation.status,'ready');
  assert.equal((await s.command({op:'codexKey',code:'F1',phase:'down'})).ok,true);
  await s.command({op:'codexKey',code:'F1',phase:'up'});
  for(const code of keys.slice(6)) {
    assert.equal((await s.command({op:'codexKey',code,phase:'down'})).ok,true,code);
    if(code==='F11')assert.equal((await s.command({op:'codexKey',code,phase:'down'})).result.ignored,true);
    await s.command({op:'codexKey',code,phase:'up'});
  }
  const sent=(await s.operations()).filter(x=>x.op==='shortcut');
  assert.equal(sent.filter(x=>x.action==='task'&&x.threadId===task.id).length,1);
  assert.equal(sent.filter(x=>x.keyCode===50&&x.phase==='tap').length,1,'terminal toggles exactly once');
  assert.equal(sent.filter(x=>x.phase==='down').length,1);assert.equal(sent.filter(x=>x.phase==='up').length,1);
  assert.equal(sent.filter(x=>x.phase==='tap').length,5);
  await s.command({op:'codexBind',group:'task',index:0,code:'KeyA'});
  assert.equal((await s.command({op:'codexKey',code:'KeyA',phase:'down'})).ok,true);
  await s.command({op:'codexKey',code:'KeyA',phase:'up'});
  for(const op of ['play','preview','triggerArm','gameStart','checkFirmware','lightWake']) {
    const result=await s.command({op});assert.equal(result.ok,false);assert.match(result.error,/蓝牙/);
  }
  const operations=await s.operations();
  assert.equal(operations.filter(x=>['arm','paint','side','readKeymap'].includes(x.op)).length,0);
  assert.ok(operations.filter(x=>x.op==='adaptKeys').every(x=>x.transport==='bluetooth'&&x.mappings.every(r=>r.HIDKeyboardModifierMappingSrc-r.HIDKeyboardModifierMappingDst===46)));
});

test('Bluetooth mapping survives polling, rebinds on reconnect and restores on pause or failure',async()=>{
  let now=0,lost=false;const calls=[];
  const hardware={child:{},state:{},async request(op,args){calls.push({op,args});
    if(op==='permissions')return permissions;
    return {verified:!lost};}};
  const a=new KeyAdaptation(hardware,{now:()=>now});
  const config={enabled:true,active:true,connected:false,bluetooth:true,bluetoothIdentity:'1234',bindings:keys};
  assert.equal((await a.sync(config)).status,'ready');
  now=5000;await a.sync(config);assert.equal(calls.filter(c=>c.op==='adaptKeys').length,1);
  assert.equal(calls.at(-1).op,'keyMappingStatus');
  await a.sync({...config,bluetoothIdentity:'5678'});assert.equal(calls.filter(c=>c.op==='adaptKeys').length,2);
  await a.sync({...config,bindings:['KeyA',...keys.slice(1)]},true);
  assert.equal(calls.at(-1).args.mappings.length,11);
  lost=true;now+=5000;assert.equal((await a.sync(config)).status,'error');
  assert.equal(a.owned,false);assert.equal(calls.at(-1).op,'restoreKeys');
  lost=false;now+=5000;await a.sync(config);
  assert.equal((await a.sync({...config,active:false})).status,'paused');assert.equal(a.owned,false);
  await a.sync(config);assert.equal((await a.sync({...config,enabled:false})).status,'off');
  assert.ok(!calls.some(c=>c.op==='readKeymap'));
});

test('Bluetooth permission denial or uncertain mapping acknowledgement never reports ready',async()=>{
  for(const failure of ['input','denied','uncertain']) {
    const calls=[];
    const a=new KeyAdaptation({child:{},state:{},async request(op){calls.push(op);
      if(op==='permissions')return {...permissions,inputMonitoring:failure!=='input'};
      if(op==='adaptKeys'&&failure==='denied')throw new Error('denied');
      return {verified:failure!=='uncertain'};
    }});
    const result=await a.sync({enabled:true,active:true,connected:false,bluetooth:true,bindings:keys});
    assert.equal(result.status,failure==='input'?'permissions':'error');assert.equal(a.owned,false);
    if(failure==='input')assert.ok(!calls.includes('adaptKeys'));else assert.equal(calls.at(-1),'restoreKeys');
  }
});

test('Bluetooth disconnection releases held dictation, suspends shortcuts, and resumes the same bindings on reconnection',async t=>{
  const s=await fakeService(t,{skipInitialConnect:true,present:false,bluetoothDevices:[device],permissions,tasks:[task]});
  await s.command({op:'codexAdapt'});
  await s.command({op:'codexBind',group:'command',index:5,code:'KeyZ'});
  await s.command({op:'codexKey',code:'F9',phase:'down'});
  assert.equal((await s.state()).codex.keys.held.source,'F9');
  await s.configure({bluetoothDevices:[]});await s.command({op:'refreshBluetooth'});
  const disconnected=await s.state();
  assert.equal(disconnected.codex.keys.held,null);assert.equal(disconnected.codex.keys.enabled,false);
  assert.equal((await s.operations()).filter(x=>x.op==='shortcut'&&x.phase==='up').length,1);
  await s.configure({bluetoothDevices:[{...device,id:'9000'}]});await s.command({op:'refreshBluetooth'});
  const reconnected=await s.state();assert.equal(reconnected.codex.keys.enabled,true);
  assert.ok(reconnected.codex.keys.setupRevision>disconnected.codex.keys.setupRevision);
  assert.equal(reconnected.settings.codexCommandKeys[5],'KeyZ');
  await s.command({op:'settings',settings:{codexEnabled:false}});
  assert.equal((await s.state()).codex.keys.enabled,false);
});

test('Bluetooth task links remain available without Accessibility while system commands report the required permission',async t=>{
  const s=await fakeService(t,{skipInitialConnect:true,present:false,bluetoothDevices:[device],tasks:[task],shortcutPermissionError:true});
  await s.command({op:'codexAdapt'});
  assert.equal((await s.command({op:'codexKey',code:'F1',phase:'down'})).ok,true);
  const command=await s.command({op:'codexKey',code:'F7',phase:'down'});
  assert.equal(command.ok,false);assert.match(command.error,/辅助功能/);
});
