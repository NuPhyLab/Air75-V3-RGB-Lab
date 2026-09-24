import test from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hsvToHex, pointToHueSaturation } from "../shared/color.mjs";

test("HSV maps the six primary and secondary colors in clockwise hue order", () => {
  const colors = ["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF"];
  colors.forEach((hex, i) => {
    const hsv = { h: i * 60, s: 1, v: 1 };
    assert.equal(hsvToHex(hsv), hex);
    assert.deepEqual(hexToHsv(hex), hsv);
  });
  assert.equal(hsvToHex({ h: 30, s: 1, v: 1 }), "#FF8000");
  assert.deepEqual(hexToHsv("#f80"), hexToHsv("#FF8800"));
});

test("gray remembers hue and black remembers both hue and saturation", () => {
  assert.deepEqual(hexToHsv("#808080", 215, 0.7), { h: 215, s: 0, v: 128 / 255 });
  assert.deepEqual(hexToHsv("#FFFFFF", 215, 0.7), { h: 215, s: 0, v: 1 });
  const black = hexToHsv("#000000", 215.75, 0.73);
  assert.deepEqual(black, { h: 215.75, s: 0.73, v: 0 });
  assert.equal(hsvToHex(black), "#000000");
  assert.equal(hsvToHex({ ...black, v: 1 }), "#4590FF");
  assert.deepEqual(hexToHsv("#000000", -30, 2), { h: 330, s: 1, v: 0 });
});

test("HSV wraps hue and clamps channel ranges without quantizing input hue", () => {
  assert.equal(hsvToHex({ h: -60, s: 1, v: 1 }), "#FF00FF");
  assert.equal(hsvToHex({ h: 720, s: 1, v: 1 }), "#FF0000");
  assert.equal(hsvToHex({ h: 120, s: 2, v: 2 }), "#00FF00");
  assert.equal(hsvToHex({ h: 120, s: -1, v: 1 }), "#FFFFFF");
  assert.equal(hsvToHex({ h: 120, s: 1, v: -1 }), "#000000");
  assert.notEqual(hsvToHex({ h: 30, s: 1, v: 1 }), hsvToHex({ h: 30.3, s: 1, v: 1 }));
});

test("8-bit RGB survives an HSV round trip across a representative color cube", () => {
  const values = [0, 1, 2, 17, 32, 64, 96, 127, 128, 160, 192, 224, 253, 254, 255];
  for (const r of values) {
    for (const g of values) {
      for (const b of values) {
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
        assert.equal(hsvToHex(hexToHsv(hex)), hex, hex);
      }
    }
  }
});

test("the color disc follows pointer direction, retains subpixel precision, and clamps at its edge", () => {
  assert.deepEqual(pointToHueSaturation(100, 0, 100), { h: 0, s: 1 });
  assert.deepEqual(pointToHueSaturation(0, 100, 100), { h: 90, s: 1 });
  assert.deepEqual(pointToHueSaturation(-100, 0, 100), { h: 180, s: 1 });
  assert.deepEqual(pointToHueSaturation(0, -100, 100), { h: 270, s: 1 });
  assert.deepEqual(pointToHueSaturation(500, 0, 100), { h: 0, s: 1 });
  assert.deepEqual(pointToHueSaturation(12.345, 0, 100), { h: 0, s: 0.12345 });
  assert.deepEqual(pointToHueSaturation(0, 0, 100, 217.25), { h: 217.25, s: 0 });
  assert.deepEqual(pointToHueSaturation(1, 1, 0, 217.25), { h: 217.25, s: 0 });
  const diagonal = pointToHueSaturation(25, -25, 100);
  assert.equal(diagonal.h, 315);
  assert.ok(Math.abs(diagonal.s - Math.SQRT2 / 4) < 1e-12);
});

test("invalid hex input is rejected before it can create a malformed RGB command", () => {
  for (const value of ["", "red", "#1234", "#GG0000", null]) {
    assert.throws(() => hexToHsv(value), TypeError);
  }
});
