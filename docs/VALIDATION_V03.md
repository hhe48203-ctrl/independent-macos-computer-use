# 本机验证结果

## v0.3 当前验收

2026-10-18：真实文档、pi、系统计算器/TextEdit 操作及一次真人并用测试通过。直接 MCP 验证编码边界；pi 验证普通中文/emoji 及全部动作。18 项自动测试、11 项默认静默检查通过。全部使用正常本机 TCC。范围、采样间隔和历史失败见 [发布说明](RELEASE_NOTES.md)、[后台还原记录](FOCUS_FIDELITY.md) 与 `validation-index.json`。系统应用的可见布置不计作后台能力。

## 以下为保留的 v0.1/v0.2 历史记录

2026-10-17，America/Edmonton。本机为 macOS 26.6.2 (25G83)、arm64、Node.js 24.15.0、pi 1.2.0。运行测试时使用当前正常获得 TCC 的启动上下文。换客户端或机器需单独授权；不能把这些结果外推为所有应用或系统版本兼容。

| 验证 | 实际结果 |
| --- | --- |
| `npm test` | 11 项通过：参数/目标边界、图片结构、串行传输、原生错误、取消、超时、启动失败恢复、符号链接入口及真实 MCP schema 发现 |
| 前台回归（v0.1） | 21 个真实桌面检查通过；v0.2 保留为显式启用测试，用户报告干扰后未再次主动运行 |
| `npm run test:pi` | 通过；pi 通过原生 MCP 工具完成中文输入、按钮操作和重新观察 |
| Calculator | 真实 SwiftUI 应用，AX 按钮计算 `7 × 8`，AX 值和截图确认 `56` |
| 原版 CUA 对照 | 正常 `cua.getApp` 绑定自建 fixture，点击/键入后收到 AX diff |
| 预编译插件包 | bundle 后从 ZIP 解压到独立 `/tmp` 目录启动；17 工具发现和原生 status 调用通过，不需要 checkout 的 node_modules |
| 本机配置 | `.pi/mcp.json` 已添加项目级服务器；全局 pi/Codex 配置未改动 |

v0.1 的 21 个桌面检查包括：MCP 初始化和 17 个工具发现、TCC 状态、真实窗口枚举、PNG 与 AX 联合观察、安全字段屏蔽、中文/emoji 输入、CMD+A 替换、AX press、元素点击、坐标点击、AX setValue、真实拖动、真实滚动、本地 OCR、拒绝越界/未知 ID/安全输入/默认剪贴板/越权应用与全屏截图、空白名单全部拒绝、取消拖动后释放鼠标、有界树的 truncated、菜单栏观察、UTF-16 文本消歧和替换、排除系统 Apple 菜单后的应用菜单操作。

v0.1 的 pi 运行记录了 7 次 MCP 调用：status → windows → snapshot → ax_action(focus) → type_text → ax_action(press) → snapshot。测试 app 自己写出的状态为：

```json
{
  "input": "pi desktop verified 中文",
  "result": "Result: pi desktop verified 中文 [1]",
  "count": 1
}
```

这同时验证了 Agent 选择工具、MCP 参数、Node→Swift 通信、真实 AppKit 输入和可观察结果。测试禁用 pi 的内建文件/shell 工具、其他扩展与其他 MCP 工具，仅显式保留内建 MCP 支持和本服务器。没有通过修改 fixture 状态文件伪造结果。

原始本机证据保存在 `artifacts/desktop-test-report.json`、`pi-test-report.json`、`calculator-test-report.json`、fixture PNG、Calculator PNG 和 pi JSONL 事件中。它们不进入插件或源码包。`docs/evidence-manifest.json` 只包含调查对象的身份、哈希、REA 元数据和限制，不包含原版源代码。

第一次 pi 测试发现 `--no-extensions` 同时关闭了 pi 的内建 MCP，导致模型没有可调用工具；补上 `--extension builtin:mcp` 后实测成功。第一次 fixture 快捷键检查因测试 app 没有标准 Select All 菜单失败；补齐 AppKit 菜单后成功。REA 的 Wakaru source recovery 不可用，如实记录在调查文档；静态图和 Mach-O 分析已实际完成。

把预编译 ZIP 真正移到 `/tmp` 后，测试还发现 macOS `/tmp`→`/private/tmp` 路径规范化导致入口判断失败。入口现按 realpath 比较，增加了通过符号链接启动并执行 MCP initialize/tools/list 的回归测试，之后外部解压验证通过。

未测试：Intel Mac、macOS 14/15、真实多显示器、所有 Electron/浏览器 app、长期运行、复杂 IME composition、锁屏/后台独立桌面、用户主动抢占焦点的全部时序、系统拒绝 TCC 时的交互授权路径。TCC 拒绝分支基于公共 API 的返回值实现，未修改本机权限来人为制造拒绝。取消可释放正常执行中的拖拽，但硬杀被阻塞的进程不能提供事务保证。


## v0.2 后台验收（第二轮）

完整报告：[background-1792223272595/report.json](../artifacts/background-1792223272595/report.json)。这是删除内部激活通知后的标准 MCP 实测；测试使用 macOS 自带 TextEdit、Calculator 和独立 AppKit fixture。

- 完全遮挡时目标 AX、PNG 和 Vision OCR 内容正确。
- AppKit 与 TextEdit 的后台 Unicode 插入、UTF-16 选择替换和真正的 NSScrollView/文档滚动读回通过。
- TextEdit CMD+A 走 AXSelectedTextRange 并验证；不声称原始快捷键投递可靠。
- Calculator 的 AX 按钮闭环计算 7×8=56，目标在每步前后均被 TextEdit 完全遮挡。
- 前台 TextEdit 在 8.028 秒受保护 HID 轨迹中实际收到了全部 177 个计划字符，逐字符完全相同；期间后台反复操作 Calculator，并编辑另一个目标应用。
- 采样期间前台 PID 始终为前台 TextEdit，指针只落在测试驱动生成的位置，没有 Calculator 激活。
- 同一次运行中，自定义视图拖拽投递通过；原始鼠标点击触发 BACKGROUND_WINDOW_REORDERED，是已记录的隔离失败，不计为通过。按钮单击默认 AXPress 通过。

测试使用的合成输入不是人类输入。真人并用另写 human-report.json，必须包含参与者反馈才能声称真人体验通过。原始鼠标事件的应用支持仍有限；没有用前台恢复或忽略失败来凑“全部通过”。


真人第二轮持续 31.718 秒，60 次后台 AX 按钮动作完成12次计算，3080条采样无目标前台激活。参与者回复“我已输入并移动鼠标，使用正常”。但采样与动作边界均未捕获指针变化；时序/会话重合不能由仪器记录独立确认，不能把这轮描述成已测得真人鼠标轨迹无干扰。保留 human-report.json 和未操作的上一轮 idle 记录，最终反馈与测量证据分开。


## 最终默认后台路径：修正测试抢窗口后

[最终静默报告](../artifacts/background-safe-1792223945398/report.json)包含13个通过检查、29次真实 MCP 操作。原生 foregroundEnabled=false；自建 accessory 窗口 orderBack 后相对排序，没有 activate、cu_focus 或全局输入。开始/结束以及连续采样的前台始终为 Codex PID60201。

复用仍存活的测试窗口，不启动/聚焦/调整系统应用：Calculator 在旧 TextEdit 下完整遮挡，AX按钮计算56；旧自建 TextEdit 文档在当前 Codex 窗口下完整遮挡，AX替换110行测试文字、中文/emoji替换、定向滚动及滚动条读回通过。没有为了达成遮挡而改变用户窗口布局。

真人补充确认：在同一台 Mac 的 Codex 输入框输入，文字完整。之后用户报告 TextEdit 和 Background Automation 抢到了前面；这与原交互式测试的前台布置相符，但缺少逐事件的人类反馈时间关联，不能排除已记录的原始事件抬升问题。修正措施是默认原生层禁用所有前台请求、未知mode拒绝，交互式测试显式启用，默认测试改为不激活布置。最近的13项通过仅代表这条修正后的路径，原始鼠标/通用快捷键不因此升级为全面兼容。


最终 v0.2 pi 通过：7次工具尝试，其中一次 cu_click 同时给了pid/windowId和元素引用，被schema拒绝；模型自行去掉多余目标参数后成功。真实结果为 `Result: pi desktop verified 中文 [1]`，active=false、key=false。前后均完整遮挡、前台均为Codex；2390条采样无目标前台激活，未调用cu_focus。pi-report与去除模型/会话文本的MCP调用摘要进入证据包。11项自动测试通过；预编译ZIP从仓库外解压验证17个工具、原生0.2.0后端与默认FOREGROUND_DISABLED拒绝。


预编译包不仅通过status：`scripts/packaged-background-test.mjs` 将实际ZIP解压到仓库外的临时目录，去掉NODE_PATH和前台开关，标准MCP客户端用该包连续按下计算器5个AX按钮并确认56，操作前后完整遮挡，原生 foregroundEnabled=false。报告和截图进入证据包。测试不启动、激活或调整任何应用。可对仍存活的自建目标运行 `CU_TEST_EXISTING_TARGETS=/absolute/path/to/old-report.json npm run test:packaged-background`。
