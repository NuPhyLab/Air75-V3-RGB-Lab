import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import {
  Store,
  validateColors,
  validateAnimation,
  validateSettings,
} from "../server/storage.mjs";
import { blank } from "../shared/layout.mjs";
async function temp(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "airstudio-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('legacy audio loads as single color and multicolor choice persists across reopen',async t=>{
  const dir=await temp(t);
  const original={version:1,scenes:[],settings:{audio:{source:'microphone',deviceId:'saved-mic',effect:'ripple',color:'#ac2345',sensitivity:2,noiseFloor:-40}}};
  await writeFile(path.join(dir,'library.json'),JSON.stringify(original));
  const store=await new Store(dir).load();
  assert.equal(store.data.settings.audio.colorMode,'single');assert.equal(store.warning,null);
  await store.settings({audio:{colorMode:'colorful'}});
  const reopened=await new Store(dir).load();
  assert.equal(reopened.warning,null);
  assert.deepEqual(reopened.data.settings.audio,{...original.settings.audio,colorMode:'colorful'});
  await reopened.settings({audio:{colorMode:'single'}});
  assert.equal((await new Store(dir).load()).data.settings.audio.color,original.settings.audio.color);
});
test("save/reopen/update/delete preserves scene data and original creation time", async (t) => {
  const dir = await temp(t),
    store = await new Store(dir).load();
  const first = await store.saveScene({
    name: "心",
    colors: blank(),
    animation: { effect: "move", loop: true },
  });
  const reopened = await new Store(dir).load();
  assert.equal(reopened.data.scenes[0].name, "心");
  assert.equal(reopened.data.scenes[0].colors.length, 84);
  const edited = await reopened.saveScene({ ...first, name: "移动的心" });
  assert.equal(edited.createdAt, first.createdAt);
  assert.equal(reopened.data.scenes.length, 1);
  await reopened.deleteScene(first.id);
  assert.equal((await new Store(dir).load()).data.scenes.length, 0);
});
test("invalid multi-scene import is atomic and preserves existing library", async (t) => {
  const store = await new Store(await temp(t)).load();
  await store.saveScene({ name: "保留", colors: blank() });
  await assert.rejects(
    store.importScenes([
      { name: "合法", colors: blank() },
      { name: "无效", colors: ["#ff0000"] },
    ]),
    /84/,
  );
  assert.equal(store.data.scenes.length, 1);
  const result = await store.importScenes([{ name: "导入", colors: blank() }]);
  assert.equal(result.count, 1);
  assert.equal(store.data.scenes.length, 2);
});
test("corrupt library is preserved instead of overwritten", async (t) => {
  const dir = await temp(t);
  await writeFile(path.join(dir, "library.json"), "BROKEN");
  const store = await new Store(dir).load();
  assert.ok(store.warning);
  await assert.rejects(store.saveScene({ name: "新作品", colors: blank() }));
  assert.equal(
    await readFile(path.join(dir, "library.json"), "utf8"),
    "BROKEN",
  );
});
test("removed rainbow scenes load and import as static without losing artwork or locking the library", async (t) => {
  const dir = await temp(t);
  const colors = blank();
  colors[20] = "#dc847b";
  colors[23] = "#6493d7";
  const oldScene = {
    id: "legacy-artwork",
    name: "自定义旧作品",
    colors,
    animation: {
      effect: "rainbow",
      direction: "left",
      speed: 6,
      loop: false,
      frames: [{ colors: [...colors].reverse(), duration: 300 }],
    },
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
  };
  const waveScene = {
    ...oldScene,
    id: "existing-wave",
    name: "保留波浪",
    animation: { ...oldScene.animation, effect: "wave" },
  };
  const original = JSON.stringify({ version: 1, scenes: [oldScene, waveScene] });
  const file = path.join(dir, "library.json");
  await writeFile(file, original);

  const store = await new Store(dir).load();
  const expected = {
    ...oldScene,
    animation: { ...oldScene.animation, effect: "static" },
  };
  assert.equal(store.warning, null);
  assert.ok(!store.readOnly);
  assert.deepEqual(store.data.scenes, [expected, waveScene]);
  assert.equal(await readFile(file, "utf8"), original);

  await store.saveScene({ ...store.data.scenes[0], name: "仍可编辑" });
  const reopened = await new Store(dir).load();
  assert.equal(reopened.data.scenes[0].animation.effect, "static");
  assert.deepEqual(reopened.data.scenes[0].colors, colors);
  assert.equal(reopened.data.scenes[0].name, "仍可编辑");
  assert.equal(reopened.data.scenes[0].createdAt, oldScene.createdAt);
  assert.deepEqual(await reopened.importScenes([oldScene]), { count: 1 });
  const imported = reopened.data.scenes[0];
  assert.equal(imported.animation.effect, "static");
  assert.deepEqual(imported.colors, colors);
  assert.deepEqual(imported.animation.frames, oldScene.animation.frames);
  assert.equal(imported.name, oldScene.name);
  assert.notEqual(imported.id, oldScene.id);
  assert.equal(reopened.data.scenes[2].animation.effect, "wave");

  assert.throws(() => validateAnimation({ effect: "rainbow" }), /不支持/);
  assert.equal(validateAnimation({ effect: "wave" }).effect, "wave");
});
test("malformed colors and excessive frames are rejected before touching hardware", () => {
  assert.throws(() => validateColors(Array(84).fill("red")));
  assert.throws(() => validateAnimation({ effect: "frames", frames: [] }));
  assert.throws(() =>
    validateAnimation({
      effect: "frames",
      frames: Array(121).fill({ colors: blank(), duration: 100 }),
    }),
  );
  assert.throws(() => validateSettings({ brightness: NaN }));
  assert.throws(() => validateSettings({ __proto__: null, unknown: true }));
  assert.throws(() => validateSettings({ slotIds: [true] }));
});

test("legacy Snake record is retained while arcade records persist independently", async (t) => {
  const dir = await temp(t);
  await writeFile(path.join(dir, "library.json"), JSON.stringify({ version: 1, scenes: [], bestScore: 12 }));
  const store = await new Store(dir).load();
  assert.deepEqual(store.data.gameBestScores, { snake: 12, whack: 0, memory: 0, pong: 0 });
  await store.bestScore(4, "memory");
  await store.bestScore(20, "whack");
  await store.bestScore(13, "pong");
  await store.bestScore(2, "whack");
  const reopened = await new Store(dir).load();
  assert.equal(reopened.data.bestScore, 12);
  assert.deepEqual(reopened.data.gameBestScores, { snake: 12, whack: 20, memory: 4, pong: 13 });
  await assert.rejects(reopened.bestScore(100, "__proto__"));
  await assert.rejects(reopened.bestScore(NaN, "whack"));
});
