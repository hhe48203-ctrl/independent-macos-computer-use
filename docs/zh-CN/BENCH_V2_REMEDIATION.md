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

CDB-G02/03 工作流复现见 `artifacts/bench-v2-pi-20261109T064232356505Z/summary.json`。G04 独立 profile 复测见 `artifacts/bench-v2-pi-20261109T064650603373Z/summary.json`，MCP 范围只包含新启动的 Chrome PID。G03 更新临时 profile 后的结果见 `artifacts/bench-v2-pi-20261109T065029893913Z/summary.json`。在这些轮次中，A22 八项均通过，检查器分别得 0.20、0.45、0.15。

用本机 Codex Computer Use 服务（构建 `1001824`）单独对照 MB-09 种子 `790113`。原版 `cua_repl.drag` 对同一行启动了原生拖放，但无投放事件，顺序未变。哨兵的 419 次采样没有观察到键焦点丢失、激活变化、鼠标移动或打字干扰。这是一次未计分的原版对照。静态检查确认了 `NSEvent` 鼠标构造、事件子类型及窗口字段、PID 投递封装，以及此前调查记录的独立焦点通知机制。本轮仍未证实原版由哪条分支保护焦点。见 `artifacts/mb09-original-compare-DDSKEi/report.json` 和 `artifacts/original-drag-path-WrKjJE/`。

G04 的启动对照分离出了环境故障。使用合成的 `HOME` 时，Chrome 能打开本地文件，loopback 档案页却保持无标题或停在上一页。只改用 macOS 的常规临时目录仍失败。仅让测试 Chrome 进程沿用登录会话的 `HOME` 后，初始档案页及本地文件和档案页之间的双向导航都恢复。Chrome 仍使用全新的 profile，MCP 仍按本轮精确 PID 隔离。环境对照见 `artifacts/cdb-g04-exact-launch-tZWULq/report.json`、`artifacts/cdb-g04-canonical-temp-O3xGBK/report.json` 和 `artifacts/cdb-g04-browser-home-jjDzxX/report.json`。

G04 随后暴露了两个独立控件问题。`AXSelectedText` 只改变地址显示，同一窗口通过 `AXValue` 和 Enter 成功加载目标。打开 Cases 状态菜单造成一次真实失焦及升层。关闭状态的下拉框取得应用内焦点后，可以用普通按键选择。定点对照见 `artifacts/cdb-g04-entry-method-WqeBwF/report.json` 和 `artifacts/cdb-g04-select-control-pWNEfA/report.json`。中间的 Pi 轮次见 `artifacts/bench-v2-pi-20261109T201958876608Z/summary.json`、`artifacts/bench-v2-pi-20261109T202723280877Z/summary.json` 和 `artifacts/bench-v2-pi-20261109T203014679951Z/summary.json`。通过的一轮见 `artifacts/bench-v2-pi-20261109T203407641140Z/summary.json`。

Chromium 控件防护探针核对了两个 Cases 下拉框。打开菜单的动作都在投递前被拒绝，随后通过应用内焦点和普通按键成功选择状态和链接，哨兵无干扰。见 `artifacts/cdb-g04-select-guard-phFOuM/report.json`。

G03 的 GnuCash 截图暴露了另一个边界缺陷。ScreenCaptureKit 把启动提示拼进普通账本截图，缩小了账本内容，接口仍按账本尺寸报告比例。`a2b0361` 排除隐式子窗口。同一 800 × 632 逻辑点账本现在完整填充 1600 × 1264 像素截图，比例为 2×。前后截图见 `artifacts/cdb-g03-control-inventory-bbmq5U/` 和 `artifacts/cdb-g03-viewport-8CDoMk/`。显式前台悬停仍可截取其临时窗口，MB-10/11 在 `artifacts/bench-v2-pi-20261109T203944095385Z/summary.json` 中再次得 1.0。

| 待办 | 已有逐轮证据 |
| --- | --- |
| MB-09 `790113` | `drag_begin` 比第一次哨兵失焦采样早约 45 毫秒。同种子的 1 点短拖动只引发目标升层，未触发拖放会话或键焦点丢失。长拖动开启 AppKit 会话、夺走键焦点且未完成投放。保留全程 Command 标志仍复现。见 `artifacts/mb09-drag-threshold-34DwfW/report.json` 和 `artifacts/mb09-command-drag-igkzdF/report.json` |
| IR-01 `147201`、`517139` 和 IR-02 `487371` | 无视觉光标时直接通过 AX 按 Next，仍复现了原生 sheet 让目标越过另一后台窗口，哨兵始终保持键焦点。此前打开菜单则单独造成过失焦。在应用内聚焦的 AppKit 下拉框发送普通按键，选值未改变，见 `artifacts/ir-popup-typeahead-TLnRd8/report.json`。原生选项选择与 sheet 堆叠仍待解决 |
| CDB-G02 `909557` | 邮件按钮接受 AXPress，详情仍是占位内容。进程定向事件打开了邮件，同时使目标窗口升到哨兵上方。AX 聚焦 setter 返回成功，按钮却未取得应用内焦点。两个鼠标包都保留 Command 后隔离正常，但详情仍未打开。见 `artifacts/cdb-control-probe-DX5zse/report.json`、`artifacts/cdb-alternate-gui-PS60Ru/report.json` 和 `artifacts/cdb-modifier-gui-h1L7t6/report.json` |
| CDB-G03 `99589` | 临时 Calc profile 已消除欢迎弹窗。原单元格仍读到旧值，AX 也把坐标报在窗口外。按正确截图坐标点击时，Calc 升到哨兵上方。GnuCash 的 AX 只暴露窗框。启动提示可安全关闭，但点击账户展开控件会成为前台并夺走键焦点，探针在编辑前停止。见 `artifacts/cdb-g03-value-readback-fhsa01/report.json`、`artifacts/cdb-alternate-gui-PS60Ru/report.json` 和 `artifacts/cdb-g03-ledger-navigation-Bk04Al/report.json` |
