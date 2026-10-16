import test from "node:test";
import assert from "node:assert/strict";
import { fakeService } from "./helpers/fake-service.mjs";
import { heart } from "../shared/layout.mjs";

const denied = {
  inputMonitoring: false,
  accessibility: false,
  canPostEvents: false,
  promptsRequested: false,
};
const lightingSnapshot = state => ({
  connected: state.device.connected,
  armed: state.device.armed,
  recoveryPending: state.device.recoveryPending,
  hardwareState: state.device.state,
  colors: state.colors,
  playback: state.playback,
  trigger: state.trigger,
  game: state.game,
  settings: state.settings,
  scenes: state.scenes,
});

test("both permission settings and permission refresh work while the keyboard is disconnected", async t => {
  const service = await fakeService(t, { permissions: denied });
  assert.equal((await service.command({ op: "disconnect" })).ok, true);
  const before = await service.state();
  const start = (await service.operations()).length;
  assert.equal(before.device.connected, false);
  for (const permission of ["inputMonitoring", "accessibility"]) {
    const response = await service.command({ op: "openPermissionSettings", permission });
    assert.equal(response.status, 200);
    assert.deepEqual(response.result, { opened: true, permission, permissions: denied });
  }
  const refreshed = await service.command({ op: "refreshPermissions" });
  assert.equal(refreshed.ok, true);
  assert.deepEqual(refreshed.result, denied);
  const after = await service.state();
  assert.deepEqual(after.native, denied);
  assert.deepEqual(after.device.permissions, denied);
  assert.deepEqual(lightingSnapshot(after), lightingSnapshot(before));
  assert.deepEqual(
    (await service.operations()).slice(start).map(({ op }) => op).filter(op=>!["status","bluetoothDevices"].includes(op)),
    ["openPermissionSettings", "openPermissionSettings", "permissions"],
  );
});

test("permission actions leave an armed static scene and all lighting settings unchanged", async t => {
  const service = await fakeService(t);
  const preview = await service.command({ op: "preview", colors: heart() });
  assert.equal(preview.ok, true);
  const before = await service.state();
  const start = (await service.operations()).length;
  assert.equal(before.device.armed, true);
  assert.equal((await service.command({
    op: "openPermissionSettings",
    permission: "inputMonitoring",
    url: "file:///untrusted-path",
  })).ok, true);
  assert.equal((await service.command({ op: "refreshPermissions" })).ok, true);
  assert.deepEqual(lightingSnapshot(await service.state()), lightingSnapshot(before));
  const forwarded = (await service.operations()).slice(start);
  // The global idle timer polls independently while a static scene is armed.
  // This read-only query is allowed; permission actions must still never paint.
  assert(forwarded.every(({ op }) => ["openPermissionSettings", "permissions", "status", "bluetoothDevices", "systemIdle"].includes(op)),JSON.stringify(forwarded));
  const { id, ...nativeRequest } = forwarded.find(({ op }) => op === "openPermissionSettings");
  assert(Number.isInteger(id));
  assert.deepEqual(nativeRequest, {
    op: "openPermissionSettings",
    permission: "inputMonitoring",
  });
});

test("permission settings reject all values outside the two-entry whitelist before forwarding", async t => {
  const service = await fakeService(t);
  await service.command({ op: "disconnect" });
  const start = (await service.operations()).length;
  const before = lightingSnapshot(await service.state());
  for (const permission of [undefined, null, "", "InputMonitoring", "microphone", "__proto__", "constructor", 1, ["inputMonitoring"], { permission: "accessibility" }]) {
    const response = await service.command({ op: "openPermissionSettings", permission });
    assert.equal(response.status, 400);
    assert.equal(response.ok, false);
    assert.match(response.error, /不支持这个权限设置/);
  }
  const operations = (await service.operations()).slice(start);
  assert(operations.every(({ op }) => ["status","bluetoothDevices"].includes(op)), "invalid values must never reach an open, connect, or lighting operation");
  assert.deepEqual(lightingSnapshot(await service.state()), before);
});

test("refreshPermissions returns the latest native snapshot and updates both state views", async t => {
  const service = await fakeService(t, { permissions: denied });
  await service.command({ op: "disconnect" });
  const initial = await service.command({ op: "refreshPermissions" });
  assert.deepEqual(initial.result, denied);
  const granted = {
    inputMonitoring: true,
    accessibility: true,
    canPostEvents: true,
    promptsRequested: false,
  };
  await service.configure({ permissions: granted });
  const response = await service.command({ op: "refreshPermissions" });
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, granted);
  const current = await service.state();
  assert.deepEqual(current.native, granted);
  assert.deepEqual(current.device.permissions, granted);
  assert.equal(current.device.connected, false);
  assert.equal(current.device.armed, false);
  const revoked = { ...granted, inputMonitoring: false, canPostEvents: false };
  await service.configure({ permissions: revoked });
  const reopened = await service.command({ op: "openPermissionSettings", permission: "accessibility" });
  assert.deepEqual(reopened.result.permissions, revoked);
  assert.deepEqual((await service.state()).native, revoked);
});
