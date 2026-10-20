# v1.0.7 timer validation / v1.0.7 计时验收

[Documentation / 文档目录](README.md)

New installs default to one hour for both light-on duration and idle sleep; custom durations and no-limit choices remain. Starting agent mode begins a full new timer rather than inheriting an artwork’s remaining time. Ordinary settings edits and polling do not repeatedly restart it. This dated record separates automated timer tests from physical sleep/wake checks.

新安装亮灯与空闲均默认一小时，保留自定义和不限；开启助手模式重新完整计时，普通设置与轮询不反复重置，自动与真机检查范围见正文。

## Detailed record / 详细记录

# NuPhyLab v1.0.7 validation — 2026-10-16

## Change and diagnosis

New installations now default to 3,600,000 ms for both the lighting-duration and idle timers. Existing explicit values, including unlimited, are preserved. Starting the active Codex / Claude Code integration starts a fresh lighting session even if the device was already armed for artwork. Ordinary settings changes do not restart the timer, and games, audio and triggers retain their own activation path.

The user's saved timers were already one hour. Inspection found that enabling task lighting on an already armed device inherited the artwork's old deadline. This path is fixed and covered by service regression tests. It is not evidence that every historical lights-off event had the same cause.

## Automated validation

- 306 Node tests passed, no failures or skips; UI production build passed.
- Fake-clock checks: Codex lights remain on at 6 and 59 minutes, switch off at 60 minutes, and wake for another full hour. Legacy independent Codex timers do not override the global timer.
- Real service with simulated hardware: starting Codex after an earlier scene receives a complete timer; unrelated edits preserve the deadline; re-enabling after sleep wakes the lights. Integration switching also resets its lighting session.
- Packaged native offline self-test: 1,628 checks passed. Native source/binaries were unchanged in this release.
- Packaged company-signed Node ESM worker smoke test passed.

## Physical keyboard and installed app

Air75 V3 ANSI, USB, firmware 1.0.23.6, Mac profile, Apple Silicon Mac.

- A temporary, read-only F3 diagnostic returned `[1,6,24,4]`. No F5 sleep-setting write was made. With six static task LEDs and no repeated RGB writes, a 390-second run retained the same D5 state and all 84 key RGB values. The shorter onboard setting did not reproduce an early-off event in this readback test. Original lighting was restored and verified afterward.
- Installed v1.0.7: used a temporary three-second timer to exercise the real service and hardware. Starting Codex on an already armed scene reset the deadline; output remained lit beyond the old deadline and matched D2 readback.
- At the new deadline all main keys read back black and the side brightness was zero. Disabling/re-enabling Codex restored the task colors and restarted the full duration, with successful physical readback.
- Original library, settings and scenes compared exactly equal after testing. Final configuration: both timers one hour, Codex enabled, awake, keyboard connected and armed. F1–F12 all registered, no failed bindings; Accessibility and Input Monitoring remained allowed.
- Native UI confirmed both time fields show `1` / `小时`.

## Distribution

Company Developer ID signature, Hardened Runtime and secure timestamp verified. Apple notarization `94df9c25-e47b-4edb-b648-da428a958246` returned Accepted. A clean extraction was stapled, then the final ZIP was rebuilt and extracted again. Strict signature, staple and `syspolicy_check distribution` all passed on the final archive and installed app.

## Limits

The one-hour boundary uses a controlled clock, not an hour-long physical test. LED validation is device readback, not optical observation. Physical F-key gestures, other firmware versions, Bluetooth and other computers were not retested for this timer-only change. The host's Gatekeeper assessments were already disabled; no security settings were changed. First launch on a separate Mac with default Gatekeeper settings remains untested.
