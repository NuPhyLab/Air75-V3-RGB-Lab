import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CodexKeyGestures,PhysicalPressGate,resolveCodexShortcut,parseMacShortcut} from '../server/codex-shortcuts.mjs';
import {describeAction} from '../server/codex.mjs';

test('effective shortcuts respect custom bindings, disabled actions and recursive key conflicts',async t=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'nuphy-keymap-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const resolve=id=>resolveCodexShortcut(describeAction(id),{codexHome:home,blockedCodes:['F11']});
 assert.deepEqual(await resolve('toggleTerminal'),{keyCode:50,modifiers:['control'],code:'Backquote',accelerator:'Control+`',custom:false});
 await writeFile(path.join(home,'keybindings.json'),JSON.stringify([
  {command:'composer.startDictation',key:'Ctrl+Shift+D'},
  {command:'composer.startDictation',key:'F11'},
  {command:'composer.startVoiceMode',key:'Command+Shift+V'},
  {command:'toggleTerminal',key:null}
 ]));
 assert.equal((await resolve('dictation')).keyCode,2);
 assert.deepEqual((await resolve('voice')).modifiers,['command','shift']);
 await assert.rejects(resolve('toggleTerminal'),/停用/);
 await writeFile(path.join(home,'keybindings.json'),JSON.stringify([{command:'composer.startDictation',key:'F11'},{command:'composer.startDictation',key:'Ctrl+Shift+D'}]));
 await assert.rejects(resolve('dictation'),/冲突/,'hold listener cannot silently use a secondary shortcut');
 await writeFile(path.join(home,'keybindings.json'),'broken');
 await assert.rejects(resolve('voice'),/无法读取/);
 assert.equal(parseMacShortcut('Control+Control+D'),null);
 assert.equal(parseMacShortcut('Command+K Command+D'),null);
});

test('dictation holds until matching release, releases before another action and never repeats keydown',async t=>{
 const sent=[];
 const keys=new CodexKeyGestures({send:async request=>{sent.push(request);return {sent:true};},resolve:async action=>parseMacShortcut(action.keys.join('+'))});
 t.after(()=>keys.release());
 const dictate=describeAction('dictation');
 await assert.rejects(keys.execute(dictate),/按住/);
 assert.equal(sent.length,0);
 await keys.execute(dictate,{phase:'down',source:'F9'});
 assert.equal(sent.at(-1).phase,'down');assert.equal(keys.held.source,'F9');
 await keys.execute(dictate,{phase:'down',source:'F9'});assert.equal(sent.length,1);
 await keys.release('F10');assert.equal(sent.length,1);
 await keys.release('F9');assert.equal(sent.at(-1).phase,'up');assert.equal(keys.held,null);
 await keys.execute(dictate,{phase:'down',source:'KeyA'});
 await keys.execute(describeAction('voice'),{phase:'down',source:'F10'});
 assert.deepEqual(sent.slice(-2).map(x=>x.phase),['up','tap']);assert.equal(keys.held,null);
});

test('new global dictation overrides retired composer bindings and uses a complete global hold',async t=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'nuphy-keymap-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const file=path.join(home,'keybindings.json');
 const old=[{command:'composer.startDictation',key:'F11'}];
 const resolve=()=>resolveCodexShortcut(describeAction('dictation'),{codexHome:home,blockedCodes:['F9','F11']});
 await writeFile(file,JSON.stringify([...old,{command:'globalDictationHold',key:'Control+Shift+D'}]));
 const resolved=await resolve();
 assert.equal(resolved.delivery,'globalHold');assert.equal(resolved.keyCode,2);
 assert.deepEqual(resolved.modifiers,['control','shift']);
 const sent=[];const gestures=new CodexKeyGestures({send:async value=>{sent.push(value);return {sent:true};},resolve});
 await gestures.execute(describeAction('dictation'),{phase:'down',source:'F9'});
 await gestures.release('F9');
 assert.equal(sent[0].delivery,'globalHold');assert.deepEqual(sent.map(x=>x.phase),['down','up']);
 assert.equal(gestures.held,null);
 await writeFile(file,JSON.stringify([...old,{command:'globalDictationHold',key:null}]));
 await assert.rejects(resolve(),/停用/,'explicitly disabled global binding never falls back');
 await writeFile(file,JSON.stringify([...old,{command:'globalDictationHold',key:'F9'}]));
 await assert.rejects(resolve(),/冲突/,'global forwarding cannot re-enter a bound source key');
 await writeFile(file,JSON.stringify([...old,{command:'globalDictationHold',key:'Fn'}]));
 assert.equal((await resolve()).modifierOnly,true);
 assert.deepEqual(parseMacShortcut('Control+Shift',{allowBareModifiers:true}),{keyCode:56,modifiers:['control','shift'],code:'Modifiers',modifierOnly:true});
 assert.equal(parseMacShortcut('Control+Shift'),null,'ordinary commands cannot become bare modifier holds');
 assert.equal(parseMacShortcut('Control+Ctrl',{allowBareModifiers:true}),null);
});

test('failed native release clears stale local hold so future commands can recover',async()=>{
 let broken=false;
 const keys=new CodexKeyGestures({send:async()=>{if(broken)throw new Error('helper exited');return {sent:true};},resolve:async()=>({keyCode:2,modifiers:['control','shift']})});
 await keys.execute(describeAction('dictation'),{phase:'down',source:'F9'});
 broken=true;await assert.rejects(keys.release(),/helper exited/);assert.equal(keys.held,null);
 broken=false;await keys.execute(describeAction('voice'));assert.equal(keys.held,null);
});

test('tap-to-dictate sends one complete tap per press; key-up never toggles again',async t=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'nuphy-dictation-toggle-'));t.after(()=>rm(home,{recursive:true,force:true}));
 await writeFile(path.join(home,'keybindings.json'),JSON.stringify([
  {command:'globalDictationHold',key:null},
  {command:'globalDictationSingleTap',key:'Ctrl+Shift+D'},
  {command:'composer.startDictation',key:'F11'},
 ]));
 const sent=[];const action=describeAction('dictation');
 const gesture=new CodexKeyGestures({resolve:a=>resolveCodexShortcut(a,{codexHome:home}),send:async request=>{sent.push(request);return {sent:true};}});
 assert.equal((await gesture.inspectDictation(action)).mode,'toggle');
 await gesture.execute(action,{phase:'down',source:'F9'});
 await gesture.execute(action,{phase:'up',source:'F9'});
 assert.equal(sent.length,1);assert.equal(sent[0].delivery,'globalTap');assert.equal(sent[0].phase,'tap');
 assert.equal(gesture.held,null,'toggle mode never invents a held key or recording state');
 await gesture.execute(action,{phase:'down',source:'F9'});
 await gesture.release();
 assert.deepEqual(sent.map(x=>x.phase),['tap','tap'],'mode shutdown/release cannot accidentally restart dictation');
 await gesture.execute(action,{source:'button'});
 assert.equal(sent.length,3,'button uses the same toggle path');
});

test('a focus-transition duplicate cannot open and immediately close a toggle',()=>{
 let now=1000;const gate=new PhysicalPressGate(()=>now);
 assert.equal(gate.down('F11'),true);
 assert.equal(gate.down('F11'),false);
 gate.up('F11');now+=30;
 assert.equal(gate.down('F11'),false);gate.up('F11');
 now+=300;assert.equal(gate.down('F11'),true);
 gate.reset();assert.equal(gate.down('F11'),true);
});
