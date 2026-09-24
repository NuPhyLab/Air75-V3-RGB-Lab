import { layout, blank, hsv } from "./layout.mjs";

export function scaleColor(hex, scale) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(hex.slice(i, i + 2), 16) * Math.max(0, Math.min(1, scale)),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function renderAnimation(colors, animation, elapsed) {
  const speed = animation.speed ?? 4,
    t = elapsed / 1000,
    effect = animation.effect ?? "static";
  if (effect === "static") return [...colors];
  if (effect === "frames") {
    const frames = animation.frames ?? [];
    if (!frames.length) return [...colors];
    const duration = frames.reduce((n, f) => n + f.duration, 0);
    // Stored frame durations describe speed 4. Keep the saved frames intact and
    // apply the same playback rate here and in animationDuration.
    const position = Math.max(0, elapsed) * (speed / 4);
    let at = animation.loop
      ? position % duration
      : Math.min(position, duration);
    for (const f of frames) {
      if (at < f.duration) return [...f.colors];
      at -= f.duration;
    }
    return [...frames.at(-1).colors];
  }
  if (effect === "pulse") {
    const power = 0.12 + 0.88 * (0.5 - 0.5 * Math.cos(t * speed * 0.9));
    return colors.map((c) => scaleColor(c, power));
  }
  if (effect === "wave") {
    const output = blank();
    for (const k of layout)
      output[k.index] = hsv(
        (((k.x / 18 - t * speed * 0.035 + k.y * 0.055) % 1) + 1) % 1,
      );
    return output;
  }
  if (effect === "move") {
    const output = blank(),
      vertical = ["up", "down"].includes(animation.direction),
      extent = vertical ? 6 : 17;
    const step = Math.floor(t * speed),
      delta = (["left", "up"].includes(animation.direction) ? -1 : 1) * step;
    for (const source of layout) {
      if (colors[source.index] === "#000000") continue;
      let pos = (vertical ? source.y : source.x + source.w / 2) + delta;
      if (animation.loop) pos = ((pos % extent) + extent) % extent;
      if (pos < 0 || pos >= extent) continue;
      const candidates = layout.filter((k) =>
        vertical
          ? Math.abs(k.x + k.w / 2 - (source.x + source.w / 2)) < 0.7
          : k.y === source.y,
      );
      let best = null,
        distance = Infinity;
      for (const k of candidates) {
        const d = Math.abs((vertical ? k.y : k.x + k.w / 2) - pos);
        if (d < distance) {
          best = k;
          distance = d;
        }
      }
      if (best && distance < 0.7) output[best.index] = colors[source.index];
    }
    return output;
  }
  return [...colors];
}
export function animationDuration(a) {
  if (a.loop || a.effect === "static") return Infinity;
  if (a.effect === "frames")
    return (
      (a.frames ?? []).reduce((n, f) => n + f.duration, 0) /
      ((a.speed ?? 4) / 4)
    );
  if (a.effect === "move")
    return (
      ((["up", "down"].includes(a.direction) ? 6 : 17) / (a.speed || 4)) * 1000
    );
  return ((2 * Math.PI) / ((a.speed || 4) * 0.9)) * 1000;
}
