// NuPhyLab Claude Code status hook.
//
// Reads one hook payload on stdin and appends a minimal status record to the
// NuPhyLab spool. It stores only the session id, project path, process id,
// timestamp and lifecycle facts. Prompts, tool inputs, tool output, assistant
// messages and account credentials are never copied out of the payload.
//
// It always exits 0 with an empty JSON object, never blocks longer than the
// read deadline below, changes no permission decision, and calls neither a model
// nor the network. When NuPhyLab is not running the record simply waits in the
// spool until it starts.
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const READ_DEADLINE_MS = 1200;
const MAX_INPUT = 1024 * 1024;
const MAX_FILE = 4 * 1024 * 1024;
const ALLOWED = new Set([
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "PermissionRequest", "PermissionDenied", "Notification", "Stop", "StopFailure", "SessionEnd",
]);
const clean = (value, max) =>
  typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max) || undefined : undefined;

function finish() {
  // Exit explicitly so an input stream that never closes cannot hold Claude Code.
  const quit = () => process.exit(0);
  const timer = setTimeout(quit, 200);
  timer.unref?.();
  process.stdout.write("{}", quit);
}
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0, settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(done, READ_DEADLINE_MS);
    timer.unref?.();
    process.stdin.on("data", (chunk) => {
      total += chunk.length;
      if (total <= MAX_INPUT) chunks.push(chunk);
      else done();
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    process.stdin.on("close", done);
  });
}
try {
  const spool = process.argv[2];
  const payload = path.isAbsolute(spool ?? "") ? JSON.parse(await readStdin()) : null;
  const event = clean(payload?.hook_event_name, 40);
  const session = clean(payload?.session_id, 80);
  if (event && ALLOWED.has(event) && session && /^[A-Za-z0-9_.:-]{1,80}$/.test(session)) {
    const pid = Number.parseInt(process.env.NUPHYLAB_HOOK_PID ?? "", 10);
    const record = {
      v: 1,
      at: Date.now(),
      q: Math.random().toString(36).slice(2, 10),
      e: event,
      s: session,
      c: clean(payload.cwd, 1024),
      p: Number.isInteger(pid) && pid > 0 ? pid : undefined,
      t: clean(payload.tool_name, 60),
      k: clean(payload.notification_type ?? payload.notification?.type, 60),
      // Structural reason codes only: SessionStart source, SessionEnd reason and
      // the StopFailure error class. No message text is copied.
      r: clean(payload.source ?? payload.session_start_source ?? payload.reason ??
        payload.session_end_reason ?? payload.error ?? payload.error_type, 60),
      m: clean(payload.permission_mode, 40),
      a: clean(payload.agent_type, 60),
    };
    mkdirSync(spool, { recursive: true, mode: 0o700 });
    const file = path.join(spool, `${session}.jsonl`);
    let size = 0;
    try { size = statSync(file).size; } catch { size = 0; }
    // One short line per append keeps concurrent writers from interleaving.
    if (size < MAX_FILE) appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  }
} catch {
  // A status light must never interrupt Claude Code.
}
finish();
