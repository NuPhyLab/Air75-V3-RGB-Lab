import { layout, blank, LED_COUNT } from "../shared/layout.mjs";
export {
  scaleColor,
  renderAnimation,
  animationDuration,
} from "../shared/render-animation.mjs";

import { statusColor } from "../shared/codex-lighting.mjs";
export function overlayCodex(colors, slots) {
  const out = [...colors];
  for (let i = 0; i < 6; i++) out[i+1] = statusColor(slots[i]);
  return out;
}
// Each controllable physical key is one node, including wide keys. Gaps in a
// row are crossed by a horizontal move; only the outer row edges are walls.
export function buildGameBoard(keys = layout) {
  const byIndex = new Map();
  for (const key of keys) {
    if (key.controllable === false) continue;
    if (
      !Number.isInteger(key.index) ||
      key.index < 0 ||
      key.index >= LED_COUNT ||
      !Number.isFinite(key.x) ||
      !Number.isFinite(key.y) ||
      !Number.isFinite(key.w) ||
      key.w <= 0 ||
      byIndex.has(key.index)
    )
      throw new TypeError(
        "Snake layout requires unique controllable key indices and valid geometry",
      );
    byIndex.set(key.index, key);
  }
  const rowPositions = [
    ...new Set([...byIndex.values()].map((key) => key.y)),
  ].sort((a, b) => a - b);
  const rows = rowPositions.map((y) =>
    [...byIndex.values()]
      .filter((key) => key.y === y)
      .sort((a, b) => a.x - b.x || a.index - b.index),
  );
  const verticalTarget = (key, row) => {
    if (!row?.length) return null;
    const center = key.x + key.w / 2;
    // A key covering the head's center wins; gaps use the nearest key center.
    // Half-open spans make an exact shared boundary deterministic.
    const covering = row.filter(
      (candidate) =>
        candidate.x <= center && center < candidate.x + candidate.w,
    );
    const candidates = covering.length ? covering : row;
    let closest = candidates[0];
    for (const candidate of candidates) {
      if (
        Math.abs(candidate.x + candidate.w / 2 - center) <
        Math.abs(closest.x + closest.w / 2 - center)
      )
        closest = candidate;
    }
    return closest.index;
  };
  const neighbors = new Map();
  rows.forEach((row, y) =>
    row.forEach((key, x) =>
      neighbors.set(key.index, {
        left: row[x - 1]?.index ?? null,
        right: row[x + 1]?.index ?? null,
        up: verticalTarget(key, rows[y - 1]),
        down: verticalTarget(key, rows[y + 1]),
      }),
    ),
  );
  return {
    rows,
    byIndex,
    neighbors,
    indices: rows.flat().map((key) => key.index),
  };
}
export const gameRows = buildGameBoard().rows;
export class SnakeGame {
  constructor(random = Math.random, keys = layout) {
    this.random = random;
    this.board = buildGameBoard(keys);
    this.status = "idle";
    this.score = 0;
    this.bestScore = 0;
    this.speed = 4;
    this.direction = "right";
    this.queued = "right";
    this.width = Math.max(0, ...this.board.rows.map((row) => row.length));
    this.height = this.board.rows.length;
    this.body = [];
    this.food = null;
  }
  start(speed = 4) {
    this.status = "running";
    this.score = 0;
    this.speed = speed;
    this.direction = "right";
    this.queued = "right";
    const row = this.board.rows[Math.min(3, this.height - 1)] ?? [];
    const headAt = Math.min(4, row.length - 1);
    this.body = row
      .slice(Math.max(0, headAt - 2), headAt + 1)
      .reverse()
      .map((key) => key.index);
    this.food = this.spawnFood();
    if (this.food === null) this.status = "won";
    this.inputPending = false;
    return this.snapshot();
  }
  spawnFood() {
    const occupied = new Set(this.body);
    const free = this.board.indices.filter((index) => !occupied.has(index));
    if (!free.length) return null;
    const sample = Number(this.random());
    const at = Number.isFinite(sample)
      ? Math.max(0, Math.min(free.length - 1, Math.floor(sample * free.length)))
      : 0;
    return free[at];
  }
  input(d) {
    if (this.status !== "running" || this.inputPending) return;
    const inverse = { left: "right", right: "left", up: "down", down: "up" };
    if (!Object.hasOwn(inverse, d) || d === inverse[this.direction]) return;
    this.queued = d;
    this.inputPending = true;
  }
  tick() {
    if (this.status !== "running") return;
    this.direction = this.queued;
    this.inputPending = false;
    const head =
      this.board.neighbors.get(this.body[0])?.[this.direction] ?? null;
    const eating = this.food !== null && head === this.food;
    const solid = eating ? this.body : this.body.slice(0, -1);
    if (head === null || solid.includes(head)) {
      this.status = "over";
      return;
    }
    this.body.unshift(head);
    if (eating) {
      this.score++;
      this.bestScore = Math.max(this.bestScore, this.score);
      this.food = this.spawnFood();
      if (this.food === null) this.status = "won";
    } else this.body.pop();
  }
  render() {
    const colors = blank();
    this.body.forEach((index, i) => {
      if (!this.board.byIndex.has(index)) return;
      colors[index] =
        this.status === "over" ? "#a95050" : i === 0 ? "#b8d8bd" : "#588b7b";
    });
    if (this.food !== null && this.board.byIndex.has(this.food))
      colors[this.food] = "#dd837a";
    return colors;
  }
  snapshot() {
    return {
      status: this.status,
      score: this.score,
      bestScore: this.bestScore,
      speed: this.speed,
      direction: this.direction,
      width: this.width,
      height: this.height,
      cellCount: this.board.indices.length,
      body: [...this.body],
      food: this.food,
    };
  }
}
