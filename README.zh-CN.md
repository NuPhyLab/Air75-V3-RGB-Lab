# NuPhy Lab — 中文指南

[中文 / English 首页](README.md) · [English guide](README.en.md)

NuPhy Lab 是适用于 macOS 的 **NuPhy AIR65 / AIR75 / AIR100 V3、NODE75 / NODE100（LP / HP）及 Kick75（ANSI）** 灯光创作软件。USB 插入后自动识别型号，作品按键盘分别保存。

提供绘图、动画、按键触发、游戏、声音律动、作品库，以及 Codex / Claude Code 任务快捷键和状态灯。

## 下载与安装

**[直接下载最新版 Mac 安装包](https://github.com/bohu8264/NuPhyLab-next/releases/latest/download/NuPhyLab-macOS-AppleSilicon.dmg)**

适用于 **Apple Silicon 和 macOS 13.5 及以上版本**。安装包使用 NuPhy 公司 Developer ID 签名并经过 Apple 公证。

[最新版本与更新说明](https://github.com/bohu8264/NuPhyLab-next/releases/latest) · [历史版本](https://github.com/bohu8264/NuPhyLab-next/releases)

1. 安装前先退出旧版 NuPhy Lab。
2. 打开 DMG，将 **NuPhy Lab** 拖入「应用程序」。如提示则替换旧应用，只保留一个已安装副本。保留本机应用数据，继续使用原有作品、草稿和设置。
3. 用 USB 数据线连接键盘并切到有线模式，按软件提示完成授权和固件检查。

首次使用按提示授予输入监控和辅助功能权限。软件可能自动关闭并重新打开一次，使新权限生效。声音权限在实际启用声音律动时请求。

需要更新键盘固件时，请按 NuPhyIO 提示操作；升级完成后关闭官网页面，再回到 NuPhy Lab。

兼容固件、型号和验证范围请见[键盘兼容性](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/KEYBOARD_COMPATIBILITY.md)。AIR65 V3 没有实体 F 区，不提供 F1–F12 自动接管。

新增型号的实体检查目前仅覆盖 NODE75 LP，不代表该型号所有功能均已逐项验证；其余新增型号仍需实机验证。另一台 Mac 的首次安装授权、AI 命令的实际效果，以及触摸手势和媒体输入配合仍需分别验证。

## AI 助手

在 AI 助手中开启 Codex 模式后，默认命令键如下：

| 按键 | 功能 |
| --- | --- |
| F7 | 切换普通 / 极速模式 |
| F8 | 批准当前请求一次 |
| F9 | 拒绝当前请求 |
| F10 | 新建聊天 |
| F11 | 按住听写，松开结束 |
| F12 | 发送聊天输入框中的内容 |

F8、F9 需要当前存在审批请求；F12 需要聚焦聊天输入框。命令键分配可在 AI 助手中修改。

## 实验室：框选提问

框选提问需要 **macOS 14 及以上版本**，键盘功能仍支持 macOS 13.5。

1. 打开 **设置 → 模型与 API**，选择服务和模型，保存自己的 API Key。可选更多预设模型、在支持的服务中读取账户模型列表，或填写模型 ID 和兼容端点。
2. 在 **实验室 → 框选提问** 开启功能，完成辅助功能、输入监控及屏幕录制授权。软件会核对权限与实际监听状态。
3. 按住快捷键拖动框选，松开后执行默认动作；框选时可滚轮切换翻译、总结和解释。默认快捷键为 **⌥ ⇧ Q**，可以自行修改。
4. 在“翻译为”选择中文、英语、日语、韩语等 16 种目标语言。回答浮窗也能修改目标，选择会自动保存，且不随界面语言改变。

需要口述问题时开启“按住说话”，再允许麦克风和语音识别；录音在本机转写，不上传。下方“发送图片”开关控制是否允许附带选区图片，所选模型和端点必须支持图片输入。

选区文字、问题，以及启用后按操作需要附带的图片会发送到自己配置的模型服务。API Key 保存在本机钥匙串。新用户默认关闭框选和语音，可以按需开启。

[完整使用说明](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION.md) · [模型、图片与权限](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION_R2.md) · [界面与翻译语言](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION_LANGUAGES.md) · [1.2.41 更新说明](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/RELEASE_1.2.41.md)

## 更新与兼容

应用内置签名更新，会自动检查新版；也可在应用菜单或 **设置 → 关于与更新** 点击 **检查更新**。安装会保留作品、草稿和设置。旧 1.1.x 用户需要先手动安装一次当前最新版。

灯效需要 USB 连接；AIR75 V3 蓝牙另支持快捷键控制。当前键盘布局为 ANSI。

诊断记录仅保存在本机；更新检查不上传任务内容、作品或键盘输入。

## 源码与更多说明

[项目源码](https://github.com/bohu8264/NuPhyLab-next/tree/main) · [开发指南](https://github.com/bohu8264/NuPhyLab-next/blob/main/README.zh-CN.md#源码与开发) · [发行版本](https://github.com/bohu8264/NuPhyLab-next/releases)

[文档目录](docs/README.md) · [第三方声明](THIRD_PARTY_NOTICES.md) · [问题反馈](https://github.com/bohu8264/NuPhyLab-next/issues)
