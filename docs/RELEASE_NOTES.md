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
