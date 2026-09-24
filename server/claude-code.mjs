// Reads local Claude Code session status for NuPhyLab.
//
// Two local read-only sources are combined: the hook spool this application
// installs, which carries lifecycle events, and Claude Code's own session
// registry, which lists sessions that are alive right now. Nothing is sent to
// Claude Code, no prompt is submitted and no permission request is answered.
import { open, readdir, rm, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { applyLiveness, normalizeEvent, reduceSession } from "./claude-events.mjs";
import { readDesktopSessionIds, readProcessStarts, readSessionRegistry, resolveLiveness } from "./claude-sessions.mjs";
import { ClaudeHookInstaller } from "./claude-hooks.mjs";
import { CLAUDE_COMMANDS, ClaudeActionRunner, claudeAppInstalled, describeClaudeAction } from "./claude-actions.mjs";
import { CLAUDE_STATUS_COLORS } from "../shared/claude-lighting.mjs";

const iso = (value) => (Number.isFinite(value) ? new Date(value).toISOString() : null);
const MAX_FILES = 64;
const MAX_EVENTS = 400;

async function tailRead(file, maximumBytes) {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("not_regular_file");
    const start = Math.max(0, info.size - maximumBytes);
    const buffer = Buffer.alloc(Math.min(info.size, maximumBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let data = buffer.subarray(0, bytesRead).toString("utf8");
    if (start > 0) {
      const newline = data.indexOf("\n");
      data = newline >= 0 ? data.slice(newline + 1) : "";
    }
    return { data, size: info.size, mtimeMs: info.mtimeMs };
  } finally {
    await handle.close();
  }
}
export class ClaudeCodeAdapter {
  constructor({
    dataDir = path.join(homedir(), "Library/Application Support/Air Studio"),
    claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"),
    supportDir = process.env.CLAUDE_DESKTOP_SUPPORT ?? path.join(homedir(), "Library/Application Support/Claude"),
    onChange = () => {},
    pollIntervalMs = 800,
    tailBytes = 131_072,
    endedRetentionMs = 30 * 60 * 1000,
    spoolRetentionMs = 7 * 24 * 60 * 60 * 1000,
    staleMs = 6 * 60 * 60 * 1000,
    now = Date.now,
    installer = null,
    runner = new ClaudeActionRunner(),
  } = {}) {
    this.installer = installer ?? new ClaudeHookInstaller({ dataDir, claudeDir });
    Object.assign(this, { dataDir, claudeDir, supportDir, onChange, now, runner, endedRetentionMs, spoolRetentionMs, staleMs });
    this.spoolDir = this.installer.spoolDir;
    this.pollIntervalMs = Math.max(200, pollIntervalMs);
    this.tailBytes = Math.min(Math.max(4096, tailBytes), 1_048_576);
    this.cache = new Map();
    this.trackedIds = [];
    this.running = false;
    this.busy = false;
    this.timer = null;
    this.watcher = null;
    this.watchTimer = null;
    this.lastPruneAt = -Infinity;
    this.appInstalled = true;
    this.state = {
      available: false,
      reason: "Claude Code 接入尚未启动",
      updatedAt: null,
      taskSource: { available: false, reason: "尚未读取", source: "local-hooks-and-session-registry" },
      hooks: { status: "unknown", installed: false, reason: "尚未检查" },
      tasks: [],
      slots: [],
      commands: structuredClone(CLAUDE_COMMANDS),
      quota: {
        available: false,
        supported: false,
        reason: "Claude Code 暂不支持读取账户剩余额度",
        detail: "Claude Code 没有提供给第三方应用读取订阅额度的本机接口。请在 Claude Code 中使用 /usage 或 /status 查看。",
        updatedAt: null,
      },
      app: { installed: true, bundleId: "com.anthropic.claudefordesktop" },
    };
    this.updateSlots();
  }
  track(ids) {
    this.trackedIds = [...new Set((ids ?? []).filter((value) => typeof value === "string" && value))].slice(0, 7);
  }
  snapshot() {
    return structuredClone(this.state);
  }
  action(id, { session = null } = {}) {
    return describeClaudeAction(id, { session, appInstalled: this.appInstalled });
  }
  execute(action) {
    return this.runner.execute(action);
  }
  hookStatus() {
    return this.installer.status();
  }
  async install(options) {
    const result = await this.installer.install(options);
    this.spoolDir = this.installer.spoolDir;
    this.cache.clear();
    await this.refresh();
    return result;
  }
  async remove(options) {
    const result = await this.installer.remove(options);
    this.cache.clear();
    await this.refresh();
    return result;
  }
  async start() {
    if (this.running) return this.snapshot();
    this.running = true;
    this.appInstalled = await claudeAppInstalled();
    this.state.app.installed = this.appInstalled;
    await this.refresh();
    this.schedule();
    this.observe();
    return this.snapshot();
  }
  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.timer = null;
    this.watchTimer = null;
    try { this.watcher?.close(); } catch { /* already gone */ }
    this.watcher = null;
  }
  schedule() {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      this.timer = null;
      if (!this.running) return;
      try { await this.refresh(); } finally { this.schedule(); }
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }
  /** Directory watching only shortens the reaction time; polling is the source of truth. */
  observe() {
    try {
      this.watcher = watch(this.spoolDir, { persistent: false }, () => {
        if (this.watchTimer || !this.running) return;
        this.watchTimer = setTimeout(() => {
          this.watchTimer = null;
          void this.refresh().catch(() => {});
        }, 60);
        this.watchTimer.unref?.();
      });
      this.watcher.on?.("error", () => { this.watcher = null; });
    } catch {
      this.watcher = null;
    }
  }
  async readSpool() {
    const names = (await readdir(this.spoolDir))
      .filter((name) => name.endsWith(".jsonl") && /^[A-Za-z0-9_.:-]{1,80}\.jsonl$/.test(name))
      .slice(0, MAX_FILES);
    const sessions = new Map();
    for (const name of names) {
      const file = path.join(this.spoolDir, name);
      const id = name.slice(0, -6);
      let info;
      try { info = await stat(file); } catch { continue; }
      const cached = this.cache.get(id);
      if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) {
        sessions.set(id, cached.events);
        continue;
      }
      let parsed = [];
      try {
        const { data } = await tailRead(file, this.tailBytes);
        const lines = data.split("\n");
        parsed = lines
          .slice(Math.max(0, lines.length - MAX_EVENTS - 1))
          .flatMap((line, index) => {
            if (!line || line.length > 8192) return [];
            try {
              const event = normalizeEvent(JSON.parse(line), index);
              return event && event.session === id ? [event] : [];
            } catch {
              return [];
            }
          });
      } catch {
        if (cached) { sessions.set(id, cached.events); continue; }
        continue;
      }
      this.cache.set(id, { size: info.size, mtimeMs: info.mtimeMs, events: parsed, mtime: info.mtimeMs });
      sessions.set(id, parsed);
    }
    for (const id of [...this.cache.keys()]) if (!sessions.has(id)) this.cache.delete(id);
    return sessions;
  }
  async prune() {
    const now = this.now();
    if (now - this.lastPruneAt < 60 * 60 * 1000) return;
    this.lastPruneAt = now;
    try {
      for (const name of await readdir(this.spoolDir)) {
        if (!name.endsWith(".jsonl")) continue;
        const file = path.join(this.spoolDir, name);
        const info = await stat(file).catch(() => null);
        if (info && now - info.mtimeMs > this.spoolRetentionMs) await rm(file, { force: true });
      }
    } catch {
      /* the spool may not exist yet */
    }
  }
  async refresh() {
    if (this.busy) return this.snapshot();
    this.busy = true;
    try {
      const now = this.now();
      const hooks = await this.hookStatus().catch((error) => ({
        status: "error", installed: false, reason: error.message, missing: [], outdated: [],
      }));
      let spool = null;
      let spoolError = null;
      // A missing spool folder simply means no session has reported yet.
      try { spool = await this.readSpool(); }
      catch (error) { if (error?.code === "ENOENT") spool = new Map(); else spoolError = error; }
      const registry = await readSessionRegistry(this.claudeDir);
      // The Claude desktop application's own id for each session, needed by its
      // claude://code/continue link. Absent for sessions it never hosted.
      const desktopIds = (await readDesktopSessionIds(this.supportDir)) ?? new Map();
      const ids = new Set([...(spool?.keys() ?? []), ...(registry?.keys() ?? [])]);
      const pids = new Set();
      const reduced = new Map();
      for (const id of ids) {
        const events = spool?.get(id) ?? [];
        const base = reduceSession(events, { now });
        reduced.set(id, base);
        if (base.pid) pids.add(base.pid);
        const entry = registry?.get(id);
        if (entry?.pid) pids.add(entry.pid);
      }
      const starts = pids.size ? await readProcessStarts([...pids]) : new Map();
      const tasks = [];
      for (const id of ids) {
        const base = reduced.get(id);
        const events = spool?.get(id) ?? [];
        const firstEventAt = events.length ? Math.min(...events.map((event) => event.at)) : null;
        const { alive, registered, entry } = resolveLiveness({ registry, starts, sessionId: id, pid: base.pid, firstEventAt });
        const state = events.length
          ? applyLiveness(base, { alive, registered, registryReadable: registry !== null, staleMs: this.staleMs, now })
          : {
              ...base,
              alive,
              registered,
              status: alive === false ? "ended" : "unknown",
              endedReason: alive === false ? "disconnected" : null,
              evidence: alive === false
                ? "会话已结束"
                : hooks.installed
                  ? "已识别这个会话，但还没有收到事件；它会在下一次活动时开始上报。"
                  : "尚未安装 Claude Code 接入，无法确认状态。",
            };
        const cwd = state.cwd ?? entry?.cwd ?? null;
        const project = cwd ? path.basename(cwd) : null;
        const endedAt = state.status === "ended" ? (state.lastEventAt ?? now) : null;
        if (endedAt !== null && now - endedAt > this.endedRetentionMs && !this.trackedIds.includes(id)) continue;
        tasks.push({
          id,
          desktopId: desktopIds.get(id) ?? null,
          title: entry?.name ?? project ?? "Claude Code 会话",
          project,
          cwd,
          status: state.status,
          color: CLAUDE_STATUS_COLORS[state.status] ?? CLAUDE_STATUS_COLORS.unknown,
          evidence: state.evidence,
          pendingKind: state.status === "awaitingApproval" ? "approval" : null,
          pendingTool: state.pendingApproval?.tool ?? null,
          turnActive: state.turnActive,
          lastTool: state.lastTool,
          toolFailures: state.toolFailures,
          errorType: state.errorType,
          endedReason: state.endedReason,
          live: state.alive,
          registered: Boolean(registered),
          entrypoint: entry?.entrypoint ?? null,
          kind: entry?.kind ?? null,
          version: entry?.version ?? null,
          pid: entry?.pid ?? state.pid ?? null,
          permissionMode: state.permissionMode,
          events: state.events,
          startedAt: iso(state.startedAt ?? entry?.startedAt ?? null),
          eventAt: iso(state.lastEventAt),
          updatedAt: iso(state.lastEventAt ?? entry?.startedAt ?? null),
        });
      }
      const rank = { running: 0, awaitingApproval: 0, awaitingInput: 0, error: 0, unknown: 1, ended: 2 };
      tasks.sort(
        (a, b) =>
          (rank[a.status] ?? 1) - (rank[b.status] ?? 1) ||
          Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "") ||
          a.id.localeCompare(b.id),
      );
      this.state.tasks = tasks;
      this.state.hooks = hooks;
      this.state.taskSource = {
        available: !spoolError && hooks.installed,
        source: "local-hooks-and-session-registry",
        spoolReadable: !spoolError,
        registryReadable: registry !== null,
        sessions: tasks.length,
        reason: !hooks.installed
          ? (hooks.reason ?? "尚未安装 Claude Code 接入")
          : spoolError
            ? "事件目录暂不可读，稍后自动重试"
            : tasks.length
              ? null
              : "本机当前没有可显示的 Claude Code 会话",
        updatedAt: iso(now),
      };
      this.state.app.installed = this.appInstalled;
      this.state.available = hooks.installed && !spoolError;
      this.state.reason = this.state.available ? null : this.state.taskSource.reason;
      this.state.updatedAt = iso(now);
      this.updateSlots();
      await this.prune();
    } finally {
      this.busy = false;
      this.publish();
    }
    return this.snapshot();
  }
  updateSlots() {
    this.state.slots = Array.from({ length: 6 }, (_, index) => {
      const task = this.state.tasks[index];
      return task
        ? { ...task, index }
        : { index, id: null, desktopId: null, title: "未绑定", status: "unassigned", color: CLAUDE_STATUS_COLORS.unassigned, updatedAt: null };
    });
  }
  publish() {
    try {
      this.onChange(this.snapshot());
    } catch {
      /* a UI subscriber must not stop the reader */
    }
  }
}
