import test from "node:test";
import assert from "node:assert/strict";
import {
  renderAnimation,
  SnakeGame,
  scaleColor,
  overlayCodex,
  animationDuration,
} from "../server/engine.mjs";
import { blank, layout } from "../shared/layout.mjs";
import {
  renderAnimation as renderPreview,
  animationDuration as previewDuration,
  scaleColor as scalePreviewColor,
} from "../shared/render-animation.mjs";

test("preview and keyboard playback use the same animation renderer", () => {
  assert.equal(renderPreview, renderAnimation);
  assert.equal(previewDuration, animationDuration);
  assert.equal(scalePreviewColor, scaleColor);
});

test("a one-key image moves right onto the next physical key then wraps", () => {
  const colors = blank();
  colors[31] = "#ff0000";
  const result = renderAnimation(
    colors,
    { effect: "move", direction: "right", speed: 1, loop: true },
    1000,
  );
  assert.equal(result[32], "#ff0000");
  assert.equal(result[31], "#000000");
  assert.deepEqual(
    colors.filter((c) => c !== "#000000"),
    ["#ff0000"],
  );
});
test("frame sequence respects frame duration, wrap and terminal frame", () => {
  const a = blank(),
    b = blank();
  a[1] = "#123456";
  b[2] = "#abcdef";
  const animation = {
    effect: "frames",
    frames: [
      { colors: a, duration: 100 },
      { colors: b, duration: 200 },
    ],
    loop: true,
  };
  assert.deepEqual(renderAnimation(a, animation, 0), a);
  assert.deepEqual(renderAnimation(a, animation, 99.9), a);
  assert.deepEqual(renderAnimation(a, animation, 100), b);
  assert.deepEqual(renderAnimation(a, animation, 150), b);
  assert.deepEqual(renderAnimation(a, animation, 300), a);
  assert.deepEqual(renderAnimation(a, { ...animation, speed: 4 }, 100), b);
  assert.deepEqual(renderAnimation(a, { ...animation, loop: false }, 300), b);
  assert.deepEqual(renderAnimation(a, { ...animation, loop: false }, 9999), b);
  assert.equal(animationDuration({ ...animation, loop: false }), 300);
  assert.equal(animationDuration({ ...animation, speed: 4, loop: false }), 300);
});
test("frame speed scales lookup and duration without changing saved timing", () => {
  const first = blank(),
    last = blank();
  first[1] = "#dc847b";
  last[2] = "#71958b";
  const animation = {
    effect: "frames",
    speed: 8,
    frames: [
      { colors: first, duration: 100 },
      { colors: last, duration: 200 },
    ],
    loop: false,
  };
  const saved = structuredClone(animation);
  assert.equal(animationDuration(animation), 150);
  assert.deepEqual(renderAnimation(first, animation, 49.9), first);
  assert.deepEqual(renderAnimation(first, animation, 50), last);
  assert.deepEqual(renderAnimation(first, animation, 150), last);
  assert.deepEqual(renderAnimation(first, animation, 99_999), last);
  assert.deepEqual(renderAnimation(first, { ...animation, loop: true }, 150), first);
  assert.deepEqual(renderAnimation(first, { ...animation, loop: true }, 200), last);
  assert.equal(animationDuration({ ...animation, loop: true }), Infinity);
  const slow = { ...animation, speed: 2 };
  assert.equal(animationDuration(slow), 600);
  assert.deepEqual(renderAnimation(first, slow, 199.9), first);
  assert.deepEqual(renderAnimation(first, slow, 200), last);
  assert.deepEqual(renderAnimation(first, slow, 600), last);
  assert.deepEqual(animation, saved);
});
test("Codex overlay touches only six F keys and explicit unknown is neutral", () => {
  const colors = Array(84).fill("#123456");
  const out = overlayCodex(colors, [
    { status: "running" },
    null,
    { status: "unknown" },
  ]);
  assert.equal(out[1], "#304FFE");
  assert.equal(out[2], "#000000");
  assert.equal(out[3], "#858582");
  assert.equal(out[7], "#123456");
  assert.equal(colors[1], "#123456");
});
test("Snake refuses reversal and a second turn inside the same tick", () => {
  const game = new SnakeGame(() => 0);
  game.start();
  game.input("left");
  assert.equal(game.queued, "right");
  game.input("up");
  game.input("left");
  game.tick();
  assert.equal(game.body[0], layout.find((key) => key.code === "KeyR").index);
  assert.equal(game.direction, "up");
});
test("Snake food grows body, increments score, and stays off body", () => {
  const game = new SnakeGame(() => 0);
  game.start();
  game.food = layout.find((key) => key.code === "KeyG").index;
  game.tick();
  assert.equal(game.body.length, 4);
  assert.equal(game.score, 1);
  assert.equal(game.bestScore, 1);
  assert.ok(!game.body.includes(game.food));
  assert.equal(game.render().length, 84);
});
test("Snake collision ends game without leaking into unrelated LEDs", () => {
  const game = new SnakeGame(() => 0);
  game.start();
  for (let i = 0; i < 20; i++) game.tick();
  assert.equal(game.status, "over");
  assert.equal(game.render()[1], "#000000");
  assert.equal(game.render()[76], "#000000");
});
test("hardware brightness conversion is bounded and deterministic", () => {
  assert.equal(scaleColor("#ffffff", 0.5), "#808080");
  assert.equal(scaleColor("#abcdef", 0), "#000000");
  assert.equal(scaleColor("#abcdef", 2), "#abcdef");
});
