# 后台事件与焦点还原：开发中

[English version](../FOCUS_FIDELITY.md)

当前安装物已更新。2026-10-22的组件身份、接口/行为对照和重新逆向函数见 [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md)。本页保留历史日期及原生哈希范围，旧地址不能直接套用于新服务。

本页记录 v0.3 的调查、更正、实测范围及仍未移植的机制。当前实现包含系统 key-focus 观测、异常路由检查、独立真实事件和默认关闭的局部 AppKit 焦点路径；当前 OS 的文档、pi、系统应用及一次真人并用已验证，不能外推为任意应用或每个瞬间都隔离。

## 证据范围

本机应用 UI 更新为 `26.1013.40934`，`SkyComputerUseService` 的 SHA-256 仍为 `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`。下述地址只对该二进制成立。

REA 6.5.0 调用了 Ghidra 12.1.4。官方分发包的 SHA-256 校验通过，原生 arm64 反编译器从其官方源码构建。整文件分析在 600 秒后超时；自有 JVM 的线程栈显示当时在 Swift demangler 中处理符号。随后将焦点代码映射为原地址的 65,948 字节片段，使用来自符号表的 188 个函数起点定向分析，成功获得焦点相关伪代码；又扩展到 102,460 字节继续分析辅助函数。

片段缺少完整 Mach-O 类型、外部函数原型和 Swift async 调用约定。函数起点是分析者提供的种子，不能当作自动发现；参数含义须回到 ARM64 指令验证。导入桩和 Objective-C selector 另由 dyld fixups 对照。原始二进制片段、反汇编、伪代码和 REA 快照均留在忽略的 `.research/`，不进入交付包。

## 已确认的机制

| 事实 | 依据与限制 |
| --- | --- |
| 前台应用与实际系统键盘接收进程是不同观测量 | 原版 `ApplicationRegistrySPI.getKeyFocusProcess`，独立调用 `CPSGetKeyFocusProcess` → `GetProcessPID` 成功。这里只读，不申请或窃取焦点。 |
| 查询需要正常 GUI 进程注册 | 无 AppKit run loop 的命令行试验返回 1003；无窗口 accessory 进程启动 run loop 后返回 0。未知结果保留 null，绝不用前台 PID 代替。返回的额外布尔标志保留原值，语义尚未确认。 |
| 原版区分三种内部状态 | 反射字段为 `applicationBelievesItIsActive`、`applicationBelievesItHasFocus`、`applicationIsActive`。内部 AppKit 状态不等于真实系统焦点。 |
| 焦点保护涉及事件 tap、通知和状态机 | `SystemFocusStealPreventer` 的全局进程通知 tap、按进程键盘/鼠标 tap、`currentFocus`、`previousFocus`、`suppression` 均由符号、反射和调用点交叉确认。 |
| 特殊辅助进程需要单独处理 | `0x100758ef8` 按名称模式 `ViewBridgeAuxiliary` 查找进程。不能把这一路径误认为 Sky 服务自己的 PID。 |
| 特定键盘转送排除自身事件 | `0x100756280` 检查 source PID；`0x100756370` 在 suppression 存在且事件目标匹配 thief PID 时，向记录的 victim PID 重投并抑制原事件。这不是任意键盘事件的通用重定向规则。 |
| 原版可释放关联焦点请求 | `0x100755bbc` 读取事件字段 71，调用 `ApplicationRegistrySPI.releaseKeyFocus(withID:)`。独立代码尚未调用该可变更状态的系统接口。 |
| 原版有激活修复分支 | `safelyEnforceActiveState` 暂停更新、安装临时 tap，并保留原前台应用；其中一个分支在目标意外成为前台时对原前台调用 `activateWithOptions:0`。它不能作为独立实现绝不短暂改变焦点的证明。 |

进程通知的常数已由常量初始化指令确认：事件类型 21，字段 64 是通知子类型，字段 71 是上述焦点请求 ID，字段 73 是通知关联 PID。子类型包括 NewFront=2、LostKeyFocus=0x1000、KeyFocusTaken=0x4000、KeyFocusReturned=0x8000、KeyFocusChanged=0xf102、LostTypingFocus=0xf105、TypingFocusChanged=0xf107。字段 73 在不同子类型中所指角色不同，不能统一命名为 sender。

## 状态机的当前理解

以下是由指令、伪代码和反射字段推导的抽象模型，尚非完整动态验证：

1. KeyFocusTaken 的关联进程属于受保护应用时，记录 thief PID、其应用 PID、victim PID 和释放/返回抑制标志，抑制相应通知。
2. 返回给 victim 的特定 KeyFocusReturned 通知只抑制一次，记录 `suppressedReturnEvent`。
3. 指向观测辅助进程的 KeyFocusChanged 通知更新 current/previous focus，通知相应目标回调，并在匹配 suppression 时释放关联请求。原版还有 ViewBridge 类型/宿主归属判断，不能删掉这些条件。
4. ViewBridge 键盘 tap 排除自身产生的事件，仅在匹配记录时向 victim 重投；NewFront 等通知参与清理 suppression。

`Focus` 枚举的 `regularApp`/`viewService` 分支，以及 `suppression` 字段名已确认；具体布局和分支语义仍须逐项对照动态记录。当前生产 helper 没有移植这个通知过滤状态机，也没有发送虚假激活通知或执行激活后恢复。

## 独立实现新增内容

`cu_status.inputFocus` 分别返回 `foregroundPID` 与 `keyFocusPID`（兼容字段 `keyboardPID`），并附 `queryAvailable`、查询/转换错误和 `keyboardFocusResolved`。后台操作的 `inputFocusObservation` 包含起止结果、变化记录、样本数、未解析数及最大采样间隔。

后台操作期间发现目标获得系统键盘焦点，报 `BACKGROUND_KEYBOARD_FOCUS_CHANGED`。前台应用未变而实际键盘接收进程变化，报 `BACKGROUND_KEYBOARD_ROUTE_CHANGED`；这项观测本身不归因于哪个进程，用户正常使用输入法等情况也可能让隔离无法确认。前台切换与未知查询分别处理。检测不执行抢回焦点或重排窗口。

若另一应用仍在前台，而目标已接收系统键盘输入，新的后台输入请求会在投递前报 `BACKGROUND_KEYBOARD_FOCUS_ALREADY_TARGET`。只读观察仍可用。这能拦截原生拖放中断后的后续输入，已经发生的焦点变化仍会保留在记录中。

这是采样观测，不是防抢焦点实现，也不能证明采样间隔内没有瞬态变化。实际间隔随阻塞的系统调用变化，报告保留最大间隔；5ms 是请求频率，不是保证。

`native/FocusTrace.swift` 是独立只读测试观察器：采样真实焦点、指针及窗口顺序；只监听全局进程通知，不记录其他应用键盘文字。进程事件 tap 限于自建测试应用、计算器和明确指定的 TextEdit 测试进程；TextEdit 只记录带已知测试标记的键盘事件，不记录用户键盘文字。记录目标/源 PID、键码和标志。退出会先保存记录。测试应用只记录自身接收的测试事件。

## 当前真实结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 标准 MCP → 独立 helper → 已完全遮挡的系统计算器 | 六次真实按键 `Escape,1,2,SHIFT+8,3,Return`，显示 36；进程 tap 确认六次 keyDown 的目标 PID 和 helper 源 PID。全程未使用 AX 动作或全局输入。 | `artifacts/raw-calculator-1792300842553/report.json` |
| 上述焦点观测 | 368 次查询，前台与系统键盘焦点都为 Codex；最大查询间隔约 16.8ms。 | 同目录 `focus-trace.json` |
| 默认静默回归 | 11 项检查、9 次 MCP 操作通过，包含 AX 文本/按钮/选择、真实滚动及布置和操作期间的键盘焦点观测。1530 次查询，最大间隔约 20.9ms。 | `artifacts/background-safe-1792300933945/report.json` |
| 原版 `cua_repl` → 系统计算器 | 后台按键 2+3，AX 读回 5。 | 本轮正常插件调用及本机状态记录 |
| 旧自建 AppKit 文本框键盘测试（含原版对照） | **受测试器缺陷污染**：记录器对键盘事件读取 `NSEvent.subtype` 抛出异常，导致输入被丢弃。不能据此判断原版或 AppKit 的兼容性；原始记录保留。 | `artifacts/original-focus-1792299693111`、`artifacts/original-regular-1792299909304`、`artifacts/field-editor-1792300729041`；下文更正 |
| 旧独立通知组合试验 | 同一记录器缺陷影响文字效果。焦点和窗口采样可保留原始观测，文字失败不能归因为系统路由限制。 | `artifacts/notification-probe-*`、`notification-combined-*`、`notification-click-*`、`notification-timestamp-*` |

这些早期结果不能外推到任意应用。该检查点尚无新的逐字符真人结论，后续完整文档并用验证另列在本页末尾。此前 180 字符仅留 17 字符的旧原型失败保留，不能倒改为成功。

### 新的独立真实输入证据

- `artifacts/raw-textedit-1792302014249/report.json`：未被原版服务操作的新 TextEdit 实例，标准 MCP 真实 `CMD+Down` 和 Unicode 事件，精确读回中文、emoji、组合附加符、家庭 ZWJ 和换行；不生成 AX 动作。
- `artifacts/pi-raw-text-1792302258660/report-corrected.json`：pi 只使用本 MCP 的工具，6 次调用、0 工具错误，精确追加中文 emoji 文本，目标/源 PID 与系统键盘焦点均有独立记录。原始验证器误读 pi 的嵌套结果结构，保留原失败报告，离线修正验证器后复核同一份原始记录，没有重发动作。
- `artifacts/raw-pointer-1792303650093/report.json`：完全遮挡的自建普通 AppKit 应用收到真实点击、滚动和 30 个拖动事件；34 个鼠标包在 AppKit 中均无修饰标志，点击/拖动的逐包投递确认通过。1485 次系统焦点查询未观察到目标获焦，最大间隔约 20.1ms。
- `artifacts/raw-stock-pointer-calculator-1792303703557/report.json`：前三次真实按钮点击保持遮挡，第四次后计算器升层，前台与键盘 PID 仍为 Codex。服务报告 `BACKGROUND_WINDOW_REORDERED` 并停止。此结果不计为通过。
- `artifacts/raw-stock-pointer-textedit-1792303754031/report.json`：长 Unicode 突发丢字，失败后只读快照保留。新版将换行、回车和 Tab 单独成包，并对每包执行精确 UTF-16 读回屏障，不重试输入。
- `artifacts/raw-stock-pointer-textedit-1792303899275/report.json`：上述修正后长文本操作通过精确校验，随后 TextEdit 拖动升层，整轮仍失败。

### 独立鼠标投递替代方案

新代码并未复制原版焦点通知过滤器。它利用 Command 背景点击的系统路由，在目标进程的事件 tap 中、AppKit 接收之前去掉临时 Command 标志。过滤条件同时限定 helper 源 PID、目标 PID、窗口号和每操作标记；不发送全局修饰键按下/释放，不改用户硬件事件、不伪造激活通知、不恢复前台。每个包必须被观察并去掉标志，否则报错，部分效果不自动重试。

本机试验发现 `CGEventSetIntegerValueField(eventSourceUserData)` 的第二次写入保留第一次值；因此标记只赋值一次，并在发送前读回确认。最初怀疑高位截断，后被未投递事件的本地试验排除。

自建 EventPad 的成功不能证明 AppKit 控件和所有系统应用都不会升层。真实应用的上述失败驱动后续调查：原版同一次点击的 down/up 使用相同事件号，生产试验已改为每手势一致的有界事件号与持久事件源，结果须以新报告为准。

## 测试布置修正

用户确认 TextEdit 和 Background Automation 曾来到前面；旧交互测试布置存在主动激活，已加显式开关。进一步实验发现直接启动 `.regular` AppKit 进程即使不显式调用 activate，也可能自动成为前台：本轮一次捕捉到约 3.9 秒。该轮列为布置失败，停止其窗口，直接 regular 启动继续受交互开关限制。

新的普通应用对照使用 Launch Services 的 `open -g`，应用仍执行 orderBack 和相对遮挡排序，观测从启动前开始。默认回归仍使用 accessory 应用。每次编译前检查旧测试进程，拒绝覆盖正在使用的 Mach-O；观察器使用每轮独立的可执行文件。

复现已存在的计算器真实事件验证：

```sh
npm run build
npm test
npm run test:background
node scripts/raw-calculator-test.mjs CALCULATOR_PID WINDOW_ID EXISTING_COVER_ID
```

最后一条只使用调用者明确指定、已完全遮挡的计算器窗口和现有遮挡窗口；不启动应用、不激活、不布置窗口。它会清除计算器当前表达式并计算 12×3。测试报告单独说明其范围。

## 验收状态与剩余边界

- 已验证直接 MCP 的复杂 Unicode、真实按键/指针与 pi 全流程；自建控件旧键盘失败来自测试记录器，原版新对照可导航/全选但该次中文载荷没有投递，见后文。
- 独立 scoped 通知、精确激活点、源过滤指针确认与清理已集成。原版 ViewBridge 宿主归属和全局抑制/转送状态机仍未移植，不对未知的他人通知或按键盲目过滤。
- 计算器及 TextEdit 的新操作阶段验证通过，旧升层失败保留。可见测试布置单独计量，不属于后台动作。
- 新观察器已记录完整约定前台短句、实际接收进程和真实指针移动；仅代表一次当前 OS 自建文档场景，采样间隔与手动改字保留。
- 交付包的实际外部解压验证另列于 validation-index.json。AX 语义路径与真实事件路径保持独立证据。

## 后续定向分析与取消验证

- REA/Ghidra 又分析了激活事件构造器的 8,448 字节切片（76 个显式函数种子；切片 SHA-256 `8ea74d7a77087da817eb3a1cbb68fc59470e8746a82acc322908ed1b653f3871`）。`0x100736e00` 在窗口号非零时，把 AppKitDefined subtype 1 的 flags 设为 `0xc0000`，ARM64 参数赋值确认。此位值恰与 Control/Option 修饰位相同，但在该私有通知中的完整语义未证实。
- `artifacts/scoped-activation-1792304316887`、`scoped-activation-1792304362996`：独立试验使自建 AppKit 应用内部 active/key 暂时为 true；系统 key focus 保持 Codex，目标保持遮挡。keyDown 进入应用队列但未进入文本控件，因此不是通用真实输入方案，没有进入默认实现。
- `artifacts/raw-pointer-cancel-1792304060897/report.json`：收到 3 个拖动后取消，目标按下/松开各 1 次，AppKit 鼠标 flags 全零，没有窗口升层。更新为每手势持久事件源后，`artifacts/raw-pointer-1792304572543/report.json` 的点击/滚动/拖动回归也通过。
- 静态指令验证了当前 OS `SLPSGetTypingFocusProcess` 包装器不使用输入参数，返回一个 32-bit 回复值。独立只读原型返回 79595，与当时 Codex PID 一致；把它当作 PSN 转换返回 -600。其值可能是 typing PID，仍需更多调用点/跨进程状态验证，暂不进入生产实现。

`CPSGetKeyFocusProcess` 返回的是 registry key focus；它与 hardware typing-focus 分开。生产 API 现明确给出查询来源与 `keyFocusPID`，保留 `keyboardPID` 兼容字段。真实前台逐字符完整性须靠明确测试文字的读回及真人并用验证，不能只凭任何一个 PID 查询证明。

真实 TextEdit 的 `open -g -n` 启动仍可能把新窗口排在当前前台窗口上方，即使从未改变前台 PID。已保留两轮启动阶段失败，`fresh-stock-test.mjs` 因此要求 `CU_TEST_ALLOW_FOREGROUND_SETUP=1` 的显式交互布置；它不是默认静默回归。所有本任务启动的旧计算器/TextEdit 实例已在保存测试状态后清理。

### 激活点语义更正

继续追踪 `0x1015397a0` 的静态属性及 `0x1007a2c64` 初始化，确认原版读取的是 `UIElementAttribute.activationPoint`，不是 `titleUIElement`。此前对“标题点击”的描述属于过早推断。原版构造器在获得窗口 `AXActivationPoint` 和 frame 后构造该点的鼠标包；无该点时退回仅 AppKit 通知路径。新的独立实验实现只使用观测到的有效 `AXActivationPoint`，缺失时在发包前失败，不猜标题坐标。

### 标准控件与内部焦点实验

`artifacts/raw-controls-1792304690142/report.json`：默认真实事件路径完成 6 次 NSButton 点击，但非活动 NSTextView 的拖动未产生选择，整轮失败。`artifacts/raw-controls-1792304790062/report.json`：外部自建原型临时建立内部 active/key 状态后，同样 6 次按钮点击和拖动选中 31 个 UTF-16 单元通过；1567 次 key-focus 查询均为 Codex，最大间隔约 20.1ms。此原型仍使用手工选定点；生产实验正在改为准确的 AXActivationPoint，并增加作用域清理与可观测性。不可把原型通过当成生产集成通过。

`CU_EXPERIMENTAL_APPKIT_FOCUS=1` 是待验收的开发开关，默认关闭。它为真实鼠标点击/拖动、Unicode 和非语义按键尝试局部通知，不增加全局激活/修饰键事件，不执行前台恢复，不移植未知的 ViewBridge 键盘转送规则。文字仍要求开始前已存在的精确内部编辑焦点，准备期间选择范围变化则拒绝发文字。目前 typing-focus 原始回复诊断的 ABI 仅在本轮 macOS 26.6.2 arm64 核对，实验路径因此限定该 OS；它仍不能代替前台逐字符验证。

### 集成实验与真人观测（后续）

- `artifacts/raw-controls-1792305862671/report.json`：实验 helper + `CU_EXPERIMENTAL_APPKIT_FOCUS=1` 的集成路径通过 6 次真实 NSButton 点击及 NSTextView 拖动选中 31 个 UTF-16 单元，71 个录制窗口顺序样本无违规，1571 次 key-focus 查询保持 iTerm PID 60023（最大间隔约 17.0ms）。每次操作使用观测到的 AXActivationPoint，生成 4 个局部通知；点击确认 4 包，拖动确认 34 包。实验 typing-focus 原始回复也保持 60023。这是集成的自建标准控件验证，不是系统 TextEdit、前台输入或通用应用验收。
- 先前集成启动阶段数次 `AX_WINDOW_UNRESOLVED` 坚持拒绝动作，未放宽身份/几何匹配；新增只读几何诊断和测试侧启动就绪重查。后续通过不能证明这些间歇失败的根因已经确定。
- `artifacts/human-raw-1792305405366/measurement-review.json`：参与者确实操作 Codex；69 次真实后台鼠标 MCP 操作、操作窗口内 36 个指针位置、已录制窗口层级无违规。观察器记录了逐步增长且匹配的前 26 个字符，计时结束后完整 45 字符精确读回。保留原始未通过报告，不能把完整行的事后读回算作全部发生在 30 秒内。
- `artifacts/human-raw-1792305609342`：参与者输入的第二行 15 字符也事后精确读回，旧持续观察器没有捕捉。原始未确认报告保留，没有倒改为成功。观察器此前只跟随 AXFocusedUIElement，而 Codex 的该对象可落在 WebArea；现增加启动时只缓存输入字段的定位，再对已知标记进行限定范围比较。`artifacts/human-observer-readonly-1792305800/locator-check.json` 验证新定位能找到现存完整短句；它只是定位检查，不是新真人并用测试。

暂不要求参与者继续重复输入。仍须在修正后的观察器下完成新的完整并用验收，实验机制依旧默认关闭。

### 键盘记录器缺陷的定位与更正

`artifacts/raw-document-1792307688920` 的自有进程诊断逐个包装了该测试应用自己的事件观察回调，保持每个原回调只调用一次。NSRemoteView、NSSpellChecker 和 TextInputUI 的回调均返回原键盘事件；进入我们自己的记录回调后没有正常返回。因此此前对 ViewBridge 提前接管的怀疑未获支持。独立、不投递输入的 Objective-C 试验确认：键盘 NSEvent 的 `subtype` getter 抛出 `NSInternalInconsistencyException`。AppKit 的事件循环捕获该异常后，该次按键没有继续分发。

记录器现按事件类型读取属性。`tests/native-fixture-record.test.mjs` 构造真实 NSEvent keyDown/keyUp 和有效通知，只调用实际记录函数，不启动窗口、不投递输入；旧的不加区分读取会使该回归进程失败。默认静默测试也验证记录器不会破坏正常鼠标/滚动处理。原版进程及其回调没有被修改；所有内部观察原型仅在忽略的研究目录及自有测试进程中运行，不进入交付包。

`artifacts/raw-document-1792307835777/report.json`：正常构建的独立 helper、标准 MCP stdio、显式实验开关，在全新且完全遮挡的 AppKit 文档中通过 7 次真实操作：从已知开头移动到末尾、中文/emoji/组合符/ZWJ/换行精确插入、真实 CMD+A 全选、CMD+Up、拖动选择、滚动、按钮点击。121 个录制层级比较无违规，2088 次 key-focus 查询保持 Codex PID 79595，最大间隔约 16.3ms。进程 tap 验证 8 个 keyDown 的目标与 helper 源 PID。文档初始光标现固定为 0，避免“原已在末尾”造成导航键假阳性。

这项通过不覆盖系统 TextEdit/Calculator 的新鼠标验证或前台真人文字完整性，也没有证明原版 ViewBridge 抑制/转送状态机已经移植。旧的系统应用升层失败、真人观测未确认记录继续保留。

### 完整文档路径的真人并用验证

`artifacts/human-raw-1792308602084/report.json`：参与者确认准备后开始，前缀出现后测量约 31.3 秒；后台实际共运行约 58.4 秒、19 轮、133 次真实事件操作，含 19 次中文/emoji 文字插入，以及导航/全选按键、点击、选择拖动和滚动。前台 Codex 中的新短句 `CUH-9470-abcdef` 完整 15 个 UTF-16 单元在操作结束前被精确读回 11 次。观察到 8～15 的增长过程；中途第 10 字符不同，参与者随后明确确认“改过，也退格过”，保留于 `participant-feedback.json`。

只读 Codex 进程键盘 tap 在约定期间记录到 32 次 keyDown、32 次 keyUp，原始源 PID 均为 0、目标字段均为 Codex PID 79595；没有读取键码、修饰符或键盘文字，也没有把后台 helper 的事件当成人工输入。测量段有 1759 个不同指针位置。3370 条已存记录的窗口顺序比较无违规（窗口列表每 50ms 刷新），15226 次 key-focus 查询均为 Codex，最大查询间隔约 154.9ms；间隔不是连续无瞬态干扰的保证。

这是自建 AppKit 文档、当前 OS、显式实验开关下的一次真实并用通过；不能外推为任意应用或所有用户输入都无损。此前失败/未确认报告未改写。系统应用鼠标兼容性仍须新的操作阶段验证；可见布置单独计量，不能当成后台能力。
