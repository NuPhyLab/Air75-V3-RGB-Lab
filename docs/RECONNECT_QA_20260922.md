# Recovery after USB disconnection — 2026-09-22 / USB 拔线后恢复

[Documentation / 文档目录](README.md)

Separate Mac/Win profile journals prevent an old Windows-profile backup from blocking an unrelated Mac-profile session. The current profile must restore and verify before new control; disconnected quit defers recovery while preserving records. The run reports 287 software tests, 729 native checks, real USB heart playback/readback and three reopen cycles. Cross-profile unplugging was simulated, not repeated physical switch/unplug testing.

按 Mac/Win 分开恢复备份，当前档位校验恢复后才能重新接管；断线退出保留备份延后恢复。287 项软件、729 项原生及 USB 播放重开有记录，跨档位物理拔插未在本轮重复实测。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 拔线后的灯光恢复

本次现场：USB 连接正常，当前 A0 档位为 Mac（0），但上次会话留下的 `original-lighting.json` 属于 Win（1）。旧版在连接时恢复失败，却仍允许点击播放；随后原生 `ensureBackup` 返回 `RECOVERY_REQUIRED`，因此界面弹出英文“previous lighting backup exists”。拔线后直接退出也曾因为设备不在场而报恢复失败。

## 修复

- Mac / Win 分别使用 `original-lighting.profile-0.json`、`original-lighting.profile-1.json`。迁移旧记录时先检查格式和设备身份，完整移动文件，不修改备份内容、不覆盖冲突记录。
- 不向未激活的档位写入灯光。另一个档位的备份保留，当前档位可独立播放与恢复；重连到原档位时恢复其自己的备份。
- 播放前重新读取当前设备状态，有未完成的当前档位恢复时先恢复并验证，再接管灯光。恢复失败仍禁止新写入。
- 拔线后退出时验证并保留磁盘恢复记录，作为延后恢复处理；不将其误报为已恢复。仍连接时真正的校验失败继续上报。
- 兜底 `RECOVERY_REQUIRED` 错误改为可理解的中英文提示。原生错误窗口也识别新的两份档位备份。

## 验证

- 完整串行回归 287 项通过，0 失败。新用例覆盖恢复失败后直接重新播放、恢复未通过禁止接管、同档位自动重连恢复顺序、Win 拔线后 Mac 播放与恢复、回到 Win 恢复原记录，以及拔线后退出不向不存在的设备写入。
- 原生离线自检 729 项通过，未打开 HID 或输入监听。其中验证旧记录迁移、两个档位同时保留、旧格式默认 Mac、设备身份检查、损坏记录保留，以及迁移冲突不会覆盖原文件。
- 真实 Air75 V3 USB、固件 1.0.16.6、当前 Mac 档：启动修复版后原 Win 备份完整迁移，逐字节与修复前备份一致，当前档位无错误且不再被阻挡。
- 在用户报错的动画页实际点击播放爱心；验证 84 个 RGB 通道回读一致。停止后 Mac 档原自定义帧完整回读恢复，Win 备份未改变。
- 另做三轮真实 USB HID 会话关闭／重开、爱心播放、RGB 回读和停止恢复。用户设置及作品未改动。

跨档位拔插使用隔离模拟验证；本轮没有要求用户再次物理拔线或切开关。真机测试验证的是现有故障解除、USB 会话重新打开和当前档位恢复，不将这些等同于实际物理拔插测试。Win 原记录仍保留，待键盘切回 Win 并连接时恢复。

</details>
