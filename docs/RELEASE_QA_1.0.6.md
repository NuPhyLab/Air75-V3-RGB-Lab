# v1.0.6 validation / v1.0.6 验收

[Documentation / 文档目录](README.md)

Covers 30 Hz target scheduling, sparse changed-key frames, updated Codex completion parsing and official-protocol review. The original run reports 303 software tests and 1,628 native checks plus 1.0.23.6 USB RGB, animation, four games, ten real system-audio effects and quit restoration. Actual throughput depends on USB acknowledgement; 30 Hz is a target, not a guaranteed measured frame rate.

覆盖 30 Hz 目标调度、差量帧和任务完成识别；303 项软件、1,628 项原生及 1.0.23.6 真机记录保留。30 Hz 为目标，不是任何链路都保证的实测帧率。

## Detailed record / 详细记录

# NuPhyLab v1.0.6 validation — 2026-10-16

## Automated checks

- 303 Node tests passed; zero failures or skips. Includes final-answer completion without scrolling, unread state, retained writer handles, commentary/tool non-completion, frame backpressure, shutdown while rendering, and existing integration regressions.
- Native offline self-test: 1,628 checks passed. Includes delta packet indices, unchanged LED preservation, full first/verification frames and firmware/profile recovery.
- Native and UI production builds passed. Source diff whitespace check passed.

## Physical keyboard and installed application

Air75 V3 ANSI, USB directly connected, firmware 1.0.23.6, Mac profile, Apple Silicon Mac. The official firmware endpoint returned 1.0.23.6 on the test date.

- Old/new helper comparison: 180 changing full frames and 180 changing sparse frames per version. All 84 main LEDs passed final D2 readback. Red, green and blue verified separately. Both runs restored their initial D5 state and visible RGB exactly.
- Single-key update median: 25.01 ms on 1.0.5, 6.99 ms on 1.0.6. Full-frame median: 25.04 ms and 25.84 ms respectively. Full-frame transport did not get materially faster; the improvement is reduced sparse traffic and frame scheduling. These are short local measurements, not guaranteed device specifications.
- Installed 1.0.6 whole-board wave: 220 changing frames in about 8 seconds. Breathing heart: 219 changing frames in about 8 seconds. Paused output readback matched. The target is 30 Hz; identical RGB frames are omitted and USB/host load can lower actual throughput.
- Snake, Whack, Memory and Pong each started, advanced, paused, passed physical readback and stopped without a lighting error. This is a short output/regression check, not a complete manual playthrough.
- All ten audio effects received actual system audio played through macOS, reported listening/nonzero levels, and produced changing physical LED frames. Each was sampled for about 4 seconds. No synthetic audioPacket was injected into the application. Settings were restored and audio capture stopped afterward.
- Real local Codex tasks showed running/idle colors with matching physical readback. All twelve F keys registered; no failed bindings and existing macOS grants remained allowed. No new physical F-key actions or dictation recordings were required for this lighting change.
- User settings and scenes compared exactly equal before and after testing. No test scenes or Codex tasks were created. The pre-existing deferred Win-profile recovery record was retained.

## Distribution

Company Developer ID identity validated; nested executables signed individually with Hardened Runtime and secure timestamps. Apple notarization **5411ac56-9c9e-4e09-a8a3-9a8259f50bac** returned **Accepted**. The app was stapled before final ZIP creation. Final extracted archive checks and SHA-256 values are supplied alongside the distribution files.

## Limits

The supplied historical screenshot's exact build could not be identified. Its Windows audio instruction is absent from this Mac source/build; the user confirmed that only a Mac installer was distributed. The reported old-build failure was not reproduced on this installed version. The supplied video identifies neither the app build nor a calibrated LED refresh rate.

The unviewed-task completion case uses real-format local log fixtures; the active Codex window was not automated or scrolled. LED checking is digital readback, not optical calibration. Bluetooth, Windows, Intel, ISO/JIS layouts, microphones and other users' Macs were not retested. Future protocol changes may require an update. Gatekeeper assessments were already disabled on the release host; no system security setting was changed, and first launch on a separate default-security Mac remains untested.
