# Bench v2 失败复现记录

[English version](../BENCH_V2_REMEDIATION.md)

对照基线固定为 `artifacts/bench-v2-full-20261109T044031Z/results.json`，其中有 90 个有效试验和 6 次基础设施中断。初期复现使用 Pi、OpenAI OAuth 和 GPT-6.1 Terra `low`，运行器现使用 `high`。复现按重复索引使用锁定版本的上游应用、检查器和 A22。全量矩阵留待另行验收。

| 项目 | 修复前 | 当前证据 |
| --- | --- | --- |
| 精确选种与续跑 | CLI 缺少重复索引和续跑，基线靠临时脚本收尾 | `690d3b2` 加入 `--run-index`，从逐轮原子记录恢复。对三轮已计分复现执行续跑，未增加试验目录。测试覆盖提供方失败、中断记录、重复计分和运行身份变化 |
| 实体输入误判 | IR-03 `410255` 在 11.84 秒中断，哨兵未记录 HID 事件 | `8f2a37d`、`5b43217` 核对 HID 计数、最新活动、精确 helper 及 Pi 父进程链。跟踪确认 Pi 的 MCP 服务另建进程组。后续三轮均计分，MB-09 的真实失焦仍记为失败。未知回落和实体计数变化仍中断 |
| 多应用预检 | G04 `482045` 的档案服务启动时，Homebrew Node 缺少 `libllhttp`。上游适配器也没有读取 `ready.url` | `d350b4e` 让 MCP、测试应用和检查器用同一个 Node，并核对锁定的 Electron、桌面应用、端口及服务就绪。同种子档案服务的重置、校验和 `/healthz` 已通过。这是启动链验证 |
| IR-03 `410255` | 点击表格行内的文本时窗口升层，未切换笔记，也未弹出保存提示 | `caa98b4` 对已观察行的普通点击使用可写的 `AXSelectedRows`。同种子记录了两次保存提示、两次 Save、笔记切换和干净的 Done。检查器 1.0，A22 八项全通过 |
| IR-04 `816494` | 检查器 0.45。窗口 AX 树把 WebKit 文本框标成 `focused:true`，应用级却查不到文本焦点。未聚焦时 AX setter 可能返回成功，页面值仍为空 | 最后一轮在拒绝同意覆盖层并聚焦字段后，按当前索引调用 `typeText`。验证了 AXValue 写入，按预期值提交一次，检查器 1.0、A22 八项全通过。覆盖层出现时曾有一次聚焦前置条件拦截 |
| MB-10 `227159` 和 MB-11 `160721` | 前台条件仍使用后台输入，视觉光标移动无法触发原生悬停或 tooltip | 前台条件显式调用 `app.hover`，分别触发真实鼠标进入事件和原生 tooltip。锁定版本的检查器和 GUI-only 策略下两项均得 1.0 |
| IR-01 `147201`、IR-02 `487371` 的菜单防护 | 关闭的下拉框只暴露 `AXPress`、`AXShowMenu`，值只读且没有子节点。用 `AXFocused` 建立应用内焦点后再发方向键，仍会打开菜单并夺走键盘焦点 | `76dc681` 在投递前拦截已识别的原生菜单跟踪。两轮 Pi 均得 0.45，A22 八项均通过。选项选择和两个工作流仍未完成 |
| CDB-G03 `99589` 写入回报 | Calc 接受单元格的 `AXValue` 写入，读取时却仍是原值 | `ab29c84` 在限时回读后报 `AX_VALUE_UNCHANGED`。该单元格仍无法用此 setter 编辑。BenchLab 数量字段和文档重新连接回归均验证了普通写入 |
| CDB-G04 `482045` | 浏览器初始档案页未加载，AX 文本插入显示地址却无法用 Enter 提交，打开 Cases 状态菜单又造成失焦 | 隔离浏览器成功加载日志和档案。Pi 用 `setValue` 和 Enter 导航，并在菜单关闭时通过普通按键选择 Chromium 控件值。检查器六项全部通过，得 1.0，A22 八项及 GUI-only 均通过 |

修复前的三轮复现和未重跑任何任务的续跑见 `artifacts/bench-v2-pi-20261109T061549001410Z/summary.json`。IR-04 最终直接写入路径见 `artifacts/bench-v2-pi-20261109T062212995745Z/summary.json`。较早的失败和恢复尝试保留在原目录。活动来源跟踪见 `artifacts/bench-v2-mb09-source-trace-1794204883344509000/trace.jsonl`，G04 启动检查见 `artifacts/bench-v2-g04-service-1794204864501260000/report.json`。

IR-03 计分结果见 `artifacts/bench-v2-pi-20261109T063534274109Z/summary.json`。更早的一次尝试因桌面锁定未计分。MB-10/11 首轮见 `artifacts/bench-v2-pi-20261109T063712978929Z/summary.json`，补齐悬停截图坐标信息后的同种子复测也通过，见 `artifacts/bench-v2-pi-20261109T063847807216Z/summary.json`。

IR-01/02 计分见 `artifacts/bench-v2-pi-20261109T065349148172Z/summary.json`。直接 AX、键盘和防护探针见 `artifacts/ir-popup-probe-Wp6YXH/report.json`、`artifacts/ir-popup-key-probe-0w9rOg/report.json`、`artifacts/ir-popup-guard-probe-XAoiNS/report.json`。最后一项覆盖索引点击、坐标点击、AX 按下与打开菜单、应用内聚焦后的方向键。未观察到输入或焦点干扰。

本机原版在 IR-02 `487371` 中打开了菜单，暴露三个选项。系统先发出 `KeyFocusTaken`，随后在 `KeyFocusChanged` 中携带非零请求 ID，约 2.7 毫秒后发出 `KeyFocusReturned`。接收进程采样和哨兵指标均保持稳定。另一轮同种子直接调用 AXPress 也打开了菜单，但观察期间没有归还通知。接收进程切到 BenchLab，哨兵记录到一次升层、一次失焦和一次输入受阻。该结果与静态分析确认的原版释放焦点请求路径吻合，通知本身无法确定调用者。MB-09 的原生拖放则记录到请求 ID 为零。独立版继续拦截原生菜单跟踪。见 `artifacts/ir02-original-menu-GXuhtn/original/` 和 `artifacts/ir02-ax-menu-focus-X93muq/independent/`。

在 IR-01 `147201` 的两个自有后台窗口中，AX 按下、保留 Command 的进程定向点击和显式 AppKit 点击都打开了同一个原生 sheet。三种方式均让目标越过后台覆盖窗。AppKit 点击还让目标越过了前台哨兵，哨兵仍保有键盘焦点。见 `artifacts/ir01-owned-layer-controls-beaMrc/report.json`。

第二次 IR-02 `487371` 原版对照选择了菜单项并读回新值。采样捕捉到 BenchLab 接管键盘，约 8.1 毫秒后归还。哨兵在打开菜单时记录到一次普通窗口升层，早于选择和横幅出现。独立探针对匹配的自有请求调用 `SLPSReleaseKeyFocusWithID`，两次调用均成功，AX 菜单仍可读取。首次从接管到归还约 0.62 毫秒，两次仍各出现一次哨兵失焦和升层。窗口 ID 区分了层级 101 的菜单和层级 0 的既有 BenchLab 主窗口，后者越过了哨兵。关闭状态的 AX 子节点和导航属性均没有暴露选项或可写选择。归还逻辑仅用于诊断探针。见 `artifacts/ir02-original-menu-select-RaVYoH/original/`、`artifacts/ir02-focus-release-only-lCYNpW/independent/`、`artifacts/ir02-focus-release-window-order-vdf6nm/independent/` 和 `artifacts/ir02-closed-menu-ax-controls-H3lFcH/report.json`。

原版服务 `1001824` 中，`0x10074f7d0` 处的调用读取事件字段，确认结果能用 `UInt32` 表示，然后传给 `0x10026ddfc` 的 `ApplicationRegistrySPI.releaseKeyFocus(withID:)`。同一二进制还暴露了单独的菜单关闭抑制函数。调用链与通知记录支持焦点请求释放这一解释。通知记录本身无法确认释放方，也无法确定抑制何时生效。见 `artifacts/original-native-menu-focus-path-dMRT9H/`。

IR-02 `487371` 修改 Quantity 后出现可见的层级 3 通知窗，AX 子角色为 `AXSystemDialog`。主窗口快照中没有 Later，旧窗口列表也漏掉了这个几何范围与应用 AX 窗口匹配的对话框。自有探针直接执行 AXPress 可以关闭，未测得干扰。驱动现列出 Core Graphics 和 AX 唯一匹配的可见浮动对话框。通过 JS API 的对照绑定了精确窗口、截取 2× 图像、用 AXPress 按下 Later、确认关闭后旧绑定返回 `WINDOW_GONE`，并回到主窗口按下 Apply。两次动作的键盘接收者采样保持稳定，哨兵保留全部四个生成字符，未记录升层。该对照的原生 Priority 下拉框仍为初始值。见 `artifacts/ir02-floating-panel-before-mH95sV/report.json` 和 `artifacts/ir02-floating-panel-after-twUH5o/report.json`。[Core Graphics 浮动窗口层级](https://developer.apple.com/documentation/coregraphics/cgwindowlevelkey/floatingwindow)、[Accessibility 系统对话框子角色](https://developer.apple.com/documentation/appkit/nsaccessibility-swift.struct/subrole/systemdialog)。

IR-01 种子 `147201` 的计分复测得 0.15，A22 八项通过。Next 打开 sheet 并报层级变化。Pi 随后按 sheet 的 CG 窗口 ID 绑定，AX 匹配只搜索应用顶层窗口，返回 `AX_WINDOW_UNRESOLVED`。匹配逻辑现会继续核对附属 AX sheet。同种子独立对照成功绑定 sheet、截取 2× 图像、按下观察到的拒绝按钮，并确认旧绑定失效和进入第 2 页。最初 Next 的层级错误仍发生。哨兵保留全部四个生成字符，未记录失焦或升层。见 `artifacts/bench-v2-pi-20261111T014549796603Z/summary.json` 和 `artifacts/ir01-sheet-binding-VtE1qh/report.json`。

浮动对话框的前两轮 Pi 尝试均关闭通知、遇到受保护的 Priority 下拉框，并以正常助手 `stop` 结束。两轮分别包含五次和一次较早的服务过载响应。运行器此前将任意错误响应都视为终止性提供方故障，因此把两轮记为基础设施尝试。现在会统计全部错误响应，再检查最后一条助手响应是否恢复。保留 JSONL 的离线回放确认了两次恢复、指定模型和 GUI-only 检查。测试覆盖正常结束、恢复、终止错误、未恢复错误和错误模型响应。见 `artifacts/bench-v2-pi-20261111T014104424800Z/summary.json` 和 `artifacts/provider-recovery-vl4a9c4v/report.json`。

加入对话框绑定和提供方报告修正后，同种子 Pi 计划完成了两轮计分。IR-01 `147201` 得 0.45，拒绝提示并进入第 2 页。IR-02 `487371` 得 0.45，记录到 Later 动作。两轮均停在受保护的原生下拉框，A22 八项通过，哨兵分别保留 134 和 117 个生成字符。报告分别保留一次和三次已恢复的过载响应，第一轮完成后自动继续第二轮。见 `artifacts/bench-v2-pi-20261111T015212344924Z/summary.json`。

单独的 `487371` 对照对关闭的 Priority 下拉框尝试标准 AX increment、decrement 和 confirm。三项均返回 `AXError -25206`，选值保持 Low，菜单保持关闭。哨兵的失焦和升层计数为零。该对照仍未获得选择路径。见 `artifacts/ir02-popup-standard-actions-8WcsW6/report.json`。

种子 `487371` 的六个定向滚轮事件均到达 BenchLab。Priority 在应用内 AX 聚焦前后都保持 Low，菜单始终关闭。另一组对照在两次鼠标事件中保留 Command，菜单打开并列出三个选项。实际键盘接收进程切到 BenchLab，其主窗口越过哨兵，哨兵仍是前台应用。见 `artifacts/ir02-popup-scroll-AH2LsH/report.json`、`artifacts/ir02-popup-command-click-TqErDW/report.json` 及对应事件追踪。

同种子复现了下拉框的键盘预检缺口。应用内 AX 聚焦后，`cmd+down` 打开菜单、夺取键盘焦点并让主窗口升层。驱动现在按解析后的上下方向键进行预检，覆盖带修饰键的组合。修复后的对照在投递前拒绝了六种激活组合，包括 Command+Down 和其他修饰键别名。目标仅收到 Shift+Space 和 Control+Space 的四个键盘包。菜单保持关闭，追踪中的键盘接收者和窗口顺序保持稳定，哨兵保留全部两个生成字符。见 `artifacts/ir02-popup-modified-keys-xaFxVH/report.json` 和 `artifacts/ir02-popup-modified-keys-after-c5ucPo/report.json`。

同种子的后续对照投递了 Home、End、Left、Right 以及四种带修饰键的空格或回车组合。16 个键盘包均到达 BenchLab，选值保持 Low，菜单保持关闭，失焦和升层计数为零。Pi 计分复测中，IR-01 `147201` 拒绝了 sheet 提示，IR-02 `487371` 选择 Later 关闭通知。两轮各得 0.45，A22 八项均通过。两个原生下拉框的选项选择仍待解决。见 `artifacts/ir02-popup-other-keys-eObGYu/report.json` 和 `artifacts/bench-v2-pi-20261111T081114150514Z/summary.json`。

IR-02 `487371` 从 Priority 开始坐标拖动时打开了原生菜单。键盘接收方切到 BenchLab，哨兵记录一次失焦和一次升层。拖动预检现会在投递鼠标按下前检查起点上的下拉框。同种子复测返回 `BACKGROUND_POPUP_UNSUPPORTED`，未发送鼠标包，未观察到焦点通知，窗口顺序稳定，菜单保持关闭且选值仍为 Low。`npm run test:background` 也使用自有 AppKit 下拉框检查拒绝及后续 AX 回读。见基准测试工作树的 `artifacts/ir-popup-drag-baseline-eyw8rqr7/report.json` 和 `artifacts/ir-popup-drag-guard-oj6csw5h/report.json`。

加入拖动保护后，IR-01 `147201` 与 IR-02 `487371` 各得 0.45，A22 八项均通过。另一次 `147201` 复测把 Next 触发的 `BACKGROUND_WINDOW_REORDERED` 写入 `driver_isolation`，锁定版哨兵仍报告零升层。报告现保留两种观察。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T012028606171Z/summary.json` 和 `artifacts/bench-v2-pi-20261113T012304189387Z/summary.json`。

IR-01 `517139` 复测同样得 0.45，A22 八项均通过，`driver_isolation` 也记录了 Next 导致的换序。MB-09 `790113` 回归得 0.05，A22 八项均通过，驱动未报告隔离错误，11 个生成字符完整保留。表格行拖动在投递前被拒绝。自有光标遮挡回归确认普通画布仍收到后台拖动，且目标窗口保持在覆盖窗之后。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T012423376072Z/summary.json` 和 `artifacts/cursor-occlusion-1794533030859/report.json`。

CDB-G02/03 工作流复现见 `artifacts/bench-v2-pi-20261109T064232356505Z/summary.json`。G04 独立 profile 复测见 `artifacts/bench-v2-pi-20261109T064650603373Z/summary.json`，MCP 范围只包含新启动的 Chrome PID。G03 更新临时 profile 后的结果见 `artifacts/bench-v2-pi-20261109T065029893913Z/summary.json`。在这些轮次中，A22 八项均通过，检查器分别得 0.20、0.45、0.15。

用本机 Codex Computer Use 服务（构建 `1001824`）单独对照 MB-09 种子 `790113`。原版 `cua_repl.drag` 对同一行启动了原生拖放，但无投放事件，顺序未变。哨兵的 419 次采样没有观察到键焦点丢失、激活变化、鼠标移动或打字干扰。这是一次未计分的原版对照。静态检查确认了 `NSEvent` 鼠标构造、事件子类型及窗口字段、PID 投递封装，以及此前调查记录的独立焦点通知机制。本轮仍未证实原版由哪条分支保护焦点。见 `artifacts/mb09-original-compare-DDSKEi/report.json` 和 `artifacts/original-drag-path-WrKjJE/`。

第二轮使用同一种子 `790113`，独立于哨兵采样系统实际接收键盘输入的进程，并记录自有目标进程的鼠标包元数据。原版和独立版启动原生拖放后，接收进程都切到 BenchLab，哨兵始终位于前台，两边都未完成投放。原版这一轮的哨兵仍报告零次失焦，因此只看其窗口内指标会漏掉系统路由变化。见 `artifacts/mb09-packet-compare-Cy8DjZ/{original,independent}/report.json`。

若目标不在前台却已持有键焦点，后台预检现在会拒绝后续写操作。直接探针复现拖放夺焦后仍能读取状态和快照，随后的 AX 按下在投递前被拒绝。首次夺焦仍会发生。同一种子 `790113` 的 Pi 复测得 0.05，A22 的键焦点和打字两项失败。见 `artifacts/mb09-focus-preflight-EhPtgV/report.json` 和 `artifacts/bench-v2-pi-20261110T004218190442Z/summary.json`。

下一轮同种子探针采样了目标进程的 macOS 拖影窗口。首次采到拖影在 `KeyFocusTaken` 之后约 3.5 毫秒。1 点短拖则使窗口升层，未采到拖影或夺焦通知。新预检会拒绝从绑定窗口的原生表格普通行发起后台拖动。复测中两种手势均未投递鼠标包，未测到干扰。Pi 轮因未改变顺序仍得 0.05，A22 八项通过，哨兵的 11 个字符全部保留。见 `artifacts/mb09-drag-image-timing-vDcIe7/`、`artifacts/mb09-row-drag-guard-qge65F/` 和 `artifacts/bench-v2-pi-20261110T011251429125Z/summary.json`。

在 `790113` 的两组诊断中，拖动全程保留 Command，实体鼠标保持静止。一组鼠标在目标窗外，另一组在启动哨兵前移动自有窗口，使实体鼠标落在可见的目标落点。两组都观察到目标收到 38 个包，其中包括鼠标抬起。两组都启动原生拖放，并短暂切换实际键盘接收进程约 26–28 毫秒，请求 ID 均为零，且均未出现重排事件。该行的 AX 自定义动作列表为空，表格也未暴露标准重排动作。见 `artifacts/mb09-hardware-drop-position-W0Gi7G/report.json` 和 `artifacts/mb09-row-surface-compact-naEf1S/row-hit/artifacts/driver.stdout`。

另一组同种子对照将自有窗口放到静止的实体鼠标之外，分别投递有和无垂直增量的拖动事件。两组都收到全部 38 个包。填写增量的一组累计 −52 点，只填坐标的一组增量为零。焦点转移通知出现在第三个移动事件之后，当时已移动约 4.3 点。两组都启动了原生拖放，实际键盘接收进程切换到 BenchLab 约 567–571 毫秒，随后均无放下事件。每组 39 次采样中，HID 和组合会话的左键状态均为未按下。单独补上移动增量后，仍能复现失焦和缺少放下事件。见 `artifacts/mb09-motion-delta-gZCAvm/report.json` 及两组目录的 `artifacts/packets.json`。[Core Graphics 垂直鼠标增量](https://developer.apple.com/documentation/coregraphics/cgeventfield/mouseeventdeltay)。

同种子复现了右边框的保护缺口。同一水平线上，AX 命中测试在 x=448 返回表格行，在 x=449 返回滚动区。原保护在投递前拒绝行内起点。边框手势发出了 38 个包，让 BenchLab 升层，哨兵仍保有键盘焦点。`4ee532e` 让滚动区命中时也核对相邻的可见原生行。修复后两个起点均在投递前被拒绝，鼠标包、失焦和升层均为零。见 `artifacts/mb09-edge-drag-guard-mBsBLc/` 和 `artifacts/mb09-edge-drag-fixed-WZUdsB/`。

Pi 在 `790113` 上复测得 0.05，记录了一次 `BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED`。A22 八项通过，哨兵的 12 个生成字符全部保留。原生行重排仍需要可在后台投递的路径。见 `artifacts/bench-v2-pi-20261110T201943812933Z/summary.json`。

相关的光标遮挡回归在改动前和加入预检后都复现了首次点击自定义控件时升层，当时还未发出拖动包。另一轮取消对照中，带预检的版本收到三次拖动和一次鼠标释放，但窗口遮挡断言仍失败。测试运行器现在会在失败时等待清理，串行复测复现了升层，且均释放了测试锁。见 `artifacts/cursor-occlusion-1794273330365/`、`artifacts/cursor-occlusion-1794273336960/`、`artifacts/raw-pointer-cancel-1794273343113/` 和 `artifacts/raw-pointer-1794273352352/`。

在被遮挡的自定义 AppKit 控件上单独拖动时，鼠标按下引发升层，驱动在报 `BACKGROUND_WINDOW_REORDERED` 前仍发完 36 个移动事件。改为在每个移动事件前检查层级后，移动事件降为零。首次实现使用普通鼠标释放进行清理，控件未收到该事件。现在只要原投递通道可用，清理便沿用同一目标进程事件 tap。最终对照收到一次按下、零次移动和一次释放，前后台应用和键盘接收者在试验前后相同。初始升层仍发生。见 `artifacts/drag-stacking-stop-before-3retRL/report.json`、`artifacts/drag-stacking-stop-after-TkB3v1/report.json` 和 `artifacts/drag-stacking-release-CrXSKn/report.json`。

重建 helper 后，Pi 对 `790113` 的首次复跑遇到 OpenAI 服务过载，记录为基础设施尝试。续跑同一报告只重试 `790113`，计分轮返回 `BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED`，得 0.05。A22 八项通过，哨兵保留全部 11 个生成字符。见 `artifacts/bench-v2-pi-20261111T012942578011Z/summary.json`。

G04 的启动对照分离出了环境故障。使用合成的 `HOME` 时，Chrome 能打开本地文件，loopback 档案页却保持无标题或停在上一页。只改用 macOS 的常规临时目录仍失败。仅让测试 Chrome 进程沿用登录会话的 `HOME` 后，初始档案页及本地文件和档案页之间的双向导航都恢复。Chrome 仍使用全新的 profile，MCP 仍按本轮精确 PID 隔离。环境对照见 `artifacts/cdb-g04-exact-launch-tZWULq/report.json`、`artifacts/cdb-g04-canonical-temp-O3xGBK/report.json` 和 `artifacts/cdb-g04-browser-home-jjDzxX/report.json`。

G04 随后暴露了两个独立控件问题。`AXSelectedText` 只改变地址显示，同一窗口通过 `AXValue` 和 Enter 成功加载目标。打开 Cases 状态菜单造成一次真实失焦及升层。关闭状态的下拉框取得应用内焦点后，可以用普通按键选择。定点对照见 `artifacts/cdb-g04-entry-method-WqeBwF/report.json` 和 `artifacts/cdb-g04-select-control-pWNEfA/report.json`。中间的 Pi 轮次见 `artifacts/bench-v2-pi-20261109T201958876608Z/summary.json`、`artifacts/bench-v2-pi-20261109T202723280877Z/summary.json` 和 `artifacts/bench-v2-pi-20261109T203014679951Z/summary.json`。通过的一轮见 `artifacts/bench-v2-pi-20261109T203407641140Z/summary.json`。

Chromium 控件防护探针核对了两个 Cases 下拉框。打开菜单的动作都在投递前被拒绝，随后通过应用内焦点和普通按键成功选择状态和链接，哨兵无干扰。见 `artifacts/cdb-g04-select-guard-phFOuM/report.json`。

加入 Electron 遮挡开关后，G04 `482045` 一轮复测得 0.15，A22 八项通过。模型在保存前读回了两个下拉选值，但未验证处理结果已经持久化。随后用同一种子做有无开关的未计分对照，两种配置均保存了测试用日志引用，重新打开后读回一致，哨兵无干扰。这项定点对照确认两种配置下保存按钮都可以工作。见 `artifacts/bench-v2-pi-20261110T004957668583Z/summary.json`、`artifacts/cdb-g04-save-default-piDXdG/report.json` 和 `artifacts/cdb-g04-save-occlusion-qDfM18/report.json`。

加入通用的跨应用进度和保存核对提示后，G04 `482045` 得 1.0。G02 `909557` 再次打开邮件，模型在六次 GUI 调用成功后主动结束，没有尝试编辑目标应用，仍得 0.20。两轮均满足 GUI-only 和 A22 八项。见 `artifacts/bench-v2-pi-20261110T005715281285Z/summary.json`。

加入结构化 AX 后，G04 首轮复测在 16 次 GUI 调用后因提供方用量上限终止。日志把该次评估诊断保留在 `infrastructure_error` 下，未计入得分。随后种子 `482045` 的复测得 1.0，六项任务检查和 A22 八项全部通过。Pi 调用 GUI 27 次，从三次工具错误中恢复，提供方错误及 GUI-only 违规均为零，113 个生成字符完整保留。见原目录的 `artifacts/bench-v2-pi-20261111T082822635092Z/summary.json` 和基准测试工作树的 `artifacts/bench-v2-pi-20261113T005605761400Z/summary.json`。

下一轮 G02 因 Pi 报告 Codex 用量达到上限而中断。日志把该次尝试记为基础设施错误。续跑仅重试 `909557`，跳过已有计分的 G03。G02 随后得 0.45，A22 八项通过。检查器确认阻塞记录已保存，保留项检查也通过。模型在十二次 GUI 调用成功后结束，仍有日历更新和工作簿未完成。见 `artifacts/bench-v2-pi-20261110T012051583955Z/summary.json`。

G03 的 GnuCash 截图暴露了另一个边界缺陷。ScreenCaptureKit 把启动提示拼进普通账本截图，缩小了账本内容，接口仍按账本尺寸报告比例。`a2b0361` 排除隐式子窗口。同一 800 × 632 逻辑点账本现在完整填充 1600 × 1264 像素截图，比例为 2×。前后截图见 `artifacts/cdb-g03-control-inventory-bbmq5U/` 和 `artifacts/cdb-g03-viewport-8CDoMk/`。显式前台悬停仍可截取其临时窗口，MB-10/11 在 `artifacts/bench-v2-pi-20261109T203944095385Z/summary.json` 中再次得 1.0。

G03 种子 `99589` 的 Calc 探针确认，AX 聚焦会把名称框中的选区移到指定单元格，单元格本身仍报告 `AXFocused=false`。F2 能进入编辑模式，字符串 AXValue 写入和普通字符加 Enter 都没有写入内容。未测得干扰。已安装版本 LibreOffice 的[单元格聚焦实现](https://github.com/LibreOffice/core/blob/libreoffice-26.8.2.2/sc/source/ui/Accessibility/AccessibleCell.cxx#L133-L146)会移动表格光标，[文本 AXValue setter](https://github.com/LibreOffice/core/blob/libreoffice-26.8.2.2/vcl/osx/a11ytextwrapper.mm#L48-L53)是空实现。单独尝试定制 Unicode 事件后，读回前返回 `APP_GONE`。该事件未验证写入成功，也未加入服务。见 `artifacts/cdb-calc-focused-cell-7Q5uI6/report.json` 和 `artifacts/cdb-calc-editor-unicode-nkJhaN/report.json`。

扩大 AX 观察范围后，找到 F2 打开的聚焦单元格编辑器。JS 观察接口现已提供原生节点数和深度限制。对该编辑器精确调用 `typeText`，缓冲区可读回且未测得干扰。工具栏 Accept、Enter 和 Tab 均未把文字提交到单元格。见 `artifacts/cdb-calc-ax-editor-0rcvyP/report.json` 和 `artifacts/cdb-calc-js-editor-kjQ7si/report.json`。

改用 Calc 工具栏的 Formula 按钮打开编辑器后，可提交到单元格。种子 `99589` 中，向精确绑定的聚焦编辑器输入测试值，再按 Accept，可在目标单元格读回。较长的探针也完成了覆盖和清空，但后续动作报告窗口重排。另一次单次编辑对照通过工具栏 Save 保存，独立只读检查在临时 ODS 中找到了测试值，哨兵未记录干扰。运行器已加入该 Calc 路径的提示。见 `artifacts/cdb-calc-formula-commit-yYGIJK/report.json`、`artifacts/cdb-calc-formula-save-RYcZAg/report.json` 和 `artifacts/cdb-calc-save-once-Zupy3c/report.json`。

在 G02 工作簿（`909557`）中，顺序探针确认聚焦单元格、打开 Formula 和写入都保持层级。按 Accept 时 Calc 越过了与其重叠的 Daymark Calendar 窗口，哨兵始终在两者前面。驱动停止，未继续保存。见 `artifacts/cdb-g02-calc-stacking-7R4C9w/report.json`。

在同一工作簿中，默认进程定向 Enter 保持了层级，但未提交单元格。启用实验性应用内焦点路由后，Enter 提交成功，工具栏 Save 将值写入了文件。顺序探针未记录越层，哨兵未记录干扰。这两轮为隔离探针，实验路径尚无真人并用验证。见 `artifacts/cdb-g02-calc-key-commit-bCEal3/report.json` 和 `artifacts/cdb-g02-calc-scoped-commit-a8uzPG/report.json`。

关闭旧的全局实验开关后，显式 `appkit` 按键策略复现了 G02 的保存及 G03 的账簿导航。G02 还确认未列入白名单的日历应用会拒绝这类按键。两组探针均未记录干扰。Pi 计分轮在 G02 调用 GUI 九次，在 G03 调用三次，均无工具报错，也都未调用 `appkit` 按键。两轮 A22 八项通过，G02 得 0.20，G03 得 0.45。见 `artifacts/cdb-g02-explicit-scoped-key-84BQ6A/report.json`、`artifacts/cdb-g03-explicit-scoped-key-sPt16T/report.json` 和 `artifacts/bench-v2-pi-20261110T074824391448Z/summary.json`。

G02 `909557` 的隔离对照通过取得焦点的 AX 文本字段更新了 Daymark 已有事件，保存并重新打开核对。同一轮中，Calc 用显式 Command–Page Down 和 Command–Page Up 切换 Schedule 与 Controls，用 Forward Delete 清空单元格，写入观察到的时间及工作表对应的状态，再用显式 Command-S 保存。Calc 显示的两个时间含秒和 AM/PM。文件观察器确认 ODS 中归一化的时间与日历一致，两处房间相同，状态各自符合规则，Controls、无关事件和受保护占用均保持原样。哨兵的 32 个生成字符全部保留，未记录失焦、升层或激活变化。这组诊断只编辑了一条事件和对应行。见 `artifacts/cdb-g02-matched-saves-GfypMr/report.json` 和 `artifacts/cdb-g02-scoped-workbook-save-ioCjRW/report.json`。

同一 Calc 对照中，默认绑定的初始自动 AX 文本为 118,046 字节。`getApp(...,{emit:false})` 让绑定和后续动作的自动 AX 输出降为零，显式观察仍可核对每一步。早期 Pi 回复多次达到客户端约 20 KB 的输出上限。运行器现提示多应用任务使用静默绑定并打印相关 AX 行。见 `artifacts/cdb-g02-scoped-workbook-save-ioCjRW/report.json` 和 `artifacts/bench-v2-pi-20261110T012051583955Z/001-CDB-G02-background-attempt-02/artifacts/pi.jsonl`。

使用静默绑定和操作提示后，Pi 同种子复测得 0.35。前两次回复仍接近 20 KB，其余十一条文本回复约 0.5–6.4 KB。Pi 完成一项日历更新并保存阻塞记录，随后在十三次工具调用均成功的情况下结束。检查器发现日历还有三项待改，工作簿仍是原始数据。A22 八项全部通过，GUI-only 违规为零。先前的 0.45 轮完成了另一部分工作。见 `artifacts/bench-v2-pi-20261110T200917173072Z/summary.json`。

加入精简截图输出和 Calc 写入核验引导后，G02 种子 `909557` 得 0.80，原始计分基线为 0.20。检查器确认四项日历变更、阻塞记录与审计、约束及保留项均通过。模型保存了一条工作簿记录，另有三行及证据引用待补，工作簿一致性是唯一失败项。Pi 在 35 次工具调用后结束，一次调用因 `NewExpression` 语法被拒绝，GUI-only 违规为零。A22 八项通过，哨兵保留全部 208 个生成字符。见 `artifacts/bench-v2-pi-20261110T203610196664Z/summary.json` 及其试验目录的 `artifacts/cdb-result.json`。

下一轮同种子复测给出了 Benchmark JS 子集支持的内联 `for...of` 写法，得 0.20，A22 八项通过。Pi 在 14 次调用后结束。切换工作表时漏了 AppKit 策略，回读仍为原表，随后在编辑工作簿或日历之前结束。阻塞审计通过，记录引用的冲突事件 ID 有误。运行器现给出完整的定向按键调用，并要求从日历编辑器读取准确的事件 ID。见 `artifacts/bench-v2-pi-20261111T010800325791Z/summary.json` 和试验目录的 `artifacts/pi.jsonl` 与 `artifacts/cdb-result.json`。

种子 `909557` 的独立对照保存并重新打开了测试日历事件，再通过 Benchmark MCP，在一次调用中用内联 `for...of` 替换对应 Calc 行的原有状态和两个时间值。每次编辑均核验工作表、单元格地址、编辑器选区、编辑器值和提交后的单元格。随后用定向 Command-S 保存。只读观察器确认日历与工作簿一致，恰有三个单元格改变，Controls、无关日历事件和受保护的占位事件均保留。哨兵的 35 个生成字符全部保留，失焦和升层均为零，GUI 策略审计为空。见 `artifacts/cdb-g02-guarded-row-d22FQd/report.json`。

补全定向按键和事件 ID 引导后，Pi 读取了受保护事件的准确 ID，正确保存阻塞记录，通过日历检查，并成功从 Schedule 切到 Controls 后返回。运行器在 23 次工具调用后达到 360 秒上限。Pi 已开始编辑工作簿，检查器读到的仍是保存文件里的原始记录。得分 0.80，唯一失败项是工作簿一致性。A22 八项通过，哨兵保留全部 361 个生成字符。一次循环调用因声明中使用解构被拒绝，运行器现展示独立对照使用的单变量循环。见 `artifacts/bench-v2-pi-20261111T011312271472Z/summary.json` 及其试验目录的 `artifacts/cdb-result.json`。

Benchmark MCP 现已提供 `getAXNodes`，Calc 循环可以直接筛选节点对象并使用索引。同种子对照重做了三格编辑，核验了落盘的 ODS、工作簿与日历一致，以及 Controls 和无关事件完整保留。GUI 策略审计为空，哨兵保留全部 32 个生成字符，零失焦、零升层。见 `artifacts/cdb-g02-structured-ax-xksqirca/report.json`。

两次 `909557` 对照通过 Benchmark MCP 执行了相同的三格编辑循环。静默自动观察耗时 18.84 秒，启用 `autoObserve:false` 耗时 16.26 秒。后者保留所有显式观察，只读核验确认 ODS 已保存、数值与日历一致、仅三格按预期变化，Controls 和无关记录完整保留。策略审计为空，29 个生成字符完整保留，零失焦、零升层。Calc 引导现使用此绑定选项，并要求重新读取 AX 后再使用数字索引。见基准测试工作树的 `artifacts/cdb-g02-calc-observation-baseline-f6hynl4_/report.json` 和 `artifacts/cdb-g02-calc-explicit-observation-x_1aoqhr/report.json`。

加入 `getAXNodes` 后的首轮计分中，Pi 用它更新了一条日历事件，并从一次无效 JavaScript 表达式中恢复。Pi 在 13 次 GUI 调用后结束，未重开事件核验保存，也未继续其余事件、工作簿和阻塞记录。得分 0.20，A22 八项通过，53 个生成字符完整保留，提供方错误及 GUI-only 违规均为零。工具日志记录了模型正常结束，当时仍有时间和轮次。见 `artifacts/bench-v2-pi-20261111T081843748210Z/summary.json`。

补充继续执行已核验编辑的引导后，下一轮得 0.20，A22 八项通过。Pi 在一次调用中依次绑定 Mail 和 Chat，第二个 `getApp` 返回 `WINDOW_GONE`。随后的清单仍显示相同的 Chat PID 和窗口 ID。Pi 随后读取 Calc 并结束，未重试 Chat 绑定或写入。相同种子的只读对照连续 30 次绑定 Mail 和 Chat 并读取结构化 AX，均未出错。短暂不一致的原因仍待查明。见 `artifacts/bench-v2-pi-20261111T082105297757Z/summary.json` 和 `artifacts/cdb-g02-binding-check-4tbr2ix3/report.json`。

采用逐行批量引导的 G02 复测绑定了两个来源窗口，读取了邮件和聊天。Pi 尝试取消一条日历事件，在 10 次 GUI 调用后结束。评估的日历、工作簿一致性和阻塞记录仍未通过。得分 0.20，A22 八项通过，43 个生成字符完整保留。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T010402738776Z/summary.json`。

下一轮 `909557` 使用显式 AX 观察，保存了部分工作簿并达到本地轮次上限。评估器给出 0.80，唯一失败项是工作簿一致性。原日志把 Pi 生成的中止响应记为提供方错误。新轮次单独记录本地轮次上限，测量可用时保留评估结果。该轮还在 Calendar 底部遇到高度为零的控件，点击返回 `POINT_OUTSIDE_WINDOW`。同种子的自有测试中，新动作 `scrollToVisible` 让观察到的按钮完整进入可见区域，仍选中同一事件，哨兵记录零升层、零失焦。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T013034140217Z/summary.json`、`artifacts/cdb-g02-calendar-offscreen-r6fly1lv/report.json` 和 `artifacts/cdb-g02-calendar-reveal-opi2z8s9/report.json`。

首轮 `high` 档 `909557` 复测使用了 `scrollToVisible`，在 273.27 秒后达到本地 45 轮上限。日历与阻塞记录通过，唯一未通过的是工作簿一致性。日志保留 0.80 分并记录 `turn_cap_reached:true`，提供方错误为零，A22 八项通过，274 个生成字符完整保留。这一轮同时包含新的滚动动作。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T042304154305Z/summary.json`。

工作簿评估器指出只剩最后一条阻塞记录及其证据引用未完成。同种子 F2 对照打开了单元格编辑器，但 AX 未报告焦点。对通过工具栏取得焦点的编辑器直接调用 `setValue` 返回 `AX_VALUE_UNCHANGED`。沿用 Formula 和 Enter 路径时，`typeText(newText,{target:index,replaceAll:oldText})` 能在该编辑器上核对原值并验证写入。三格对照耗时 13.99 秒，显式选中文本后输入的对照耗时 16.26 秒。恰有三格按预期落盘，Controls 和无关记录完整保留，哨兵的 27 个字符全部保留，零失焦、零升层。见基准测试工作树的 `artifacts/cdb-g02-calc-f2-yqir66ce/report.json`、`artifacts/cdb-g02-calc-set-editor-t4x0ujz9/report.json` 和 `artifacts/cdb-g02-calc-replace-all-ki0ynmki/report.json`。

使用整段替换和 `high` 档后，`909557` 复测通过全部七项检查，包括工作簿的阻塞行，得 1.00，A22 八项全过。34 次 GUI 调用、292.20 秒内完成，未触及轮次上限。从一次 JavaScript 语法错误恢复，提供方错误、GUI-only 违规和驱动隔离错误均为零。293 个生成字符完整保留。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T043440241224Z/summary.json`。

较早的一轮 G03 Pi 同种子复测得 0.45。模型读取了邮件和工作簿，关闭 GnuCash 启动提示，随后展开账户时收到 `BACKGROUND_KEYBOARD_FOCUS_CHANGED` 并停止。哨兵同时记录到升层、激活变化和打字中断。同种子对照在两个鼠标包上保留 Command，仍记录到升层、激活变化和失焦。见 `artifacts/bench-v2-pi-20261110T010224956905Z/summary.json` 和 `artifacts/cdb-g03-command-disclosure-0OONBK/report.json`。

加入 Calc 提示后的 G03 仍得 0.45，在 GnuCash 账户点击处停止。本机 GDK 二进制在应用不活跃时调用 `activateIgnoringOtherApps:`，与 [GTK Quartz 鼠标按下处理](https://github.com/GNOME/gtk/blob/bac4a949b151eedada8bc60a97429d2176b0b28b/gdk/quartz/gdkevents-quartz.c#L1622-L1650)一致。实验性应用内焦点路由可以投递点击且未测到干扰，但账户仍折叠。在该路由下，依次发送 `+`、Down、Enter 打开了 Checking Account 账簿，哨兵未记录失焦、升层或打字中断。默认路由的 `+` 没有展开账户，两组省去准备点击的对照也未能展开。见 `artifacts/bench-v2-pi-20261110T012051583955Z/summary.json`、`artifacts/cdb-gnucash-register-keys-s90EgT/report.json`、`artifacts/cdb-gnucash-default-key-zZ0Unj/report.json` 和 `artifacts/cdb-gnucash-notice-ablation-{iKEFFW,tM5Nrv}/report.json`。

在种子 `99589` 的临时 G03 账簿中，显式按键定位到已有交易，编辑描述栏，经 Enter 提交后用 Command-S 保存。GUI 截图与对保存文件的只读复核均确认了改动。哨兵的 52 个生成字符全部保留，未记录升层或失焦。见 `artifacts/cdb-g03-ledger-write-Ab2faU/report.json`。

另一轮 G03 `99589` 对照用实验点击展开 Show Splits，并聚焦 Checking Account 拆分行的备注格。显式按键输入标记、提交并保存。文件复核确认拆分 ID 不变，拆分字段只有一处备注改动。`f45667d` 让两次点击均可通过 `strategy:'appkit'` 单独选择。关闭旧全局开关后，用公开 JS API 复现了保存，拒绝未列入白名单的 Calc 点击，普通 Escape 按键也未触发焦点准备。哨兵的 13 个生成字符全部保留，未记录升层或失焦。见 `artifacts/cdb-g03-split-memo-s9CIWE/report.json` 和 `artifacts/cdb-g03-explicit-split-memo-KyLdJc/report.json`。

本机 GnuCash 快捷键配置把 Command-R 分配给刷新，账簿的 Reconcile 没有配置快捷键。同种子使用实验路径点击账簿工具栏的溢出菜单后，GnuCash 新开两个窗口，账簿主窗口越过两个既有后台窗口。驱动的窗口顺序保护中止了操作。哨兵保有键盘焦点，生成文字完整，它的升层计数未覆盖这次后台窗口间的换序。探针在选择菜单项前结束。GnuCash 5.17 源码显示，对账命令在起始对话框之后会主动呈现独立窗口。后台安全提交 `y` 状态及实验输入的真人并用仍待验证。见 `artifacts/cdb-g03-reconcile-stacking-cM1GJM/report.json` 和其中的 `CDB-G03/order.jsonl`。[账簿对账命令](https://github.com/Gnucash/gnucash/blob/5.17/gnucash/gnome/gnc-plugin-page-register.cpp#L2794-L2822)、[对账窗口呈现](https://github.com/Gnucash/gnucash/blob/5.17/gnucash/gnome/window-reconcile.cpp#L2244-L2255)。

首次启用显式实验点击的 G03 计分轮得 0.45，模型没有使用 `appkit`。Pi 点击 Ledger Lantern Mail 中没有 `AXPress` 的邮件主题标签。自动选择指针投递后，邮件窗口升层，A22 的窗口层级项失败，其余七项通过。该标签的直接父控件是带 `AXPress` 的 `AXCheckBox`，直接按父控件打开了同一封邮件，未记录干扰。`328dfd7` 允许普通标签点击交给仍有效且包含点击点的直接按钮或复选框父控件。公开接口 `app.click(index)` 的对照通过 `AXPress` 打开了同一封邮件，未投递指针事件，未记录升层或失焦。见 `artifacts/bench-v2-pi-20261110T080231615362Z/summary.json`、`artifacts/cdb-g03-mail-parent-press-TDPtiV/report.json` 和 `artifacts/cdb-g03-mail-label-press-xBeeJD/report.json`。

标签修复后的 Pi 同种子复测得 0.45，A22 八项通过。Pi 在四次读取和绑定调用后结束，工具报错和 GUI-only 违规均为零。这轮未尝试标签点击、显式实验输入或任务写入。上述直接对照覆盖了具体的标签点击回归。见 `artifacts/bench-v2-pi-20261110T080711052019Z/summary.json`。

同种子对照通过 AXSize 把临时账簿窗口从 800 加宽到 1500 逻辑点，焦点和窗口层级保持稳定。立即和延时截图都显示旧工具栏被横向拉伸。发送一次定向 Up 后，GTK 重绘并露出 Reconcile 按钮。定向点击打开 Reconcile Information，使账簿越过既有的 Calc 和 Mail 窗口，驱动报 `BACKGROUND_WINDOW_REORDERED`。诊断重新观察，确认对话框绑定和哨兵键盘焦点后点击 OK。新的对账窗口替换了初始对话框，已有窗口之间没有再发生换序，哨兵的 17 个生成字符全部保留。对照在更改对账状态前结束。见 `artifacts/cdb-g03-wide-reflow-njtsAh/report.json` 和 `artifacts/cdb-g03-reconcile-second-window-RZ8gxs/{report.json,CDB-G03/order.jsonl}`。

GnuCash 将初始对话框附在账簿窗上，GTK Quartz 再将其加入 AppKit 父窗口的子窗口列表。源码机制与观察到的父窗口升层一致，触发升层的具体 AppKit 调用尚未验证。账簿的 R 栏可切换未清算和已清算，`y` 状态需要走正式对账流程。运行器现在提示 Pi 在窗口顺序保护触发后重新观察，暂停对账并核验可独立完成的编辑。[GnuCash 对话框初始化](https://github.com/Gnucash/gnucash/blob/5.17/gnucash/gnome/window-reconcile.cpp#L806-L816)、[GTK Quartz 子窗口挂接](https://github.com/GNOME/gtk/blob/bac4a949b151eedada8bc60a97429d2176b0b28b/gdk/quartz/gdkwindow-quartz.c#L1221-L1257)、[GnuCash 状态栏说明](https://www.gnucash.org/docs/v5/C/gnucash-manual/trans-stts.html)。

启用静默绑定的首轮 G03 复测通过定向按键打开 GnuCash 账簿，并在 Calc 中填写、保存了只存在于邮件里的发票行。固定检查器已不再报告该行缺失。整表一致性、精确例外备注和有依据的对账仍未通过，得分 0.45，A22 八项通过。Pi 在 36 次调用后结束，一次调用因不支持 `try` 语句而报错，GUI-only 违规为零。它仍有调用轮次，也未打开正式对账。运行器现提示在单次调用内核对并编辑一个重复处理的单元格，分组保存，并省去截图字节数组的回显。见 `artifacts/bench-v2-pi-20261110T202817997998Z/summary.json` 及其试验目录的 `artifacts/cdb-result.json`。

加入精简引导后，下一轮 G03 仍得 0.45，A22 八项通过。Pi 回读了一次 Calc 编辑并调用保存，十次调用后结束，尚未核验保存结果、合并编辑调用或操作账簿。固定检查器仍报告缺少仅存在于邮件的发票行。这两轮计分说明模型提前结束的情况，GnuCash 层级问题则由独立对照复现。见 `artifacts/bench-v2-pi-20261110T203205014262Z/summary.json`。

同种子对照沿用 Benchmark MCP 的 GUI-only 校验。单次 JS 调用核对了当前单元格、名称框、工具栏操作、唯一聚焦的编辑器、编辑器内容和提交后的单元格。另一次调用按下保存，独立只读观察器在保存的 ODS 中确认了测试标记。截图调用返回一张 PNG 和坐标信息，省去了字节数组回显。未记录策略违规，哨兵保留全部七个生成字符，无失焦或升层。见 `artifacts/cdb-g03-guarded-cell-0EEVdV/report.json`。

使用结构化 AX 观察后，G03 复测得 0.45，A22 八项通过。Pi 读取了邮件和工作簿，随后尝试按坐标关闭 GnuCash 启动提示，被 `SCOPED_CLICK_WINDOW_MISMATCH` 拒绝。独立同种子对照绑定了提示窗口，找到可用的 `AXCloseButton`，通过 `performSecondaryAction(index,'press')` 关闭。刷新清单确认提示消失，Accounts 窗口仍在。哨兵保留生成的输入，零失焦、零升层。运行器现提供这条已验证路径。见 `artifacts/bench-v2-pi-20261111T082342708304Z/summary.json` 和 `artifacts/cdb-g03-ax-tip-by_bdfoz/report.json`。

下一轮同种子复测中，Pi 使用 `node.role === 'AXCloseButton'` 查找关闭控件。独立对照读到该控件的 `role` 是 `AXButton`，`subrole` 是 `AXCloseButton`。Pi 核验了一格工作簿编辑并调用保存，随后结束，未确认落盘，也未尝试编辑账本。得分仍为 0.45，A22 八项通过。见 `artifacts/bench-v2-pi-20261111T082632290230Z/summary.json` 及其试验目录的 `artifacts/pi.jsonl`。

引导明确 `subrole` 后，G03 复测中 Pi 读取了四份发票附件，完成了部分 Calc 编辑。它先因使用子集不支持的 `push` 和 `concat` 失败，随后批量调用超过 MCP 客户端的 60 秒期限。Pi 读回当前单元格，尚未进入 GnuCash 就结束。工作簿一致性、异常备注和正式对账均未通过。得分 0.45，A22 八项通过，235 个生成字符完整保留。运行器现提供支持的数组展开语法，并把建议的单次批量缩为一行。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T005605761400Z/summary.json` 及 G03 试验目录的 `artifacts/pi.jsonl`。

G03 同种子对照再次发现，第一个 Reconcile 对话框把登记簿移到了两个已有测试窗口之前。确认后出现第二个 Reconcile 窗口，未发生新的窗口顺序交叉。第二个窗口的 AX 树只有七个原生边框和标题节点，OCR 能定位两张交易列表和 Finish 控件。一次定向 Tab 完成，未测得键盘焦点变化。哨兵保留全部 17 个生成字符。此对照未改动对账状态。见基准测试工作树的 `artifacts/cdb-g03-reconcile-controls-h7pojc55/report.json` 和窗口顺序记录。

采用逐行批量引导的 G03 复测中，Pi 通过 AX 关闭了启动提示，绑定 Accounts 并获取截图。随后提交一格 Calc 编辑并按下工具栏 Save，在更新账本前结束。得分 0.45，A22 八项通过，109 个生成字符完整保留。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T010402738776Z/summary.json`。

`high` 档与整段替换引导的复测进入了 GnuCash 登记簿，保存了差异备注，并让多行 Calc 编辑落盘。达到 45 轮上限后得 0.45，A22 八项通过，334 个生成字符完整保留。评估器发现两条应对账的拆分仍未对账、一条重复付款备注缺失、四格工作簿证据格式有误。提供方和驱动隔离错误均为零。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T043440241224Z/summary.json` 及其 G03 评估输出。

下一轮 `high` 复测在编辑前读取了工作簿的 Controls 页。评估器未再报告证据格式错误。模型用完 45 次工具调用，临近退出时空闲守卫记录无法归因的计时回落，实体计数没有变化。该轮未计分，评估器诊断为 0.45，两笔正式对账及两条异常备注仍未完成。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T044828355105Z/summary.json`。

该轮首次绑定 Calc 时还记录了 `WINDOW_GONE`，前后清单中均有同一个 PID 和窗口 ID。`99589` 的 30 次正常只读绑定未复现。模拟额外的按 PID 窗口查询返回空结果时，工作簿仍存在，旧路径复现报错。adaptive 模式的 AX 读取现直接使用原生快照的精确 PID 和窗口验证。同一模拟下已成功绑定工作簿并读取表格。原生目标消失时仍报错，快照失败会使数字索引失效。见基准测试工作树的 `artifacts/cdb-g03-exact-bind-8myjqmei/report.json` 和 `artifacts/cdb-g03-exact-bind-fixed-5uqyojfp/report.json`。

两轮 `99589` 对照以定向点击选中同一条已观察的 GnuCash 拆分备注，通过 GUI 输入并保存了 39 个字母、数字及空格。编辑格横向滚动时，登记簿底部状态栏仍显示完整备注。账本只读复核确认 Checking Account 拆分上的完整内容、仅一处备注改动，以及所有拆分 ID 保留。普通定向 `event` 按键耗时 9.17 秒，逐键准备 `appkit` 焦点耗时 11.34 秒。两轮均保留全部哨兵生成文字，零失焦、零升层。另一个标点对照发现，当前拼音键盘布局会把部分美式键位映射为全角标点和 `¥`。运行器现引导先定向点击，再用普通定向键输入，并在提交前核对完整文字及标点。见 `artifacts/cdb-g03-memo-event-verified-vqhb43ff/report.json`、`artifacts/cdb-g03-memo-appkit-verified-7rrjzyj5/report.json` 和 `artifacts/cdb-g03-memo-event-verified-78oasp8t/CDB-G03/register-memo-edited.png`。[GTK Quartz 键位映射](https://github.com/GNOME/gtk/blob/bac4a949b151eedada8bc60a97429d2176b0b28b/gdk/quartz/gdkkeys-quartz.c#L231-L249)

下一轮 `high` 计分复测用时 316.13 秒，达到 45 次调用上限，得 0.45。A22 八项通过，317 个生成字符完整保留，提供方、GUI-only 和驱动隔离均无报错。检查器接受了工作簿证据格式，两条账本备注和两笔正式对账仍未完成。模型约用 20 次调用列出窗口和读取来源。同种子对照使用实际受限 REPL，一次调用在 7.07 秒内打开、读取并关闭三个已观察的邮件附件预览，零失焦、零升层。运行器现说明如何合并这些读取，并提示 AX 描述对应现有的 `label` 字段。独立备注对照还确认登记簿编辑器缺少可读 AX 值，`typeText(...,{strategy:'event'})` 因此拒绝输入。在当前拼音键盘布局下，GTK 十六进制输入组合也未能产生半角美元符号。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T191555554345Z/summary.json`、`artifacts/cdb-g03-mail-batch-elwv4scu/report.json` 和 `artifacts/cdb-g03-memo-literal-1f8g0_ws/report.json`。

加入邮件批量引导后，Pi 在第五次调用结束前读完所需的五份附件。Calc 编辑阶段在第 21 次工具调用触及 360 秒上限，得 0.45。仅来源行和账本操作仍未完成。A22 八项通过，361 个生成字符完整保留，出现一次可恢复的 JS 语法错误，提供方、GUI-only 和驱动隔离均无报错。随后两轮同种子诊断向已选中的备注格发送定向 Unicode 键事件，每个按下及抬起事件对携带一个字符。基于 NSEvent 和直接构造 CGEvent 的两种方式均在同一拼音布局下显示并保存了原样标点，包括半角美元符号。文件观察器确认仅一处备注改动，拆分 ID 不变。两轮均完整保留哨兵的十个生成字符，零失焦、零升层。公开 `event` 策略仍要求可读的 AX 回读。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T192522086014Z/summary.json`、`artifacts/cdb-g03-memo-unicode-icsxre1l/report.json` 和 `artifacts/cdb-g03-memo-unicode-cg-4_opcww3/report.json`。

随后在同样成功的 Unicode 写入前后直接查询 AX，`AXFocusedUIElement` 都指向登记簿窗口本身，角色为 `AXWindow`，子角色为 `AXStandardWindow`。可以核对精确窗口身份，AX 没有提供独立的聚焦备注编辑器来回读改动。见基准测试工作树的 `artifacts/cdb-g03-memo-unicode-focus-r15ck_dv/report.json`。

MCP 的 `typeText` 现可结合 `strategy:'event'` 显式使用 `visualCheck`。调用方提供 OCR 读到的完整原行和窗口内区域。每对可打印 Unicode 键事件发送前，驱动会核对同一焦点窗口和键盘隔离，随后在指定区域回读完整新行。同种子受限 stdio MCP 对照在发送前拒绝了过期原行及另一个焦点编辑器。有效调用返回 `visualVerified`，167 次焦点采样无变化、无缺失。独立提交及保存后，账本只读复核确认标点完整、仅改动一条备注、拆分 ID 保持一致。哨兵保留全部 12 个生成字符，零失焦、零升层。见基准测试工作树的 `artifacts/cdb-g03-memo-visual-mcp-duak1ugo/report.json`。

`99589` 的 `high` 复测使用这条路径精确保存了两条异常备注，得分从 0.45 提升至 0.65，A22 八项通过，360 个生成字符完整保留。评估器只剩两笔未对账及因此未通过的工作簿一致性检查。该轮在 359.73 秒达到 45 次调用上限。驱动在打开正式对账时另记一次 `BACKGROUND_WINDOW_REORDERED`。提供方和 GUI-only 均无报错。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T194551609742Z/summary.json`。

两轮 `99589` 对照使用同一个经 OCR 定位的 Reconcile 工具栏位置。纯 AX 点击未找到语义目标，焦点和窗口顺序保持稳定。普通定向点击在对话框出现前就把登记簿升到哨兵上方，哨兵记录一次失焦、一次升层和十次输入受阻。此前的定向 AppKit 点击打开了第一个对话框，哨兵保持焦点，登记簿越过了另外两个后台窗口。这两类失败分别出现在指针投递和定向点击触发对话框的阶段。两轮新对照都保留了原账本。见基准测试工作树的 `artifacts/cdb-g03-reconcile-open-ax-bnyb_yh8/report.json` 和 `artifacts/cdb-g03-reconcile-open-event-gxqkijjn/report.json`。[GnuCash 登记簿命令](https://github.com/Gnucash/gnucash/blob/5.17/gnucash/gnome/gnc-plugin-page-register.cpp#L2580-L2608)

自有 AppKit 对照分别验证了窗口操作。先置前子窗口时，子窗口越过遮挡窗，父窗口仍在其后。随后附加该子窗口时，父窗口也越过遮挡窗。若先附加，两者都在遮挡窗后，直到子窗口被置前。`beginSheet` 一次让父子窗口越过遮挡窗，哨兵保持键焦点，与 IR-01 种子 `147201` 的表现一致。已安装的 GDK 二进制在 Quartz 显示路径中包含 `showAndMakeKey:` 和 `addChildWindow:ordered:`。对照已确定哪些操作可以复现换序，GnuCash 运行时具体触发父窗口换序的调用仍未跟踪到。见基准测试工作树的 `artifacts/background-dialog-order-tuqtivy_/report.json` 和 `artifacts/ir01-sheet-order-regression-5mghd7hl/report.json`。[GTK Quartz 窗口显示](https://github.com/GNOME/gtk/blob/bac4a949b151eedada8bc60a97429d2176b0b28b/gdk/quartz/gdkwindow-quartz.c#L1083-L1125)

驱动现也报告新出现的普通窗口越过原先盖在操作目标上的窗口。自有 AX 点击对照中，一次把新子窗口留在遮挡窗后，另一次只把子窗口移到遮挡窗前。驱动接受前者，并对后者返回 `BACKGROUND_WINDOW_REORDERED`。两次哨兵均保持键焦点。检测器观察应用反应，检测到换序后停止同一请求中的后续点击。见基准测试工作树的 `artifacts/background-new-dialog-driver-1aieyymy/report.json`。

`969d733` 后的 IR-01/02 定向复测在 IR-01 `147201` 遇到提供方用量上限后停止。运行器将该次尝试记为基础设施错误，未计分。IR-02 `487371` 尚未启动。见基准测试工作树的 `artifacts/bench-v2-pi-20261113T200532264125Z/summary.json`。

后续新增预检和 IR-01 首字母实验使用公开 API。MB-09 原生行拖放和 G03 应用自激活弹窗按已知限制处理。识别到不支持的路径时，应在投递前拒绝并说明原因。

IR-01 `147201` 对照通过公开 AX 聚焦关闭的 Team 下拉框，再以公开的进程定向按键发送四个选项的首字母。选值始终为 `Choose a team`，没有出现菜单子节点，也没有测到窗口换序、前台应用或哨兵焦点变化。驱动现会在投递前拒绝已识别原生下拉框的首字母输入。同种子验证了小写、带 Shift 和默认策略，也验证了原有的 Down 预检。G04 `482045` 对照仍能在 AX 聚焦后按首字母选中两个 Chromium 选项，同时拦截了打开这两个原生菜单的请求。见基准测试工作树的 `artifacts/ir01-closed-team-public-fi3ugv9f/report.json`、`artifacts/ir01-native-team-reject-0_41h8sc/report.json` 和 `artifacts/cdb-g04-web-popup-regression-f_fo1_uk/report.json`。

G03 `99589` 对照中，新窗口 OCR 预检在投递前拦截了直接 Reconcile 按钮和紧凑工具栏溢出入口，共覆盖 auto、event 和定向点击的六次请求。Show Splits 仍可操作。账本保持原样，18 个生成字符完整保留，零失焦、零升层。预检覆盖实测的英文图标加文字布局。见基准测试工作树的 `artifacts/cdb-g03-dialog-preflight-f6nr9hwt/report.json`。

MB-09 `790113` 回归确认，从原生行内及相邻边框开始拖动均返回 `BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED`。两次目标事件观察均记录零鼠标包，哨兵生成文字完整，零失焦、零升层。见基准测试工作树的 `artifacts/mb09-row-and-bezel-regression-6xy882kg/`。

加入预检后的一次 G03 Pi 复测沿用了此前实验性 AppKit 参数，发现后主动停止。运行器保留未计分记录并清理测试进程。最近的有效 G03 得分仍为 0.65。见基准测试工作树的 `artifacts/bench-v2-pi-20261114T012811451081Z/summary.json`。

新的 `--public-api-only` 试验模式在启动前拒绝实验性 AppKit 参数，并禁用驱动的未公开焦点查询和原始指针投递。G04 `482045` 的两个 Chromium 下拉框仍能使用公开进程定向按键选值。IR-01 `147201` 到达第二页后，Team 的四种受保护输入均被拒绝。打开前一个 sheet 时仍测到后台窗口换序。两组对照均未记录哨兵失焦或升层。GnuCash 工具栏现在拒绝无法确认的登记簿工具栏点击，如果应用暴露带 Reconcile 标签的 AX 按钮，也会预检其语义按下。见基准测试工作树的 `artifacts/ir01-team-public-final-uvbmhmv3/report.json` 和 `artifacts/cdb-g04-popup-public-final-pvaukt9t/report.json`。

以 Pi `high` 和 `--public-api-only` 定向重跑后，IR-01 `147201` 和 IR-02 `487371` 均得 0.45，A22 八项通过。哨兵分别保留全部 47 和 25 个生成字符，两轮均无 GUI-only 违规或基础设施错误。IR-01 打开原生 sheet 时仍报告后台窗口换序。见基准测试工作树的 `artifacts/bench-v2-pi-20261114T014132146273Z/summary.json`。

在 IR-01 `147201` 上，公开 AX 探针在投递前枚举了 Next 的普通属性、带参数属性、动作及描述。按钮只公开了描述为 “press” 的 `AXPress`，没有帮助文本或标识符，窗口也没有默认按钮或已附加的 sheet。锁定版源码用普通 `NSButton` 创建该按钮，点击回调再调用 `NSAlert.beginSheetModal(for:)`。自有窗口对照中，sheet 和父窗口同时越过遮挡窗，哨兵保持键焦点。这组对照里，公开 AX 元数据没有提供可在执行前识别该弹窗的信号。见 `artifacts/ir01-public-ax-metadata-zzDvesJ5/report.json`。[锁定版 AppKit 测试应用](https://github.com/trycua/cua/blob/22a67eacd15dc71811e330ed88951dd615bb395d/libs/cua-driver-bench/automated-eval/macos_bench/swift/BenchLabInterrupts.swift#L243-L267)

仅公开 API 的后台模式会在投递前拒绝显式 `AXShowMenu`，包括识别范围之外的控件。自有 AppKit 对照按钮同时公开 `AXShowMenu` 和 `AXPress`。菜单回调未触发，普通按下仍投递到同一控件，哨兵无失焦或窗口升层。见 `artifacts/public-menu-guard-eSDxMTEV/report.json`。

仅用公开 API 的 G03 `99589` 对照在投递前拒绝了工具栏溢出入口、无法确认的工具栏坐标和显式实验点击。账本与可见窗口列表保持原样，哨兵生成文字完整，零失焦、零升层。运行器在 GnuCash 试验中都会说明这项对账限制。见基准测试工作树的 `artifacts/cdb-g03-public-toolbar-4_o8lzbo/report.json`。

另一轮同种子对照中，第二个 Reconcile 窗口在已观察交易行与 OCR 定位的 R 列交点接收了定向点击。Funds Out 合计从 $73.10 升至 $1,321.70，再次点击恢复 $73.10。哨兵保留全部 17 个生成字符，零失焦。第一个对话框仍改变了与其他测试后台窗口的相对顺序。对照在 Finish 前结束，确认了可撤销的行勾选。见基准测试工作树的 `artifacts/cdb-g03-reconcile-row-8glk4mao/report.json`。

另一轮 `99589` 对照在一次性账本完成并保存了一笔诊断性对账。定向数字编辑保留原有小数分隔符。Finish 前通过 OCR 和截图核对了勾选金额、两项余额相等及差额为零。只读 XML 观察器确认一条 Checking Account 拆分从 `n` 变为 `y`，对账日期随之写入，所有交易编号均保留。哨兵的 19 个生成字符完整保留，零失焦、零激活。驱动仍报告了初始对话框导致的后台窗口换序。见基准测试工作树的 `artifacts/cdb-g03-reconcile-finish-i1wkeb6t/report.json` 和截图。

| 待办 | 已有逐轮证据 |
| --- | --- |
| MB-09 `790113` | 投递前拦截消除了已验证表格行拖动路径上的干扰，后台原生列表重排仍缺少可验证的投递方式。加入预检前，手势全程保留 Command 也会失败。见 `artifacts/mb09-drag-threshold-34DwfW/report.json` 和 `artifacts/mb09-command-drag-igkzdF/report.json` |
| IR-01 `147201`、`517139` 和 IR-02 `487371` | 关闭状态下的原生 AppKit 下拉框选值属于已知后台限制，首字母输入及打开菜单会在投递前拒绝。IR-01 原生 sheet 仍可能使父窗口越过另一后台窗口，哨兵保持焦点 |
| CDB-G03 `99589` | 计分复测已验证两条异常备注。后台打开正式对账属于已知限制，实测的 Reconcile 按钮及溢出入口会在投递前拒绝。计分轮的对账及依赖它的工作簿检查仍未完成 |
