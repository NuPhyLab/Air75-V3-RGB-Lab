import test from "node:test";
import assert from "node:assert/strict";
import { WhackGame } from "../server/games/whack.mjs";
import { MemoryGame } from "../server/games/memory.mjs";
import { layout } from "../shared/layout.mjs";

const codeAt = (index) => layout.find((key) => key.index === index)?.code;
const litIndices = (game) => {
  const colors = game.render();
  assert.equal(colors.length, 84);
  assert.ok(colors.every((color) => /^#[0-9a-f]{6}$/.test(color)));
  assert.equal(colors[83], "#000000");
  return colors.flatMap((color, index) => color === "#000000" ? [] : [index]);
};

// Read only the public, currently visible cues: no access to future sequence data.
function watchSequence(game) {
  const observed = [];
  let steps = 0;
  while (game.snapshot().phase === "watch") {
    assert.ok(++steps < 100);
    game.tick(game.snapshot().remainingMs);
    const state = game.snapshot();
    if (state.phase === "watch" && state.cueIndex !== null)
      observed.push(codeAt(state.cueIndex));
  }
  assert.equal(game.snapshot().phase, "input");
  return observed;
}

test("Whack lights one actual letter, scores hits, avoids repeats, and counts mistakes", () => {
  const game = new WhackGame(() => 0);
  assert.deepEqual(litIndices(game), []);
  const first = game.start();
  assert.equal(first.type, "whack");
  assert.equal(first.remainingMs, 30_000);
  assert.match(first.targetCode, /^Key[A-Z]$/);
  assert.deepEqual(litIndices(game), [first.target]);
  game.input({ code: first.targetCode, pressed: false });
  game.input({ code: "F1" });
  assert.equal(game.score, 0);
  const wrong = layout.find((key) => /^Key[A-Z]$/.test(key.code) && key.code !== first.targetCode);
  game.input({ code: wrong.code });
  assert.equal(game.snapshot().mistakes, 1);
  assert.equal(game.snapshot().target, first.target);
  game.input({ code: first.targetCode });
  const next = game.snapshot();
  assert.equal(next.hits, 1);
  assert.equal(next.score, 1);
  assert.equal(next.bestScore, 1);
  assert.notEqual(next.target, first.target);
  assert.deepEqual(litIndices(game), [next.target]);
  assert.equal(game.start().bestScore, 1);
  assert.equal(game.score, 0);
});

test("Whack deadlines are incremental, count expiration once, and end at 30 seconds", () => {
  const game = new WhackGame(() => 0);
  const start = game.start(10);
  game.tick(start.targetLifetimeMs - 1);
  assert.equal(game.snapshot().misses, 0);
  assert.equal(game.snapshot().target, start.target);
  game.tick(1);
  assert.equal(game.snapshot().misses, 1);
  assert.notEqual(game.snapshot().target, start.target);
  game.tick(60_000);
  const over = game.snapshot();
  assert.equal(over.status, "over");
  assert.equal(over.remainingMs, 0);
  assert.equal(over.target, null);
  assert.equal(over.targetCode, null);
  assert.equal(over.misses, Math.floor(30_000 / start.targetLifetimeMs));
  assert.deepEqual(litIndices(game), []);
  game.input({ code: start.targetCode });
  game.tick(10_000);
  assert.deepEqual(game.snapshot(), over);
});

test("Whack pause freezes input and both timers; resumed time is not wall time", () => {
  const game = new WhackGame(() => 0.5);
  game.start();
  game.tick(500);
  game.status = "paused";
  const paused = game.snapshot();
  game.tick(120_000);
  game.input({ code: paused.targetCode });
  assert.deepEqual(game.snapshot(), paused);
  assert.deepEqual(litIndices(game), [paused.target]);
  game.status = "running";
  game.tick(25);
  assert.equal(game.snapshot().remainingMs, paused.remainingMs - 25);
  assert.equal(game.snapshot().targetRemainingMs, paused.targetRemainingMs - 25);
});

test("Whack handles large time steps identically to small steps and excludes unmapped LEDs", () => {
  const keys = [
    { code: "KeyA", index: 0 },
    { code: "KeyB", index: 1 },
    { code: "KeyC", index: 83 },
    { code: "KeyD", index: 2, controllable: false },
  ];
  const a = new WhackGame(() => 1, keys);
  const b = new WhackGame(() => 1, keys);
  a.start(6);
  b.start(6);
  a.tick(7_050);
  for (let n = 0; n < 141; n++) b.tick(50);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.ok([0, 1].includes(a.snapshot().target));
  assert.deepEqual(litIndices(a), [a.snapshot().target]);
  assert.throws(() => new WhackGame(() => 0, []), /letter keys/);
  const before = a.snapshot();
  for (const invalid of [-1, NaN, Infinity, undefined]) a.tick(invalid);
  assert.deepEqual(a.snapshot(), before);
});

test("Memory plays visible cues with dark gaps and ignores input while watching", () => {
  const game = new MemoryGame(() => 0);
  const start = game.start(4);
  assert.equal(start.type, "memory");
  assert.equal(start.round, 1);
  assert.equal(start.sequenceLength, 1);
  assert.equal(start.cueIndex, null);
  assert.equal("sequence" in start, false);
  assert.deepEqual(start.padCodes, ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"]);
  assert.deepEqual(litIndices(game), []);
  game.input({ code: "KeyA" });
  assert.deepEqual(game.snapshot(), start);
  game.tick(500);
  const cue = game.snapshot();
  assert.equal(cue.cueIndex, start.padIndices[0]);
  assert.deepEqual(litIndices(game), [cue.cueIndex]);
  game.input({ code: "KeyS" });
  assert.equal(game.status, "running");
  game.tick(cue.remainingMs);
  assert.equal(game.snapshot().phase, "watch");
  assert.equal(game.snapshot().cueIndex, null);
  assert.ok(game.snapshot().remainingMs >= 200);
  assert.deepEqual(litIndices(game), []);
  game.tick(game.snapshot().remainingMs);
  assert.equal(game.snapshot().phase, "input");
  assert.equal(game.snapshot().remainingMs, 10_000);
  assert.deepEqual(litIndices(game), []);
});

test("Memory grows the same sequence, gives brief input feedback, and scores complete rounds", () => {
  const samples = [0, 0.999];
  const game = new MemoryGame(() => samples.shift() ?? 0.5);
  game.start();
  const first = watchSequence(game);
  assert.deepEqual(first, ["KeyA"]);
  game.input({ code: first[0], pressed: false });
  game.input({ code: "F1" });
  assert.equal(game.score, 0);
  game.input({ code: first[0] });
  assert.equal(game.snapshot().phase, "success");
  assert.equal(game.score, 1);
  assert.equal(game.bestScore, 1);
  assert.equal(litIndices(game).length, 1);
  game.tick(game.snapshot().remainingMs);
  assert.equal(game.snapshot().round, 2);
  const second = watchSequence(game);
  assert.deepEqual(second, ["KeyA", "Semicolon"]);
  game.tick(9_900);
  game.input({ code: second[0] });
  assert.equal(game.score, 1);
  assert.equal(game.snapshot().inputIndex, 1);
  assert.equal(game.snapshot().remainingMs, 10_000);
  assert.deepEqual(litIndices(game), [game.snapshot().padIndices[0]]);
  game.tick(160);
  assert.deepEqual(litIndices(game), []);
  game.input({ code: second[1] });
  assert.equal(game.score, 2);
  assert.equal(game.snapshot().phase, "success");
  assert.equal(game.start().bestScore, 2);
});

test("Memory wrong game key ends immediately with only that key as error feedback", () => {
  const game = new MemoryGame(() => 0);
  game.start();
  watchSequence(game);
  game.input({ code: "KeyS" });
  const over = game.snapshot();
  assert.equal(over.status, "over");
  assert.equal(over.phase, "error");
  assert.equal(over.score, 0);
  assert.equal(over.remainingMs, 0);
  assert.deepEqual(litIndices(game), [over.padIndices[1]]);
  assert.equal(game.render()[over.padIndices[1]], "#d96768");
  game.tick(5_000);
  game.input({ code: "KeyA" });
  assert.deepEqual(game.snapshot(), over);
});

test("Memory times out at ten seconds and pause preserves cues and deadline", () => {
  const game = new MemoryGame(() => 0);
  game.start();
  game.tick(500);
  game.status = "paused";
  const watching = game.snapshot();
  game.tick(60_000);
  game.input({ code: "KeyA" });
  assert.deepEqual(game.snapshot(), watching);
  assert.deepEqual(litIndices(game), [watching.cueIndex]);
  game.status = "running";
  watchSequence(game);
  game.tick(9_999);
  game.status = "paused";
  const paused = game.snapshot();
  game.tick(60_000);
  game.input({ code: "KeyA" });
  assert.deepEqual(game.snapshot(), paused);
  game.status = "running";
  game.tick(1);
  assert.equal(game.status, "over");
  assert.equal(game.snapshot().phase, "error");
  assert.equal(game.snapshot().remainingMs, 0);
  assert.deepEqual(litIndices(game), []);
});

test("Memory reaches a real twenty-round win using only observed cues", () => {
  let sample = 0;
  const game = new MemoryGame(() => (sample++ % 8) / 8);
  game.start(10);
  let previous = [];
  for (let round = 1; round <= 20; round++) {
    const observed = watchSequence(game);
    assert.equal(observed.length, round);
    assert.deepEqual(observed.slice(0, -1), previous);
    for (const code of observed) game.input({ code });
    assert.equal(game.score, round);
    if (round < 20) game.tick(game.snapshot().remainingMs);
    previous = observed;
  }
  const win = game.snapshot();
  assert.equal(win.status, "won");
  assert.equal(win.phase, "success");
  assert.equal(win.bestScore, 20);
  assert.equal(win.round, 20);
  assert.equal(win.goalRounds, 20);
  assert.equal(litIndices(game).length, 1);
  game.tick(1_000_000);
  game.input({ code: "KeyA" });
  assert.deepEqual(game.snapshot(), win);
});

test("Memory snapshots cannot mutate pads, timing is deterministic, and index 83 is excluded", () => {
  const a = new MemoryGame(() => 0.8);
  const b = new MemoryGame(() => 0.8);
  const snapshot = a.start();
  b.start();
  snapshot.padIndices[0] = 83;
  snapshot.padCodes[0] = "KeyZ";
  assert.equal(a.snapshot().padCodes[0], "KeyA");
  assert.notEqual(a.snapshot().padIndices[0], 83);
  a.tick(1_200);
  for (let n = 0; n < 24; n++) b.tick(50);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.tick(60_000);
  assert.equal(a.status, "over");
  assert.deepEqual(litIndices(a), []);
  const before = b.snapshot();
  for (const invalid of [-1, NaN, Infinity, undefined]) b.tick(invalid);
  assert.deepEqual(b.snapshot(), before);
  assert.throws(() => new MemoryGame(() => 0, layout.map((key) => key.code === "KeyA" ? { ...key, index: 83 } : key)), /controllable KeyA/);
});
