# NuPhyLab v1.0.1 — Notarized macOS Release

This distribution update replaces development signing with company Developer ID signing. Lighting features and keyboard compatibility remain unchanged.

- Signed by **Shenzhen NuPhy Technology Co., Ltd.** (Team ID `VBD322WS9K`).
- Hardened Runtime and secure timestamps for the app and nested executables.
- Apple notarization with an accepted ticket stapled to the app before creating the final ZIP.
- Minimal entitlements: V8 JIT for Node and microphone input for the native host.
- English and Chinese installation guidance updated; app version now comes from package metadata.

## Downloads

- **NuPhyLab-macOS-arm64.zip** — unzip, move NuPhyLab.app to Applications, and open it. Node.js is bundled.
- **NuPhyLab-source.zip** — complete source snapshot for this release.
- **SHA256SUMS.txt** — checksums for both archives.

Apple Silicon and macOS 13.5+ are required. The verified keyboard configuration remains Air75 V3 ANSI, USB wired mode, firmware 1.0.16.6, Mac profile. System audio capture requires macOS 14.2+.

## Installation and validation scope

The notarized build is intended to pass normal Gatekeeper checks without going to Privacy & Security to select Open Anyway. The usual downloaded-app confirmation and optional feature permissions may still appear. Updating from the old signing team may require granting Accessibility/Input Monitoring again; saved creations retain their existing location.

The release host's Gatekeeper assessments are disabled. Apple notarization, staple validation, strict signature checks and the distribution check are performed, but a first-launch test of the final download on a separate Mac with default security settings enabled remains outstanding. We do not treat an spctl override on the release host as that test.

This remains an experimental project. No new physical-keyboard compatibility claims are made by this packaging update.
