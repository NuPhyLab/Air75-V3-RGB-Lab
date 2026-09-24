import test from 'node:test';
import assert from 'node:assert/strict';
import {LightingPower} from '../shared/lighting-power.mjs';
import {CodexLights} from '../shared/codex-lighting.mjs';
import {validateSettings} from '../server/storage.mjs';
import {translate} from '../shared/i18n.mjs';

test('light timer stays off after duration and only explicit wake restarts it',()=>{
 let now=0;const power=new LightingPower(()=>now),settings={lightDurationMs:1000,lightIdleMs:3000};
 now=999;assert.equal(power.update(settings).sleeping,false);
 now=1000;assert.equal(power.update(settings).reason,'duration');
 now=2000;power.activity();assert.equal(power.update(settings).sleeping,true);
 power.wake();assert.equal(power.update(settings).remainingMs,1000);
});
test('idle sleep uses system and app activity without polling extending the timeout',()=>{
 let now=0;const power=new LightingPower(()=>now),settings={lightIdleMs:1000};
 now=1000;power.observeSystemIdle(1500);assert.equal(power.update(settings).reason,'idle');
 now=2000;power.observeSystemIdle(2500);assert.equal(power.update(settings).sleeping,true);
 power.observeSystemIdle(100);assert.equal(power.update(settings).sleeping,false);
 now=3000;assert.equal(power.update(settings).sleeping,true);
 power.activity();assert.equal(power.update(settings).sleeping,false);
 now=5000;assert.equal(power.update({}).sleeping,false);
});
test('Codex changes wake idle lights; an unchanged task list does not',()=>{
 let now=0;const power=new LightingPower(()=>now);power.observeCodex('working');
 now=1000;power.update({lightIdleMs:1000});power.observeCodex('working');assert.equal(power.sleeping,true);
 power.observeCodex('completed');assert.equal(power.sleeping,false);
});
test('Codex rendering remains lit until the global power controller sleeps',()=>{
 let now=0;const lights=new CodexLights(()=>now),power=new LightingPower(()=>now),slots=[{id:'a',status:'completed'}];
 const settings={lightDurationMs:5000,codexAutoOffMs:1000,codexHintMs:1000,codexAmbient:true};lights.select('a');
 const frame=()=>power.update(settings).sleeping?Array(84).fill('#000000'):lights.render(Array(84).fill('#112233'),slots,settings);
 now=1500;assert.notEqual(frame()[7],'#000000');assert.notEqual(frame()[1],'#000000');
 now=5000;assert.ok(frame().every(c=>c==='#000000'));
 power.wake();assert.notEqual(frame()[7],'#000000');assert.notEqual(frame()[1],'#000000');
});
test('timing and language settings validate independently and preserve existing settings',()=>{
 const settings=validateSettings({language:'en',lightDurationMs:86400000,lightIdleMs:1500,codexAutoOffMs:45000,codexHintMs:2000});
 assert.equal(validateSettings({language:'zh-CN'},settings).codexHintMs,2000);
 for(const patch of [{language:'de'},{lightDurationMs:999},{lightIdleMs:-1},{lightDurationMs:86400001},{codexHintMs:0},{codexHintMs:600001},{codexAutoOffMs:1.5}])assert.throws(()=>validateSettings(patch));
});
test('translation preserves values, placeholder user content, and Chinese selection',()=>{
 assert.equal(translate('en','已导入 3 个作品'),'Imported 3 scenes');
 assert.equal(translate('en','打开作品 我的小心意'),'Open scene 我的小心意');
 assert.equal(translate('en','不支持的设置项：abc'),'Unsupported setting: abc');
 assert.equal(translate('zh-CN','设备'),'设备');assert.equal(translate('en','设备'),'Device');
 assert.equal(translate('en',null),null);assert.equal(translate('en',42),42);
});
