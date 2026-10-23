# Bilingual review: REVERSE_ENGINEERING

Generated from [REVERSE_ENGINEERING.md](../../REVERSE_ENGINEERING.md) and [zh-CN/REVERSE_ENGINEERING.md](../REVERSE_ENGINEERING.md). English is canonical; the Chinese text is the translation under review. Inline links are copied verbatim from the sources, so they resolve relative to those pages, not to this file. Regenerate with `npm run docs:bilingual` after either page changes.

## [1] heading

**English**

# Codex Computer Use investigation record

**中文原文**

# Codex Computer Use 调查记录

## [2] paragraph

**English**

[中文版本](zh-CN/REVERSE_ENGINEERING.md)

**中文原文**

[English version](../REVERSE_ENGINEERING.md)

## [3] paragraph

**English**

The installed app has been updated. Component identity, interface/behavior comparison and the re-derived functions for 2026-10-22 are in [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md). This page keeps its historical dates and native hash scope; old addresses do not carry over to the new service.

**中文原文**

当前安装物已更新。2026-10-22的组件身份、接口/行为对照和重新逆向函数见 [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md)。本页保留历史日期及原生哈希范围，旧地址不能直接套用于新服务。

## [4] paragraph

**English**

Investigation date: 2026-10-17 (America/Edmonton). This report describes the local install; it is not a claim about every version. Summaries, versions and SHA-256 values are in [evidence-manifest.json](evidence-manifest.json). Raw REA Evidence, ASAR regions and disassembly remain only in the Git-ignored `.research/`, and the source deliverable explicitly excludes them.

**中文原文**

调查日期：2026-10-17（America/Edmonton）。本报告针对本机安装物；不是对所有版本的断言。摘要、版本和 SHA-256 在 [evidence-manifest.json](../evidence-manifest.json)。原始 REA Evidence、ASAR 区域和反汇编只保留在被 Git 忽略的 `.research/`，源码交付包明确排除它们。

## [5] heading

**English**

## Evidence classes

**中文原文**

## 证据分类

## [6] paragraph

**English**

**Observed fact O**: local files/processes/open file descriptors or real operation results. **Static fact S**: actual branches and fields in the installed JavaScript/declaration files. **Binary fact B**: Mach-O imports, exports, Swift symbols and instructions. **Inference I**: derived from several facts but not fully traced dynamically. **Unknown U**: insufficient evidence; an empty result or a name never substitutes for proof.

**中文原文**

**观察事实 O**：本机文件/进程/打开的文件描述符或真实操作结果。**静态事实 S**：已安装 JavaScript/声明文件的实际分支和字段。**二进制事实 B**：Mach-O 导入、导出、Swift 符号和指令。**推测 I**：由多项事实推导，但未完整动态跟踪。**未知 U**：没有充分证据，不以空结果或命名替代证明。

## [7] paragraph

**English**

No ChatGPT/Codex package was modified, no original process was injected, no original private socket identity was called or forged, no credential file was read and TCC was not changed. Original behavior comparisons were done through the `cua_repl` tool this session legitimately exposes.

**中文原文**

没有修改 ChatGPT/Codex 包、没有注入原进程、没有调用或伪造原版私有 socket 身份、没有读取认证文件、没有修改 TCC。原版行为对照通过当前正常暴露的 `cua_repl` 工具完成。

## [8] heading

**English**

## Installed artifacts and processes

**中文原文**

## 安装物与进程

## [9] table

| # | English | 中文原文 |
| --- | --- | --- |
| 0 | Object · Local fact · Evidence | 对象 · 本机事实 · 证据 |
| 1 | `/Applications/ChatGPT.app` · bundle ID `com.openai.codex`, version `26.1013.31256`; contains an Electron/Codex Framework, a Swift service and a Node runtime · O: Info.plist, resource listings, process paths | `/Applications/ChatGPT.app` · Bundle ID 为 `com.openai.codex`，版本 `26.1013.31256`；存在 Electron/Codex Framework、Swift 服务和 Node 运行时 · O: Info.plist、资源清单、进程路径 |
| 2 | `Contents/Resources/app.asar` · 582,401,226 bytes with 21,171 members; `.vite/build/main-CLu1A25j.js` is one of the main desktop bundles · O/S: ASAR header and member table; the bundle was not executed | `Contents/Resources/app.asar` · 582,401,226 bytes、21,171 个成员；`.vite/build/main-CLu1A25j.js` 为主要桌面 bundle 之一 · O/S: ASAR header 和成员表，未执行 bundle |
| 3 | `cua_node/manifest.json` · Node archive/runtime manifest declaring `24.21.0-cua.1`, a standalone `node` and `node_repl` · O/S | `cua_node/manifest.json` · Node archive/runtime 清单，声明 `24.21.0-cua.1`、独立 `node` 和 `node_repl` · O/S |
| 4 | `@oai/cua-repl` · `0.1.0`; the launcher assembles the MCP description, trusted services and node_repl startup · S | `@oai/cua-repl` · `0.1.0`，launcher 组织 MCP 描述、可信服务和 node_repl 启动 · S |
| 5 | `@oai/cua` · `0.2.6`; contains the tinysky replacement interface, app/browser bindings and result display · S | `@oai/cua` · `0.2.6`，含 tinysky 替代接口、app/browser 绑定和结果显示 · S |
| 6 | `@oai/sky` · `0.7.8`; platform/target dispatch plus the macOS client, native-pipe, policy and error types · S | `@oai/sky` · `0.7.8`，含平台/目标分发和 macOS 客户端、native-pipe、策略、错误类型 · S |
| 7 | `~/.codex/computer-use/Codex Computer Use.app` · the running `SkyComputerUseService`; the install package has another bundle with the same role · O | `~/.codex/computer-use/Codex Computer Use.app` · 正在运行的 `SkyComputerUseService`；安装包另有相同角色的 bundle · O |
| 8 | `SkyComputerUseService` · arm64, minimum OS 14.4, SDK 26.1; UUID `6AD9DE94-5466-38A4-B2E0-F81DFBC620DB` · B: REA inspect-macho | `SkyComputerUseService` · arm64、最低系统 14.4、SDK 26.1；UUID `6AD9DE94-5466-38A4-B2E0-F81DFBC620DB` · B: REA inspect-macho |
| 9 | Related helpers · `SkyComputerUseClient.app`, `CUALockScreenGuardian.app`, the Installer and an authorization plug-in exist · O/B; existence does not mean all of their capabilities were verified | 相关 helper · `SkyComputerUseClient.app`、`CUALockScreenGuardian.app`、Installer 和授权插件存在 · O/B；存在不等于已验证其全部能力 |

## [10] paragraph

**English**

The process tree observed here contained the app's main process, the Codex CLI, several `node_repl` instances, several Node workers and a separate Sky service. No process environment or authentication parameters were dumped. `lsof -a -p <service-pid> -U` confirmed the service opens `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`, and that a separate LockScreenLoginAuthorization socket exists. The latter was neither connected to nor tested.

**中文原文**

本次看到的进程树包含应用主进程、Codex CLI、多个 `node_repl`、多个 Node worker 和单独的 Sky 服务。未转储任何进程的环境或认证参数。`lsof -a -p <service-pid> -U` 确认服务打开 `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`，并存在独立的 LockScreenLoginAuthorization socket。对后者未连接或测试。

## [11] heading

**English**

## Recovered call chain

**中文原文**

## 已还原的调用链

## [12] code

English:

```
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

中文:

```
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


## [13] paragraph

**English**

The in-process isolation details from the facade to the trusted worker remain U; JavaScript service dispatch and the Node host capability boundary are S, and they are not simplified into arbitrary ordinary Node package calls.

**中文原文**

从 facade 到可信 worker 的具体进程内隔离细节仍有 U；JavaScript 服务分发和 Node host 能力边界是 S，不将它们简化成任意普通 Node 包调用。

## [14] heading

**English**

### 1. Electron managed configuration and service lifecycle (S)

**中文原文**

### 1. Electron 管理配置与服务生命周期（S）

## [15] paragraph

**English**

Inside the ASAR, `main-CLu1A25j.js` sets `CUA_REPL_NODE_REPL_PATH` at about decoded-text offset 101,453, sets the enabled surfaces at about 101,488 and references the launcher path at about 101,638. It assembles the browser and sky trusted-service maps from the available surfaces and adjusts the generated MCP server. Offsets are decoded-text indices, not Mach-O addresses or cross-version stable positions.

**中文原文**

ASAR 中 `main-CLu1A25j.js` 在本机解码文本约 101,453 字符偏移处设置 `CUA_REPL_NODE_REPL_PATH`，约 101,488 处设置启用的 surfaces，约 101,638 处引用 launcher 路径。它按可用 surface 组装 browser 和 sky 的可信服务映射，并调整生成的 MCP server。偏移为解码文本索引，不是 Mach-O 地址或跨版本稳定位置。

## [16] paragraph

**English**

Around 277,673 the same bundle constructs the `Contents/MacOS/SkyComputerUseService` path; nearby code maintains the expected executable, liveness checks, a cached PID, service-enabled state, serial lifecycle operations and a respawn callback. The UI's Computer Use, Appshots and Skysight switches together decide whether the service needs to run. This comes from branch code; the original service was not actively killed to test recovery.

**中文原文**

同一 bundle 约 277,673 处构造 `Contents/MacOS/SkyComputerUseService` 路径；附近代码维护预期可执行文件、进程存活检查、缓存 PID、服务启用状态、串行生命周期操作和 respawn 回调。UI 的 Computer Use、Appshots、Skysight 开关共同影响服务是否需要运行。该结论来自分支代码；未主动杀死原服务来测试恢复。

## [17] heading

**English**

### 2. MCP launcher and trusted services (S)

**中文原文**

### 2. MCP launcher 与可信服务（S）

## [18] paragraph

**English**

The launcher requires `CUA_REPL_NODE_REPL_PATH` to be absolute and validates `CUA_REPL_ENABLED_SURFACES`. The computer surface binds `sky` → `@oai/sky/service` and the browser surface binds a separate browser desktop service; it then starts node_repl with the service map, JS banner and tool-description overrides. It forwards termination signals and preserves the child exit status.

**中文原文**

launcher 要求 `CUA_REPL_NODE_REPL_PATH` 是绝对路径，并校验 `CUA_REPL_ENABLED_SURFACES`。computer surface 绑定 `sky` → `@oai/sky/service`，browser surface 绑定独立 browser desktop service；随后启动 node_repl，传入服务映射、JS banner 和工具描述覆盖。它转发终止信号并保留子进程退出状态。

## [19] paragraph

**English**

`@oai/cua`'s tinysky macOS app binding turns high-level methods such as `getAXState/click/drag/scroll/typeText/setValue/selectText/performSecondaryAction` into sky requests. Original macOS scroll is expressed in pages while the independent implementation explicitly uses pixel deltas, so they are not the same parameter protocol. The original facade also produces image and text results, so a returned object cannot be read directly as final MCP content.

**中文原文**

`@oai/cua` 的 tinysky macOS app 绑定把 `getAXState/click/drag/scroll/typeText/setValue/selectText/performSecondaryAction` 等高层方法转成 sky 请求。原版 macOS scroll 以页数表达，独立实现明确采用像素 deltas，二者不是相同参数协议。原版 facade 还承担图片和文本结果的输出，不能把返回对象直接看成最终 MCP content。

## [20] heading

**English**

### 3. JavaScript macOS client (S)

**中文原文**

### 3. JavaScript macOS 客户端（S）

## [21] paragraph

**English**

`MacComputerUseClient` defaults to API `CodexComputerUseIPC-5` with a default 120-second request deadline and caches transports per API version. Its request types include:

**中文原文**

`MacComputerUseClient` 默认 API 为 `CodexComputerUseIPC-5`，默认请求时限 120 秒，按 API 版本缓存 transport。其请求类型包括：

## [22] table

| # | English | 中文原文 |
| --- | --- | --- |
| 0 | Request type · Purpose confirmed from client branches | 请求类型 · 从客户端分支确认的用途 |
| 1 | `ComputerUseIPCListAppsRequest` · app listing | `ComputerUseIPCListAppsRequest` · 应用清单 |
| 2 | `ComputerUseIPCAppPolicyRequest` · app access policy | `ComputerUseIPCAppPolicyRequest` · 应用访问策略 |
| 3 | `ComputerUseIPCAppStartRequest` · launch/bind an app | `ComputerUseIPCAppStartRequest` · 启动/绑定应用 |
| 4 | `ComputerUseIPCAppGetSkyshotRequest` · AX text and optional screenshot, accepts disableDiff | `ComputerUseIPCAppGetSkyshotRequest` · AX 文本和可选截图，接受 disableDiff |
| 5 | `ComputerUseIPCAppPerformActionRequest` · click, drag, scroll, typing, paste, set value, select and secondary actions | `ComputerUseIPCAppPerformActionRequest` · 点击、拖动、滚动、键入、粘贴、赋值、选择与次级动作 |
| 6 | `ComputerUseIPCStartAudioRecordingRequest` / `StopAudioRecordingRequest` · recording control; neither dynamically tested nor rebuilt | `ComputerUseIPCStartAudioRecordingRequest` / `StopAudioRecordingRequest` · 录音控制；未动态测试或重建 |

## [23] paragraph

**English**

Action payloads are objects with case names. A coordinate click and an element click, for example, choose different `at` cases; element indices are converted to strings. Mouse buttons normalize to 0/1/2 and directions to up/down/left/right. Typing and shortcuts use separate actions. No path was found that simply concatenates everything into AppleScript.

**中文原文**

动作载荷是带 case 名的对象。比如坐标点击和元素点击选择不同的 `at` case；element index 被转换成字符串。鼠标按钮规范化为 0/1/2；方向规范化为 up/down/left/right。键入和快捷键使用独立 action。没有发现“把所有操作直接拼成 AppleScript”这样的路径。

## [24] heading

**English**

### 4. Local communication protocol (S; socket existence is O)

**中文原文**

### 4. 本地通信协议（S；socket 存在为 O）

## [25] paragraph

**English**

The transport uses `nodeRepl.nativePipe.createConnection` rather than plain code calling `net.connect`; a missing trusted nodeRepl object raises an error. The default socket path matches lsof, and the code also supports an explicit path. This project sets none of those overrides.

**中文原文**

transport 使用 `nodeRepl.nativePipe.createConnection`，不是普通代码直接调用 `net.connect` 的实现。缺少可信 nodeRepl 对象会报错。默认 socket 路径与 lsof 一致；代码也支持显式配置路径。本项目不设置这些 override。

## [26] paragraph

**English**

A frame is a **4-byte UInt32 little-endian UTF-8 payload length plus a JSON payload**, capped at 8,388,608 bytes. The parser retains incomplete frames and supports several frames per read. Request IDs increase monotonically and responses must be JSON-RPC 2.0 with exactly one of result/error. This structure comes from the actual encode/decode/validate functions; no real request metadata from the original was captured or stored.

**中文原文**

帧格式为 **4-byte UInt32 little-endian UTF-8 payload length + JSON payload**，最大 8,388,608 bytes。解析器保留不完整帧，支持一次读取多帧。请求 ID 单调增加，响应必须是 JSON-RPC 2.0 且恰有 result/error 之一。该结构从实际编码、解码、校验函数确认；没有抓取或保存原版的真实请求元数据。

## [27] paragraph

**English**

The handshake is `ping` carrying `clientApiVersion`, which returns `serverApiVersion` and is compared strictly. The outer action structure can be described as:

**中文原文**

握手为 `ping` 携带 `clientApiVersion`，返回 `serverApiVersion` 并严格比较。实际动作的外层结构可描述为：

## [28] code

English:

```
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

中文:

```
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


## [29] paragraph

**English**

This is a restatement from field structure, not a valid request that can be sent: the deadline is a placeholder and runtime may add turn metadata. No real metadata was read, copied or forged. Actions are serialized in the transport; a request timeout closes the connection and rejects pending calls.

**中文原文**

这是依据字段结构重述的示意，不是可直接发送的有效请求：deadline 为占位值；运行时还可附带 turn metadata。本次未读取、复制或伪造真实 metadata。动作在 transport 中串行化；请求超时会关闭连接并拒绝挂起调用。

## [30] paragraph

**English**

The first connection attempt takes about 250 ms. On failure, `ensureService` / `service: computer-use` can be sent over the separate host-services pipe, or the service started with the trusted LaunchServices capability, then the connection retried within about 5 seconds. The main service transport and the host-services pipe are different connections with different roles.

**中文原文**

首次连接尝试约 250 ms。连接失败时可通过独立 host-services pipe 发送 `ensureService` / `service: computer-use`，或用可信 LaunchServices 能力启动服务，然后在约 5 秒内重试连接。主服务 transport 和 host-services pipe 是不同连接、不同职责。

## [31] heading

**English**

### 5. Authentication and policy boundary (S/B; exact native decisions still U)

**中文原文**

### 5. 认证和策略边界（S/B；精确原生判定仍 U）

## [32] paragraph

**English**

Electron's host-services `Cce` function creates a pipe with an 8 MiB frame limit and sets the socket file permissions to 0600. `Vd` builds a peer authorizer; the packaged build reads the build flavor and the native peer-authorization addon and calls an authorization function with the socket fd. There is a rejection branch when required packaging metadata is missing. This Electron branch cannot be equated with all of the Sky service's verification rules.

**中文原文**

Electron host-services 的 `Cce` 函数创建 pipe，使用 8 MiB 帧限制，并把 socket 文件权限改为 0600。`Vd` 构造 peer authorizer，打包构建读取 build flavor 和原生 peer-authorization addon，基于 socket fd 调用授权函数。缺少所需打包元数据时有拒绝分支。不能把这段 Electron 分支直接等同于 Sky 服务的全部验证规则。

## [33] paragraph

**English**

The Sky JS error table includes senderProcessNotAuthenticated, appNotAllowed and incompatibleClientVersion. The original service contains symbols for `ComputerUseIPCSenderAuthorization`, senderContextResolver, parent/responsible process identity, `prepareForAuthenticatedRequest` and permission callbacks, and imports audit-token, SecCode/SecTask and signing-information APIs. That confirms an identity and policy boundary exists; its exact signing requirements, all exceptions and the verification order were not fully decompiled and remain U.

**中文原文**

Sky JS 错误码表包含 senderProcessNotAuthenticated、appNotAllowed、incompatibleClientVersion 等。原服务包含 `ComputerUseIPCSenderAuthorization`、senderContextResolver、parent/responsible process identity、`prepareForAuthenticatedRequest` 和 permission callbacks 的符号；导入 audit-token、SecCode/SecTask 和签名信息 API。由此可以确认存在身份及策略边界；其精确签名要求、所有例外和校验顺序未完整反编译，仍标 U。

## [34] paragraph

**English**

This project never obtained control by forging `globalThis.nodeRepl`, using another bundle identity, re-signing the original binary or reusing the private socket. The independent helper goes through its own ordinary TCC flow. The original service has a SwiftProtobuf dependency, but **that is not evidence that the current JS→native socket uses protobuf**; the wire confirmed here is JSON-RPC.

**中文原文**

本项目没有尝试通过伪造 globalThis.nodeRepl、使用他人 bundle identity、重签原二进制或复用私有 socket 来获得控制。独立 helper 走自己的普通 TCC 流程。原服务有 SwiftProtobuf 依赖，但**这不构成当前 JS→native socket 使用 protobuf 的证据**；已确认的此段 wire 是 JSON-RPC。

## [35] heading

**English**

### 6. Native capability layering (B/I)

**中文原文**

### 6. 原生功能分层（B/I）

## [36] paragraph

**English**

REA's Mach-O results recorded 4,658 import items and 68,710 export items; some function names were redacted. Swift demangling and instruction checks located these boundaries:

**中文原文**

REA Mach-O 结果记录了 4,658 个 import items 和 68,710 个 export items；部分函数名称已经 redacted。Swift demangle 与指令检查定位到以下边界：

## [37] table

| # | English | 中文原文 |
| --- | --- | --- |
| 0 | Local address/symbol · What can be confirmed | 本机地址/符号 · 可确认信息 |
| 1 | `0x100186fd8` `ComputerUseIPCServer.__allocating_init(jsonRPCSocketURL:)` · the IPC server accepts a JSON-RPC socket URL; the ARM64 instructions were checked, and no server methods can be recovered from this alone | `0x100186fd8` `ComputerUseIPCServer.__allocating_init(jsonRPCSocketURL:)` · IPC server 接受 JSON-RPC socket URL；已检查这段 ARM64 指令，不能据此还原所有 server 方法 |
| 2 | `0x1001874e8` `ComputerUseIPCServer.start(...)` · lifecycle pattern, permissions, preparation before authentication and client event callbacks | `0x1001874e8` `ComputerUseIPCServer.start(...)` · 生命周期模式、权限、认证前准备及客户端事件回调 |
| 3 | `0x1001895cc` `handleEvent:withReplyEvent:` · another native event-handling entry exists; this path was not dynamically tested | `0x1001895cc` `handleEvent:withReplyEvent:` · 还存在原生事件处理入口；未动态测试此路径 |
| 4 | `0x10006eebc` `ComputerUseAppController.updateSkyshot(...)` · treeCache, disableAXDiffing and skipScreenshot parameters | `0x10006eebc` `ComputerUseAppController.updateSkyshot(...)` · treeCache、disableAXDiffing、skipScreenshot 参数 |
| 5 | `0x100071ad4` `updateSkyshotSettlingIfNeeded(...)` · the native layer has a UI-settling entry; the exact stabilization algorithm is U | `0x100071ad4` `updateSkyshotSettlingIfNeeded(...)` · 原生层有 UI settling 入口；具体稳定判定算法 U |
| 6 | `0x100072dbc` `prepareToInteract(...)` · element refetch, location and cursor-interaction preparation boundary | `0x100072dbc` `prepareToInteract(...)` · 元素重新获取、定位和光标交互准备的边界 |
| 7 | `0x100074e64`, `0x10007fa8c` · element/coordinate click entries with hold, key, drag and optional skyshot return | `0x100074e64`、`0x10007fa8c` · 元素/坐标两条 click 入口，含 hold、key、drag、可选返回 skyshot |
| 8 | `0x100078e8c`, `0x10007c3cc` · setValue and selectText with text context/selection type | `0x100078e8c`、`0x10007c3cc` · setValue、selectText，含文本上下文/选择类型 |
| 9 | `0x10025ec08`, `0x10025ec14` · CGEvent post and postToPid wrappers | `0x10025ec08`、`0x10025ec14` · CGEvent post 与 postToPid 封装 |

## [38] paragraph

**English**

The original service imports AXUIElement querying/value-setting/actions, ScreenCaptureKit, AppKit and CoreGraphics, and contains AccessibilityTreePresentation, RefetchableSkyshotAXTree, screenshot cache, transformed-tree, focus/selected-text and diff-related types. Responsibilities can be recovered from this; symbol names cannot prove every branch is usable at runtime.

**中文原文**

原服务导入 AXUIElement 查询/写值/动作、ScreenCaptureKit、AppKit 和 CoreGraphics，包含 AccessibilityTreePresentation、RefetchableSkyshotAXTree、截图缓存、变换树、焦点/选中文字和差分相关类型。可以据此还原职责划分；不能由符号名证明所有分支运行时都可用。

## [39] paragraph

**English**

There are also WindowServerSPI, a lock-screen guardian, an installer authorization plug-in and more non-desktop business types. They suggest the original may integrate more deeply with the system (I) but do not prove hidden/locked scenarios succeed. The first implementation used none of these; v0.2 uses an independently, dynamically resolved system window-location SPI described in the second round; it still depends on neither the original service nor lock-screen components.

**中文原文**

还存在 WindowServerSPI、锁屏 guardian、安装授权插件及更多非桌面通用的业务类型。它们提示原版可能使用更深的系统集成（I），但不证明任意隐藏/锁屏场景都成功。第一轮实现未使用这些入口；v0.2 使用独立动态解析的系统 window-location SPI，详见第二轮记录；仍不依赖原版服务或锁屏组件。

## [40] heading

**English**

## Dynamic comparison and implementation results

**中文原文**

## 动态对照与实现结果

## [41] paragraph

**English**

Through the legitimately exposed `cua.getApp("io.local.computeruse.fixture")`, the original obtained a self-built AppKit window and returned numeric indices, compressed semantic roles, settable flags, the menu bar and focus. It then clicked, typed and pressed a button and observed `~` marks indicating changed AX diffs. That experiment verified the app facade and diff output are usable; it did not prove the original input is identical for every character or timing sequence.

**中文原文**

通过正常暴露的 `cua.getApp("io.local.computeruse.fixture")`，原版取得自建 AppKit 窗口，返回数字索引、压缩语义角色、可赋值标记、菜单栏及焦点。后续执行点击、键入和按钮动作，再观察到了 `~` 表示变化的 AX diff。该实验验证了 app facade 和差分输出可用，没有证明原版输入对所有字符/连续动作时序都一致。

## [42] paragraph

**English**

In the same class of controlled window, the independent service verified screenshots, AX, Unicode, shortcuts, coordinate/element clicks, semantic actions, dragging, scrolling, OCR, cancellation cleanup, allowlists, text selection and menus through a **standard MCP client**. pi completed a Chinese input → click → read-back loop through its native MCP support. In addition, real Calculator's SwiftUI AX tree is readable and button actions confirmed `7 × 8 = 56`. See [VALIDATION.md](VALIDATION.md).

**中文原文**

同一类受控窗口中，独立服务经**标准 MCP 客户端**验证了截图、AX、Unicode、快捷键、坐标/元素点击、语义操作、拖拽、滚动、OCR、取消清理、白名单、文本选择和菜单。pi 通过其原生 MCP 支持完成了中文输入→点击→读回闭环。此外，真实 Calculator 的 SwiftUI AX 树可读，按钮操作确认 `7 × 8 = 56`。详见 [VALIDATION.md](VALIDATION.md)。

## [43] paragraph

**English**

Practical substitutions in the independent implementation:

**中文原文**

独立实现的实用替代关系：

## [44] table

| # | English | 中文原文 |
| --- | --- | --- |
| 0 | Original role · This implementation | 原版角色 · 本实现 |
| 1 | cua_repl / persistent JS facade · direct, typed MCP tools; no arbitrary eval | cua_repl / 持久 JS facade · 直接、类型化的 MCP tools；无任意 eval |
| 2 | trusted sky service bridge · private subprocess pipe and an independent Swift helper | 可信 sky 服务 bridge · 私有子进程管道和独立 Swift helper |
| 3 | app binding + skyshot · pid/windowId + snapshot UUID + AX/PNG | app binding + skyshot · pid/windowId + snapshot UUID + AX/PNG |
| 4 | semantic compression and incremental tree · bounded structured full tree, explicitly truncated | 语义压缩和增量 tree · 有界结构化全量树，显式 truncated |
| 5 | original input wrapper · AX semantic editing/clicking + window-directed CGEvent; explicit foreground mode keeps focus and hit checks | 原版输入封装 · AX 语义编辑/点击 + 窗口定向 CGEvent；显式前台模式另保留焦点与命中检查 |
| 6 | original permission/app policy · normal TCC + optional bundle allowlist | 原版权限/应用策略 · 正常 TCC + 可选 bundle allowlist |
| 7 | browser extension/DOM · not reproduced; browsers can use generic AX/screenshot/OCR | browser extension/DOM · 未复现；浏览器可走通用 AX/截图/OCR |
| 8 | special lock-screen/hidden-session integration · not implemented | 特殊锁屏/隐藏会话集成 · 未实现 |

## [45] heading

**English**

## Actual use of REA, its limits and how to reproduce

**中文原文**

## REA 的实际使用、限制及复现

## [46] paragraph

**English**

REA sources were cloned to `.research/rea`, and the tool was run at the pinned npm version 6.5.0 without running `rea setup`, which would modify Codex configuration. The main commands:

**中文原文**

REA 源码 clone 到 `.research/rea`，工具运行固定 npm 版本 6.5.0，没有运行会修改 Codex 配置的 `rea setup`。使用的主要命令：

## [47] code

English:

```
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky --json > .research/evidence/sky-graph.json
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua-repl --json > .research/evidence/cua-repl-graph.json
npx -y rea-agents@6.5.0 inspect-macho "$HOME/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService" --json > .research/evidence/service-macho.json
```

中文:

```
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky --json > .research/evidence/sky-graph.json
npx -y rea-agents@6.5.0 analyze-javascript-application /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua-repl --json > .research/evidence/cua-repl-graph.json
npx -y rea-agents@6.5.0 inspect-macho "$HOME/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService" --json > .research/evidence/service-macho.json
```


## [48] paragraph

**English**

The sky analysis actually read 229 relevant files and parsed 228 JS/declaration files with no parse failure; cua-repl had 12 relevant files and 9 parsed items. REA explicitly states its graph coverage is incomplete, so `modules:0` cannot be read as "there are no modules", let alone used to claim a full call graph was recovered. The investigation relied on Evidence plus targeted reading of the actual files plus native symbol cross-checks.

**中文原文**

sky 分析实际读取 229 个 relevant files，解析 228 个 JS/声明文件，无 parse failure；cua-repl 为 12 个 relevant files、9 个解析项。REA 明确声明图覆盖不完整，`modules:0` 不能解读为“没有模块”，更不能声称已恢复完整调用图。调查依靠 Evidence + 定向阅读实际文件 + native symbols 交叉核对。

## [49] paragraph

**English**

`inspect-analysis-view` successfully produced a summary projection of the saved sky Evidence. An attempt at `recover-javascript-sources` returned capability_unavailable because the required Wakaru Linux x64 provider was not configured. No decompilation success was claimed to make the output look better; the actual minified ESM is small enough for targeted manual reading with the REA static graph as verification. Hopper/Ghidra were not installed, so native work used REA Mach-O metadata plus Xcode's `nm`, `swift-demangle` and `llvm-objdump`. Function addresses and local instructions were obtained; no claim is made that all Swift source was recovered.

**中文原文**

`inspect-analysis-view` 对保存的 sky Evidence 做 summary projection 已成功。`recover-javascript-sources` 的尝试返回 capability_unavailable：所需 Wakaru Linux x64 provider 未配置。没有为了美化输出声称已成功反编译；实际 minified ESM 很小，可定向人工阅读并使用 REA 静态图验证。未安装 Hopper/Ghidra，原生部分使用 REA Mach-O 元数据和 Xcode 自带 `nm`、`swift-demangle`、`llvm-objdump`。已取得函数地址和局部指令，不宣称已恢复所有 Swift 源码。

## [50] paragraph

**English**

The re-investigation entry point is `scripts/investigate.mjs`. It only reads the install and puts raw analysis in `.research/`. The first npm download writes to the npm cache and does not register or modify the original app's services. Public material adds product positioning and plug-in integration but cannot replace local internal implementation evidence:

**中文原文**

再调查工具入口见 `scripts/investigate.mjs`。它只读安装物，将原始分析放在 `.research/`。首次 npm 下载会写 npm cache；不会注册/修改原应用服务。公开资料补充了产品定位和插件接入，但不能替代本机内部实现证据：

## [51] list

**English**

- [REA source and usage](https://github.com/morluto/rea)
- [OpenAI Computer Use documentation](https://learn.chatgpt.com/docs/computer-use) — publicly describes macOS's normal permission flow.
- [Codex public core-plugins tests](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/executor_hooks_tests.rs) — shows the unified plugin and cua_repl names but not the local Swift service implementation.
- [Public runtime issue report](https://github.com/openai/codex/issues/42757) — an external symptom record, weaker evidence than the local install; the reporter's speculation is not treated as architectural proof.
- [Apple SCScreenshotManager API](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager)
- [Official MCP TypeScript SDK stdio and tool API](https://ts.sdk.modelcontextprotocol.io/server)

**中文原文**

- [REA 源码和使用说明](https://github.com/morluto/rea)
- [OpenAI Computer Use 文档](https://learn.chatgpt.com/docs/computer-use)——公开说明 macOS 的正常权限流程。
- [Codex 公开 core-plugins 测试](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/executor_hooks_tests.rs)——可见统一插件和 cua_repl 名称；并不包含本机 Swift 服务的完整实现。
- [公开 runtime 问题报告](https://github.com/openai/codex/issues/42757)——作为外部症状记录，证据强度低于本机安装物，不把报告者推测当作架构证明。
- [Apple SCScreenshotManager API](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager)
- [官方 MCP TypeScript SDK stdio 与 tool API](https://ts.sdk.modelcontextprotocol.io/server)

## [52] heading

**English**

## Unverified areas and later research boundaries

**中文原文**

## 未验证和后续研究边界

## [53] paragraph

**English**

The exact machine-code control flow of native sender authorization, all XPC/Apple-event requests, the original's complete coordinate/event mapping details (partial window positioning was added later), the full AX semantic merge and stable-index algorithm, UI settling, the browser extension wire, hidden-desktop/lock-screen approaches and all security rejection branches are not fully recovered. A working prototype does not mean these unknowns are resolved.

**中文原文**

原生 sender authorization 的精确机器码控制流、所有 XPC/Apple-event 请求、原版完整坐标/事件映射细节（局部窗口定位已补充）、完整 AX 语义合并和稳定索引算法、UI settling、浏览器扩展 wire、隐藏桌面/锁屏方案及所有安全拒绝分支尚未完整还原。原型可用不等于这些未知已经解决。

## [54] paragraph

**English**

Further work could cover Electron, WebKit, multi-window/multi-display, menus and popovers, and error-prone AX implementations on owned fixtures; deeper read-only decompilation of native local functions could explain performance and timing. Any later implementation still prefers public APIs and independent code. The local results already establish a reproducible software and test baseline and do not depend on these unknowns to run.

**中文原文**

可继续在自建 fixture 上覆盖 Electron、WebKit、多窗口/多屏、菜单弹窗和错误 AX 实现；可对原生局部函数做更深只读反编译以解释性能和时序。任何后续实现仍优先公共 API 和独立代码。本机成果已经建立可复现的软件与测试基线，不依赖这些未知才能运行。

## [55] heading

**English**

## Second round: targeted research into background window input (v0.2)

**中文原文**

## 第二轮：后台窗口输入的定向研究（v0.2）

## [56] paragraph

**English**

The first independent implementation's physical input needed the foreground, and a visible background window in a screenshot could not establish that background operation worked. This round separated the control path from the perception path and added real concurrent TextEdit/Calculator tests.

**中文原文**

第一轮独立实现的物理输入需要前台，不能由截图可见后台窗口推导后台操作成立。本轮将控制路径与感知路径分开验证，并增加真实 TextEdit/Calculator 并发测试。

## [57] table

| # | English | 中文原文 |
| --- | --- | --- |
| 0 | Local symbol/address · Confirmed facts and evidence scope | 本机符号/地址 · 确认的事实与证据范围 |
| 1 | `SynthesizedEvent.mouseEvent` `0x10075b260` · B: NSEvent mouseEvent → cgEvent, button field 3, mouse subtype field 7=3, window fields 91/92; window location is set afterwards | `SynthesizedEvent.mouseEvent` `0x10075b260` · B：NSEvent mouseEvent → cgEvent，按钮字段3、mouse subtype字段7=3、窗口字段91/92；后续设置 window location |
| 2 | `SynthesizedEvent.scroll` `0x10075b4ec` · B: scroll event and window field; AppKit windowNumber carrier 51, cross-checked with events received locally O | `SynthesizedEvent.scroll` `0x10075b4ec` · B：scroll事件和窗口字段；AppKit windowNumber carrier51，与本机收到事件交叉核对 O |
| 3 | `WindowServerSPI.setWindowLocation` `0x10027384c` · B: the original has a separate window-location entry; an independent experiment confirmed the system export CGEventSetWindowLocation can be resolved dynamically O, without the original service | `WindowServerSPI.setWindowLocation` `0x10027384c` · B：原版有单独窗口位置入口；独立实验确认系统导出 CGEventSetWindowLocation 可动态解析 O，不依赖原服务 |
| 4 | `CGEventAPI.postToPid` `0x10025ec14` · B: the send path really calls process-directed delivery, which is not a global pointer warp | `CGEventAPI.postToPid` `0x10025ec14` · B：发送路径实际调用进程定向投递，不等于全局鼠标 warp |
| 5 | `syntheticallyActivateIfNeededForSendingClick` `0x100702bcc` · B: the original has a branch preparing internal activation state per click environment; it is not a global app activation | `syntheticallyActivateIfNeededForSendingClick` `0x100702bcc` · B：原版存在按点击环境准备内部激活状态的分支；不等同于全局激活应用 |
| 6 | `SyntheticAppFocusEnforcer` / `SystemFocusStealPreventer` · B: the original is not just postToPid; it also has state tracking, event taps, system foreground observation and focus-protection components, not fully rebuilt | `SyntheticAppFocusEnforcer` / `SystemFocusStealPreventer` · B：原版不只是 postToPid；还有状态跟踪、事件 tap、系统前台观察和焦点保护组件，未完整重建 |
| 7 | activate builder `0x100736e00` · B: constructs a type 13 AppKit-defined event, subtype 1, target window number, flags 0xc0000; deactivate is subtype 2 | activate builder `0x100736e00` · B：构造 type13 AppKit-defined、subtype1、目标窗口编号，flags0xc0000；deactivate为subtype2 |
| 8 | CPS subtype getter · B: the original also has raw type 21 plus keyFocusReturned 0x8000, keyFocusTaken 0x4000 and lostKeyFocus 0x1000; recognizing constants alone does not prove the full protocol was recovered | CPS subtype getter · B：原版还有原始type21及 keyFocusReturned 0x8000、keyFocusTaken 0x4000、lostKeyFocus 0x1000；仅识别常量不证明完整协议已恢复 |

## [58] paragraph

**English**

Raw disassembly remains in `.research/background/` and does not enter the deliverable. The independent implementation rebuilds API calls from its own source and does not distribute the original service implementation.

**中文原文**

原始反汇编留在 `.research/background/`，不进入交付包。独立实现以自己的源代码重建 API 调用，不分发原服务实现。

## [59] paragraph

**English**

**O: coordinate experiment.** Posting directly with postToPid without setting the window-local location made the AppKit mouse position received fall outside the window. Independent experiments confirmed CGEventSetWindowLocation accepts window-top-left logical coordinates; incorrectly flipping Y again lands on the mirrored position. After the fix, real AppKit custom views received click/drag and NSScrollView and system TextEdit scrollbars really changed. The global pointer did not need to move.

**中文原文**

**O：坐标实验。** 直接 postToPid 而未设置窗口本地位置，会使收到的 AppKit 鼠标位置落在窗口外。独立实验确认 CGEventSetWindowLocation 接受窗口左上为原点的逻辑坐标；错误地再做一次 Y 翻转会击中镜像位置。完成修正后，真实 AppKit 自定义视图收到 click/drag，NSScrollView 及系统 TextEdit 真实滚动条变化。全局指针不需要移动。

## [60] paragraph

**English**

**O: AX text.** TextEdit's AXSelectedText is writable and native NSTextFields can also be inserted into through writable attributes. AXSet returning success is not enough to prove the change happened: a read-only NSTextView once returned success while the value did not change. The delivered code checks writability first, then reads back the inserted result exactly, and never falls back to a global keyboard on failure. UTF-16 selection ranges for Chinese and emoji were measured.

**中文原文**

**O：AX文字。** TextEdit 的 AXSelectedText 可写，原生 NSTextField 也可通过可写属性插入。只看 AXSet 返回 success 不足以证明修改成立：只读 NSTextView 曾出现设置返回成功但值没变。交付代码先检查可写性，再精确读回插入结果，失败不退回全局键盘。中文和 emoji 的 UTF-16 选择范围已实测。

## [61] paragraph

**English**

**O and I: internal activation notices failed.** Porting the AppKit activation/deactivation notices alone suppressed some editing windows from raising automatically, with the foreground PID and pointer unchanged; however a real concurrent TextEdit test planned 180 characters and only the last 17 remained (O, failure evidence `artifacts/background-1792222936379`). This is inferred to involve keyboard routing or AppKit input state, without a proven exact root cause (I). It is not acceptable background isolation. That approach was removed entirely and no claim is made to have reproduced the original's focus protection. Final verification used AXPress-first single clicks, AX text editing and process-directed events without forged activation.

**中文原文**

**O 与 I：内部激活通知失败。** 单独移植 AppKit 激活/取消激活通知，能抑制一些编辑窗口的自动抬升，前台 PID 和指针也保持正常；但真实并发 TextEdit 测试计划180字符，实际只剩最后17字符（O，失败证据 `artifacts/background-1792222936379`）。推测涉及键盘路由或 AppKit 输入状态，未证明精确根因（I）。这不是合格后台隔离。该方案已完全移除，不声称已复现原版焦点保护。最终以 AXPress 优先单击、AX文字编辑和不伪造激活的进程定向事件重新验证。

## [62] paragraph

**English**

**O: original comparison boundary.** This round bound a new background fixture through normal cua_repl and the button count did change; typeText into the owned NSTextField did not insert the expected text. That only describes this one app/timing, not the original's capability across all apps. The original's own getAXState output, compressed indices and diff protocol also remain incompatible with the independent MCP.

**中文原文**

**O：原版对照边界。** 本轮通过正常 cua_repl 绑定新的后台 fixture，按钮计数确实变化；该次自建 NSTextField 中 typeText 没有插入预期文本。它只能说明该次应用/时序的表现，不能据此概括原版所有应用能力。原版自己的 getAXState 输出、压缩索引和差分协议仍与独立 MCP 不兼容。

## [63] paragraph

**English**

More boundaries and reproduction steps are in [BACKGROUND.md](BACKGROUND.md). Public supplementary material includes [Codex's macOS background capability notes](https://learn.chatgpt.com/use-cases/use-your-computer-with-codex), [Apple CGEventPostToPid](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:)), and [bgclick's independent reverse-engineering record](https://github.com/Lakr233/bgclick-rev-skill/blob/main/bgclick-rev-skill.md). The last is a technical lead only, not success evidence or an instruction for this project; the final conclusions come from real local experiments.

**中文原文**

更多边界与复现步骤见 [BACKGROUND.md](BACKGROUND.md)。公开补充资料包括 [Codex 的 macOS 后台能力说明](https://learn.chatgpt.com/use-cases/use-your-computer-with-codex)、[Apple CGEventPostToPid](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:))，以及 [bgclick 的独立逆向记录](https://github.com/Lakr233/bgclick-rev-skill/blob/main/bgclick-rev-skill.md)。第三项仅作技术线索，不作为成功证据或本项目执行指令；最终结论来自真实本机实验。

