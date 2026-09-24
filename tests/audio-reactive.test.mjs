import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_AUDIO,AudioReactive,validateAudio,validateAudioFeature} from '../shared/audio-reactive.mjs';
import {AudioSession} from '../server/audio.mjs';
import {validateSettings} from '../server/storage.mjs';
import {layout} from '../shared/layout.mjs';
import {fakeService,until} from './helpers/fake-service.mjs';
import {AUDIO_EFFECTS} from '../shared/audio-effects.mjs';
import {translate} from '../shared/i18n.mjs';
import {hexToHsv} from '../shared/color.mjs';
const input=(rms=0.25,band=0)=>({rms,bands:Array.from({length:8},(_,i)=>i===band?rms:0)});
const inventory={op:'audioInventory',systemSupported:true,devices:[{id:'test-mic',name:'Test mic'}],microphonePermission:true};
function countBeats({effect='ripple',sensitivity=1.5,sample,duration=10000,stale=()=>false}){
  const renderer=new AudioReactive(),times=[];
  let last=-Infinity;
  for(let now=0;now<duration;now+=50){
    renderer.feed(sample(now));
    renderer.render({...DEFAULT_AUDIO,effect,sensitivity},now,stale(now));
    if(renderer.lastBeat!==last){times.push(now);last=renderer.lastBeat}
  }
  return times;
}

test('steady loud bass does not flatten repeated drum attacks after display gain clips',()=>{
  for(const effect of ['ripple','comet','heartbeat']){
    const beats=countBeats({effect,sample:now=>input(now%500<100?0.42:0.24)});
    assert.deepEqual(beats,Array.from({length:20},(_,i)=>i*500),effect+' must respond to every attack');
  }
});
test('fast 200 ms beats trigger once per attack instead of dropping alternate hits',()=>{
  const beats=countBeats({sample:now=>input(now%200<100?0.3:0.04)});
  assert.deepEqual(beats,Array.from({length:50},(_,i)=>i*200));
});
test('mid/high drum attacks remain visible over constant bass and overall loudness',()=>{
  const beats=countBeats({sample:now=>({rms:0.4,bands:[0.35,0.2,0,0,0,0,now%500<100?0.18:0.015,0]})});
  assert.deepEqual(beats,Array.from({length:20},(_,i)=>i*500));
});
test('sensitivity admits lighter beats without periodically retriggering steady tones or noise',()=>{
  const sample=now=>input(now%500<100?0.27:0.24);
  assert(countBeats({sample,sensitivity:1.5}).length<8,'the default keeps very soft accents selective');
  assert.equal(countBeats({sample,sensitivity:3}).length,20,'higher sensitivity detects the soft accents');
  for(const sensitivity of [0.25,1.5,4]){
    assert.equal(countBeats({sensitivity,sample:()=>input(0.4)}).length,1,'sustained tone');
    assert.equal(countBeats({sensitivity,sample:now=>input(0.3*(1+Math.sin(now)*0.02))}).length,1,'small noise fluctuations');
    assert.equal(countBeats({sensitivity,sample:now=>input(now%500<100?0.001:0)}).length,0,'below noise gate');
  }
});
test('audio gaps decay to black and the first returning beat is detected',()=>{
  const beats=countBeats({duration:3000,sample:()=>input(0.4),stale:now=>now>=200&&now<2000});
  assert.deepEqual(beats,[0,2000]);
});

test('audio settings and bounded feature validation preserve other preferences',()=>{
  assert.equal(validateSettings({audio:{effect:'spectrum'}}).audio.color,DEFAULT_AUDIO.color);
  assert.throws(()=>validateAudio({sensitivity:Infinity}));assert.throws(()=>validateAudio({source:'loopback-driver'}));
  assert.throws(()=>validateAudioFeature({rms:NaN,bands:Array(8).fill(0)}));assert.throws(()=>validateAudioFeature({rms:1,bands:[1]}));
});
test('color mode migrates single-color preferences and validates partial updates',()=>{
  const {colorMode,...legacy}={...DEFAULT_AUDIO,color:'#A12B34',deviceId:'saved-mic'};
  const migrated=validateAudio({},legacy);
  assert.equal(migrated.colorMode,'single');assert.equal(migrated.color,legacy.color);
  const colorful=validateAudio({colorMode:'colorful'},migrated);
  assert.deepEqual(colorful,{...migrated,colorMode:'colorful'});
  assert.deepEqual(validateAudio({colorMode:'single'},colorful),migrated);
  assert.throws(()=>validateAudio({colorMode:'invalid'}));
  for(const label of ['颜色模式','单色','彩色','多种颜色随声音流动，安静时熄灭。'])assert(!/[\u3400-\u9fff]/.test(translate('en',label)));
});
test('all ten multicolor effects keep their brightness, rhythm, masks and silent decay',()=>{
  for(const {id:effect} of AUDIO_EFFECTS){
    const single=new AudioReactive(),colorful=new AudioReactive();let peakHues=0,frame;
    const config={...DEFAULT_AUDIO,effect,color:'#ffffff'};
    assert(colorful.render({...config,colorMode:'colorful'},-50).every(c=>c==='#000000'));
    single.render(config,-50);
    for(let now=0;now<2500;now+=50){
      const rms=now%400<100?0.6:0.04,sample={rms,bands:Array(8).fill(rms)};
      single.feed(sample);colorful.feed(sample);
      const mono=single.render(config,now);
      frame=colorful.render({...config,colorMode:'colorful'},now);
      const hues=new Set();
      frame.forEach((color,i)=>{
        assert.match(color,/^#[0-9a-f]{6}$/);
        const hsv=hexToHsv(color);
        assert.equal(hsv.v,hexToHsv(mono[i]).v,effect+' must preserve intensity and unlit keys');
        if(hsv.v>0.1)hues.add(Math.floor(hsv.h/30));
      });
      peakHues=Math.max(peakHues,hues.size);assert.equal(frame[83],'#000000');
      assert.equal(single.lastBeat,colorful.lastBeat);
    }
    assert(peakHues>=3,effect+' must show several hues together, not just cycle one whole-keyboard color');
    for(let now=2500;now<7000;now+=50)frame=colorful.render({...config,colorMode:'colorful'},now,true);
    assert(frame.every(c=>c==='#000000'),effect+' must still go dark without sound');
  }
});
test('multicolor spectrum assigns stable distinct hues to the eight frequency bands',()=>{
  const hues=[];
  for(let band=0;band<8;band++){
    const renderer=new AudioReactive();renderer.feed(input(0.8,band));
    const config={...DEFAULT_AUDIO,effect:'spectrum',colorMode:'colorful'};
    let frame;
    for(let now=0;now<=300;now+=50)frame=renderer.render(config,now);
    const lit=frame.filter(c=>hexToHsv(c).v>0.1).map(c=>hexToHsv(c).h);
    assert(lit.length>0);assert(lit.every(h=>Math.abs(h-(8+band*40))<1));hues.push(Math.round(lit[0]));
    const later=renderer.render(config,1000).filter(c=>hexToHsv(c).v>0.1);
    assert(later.every(c=>Math.abs(hexToHsv(c).h-hues[band])<1));
  }
  assert.equal(new Set(hues).size,8);
});
test('all ten audio effects handle silence, frequency placement, decay and unknown LED safely',()=>{
  assert.equal(AUDIO_EFFECTS.length,10);assert.equal(new Set(AUDIO_EFFECTS.map(e=>e.id)).size,10);
  for(const {id:effect,label,description} of AUDIO_EFFECTS){
    assert.equal(validateAudio({effect}).effect,effect);
    assert(!/[\u3400-\u9fff]/.test(translate('en',label)+translate('en',description)));
    const renderer=new AudioReactive(),settings={...DEFAULT_AUDIO,effect,color:'#ff0000'};
    assert(renderer.render(settings,0).every(c=>c==='#000000'));
    renderer.feed(input(0.6,7));
    let frame;
    for(let now=50;now<=350;now+=50)frame=renderer.render(settings,now);
    assert(frame.some(c=>c!=='#000000'),effect);assert.equal(frame[83],'#000000');
    assert(frame.every(c=>/^#[\da-f]{2}0000$/.test(c)),effect+' must preserve chosen hue');
    if(effect==='spectrum'){
      assert(layout.filter(k=>k.x<8).every(k=>frame[k.index]==='#000000'));
      assert(layout.filter(k=>k.x>12).some(k=>frame[k.index]!=='#000000'));
    }
    for(let now=400;now<4000;now+=50)frame=renderer.render(settings,now,true);
    assert(frame.every(c=>c==='#000000'),effect+' stale audio must fade to black');
  }
});
test('volume pulse preserves strong contrast in loud and quiet music instead of clipping flat',()=>{
  for(const peak of [0.06,0.6]){
    const renderer=new AudioReactive();let top=0,bottom=255;
    for(let now=0;now<8000;now+=50){
      const phase=now%1000;renderer.feed(input(phase<200?peak:peak*0.32));
      const brightness=parseInt(renderer.render({...DEFAULT_AUDIO,color:'#ffffff'},now)[0].slice(1,3),16);
      if(now>2000&&phase===150)top=Math.max(top,brightness);
      if(now>2000&&phase===600)bottom=Math.min(bottom,brightness);
    }
    assert(top>230,`peak ${peak}: strong beats should reach the chosen brightness (${top})`);
    assert(bottom<65,`peak ${peak}: softer passages should dim clearly (${bottom})`);
    assert(top-bottom>170,'the beat-to-pause contrast must remain visible');
  }
});
test('ten effects have distinct animated output and switching never revives old trails',()=>{
  const signatures=new Set();
  for(const {id:effect} of AUDIO_EFFECTS){
    const renderer=new AudioReactive(),frames=[];
    for(let now=0;now<2500;now+=50){const strong=now%700<150;renderer.feed(input(strong?0.5:0.04,Math.floor(now/700)%8));frames.push(renderer.render({...DEFAULT_AUDIO,effect},now).join(''))}
    assert(new Set(frames).size>8,effect+' should animate');signatures.add(frames.join('|'));
    for(let now=2500;now<=7000;now+=50)renderer.render({...DEFAULT_AUDIO,effect},now,true);
    assert(renderer.render({...DEFAULT_AUDIO,effect:'pulse'},7050,true).every(c=>c==='#000000'));
  }
  assert.equal(signatures.size,10,'effects must differ in movement or spatial pattern');
});
test('heart has two beat accents and bass/treble respond on separate halves',()=>{
  const heart=new AudioReactive();heart.feed(input(0.6));const peaks=[];
  for(let now=0;now<=400;now+=50){const frame=heart.render({...DEFAULT_AUDIO,effect:'heartbeat',color:'#ffffff'},now);assert(frame.filter(c=>c!=='#000000').length<=19);peaks.push(Math.max(...frame.map(c=>parseInt(c.slice(1,3),16))))}
  assert(peaks[2]>peaks[4]*2&&peaks[7]>peaks[4]*2,'two distinct heart beats');
  for(const band of [0,7]){
    const renderer=new AudioReactive();renderer.feed(input(0.8,band));let frame;
    for(let now=0;now<=300;now+=50)frame=renderer.render({...DEFAULT_AUDIO,effect:'split'},now);
    assert(layout.filter(k=>band===0?k.x+k.w/2>=8:k.x+k.w/2<8).every(k=>frame[k.index]==='#000000'));
    assert(frame.some(c=>c!=='#000000'));
  }
});
test('all effects can be changed live without restarting capture or overwriting source and color',async t=>{
  const s=await fakeService(t);await s.command({op:'connect'});await s.command(inventory);
  await s.command({op:'settings',settings:{audio:{source:'microphone',deviceId:'test-mic',color:'#0044ff'}}});
  await s.command({op:'audioStart'});const session=(await s.state()).audio.session;
  for(const {id:effect} of AUDIO_EFFECTS){
    assert.equal((await s.command({op:'settings',settings:{audio:{effect}}})).ok,true);
    await s.command({op:'audioPacket',session,status:'listening',...input(0.6)});
    const state=await s.state();assert.equal(state.audio.session,session);assert.equal(state.settings.audio.effect,effect);
    assert.equal(state.settings.audio.color,'#0044ff');assert.equal(state.audio.capture.deviceId,'test-mic');assert.equal(state.audio.capture.enabled,true);
  }
  await s.command({op:'audioStop'});assert.equal((await s.state()).audio.capture.enabled,false);
});
test('color modes switch live and return to the saved single color without restarting audio',async t=>{
  const s=await fakeService(t);await s.command({op:'connect'});await s.command(inventory);
  await s.command({op:'settings',settings:{audio:{color:'#ee0033',source:'microphone',deviceId:'test-mic'}}});
  await s.command({op:'audioStart'});const session=(await s.state()).audio.session;
  for(const colorMode of ['colorful','single']){
    assert.equal((await s.command({op:'settings',settings:{audio:{colorMode}}})).ok,true);
    await s.command({op:'audioPacket',session,status:'listening',...input(0.8)});
    const state=await until(s.state,x=>colorMode==='colorful'?new Set(x.colors.filter(c=>c!=='#000000')).size>3:x.colors[0]!== '#000000'&&new Set(x.colors.filter(c=>c!=='#000000')).size===1,'live color mode');
    assert.equal(state.audio.session,session);assert.equal(state.settings.audio.color,'#ee0033');
    assert.equal(state.audio.capture.deviceId,'test-mic');assert.equal(state.audio.capture.enabled,true);
    if(colorMode==='single')assert(Math.abs(hexToHsv(state.colors[0]).h-hexToHsv('#ee0033').h)<1);
  }
  await s.command({op:'audioStop'});
});
test('session gates stale data, host loss and sleep without persisting audio',()=>{
  let now=0;const audio=new AudioSession(()=>now);
  assert.throws(()=>audio.start(DEFAULT_AUDIO));audio.inventory(inventory);audio.start(DEFAULT_AUDIO);
  const session=audio.session;
  assert.equal(audio.ingest({session:'old',status:'listening',...input()}),false);
  audio.ingest({session,status:'listening',...input()});audio.suspend(true);
  assert.equal(audio.snapshot(DEFAULT_AUDIO).capture.enabled,false);
  assert.equal(audio.ingest({session,status:'listening',...input()}),false);
  audio.suspend(false);assert.equal(audio.snapshot(DEFAULT_AUDIO).capture.enabled,true);
  now=13000;assert(audio.expired());audio.stop();assert.equal(audio.snapshot(DEFAULT_AUDIO).capture.enabled,false);
});
test('real service integrates audio rendering, live edits, Codex lights and stop/scene/game handoffs',async t=>{
  const s=await fakeService(t);
  await s.command({op:'connect'});assert.equal((await s.command({op:'audioStart'})).ok,false);
  await s.command(inventory);await s.command({op:'settings',settings:{brightness:100,codexEnabled:true,codexAmbient:true,audio:{color:'#ff0000'}}});
  assert.equal((await s.command({op:'audioStart'})).ok,true);
  let state=await s.state();const session=state.audio.session;
  assert.equal(state.codex.keys.enabled,true,'task shortcuts stay enabled');
  await s.command({op:'audioPacket',session,status:'listening',...input(1)});
  state=await until(s.state,x=>x.colors[1]!=='#000000','audio output');
  assert(state.colors.every(c=>/^#[\da-f]{2}0000$/.test(c)),'Codex colors must not overlay audio');
  await s.command({op:'settings',settings:{audio:{color:'#00ff00'}}});
  await s.command({op:'audioPacket',session,status:'listening',...input(1)});
  state=await until(s.state,x=>x.colors[1].startsWith('#00')&&x.colors[1]!=='#000000','live color');
  await s.command({op:'play',colors:Array(84).fill('#010203'),animation:{effect:'static'}});
  assert.equal((await s.state()).audio.active,false);
  assert.equal((await s.command({op:'audioPacket',session,status:'listening',...input(1)})).result.accepted,false);
  await s.command({op:'audioStart'});await s.command({op:'gameStart',gameType:'snake',speed:3});
  state=await s.state();assert.equal(state.audio.active,false);assert.equal(state.playback.mode,'game');
  await s.command({op:'gameStop'});assert.equal((await s.state()).audio.active,false,'games must not silently restart recording');
  await s.command(inventory);await s.command({op:'audioStart'});await s.command({op:'audioStop'});
  state=await s.state();assert.equal(state.device.armed,false);assert.equal(state.audio.capture.enabled,false);
});
test('permission failure and disconnect end capture; duration sleep requires explicit wake',async t=>{
  const s=await fakeService(t);await s.command({op:'connect'});await s.command(inventory);
  await s.command({op:'settings',settings:{lightDurationMs:1000}});await s.command({op:'audioStart'});
  let state=await until(s.state,x=>x.lightPower.sleeping&&x.audio.status==='paused','audio sleep');
  assert.equal(state.audio.capture.enabled,false);assert(state.colors.every(c=>c==='#000000'));
  await s.command({op:'lightWake'});state=await until(s.state,x=>x.audio.capture.enabled,'audio wake');
  await s.command({op:'audioPacket',session:state.audio.session,status:'error',error:'microphonePermission'});
  state=await until(s.state,x=>!x.audio.active&&x.audio.error==='microphonePermission','permission failure');assert.equal(state.device.armed,false);
  await s.command({op:'settings',settings:{lightDurationMs:0,autoConnect:false}});await s.command({op:'audioStart'});
  await s.configure({disconnect:1});state=await until(s.state,x=>!x.audio.active,'disconnect stops audio');
  assert.equal(state.audio.error,'keyboardDisconnected');
});

test('silent native heartbeat stays connected without old RGB frames or automatic permission retries',()=>{
  let now=0;const audio=new AudioSession(()=>now);audio.inventory(inventory);audio.start(DEFAULT_AUDIO);const session=audio.session;
  for(now=1000;now<=20000;now+=1000){audio.inventory(inventory);audio.ingest({session,status:'listening'});assert.equal(audio.expired(),false);assert(audio.render(DEFAULT_AUDIO).every(c=>c==='#000000'))}
  audio.ingest({session,status:'error',error:'systemPermission'});assert(audio.expired());assert.equal(audio.snapshot(DEFAULT_AUDIO).capture.enabled,false);
  audio.ingest({session,status:'listening',...input()});assert.equal(audio.status,'error','late buffers cannot clear failure');
});
test('failed initial audio paint rolls back and never starts a different animation',async t=>{
  const s=await fakeService(t);await s.command(inventory);await s.configure({failPaint:1});
  assert.equal((await s.command({op:'audioStart'})).ok,false);
  await new Promise(r=>setTimeout(r,250));const state=await s.state();
  assert.equal(state.audio.active,false);assert.equal(state.audio.error,'lightingFailed');
  assert.equal(state.playback.playing,false);assert.equal(state.playback.mode,'idle');assert.equal(state.device.armed,false);
});
