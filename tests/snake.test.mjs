import test from "node:test";
import assert from "node:assert/strict";
import { buildGameBoard, SnakeGame } from "../server/engine.mjs";
import { layout, LED_COUNT } from "../shared/layout.mjs";

const byCode = (code) => layout.find((key) => key.code === code);
const keyIndex = (code) => byCode(code).index;
const board = buildGameBoard();
function gameAt(index, direction = "right") {
  const game = new SnakeGame(() => 0);
  game.start();
  game.body = [index];
  game.direction = game.queued = direction;
  game.food = null;
  return game;
}

test("Snake includes every controllable physical key exactly once across all six rows", () => {
  const expected = layout
    .filter((key) => key.controllable !== false)
    .map((key) => key.index);
  assert.deepEqual(
    [...board.indices].sort((a, b) => a - b),
    [...expected].sort((a, b) => a - b),
  );
  assert.equal(board.rows.length, 6);
  assert.equal(new Set(board.indices).size, expected.length);
  assert.ok(
    new Set(board.rows.map((row) => row.length)).size > 1,
    "rows retain the irregular keyboard shape",
  );
  assert.equal(
    board.byIndex.has(83),
    expected.includes(83),
    "an unmapped LED is never invented as a playable key",
  );
  const snapshot = new SnakeGame().snapshot();
  assert.equal(snapshot.cellCount, expected.length);
  assert.equal(snapshot.height, 6);
});

test("every mapped key can reach every other mapped key through directional neighbors", () => {
  for (const origin of board.indices) {
    const reached = new Set([origin]);
    const queue = [origin];
    for (let i = 0; i < queue.length; i++) {
      for (const next of Object.values(board.neighbors.get(queue[i]))) {
        if (next !== null && !reached.has(next)) {
          assert.ok(board.byIndex.has(next));
          reached.add(next);
          queue.push(next);
        }
      }
    }
    assert.equal(
      reached.size,
      board.indices.length,
      `all keys reachable from LED ${origin}`,
    );
  }
});

test("food can occupy any physical key, including LED zero and the outer rows", () => {
  const game = new SnakeGame(() => 0.99);
  for (const target of board.indices) {
    game.body = board.indices.filter((index) => index !== target);
    assert.equal(game.spawnFood(), target);
  }
  game.body = [...board.indices];
  assert.equal(game.spawnFood(), null);
});

test("horizontal moves follow real adjacent keys and stop at each row's outer walls", () => {
  for (const row of board.rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const game = gameAt(row[i].index);
      game.tick();
      assert.equal(game.body[0], row[i + 1].index);
      assert.equal(game.status, "running");
    }
    for (const [head, direction] of [
      [row[0].index, "left"],
      [row.at(-1).index, "right"],
    ]) {
      const game = gameAt(head, direction);
      game.tick();
      assert.equal(game.status, "over");
      assert.equal(game.body[0], head);
    }
  }
});

test("vertical moves prefer a covering wide key, use nearest centers through gaps, and cross ragged row edges", () => {
  const keys = [
    { index: 0, x: 0, y: 0, w: 1 },
    { index: 1, x: 2, y: 0, w: 1 },
    { index: 2, x: 10, y: 0, w: 1 },
    { index: 3, x: 0, y: 1, w: 1.25 },
    { index: 4, x: 1.25, y: 1, w: 6.25 },
    { index: 5, x: 9, y: 1, w: 1 },
    { index: 83, x: 15, y: 0, w: 1, controllable: false },
  ];
  const custom = buildGameBoard(keys);
  assert.equal(custom.neighbors.get(1).down, 4);
  assert.equal(custom.neighbors.get(4).up, 1);
  assert.equal(custom.neighbors.get(2).down, 5);
  assert.equal(custom.neighbors.get(5).up, 2);
  assert.equal(custom.neighbors.get(0).up, null);
  assert.equal(custom.neighbors.get(4).down, null);
  assert.equal(custom.byIndex.has(83), false);
  for (const head of [board.rows[0][0].index, board.rows[0].at(-1).index]) {
    const game = gameAt(head, "down");
    game.tick();
    assert.equal(game.status, "running");
    assert.ok(board.rows[1].some((key) => key.index === game.body[0]));
  }
});

test("the wide space bar is one node entered from the keys above and exited in a single move", () => {
  const space = byCode("Space");
  assert.equal(
    board.indices.filter((index) => index === space.index).length,
    1,
  );
  const row = board.rows.find((keys) =>
    keys.some((key) => key.index === space.index),
  );
  const above = board.rows[board.rows.indexOf(row) - 1].filter(
    (key) =>
      key.x + key.w / 2 >= space.x && key.x + key.w / 2 < space.x + space.w,
  );
  assert.ok(above.length >= 3);
  for (const key of above)
    assert.equal(board.neighbors.get(key.index).down, space.index);
  const game = gameAt(above[0].index, "down");
  game.tick();
  assert.deepEqual(game.body, [space.index]);
  game.input("left");
  game.tick();
  assert.equal(game.body[0], row[row.indexOf(space) - 1].index);
});

test("top and bottom boundaries are walls rather than wrapping into another row", () => {
  for (const [head, direction] of [
    [board.rows[0][0].index, "up"],
    [board.rows.at(-1).at(-1).index, "down"],
  ]) {
    const game = gameAt(head, direction);
    game.tick();
    assert.equal(game.status, "over");
    assert.deepEqual(game.body, [head]);
  }
});

test("render lights only snake and food, leaving every other LED black", () => {
  const game = new SnakeGame(() => 0);
  game.start(7);
  assert.equal(game.snapshot().speed, 7);
  game.food = 0;
  for (const status of ["running", "paused", "over", "won"]) {
    game.status = status;
    const colors = game.render();
    assert.equal(colors.length, LED_COUNT);
    const expected = new Set([...game.body, game.food]);
    for (let index = 0; index < LED_COUNT; index++)
      assert.equal(
        colors[index] !== "#000000",
        expected.has(index),
        `${status} LED ${index}`,
      );
    assert.equal(colors[0], "#dd837a", "LED zero remains visible food");
    assert.equal(
      colors[game.body[0]],
      status === "over" ? "#a95050" : "#b8d8bd",
    );
  }
});

test("entering the tail's vacated key is allowed, but entering another body key collides", () => {
  const head = keyIndex("KeyF"),
    next = keyIndex("KeyG");
  const game = gameAt(head);
  game.body = [head, keyIndex("KeyD"), next];
  game.tick();
  assert.equal(game.status, "running");
  assert.deepEqual(game.body, [next, head, keyIndex("KeyD")]);
  const collision = gameAt(head);
  collision.body = [head, next, keyIndex("KeyD")];
  collision.tick();
  assert.equal(collision.status, "over");
  assert.deepEqual(collision.body, [head, next, keyIndex("KeyD")]);
});

test("eating the final free key wins, preserves best score, and leaves no food", () => {
  const game = gameAt(keyIndex("KeyF"));
  const final = keyIndex("KeyG");
  game.body = [
    game.body[0],
    ...board.indices.filter(
      (index) => index !== game.body[0] && index !== final,
    ),
  ];
  game.food = final;
  game.score = board.indices.length - 4;
  game.tick();
  assert.equal(game.status, "won");
  assert.equal(game.body.length, board.indices.length);
  assert.equal(game.food, null);
  assert.equal(game.score, board.indices.length - 3);
  assert.equal(game.bestScore, game.score);
  assert.equal(
    game.render().filter((color) => color !== "#000000").length,
    board.indices.length,
  );
  game.start();
  assert.equal(game.score, 0);
  assert.equal(game.bestScore, board.indices.length - 3);
});

test("snapshots expose physical LED indices without sharing a mutable body array", () => {
  const game = new SnakeGame(() => 0);
  game.start();
  const state = game.snapshot();
  assert.ok(
    state.body.every(
      (index) => Number.isInteger(index) && board.byIndex.has(index),
    ),
  );
  state.body.length = 0;
  assert.equal(game.body.length, 3);
});
