> **Historical Windows documentation / 历史 Windows 说明**
>
> The old AIR-only repository is being retired. This document records a separately supplied historical preview; the old release links below are no longer distribution entry points. The maintained release is the [AIR75 V3 + Kick75 macOS app](https://github.com/bohu8264/NuPhyLab-next/releases/latest).
>
> 旧 AIR 专用仓库将退役。本文仅保留早期 Windows 来件的历史说明，旧发行链接不再作为下载入口。当前持续维护的是 [AIR75 V3＋Kick75 Mac 双适配版](https://github.com/bohu8264/NuPhyLab-next/releases/latest)。

# Air75 V3 RGB Lab — Windows preview / Windows 预览版

**Air75v3灯光助手.** The current Windows executable is named `NuPhyLab.exe`.

当前 Windows 程序名为 `NuPhyLab.exe`。

[Project / 项目主页](README.md) · Download Preview 5 / 下载预览版（旧地址停用 / retired URL） · Release notes / 发布说明（旧地址停用 / retired URL）

**Version: 1.0.0-windows-preview.5.** This is a separately supplied Windows port distributed as a portable ZIP. It is based on earlier NuPhyLab resources and does not have the same feature or validation scope as the current Mac release. The original supplied ZIP is published without modification.

**版本：1.0.0-windows-preview.5。**这是单独提供的 Windows 移植预览版，使用免安装 ZIP 分发，基于较早的 NuPhyLab 资源制作，功能和验证范围与当前 Mac 版不同。GitHub 发布的 ZIP 为来件原包。

## Install / 使用方法

1. Use **Windows 10/11 x64**, **.NET Framework 4.8**, and **Microsoft Edge**. Node.js is bundled.
2. Extract the **entire ZIP** to a fixed folder. Run **NuPhyLab.exe** there. Keep `runtime`, `server`, `shared`, `ui`, `bin`, and the other accompanying files together.
3. Connect an **Air75 V3 ANSI** by USB and select wired mode. Close other applications that control its lighting. If the master light switch is off, press **Fn + ↑** on the keyboard.
4. Open the Device page and confirm the connection, then play a pattern. Closing the window leaves the service in the tray. Use **Restore keyboard and quit** in the tray menu to exit.

需要 Windows 10/11 x64、.NET Framework 4.8 和 Edge；已内置 Node.js。完整解压后运行 `NuPhyLab.exe`，不要只复制 EXE。用 USB 连接 Air75 V3 ANSI 并切到有线档，关闭其他灯效软件；如总开关关闭，先按 Fn＋↑。关窗口后服务留在托盘，结束使用请在托盘菜单选择「恢复键盘并退出」。

## Features and limits / 功能与限制

| Feature / 功能 | Windows preview / Windows 预览版 |
| --- | --- |
| Painting, presets, animation, library / 绘制、预设、动画、作品库 | Included; offline editing is available / 已包含，可离线编辑 |
| USB RGB and original-light recovery / USB 灯光与恢复 | Requires a compatible Air75 V3 ANSI / 需要兼容的 Air75 V3 ANSI |
| Four games / 四款游戏 | Included; keyboard playback requires USB / 已包含，灯光输出需要 USB |
| Key triggers and configured bindings / 按键触发与绑定 | Foreground window only; no global function-key remapping / 仅应用前台生效，尚无全局功能键改映射 |
| Microphone and system-audio effects / 麦克风与系统声音律动 | Browser capture; system audio requires sharing an audio track / 使用浏览器采集，系统声音需要实际共享音轨 |
| Codex / Claude Code | Local status integration with Windows-specific limits / 本地状态集成，受 Windows 版能力限制 |
| Bluetooth software RGB / 蓝牙软件灯效 | Unavailable / 不支持 |
| Windows executable signing / Windows 程序签名 | Not signed / 未签名 |

Animations verify RGB after each frame, so their refresh rate can be lower than the Mac build. The supplied guide reports compatibility with firmware **1.0.16.6** and **1.0.23.6**, including Windows-side USB checks on 1.0.23.6. Those results were supplied with the package; uploading it on this Mac did not repeat Windows hardware, real-account, microphone, system-audio, physical key, or visual tests. See the bundled `README-Windows.md` for the full original scope.

动画逐帧进行 RGB 回读，帧率可能低于 Mac 版。随包指南记录了固件 1.0.16.6、1.0.23.6 的兼容情况及 1.0.23.6 的 Windows USB 检查；这些是来件记录，本次在 Mac 上传不代表重新验证了 Windows 真机、真实账户、声音采集、实体按键或视觉效果。完整范围见包内 `README-Windows.md`。

## Data and recovery / 数据与恢复

Windows data lives in `%LOCALAPPDATA%\NuPhyLab`. If unplugging leaves a recovery record, reconnect the same keyboard in the same Mac/Win profile and use **Restore original lighting**. Keep recovery records until restoration is verified. Do not share `runtime.json`, account credentials, or the full application-data folder.

Windows 数据位于 `%LOCALAPPDATA%\NuPhyLab`。拔线后若有恢复记录，请将同一把键盘切回原来的 Mac/Win 档位并重新连接，再恢复原灯效。恢复校验前保留备份；不要分享 `runtime.json`、账户凭据或整个数据目录。

## Source availability / 源码范围

This repository contains the **Mac project's source**. The Windows port's full source was not supplied with this upload. GitHub's automatically generated **Source code** archives on the Windows release are repository snapshots, not the full source of that port. Use the Windows ZIP above to run the preview.

本仓库提供 **Mac 工程源码**，本次上传未收到 Windows 移植版完整源码。Windows 发布页中 GitHub 自动生成的 **Source code** 是仓库快照，不是该移植版的完整源码；运行预览版请下载上方 Windows ZIP。
