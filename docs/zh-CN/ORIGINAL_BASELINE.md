# 原版对照基线：2026-10-22

[English version](../ORIGINAL_BASELINE.md)

本页保留 v1.0 历史基线。后续 v1.1 坐标兼容、修饰键/时长、滚动校准与显式重连见 [兼容改进验收](COMPATIBILITY_V1_1.md)。

本次更新的是本机安装物的身份、接口核对与行为对照。生产运行时保持 v1.0.0，不改原版应用，不连接其私有 socket，不导入其专有模块，也不重置系统权限。原版动作只通过当前会话正常提供的 `cua_repl` 发出，观察器只读取自建窗口和输入/窗口元数据。

机器清单见 [original-baseline.json](../original-baseline.json)，结果、函数身份与 REA Evidence ID 见 [original-comparison.json](../original-comparison.json)。旧 [evidence-manifest.json](../evidence-manifest.json) 保留为历史记录，不覆盖。

## 安装物变化

| 组件 | 旧清单 | 本次 |
| --- | --- | --- |
| Codex App | 26.1013.31256 | 26.1016.61520，build21421 |
| @oai/cua-repl | 0.1.0 | 0.1.2 |
| @oai/sky | 0.7.8 | 0.7.12 |
| @oai/cua | 0.2.6 | 0.2.6；以前未保存完整包清单，不能断言内容未变 |
| @oai/browser-desktop | 旧清单未记录 | 0.1.1；不能据此断言本次新增 |
| 原生服务字节数 | 24,934,560 | 25,016,528 |
| 原生 UUID | 6AD9DE94-5466-38A4-B2E0-F81DFBC620DB | 374107F0-B948-3F44-A251-E9E7D5FEBC70 |

旧清单日期为10月17日；后续焦点记录另记 App 26.1013.40934，但对应的旧原生服务哈希相同。本次实际安装服务与运行时包内附服务哈希一致：

`ef4f4dc20e64ee29027bf178f553c0c39b9cfa517a4cd39734510259f23c058a`

原生仍为 arm64、最低macOS14.4、SDK26.1。App ASAR 哈希也已更新；本轮没有重建整个 ASAR 调用图。

REA 静态图比较中，sky 的221个已纳入文件相同、8个变化、5个新增；cua-repl 为8个相同、4个变化。sky 的变化涉及 native-pipe、音频处理/模型检查和 Linux 输入；新增 Linux typeCharacters。macOS `client.js` 与 `sky.js` 逐字节相同，仍使用 `CodexComputerUseIPC-5`、默认120秒请求时限。native-pipe 仍使用4字节小端长度、8MiB上限及JSON-RPC响应检查；音频 host 请求扩展不代表桌面动作协议整体更换。这里只静态核对该私有协议，没有发送私有请求。

## 接口核对

macOS 应用绑定仍提供12个主要方法：getAXState、getScreenshot、getAXStateAndScreenshot、click、drag、pressKey、scroll、selectText、setValue、typeText、paste、performSecondaryAction。emit/disableDiffing 仍由观察方法控制。新版 launcher 仍向可信 Node REPL 提供 cua，MCP入口为js/js_reset；本项目的公开工具无需因此更名。

| 契约 | 当前原版 macOS | 独立版 v1 |
| --- | --- | --- |
| App选择 | 名称、路径、bundle ID；绑定保留应用标识，重新解析实例。本轮旧对象继续操作了新建的同bundle测试进程 | 精确PID/窗口，失效后要求重绑；缺失应用不隐式启动 |
| 库存 | apps及browsers | apps/windows/status；没有浏览器接口 |
| AX | 观察后显式返回树或差分；动作自身不等同于重新观察 | 每次动作后自动发出AX差分 |
| 截图字节 | 本次实际为JPEG，1280×984 | 本次为PNG，1280×984 |
| AX-only 后的数组坐标 | 本次仍按Retina截图像素解释；40,387未选中文本，80,774到540,774选中31个UTF-16单元 | 按文档恢复窗口逻辑点；40,387到270,387选中31个UTF-16单元 |
| 文字 | typeText(text)，macOS拒绝Linux专用第二个元素索引 | 默认验证后的AX；strategy:event为精确读回的Unicode事件 |
| 页数滚动 | macOS pages；本次0.6后垂直值0.1735294 | 本次0.6后0.1388235；实现为窗口边长×0.8×pages，不能声称距离完全一致 |
| 点击/按键选项 | 包含修饰键、持续时长；按键使用xdotool风格语法 | 支持常用super/CMD等语法；修饰键点击、持续时长明确拒绝 |
| 文本paste | 静态文档说明使用系统pasteboard并恢复旧内容，含格式选项 | 纯文本AX插入；富文本未实现 |

JPEG 和 AX-only 的像素行为是本轮首次明确测量，**没有证据说明它们是这次版本更新才引入的变化**。这些差异不应写成“完全复刻”；也不在一次基线核对中静默改变已有v1坐标规则。paste/剪贴板、音频、Linux/Windows、浏览器及所有选项组合没有本轮动态覆盖。

## 真实行为对照

同一自建 AppKit 文档，目标完全被覆盖。每步原版调用后，由独立的只读AX观察器读回；不是把工具返回无错误当作动作成功。两种实现分别使用其已经核实的坐标规则。

| 检查 | 原版 | 独立版 |
| --- | --- | --- |
| 到文末、全选、回文首 | 3项通过 | 3项通过 |
| 中文、emoji、NFD、ZWJ精确追加 | 失败：期望 `【基线 中文🙂 é 👩‍💻】`，实际 `【  e 】` | 精确一致 |
| 文本拖动选择 | 31个UTF-16单元 | 31个UTF-16单元 |
| 页数滚动 | 通过，距离如上 | 通过，距离如上 |
| 富截图、截图像素点击 | 2项通过，按钮计数1 | 2项通过，按钮计数1 |
| AX设置值、中文子串选择 | 2项通过 | 2项通过 |
| 合计 | 9/10，completed-with-differences | 10/10，passed |

原版记录25,719次焦点采样，最大间隔约119.5ms；独立版的最新数据以JSON结果为准。两者都没有采到目标获得前台或系统键盘焦点，窗口顺序样本也没有目标升层。采样不保证每个瞬间隔离。用户期间可能移动系统鼠标，不能把指针变化归因于后端；本轮没有新的人机逐字并用/IME体验验收。

原版服务的两个126×126窗口候选分别出现24和120种几何位置，支持本轮存在中间位置的移动观察；并非所有候选都已证明是光标。轮询不是绘制帧率测量。独立版的连续移动与生命周期保证仍由v1原有测试支撑，本轮没有更换光标实现。

25项原有回归及5项新增基线判定检查全部通过，共30项且0跳过；新检查防止重复步骤替代缺失项、观察器过期后误报成功，以及独立版失败却返回零退出码。真实桌面对照通过公开js接口调用独立版；没有用旧cu_*入口代替。

## 为Unicode差异重新逆向的函数

当前服务中，`AccessibilitySupport.SynthesizedEvent.type(string:)` 入口为 `0x10075e2c8`。其异步续体在 `0x10075e408` 装载 `keyPressesForString:` selector，并在 `0x10075e418` 调用Objective-C派发；selector引用为 `0x1014cadb8`。

`+[SAIVirtualKeyPress keyPressesForString:]` 从旧符号地址 `0x10024c2e4` 移到 **`0x10024eb48`**，本次边界长604字节。定向REA/Ghidra及限定地址的LLVM、间接符号表核对确认：

1. 读取当前键盘布局，使用UCKeyTranslate。
2. 对NSString的UTF-16单元逐个处理，遍历键码0..127和8组修饰状态寻找匹配；LF映射为CR。
3. 找不到映射时走日志分支并前进，没有在该函数中直接注入未匹配的Unicode单元。

这条当前路径解释了为什么任意中文、emoji代理对、组合附加符不能被假定可靠转换，也与收件窗口实测一致。不能据此声称所有输入法问题或任意应用失败都只有这一原因。从RPC type_text分发到上述异步入口的全部续体，本轮没有逐个还原；转换器调用和循环是静态事实，其与实测丢字的关联有收件结果支持，不能写成完整动态调用链已被捕获。独立版继续使用自己已验证的Unicode事件分包和逐包读回，不照搬原版的字符丢失行为。

使用REA6.5.0、Ghidra12.1.4，1292字节只读raw切片、8个显式种子。伪代码尾部有bad-instruction和邻接函数混入警告，故核心结论回到604字节指令及TIS/UCKeyTranslate/NSLog导入核对；不把伪代码视为完整源码。完整REA inspect-macho在180秒超时，未隐瞒为成功。

光标move/show等命名入口到下一个函数符号的片段长度与旧版相同，但入口片段字节哈希不同；这些片段不代表整个异步函数。键盘和鼠标函数也有地址移动。完整对应表在JSON中。**不得只因地址未变而把旧伪代码当作新版本证据**；旧焦点研究仍限定旧服务哈希。本次没有重新移植整套ViewBridge/焦点抑制状态机。

## 复现与失败记录

```sh
# 只读检查当前安装物是否偏离保存基线；有变化时退出码1
node scripts/reference-baseline.mjs --check

# 为下一次调查生成新清单；旧清单保留在Git历史中
node scripts/reference-baseline.mjs --previous docs/original-baseline.json --output artifacts/next-reference.json

# 独立版同场景自动验证；只操作自建窗口
node scripts/reference-behavior-test.mjs --independent
npm test

# 原版：准备只读控制器，再通过正常cua_repl操作打印的自建bundle
node scripts/reference-behavior-test.mjs --cursor-owner ORIGINAL_SERVICE_PID
```

原版控制器向stdin接受JSON checkpoint：依次为nav、type、selectAll、top、drag、scroll、capture、click、setValue、selectText，最后finish。每个checkpoint应在对应原版动作及AX观察完成后发送，capture还须带实际字节签名、长度、宽高。JPEG不能用PNG偏移读取尺寸。拖动、滚动、点击需按新截图比例推导点，不照抄别的屏幕坐标。原版真实输入只由合法cua_repl调用，控制器没有私有RPC或原版模块依赖。

观察器最多180秒，控制器230秒超时会保存失败并清理；动作超出观察时段不能算作隔离通过。测试中发现并修复过观察器时限配置、控制器stdin退出及错误的PNG假设，原记录保留在JSON列出的artifacts目录。后续独立版补测在启动绑定时遇到CG/AX坐标不一致，零次目标keyDown/mouseDown，仍保留为失败；先前同场景10/10结果单独保存。参考窗口轮询间隔的元数据也已纠正，原始轨迹不改写。第一轮逻辑坐标拖动失败也保留；改用像素坐标的实验单独计量，没有把旧失败倒改为成功。

原始切片、反汇编、REA结果和完整运行记录仍在忽略目录。提交内容只有独立脚本、元数据与事实总结，不分发原版模块、机器码或凭证。v1.0.0标签和已有发布包不移动、不覆盖；本次为后续基线提交。
