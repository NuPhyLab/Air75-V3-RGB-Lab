import test from "node:test";
import assert from "node:assert/strict";
import { fakeService, until } from "./helpers/fake-service.mjs";

function assertArmedAndMutedBeforePaint(operations, event) {
  const eventAt = operations.findLastIndex((entry) => entry.event === event);
  assert.ok(eventAt >= 0, `expected injected event ${event}`);
  const after = operations.slice(eventAt + 1);
  const paintAt = after.findIndex((entry) => entry.op === "paint");
  const armAt = after.findIndex((entry) => entry.op === "arm");
  const muteAt = after.findIndex(
    (entry) =>
      entry.op === "side" &&
      entry.color === "#000000" &&
      entry.brightness === 0,
  );
  assert.ok(
    armAt >= 0 && muteAt > armAt && paintAt > muteAt,
    `expected arm → mute → paint after ${event}, got ${JSON.stringify(after)}`,
  );
}
test('unplug in Win then reconnect in Mac preserves Win recovery and allows a new scene',async t=>{
  const s=await fakeService(t,{lightingProfile:1});
  await s.command({op:'settings',settings:{autoConnect:false,codexEnabled:false}});
  await s.command({op:'connect'});
  const scene={op:'play',colors:Array(84).fill('#123456'),animation:{effect:'static'}};
  assert.equal((await s.command(scene)).ok,true);
  await s.configure({disconnect:1,present:false});
  await until(s.state,x=>!x.device.connected,'Win unplug');
  await s.configure({present:true,lightingProfile:0});
  assert.equal((await s.command({op:'connect'})).ok,true);
  let state=await s.state();assert.deepEqual(state.device.deferredProfiles,[1]);assert.equal(state.device.recoveryPending,false);
  assert.equal((await s.command(scene)).ok,true);
  assert.equal((await s.command({op:'verifyColors'})).result.matches,true);
  assert.equal((await s.command({op:'stop'})).ok,true);
  state=await s.state();assert.deepEqual(state.device.deferredProfiles,[1]);assert.equal(state.device.recoveryPending,false);
  await s.configure({disconnect:2,present:false});await until(s.state,x=>!x.device.connected,'Mac unplug');
  await s.configure({present:true,lightingProfile:1});assert.equal((await s.command({op:'connect'})).ok,true);
  state=await s.state();assert.equal(state.device.recoveryPending,false);assert.deepEqual(state.device.deferredProfiles,[]);
  const ops=await s.operations(),returned=ops.findLastIndex(x=>x.event==='simulatedDisconnect');
  assert(ops.slice(returned).some(x=>x.event==='simulatedRestore'&&x.lightingProfile===1),'returning to Win restores its own original before play');
  assert.equal((await s.command(scene)).ok,true);
});
test('unplug and automatic same-profile reconnect restores before the next animation frame',async t=>{
  const s=await fakeService(t);await s.command({op:'connect'});
  assert.equal((await s.command({op:'play',colors:Array(84).fill('#123456'),animation:{effect:'pulse',speed:3,loop:true}})).ok,true);
  await s.configure({disconnect:1,present:false});await until(s.state,x=>!x.device.connected,'unplug');
  await s.configure({present:true});await until(s.state,x=>x.device.connected&&x.device.armed,'automatic resume',8000);
  const ops=await until(s.operations,ops=>ops.slice(ops.findLastIndex(x=>x.event==='simulatedDisconnect')+1).some(x=>x.op==='paint'),'first resumed frame');
  const tail=ops.slice(ops.findLastIndex(x=>x.event==='simulatedDisconnect')+1);
  assert(tail.findIndex(x=>x.op==='restore')<tail.findIndex(x=>x.op==='arm'));
  assert(tail.findIndex(x=>x.op==='arm')<tail.findIndex(x=>x.op==='paint'));
  assert.equal((await s.state()).playback.lastError,null);
});

test("successful explicit restore clears the playback recovery warning", { timeout: 15000 }, async (t) => {
  const service = await fakeService(t);
  assert.equal((await service.command({ op: "gameStart", speed: 10 })).ok, true);
  await service.configure({ failPaint: 1 });
  await until(service.state, state => Boolean(state.playback.lastError), "playback failure was not surfaced");
  assert.equal((await service.command({ op: "restore" })).ok, true);
  const state = await service.state();
  assert.equal(state.playback.lastError, null);
  assert.equal(state.device.recoveryPending, false);
  assert.equal(state.device.needsRestore, false);
  assert.equal(state.device.firmware, "1.0.16.6");
});

test(
  "command paint rollback is reconciled before restarting the game",
  { timeout: 15000 },
  async (t) => {
    const service = await fakeService(t, { failPaint: 1 });
    const failed = await service.command({ op: "gameStart", speed: 1 });
    assert.equal(failed.ok, false);
    assert.match(failed.error, /simulated paint failure/);
    const restarted = await service.command({ op: "gameStart", speed: 1 });
    assert.equal(restarted.ok, true, JSON.stringify(restarted));
    assertArmedAndMutedBeforePaint(
      await service.operations(),
      "simulatedRollback",
    );
    const state = await service.state();
    assert.equal(state.device.armed, true);
    assert.equal(state.device.state[10], 0);
  },
);

test(
  "tick paint rollback pauses output and the next game start arms and mutes again",
  { timeout: 15000 },
  async (t) => {
    const service = await fakeService(t);
    assert.equal(
      (await service.command({ op: "gameStart", speed: 10 })).ok,
      true,
    );
    await service.configure({ failPaint: 1 });
    await until(
      service.state,
      (state) => state.playback.lastError?.includes("simulated paint failure"),
      "tick failure was not surfaced",
    );
    await until(
      service.state,
      (state) => !state.device.armed && !state.playback.playing,
      "tick rollback state was not reconciled",
    );
    const restarted = await service.command({ op: "gameStart", speed: 1 });
    assert.equal(restarted.ok, true, JSON.stringify(restarted));
    assertArmedAndMutedBeforePaint(
      await service.operations(),
      "simulatedRollback",
    );
  },
);

test(
  "a paused game reconnects with dark side lights and restores them when stopped",
  { timeout: 15000 },
  async (t) => {
    const service = await fakeService(t);
    assert.equal(
      (await service.command({ op: "gameStart", speed: 1 })).ok,
      true,
    );
    await service.command({ op: "gamePause" });
    await service.configure({ disconnect: 1, present: false });
    await until(
      service.state,
      (state) => !state.device.connected,
      "fake disconnect was not received",
    );
    await service.configure({ present: true });
    assert.equal((await service.command({ op: "connect" })).ok, true);
    assertArmedAndMutedBeforePaint(
      await service.operations(),
      "simulatedDisconnect",
    );
    const resumed = await service.state();
    assert.equal(resumed.game.status, "paused");
    assert.equal(resumed.device.state[10], 0);
    const lit = resumed.colors.flatMap((color, index) =>
      color === "#000000" ? [] : [index],
    );
    assert.deepEqual(
      lit.sort((a, b) => a - b),
      [...resumed.game.body, resumed.game.food].sort((a, b) => a - b),
    );
    assert.equal((await service.command({ op: "gameStop" })).ok, true);
    const stopped = await service.state();
    assert.equal(stopped.device.state[10], 65);
    assert.equal(stopped.game.status, "idle");
  },
);

test(
  "automatic reconnect reapplies an unchanged quota color after restoring the backup",
  { timeout: 15000 },
  async (t) => {
    const service = await fakeService(t);
    await service.command({
      op: "settings",
      settings: { quotaSideEnabled: true },
    });
    await until(
      service.state,
      (state) => state.device.sideColor === "#6f9e85",
      "initial mock quota color was not applied",
    );
    await service.configure({ disconnect: 1 });
    await until(
      service.operations,
      (ops) => ops.some((entry) => entry.event === "simulatedDisconnect"),
      "disconnect was not injected",
    );
    await until(
      service.operations,
      (ops) => {
        const after = ops.slice(
          ops.findLastIndex((entry) => entry.event === "simulatedDisconnect") +
            1,
        );
        return (
          after.some((entry) => entry.op === "restore") &&
          after.some(
            (entry) => entry.op === "side" && entry.color === "#6f9e85",
          )
        );
      },
      "same-color quota was not reapplied after automatic reconnect",
      8000,
    );
    const state = await service.state();
    assert.equal(state.device.sideColor, "#6f9e85");
    assert.equal(state.device.state[10], 50);
  },
);
