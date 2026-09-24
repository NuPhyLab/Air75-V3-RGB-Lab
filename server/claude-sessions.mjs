// Reads the local Claude Code session registry and process start times.
//
// Claude Code maintains <claude home>/sessions/<pid>.json for each live local
// session. NuPhyLab only reads it: nothing is created, changed or removed, and
// the per-session messaging socket is never contacted.
import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const MAX_FILES = 64;
const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(value);
const clean = (value, max) =>
  typeof value === "string" ? value.replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/g, " ").trim().slice(0, max) || null : null;

/** Start times for live processes, used to reject reused process ids. */
export async function readProcessStarts(pids, { run = exec } = {}) {
  const list = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0).slice(0, 64);
  if (!list.length) return new Map();
  try {
    const { stdout } = await run("/bin/ps", ["-p", list.join(","), "-o", "pid=,lstart="], {
      timeout: 2000, maxBuffer: 65536, env: { ...process.env, LC_ALL: "C" },
    });
    return new Map(
      stdout.trim().split("\n").flatMap((line) => {
        const match = /^\s*(\d+)\s+(.+)$/.exec(line);
        const time = Date.parse(match?.[2] ?? "");
        return match && Number.isFinite(time) ? [[Number(match[1]), time]] : [];
      }),
    );
  } catch (error) {
    // ps exits non-zero when none of the requested ids are alive.
    if (error.stdout !== undefined && !String(error.stdout).trim()) return new Map();
    return null;
  }
}
/** Live local Claude Code sessions, keyed by session id. */
export async function readSessionRegistry(claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude")) {
  const dir = path.join(claudeDir, "sessions");
  let names;
  try {
    names = (await readdir(dir)).filter((name) => /^\d+\.json$/.test(name)).slice(0, MAX_FILES);
  } catch {
    return null;
  }
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const raw = await readFile(path.join(dir, name), "utf8");
        if (raw.length > 65536) return null;
        const value = JSON.parse(raw);
        if (!value || typeof value !== "object" || !validId(value.sessionId)) return null;
        // procStart is written without a zone marker but is UTC; startedAt is
        // unambiguous epoch milliseconds and is preferred when present.
        const utc = Date.parse(`${value.procStart ?? ""} UTC`);
        const start = Number.isFinite(value.startedAt) ? value.startedAt : utc;
        return {
          id: value.sessionId,
          pid: Number.isInteger(value.pid) && value.pid > 0 ? value.pid : null,
          procStartAt: Number.isFinite(start) ? start : null,
          cwd: clean(value.cwd, 1024),
          name: clean(value.name, 80),
          kind: clean(value.kind, 40),
          entrypoint: clean(value.entrypoint, 40),
          version: clean(value.version, 40),
          startedAt: Number.isFinite(value.startedAt) ? value.startedAt : null,
        };
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean).map((entry) => [entry.id, entry]));
}
/**
 * Maps a Claude Code session id to the id the Claude desktop application uses
 * in its own claude://code/continue link.
 *
 * The application keeps one record per Code session under
 * <support>/claude-code-sessions/**\/local_<uuid>.json, holding its own
 * `sessionId` ("local_<uuid>") next to the `cliSessionId` that hooks report.
 * Only those two identifiers are read; titles, prompts and system prompts in
 * the same file are never touched.
 */
export async function readDesktopSessionIds(
  supportDir = path.join(homedir(), "Library/Application Support/Claude"),
  { maxFiles = 200, maxBytes = 4 * 1024 * 1024 } = {},
) {
  const root = path.join(supportDir, "claude-code-sessions");
  let files;
  try {
    files = (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^local_[A-Za-z0-9-]{1,64}\.json$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath ?? entry.path ?? root, entry.name));
  } catch {
    return null;
  }
  const dated = (await Promise.all(files.slice(0, 2000).map(async (file) => {
    try { return { file, at: (await stat(file)).mtimeMs }; } catch { return null; }
  }))).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, maxFiles);
  const map = new Map();
  for (const { file } of dated) {
    try {
      const raw = await readFile(file, "utf8");
      if (raw.length > maxBytes) continue;
      const value = JSON.parse(raw);
      const desktop = value?.sessionId;
      const cli = value?.cliSessionId;
      if (validId(cli) && typeof desktop === "string" && /^local_[A-Za-z0-9-]{1,64}$/.test(desktop) && !map.has(cli))
        map.set(cli, desktop);
    } catch {
      /* a record being written, or one this version does not understand */
    }
  }
  return map;
}
/**
 * Decides whether each session is still running.
 * Returns true, false, or null when no evidence is available.
 */
export function resolveLiveness({ registry, starts, sessionId, pid, firstEventAt }) {
  const entry = registry?.get(sessionId) ?? null;
  if (entry) {
    if (entry.pid === null || starts === null) return { alive: null, registered: true, entry };
    const started = starts.get(entry.pid);
    if (started === undefined) return { alive: false, registered: true, entry };
    // A reused process id would not match the recorded start time.
    if (entry.procStartAt !== null && Math.abs(started - entry.procStartAt) > 120_000)
      return { alive: false, registered: true, entry };
    return { alive: true, registered: true, entry };
  }
  if (registry === null || starts === null || !Number.isInteger(pid)) return { alive: null, registered: false, entry };
  const started = starts.get(pid);
  if (started === undefined) return { alive: false, registered: false, entry };
  // The owning process must predate the first event we recorded for it.
  if (Number.isFinite(firstEventAt) && started > firstEventAt + 5000)
    return { alive: false, registered: false, entry };
  return { alive: true, registered: false, entry };
}
