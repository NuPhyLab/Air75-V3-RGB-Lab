export const MAX_LIGHT_TIME_MS: number;
export const DEFAULT_LIGHT_TIME_MS: number;
export interface LightTimeSettings { lightDurationMs?: number; lightIdleMs?: number }
export interface LightPowerState {
  sleeping: boolean;
  reason: "duration" | "idle" | null;
  remainingMs: number | null;
  idleMs: number;
}
export function validLightTime(value: unknown, options?: {allowOff?: boolean; maximum?: number}): boolean;
export class LightingPower {
  constructor(now?: () => number);
  sleeping: boolean;
  reason: "duration" | "idle" | null;
  wake(): void;
  activity(): void;
  observeSystemIdle(ms: number): void;
  observeCodex(signature: string): void;
  update(settings: LightTimeSettings, eligible?: boolean): LightPowerState;
  snapshot(settings?: LightTimeSettings): LightPowerState;
}
