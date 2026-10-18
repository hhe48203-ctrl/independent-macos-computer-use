# Independent macOS Computer Use MCP

一个真正运行在本机的 Computer Use MCP Server。Node.js 提供标准 MCP stdio，独立编写的 Swift helper 使用 Accessibility、ScreenCaptureKit、Vision 及窗口定向事件完成桌面感知和操作。v0.3 默认后台模式；鼠标路由另依赖动态解析的未公开系统入口 `CGEventSetWindowLocation`，不可视为纯公共 API 实现。**运行时不需要 Codex、ChatGPT、`@oai/sky`、原版 socket 或 OpenAI API key。**

项目源于对本机 Codex/ChatGPT Computer Use 的调查，使用了 [morluto/rea](https://github.com/morluto/rea) 的静态 JavaScript 和 Mach-O 分析能力。交付物不包含原版应用代码或二进制，也不修改原应用或 macOS 权限数据库。

## 安装与启动

需要 macOS 14.4+、Node.js 22+、Xcode Command Line Tools（含 Swift 编译器）。本机验证环境：macOS 26.6.2、Apple Silicon、Node 24.15.0。Intel 和其他 macOS 版本尚未实机验证。

```sh
cd /Users/aa/Desktop/computer_use_mcp
npm ci --ignore-scripts
npm run build
npm run doctor
```

`build` 生成并 ad-hoc 签名 `.build/Local Computer Use.app`。helper 通过管道运行，不监听网络端口。签名用于本地应用身份，不代表 Apple 公证或可跨机器沿用的权限。

```sh
node /Users/aa/Desktop/computer_use_mcp/src/server.mjs
```

此命令是 MCP stdio 服务。启动后等待客户端 JSON-RPC 输入是正常现象；不要把它当作交互式终端程序。stdout 只输出协议，诊断写 stderr。

## macOS 权限

先运行 `npm run doctor`，检查 `permissions.accessibility` 和 `permissions.screenRecording`。缺少时，在 **系统设置 → 隐私与安全性 → 辅助功能 / 屏幕与系统音频录制** 中允许实际运行服务的终端、Agent 或 Local Computer Use helper，并重启客户端。也可在用户明确进行权限设置时调用 `cu_request_permissions`，触发正常系统流程。

TCC 取决于启动链和 responsible application，不能从一次测试推断所有客户端都已获得权限。本机在 Codex 启动上下文中已验证两个权限为 true；换成独立终端、Claude Desktop 或其他 Agent，仍应重新运行 doctor。没有实现锁屏、登录窗口、权限继承伪装或 TCC 绕过。

## 接入 pi

本机 pi 1.2.0 已有原生 MCP 支持，无需另写模型工具适配器：

```sh
node scripts/setup-pi.mjs --background-events  # 当前已验证的 macOS 26.6.2 arm64
pi --approve --extension builtin:mcp
```

不启用局部焦点实验路径时，省略 `--background-events`。setup 仅写本项目 `.pi/mcp.json`，保存当前 Node 的绝对路径；不会修改全局 pi 设置或凭证。`--approve` 对本项目代码授予 pi 的正常项目信任；不授予 macOS TCC。`--extension builtin:mcp` 显式加载 pi 内建 MCP，避免 `--no-extensions` 或用户配置关闭它。不要同时加载替代 `/mcp` 的扩展。

示例任务：

> 使用 macos_computer_use，先检查权限，再查看 Calculator 的窗口，通过界面计算 7 × 8，读取结果并验证。

隔离的、只操作自建测试窗口的完整 pi 验收：

```sh
npm run test:pi
```

此测试使用 pi 当前配置的模型和正常认证流程，不读取或复制凭证；会消耗一次短 Agent 任务的模型用量。结果写入 `artifacts/pi-test-report.json`。已实际验证 pi 调用了 MCP 的 status/windows/snapshot/AX/type 工具，并在真实窗口中写入中文、点击按钮、重新读取结果。

## 接入其他 MCP 客户端

使用标准 MCP stdio 配置；将路径替换为实际安装路径，Node 在 GUI 客户端 PATH 中不可用时应填写 Node 的绝对路径：

```json
{
  "mcpServers": {
    "macos-computer-use": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/computer_use_mcp/src/server.mjs"],
      "env": {"CU_ALLOWED_BUNDLE_IDS": "com.apple.calculator,com.apple.TextEdit"}
    }
  }
}
```

Codex CLI 可用 `codex mcp add macos-computer-use -- /absolute/path/to/node /absolute/path/to/computer_use_mcp/src/server.mjs` 注册。可移植插件定义在根目录 `plugin.json`、`mcp.json` 和 `skills/computer-use/SKILL.md`。客户端应先执行依赖安装和构建，再启动配置中的实际入口。

程序化客户端示例见 [examples/mcp-client.mjs](examples/mcp-client.mjs)。服务使用官方 MCP TypeScript SDK v1.32.1，已验证 `initialize`、`tools/list`、`tools/call`、结构化结果、PNG image content 和取消；没有实现 HTTP、远程认证或 MCP Apps UI。

## 工具与使用流程

| 工具 | 功能 |
| --- | --- |
| `cu_status` | TCC 权限、显示器、坐标、运行后端和应用策略 |
| `cu_request_permissions` | 用户设置权限时触发系统提示 |
| `cu_apps` / `cu_windows` | 运行中 GUI 应用、窗口身份和几何信息 |
| `cu_launch` / `cu_focus` | 按 bundle ID 启动应用；聚焦指定窗口 |
| `cu_snapshot` | AX 树、元素 ID、值、焦点、操作、可选菜单栏与 PNG |
| `cu_screenshot` | 独立窗口截图，或指定显示器截图 |
| `cu_ocr` | 本地 Vision 文字识别和文字矩形 |
| `cu_click` | 按 AX 元素或窗口内坐标单/双/三击 |
| `cu_type_text` / `cu_key` | Unicode 输入、快捷键、导航键 |
| `cu_scroll` / `cu_drag` | 滚动和鼠标拖动 |
| `cu_ax_action` | press/focus/setValue/showMenu/increment/decrement/confirm |
| `cu_select_text` | 精确选择文字或放置光标，支持上下文消歧 |
| `cu_clipboard` | 显式启用后读取/写入全局文本剪贴板 |

先 status → apps/windows → snapshot，再执行动作，然后重新 snapshot 验证。窗口以 `pid + windowId` 共同定位。元素操作需要本次返回的 `snapshotId + elementId`，不能使用原版 CUA 的数字索引。每个 snapshot 保留 120 秒，最多保留 16 个；超时、取消、helper 重启会使旧引用失效。

`cu_snapshot` 默认最多 500 个节点、深度 16、约 5 秒遍历预算；可调至 2000 节点和深度 30。`truncated: true` 表示覆盖不完整。AX 不支持的属性被省略；缺少某属性不代表其值为空。截图失败单独报告 `screenshotError`，不丢弃已取得的 AX 树。无法暴露 AX 内容的应用可通过 screenshot/OCR 感知；后台输入验证目标进程、窗口及元素归属，不对全局遮挡表面做命中测试。

`includeMenuBar: true` 添加 `scope: "menu"` 的应用菜单节点，排除全局 Apple 菜单及其最近项目。菜单节点应使用 AX 语义操作；菜单坐标可能在窗口外，不可直接用于窗口坐标点击。


后台模式示例（先从 snapshot 找到真正的文本元素）：

```js
await client.callTool({ name: 'cu_type_text', arguments: {
  pid, windowId, snapshotId: snapshot.snapshotId, elementId: textElement.id,
  text: '后台输入 中文 🧪'
}}); // 默认 background；结果 verified:true 才表示文本读回一致
await client.callTool({ name: 'cu_click', arguments: {
  snapshotId: snapshot.snapshotId, elementId: button.id
}}); // 之后重新 snapshot 验证应用结果
```

具体通过的应用/操作和限制见 [后台验证说明](docs/BACKGROUND.md)。首次交付 v0.1 的物理输入只有前台模式，不能称为后台自动化；v0.2 才引入本节描述的路径。

## 坐标

所有鼠标工具采用**窗口左上角为原点的逻辑点**。AX 和 OCR 的矩形也使用逻辑点。截图是 PNG 像素，返回 `width/height`、`scaleX/scaleY` 和窗口全局 `frame`。

例如截图中的按钮中心为 `(800, 400)` 像素，而 `scaleX=scaleY=2`，传给 `cu_click` 的坐标是 `(400, 200)`。不需要加窗口全局位置；helper 会换算。多显示器允许负的全局窗口位置，窗口内输入坐标仍从 `(0,0)` 开始。

截图 `maxDimension` 控制输出上限（默认 1600，320–4096）；默认不包含鼠标。用 `screenshot:false` 可减少文本模型的开销。OCR 不上传图像，直接在本机运行 Apple Vision。

## 运行范围与失败处理

`CU_ALLOWED_BUNDLE_IDS` 可限制可见应用和操作目标；逗号分隔，空字符串表示全部拒绝。未设置则允许当前用户权限范围内的 GUI 应用。设置应用白名单时，全屏截图和全局剪贴板关闭，防止超出应用范围。它是便利的执行范围控制，不是对拥有本机 shell 权限的调用者的沙箱。

动作默认 `mode:"background"`，可对当前桌面上完全被遮挡的窗口操作，不调用应用激活、AXRaise、全局鼠标移动或全局 HID 键入。窗口截图可独立于遮挡表面捕获；后台中文输入走可读回验证的 AXSelectedText/AXValue 插入，最好传入精确的 snapshotId+elementId。它是文本编辑操作，不是 IME 组合输入模拟。

后台单击默认 `strategy:"auto"`：支持 AXPress 的按钮用语义按下，坐标也只在目标窗口自己的 AX 树中解析；其余控件使用窗口定向事件。可用 `strategy:"ax"` 要求纯 AX，或 `strategy:"event"` 强制真实进程定向鼠标事件。后者采用 `CGEvent.postToPid`、窗口编号字段及未公开的 `CGEventSetWindowLocation`，默认不伪造应用激活状态；显式局部焦点实验路径另见后文。

实验发现，单独发送 AppKit 内部激活通知虽不改变前台 PID，却可能使前台应用丢字；该路径已从交付代码中移除。部分 AppKit 窗口在编辑之后仍会对原始鼠标事件改变窗口堆叠，检测到时返回 BACKGROUND_WINDOW_REORDERED；优先使用 AX 单击。该 SPI 或应用接收行为可能随系统更新变化，不适用 Mac App Store 公共 API 限制环境。

`cu_key("CMD+A")` 默认对支持 AX 选择的文本走可验证的 AX 全选；`strategy:"event"` 明确要求真实按键，包括 CMD+A，不退回语义操作。其余键是进程定向事件，部分应用会忽略，返回 `verificationRequired:true` 只代表已投递。请优先用 select_text/type_text。后台模式不支持全局菜单。应用自身也可能抢焦点或改变窗口堆叠；检测到时报告错误，不通过抢回焦点来掩盖。窗口移动、用户同时切换或调整窗口也可能触发保守拒绝。

当前开发树的 `cu_type_text strategy:"event"` 使用真实 Unicode 键盘包，并逐包精确校验 UTF-16，不调用 AX 写入、剪贴板或前台兜底。默认路径要求现有内部文本焦点与 key window。`CU_EXPERIMENTAL_APPKIT_FOCUS=1` 可显式启用仍在验收的局部 AppKit 焦点通知路径，仅支持本轮核对的 macOS 26.6.2 arm64；它已通过自建遮挡文档和 pi 真实事件验证，已通过当前 OS 的系统计算器、TextEdit 操作及一次真人并用测试；任意应用兼容性仍不保证。v0.3 交付说明详见 [后台机制进度](docs/FOCUS_FIDELITY.md)。

默认原生层拒绝 `cu_focus` 和 `mode:"foreground"`（FOREGROUND_DISABLED）。只有启动服务时明确设置 `CU_ENABLE_FOREGROUND=1`，才允许调用方显式接管前台、移动真实鼠标；未知 mode 直接拒绝。后台失败不会自动退回前台模式。最小化、隐藏、其他 Space、锁屏和独立桌面不在保证范围。请在当前用户的已解锁 GUI 会话中运行。不能保证任意应用、弹窗、辅助功能实现或多显示器布局都工作。

普通动作完成后包含 80 ms 的事件投递缓冲，但不保证网络请求或异步 UI 已完成。客户端仍须观察结果。请求串行执行；不自动重试动作。取消/30 秒超时会终止 helper、废弃排队的旧会话请求，并尝试释放拖拽中按下的鼠标；如果 macOS 同步调用阻塞，1 秒后强制终止。动作可能部分完成，必须先观察再重试。

受保护文本值不进入 AX 输出，安全输入状态拒绝键入；这不能代替调用方的授权判断。剪贴板默认禁用，只有 `CU_ENABLE_CLIPBOARD=1` 且未启用白名单时可用。`cu_type_text` 不使用剪贴板。

启动应用与操作现有遮挡窗口是不同阶段。`cu_launch` 默认只返回已有的唯一实例，不发送重新打开请求。启动新应用须显式传 `allowVisibleWindows:true`，表示接受可见布置；即使 `activates=false`，应用仍可能让窗口来到前面。多个已有实例应先用 apps/windows 选择 PID。此开关不会启用前台鼠标或全局键入。

## 验证与交付

```sh
npm test                 # schema、协议、串行化、取消与超时
npm run test:background  # 默认不激活、不发全局输入：后台 AX/截图/OCR/滚动验收
# 只有明确允许测试抢占前台时，才运行：
CU_TEST_ALLOW_FOREGROUND_SETUP=1 npm run test:desktop
CU_TEST_ALLOW_FOREGROUND_SETUP=1 npm run test:background:interactive
npm run test:pi          # pi Agent 经 MCP 完成中文输入与按钮操作
npm run package          # 预编译插件 ZIP + 干净源码包
npm run package:evidence # 单独证据 ZIP，不包含原版逆向材料
```

v0.3 的真实后台文档、pi、外部预编译包与干净源码验收：

```sh
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/raw-document-test.mjs
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/pi-document-test.mjs
# 先 npm run package，再验证实际交付文件
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/packaged-document-test.mjs
node scripts/source-package-test.mjs
```

外部 ZIP 测试包含遮挡窗口 PNG/OCR 和7次真实操作；源码测试在仓库外以隔离 npm 配置安装锁定依赖、重新编译 helper、运行18项检查（无跳过）。真实系统应用与真人测试范围见 [v0.3 发布说明](docs/RELEASE_NOTES.md)。

默认后台测试创建 accessory 测试 app，用 orderBack 和相对排序将遮挡窗口放在目标之上、用户窗口之后，不调用 activate 或全局输入。可用 CU_TEST_EXISTING_TARGETS=/absolute/path/to/previous-report.json 复测已有的自建 TextEdit/Calculator 窗口，不启动/聚焦/重排系统应用。前台回归和交互式并发验收明确受 CU_TEST_ALLOW_FOREGROUND_SETUP=1 保护：它们会激活测试窗口并生成前台输入，不应在用户正常工作时运行。真人并用测试单独记录，不与合成输入混称。图像和报告位于 `artifacts/`，不纳入源码包。另已在真实 macOS Calculator 中用 AX 按钮计算并确认 `7 × 8 = 56`，截图和结果也保存在本机 artifacts。

`dist/` 同时提供 arm64 预编译插件 ZIP 和完整源码 tar.gz。预编译 ZIP 内已捆绑独立 helper、MCP JS 服务及开源依赖许可证；解压后只需 Node.js 22+ 和正常 TCC 权限，不需要 npm install、Swift 编译器或原版应用。打包流程会把实际 ZIP 解压到仓库之外验证，避免误用开发目录的依赖。源码包保留构建和测试入口。

详细调查、证据强度、原版通信结构、复现命令和未实现范围见 [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md)。实现与协议见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。本机验证结果见 [docs/VALIDATION.md](docs/VALIDATION.md)。

目前没有复现原版的可信 JavaScript REPL、浏览器扩展/DOM 协议、AX 语义压缩与差分算法、锁屏控制、隐藏桌面或原版完整的焦点隔离/事件过滤框架。交付的是可独立使用且有真实验证的桌面 MCP 实现，不能视为原版的二进制或 API 完全兼容替代。

本机测试证据的入口见 [docs/validation-index.json](docs/validation-index.json)。`dist/` 另提供证据 ZIP，保留最终静默验收、pi、早期并发成功、真人反馈及失败案例；不含原版代码或凭证。解压后的预编译包也已在仓库之外实际后台操作计算器并读回56。

License: MIT；依赖仍受各自许可证约束。
