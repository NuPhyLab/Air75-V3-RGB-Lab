# Physical Air75 V3 validation / Air75 V3 真机验证

[Documentation / 文档目录](README.md)

Historical USB validation of Air75 V3 ANSI on firmware 1.0.16.6, including protocol identity, 84 main RGB channels, 20 side-light entries, frame timing, restoration and helper lifecycle. Reports describe numeric device readback rather than optical color calibration. The physical map has 83 confirmed keys; do not infer an unverified LED location from the 84-channel protocol. See each dated addition for its own test count and limits.

历史 USB 验证覆盖身份、84 个主灯通道、20 个侧灯条目、发送耗时和恢复；数字回读不是光学校色，83 个确定物理按键不等于 84 个已定位灯位。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# Air75 V3 真机验证

验证时间：2026-09-10，Asia/Shanghai。测试的是用户通过 USB 连接的 Air75 V3 ANSI；测试过程中由一个 helper 独占本项目的 HID 访问，未刷固件、未修改键位、未发送 `EE`，未发送任何 Codex 操作快捷键。

## 身份和原始状态

- VID/PID：`19f5:1028`；配置 interface usage page `1` / usage `0`；64 字节 input/output，report ID `0`。
- A1：`10 00 01 aa 06 00 00 00`，前六字节与已验证官方固件 `1.0.16.6` 一致。
- D1：104 个 RGB 条目，主区 84 + 侧区 20。
- 测试前完整 D5：`[2,75,2,0,0,0,0,190,174,4,60,2,1,0,255,0,0]`。
- 第一次变更前把完整状态和 104 个当前 RGB 条目写入私有备份并同步到磁盘；整个成功测试结束后，验证恢复成功才删除备份。

## 已通过的真机检查

| 检查 | 结果 |
| --- | --- |
| 只读连接 | A1、D1、D5 的回复标识、opcode、checksum、route 均通过，未改变 session key |
| 开启自定义帧 | D6 完整状态选择 effect 21、brightness 100、RGB mode 1；延迟 D5 回读完整 17 字节精确一致 |
| 84 键 RGB 帧 | 84 个索引发送不同低亮度 RGB；D2 前 252 字节与每个期望值完全一致，包括索引 83 |
| 亮度约定 | 硬件亮度固定 100，测试主区 RGB 各通道不超过 31；软件 RGB 值与 D2 精确一致，可由软件控制可见亮度 |
| 首帧完整验证 | 一次全键发送加回读约 133.33 ms |
| 帧吞吐 | 20 个连续串行全键更新，中位 26.90 ms，最大 31.88 ms；按平均耗时计算约 37.61 帧/秒。没有为吞吐测试逐帧执行 D2，仅验证每包 ACK，末帧再完整回读 |
| 原厂整组侧灯 | `color=#204010, brightness=20` 后，D2 最后 20 个条目均为 `#060d03`，体现固件亮度缩放和取整；主背光字段保持不变 |
| 单独恢复侧灯 | `side restore:true` 把原始 D5 第 9–16 字节恢复，主区仍为 effect 21 / brightness 100 |
| 显式完整恢复 | `restore` 后 17 个 D5 字节与测试前完全一致，随后独立 status 再次确认 |
| 退出恢复 | 第二次开启低亮度帧后发送 SIGTERM；helper 正常恢复并以 0 退出；全新进程连接后再次读到原始 17 字节状态 |
| 备份清理 | 成功恢复后备份不存在；无待恢复状态 |

产品默认动画帧率建议设为 30 fps 或更低，并等待每次 `paint` 回复后再提交新帧。这是当前主机和 USB 连接下的一次短测，不代表长时间稳定性上限。

## 发现并修复的协议差异

初次测试采用某参考实现中的「完整 D6 + address 1 亮度 commit」组合，完整 readback 没有通过。恢复后除 RGB 字段外其他状态都正确；第 7、8 字节从原来的 `190,174` 变成 `191,175`。helper 拒绝把它报告为精确成功，并保留备份。此次失败发生在 `arm`，还未发送任何 D8 自定义帧。

改为只发送 address 0 的完整 17 字节 D6，再执行延迟 D5 查询，立即恢复为原始 `190,174`，所有 17 字节完全一致。随后整个上表流程通过。最终实现不发送 address 1 的额外亮度 commit，也没有放宽 RGB 比较容差来掩盖差异。

## 尚未验证的边界

- 这验证了逻辑 RGB 索引的可写入与回读，未对每个索引逐个指认物理键。公开 ANSI 地图存在冲突，索引 83 不应因此被宣称已确认是哪一颗实体灯。
- 未进行长时间负载、休眠/唤醒、物理拔线或多程序争抢 HID 的测试。退出清理无法覆盖 SIGKILL 或设备断电，后续依靠磁盘备份恢复。
- 未改变固件，因此没有左右侧灯分别控制、逐颗侧灯进度条的验证；原厂仅验证整组侧灯控制。
- `D8` 的协议路径为 RAM 更新；本次未测量 `D6` 的 Flash 写入/持久化调度，也未验证板载电量或连接提示是否覆盖侧灯显示。
- 未发送真实 Codex 快捷键、审批/拒绝操作或修改全局键位。快捷键投递和 Input Monitoring 权限仍需在打包应用中单独验证。

## 可复验命令和证据

```sh
swiftc -O native/HIDBridge.swift -o native/air75-hid-bridge
native/air75-hid-bridge --self-test
python3 native/qa-hardware.py --run
```

最后一条会临时改变灯效，要求先退出本项目主应用或断开它的连接，并关闭其他 HID 配置程序。脚本先备份，在正常或异常退出时尝试恢复，不会越过已有待恢复备份。

详细请求结果和计时在 `native/hardware-qa-results.json`；JSONL 契约与恢复语义在 `native/PROTOCOL.md`。

## 2026-09-16：板载灯光总开关与关闭状态恢复

- 现场复现 D6 已应答但 D5 仍是 effect 0、主灯亮度 0、侧灯亮度 0。实体 Fn＋↑ 后，原有完整 D6 写入及 84 个 RGB 回读立即通过；最终代码不增加 EE 会话握手或额外亮度提交。
- 关闭投影中的 effect 0 无法直接写回。恢复时仅将该值换成原厂静态 effect 2，保留其余 16 字节和两个零亮度值；D5 核对以及 104 个 RGB 全黑通过后才删除备份，返回 allLightsOff。若键盘始终关闭且状态未改变，则不额外写入，仍核对 104 个灯位全黑。
- 实体键盘连续完成两轮接管、84 个不同 RGB 写入和回读、原始有效状态恢复，均通过；无待恢复备份。这里核验的是协议配置和渲染回读，不是对实体键帽颜色的视觉测量。
- 原生自检 612 项通过；错误文案测试确保已恢复、未恢复和板载灯光关闭状态不会混淆，中英文不展示原始字节数组。

</details>
