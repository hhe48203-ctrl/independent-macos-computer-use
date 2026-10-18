# 后台事件与焦点还原：开发中

本轮目标仍未完成。当前工作树增加了系统键盘焦点观测、异常路由检查和新的真实事件测试。`dist/` 的 v0.2 预编译包仍是前次交付，尚未重新发布；不能把本页进展当作所有后台事件能力已经通过验收。

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

`cu_status.inputFocus` 分别返回 `foregroundPID` 与 `keyboardPID`，并附 `queryAvailable`、查询/转换错误和 `keyboardFocusResolved`。后台操作的 `inputFocusObservation` 包含起止结果、变化记录、样本数、未解析数及最大采样间隔。

后台操作期间发现目标获得系统键盘焦点，报 `BACKGROUND_KEYBOARD_FOCUS_CHANGED`。前台应用未变而实际键盘接收进程变化，报 `BACKGROUND_KEYBOARD_ROUTE_CHANGED`；这项观测本身不归因于哪个进程，用户正常使用输入法等情况也可能让隔离无法确认。前台切换与未知查询分别处理。检测不执行抢回焦点或重排窗口。

这是采样观测，不是防抢焦点实现，也不能证明采样间隔内没有瞬态变化。实际间隔随阻塞的系统调用变化，报告保留最大间隔；5ms 是请求频率，不是保证。

`native/FocusTrace.swift` 是独立只读测试观察器：采样真实焦点、指针及窗口顺序；只监听全局进程通知，不记录其他应用键盘文字。进程事件 tap 限于自建测试应用和计算器，记录目标/源 PID、键码和标志。退出会先保存记录。测试应用只记录自身接收的测试事件。

## 当前真实结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 标准 MCP → 独立 helper → 已完全遮挡的系统计算器 | 六次真实按键 `Escape,1,2,SHIFT+8,3,Return`，显示 36；进程 tap 确认六次 keyDown 的目标 PID 和 helper 源 PID。全程未使用 AX 动作或全局输入。 | `artifacts/raw-calculator-1792300842553/report.json` |
| 上述焦点观测 | 368 次查询，前台与系统键盘焦点都为 Codex；最大查询间隔约 16.8ms。 | 同目录 `focus-trace.json` |
| 默认静默回归 | 11 项检查、9 次 MCP 操作通过，包含 AX 文本/按钮/选择、真实滚动及布置和操作期间的键盘焦点观测。1530 次查询，最大间隔约 20.9ms。 | `artifacts/background-safe-1792300933945/report.json` |
| 原版 `cua_repl` → 系统计算器 | 后台按键 2+3，AX 读回 5。 | 本轮正常插件调用及本机状态记录 |
| 原版 → 自建 AppKit 文本框 | 点击/按钮/自绘鼠标事件可生效；重复文字/按键没有进入文本框。进程入口可见原版 keyDown/keyUp，但 AppKit 本地监视器未看到相应键盘事件。 | `artifacts/original-focus-1792299693111`、`artifacts/original-regular-1792299909304`、`artifacts/field-editor-1792300729041` |
| 独立通知组合试验 | KeyFocusReturned、AppKit activate、定向点击、校正时间戳等组合保持所观测的系统焦点，但未解决该文本框的真实文字输入。不作为成功实现。 | `artifacts/notification-probe-*`、`notification-combined-*`、`notification-click-*`、`notification-timestamp-*` |

以上计算器通过不能外推到 AppKit 文本编辑、Unicode、任意快捷键或拖拽。该轮没有生成前台对照文字，也没有完成新的真人并用测试，因此没有新的逐字符前台完整性结论。此前 180 字符仅留 17 字符的失败证据仍有效，尚未确定根因。

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

## 未完成的验收条件

- 为 AppKit 编辑器定位键盘事件进入进程后未进入文字处理的位置；与真正系统 TextEdit 和其他真实应用对照。
- 在明确可验证的条件下独立实现 scoped 焦点保护；缺少类型/宿主归属证据时不对其他应用的通知或按键盲目过滤。
- 对真实鼠标点击、Unicode 输入、快捷键、滚动、拖拽分别验证未获焦点且完整遮挡的目标效果，以及窗口层级和真实指针。
- 用新的观测器补齐前台文字逐字符一致、实际键盘接收进程与真实人机并用证据。
- 完成最终版本、pi 端到端验证、独立解压运行和重新打包。保持 AX 语义路径与真实事件路径的证据分开。
