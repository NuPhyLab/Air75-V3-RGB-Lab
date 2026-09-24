// Pure reduction of NuPhyLab's Claude Code hook spool into session status.
// No I/O here so the state machine stays testable with synthetic events.

export const HOOK_EVENTS = Object.freeze([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "Stop",
  "StopFailure",
  "SessionEnd",
]);
const KNOWN = new Set(HOOK_EVENTS);
const CONTROL = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g;
const id = (value, max = 80) =>
  typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9_.:-]+$/.test(value) ? value : null;
const text = (value, max = 200) =>
  typeof value === "string" ? value.replace(CONTROL, " ").trim().slice(0, max) || null : null;

/** Accepts one spool line object and returns a normalized event, or null. */
export function normalizeEvent(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const event = id(raw.e, 40);
  const session = id(raw.s, 80);
  if (!event || !KNOWN.has(event) || !session) return null;
  const at = Number.isFinite(raw.at) && raw.at > 0 ? Math.trunc(raw.at) : null;
  if (at === null) return null;
  return {
    event,
    session,
    at,
    order: index,
    cwd: typeof raw.c === "string" && raw.c.startsWith("/") && raw.c.length <= 1024 ? raw.c : null,
    pid: Number.isInteger(raw.p) && raw.p > 0 && raw.p < 2 ** 31 ? raw.p : null,
    tool: text(raw.t, 60),
    note: id(raw.k, 60) ?? text(raw.k, 60),
    reason: id(raw.r, 60) ?? text(raw.r, 60),
    permissionMode: id(raw.m, 40),
    agent: text(raw.a, 60),
    key: `${event}|${at}|${raw.q ?? ""}|${raw.t ?? ""}|${raw.k ?? ""}|${raw.r ?? ""}`,
  };
}
/** Duplicate-safe, order-independent: sorts by event time, then by arrival. */
export function orderEvents(events) {
  const seen = new Set();
  const unique = [];
  for (const event of events) {
    if (!event || seen.has(event.key)) continue;
    seen.add(event.key);
    unique.push(event);
  }
  return unique.sort((a, b) => a.at - b.at || a.order - b.order);
}
const ATTENTION_NOTIFICATIONS = new Set(["permission_prompt", "elicitation_dialog", "elicitation_url_dialog"]);
const IDLE_NOTIFICATIONS = new Set(["idle_prompt", "agent_needs_input"]);
const FINISHED_NOTIFICATIONS = new Set(["agent_completed"]);

/**
 * Reduces one session's events. A stopped turn is "awaitingInput", never
 * "completed": Claude ending a response does not mean the project is done, and a
 * single failed tool call does not mean the task failed.
 */
export function reduceSession(events, { now = Date.now() } = {}) {
  const ordered = orderEvents(events);
  const state = {
    status: "unknown",
    evidence: "尚未收到可识别的事件",
    startedAt: null,
    lastEventAt: null,
    lastEvent: null,
    cwd: null,
    pid: null,
    turnActive: false,
    pendingApproval: null,
    lastTool: null,
    toolFailures: 0,
    errorType: null,
    endedReason: null,
    permissionMode: null,
    events: ordered.length,
  };
  for (const event of ordered) {
    state.lastEventAt = event.at;
    state.lastEvent = event.event;
    if (event.cwd) state.cwd = event.cwd;
    if (event.pid) state.pid = event.pid;
    if (event.permissionMode) state.permissionMode = event.permissionMode;
    switch (event.event) {
      case "SessionStart":
        state.startedAt ??= event.at;
        state.status = "awaitingInput";
        state.evidence = event.reason === "resume" ? "会话已恢复，等待输入" : "会话已启动，等待输入";
        state.turnActive = false;
        state.pendingApproval = null;
        state.endedReason = null;
        state.errorType = null;
        break;
      case "UserPromptSubmit":
        state.status = "running";
        state.evidence = "已提交新的输入，本轮开始";
        state.turnActive = true;
        state.pendingApproval = null;
        state.errorType = null;
        state.endedReason = null;
        state.toolFailures = 0;
        break;
      case "PreToolUse":
        state.status = "running";
        state.evidence = event.tool ? `正在执行 ${event.tool}` : "正在执行工具";
        state.turnActive = true;
        state.lastTool = event.tool;
        break;
      case "PermissionRequest":
        state.status = "awaitingApproval";
        state.evidence = event.tool ? `${event.tool} 需要你确认权限` : "有操作需要你确认权限";
        state.turnActive = true;
        state.pendingApproval = { tool: event.tool, at: event.at };
        break;
      case "PermissionDenied":
        state.status = "running";
        state.evidence = "权限请求已被拒绝，本轮继续";
        state.turnActive = true;
        state.pendingApproval = null;
        break;
      case "PostToolUse":
        state.status = "running";
        state.evidence = event.tool ? `${event.tool} 已完成，本轮继续` : "工具已完成，本轮继续";
        state.turnActive = true;
        state.pendingApproval = null;
        state.lastTool = event.tool;
        break;
      case "PostToolUseFailure":
        // One failed tool call is not a failed task; Claude usually retries.
        state.status = "running";
        state.toolFailures += 1;
        state.evidence = event.tool ? `${event.tool} 失败，本轮仍在继续` : "有工具执行失败，本轮仍在继续";
        state.turnActive = true;
        state.pendingApproval = null;
        break;
      case "Notification":
        if (ATTENTION_NOTIFICATIONS.has(event.note)) {
          state.status = "awaitingApproval";
          state.evidence = "Claude Code 正在等待你确认";
          state.pendingApproval ??= { tool: event.tool, at: event.at };
        } else if (IDLE_NOTIFICATIONS.has(event.note) || FINISHED_NOTIFICATIONS.has(event.note)) {
          state.status = "awaitingInput";
          state.evidence = "Claude Code 正在等待你的输入";
          state.turnActive = false;
          state.pendingApproval = null;
        }
        break;
      case "Stop":
        state.status = "awaitingInput";
        state.evidence = "本轮响应结束，等待下一步输入";
        state.turnActive = false;
        state.pendingApproval = null;
        break;
      case "StopFailure":
        state.status = "error";
        state.errorType = event.reason;
        state.evidence = event.reason ? `本轮因 ${event.reason} 中断` : "本轮因错误中断";
        state.turnActive = false;
        state.pendingApproval = null;
        break;
      case "SessionEnd":
        state.status = "ended";
        state.endedReason = event.reason ?? "other";
        state.evidence = "会话已结束";
        state.turnActive = false;
        state.pendingApproval = null;
        break;
      default:
        break;
    }
  }
  state.now = now;
  return state;
}
/**
 * Applies liveness facts to a reduced session. A long-running turn is never
 * downgraded because of elapsed time alone; only a gone process is.
 */
export function applyLiveness(
  state,
  { alive = null, registered = null, registryReadable = true, staleMs = 6 * 60 * 60 * 1000, graceMs = 60_000, now = Date.now() } = {},
) {
  const next = { ...state, alive, registered };
  if (next.status === "ended") return next;
  if (alive === false) {
    // Without Claude Code's own session registry the recorded process id is the
    // only evidence, so a short grace period protects a session whose events are
    // still arriving from being declared disconnected by a stale reading.
    const trusted = registered === true || registryReadable === true;
    const silent = next.lastEventAt !== null && now - next.lastEventAt > graceMs;
    if (trusted || silent)
      return { ...next, status: "ended", endedReason: "disconnected", turnActive: false, pendingApproval: null,
        evidence: "运行这个会话的进程已退出" };
    return { ...next, alive: null };
  }
  if (alive === true) return next;
  // Liveness could not be established. Keep the last explicit state while it is
  // recent, then fall back to unknown instead of implying work is still running.
  if (next.lastEventAt !== null && now - next.lastEventAt > staleMs)
    return { ...next, status: "unknown", evidence: "长时间没有新事件，且无法确认会话是否仍在运行" };
  return next;
}
