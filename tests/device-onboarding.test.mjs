import test from "node:test";
import assert from "node:assert/strict";
import { fakeService, until } from "./helpers/fake-service.mjs";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test("fresh profile waits quietly, connects on plug-in, and reconnects on replug", {timeout:15000}, async t=>{
  const s=await fakeService(t,{skipInitialConnect:true,present:false});
  await until(s.state,x=>x.device.errorCode==="DEVICE_NOT_FOUND","initial device scan did not run");
  let state=await s.state();
  assert.equal(state.device.error,null); assert.equal(state.device.autoConnecting,true);
  assert.equal(state.settings.autoConnect,true); assert.equal(state.scenes.length,0);
  await s.configure({present:true});
  state=await until(s.state,x=>x.device.connected&&x.firmware.status==="current","plug-in did not auto-connect",5000);
  assert.equal(state.device.armed,false); assert.equal(state.playback.framesSent,0);
  await s.configure({present:false,disconnect:1});
  await until(s.state,x=>!x.device.connected,"unplug not detected");
  await s.configure({present:true});
  await until(s.state,x=>x.device.connected,"replug did not auto-connect",5000);
});
test("old firmware is identified and gets an update reminder without lighting writes", async t=>{
  const s=await fakeService(t,{firmwareVersion:"1.0.14.6",compatible:false});
  const state=await until(s.state,x=>x.firmware.status==="updateAvailable","old firmware was not compared");
  assert.equal(state.device.connected,true); assert.equal(state.device.firmware,"1.0.14.6");
  assert.equal(state.firmware.compatible,false);
  const preview=await s.command({op:"preview",colors:Array(84).fill("#010101")});
  assert.equal(preview.ok,false);
  assert.ok(!(await s.operations()).some(x=>["paint","arm"].includes(x.op)));
});
test("updater handoff restores lighting, releases USB and pauses automatic reconnect", {timeout:10000}, async t=>{
  const s=await fakeService(t);
  await s.command({op:"preview",colors:Array(84).fill("#010101")});
  const opened=await s.command({op:"prepareFirmwareUpdate"});
  assert.equal(opened.ok,true); assert.equal(opened.result.url,"https://drive.nuphy.io/?lang=zh-CN");
  const operations=await s.operations();
  const end=operations.findLastIndex(x=>x.op==="disconnect");
  assert.ok(operations.slice(0,end).some(x=>x.op==="restore"));
  await delay(2300);
  const paused=await s.state(); assert.equal(paused.device.connected,false); assert.equal(paused.device.connectionPaused,true);
  const connectCount=(await s.operations()).filter(x=>x.op==="connect").length;
  await delay(100); assert.equal((await s.operations()).filter(x=>x.op==="connect").length,connectCount);
  assert.equal((await s.command({op:"connect"})).ok,true);
  assert.equal((await s.state()).device.connectionPaused,false);
});
test("reconnecting after firmware update reads the new version and clears its reminder", async t=>{
  const s=await fakeService(t,{firmwareVersion:"1.0.14.6",compatible:false});
  await until(s.state,x=>x.firmware.status==="updateAvailable","missing update reminder");
  await s.command({op:"prepareFirmwareUpdate"});
  await s.configure({firmwareVersion:"1.0.16.6",compatible:true});
  await s.command({op:"connect"});
  assert.equal((await s.state()).firmware.status,"current");
  assert.equal((await s.state()).firmware.compatible,true);
});
test("manual network recheck does not block playback or other device commands", async t=>{
  const s=await fakeService(t);
  await until(s.state,x=>x.firmware.status==="current","initial check failed");
  await s.configure({firmwareDelay:1200,firmwareOffline:true});
  const start=performance.now();
  await s.command({op:"checkFirmware"});
  assert.ok(performance.now()-start<600,"check held the hardware command queue");
  assert.equal((await s.state()).firmware.checking,true);
  assert.equal((await s.command({op:"preview",colors:Array(84).fill("#010101")})).ok,true);
  const state=await until(s.state,x=>x.firmware.status==="unavailable","offline check missing");
  assert.equal(state.device.connected,true); assert.equal(state.device.armed,true);
});
