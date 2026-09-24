// Installs, inspects and removes NuPhyLab's local Claude Code hooks.
//
// Only the entries this application owns are touched. Other hooks, other
// settings keys and their order are preserved, the previous file is backed up
// before every change, and re-running install never creates duplicates.
import { chmod, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_EVENTS } from "./claude-events.mjs";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../hooks");
export const HOOK_MARKER = "nuphylab-claude-hook.sh";
export const HOOK_VERSION = 1;
const MAX_BACKUPS = 10;
const TIMEOUT_SECONDS = 5;

/** POSIX single-quote quoting, so Chinese characters and spaces stay intact. */
export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}
export function hookCommand(hookDir, spoolDir) {
  return `${shellQuote(path.join(hookDir, HOOK_MARKER))} ${shellQuote(spoolDir)}`;
}
const isOurs = (entry) =>
  entry && entry.type === "command" && typeof entry.command === "string" && entry.command.includes(HOOK_MARKER);

export class ClaudeHookInstaller {
  constructor({ dataDir, claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"), sourceDir = source } = {}) {
    this.dataDir = dataDir;
    this.claudeDir = path.resolve(claudeDir);
    this.sourceDir = sourceDir;
    this.hookDir = path.join(dataDir, "claude-hook");
    this.spoolDir = path.join(dataDir, "claude-sessions");
    this.settingsPath = path.join(this.claudeDir, "settings.json");
    this.backupDir = path.join(this.claudeDir, "nuphylab-backups");
  }
  get command() {
    return hookCommand(this.hookDir, this.spoolDir);
  }
  async readSettings() {
    try {
      const raw = await readFile(this.settingsPath, "utf8");
      if (raw.length > 4 * 1024 * 1024) throw new Error("too_large");
      if (!raw.trim()) return { settings: {}, existed: true, raw };
      const settings = JSON.parse(raw);
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("not_object");
      return { settings, existed: true, raw };
    } catch (error) {
      if (error.code === "ENOENT") return { settings: {}, existed: false, raw: null };
      throw new Error("无法读取 Claude Code 配置文件，未做任何修改：" + this.settingsPath);
    }
  }
  async backup(raw) {
    if (raw === null) return null;
    await mkdir(this.backupDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(this.backupDir, `settings-${stamp}.json`);
    await writeFile(file, raw, { mode: 0o600 });
    const files = (await readdir(this.backupDir)).filter((name) => /^settings-.*\.json$/.test(name)).sort();
    for (const old of files.slice(0, Math.max(0, files.length - MAX_BACKUPS)))
      await rm(path.join(this.backupDir, old), { force: true });
    return file;
  }
  async writeSettings(settings) {
    await mkdir(this.claudeDir, { recursive: true });
    const tmp = `${this.settingsPath}.nuphylab-tmp`;
    await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, this.settingsPath);
  }
  /** Copies the hook scripts to a stable path inside the NuPhyLab data folder. */
  async writeScripts(nodeCandidates = []) {
    await mkdir(this.hookDir, { recursive: true, mode: 0o700 });
    await mkdir(this.spoolDir, { recursive: true, mode: 0o700 });
    for (const name of [HOOK_MARKER, "nuphylab-claude-hook.mjs"])
      await copyFile(path.join(this.sourceDir, name), path.join(this.hookDir, name));
    await chmod(path.join(this.hookDir, HOOK_MARKER), 0o755);
    await chmod(path.join(this.hookDir, "nuphylab-claude-hook.mjs"), 0o644);
    const candidates = [...new Set([process.execPath, ...nodeCandidates, "/opt/homebrew/bin/node", "/usr/local/bin/node"])]
      .filter((value) => typeof value === "string" && path.isAbsolute(value));
    await writeFile(path.join(this.hookDir, "node-path"), `${candidates.join("\n")}\n`, { mode: 0o644 });
    await writeFile(
      path.join(this.hookDir, "manifest.json"),
      `${JSON.stringify({ app: "NuPhyLab", version: HOOK_VERSION, spoolDir: this.spoolDir, events: HOOK_EVENTS, installedAt: new Date().toISOString() }, null, 2)}\n`,
      { mode: 0o644 },
    );
  }
  /** Merges our entries into an existing hooks object without disturbing others. */
  mergeHooks(existing) {
    const hooks = { ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}) };
    const entry = { type: "command", command: this.command, timeout: TIMEOUT_SECONDS };
    for (const event of HOOK_EVENTS) {
      const groups = Array.isArray(hooks[event]) ? hooks[event].map((group) => ({ ...group })) : [];
      let placed = false;
      const merged = groups.flatMap((group) => {
        const list = Array.isArray(group.hooks) ? group.hooks : [];
        const ours = list.filter(isOurs);
        const others = list.filter((item) => !isOurs(item));
        if (!ours.length) return [group];
        // Replace every previously installed copy with exactly one current entry.
        const next = placed ? others : [...others, { ...entry }];
        placed = true;
        return next.length ? [{ ...group, hooks: next }] : [];
      });
      hooks[event] = placed ? merged : [...merged, { hooks: [{ ...entry }] }];
    }
    return hooks;
  }
  stripHooks(existing) {
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) return { hooks: existing, removed: 0 };
    let removed = 0;
    const hooks = {};
    for (const [event, groups] of Object.entries(existing)) {
      if (!Array.isArray(groups)) {
        hooks[event] = groups;
        continue;
      }
      const kept = groups.flatMap((group) => {
        const list = Array.isArray(group?.hooks) ? group.hooks : null;
        if (!list) return [group];
        const others = list.filter((item) => !isOurs(item));
        removed += list.length - others.length;
        if (others.length === list.length) return [group];
        return others.length ? [{ ...group, hooks: others }] : [];
      });
      if (kept.length) hooks[event] = kept;
    }
    return { hooks, removed };
  }
  async install({ nodeCandidates = [] } = {}) {
    const { settings, raw } = await this.readSettings();
    await this.writeScripts(nodeCandidates);
    const backup = await this.backup(raw);
    const next = { ...settings, hooks: this.mergeHooks(settings.hooks) };
    await this.writeSettings(next);
    return { ...(await this.status()), backup, changed: raw !== `${JSON.stringify(next, null, 2)}\n` };
  }
  async remove({ purgeSpool = true } = {}) {
    const { settings, raw, existed } = await this.readSettings();
    let backup = null;
    let removed = 0;
    if (existed) {
      const result = this.stripHooks(settings.hooks);
      if (result.removed) {
        backup = await this.backup(raw);
        const next = { ...settings };
        if (result.hooks && Object.keys(result.hooks).length) next.hooks = result.hooks;
        else delete next.hooks;
        await this.writeSettings(next);
      }
      removed = result.removed;
    }
    await rm(this.hookDir, { recursive: true, force: true });
    if (purgeSpool) await rm(this.spoolDir, { recursive: true, force: true });
    return { ...(await this.status()), backup, removed };
  }
  async status() {
    const base = {
      settingsPath: this.settingsPath,
      hookDir: this.hookDir,
      spoolDir: this.spoolDir,
      command: this.command,
      events: HOOK_EVENTS,
      version: HOOK_VERSION,
    };
    let settings;
    try {
      ({ settings } = await this.readSettings());
    } catch (error) {
      return { ...base, status: "error", installed: false, reason: error.message, missing: HOOK_EVENTS, outdated: [], otherHooks: 0, disabled: false };
    }
    const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? settings.hooks : {};
    const missing = [];
    const outdated = [];
    let otherHooks = 0;
    for (const [event, groups] of Object.entries(hooks))
      if (Array.isArray(groups))
        for (const group of groups)
          if (Array.isArray(group?.hooks)) otherHooks += group.hooks.filter((item) => !isOurs(item)).length;
    for (const event of HOOK_EVENTS) {
      const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
      const ours = groups.flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks.filter(isOurs) : []));
      if (!ours.length) missing.push(event);
      else if (!ours.every((item) => item.command === this.command)) outdated.push(event);
    }
    let scripts = true;
    try {
      await readFile(path.join(this.hookDir, "nuphylab-claude-hook.mjs"), "utf8");
    } catch {
      scripts = false;
    }
    const disabled = settings.disableAllHooks === true;
    const status = missing.length === HOOK_EVENTS.length && !outdated.length
      ? "missing"
      : missing.length || outdated.length || !scripts
        ? "needsRepair"
        : disabled
          ? "disabled"
          : "installed";
    return {
      ...base,
      status,
      installed: status === "installed",
      scripts,
      disabled,
      missing,
      outdated,
      otherHooks,
      reason:
        status === "missing"
          ? "尚未为这台电脑安装 Claude Code 接入"
          : status === "needsRepair"
            ? !scripts
              ? "钩子脚本缺失，请点击修复"
              : "配置与当前安装位置不一致，请点击修复"
            : status === "disabled"
              ? "Claude Code 设置中的 disableAllHooks 为 true，钩子不会运行"
              : null,
    };
  }
}
