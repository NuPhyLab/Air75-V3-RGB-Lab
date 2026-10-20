# Source merge handover — 2026-09-20 / 跨机源码合并交接

[Documentation / 文档目录](README.md)

Retained the receiving project as the main line and merged the incoming Claude Code integration. Active-source key routing, default-binding reset, Unicode download paths and isolated tests were corrected without changing the hardware protocol. Bundle identity, permissions, user data and rollback archives were preserved. The original incoming-machine results are not receiving-machine hardware evidence; use later distribution records for the current Developer ID identity.

保留本机主线并合入 Claude Code，修正来源路由、默认绑定和中文路径；保留身份、权限、用户数据和回退资料，来件验证不等于本机复验，当前签名以较新分发记录为准。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# NuPhyLab 合并交接 · 2026-09-20

## 当前主线

保留原开发机项目为主线，合入另一台开发机新增的 Claude Code 支持。来件基于本项目 2026-09-17 源码包：18 个已有文件变化、24 个有效新增源码文件，168 个文件一致；两个乱码路径图片与本地原图内容完全相同，未重复导入。合并前已有文件与上次源码包相比没有分叉。

来件：`NuPhyLab-claude-handover-20260920.zip`。

SHA-256：`0ef8cef47c149c2d3559bad5fd47da3b4cd3b0f4d198169b4c10289052249685`，已与附带校验文件核对。

## 采用的功能

- Codex / Claude Code 来源切换；两套按键、状态颜色和灯光设置分别保存，同一时间只接管一套按键。
- Claude Code 本地钩子的安装、修复和移除；会话状态、六个任务灯位、单任务全键盘模式、本地命令键。
- 桌面会话 ID 映射与跳转；找不到桌面记录的终端会话提供项目文件夹或复制恢复命令。
- 打包 Node 运行时的外部动态库检查，以及显式选择开发用签名的能力。

已有灯效、十种声音律动、四款游戏、作品库、统一计时、USB / 蓝牙按键适配和 Mac / Win 灯光恢复实现保留。`native/`、`server/hardware.mjs` 与来件一致，本次没有改动底层协议。

## 本机兼容与合并修正

1. 保留 `local.airstudio.desktop` 和本机原 Apple Development 签名；不采用另一台机器的 Bundle ID 或自签名成品，不重置系统权限。
2. 修复 Claude 自定义任务键、命令键仍按 Codex 绑定表分发的问题。当前来源的绑定表用于全部输入分发，非当前来源的槽位指令被拒绝。
3. 修复 Claude「恢复默认按键」按钮条件反向，改键后可以恢复默认。
4. 修复 `fetch-node.mjs` 在中文或含空格项目路径下不执行下载入口的问题。
5. 补齐服务测试隔离：保留真实 Claude 动作校验，替换外部执行器；测试不会打开虚构会话、启动 Claude 或覆盖系统剪贴板。

## 构建与验证

```sh
npm run build:ui
bin/HIDBridge --self-test
node --test --test-concurrency=1 tests/*.test.mjs
node scripts/package.mjs
```

构建机器使用已验证的官方自包含 Node。常规完整重新构建仍可使用 `npm run package`。自动测试执行时不要同时进行 Swift 编译，以免让短时计时测试受 CPU 竞争影响。

本次结果记录见 [合并验收](MERGE_QA_20260920.md)。交接包内另一台电脑报告的真实 Claude 事件和硬件验证不等同于本次本机复验。

## 后续开发边界

- 在目标电脑的应用中选择 Claude Code，再主动安装接入；不复制另一台电脑的 `~/.claude/settings.json`、证书私钥或应用数据目录。
- Claude 桌面会话跳转依赖非公开的本地记录，最终跳转到具体会话的界面效果仍需在有真实会话的目标机器上确认；自动测试只覆盖 ID 解析、映射和动作分发。
- 尚无 Claude 账户剩余额度读取，未把事件或 token 数伪装成额度。
- 只在 Apple Silicon / macOS 本机构建验证，未新增 Windows 或 Intel 验证。

## 回退资料

当前工程 `backups/handover-20260920/` 留存合并前源码、上次源码包和安装包，以及逐文件导入清单 `import-manifest.json`。备份为压缩文件，不额外注册一份应用；它们不进入新的源码包。用户提供的原始交接压缩包仍在下载目录，完整保留原作者的交接说明。

</details>
