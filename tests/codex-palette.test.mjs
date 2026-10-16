import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {CodexLights,CUSTOM_STATUS_IDS,STATUS_COLORS,statusColor} from '../shared/codex-lighting.mjs';
import {Store,validateSettings} from '../server/storage.mjs';
import {fakeService,until} from './helpers/fake-service.mjs';

test('custom status colors apply to all six states, brightness, selected feedback and remapped keys',()=>{
 const colors=['#AB1200','#007722','#0011CC','#CAFE10','#7711AA','#123456'];
 const settings={codexStatusColors:Object.fromEntries(CUSTOM_STATUS_IDS.map((id,i)=>[id,colors[i]])),codexSelectedPulse:false,codexAmbient:true,codexBrightness:100};
 const slots=CUSTOM_STATUS_IDS.map((status,i)=>({id:String(i),status}));const lights=new CodexLights(()=>0);lights.select('0');
 const frame=lights.render(Array(84).fill('#000000'),slots,settings);
 assert.deepEqual(frame.slice(1,7),colors.map(c=>c.toLowerCase()));assert.equal(frame[7],'#6f0c00');
 assert.equal(statusColor(null,settings),'#000000');assert.equal(statusColor({status:'future'},settings),'#123456');
 const remapped=lights.render(Array(84).fill('#000000'),slots,{...settings,codexTaskKeys:['KeyA','F2','F3','F4','F5','F6'],codexBrightness:50});
 assert.equal(remapped[46],'#560900');assert.equal(remapped[1],'#000000');
 assert.equal(statusColor({status:'running'}),STATUS_COLORS.running);
});

test('palette patches merge, reject invalid states atomically, persist and can reset',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'nuphy-palette-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await new Store(dir).load();await store.settings({codexStatusColors:{running:'#123456'}});await store.settings({codexStatusColors:{idle:'#ABCDEF'}});
 const reread=await new Store(dir).load();assert.deepEqual(reread.data.settings.codexStatusColors,{running:'#123456',idle:'#ABCDEF'});
 const previous=structuredClone(store.data.settings);
 for(const bad of [{running:'red'},{unassigned:'#123456'},{running:'#112233',error:'no'},[],null])assert.throws(()=>validateSettings({codexStatusColors:bad},previous));
 assert.deepEqual(store.data.settings,previous);
 await store.settings({codexStatusColors:Object.fromEntries(CUSTOM_STATUS_IDS.map(id=>[id,STATUS_COLORS[id]]))});
 assert.equal(statusColor({status:'running'},store.data.settings),STATUS_COLORS.running);
});

test('live service applies palette changes without restarting task mode or resetting global timing',async t=>{
 const s=await fakeService(t,{tasks:CUSTOM_STATUS_IDS.map((status,i)=>({id:String(i),status}))});
 await s.command({op:'settings',settings:{brightness:100,codexBrightness:100,codexEnabled:true,codexSelectedPulse:false,lightDurationMs:60000}});
 await s.command({op:'play',colors:Array(84).fill('#123456'),animation:{effect:'move',direction:'right',speed:4,loop:true}});
 await s.command({op:'settings',settings:{codexEnabled:true}});
 const before=await s.state();
 const colors=Object.fromEntries(CUSTOM_STATUS_IDS.map((id,i)=>[id,['#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF','#00FFFF'][i]]));
 await s.command({op:'settings',settings:{codexStatusColors:colors}});
 const after=await until(s.state,v=>v.colors[1]==='#ff0000'&&v.colors[2]==='#00ff00','palette was not sent');
 assert.deepEqual(after.colors.slice(1,7),Object.values(colors).map(c=>c.toLowerCase()));assert.equal(after.playback.mode,'agent');assert.equal(after.playback.playing,false);assert.equal(after.colors[20],'#000000');
 assert.ok(after.lightPower.remainingMs<=before.lightPower.remainingMs);
});
