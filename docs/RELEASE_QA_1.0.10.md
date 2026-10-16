# NuPhyLab v1.0.10 — replacement Air75 V3 protocol validation

## Root cause and official protocol comparison

A second Air75 V3 ANSI attached by USB reports firmware 1.0.23.6 and A0 geometry `[0,8,4,6,16,130,0,0]`. D1 reports 104 LEDs. Its 22-byte D5 state is:

```
6,100,2,0,1,6,0,9,255,4,60,2,1,0,255,0,0,6,94,94,94,94
```

The previous bridge rejected offset 21 (preset speed = 94) because it applied the setter's 0–4 range to every readback. The checksum, route, geometry and firmware family were valid. This reproduces the user's “protocol structure changed” error without assuming that the hardware protocol actually changed.

The supplied official mechanical-keyboard protocol describes D6 writes of individual or contiguous fields. The current [NuPhyIO client](https://drive.nuphy.io/static/js/main.eff2c3e9.js) reads 22 bytes for this firmware and clamps preset speed when parsing it. The supplied document covers only the older 17-byte layout and is not redistributed in this repository.

The fix separates read acceptance from write validation. Raw preset-speed readback is retained in the journal; every other existing field, route, checksum, firmware family and LED-count check remains enforced. If the five preset fields have not changed, D6 writes only the complete 17-byte main/side prefix. It does not send an out-of-range preset value, normalize the user's settings, split RGB triplets or add a brightness-only commit. A changed preset still requires a valid setter value. Restoration compares all implemented bytes, including the raw preset-speed byte.

## Verification

- Native offline self-test: 2,158 checks. Added all 256 possible preset-speed readbacks, strict rejection of invalid setters and other fields, unchanged legacy writes, full restore of changed valid presets, and the captured 94-byte-value lifecycle.
- Physical replacement keyboard: three USB connect/arm/restore cycles, 18 varied RGB frames. Every frame independently checks all 84 rendered RGB entries. All five preset bytes remain unchanged; all 22 original state bytes match after every restoration. Native shutdown succeeds.
- Final full service regression: 318 tests passed; UI TypeScript/production build passed.
- Company-signed app 1.0.10: Codex output, three primary colours, paused breathing animation, all four paused game frames and reconnect passed D2 verification. F1–F12 registered without failures; Accessibility and Input Monitoring stayed allowed. Saved settings and artwork compared exactly equal after testing.
- Apple notarization `6f9fc20b-8f3b-4c73-a4a1-d6190e488e07`: Accepted. Staple, strict signature and distribution checks passed. Final-archive verification is recorded in the release's `VALIDATION.md` and `VALIDATION.json`.

The first broad test run under concurrent native/hardware work had one wall-clock trigger-pulse test failure (317/318 passed). Its isolated rerun passed all five trigger-service cases without changes. The final full run is reported separately; no test assertion was weakened.

## Replacement keyboard and recovery records

The user explicitly confirmed a different physical keyboard. Both boards expose the same generic USB serial. The old Mac/Win lighting and F4 journals were therefore retained byte-for-byte in local device-recovery history before testing the new board; none of those settings was written to the replacement. This one-time recovery migration is not a claim that the generic serial uniquely identifies different Air75 V3 units. Saved user settings and artwork are retained.

## Limits

D2 checks stored/rendered RGB, not optical colour. USB session cycling is not a physical cable-unplug test. No firmware was flashed, reset, or changed. A future breaking protocol change still requires an adapter update. The canceled VI redesign is not included. Default-policy first launch on a separate Mac remains untested; this host's security settings are not changed.
