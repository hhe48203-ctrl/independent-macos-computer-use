# 持久 REPL 与独立光标的证据

[English version](../REPL_CURSOR_RESEARCH.md)

当前安装物已更新。2026-10-22的组件身份、接口/行为对照和重新逆向函数见 [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md)。本页保留历史日期及原生哈希范围，旧地址不能直接套用于新服务。

本轮核对日期：2026-10-19 UTC。功能开发基线为756b043，REPL 首次提交83a1083。以下为本机安装版本的观察，不代表所有 Codex 版本。

## 已证实的原版契约

安装目录 `Contents/Resources/cua_node/lib/node_modules/@oai/` 中，`cua-repl` 的 README、launcher、`cua` 0.2.6 的 `tinysky_alt/types.d.ts` 和 `bind_mac_app.js` 确认：独立 Node REPL 加载 cua；应用对象提供 getAXState/getScreenshot/getAXStateAndScreenshot、click、drag、pressKey、scroll、selectText、setValue、typeText、paste、performSecondaryAction。观察默认发出内容，emit:false 抑制输出，disableDiffing 控制差分。macOS scroll 使用 pages，截图返回字节。这里只记录契约，没有复制或分发原版模块。

本机 SkyComputerUseService SHA256 为 `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`。符号表与 Swift demangle 确认独立 ComputerUseCursor、嵌套 Window、Style、AppMonitor；包括 targetWindowID、correspondingApplicationPID、move(to:aboveWindowID:relativeToWindow:nextInteractionTiming:animated:fadeIn:isDelegate:)、show、press、windowDidMove、windowDidChangeScreen、activeSpaceDidChange。Style 包含 isPressed、angle、velocity 和伸缩状态。控制器还有截图坐标 scalingFactor 到窗口/屏幕坐标的转换函数。这支持“独立窗口呈现、与目标绑定、动画移动”的架构判断；不能仅从名字断言完整实现。

## REA 静态分析及边界

使用 [REA](https://github.com/morluto/rea) 6.5.0 的 MCP open_binary/procedure_pseudo_code，后端 Ghidra12.1.4，读取原文件0x90000..0x9c000字节范围，以0x100090000映射为 arm64 raw-binary，并以225个去重符号入口建立函数。原始切片、符号、伪代码仅存于被忽略的 `.research/cursor-v1/`，不进入交付包。

- show入口0x100092f80的结果表明会更新目标窗口相关状态，但出现越界调用和截断警告，不据此声称完整还原窗口排序。
- cursor初始化0x100090f70可见 Style 引用和 Window 创建链；原始切片缺少外部地址处的实现、运行时元数据与完整重定位，不能确认所有调用语义。
- Objective-C initWithContentRect入口0x10009b4c8为不返回的初始化路径，不能据此推导有效窗口构造参数。

这些限制保留在研究记录中。独立实现的窗口参数、轨迹和绘制均由本项目编写，再用真实桌面验证；未调用原版服务或复制其图形资源。

## 本项目的实现与差异

Node 默认 REPL 求值器保留真正的词法绑定和顶层 await，工作线程允许有界终止死循环。AsyncLocalStorage 将异步回调绑定到原执行，结束后的回调不能借用下一次执行发起原生操作。主进程持有串行原生后端；取消/超时/重置终止工作线程并等待原生清理。此运行时面向可信本地代码，不是安全沙箱。

应用对象绑定精确 PID+窗口，自己维护最新快照、AX差分和截图像素比例。窗口歧义、尺寸变化及过期引用明确失败。缺失应用不会隐式启动；paste当前只提供纯文本 AX 插入，未实现浏览器 API、富文本粘贴、修饰键点击或按住时长。

独立光标使用不可成为 key/main 的 NSPanel、ignoresMouseEvents 和普通 AppKit 绘制。用户提供的参考图指导浅色描边、半透明填充与柔和光晕，不分发图片。移动按约60Hz缓入缓出，输入等待到位；真实拖动包驱动可见进度。文本和语义操作指向元素中心，并不声称测量到插入点。窗口在操作间移动时跟随，缩放/大小变化时隐藏并要求重新观察；操作途中移动则停止，避免显示与投递错位。

普通窗口截图天然不含独立面板；显示器截图通过 ScreenCaptureKit 显式排除本进程光标窗口，可选择 includeAgentCursor:true 作验证。实验发现 NSWindow.sharingType=.none 会使系统截图中的光标区域变黑，已移除；没有把黑图当作可见性验证成功。

## 当前验证范围

`npm test` 已增加词法持久性、错误恢复、死循环/取消/退出、旧回调隔离、窗口及截图坐标契约、负坐标和多屏坐标公式、连续插值测试。只有一块物理 Retina 屏幕可用，多屏公式测试不等价于真实多屏验收。

`scripts/repl-desktop-test.mjs` 仅经公开的 js/js_reset 完成真实 AppKit 文本输入、按钮点击、截图及光标移动。记录连续中间帧、真实屏幕裁剪、包含/排除光标的对照截图、前台/覆盖关系和系统鼠标位置。生命周期测试的一轮系统鼠标及前台应用保持不变。桌面脚本另有pointerStationary=false的记录，来源未记录，不能将其归因于后端，也不能计为鼠标不动的证明。

新版pi、真人对照、窗口生命周期及真实拖动已完成；最终交付包须单独仓库外验收，结果和限制见 VALIDATION.md，不能以旧v0.3证据代替。


## 新版真人反馈：输入法与大小写切换问题（原始失败）

2026-10-19 新接口真人测试运行了84次后台真实操作，真人按键确实到达 Codex，用户报告修改后最终短句完整，但中英文切换和大小写切换困难。这是并用体验失败，不能因为最终文字完整或 foreground PID 不变而通过验收。观察器没有在字段开头找到约定标记，故文字自动判定也未通过；其当前只检查字段开头的局限需要单独修复，不能用观察器问题掩盖输入法问题。

该轮证据位于 artifacts/human-repl-1792389624088。已暂停真人测试并新增只读输入源ID、HID/combined修饰键掩码观察器，用于区分原生通知、真实快捷键、Unicode和鼠标路径的影响。当时暂停v1发布验收。后续修正和独立人工对照见下文；原因尚未证实，旧失败保留。


## 修正后的真人对照

证据 artifacts/ime-concurrency-1792390778074：10.001秒空闲、20.159秒真实后台操作，共29次后台操作。两阶段均采到 Canadian 与SCIM输入源以及Caps Lock/Globe状态变化；后台阶段43次硬件源keyDown进入Codex，2次TextInputSwitcher源事件进入Codex，17次helper键事件只投往自建目标。采样前台始终Codex。参与者明确报告“两阶段都正常，没有明显差异”。未读取Codex草稿，没有精确逐字符自动验证，不以此宣称所有输入法/应用兼容。

失败轮自有应用日志中72个局部激活区间平均342.8ms、最长758.6ms。光标动画原先放在text/key的局部激活之后，现提前到通知之前；新增作用时长和帧时间断言，真实文档回归通过。持续时间与切换困难的关联仍是推断，未证明唯一根因。无焦点恢复或真人事件过滤。

进一步静态追踪还确认本版本键盘事件生成使用sourceCreate(stateID:1)，本机枚举值对应hidSystemState；在0x100737654中读取combinedSession flags，比较0x1e0000修饰掩码，有区别时构造目标进程flagsChanged包，并在键包后恢复此前旗标。该差异只作后续研究记录，未未经验证地照搬到生产。REA原始切片在Swift间接续体上有截断，以上关键调用由限定地址范围的LLVM指令与本机枚举核对；伪代码未进入交付物。
