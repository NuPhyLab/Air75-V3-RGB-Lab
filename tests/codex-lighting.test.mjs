import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexLights,resolveSlots,StableTaskSlots,STATUS_COLORS} from '../shared/codex-lighting.mjs';
import {validateSettings} from '../server/storage.mjs';
const blank=()=>Array(84).fill('#112233');
test('Micro RGB, empty slots, independent brightness and preserved artwork',()=>{
 assert.deepEqual(Object.values(STATUS_COLORS).slice(0,5),['#FFFFFF','#304FFE','#00FF4C','#FF6D00','#FF0033']);
 const engine=new CodexLights(()=>0);
 const frame=engine.render(blank(),[{id:'a',status:'running'},null,{id:'b',status:'completed'},null,null,null],{codexBrightness:100});
 assert.equal(frame[1],'#304ffe');assert.equal(frame[2],'#000000');assert.equal(frame[3],'#00ff4c');
 assert.equal(frame[0],'#112233');assert.equal(frame[7],'#112233');assert.equal(frame[83],'#112233');
 assert.equal(engine.render(blank(),[{id:'a',status:'running'}],{codexBrightness:50})[1],'#18287f');
});
test('legacy Codex timers cannot switch off status lights independently',()=>{
 let now=0;const lights=new CodexLights(()=>now),slots=[{id:'a',status:'completed'}];
 lights.select('a');const settings={codexAutoOffMs:1000,codexHintMs:1000,codexAmbient:true,codexSelectedPulse:false};
 const first=lights.render(blank(),slots,settings);
 now=86400000;const later=lights.render(blank(),slots,settings);
 assert.deepEqual(later,first);assert.equal(lights.snapshot().sleeping,false);
 assert.notEqual(later[1],'#000000');assert.notEqual(later[7],'#000000');
});
test('selected task pulse and command feedback follow the current status',()=>{
 let now=0;const lights=new CodexLights(()=>now);const slots=[{id:'a',status:'running'},{id:'b',status:'idle'}];
 lights.select('a');const first=lights.render(blank(),slots,{codexAmbient:true});now=900;
 const second=lights.render(blank(),slots,{codexAmbient:true});assert.notEqual(first[1],second[1]);assert.equal(first[2],second[2]);
 assert.notDeepEqual(first.slice(7,13),second.slice(7,13));
 lights.select('b');now+=4001;assert.deepEqual(lights.render(blank(),slots,{codexAmbient:true}).slice(7,13),Array(6).fill('#a6a6a6'));
 assert.equal(lights.render(blank(),slots,{codexAmbient:false})[7],'#112233');
});
test('recent, pinned, priority and custom mappings are deterministic with empty slots',()=>{
 const tasks=[{id:'a',status:'idle'},{id:'b',status:'running',pinned:true,pinOrder:1},{id:'c',status:'needsInput',pinned:true,pinOrder:0},{id:'d',status:'completed'}];
 const ids=(mode,slotIds=[])=>resolveSlots(tasks,{codexTaskSource:mode,slotIds}).map(t=>t?.id??null);
 assert.deepEqual(ids('recent'),['a','b','c','d',null,null]);assert.deepEqual(ids('pinned'),['c','b',null,null,null,null]);
 assert.deepEqual(ids('priority'),['c','d','b','a',null,null]);
 assert.deepEqual(ids('custom',['c','','missing','a']),['c',null,null,'a',null,null]);
 assert.deepEqual(ids('recent',['c']),['a','b','c','d',null,null]);
});
test('Micro settings survive validation and reject unsupported ranges atomically',()=>{
 const value=validateSettings({codexTaskSource:'priority',codexAutoOffMs:3600000,codexBrightness:45,codexSelectedPulse:false,codexAmbient:true});
 assert.equal(validateSettings({},value).codexAutoOffMs,3600000);
 for(const patch of [{codexTaskSource:'anything'},{codexAutoOffMs:123},{codexBrightness:101},{codexAmbient:1},{codexCommandIds:['newTask']}]) assert.throws(()=>validateSettings(patch));
});


test('recent task identities stay on their keys while statuses and colours refresh',()=>{
 const resolver=new StableTaskSlots(),lights=new CodexLights(()=>0),settings={codexTaskSource:'recent'};
 const tasks=Array.from('abcdefg',id=>({id,status:'idle'}));
 const ids=rows=>rows.map(t=>t?.id??null);
 assert.deepEqual(ids(resolver.resolve(tasks,settings)),Array.from('abcdef'));
 const updated=[{id:'c',status:'needsInput'},tasks[0],tasks[5],tasks[1],tasks[3],tasks[4],tasks[6]];
 const slots=resolver.resolve(updated,settings);
 assert.deepEqual(ids(slots),Array.from('abcdef'));
 assert.equal(slots[2].status,'needsInput');
 assert.equal(lights.render(blank(),slots,settings)[3],'#ff6d00');
 assert.deepEqual(ids(resolver.resolve([tasks[6],...updated.slice(0,5)],settings)),Array.from('abcdgf'));
 assert.deepEqual(ids(resolver.resolve([],settings)),Array(6).fill(null));
 assert.deepEqual(ids(resolver.resolve([tasks[2]],settings)),['c',null,null,null,null,null]);
});
test('explicit, pinned and priority task sources retain their ordering semantics',()=>{
 const resolver=new StableTaskSlots(),tasks=[{id:'a',status:'idle'},{id:'b',status:'running',pinned:true,pinOrder:0}];
 resolver.resolve(tasks,{});
 const ids=(source,extra={})=>resolver.resolve([...tasks].reverse(),{codexTaskSource:source,...extra}).map(t=>t?.id??null);
 assert.deepEqual(ids('priority'),['b','a',null,null,null,null]);
 assert.deepEqual(ids('custom',{slotIds:['a','b']}),['a','b',null,null,null,null]);
 assert.deepEqual(ids('pinned'),['b',null,null,null,null,null]);
 assert.deepEqual(ids('recent'),['b','a',null,null,null,null]);
});
