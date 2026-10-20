# Changelog / 更新历史

[Project and current downloads / 项目与当前下载](../README.md) · [Documentation / 文档](README.md)

Each entry describes its original release. Historical verification is not a new test run, and future firmware compatibility still depends on protocol checks.

每项对应原版本，历史验收不代表本次重新测试，后续固件仍需协议校验。

## v1.0.11 — Exclusive agent lighting / 助手独占灯光

Enabling agent lighting stops other effects and capture, clears non-task keys and side bars, and uses the shared one-hour default timers. Firmware-quantized colors restore exactly; disconnect releases USB even if recovery must be deferred. The dated run passed 324 software tests, 6,259 native checks and the documented official downgrade/update and physical regression.

开启助手灯光独占控制，修复新固件量化色恢复及断开释放 USB；保留开发版界面和一小时默认计时。324 项软件、6,259 项原生及官网回退升级流程按本版范围验证。

[Release and downloads / 发布与下载](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.11) · [Validation / 验收](RELEASE_QA_1.0.11.md)

## v1.0.10 — Air75 V3 compatibility / Air75 V3 兼容性

Preserves extended preset readback values with official partial D6 writes. Complete 22-byte backups, RGB verification and older-firmware protection remain in place. Includes the refresh, task-state, navigation and one-hour timer fixes from v1.0.6–1.0.9.

按官方 D6 分段写入，保留扩展灯效原始参数、22 字节备份、RGB 校验和旧固件保护，包含前几个开发版修复。

## v1.0.9 — Task-key/light synchronization and wake / 任务键灯光同步与唤醒

Physical keys and the page use the acknowledged lighting task table. A press locks its task ID before waiting on queued work; removed targets do not open a replacement. Successful task/command actions wake timed-off lighting while ordinary polling does not reset the one-hour/custom timer.

实体按键与页面跟随已确认灯光的任务表，排队前锁定任务 ID；成功操作可唤醒，保留原计时。

## v1.0.8 — Stable multi-task status / 多任务状态稳定

Incremental event reading preserves valid state around large tool records, compaction and incomplete lines; completion still updates promptly. Cold-start searches and bounded buffers do not invent activity. Verified manual reconnect clears resolved old playback errors.

增量读取避免大记录、压缩和半行打断状态，同时及时处理完成；缓冲和冷启动有界。

## v1.0.7 — One shared lighting timer / 统一灯光计时

New installs use one hour for duration and inactivity, preserving custom/no-limit settings. Starting an agent mode or switching its task source starts a fresh full timer. Color, binding, language edits and polling do not restart it.

默认亮灯和空闲一小时；开启助手模式重新完整计时，自定义和不限保留，普通编辑不反复重置。

## v1.0.6 — Lighting refresh and task completion / 刷新率与任务完成

Raises the output target from 20 to 30 Hz with acknowledged serial scheduling and changed-key frames. Structural final-answer events update Codex once per second without depending on scroll position. Official protocol review retained verified D8/new-schema adapters. The dated run passed 303 software tests, 1,628 native checks and the stated USB regression.

30 Hz 目标调度、差量帧、结构化任务完成事件和协议核对；303 项软件及 1,628 项原生检查按原记录范围通过。

## v1.0.5 — Codex dictation compatibility / Codex 听写兼容

Reads the actual Codex dictation binding, supports toggle and hold modes, and avoids duplicate release/repeat toggles without editing Codex settings. The run passed 300 software tests, 1,623 native checks and real F9 start/stop with text on 1.0.23.6. Mac distribution uses company signing and Apple notarization.

跟随 Codex 实际听写绑定，支持切换式和按住式，过滤松开／重复切换；原生与真机结果见原始记录。

## v1.0.4 — Factory function keys and stable slots / 原厂功能键与稳定槽位

Handles factory USB special F-key signals, verified temporary F4 adaptation and restoration, early key capture and permission retry. Ordinary helper-created tasks are included, internal agents remain excluded, and recent tasks retain slots. Binding conflicts and pending restoration remain protected.

补齐原厂特殊 F 键信号、临时适配和恢复，提前捕获并稳定任务槽位，保留冲突与恢复保护。

## v1.0.3 — Reconnect after firmware updates / 升级固件后重连

A fully verified reconnect archives an old-schema recovery journal rather than replaying it into new firmware. RGB checks account for 1.0.23.6 output scaling, custom-palette restoration and reserved info bytes. A physical 1.0.23.6 board completed 24 RGB frames and three connect/restore cycles.

固件升级后校验重连并归档旧恢复记录，按实际渲染值校验 RGB，已有 1.0.23.6 真机结果。

## v1.0.2 — Firmware schema compatibility / 固件结构兼容

Adds the official 22-byte 1.0.23.6 state while preserving shape settings and the stored custom palette. Compatible S4 family updates use capability checks, not an exact whitelist. Initial validation used 1.0.16.6 hardware and offline extended-schema tests; no 1.0.23.6 board was then available.

支持新版 22 字节结构与自定义颜色恢复，按能力接入同协议固件；当时仅旧固件真机和新版离线检查。

## v1.0.1 — Notarized macOS distribution / Mac 签名公证分发

Switches development signing to company Developer ID with Hardened Runtime, secure timestamps, Apple notarization and staple. App/source archives and checksums remain separate. Optional permissions may need regranting after a signing-team change; default-security first launch on another Mac remained untested.

公司 Developer ID、Hardened Runtime、安全时间戳、Apple 公证与票据分发，另一台默认安全 Mac 首启未完成。

## Windows x64 Preview 5 / Windows 预览版 5

A separately supplied portable Windows build with foreground-only key bindings and no Bluetooth RGB. It is unsigned, and its full port source was not supplied. See the [Windows guide](../README.Windows.md) and [release](https://github.com/bohu8264/NuPhyLab/releases/tag/v1.0.0-windows-preview.5) for the package’s own reported scope.

单独提供的免安装 Windows 包，按键仅前台生效、无蓝牙 RGB、未签名，未收到该移植完整源码，验证范围以随包记录为准。

<details>
<summary>Original macOS changelog / Mac 原始更新记录</summary>

# v1.0.10 — 部分 Air75 V3 灯效兼容检查修复

- 修复部分固件 1.0.23.6 的键盘被误报为“协议结构已改变”：区分扩展灯效参数的读取值与写入范围，保留原始配置。
- 使用官方 D6 连续字段写入能力，仅更新主灯与侧灯配置；没有变化的预设参数不再随整段状态重写。
- 保留完整 22 字节备份和恢复回读；数据包校验、灯位检查、首次 RGB 回读以及旧固件保护继续有效。
- 延续开发版界面，以及 v1.0.6–1.0.9 的刷新率、任务状态、任务键跳转和一小时计时修复。

# v1.0.9 — 任务键与灯光同步、定时后唤醒

- Codex 页面与实体任务键共用已经发送到键盘的任务映射；任务列表变化时，灯光写入确认后再一起更新，避免灯还在显示旧任务、跳转却用了新任务。
- 收到实体任务键时先锁定任务 ID，再等待正在执行的灯光或命令完成；即使有同名任务、列表刷新，也不会把排队中的按键转向另一个任务。目标已移除时提示不可用，不打开替代任务。
- 定时熄灯后，成功使用 Codex 任务键、任务按钮或命令键会重新点亮整把键盘。不再需要关闭并重新开启 Codex 模式。亮灯期间的普通按键和后台刷新不会重置时长，一小时默认值及用户自定义时间保留。

# v1.0.8 — 多任务状态灯稳定性

- 任务日志改为增量读取；大体积工具结果、上下文压缩和未写完的一行不再挤掉已确认的任务状态，避免两个任务运行时有一个蓝灯间歇变色。
- 软件重启时，如日志末尾只有大记录，会分批向前查找最近的有效状态；确认后才显示，不能仅凭任务文件仍被打开就当作运行中。
- 保留大记录前的完成事件；任务完成仍及时切换状态，不用无限延长“运行中”来掩盖状态丢失。
- 限制每轮读取量和未完成记录的缓存大小；文件替换或截断时重新判断，不沿用其他日志的状态。继续保留一小时灯光默认值、原有绑定和配色。
- 手动重连并确认兼容性后清除先前断连的播放错误提示；新的连接或播放错误仍正常显示。

# v1.0.7 — 统一一小时灯光计时

- 新安装默认亮灯时长与空闲休眠均为 1 小时；保留已有自定义时间和「不限」设置。
- 开启 Codex / Claude Code 模式或切换任务来源时，重新开始完整的亮灯计时；修复设备已被作品接管时沿用旧计时、刚开启任务灯光就熄灭的问题。
- 修改颜色、绑定或语言不会反复重置倒计时；状态灯仍由全键盘计时统一控制，旧版独立 Codex 熄灯时间不生效。

# v1.0.6 — 灯效刷新与 Codex 状态更新

- 动态灯效目标刷新率由 20 提升至 30 帧；等待 USB 确认后按当前时间渲染，避免积压或慢帧导致帧率突然减半。
- 稀疏变化只发送变色灯位；首帧、明确校验和恢复仍使用完整帧，保留 ACK、读回及恢复保护。
- 识别 Codex 最新格式的最终答复和最终答复完成事件，每秒更新任务状态；不依赖页面滚动位置，工具完成和中间回复不会被当成任务完成。
- 设备详情显示软件版本与平台；区分软件协议检查失败和键盘有新固件，避免一律引导用户刷固件。
- 本机安装实测：Air75 V3 ANSI、USB、固件 1.0.23.6；84 键 RGB、动画、四个游戏、十种真实系统声音律动及退出恢复通过。303 项自动测试和 1,628 项原生检查通过。
- 官方通信文档与当前 NuPhyIO 能力表已核对。文档未包含 D8 和新版 22 字节扩展，保留现有已验证扩展；没有取消协议校验，也不保证未来破坏性协议变更无需适配。

# v1.0.5 — 新版 Codex 听写兼容

- 读取 Codex 当前的全局听写绑定；配置了「按一下听写」时，F9 按一次开始、再按一次结束，松开及长按重复信号不会再次切换。
- 正确发送修饰键和完整按键过程，兼容新版 Codex 的全局监听；仍支持原有长按听写配置，不修改用户的 Codex 设置。
- 中英文界面根据实际听写模式显示操作说明；没有把快捷键发送成功误报为正在录音。
- 300 项自动化测试及 1,623 项原生检查通过。实体 F9 两次按下分别开始和结束听写，Codex 日志确认完成，用户确认出现文字；真机 RGB 回读和原厂按键恢复通过。
- 安装包适用于 Apple Silicon、macOS 13.5 及以上；分发包继续使用公司 Developer ID 签名、安全时间戳和 Apple 公证。具体签名及下载校验记录见对应 GitHub Release。

# v1.0.4 — 原厂功能键接管与任务灯位稳定性

- 补齐 USB 原厂 Mac 档 F3、F5、F6 的特殊 HID 信号转换；F4 使用单键备份、临时适配和回读恢复，普通 ⌘＋空格不受影响。
- 授权后自动重试功能键捕获，并在 HID 入口接收绑定的 F 键，避免更早的输入法快捷键先截走 F11。关闭模式恢复原按键。
- 纳入 Codex 助手创建的普通任务，继续排除内部子代理和审查任务。
- 最近任务仍在当前六个任务内时，保持各自按键位置；状态和颜色独立更新，打开任务不会让其灯位与其他任务交换。
- 自定义、置顶、优先级来源保留原有规则；不改变用户的颜色、作品与绑定。
- 意外拔线时 F4 恢复记录保留，重新接回原 USB 接口后恢复。固件变化或外部改键会先校验，不覆盖新设置。

# v1.0.3 — Firmware upgrade reconnect and rendered RGB

- Fixes a stuck recovery warning when firmware changes while NuPhyLab owns a lighting session. A fully verified reconnect now archives the old journal and begins a new firmware session.
- Corrects first-frame and diagnostic RGB verification for 1.0.23.6's 200/255 output scaling. Original visible custom colours and all lighting-state fields are checked on restoration.
- Reserved firmware-info bytes no longer invalidate a verified protocol.

Validated on a physical Air75 V3 running 1.0.23.6: 24 RGB frames, three connect/restore cycles. Native lifecycle tests also cover upgrading inside an active process, failed probes and quantized custom-palette recovery.

# v1.0.2 — Air75 V3 firmware compatibility

- Adds the official 1.0.23.6 22-byte lighting-state format and preserves its shape settings.
- Compatible S4 1.x.x.6 updates use read-only protocol checks and verified output, instead of an exact firmware whitelist. Breaking protocol changes still require a software update.
- Captures and restores the newer firmware's stored custom palette as well as its active lighting effect.
- Preserves recovery records from before firmware upgrades in local history instead of writing old schemas into new firmware.
- Function-key adaptation follows verified live keyboard geometry, including newer firmware.

Validation: 1.0.16.6 USB hardware regression plus offline extended-protocol and application tests. No 1.0.23.6 physical keyboard was available. See [detailed evidence](FIRMWARE_COMPATIBILITY_20261015.md).

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

</details>
