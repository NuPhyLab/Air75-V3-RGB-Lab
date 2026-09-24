import { SnakeGame } from "./engine.mjs";
import { WhackGame } from "./games/whack.mjs";
import { MemoryGame } from "./games/memory.mjs";
import { PongGame } from "./games/pong.mjs";
import { validateGameType } from "../shared/games.mjs";
import { blank, layout } from "../shared/layout.mjs";

const constructors = { snake: SnakeGame, whack: WhackGame, memory: MemoryGame, pong: PongGame };
const FLASH_HALF_MS = 300;
const FLASH_DURATION_MS = FLASH_HALF_MS * 2 * 3;

// One session owns the keyboard at a time. New games use elapsed active time;
// Snake retains its existing discrete movement cadence.
export class GameSession {
  constructor(bestScores = {}, random = Math.random) {
    this.bestScores = { ...bestScores };
    this.random = random;
    this.type = "snake";
    this.current = this.create(this.type);
    this.elapsed = 0;
    this.lossElapsed = null;
  }
  create(type) {
    const next = new constructors[validateGameType(type)](this.random);
    next.bestScore = this.bestScores[type] ?? 0;
    return next;
  }
  get status() { return this.current.status; }
  set status(value) {
    if (value !== "running") this.current.releaseInputs?.();
    if (!["over", "won"].includes(value)) this.lossElapsed = null;
    this.current.status = value;
  }
  get speed() { return this.current.speed; }
  get bestScore() { return this.current.bestScore; }
  select(type) {
    validateGameType(type);
    if (["running", "paused"].includes(this.status))
      throw new Error("请先结束当前游戏");
    this.current.releaseInputs?.();
    this.type = type;
    this.current = this.create(type);
    this.elapsed = 0;
    this.lossElapsed = null;
    return this.snapshot();
  }
  start(speed = 4, type = this.type) {
    validateGameType(type);
    if (!Number.isInteger(speed) || speed < 1 || speed > 10)
      throw new Error("游戏速度应为 1–10");
    this.current.releaseInputs?.();
    this.type = type;
    this.current = this.create(type);
    this.elapsed = 0;
    this.lossElapsed = null;
    this.current.start(speed);
    return this.snapshot();
  }
  input(input) {
    const previous = this.status;
    if (this.type === "snake") this.current.input(input.direction);
    else this.current.input(input);
    this.rememberScore();
    this.captureResult(previous);
    return this.snapshot();
  }
  tick(dtMs) {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    if (this.status !== "running") {
      if (this.flashing) this.lossElapsed = Math.min(FLASH_DURATION_MS, this.lossElapsed + dtMs);
      return;
    }
    const previous = this.status;
    if (this.type === "snake") {
      this.elapsed += dtMs;
      const interval = Math.max(100, 650 - this.speed * 50);
      if (this.elapsed >= interval) {
        this.elapsed %= interval;
        this.current.tick();
      }
    } else this.current.tick(dtMs);
    this.rememberScore();
    this.captureResult(previous);
  }
  captureResult(previous) {
    // Pong has a winner and a loser; its terminal state is named "won".
    const lost = this.status === "over" || (this.type === "pong" && this.status === "won");
    if (previous === "running" && lost) {
      this.lossElapsed = 0;
      this.current.releaseInputs?.();
    }
  }
  get flashing() { return this.lossElapsed !== null && this.lossElapsed < FLASH_DURATION_MS; }
  rememberScore() {
    this.bestScores[this.type] = Math.max(this.bestScores[this.type] ?? 0, this.bestScore);
  }
  render() {
    if (this.lossElapsed === null) return this.current.render();
    const colors = blank();
    if (this.flashing && Math.floor(this.lossElapsed / FLASH_HALF_MS) % 2 === 0)
      for (const key of layout) colors[key.index] = "#ff0000";
    return colors;
  }
  snapshot() { return { ...this.current.snapshot(), type: this.type, lossFlashing: this.flashing }; }
}
