# Background Window Automation

v0.3 增加 registry key-focus 观测、真实 Unicode 事件、源过滤鼠标确认，以及默认关闭、限定 OS 的 AppKit 局部状态路径。当前 OS 的系统计算器、TextEdit 和一次真人并用通过。范围与边界见 [发布说明](RELEASE_NOTES.md)、[焦点还原记录](FOCUS_FIDELITY.md)。下文明确保留 v0.2 历史证据，不能混为新的真实事件验收。

v0.1 的物理输入是前台操作；首次交付不能满足本轮后台要求。v0.2 增加独立的默认后台路径。这里区分三种机制，避免把“没有移动鼠标”误当作“没有干扰用户”。最终结果以本机 artifacts 的标准 MCP 实测报告和真人反馈为准。

| 能力 | 机制 | 边界 |
| --- | --- | --- |
| 遮挡窗口 AX / PNG / OCR | AXUIElement、SCK desktopIndependentWindow、Vision | 目标须在当前已解锁 GUI 会话；不承诺最小化/其他 Space |
| 单击按钮 | auto 默认先用 AXPress；坐标在目标窗口 AX 树内解析 | 只保证控件暴露的语义动作；不伪装为真实鼠标事件 |
| 自定义控件鼠标事件 | NSEvent → CGEvent + 窗口字段 + CGEventSetWindowLocation → postToPid | SPI 未公开；控件可能忽略或自行抬升窗口，必须验证 |
| Unicode 文字插入 | AXSelectedText 或 AXValue，替换当前 UTF-16 范围并精确读回 | 可编辑 AX 控件；不模拟键盘布局、输入法 composition、按键监听器 |
| 显式真实 Unicode 事件 | `cu_type_text strategy:event`，已聚焦元素，逐包精确 UTF-16 确认 | 无 AX 写入、无输入法 composition；框架可忽略或变换包，失败不重发 |
| 选择与全选 | AXSelectedTextRange，CMD+A 优先 AX | 需要控件支持可写选择范围 |
| 普通键和快捷键 | postToPid，只发送主键和 modifier flags | 应用接收行为不一致；事件投递成功不表示 UI 生效 |
| 滚动 / 拖拽 | 目标 PID/窗口定向 CGEvent | 滚动已在原生滚动区域验证；拖拽依应用状态，尤其编辑后可能抬升 |
| 显式前台操作 | CU_ENABLE_FOREGROUND=1 后才允许 cu_focus / mode:foreground | 允许抢占焦点、移动真实鼠标；不属于后台能力 |

所有后台路径都不调用 activate/AXRaise/global HID 输入，不临时抢前台再恢复，不移动真实指针，不借用原版服务或 TCC 身份。后台失败不会自动选择前台模式。

## 验收方法

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:background
npm run test:pi
```

默认 `npm run test:background` 不激活应用，不生成全局输入。自建 AppKit 窗口先 orderBack，遮挡窗口再相对排在目标之上，仍位于用户窗口之后。每步由 CGWindowList 的 z 顺序、矩形和 alpha 证明完整遮挡，再读回真实 UI 效果。SCK 截图和 OCR 检查目标内容。可通过 CU_TEST_EXISTING_TARGETS=旧实测报告路径，复测仍存活的原测试 TextEdit 和 Calculator 窗口；不新启动、聚焦或调整系统应用。TextEdit 只在现有窗口已完全覆盖它时才操作，且核对自建文件标题。

原来的完整布局/并发驱动脚本保留为交互式测试，必须显式运行 `CU_TEST_ALLOW_FOREGROUND_SETUP=1 npm run test:background:interactive`；它会激活测试窗口并生成前台字母和鼠标轨迹。显式前台模式回归同样要求 `CU_TEST_ALLOW_FOREGROUND_SETUP=1 npm run test:desktop`。这些测试布置不属于后台动作，不能在人仍正常工作时静默执行。

AppKit 观察进程以 5ms 定时器采样全局前台 PID 和真实指针位置，并监听应用激活通知；不采集其他应用的键盘内容。定时采样不是每个瞬间的数学证明，因此同时要求真实前台 TextEdit 输入逐字符完整，以及指针轨迹只包含测试驱动计划的位置。测试驱动在每次键入前核对前台 PID，不一致即终止。它只向新建的测试文档生成字母，不向用户的文档键入。

此合成并发验收是真实 GUI 应用测试，不是 mock，但也不称作真人测试。真人阶段另运行 `node scripts/human-background-test.mjs /absolute/path/to/artifacts/background-RUN`；仅在明确允许前台测试时，先运行 `CU_TEST_ALLOW_FOREGROUND_SETUP=1 CU_KEEP_TEST_APPS=1 npm run test:background:interactive` 留下目标和观察器，得到 KEEP_READY 后，向参与者宣布 30 秒开始。真人自由使用其他应用，测试仅做后台计算并记录 PID/指针和目标窗口状态。结束后收集参与者的实际感受；没有反馈时报告保留 awaiting-human-feedback。

## 已发现并排除的错误方案

原版有 SyntheticAppFocusEnforcer 和 SystemFocusStealPreventer。独立试验仅发送 app-local AppKit 激活通知，确实能解决某些编辑窗口被点击后抬升的问题，且 NSWorkspace 前台 PID、物理鼠标看起来不变。然而并发 TextEdit 输入只保留了计划 180 字符中的最后 17 字符。这说明仅靠前台 PID 和鼠标位置会误判隔离；内部通知可能改变键盘路由或 AppKit 输入状态，精确原因仍是推断。

v0.2 删除了该旧原型。v0.3 根据后续静态和动态证据重建了不同的 scoped 路径：准确 AXActivationPoint、逐包源过滤确认、局部状态清理、key/typing-focus 诊断；以默认关闭的 `CU_EXPERIMENTAL_APPKIT_FOCUS=1` 显式启用，限定 macOS26.6.2 arm64。它已通过新的真人并用及系统应用操作测试；不能据一次通过消除旧失败或承诺任意应用兼容。默认按钮单击仍采用 AXPress，默认事件路径不生成这些通知。应用自行激活或堆叠变化时，报错而不抢回窗口掩盖。

## 保守边界

后台是对经过验证的控件和应用状态成立的能力，不能宣称任意 macOS 应用完全兼容。自绘画布、游戏、Electron/Chromium、弹出菜单、应用内模态框、多窗口键盘路由和窗口自己激活的行为各异。全局 app 菜单在后台模式明确拒绝。原始事件可能已部分生效才被隔离检查判为失败；先观察，不盲目重试。取消能尽力释放定向按钮，但硬杀进程不能保证系统调用回滚。

本机用未公开的系统符号是兼容性折衷，不是权限绕过。若状态显示 windowLocationSPIAvailable=false，原始指针路由失败，不会切到全局输入；支持 AX 的文本、按钮和窗口感知仍可使用。未在 Intel、macOS 14/15、多显示器或长期会话下验证。


## 真人反馈与测试入口修正

参与者在同一台 Mac 的 Codex 输入框中输入，确认文字完整、使用正常；随后反馈最近测试又抢出了 TextEdit 和 Background Automation 窗口。该轮脚本确实再次执行了主动聚焦的布置步骤及前台合成输入，因此不能把整个测试运行描述为无干扰。原始鼠标事件的自动抬升失败也仍保留，不将一切都归因于布置。

修正：生产 helper 默认禁止 foreground/focus（需 CU_ENABLE_FOREGROUND=1 才开启）；未知模式拒绝。默认测试全面改为不激活布置；会接管桌面的两类脚本须显式启用。后台验收改用现有遮挡窗口，不为得到通过而抢回前台。真人鼠标变化未被旧观察器捕捉，不能证明时序重合；新观察器同时记录 CGEvent 与 NSEvent 两种位置读数，测量与主观反馈分开保留。

## 新开发检查点的复现入口

```sh
node scripts/raw-pointer-test.mjs
node scripts/raw-pointer-cancel-test.mjs
# 负对照：默认路径的 NSButton 点击通过，非活动文本视图拖动仍可能失败
node scripts/raw-controls-test.mjs
```

当前正常构建也包含默认关闭的实验路径。全新、完全遮挡的文档测试包含真实 Unicode、CMD+A/CMD+Down/CMD+Up、拖动选择、滚动和按钮点击：

```sh
npm run build
npm test
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/raw-document-test.mjs
# pi 使用独立工作目录，仅调用本项目 MCP 工具完成相同任务
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/pi-document-test.mjs
```

这些测试不启动系统 TextEdit/Calculator，也不要求参与者输入。它们不能代替前台文字完整性或任意应用兼容性验收。旧自建文本框键盘失败受记录器异常影响，已更正并增加不投递输入的回归检查，详见 `FOCUS_FIDELITY.md`。

上面三项仅启动会自行排到用户窗口后面的自建测试应用。测试录下的窗口顺序也单独校验，缺少样本不当作通过。每个指针包的 `pointerDelivery` 只确认匹配源/目标/窗口/操作标记的路由标志已移除；UI 效果仍须读回。

显式实验开发 helper（尚未作为发布版验收）：

```sh
CU_BUILD_DIRECTORY=.build/focus-experimental node scripts/build.mjs
CU_EXPERIMENTAL_APPKIT_FOCUS=1 \
CU_TEST_NATIVE_HELPER="$PWD/.build/focus-experimental/Local Computer Use.app/Contents/MacOS/computer-use-bridge" \
node scripts/raw-controls-test.mjs
```

新真人检查脚本为 `human-raw-background-test.mjs`，必须先安排参与者并设置 `CU_TEST_HUMAN_AGREED=1`。脚本安静布置后输出 `HUMAN_READY`，只有收到该目录的 `start` 文件才开始 30 秒操作；参与者随后逐字输入约定的 CUH 标记文字并移动鼠标。观察器只比较已知标记开始的限定范围，保存匹配长度和完成状态，不记录未标记草稿或硬件键盘文字。没有完整文字或鼠标重合证据时结果为失败/未确认。
