import test from "node:test";
import assert from "node:assert/strict";
import { fakeService, until } from "./helpers/fake-service.mjs";
import { heart, blank } from "../shared/layout.mjs";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const arm = (service, trigger = {}) => service.command({ op: "triggerArm", colors: heart(), trigger });

test("native trigger waits black, paints exactly three pulses, and remains armed black after finishing", async t => {
  const service = await fakeService(t);
  await service.command({ op: "settings", settings: { brightness: 100, codexEnabled: true, quotaSideEnabled: true } });
  assert.equal((await arm(service, { count: 3, intervalMs: 200 })).ok, true);
  let state = await service.state();
  assert.equal(state.trigger.monitor, "global");
  assert.deepEqual(state.colors, blank());
  assert.equal(state.device.state[10], 0);
  const before = (await service.operations()).length;
  await service.configure({ trigger: 1 });
  await until(service.state, s => s.trigger.flashing, "native event did not start flash");
  await service.configure({ trigger: 2 });
  await until(service.state, s => s.trigger.completed === 3 && !s.trigger.flashing, "flash did not finish black");
  const frames = (await service.operations()).slice(before).filter(op => op.op === "paint").map(op => op.colors);
  assert.deepEqual(frames, [heart(), blank(), heart(), blank(), heart(), blank()]);
  state = await service.state();
  assert.equal(state.trigger.armed, true);
  assert.equal(state.playback.playing, false);
  assert.equal(state.playback.mode, "trigger");
  assert.deepEqual(state.colors, blank());
  assert.equal(state.device.state[10], 0);
  await service.configure({ trigger: 3 });
  await until(service.state, s => s.trigger.flashing, "second completed session did not retrigger");
  assert.equal((await service.command({ op: "triggerStop" })).ok, true);
  state = await service.state();
  assert.equal(state.trigger.armed, false);
  assert.equal(state.trigger.monitor, "off");
  assert.equal(state.device.armed, false);
  assert.equal(state.device.state[10], 65);
});

test("window fallback is explicit, matches the configured key and has no native duplicate dispatch", async t => {
  const service = await fakeService(t, { denyMonitor: true });
  const result = await arm(service, { code: "KeyA", count: 1, intervalMs: 200 });
  assert.equal(result.ok, true);
  assert.equal(result.result.monitor, "window");
  assert.match(result.result.warning, /此窗口/);
  await service.command({ op: "triggerKey", code: "Space" });
  assert.equal((await service.state()).trigger.flashing, false);
  await service.command({ op: "triggerKey", code: "KeyA" });
  assert.equal((await service.state()).trigger.flashing, true);
  await until(service.state, s => !s.trigger.flashing, "fallback flash did not finish");
  await service.configure({ denyMonitor: false });
  await arm(service);
  await service.command({ op: "triggerKey", code: "Space" });
  assert.equal((await service.state()).trigger.flashing, false);
  await service.configure({ trigger: 1, triggerKeyCode: 0 });
  await delay(80);
  assert.equal((await service.state()).trigger.flashing, false);
});

test("trigger settings and each key's colors survive saving, and invalid settings cannot replace an active session", async t => {
  const service = await fakeService(t);
  const colors = heart("#abcdef");
  colors[24] = "#123456";
  const trigger = { code: "Enter", count: 5, intervalMs: 450 };
  const saved = await service.command({ op: "saveScene", scene: { name: "右侧爱心", colors, trigger } });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.result.savedScene.trigger, trigger);
  assert.deepEqual(saved.result.savedScene.colors, colors);
  await arm(service);
  for (const bad of [{ code: "MetaRight" }, { count: 0 }, { count: 21 }, { intervalMs: 199 }, { intervalMs: 2001 }]) {
    assert.equal((await arm(service, bad)).ok, false);
  }
  assert.equal((await service.command({ op: "triggerArm", colors: blank() })).ok, false);
  assert.equal((await service.state()).trigger.armed, true);
  assert.equal((await service.state()).trigger.config.code, "Space");
});

test("painting, animation and games release the trigger and stale key events cannot relight it", async t => {
  const service = await fakeService(t);
  await service.command({ op: "settings", settings: { brightness: 100 } });
  await arm(service);
  await service.command({ op: "gameStart", gameType: "whack" });
  let state = await service.state();
  assert.equal(state.trigger.armed, false);
  assert.equal(state.trigger.monitor, "off");
  assert.equal(state.game.status, "running");
  await arm(service);
  assert.equal((await service.state()).game.status, "idle");
  const artwork = heart("#aaffcc");
  await service.command({ op: "preview", colors: artwork });
  await service.configure({ trigger: 1 });
  await delay(100);
  state = await service.state();
  assert.equal(state.trigger.armed, false);
  assert.deepEqual(state.colors, artwork);
  await arm(service);
  await service.command({ op: "play", colors: artwork, animation: { effect: "pulse" } });
  state = await service.state();
  assert.equal(state.trigger.monitor, "off");
  assert.equal(state.playback.mode, "animation");
});

test("disconnect and output failure cancel triggering; reconnect requires explicit re-enable", async t => {
  const service = await fakeService(t);
  await service.command({ op: "settings", settings: { autoConnect: false } });
  await arm(service);
  await service.command({ op: "triggerFire" });
  await service.configure({ disconnect: 1 });
  await until(service.state, s => !s.device.connected && !s.trigger.armed, "disconnect left trigger armed");
  await service.command({ op: "connect" });
  assert.equal((await service.state()).trigger.armed, false);
  assert.equal((await service.state()).device.armed, false);
  await arm(service);
  await service.configure({ failPaint: 1 });
  assert.equal((await service.command({ op: "triggerFire" })).ok, false);
  const failed = await service.state();
  assert.equal(failed.trigger.armed, false);
  assert.equal(failed.trigger.monitor, "off");
  assert.equal(failed.device.armed, false);
  assert.equal(failed.playback.playing, false);
  assert.deepEqual(failed.colors, blank());
  assert.match(failed.playback.lastError, /paint failure/);
  assert.match(failed.trigger.warning, /输出中断/);
  assert.equal((await arm(service)).ok, true);
});
