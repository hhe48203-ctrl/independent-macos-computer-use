# 仓库开发指南

[English version](../../AGENTS.md)

## 环境与验证

- 使用 Node.js 22 或以上版本，运行 `npm ci --ignore-scripts` 安装依赖。
- 运行 `npm run check` 执行通用 JS 测试和文档检查。此命令无需原生 helper 或桌面权限。将新增的 macOS 专用测试文件登记到 `scripts/check.mjs`。
- 修改 Swift 或原生桥接时运行 `npm run check:native`。它在装有 Xcode 命令行工具的 macOS 上构建到 `.build`，再跑完整的 Node 回归测试。若当前 helper 正由 MCP 客户端使用，请在独立检出中运行。
- 用 `npm run doctor` 查看已构建 helper 的状态和 macOS 权限。验证桌面行为时，从 [README](README.md#开发验证与许可证) 选择相关的 `npm run test:*` 命令，在已解锁、已授权的桌面上使用自建测试窗口并串行执行。Benchmark 和真人试验需预留桌面。
- 报告已执行的检查和未覆盖的范围。离屏测试、真实桌面测试和真人并发验收各自覆盖不同的行为。发布时按[验证记录](VALIDATION.md)验收实际归档。

## 代码导航与约束

- `src/server.mjs` 通过 MCP stdio 提供 `js` 和 `js_reset`。stdout 只承载协议流量。
- `src/repl.mjs` 和 `src/repl-worker.mjs` 管理执行与会话生命周期。`src/bridge.mjs` 管理 Swift helper。取消、超时和 reset 必须终止待处理的原生操作。修改操作中断后，先重新观察目标再重试。
- `src/cua.mjs` 实现应用和窗口绑定及坐标处理。`src/tools.mjs` 校验原生请求。拒绝有歧义的目标、过期的快照和失效的坐标，并保持行为与 [JS API](JS_API.md) 一致。
- `native/` 负责 macOS Accessibility、截图、输入和光标覆盖层。保留默认后台路由，显式启用前台操作，并通过 macOS 正常授予权限。见[架构](../ARCHITECTURE.md)。

双语文档改动时同步中文页。本地产物和研究材料留在工作区。新项目先初始化 Git 仓库，开发时按功能提交。版本通过验收后再创建发行标签。
