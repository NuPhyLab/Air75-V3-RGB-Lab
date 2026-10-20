# Workspace child navigation — 2026-09-11 / 创作台子导航

[Documentation / 文档目录](README.md)

Moved Paint, Animation, Key Trigger and Games under the left Workspace entry. App-owned mode state keeps the selected child, canvas and saved-scene navigation consistent; leaving games pauses them. Production build and isolated browser/service checks covered default and narrow windows with no horizontal overflow. No lighting protocol or hardware-write behavior changed.

绘制、动画、触发、游戏移至左侧创作台层级；统一状态保留草稿，离开游戏暂停。构建及隔离界面检查通过，未改灯光协议。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 创作台左侧子导航 · 2026-09-11

「绘制、动画、按键触发、游戏」统一移入左侧「创作台」下方，使用缩进、细引导线和浅灰绿选中态区分层级。移除内容区顶部标签排，页面标题显示当前功能。作品库、Codex、设备仍为一级页面。

子菜单始终可见，可从其他页面直接打开；点击创作台回到上次选择的子页面。载入作品时按作品配置进入绘制、动画或按键触发。模式由 App 统一管理，画布和左侧选中项使用同一份状态，切换子页面保留当前草稿。

## 验证

- TypeScript / Vite 生产构建通过。
- 通过 CUA 操作真实前端及 Node 服务，使用隔离的模拟 HID 和 Codex 适配器。
- 四个子菜单显示对应功能，只有一个导航项处于当前选中状态，顶部不存在 tablist。
- 离开运行中的打地鼠后自动暂停，返回游戏保持暂停；结束游戏正常。
- 按键触发 → 作品库 → 创作台返回按键触发；从作品库载入「流动的光」进入动画，载入「一颗小心意」进入绘制。
- 刷新动画作品后正确恢复到动画页。
- 1100×700、720×520 窗口的子导航均位于左侧，内容没有横向溢出。
- 390px 宽的浏览器保留左栏并将参数区上下排列，避免控件与标签挤压。
- 浏览器错误日志为空。

本轮为界面导航调整，没有新增灯效协议或硬件写入逻辑。运行中的旧应用保留，新版在独立交付目录构建。

</details>
