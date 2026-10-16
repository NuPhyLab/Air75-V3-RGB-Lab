import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fakeService,until} from './helpers/fake-service.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const art=Array(84).fill('#123456');
test('whole keyboard duration blacks main and side lights, survives language changes, and wakes back to artwork',async t=>{
 const s=await fakeService(t);
 await s.command({op:'settings',settings:{brightness:100,lightDurationMs:1000}});
 await s.command({op:'preview',colors:art});
 await until(s.state,v=>v.lightPower.sleeping,'duration did not switch off');
 assert.ok((await s.state()).colors.every(c=>c==='#000000'));
 assert.equal((await s.operations()).filter(o=>o.op==='side').at(-1).brightness,0);
 await s.command({op:'settings',settings:{language:'en'}});
 assert.equal((await s.state()).lightPower.sleeping,true);
 await s.command({op:'lightActivity'});assert.equal((await s.state()).lightPower.sleeping,true);
 await s.command({op:'lightWake'});
 const awake=await until(s.state,v=>v.colors[0]==='#123456','wake did not restore artwork');
 assert.equal(awake.lightPower.sleeping,false);
 assert.equal((await s.operations()).filter(o=>o.op==='side').at(-1).restore,true);
 const saved=JSON.parse(await readFile(s.dataDir+'/library.json','utf8'));
 assert.equal(saved.settings.language,'en');assert.equal(saved.settings.lightDurationMs,1000);
});
test('global idle timer sleeps and wakes artwork and Codex together, ignoring legacy timeout',async t=>{
 const s=await fakeService(t,{tasks:[{id:'a',status:'running'}]});
 await s.command({op:'settings',settings:{brightness:100,codexEnabled:true,codexAutoOffMs:1000,lightIdleMs:2200}});
 await s.command({op:'preview',colors:art});
 await wait(1200);
 const lit=await s.state();assert.equal(lit.colors[0],'#123456');assert.equal(lit.colors[1],'#304ffe');assert.equal(lit.codex.lighting.sleeping,false);
 const asleep=await until(s.state,v=>v.lightPower.sleeping&&v.colors.every(c=>c==='#000000'),'whole keyboard did not send its sleeping frame');
 assert.equal(asleep.codex.lighting.sleeping,true);assert.ok(asleep.colors.every(c=>c==='#000000'));
 await s.configure({systemIdleMs:0});
 const awake=await until(s.state,v=>v.colors[0]==='#123456','system activity did not wake');
 assert.equal(awake.colors[1],'#304ffe');assert.equal(awake.codex.lighting.sleeping,false);
});
test('global duration controls Codex too; legacy wake also restores the whole keyboard',async t=>{
 const s=await fakeService(t,{tasks:[{id:'a',status:'completed'}]});
 await s.command({op:'settings',settings:{brightness:100,codexEnabled:true,codexAutoOffMs:0,lightDurationMs:1000}});
 await s.command({op:'preview',colors:art});
 const asleep=await until(s.state,v=>v.lightPower.sleeping&&v.colors.every(c=>c==='#000000'),'duration did not send the sleeping frame');
 assert.ok(asleep.colors.every(c=>c==='#000000'));assert.equal(asleep.codex.lighting.sleeping,true);
 await s.configure({tasks:[{id:'a',status:'running'}]});await wait(100);
 assert.equal((await s.state()).lightPower.sleeping,true);
 await s.command({op:'codexWake'});
 const awake=await until(s.state,v=>v.colors[0]==='#123456','legacy wake did not restore');
 assert.equal(awake.colors[1],'#304ffe');assert.equal(awake.codex.lighting.sleeping,false);
});
test('animation and game clocks pause during whole-keyboard sleep',async t=>{
 const s=await fakeService(t);
 await s.command({op:'settings',settings:{brightness:100,lightDurationMs:1000}});
 const frames=[{colors:art,duration:1800},{colors:Array(84).fill('#aabbcc'),duration:1800}];
 await s.command({op:'play',colors:art,animation:{effect:'frames',frames,loop:false}});
 await until(s.state,v=>v.lightPower.sleeping,'animation did not sleep');await wait(1900);
 await s.command({op:'lightWake'});
 await until(s.state,v=>v.colors[0]==='#123456','animation advanced while asleep');
 await s.command({op:'gameStart',gameType:'whack',speed:3});
 const asleep=await until(s.state,v=>v.lightPower.sleeping,'game did not sleep');await wait(500);
 await s.command({op:'gameInput',code:asleep.game.targetCode,pressed:true});
 const later=await s.state();assert.deepEqual(later.game,asleep.game);
 await s.command({op:'lightWake'});await until(s.state,v=>v.colors.some(c=>c!=='#000000'),'game did not resume');
});

test('manual pause and resume during timer sleep preserve animation position',async t=>{
 const s=await fakeService(t);
 await s.command({op:'settings',settings:{brightness:100,lightDurationMs:1000}});
 await s.command({op:'play',colors:art,animation:{effect:'frames',loop:false,frames:[{colors:art,duration:2000},{colors:Array(84).fill('#aabbcc'),duration:2000}]}});
 await until(s.state,v=>v.lightPower.sleeping,'animation did not sleep');await wait(1400);
 await s.command({op:'pause'});assert.ok((await s.state()).playback.elapsed<1300);
 await s.command({op:'pause'});
 await until(s.state,v=>v.colors[0]==='#123456'&&!v.lightPower.sleeping,'resume lost the paused frame');
});

test('an occupied preferred origin falls back without blocking startup',async t=>{
 const {createServer}=await import('node:net');const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const port=server.address().port;const s=await fakeService(t,{preferredPort:port});
 assert.notEqual(new URL(s.url).port,String(port));assert.equal((await s.state()).device.connected,true);
});
