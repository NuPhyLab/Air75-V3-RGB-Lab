// Layout measured by ShallowRed/nuphy-leds (MIT); see THIRD_PARTY_NOTICES.md.
import { createPresets } from "./presets.mjs";
import raw from "./air75-v3-ansi.json" with { type: "json" };
import heartKeys from "./heart-keys.json" with { type: "json" };
export const LED_COUNT = 84;
const names = {
  esc: "Escape",
  scr: "PrintScreen",
  ins: "Insert",
  tab: "Tab",
  caps: "CapsLock",
  enter: "Enter",
  pgup: "PageUp",
  pgdn: "PageDown",
  home: "Home",
  end: "End",
  "⌫": "Backspace",
  "`": "Backquote",
  "-": "Minus",
  "=": "Equal",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "": "Space",
  "↑": "ArrowUp",
  "←": "ArrowLeft",
  "↓": "ArrowDown",
  "→": "ArrowRight",
  fn: "Fn",
};
export const layout = raw.rows.flatMap((row, y) => {
  let x = 0;
  return row.map((k) => {
    const p = {
      index: k.i,
      code:
        names[k.l] ??
        (/^[A-Z]$/.test(k.l)
          ? "Key" + k.l
          : /^[0-9]$/.test(k.l)
            ? "Digit" + k.l
            : k.l === "shift"
              ? k.i === 59
                ? "ShiftLeft"
                : "ShiftRight"
              : k.l === "ctrl"
                ? k.i === 73
                  ? "ControlLeft"
                  : "ControlRight"
                : k.l === "cmd"
                  ? k.i === 75
                    ? "MetaLeft"
                    : "MetaRight"
                  : k.l === "alt"
                    ? "AltLeft"
                    : k.l),
      label:
        {
          esc: "Esc",
          scr: "截图",
          ins: "Ins",
          tab: "Tab",
          caps: "Caps",
          enter: "Enter",
          pgup: "PgUp",
          pgdn: "PgDn",
          home: "Home",
          end: "End",
          shift: "Shift",
          ctrl: "Ctrl",
          alt: "Opt",
          cmd: "⌘",
          fn: "Fn",
        }[k.l] ?? k.l,
      x,
      y,
      w: k.w ?? 1,
      h: 1,
    };
    x += p.w;
    return p;
  });
});
export const blank = () => Array(LED_COUNT).fill("#000000");
export function hsv(h, s = 0.55, v = 0.85) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + f(5) + f(3) + f(1);
}
export function heart(color = "#dc847b") {
  const c = blank();
  for (const key of layout)
    if (heartKeys.includes(key.code)) c[key.index] = color;
  return c;
}
export const defaultAnimation = {
  effect: "static",
  direction: "right",
  speed: 4,
  loop: true,
  frames: [],
};
// Keep the historical lowercase RGB form for server consumers.
export const presets = () => createPresets(layout).map((preset) => ({
  ...preset,
  colors: preset.colors.map((color) => color.toLowerCase()),
  animation: {
    ...preset.animation,
    ...(preset.animation.frames ? { frames: preset.animation.frames.map((frame) => ({
      ...frame, colors: frame.colors.map((color) => color.toLowerCase()),
    })) } : {}),
  },
}));
