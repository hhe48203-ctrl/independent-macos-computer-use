# 用 Pi 运行 Cua Driver Bench v2

[English version](../BENCH_V2.md)

`npm run bench:v2` 接入 Cua Driver Bench v2 指定提交 `22a67eacd15dc71811e330ed88951dd615bb395d` 的十个 macOS 任务。运行器将锁定的源码取到 `.research/`，按 Git blob ID 校验文件，复用上游任务提示、种子、测试应用、检查器和 A22 计分。我们的实验组由 Pi 调用本仓库的 MCP，模型固定为 `openai-codex/gpt-6.1-terra`，推理档位为 `high`。[上游锁定版本](https://github.com/trycua/cua/tree/22a67eacd15dc71811e330ed88951dd615bb395d/libs/cua-driver-bench)

```sh
npm ci --ignore-scripts
npm run build
npm run bench:v2 -- --doctor
npm run bench:v2 -- --prepare
npm run bench:v2 -- --run --tasks benchlab
```

需要解锁的 Apple silicon Mac、macOS 26 或更新版本、Python 3.10+、Node 22+、Xcode Command Line Tools，以及支持内置直连 MCP 的 Pi。通过 macOS 设置给现有 helper 授予辅助功能和屏幕录制权限。运行器用 `pi auth check` 核对指定提供方和模型，由 Pi 通过临时链接复用现有登录。运行器不读取或导出凭证，平时的 Pi 设置和 MCP 配置保留。非默认安装可通过 `PI_COMMAND`、`PI_CODING_AGENT_DIR` 或 `CU_BENCH_PYTHON` 指定。

`--run` 启动自建的 BenchLab 和 BenchSentinel。哨兵按实验设计取得焦点，在自己的窗口内模拟用户输入。请留出桌面供测试使用。每轮先等硬件空闲，检测到硬件空闲计时回落，或结果目录里出现 `STOP` 文件时，会中止当前模型运行。也可用 Ctrl+C 停止。运行器只清理自己启动的进程组并释放测试租约。

## 选择任务和条件

默认 `benchlab` 选择 MB-09–11 和 IR-01–04。快速验证可用 `--tasks IR-02,MB-09`。省略 `--run` 只输出计划。`--condition` 可选 `background`（默认）、`foreground` 或 `both`。前台条件使用上游的见证窗口，并允许显式调用 `app.hover` 聚焦测试窗口、移动系统鼠标。其余操作仍走后台输入。用 `--runs 1` 至 `--runs 5` 控制每项重复次数，`--seed` 控制任务顺序。每轮最多 360 秒和 45 回合。

用 `--run-index 0` 至 `--run-index 4` 代替 `--runs`，可只复现一次上游重复。计划会列出实际任务种子。中断后可用 `npm run bench:v2 -- --run --resume artifacts/bench-v2-pi-…/summary.json` 继续新版记录。运行器从逐轮目录恢复结果，跳过已计分轮次，把基础设施重试写入独立目录。续跑前核对源码与可执行文件哈希、测试应用、提供方和模型、任务计划及环境。旧汇总可用于查找重复索引，再开一轮对照。若留有 `STOP` 文件，需先移除才能续跑。

`--tasks v2` 还包含 CDB-G02、G03、G04。它们需要 LibreOffice、GnuCash、Chrome 和 taskpack 中锁定的 Electron 应用。在锁定源码的 `taskpack/tasks/shared/cdb-s0{2,3,4}/apps/` 下各项目目录执行 `npm ci`，再用 `--doctor --tasks v2` 检查确切依赖。实跑在专用桌面进行，并加 `--allow-multi-app`。已有测试应用或需独占运行的桌面应用会拦截预检。锁定命令使用本轮全新的 `--user-data-dir` 时，测试 Chrome 可与已有实例并行运行。MCP 仅可访问运行器启动的进程组内的 PID。临时 LibreOffice profile 会在启动前关闭欢迎与提示对话框。缺少依赖时预检会停止运行。

运行器给自己启动的 Electron 测试应用传入 `--disable-backgrounding-occluded-windows`，使渲染进程在窗口完全被遮挡时仍能响应辅助功能操作。锁定的题目源码、GUI-only 规则、检查器和 A22 判定继续生效。

当一轮包含多个受控目标进程时，运行器提示 Pi 使用 `getApp(...,{emit:false})` 绑定窗口，从新的 AX 观察中打印所需行，并追踪各窗口的待办步骤。对于 Daymark Calendar，提示说明如何选中已有事件、核对字段焦点及写入结果，并重新打开事件确认保存。

若一轮包含 LibreOffice Calc，运行器会说明已验证的 GUI 路径，包括选择单元格、打开 Formula 编辑器、按 Accept 提交及使用 Save `AXMenuButton`。为 Calc 启用显式实验按键时，提示还会说明用 Enter 提交、Command–Page Down 和 Command–Page Up 切换工作表、Forward Delete 清空已核对的单元格，以及 Command-S 保存。每步之间重新读取 AX，提交后核对单元格的实际值。

在专用桌面上运行后台试验时，可重复传入 `--appkit-key-bundle BUNDLE_ID`，允许指定应用的 `pressKey` 显式使用 `strategy:'appkit'`。若要为普通左键坐标点击启用同一策略，可单独传入 `--appkit-click-bundle BUNDLE_ID`。两种选项都为指定调用启用实验性应用内焦点准备。运行器把两份应用列表写入日志，续跑时沿用。试验按 A22 和 GUI-only 计分。

测试 Chrome 进程沿用登录会话的 `HOME`，以便在 macOS 上打开 loopback 页面。它仍使用本轮新建的 profile，并仅为本次启动关闭其更新调度器。Pi 和其他测试进程继续使用隔离的 home。[Chromium 启动参数](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/chrome_switches.h)

```sh
npm run bench:v2 -- --tasks v2 --condition both --runs 5
npm run bench:v2 -- --doctor --tasks v2
npm run bench:v2 -- --run --tasks v2 --condition both --runs 5 --allow-multi-app
```

## 读取结果

对已计分的后台轮次，终端会列出检查器分数、任务通过状态和 A22 通过项数。`background_completion` 要求任务通过且 A22 八项全部满足。基础设施尝试会显示状态，具体错误记录在逐轮 JSON 中。

原矩阵和针对性修复对照分别记录。[Bench v2 失败复现记录](BENCH_V2_REMEDIATION.md)

`artifacts/bench-v2-pi-*/summary.json` 记录计划、实测提供方和模型、token 用量、实际回合数、用时、检查器结果和 A22 判据。各轮保留 Pi JSONL、测试应用状态和事件、哨兵记录与检查器输出。`provider_error_count` 记录每次模型错误响应。若最后一条助手响应以 `stop` 正常结束，此前的错误记为已恢复。提供方尚未恢复就结束的轮次保留基础设施状态。基础设施错误会终止后续计划，不进入已计分分母。任务未完成或发生干扰也会保留为有效成绩。退出码零表示计划内各轮均完成计分。任务成功率与后台完成率请读取报告中的独立计数。

`driver_isolation` 列出原生驱动观察到的隔离错误，包括已有后台窗口之间的顺序交叉。有事件时也会写入 `driver-isolation.jsonl`。每条记录包含错误代码和原生操作。A22 仍按锁定版哨兵的测量计分。

`turn_cap_reached` 记录由 Pi 基准扩展确认的本地轮次上限。Pi 为这次本地停止生成的中止响应不计入 `provider_error_count`。证据可用时，这类轮次保留评估器分数，任务状态记为未通过。

Pi 只获得两个 MCP 工具。benchmark 的 JS 限制阻止系统、文件和网络调用，原生操作按 bundle、受控 PID 和已观察快照限定范围。截图只覆盖测试窗口。前台试验可为 MB-10、MB-11 显式调用 `app.hover`，投递真实指针移动。`app.move` 只移动视觉光标。上游哨兵测量 A22 的八项判据。

试验期间分别观测实体 HID 事件计数和 IOKit 空闲时长。HID 计数变化或无法归因的空闲计时回落会中断本轮。只有核实可执行文件、MCP scope 和 Pi 父进程链都指向本轮 helper，并且 HID 计数保持不变时，才允许带着新的 WindowServer 活动记录继续。上游哨兵的测量和 A22 计分保持原规则。

这是使用锁定任务集的本地 Pi 实验组。解读成绩时请注明显示器、任务、重复数和工具策略。上游横评使用不同的 agent、桌面和运行计划。[上游方法](https://github.com/trycua/cua/blob/22a67eacd15dc71811e330ed88951dd615bb395d/libs/cua-driver-bench/METHOD.md)

2026-11-08，隔离的 Pi 连接确认了指定提供方和模型，并完成一次空窗口 MCP 调用。桌面试验在启动任何窗口之前等待空闲超时，本次集成暂无计分结果。三项多应用工作流所需的部分依赖在本机尚未安装。
