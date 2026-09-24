import { blank, layout, LED_COUNT } from "../../shared/layout.mjs";

const PAD_CODES = [
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon",
];
const PAD_COLORS = [
  "#dc847b", "#d9ad58", "#b8c67b", "#73a78c",
  "#6faeb3", "#6493d7", "#ac8cc5", "#cc8ca8",
];
const INPUT_MS = 10_000;
const GOAL_ROUNDS = 20;

export class MemoryGame {
  constructor(random = Math.random, keys = layout) {
    this.random = random;
    this.pads = PAD_CODES.map((code) => {
      const key = keys.find(
        (candidate) => candidate.code === code && candidate.controllable !== false,
      );
      if (
        !key ||
        !Number.isInteger(key.index) ||
        key.index < 0 ||
        key.index >= LED_COUNT - 1
      )
        throw new TypeError(`Memory requires a controllable ${code} key`);
      return { code, index: key.index };
    });
    if (new Set(this.pads.map((pad) => pad.index)).size !== this.pads.length)
      throw new TypeError("Memory requires unique pad indices");
    this.type = "memory";
    this.status = "idle";
    this.phase = "watch";
    this.score = 0;
    this.bestScore = 0;
    this.speed = 4;
    this.round = 0;
    this.inputIndex = 0;
    this.sequence = [];
    this.cueIndex = null;
    this.remainingMs = 0;
    this.feedbackMs = 0;
    this.watchIndex = -1;
    this.watchOn = false;
    this.cueMs = 580;
  }

  start(speed = 4) {
    this.speed = Number.isFinite(speed)
      ? Math.max(1, Math.min(10, Math.round(speed)))
      : 4;
    this.cueMs = 760 - this.speed * 45;
    this.status = "running";
    this.score = 0;
    this.round = 1;
    this.sequence = [];
    this.addCue();
    this.beginWatch();
    return this.snapshot();
  }

  addCue() {
    const sample = Number(this.random());
    const at = Number.isFinite(sample)
      ? Math.max(
          0,
          Math.min(this.pads.length - 1, Math.floor(sample * this.pads.length)),
        )
      : 0;
    this.sequence.push(this.pads[at].index);
  }

  beginWatch() {
    this.phase = "watch";
    this.inputIndex = 0;
    this.cueIndex = null;
    this.feedbackMs = 0;
    this.watchIndex = -1;
    this.watchOn = false;
    this.remainingMs = 500;
  }

  advancePhase() {
    if (this.phase === "watch") {
      if (this.watchOn) {
        this.watchOn = false;
        this.cueIndex = null;
        this.remainingMs = 240;
      } else {
        this.watchIndex++;
        if (this.watchIndex >= this.sequence.length) {
          this.phase = "input";
          this.cueIndex = null;
          this.remainingMs = INPUT_MS;
        } else {
          this.watchOn = true;
          this.cueIndex = this.sequence[this.watchIndex];
          this.remainingMs = this.cueMs;
        }
      }
    } else if (this.phase === "input") {
      this.phase = "error";
      this.status = "over";
      this.cueIndex = null;
      this.feedbackMs = 0;
      this.remainingMs = 0;
    } else if (this.phase === "success") {
      this.round++;
      this.addCue();
      this.beginWatch();
    }
  }

  tick(dtMs) {
    if (this.status !== "running" || !Number.isFinite(dtMs) || dtMs <= 0)
      return;
    let elapsed = dtMs;
    while (elapsed > 0 && this.status === "running") {
      const step = Math.min(elapsed, this.remainingMs);
      this.remainingMs -= step;
      elapsed -= step;
      if (this.phase === "input" && this.feedbackMs > 0) {
        this.feedbackMs = Math.max(0, this.feedbackMs - step);
        if (this.feedbackMs === 0) this.cueIndex = null;
      }
      if (this.remainingMs <= 0) this.advancePhase();
    }
  }

  input({ code, pressed = true } = {}) {
    if (this.status !== "running" || this.phase !== "input" || !pressed)
      return;
    const pad = this.pads.find((candidate) => candidate.code === code);
    if (!pad) return;
    this.cueIndex = pad.index;
    if (pad.index !== this.sequence[this.inputIndex]) {
      this.phase = "error";
      this.status = "over";
      this.remainingMs = this.feedbackMs = 0;
      return;
    }
    this.inputIndex++;
    this.feedbackMs = 160;
    this.remainingMs = INPUT_MS;
    if (this.inputIndex === this.sequence.length) {
      this.score++;
      this.bestScore = Math.max(this.bestScore, this.score);
      this.phase = "success";
      this.remainingMs = 450;
      if (this.score >= GOAL_ROUNDS) {
        this.status = "won";
        this.remainingMs = 0;
      }
    }
  }

  render() {
    const colors = blank();
    const padAt = this.pads.findIndex((pad) => pad.index === this.cueIndex);
    if (padAt >= 0)
      colors[this.cueIndex] =
        this.phase === "error"
          ? "#d96768"
          : this.phase === "success"
            ? "#73a78c"
            : PAD_COLORS[padAt];
    return colors;
  }

  snapshot() {
    return {
      type: this.type,
      status: this.status,
      score: this.score,
      bestScore: this.bestScore,
      speed: this.speed,
      phase: this.phase,
      round: this.round,
      inputIndex: this.inputIndex,
      sequenceLength: this.sequence.length,
      cueIndex: this.cueIndex,
      padIndices: this.pads.map((pad) => pad.index),
      padCodes: this.pads.map((pad) => pad.code),
      remainingMs: this.remainingMs,
      goalRounds: GOAL_ROUNDS,
    };
  }
}
