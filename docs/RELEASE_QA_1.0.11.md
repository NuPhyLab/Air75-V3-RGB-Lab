# NuPhyLab v1.0.11 — exclusive agent lighting and reliable disconnect

Verified on 2026-10-16, Apple Silicon Mac, Air75 V3 ANSI USB, Mac profile.

## Changes and cause

- Enabling Codex or Claude Code lighting now takes exclusive ownership. It cancels animation, games, trigger listening and audio capture, clears the base frame, and mutes side lighting. Saved artwork remains intact. Starting another effect explicitly transfers ownership; the agent page can take it back with one button. Visiting the editor does not silently overwrite agent lighting.
- The captured 1.0.23.6 original main colour `[64,0,14]` changed to `[64,0,17]` after D6 because the firmware stores quantized HSV. The helper now finds a payload whose official conversion yields the exact saved RGB. D6 echo and D5 restoration checks remain strict; unsupported colours retain the original journal.
- Disconnect previously stopped at a restoration error. It now records the user's disconnect intent first, stops output and releases USB even if recovery is deferred. Backups remain available for the next connection. A generic state-verification failure no longer asserts that another app is responsible; a reconnect action is available.

## Physical official firmware sequence

1. Recovered and verified the original 22-byte lighting state on 1.0.23.6.
2. Selected official 1.0.16.6 in NuPhyIO. The website retried once and remained at “verify data 100%” after the board rebooted. After the completed transfer and re-enumeration, reloading the official page confirmed 1.0.16.6.
3. Opened the signed 1.0.11 app: connected, armed Codex lighting, and displayed current 1.0.16.6 / update available 1.0.23.6.
4. Used the app's official-update button. Original lighting was restored, USB released and automatic reconnect paused before NuPhyIO opened.
5. Installed official 1.0.23.6 through NuPhyIO, which confirmed completion and version 1.0.23.6. Released the website's HID connection before reopening NuPhyLab.
6. Restored the pre-test lighting journal and verified its exact 22-byte state. Official rollback had changed the lighting preset; preservation is based on this verified restoration, not an assumption that flashing preserves every setting.

No custom firmware or factory-reset command was used. A complete pre-flash keymap was not captured, so this does not certify preservation of every firmware setting.

## Regression coverage

- Full Node suite: **324 passed**, zero failures or skips.
- Native offline suite: **6,259 checks**, including captured colour drift, 4,096 inverse-colour samples, restore failure followed by disconnect, and recovery on reconnect.
- TypeScript / production UI and native builds passed.
- Signed app on physical 1.0.23.6: Codex takeover from drawing, animation, game, trigger and audio. Non-task channels and side-light brightness were zero; all 84 main RGB entries matched independent D2 readback.
- Red, green and blue; all 12 library presets; saved-scene playback; animation pause/resume; four game frames; snake loss flashing red and restart command; three trigger flashes ending dark: passed physical readback checks. The temporary saved scene was deleted.
- All 10 audio effects used the app's **real native system-audio capture**, a locally generated rhythmic test tone and colourful output. Each produced nonzero levels and changing frames, and passed 84-channel D2 checks. No synthetic audio packets were used for this run.
- Duration sleep, all-channel darkness, wake, and three disconnect/reconnect cycles passed. Explicit disconnect stayed disconnected beyond the auto-connect interval. Restoration matched the complete original 22-byte state and cleared the pending journal.
- F1–F12 native registrations and USB adaptation reported ready with no failed bindings. Dictation retained the user's tap-to-toggle Control+Shift+D configuration. This release did not repeat human physical key presses or inspect the resulting Codex windows; action routing and gesture behavior are covered by automated regression.
- User library, settings and scores compared exactly equal to the pre-test copy. One-hour duration and idle timers were restored.

An initial hardware timer assertion sampled the sleep flag before its asynchronous blank frame had completed. The lifecycle check was rerun waiting for both sleep state and the actual black frame, then independently verified D2. Product code and output expectations were not relaxed.

## Limits and distribution

RGB readback verifies rendered channel data, not optical colour or every physical LED's placement. USB disconnect/reconnect commands are not a physical cable-pull test. Microphone capture, Bluetooth and every external Codex command were not physically repeated in this run. Future protocol changes still require validation.

Release signing, Apple notarization, stapling and final ZIP checks are recorded separately in the release's `VALIDATION.md` and `VALIDATION.json`. This host's existing Gatekeeper setting is not changed; first launch on a separate Mac with default policy remains outside this run.
