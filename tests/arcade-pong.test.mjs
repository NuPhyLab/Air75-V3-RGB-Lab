import test from "node:test";
import assert from "node:assert/strict";
import { PongGame } from "../server/games/pong.mjs";
import { layout, LED_COUNT } from "../shared/layout.mjs";

const near = (actual, expected, tolerance = 0.000001) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

function rally(ball, speed = 4) {
  const game = new PongGame(() => 0.5);
  game.start(speed);
  game.phase = "rally";
  game.serveRemainingMs = 0;
  game.ball = { x: 8, y: 3, vx: 7, vy: 0, ...ball };
  return game;
}

test("Pong starts with a 900 ms serve and uses elapsed simulation time only", () => {
  const game = new PongGame(() => 0.5);
  assert.equal(game.type, "pong");
  assert.equal(game.status, "idle");
  assert.ok(game.render().every((color) => color === "#000000"));
  game.start();
  assert.equal(game.phase, "serve");
  game.tick(600);
  assert.equal(game.serveRemainingMs, 300);
  assert.deepEqual(game.snapshot().ball, { x: 8, y: 3 });
  game.tick(300);
  assert.equal(game.phase, "rally");
  assert.equal(game.serveRemainingMs, 0);
  assert.deepEqual(game.snapshot().ball, { x: 8, y: 3 });
  game.tick(100);
  near(game.ball.x, 8.7);
  near(game.ball.y, 3);
  const untouched = game.snapshot();
  for (const invalid of [-1, 0, NaN, Infinity, undefined]) game.tick(invalid);
  assert.deepEqual(game.snapshot(), untouched);
});

test("left and right players hold, release and cancel opposing directions independently", () => {
  const game = new PongGame();
  game.start();
  game.input({ code: "KeyW" });
  game.input({ code: "ArrowDown" });
  game.tick(100);
  near(game.paddles.left, 2.5);
  near(game.paddles.right, 3.5);
  game.input({ code: "KeyW", pressed: false });
  game.tick(100);
  near(game.paddles.left, 2.5);
  near(game.paddles.right, 4);
  game.input({ code: "KeyW" });
  game.input({ code: "KeyS" });
  game.input({ code: "ArrowUp" });
  game.tick(100);
  near(game.paddles.left, 2.5);
  near(game.paddles.right, 4);
  game.releaseInputs();
  game.tick(100);
  near(game.paddles.left, 2.5);
  near(game.paddles.right, 4);
  game.input({ code: "KeyX" });
  assert.equal(game.held.size, 0);
});

test("held controls clamp paddles to two visible rows at either boundary", () => {
  const game = new PongGame();
  game.start();
  game.input({ code: "KeyW" });
  game.input({ code: "ArrowDown" });
  game.tick(1200);
  assert.deepEqual(game.paddles, { left: 1, right: 5 });
  game.releaseInputs();
  game.input({ code: "KeyS" });
  game.input({ code: "ArrowUp" });
  game.tick(1200);
  assert.deepEqual(game.paddles, { left: 5, right: 1 });
});

test("pause freezes ball, paddles and serve timer, and released inputs stay released on resume", () => {
  const game = new PongGame();
  game.start();
  game.input({ code: "KeyW" });
  game.status = "paused";
  game.releaseInputs();
  const paused = game.snapshot();
  game.input({ code: "ArrowDown" });
  game.tick(5000);
  assert.deepEqual(game.snapshot(), paused);
  game.status = "running";
  game.tick(100);
  assert.deepEqual(game.paddles, { left: 3, right: 3 });
  assert.equal(game.serveRemainingMs, 800);
  game.phase = "rally";
  game.ball = { x: 8, y: 3, vx: 7, vy: 2 };
  game.status = "paused";
  const ball = { ...game.ball };
  game.tick(1000);
  assert.deepEqual(game.ball, ball);
});

test("the ball reflects from both the top and bottom of the six-row court", () => {
  const top = rally({ y: 0.01, vx: 3, vy: -4 });
  top.tick(100);
  assert.ok(top.ball.vy > 0);
  near(top.ball.y, 0.39);
  const bottom = rally({ y: 5.99, vx: 3, vy: 4 });
  bottom.tick(100);
  assert.ok(bottom.ball.vy < 0);
  near(bottom.ball.y, 5.61);
});

test("paddle collisions use physical wide-key edges and change reflection by hit height", () => {
  const left = rally({ x: 2.4, y: 4.6, vx: -11.5, vy: 0 }, 10);
  left.paddles.left = 4;
  left.tick(30);
  assert.ok(left.ball.vx > 0, "wide left Shift paddle reflects at x = 2.25");
  assert.ok(left.ball.vy > 0, "a lower hit sends the ball down");
  assert.ok(left.ball.x >= 2.25);
  near(Math.hypot(left.ball.vx, left.ball.vy), left.ballSpeed);
  const right = rally({ x: 14.9, y: 2.2, vx: 11.5, vy: 0 }, 10);
  right.tick(30);
  assert.ok(right.ball.vx < 0);
  assert.ok(right.ball.vy < 0, "an upper hit sends the ball up");
  assert.ok(right.ball.x <= 15);
  near(Math.hypot(right.ball.vx, right.ball.vy), right.ballSpeed);
  const functionRow = rally({ x: 13.9, y: 0.5, vx: 11.5, vy: 0 }, 10);
  functionRow.paddles.right = 1;
  functionRow.tick(30);
  assert.ok(
    functionRow.ball.vx < 0,
    "Ins is the function row's rightmost controllable key",
  );
  assert.ok(functionRow.ball.x < 14);
});

test("a large elapsed frame cannot skip a paddle, even at the highest speed", () => {
  const game = rally({ x: 2, y: 3, vx: -11.5, vy: 0 }, 10);
  // Centre hits stay level so both paddles can return repeated full-court rallies.
  game.tick(5000);
  assert.equal(game.leftScore, 0);
  assert.equal(game.rightScore, 0);
  assert.equal(game.phase, "rally");
  assert.ok(game.ball.x >= 1.75 && game.ball.x <= 15);
  assert.equal(game.ball.y, 3);
});

test("missing either paddle awards the opponent a point and starts a fresh delayed serve", () => {
  for (const [x, vx, side] of [
    [0.02, -7, "right"],
    [15.98, 7, "left"],
  ]) {
    const game = rally({ x, y: 0.5, vx, vy: 0 });
    game.tick(8);
    assert.equal(game[`${side}Score`], 1);
    assert.equal(game.score, 1);
    assert.equal(game.bestScore, 1);
    assert.equal(game.phase, "serve");
    assert.equal(game.serveRemainingMs, 900);
    assert.deepEqual(game.snapshot().ball, { x: 8, y: 3 });
    game.tick(500);
    assert.equal(game.serveRemainingMs, 400);
    assert.deepEqual(game.snapshot().ball, { x: 8, y: 3 });
    game.tick(401);
    assert.equal(game.phase, "rally");
    assert.equal(Math.sign(game.ball.vx), side === "left" ? 1 : -1);
  }
});

test("the seventh point wins and stops the match, while restart keeps the best score", () => {
  for (const side of ["left", "right"]) {
    const game = rally({
      x: side === "left" ? 15.98 : 0.02,
      y: 0.5,
      vx: side === "left" ? 7 : -7,
      vy: 0,
    });
    game.leftScore = side === "left" ? 6 : 5;
    game.rightScore = side === "right" ? 6 : 5;
    game.input({ code: "KeyW" });
    game.tick(8);
    assert.equal(game.status, "won");
    assert.equal(game.phase, "finished");
    assert.equal(game.winner, side);
    assert.equal(game[`${side}Score`], 7);
    assert.equal(game.score, 12);
    assert.equal(game.bestScore, 12);
    assert.equal(game.held.size, 0);
    const finished = game.snapshot();
    game.tick(9999);
    game.input({ code: "ArrowDown" });
    assert.deepEqual(game.snapshot(), finished);
    game.start(99);
    assert.equal(game.speed, 10);
    assert.equal(game.score, 0);
    assert.equal(game.bestScore, 12);
    assert.equal(game.winner, null);
    assert.deepEqual([game.leftScore, game.rightScore], [0, 0]);
    game.start(-10);
    assert.equal(game.speed, 1);
  }
});

test("render projects the ball onto real keys with only the two paddles and ball illuminated", () => {
  const game = new PongGame(() => 0.5, [
    ...layout,
    { index: 83, x: 15, y: 0, w: 1, controllable: false },
  ]);
  game.start();
  game.paddles = { left: 1, right: 5 };
  game.ball = { x: 6.8, y: 5.5, vx: 0, vy: 0 };
  const expected = new Set([0, 15, 72, 82, 76]);
  for (const status of ["running", "paused"]) {
    game.status = status;
    const colors = game.render();
    assert.equal(colors.length, LED_COUNT);
    assert.ok(colors.every((color) => /^#[0-9a-f]{6}$/.test(color)));
    for (let index = 0; index < LED_COUNT; index++)
      assert.equal(
        colors[index] !== "#000000",
        expected.has(index),
        `LED ${index}`,
      );
    assert.notEqual(colors[0], colors[82], "players have distinct colors");
    assert.equal(colors[76], "#f4eee1", "a wide spacebar remains one ball LED");
    assert.equal(colors[83], "#000000");
  }
  game.ball = { x: 15.5, y: 0.5, vx: 0, vy: 0 };
  assert.equal(
    game.render()[14],
    "#f4eee1",
    "the decorative Del position projects to Ins, never LED 83",
  );
  const snapshot = game.snapshot();
  snapshot.ball.x = 1000;
  snapshot.paddles.left = 1000;
  assert.equal(game.ball.x, 15.5);
  assert.equal(game.paddles.left, 1);
});
