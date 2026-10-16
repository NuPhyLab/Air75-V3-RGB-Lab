# Air75 Studio native bridge

`HIDBridge.swift` is an independent Swift implementation of the researched NuPhy S4 protocol. It uses macOS user-space `IOHIDManager`, without a kernel driver, firmware flashing, or an `EE` session-key setter. Lighting uses `A1`, `D1`, `D2`, `D5`, `D6`, and `D8`; key adaptation reads `A0`/`B1`/`B2`. v1.0.4 permits a guarded two-byte `B3` update solely to lease/restore the verified factory Mac F4 entry (see below).

```sh
npm run build:native
bin/HIDBridge --self-test
bin/HIDBridge --backup /absolute/path/lighting-backup.json
```

The default backup path is `~/Library/Application Support/Air75 Studio/lighting-backup.json`. Compilation requires the macOS Command Line Tools. The helper links system Foundation, IOKit, CoreGraphics and AppKit frameworks; it has no third-party runtime dependency.

## JSONL contract

Each stdin line is a JSON object with an `id` and `op`. Each response is `{ "id": ..., "ok": true, "result": ... }` or `{ "id": ..., "ok": false, "error": { "code": "...", "message": "..." } }`. stdout contains JSONL only; stderr contains diagnostics. Send the next animation frame after the previous response to avoid queuing old frames. A request is limited to 32 KiB, and the pending queue to eight commands.

| Operation | Request fields | Result |
| --- | --- | --- |
| `connect` | none | `connected`, eight raw `firmware` bytes, `firmwareHex`, `firmwareVersion`, `ledCount:104`, `keyLedCount:84`, `sideLedCount:20`, `originalState`, current `state`, `armed`, `recoveryPending`, `backupPath`, `capabilities` |
| `status` | none | `connected`, `armed`, `firmware`, `ledCount`, `needsRestore`, `recoveryPending`, `backupPath`, `error:null`, `permissions`; `state` when connected |
| `permissions` | none | read-only `inputMonitoring`, `accessibility`, `canPostEvents` booleans and `promptsRequested:false`; does not open HID or request a permission prompt |
| `bluetoothDevices` | none | read-only connected Air75 V3 Bluetooth keyboard inventory, with ephemeral registry `id`, `model` and `transport`; no device opening, key recording, remapping or RGB writes |
| `adaptKeys` | USB `locationId`, or `transport:'bluetooth'`; `mappings` | temporary, journaled per-service macOS key mapping with verified readback. Bluetooth allows only corresponding F13–F24 → F1–F12 rows on one identified Air75 V3; no firmware writes |
| `keyMappingStatus` | same selector and mappings | `verified` from live service readback |
| `restoreKeys` | none | restore owned mappings from the journal, preserving unrelated changes; `restored:true` |
| `openPermissionSettings` | `permission:'inputMonitoring'\|'accessibility'` | `opened:true`, echoed `permission`, read-only `permissions` snapshot; opens only the corresponding System Settings page and does not grant or request access |
| `arm` | none | `armed`, verified 17-byte `state`, `backupPath`, `verified:true` |
| `paint` | **`colors`: exactly 84 `#rrggbb` strings**, optional `verify:true` | `painted:84`, `skipped`, `verification:readback/validatedAck/unchanged` |
| `readColors` | none | `colors`: 104 `#rrggbb` strings, `ledCount:104` |
| `side` | `color:'#rrggbb'`, `brightness:0…100` (default 60) | verified state; sets both bars together to a static color while preserving main-backlight bytes |
| `side` | `restore:true` | restores original side bytes 9–16 while preserving current main-backlight bytes 0–8 |
| `restore` | none | `restored`, `verified`, restored `state`, `verification:completeState/stateAndCustomColors/allLightsOff` |
| `disconnect` | none | restores this process's changes first, then releases HID; `connected:false`, `restoration` |
| `keyMonitor` | `enabled:true` (or false) | watches only Control+Option+1…6 and Control+Option+N; returns `enabled`, `bindingCount` |
| `shortcut` | `action:'task'`, `threadId` | opens a validated `codex://threads/<id>` URL; result `opened:true` |
| `shortcut` | `keyCode:0…127`, `modifiers:['command','shift','option','control']`, optional `target:'com.openai.codex'`, `activateTarget:true` | checks/activates the existing Codex application, confirms it is foreground, then posts one shortcut after checking Accessibility; result `sent:true` |
| `shortcut` | same fields with `phase:'down'`; later `phase:'up'` | holds dictation until release; key-up goes to the original process even after focus changes; automatically released after 120 seconds and before shutdown. `sent` confirms delivery only, not the action's result in Codex. |
| `quit` | none | responds `quitting:true`, restores owned changes, then exits |

`firmwareVersion` follows NuPhyIO's S4 `parseFirmwareVersion`: `info[2].info[1].info[0].(info[4] | info[5] << 8)` with marker `info[3] == 0xaa`. The last two bytes are not interpreted as version components. Older versions, including zero-major versions, can be identified read-only. Since v1.0.2, lighting uses the official S4 family schema: 1.0.16.6 uses 17 bytes, 1.0.17.6+ within 1.x.x.6 uses 22 bytes. Writes require matching ANSI geometry, 104 LEDs, complete state and RGB read probes; first output is still read back. Online latest-version information never grants capabilities. See [current compatibility evidence](../docs/FIRMWARE_COMPATIBILITY_20261015.md). See [firmware source and verification](../docs/FIRMWARE_ONBOARDING_QA.md).

Examples:

```json
{"id":1,"op":"connect"}
{"id":2,"op":"arm"}
{"id":4,"op":"side","color":"#004010","brightness":20}
{"id":5,"op":"side","restore":true}
{"id":6,"op":"restore"}
{"id":7,"op":"disconnect"}
```

A valid paint request can be generated as `JSON.stringify({id:3,op:'paint',colors:Array(84).fill('#100020'),verify:true})`. Dark colors like this provide low visual brightness while retaining exact RGB readback with hardware brightness 100.

Unsolicited events have an `event` instead of an `id`:

```json
{"event":"shortcut","action":"slot","index":0}
{"event":"shortcut","action":"newTask"}
{"event":"disconnected","needsRestore":true,"message":"..."}
{"event":"restoredOnExit","result":{"restored":true,"verified":true}}
{"event":"restoreFailed","error":"...","backupPath":"..."}
{"event":"keyRestoreFailed","error":"..."}
{"event":"shutdownComplete","lightingRestored":true,"keysRestored":true}
```

Slot indices are 0–5. The monitor does not record ordinary typing, bare function keys, arrow keys, text, focused-window titles, or clipboard data. Snake keyboard input belongs to the focused editor. Optional `keyMonitor.bindings` may specify a subset using `name`, macOS `keyCode`, `modifiers`, and `suppress:false`; validation still restricts them to the same seven Control+Option combinations. The default monitor observes those combinations without suppressing them.

## Permission settings and refresh

`openPermissionSettings` accepts only the two permission names above. They map to `x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent` and `?Privacy_Accessibility`, respectively; arbitrary URLs are not accepted. An unsupported or missing permission returns `INVALID_PERMISSION`. If `NSWorkspace.shared.open` fails, the bridge returns `SETTINGS_OPEN_FAILED` with a manual-navigation message.

Opening settings does not open HID, register the app in a permission list, call a permission-request API, or automatically grant access. Its `permissions` result is the current read-only snapshot, not an anticipated user decision. `opened:true` confirms that macOS accepted opening the URL; it does not confirm authorization or arrival at the intended pane. The user must enable access in System Settings.

The UI server's `refreshPermissions` command calls this bridge's existing `permissions` operation; `refreshPermissions` is not a native JSONL operation. The Device page sends it on mount and on return to a focused or visible window, then updates the displayed permission state. Permission reads use `CGPreflightListenEventAccess`, `AXIsProcessTrusted` and `CGPreflightPostEventAccess`, with `promptsRequested:false`.

These settings deep links are undocumented and may behave differently across macOS versions. If they do not reach the expected page, navigate manually through System Settings → Privacy & Security → Input Monitoring / Accessibility. [Apple DTS does not guarantee support for undocumented URL schemes](https://developer.apple.com/forums/thread/761314). Validate navigation in the installed Air Studio application: source runs or directly launched helpers may have different TCC responsibility attribution from the packaged app.

## Connection and verification

Discovery requires exactly one `19f5:1028` interface with primary usage page `1`, usage `0`, and maximum input/output report sizes `64`. Other NuPhy products and protected typing interfaces are not tried. A per-user advisory lock prevents two copies of this helper from using the device simultaneously. NuPhyIO and unrelated HID clients do not honor that lock and must release the keyboard before the bridge runs.

Connection is read-only: `A1` derives the existing XOR key from the constant firmware marker, `D1` confirms 104 LEDs, and `D5` reads the state. There is no `EE` handshake, opcode scan, invalid-checksum flush, or automatic firmware update. Replies must have the expected marker, opcode, report length, routing and checksum. Both documented plaintext and XORed response routes are accepted.

**Air75 V3 D1 uses a one-byte payload.** Request length 1 and decode only that byte. On the verified firmware, the remaining report bytes are unencrypted padding even if the host requests length 2. The old two-byte interpretation happened to work with session key zero; with key `0x80` it decoded payload `e8 00` as `68 80` and incorrectly reported 32872. A 2026-09-11 capture and regression checks supersede the referenced condensed protocol's u16 description for this model. See [LED count verification](../docs/LED_COUNT_QA.md). The decoder still requires exactly 104 and validates the complete checksum and matching route before allowing connection.

Before its first mutation, the bridge captures all 17 state bytes plus the 104 currently rendered RGB entries, creates a private backup with `O_EXCL`, and flushes that file to disk. A pending backup from another session must be explicitly restored before arming. The helper does not replace an existing backup with newly observed state.

Recovery is scoped to the physical Mac / Win lighting profile. Given `--backup original-lighting.json`, journals are stored as `original-lighting.profile-0.json` (Mac) and `original-lighting.profile-1.json` (Win). On connection, a legacy single journal is validated and moved to its recorded profile without rewriting its contents; older records without `lightingProfile` belong to Mac. Migration never overwrites another journal, and invalid/conflicting records remain intact. `backupPath`, `recoveryPending` and `needsRestore` describe the current profile. `deferredProfiles` lists retained journals for inactive profiles. They are restored after reconnecting in that profile, before the next lighting session; they are never written into a different profile. The host also retries current-profile recovery before arming after a recoverable connection failure.

`arm` selects main effect 21, hardware brightness 100, and RGB mode 1. It sends one complete 17-byte `D6` state at address zero, waits 120 ms, and confirms all 15 implemented fields using delayed `D5` readback (offsets 5 and 13 are unimplemented in the verified firmware; see below) (up to five reads). It does not resend an uncertain write. **The separate address-one brightness commit described by another implementation is deliberately omitted:** on this keyboard it changed stored RGB bytes by one through rescaling; the complete-state setter alone restored the original values exactly. Frames then use only RAM `D8`, split into at most 13 indexed LEDs per packet, and address only indices 0–83. Set visual brightness by scaling RGB values in software. The first paint always verifies all 84 rendered RGB entries with `D2`; later paints validate every ACK and can request full readback with `verify:true`. Identical frames generate no traffic unless verification is requested.

`D2` diagnostics now wait until at least 45 ms after the last completed `D8` frame. On firmware 1.0.16.6, an immediate read intermittently returned the preceding frame for the first 18 LEDs while later chunks already contained the new frame. The barrier only affects readback; ordinary animation writes are not delayed.

`D8` ACK validation proves transport acceptance, not by itself physical light output; `verification` makes this distinction explicit. A failed paint or state mutation attempts restoration immediately, and preserves the backup if restoration cannot be verified. A timeout never causes an uncertain write to be blindly resent. Firmware protocol quirks or a competing client can still require a cable reconnect.

## Restoration and lifecycle

`restore` returns the complete saved state, including brightness and both side-light fields. It verifies `D5` equality for all implemented fields before deleting the backup, with the two unimplemented palette slots and the documented master-off exception below. A moving stock effect cannot reproduce a frame captured earlier, so its configuration is verified rather than comparing that old moving image. If the original mode was custom effect 21 at brightness 100, the saved main-key frame is also written and independently verified with `D2`. Existing custom effect 21 below brightness 100 is rejected before mutation because the unscaled RAM table cannot be recovered exactly from its dimmed rendered output.

On firmware 1.0.16.6, the physical master lighting switch can make `D5` expose effect 0 with both brightness fields at 0. While switched off, the board acknowledges `D6` but ignores its setter. After delayed verification fails in this state, the bridge returns `LIGHTING_DISABLED`; the UI asks the user to press Fn + ↑ and play again. Zero brightness alone never blocks a write.

Effect 0 itself cannot be restored through `D6`. When restoring this all-off snapshot, an unchanged `D5` needs no write; otherwise the bridge uses stock static effect 2 with both brightness fields still 0, preserving the other 16 bytes. It verifies the target `D5` and all 104 rendered RGB entries are black before clearing the backup, returning `verification:allLightsOff`. This restores the visible dark state, not the original physical master-switch position. Ordinary effect states still require exact equality for all implemented fields.

Explicit disconnect, JSON `quit`, stdin EOF, SIGINT, SIGTERM and SIGHUP all attempt restoration before exit. The helper emits restoration evidence and exits with code 2 if it fails. SIGKILL, a machine crash, removal of USB power, or a parent that forcibly kills its child cannot run cleanup; the durable backup remains available to the next process's `restore`. Merely connecting to inspect a stale backup does not silently overwrite the keyboard on exit.

If USB has already been removed at shutdown, an owned journal is validated on disk and retained for the next connection, emitting `restoreDeferred`. This is a normal deferred exit, not a claim of hardware restoration. `shutdownComplete` distinguishes `lightingRestored` from `lightingDeferred`. Connected-device restoration failures and unreadable recovery journals still fail shutdown. Quitting on Mac while an inactive Win journal is retained likewise leaves that journal untouched.

The host application should keep this process alive when its editor window closes; terminating the helper is a stop-and-restore action. After sleep or unplugging, stop frame submission, reconnect and resolve any pending restore before arming again. There is no claim that animation continues during Mac sleep.

## Side-light limitations and index maps

The stock custom renderer consumes 84 key entries. The 20 side entries returned by `D2` are rendered by a separate stock effect, so this bridge never sends `D8` to indices 84–103 and never selects private side mode 5. `side` uses the stock whole-zone configuration only. Changing it should be infrequent and value-driven: unlike `D8`, the persistence and Flash-write scheduling of `D6` have not been established here. Board-controlled battery/connection indications may also temporarily replace the displayed side effect; that coexistence requires further observation.

This bridge deliberately has no physical key-layout map. D8 indexes the custom RGB array directly, and D2 reads the rendered RGB array by byte offset. Published physical maps disagree at several ANSI positions; the editor must label unverified positions accordingly. Reporting 84 LED entries is not proof that every entry maps to a separately identified physical key.

## Research provenance

This helper was written independently against protocol descriptions and inspected source behavior; no third-party source is bundled or linked. These MIT projects establish the protocol and its hardware evidence:

- [ShallowRed/nuphy-leds, pinned protocol](https://github.com/ShallowRed/nuphy-leds/blob/b761556609ae7c8d846ca9c2ae6c6c151efc20e7/PROTOCOL.md): session derivation, stock effect 21, RAM writes, pacing, 84-key streaming.
- [pda/kbvu, pinned Air75 protocol research](https://github.com/pda/kbvu/blob/1665af784f96757b579cea54a6dd2f71ec090606/docs/keyboard-protocol.md): exact USB matching, routing variants, rendering versus storage, stock side-light limits.
- [gig3m/nuphykit](https://github.com/gig3m/nuphykit/tree/66626a60c809be49805fadfe75e62db08182ffb7): related Air100 S4 research. Its model-specific counts, layout and firmware offsets are not used for this Air75 bridge.

The built-in `--self-test` checks framing, both routing variants, corruption rejection, XOR-key derivation, 84-color validation and rejection of firmware/IAP opcodes without opening a HID device. `python3 native/qa-hardware.py --run` is an explicit, reversible low-brightness real-device test; close the application and other HID clients before running it. Actual device results are recorded in `docs/HARDWARE_QA.md`, with the transaction evidence in `native/hardware-qa-results.json`.

## Opt-in artwork trigger observer

This is independent of the restricted Codex `keyMonitor` above. `triggerMonitor {enabled:true,keyCode:49}` observes one physical bare key from the 74-key allowlist in `shared/trigger-keys.json`. `triggerMonitor {enabled:false}` releases it. Returns `{enabled,ordinaryTypingRecorded:false}`. Reconfiguration replaces the old observer; quitting, signals and stdin EOF release both observers.

Only a matching `keyDown` with no Command/Control/Option/Shift and no autorepeat emits `{"event":"triggerKey","keyCode":49}`. It always uses `listenOnly` and returns the input event unchanged; `suppress` or `modifiers` parameters are rejected. No other typing, text, clipboard or window data is retained or emitted. Modifier keys, Fn and the knob are excluded. `INPUT_MONITORING_REQUIRED` permits the parent UI to explicitly fall back to its own focused-window listener. Merely configuring this observer does not open the HID interface or show permission prompts.

## Quit confirmation

The host explicitly restores owned temporary key mappings and lights before requesting quit, then waits for the child close event so final JSONL and stderr are drained. Key mapping writes use bounded delayed readback, never repeated writes, and skip writes when the target mapping is already present. Pending recovery records remain on verified failures. Native shutdown reports key and lighting restoration separately; the service preserves diagnostics instead of discarding stderr. During a requested app quit, the editor suspends polling and presents the exit state rather than a local-service connection error. See [quit verification](../docs/QUIT_QA.md).

### Keycap compatibility profile

`adaptKeys` / `keyMappingStatus` accept optional `profile: "keycaps"`. This permits only 12 exact F13–F24 sources paired, in physical order, to display brightness down/up, Mission Control, AC Search, Voice Command, Do Not Disturb, previous/play/next, mute and volume down/up. The mode is opt-in at the application layer; this extended-layer fallback does not change onboard keys. OS mappings are journaled and restored on exit as before.


## Mac / Win lighting profiles and reserved slots (2026-09-17)

`A0[0]` identifies the keyboard's active Mac (0) or Win (1) mode. D5/D6's
routing handle selects that lighting profile; it is not implied by the host OS
or USB transport. The bridge now reads A0 before accessing lighting state and
uses that handle for D5/D6. Other commands retain handle 0. Route validation
checks the requested handle in both plaintext and XORed responses.

Every new lighting backup includes `lightingProfile`. A legacy backup without
this field belongs to handle 0, because previous releases always used handle 0.
Before any D6 or D8 write, the active mode must match the backup's mode. A switch
during playback stops output and preserves the backup, with a localized request
to switch back for recovery. No OS-mode switch or firmware/keymap write is issued.
A backup is not captured if the mode changes while state and RGB are being read.

The official 1.0.16.6 binary (SHA-256
`7fd339b0e22dff0843d6be7f8ac4a970c209b2362b49cc6babd60fcf3101642e`)
confirms two reserved palette slots: active D6 dispatch tables at file offsets
`0x42c20` / `0x42c3c` and inactive tables `0x42bec` / `0x42c08` skip state
indices 5 and 13. D5 getters at `0x143bc` and `0x14564` populate the other
15 bytes but do not populate those two. An inactive-profile D5 read can therefore
return unrelated palette-slot values, such as 81 and 198, that D6 cannot restore.
Only these two indices are excluded, only for the verified 1.0.16.6 family bytes.
Unknown firmware retains exact comparison. No tolerance is added to mode,
brightness, speed, RGB selection, direction, or RGB values. Checksums and ACKs
remain exact, and restored custom frames still require all 84 RGB entries to match.

The host preserves successful device identification if restoration fails,
updates version/capabilities from status, and clears recovery flags and the
playback warning only after verified restoration. It never treats missing or
unverified restore acknowledgement as success.

Official binary source (downloaded only for offline inspection, never flashed):
https://cdn.nuphy.io/image/2026/07/21/35f97f78d9d84393a7dea646f77e8f11.zip


## v1.0.2 firmware adaptation (2026-10-15)

The 17-byte notes above describe the original 1.0.16.6 implementation. For newer
S4 firmware, D5/D6 use 22 bytes: offset 17 is shape, 18–20 RGB, 21 speed. The
entire state is captured, retained while changing main/side fields, restored and
verified. On inspected 1.0.23.6, byte 5 mirrors shape and remains strict; only
unimplemented byte 13 is excluded. Unknown future versions get exact comparison.
D8 is addressed to the active Mac/Win profile just like D5/D6.

The new D8 handler updates a profile-specific palette and marks it dirty; its
idle task saves changes after approximately one second without changes. Therefore
it is no longer described as purely volatile. Before the first D8 on the 22-byte
schema, arm selects custom mode, reads its palette, and atomically persists it in
the existing journal. Restoration writes/verifies that original palette before
restoring the complete original effect, including preset shapes. A crash between
mode selection and palette capture is protected by the state-only journal; no D8
has been issued at that point. New schema journals have optional `customColors`
(252 bytes); old journals stay readable.

A journal from another firmware version is never applied blindly. Following
successful current read-only probes, an unowned old journal is moved, byte for
byte, into `firmware-recovery-history` with a unique name. The newly read firmware
configuration becomes the next session baseline. A firmware change during owned
mutations blocks writes and preserves the journal. v1.0.3 permits a fresh, fully
validated connect to retire old-firmware ownership in the same process. Ordinary
same-firmware reconnection retains recovery. This is archival,
not a claim that the pre-upgrade state was restored.


## v1.0.3 custom rendering and recovery

The actual 1.0.23.6 renderer scales raw palette channels by an internal HSV value
capped at 200/255. Custom ownership uses a white main colour and 100% brightness;
all RGB readback checks compare against that scaling (LED 83 additionally scales
G/B by 150/255). D2 is rendered output, not an exact raw-palette getter. Saved
`customColors` contains inverse-interval representatives which reproduce the
captured full-brightness output. Original custom output is independently checked
after restoring its original state, with alternate interval endpoints if needed.
Hidden raw palette codes may differ within the same quantized output interval;
visible restoration must verify, or the journal remains. See the compatibility
report for disassembly offsets and real-device validation.


## Factory Mac F4 lease (v1.0.4)

Official NuPhyIO `setKey` uses B3: address = layer × 196 + position × 2,
length = 2, big-endian key value. Mac base layer is zero. The factory key
0x7e07 emits Command+Space rather than an independently remappable HID usage.
NuPhyLab validates A0 geometry and both default layers, journals the complete
original Mac base with firmware/serial/location, and changes only the unique
factory F4 position to 0x003d. B2 readback is mandatory after B3; ACK alone is
not success. Repeated polling does not rewrite the entry. Mode disable/quit
restores 0x7e07 and verifies it, including when the keyboard is now in Win mode.
Unexpected unplug defers recovery to the same USB location. Firmware changes
with a still-leased key fail closed; later user changes are never overwritten.

F3/F5/F6 firmware actions emit HID 12:0x29f, 12:0xcf, 1:0x9b respectively.
Scoped macOS mappings target Consumer and System Control services, preserving
all pre-existing conflicting mappings and restoring owned rows on release.
