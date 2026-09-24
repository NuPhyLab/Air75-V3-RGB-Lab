import { blank, LED_COUNT } from "../shared/layout.mjs";
import { DEFAULT_TRIGGER, validateTrigger } from "../shared/trigger.mjs";
import { validateColors } from "./storage.mjs";

// A trigger owns the lighting while armed: both waiting and finished frames are black.
// The caller supplies a monotonic clock, keeping elapsed time independent of wall-clock changes.
export class TriggerEffect {
  constructor() {
    this.armed = false;
    this.flashing = false;
    this.completed = 0;
    this.config = { ...DEFAULT_TRIGGER };
    this.colors = blank();
    this.startedAt = 0;
  }
  start(colors, config = {}) {
    const nextColors = validateColors(colors);
    const nextConfig = validateTrigger(config);
    // The final HID slot has no measured key location; never illuminate it.
    nextColors[LED_COUNT - 1] = "#000000";
    this.colors = nextColors;
    this.config = nextConfig;
    this.armed = true;
    this.flashing = false;
    this.completed = 0;
    this.startedAt = 0;
    return blank();
  }
  fire(now) {
    if (!this.armed || this.flashing) return false;
    if (!Number.isFinite(now)) throw new Error("触发时钟无效");
    this.startedAt = now;
    this.flashing = true;
    this.completed = 0;
    return true;
  }
  render(now) {
    if (!this.armed || !this.flashing) return blank();
    if (!Number.isFinite(now)) throw new Error("触发时钟无效");
    const elapsed = Math.max(0, now - this.startedAt);
    const { count, intervalMs } = this.config;
    this.completed = Math.min(count, Math.floor(elapsed / intervalMs));
    if (this.completed >= count) {
      this.flashing = false;
      return blank();
    }
    return elapsed % intervalMs < intervalMs / 2 ? [...this.colors] : blank();
  }
  cancel() {
    this.armed = false;
    this.flashing = false;
    this.completed = 0;
    this.startedAt = 0;
    return blank();
  }
  snapshot() {
    return {
      armed: this.armed,
      flashing: this.flashing,
      completed: this.completed,
      config: { ...this.config },
    };
  }
}
