# Quit and recovery repair — 2026-09-16 / 退出与恢复修复

[Documentation / 文档目录](README.md)

Shutdown explicitly restores key mappings, then lighting, then waits for helper close and drained output. Failures in one cleanup step do not skip the others; actual diagnostics and exit status are retained. The intermittent original system refusal was not reliably reproduced. Three real signed-app quit paths completed cleanly with unchanged user data; tests cover delayed mapping readback, cleanup failures and final diagnostic output.

退出依次恢复按键、灯光并等待进程输出排空；某环节失败仍继续清理，保留真实诊断。原偶发拒绝未稳定复现，三条真实退出路径通过且用户数据未变。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 退出恢复修复 · 2026-09-16

现场日志记录退出状态 1 和笼统的“键盘恢复未确认成功”。灯光备份已清理，但临时按键映射备份仍存在；原生助手只把按键还原失败写入 stderr，而服务层把该输出丢弃，因此旧日志无法证明具体的系统拒绝原因。单独实机执行四轮适配／恢复、六轮适配／直接退出均正常，未把偶发问题描述成稳定复现。

修复包括：
- 系统键位映射已等于目标时不重复写入；写入后最多六次读取确认，中间间隔 50 ms，写入只执行一次。仍不匹配就保留恢复记录并报错。设备会话已经消失时，不将其记录套用到替代设备。
- 服务先明确还原按键，再还原灯光，最后请求助手退出。清理某一环节失败不再跳过后续清理。
- 等待子进程 close 及输出排空后核对结果。按键和灯光恢复错误分别传递；保留最后诊断及退出码，助手 stderr 进入滚动 worker.log。
- 退出时页面停止轮询并显示退出状态，不把主动关闭本地服务显示为 Load failed。异常弹窗区分灯光、功能键和其他退出检查，只有真实异常才显示。

自动验证覆盖映射无需重复写入、延迟回读成功、不匹配仍拒绝；退出前排空帧队列、按键失败后继续恢复灯光、最后一条错误输出、异常退出码与诊断内容。未通过删除备份或隐藏失败弹窗来绕过恢复校验。

正式签名应用在本机通过三次退出检查：动画播放中按 ⌘Q、重新打开后立即按 ⌘Q、动画播放中从菜单点击「退出 NuPhyLab」。三次 worker 均 status=0 / signaled=false；没有遗留应用子进程、灯光或按键恢复备份。系统按键映射恢复为空，7 个用户作品及设置逐项保持不变。回归测试 19 项通过，原生自检 615 项通过，界面生产构建通过。偶发系统拒绝的原始原因仍不能仅凭旧日志精确还原；新增诊断保留后续异常的实际原因。

</details>
