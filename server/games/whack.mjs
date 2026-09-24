import { blank, layout, LED_COUNT } from "../../shared/layout.mjs";

const ROUND_MS = 30_000;

export class WhackGame {
  constructor(random = Math.random, keys = layout) {
    this.random = random;
    this.pads = keys
      .filter(
        (key) =>
          /^Key[A-Z]$/.test(key.code) &&
          key.controllable !== false &&
          Number.isInteger(key.index) &&
          key.index >= 0 &&
          key.index < LED_COUNT - 1,
      )
      .map(({ index, code }) => ({ index, code }));
    if (!this.pads.length) throw new TypeError("Whack requires letter keys");
    this.type = "whack";
    this.status = "idle";
    this.score = 0;
    this.bestScore = 0;
    this.speed = 4;
    this.hits = 0;
    this.misses = 0;
    this.mistakes = 0;
    this.remainingMs = ROUND_MS;
    this.target = null;
    this.targetCode = null;
    this.targetRemainingMs = 0;
    this.targetLifetimeMs = 1_360;
  }

  start(speed = 4) {
    this.speed = Number.isFinite(speed)
      ? Math.max(1, Math.min(10, Math.round(speed)))
      : 4;
    this.targetLifetimeMs = 1_800 - this.speed * 110;
    this.status = "running";
    this.score = this.hits = this.misses = this.mistakes = 0;
    this.remainingMs = ROUND_MS;
    this.target = null;
    this.spawnTarget();
    return this.snapshot();
  }

  spawnTarget() {
    const alternatives = this.pads.filter((pad) => pad.index !== this.target);
    const candidates = alternatives.length ? alternatives : this.pads;
    const sample = Number(this.random());
    const at = Number.isFinite(sample)
      ? Math.max(
          0,
          Math.min(candidates.length - 1, Math.floor(sample * candidates.length)),
        )
      : 0;
    const pad = candidates[at];
    this.target = pad.index;
    this.targetCode = pad.code;
    this.targetRemainingMs = this.targetLifetimeMs;
  }

  input({ code, pressed = true } = {}) {
    if (this.status !== "running" || !pressed) return;
    if (!this.pads.some((pad) => pad.code === code)) return;
    if (code !== this.targetCode) {
      this.mistakes++;
      return;
    }
    this.hits++;
    this.score = this.hits;
    this.bestScore = Math.max(this.bestScore, this.score);
    this.spawnTarget();
  }

  tick(dtMs) {
    if (this.status !== "running" || !Number.isFinite(dtMs) || dtMs <= 0)
      return;
    let elapsed = Math.min(dtMs, this.remainingMs);
    while (elapsed > 0 && this.status === "running") {
      const step = Math.min(elapsed, this.remainingMs, this.targetRemainingMs);
      this.remainingMs -= step;
      this.targetRemainingMs -= step;
      elapsed -= step;
      if (this.targetRemainingMs <= 0) this.misses++;
      if (this.remainingMs <= 0) {
        this.status = "over";
        this.target = this.targetCode = null;
        this.targetRemainingMs = 0;
      } else if (this.targetRemainingMs <= 0) {
        this.spawnTarget();
      }
    }
  }

  render() {
    const colors = blank();
    if (
      (this.status === "running" || this.status === "paused") &&
      this.target !== null
    )
      colors[this.target] = "#dc847b";
    return colors;
  }

  snapshot() {
    return {
      type: this.type,
      status: this.status,
      score: this.score,
      bestScore: this.bestScore,
      speed: this.speed,
      target: this.target,
      targetCode: this.targetCode,
      remainingMs: this.remainingMs,
      targetRemainingMs: this.targetRemainingMs,
      targetLifetimeMs: this.targetLifetimeMs,
      hits: this.hits,
      misses: this.misses,
      mistakes: this.mistakes,
    };
  }
}
