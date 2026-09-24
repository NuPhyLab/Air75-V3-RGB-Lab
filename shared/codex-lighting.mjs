import { scaleColor } from "./render-animation.mjs";
import {codexBindings} from './codex-keys.mjs';
import {layout} from './layout.mjs';

// RGB values from the installed Codex Micro implementation, shared by UI and USB output.
export const STATUS_COLORS = Object.freeze({
  idle: "#FFFFFF", running: "#304FFE", completed: "#00FF4C",
  needsInput: "#FF6D00", error: "#FF0033", unknown: "#858582", unassigned: "#000000",
});
export const STATUS_NAMES = Object.freeze({
  idle: "空闲", running: "思考中", completed: "未读结果", needsInput: "等待回答",
  error: "发生错误", unknown: "状态未确认", unassigned: "未绑定",
});
export const CUSTOM_STATUS_IDS = Object.freeze(Object.keys(STATUS_COLORS).filter(id=>id!=="unassigned"));
export function validateStatusColors(input,previous={}) {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new Error("状态颜色格式无效");
  const colors={...previous};
  for(const [id,color] of Object.entries(input)) {
    if(!CUSTOM_STATUS_IDS.includes(id)||typeof color!=="string"||!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("状态颜色必须是有效的十六进制颜色");
    colors[id]=color.toUpperCase();
  }
  return colors;
}
export function statusColor(task,settings={}) {
  if (!task || task.status === "unassigned") return STATUS_COLORS.unassigned;
  const id=CUSTOM_STATUS_IDS.includes(task.status)?task.status:"unknown";
  const custom=settings.codexStatusColors?.[id];
  return typeof custom==="string"&&/^#[0-9a-f]{6}$/i.test(custom)?custom:STATUS_COLORS[id];
}
export function resolveSlots(tasks, settings) {
  const mode = settings.codexTaskSource ?? "recent";
  let ordered = [...tasks];
  if (mode === "pinned") ordered = ordered.filter(t => t.pinned).sort((a,b) => (a.pinOrder ?? Infinity) - (b.pinOrder ?? Infinity));
  if (mode === "priority") {
    const rank = { needsInput: 0, error: 1, completed: 2, running: 3, idle: 4, unknown: 5 };
    ordered.sort((a,b) => (rank[a.status] ?? 6) - (rank[b.status] ?? 6));
  }
  const ids = mode === "custom" ? settings.slotIds ?? [] : [];
  const reserved = new Set(ids.filter(Boolean));
  const automatic = ordered.filter(t => !reserved.has(t.id));
  let next = 0;
  return Array.from({length:6}, (_,i) => ids[i]
    ? tasks.find(t => t.id === ids[i]) ?? null
    : mode === "custom" ? null : automatic[next++] ?? null);
}
// Explicit choice stays pinned, including when that task is temporarily missing.
// Automatic mode follows a chosen control task, or the sole available task.
export function resolveWholeTask(tasks, settings, selectedId = null) {
  if (settings.codexWholeTaskId) return tasks.find(task=>task.id===settings.codexWholeTaskId) ?? null;
  const selected=tasks.find(task=>task.id===selectedId);
  if (selected) return selected;
  return tasks.length === 1 ? tasks[0] : null;
}
export class CodexLights {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.selectedId = null; this.selectedAt = -Infinity; this.sleeping = false;
  }
  // Compatibility entry point: sleep/wake is owned by LightingPower.
  wake() {}
  select(id) { this.selectedId = id; this.selectedAt = this.now(); this.wake(); }
  render(input, slots, settings, tasks = slots.filter(Boolean)) {
    const now = this.now();
    // Legacy codexAutoOffMs/codexHintMs values never override the global timer.
    const level = (settings.codexBrightness ?? 100) / 100;
    const out = [...input];
    if (settings.codexLightMode === "whole") {
      const task = resolveWholeTask(tasks,settings,this.selectedId);
      const selected = task?.id && task.id === this.selectedId;
      const pulse = selected && settings.codexSelectedPulse !== false
        ? 0.28 + 0.72 * (0.5 + 0.5 * Math.cos((now-this.selectedAt) / 1800 * Math.PI * 2)) : 1;
      const color = scaleColor(statusColor(task,settings),level*pulse);
      out.fill("#000000");
      for (const key of layout) out[key.index] = color;
      return out;
    }
    const bindings = codexBindings(settings);
    Array.from({length:6}, (_,i) => slots[i]).forEach((task, i) => {
      const selected = task?.id && task.id === this.selectedId;
      const pulse = selected && settings.codexSelectedPulse !== false
        ? 0.28 + 0.72 * (0.5 + 0.5 * Math.cos((now-this.selectedAt) / 1800 * Math.PI * 2)) : 1;
      const index = bindings[i].ledIndex;
      if (index !== null) out[index] = scaleColor(statusColor(task,settings), level * pulse);
    });
    if (settings.codexAmbient) {
      const task = slots.find(t => t?.id === this.selectedId);
      const color = statusColor(task,settings);
      for (let i=7; i<=12; i++) {
        const position = Math.floor((now-this.selectedAt)/170) % 6;
        const tail = task?.status === "running" ? [1,.5,.18,0,0,0][(i-7-position+6)%6]
          : task ? 0.65 : 0;
        const index = bindings[i-1].ledIndex;
        if (index !== null) out[index] = scaleColor(color, level*tail);
      }
    }
    return out;
  }
  snapshot() { return {sleeping:this.sleeping, selectedId:this.selectedId, selectionSource:"studio"}; }
}
