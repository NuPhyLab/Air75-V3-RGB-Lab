import { scaleColor } from "./render-animation.mjs";
import { claudeBindings } from "./claude-keys.mjs";
import { layout } from "./layout.mjs";

// Claude Code session states come from local hook lifecycle events only.
// "awaitingInput" means the current turn ended, not that the project is done.
export const CLAUDE_STATUS_COLORS = Object.freeze({
  running: "#304FFE",
  awaitingApproval: "#FF6D00",
  awaitingInput: "#00FF4C",
  error: "#FF0033",
  ended: "#FFFFFF",
  unknown: "#858582",
  unassigned: "#000000",
});
export const CLAUDE_STATUS_NAMES = Object.freeze({
  running: "运行中",
  awaitingApproval: "等待权限确认",
  awaitingInput: "本轮结束 · 等待输入",
  error: "出错",
  ended: "会话已结束",
  unknown: "状态未确认",
  unassigned: "未绑定",
});
export const CLAUDE_STATUS_IDS = Object.freeze(Object.keys(CLAUDE_STATUS_COLORS).filter((id) => id !== "unassigned"));
// Ordering used by the "需要关注" source and by the next-attention command.
export const CLAUDE_ATTENTION_RANK = Object.freeze({
  awaitingApproval: 0, error: 1, awaitingInput: 2, running: 3, unknown: 4, ended: 5,
});
export function validateClaudeStatusColors(input, previous = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("状态颜色格式无效");
  const colors = { ...previous };
  for (const [id, color] of Object.entries(input)) {
    if (!CLAUDE_STATUS_IDS.includes(id) || typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
      throw new Error("状态颜色必须是有效的十六进制颜色");
    colors[id] = color.toUpperCase();
  }
  return colors;
}
export function claudeStatusColor(task, settings = {}) {
  if (!task || task.status === "unassigned") return CLAUDE_STATUS_COLORS.unassigned;
  const id = CLAUDE_STATUS_IDS.includes(task.status) ? task.status : "unknown";
  const custom = settings.claudeStatusColors?.[id];
  return typeof custom === "string" && /^#[0-9a-f]{6}$/i.test(custom) ? custom : CLAUDE_STATUS_COLORS[id];
}
/** Six slots. Custom slots keep their position even when a session is gone. */
export function resolveClaudeSlots(tasks, settings) {
  const mode = settings.claudeTaskSource ?? "recent";
  let ordered = [...tasks];
  if (mode === "active") ordered = ordered.filter((task) => task.status === "running" || task.status === "awaitingApproval");
  if (mode === "attention")
    ordered.sort((a, b) => (CLAUDE_ATTENTION_RANK[a.status] ?? 6) - (CLAUDE_ATTENTION_RANK[b.status] ?? 6));
  const ids = mode === "custom" ? (settings.claudeSlotIds ?? []) : [];
  const reserved = new Set(ids.filter(Boolean));
  const automatic = ordered.filter((task) => !reserved.has(task.id));
  let next = 0;
  return Array.from({ length: 6 }, (_, index) =>
    ids[index]
      ? (tasks.find((task) => task.id === ids[index]) ?? null)
      : mode === "custom"
        ? null
        : (automatic[next++] ?? null),
  );
}
/** An explicit choice stays pinned even while that session is temporarily missing. */
export function resolveClaudeWholeTask(tasks, settings, selectedId = null) {
  if (settings.claudeWholeTaskId) return tasks.find((task) => task.id === settings.claudeWholeTaskId) ?? null;
  const selected = tasks.find((task) => task.id === selectedId);
  if (selected) return selected;
  return tasks.length === 1 ? tasks[0] : null;
}
export class ClaudeLights {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.selectedId = null;
    this.selectedAt = -Infinity;
    this.sleeping = false;
  }
  // Sleep and wake belong to LightingPower; kept for call-site symmetry with Codex.
  wake() {}
  select(id) {
    this.selectedId = id;
    this.selectedAt = this.now();
    this.wake();
  }
  render(input, slots, settings, tasks = slots.filter(Boolean)) {
    const now = this.now();
    const level = (settings.claudeBrightness ?? 100) / 100;
    const out = [...input];
    const pulseFor = (task) => {
      const selected = task?.id && task.id === this.selectedId;
      return selected && settings.claudeSelectedPulse !== false
        ? 0.28 + 0.72 * (0.5 + 0.5 * Math.cos(((now - this.selectedAt) / 1800) * Math.PI * 2))
        : 1;
    };
    if (settings.claudeLightMode === "whole") {
      const task = resolveClaudeWholeTask(tasks, settings, this.selectedId);
      const color = scaleColor(claudeStatusColor(task, settings), level * pulseFor(task));
      out.fill("#000000");
      for (const key of layout) out[key.index] = color;
      return out;
    }
    const bindings = claudeBindings(settings);
    Array.from({ length: 6 }, (_, index) => slots[index]).forEach((task, index) => {
      const led = bindings[index].ledIndex;
      if (led !== null) out[led] = scaleColor(claudeStatusColor(task, settings), level * pulseFor(task));
    });
    if (settings.claudeAmbient) {
      const task = slots.find((entry) => entry?.id === this.selectedId);
      const color = claudeStatusColor(task, settings);
      for (let i = 7; i <= 12; i++) {
        const position = Math.floor((now - this.selectedAt) / 170) % 6;
        const tail = task?.status === "running"
          ? [1, 0.5, 0.18, 0, 0, 0][(i - 7 - position + 6) % 6]
          : task ? 0.65 : 0;
        const led = bindings[i - 1].ledIndex;
        if (led !== null) out[led] = scaleColor(color, level * tail);
      }
    }
    return out;
  }
  snapshot() {
    return { sleeping: this.sleeping, selectedId: this.selectedId, selectionSource: "studio" };
  }
}
