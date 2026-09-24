export type TriggerConfig = { code: string; count: number; intervalMs: number };
export type TriggerKey = { code: string; label: string; keyCode: number };
export const DEFAULT_TRIGGER: Readonly<TriggerConfig>;
export const TRIGGER_KEYS: readonly Readonly<TriggerKey>[];
export function validateTrigger(input?: unknown): TriggerConfig;
