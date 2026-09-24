# Air Studio 验证记录

验证日期：2026-09-10。目标为这台 Mac 上以 USB 有线连接的 NuPhy Air75 V3 ANSI，固件 1.0.16.6。验证由开发代理执行，无需用户承担验收操作。

## 自动化与真实设备

- 49 项自动化测试：动画时序与移动、Snake 游戏、原子保存与非法导入、Codex 状态与额度、HID 子进程生命周期及失败传播。
- 原生 helper 离线自检。
- 84 个主键 RGB 逻辑通道完整写入后与 D2 回读逐项相等；104 个可读通道包含 20 个侧灯通道。
- 连续帧压力测试：20 个完整帧，中位耗时 26.90 ms，最大 31.88 ms。主服务采用 50 ms 调度周期，实际发送会合并重复画面。
- 整组侧灯写入及单独恢复通过；仅开启额度侧灯不会接管或清空主键盘背光。
- 明确停止、断开重连、SIGTERM 退出后，原来的 17 字节 D5 设置精确恢复。
- 10 项连接真实键盘的服务集成检查，见 `integration-qa-results.json`。
- 本地 API 拒绝没有令牌的访问；伪造来源不能访问控制接口。
- 读取本机 48 个任务、6 个任务位置和 2 个额度桶；六个任务状态灯与实际 HID 回读一致。不向真实任务发送消息或执行审批。

原始证据见 [硬件报告](HARDWARE_QA.md)、[原生 JSON 结果](../native/hardware-qa-results.json) 和 [服务集成结果](integration-qa-results.json)。

## 界面流程

通过实际点击、输入及文件选择完成：

- 单键绘制、颜色输入、撤销、重做、紧凑心形预设。
- 保存对话框、作品库出现作品、刷新后重开。
- 导出 JSON，随后从该文件导入，作品数量正确增加。
- 右移、循环播放、暂停、继续、停止。
- 添加第一帧、修改帧时长、复制帧。
- Snake 开始、转向、暂停、结束；结束恢复之前的作品状态。
- 播放 A 时从作品库打开 B，先结束 A，再展示 B；已保存动画重开后保留动画模式。
- 暂停时保存作品不会重置进度或静默变成静态。
- Codex 状态开关、真实任务与额度界面。
- 设备连接、权限读取、恢复入口与本地存储信息。
- 浏览器日志未出现前端异常。
- 桌面及 1200/760/390 宽度检查无页面横向溢出；窄屏自动调整面板位置。

## 窗口与紧凑界面调整

本轮完成窗口缩小、记住尺寸、⌘0 重置，以及编辑区层级整理。已验证默认窗口各页面、绘制/撤销/选择、动画与游戏控制，并检查窄屏没有横向溢出；原生窗口拖动、退出再打开保留 900 × 600 内容区，以及最小窗口与重置功能均通过。详细对照及当前截图见 [视觉验收](design/FIDELITY.md)。

## 全键盘游戏与原图布局修正

- 功能键排移除多余分组空隙，RGB 索引 14 的 Insert 位于 `x=14, y=0`；独立旋钮位于 `x=15, y=0`，不分配 RGB 索引，也不可绘制。83 个按键的索引 0–82 保持不变。侧灯移到 F 排两侧，配色不变。
- 所有 83 个物理按键可用于游戏，包含六行、宽键、Fn 及方向键；全图可达、食物覆盖每个键、边界、自碰撞、胜利与尾巴腾空已有测试。
- 新增 6 项真机检查见 [全键盘游戏结果](whole-keyboard-qa-results.json)：静止及移动画面中仅 3 段蛇和 1 个食物亮起；其余 80 个主逻辑通道和 20 个侧灯通道回读全部为零。游戏期间切换额度开关也不会重新点亮侧灯。结束后恢复先前作品和原灯效。
- 新增 4 项隔离服务回归：命令与播放循环写帧失败后的重新接管、暂停游戏断联重连，以及相同额度颜色在重连后重新写入。使用模拟 HID 与额度快照，不计入真机验证。
- 更新后的原生 App 已核对完整键位、游戏暂停画面与空格继续/暂停，截图见 `design/layout-corrected.png` 和 `design/whole-keyboard-game.png`。
- 图形位置来源与修正记录见 [布局核对](LAYOUT_CORRECTION.md)。

## 原生 App

实际运行 `release/Air Studio.app`。已确认首次启动能连接键盘、渲染界面、保存作品，关闭主窗口后本地服务持续输出动画帧。退出后使用新 helper 独立回读，原来的 17 字节设置完全一致。

重启后保存的作品和 Codex/额度开关均保留，任务状态灯与额度侧灯重新启用。最终退出采用仅向 Node PID 发送 SIGTERM 的顺序关闭，实际检查 App 完全结束、worker 退出码为 0、没有遗留备份；不会再把已经成功的恢复误报为失败。

打包包含自带 Node 运行时、Swift helper、前端与服务，不要求用户安装 Node。二进制仅依赖 macOS 系统动态库。当前 App 使用 Apple Development 证书签名；尚未完成 Developer ID 分发公证，不等于跨机器发行测试。

## 验证边界

回读验证确认设备接收并保存了 RGB 通道值，并非相机逐键拍摄的光学颜色校准。83 个实际按键的位置依据官方 ANSI 布局与原图校正，RGB 索引沿用原有映射。索引 83 尚无确定物理位置，默认保留黑色，游戏期间也保持黑色；它不是旋钮的灯。侧灯原厂协议仅支持整组颜色；不能按灯珠逐格显示进度。Codex 无新鲜证据时显示未知，额度失败显示不可用或过期。无法确认真实审批上下文，因此不会自动批准/拒绝任务。

新生成 App 的辅助功能/输入监控权限为未授权：灯效、数据读取与任务跳转可用；需要注入系统组合键的动作被明确禁用，不将它们计入已通过的实际执行测试。

尚未实测其他 Mac、其他固件、ISO 布局，以及物理拔线/系统睡眠的全部时序；代码包含恢复保护与重连逻辑，不把这些情况计入已完成的真机验收。


## 2026-09-11 · Micro 状态与颜色修复

- 自动回归 131 项全部通过；原生自检 566 项通过。新增检查包括活跃任务长时间静默、进程退出／重启、未读清除、未决问题匹配、临时索引失败、四种任务来源、暂停动画时状态灯更新、命令分派和颜色读回差异。
- 已安装 NuPhy Studio 的 1100 像素级窗口检查通过；六任务列表压缩行高，状态灯和命令键分别成组。隔离 UI 检查固定任务、自定义任务、重复分配交换、选中反馈、流光开关与权限禁用提示。未产生真实 Codex 测试任务。
- Air75 V3 ANSI / 1.0.16.6 真机完成 18 组 RGB 检查，共 1512 个通道颜色值全部一致：纯红绿蓝白、珊瑚色、暗色、不同通道值及 30/61/88% 亮度、真实 Codex 任务状态颜色。额外检查原有爱心：88% 亮度时，UI 和设备均为 `#c2746c`。
- 真机呼吸与流光读取 5 帧，颜色和位置均按时间变化；30 秒自动息灯后 F1–F12 黑色，任务仍正确保持运行状态，点亮后恢复，回读均匹配。
- 发现并修复 D8 确认后立即读取 D2 可能得到首 18 灯位旧帧的问题。读回等待固件刷新时序，普通动画写入不增加等待。
- 完成后恢复原有 88% 亮度、Codex 灯关闭和未播放状态，8 个作品及原爱心草稿保留。隔离服务、示例数据、临时检查脚本和测试标签页已清理。

验证边界：电脑操作工具拒绝访问 Codex 窗口，没有绕过限制。Micro 规则依据本机官方源码及官方指南核对；上述命令分派测试不等于真实 Codex UI 动作全部通过。Fast、真实审批／焦点／语音过程、直接分叉、发送输入、技能和旋钮摇杆仍未接入完整接口。RGB 数据一致也不等于对实体 LED 与显示器完成了光学校色。

## 2026-09-11 · 全键盘计时与中英文切换

- 设备页新增全键盘亮灯时长和空闲休眠；1 秒至 24 小时自定义，0 为不限。Codex 空闲息灯和任务提示时长独立保留。普通轮询与切换语言不重置计时，休眠冻结动画和游戏推进，手动唤醒／恢复播放正确续接。
- 自动回归 142 项通过（限制 2 个测试文件并发，避免同时启动大量模拟 HID 进程造成超时）；原生自检 566 项通过。新增范围包括计时边界、空闲与明确唤醒、Codex 独立超时、动画暂停续接、游戏休眠输入、设置持久化、语言插值和端口冲突回退。
- 隔离界面检查全部页面的英文导航与正文，三个新增游戏的运行状态、英文预设搜索、作品操作与删除弹窗；已有中文作品名和任务名保持原文。语言和时间输入重载后保留，1280 宽度无页面横向溢出，浏览器无错误日志。实际原生窗口约 1100 像素宽检查英文排版及 Edit / Window 菜单切换。
- Air75 V3 ANSI / 1.0.16.6：2 秒定时熄灯后 84 个主通道回读全部黑色，侧灯亮度回读为 0；手动唤醒恢复输出，RGB 回读一致。1.5 秒系统空闲休眠同样通过，应用活动唤醒后 RGB 回读一致。系统空闲计时在输入监控未授权时仍可读取，不记录按键内容。
- 更新时优先复用原本的本地端口，保留 WebView 草稿；原来的「青绿扫描」及 32 帧草稿保留。端口已占用时自动换用空闲端口，不阻止启动。已有 7 个作品逐项一致，原设置和当前静态 RGB 在硬件验证后恢复；新增两个全键盘计时交付默认不限，Codex 默认保持原先的 3 分钟。
- 验证未创建真实 Codex 任务。隔离服务、临时作品、浏览器测试页和临时验证文件清理，发布目录只保留一个可见 NuPhy Studio.app；源代码与安装压缩包同步更新。

边界：本次实际验收针对上述一把键盘与这台 Mac。主灯依据 RGB 回读、侧灯依据整组亮度设置确认；不是相机拍摄或光学校色。系统设置／文件选择器沿用 macOS 的语言。已有作品需正式保存才能保证跨存储清理和端口变更后保留。

## 2026-09-14 · Codex key bindings and settings layout

Validation: 147 automated tests passed; native HID self-test passed 566 checks.

- Task keys default to direct F1–F6; command keys default to direct F7–F12. Both sets use press-and-release recording, atomic swaps, persistent storage, and physical LED remapping.
- Native app verification: all 12 default keys registered without failure; recorded A, resumed registration, dispatched A to the first real task; restored F1 and dispatched F1 successfully to the same task. Recording sent no task action. F1 inside the idle-time input left the event count unchanged and registrations suspended. Existing 7-minute / 4-second timers and seven saved works were retained.
- USB verification: moving task 1 to A moved its RGB output to index 46, released F1, and all 84 main channels matched the device readback. This verifies RGB data, not a camera measurement of perceived color.
- Browser verification: change task key to A; press A to dispatch the assigned task; assign A to command 1 and confirm task 1 swaps to F7. English labels and 800-pixel layout checked without horizontal overflow. No disposable tasks were created in Codex.
- Native command key F12 reached the shortcut sender and reported the existing missing Accessibility permission. Actual system-command execution cannot pass until macOS grants that permission. Task deep links succeeded without it. A matching isolated regression case checks the localized error and status reporting.
- Visual checks: tasks / commands / lights read in order; paired key-and-change controls align; appearance and timing have separate columns; switches share row alignment; narrow windows stack controls without clipping. Existing flat keyboard and restrained colors are unchanged.

## 2026-09-14 · Permission identity repair

System Settings showed NuPhy Studio enabled, but the native helper returned false for both Input Monitoring and Accessibility even after a complete restart. TCC logs attributed the request to the correct `local.airstudio.desktop` app and rejected its saved code requirement with status -67050. The saved requirement used an earlier cdhash, while the installed ad-hoc build had a different cdhash.

Packaging now requires an existing Apple signing certificate, signs the runtime and HID helper with the same certificate, then seals the complete app once. It refuses to overwrite a running app and does not fall back to ad-hoc signing. No certificate was created or exported, and no TCC database or system-protection setting was modified. A changed-resource clone was signed again and successfully validated against the original designated requirement, demonstrating signature identity continuity across updates using the same certificate.

Reference: [Apple DTS on stable signatures for TCC](https://developer.apple.com/forums/thread/663889).

## 2026-09-14 · Command gesture regression

- Validation: 154 automated tests passed; native self-test passed 566 checks. Both native executables and the production frontend built successfully.
- Isolated browser verification: Start/Stop dictation transitions work in Chinese and English. The command controls and helper text remain readable in the existing two-column layout. The fixture uses fake transport and never records audio.
- After replacing the stale Accessibility entry, the installed certificate-signed app reports Input Monitoring, Accessibility and event posting allowed. Seven saved works and settings matched the previous baseline.
- Installed Codex 26.908.40834 statically confirms that dictation listens for both key-down and key-up. NuPhy previously posted both immediately. Physical gestures now preserve the hold and release order; duplicate press cycles are filtered before forwarding toggles.
- Isolated service tests verify a single F11 toggle despite duplicate press notifications, dictation release after rebinding and game entry, primary custom shortcuts, explicitly disabled bindings, recursive key conflicts and recovery after a failed release. These tests use fake transport and do not start a real recording or create a real Codex task.
- Live Codex window access was explicitly denied by the computer-use tool. F10 was reported by the user as unresponsive; F11 was reported as opening and closing. No claim is made that the final Codex voice/terminal UI result has been verified. No Codex keymap or unrelated bridge application was changed.

## 2026-09-14 · Unified lighting timers

- Removed Codex-specific idle and hint duration controls. Device timers now govern key lights, side lights and Codex status lights together. Existing global durations are retained; legacy Codex durations cannot override them. Nonworking command-key feedback persists with the selected task rather than using a separate hint timer.
- 155 automated tests passed and the production frontend built successfully. Regression coverage includes stale legacy timers, simultaneous artwork/status sleep and wake, duration expiry despite task updates, the legacy wake command, and animation/game clock preservation.
- Isolated UI checks confirm the simplified Chinese controls. Real Codex command execution is outside this timer change and retains the previously documented verification limits.
