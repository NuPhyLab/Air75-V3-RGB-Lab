const clampUnit = (value) =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

const wrapHue = (hue) => {
  if (!Number.isFinite(hue)) return 0;
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped || 0;
};

/** Preserve the user's hue (and, for black, saturation) when RGB cannot express it. */
export function hexToHsv(hex, fallbackHue = 0, fallbackSaturation = 0) {
  if (typeof hex !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) {
    throw new TypeError("颜色必须是 #RGB 或 #RRGGBB 格式");
  }
  const full = hex.length === 4
    ? [...hex.slice(1)].map((channel) => channel.repeat(2)).join("")
    : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((start) =>
    parseInt(full.slice(start, start + 2), 16) / 255,
  );
  const v = Math.max(r, g, b);
  const delta = v - Math.min(r, g, b);
  if (delta === 0) {
    return {
      h: wrapHue(fallbackHue),
      s: v === 0 ? clampUnit(fallbackSaturation) : 0,
      v,
    };
  }
  const sector = v === r
    ? (g - b) / delta
    : v === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return { h: wrapHue(sector * 60), s: delta / v, v };
}

/** HSV remains continuous until converting to the keyboard's 8-bit RGB channels. */
export function hsvToHex({ h, s, v }) {
  const hue = wrapHue(h) / 60;
  const value = clampUnit(v);
  const chroma = value * clampUnit(s);
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
  const channels = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ][Math.floor(hue)];
  const minimum = value - chroma;
  return `#${channels.map((channel) =>
    Math.round((channel + minimum) * 255).toString(16).padStart(2, "0"),
  ).join("").toUpperCase()}`;
}

/** Clockwise hue in screen coordinates: red at the right edge of the disc. */
export function pointToHueSaturation(dx, dy, radius, previousHue = 0) {
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || !Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) {
    return { h: wrapHue(previousHue), s: 0 };
  }
  return {
    h: wrapHue(Math.atan2(dy, dx) * 180 / Math.PI),
    s: clampUnit(distance / radius),
  };
}
