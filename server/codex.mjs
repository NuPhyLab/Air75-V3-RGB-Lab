import { access, readdir, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

const execFileAsync = promisify(execFile);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const iso = (value) =>
  Number.isFinite(value) ? new Date(value).toISOString() : null;
const label = (value, fallback = "") =>
  typeof value === "string"
    ? value
        .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, " ")
        .trim()
        .slice(0, 160) || fallback
    : fallback;
const validId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(value);

import { STATUS_COLORS } from "../shared/codex-lighting.mjs";
import { readLiveWriters } from "./codex-writers.mjs";
import { readEventLines, findLatestEvent } from "./codex-event-tail.mjs";
export { STATUS_COLORS };

export const SHORTCUTS = Object.freeze(
  [
    ...Array.from({ length: 6 }, (_, index) =>
      Object.freeze({
        id: `recent${index + 1}`,
        label: `最近任务 ${index + 1}`,
        keys: ["Command", "Option", String(index + 1)],
        context: "codex",
      }),
    ),
    {
      id: "attention",
      label: "下一个需关注的任务",
      keys: ["Command", "Option", "A"],
      context: "codex",
    },
    {
      id: "newTask",
      label: "新建任务",
      keys: ["Command", "N"],
      context: "codex",
    },
    {
      id: "dictation",
      label: "听写",
      keys: ["Control", "Shift", "D"],
      context: "codex",
    },
    {
      id: "voice",
      label: "语音对话",
      keys: ["Control", "Shift", "V"],
      context: "codex",
    },
    {
      id: "modelPicker",
      label: "模型与推理选项",
      keys: ["Control", "Shift", "M"],
      context: "codex",
    },
    {"id": "toggleTerminal", "label": "打开／收起终端", "keys": ["Control", "`"], "context": "codex"},
    {"id": "toggleSidebar", "label": "显示／隐藏侧栏", "keys": ["Command", "B"], "context": "codex"},
    {"id": "openBrowserTab", "label": "打开浏览器标签", "keys": ["Command", "T"], "context": "codex"},
    {"id": "settings", "label": "打开设置", "keys": ["Command", ","], "context": "codex"},
    {"id": "openFolder", "label": "打开文件夹", "keys": ["Command", "O"], "context": "codex"},
    {"id": "toggleThreadPin", "label": "固定／取消固定任务", "keys": ["Command", "Option", "P"], "context": "codex"},
    {"id": "markThreadUnread", "label": "标为未读", "keys": ["Command", "Shift", "U"], "context": "codex"},
    {"id": "renameThread", "label": "重命名任务", "keys": ["Command", "Option", "R"], "context": "codex"},
    {"id": "navigateBack", "label": "应用历史后退", "keys": ["Command", "["], "context": "codex"},
    {"id": "navigateForward", "label": "应用历史前进", "keys": ["Command", "]"], "context": "codex"},
    {"id": "showKeyboardShortcuts", "label": "显示快捷键帮助", "keys": ["Command", "/"], "context": "codex"},
    {"id": "archiveThread", "label": "归档当前任务", "keys": ["Command", "Shift", "A"], "context": "codex"},
    {
      id: "approve",
      label: "批准当前请求",
      keys: ["Return"],
      context: "approval",
      requiresUserGesture: true,
    },
    {
      id: "decline",
      label: "拒绝当前请求",
      keys: ["Escape"],
      context: "approval",
      requiresUserGesture: true,
    },
  ].map((entry) =>
    Object.freeze({
      ...entry,
      keys: Object.freeze([...entry.keys]),
      shortcut: entry.keys
        .map(
          (key) =>
            ({
              Command: "⌘",
              Option: "⌥",
              Control: "⌃",
              Shift: "⇧",
              Return: "↵",
              Escape: "Esc",
            })[key] ?? key,
        )
        .join(""),
      available: entry.context !== "approval",
      ...(entry.context === "approval"
        ? { reason: "此处无法验证当前审批卡，请在 Codex 中操作" }
        : {}),
    }),
  ),
);

/** Describes an action; never opens a URL, posts keys, sends a prompt, or approves anything. */
export function describeAction(id, { threadId, tasks = [], slots = [] } = {}) {
  const slot = /^agent([1-6])$/.exec(id);
  if (slot) threadId = slots[Number(slot[1]) - 1]?.id;
  if (id === "openTask" || slot) {
    if (!validId(threadId) || !tasks.some((task) => task.id === threadId)) {
      return { available: false, reason: "任务未绑定或不在当前任务列表中" };
    }
    return {
      available: true,
      type: "deepLink",
      url: `codex://threads/${encodeURIComponent(threadId)}`,
      requiresUserGesture: true,
    };
  }
  const shortcut = SHORTCUTS.find((item) => item.id === id);
  if (!shortcut)
    return {
      available: false,
      reason: "此操作没有已确认的默认快捷键；未修改 Codex 键位",
    };
  return {
    available: true,
    type: "shortcut",
    ...structuredClone(shortcut),
    requiresUserGesture: true,
    target: "com.openai.codex",
    requiresForeground: true,
    ...(shortcut.context === "approval"
      ? { requiresVerifiedApprovalContext: true }
      : {}),
  };
}

/** Preserve missing data as null; prefer all metered buckets over the legacy single bucket. */
export function normalizeQuota(result, now = Date.now()) {
  const multi = result?.rateLimitsByLimitId;
  const entries =
    multi &&
    typeof multi === "object" &&
    !Array.isArray(multi) &&
    Object.keys(multi).length
      ? Object.entries(multi)
      : result?.rateLimits
        ? [[result.rateLimits.limitId || "codex", result.rateLimits]]
        : [];
  const buckets = entries.slice(0, 32).flatMap(([key, bucket]) => {
    if (!bucket || typeof bucket !== "object") return [];
    const windows = ["primary", "secondary"].flatMap((kind) => {
      const window = bucket[kind];
      if (!window || typeof window !== "object") return [];
      const usedPercent = finite(window.usedPercent);
      return [
        {
          kind,
          usedPercent,
          remainingPercent:
            usedPercent === null ? null : clamp(100 - usedPercent, 0, 100),
          windowDurationMins: finite(window.windowDurationMins),
          resetsAt: finite(window.resetsAt),
        },
      ];
    });
    return [
      {
        id: label(bucket.limitId, label(key, "codex")),
        label: label(bucket.limitName, label(key, "Codex")),
        windows,
      },
    ];
  });
  const available = buckets.some((bucket) =>
    bucket.windows.some((window) => window.remainingPercent !== null),
  );
  return {
    available,
    reason: available ? null : "账户未返回可用的额度百分比",
    stale: false,
    buckets,
    updatedAt: iso(now),
  };
}

/** Only structural event fields survive parsing. The original JSON and message text are discarded. */
export function classifyEvents(
  data,
  { now = Date.now(), activityObservedAt = null, activeWindowMs = 15_000, previousEvent = null, pendingRequests = previousEvent?.pendingRequests ?? [] } = {},
) {
  let last = previousEvent?.kind ? previousEvent : null;
  const pending = new Map(pendingRequests.slice(0,64).map(entry=>[entry.id,entry]));
  const active = new Set([
    "agent_reasoning",
    "agent_message",
    "reasoning",
    "custom_tool_call",
    "custom_tool_call_output",
    "function_call",
    "function_call_output",
    "mcp_tool_call",
    "mcp_tool_call_output",
    "web_search_call",
    "computer_tool_call",
    "patch_apply_begin",
    "patch_apply_end",
    "task_started",
    "turn_started",
  ]);
  const resolved = new Set([
    "approved",
    "accepted",
    "completed",
    "resolved",
    "declined",
    "denied",
    "rejected",
    "cancelled",
    "canceled",
  ]);
  for (const line of String(data).split("\n")) {
    if (!line || line.length > 1_048_576) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const payload = event.payload;
    if (!payload || typeof payload !== "object") continue;
    const type =
      typeof payload.type === "string" ? payload.type.toLowerCase() : "";
    const name =
      typeof payload.name === "string" ? payload.name.toLowerCase() : "";
    const state =
      typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    let kind;
    // Current Codex persists final messages before task_complete. Some versions
    // only expose this completed item until the view catches up. Use explicit
    // final-answer phases, never message text, viewport position or unread flags.
    const finalMessage = event.type === "response_item" && type === "message" &&
      payload.role === "assistant" && ["final", "final_answer"].includes(payload.phase);
    const finalItem = event.type === "event_msg" && type === "item_completed" &&
      payload.item?.type === "AgentMessage" && ["final", "final_answer"].includes(payload.item.phase);
    if (["task_complete", "turn_complete", "turn_completed"].includes(type) || finalMessage || finalItem)
      kind = "completed";
    else if (
      event.type === "event_msg" &&
      ["turn_aborted", "turn_interrupted"].includes(type)
    )
      kind = "idle";
    else if (
      event.type === "event_msg" &&
      ["error", "task_failed", "turn_failed"].includes(type)
    )
      kind = "error";
    else if (
      type.endsWith("_output") ||
      /(?:approval|permission)_(?:response|result)/.test(type)
    )
      kind = "active";
    else if (
      /request_?approval|approval_request|permission_request|waiting_on_user_input/.test(
        type,
      ) ||
      (["custom_tool_call", "function_call", "mcp_tool_call"].includes(type) &&
        /request_user_input/.test(name))
    ) {
      kind = resolved.has(state) ? "active" : "needsInput";
    } else if (active.has(type)) kind = "active";
    if (!kind) continue;
    const eventAt =
      typeof event.timestamp === "string" ? Date.parse(event.timestamp) : NaN;
    const requestId = typeof payload.call_id === "string" ? payload.call_id.slice(0,160)
      : typeof payload.request_id === "string" ? payload.request_id.slice(0,160) : null;
    if (["task_started","turn_started"].includes(type) || ["completed","idle","error"].includes(kind)) pending.clear();
    if (kind === "needsInput" && requestId && pending.size < 64)
      pending.set(requestId,{id:requestId,kind:/approval|permission/.test(type)?"approval":"response",eventAt:Number.isFinite(eventAt)?eventAt:null});
    if (requestId && (type.endsWith("_output") || /(?:approval|permission)_(?:response|result)/.test(type))) pending.delete(requestId);
    last = {
      kind,
      eventAt: Number.isFinite(eventAt) ? eventAt : null,
      signature: createHash("sha256").update(line).digest("hex"),
      pendingKind: kind === "needsInput" ? (/approval|permission/.test(type) ? "approval" : "response") : null,
    };
  }
  if (last && pending.size && !["completed","idle","error"].includes(last.kind)) {
    const request = [...pending.values()].find(item=>item.kind === "approval") ?? pending.values().next().value;
    last = {...last,kind:"needsInput",pendingKind:request.kind,eventAt:request.eventAt};
  }
  if (last) last.pendingRequests = [...pending.values()];
  if (!last)
    return {
      status: "unknown",
      eventAt: null,
      signature: null,
      evidence: "没有可识别的结构事件",
    };
  const age = last.eventAt === null ? Infinity : now - last.eventAt;
  if (last.kind === "active") {
    const recent = age >= -5_000 && age <= activeWindowMs;
    const observed =
      Number.isFinite(activityObservedAt) &&
      now - activityObservedAt >= 0 &&
      now - activityObservedAt <= activeWindowMs;
    return {
      ...last,
      status: recent && observed ? "running" : "unknown",
      evidence:
        recent && observed
          ? "连接后观察到新的任务活动"
          : "仅有历史活动，无法确认仍在运行",
    };
  }
  if (last.kind === "needsInput" && (age < -5_000 || age > 300_000)) {
    return {
      ...last,
      status: "unknown",
      evidence: "等待输入事件已过期，当前状态未确认",
    };
  }
  return { ...last, status: last.kind, evidence: "本地记录中的明确状态事件" };
}

async function boundedRead(file, maximumBytes, { tail = false } = {}) {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("not_regular_file");
    if (!tail && info.size > maximumBytes) throw new Error("file_too_large");
    const start = tail ? Math.max(0, info.size - maximumBytes) : 0;
    const buffer = Buffer.alloc(Math.min(info.size, maximumBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let data = buffer.subarray(0, bytesRead).toString("utf8");
    if (start > 0) {
      const newline = data.indexOf("\n");
      data = newline >= 0 ? data.slice(newline + 1) : "";
    }
    return data;
  } finally {
    await handle.close();
  }
}

function findMetadata(root, target) {
  const stack = [{ value: root, depth: 0 }];
  let visited = 0;
  while (stack.length && visited++ < 20_000) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || depth > 12) continue;
    if (Object.hasOwn(value, target)) return value[target];
    for (const child of Object.values(value))
      if (child && typeof child === "object")
        stack.push({ value: child, depth: depth + 1 });
  }
  return undefined;
}

export async function discoverCodexCLI(explicitPath) {
  const home = homedir();
  const candidates = explicitPath
    ? [explicitPath]
    : [
        "/Applications/ChatGPT.app/Contents/Resources/codex",
        "/Applications/Codex.app/Contents/Resources/codex",
        path.join(home, "Applications/ChatGPT.app/Contents/Resources/codex"),
        path.join(home, "Applications/Codex.app/Contents/Resources/codex"),
        path.join(home, ".local/bin/codex"),
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try the next supported location. */
    }
  }
  return null;
}

/** A deliberately narrow JSONL client. Only initialize and quota reads can leave this process. */
export class ReadOnlyAppServerClient {
  constructor({
    executable,
    codexHome,
    timeoutMs = 10_000,
    spawnProcess = spawn,
  }) {
    Object.assign(this, { executable, codexHome, timeoutMs, spawnProcess });
    this.pending = new Map();
    this.sequence = 0;
    this.child = null;
    this.buffer = "";
    this.ready = false;
    this.decoder = new StringDecoder("utf8");
  }
  async start() {
    if (this.ready) return;
    this.child = this.spawnProcess(this.executable, ["app-server", "--stdio"], {
      cwd: homedir(),
      env: { ...process.env, CODEX_HOME: this.codexHome },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk) => this.consume(chunk));
    this.child.stdin.on("error", () => this.failAll("Codex 额度连接不可写"));
    // Do not print stderr: diagnostics may contain account or local environment details.
    this.child.stderr.on("data", () => {});
    this.child.on("error", () => this.failAll("Codex 进程无法启动"));
    this.child.on("exit", () => this.failAll("Codex 额度连接已关闭"));
    try {
      await this.request("initialize", {
        clientInfo: {
          name: "air_studio_quota",
          title: "NuPhyLab quota reader",
          version: "1.0.0",
        },
      });
      this.write({ method: "initialized", params: {} });
      this.ready = true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  async readQuota() {
    if (!this.ready) await this.start();
    return this.request("account/rateLimits/read");
  }
  request(method, params) {
    if (!["initialize", "account/rateLimits/read"].includes(method))
      return Promise.reject(new Error("不允许的 Codex 方法"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex 额度接口响应超时"));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(new Error("Codex 额度连接不可写"));
      }
    });
  }
  write(message) {
    if (!this.child?.stdin?.writable) throw new Error("closed");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  consume(chunk) {
    this.buffer += this.decoder.write(chunk);
    if (this.buffer.length > 2_097_152) {
      this.failAll("Codex 返回超出读取上限");
      this.stop();
      return;
    }
    let end;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (!message || typeof message !== "object") continue;
      if (message.method && Object.hasOwn(message, "id")) {
        // This connection cannot supply credentials, make decisions, or answer approvals.
        try {
          this.write({
            id: message.id,
            error: { code: -32601, message: "Read-only quota client" },
          });
        } catch {
          /* Closed. */
        }
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(new Error("Codex 额度读取失败，请检查桌面登录状态"));
      else pending.resolve(message.result ?? {});
    }
  }
  failAll(reason) {
    this.ready = false;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
  stop() {
    this.failAll("Codex 额度读取已停止");
    const child = this.child;
    this.child = null;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    if (child) {
      child.stdin.destroy();
      child.kill("SIGTERM");
    }
  }
}

export class CodexAdapter {
  constructor({
    codexHome = path.join(homedir(), ".codex"),
    onChange = () => {},
    cliPath,
    enableQuota = true,
    pollIntervalMs = 1_000,
    quotaIntervalMs = 60_000,
    maxTasks = 100,
    tailBytes = 262_144,
    activeWindowMs = 15_000,
    sqlitePath = "/usr/bin/sqlite3",
    now = Date.now,
    clientFactory = (options) => new ReadOnlyAppServerClient(options),
    liveWriters = readLiveWriters,
  } = {}) {
    Object.assign(this, {
      codexHome: path.resolve(codexHome),
      onChange,
      cliPath,
      enableQuota,
      sqlitePath,
      now,
      clientFactory,
      liveWriters,
    });
    this.pollIntervalMs = Math.max(1_000, pollIntervalMs);
    this.quotaIntervalMs = Math.max(15_000, quotaIntervalMs);
    this.maxTasks = clamp(Math.trunc(maxTasks), 6, 100);
    this.tailBytes = clamp(Math.trunc(tailBytes), 4096, 1_048_576);
    this.activeWindowMs = clamp(activeWindowMs, 1_000, 60_000);
    this.trackedIds = [];
    this.cache = new Map();
    this.writerState = null;
    this.lastGoodTasksAt = null;
    this.running = false;
    this.timers = new Set();
    this.client = null;
    this.tasksBusy = false;
    this.quotaBusy = false;
    this.lastQuotaAttemptAt = -Infinity;
    this.state = {
      available: false,
      reason: "Codex 连接尚未启动",
      updatedAt: null,
      taskSource: {
        available: false,
        reason: "尚未读取",
        source: "local-index-and-events",
      },
      tasks: [],
      slots: [],
      quota: {
        available: false,
        reason: "尚未读取",
        stale: false,
        buckets: [],
        updatedAt: null,
      },
      shortcuts: structuredClone(SHORTCUTS),
    };
    this.updateSlots();
  }
  track(ids) { this.trackedIds = [...new Set((ids ?? []).filter(validId))].slice(0,7); }
  snapshot() {
    return structuredClone(this.state);
  }
  action(id, params = {}) {
    return describeAction(id, {
      ...params,
      tasks: this.state.tasks,
      slots: this.state.slots,
    });
  }
  async refresh() {
    if (!this.running) return this.start();
    await Promise.all([
      this.pollTasks(),
      this.enableQuota && this.now() - this.lastQuotaAttemptAt >= 15_000
        ? this.pollQuota()
        : Promise.resolve(),
    ]);
    return this.snapshot();
  }
  async start() {
    if (this.running) return this.snapshot();
    this.running = true;
    await Promise.all([
      this.pollTasks(),
      this.enableQuota ? this.pollQuota() : Promise.resolve(),
    ]);
    if (!this.enableQuota) this.state.quota.reason = "额度读取已关闭";
    if (this.running) {
      this.schedule(() => this.pollTasks(), this.pollIntervalMs);
      if (this.enableQuota)
        this.schedule(() => this.pollQuota(), this.quotaIntervalMs);
      this.publish();
    }
    return this.snapshot();
  }
  async stop() {
    this.running = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.client?.stop();
    this.client = null;
  }
  schedule(operation, delay) {
    const timer = setTimeout(async () => {
      this.timers.delete(timer);
      if (!this.running) return;
      try {
        await operation();
      } finally {
        if (this.running) this.schedule(operation, delay);
      }
    }, delay);
    timer.unref?.();
    this.timers.add(timer);
  }
  updateSlots() {
    this.state.slots = Array.from({ length: 6 }, (_, index) => {
      const task = this.state.tasks[index];
      return task
        ? { ...task, index }
        : {
            index,
            id: null,
            title: "未绑定",
            status: "unassigned",
            color: STATUS_COLORS.unassigned,
            updatedAt: null,
          };
    });
  }
  publish() {
    if (!this.running) return;
    this.state.available =
      this.state.taskSource.available || this.state.quota.available;
    this.state.reason = this.state.available ? null : "未能读取本机 Codex 数据";
    this.state.updatedAt = iso(this.now());
    this.updateSlots();
    try {
      this.onChange(this.snapshot());
    } catch {
      /* A UI subscriber must not stop the reader. */
    }
  }
  async sql(database, statement) {
    const { stdout } = await execFileAsync(
      this.sqlitePath,
      ["-readonly", "-json", "-cmd", ".timeout 250", database, statement],
      { timeout: 3_000, maxBuffer: 1_048_576, encoding: "utf8" },
    );
    return stdout.trim() ? JSON.parse(stdout) : [];
  }
  async discoverDatabase() {
    const files = (await readdir(this.codexHome)).filter((name) =>
      /^state_\d+\.sqlite$/.test(name),
    );
    files.sort((a, b) => Number(b.slice(6, -7)) - Number(a.slice(6, -7)));
    return files[0] ? path.join(this.codexHome, files[0]) : null;
  }
  async metadata() {
    try {
      const root = JSON.parse(
        await boundedRead(
          path.join(this.codexHome, ".codex-global-state.json"),
          8_388_608,
        ),
      );
      const direct = findMetadata(root, "unread-thread-ids-by-host-v1.local");
      const nested = findMetadata(root, "unread-thread-ids-by-host-v1")?.local;
      const current = findMetadata(root, "unreadThreadIdsByHostId")?.local;
      const modern = root["electron-thread-read-state-v1"]?.unreadByIdentity;
      const identities = modern && typeof modern === "object" ? Object.values(modern) : [];
      const local = identities.length === 1 && identities[0] && typeof identities[0] === "object"
        ? Object.entries(identities[0]).filter(([key]) => key.startsWith("local:")).map(([,value]) => value) : [];
      const value = modern ? (local.length === 1 ? local[0] : null) : current ?? direct ?? nested;
      const unread = Array.isArray(value)
        ? new Set(value.filter(validId))
        : value && typeof value === "object"
          ? new Set(
              Object.keys(value).filter(
                (id) => validId(id) && value[id] === true,
              ),
            )
          : null;
      const order = findMetadata(root,"app-server-pinned-thread-order-v1");
      const fallback = root["pinned-thread-ids"];
      const pinned = Array.isArray(order) && order.length ? order : Array.isArray(fallback) ? fallback : [];
      return { unread, pinned: pinned.map(value => typeof value === "string" ? value.replace(/^local:/, "") : value?.threadId).filter(validId) };
    } catch {
      return { unread: null, pinned: [] };
    }
  }
  async pollTasks() {
    if (!this.running || this.tasksBusy) return;
    this.tasksBusy = true;
    try {
      const database = await this.discoverDatabase();
      if (!database) throw new Error("no_database");
      const columns = new Set(
        (await this.sql(database, "PRAGMA table_info(threads);")).map(
          (entry) => entry.name,
        ),
      );
      if (!columns.has("id") || !columns.has("rollout_path"))
        throw new Error("unsupported_schema");
      const timeParts = ["recency_at_ms", "updated_at_ms"].filter((column) =>
        columns.has(column),
      );
      if (columns.has("recency_at")) timeParts.push("recency_at * 1000");
      if (columns.has("updated_at")) timeParts.push("updated_at * 1000");
      const recency = timeParts.length
        ? `COALESCE(${[...timeParts, "0"].join(", ")})`
        : "0";
      const titleParts = ["name", "title"]
        .filter((column) => columns.has(column))
        .map((column) => `NULLIF(${column}, '')`);
      const titleExpr = titleParts.length
        ? `COALESCE(${[...titleParts, "'未命名任务'"].join(", ")})`
        : "'未命名任务'";
      const filters = [
        columns.has("archived") ? "COALESCE(archived, 0) = 0" : "1 = 1",
        columns.has("thread_source")
          ? "COALESCE(thread_source, 'user') IN ('user', 'agent_created_thread')"
          : "1 = 1",
      ];
      const metadata = await this.metadata();
      const preferredIds = [...new Set([...this.trackedIds, ...metadata.pinned])].filter(validId).slice(0,100);
      const preferred = preferredIds.length ? `CASE WHEN id IN (${preferredIds.map(id => "'"+id+"'").join(",")}) THEN 0 ELSE 1 END,` : "";
      const rows = await this.sql(
        database,
        `SELECT id, rollout_path, ${titleExpr} AS task_title, ${recency} AS updated_ms, ${columns.has("is_pinned") ? "is_pinned" : "0"} AS is_pinned, ${columns.has("section_position") ? "section_position" : "NULL"} AS section_position FROM threads WHERE ${filters.join(" AND ")} ORDER BY ${preferred} is_pinned DESC, section_position ASC, updated_ms DESC LIMIT ${this.maxTasks};`,
      );
      this.writerState = await this.liveWriters(this.codexHome, rows.map(row => row.id));
      const tasks = [];
      for (const row of rows) {
        if (!validId(row.id)) continue;
        const result = await this.readTaskEvent(row);
        const isUnread = metadata.unread ? metadata.unread.has(row.id) : null;
        const status =
          result.status === "completed" && isUnread === false
            ? "idle"
            : result.status;
        tasks.push({
          id: row.id,
          title: label(row.task_title, "未命名任务"),
          status,
          color: STATUS_COLORS[status],
          pendingKind: result.pendingKind ?? null,
          pinned: Boolean(row.is_pinned) || metadata.pinned.includes(row.id),
          pinOrder: metadata.pinned.includes(row.id) ? metadata.pinned.indexOf(row.id) : row.section_position ?? 10000,
          updatedAt: iso(finite(row.updated_ms)),
          eventAt: iso(result.eventAt),
          isUnread,
          evidence: result.evidence,
        });
      }
      if (!this.running) return;
      tasks.sort((a,b) => Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? ""));
      this.state.tasks = tasks;
      this.lastGoodTasksAt = this.now();
      this.state.taskSource = {
        available: true,
        reason: tasks.length ? null : "本机没有可显示的 Codex 任务",
        source: "local-index-and-events",
        schema: path.basename(database),
        stale: false,
        writerEvidence: this.writerState !== null,
        updatedAt: iso(this.now()),
      };
      const retained = new Set(tasks.map((task) => task.id));
      for (const id of this.cache.keys())
        if (!retained.has(id)) this.cache.delete(id);
    } catch {
      if (!this.running) return;
      if (this.lastGoodTasksAt !== null && this.now() - this.lastGoodTasksAt > 30_000)
        this.state.tasks = this.state.tasks.map(task => ({...task,status:"unknown",color:STATUS_COLORS.unknown,evidence:"索引暂时不可读，状态未确认"}));
      this.state.taskSource = {
        available: false,
        reason: "Codex 索引暂不可用，保留上次任务位置并自动重试",
        stale: true,
        source: "local-index-and-events",
        updatedAt: iso(this.now()),
      };
    } finally {
      this.tasksBusy = false;
      this.publish();
    }
  }
  async readTaskEvent(row) {
    const unknown = {
      status: "unknown",
      eventAt: null,
      evidence: "任务事件不可读或格式未识别",
    };
    if (typeof row.rollout_path !== "string") return unknown;
    try {
      const file = await realpath(
        path.resolve(this.codexHome, row.rollout_path),
      );
      // Rollout paths are untrusted database data. Do not follow them into arbitrary user files.
      const root = await realpath(this.codexHome);
      if (!file.startsWith(`${root}${path.sep}`) || !file.endsWith(".jsonl"))
        return unknown;
      const old = this.cache.get(row.id);
      let raw = old?.raw;
      let activityObservedAt = old?.activityObservedAt ?? null;
      let bootstrap = old?.bootstrap;
      let continuous = true;
      const tail = await readEventLines(file, {
        previous: old?.tail, tailBytes: this.tailBytes,
        onReset: () => { continuous = false; raw = null; bootstrap = null; activityObservedAt = null; },
        onLine: line => {
          const next = classifyEvents(line, {now:this.now(), previousEvent:raw});
          if (next.signature !== raw?.signature)
            activityObservedAt = continuous && next.kind === "active" ? this.now() : null;
          raw = next;
        },
      });
      if (!raw?.kind && tail.offset === tail.size) {
        bootstrap = await findLatestEvent(file, {
          snapshot: tail, previous: bootstrap,
          isEventLine: line => Boolean(classifyEvents(line).kind),
        });
        if (bootstrap.line) {
          raw = classifyEvents(bootstrap.line, {now:this.now()});
          bootstrap = {done:true};
        }
      } else if (raw?.kind) bootstrap = {done:true};
      this.cache.set(row.id, {file, tail, raw, activityObservedAt, bootstrap});
      if (!raw) return unknown;
      if (raw.kind === "active") {
        const age = raw.eventAt === null ? Infinity : this.now() - raw.eventAt;
        const observedAge =
          activityObservedAt === null
            ? Infinity
            : this.now() - activityObservedAt;
        const writer = this.writerState?.get(row.id);
        const owned = writer && raw.eventAt !== null && raw.eventAt >= writer.startedAt && age >= -5_000;
        const running = owned || (
          age >= -5_000 &&
          age <= this.activeWindowMs &&
          observedAge >= 0 &&
          observedAge <= this.activeWindowMs);
        return {
          ...raw,
          status: running ? "running" : "unknown",
          evidence: running
            ? owned ? "当前 Codex 进程仍持有此任务，尚未出现结束事件" : "连接后观察到新的任务活动"
            : "当前是否运行尚未确认",
        };
      }
      const pendingWriter = this.writerState?.get(row.id);
      const pendingOwned = pendingWriter && raw.eventAt !== null && raw.eventAt >= pendingWriter.startedAt && this.now() - raw.eventAt >= -5_000;
      if (raw.kind === "needsInput" && pendingOwned)
        return {...raw, status:"needsInput", evidence:"当前任务仍存在未解决的输入请求"};
      if (
        raw.kind === "needsInput" &&
        (raw.eventAt === null || this.now() - raw.eventAt > 300_000)
      )
        return unknown;
      return raw;
    } catch {
      return unknown;
    }
  }
  async pollQuota() {
    if (!this.running || this.quotaBusy) return;
    this.quotaBusy = true;
    this.lastQuotaAttemptAt = this.now();
    try {
      if (!this.client) {
        const executable = await discoverCodexCLI(this.cliPath);
        if (!executable) throw new Error("missing_cli");
        if (!this.running) return;
        this.client = this.clientFactory({
          executable,
          codexHome: this.codexHome,
        });
      }
      const result = await this.client.readQuota();
      if (this.running) this.state.quota = normalizeQuota(result, this.now());
    } catch {
      this.client?.stop();
      this.client = null;
      if (this.running)
        this.state.quota = {
          ...this.state.quota,
          available: false,
          stale: Boolean(this.state.quota.updatedAt),
          reason: "额度暂不可用，请确认 Codex 桌面已登录；将在下次轮询重试",
        };
    } finally {
      this.quotaBusy = false;
      this.publish();
    }
  }
}
