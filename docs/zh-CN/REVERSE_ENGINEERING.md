# Codex Computer Use 调查记录

[English version](../REVERSE_ENGINEERING.md)

当前安装物已更新。2026-10-22的组件身份、接口/行为对照和重新逆向函数见 [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md)。本页保留历史日期及原生哈希范围，旧地址不能直接套用于新服务。

调查日期：2026-10-17（America/Edmonton）。本报告针对本机安装物；不是对所有版本的断言。摘要、版本和 SHA-256 在 [evidence-manifest.json](../evidence-manifest.json)。原始 REA Evidence、ASAR 区域和反汇编只保留在被 Git 忽略的 `.research/`，源码交付包明确排除它们。

## 证据分类

**观察事实 O**：本机文件/进程/打开的文件描述符或真实操作结果。**静态事实 S**：已安装 JavaScript/声明文件的实际分支和字段。**二进制事实 B**：Mach-O 导入、导出、Swift 符号和指令。**推测 I**：由多项事实推导，但未完整动态跟踪。**未知 U**：没有充分证据，不以空结果或命名替代证明。

没有修改 ChatGPT/Codex 包、没有注入原进程、没有调用或伪造原版私有 socket 身份、没有读取认证文件、没有修改 TCC。原版行为对照通过当前正常暴露的 `cua_repl` 工具完成。

## 安装物与进程

| 对象 | 本机事实 | 证据 |
| --- | --- | --- |
| `/Applications/ChatGPT.app` | Bundle ID 为 `com.openai.codex`，版本 `26.1013.31256`；存在 Electron/Codex Framework、Swift 服务和 Node 运行时 | O: Info.plist、资源清单、进程路径 |
| `Contents/Resources/app.asar` | 582,401,226 bytes、21,171 个成员；`.vite/build/main-CLu1A25j.js` 为主要桌面 bundle 之一 | O/S: ASAR header 和成员表，未执行 bundle |
| `cua_node/manifest.json` | Node archive/runtime 清单，声明 `24.21.0-cua.1`、独立 `node` 和 `node_repl` | O/S |
| `@oai/cua-repl` | `0.1.0`，launcher 组织 MCP 描述、可信服务和 node_repl 启动 | S |
| `@oai/cua` | `0.2.6`，含 tinysky 替代接口、app/browser 绑定和结果显示 | S |
| `@oai/sky` | `0.7.8`，含平台/目标分发和 macOS 客户端、native-pipe、策略、错误类型 | S |
| `~/.codex/computer-use/Codex Computer Use.app` | 正在运行的 `SkyComputerUseService`；安装包另有相同角色的 bundle | O |
| `SkyComputerUseService` | arm64、最低系统 14.4、SDK 26.1；UUID `6AD9DE94-5466-38A4-B2E0-F81DFBC620DB` | B: REA inspect-macho |
| 相关 helper | `SkyComputerUseClient.app`、`CUALockScreenGuardian.app`、Installer 和授权插件存在 | O/B；存在不等于已验证其全部能力 |

本次看到的进程树包含应用主进程、Codex CLI、多个 `node_repl`、多个 Node worker 和单独的 Sky 服务。未转储任何进程的环境或认证参数。`lsof -a -p <service-pid> -U` 确认服务打开 `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`，并存在独立的 LockScreenLoginAuthorization socket。对后者未连接或测试。

## 已还原的调用链

```mermaid
flowchart TD
  A[Agent: cua_repl.js] --> B[MCP launcher: @oai/cua-repl]
  B --> C[node_repl persistent JS runtime]
  C --> D[@oai/cua app/browser facade]
  D --> E[trusted service dispatch: sky]
  E --> F[@oai/sky/service and target adapters]
  F --> G[MacComputerUseClient]
  G --> H[nodeRepl.nativePipe + MacNativePipeTransport]
  H -->|length-prefixed JSON-RPC| I[SkyComputerUseService]
  H -. startup ensureService .-> J[Codex host-services pipe]
  J --> K[Electron managed-service lifecycle]
  K --> I
  I --> L[AX trees / capture / input / app policy]
  D --> M[separate browser service]
```

从 facade 到可信 worker 的具体进程内隔离细节仍有 U；JavaScript 服务分发和 Node host 能力边界是 S，不将它们简化成任意普通 Node 包调用。

### 1. Electron 管理配置与服务生命周期（S）

ASAR 中 `main-CLu1A25j.js` 在本机解码文本约 101,453 字符偏移处设置 `CUA_REPL_NODE_REPL_PATH`，约 101,488 处设置启用的 surfaces，约 101,638 处引用 launcher 路径。它按可用 surface 组装 browser 和 sky 的可信服务映射，并调整生成的 MCP server。偏移为解码文本索引，不是 Mach-O 地址或跨版本稳定位置。

同一 bundle 约 277,673 处构造 `Contents/MacOS/SkyComputerUseService` 路径；附近代码维护预期可执行文件、进程存活检查、缓存 PID、服务启用状态、串行生命周期操作和 respawn 回调。UI 的 Computer Use、Appshots、Skysight 开关共同影响服务是否需要运行。该结论来自分支代码；未主动杀死原服务来测试恢复。

### 2. MCP launcher 与可信服务（S）

launcher 要求 `CUA_REPL_NODE_REPL_PATH` 是绝对路径，并校验 `CUA_REPL_ENABLED_SURFACES`。computer surface 绑定 `sky` → `@oai/sky/service`，browser surface 绑定独立 browser desktop service；随后启动 node_repl，传入服务映射、JS banner 和工具描述覆盖。它转发终止信号并保留子进程退出状态。

`@oai/cua` 的 tinysky macOS app 绑定把 `getAXState/click/drag/scroll/typeText/setValue/selectText/performSecondaryAction` 等高层方法转成 sky 请求。原版 macOS scroll 以页数表达，独立实现明确采用像素 deltas，二者不是相同参数协议。原版 facade 还承担图片和文本结果的输出，不能把返回对象直接看成最终 MCP content。

### 3. JavaScript macOS 客户端（S）

`MacComputerUseClient` 默认 API 为 `CodexComputerUseIPC-5`，默认请求时限 120 秒，按 API 版本缓存 transport。其请求类型包括：

| 请求类型 | 从客户端分支确认的用途 |
| --- | --- |
| `ComputerUseIPCListAppsRequest` | 应用清单 |
| `ComputerUseIPCAppPolicyRequest` | 应用访问策略 |
| `ComputerUseIPCAppStartRequest` | 启动/绑定应用 |
| `ComputerUseIPCAppGetSkyshotRequest` | AX 文本和可选截图，接受 disableDiff |
| `ComputerUseIPCAppPerformActionRequest` | 点击、拖动、滚动、键入、粘贴、赋值、选择与次级动作 |
| `ComputerUseIPCStartAudioRecordingRequest` / `StopAudioRecordingRequest` | 录音控制；未动态测试或重建 |

动作载荷是带 case 名的对象。比如坐标点击和元素点击选择不同的 `at` case；element index 被转换成字符串。鼠标按钮规范化为 0/1/2；方向规范化为 up/down/left/right。键入和快捷键使用独立 action。没有发现“把所有操作直接拼成 AppleScript”这样的路径。

### 4. 本地通信协议（S；socket 存在为 O）

transport 使用 `nodeRepl.nativePipe.createConnection`，不是普通代码直接调用 `net.connect` 的实现。缺少可信 nodeRepl 对象会报错。默认 socket 路径与 lsof 一致；代码也支持显式配置路径。本项目不设置这些 override。

帧格式为 **4-byte UInt32 little-endian UTF-8 payload length + JSON payload**，最大 8,388,608 bytes。解析器保留不完整帧，支持一次读取多帧。请求 ID 单调增加，响应必须是 JSON-RPC 2.0 且恰有 result/error 之一。该结构从实际编码、解码、校验函数确认；没有抓取或保存原版的真实请求元数据。

握手为 `ping` 携带 `clientApiVersion`，返回 `serverApiVersion` 并严格比较。实际动作的外层结构可描述为：

```json
{
  "id": 2,
  "jsonrpc": "2.0",
  "method": "request",
  "params": {
    "clientApiVersion": "CodexComputerUseIPC-5",
    "deadlineUnixMilliseconds": 0,
    "requestType": "ComputerUseIPCListAppsRequest",
    "request": {}
  }
}
```

这是依据字段结构重述的示意，不是可直接发送的有效请求：deadline 为占位值；运行时还可附带 turn metadata。本次未读取、复制或伪造真实 metadata。动作在 transport 中串行化；请求超时会关闭连接并拒绝挂起调用。

首次连接尝试约 250 ms。连接失败时可通过独立 host-services pipe 发送 `ensureService` / `service: computer-use`，或用可信 LaunchServices 能力启动服务，然后在约 5 秒内重试连接。主服务 transport 和 host-services pipe 是不同连接、不同职责。

### 5. 认证和策略边界（S/B；精确原生判定仍 U）

Electron host-services 的 `Cce` 函数创建 pipe，使用 8 MiB 帧限制，并把 socket 文件权限改为 0600。`Vd` 构造 peer authorizer，打包构建读取 build flavor 和原生 peer-authorization addon，基于 socket fd 调用授权函数。缺少所需打包元数据时有拒绝分支。不能把这段 Electron 分支直接等同于 Sky 服务的全部验证规则。

Sky JS 错误码表包含 senderProcessNotAuthenticated、appNotAllowed、incompatibleClientVersion 等。原服务包含 `ComputerUseIPCSenderAuthorization`、senderContextResolver、parent/responsible process identity、`prepareForAuthenticatedRequest` 和 permission callbacks 的符号；导入 audit-token、SecCode/SecTask 和签名信息 API。由此可以确认存在身份及策略边界；其精确签名要求、所有例外和校验顺序未完整反编译，仍标 U。

本项目没有尝试通过伪造 globalThis.nodeRepl、使用他人 bundle identity、重签原二进制或复用私有 socket 来获得控制。独立 helper 走自己的普通 TCC 流程。原服务有 SwiftProtobuf 依赖，但**这不构成当前 JS→native socket 使用 protobuf 的证据**；已确认的此段 wire 是 JSON-RPC。

### 6. 原生功能分层（B/I）

REA Mach-O 结果记录了 4,658 个 import items 和 68,710 个 export items；部分函数名称已经 redacted。Swift demangle 与指令检查定位到以下边界：

| 本机地址/符号 | 可确认信息 |
| --- | --- |
| `0x100186fd8` `ComputerUseIPCServer.__allocating_init(jsonRPCSocketURL:)` | IPC server 接受 JSON-RPC socket URL；已检查这段 ARM64 指令，不能据此还原所有 server 方法 |
| `0x1001874e8` `ComputerUseIPCServer.start(...)` | 生命周期模式、权限、认证前准备及客户端事件回调 |
| `0x1001895cc` `handleEvent:withReplyEvent:` | 还存在原生事件处理入口；未动态测试此路径 |
| `0x10006eebc` `ComputerUseAppController.updateSkyshot(...)` | treeCache、disableAXDiffing、skipScreenshot 参数 |
| `0x100071ad4` `updateSkyshotSettlingIfNeeded(...)` | 原生层有 UI settling 入口；具体稳定判定算法 U |
| `0x100072dbc` `prepareToInteract(...)` | 元素重新获取、定位和光标交互准备的边界 |
| `0x100074e64`、`0x10007fa8c` | 元素/坐标两条 click 入口，含 hold、key、drag、可选返回 skyshot |
| `0x100078e8c`、`0x10007c3cc` | setValue、selectText，含文本上下文/选择类型 |
| `0x10025ec08`、`0x10025ec14` | CGEvent post 与 postToPid 封装 |

原服务导入 AXUIElement 查询/写值/动作、ScreenCaptureKit、AppKit 和 CoreGraphics，包含 AccessibilityTreePresentation、RefetchableSkyshotAXTree、截图缓存、变换树、焦点/选中文字和差分相关类型。可以据此还原职责划分；不能由符号名证明所有分支运行时都可用。

还存在 WindowServerSPI、锁屏 guardian、安装授权插件及更多非桌面通用的业务类型。它们提示原版可能使用更深的系统集成（I），但不证明任意隐藏/锁屏场景都成功。第一轮实现未使用这些入口；v0.2 使用独立动态解析的系统 window-location SPI，详见第二轮记录；仍不依赖原版服务或锁屏组件。

## 动态对照与实现结果

通过正常暴露的 `cua.getApp("io.local.computeruse.fixture")`，原版取得自建 AppKit 窗口，返回数字索引、压缩语义角色、可赋值标记、菜单栏及焦点。后续执行点击、键入和按钮动作，再观察到了 `~` 表示变化的 AX diff。该实验验证了 app facade 和差分输出可用，没有证明原版输入对所有字符/连续动作时序都一致。

同一类受控窗口中，独立服务经**标准 MCP 客户端**验证了截图、AX、Unicode、快捷键、坐标/元素点击、语义操作、拖拽、滚动、OCR、取消清理、白名单、文本选择和菜单。pi 通过其原生 MCP 支持完成了中文输入→点击→读回闭环。此外，真实 Calculator 的 SwiftUI AX 树可读，按钮操作确认 `7 × 8 = 56`。详见 [VALIDATION.md](VALIDATION.md)。

独立实现的实用替代关系：

| 原版角色 | 本实现 |
| --- | --- |
| cua_repl / 持久 JS facade | 直接、类型化的 MCP tools；无任意 eval |
| 可信 sky 服务 bridge | 私有子进程管道和独立 Swift helper |
| app binding + skyshot | pid/windowId + snapshot UUID + AX/PNG |
| 语义压缩和增量 tree | 有界结构化全量树，显式 truncated |
| 原版输入封装 | AX 语义编辑/点击 + 窗口定向 CGEvent；显式前台模式另保留焦点与命中检查 |
| 原版权限/应用策略 | 正常 TCC + 可选 bundle allowlist |
| browser extension/DOM | 未复现；浏览器可走通用 AX/截图/OCR |
| 特殊锁屏/隐藏会话集成 | 未实现 |

## REA 的实际使用、限制及复现

REA 源码 clone 到 `.research/rea`，工具运行固定 npm 版本 6.5.0，没有运行会修改 Codex 配置的 `rea setup`。使用的主要命令：

```sh
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky --json > .research/evidence/sky-graph.json
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua-repl --json > .research/evidence/cua-repl-graph.json
npx -y rea-agents@6.5.0 inspect-macho "$HOME/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService" --json > .research/evidence/service-macho.json
```

sky 分析实际读取 229 个 relevant files，解析 228 个 JS/声明文件，无 parse failure；cua-repl 为 12 个 relevant files、9 个解析项。REA 明确声明图覆盖不完整，`modules:0` 不能解读为“没有模块”，更不能声称已恢复完整调用图。调查依靠 Evidence + 定向阅读实际文件 + native symbols 交叉核对。

`inspect-analysis-view` 对保存的 sky Evidence 做 summary projection 已成功。`recover-javascript-sources` 的尝试返回 capability_unavailable：所需 Wakaru Linux x64 provider 未配置。没有为了美化输出声称已成功反编译；实际 minified ESM 很小，可定向人工阅读并使用 REA 静态图验证。未安装 Hopper/Ghidra，原生部分使用 REA Mach-O 元数据和 Xcode 自带 `nm`、`swift-demangle`、`llvm-objdump`。已取得函数地址和局部指令，不宣称已恢复所有 Swift 源码。

再调查工具入口见 `scripts/investigate.mjs`。它只读安装物，将原始分析放在 `.research/`。首次 npm 下载会写 npm cache；不会注册/修改原应用服务。公开资料补充了产品定位和插件接入，但不能替代本机内部实现证据：

- [REA 源码和使用说明](https://github.com/morluto/rea)
- [OpenAI Computer Use 文档](https://learn.chatgpt.com/docs/computer-use)——公开说明 macOS 的正常权限流程。
- [Codex 公开 core-plugins 测试](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/executor_hooks_tests.rs)——可见统一插件和 cua_repl 名称；并不包含本机 Swift 服务的完整实现。
- [公开 runtime 问题报告](https://github.com/openai/codex/issues/42757)——作为外部症状记录，证据强度低于本机安装物，不把报告者推测当作架构证明。
- [Apple SCScreenshotManager API](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager)
- [官方 MCP TypeScript SDK stdio 与 tool API](https://ts.sdk.modelcontextprotocol.io/server)

## 未验证和后续研究边界

原生 sender authorization 的精确机器码控制流、所有 XPC/Apple-event 请求、原版完整坐标/事件映射细节（局部窗口定位已补充）、完整 AX 语义合并和稳定索引算法、UI settling、浏览器扩展 wire、隐藏桌面/锁屏方案及所有安全拒绝分支尚未完整还原。原型可用不等于这些未知已经解决。

可继续在自建 fixture 上覆盖 Electron、WebKit、多窗口/多屏、菜单弹窗和错误 AX 实现；可对原生局部函数做更深只读反编译以解释性能和时序。任何后续实现仍优先公共 API 和独立代码。本机成果已经建立可复现的软件与测试基线，不依赖这些未知才能运行。

## 第二轮：后台窗口输入的定向研究（v0.2）

第一轮独立实现的物理输入需要前台，不能由截图可见后台窗口推导后台操作成立。本轮将控制路径与感知路径分开验证，并增加真实 TextEdit/Calculator 并发测试。

| 本机符号/地址 | 确认的事实与证据范围 |
| --- | --- |
| `SynthesizedEvent.mouseEvent` `0x10075b260` | B：NSEvent mouseEvent → cgEvent，按钮字段3、mouse subtype字段7=3、窗口字段91/92；后续设置 window location |
| `SynthesizedEvent.scroll` `0x10075b4ec` | B：scroll事件和窗口字段；AppKit windowNumber carrier51，与本机收到事件交叉核对 O |
| `WindowServerSPI.setWindowLocation` `0x10027384c` | B：原版有单独窗口位置入口；独立实验确认系统导出 CGEventSetWindowLocation 可动态解析 O，不依赖原服务 |
| `CGEventAPI.postToPid` `0x10025ec14` | B：发送路径实际调用进程定向投递，不等于全局鼠标 warp |
| `syntheticallyActivateIfNeededForSendingClick` `0x100702bcc` | B：原版存在按点击环境准备内部激活状态的分支；不等同于全局激活应用 |
| `SyntheticAppFocusEnforcer` / `SystemFocusStealPreventer` | B：原版不只是 postToPid；还有状态跟踪、事件 tap、系统前台观察和焦点保护组件，未完整重建 |
| activate builder `0x100736e00` | B：构造 type13 AppKit-defined、subtype1、目标窗口编号，flags0xc0000；deactivate为subtype2 |
| CPS subtype getter | B：原版还有原始type21及 keyFocusReturned 0x8000、keyFocusTaken 0x4000、lostKeyFocus 0x1000；仅识别常量不证明完整协议已恢复 |

原始反汇编留在 `.research/background/`，不进入交付包。独立实现以自己的源代码重建 API 调用，不分发原服务实现。

**O：坐标实验。** 直接 postToPid 而未设置窗口本地位置，会使收到的 AppKit 鼠标位置落在窗口外。独立实验确认 CGEventSetWindowLocation 接受窗口左上为原点的逻辑坐标；错误地再做一次 Y 翻转会击中镜像位置。完成修正后，真实 AppKit 自定义视图收到 click/drag，NSScrollView 及系统 TextEdit 真实滚动条变化。全局指针不需要移动。

**O：AX文字。** TextEdit 的 AXSelectedText 可写，原生 NSTextField 也可通过可写属性插入。只看 AXSet 返回 success 不足以证明修改成立：只读 NSTextView 曾出现设置返回成功但值没变。交付代码先检查可写性，再精确读回插入结果，失败不退回全局键盘。中文和 emoji 的 UTF-16 选择范围已实测。

**O 与 I：内部激活通知失败。** 单独移植 AppKit 激活/取消激活通知，能抑制一些编辑窗口的自动抬升，前台 PID 和指针也保持正常；但真实并发 TextEdit 测试计划180字符，实际只剩最后17字符（O，失败证据 `artifacts/background-1792222936379`）。推测涉及键盘路由或 AppKit 输入状态，未证明精确根因（I）。这不是合格后台隔离。该方案已完全移除，不声称已复现原版焦点保护。最终以 AXPress 优先单击、AX文字编辑和不伪造激活的进程定向事件重新验证。

**O：原版对照边界。** 本轮通过正常 cua_repl 绑定新的后台 fixture，按钮计数确实变化；该次自建 NSTextField 中 typeText 没有插入预期文本。它只能说明该次应用/时序的表现，不能据此概括原版所有应用能力。原版自己的 getAXState 输出、压缩索引和差分协议仍与独立 MCP 不兼容。

更多边界与复现步骤见 [BACKGROUND.md](BACKGROUND.md)。公开补充资料包括 [Codex 的 macOS 后台能力说明](https://learn.chatgpt.com/use-cases/use-your-computer-with-codex)、[Apple CGEventPostToPid](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:))，以及 [bgclick 的独立逆向记录](https://github.com/Lakr233/bgclick-rev-skill/blob/main/bgclick-rev-skill.md)。第三项仅作技术线索，不作为成功证据或本项目执行指令；最终结论来自真实本机实验。
