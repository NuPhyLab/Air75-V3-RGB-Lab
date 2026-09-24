import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { blank, heart, layout, presets } from "../shared/layout.mjs";
import { DEFAULT_TRIGGER, TRIGGER_KEYS, validateTrigger } from "../shared/trigger.mjs";
import { TriggerEffect } from "../server/trigger.mjs";
import { Store, validateScene } from "../server/storage.mjs";

test("default heart follows the new reference's nineteen keys, including right Command", () => {
  const expected = [
    "Digit8", "Digit9", "Minus", "Equal",
    "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight",
    "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote",
    "Comma", "Period", "Slash", "MetaRight",
  ];
  const colors = heart();
  assert.deepEqual(layout.filter((key) => colors[key.index] !== "#000000").map((key) => key.code), expected);
  assert.equal(colors.filter((color) => color !== "#000000").length, 19);
  assert.equal(colors[83], "#000000");
  assert.deepEqual(new Set(colors), new Set(["#000000", "#dc847b"]));
  assert.deepEqual(presets().find((preset) => preset.id === "heart").colors, colors);
  assert.equal(presets().find((preset) => preset.id === "heart").animation.effect, "pulse");
  assert.equal(layout.find((key) => key.code === "Insert").label, "Ins");
});

test("trigger defaults, customization and native keycodes validate without accepting modifiers", () => {
  assert.deepEqual(validateTrigger(), { code: "Space", count: 3, intervalMs: 600 });
  assert.deepEqual(validateTrigger({ count: 8 }), { ...DEFAULT_TRIGGER, count: 8 });
  assert.deepEqual(validateTrigger({ code: "KeyJ", count: 1, intervalMs: 200 }), { code: "KeyJ", count: 1, intervalMs: 200 });
  assert.equal(validateTrigger({ count: 20, intervalMs: 2000 }).intervalMs, 2000);
  assert.equal(new Set(TRIGGER_KEYS.map((key) => key.code)).size, TRIGGER_KEYS.length);
  assert.equal(new Set(TRIGGER_KEYS.map((key) => key.keyCode)).size, TRIGGER_KEYS.length);
  assert.equal(TRIGGER_KEYS.find((key) => key.code === "Space").keyCode, 49);
  assert.equal(TRIGGER_KEYS.find((key) => key.code === "KeyA").keyCode, 0);
  assert.equal(TRIGGER_KEYS.find((key) => key.code === "Delete").keyCode, 117);
  assert.equal(TRIGGER_KEYS.find((key) => key.code === "Insert").keyCode, 114);
  for (const input of [null, [], "Space", { code: "Fn" }, { code: "MetaRight" }, { code: "CapsLock" }, { code: "" }, { count: 0 }, { count: 21 }, { count: 2.5 }, { count: "3" }, { count: Infinity }, { intervalMs: 199 }, { intervalMs: 2001 }, { intervalMs: 600.5 }, { intervalMs: NaN }, { unknown: true }]) {
    assert.throws(() => validateTrigger(input), JSON.stringify(input));
  }
});

test("arming starts black; three flashes finish black and wait for another press", () => {
  const effect = new TriggerEffect();
  assert.deepEqual(effect.snapshot(), { armed: false, flashing: false, completed: 0, config: DEFAULT_TRIGGER });
  assert.equal(effect.fire(0), false);
  assert.deepEqual(effect.start(heart()), blank());
  assert.deepEqual(effect.render(1000), blank());
  assert.equal(effect.armed, true);
  assert.equal(effect.fire(1000), true);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const start = 1000 + cycle * 600;
    assert.deepEqual(effect.render(start), heart());
    assert.equal(effect.completed, cycle);
    assert.deepEqual(effect.render(start + 299), heart());
    assert.deepEqual(effect.render(start + 300), blank());
    assert.deepEqual(effect.render(start + 599), blank());
  }
  assert.deepEqual(effect.render(2800), blank());
  assert.equal(effect.flashing, false);
  assert.equal(effect.armed, true);
  assert.equal(effect.completed, 3);
  assert.deepEqual(effect.render(999999), blank());
  assert.equal(effect.fire(1000000), true);
  assert.equal(effect.completed, 0);
  assert.deepEqual(effect.render(1000000), heart());
});

test("repeated presses during a flash run do not restart or queue more flashes", () => {
  const effect = new TriggerEffect();
  effect.start(heart(), { count: 1, intervalMs: 200 });
  effect.fire(20);
  assert.equal(effect.fire(50), false);
  assert.equal(effect.fire(119), false);
  assert.deepEqual(effect.render(119), heart());
  assert.deepEqual(effect.render(120), blank());
  assert.equal(effect.fire(219), false);
  assert.deepEqual(effect.render(220), blank());
  assert.equal(effect.flashing, false);
  assert.equal(effect.completed, 1);
  assert.deepEqual(effect.render(420), blank());
});

test("count and speed use elapsed time even after delayed ticks", () => {
  const effect = new TriggerEffect();
  effect.start(heart("#123456"), { count: 5, intervalMs: 350 });
  effect.fire(100);
  assert.deepEqual(effect.render(450), heart("#123456"));
  assert.equal(effect.completed, 1);
  assert.deepEqual(effect.render(1325), blank());
  assert.equal(effect.completed, 3);
  assert.deepEqual(effect.render(9000), blank());
  assert.equal(effect.completed, 5);
  assert.equal(effect.flashing, false);
});

test("custom colors remain isolated from later edits and the unmapped LED stays black", () => {
  const colors = heart("#AABBCC");
  colors[layout.find((key) => key.code === "KeyJ").index] = "#123456";
  colors[83] = "#ffffff";
  const config = { code: "Enter", count: 2, intervalMs: 1000 };
  const effect = new TriggerEffect();
  effect.start(colors, config);
  effect.fire(0);
  const expected = colors.map((color) => color.toLowerCase());
  expected[83] = "#000000";
  colors.fill("#000000");
  config.count = 20;
  assert.deepEqual(effect.render(0), expected);
  effect.render(0).fill("#eeeeee");
  assert.deepEqual(effect.render(100), expected);
  effect.snapshot().config.count = 20;
  assert.equal(effect.config.count, 2);
  assert.deepEqual(effect.render(2000), blank());
});

test("cancel clears a running effect and invalid replacements preserve the previous configuration", () => {
  const effect = new TriggerEffect();
  effect.start(heart());
  effect.fire(100);
  assert.throws(() => effect.start(["#ff0000"], { count: 1 }), /84/);
  assert.throws(() => effect.start(blank(), { count: 0 }), /次数/);
  assert.deepEqual(effect.render(100), heart());
  assert.deepEqual(effect.cancel(), blank());
  assert.equal(effect.armed, false);
  assert.equal(effect.flashing, false);
  assert.equal(effect.fire(1000), false);
  assert.deepEqual(effect.render(1000), blank());
});

test("trigger settings round-trip with a scene while older artwork stays unchanged", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "air-studio-trigger-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new Store(dir).load();
  const oldColors = blank();
  oldColors[20] = "#abcdef";
  const oldScene = await store.saveScene({ name: "原来的图案", colors: oldColors });
  const config = { code: "KeyJ", count: 7, intervalMs: 400 };
  const newScene = await store.saveScene({ name: "按键亮起爱心", colors: heart(), trigger: config });
  const reopened = await new Store(dir).load();
  assert.equal(reopened.warning, null);
  const storedNew = reopened.data.scenes.find((scene) => scene.id === newScene.id);
  const storedOld = reopened.data.scenes.find((scene) => scene.id === oldScene.id);
  assert.deepEqual(storedNew.trigger, config);
  assert.deepEqual(storedNew.colors, heart());
  assert.deepEqual(storedOld.colors, oldColors);
  assert.equal(Object.hasOwn(storedOld, "trigger"), false);
  const serialized = JSON.parse(JSON.stringify(storedNew));
  await reopened.importScenes([serialized]);
  assert.deepEqual(reopened.data.scenes[0].trigger, config);
  assert.notEqual(reopened.data.scenes[0].id, newScene.id);
  const before = JSON.stringify(reopened.data);
  await assert.rejects(reopened.importScenes([{ ...serialized, trigger: { count: 0 } }]), /次数/);
  assert.equal(JSON.stringify(reopened.data), before);
  assert.deepEqual(validateScene({ name: "默认参数", colors: heart(), trigger: {} }).trigger, DEFAULT_TRIGGER);
});
