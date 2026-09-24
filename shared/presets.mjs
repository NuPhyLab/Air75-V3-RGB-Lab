import heartKeys from "./heart-keys.json" with { type: "json" };

export const DEFAULT_COLOR = "#dc847b";
const BLACK = "#000000";
const blank = () => Array(84).fill(BLACK);
const animation = (effect = "static", frames = [], speed = 4) => ({
  effect,
  direction: "right",
  speed,
  loop: true,
  frames,
});
const center = (key) => [key.x + key.w / 2, key.y + (key.h ?? 1) / 2];

export function heartColors(keys, color = DEFAULT_COLOR) {
  const colors = blank();
  for (const key of keys)
    if (heartKeys.includes(key.code)) colors[key.index] = color;
  return colors;
}

// Five rows of ordinary keycaps give each graphic a legible silhouette without
// stretching its bottom pixel across the six-unit Space key. Snap each point
// onto the actual row's key centers instead of treating this as a square grid.
function stencil(keys, rows, color) {
  const colors = blank();
  rows.forEach((row, y) => {
    const candidates = keys.filter((key) => key.y === y && key.w <= 1.5);
    [...row].forEach((pixel, x) => {
      if (pixel !== "#") return;
      const targetX = 5.5 + x;
      const key = candidates.reduce((best, current) => {
        const distance = Math.abs(center(current)[0] - targetX);
        return !best || distance < best.distance
          ? { key: current, distance }
          : best;
      }, null);
      if (key && key.distance <= 0.6) colors[key.key.index] = color;
    });
  });
  return colors;
}

function tint(hex, amount) {
  if (amount < 0.045) return BLACK;
  const level = Math.min(1, Math.max(0, amount));
  return "#" + [1, 3, 5].map((start) =>
    Math.round(parseInt(hex.slice(start, start + 2), 16) * level)
      .toString(16).padStart(2, "0"),
  ).join("");
}

function framesFor(keys, count, duration, render) {
  return Array.from({ length: count }, (_, frame) => {
    const colors = blank();
    for (const key of keys) colors[key.index] = render(key, frame / count);
    return { colors, duration };
  });
}

function movingPreset(id, name, description, frames, previewFrame) {
  return {
    id,
    name,
    category: "motion",
    description,
    colors: frames[previewFrame].colors.slice(),
    animation: animation("frames", frames),
  };
}

export function createPresets(keys) {
  const graphic = (id, name, description, colors, render, count = 40, duration = 100) => ({
    id, name, category: "pattern", description, colors,
    animation: animation("frames", framesFor(keys, count, duration, render)),
  });
  const mix = (a, b, amount) => "#" + [1, 3, 5].map(start => {
    const left = parseInt(a.slice(start, start + 2), 16);
    const right = parseInt(b.slice(start, start + 2), 16);
    return Math.round(left + (right - left) * amount).toString(16).padStart(2, "0");
  }).join("");
  const cycle = phase => (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const smile = stencil(keys, [
    ".#...#.", ".#...#.", ".......", ".#...#.", "..###..",
  ], "#efb34f");
  const wink = stencil(keys, [
    ".#.....", ".#..###", ".......", ".#...#.", "..###..",
  ], "#efb34f");
  const star = stencil(keys, [
    "...#...", "#######", ".#####.", "..#.#..", ".#...#.",
  ], "#efc366");
  const moon = stencil(keys, [
    "..###..", ".##....", "##.....", ".##....", "..###..",
  ], "#8fbde8");
  const wings = stencil(keys, [
    "##...##", "###.###", ".#####.", ".##.##.", ".#...#.",
  ], "#d68bb5");
  const folded = stencil(keys, [
    "..#.#..", "..###..", "...#...", "..###..", "..#.#..",
  ], "#d68bb5");
  const arrow = stencil(keys, [
    "....#..", "....##.", "#######", "....##.", "....#..",
  ], "#78c5aa");

  const points = keys.map(center);
  const minX = points.length ? Math.min(...points.map(([x]) => x)) : 0.5;
  const maxX = points.length ? Math.max(...points.map(([x]) => x)) : 15.5;
  const midX = (minX + maxX) / 2;
  const maxRadius = Math.max(1, ...points.map(([x, y]) => Math.hypot(x - midX, y - 2.5)));

  const comet = framesFor(keys, 32, 100, (key, phase) => {
    const [x, y] = center(key);
    const headX = minX - 2 + phase * (maxX - minX + 9);
    const behind = headX - x;
    const offTrack = Math.abs(y - 2.5);
    const head = Math.max(0, 1 - Math.hypot(behind, offTrack) / 1.25);
    const tail = behind >= 0 && behind <= 4.5 && offTrack <= 0.7
      ? (1 - behind / 4.5) * 0.72 : 0;
    return tint("#92cddd", Math.max(head, tail));
  });

  const ripple = framesFor(keys, 32, 110, (key, phase) => {
    const [x, y] = center(key);
    const distance = Math.hypot(x - midX, y - 2.5);
    const radius = -1.5 + phase * (maxRadius + 7);
    const outer = Math.max(0, 1 - Math.abs(distance - radius) / 1.05);
    const inner = radius >= 2.7
      ? Math.max(0, 1 - Math.abs(distance - (radius - 2.7)) / 0.9) * 0.48 : 0;
    return tint("#83b5dc", Math.max(outer, inner));
  });

  const twinkle = framesFor(keys, 28, 120, (key, phase) => {
    // An index-based seed keeps the preset identical when reopened or exported.
    const seed = ((key.index * 47 + 13) % 101) / 101;
    if (seed < 0.72) return BLACK;
    const moment = (phase + ((key.index * 29) % 83) / 83) % 1;
    const glow = moment < 0.4 ? Math.sin(Math.PI * moment / 0.4) ** 2 : 0;
    return tint(key.index % 3 ? "#b2a0d7" : "#d3b7df", glow);
  });

  const rainColumns = [1, 3.4, 5.8, 8.2, 10.6, 13, 15];
  const rain = framesFor(keys, 28, 120, (key, phase) => {
    const [x, y] = center(key);
    let glow = 0;
    rainColumns.forEach((column, index) => {
      const headY = -2 + ((phase + index * 0.267) % 1) * 10;
      const behind = headY - y;
      if (Math.abs(x - column) <= 0.66 && behind >= -0.55 && behind <= 2.2)
        glow = Math.max(glow, behind < 0 ? 1 + behind : 1 - behind / 2.5);
    });
    return tint("#dfb475", glow);
  });

  const scan = framesFor(keys, 32, 100, (key, phase) => {
    const [x] = center(key);
    const scanX = midX - Math.cos(phase * Math.PI * 2) * ((maxX - minX) / 2 + 1.5);
    const glow = Math.max(0, 1 - Math.abs(x - scanX) / 1.45);
    return tint("#8fc4b0", glow);
  });

  const mintColors = blank();
  for (const key of keys) mintColors[key.index] = "#91bcae";

  return [
    {
      id: "heart", name: "一颗小心意", category: "pattern",
      description: "熟悉的右侧爱心，缓缓亮起，再轻轻暗下。",
      colors: heartColors(keys), animation: animation("pulse", [], 2),
    },
    graphic("smile", "眨个眼", "暖黄色的小笑脸，偶尔向你眨一下眼。", smile, (key, phase) => {
      const blink = phase > 0.62 && phase < 0.86 ? Math.sin((phase - 0.62) / 0.24 * Math.PI) ** 2 : 0;
      return tint(mix(smile[key.index], wink[key.index], blink), 1 - 0.12 * cycle(phase));
    }, 40, 120),
    graphic("star", "星光闪闪", "金色星芒依次闪耀，轮廓始终清晰。", star, (key, phase) => {
      const [x, y] = center(key);
      return tint(star[key.index], 0.32 + 0.68 * cycle(phase + Math.atan2(y - 2.5, x - 8.5) / (Math.PI * 2)));
    }),
    graphic("crescent", "月光轻漾", "一弯蓝色月牙，月光沿着轮廓轻轻流淌。", moon, (key, phase) => {
      const [, y] = center(key);
      return tint(moon[key.index], 0.35 + 0.65 * cycle(phase - y * 0.1));
    }, 40, 120),
    graphic("butterfly", "蝴蝶振翅", "粉紫色的翅膀轻轻收拢，再慢慢展开。", wings, (key, phase) =>
      mix(wings[key.index], folded[key.index], cycle(phase)), 32, 100),
    graphic("arrow", "向右流光", "薄荷色的光从箭尾流向箭尖，循环向前。", arrow, (key, phase) => {
      const [x] = center(key);
      const highlight = Math.max(0, 1 - Math.abs(x - (3 + phase * 12)) / 1.8);
      return tint(arrow[key.index], 0.2 + 0.8 * highlight);
    }),
    {
      id: "mint-breath", name: "薄荷呼吸", category: "motion",
      description: "整把键盘缓缓明暗，保持同一种薄荷色。",
      colors: mintColors, animation: animation("pulse"),
    },
    movingPreset("comet", "流星划过", "冰蓝光点拖着尾巴，从左向右划过。", comet, 14),
    movingPreset("ripple", "蓝色涟漪", "两圈蓝色光环从中心向外散开。", ripple, 12),
    movingPreset("twinkle", "紫色星点", "零散的淡紫星点交替明灭。", twinkle, 6),
    movingPreset("rain", "琥珀落雨", "琥珀色光滴带着短尾，自上而下落下。", rain, 10),
    movingPreset("scan", "青绿扫描", "一束青绿色灯光在左右之间往返。", scan, 8),
  ];
}
