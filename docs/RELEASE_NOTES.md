# NuPhyLab v1.0.0 — Experimental release

An experimental NuPhy Lab project for exploring light, sound, and interaction on the NuPhy Air75 V3.

## Highlights

- Per-key RGB painting, 12 animated presets, frame-by-frame editing, and a local JSON library.
- 10 audio-reactive effects with single-color and multicolor modes.
- Snake, Whack-a-Mole, Memory, and two-player Pong.
- Key-triggered patterns and optional Codex / Claude Code status-light integrations.
- English and Simplified Chinese interfaces.
- Profile-aware lighting backup and recovery after USB disconnection.
- Complete source code under the MIT License.

## Downloads

- **NuPhyLab-macOS-arm64.zip** — unzip and move NuPhyLab.app into Applications. Includes the Node.js runtime.
- **NuPhyLab-source.zip** — source snapshot for this release; excludes installed dependencies, local data, and build outputs.
- **SHA256SUMS.txt** — SHA-256 checksums for both archives.

## Requirements and limitations

Apple Silicon Mac, macOS 13.5+, NuPhy Air75 V3 ANSI in USB wired mode. The verified firmware is 1.0.16.6 using the Mac configuration profile. System audio capture requires macOS 14.2+; microphone capture is also available.

This is an experimental, development-signed build, not a Developer ID notarized distribution. macOS may require the Privacy & Security → Open Anyway flow if you choose to trust it. Other Macs, layouts, keyboard models, and firmware versions have not been validated for this release. Bluetooth offers limited shortcut support, not software RGB control.

Close other keyboard-lighting applications before use. Agent integrations are optional and may depend on the installed agent version and system permissions. The app does not flash keyboard firmware.

See the repository README for installation, source builds, permission guidance, and troubleshooting. Historical hardware QA reports describe their own test scope; they are not new hardware tests for this publication.
