# Key-triggered patterns / 按键触发图案

[Documentation / 文档目录](README.md)

The default 19-key heart stays off while armed, flashes three times when Space is pressed, then returns to waiting. Rebind a supported key and adjust 1–20 repeats and 0.2–2 second full cycles; per-key colors persist. Input Monitoring enables a read-only global listener, otherwise foreground fallback is explicit. Mode changes and errors release capture and restore lighting. The historical run distinguishes simulated input, listener creation and untested physical-to-LED behavior.

默认空格触发 19 键爱心三次，等待熄灯；可改键、次数和周期，保留逐键颜色。全局监听缺权限时明确降级前台，状态交接和退出执行清理，验证边界见原记录。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 按键触发灯效 · 2026-09-11

默认爱心采用用户最新截图的右侧 19 键图案：8、9、−、=；U、I、O、P、[、]；J、K、L、;、'；逗号、句号、斜杠；右 Command。Del 键帽标签保持不变。既有作品和草稿不会被新预设覆盖。

## 行为

创作台 → 按键触发。默认空格触发三次，每次完整亮灭周期 0.6 秒。点击「更改」后直接按键录入，支持 74 个普通物理键，次数 1–20，周期 0.2–2 秒。Fn、修饰键和旋钮不作为触发键；功能键需要系统实际产生 F1–F12 键盘事件。录入交互的更新验证见 [按键录入验收记录](TRIGGER_KEY_RECORDER_QA.md)。

触发使用当前绘制的图案，保留每键配色。连续色盘可统一改变图案中已亮按键的颜色；每键不同颜色在绘制页编辑。启用后等待时主灯和侧灯熄灭，触发后以当前图案亮灭，完成后回到熄灭并继续等待。重复按下不会重启或排队，长按自动重复被过滤。启用中的修改需要点击「应用设置」。保存、重开、导入导出都保留配置和颜色。

全局监听使用独立的只读事件监听点，仅上报当前选定的无修饰按键，不记录其他键、文本或窗口信息，不截断原键输入。无输入监控权限时，页面明确提示降级为当前窗口监听；点击画布后按键，表单、按钮、色盘、弹窗中的键盘操作不会触发。全局和窗口监听互斥，防止重复。

切换到播放、静态预览或游戏会释放触发监听。关闭触发恢复键盘接管前的灯效。断线或输出错误停止触发，重新连接后需明确启用。应用退出时关闭监听并执行原有灯效恢复流程。

## 自动化验证

- `npm test`：96/96 通过，包含 13 项新增触发引擎、保存和真实 HTTP 服务测试。
- 默认19键图案、83号未映射灯熄灭、任意单键配色、配置范围和非法输入不修改运行中会话。
- 默认三次亮灭逐帧验证：图案／黑／图案／黑／图案／黑，结束继续等待，再按可再次触发。
- 原生事件模拟、错误按键忽略、监听权限拒绝降级、两种监听互斥、闪烁中重复按下不叠加。
- 与四种游戏、静态预览、动画及 Codex 指示灯的控制权切换；侧灯保持熄灭。
- 断线及写入回滚后取消触发，重新启用恢复正常。
- `npm run build:native` 通过；`bin/HIDBridge --self-test` 32 项通过。
- Swift 与共享配置的74键允许列表一致。

## 界面与系统验证

以真实 Node 服务配合隔离的 HID/Codex 测试适配器进行 CUA 浏览器操作；不改动用户的作品库、账户或运行中的应用。

已验证空格触发默认三次，结束画布全黑；改成 A 键、5 次、0.2 秒及蓝色后正确触发；文本输入和 Shift+A 不触发窗口模式；保存成功。刷新后仍进入按键触发页，A键、5次、0.2秒及配色全部保留；关闭后恢复显示19键图案。1100×700窗口主要控件完整显示，720×520窗口改为下置设置且无横向溢出；浏览器错误日志为空。

真实 macOS 权限读取显示 Input Monitoring、Accessibility 均已授权；实际创建、关闭全局监听均成功。CUA 向隔离 Chrome 输入框发送空格后文字正常增加，但该自动化输入没有产生全局 tap 回调，因此不能据此声称真实物理按键的系统链路通过。代码过滤逻辑与服务接收事件链路分别验证。

本轮没有重启运行中的旧应用，没有进行实体键盘 LED 输出或物理按键到 LED 的整链路复测。软件测试、模拟设备界面测试、系统权限与监听建立测试，不能替代肉眼观察真实灯光。

</details>
