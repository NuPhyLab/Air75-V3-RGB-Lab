import keys from "./trigger-keys.json" with { type: "json" };

export const DEFAULT_TRIGGER = Object.freeze({
  code: "Space",
  count: 3,
  intervalMs: 600,
});
export const TRIGGER_KEYS = Object.freeze(keys.map((key) => Object.freeze({ ...key })));
const codes = new Set(TRIGGER_KEYS.map((key) => key.code));

export function validateTrigger(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("按键触发设置格式无效");
  for (const key of Object.keys(input))
    if (!["code", "count", "intervalMs"].includes(key))
      throw new Error("不支持的按键触发设置项：" + key);
  const config = { ...DEFAULT_TRIGGER, ...input };
  if (!codes.has(config.code)) throw new Error("请选择支持的触发按键");
  if (!Number.isInteger(config.count) || config.count < 1 || config.count > 20)
    throw new Error("闪烁次数应为 1–20 次");
  if (!Number.isInteger(config.intervalMs) || config.intervalMs < 200 || config.intervalMs > 2000)
    throw new Error("每次闪烁时长应为 200–2000 毫秒");
  return config;
}
