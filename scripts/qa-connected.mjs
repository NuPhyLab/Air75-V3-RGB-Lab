// Explicit opt-in integration check for an already running Air Studio QA server.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { blank, heart } from "../shared/layout.mjs";
const runtime = process.argv[2];
if (!runtime) throw new Error("Pass the QA runtime.json path");
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
async function until(fn, timeout = 7000) {
  const at = Date.now();
  while (Date.now() - at < timeout) {
    const s = await state();
    if (await fn(s)) return s;
    await delay(100);
  }
  throw new Error("Timed out waiting for expected state");
}
const results = [];
const initial = await state();
assert(initial.device.connected);
const original = initial.device.originalState;
const settings = initial.settings;
try {
  const denied = await fetch(r.url + "/api/state");
  assert.equal(denied.status, 403);
  results.push("local API rejects missing token");
  await command("stop");
  await command("settings", {
    settings: { codexEnabled: false, quotaSideEnabled: false },
  });
  await command("settings", {
    settings: { codexEnabled: false, quotaSideEnabled: true, brightness: 25 },
  });
  const side = await until((s) => s.device.sideColor !== null);
  assert.equal(side.device.armed, false);
  await delay(4200);
  assert.deepEqual(
    (await state()).device.state.slice(0, 9),
    original.slice(0, 9),
  );
  results.push(
    "quota-only side update preserves original main effect without arming it",
  );
  await command("gameStart", { speed: 4 });
  await command("gameStop");
  const returned = await until((s) => s.device.sideColor !== null);
  assert.equal(returned.device.armed, false);
  assert.equal(returned.playback.mode, "idle");
  assert.deepEqual(returned.colors, blank());
  results.push(
    "ending a game from quota-only mode restores idle canvas and resumes the prior side light",
  );
  await command("stop");
  await delay(200);
  assert.equal((await state()).device.sideColor, null);
  results.push("stop suspends quota updates and restores original lighting");
  await command("settings", {
    settings: { quotaSideEnabled: false, brightness: 25 },
  });
  const pattern = blank().map(
    (_, i) =>
      "#" +
      [(i * 3) % 256, (i * 5) % 256, (i * 7) % 256]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join(""),
  );
  await command("preview", { colors: pattern });
  const expected = (await state()).colors;
  const read = await command("readColors");
  assert.deepEqual(read.colors.slice(0, 84), expected);
  results.push("API → helper → all 84 RGB channels exact readback");
  await command("play", {
    colors: heart(),
    animation: { effect: "move", direction: "right", speed: 4, loop: true },
  });
  await delay(600);
  await command("pause");
  const paused = await state();
  assert.equal(paused.playback.mode, "paused");
  await delay(500);
  assert.deepEqual((await state()).colors, paused.colors);
  await command("pause");
  await delay(400);
  assert.equal((await state()).playback.playing, true);
  results.push("moving heart pauses without advancing and resumes");
  const frames = [
    { duration: 100, colors: heart("#802020") },
    { duration: 100, colors: heart("#204020") },
  ];
  await command("play", {
    colors: heart(),
    animation: { effect: "frames", loop: false, frames },
  });
  await delay(450);
  const ended = await state();
  assert.equal(ended.playback.playing, false);
  assert.equal(ended.playback.mode, "paused");
  results.push("finite frame animation finishes on its final frame");
  await command("gameStart", { speed: 10 });
  await command("gameInput", { direction: "constructor" });
  const over = await until((s) => s.game.status === "over");
  assert.equal(over.playback.playing, false);
  await command("gameStop");
  assert.equal((await state()).playback.mode, "paused");
  results.push(
    "Snake collision stops playback; end restores the suspended work",
  );
  const saved = await command("saveScene", {
    scene: {
      name: "自动验证作品",
      colors: heart(),
      animation: { effect: "move", direction: "right", speed: 4, loop: true },
    },
  });
  assert((await state()).scenes.some((s) => s.id === saved.savedScene.id));
  await command("deleteScene", { id: saved.savedScene.id });
  results.push("save and delete persist through the API");
  await command("stop");
  await command("disconnect");
  await command("connect");
  assert.deepEqual((await state()).device.state, original);
  results.push(
    "disconnect/reconnect confirms exact original 17-byte lighting state",
  );
} finally {
  await command("stop");
  await command("settings", { settings });
  await command("stop");
}
await writeFile(
  new URL("../docs/integration-qa-results.json", import.meta.url),
  JSON.stringify(
    { date: new Date().toISOString(), passed: results.length, results },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
