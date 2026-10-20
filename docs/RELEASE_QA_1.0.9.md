# v1.0.9 task-key and lighting validation / v1.0.9 任务键与灯光验收

[Documentation / 文档目录](README.md)

Physical task keys and the UI share the task mapping acknowledged by lighting output. A press captures its task ID before waiting on queued work; removed targets fail visibly rather than opening another task. Successful task/command actions wake a timed-out keyboard. Existing one-hour/custom timers and user artwork remain; the record states which physical input paths were and were not exercised.

实体键与页面共用已确认灯光的任务表，排队前锁定任务 ID，失效目标不替换打开别的任务；成功操作可唤醒，保留一小时及自定义计时。

## Detailed record / 详细记录

# NuPhyLab v1.0.9 validation — 2026-10-16

## Reproduction and changes

Two defects reproduced against the preceding service:

1. A recent-task replacement could update the UI/key resolver while the keyboard still displayed the previous RGB frame. A queued physical-key request resolved its target again after the frame completed. The reproduction delays USB acknowledgement and replaces F2 with another identically titled task: the old service publishes the new target prematurely and routes to that replacement.
2. The global duration timer correctly turned all lights off, but a successful Codex action only called the old no-op Codex wake method. A task key still opened its conversation without waking the keyboard; toggling Codex mode reset the global timer and appeared to fix it.

The service now publishes task-slot metadata together with acknowledged RGB, including identity changes that do not change RGB values. Physical task-key requests capture the task ID at HTTP receipt before joining the command queue. Removed targets fail rather than opening a replacement. Successful Codex interactions wake an expired global timer; interactions while already awake do not restart it. No firmware, USB protocol, native key registration or Codex configuration was changed.

The historical incident occurred before target IDs were included in the last-key diagnostic, so its exact destination cannot be reconstructed. These tests establish the reproduced failure paths rather than claiming a complete replay of the user's incident.

## Automated verification

- 318 Node tests passed; UI production build passed.
- 1,628 native offline checks passed, without opening hardware or monitoring input. Native binaries are unchanged.
- Four focused regressions also passed against modules copied from the signed final bundle: delayed RGB acknowledgement/F2 routing, equal-colour identity replacement, removal of a queued key's target, and timer wake through physical-key handling, task buttons and command keys.
- Failed commands and key-up events do not wake a duration timeout; ordinary activity and background state refresh still respect the global timer. Existing remapping, Bluetooth, dictation, games, audio and reconnect tests passed.
- A pre-existing permission-test race was corrected to allow the global timer's read-only systemIdle query. The test still rejects any lighting writes from permission actions.

## Connected keyboard

Air75 V3 ANSI, USB, firmware 1.0.23.6, Mac profile, installed company-signed app v1.0.9.

- Initial serialized D2 readback matched all 84 rendered RGB entries.
- Two short-duration sleep/wake cycles were performed, through the physical-key service entry point and the task-button entry point. Each verified the black frame, exact target thread ID returned by the native helper, resumed light frame, and D2 readback.
- A further 30 state samples retained the same slot identities, stayed awake and error-free; all six additional RGB readbacks matched.
- A synthetic F2 delivered through the native application generated exactly one successful F2 event with the expected thread ID. This is not a newly observed physical Bluetooth/HID key press.
- Accessibility and Input Monitoring remained allowed; F1–F12 registrations reported no failures. Both user timers were restored to one hour. Library contents compared exactly equal, including settings and scenes. The existing deferred Windows-profile recovery journal remains intact.

## Distribution and limits

Developer ID Application: Shenzhen NuPhy Technology Co., Ltd. (VBD322WS9K), Hardened Runtime and secure timestamp. Apple notarization 286b578e-d542-4c9b-aa25-5578fbd9d7ec returned Accepted. Final staple, strict signature, distribution assessment and ZIP hashes are recorded in release/VALIDATION.json after packaging.

Test-only fixtures, copied bundles and local probes are removed after final validation; source regression tests remain. No fake Codex conversations were created. Hardware readback measures stored RGB, not optical colour. Opening a deep link is verified through the native helper's target ID and acceptance; Codex's own conversation window was not inspected. Separate-Mac first launch with default Gatekeeper settings remains untested; this host's pre-existing security settings were not changed.
