import test from 'node:test';
import assert from 'node:assert/strict';
import {CODEX_KEYS,codexBindings,rebindCodexKey} from '../shared/codex-keys.mjs';
import {defaultSettings,validateSettings,Store} from '../server/storage.mjs';
import {CodexLights} from '../shared/codex-lighting.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('all recordable keys preserve unique actions and valid LED positions; Del has no invented LED',()=>{
 assert.deepEqual(codexBindings().map(key=>key.code),Array.from({length:12},(_,i)=>`F${i+1}`));
 for(const key of CODEX_KEYS) {
  const next=validateSettings(rebindCodexKey(defaultSettings,'task',0,key.code));
  assert.equal(codexBindings(next)[0].code,key.code);
  assert.equal(new Set(codexBindings(next).map(k=>k.code)).size,12);
 }
 const lights=new CodexLights(()=>0),input=Array(84).fill('#123456');
 const settings={...defaultSettings,...rebindCodexKey(defaultSettings,'task',0,'Delete')};
 const frame=lights.render(input,[{id:'a',status:'running'}],settings);
 assert.equal(frame.length,84);assert.equal(frame[83],input[83]);assert.equal(frame[1],input[1]);
 const moved={...defaultSettings,...rebindCodexKey(defaultSettings,'command',0,'Space'),codexAmbient:true};
 lights.select('a');
 assert.equal(lights.render(input,[{id:'a',status:'running'}],moved)[codexBindings(moved)[6].ledIndex],'#304ffe');
});
test('invalid or duplicate assignments fail without mutating previous settings',()=>{
 const before=structuredClone(defaultSettings);
 for(const patch of [{codexTaskKeys:null},{codexTaskKeys:['F1']},{codexTaskKeys:Array(6).fill('F1')},{codexTaskKeys:['Fn','F2','F3','F4','F5','F6']}]) assert.throws(()=>validateSettings(patch));
 assert.throws(()=>rebindCodexKey(before,'task',6,'Space'));
 assert.deepEqual(before,defaultSettings);
});
test('custom task and command keys survive a saved library reload',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'nuphy-keys-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await new Store(dir).load();
 await store.settings(rebindCodexKey(store.data.settings,'task',0,'Space'));
 await store.settings(rebindCodexKey(store.data.settings,'command',5,'KeyZ'));
 const restored=await new Store(dir).load();
 assert.equal(restored.data.settings.codexTaskKeys[0],'Space');assert.equal(restored.data.settings.codexCommandKeys[5],'KeyZ');
});
