# Codex Micro 命令与键帽清单

核查日期：2026-09-10 至 09-11；本机官方版本 26.903.71938。配合 [功能核查](CODEX_MICRO_AUDIT.md) 阅读。

本文件是独立整理的静态目录：134 个命令候选和 39 个键帽软件条目。筛选采用该版本 Micro 命令模块的规则（支持 Electron 的 webview 命令，以及有回退处理器的 Electron 命令）。没有执行这些命令，也没有调用应用的内部控制接口。

当前页面、模式、账号、项目与技能状态可能让候选命令不可用。没有默认绑定不等于不支持自定义绑定。表中 CmdOrCtrl 在 macOS 对应 Command，Alt 对应 Option；用户自定义键位和标签／侧栏数字键设置可覆盖表中默认值。`composer.submit` 等动作由应用按输入配置处理，不能简单等同于向前台发送 Return。

机器可读数据见 [目录 JSON](CODEX_MICRO_CATALOG.json)，原始来源与哈希见 [证据清单](CODEX_MICRO_EVIDENCE.json)。

## 2026-09-11 更新

下表保留首次静态审计的实现标记。此次新增终端、侧栏、浏览器标签、设置、文件夹、固定／未读／重命名／归档任务、前进／后退、快捷键帮助，共 12 个默认快捷入口；加原有 11 个共 23 个。可分配至六个命令键。它们的描述与投递链路通过隔离测试，因工具限制，未在真实 Codex 窗口逐项执行。完整边界见 [集成说明](CODEX_INTEGRATION.md)。

## 键帽默认动作

“软件条目”包含不同宽度、重复麦克风及空白占位，不等于包装数量。键帽图案不是功能承诺；用户可重新分配动作。

| 键帽 | 宽度 | 默认含义 | 当前 Air Studio |
|---|---|---|---|
| FAST | 单宽 | 切换 Fast 模式 | 未接入 |
| APPR | 单宽 | 批准当前请求 | 入口禁用；尚未接入真实请求上下文 |
| REJ | 单宽 | 拒绝当前请求 | 入口禁用；尚未接入真实请求上下文 |
| SPLIT | 单宽 | 分叉当前任务 | 未接入 |
| MIC | 双宽 | 按住说话 | 只有听写入口，未实现按压语义 |
| MIC1 | 单宽 | 按住说话 | 只有听写入口，未实现按压语义 |
| CODEX | 单宽 | 发送输入内容 | 未接入 |
| BUG | 单宽 | 反馈问题 | 未接入 |
| OAI | 单宽 | 打开 OpenAI 开发者文档 | 未接入 |
| TERM | 单宽 | 打开／收起终端 | 未接入 |
| DWN | 单宽 | 复制对话 Markdown | 未接入 |
| DEL | 单宽 | 归档任务 | 未接入 |
| NEW | 单宽 | 新建任务 | 已有快捷入口；受权限、用户键位和上下文限制 |
| NAV | 单宽 | 打开浏览器标签 | 未接入 |
| MAGIC | 单宽 | 固定／取消固定任务 | 未接入 |
| DIFF | 单宽 | 切换评审标签 | 未接入 |
| PLAY | 单宽 | 运行环境动作 1 | 未接入 |
| GIT | 单宽 | 提交 Git 改动 | 未接入 |
| BRCH | 单宽 | 创建草稿 PR | 未接入 |
| BRANCH | 单宽 | 创建分支 | 未接入 |
| MRG | 单宽 | 合并 PR | 未接入 |
| PR | 单宽 | 创建 PR | 未接入 |
| PAINT | 单宽 | 添加图片 | 未接入 |
| LAB | 单宽 | 打开设置 | 未接入 |
| PARTY | 单宽 | 打开侧任务 | 未接入 |
| TIME | 单宽 | 管理定时任务 | 未接入 |
| MIND+ | 单宽 | 提高推理强度 | 未接入 |
| MIND- | 单宽 | 降低推理强度 | 未接入 |
| EMPT1 | 单宽 | 空白自定义动作 | 未接入 |
| EMPT2 | 单宽 | 空白自定义动作 | 未接入 |
| EMPT3 | 单宽 | 空白自定义动作 | 未接入 |
| EMPT4 | 单宽 | 空白自定义动作 | 未接入 |
| SETUP | 单宽 | 打开设置 | 未接入 |
| FOLD | 单宽 | 打开文件夹 | 未接入 |
| UPL | 单宽 | 添加文件 | 未接入 |
| APPS | 单宽 | 打开技能／插件入口 | 未接入 |
| YOLO | 单宽 | 在输入框写入 :yolo: | 未接入 |
| YEET | 单宽 | 在输入框写入 :yeet: | 未接入 |
| EMPT5 | 双宽 | 空白自定义动作 | 未接入 |

## 全部命令候选

下表的“限制”保留程序声明的访问域或功能域；“上下文”表示仍须检查当前 UI／请求状态，并非保证可直接执行。所有未接入项均是当前 Air Studio 缺项，不表示 Air 硬件不支持。

### 任务

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `newTask` | 新建任务 | `CmdOrCtrl+N` / `CmdOrCtrl+Shift+O` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `newProjectlessTask` | 新建独立任务 | `CmdOrCtrl+Alt+O` | codexLocal / codex | 未接入 |
| `quickChat` | 快速聊天 | `CmdOrCtrl+Alt+N` | chatgpt | 未接入 |
| `temporaryChat` | 临时聊天 | `CmdOrCtrl+Shift+N` | chatgpt | 未接入 |
| `openThreadInNewWindow` | 在新窗口打开任务 | 未配置 | codex | 未接入 |
| `archiveThread` | 归档任务 | `CmdOrCtrl+Shift+A` | 上下文 | 未接入 |
| `markThreadUnread` | 标为未读 | `CmdOrCtrl+Shift+U` | 上下文 | 未接入 |
| `toggleThreadPin` | 固定／取消固定任务 | `CmdOrCtrl+Alt+P` | 上下文 | 未接入 |
| `openSideChat` | 打开侧任务 | `CmdOrCtrl+Alt+S` | codexLocal / codex | 未接入 |

### 其他上下文命令

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `copyConversationMarkdown` | 复制对话 Markdown | 未配置 | 上下文 | 未接入 |
| `toggleDebugModal` | 切换调试面板 | `Ctrl+D` | 上下文 | 未接入 |
| `forkThread` | 分叉当前任务 | 未配置 | 上下文 | 未接入 |
| `showKeyboardShortcuts` | 显示快捷键帮助 | `CmdOrCtrl+/` | 上下文 | 未接入 |
| `closeOtherTabs` | 关闭其他标签 | `CmdOrCtrl+Alt+W` | 上下文 | 未接入 |
| `toggleMaximizeSidePanel` | 切换侧面板最大化 | 未配置 | 上下文 | 未接入 |
| `navigateBrowserBack` | 浏览器后退 | `Command+Left` | 上下文 | 未接入 |
| `navigateBrowserForward` | 浏览器前进 | `Command+Right` | 上下文 | 未接入 |
| `thread1` | 切换到位置 1 的任务 | `CmdOrCtrl+1` | 上下文 | 未接入 |
| `thread2` | 切换到位置 2 的任务 | `CmdOrCtrl+2` | 上下文 | 未接入 |
| `thread3` | 切换到位置 3 的任务 | `CmdOrCtrl+3` | 上下文 | 未接入 |
| `thread4` | 切换到位置 4 的任务 | `CmdOrCtrl+4` | 上下文 | 未接入 |
| `thread5` | 切换到位置 5 的任务 | `CmdOrCtrl+5` | 上下文 | 未接入 |
| `thread6` | 切换到位置 6 的任务 | `CmdOrCtrl+6` | 上下文 | 未接入 |
| `thread7` | 切换到位置 7 的任务 | `CmdOrCtrl+7` | 上下文 | 未接入 |
| `thread8` | 切换到位置 8 的任务 | `CmdOrCtrl+8` | 上下文 | 未接入 |
| `thread9` | 切换到位置 9 的任务 | `CmdOrCtrl+9` | 上下文 | 未接入 |
| `hotkeyWindow` | 打开快捷任务窗口 | 未配置 | codexLocal | 未接入 |
| `renameThread` | 重命名任务 | `CmdOrCtrl+Alt+R` | 上下文 | 未接入 |
| `toggleFileTreePanel` | 显示／隐藏文件树 | `CmdOrCtrl+Shift+E` | codexLocal | 未接入 |

### 应用

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `openControlWindow` | 打开控制窗口 | 未配置 | 上下文 | 未接入 |
| `undoAppAction` | 撤销应用操作 | `CmdOrCtrl+Z` | 上下文 | 未接入 |
| `redoAppAction` | 重做应用操作 | `Command+Shift+Z` | 上下文 | 未接入 |
| `openAvatarOverlay` | 打开头像悬浮窗 | `Alt+Space` | codex | 未接入 |
| `settings` | 打开设置 | `CmdOrCtrl+,` | 上下文 | 未接入 |
| `clearAllUnreads` | 清除全部未读 | `Shift+Escape` | codex | 未接入 |
| `manageTasks` | 管理定时任务 | 未配置 | 上下文 | 未接入 |
| `logOut` | 退出账号 | 未配置 | 上下文 | 未接入 |
| `feedback` | 反馈问题 | 未配置 | 上下文 | 未接入 |

### 面板

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `reopenClosedTab` | 重新打开关闭的标签 | `CmdOrCtrl+Shift+T` | 上下文 | 未接入 |
| `toggleSidebar` | 显示／隐藏侧栏 | `CmdOrCtrl+B` | 上下文 | 未接入 |
| `toggleBottomPanel` | 显示／隐藏底部面板 | `CmdOrCtrl+J` | codexLocal / codex | 未接入 |
| `togglePinnedSummary` | 显示／隐藏固定摘要 | 未配置 | 上下文 | 未接入 |
| `toggleTerminal` | 打开／收起终端 | `Control+`` | codexLocal / codex | 未接入 |
| `openBrowserTab` | 打开浏览器标签 | `CmdOrCtrl+T` | codex | 未接入 |
| `showWorkspaceTabView` | 显示工作区标签视图 | `CmdOrCtrl+Shift+F` | codex | 未接入 |
| `stepWorkspaceLayout` | 切换工作区布局 | `CmdOrCtrl+Shift+B` | codex | 未接入 |
| `openReviewTab` | 打开评审标签 | `Ctrl+Shift+G` | codexLocal / codex | 未接入 |
| `toggleReviewTab` | 切换评审标签 | 未配置 | codexLocal | 未接入 |
| `toggleSidePanel` | 切换评审侧面板 | `CmdOrCtrl+Alt+B` | codex | 未接入 |

### 输入与语音

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `composer.openModelPicker` | 选择模型 | `Ctrl+Shift+M` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `composer.openProjectPicker` | 选择项目 | `CmdOrCtrl+Alt+Shift+O` | 上下文 | 未接入 |
| `composer.startVoiceMode` | 启动语音聊天 | `Ctrl+Shift+V` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `realtimeVoice.toggleMicrophoneMute` | 切换麦克风静音 | 未配置 | 上下文 | 未接入 |
| `realtimeVoice.toggleOutputMute` | 切换语音输出静音 | 未配置 | 上下文 | 未接入 |
| `realtimeVoice.endCall` | 结束语音聊天 | 未配置 | 上下文 | 未接入 |
| `composer.startDictation` | 开始听写 | `Ctrl+Shift+D` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `composer.submitInBackground` | 后台发送 | `CmdOrCtrl+Enter` | 上下文 | 未接入 |
| `composer.submit` | 发送输入内容 | 未配置 | 上下文 | 未接入 |
| `composer.steer` | 发送引导消息 | 未配置 | 上下文 | 未接入 |
| `composer.queue` | 加入消息队列 | 未配置 | 上下文 | 未接入 |
| `composer.clear` | 清空输入 | 未配置 | 上下文 | 未接入 |
| `composer.addPhotos` | 添加图片 | 未配置 | 上下文 | 未接入 |
| `composer.captureAppshot` | 获取 Appshot | 未配置 | 上下文 | 未接入 |
| `composer.addFiles` | 添加文件 | 未配置 | 上下文 | 未接入 |
| `composer.toggleFastMode` | 切换 Fast 模式 | 未配置 | 上下文 | 未接入 |
| `composer.increaseReasoningEffort` | 提高推理强度 | 未配置 | 上下文 | 未接入 |
| `composer.decreaseReasoningEffort` | 降低推理强度 | 未配置 | 上下文 | 未接入 |
| `composer.cycleReasoningEffort` | 循环推理强度 | 未配置 | 上下文 | 未接入 |
| `composer.togglePlanMode` | 切换计划模式 | 未配置 | 上下文 | 未接入 |
| `composer.toggleWorktreeMode` | 切换工作树模式 | 未配置 | 上下文 | 未接入 |
| `composer.toggleWorkRunLocation` | 切换 Work 运行位置 | 未配置 | 上下文 | 未接入 |

### 批准与拒绝

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `approval.approve` | 批准当前请求 | `Enter` | 上下文 | 入口禁用；尚未接入真实请求上下文 |
| `approval.decline` | 拒绝当前请求 | `Escape` | 上下文 | 入口禁用；尚未接入真实请求上下文 |

### Git 与 PR

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `git.commit` | 提交 Git 改动 | 未配置 | codexLocal / codex | 未接入 |
| `git.createPullRequest` | 创建 PR | 未配置 | codexLocal / codex | 未接入 |
| `git.createDraftPullRequest` | 创建草稿 PR | 未配置 | codex | 未接入 |
| `git.createBranch` | 创建分支 | 未配置 | codex | 未接入 |
| `git.mergePullRequest` | 合并 PR | 未配置 | codex | 未接入 |
| `git.openPullRequest` | 打开 PR | 未配置 | codexLocal / codex | 未接入 |
| `git.toggleBlame` | 显示／隐藏 Git blame | 未配置 | codex | 未接入 |

### 导航

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `searchChats` | 搜索任务 | 未配置 | 上下文 | 未接入 |
| `togglePriorityFilter` | 切换优先筛选 | `CmdOrCtrl+Alt+U` | 上下文 | 未接入 |
| `focusMainChat` | 聚焦主任务 | 未配置 | codexLocal / codex | 未接入 |
| `focusSideChat` | 聚焦侧任务 | 未配置 | codexLocal / codex | 未接入 |
| `nextThreadNeedingAttention` | 跳到需要处理的任务 | `CmdOrCtrl+Alt+A` | codex | 已有快捷入口；受权限、用户键位和上下文限制 |
| `previousTab` | 上一个标签 | `Ctrl+Shift+Tab` / `Command+Shift+[` / `Command+Alt+Left` | 上下文 | 未接入 |
| `previousThread` | 上一个任务 | `Command+Shift+[` / `Command+Alt+Left` | 上下文 | 未接入 |
| `previousRecentThread` | 上一个最近任务 | `Ctrl+Shift+Tab` | 上下文 | 未接入 |
| `nextTab` | 下一个标签 | `Ctrl+Tab` / `Command+Shift+]` / `Command+Alt+Right` | 上下文 | 未接入 |
| `nextThread` | 下一个任务 | `Command+Shift+]` / `Command+Alt+Right` | 上下文 | 未接入 |
| `nextRecentThread` | 下一个最近任务 | `Ctrl+Tab` | 上下文 | 未接入 |
| `recentThread1` | 切换到最近任务 1 | `CmdOrCtrl+Alt+1` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `recentThread2` | 切换到最近任务 2 | `CmdOrCtrl+Alt+2` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `recentThread3` | 切换到最近任务 3 | `CmdOrCtrl+Alt+3` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `recentThread4` | 切换到最近任务 4 | `CmdOrCtrl+Alt+4` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `recentThread5` | 切换到最近任务 5 | `CmdOrCtrl+Alt+5` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `recentThread6` | 切换到最近任务 6 | `CmdOrCtrl+Alt+6` | 上下文 | 已有快捷入口；受权限、用户键位和上下文限制 |
| `focusTab1` | 聚焦标签 1 | `Ctrl+1` | 上下文 | 未接入 |
| `focusTab2` | 聚焦标签 2 | `Ctrl+2` | 上下文 | 未接入 |
| `focusTab3` | 聚焦标签 3 | `Ctrl+3` | 上下文 | 未接入 |
| `focusTab4` | 聚焦标签 4 | `Ctrl+4` | 上下文 | 未接入 |
| `focusTab5` | 聚焦标签 5 | `Ctrl+5` | 上下文 | 未接入 |
| `focusTab6` | 聚焦标签 6 | `Ctrl+6` | 上下文 | 未接入 |
| `focusTab7` | 聚焦标签 7 | `Ctrl+7` | 上下文 | 未接入 |
| `focusTab8` | 聚焦标签 8 | `Ctrl+8` | 上下文 | 未接入 |
| `focusTab9` | 聚焦标签 9 | `Ctrl+9` | 上下文 | 未接入 |
| `switchToMode1` | 切换 Chat 模式 | `Ctrl+1` | 上下文 | 未接入 |
| `switchToMode2` | 切换 Work 模式 | `Ctrl+2` | 上下文 | 未接入 |
| `switchToMode3` | 切换 Codex 模式 | `Ctrl+3` | 上下文 | 未接入 |
| `file.goToDefinition` | 跳转定义 | `Ctrl+]` | 上下文 | 未接入 |
| `file.navigateBack` | 文件导航后退 | `Control+-` | 上下文 | 未接入 |
| `file.navigateForward` | 文件导航前进 | `Control+Shift+-` | 上下文 | 未接入 |
| `findInThread` | 在任务中查找 | `Command+F` | 上下文 | 未接入 |
| `goToLine` | 跳转到行 | `CmdOrCtrl+L` | 上下文 | 未接入 |
| `focusBrowserAddressBar` | 聚焦浏览器地址栏 | `CmdOrCtrl+L` | codex | 未接入 |
| `navigateBack` | 应用历史后退 | `CmdOrCtrl+[` / `MouseBack` | 上下文 | 未接入 |
| `navigateForward` | 应用历史前进 | `CmdOrCtrl+]` / `MouseForward` | 上下文 | 未接入 |

### 设置

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `codexMicroSettings` | 打开 Micro 设置 | 未配置 | 上下文 | 未接入 |
| `mcpSettings` | 打开 MCP 设置 | 未配置 | 上下文 | 未接入 |
| `personalitySettings` | 打开个性化设置 | 未配置 | 上下文 | 未接入 |
| `importExternalAgent` | 导入其他 AI 应用内容 | 未配置 | codexLocal / codex | 未接入 |
| `keyboardShortcuts` | 配置键盘快捷键 | 未配置 | 上下文 | 未接入 |

### 技能

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `forceReloadSkills` | 重新加载技能 | 未配置 | codexLocal / codex | 未接入 |
| `openSkills` | 打开技能／插件入口 | 未配置 | codexLocal / codex | 未接入 |

### 工作区

| 命令 | 含义 | macOS 包内默认键位 | 限制 | Air Studio |
|---|---|---|---|---|
| `openFolder` | 打开文件夹 | `CmdOrCtrl+O` | codexOrWorkLocal / codex | 未接入 |
| `environmentAction1` | 运行环境动作 1 | `Command+Shift+D` | 上下文 | 未接入 |
| `environmentAction2` | 运行环境动作 2 | 未配置 | 上下文 | 未接入 |
| `environmentAction3` | 运行环境动作 3 | 未配置 | 上下文 | 未接入 |
| `environmentAction4` | 运行环境动作 4 | 未配置 | 上下文 | 未接入 |
| `environmentAction5` | 运行环境动作 5 | 未配置 | 上下文 | 未接入 |
| `environmentAction6` | 运行环境动作 6 | 未配置 | 上下文 | 未接入 |
| `environmentAction7` | 运行环境动作 7 | 未配置 | 上下文 | 未接入 |
| `environmentAction8` | 运行环境动作 8 | 未配置 | 上下文 | 未接入 |
| `environmentAction9` | 运行环境动作 9 | 未配置 | 上下文 | 未接入 |

已启用技能是另一类动态选项，不计入这 134 个固定命令候选；不同用户的技能清单不同。外部程序不能只凭这里的内部命令 ID 就认为存在同名公共 API。后续接入要分别验证命令绑定、目标应用、当前任务及实际结果。
