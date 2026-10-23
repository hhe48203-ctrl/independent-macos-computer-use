# v1.1 兼容改进与实测

本轮围绕原版坐标、修饰键/按住时长、滚动距离和重启重连实现。仍是独立 MCP，只公开 js/js_reset，不引入原版运行时，不连接其私有 socket。已有 v1.0.0 标签不移动。

## 坐标

`cua.getApp(reference,{coordinateMode:'original'})` 保留截图像素数组映射，AX-only 和动作自动读回不再切回逻辑点；默认 adaptive 保留 v1.0 规则。第一次 original AX-only 静默捕获实际截图比例，尺寸改变重新测量；无权限或无法测量即报错，不猜2倍比例。

每次 AX 全量/差分都有 Coordinates：unit、scaleX/Y、左上原点、有效范围（上界不含）以及 axFrameUnit。AX/OCR矩形始终使用逻辑点。`getCoordinateInfo()` 可读取当前映射；`getAXStateAndScreenshot()` 另返回 coordinates。实时多选测试在 original 模式下跨多次 AX 自动读回点击不同像素位置，验证了映射没有恢复成逻辑点。真实重连测试使用 maxDimension:640（比例1而非固定2），新对象保留像素单位与640宽范围。

## 修饰键、持续时间与取消

click 的 key 接受 super/cmd/command/meta、shift、ctrl/control、alt/option（+组合）；click/pressKey 接受 durationMs 0..5000，明确指定时强制后台事件。显式 ax 策略拒绝修饰键/按住点击。不生成全局修饰键事件，也不模拟系统自动重复。

路由仍只匹配本 helper 的源 PID、每操作 nonce、目标 PID/窗口。现在按包保存调用方要求的 flags：临时 Command 被移除，真正要求的 Command 保留。激活点准备点击仍不带调用方修饰键，不会把 Shift/Command 意外用于标题栏。key-up 时间戳在释放时生成。重置/取消尝试向原目标释放；硬终止或目标消失不能保证收件。

真实 AppKit NSTableView 通过普通点击选中第0行，Shift点击第2行得到[0,1,2]，Command点击第1行得到[0,2]，不是只断言发送函数无错误。接收队列记录真实 down/up 与修饰 flags；按键同时核对 NSEvent 时间戳差。NSTableView 跟踪循环直接消费 mouse-up，因此测试 logger 在 nextEvent 队列记录，不能仅依赖 local monitor。重置分别中断5秒键盘和鼠标长按，确认收到了对应释放。

这些是目标事件/收件结果与采样检查，不是新的真人 IME 验收。可选实验 AppKit 通知覆盖请求的按住区间，长按不外推为任意应用或输入法并用兼容。

## 滚动测量与取舍

使用两个**自建应用**：AppKit NSScrollView 自绘大画布，和 WKWebView 本地 HTML 大容器（无网络页面）。窗口总尺寸420×360、900×700；内容视口分别高328、668；从x/y=2000开始，避开边界。读回各自真实 content offset，覆盖单次、连续三次、反向和水平。原版输入仅由合法 cua_repl 发出；控制器只调整/观察自己的夹具。

| 操作 | 原版 AppKit / WebKit | 独立版 v1.0 | 独立版 v1.1 |
| --- | --- | --- | --- |
| 高360，向下0.6页 | 216 | 173 | 216 |
| 高360，连续三次0.6页 | 648 | 519 | 648 |
| 高360，向上0.3页 | -108 | -86 | -108 |
| 高700，向下0.6页 | 420 | 336 | 420 |
| 高700，连续三次0.6页 | 1260 | 1008 | 1260 |
| 高700，向上0.3页 | -210 | -168 | -210 |

垂直结果支持使用**窗口总高度×页数**，并非内容视口高度。v1.1 默认 `round(height*pages)`；`scroll(target,direction,pages,{distanceMode:'legacy'})` 保留0.8系数。整数样本不能证明原版的所有小数取整规则，最多允许合理的单点舍入差。返回 scrollDistance 明确实际发送的逻辑点增量，应用仍可能限幅/忽略。

原版本轮水平输入在两种应用/两档尺寸都未观察到位移；其中一次 AppKit 大窗口向左还报 noWindowsAvailable，错误单独保存，不把0当成功。独立版水平可正常产生202/-101点（宽420）及432/-216点（宽900）。因此水平保持原有 `round(width*0.8*pages)`，不宣称原版兼容，不复刻零位移。

为解释水平异常，对当前哈希 ef4f4d… 的函数做了有边界的静态分析：`SynthesizedEvent.scroll` 入口0x10075dd54，在0x10075dde4将 wheelCount 参数设为1，再调用0x1002611ac的命名封装。封装保留六个参数并跳到延迟解析函数指针；本轮没有继续证明该指针在运行时的最终地址。Apple SDK中对应接口第二轮轴需要 wheelCount=2。本机**只构造、不投递**事件的探针也显示：同样 wheel2=-252，wheelCount=1时axis2=0，wheelCount=2时axis2=-252。这是与现象相符的静态解释，不能等同于已捕获完整原版动态调用链。没有分发反编译代码。

## 隔离与失败记录

独立版完整20组矩阵（12组垂直、8组水平）逐项精确核对收件偏移，全部通过前后覆盖/非激活检查。WebKit原版10组观测也完成，但水平为无位移。AppKit原版较早的完整垂直组有正常覆盖记录；后续补测却出现目标升到遮挡窗口上方，尽管 active/key仍为false。本轮保留升层轨迹并停止该补测，没有恢复前台/堆叠来掩盖结果。

还保留了：非交互stdin导致原版控制器0组完成、初轮大窗口覆盖检查失败、原版AppKit noWindowsAvailable、独立版光标接近途中 WINDOW_MOVED 的停止。新版夹具在动作前观察几何稳定，自己的校准窗口可跨Space显示；这仅是测试布置，产品仍要求目标处于当前解锁桌面，不因此扩展跨Space保证。原生移动/焦点检查没有降低，失败动作没有盲目重试。

重连初轮测试错误地假定只有一个CG窗口，实际还有隐藏辅助窗口；已改为明确选择已观察的PID/窗口。API本身始终列出候选，未自动选第一项。构建保护测试改用自建签名进程的ready握手；旧复制/bin/sleep进程提前SIGKILL的问题保留，原因未确认。

## 复现

```sh
npm test
npm run test:input-options
npm run test:reconnect
npm run test:scroll
# 旧距离算法（同样逐项检查真实偏移）
node scripts/scroll-calibration-test.mjs --independent --legacy
# 原版只读控制器，正常 cua_repl 操作所打印的自建 bundle
node scripts/scroll-calibration-test.mjs --webkit-only
```

原版控制器stdin：prepare包含flavor和size；每次完成对应原版输入及观察后发送checkpoint（direction/pages/count，可记录error）；finish检查整个矩阵，缺组不通过。每档依次为down/0.6/1、down/0.6/3、up/0.3/1、right/0.6/1、left/0.3/1。不能把未执行项或异常后的0偏移当成功。隔离字段是前后及应用自采状态，不是无间隙硬件证明。本轮没有新增第三方真实应用、多屏、长期运行或真人长按验收。

本机原始结果与精简可分发清单见 [compatibility-v1.1.json](compatibility-v1.1.json)。
