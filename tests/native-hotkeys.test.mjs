import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('native F row handles secondaryFn, ignores modified typing, deduplicates and restores pass-through when off',{skip:process.platform!=='darwin'},async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'nuphylab-hotkey-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=await readFile(new URL('../native/AppHost.swift',import.meta.url),'utf8');
  // Compile the production handler without starting NSApplication, installing
  // any event tap, posting events or reaching a downstream app/network.
  const body=source+`
let host=AppDelegate()
host.hotkeysEnabled=true;host.keyConfiguration=[("F11",103)]
func event(_ code:CGKeyCode=103,_ flags:CGEventFlags = .maskSecondaryFn,_ repeatValue:Int64=0)->CGEvent {
 let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:true)!
 e.flags=flags;e.setIntegerValueField(.keyboardEventAutorepeat,value:repeatValue);return e
}
func check(_ result:Bool,_ message:String){if !result{fatalError(message)}}
check(host.handleReservedKey(.keyDown,event()),"physical Fn-marked F11 captured")
check(host.handleReservedKey(.keyDown,event()),"duplicate delivery consumed")
check(host.handleReservedKey(.keyDown,event(103,.maskSecondaryFn,1)),"repeat consumed")
check(host.keyEventQueue.count==1,"one down only")
check(host.handleReservedKey(.keyUp,event(103,.maskControl)),"release even if modifier changed")
check(host.keyEventQueue.count==2 && host.heldHotkeys.isEmpty,"one complete gesture")
check(host.keyEventQueue.map{$0["phase"] as? String} == ["down","up"],"down then up")
for flags:CGEventFlags in [.maskCommand,.maskControl,.maskAlternate,.maskShift] {
 check(!host.handleReservedKey(.keyDown,event(103,flags)),"modified shortcut left intact")
}
check(!host.handleReservedKey(.keyDown,event(0)),"ordinary typing left intact")
host.keyConfiguration=[("KeyA",0)]
check(!host.handleReservedKey(.keyDown,event()),"unbound F11 restored")
host.keyConfiguration=[("F11",103)]
_ = host.handleReservedKey(.keyDown,event())
host.setHotkeysEnabled(false)
check(host.heldHotkeys.isEmpty && host.keyEventQueue.last?["phase"] as? String == "up","suspension releases hold")
check(!host.handleReservedKey(.keyDown,event()),"disabled capture passes through")
for (keyCode,code) in functionKeyCodes {
 host.keyEventQueue.removeAll();host.keyConfiguration=[(code,keyCode)];host.hotkeysEnabled=true
 check(host.handleReservedKey(.keyDown,event(CGKeyCode(keyCode))),"every configured F key is captured")
 check(host.handleReservedKey(.keyDown,event(CGKeyCode(keyCode),.maskSecondaryFn,1)),"held F key does not repeat")
 check(host.handleReservedKey(.keyUp,event(CGKeyCode(keyCode))),"F release is consumed")
 check(host.keyEventQueue.count==2 && host.keyEventQueue[0]["code"] as? String == code,"one action per configured F key")
 host.setHotkeysEnabled(false)
 check(!host.handleReservedKey(.keyDown,event(CGKeyCode(keyCode))),"mode off passes original F key through")
 check(!host.handleReservedKey(.keyUp,event(CGKeyCode(keyCode))),"mode off passes original F release through")
 check(host.keyEventQueue.count==2,"no command when mode is off")
}
print("native-hotkeys-passed")
`;
  const file=path.join(dir,'main.swift'),binary=path.join(dir,'check');await writeFile(file,body);
  await promisify(execFile)('swiftc',[file,decodeURIComponent(new URL('../native/AudioCapture.swift',import.meta.url).pathname),'-o',binary,'-framework','AppKit','-framework','WebKit','-framework','Carbon','-framework','AVFoundation','-framework','CoreAudio','-framework','Accelerate']);
  assert.match((await promisify(execFile)(binary,[])).stdout,/native-hotkeys-passed/);
});
