import { blank, layout, LED_COUNT } from "../../shared/layout.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const LEFT_COLOR = "#82b89a";
const RIGHT_COLOR = "#dc847b";
const BALL_COLOR = "#f4eee1";
const SERVE_MS = 900;
const WIN_SCORE = 7;
const PADDLE_SPEED = 5;
const STEP_MS = 8;

/** A two-player court in the keyboard's physical 16 × 6 key-unit space. */
export class PongGame {
  constructor(random = Math.random, keys = layout) {
    this.random = random;
    this.type = "pong";
    this.keys = keys.filter(
      (key) =>
        key.controllable !== false &&
        Number.isInteger(key.index) &&
        key.index >= 0 &&
        key.index < LED_COUNT - 1 &&
        Number.isFinite(key.x) &&
        Number.isFinite(key.y) &&
        Number.isFinite(key.w) &&
        key.w > 0,
    );
    this.rows = Array.from({ length: 6 }, (_, y) =>
      this.keys.filter((key) => key.y === y).sort((a, b) => a.x - b.x),
    );
    this.status = "idle";
    this.score = 0;
    this.bestScore = 0;
    this.speed = 4;
    this.leftScore = 0;
    this.rightScore = 0;
    this.winner = null;
    this.paddles = { left: 3, right: 3 };
    this.ball = { x: 8, y: 3, vx: 0, vy: 0 };
    this.phase = "serve";
    this.serveRemainingMs = 0;
    this.serveDirection = 1;
    this.held = new Set();
  }

  start(speed = 4) {
    this.status = "running";
    this.speed = clamp(Number.isFinite(speed) ? Math.round(speed) : 4, 1, 10);
    this.score = 0;
    this.leftScore = 0;
    this.rightScore = 0;
    this.winner = null;
    this.paddles = { left: 3, right: 3 };
    this.releaseInputs();
    this.prepareServe(this.sample() < 0.5 ? -1 : 1);
    return this.snapshot();
  }

  sample() {
    const value = Number(this.random());
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
  }

  get ballSpeed() {
    return 4 + this.speed * 0.75;
  }

  input({ code, pressed = true } = {}) {
    if (!["KeyW", "KeyS", "ArrowUp", "ArrowDown"].includes(code)) return;
    // A release is always accepted, even if focus changed during a pause.
    if (!pressed) this.held.delete(code);
    else if (this.status === "running") this.held.add(code);
  }

  releaseInputs() {
    this.held.clear();
  }

  prepareServe(direction) {
    this.phase = "serve";
    this.serveRemainingMs = SERVE_MS;
    this.serveDirection = direction;
    this.ball = { x: 8, y: 3, vx: 0, vy: 0 };
  }

  launch() {
    const angle = (this.sample() - 0.5) * 0.7;
    this.ball.vx = Math.cos(angle) * this.ballSpeed * this.serveDirection;
    this.ball.vy = Math.sin(angle) * this.ballSpeed;
    this.phase = "rally";
    this.serveRemainingMs = 0;
  }

  paddleTop(side) {
    return clamp(Math.round(this.paddles[side] - 1), 0, 4);
  }

  movePaddles(seconds) {
    const left = Number(this.held.has("KeyS")) - Number(this.held.has("KeyW"));
    const right =
      Number(this.held.has("ArrowDown")) - Number(this.held.has("ArrowUp"));
    this.paddles.left = clamp(
      this.paddles.left + left * PADDLE_SPEED * seconds,
      1,
      5,
    );
    this.paddles.right = clamp(
      this.paddles.right + right * PADDLE_SPEED * seconds,
      1,
      5,
    );
  }

  hitPaddle(side, oldX) {
    const row = this.rows[clamp(Math.floor(this.ball.y), 0, 5)];
    const key = side === "left" ? row[0] : row.at(-1);
    if (!key) return;
    const top = this.paddleTop(side);
    if (this.ball.y < top || this.ball.y >= top + 2) return;
    // Wide modifiers and the shorter function row retain their real edges.
    const face = side === "left" ? key.x + key.w : key.x;
    const crossed =
      side === "left"
        ? oldX >= face && this.ball.x <= face
        : oldX <= face && this.ball.x >= face;
    if (!crossed) return;
    const offset = clamp(this.ball.y - (top + 1), -1, 1);
    const angle = (offset * Math.PI) / 3;
    const direction = side === "left" ? 1 : -1;
    this.ball.x = face + direction * 0.001;
    this.ball.vx = direction * Math.cos(angle) * this.ballSpeed;
    this.ball.vy = Math.sin(angle) * this.ballSpeed;
  }

  awardPoint(side) {
    if (side === "left") this.leftScore++;
    else this.rightScore++;
    this.score = this.leftScore + this.rightScore;
    this.bestScore = Math.max(this.bestScore, this.score);
    if (Math.max(this.leftScore, this.rightScore) >= WIN_SCORE) {
      this.status = "won";
      this.phase = "finished";
      this.winner = side;
      this.serveRemainingMs = 0;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.releaseInputs();
      return;
    }
    // The player who conceded receives the next serve.
    this.prepareServe(side === "left" ? 1 : -1);
  }

  tick(dtMs) {
    if (this.status !== "running" || !Number.isFinite(dtMs) || dtMs <= 0) return;
    let remaining = dtMs;
    // Small physical steps prevent a delayed frame from tunnelling past a paddle.
    while (remaining > 0 && this.status === "running") {
      const step = Math.min(remaining, STEP_MS);
      remaining -= step;
      const seconds = step / 1000;
      this.movePaddles(seconds);
      if (this.phase === "serve") {
        const travelMs = Math.max(0, step - this.serveRemainingMs);
        this.serveRemainingMs = Math.max(0, this.serveRemainingMs - step);
        if (this.serveRemainingMs > 0) continue;
        this.launch();
        if (travelMs > 0) this.advanceBall(travelMs / 1000);
      } else if (this.phase === "rally") this.advanceBall(seconds);
    }
  }

  advanceBall(seconds) {
    const oldX = this.ball.x;
    this.ball.x += this.ball.vx * seconds;
    this.ball.y += this.ball.vy * seconds;
    if (this.ball.y < 0) {
      this.ball.y = -this.ball.y;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y > 6) {
      this.ball.y = 12 - this.ball.y;
      this.ball.vy = -Math.abs(this.ball.vy);
    }
    if (this.ball.vx < 0) this.hitPaddle("left", oldX);
    else if (this.ball.vx > 0) this.hitPaddle("right", oldX);
    if (this.ball.x < 0) this.awardPoint("right");
    else if (this.ball.x > 16) this.awardPoint("left");
  }

  render() {
    const colors = blank();
    if (this.status === "idle") return colors;
    for (const side of ["left", "right"]) {
      const top = this.paddleTop(side);
      for (let y = top; y < top + 2; y++) {
        const row = this.rows[y];
        const key = side === "left" ? row[0] : row.at(-1);
        if (key) colors[key.index] = side === "left" ? LEFT_COLOR : RIGHT_COLOR;
      }
    }
    if (this.phase !== "finished") {
      const row = this.rows[clamp(Math.floor(this.ball.y), 0, 5)];
      // A wide key is one LED; gaps (including the knob) use the nearest key.
      const key =
        row.find((key) => key.x <= this.ball.x && this.ball.x < key.x + key.w) ??
        row.reduce(
          (closest, candidate) =>
            !closest ||
            Math.abs(candidate.x + candidate.w / 2 - this.ball.x) <
              Math.abs(closest.x + closest.w / 2 - this.ball.x)
              ? candidate
              : closest,
          null,
        );
      if (key) colors[key.index] = BALL_COLOR;
    }
    return colors;
  }

  snapshot() {
    return {
      type: this.type,
      status: this.status,
      score: this.score,
      bestScore: this.bestScore,
      speed: this.speed,
      leftScore: this.leftScore,
      rightScore: this.rightScore,
      winner: this.winner,
      paddles: { ...this.paddles },
      ball: { x: this.ball.x, y: this.ball.y },
      phase: this.phase,
      serveRemainingMs: this.serveRemainingMs,
    };
  }
}
