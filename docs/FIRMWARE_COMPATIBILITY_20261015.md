# Air75 V3 firmware compatibility — 2026-10-15

## Findings and evidence

The installed NuPhyLab v1.0.1 accepted lighting writes only on **1.0.16.6**.
Function-key adaptation had the same exact-version gate. The official latest
Air75 V3 ANSI production firmware queried on 2026-10-15 is **1.0.23.6**, published
at `2026-10-15 11:35:16`. Its release notes add per-key RGB and preset patterns.

Official sources (read/download only; no firmware was flashed):

- [Production manifest](https://drive.nuphy.io/prod-api/api/nuphyIo/getLastFirmwareVersionsByType?businessId=1930212869851615233&type=1), ANSI business ID `1930212869851615233`.
- [NuPhyIO client](https://drive.nuphy.io/static/js/main.eff2c3e9.js), SHA-256 `b247cc2093d77cf5d5f6fb7c76c8d7d2f4792e525f5ccc797a8b60274f95c6ac`.
- [Official firmware archive](https://cdn.nuphy.io/image/2026/10/15/d12ab108a72c4328a1c51f49e6a200b3.zip). Extracted `Air75v3_US_v1.0.23.6_1_20261010.bin` SHA-256 `d2b39152a6bd02804044e9fef2bc400b9cfa7b7b7156bae048f76bf6c4fd4a66`, matching the manifest. The ZIP's own hash differs, as expected.

The client capability table enables Air75 V3 ANSI custom mode at 1.0.16.6 and
preset shapes at 1.0.17.6. Its S4 adapter requests **22**, rather than **17**, D5
bytes for the latter and uses the same length for complete D6 restoration.
Offsets 17–21 hold shape, RGB and speed. Main and side offsets remain 0 and 9;
main custom mode remains 21; LED counts remain 84 + 20. D8 uses the selected
Mac/Win profile. This is a real protocol extension, not just a version label.

Offline RISC-V inspection of the official binary independently confirms:

- Dispatch table at file offset `0x44450`: D1 at `0x15f66` returns 104;
  D5 at `0x15efe` copies 22 state bytes (`0x15f3a`).
- Active/inactive D6 tables `0x44408` / `0x443c0`, side tables
  `0x44424` / `0x443dc`, and shape tables `0x4443c` / `0x443f4` preserve
  the five added fields. Side offset 13 still has no setter/getter;
  main offset 5 now mirrors shape offset 17 (`0x14bc8`, `0x14bd0`).
- D8 dispatch `0x15ec6` calls `0x157ee`, validates the profile (0/1) and
  four-byte indexed RGB records, updates a per-profile palette and marks it dirty.
  The idle task at `0x149c6` waits approximately one second before saving it.
  Consequently, the new firmware must not be described as a purely volatile RGB
  target. The old custom palette must be preserved even if a stock effect was active.

## Implementation

v1.0.2 selects the documented 17/22-byte schema within S4 firmware family
`1.x.x.6`. Per-key lighting requires at least 1.0.16.6, exact ANSI geometry,
104 LEDs, valid full state and successful read-only RGB route checks. Later minor
versions are no longer rejected just because their version number differs.
Each arm verifies D6 state, each first frame verifies all 84 D2 RGB entries, and
subsequent frames validate complete ACKs. Checksums, routes and rollback remain
strict. Only known, independently confirmed reserved-byte quirks are excluded;
future versions receive exact comparison.

On the 22-byte schema, the original state is journaled before switching mode.
In v1.0.3, custom mode uses 100% brightness and a white main colour. D2's
rendered palette is converted to input values with identical full-brightness
output and durably added to that journal **before any D8 write**. Stop/exit restores and reads back
that palette, gives the inspected firmware its idle persistence window, and
restores/verifies the full prior lighting state, including preset shape settings.
Side-only operations do not alter the custom palette.

Recovery records from another firmware version are retained byte-for-byte under
`firmware-recovery-history`. After successful current read-only probes, an unowned
old record is archived so its old schema is never written to the upgraded board.
The board's current configuration becomes the new baseline. A version change
during owned mutations stops writes and retains the recovery record. In v1.0.3,
a fresh connection which completes every protocol probe can retire the prior
firmware ownership and archive its journal in the same process. Ordinary
same-firmware reconnections keep their recovery obligation.
Archival is not reported as restoration of the pre-upgrade settings.

Function-key adaptation accepts a native, read-only, geometry-verified keymap;
actual key positions, values, duplicates and original functions remain validated.
The official online version checker does not enable hardware capabilities and
network failures do not prevent a locally compatible board from working.

## Validation and limits

- Native build and UI TypeScript/production build pass.
- Native offline self-test: **830 checks**, including old/new state routes,
  strict extension-field verification, malformed schemas, future minor versions,
  both profile routes, durable custom-palette capture and recovery archival.
- Node regression: **291 tests pass**, including latest/future compatible firmware
  playback/restore/reconnect offline, missing-capability fail-closed behavior and
  geometry-based key adaptation.
- Real attached Air75 V3 reports **1.0.16.6**, Mac profile. Three actual USB session
  connect/arm/restore cycles, 24 varied low-brightness frames, and all 84 channels
  read back exactly. Every cycle restores the complete original state; helper
  exits cleanly. User settings/scenes and the existing Win-profile journal remain
  untouched. This tests USB sessions, not physical unplugging or optical output.
- The local keyboard was subsequently upgraded by the user to **1.0.23.6**.
  v1.0.3 passes three USB session cycles, 24 RGB frames across the full channel
  range, independently checked D2 readback, exact restoration of all 22 state
  bytes and the prior rendered custom frame, and clean helper shutdown.
  The earlier v1.0.2 release had no updated-firmware hardware testing; these new
  checks exposed and fixed both the live-upgrade ownership deadlock and the
  rendered-colour scaling mismatch.
- Native lifecycle regression simulates old-firmware playback, a firmware upgrade
  in the same helper, a rejected incomplete read probe, successful reconnection,
  byte-for-byte journal archival, new playback, original-palette recovery and an
  ordinary same-firmware unplug. An additional dimmed custom-palette case checks
  exact visible restoration after output quantization.
- New firmware's custom renderer at offset `0x9bb0` scales each channel by HSV
  value / 255; the value setter at `0xce80` caps it at **200**. LED 83 additionally
  scales green and blue by 150/255. White at 100% makes this scale deterministic;
  both native first-frame verification and desktop diagnostics compare rendered
  values instead of incorrectly comparing to the unscaled input.
- D2 does not expose original raw custom-palette codes. Quantization can map more
  than one input code to the same output. Recovery retains the original rendered
  frame and chooses a matching input from that interval; if the original custom
  effect was dimmed, it checks that exact original output and tries the alternate
  interval endpoint as needed. It does not claim bit-for-bit identity of hidden
  raw palette codes. A readback failure retains the journal. Power-loss persistence,
  physical optical colour measurements and latest-firmware Win switching have not
  been tested.
- Future compatibility applies only while the protocol family, geometry and
  semantics remain compatible. Arbitrary future protocol changes, other Air
  models, ISO/JIS layouts and wireless RGB are not guaranteed. A breaking change
  needs a new adapter; the app does not download or execute remote compatibility
  code or silently flash firmware.

Release-signing results accompany the final archive in `VALIDATION.md`.
