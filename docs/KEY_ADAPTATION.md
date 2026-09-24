# Keyboard setup

Codex → **适配这把键盘 / Set up this keyboard** enables a local, opt-in compatibility layer. First-time macOS permissions remain user-approved. The app remembers this choice, rereads the connected keyboard's actual active base layer, checks shortcut registration, and reapplies compatible mappings after reconnecting. Existing installations remain unchanged until this button is used.

## Supported scope

Bluetooth shortcut registration and scoped extended-function-key translation are supported independently; see [Bluetooth support](BLUETOOTH.md). The media remapping described below remains USB-only. Bluetooth supports standard function keys, F13–F24 extended mode and the user's ordinary-key bindings, without inferring its live keymap from a prior USB connection.

- Air75 V3 ANSI, USB `19f5:1028`, verified firmware `1.0.16.6`.
- Read-only `A0`, `B1`, `B2` identify geometry, active mode and factory positions. This implementation never sends `B3`, firmware/IAP or factory-reset commands.
- Already-standard F1–F12 require no OS mapping. User-selected task and command bindings are preserved; only bound F-key positions are considered.
- Factory Mac F1/F2 send F14/F15. Previous/play/next/mute/volume use distinct Consumer usages. These eight positions can be translated through macOS `UserKeyMapping` on the matching USB services.
- Factory Mac F3–F6 use vendor-specific codes. Their complete physical-input behavior has not been verified, so the app lists them as unsupported and links to NuPhyIO's key configuration workflow. It does not claim all twelve factory keys are automatically adapted.
- A knob or another key on this keyboard emitting an identical media usage shares that mapping. The setup sheet explains this. Other keyboards and headset controls are excluded by vendor, product, transport, USB location and service identity.
- Unknown firmware, custom macros/ordinary typing at F positions, ambiguous geometry and conflicting pre-existing system mappings do not get silently overwritten.

## Lifecycle and recovery

Disable setup to restore only the mappings this app installed. Disabling Codex controls, editing a field in the app, running games/triggers, disconnecting or quitting releases the temporary mappings. Enabling controls again resumes the saved adaptation choice. Mapping checks also detect changes made by other utilities.

`key-mapping-backup.json` records exact USB service registry IDs and original rows before mutation. Restore preserves later changes made by other utilities. Unplugged services are never restored onto a replacement keyboard. A killed process cannot clean up at the moment of termination; the next helper start restores the journal. Normal exit, stdin closure and signals restore immediately. No mappings are written into keyboard firmware.

“Ready” means the actual keymap, permissions and native shortcut registration passed checks. It does not prove every downstream Codex command is available on every page. F9 retains press/release behavior; the pre-existing non-exclusive Carbon registration path is unchanged.

## Verification, 2026-09-14

- Automated suite: 169 passing tests, including standard/custom maps, eight known media conversions, four unsupported vendor keys, permissions, uncertain acknowledgements, game suspension, disable/restore and reconnect.
- Real connected device: read actual Mac base layer and both factory bases; current user F1–F12 were already standard. No keyboard keymap was changed.
- Real macOS HID services: applied all eight allowed mapping rows to the three matching services, independently read them back, restored and confirmed no added rows remained.
- Forced helper termination: a separate mapping probe was killed after application; next helper startup restored the same service and removed the journal.
- UI: Chinese permission/partial-setup workflow and English setup dialog inspected in an isolated fixture. No real Codex task or recording was created for these checks.
- Physical factory-media key presses on another person's Mac and downstream Codex actions are not end-to-end verified; unsupported cases remain explicit in the UI.

References: [Apple HID remapping](https://developer.apple.com/library/archive/technotes/tn2450/), local macOS SDK `IOHIDEventSystemClient`/`IOHIDServiceClient` headers, [S4 read-keymap wire format](https://github.com/kelchm/nuphy-tools/blob/03140bc1534001599bfcd0a0ef61706bd34d377d/PROTOCOL.md), [official NuPhyIO](https://drive.nuphy.io/).


## Keycap fallback, 2026-09-16

The user explicitly selected original keycap functions when Codex is off. `codexKeycapFallback` is an opt-in preference (existing installations default false), independent of shortcut enablement. For a confirmed complete USB Mac F13–F24 layer and matching factory Mac row, the ordinary-mode plan targets the keycap HID functions. The helper validates the exact source-to-function order under `profile: keycaps`; arbitrary consumer remaps remain rejected. Bluetooth has the same explicit extended-usage plan; standard keys are not remapped.

The ordinary profile still belongs to the running application. On quit the original OS mappings are restored; the keyboard's onboard F13–F24 configuration is not rewritten. The UI explains this requirement rather than calling an empty mapping a factory reset. Input capture temporarily selects standard F keys and then returns to the appropriate profile. Other custom system mappings retain the original conflict protection and restoration journal.
