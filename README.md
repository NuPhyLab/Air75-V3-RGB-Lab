# NuPhyLab

**An experimental NuPhy Lab project that turns the Air75 V3 into a canvas for light, sound, and interaction.**

Paint per-key RGB patterns, create animations, make your keyboard react to music, play light-based games, and follow coding-agent activity from your function keys. NuPhyLab runs locally on your Mac, with a native window and menu bar companion.

[Download for macOS](https://github.com/bohu8264/NuPhyLab/releases) · [中文说明](README.zh-CN.md) · [Report an issue](https://github.com/bohu8264/NuPhyLab/issues)

> **Experimental release.** Air75 V3 ANSI USB lighting has been verified on firmware **1.0.16.6 and 1.0.23.6**, using the Mac configuration profile. The latest function-key and dictation checks use **1.0.23.6**. The downloadable app is for **Apple Silicon, macOS 13.5 or later**. Published release apps are signed with the company **Developer ID**, **notarized by Apple**, and include a stapled notarization ticket. Other models, layouts, firmware versions, Intel Macs, and Windows are outside the verified release scope.

## What you can do

- **Paint with light:** draw individual keys, select and recolor groups, use a color wheel, and undo or redo edits.
- **Build animations:** moving patterns, breathing, waves, and editable frame-by-frame sequences. Start with 12 animated presets or create your own.
- **React to sound:** 10 audio-reactive effects with monochrome or multicolor output, sensitivity controls, and a noise gate. Use a microphone or system audio; system audio capture requires macOS 14.2+.
- **Play on the keyboard:** Snake, Whack-a-Mole, Memory, and two-player Pong.
- **Trigger patterns with a key:** record a trigger, customize its colors and repetition, and keep normal typing available.
- **Follow agent activity:** choose Codex or Claude Code for task-status lighting and shortcuts. Use individual task keys or a whole-keyboard status color.
- **Keep a local library:** save, search, rename, import, and export creations as JSON. Switch the interface between English and Simplified Chinese.
- **Manage light and recovery:** shared brightness and sleep controls (one hour by default), automatic USB detection, and original-lighting backups kept separately for Mac and Windows keyboard profiles. Starting Codex or Claude Code mode starts a fresh lighting timer; saved custom timeouts are preserved.

No kernel extension or keyboard firmware modification is required. NuPhyLab streams RGB frames from your Mac while lighting is active; it does not install these animations into the keyboard firmware.

## Install

1. Open [Releases](https://github.com/bohu8264/NuPhyLab/releases) and download **`NuPhyLab-macOS-arm64.zip`**.
2. Unzip it, then move **NuPhyLab.app** to **Applications**.
3. Connect an **Air75 V3 ANSI** with a USB data cable and select wired mode. Close NuPhyIO or other software controlling the keyboard lighting.
4. Open NuPhyLab. The notarized release is intended to pass normal macOS Gatekeeper checks without **Open Anyway**. macOS may still ask you to confirm that you want to open an app downloaded from the internet, and optional features still require their normal permissions.
5. Choose **English** using the language selector at the bottom left. Pick a preset or paint a pattern, then play it to the keyboard.

The app includes its Node.js runtime; users do not need to install Node.js. If the keyboard's master light switch is off, press **Fn + ↑** on the keyboard before playing a pattern.

Basic USB lighting does not require Input Monitoring or Accessibility. Optional global key listening, shortcut actions, microphone input, and system audio capture need the corresponding macOS permissions. The Device page links to the relevant settings.

To verify the downloaded archive, put `SHA256SUMS.txt` next to the release ZIP files and run:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

The checksums cover both the application and source archives; download both if you want the command to verify every entry.

## Connection and compatibility

| Capability | USB wired | Bluetooth |
| --- | --- | --- |
| Software-controlled RGB and status lights | Supported on the verified configuration | Unavailable |
| Audio effects, key-triggered lighting, games | Supported | Unavailable |
| Offline editing and library management | Supported | Supported |
| Configured agent shortcuts | Supported, subject to permissions | Limited support; see [Bluetooth notes](docs/BLUETOOTH.md) |
| Firmware compatibility checks | Supported | Unavailable |

NuPhyLab can check official firmware information and open the official updater, but **does not flash firmware**. Starting with v1.0.2, Air75 V3 ANSI firmware **1.0.23.6** has a protocol adapter for its 22-byte lighting state. Compatible updates within the S4 1.x.x.6 family are checked by geometry, state, LED count and RGB readback instead of an exact version whitelist. Changed protocol families fail closed. v1.0.3 has now passed physical 1.0.23.6 RGB readback and restoration checks, and fixes reconnecting after upgrading while the app is open. New firmware scales custom output; verification accounts for that rendered value. See [firmware compatibility and validation](docs/FIRMWARE_COMPATIBILITY_20261015.md).

Version 1.0.10 also handles out-of-range preset-speed readback found on another 1.0.23.6 board, preserving the raw preset configuration through official partial D6 writes. See [the replacement-board check](docs/RELEASE_QA_1.0.10.md).

Version 1.0.11 makes agent lighting exclusive: enabling it stops artwork, games, key-triggered lighting and audio capture, and turns off other keys and side lights. It fixes exact restoration of quantized main colours on 1.0.23.6 and releases USB even when recovery must be deferred. The official downgrade → update warning → upgrade flow was physically tested. See [the verification scope](docs/RELEASE_QA_1.0.11.md).

The canvas maps **83 positions**. The firmware exposes **84 main RGB channels**, plus 20 side-light entries. Main channel 83 has no confirmed physical position and is preserved as black by default. Successful RGB readback verifies channel data, not the physical location of every LED.

## Codex and Claude Code

Agent integration is optional; the lighting studio works without either application.

**Codex:** reads locally available task information and can query account usage through an existing Codex installation. Available actions depend on the installed Codex version and macOS permissions. Unavailable or unknown data stays unavailable or unknown.

F9 follows the dictation shortcut configured in Codex Voice settings. With tap-to-dictate enabled, press F9 once to start and again to stop; hold-only configurations retain press/release behavior. NuPhyLab reads this setting without changing Codex's keybindings. Recording and transcription status remain in Codex.

**Claude Code:** use the Claude Code page to install the local hook integration. It updates the user's Claude Code hook configuration and records session events locally. It does not provide subscription-usage readings. The integration can be removed from the app.

Integration details are in [Codex integration](docs/CODEX_INTEGRATION.md) and [Claude Code integration](docs/CLAUDE_CODE_INTEGRATION.md). These are implementation notes for the versions inspected during development, not a guarantee of compatibility with future agent releases.

## Local data and privacy

Creations, settings, and lighting-recovery records remain on your Mac:

```text
~/Library/Application Support/Air Studio/
```

The original data-directory name and bundle identifier (`local.airstudio.desktop`) are retained for continuity. The local HTTP service listens only on `127.0.0.1`, uses a per-run token, and has no cloud library sync. Audio is analyzed locally and is not saved or uploaded. Firmware checks and optional Codex account-usage queries make the network requests needed for those features.

Do not share `runtime.json`, agent credentials, or your application-data folder in issue reports. Release archives contain application files, not your saved library or account data.

NuPhyLab backs up lighting before taking control and restores it when control is released. If a keyboard is unplugged first, the recovery record is retained for reconnection to the matching profile. Do not delete a pending recovery record just to clear an error.

## Build from source

Requirements: **macOS**, **Xcode Command Line Tools**, **Node.js 22+**, and **npm**. Build on the architecture you intend to use.

```sh
git clone https://github.com/bohu8264/NuPhyLab.git
cd NuPhyLab
npm --prefix ui ci
npm run build
npm test
```

Run the local development service:

```sh
npm start
```

Open the loopback URL printed by the service. The Swift helper handles HID access; WebHID is not required. Browser development mode does not provide the native host's menu bar and global shortcuts. Avoid running it alongside another app controlling the same keyboard.

### Package the macOS app

```sh
npm run fetch-node
npm run package
open release/NuPhyLab.app
```

The packaging script bundles a self-contained Node runtime and signs the app. It automatically selects a single available Apple signing identity; if several are available, set `AIR_STUDIO_SIGN_IDENTITY` to the intended identity. Keep a stable identity across updates to preserve macOS permission continuity.

For a separate local development build without an Apple certificate:

```sh
AIR_STUDIO_ALLOW_ADHOC=1 npm run package
```

Ad-hoc builds are not notarized and may need permissions granted again after updates. Quit the app before replacing its bundle. A release build is architecture-specific, not universal.

For company-signed distribution, follow [macOS distribution](docs/MACOS_DISTRIBUTION.md). Signing alone is not notarization: submit to Apple, staple the accepted ticket, and recreate the final ZIP. The release host has Gatekeeper assessments disabled; testing the final download on a separate Mac with default security settings enabled remains outstanding.

Upgrading from the old development-signed v1.0.0 changes the signing team. macOS may require you to grant optional Accessibility or Input Monitoring permissions again; saved creations stay in the same data directory.

### Project structure

| Path | Purpose |
| --- | --- |
| `ui/` | React and TypeScript interface, built with Vite |
| `server/` | Local API, playback, storage, games, and agent integrations |
| `shared/` | Layout, color, animation, audio, and lighting logic |
| `native/` | Swift HID bridge, AppKit host, and audio capture |
| `hooks/` | Optional Claude Code hook scripts |
| `scripts/` | Build, packaging, signing, and explicit hardware QA tools |
| `tests/` | Automated tests using isolated data and simulated hardware |
| `docs/` | Architecture, protocols, and historical QA notes; some are in Chinese |

## Validation and troubleshooting

Run `npm test` for the automated suite. After building the native bridge, run its offline self-test:

```sh
bin/HIDBridge --self-test
```

The offline self-test does not open the keyboard. Hardware QA scripts are separate and can temporarily change physical lighting. Historical verification scope is documented in [acceptance notes](docs/ACCEPTANCE.md), [hardware QA](docs/HARDWARE_QA.md), and [reconnection recovery](docs/RECONNECT_QA_20260922.md).

- **Keyboard not found:** check the model, data cable, wired mode, and competing HID applications.
- **Lighting will not start:** check the physical master light switch and resolve any pending restoration first.
- **Permissions look stale after an update:** remove the old app entry from the relevant macOS permission list, add the current app, and follow any system restart prompt.
- **Unknown agent state or missing usage:** check the installed agent and its login state; NuPhyLab does not invent missing status or percentages.

When opening an issue, include the app version, macOS version, Mac architecture, keyboard layout, firmware version, connection mode, and reproduction steps. Remove private data from logs and screenshots first.

## Contributing and license

Bug reports, compatibility findings, and focused pull requests are welcome. Run the relevant automated checks and describe any actual hardware testing, including the keyboard model and firmware.

Original project code is released under the **[MIT License](LICENSE)**. Third-party components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). No NuPhy firmware images are distributed. NuPhy, OpenAI, and Anthropic product names belong to their respective owners; agent integrations do not imply endorsement by OpenAI or Anthropic.
