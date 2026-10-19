# v1.0.0 — cua REPL 与连续独立光标

公开 MCP 接口从17个 cu_* 工具变为 js/js_reset；旧客户端须迁移，脚本与语法见 JS_API.md。真正保留顶层 await、var/let/const 和应用对象，自动输出 AX 差分与富截图；超时/取消/重置有界清理。

独立原生光标按参考图绘制浅色描边、半透明小箭头与柔和光晕。约60Hz缓入缓出移动，操作等待到位，真实拖动包驱动进度；穿透点击、不可成为key/main、不移动系统鼠标，窗口移动跟随、缩放失效、取消/重置/目标退出清理。

本机验证：25项回归；pi仅9次js调用完成真实快捷键、中文/emoji、选择拖动、滚动、原始点击；真实桌面与生命周期测试；10秒空闲/20秒后台真人对照。失败那轮输入法/大小写切换困难保留。将动画移到局部AppKit焦点通知前后，29次真实后台操作与43次真人Codex keyDown并存，参与者报告两阶段都正常。时间重叠是推断的原因，单轮对照不证明任意输入法/应用兼容。

源码和预编译包独立运行，不包含原版模块/二进制/图形资源，不依赖Codex、原版服务或密钥。macOS正常TCC仍必需。只有一台macOS26.6.2 arm64/单物理Retina屏实测；原始事件路径包含系统SPI，局部AppKit焦点默认关闭并限定已验证OS。浏览器API、富文本paste、修饰键点击和按住时长未实现；明确报错。普通截图排除独立光标。

v0.3的公开接口已退役，以下仅为历史发布说明。

---

# v0.3.0 — 独立后台真实输入

Node MCP stdio 与独立 Swift helper，17 个工具；运行时无需 Codex、原版 Sky 服务、私有 socket 或 API key。源码及预编译 arm64 包只包含独立实现与已列明许可证的依赖。

## 选择运行方式

默认保留经过验证的 AX 文本/按钮路径和独立截图、OCR、定向事件；不允许前台控制。真实文字使用 `cu_type_text strategy:"event"`，真实按键使用 `cu_key strategy:"event"`，真实单击使用 `cu_click strategy:"event"`；服务不会暗中把它们换成 AX 或前台操作。

`cu_launch` 默认只返回已有唯一实例；启动新应用必须显式 `allowVisibleWindows:true` 接受可见布置。`activates=false` 不能保证新窗口不升层。多个实例应先选择 PID，服务不盲目重开其中一个。

在本轮验证的 **macOS 26.6.2 arm64**，可显式启用局部 AppKit 焦点路径，改善未激活窗口的真实控件处理：

```sh
CU_EXPERIMENTAL_APPKIT_FOCUS=1 node /absolute/path/to/independent-macos-computer-use/src/server.mjs
```

MCP 客户端可参考 `examples/mcp-background-events.json`，将该变量放入服务器配置的 `env`。源码项目的 pi 安装命令为 `node scripts/setup-pi.mjs --background-events`；只更新项目内配置，保留已有服务器环境设置，不改全局配置或凭证。本机项目已配置此模式。默认插件清单不开启实验路径。

## 已验证的范围

| 路径 | 实际证据 |
| --- | --- |
| 完全遮挡的自建 AppKit 文档 | 真实 Unicode（中文、emoji、NFD、ZWJ、换行）、导航键、CMD+A、点击、拖动选择、滚动，全部精确读回 |
| pi → 标准 MCP → 独立 helper | 16 次工具调用、7 次真实操作、0 工具错误；普通中文/emoji 文本精确一致。编码边界另由直接 MCP 测试验证 |
| 真人前台并用 | 133 次后台真实操作；前台完整15字符、32次按下和32次松开接收、1759个指针位置；用户确认有手动改字/退格。窗口和焦点采样无目标升层/获焦 |
| 系统计算器 | 5 次真实按钮点击，7×8=56；操作阶段完全遮挡 |
| 系统 TextEdit | 真实 Unicode 精确追加、点击、拖动选中30个 UTF-16 单元、滚动；操作阶段完全遮挡 |
| 默认模式与回归 | 11 项静默桌面检查、18 项单元/传输/原生检查，包括取消、超时、Unicode 分包、事件记录器及运行中程序覆盖保护 |
| 实际交付包 | ZIP 在仓库外运行截图、OCR 和7次真实文档操作；源码 tar 在仓库外安装锁定依赖、重建 helper、通过18项检查且无跳过 |

系统应用的**可见布置单独计量**：本任务新建窗口可短暂显示，再用正常系统 API 回到原前台。后台验收从布置完成后开始；MCP 后台实现不依赖操作后的前台恢复。

历史测试曾有真实升层、长输入丢字、人工观察未确认，以及测试记录器自身异常。它们仍保留，未倒改成成功。新证据索引见 `validation-index.json`，机制与更正见 `FOCUS_FIDELITY.md`。

复现交付文件验收：先 `npm run package`，再运行 `CU_EXPERIMENTAL_APPKIT_FOCUS=1 node scripts/packaged-document-test.mjs` 和 `node scripts/source-package-test.mjs`。后者先尝试离线缓存，必要时通过隔离 npm 配置访问公共 registry，关闭安装脚本，不读取用户 npm 认证配置。真人输入只在安排参与者后单独进行；自动验收不会模拟参与者输入。

## 边界

实验路径默认关闭，并对未核对的 OS/架构在发包前拒绝。默认功能最低编译目标为 macOS14.4，其他 OS、Intel、多显示器仍未实机验收。使用了动态解析的系统 SPI；不能保证以后系统更新或任意应用兼容。

没有移植原版全部 ViewBridge 焦点抑制/键盘转送状态机，也不冻结画面、注入进程、改 TCC、压制他人硬件事件或操作后抢回焦点。采样存在间隔；一次真人通过不代表所有瞬态时序都无干扰。应用可能自行激活或升层，检测到即失败并停止，不自动重发输入。

正常 Accessibility / Screen Recording 授权仍是必要条件。隐藏、最小化、其他 Space、锁屏和独立桌面不在支持保证内。Unicode 是事件载荷输入，不模拟 IME composition。
