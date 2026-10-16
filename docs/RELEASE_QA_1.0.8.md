# NuPhyLab v1.0.8 validation — 2026-10-16

## Diagnosis and change

Two real, concurrent local Codex tasks produced tool-output records over 1 MB and a compaction record over 13 MB. The previous reader re-read only the last 256 KiB on each change. A large record could displace every recognizable structural event, turning a running task into unknown until another event arrived. USB readback matched the software's frame, so this reproduced failure was in status acquisition, not a dropped individual LED write.

The reader now processes append-only JSONL incrementally. It retains structural lifecycle state across oversized records and incomplete writes, processes completion records in order, and resets on file replacement or truncation. Each poll reads at most 4 MiB forward per file and retains at most 1 MiB of an incomplete record.

Cold starts with no recognizable event in the initial tail also search backwards for the newest complete structural event, in 4 MiB batches, capped at 32 MiB. This closes the restart case where the application starts immediately after a large tool result. New live events supersede an unfinished historical search. A live writer alone does not establish running: process lifetime and lifecycle evidence still apply. Search exhaustion remains unknown.

Full regression also exposed an intermittent stale playback-error banner after a successful explicit reconnect. The reconnect now clears the previous error after a successful compatible connection; subsequent failures still surface. A deterministic reproduction fails against the preceding bundle and passes against the final code.

## Automated checks

- Full suite: 314 tests passed, no failures or skips. UI production build passed.
- Old v1.0.7 fails the two-task oversized-output and completion-before-compaction regressions. The fixed reader passes both.
- Cold-start tests cover two running tasks behind large records, completion before a 13.5 MB record, pending user input, activity from a previous process, and new completion arriving during backward search.
- Reader tests cover split UTF-8, partial final records, giant-line skipping, finite search/read limits, replacement and truncation. Large record content is not persisted by the adapter.
- Packaged modules pass the four task-reader integration regressions and explicit reconnect regression.
- Company-signed native helper: 1,628 offline checks passed without opening hardware or an input monitor. Signed Node ESM worker smoke test passed. Native binaries were unchanged.

## Physical keyboard and app

Air75 V3 ANSI over USB, firmware 1.0.23.6, Mac profile, Apple Silicon Mac.

- The corrected reader ran against two actual concurrent Codex tasks for 180 samples over approximately three minutes. Both remained running in every sample; no unknown-state dropout occurred. Their two corresponding keys remained blue in every software frame.
- All 36 serialized D2 RGB readbacks matched the acknowledged keyboard frame. No playback error or lighting sleep occurred.
- The final bundle contains the identical verified reader, plus the explicit reconnect-warning fix. A further restart check and device readbacks were performed after installation; counts are recorded in the accompanying validation JSON.
- Native UI displayed both real tasks as thinking. F1–F12 registrations had no failed bindings; Accessibility and Input Monitoring stayed allowed.
- User library/settings/scenes compared exactly equal after testing. Both global lighting timers remained one hour. No fake tasks were added to the user's Codex account.

## Distribution

Developer ID Application: Shenzhen NuPhy Technology Co., Ltd. (VBD322WS9K). Hardened Runtime and secure timestamp enabled. Apple notarization `2805cba8-667e-47bd-8843-d18716522ffb` returned Accepted. The installed app was stapled, then the final ZIP was rebuilt. A fresh extraction passed strict code-signature verification, staple validation and `syspolicy_check distribution`.

Temporary probes, copied test libraries and additional app bundles are removed after verification. Source regression tests remain in the project. Existing keyboard recovery journals are retained.

## Limits

Hardware verification reads LED data back from the keyboard; it is not an optical measurement. Tests establish the reproduced large-record and restart fixes, not every possible third-party Codex log format or future version. Initial searches beyond 32 MiB remain unknown rather than guessing. Other firmware versions, Bluetooth and physical command-key gestures were not retested for this reader-only change. The host's Gatekeeper assessments were already disabled; no system security settings were changed. First launch on a separate Mac with default Gatekeeper settings remains untested.
