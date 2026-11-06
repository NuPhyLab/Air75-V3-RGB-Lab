# NuPhy Lab

[简体中文指南](README.zh-CN.md) · [English guide](README.en.md)

为 **NuPhy AIR65 / AIR75 / AIR100 V3、NODE75 / NODE100（LP / HP）和 Kick75（ANSI）** 提供灯光创作、键盘游戏、声音律动，以及 Codex / Claude Code 任务快捷键和状态灯。

A macOS lighting studio for **NuPhy AIR65 / AIR75 / AIR100 V3, NODE75 / NODE100 (LP / HP), and Kick75 (ANSI)**, with keyboard games, audio-reactive lighting, and Codex / Claude Code task shortcuts and status lights.

## 下载 / Download

### [直接下载最新版安装包 · Download the latest macOS installer](https://github.com/bohu8264/NuPhyLab-next/releases/latest/download/NuPhyLab-macOS-AppleSilicon.dmg)

**Apple Silicon · 键盘功能 macOS 13.5+ · 框选提问 macOS 14+**

**Apple Silicon · macOS 13.5+ for keyboard features · macOS 14+ for selection**

- [最新版本与更新说明 / Latest release and notes](https://github.com/bohu8264/NuPhyLab-next/releases/latest)
- [项目源码 / Source code](https://github.com/bohu8264/NuPhyLab-next/tree/main)
- [历史版本 / Previous releases](https://github.com/bohu8264/NuPhyLab-next/releases)

安装包使用 NuPhy 公司 Developer ID 签名并完成 Apple 公证。

The installer is signed with NuPhy's Developer ID and notarized by Apple.

## 安装与更新 / Install and update

1. 退出旧版 NuPhy Lab，打开 DMG，将 **NuPhy Lab** 拖入「应用程序」。保留本机应用数据，继续使用原有作品、草稿和设置。

   Quit the old NuPhy Lab app, open the DMG, and drag **NuPhy Lab** to Applications. Keep the app-data folder to retain your artwork, drafts and settings.

2. 用 USB 数据线连接键盘并切到有线模式。按软件提示授予输入监控和辅助功能权限；首次授权后，软件可能自动关闭并重新打开一次，使新权限生效。

   Connect the keyboard by USB and select wired mode. Follow the Input Monitoring and Accessibility prompts. The app may automatically close and reopen once to apply newly granted permissions.

3. 软件会自动检查更新，也可打开 **设置 → 关于与更新 → 检查更新**。旧 1.1.x 用户需先手动安装一次新版。

   The app checks for updates automatically. You can also use **Settings → About & updates → Check for Updates**. Users on 1.1.x need to install the current version once manually.

灯效需要 USB 连接；AIR75 V3 另支持蓝牙快捷控制。需要更新键盘固件时，请按软件指引前往 NuPhyIO。

Lighting requires USB. AIR75 V3 also supports Bluetooth shortcut control. Follow the app's NuPhyIO guidance if a firmware update is needed.

各型号固件与兼容范围 / Model-specific firmware and compatibility: [键盘兼容性 / Keyboard compatibility](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/KEYBOARD_COMPATIBILITY.md)。AIR65 V3 无实体 F 区，不提供 F1–F12 自动接管。/ AIR65 V3 has no physical function row and does not offer automatic F1–F12 takeover.

新增型号的实体检查目前仅覆盖 NODE75 LP，不代表该型号所有功能均已逐项验证；其余新增型号仍需实机验证。另一台 Mac 的首次安装授权、AI 命令的实际效果，以及触摸手势和媒体输入配合仍需分别验证。

Physical checks for newly added models currently cover NODE75 LP only, without establishing that every feature on that model has been verified. The other new models still require hardware validation. First-install permissions on another Mac, actual AI command effects, touch gestures and interaction with media inputs require separate checks.

## Codex 默认命令键 / Default Codex command keys

在 AI 助手中开启 Codex 模式后使用。/ Enable Codex mode in AI Assistant to use these defaults.

| 按键 / Key | 功能 | Action |
| --- | --- | --- |
| F7 | 普通 / 极速 | Standard / Fast |
| F8 | 批准一次 | Allow once |
| F9 | 拒绝 | Deny |
| F10 | 新聊天 | New chat |
| F11 | 按住听写，松开结束 | Hold to dictate, release to finish |
| F12 | 发送 | Send |

批准与拒绝需要当前存在审批请求；发送时需聚焦聊天输入框。

Approval commands require a current request. Sending requires the chat composer to be focused.

## 功能 / Features

- 逐键 RGB 绘图、动画与本地作品库。/ Per-key RGB painting, animation and a local artwork library.
- 按键触发、键盘游戏和声音律动。/ Key-triggered effects, keyboard games and audio-reactive lighting.
- Codex / Claude Code 任务快捷键和状态灯。/ Codex / Claude Code task shortcuts and status lights.
- USB 自动识别键盘型号，各型号的作品分别保存。/ Automatic USB model detection, with separate artwork for each keyboard model.
- 框选翻译、总结与提问，可选本机语音转写，并连接自己的模型服务。/ Selection translation, summaries and questions, with optional local speech transcription and your own model service.
- 中英文界面与 16 种可保存的翻译目标语言。/ Chinese and English interfaces, with 16 saved translation-language choices.

## 文档与源码 / Documentation and source

- [中文安装与使用指南](README.zh-CN.md) · [English installation and usage guide](README.en.md)
- [文档目录 / Documentation index](docs/README.md)
- [发布流程（中文）](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/RELEASING.md) · [Release workflow (English)](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/RELEASING.en.md)
- [第三方声明 / Third-party notices](THIRD_PARTY_NOTICES.md)
- [问题反馈 / Report an issue](https://github.com/bohu8264/NuPhyLab-next/issues)

## 框选提问 / Ask about a selection

打开 **实验室 → 框选提问**，在 **设置 → 模型与 API** 选择服务和模型并保存自己的 API Key，按提示完成授权。按住快捷键拖动框选，松开后获得翻译或总结，也可输入或口述问题。

Open **Labs → Ask about a selection**, choose a service and model in **Settings → Models & API**, and save your own API key. Complete the permission prompts, hold the shortcut, drag over a region and release for a translation or summary. You can also type or dictate a question.

“翻译为”支持中文、英语、日语、韩语等 16 种语言，选择会保存。界面语言与翻译目标独立设置。“发送图片”位于“按住说话”下方，仅在你开启且所选模型支持图片输入时使用；语音在本机转写。

**Translate to** offers 16 languages, including Chinese, English, Japanese and Korean, and remembers your choice independently of the interface language. The image switch sits below **Hold to speak** and requires a model that supports image input. Speech is transcribed locally.

选区文字与问题会发送到你配置的模型服务；图片仅在启用后按操作需要发送，API Key 保存在本机钥匙串中。

Selected text and questions are sent to your configured model service. Images are included only when enabled and needed for the selected action. API keys are stored in the local Keychain.

[设置与使用 / Setup and usage](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION.md) · [界面与翻译语言 / Interface and translation languages](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/SELECTION_LANGUAGES.md) · [1.2.41 更新说明 / What's new in 1.2.41](https://github.com/bohu8264/NuPhyLab-next/blob/main/docs/RELEASE_1.2.41.md)
