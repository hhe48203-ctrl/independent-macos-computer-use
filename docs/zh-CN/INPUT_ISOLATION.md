# 输入法与窗口升层调查

[English version](../INPUT_ISOLATION.md)

2026-10-24，macOS26.6.2 arm64。原版安装物现为 Codex26.1021.31345、sky0.7.13，原生SHA256为 `47ad8bdd901e4e55de649c319e8590eda3308f5f69c11d75486e13bd90bedeb7`。这是新的安装物身份；旧地址和旧通过记录不当作新版证据。

## 已证实的机制

独立版实验 AppKit 路径会在**系统键盘焦点仍属于别处时，激活后台目标的文本输入上下文**。自建应用内的记录捕获了 `NSTextInputContext.activate`，调用经过 AppKit 的 `currentInputContext_withFirstResponderSync:`、`NSApplication.updateWindows`。`TSMGetActiveDocument()` 从空变成目标文档，清理后恢复为空。600ms长按使局部激活区间约664ms，零时长约66ms。

组件实验在 accessory 和普通 regular AppKit 应用中，分别测试了应用激活通知、观测到的AX激活点点击、键盘焦点通知的全部八种组合。**应用激活通知＋激活点点击**会激活文本输入上下文，其他组合没有触发；真实Right键在所有组合中都生效。这是自建应用中的因果观察，尚不能证明历史真人输入法困难只有这一个原因。

输入源/修饰键采样没有证实持续的全局修饰键卡住；采样也排除不了所有瞬态。此前把动画移到激活区间之外，只缩短了这个区间，并没有消除输入上下文激活。因此，只检查前台/系统键盘焦点不变，不足以证明输入法隔离。

原版工具的一次运行中，测试目标实际收到了 **AX Raise**：调用栈为 `accessibilityPerformRaise → makeKeyAndOrderFront → order`，由辅助功能服务入口进入。142个样本中目标实际获得了前台/键盘焦点，最大采样间隔约36.5ms；同一区间有原版服务PID7749来源的事件。接收端调用栈证实了升层机制，但**没有识别AX客户端的audit token，也没有完整追到原版内部的策略分支**。后续把六次滚动与AX观察分开的一轮没有升层；条件是间歇性的，不能说每次普通滚动都会Raise。

## 已落实的规避

`setup-pi.mjs` 已将真实事件与局部激活解耦。默认及旧的 `--background-events` 参数都会配置 `CU_EXPERIMENTAL_APPKIT_FOCUS=0`，包括把旧生成配置中的1迁移为0。本项目的本地配置已经迁移；其他环境项保留。只有 `--experimental-appkit-focus` 才重新开启旧路径。改的是本地MCP配置，不改全局输入源、权限或原版应用。

真人并用时优先使用验证后的AX文字插入、`pressKey('CMD+A')`、`selectText(...)`、普通 `click(index)`（有AXPress时优先）。也验证了无局部激活的真实导航键、Unicode、滚动和EventPad拖动。普通AppKit应用的十一阶段记录中，**输入上下文激活/退出均为0，窗口排序调用为0**，目标始终被覆盖。独立的七项文档流程和真实pi MCP流程验证了内容及选区结果。

未内部激活的AppKit应用可能忽略部分**原生菜单快捷键和文本拖选**。无激活测试确实抓到了真实CMD+A和文本拖选未生效，这些尝试仍记为失败。并用流程改用已有语义等价操作；完整原生修饰键/拖动/保持测试保留显式实验路径。不会在失败后静默重试激活或切到前台，也不承诺任意画布/应用支持。

`cua.status().background` 会报告 `experimentalAppKitFocus`、`appKitFocusPolicy`、`AXRaiseRequestsInBackground:false`。最后一项表示helper在后台模式不主动请求AX Raise；目标应用自身仍可能打开/升层UI。顺序/焦点检查会在观测到异常后停止，检测不等于预防所有瞬态。原版公开cua_repl接口没有文档化的“禁止激活/Raise”参数。本项目不修改其服务，也不在出错后恢复窗口/前台来掩盖结果。

## 验证与边界

```sh
npm run test:focus                  # 自建普通应用，不发送局部激活
npm run test:document:cooperative  # 必要时使用语义等价操作
npm run test:pi:document            # 真实pi MCP客户端，关闭局部激活
node scripts/focus-ablation-test.mjs --regular
# 原版只读控制器；真实输入仅由合法cua_repl工具提供
node scripts/focus-original-controller.mjs
```

诊断只在临时自建夹具中替换公开输入上下文方法，每次原实现仍恰好调用一次；NSWindow覆盖只记录后调用正常父类实现。诊断不链接到生产helper，不对Codex或其他应用插桩。记录输入源ID、修饰位、TSM标识和调用栈，不读取前台草稿或键盘文字。自建窗口另有仅诊断用的拒绝Raise开关，供进一步对照；这不是通用MCP预防方案。

此前测试调度的ps检查与编译之间存在竞态。现已用跨进程原子租约覆盖夹具生命周期，支持嵌套重连；构建也会拒绝占用中的输出目录。第二进程拒绝与正常释放均有回归检查。一轮重叠实验已明确改记为无法判定。歧义/缺失的测试文字、未激活时被忽略的原生动作、pi最初读回验证中的JavaScript错误也保留为失败，不用后续通过改写。

随后完成了真人并用对照：空闲10.001秒、后台20.551秒，两阶段间有等待开始信号的空档。30次后台操作均未创建局部AppKit激活会话；两阶段记录到Canadian/SCIM输入源切换，后台阶段记录到Caps Lock/Globe状态。后台区间76条key-down元数据中，62条来自真人并投向Codex，14条来自helper并投向测试应用。参与者确认“两阶段都正常，没有窗口升层”，并明确接受“可以认为解决这个问题了”。没有读取前台草稿或逐字读回。此单人验收不外推到任意应用及实验长按。原版Raise决策的精确触发条件和历史输入法困难的唯一原因仍未完全确认。精简数据与本机路径见 [input-isolation-evidence.json](../input-isolation-evidence.json)；此前[v1.1对照](COMPATIBILITY_V1_1.md)及[v1真人记录](VALIDATION.md)保留为历史证据。
