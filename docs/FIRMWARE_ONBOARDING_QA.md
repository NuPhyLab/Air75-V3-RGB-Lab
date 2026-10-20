# Automatic connection and firmware checks — 2026-09-11 / 自动连接与固件检查

[Documentation / 文档目录](README.md)

Automatic USB detection uses the ANSI model identity rather than a user serial number. Official release information is fetched separately from lighting, with bounded requests and a six-hour successful cache. Opening the official updater restores/releases USB and pauses auto-connect; NuPhyLab does not flash firmware. This dated run records 119 service tests, 566 native checks and isolated onboarding UI checks; its 1.0.16.6 latest-version result is historical.

按型号自动识别、独立查询官方版本并缓存；进入官方更新前恢复并释放 USB，软件不自行刷固件。119 项服务与 566 项原生检查及当日版本结果仅对应本记录日期。

<details>
<summary>Original dated record (Chinese) / 中文原始记录</summary>

# 自动连接与固件检查 · 2026-09-11

## 官方依据

NuPhy 的[固件入口](https://nuphy.com/pages/firmware)把 Air75 V3 指向 [NuPhyIO](https://drive.nuphy.io/)。检查官方网页当前部署的客户端代码与只读 API，未下载或刷写固件。

- [型号目录](https://drive.nuphy.io/prod-api/api/nuphyIo/keyBoardList)：Air75 V3 ANSI 的应用接口 VID/PID 是 `19f5:1028`，businessId 为 `1930212869851615233`。ISO/JIS 分别是不同 PID 和 businessId，不能混用。
- [正式版本接口](https://drive.nuphy.io/prod-api/api/nuphyIo/getLastFirmwareVersionsByType?businessId=1930212869851615233&type=1)：本次实际查询返回正式版 **1.0.16.6**，首次发布时间 `2026-07-21 18:01:04`。程序在线查询此入口，没有把该值硬编码成永久最新版本。
- 官方客户端 `https://drive.nuphy.io/static/js/main.23dc78ef.js`，SHA-256 `8b8fe5fdb1c13092bd3f38476688e4435b2ffdfcca552ba4b36d5fe149f27fba`。S4 模块的 `parseFirmwareVersion` 采用字节 2、1、0 和 4–5 的小端整数。原来只识别一个签名的显示逻辑已替换成该读取规则；灯效写入的已验证签名保护仍保留。

## 行为

新用户数据默认自动连接，启动即检查、未连接时约每 2 秒重试；按型号与 USB 接口识别，没有指定用户序列号。缺少设备显示等待，主动断开或进入官方更新后暂停自动重连。多把目标设备同时连接时提示仅保留一把。

固件查询与灯光输出分开，手动检查也不占用灯效队列。只接受对应 ANSI 型号、正式类型、生产环境和启用状态的数据；数字分段比较版本。成功缓存 6 小时，失败 5 分钟后可自动重试，也可手动检查。超时 8 秒，响应限 128 KiB，不携带账户信息，不跟随重定向、不下载固件。

旧版本在所有页面提示更新，设备页显示当前／官方版本。当前版本高于官方正式版时独立标识，不建议降级。网络失败不会标成“最新”，有缓存时明确为上次查询。当前版本兼容时离线仍可使用灯效；未验证版本保留绘制和保存，停止灯效写入并引导检查固件。

「前往官方更新」先停止与恢复、释放 USB 并暂停重连，再打开固定的 NuPhyIO 地址。Mac 优先选已安装的 Chrome 或 Edge，其他情况交给默认浏览器。更新由用户在官方工具完成；返回后点连接会重新读版本、重新判断提醒。

## 验证

- `npm run build`：原生与 TypeScript/生产构建通过。
- `bin/HIDBridge --self-test`：566 项通过，包含旧版、零主版本、16 位末段、错误标记与短报文，以及之前的 LED 数量回归。
- `node --test --test-concurrency=4 tests/*.test.mjs`：119/119 通过。限定并发用于避免多组隔离子进程同时启动与编译抢占导致 5 秒测试请求超时；没有扩大产品超时或跳过测试。
- 新用户空白目录：等待、插入后自动连接、断开与重新插入后自动重连；首次连接不擅自点灯。
- 模拟旧版 1.0.14.6：准确显示更新提醒、禁止未验证灯光写入；改为 1.0.16.6 并重新连接后提醒消失。
- 更新交接：恢复后断开，超过一个自动重连周期仍保持断开；手动连接恢复。慢网络检查期间灯效命令仍能执行。
- CUA 界面实操：等待提示、旧固件信息、创作台提醒、「查看更新」导航、未兼容固件的播放按钮禁用、官方更新页面实际打开（NuPhyIO）、返回后暂停提示和更新后提醒清除均通过。页面无横向溢出。
- 真实官方请求返回 1.0.16.6，检查模块正确输出 `current`。

验证使用一把本机 Air75 V3 和隔离服务模拟不同连接／版本状态；没有第二把实体设备、其他用户 Mac 或固件降级/升级的实际刷写测试。当前交付目标仍为 Apple Silicon Mac、macOS 13+、Air75 V3 ANSI。

</details>
