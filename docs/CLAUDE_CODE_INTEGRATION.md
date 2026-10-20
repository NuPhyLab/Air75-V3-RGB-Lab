# Claude Code integration — 2026-09-20 / Claude Code 集成

[Documentation / 文档目录](README.md)

Local opt-in hooks and session records drive Claude Code status. Hooks observe structural lifecycle fields without copying prompts, tool output or credentials, and never answer permission requests. Session jumps require validated desktop IDs; unsupported terminal jumps and subscription-usage readings remain unavailable. The original English specification distinguishes incoming-machine evidence from receiving-machine verification and documents installation, backups, removal and signing identity.

用户主动安装本地 hook，同步结构化会话事件；不复制提示词、工具输出或凭据，也不代替用户审批。跳转必须有有效桌面 ID，不支持的会话和订阅额度明确不可用；来件与本机验证分开记录。

## Detailed record / 详细记录

# Claude Code integration — 2026-09-20

The cross-machine merge and verification record is in [HANDOVER.md](HANDOVER.md). Live observations below were reported by the sending developer; they are not claims of a second live verification on the receiving Mac.

NuPhyLab reads local Claude Code lifecycle events through hooks it installs on request, plus Claude Code's own local session registry. It never submits a prompt, answers a permission request, sends keystrokes to a session, reads a transcript, or contacts a network service.

## Incoming implementation evidence (other development Mac)

Field names were taken from live payloads on the installed build, not from memory or documentation alone. Claude Code CLI 2.1.174 and the desktop application's bundled 2.1.247 were observed. In this build `SessionStart` carries `source` (not `session_start_source`), `SessionEnd` carries `reason` (not `session_end_reason`) and `StopFailure` carries `error` (not `error_type`). The hook reads both spellings so a future rename does not silently drop data; unknown events are ignored rather than guessed at.

Reported live on the sending development Mac: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `StopFailure`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Stop`, `MessageDisplay`. `PermissionRequest`, `PermissionDenied` and `Notification` are wired from the documented contract and covered by simulated tests; they were not reproduced live because doing so requires an interactive approval prompt.

## Transport

`hooks/nuphylab-claude-hook.sh` resolves a Node runtime from `node-path` (written at install time, with `process.execPath` first) and falls back to `PATH`. Finding none, it prints `{}` and exits 0. `hooks/nuphylab-claude-hook.mjs` reads one payload, writes one short line to `<data>/claude-sessions/<session id>.jsonl`, prints `{}` and exits 0. Reading stops after 1.2 s so an input stream that never closes cannot hold Claude Code. Every failure path is swallowed: a status light must not interrupt a task, block the agentic loop or alter a permission decision. No decision field is ever emitted, so `PermissionRequest` stays observational.

Each line is a single small `write` to an `O_APPEND` file, which keeps concurrent hook processes from interleaving. Records carry a random `q` so duplicates collapse, and the reducer re-derives state from the whole ordered tail on every read, so out-of-order arrival, replays and restarts converge to the same state.

Stored fields: `at`, `q`, `e` (event), `s` (session id), `c` (cwd), `p` (Claude Code process id), `t` (tool name), `k` (notification type), `r` (structural reason code), `m` (permission mode), `a` (agent type). Prompts, tool inputs, tool output, assistant text and credentials are never copied. Communication is local file I/O only; no port is opened.

## State model

`server/claude-events.mjs` is a pure reducer. `Stop` yields `awaitingInput`, never `completed`: ending a turn does not finish a project. `PostToolUseFailure` keeps `running` and increments a counter; only `StopFailure` is an error. `PermissionRequest` and `Notification(permission_prompt)` yield `awaitingApproval`, cleared by `PostToolUse`, `PermissionDenied` or a terminal event.

`server/claude-sessions.mjs` reads `~/.claude/sessions/<pid>.json`, which Claude Code maintains for live local sessions. Liveness compares the recorded process id against `ps` start times; `procStart` is stored without a zone marker but is UTC, so `startedAt` is preferred. A long turn is never downgraded by elapsed time alone — only a gone process ends a session. Without the registry the recorded process id is the only evidence, so a 60-second grace period protects a session whose events are still arriving. After six hours with no event and no liveness evidence the state becomes `unknown` rather than implying work continues.

Sessions present in the registry but with no events read as `unknown` with the reason stated, which is what an installation that predates a running session looks like.

## Controls

`server/claude-actions.mjs` returns descriptors only. Executed actions use `/usr/bin/open` and `/usr/bin/pbcopy` with validated arguments: activate the Claude desktop application by bundle id, open a recorded project directory, or copy a resume command. Approval, rejection, session input and new-session creation are exposed as unavailable with the reason; NuPhyLab never answers a permission request. Sessions whose `entrypoint` is not the desktop application cannot have their terminal window located, so application focus is disabled for them instead of guessing.

Command keys resolve entirely inside NuPhyLab — next session, next session needing attention, lighting mode, wake, refresh — so these actions do not inject key events. Capturing a system-reserved key such as F11 or adapting media keys can still require Accessibility permission.

## Installation

`server/claude-hooks.mjs` merges eleven entries into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`). The previous file is copied to `~/.claude/nuphylab-backups/` before every change, keeping ten. Entries are identified by the launcher's filename, so re-running install replaces them in place instead of duplicating, and remove deletes exactly those, dropping emptied groups and the `hooks` key when nothing else remains. Other hooks, other keys and key order survive both operations. An unparsable settings file is reported and left untouched. `disableAllHooks` is surfaced rather than ignored.

Paths are quoted for POSIX `sh`, so a data directory containing spaces or Chinese characters works; scripts live at a fixed path under the NuPhyLab data directory, never a temporary one.

## Session jump

The Claude desktop application handles `claude://code/continue?session=<id>`. Its own URL router accepts `last` or `/^local_[A-Za-z0-9-]{1,64}$/`, read from the installed application rather than assumed. That id is the application's **own** session id, not the Claude Code `session_id`: passing the latter passes validation, matches nothing, and silently opens a new session.

The correspondence comes from the application's own record for each Code session, `~/Library/Application Support/Claude/claude-code-sessions/**/local_<uuid>.json`, whose `sessionId` is the id the link needs and whose `cliSessionId` is the id hooks report. `readDesktopSessionIds` reads only those two fields, newest 200 records, 4 MB per file; the JSON files are parsed in memory, but titles, first messages and system prompts are not used, retained, or exposed. `CLAUDE_DESKTOP_SUPPORT` overrides the location, and tests run against a temporary directory.

A session with no desktop record — one started with `claude` in a terminal, for example — reports the jump as unavailable with the reason instead of guessing an id. A regression test pins that, because the failure mode is silent session creation rather than an error. The record layout is not a public interface; if a future desktop version changes it, the jump degrades to unavailable rather than to wrong behaviour.

## Account usage

Claude Code exposes no local interface for a third-party application to read subscription usage; `/usage` and `/status` are interactive commands and the Rate Limits API covers API-key accounts. The page therefore states that reading is unsupported. No token count, cost estimate or guess is presented as a remaining allowance, and no credential is read.

## Boundary

Simulated events cover every transition, session isolation, duplicate and out-of-order delivery, concurrent writes, installation, repair and removal. The sending developer reported live verification of session discovery, running state, tool failure not becoming task failure, process-exit detection, and — with an Air75 V3 attached — every status colour read back from the keyboard's own RGB channels, whole-keyboard mode, game takeover and restore, sleep and wake. An interactive approval prompt and a machine without Node were not exercised.

## macOS permission identity

The receiving project retains `local.airstudio.desktop` and its original Apple signing certificate. The sending Mac used a different identifier and a local self-signed certificate to work around its own stale permission record; that machine-specific workaround was not imported. macOS permission grants depend on both application identity and signing requirements, so a source merge must not silently change them. No permission reset is performed by the merge or package scripts.

`signing.json` in the bundle records whether the signature was ad-hoc, so the setup sheet can explain the remove-and-re-add step instead of leaving the user in front of a checkbox that is already on.
