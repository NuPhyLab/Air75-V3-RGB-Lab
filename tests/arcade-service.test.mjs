import test from "node:test";
import assert from "node:assert/strict";
import { fakeService, until } from "./helpers/fake-service.mjs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("all arcade games own lighting and return to the previous scene without changing it", async (t) => {
  const service = await fakeService(t);
  const colors = Array(84).fill("#000000");
  colors[20] = "#dc847b";
  colors[23] = "#6493d7";
  await service.command({ op: "settings", settings: { brightness: 100 } });
  await service.command({ op: "preview", colors });
  for (const gameType of ["whack", "memory", "pong", "snake"]) {
    const selected = await service.command({ op: "gameSelect", gameType });
    assert.equal(selected.result.type, gameType);
    const started = await service.command({ op: "gameStart", gameType, speed: 4 });
    assert.equal(started.ok, true, JSON.stringify(started));
    const running = await until(service.state,
      state => state.colors.some(color => color !== "#000000"),
      `${gameType} did not render its first visible frame`);
    assert.equal(running.game.type, gameType);
    assert.equal(running.playback.mode, "game");
    assert.equal(running.device.state[10], 0);
    assert.equal(running.colors[83], "#000000");
    assert.equal(running.colors.length, 84);
    assert.ok(running.colors.some(color => color !== "#000000"));
    assert.equal((await service.command({ op: "gameSelect", gameType: "pong" })).ok, false);
    await service.command({ op: "gameStop" });
    const stopped = await service.state();
    assert.equal(stopped.game.status, "idle");
    assert.equal(stopped.playback.mode, "static");
    assert.deepEqual(stopped.colors, colors);
    assert.equal(stopped.device.state[10], 65);
  }
});

test("arcade commands reject invalid types before changing the current session or hardware", async (t) => {
  const service = await fakeService(t);
  const before = (await service.operations()).length;
  for (const gameType of ["__proto__", "constructor", "missing", {}, null]) {
    assert.equal((await service.command({ op: "gameSelect", gameType })).ok, false);
  }
  for (const gameType of ["__proto__", "missing"]) {
    assert.equal((await service.command({ op: "gameStart", gameType })).ok, false);
  }
  assert.equal((await service.state()).game.type, "snake");
  assert.equal((await service.operations()).slice(before).some(op => op.op === "arm"), false);
  assert.equal((await service.command({ op: "gamePause", paused: "false" })).ok, false);
  assert.equal((await service.command({ op: "gameInput", code: {}, pressed: true })).ok, false);
});

test("whack input scores immediately, pause freezes time, and records stay separated by game", async (t) => {
  const service = await fakeService(t);
  await service.command({ op: "gameStart", gameType: "whack", speed: 1 });
  const first = (await service.state()).game;
  const hit = await service.command({ op: "gameInput", code: first.targetCode, pressed: true });
  assert.equal(hit.result.score, 1);
  assert.notEqual(hit.result.targetCode, first.targetCode);
  await service.command({ op: "gamePause", paused: true });
  const paused = (await service.state()).game;
  await service.command({ op: "gamePause", paused: true });
  await delay(180);
  assert.deepEqual((await service.state()).game, paused);
  await service.command({ op: "gameStop" });
  await service.command({ op: "gameSelect", gameType: "snake" });
  assert.equal((await service.state()).game.bestScore, 0);
  await service.command({ op: "gameSelect", gameType: "whack" });
  assert.equal((await service.state()).game.bestScore, 1);
});

test("pong releases both players on pause and disconnect and resumes only on request", async (t) => {
  const service = await fakeService(t);
  await service.command({ op: "gameStart", gameType: "pong", speed: 1 });
  await service.command({ op: "gameInput", code: "KeyW", pressed: true });
  await service.command({ op: "gameInput", code: "ArrowDown", pressed: true });
  await delay(150);
  await service.command({ op: "gamePause", paused: true });
  const paused = (await service.state()).game;
  assert.ok(paused.paddles.left < paused.paddles.right);
  await delay(120);
  assert.deepEqual((await service.state()).game, paused);
  await service.command({ op: "gamePause", paused: false });
  await delay(120);
  assert.deepEqual((await service.state()).game.paddles, paused.paddles);
  await service.configure({ disconnect: 1 });
  await until(service.state, state => state.game.status === "paused" && !state.device.connected, "disconnect did not pause pong");
  await service.command({ op: "connect" });
  const connected = await service.state();
  assert.equal(connected.game.status, "paused");
  assert.equal(connected.playback.playing, false);
  assert.equal(connected.device.state[10], 0);
});

test("record write failure leaves play and lighting responsive and reports an unsaved record", async (t) => {
  const service = await fakeService(t);
  await service.command({ op: "gameStart", gameType: "whack", speed: 1 });
  await mkdir(path.join(service.dataDir, "library.json.tmp"));
  const first = (await service.state()).game;
  const hit = await service.command({ op: "gameInput", code: first.targetCode });
  assert.equal(hit.ok, true);
  const state = await service.state();
  assert.equal(state.game.score, 1);
  assert.match(state.game.recordWarning, /暂未保存/);
  assert.equal(state.game.status, "running");
  assert.equal(state.playback.playing, true);
  assert.equal(state.colors[first.target], "#000000");
  assert.notEqual(state.colors[state.game.target], "#000000");
  await delay(150);
  assert.equal((await service.state()).game.status, "running");
});

test("ending a disconnected game defers its previous scene until reconnect, while explicit stop cancels it", async (t) => {
  const service = await fakeService(t);
  const colors = Array(84).fill("#000000");
  colors[20] = "#dc847b";
  await service.command({ op: "settings", settings: { brightness: 100, autoConnect: false } });
  await service.command({ op: "preview", colors });
  await service.command({ op: "gameStart", gameType: "memory" });
  await service.configure({ disconnect: 1 });
  await until(service.state, state => !state.device.connected && state.game.status === "paused", "memory did not pause on disconnect");
  assert.equal((await service.command({ op: "gameStop" })).ok, true);
  assert.equal((await service.state()).game.status, "idle");
  await service.command({ op: "connect" });
  const restored = await service.state();
  assert.equal(restored.device.armed, true);
  assert.deepEqual(restored.colors, colors);
  await service.command({ op: "gameStart", gameType: "pong" });
  await service.configure({ disconnect: 2 });
  await until(service.state, state => !state.device.connected, "pong did not disconnect");
  await service.command({ op: "gameStop" });
  await service.command({ op: "stop" });
  await service.command({ op: "connect" });
  assert.equal((await service.state()).device.armed, false);
});

async function failMemory(service) {
  await service.command({op:'gameStart',gameType:'memory',speed:10});
  const cue=await until(service.state,s=>s.game.cueIndex!==null,'memory did not show its cue');
  const wrong=cue.game.padCodes.find((code,index)=>cue.game.padIndices[index]!==cue.game.cueIndex);
  await until(service.state,s=>s.game.phase==='input','memory did not accept input');
  await service.command({op:'gameInput',code:wrong});
}
const fullRed = state => state.colors.slice(0,83).every(c=>c==='#ff0000') && state.colors[83]==='#000000';
const allDark = state => state.colors.every(c=>c==='#000000');

test('loss keeps output advancing through three flashes, then stops dark; restart is idempotent',async t=>{
  const service=await fakeService(t,{tasks:[{id:'test',status:'running'}]});
  await service.command({op:'settings',settings:{brightness:100,codexEnabled:true}});
  await failMemory(service);
  let state=await service.state();
  assert.equal(state.game.status,'over');
  assert.equal(state.game.lossFlashing,true);
  assert.equal(state.playback.playing,true);
  assert.ok(fullRed(state),'game feedback must cover task-status keys too');
  await until(service.state,allDark,'red flash did not switch off');
  await until(service.state,fullRed,'second red flash did not occur');
  state=await until(service.state,s=>!s.game.lossFlashing&&!s.playback.playing,'flash sequence did not finish');
  assert.ok(allDark(state));
  assert.equal(state.game.status,'over');
  const replies=await Promise.all([service.command({op:'gameRestart',speed:3}),service.command({op:'gameRestart',speed:8})]);
  assert.ok(replies.every(reply=>reply.ok));
  state=await service.state();
  assert.equal(state.game.status,'running');
  assert.ok([3,8].includes(state.game.speed),'concurrent HTTP requests may arrive in either order');
  assert.equal(state.game.round,1);
  assert.equal(state.game.lossFlashing,false);
  assert.ok(replies.every(reply=>reply.result.speed===state.game.speed),'the second request must keep the already-started round');
  await delay(1900);
  assert.equal((await service.state()).game.status,'running');
  assert.equal((await service.state()).game.lossFlashing,false);
});

test('restart during a red flash cancels the old sequence; ending feedback restores the prior scene',async t=>{
  const service=await fakeService(t);
  const art=Array(84).fill('#123456');art[83]='#000000';
  await service.command({op:'settings',settings:{brightness:100,codexEnabled:false}});
  await service.command({op:'preview',colors:art});
  await failMemory(service);
  assert.ok(fullRed(await service.state()));
  await service.command({op:'gameRestart'});
  assert.equal((await service.state()).game.lossFlashing,false);
  await service.command({op:'gameStop'});
  assert.deepEqual((await service.state()).colors,art);
  await failMemory(service);
  await service.command({op:'gameStop'});
  await delay(650);
  assert.deepEqual((await service.state()).colors,art);
  assert.equal((await service.state()).game.status,'idle');
  await service.command({op:'gameRestart'});
  assert.equal((await service.state()).game.status,'idle','Return must not start an exited game');
});
