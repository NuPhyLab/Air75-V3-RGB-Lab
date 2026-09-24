import test from "node:test";
import assert from "node:assert/strict";
import { layout } from "../shared/layout.mjs";

test("photo-aligned function row is contiguous and Insert retains LED 14", () => {
  const row = layout.filter((key) => key.y === 0);
  assert.equal(row.length, 15);
  row.forEach((key, x) => {
    assert.equal(key.x, x);
    assert.equal(key.w, 1);
  });
  assert.equal(row[14].index, 14);
  assert.equal(row[14].code, "Insert");
  assert.equal(row[14].label, "Ins");
  assert(
    !layout.some((key) => key.label === "旋钮"),
    "the separate dial is not assigned a speculative LED",
  );
  assert.deepEqual(
    layout.map((key) => key.index),
    Array.from({ length: 83 }, (_, i) => i),
    "existing RGB indices stay stable",
  );
});

test("wide keys and rightmost column share the reference photo 16-unit grid", () => {
  for (const code of ["PageUp", "PageDown", "Home", "End", "ArrowRight"]) {
    const key = layout.find((key) => key.code === code);
    assert.equal(key.x, 15, code);
    assert.equal(key.w, 1, code);
  }
  const space = layout.find((key) => key.code === "Space");
  assert.equal(space.x, 3.75);
  assert.equal(space.w, 6.25);
  assert.equal(layout.find((key) => key.code === "CapsLock").w, 1.75);
  assert.equal(layout.find((key) => key.code === "ShiftLeft").w, 2.25);
  assert.equal(layout.find((key) => key.code === "ShiftRight").w, 1.75);
});
