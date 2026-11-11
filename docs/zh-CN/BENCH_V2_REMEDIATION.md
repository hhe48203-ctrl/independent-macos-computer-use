# Bench v2 失败复现记录

[English version](../BENCH_V2_REMEDIATION.md)

对照基线固定为 `artifacts/bench-v2-full-20261109T044031Z/results.json`，其中有 90 个有效试验和 6 次基础设施中断。复现继续用 Pi、OpenAI OAuth、GPT-6.1 Terra（`low`）及锁定版本的上游应用、检查器和 A22。当前按重复索引跑受影响的用例，全量矩阵留待另行验收。

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

CDB-G02/03 工作流复现见 `artifacts/bench-v2-pi-20261109T064232356505Z/summary.json`。G04 独立 profile 复测见 `artifacts/bench-v2-pi-20261109T064650603373Z/summary.json`，MCP 范围只包含新启动的 Chrome PID。G03 更新临时 profile 后的结果见 `artifacts/bench-v2-pi-20261109T065029893913Z/summary.json`。在这些轮次中，A22 八项均通过，检查器分别得 0.20、0.45、0.15。

用本机 Codex Computer Use 服务（构建 `1001824`）单独对照 MB-09 种子 `790113`。原版 `cua_repl.drag` 对同一行启动了原生拖放，但无投放事件，顺序未变。哨兵的 419 次采样没有观察到键焦点丢失、激活变化、鼠标移动或打字干扰。这是一次未计分的原版对照。静态检查确认了 `NSEvent` 鼠标构造、事件子类型及窗口字段、PID 投递封装，以及此前调查记录的独立焦点通知机制。本轮仍未证实原版由哪条分支保护焦点。见 `artifacts/mb09-original-compare-DDSKEi/report.json` 和 `artifacts/original-drag-path-WrKjJE/`。

第二轮使用同一种子 `790113`，独立于哨兵采样系统实际接收键盘输入的进程，并记录自有目标进程的鼠标包元数据。原版和独立版启动原生拖放后，接收进程都切到 BenchLab，哨兵始终位于前台，两边都未完成投放。原版这一轮的哨兵仍报告零次失焦，因此只看其窗口内指标会漏掉系统路由变化。见 `artifacts/mb09-packet-compare-Cy8DjZ/{original,independent}/report.json`。

若目标不在前台却已持有键焦点，后台预检现在会拒绝后续写操作。直接探针复现拖放夺焦后仍能读取状态和快照，随后的 AX 按下在投递前被拒绝。首次夺焦仍会发生。同一种子 `790113` 的 Pi 复测得 0.05，A22 的键焦点和打字两项失败。见 `artifacts/mb09-focus-preflight-EhPtgV/report.json` 和 `artifacts/bench-v2-pi-20261110T004218190442Z/summary.json`。

下一轮同种子探针采样了目标进程的 macOS 拖影窗口。首次采到拖影在 `KeyFocusTaken` 之后约 3.5 毫秒。1 点短拖则使窗口升层，未采到拖影或夺焦通知。新预检会拒绝从绑定窗口的原生表格普通行发起后台拖动。复测中两种手势均未投递鼠标包，未测到干扰。Pi 轮因未改变顺序仍得 0.05，A22 八项通过，哨兵的 11 个字符全部保留。见 `artifacts/mb09-drag-image-timing-vDcIe7/`、`artifacts/mb09-row-drag-guard-qge65F/` 和 `artifacts/bench-v2-pi-20261110T011251429125Z/summary.json`。

在 `790113` 的两组诊断中，拖动全程保留 Command，实体鼠标保持静止。一组鼠标在目标窗外，另一组在启动哨兵前移动自有窗口，使实体鼠标落在可见的目标落点。两组都观察到目标收到 38 个包，其中包括鼠标抬起。两组都启动原生拖放，并短暂切换实际键盘接收进程约 26–28 毫秒，请求 ID 均为零，且均未出现重排事件。该行的 AX 自定义动作列表为空，表格也未暴露标准重排动作。见 `artifacts/mb09-hardware-drop-position-W0Gi7G/report.json` 和 `artifacts/mb09-row-surface-compact-naEf1S/row-hit/artifacts/driver.stdout`。

同种子复现了右边框的保护缺口。同一水平线上，AX 命中测试在 x=448 返回表格行，在 x=449 返回滚动区。原保护在投递前拒绝行内起点。边框手势发出了 38 个包，让 BenchLab 升层，哨兵仍保有键盘焦点。`4ee532e` 让滚动区命中时也核对相邻的可见原生行。修复后两个起点均在投递前被拒绝，鼠标包、失焦和升层均为零。见 `artifacts/mb09-edge-drag-guard-mBsBLc/` 和 `artifacts/mb09-edge-drag-fixed-WZUdsB/`。

Pi 在 `790113` 上复测得 0.05，记录了一次 `BACKGROUND_NATIVE_ROW_DRAG_UNSUPPORTED`。A22 八项通过，哨兵的 12 个生成字符全部保留。原生行重排仍需要可在后台投递的路径。见 `artifacts/bench-v2-pi-20261110T201943812933Z/summary.json`。

相关的光标遮挡回归在改动前和加入预检后都复现了首次点击自定义控件时升层，当时还未发出拖动包。另一轮取消对照中，带预检的版本收到三次拖动和一次鼠标释放，但窗口遮挡断言仍失败。测试运行器现在会在失败时等待清理，串行复测复现了升层，且均释放了测试锁。见 `artifacts/cursor-occlusion-1794273330365/`、`artifacts/cursor-occlusion-1794273336960/`、`artifacts/raw-pointer-cancel-1794273343113/` 和 `artifacts/raw-pointer-1794273352352/`。

G04 的启动对照分离出了环境故障。使用合成的 `HOME` 时，Chrome 能打开本地文件，loopback 档案页却保持无标题或停在上一页。只改用 macOS 的常规临时目录仍失败。仅让测试 Chrome 进程沿用登录会话的 `HOME` 后，初始档案页及本地文件和档案页之间的双向导航都恢复。Chrome 仍使用全新的 profile，MCP 仍按本轮精确 PID 隔离。环境对照见 `artifacts/cdb-g04-exact-launch-tZWULq/report.json`、`artifacts/cdb-g04-canonical-temp-O3xGBK/report.json` 和 `artifacts/cdb-g04-browser-home-jjDzxX/report.json`。

G04 随后暴露了两个独立控件问题。`AXSelectedText` 只改变地址显示，同一窗口通过 `AXValue` 和 Enter 成功加载目标。打开 Cases 状态菜单造成一次真实失焦及升层。关闭状态的下拉框取得应用内焦点后，可以用普通按键选择。定点对照见 `artifacts/cdb-g04-entry-method-WqeBwF/report.json` 和 `artifacts/cdb-g04-select-control-pWNEfA/report.json`。中间的 Pi 轮次见 `artifacts/bench-v2-pi-20261109T201958876608Z/summary.json`、`artifacts/bench-v2-pi-20261109T202723280877Z/summary.json` 和 `artifacts/bench-v2-pi-20261109T203014679951Z/summary.json`。通过的一轮见 `artifacts/bench-v2-pi-20261109T203407641140Z/summary.json`。

Chromium 控件防护探针核对了两个 Cases 下拉框。打开菜单的动作都在投递前被拒绝，随后通过应用内焦点和普通按键成功选择状态和链接，哨兵无干扰。见 `artifacts/cdb-g04-select-guard-phFOuM/report.json`。

加入 Electron 遮挡开关后，G04 `482045` 一轮复测得 0.15，A22 八项通过。模型在保存前读回了两个下拉选值，但未验证处理结果已经持久化。随后用同一种子做有无开关的未计分对照，两种配置均保存了测试用日志引用，重新打开后读回一致，哨兵无干扰。这项定点对照确认两种配置下保存按钮都可以工作。见 `artifacts/bench-v2-pi-20261110T004957668583Z/summary.json`、`artifacts/cdb-g04-save-default-piDXdG/report.json` 和 `artifacts/cdb-g04-save-occlusion-qDfM18/report.json`。

加入通用的跨应用进度和保存核对提示后，G04 `482045` 得 1.0。G02 `909557` 再次打开邮件，模型在六次 GUI 调用成功后主动结束，没有尝试编辑目标应用，仍得 0.20。两轮均满足 GUI-only 和 A22 八项。见 `artifacts/bench-v2-pi-20261110T005715281285Z/summary.json`。

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

| 待办 | 已有逐轮证据 |
| --- | --- |
| MB-09 `790113` | 投递前拦截消除了已验证表格行拖动路径上的干扰，后台原生列表重排仍缺少可验证的投递方式。加入预检前，手势全程保留 Command 也会失败。见 `artifacts/mb09-drag-threshold-34DwfW/report.json` 和 `artifacts/mb09-command-drag-igkzdF/report.json` |
| IR-01 `147201`、`517139` 和 IR-02 `487371` | 无视觉光标时直接通过 AX 按 Next，仍复现了原生 sheet 让目标越过另一后台窗口，哨兵始终保持键焦点。此前打开菜单则单独造成过失焦。在应用内聚焦的 AppKit 下拉框发送普通按键，选值未改变，显式 `appkit` 按键准备的对照也是如此。原生选项选择与 sheet 堆叠仍待解决。见 `artifacts/ir-popup-typeahead-TLnRd8/report.json` 和 `artifacts/ir02-popup-scoped-letter-6TMHum/report.json` |
| CDB-G02 `909557` | 运行器的 Electron 遮挡开关恢复了邮件 AXPress，未测得干扰。独立对照验证了日历和 Calc 对应记录均能保存。0.80 的计分轮通过了日历和阻塞记录检查，工作簿一致性仍待验证 |
| CDB-G03 `99589` | 独立对照已验证 Calc 工具栏编辑和保存、GnuCash 账簿导航及拆分备注保存。打开正式对账仍会让账簿越过其他后台窗口。计分轮工作簿一致性和 `y` 状态的安全写入仍待验证 |
