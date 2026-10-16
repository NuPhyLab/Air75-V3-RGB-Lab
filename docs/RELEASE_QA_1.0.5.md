# NuPhyLab v1.0.5 validation — 2026-10-16

## Behavior and regression checks

- 300 automated tests passed, with zero failures or skips. Coverage includes firmware recovery, task/LED slot stability, native function-key dispatch, duplicate suppression, mode-off cleanup, hold and tap dictation, and actual HTTP service integration with isolated test data.
- Native offline self-test: 1,623 checks passed without opening keyboard hardware or an input monitor. Native compilation and UI production build passed.
- Actual Air75 V3 ANSI, USB, firmware 1.0.23.6, Mac profile: all F1–F12 registered with no failed keys. Disabling Codex controls removed the temporary OS mappings; independent readback confirmed the original 98-key active map after exit.
- Actual red, green and blue output matched all 84 main RGB readback channels. Stop/restore returned verified success. Task-light output matched configured running/idle state colors.
- Physical F9 was pressed twice with Codex configured for Control+Shift+D tap dictation. NuPhyLab recorded exactly two successful presses and no held gesture. Codex logged recording_started, stop_requested and completed; the user confirmed normal start/stop and transcription text.
- Chinese and English interfaces display the correct tap-to-dictate instructions. Existing saved scenes and settings were preserved. Temporary probes and extracted inspection files were removed; regression tests remain in source.

## Distribution checks

- Valid company Developer ID identity checked: Shenzhen NuPhy Technology Co., Ltd., team VBD322WS9K.
- Host, HID helper and bundled Node signed with Hardened Runtime and secure timestamps; nested code signed individually.
- Apple notarization submission **10487dee-d31e-430c-b932-104a3248c73a — Accepted**.
- Staple and ticket validation passed. Final application ZIP was created after stapling, extracted into a fresh directory, and passed strict signature, ticket and `syspolicy_check distribution` validation.
- Final extracted HID self-test and bundled Node worker/JIT smoke test passed.
- Release archive hashes are supplied separately in SHA256SUMS.txt and checked against GitHub's uploaded asset digests.

## Limits

The release host already had Gatekeeper assessments disabled. Its spctl override is not proof of acceptance on another Mac with default security enabled; no global security settings were changed. First launch of the final download on such a Mac remains untested.

This turn's downstream physical command verification focused on F9. F1–F6/F11 had physical checks in the preceding version; the complete command paths retain automated coverage. The Codex window was not inspected through computer use. RGB validation is digital readback, not optical calibration. Bluetooth, other Macs, Windows and Intel hardware were not tested this turn. Future incompatible keyboard protocols or Codex changes may require another update.
