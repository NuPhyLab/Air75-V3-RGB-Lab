# Lighting profile and recovery repair — 2026-09-17 / 灯光档位与恢复修复

[Documentation / 文档目录](README.md)

Repairs profile selection and meaningful-field verification when the connected keyboard remains visible but lighting settings do not match. Native offline checks cover Mac/Win routing, old backups and unsupported-field variation while valid-field mismatches still fail. The record reports 719 native checks and 211 regressions, three-color application readback, clean quit and unchanged user data. Windows-profile detection was read-only; output/restoration tests ran in the Mac profile.

修复连接仍在但灯光设置不匹配的档位路由和有效字段校验；719 项原生、211 项回归、三原色和退出恢复通过。Win 档本轮仅验证识别读取，实际输出恢复使用 Mac 档。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 灯效恢复与档位修复 · 2026-09-17

现场故障：设备仍连接，但固件显示未识别，原有灯效恢复失败。

实际键盘工作在 Win 档（A0[0] = 1），旧程序固定访问 Mac 灯效配置
（D5/D6 handle = 0）。读取当前 Win 配置得到原厂模式 6、主灯亮度 75%、
侧灯模式 4、侧灯亮度 60%；旧代码读到的却是另一配置的自定义模式 21。
向非当前配置恢复时，固件的读写路径不同，不能按活动配置验证实际灯光。

此外，旧备份中两个未实现的颜色索引槽为 81、198。已离线核对官方固件的
D5/D6 跳转表和 getter，只有这两个槽不作为可恢复配置检查；其余 15 字节、
协议 ACK、校验和与自定义 RGB 保持严格验证。详见 native/PROTOCOL.md。

新版按实际 Mac/Win 档位选择灯效配置，将档位写入备份；档位在会话中改变时
停止写入并保留备份，提示切回原档位恢复。旧备份归属旧程序固定使用的 Mac 档，
不会拿它覆盖 Win 配置。恢复失败也不再抹掉已识别的固件版本或将连接误报断开。
恢复确认成功后，待恢复标记和页面错误立即清理。

本机验证：

- 切回 Mac 后，现场旧备份恢复成功。84 个按键的 RGB 逐项匹配，20 个侧灯为黑，
  所有有效配置与备份一致，程序正常清除恢复记录。
- 独立真机测试通过全部 84 个按键回读、侧灯调色及恢复、20 帧连续发送、停止恢复、
  SIGTERM 退出恢复和新进程重新读取确认。此次新备份回读全部 17 字节也一致。
- 连续帧中位耗时约 25 ms；测试结束无待恢复备份。
- 原生离线自检 719 项通过，包括 Mac/Win 路由、错误档位回应拒绝、旧备份兼容、
  未实现字段波动，以及其余每个有效字段变化仍必须校验失败。
- 完整自动回归 211 项通过，生产界面构建及原证书签名校验通过。
- 正式应用红、绿、蓝三轮预览各通过 84 键 RGB 回读；每次停止后 104 灯 RGB
  均与播放前一致。设备页显示固件 1.0.16.6，无恢复错误提示。
- 正式应用低亮度呼吸动画播放中直接 ⌘Q，worker 正常退出（status=0），无异常弹窗；
  新进程回读确认原始灯效恢复，无待恢复备份。用户作品库和设置文件字节保持一致。

Win 档的实际识别和配置读取已验证；本轮写入、播放、恢复测试在 Mac 档完成。
没有改写键盘固件、键位或执行恢复出厂设置。

</details>
