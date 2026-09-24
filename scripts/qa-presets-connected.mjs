// Explicit hardware acceptance: pass a running local Air Studio runtime.json.
// Leaves existing saved scenes/settings intact and restores the previous static RGB.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createPresets } from "../shared/presets.mjs";
import { layout } from "../shared/layout.mjs";
import { scaleColor } from "../shared/render-animation.mjs";
const runtimePath = process.argv[2];
if (!runtimePath) throw new Error("Pass the running Air Studio runtime.json path");
const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
const headers = { "X-Air-Token": runtime.token, "Content-Type": "application/json" };
async function request(path, body) {
  const response = await fetch(new URL(path, runtime.url), {
    method: body ? "POST" : "GET", headers,
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  });
  const value = await response.json();
  assert(response.ok && value.ok !== false, value.error || `HTTP ${response.status}`);
  return value;
}
const state = () => request("/api/state");
const command = async (op, data = {}) => (await request("/api/command", { op, ...data })).result;
const initial = await state();
assert(initial.device.connected, "Keyboard must already be connected");
assert(!initial.playback.playing && !initial.trigger.armed && initial.game.status === "idle", "Do not interrupt active playback or games");
assert(!initial.settings.codexEnabled && !initial.settings.quotaSideEnabled, "This acceptance run needs status overlays off");
const catalog = createPresets(layout);
const normalize = colors => colors.map(color => color.toLowerCase());
const equalColors = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const restoreColors = [...initial.scenes, ...catalog].map(scene => scene.colors).find(colors =>
  equalColors(colors.map(color => scaleColor(color, initial.settings.brightness / 100)), initial.colors),
);
assert(!initial.device.armed || restoreColors, "Current static artwork must be saved or match a preset before testing");
const results = [];
try {
  for (const preset of catalog) {
    const before = (await state()).playback.framesSent;
    await command(preset.animation.effect === "static" ? "preview" : "play", { colors: preset.colors, animation: preset.animation });
    if (preset.animation.effect !== "static") {
      await delay(950);
      await command("pause");
    }
    const paused = await state();
    assert.equal(paused.playback.playing, false);
    assert.equal(paused.playback.lastError, null);
    // D8 acknowledges its input buffer before the firmware refreshes D2's
    // rendered RGB buffer. Let that refresh finish before comparing all LEDs;
    // do not rewrite the frame or omit channels to obtain a passing readback.
    await delay(80);
    const read = await command("readColors");
    assert.deepEqual(normalize(read.colors.slice(0, 84)), normalize(paused.colors), `${preset.id}: RGB readback mismatch`);
    assert.equal(read.colors[83].toLowerCase(), "#000000");
    if (preset.animation.effect !== "static") assert(paused.playback.framesSent >= before + 3, `${preset.id}: did not advance`);
    results.push({ id: preset.id, name: preset.name, framesSent: paused.playback.framesSent - before, rgbReadbackMatches: true });
    console.log(`${preset.name}: RGB readback verified`);
  }
} finally {
  await command("stop");
  if (initial.device.armed) {
    await command("preview", { colors: restoreColors });
    await delay(80);
    const restored = await command("readColors");
    assert.deepEqual(normalize(restored.colors.slice(0, 84)), normalize(initial.colors), "Previous static RGB must be restored");
  }
}
const final = await state();
assert.deepEqual(final.settings, initial.settings, "Settings changed during acceptance");
assert.deepEqual(final.scenes, initial.scenes, "Saved scenes changed during acceptance");
const report = { checkedAt: new Date().toISOString(), firmware: final.device.firmwareVersion ?? final.device.firmware, presetCount: results.length, readbackSettleMs: 80, previousLightingRestored: true, settingsUnchanged: true, scenesUnchanged: true, results };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2));
console.log(`Verified ${results.length} presets; previous lighting restored.`);
