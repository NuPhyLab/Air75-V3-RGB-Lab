import test from "node:test";
import assert from "node:assert/strict";
import { SnakeGame } from "../server/engine.mjs";
import { Store } from "../server/storage.mjs";
import { blank, layout } from "../shared/layout.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("unknown direction names cannot corrupt a running Snake board through object prototype keys", () => {
  for (const direction of [
    "constructor",
    "toString",
    "__proto__",
    "not-a-direction",
  ]) {
    const game = new SnakeGame(() => 0);
    game.start();
    game.input(direction);
    game.tick();
    assert.equal(game.body[0], layout.find((key) => key.code === "KeyG").index, `rejected ${direction}`);
    assert.equal(game.render().length, 84);
  }
});

test("invalid animation object in an imported library is rejected atomically", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "air-studio-import-review-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new Store(dir).load();
  await store.saveScene({ name: "Existing work", colors: blank() });
  await assert.rejects(
    store.importScenes([
      { name: "Malformed animation", colors: blank(), animation: [] },
    ]),
  );
  assert.equal(store.data.scenes.length, 1);
  assert.equal(
    (await new Store(dir).load()).data.scenes[0].name,
    "Existing work",
  );
});
