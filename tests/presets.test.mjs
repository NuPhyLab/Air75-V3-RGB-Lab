import test from "node:test";
import assert from "node:assert/strict";
import heartKeys from "../shared/heart-keys.json" with { type: "json" };
import { layout } from "../shared/layout.mjs";
import { createPresets, heartColors, DEFAULT_COLOR } from "../shared/presets.mjs";
import { validateAnimation, validateScene } from "../server/storage.mjs";
import { renderAnimation } from "../shared/render-animation.mjs";

const lit = (colors) => colors.map((color, index) => color !== "#000000" ? index : -1).filter((index) => index >= 0);
const centroidX = (colors) => {
  let sum = 0, weight = 0;
  for (const key of layout) {
    const intensity = parseInt(colors[key.index].slice(1, 3), 16);
    sum += (key.x + key.w / 2) * intensity;
    weight += intensity;
  }
  return weight ? sum / weight : null;
};

test("curated catalog animates every preset and preserves the chosen heart shape", () => {
  const presets = createPresets(layout);
  assert.equal(presets.length, 12);
  assert.equal(new Set(presets.map((preset) => preset.id)).size, presets.length);
  assert.equal(presets[0].id, "heart");
  assert.equal(presets[0].name, "一颗小心意");
  assert.ok(!presets.some(preset => ["blank", "diamond", "bowtie"].includes(preset.id)));
  assert.equal(presets.filter((preset) => preset.category === "pattern").length, 6);
  assert.equal(presets.filter((preset) => preset.category === "motion").length, 6);
  assert.deepEqual(lit(presets[0].colors).map((index) => layout.find((key) => key.index === index).code).sort(), [...heartKeys].sort());
  assert.equal(lit(presets[0].colors).length, 19);
  assert.ok(lit(presets[0].colors).every((index) => presets[0].colors[index] === DEFAULT_COLOR));
  assert.equal(presets[0].animation.effect, "pulse");
  assert.equal(presets[0].animation.frames.length, 0);
  assert.deepEqual(heartColors(layout, "#ff1122").filter((color) => color !== "#000000"), Array(19).fill("#ff1122"));
  assert.ok(!JSON.stringify(presets).includes("rainbow"));
  for (const preset of presets) {
    const frames = Array.from({ length: 100 }, (_, i) => renderAnimation(preset.colors, preset.animation, i * 80));
    assert.ok(new Set(frames.map(JSON.stringify)).size >= 16, `${preset.id}: playback must visibly change`);
  }
  const heart = presets[0];
  const period = 2 * Math.PI / (heart.animation.speed * 0.9) * 1000;
  assert.ok(period >= 3000 && period <= 5000, "heart should breathe slowly");
  for (const at of [0, period / 4, period / 2, period])
    assert.deepEqual(lit(renderAnimation(heart.colors, heart.animation, at)), lit(heart.colors), "breathing must not move or expand the heart");
  assert.deepEqual(renderAnimation(heart.colors, heart.animation, period / 2), heart.colors);
  assert.deepEqual(renderAnimation(heart.colors, heart.animation, 0), renderAnimation(heart.colors, heart.animation, period));
});

test("all preset colors and editable frames round-trip through scene storage", () => {
  const knownIndices = new Set(layout.map((key) => key.index));
  for (const preset of createPresets(layout)) {
    assert.deepEqual(validateAnimation(preset.animation), preset.animation);
    const stored = validateScene(JSON.parse(JSON.stringify(preset)));
    assert.deepEqual(stored.colors, preset.colors);
    assert.deepEqual(stored.animation, preset.animation);
    for (const colors of [preset.colors, ...preset.animation.frames.map((frame) => frame.colors)]) {
      assert.equal(colors.length, 84, preset.id);
      assert.ok(colors.every((color) => /^#[0-9a-f]{6}$/.test(color)), preset.id);
      for (let index = 0; index < colors.length; index++)
        if (!knownIndices.has(index)) assert.equal(colors[index], "#000000", `${preset.id}: phantom LED ${index}`);
    }
    if (preset.id === "blank") assert.equal(lit(preset.colors).length, 0);
    else assert.ok(lit(preset.colors).length >= 3, `${preset.id} has an empty preview`);
    if (preset.animation.effect === "frames") {
      assert.ok(preset.animation.frames.length >= 16 && preset.animation.frames.length <= 40);
      assert.ok(preset.animation.frames.every((frame) => frame.duration >= 80));
      assert.ok(new Set(preset.animation.frames.map((frame) => JSON.stringify(frame.colors))).size >= 16, `${preset.id} does not animate`);
    }
    assert.ok(preset.animation.speed >= 1 && preset.animation.speed <= 10);
    assert.equal(preset.animation.loop, true);
  }
});

test("catalog creation is deterministic, never aliases editable arrays, and respects a sparse physical key map", () => {
  const first = createPresets(layout);
  const second = createPresets(layout);
  assert.deepEqual(first, second);
  const allArrays = first.flatMap((preset) => [preset.colors, preset.animation.frames, ...preset.animation.frames.map((frame) => frame.colors)]);
  assert.equal(new Set(allArrays).size, allArrays.length);
  const comet = first.find((preset) => preset.id === "comet");
  const untouched = structuredClone(second);
  first[0].colors.fill("#ffffff");
  comet.colors.fill("#ffffff");
  comet.animation.frames[0].colors.fill("#ffffff");
  comet.animation.frames[1].duration = 800;
  assert.deepEqual(second, untouched);
  assert.notDeepEqual(comet.animation.frames[1].colors, comet.animation.frames[0].colors);

  const sparseKeys = layout.filter((key) => key.index % 3 === 0);
  const sparseIndices = new Set(sparseKeys.map((key) => key.index));
  for (const preset of createPresets(sparseKeys))
    for (const colors of [preset.colors, ...preset.animation.frames.map((frame) => frame.colors)])
      for (let index = 0; index < 84; index++)
        if (!sparseIndices.has(index)) assert.equal(colors[index], "#000000");
});

test("comet travels left-to-right and scan returns symmetrically without lighting the phantom key", () => {
  const presets = createPresets(layout);
  const comet = presets.find((preset) => preset.id === "comet").animation.frames;
  const positions = comet.map((frame) => centroidX(frame.colors)).filter((position) => position !== null);
  assert.ok(positions.at(-1) - positions[0] > 10);
  assert.ok(positions.every((position, index) => index === 0 || position >= positions[index - 1] - 0.25));
  assert.equal(lit(comet[0].colors).length, 0);
  assert.equal(lit(comet.at(-1).colors).length, 0);
  const scan = presets.find((preset) => preset.id === "scan").animation.frames;
  for (let frame = 1; frame < scan.length; frame++)
    assert.deepEqual(scan[frame].colors, scan[scan.length - frame].colors);
  assert.ok(centroidX(scan[12].colors) > centroidX(scan[4].colors) + 8);
  assert.equal(lit(scan[0].colors).length, 0);
  assert.equal(lit(scan[16].colors).length, 0);
});
