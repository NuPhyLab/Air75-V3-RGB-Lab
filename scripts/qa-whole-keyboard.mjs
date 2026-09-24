// Opt-in validation against a running QA service; temporarily changes and restores lights.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { heart, layout } from "../shared/layout.mjs";
const runtime = process.argv[2];
if (!runtime) throw new Error("Pass the running QA runtime.json path");
const r = JSON.parse(await readFile(runtime));
const headers = { "X-Air-Token": r.token, "Content-Type": "application/json" };
const state = () =>
  fetch(r.url + "/api/state", { headers }).then((r) => r.json());
async function command(op, args = {}) {
  const response = await fetch(r.url + "/api/command", {
    method: "POST",
    headers,
    body: JSON.stringify({ op, ...args }),
  });
  const v = await response.json();
  assert.equal(v.ok, true, v.error);
  return v.result;
}
const initial = await state();
assert(initial.device.connected, "keyboard connected");
const original = initial.device.originalState;
const results = [];
async function verifyDarkGame(label) {
  const s = await state();
  assert.equal(s.game.status, "paused");
  assert.equal(s.game.cellCount, 83);
  assert.equal(s.game.height, 6);
  const read = await command("readColors");
  assert.deepEqual(read.colors.slice(0, 84), s.colors);
  const active = new Set(
    [...s.game.body, s.game.food].filter((i) => i !== null),
  );
  for (let i = 0; i < 84; i++)
    assert.equal(
      read.colors[i] !== "#000000",
      active.has(i),
      `${label} LED ${i}`,
    );
  assert(
    read.colors.slice(84).every((color) => color === "#000000"),
    "all 20 side LEDs must be dark",
  );
  results.push({
    check: label,
    litMain: active.size,
    darkSide: 20,
    body: s.game.body,
    food: s.game.food,
  });
  return s;
}
try {
  await command("settings", {
    settings: { brightness: 25, codexEnabled: true, quotaSideEnabled: true },
  });
  await command("preview", { colors: heart() });
  await command("gameStart", { speed: 1 });
  await command("gamePause");
  const before = await verifyDarkGame(
    "only snake and food lit, with Codex integration enabled",
  );
  await command("settings", { settings: { quotaSideEnabled: false } });
  await command("settings", { settings: { quotaSideEnabled: true } });
  await delay(150);
  await verifyDarkGame(
    "quota setting changes cannot relight side LEDs during a game",
  );
  await command("gamePause");
  await delay(700);
  await command("gamePause");
  const after = await verifyDarkGame(
    "moving snake still leaves every other channel black",
  );
  assert.notDeepEqual(after.game.body, before.game.body);
  await command("gameStop");
  await delay(150);
  const ended = await state();
  assert.equal(ended.game.status, "idle");
  assert.equal(ended.playback.mode, "static");
  const restored = await command("readColors");
  assert.deepEqual(restored.colors.slice(0, 84), ended.colors);
  if (!ended.device.sideColor)
    assert.deepEqual(ended.device.state.slice(9), original.slice(9));
  results.push({
    check: "ending game restores prior artwork and original side settings",
    sideColor: ended.device.sideColor,
  });
  await command("stop");
  assert.deepEqual((await state()).device.state, original);
  results.push({
    check: "stop restores original 17-byte device lighting state exactly",
  });
  const apiLayout = await fetch(r.url + "/api/layout", { headers }).then((r) =>
    r.json(),
  );
  assert.deepEqual(apiLayout, layout);
  assert.equal(apiLayout.find((k) => k.index === 14).x, 14);
  assert.equal(apiLayout.find((k) => k.index === 14).code, "Insert");
  results.push({
    check:
      "real service exposes photo-aligned 16-unit geometry without remapping existing RGB indices",
  });
} finally {
  await command("stop");
  await command("settings", { settings: initial.settings });
  await command("stop");
}
const report = {
  date: new Date().toISOString(),
  firmware: initial.device.firmware,
  passed: results.length,
  results,
};
await writeFile(
  new URL("../docs/whole-keyboard-qa-results.json", import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
