# Air75v3灯光助手

**Air75 V3 Lighting Assistant — an experimental project that turns the Air75 V3 into a canvas for light, sound, and interaction.**

Paint per-key RGB patterns, create animations, make your keyboard react to music, play light-based games, and follow coding-agent activity from your function keys. NuPhyLab runs locally on your Mac, with a native window and menu bar companion.

为 Air75 V3 创作逐键灯光、动画、音乐律动和键盘游戏，也能通过功能键查看编程助手的任务状态。Mac 版在本机运行，提供原生窗口和菜单栏入口。

The project is named **Air75v3灯光助手** (Air75 V3 Lighting Assistant). Current application bundles and download files are distributed as **NuPhyLab**.

项目名称为 **Air75v3灯光助手**，当前安装包和应用内名称仍为 **NuPhyLab**。

[Downloads / 下载](#downloads--下载) · [Documentation / 文档](docs/README.md) · [完整中文指南](README.zh-CN.md) · [Issues / 问题反馈](https://github.com/bohu8264/NuPhyLab/issues)

## Downloads / 下载

Choose the package for your operating system. **macOS v1.0.11** and **Windows Preview 5** are separate builds with different feature and verification scopes.

请选择与你的系统对应的包。**Mac v1.0.11** 与 **Windows Preview 5** 是独立版本，功能及验证范围不同。

| Platform / 平台 | Download / 安装包 | Release notes / 版本说明 |
| --- | --- | --- |
| macOS — Apple Silicon, macOS 13.5+ | [Mac v1.0.11 · ZIP](https://github.com/bohu8264/NuPhyLab/releases/download/v1.0.11/NuPhyLab-macOS-arm64.zip) | [macOS v1.0.11](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.11) |
| Windows — x64, Windows 10/11 | [Windows Preview 5 · ZIP](https://github.com/bohu8264/NuPhyLab/releases/download/v1.0.0-windows-preview.5/NuPhyLab-Windows-x64-v1.0.0-preview.5.zip) | [Windows Preview 5](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.0-windows-preview.5) |
| macOS source / Mac 源码 | [v1.0.11 source · 源码 ZIP](https://github.com/bohu8264/NuPhyLab/releases/download/v1.0.11/NuPhyLab-source.zip) | [Current source / 当前源码](https://github.com/bohu8264/NuPhyLab/tree/main) |

**Share this project:** use [the project homepage](https://github.com/bohu8264/NuPhyLab). This download table identifies the current package for each platform; individual version links remain fixed to that version.

**分享项目：**发送[项目主页](https://github.com/bohu8264/NuPhyLab)即可，用户可在此表选择对应平台的当前版本；具体版本链接始终对应该版本。

> **macOS development preview.** Air75 V3 ANSI USB lighting has been verified on firmware **1.0.16.6 and 1.0.23.6**, using the Mac configuration profile. The latest function-key and dictation checks use **1.0.23.6**. The Mac app is for **Apple Silicon, macOS 13.5 or later**. Company **Developer ID** signing, **Apple notarization**, and a stapled ticket apply to Mac releases starting with v1.0.1. Other models, layouts, firmware versions, and Intel Macs are outside this Mac verification scope.
>
> **Mac 开发预览版：**已验证 Air75 V3 ANSI、USB 有线、Mac 档，固件 1.0.16.6 与 1.0.23.6；最新功能键和听写检查使用 1.0.23.6。安装包适用于 Apple 芯片、macOS 13.5 及以上，v1.0.1 起完成公司签名、Apple 公证和票据附加；其他型号、布局、固件与 Intel Mac 不在本次验证范围。

**Windows preview:** the separately supplied package is unsigned and has limited foreground-only key bindings. Its complete port source was not supplied here; the repository and GitHub's automatic source archives contain the Mac project. Read the [Windows release notes](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.0-windows-preview.5) and bundled `README-Windows.md` for requirements and limitations. Windows hardware results in that guide were reported with the supplied package and were not re-tested on this Mac.

**Windows 预览版：**该包由用户单独提供，未做 Windows 代码签名，绑定按键仅在前台生效；本仓库未收到该移植版的完整源码，仓库和 GitHub 自动生成的源码包仍是 Mac 工程。请查看 [Windows 发布说明](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.0-windows-preview.5)及包内指南；其中的 Windows 真机结果来自随包记录，未在这台 Mac 上复测。

## What you can do / 主要功能

- **Paint with light:** draw individual keys, select and recolor groups, use a color wheel, and undo or redo edits.
- **Build animations:** moving patterns, breathing, waves, and editable frame-by-frame sequences. Start with 12 animated presets or create your own.
- **React to sound:** 10 audio-reactive effects with monochrome or multicolor output, sensitivity controls, and a noise gate. Use a microphone or system audio; system audio capture requires macOS 14.2+.
- **Play on the keyboard:** Snake, Whack-a-Mole, Memory, and two-player Pong.
- **Trigger patterns with a key:** record a trigger, customize its colors and repetition, and keep normal typing available.
- **Follow agent activity:** choose Codex or Claude Code for task-status lighting and shortcuts. Use individual task keys or a whole-keyboard status color.
- **Keep a local library:** save, search, rename, import, and export creations as JSON. Switch the interface between English and Simplified Chinese.
- **Manage light and recovery:** shared brightness and sleep controls (one hour by default), automatic USB detection, and original-lighting backups kept separately for Mac and Windows keyboard profiles. Starting Codex or Claude Code mode starts a fresh lighting timer; saved custom timeouts are preserved.

No kernel extension or keyboard firmware modification is required. NuPhyLab streams RGB frames from your Mac while lighting is active; it does not install these animations into the keyboard firmware.

支持逐键绘制、连续色盘、12 个动态预设、逐帧动画、10 种单色／彩色声音律动、四款键盘游戏、按键触发、Codex／Claude Code 状态灯，以及本地作品保存与导入导出。界面可切换中英文，亮灯和空闲休眠默认均为一小时。灯效由电脑实时发送，无需内核扩展或修改键盘固件。

## Install on macOS / Mac 安装

1. Download **`NuPhyLab-macOS-arm64.zip`** from the [macOS release](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.11).
2. Unzip it, then move **NuPhyLab.app** to **Applications**.
3. Connect an **Air75 V3 ANSI** with a USB data cable and select wired mode. Close NuPhyIO or other software controlling the keyboard lighting.
4. Open NuPhyLab. The notarized release is intended to pass normal macOS Gatekeeper checks without **Open Anyway**. macOS may still ask you to confirm that you want to open an app downloaded from the internet, and optional features still require their normal permissions.
5. Choose **English** using the language selector at the bottom left. Pick a preset or paint a pattern, then play it to the keyboard.

The app includes its Node.js runtime; users do not need to install Node.js. If the keyboard's master light switch is off, press **Fn + ↑** on the keyboard before playing a pattern.

下载 Mac ZIP，解压后把 **NuPhyLab.app** 放进「应用程序」。用 USB 数据线连接 Air75 V3 ANSI，切到有线模式，关闭其他灯效程序，再打开应用并播放图案。运行时已内置，不用安装 Node.js；如键盘灯光总开关关闭，先按 **Fn＋↑**。左下角可切换语言。

Basic USB lighting does not require Input Monitoring or Accessibility. Optional global key listening, shortcut actions, microphone input, and system audio capture need the corresponding macOS permissions. The Device page links to the relevant settings.

基础 USB 灯效不需要输入监控或辅助功能权限；全局按键、命令键、麦克风与系统声音等可选功能按 macOS 提示授权，设备页提供设置入口。

To verify the downloaded archive, put `SHA256SUMS.txt` next to the release ZIP files and run:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

The checksums cover both the application and source archives; download both if you want the command to verify every entry.

## Connection and compatibility / 连接与兼容性

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

实时灯效、任务状态灯、声音律动和灯光游戏需要 USB；蓝牙仅保留有限的快捷控制和离线编辑能力。新固件通过协议结构与 RGB 回读校验后才接管，协议改变仍需更新软件。应用可打开官方更新器，但不自行刷写固件。画布映射 83 个物理按键，固件额外的未定位主灯通道保持黑色；回读一致不等于实体灯光的光学校色。

## Codex and Claude Code / 编程助手集成

Agent integration is optional; the lighting studio works without either application.

**Codex:** reads locally available task information and can query account usage through an existing Codex installation. Available actions depend on the installed Codex version and macOS permissions. Unavailable or unknown data stays unavailable or unknown.

F9 follows the dictation shortcut configured in Codex Voice settings. With tap-to-dictate enabled, press F9 once to start and again to stop; hold-only configurations retain press/release behavior. NuPhyLab reads this setting without changing Codex's keybindings. Recording and transcription status remain in Codex.

**Claude Code:** use the Claude Code page to install the local hook integration. It updates the user's Claude Code hook configuration and records session events locally. It does not provide subscription-usage readings. The integration can be removed from the app.

Integration details are in [Codex integration](docs/CODEX_INTEGRATION.md) and [Claude Code integration](docs/CLAUDE_CODE_INTEGRATION.md). These are implementation notes for the versions inspected during development, not a guarantee of compatibility with future agent releases.

两种集成都可选，不影响独立使用灯光创作台。Codex 读取本机任务与可用额度；F9 跟随 Codex 的听写设置，支持按一次开始、再按一次结束，或按住说话。Claude Code 通过用户主动安装的本地 hook 同步会话，不提供订阅剩余额度。具体能力取决于助手版本与系统授权，不保证未来版本无需适配。

## Local data and privacy / 本地数据与隐私

Creations, settings, and lighting-recovery records remain on your Mac:

```text
~/Library/Application Support/Air Studio/
```

The original data-directory name and bundle identifier (`local.airstudio.desktop`) are retained for continuity. The local HTTP service listens only on `127.0.0.1`, uses a per-run token, and has no cloud library sync. Audio is analyzed locally and is not saved or uploaded. Firmware checks and optional Codex account-usage queries make the network requests needed for those features.

Do not share `runtime.json`, agent credentials, or your application-data folder in issue reports. Release archives contain application files, not your saved library or account data.

NuPhyLab backs up lighting before taking control and restores it when control is released. If a keyboard is unplugged first, the recovery record is retained for reconnection to the matching profile. Do not delete a pending recovery record just to clear an error.

作品、设置和灯光恢复记录保存在上述本机目录；服务只监听 `127.0.0.1` 并使用临时令牌。声音仅在本机分析，不保存或上传；固件检查和可选额度查询按功能发起联网请求。反馈问题时不要分享 `runtime.json`、账户凭据或整个应用数据目录。拔线后保留的恢复记录用于重连恢复，请勿为消除报错而删除。

## Build from source / 从源码构建

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

### Package the macOS app / 打包 Mac 应用

```sh
npm run fetch-node
npm run package
open release/NuPhyLab.app
```

构建需要 macOS、Xcode 命令行工具、Node.js 22+ 和 npm。按上面的命令安装依赖、构建和测试；打包时先获取自包含运行时。开发服务的地址由终端输出，浏览器模式不包含原生菜单栏与全局快捷键。

The packaging script bundles a self-contained Node runtime and signs the app. It automatically selects a single available Apple signing identity; if several are available, set `AIR_STUDIO_SIGN_IDENTITY` to the intended identity. Keep a stable identity across updates to preserve macOS permission continuity.

For a separate local development build without an Apple certificate:

```sh
AIR_STUDIO_ALLOW_ADHOC=1 npm run package
```

Ad-hoc builds are not notarized and may need permissions granted again after updates. Quit the app before replacing its bundle. A release build is architecture-specific, not universal.

For company-signed distribution, follow [macOS distribution](docs/MACOS_DISTRIBUTION.md). Signing alone is not notarization: submit to Apple, staple the accepted ticket, and recreate the final ZIP. The release host has Gatekeeper assessments disabled; testing the final download on a separate Mac with default security settings enabled remains outstanding.

Upgrading from the old development-signed v1.0.0 changes the signing team. macOS may require you to grant optional Accessibility or Input Monitoring permissions again; saved creations stay in the same data directory.

### Project structure / 项目结构

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

## Validation and troubleshooting / 验证与问题排查

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

`npm test` 和原生离线自检用于软件检查；真机 QA 脚本会临时改变灯光，应按对应说明显式运行。连接失败时检查型号、数据线、有线档位与其他占用程序；灯光无法开始时检查总开关和待恢复记录。反馈时提供软件版本、系统、芯片、键盘布局、固件、连接方式和复现步骤，并先移除日志与截图中的隐私。

## Documentation / 文档

Start with the [bilingual documentation index](docs/README.md) for feature guides, protocol notes, release history, and dated validation records. English overviews come first; original historical records retain their dates and test limitations.

从[双语文档目录](docs/README.md)查看功能指南、协议说明、更新历史和验收记录。英文概览在前，原始历史记录保留日期与验证边界。

## Contributing and license / 贡献与许可

Bug reports, compatibility findings, and focused pull requests are welcome. Run the relevant automated checks and describe any actual hardware testing, including the keyboard model and firmware.

Original project code is released under the **[MIT License](LICENSE)**. Third-party components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). No NuPhy firmware images are distributed. NuPhy, OpenAI, and Anthropic product names belong to their respective owners; agent integrations do not imply endorsement by OpenAI or Anthropic.

欢迎提交问题、兼容性结果和针对性的 PR，请说明软件检查与实际真机验证范围。项目原创代码采用 MIT 许可，第三方组件遵循各自许可；不分发 NuPhy 固件镜像，集成不代表获得 OpenAI 或 Anthropic 的认可。
