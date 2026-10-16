# Air75 V3 protocol review — 2026-10-16

NuPhyLab already uses the keyboard's USB vendor HID protocol. The supplied NuPhy mechanical keyboard protocol description (v0.1.0, 2026-07-07) confirms the 64-byte report, XOR/checksum framing, A0 mode selection, A1 version layout, one-byte D1 LED count, D2 RGB ordering and D5/D6 lighting configuration. The supplied document itself is not redistributed here.

The document describes the legacy 17-byte lighting state and does not document D8 indexed RGB streaming or the newer 22-byte preset-shape extension. Replacing the current implementation with that legacy structure would lose settings on newer Air75 firmware. NuPhyLab retains both schemas, selects the keyboard's active Mac/Win profile and verifies responses before writing.

The official NuPhyIO capability table, checked on 2026-10-16 at https://drive.nuphy.io/, still enables Air75 V3 custom lighting from 1.0.16.6 and preset-shape lighting from 1.0.17.6. The official firmware endpoint returned 1.0.23.6. Those version boundaries are separate from the runtime A0/A1/D1/D5/D2 protocol checks. A future version number alone is neither a rejection nor proof of compatibility; a changed protocol still requires a software update.

Version 1.0.6 uses acknowledged, serial frames with a 30 Hz target instead of a fixed 20 Hz interval. Slow transfers render the current time on the next frame instead of queuing old frames. Indexed D8 packets carry only changed keys after the first verified full frame. Explicit verification, reconnect and recovery continue to send complete frames. Packet acknowledgement, profile checks, durable original-state backups and rollback are retained. No firmware flash or reset is involved.

Codex task status comes from local structured task records, not screenshots, text matching or scroll position. Explicit final-answer messages and completed final-answer items are now recognized as completion even before task_complete arrives. Commentary and completed tool calls do not count as completed tasks. Task polling is once per second; completed and unread is distinct from thinking.

The video supplied with the report is 10.7 seconds at 30 fps and shows keyboard output only. It does not identify the application build or provide a calibrated host/device refresh-rate measurement. The reported screenshot contains a Windows audio instruction, which is absent from this Mac source tree. This release exposes its own version/platform under Device details to make reports traceable; it does not assert that an unidentified historical installer was tested.

Validation results and physical-device limits are recorded separately with the release.
