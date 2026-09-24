import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { Hardware, hardwareErrorMessage } from "../server/hardware.mjs";
import { translate } from "../shared/i18n.mjs";

test("lighting errors give a usable next step and never falsely report restoration", () => {
  const detail = "D5 mismatch: expected [21,100], observed [0,0].";
  const off = hardwareErrorMessage("LIGHTING_DISABLED", detail);
  assert.match(off, /Fn＋↑/);
  assert.doesNotMatch(off, /D5|\[|STATE_VERIFY/);
  assert.match(translate("en", off), /Press Fn/);
  const failed = hardwareErrorMessage("STATE_VERIFY_FAILED", detail);
  assert.doesNotMatch(failed, /已恢复/);
  const restored = hardwareErrorMessage("STATE_VERIFY_FAILED", detail + " Original lighting was restored and verified.");
  assert.match(restored, /已恢复/);
  assert.match(translate("en", restored), /original lighting has been restored/);
  const pending = hardwareErrorMessage("RESTORE_REQUIRED", detail);
  assert.match(pending, /尚未恢复/);
  assert.doesNotMatch(pending, /已恢复/);
  assert.equal(hardwareErrorMessage("UNKNOWN", "keep this diagnostic"), "keep this diagnostic");
});

// This executable is a JSONL simulator. It does not import IOKit, launch the
// native helper, enumerate USB, post application keys, or touch a real backup.
async function fakeHardware(t, configuration = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "air-studio-fake-hardware-"));
  const binary = path.join(dir, "fake-helper");
  const backup = path.join(dir, "test-configuration.json");
  await writeFile(backup, JSON.stringify(configuration));
  await writeFile(
    binary,
    `#!${process.execPath}
import {createInterface} from 'node:readline';
import {readFileSync,appendFileSync} from 'node:fs';
const file=process.argv[process.argv.indexOf('--backup')+1];
const config=JSON.parse(readFileSync(file,'utf8'));
let connected=false,armed=false,pending=Boolean(config.recoveryPending),restoreAttempts=0;
const answer=(message,result)=>process.stdout.write(JSON.stringify({id:message.id,ok:true,result})+'\\n');
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{
 const message=JSON.parse(line);appendFileSync(file+'.log',message.op+'\\n');
 const state=()=>({connected,armed,recoveryPending:pending,needsRestore:pending,firmware:[16,0,1,170,6,0,0,0],firmwareVersion:'1.0.16.6',ledCount:104,capabilities:{perKey:true},error:null});
 switch(message.op){
  case 'connect':connected=true;answer(message,state());break;
  case 'status':answer(message,state());break;
  case 'arm':if(pending&&!armed){process.stdout.write(JSON.stringify({id:message.id,ok:false,error:{code:'RECOVERY_REQUIRED',message:'A previous lighting backup exists.'}})+'\\n');break;}armed=true;pending=true;answer(message,state());break;
  case 'paint':setTimeout(()=>answer(message,{painted:84}),config.paintDelay??0);break;
  case 'restoreKeys':if(config.keyRestoreError){process.stdout.write(JSON.stringify({id:message.id,ok:false,error:{message:'simulated key restoration failed'}})+'\\n');}else answer(message,{restored:true});break;
  case 'restore':if(config.restoreError||++restoreAttempts<=(config.restoreFailures??0)){process.stdout.write(JSON.stringify({id:message.id,ok:false,error:{code:'STATE_VERIFY_FAILED',message:'simulated restoration failed'}})+'\\n');}else{armed=false;if(!config.unverifiedRestore)pending=false;answer(message,{...(config.minimalRestore?{}:state()),restored:!config.unverifiedRestore,verified:!config.unverifiedRestore});}break;
  case 'disconnect':connected=false;answer(message,state());break;
  case 'simulateRemoval':connected=false;armed=false;process.stdout.write(JSON.stringify({event:'disconnected',needsRestore:pending})+'\\n');answer(message,{});break;
  case 'quit':answer(message,{quitting:true});setTimeout(()=>{if(config.finalKeyError)process.stdout.write(JSON.stringify({event:'keyRestoreFailed',error:config.finalKeyError})+'\\n');if(config.finalDiagnostic)process.stderr.write(config.finalDiagnostic+'\\n');process.exit(config.quitExit??0);},config.quitDelay??40);break;
  default:answer(message,{});
 }
});
`,
  );
  await chmod(binary, 0o700);
  const hardware = new Hardware(binary, backup);
  t.after(async () => {
    if (hardware.child) {
      const child = hardware.child;
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  });
  return {
    hardware,
    operations: async () =>
      (await readFile(backup + ".log", "utf8")).trim().split("\n"),
  };
}

test("reconnect restores an existing backup before allowing another arm", async (t) => {
  const { hardware, operations } = await fakeHardware(t, {
    recoveryPending: true,
  });
  const result = await hardware.connect();
  assert.equal(result.connected, true);
  assert.equal(result.recoveryPending, false);
  await hardware.arm();
  assert.deepEqual((await operations()).slice(0, 5), [
    "connect",
    "restore",
    "status",
    "status",
    "arm",
  ]);
  await hardware.close();
});

test("failed recovery retains device identity and later recovery clears the error immediately", async (t) => {
  const { hardware } = await fakeHardware(t, { recoveryPending: true, restoreFailures: 1, minimalRestore: true });
  await assert.rejects(hardware.connect());
  for (const state of [hardware.state, await hardware.status()]) {
    assert.equal(state.connected, true);
    assert.equal(state.firmware, "1.0.16.6");
    assert.equal(state.ledCount, 104);
    assert.equal(state.capabilities.perKey, true);
    assert.equal(state.needsRestore, true);
    assert.equal(state.errorCode, "STATE_VERIFY_FAILED");
    assert.ok(state.error);
  }
  await hardware.restore();
  assert.equal(hardware.state.needsRestore, false);
  assert.equal(hardware.state.recoveryPending, false);
  assert.equal(hardware.state.error, null);
  assert.equal(hardware.state.errorCode, null);
  assert.equal(hardware.state.firmware, "1.0.16.6");
  await hardware.close();
});

test("unverified restoration never clears pending recovery", async (t) => {
  const { hardware } = await fakeHardware(t, { recoveryPending: true, unverifiedRestore: true });
  await assert.rejects(hardware.connect(), /校验/);
  assert.equal(hardware.state.recoveryPending, true);
  assert.equal(hardware.state.connected, true);
});
test("play retries unfinished recovery after USB identification instead of surfacing RECOVERY_REQUIRED",async t=>{
  const {hardware,operations}=await fakeHardware(t,{recoveryPending:true,restoreFailures:1});
  await assert.rejects(hardware.connect());
  assert.equal(hardware.state.connected,true);
  await hardware.arm();
  assert.equal(hardware.state.armed,true);assert.equal(hardware.state.error,null);
  assert.deepEqual((await operations()).slice(-3),['status','restore','arm']);
  await hardware.close();
});
test("failed or unverified pending recovery prevents any new arm",async t=>{
  for(const config of [{restoreError:true},{unverifiedRestore:true}]){
    const {hardware,operations}=await fakeHardware(t,{recoveryPending:true,...config});
    await assert.rejects(hardware.connect());await assert.rejects(hardware.arm());
    assert.equal((await operations()).includes('arm'),false);assert.equal(hardware.state.armed,false);
  }
});
test("quit after unplug defers lighting to the helper without trying to write to an absent device",async t=>{
  const {hardware,operations}=await fakeHardware(t);
  await hardware.connect();await hardware.arm();await hardware.request('simulateRemoval');
  assert.equal(hardware.state.recoveryPending,true);
  await hardware.close();
  const ops=await operations();assert.deepEqual(ops.slice(ops.indexOf('simulateRemoval')+1),['restoreKeys','quit']);
});

test("a clean unplug does not invent a lighting recovery requirement", async (t) => {
  const { hardware } = await fakeHardware(t);
  await hardware.connect();
  await hardware.request("simulateRemoval");
  assert.equal(hardware.state.recoveryPending, false);
  assert.equal(hardware.state.needsRestore, false);
  await hardware.close();
});

test("status reconstructs firmware after stale UI metadata without losing the raw bytes", () => {
  const hardware = new Hardware("unused", "unused");
  const firmware = [17,2,1,170,1,2,0,0];
  hardware.updateState({ connected: true, firmware });
  assert.equal(hardware.state.firmware, "1.2.17.513");
  assert.deepEqual(hardware.state.firmwareBytes, firmware);
});

test("close drains the pending paint then restores and waits for helper exit", async (t) => {
  const { hardware, operations } = await fakeHardware(t, {
    paintDelay: 60,
    quitDelay: 60,
  });
  await hardware.connect();
  await hardware.arm();
  const paint = hardware.paint(Array(84).fill("#101010"));
  await Promise.all([paint, hardware.close()]);
  assert.equal(hardware.child, null);
  assert.deepEqual(await operations(), [
    "connect",
    "status",
    "arm",
    "paint",
    "restoreKeys",
    "restore",
    "quit",
  ]);
});

test("restoration failure propagates instead of reporting clean shutdown", async (t) => {
  const { hardware, operations } = await fakeHardware(t, {
    restoreError: true,
    quitExit: 2,
  });
  await hardware.connect();
  await hardware.arm();
  await assert.rejects(hardware.close());
  assert.ok((await operations()).includes("quit"));
});

test("quit failure is detected even if the JavaScript connection was already lost", async (t) => {
  const { hardware } = await fakeHardware(t, { quitExit: 2 });
  await hardware.connect();
  hardware.state.connected = false;
  await assert.rejects(hardware.close(), /退出|恢复|失败|exit|restore/i);
});

test("key restoration failure never skips lighting restoration and helper shutdown", async (t) => {
  const {hardware,operations}=await fakeHardware(t,{keyRestoreError:true});
  await hardware.connect();await hardware.arm();
  await assert.rejects(hardware.close(),/key restoration failed/);
  assert.deepEqual((await operations()).slice(-3),['restoreKeys','restore','quit']);
});

test("final key restore error is drained and reported separately from lighting", async (t) => {
  const {hardware}=await fakeHardware(t,{quitExit:2,finalKeyError:'KEY_MAPPING_RESTORE: function keys remain'});
  await hardware.connect();await hardware.arm();
  await assert.rejects(hardware.close(),/KEY_MAPPING_RESTORE: function keys remain/);
  assert.equal(hardware.restoreFailure,null);
});

test("unexpected helper exit includes its last diagnostic and exit status", async (t) => {
  const {hardware}=await fakeHardware(t,{quitExit:2,finalDiagnostic:'failed to remove key mapping journal'});
  await hardware.connect();let diagnostic='';hardware.on('diagnostic',detail=>diagnostic+=detail);
  await assert.rejects(hardware.close(),/code=2.*failed to remove key mapping journal/);
  assert.match(diagnostic,/failed to remove key mapping journal/);
});

test("the native disconnected event immediately invalidates stale connected and armed state", async (t) => {
  const { hardware } = await fakeHardware(t);
  await hardware.connect();
  await hardware.arm();
  await hardware.request("simulateRemoval");
  assert.equal(hardware.state.connected, false);
  assert.equal(hardware.state.armed, false);
  await hardware.close();
});
