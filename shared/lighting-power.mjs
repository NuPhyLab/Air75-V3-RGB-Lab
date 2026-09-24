export const MAX_LIGHT_TIME_MS = 86_400_000;
export function validLightTime(value, {allowOff = true, maximum = MAX_LIGHT_TIME_MS} = {}) {
  return Number.isInteger(value) && ((allowOff && value === 0) || (value >= 1000 && value <= maximum));
}
export class LightingPower {
  constructor(now = () => performance.now()) {
    this.now = now; this.startedAt = now(); this.lastActivity = now();
    this.sleeping = false; this.reason = null; this.codexSignature = null;
  }
  wake() { this.startedAt = this.lastActivity = this.now(); this.sleeping = false; this.reason = null; }
  activity() { this.lastActivity = this.now(); if (this.sleeping && this.reason === 'idle') this.wake(); }
  observeSystemIdle(ms) {
    if (Number.isFinite(ms) && ms >= 0) this.lastActivity = Math.max(this.lastActivity, this.now() - ms);
  }
  observeCodex(signature) {
    if (this.codexSignature !== null && signature !== this.codexSignature) this.activity();
    this.codexSignature = signature;
  }
  update(settings, eligible = true) {
    if (!eligible) { this.wake(); return this.snapshot(settings); }
    const now = this.now(), duration = settings.lightDurationMs ?? 0, idle = settings.lightIdleMs ?? 0;
    if (this.sleeping && this.reason === 'idle' && (!idle || now - this.lastActivity < idle)) this.wake();
    if (!this.sleeping) {
      if (duration > 0 && now - this.startedAt >= duration) { this.sleeping = true; this.reason = 'duration'; }
      else if (idle > 0 && now - this.lastActivity >= idle) { this.sleeping = true; this.reason = 'idle'; }
    }
    return this.snapshot(settings);
  }
  snapshot(settings = {}) {
    const now = this.now();
    return {sleeping:this.sleeping, reason:this.reason,
      remainingMs: settings.lightDurationMs ? Math.max(0,settings.lightDurationMs-(now-this.startedAt)) : null,
      idleMs: Math.max(0,now-this.lastActivity)};
  }
}
