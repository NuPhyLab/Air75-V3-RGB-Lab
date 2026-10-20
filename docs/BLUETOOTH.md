# Bluetooth support / 蓝牙支持

[Documentation / 文档目录](README.md)

Bluetooth can retain supported agent shortcuts and offline artwork editing after macOS pairs the Air75 V3. Software RGB, audio lighting, lighting games, lighting timers and firmware checks require USB. Keyboard-specific media/extended-function signals, permissions and temporary mappings determine which shortcuts work. The detailed record separates physical Bluetooth observations from simulated checks and explains restoration when the mode ends.

蓝牙可保留兼容的助手快捷键和离线编辑；软件 RGB、声音灯效、灯光游戏、计时与固件检查需要 USB。实际快捷键取决于信号、权限及临时映射，真机和模拟范围见正文。

## Detailed record / 详细记录

# Bluetooth support

NuPhyLab detects a connected Air75 V3 separately from its USB lighting channel. Existing task and command bindings use non-exclusive Carbon shortcuts in both modes. The configured F11 key additionally uses a native HID event tap (v1.0.4; previously a session tap), because macOS reserves the secondaryFn-marked physical F11 event for Show Desktop. It shares the same held-key gate and dispatch queue as Carbon/local events, so it does not toggle twice. It runs only while shortcuts are enabled and F11 is bound, and stops during capture/editing suspension or exit. Modified shortcuts and ordinary typing pass through; no system shortcut preferences are changed.

## Available

- Six task links and six configured command keys, including press/release dictation, subject to the existing Codex page support and macOS permissions.
- Arbitrary supported task/command bindings, captured with Change; saved bindings are shared across wired and Bluetooth modes.
- Local Codex task/usage display, scene editing, preview, saving and import/export.
- Bluetooth connection/disconnection detection, binding refresh on reconnect and held-dictation release on a connection change.

Enable Codex controls and key setup in the app. A recognized Bluetooth connection enables shortcut registration without requiring a live USB device. Standard F1–F12 remain unchanged. For the extended function-key layer, per-device macOS `UserKeyMapping` converts F13–F24 to the corresponding F1–F12, only for function keys present in the user's bindings. Changing a binding to an ordinary key removes its extended-key translation. No firmware keymap is written or inferred from a previous USB session; factory consumer/media and vendor chords are not guessed.

The native helper validates the live model identity and a single connected Bluetooth keyboard, then targets only its HID service. The HID device's unsigned 32-bit LocationID and the service's sign-extended LocationID are normalized before matching. Other keyboards, Bluetooth peripherals, pre-existing conflicting mappings and standard function keys are left alone. Mapping changes are journaled, read back and restored on disable, editing suspension, exit or a switch to USB. Reconnection installs a fresh plan for the new device session. USB mapping behavior is unchanged.

The setup banner requires confirmed OS mapping, native registration and permissions before reporting ready. Connection alone does not establish key setup. Readiness confirms configuration; a particular Codex action still depends on that page's capabilities and permissions.

## Not available over Bluetooth

App-controlled RGB status colors, per-key frames, heart/animation playback, trigger lighting, lighting games, whole-keyboard lighting timers, and firmware checks/updates still require USB. Bluetooth keeps the keyboard's own firmware lighting. NuPhyLab does not claim to control that lighting or change its sleep timer. UI lighting sections are hidden or explicitly marked as requiring USB; existing artwork/settings are preserved.

## Device identification

Observed Air75 V3 Bluetooth identity: vendor 2007, product 0, manufacturer NuPhy (case-insensitive), product `Air75 V3-1`, transport `Bluetooth Low Energy`. Exact model names with optional channel suffix 1–3 are accepted; Air75 V2, other keyboards/mice and unknown identities are excluded. The model matches are enumerated with `IOHIDManagerCopyDevices` without opening HID or registering input callbacks. Multiple matching keyboards do not report a single connected keyboard. No Bluetooth address or serial is exposed in the UI or API.

The inspected 249-byte HID descriptor has keyboard, consumer and mouse input reports; output reports 1 and 6 use LED usage page 8 (keyboard lock indicators), with no Feature reports. It does not expose the USB S4 RGB interface. No speculative RGB writes, firmware changes or Caps Lock signaling workaround are used.

## Verification, 2026-09-15

- Real Bluetooth device identification on this Mac, independent of USB; another connected Bluetooth peripheral excluded.
- Physical F1, F2 and F7 were observed over Bluetooth as HID page 7 usages 104, 105 and 110 (F13, F14, F19). This explains why standard-F-only registration previously missed those presses.
- Physical F11 was observed as HID usage 114, correctly translated to macOS key code 103 with flags 8388864 (secondaryFn). macOS reports enabled symbolic shortcuts on key code 103 with function modifiers, explaining why plain Carbon registration alone missed it.
- After translation, physical F1–F6 reached all six isolated task links. F7/F8/F9/F10/F12 reached their configured actions, including a complete F9 press/release. F11 required the additional native capture described above.
- With native capture enabled, a subsequent physical F11 press reached the isolated terminal command exactly once, with no held key remaining. Together these hardware-input checks cover F1–F12; downstream commands remained isolated and no real task or recording was created.
- Native hardware check applies all 12 extended-key translations to the single matching Bluetooth service, reads them back successfully, restores them and confirms they are absent afterward. No RGB or firmware command is involved.
- Native self-tests include exact model/channel/transport filtering and rejection of other identities.
- Native handler tests construct but never post events: they cover secondaryFn-marked F11, repeat/duplicate suppression, modified keys, unrelated typing, removing the F11 binding and releasing a held key on suspension.
- Automated service checks cover task/custom bindings, all six command routes, single F11 toggle, dictation release, permission failures, reconnect, restore of prior USB mappings and absence of RGB/firmware writes over Bluetooth.
- An isolated native host uses the production key registration and UI code with a fake downstream Codex/keyboard adapter. F1–F12 each reach the intended action; F9 has one down/up pair, F11 one toggle. Capture/remap to A and the English Bluetooth page are verified through the native UI.
- Downstream Codex commands are checked against an isolated adapter; this does not claim every real Codex page action was executed. No real Codex test task or recording is created. Temporary UI fixtures and logs are removed after verification.

In v1.0.4 capture occurs at the HID head rather than the later session stage, so earlier input-method hotkeys cannot consume a bound F key first. Only unmodified configured F keys are consumed; mode-off removes the tap. Permissions arriving after launch trigger a bounded retry.
