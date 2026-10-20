# Factory keycap-function fallback — 2026-09-16 / 原厂键帽功能恢复

[Documentation / 文档目录](README.md)

Clearing temporary mappings only restored the board’s existing F13–F24 layer, not the printed media functions. An explicit optional fallback maps each physical position to its verified factory brightness, Mission Control, search, dictation, Do Not Disturb, playback or volume function while NuPhyLab runs. Strict pairing rejects reordered functions; no firmware keymap is written. The record reports 194 software tests, 687 native checks and USB mapping checks, not every real system action; exiting leaves the board’s own layer.

清空系统映射不能把板载 F13–F24 当作原厂媒体层。可选兼容模式按位置恢复印刷功能并严格校验；不写固件，需保持软件运行。194 项软件、687 项原生及 USB 映射检查不等于每项系统动作已实按。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 关闭 Codex 后的键帽功能修复 · 2026-09-16

## 现场原因

关闭 Codex 后，原生快捷键已注销，USB 设备的 UserKeyMapping 也已恢复为空；用户仍报告原厂功能顺序错乱。直接读取键盘 B2 得到 Mac 基础层 F 区为 104–115（F13–F24），而 B1 原厂 Mac 对应值为 105、106、32262、32263、32264、32278、172、174、171、168、170、169。由此确认：撤销临时映射只恢复到键盘当前扩展层，不能称作恢复键帽功能。用户明确选择恢复键帽上的原厂功能。

## 修复

- 增加显式可选的 `codexKeycapFallback`，本机按用户选择开启，其他既有配置默认不迁移。入口为 Codex → 查看适配 → 适配说明 → 关闭模式后。
- 普通模式按实体位置应用亮度减、亮度加、Mission Control、搜索、听写、勿扰、上一曲、播放／暂停、下一曲、静音、音量减、音量加的 HID 映射；Codex 模式仍按已有用户绑定运行。录入期间临时使用可录入的标准 F 键，结束后恢复对应模式。
- USB 必须确认固件、Mac 模式、完整扩展层及原厂对照。标准键、原厂层、Windows 模式、其他自定义层不做推测修改。蓝牙只匹配已识别 Air75 V3 的扩展 usage。
- 原生助手增加严格的 keycaps 配对白名单，每个源只能对应它自己的键帽功能，顺序错位会拒绝。只写目标键盘的临时系统属性，保留既有冲突保护与恢复日志，不写 B3、不刷固件。

## 验证及边界

完整回归测试 194 项全部通过，原生 Swift 自检 687 项通过，界面生产构建通过。正式签名应用在实体 USB 键盘上完成两轮开／关切换，独立用系统工具读取所有设备服务的映射，12 个位置逐项匹配，关闭后原生快捷键注册清空。普通模式退出成功，恢复记录清除；再次 B2 读取与修复前完全一致。作品与原设置逐项比较一致，仅新增用户选择的键帽兼容开关。

自动化覆盖确切的亮度及音量减／加顺序、错位配对拒绝、普通／Codex／录入三种状态切换、蓝牙模拟路径、用户绑定保留与未知配置保护。没有创建真实 Codex 任务，也没有自动触发系统录音、勿扰或播放动作；本次验证的是映射和分派路径，不宣称实体逐键的系统功能结果已经人工确认。

这是软件兼容模式，需要 NuPhyLab 保持运行；退出后使用键盘自身的 F13–F24 配置。该限制已写入页面提示，未将清空系统映射描述成硬件恢复出厂。若要求离开 NuPhyLab 也使用原厂功能，需要单独将键盘板载 F 区改回出厂配置，本次未作此修改。

参考：本机 Xcode SDK 的 IOHIDUsageTables.h（Consumer 亮度、AC Search、Voice Command、Generic Desktop Do Not Disturb 等）；[Apple HID remapping](https://developer.apple.com/library/archive/technotes/tn2450/)；[NuPhy S4 read-keymap wire format](https://github.com/kelchm/nuphy-tools/blob/03140bc1534001599bfcd0a0ef61706bd34d377d/PROTOCOL.md)。

</details>
