# JavaScript API

[English version](../JS_API.md)

Agent 只看到两个 MCP 工具，旧的17个 cu_* 工具已从公开服务移除。原生 JSONL 方法是内部实现，不能当作公开 MCP 调用。

| 入口 | 参数 | 行为 |
|---|---|---|
| js | code:string, timeout_ms?:100..120000（默认30000）, title?:string | 在持久 Node REPL 求值，返回有序文本与图像块 |
| js_reset | {} | 停止 JS 与原生输入，清除词法变量/应用对象/光标 |

`cua`、`nodeRepl`、console 预先可用。支持真正的 var/let/const、顶层 await；重复声明同名 let/const 会报 SyntaxError，普通同步/异步错误后绑定保留。超时、取消、进程退出或内存/输出限制则重建会话。输出最多8MiB或256个块。Console/Worker stdout 不进入 MCP 协议 stdout。

所有桌面操作都应 await。已经发起的原生请求会在返回前清理；结束后才触发的旧异步回调无法在下一次调用中发起操作。重置不能撤回已投递输入。代码在可信本机 Node 中运行，不提供安全沙箱，不能运行不可信网页提供的 JS。

## 选择和观察

```js
await cua.getState(); // apps/windows/status；自动显示
let app=await cua.getApp('com.apple.calculator');
// 或从真实列表精确绑定：
let other=await cua.getApp({pid:123,windowId:456});
await app.getAXState();
await app.getScreenshot();
await app.getAXStateAndScreenshot();
```

getApp(reference,{coordinateMode:"adaptive"|"original",maxDimension:1600}) 发送应用 API 文档和完整初始 AX 树。不启动缺失应用，也不自动选择多个窗口中的某一个。listApps/listWindows/status 可单独调用；支持 emit:false。rewriteDocumentation 重新显示本会话已发出的文档。launchApp(bundleId,{allowVisibleWindows:true}) 是明确允许可见启动窗口的扩展。requestPermissions 只触发正常 macOS 设置流程，须符合用户的权限设置请求。

getAXState 返回文字，后续默认按树行索引输出差分；加 disableDiffing:true 返回完整树。索引对应最新观察，不是跨观察稳定身份。AX 可能截断，文本值当前最多4000字符；快照120秒过期、原生最多保留16份。不要因为部分树缺失就认定元素不存在。动作完成后自动观察失败会显示提示，但不会重试已经完成的动作。

getScreenshot 返回 PNG Buffer，getAXStateAndScreenshot 返回 {state,coordinates,screenshot?}。默认以 MCP image 块显示；emit:false 只返回。可用 nodeRepl.write(value) 输出文本，nodeRepl.emitImage(PNG或JPEG字节) 输出图像。以 undefined 结束调用可避免重复检查返回值。

## 坐标和操作

AX 节点 frame 和 OCR 矩形始终为窗口内逻辑点、左上原点。每次 AX 全量/差分均带 `Coordinates` JSON：`unit`、`scaleX/Y`（每逻辑点的像素数）、`range`（上界不含）、`origin` 和 `axFrameUnit`。`getCoordinateInfo({emit:false})` 返回当前映射；尺寸变化后会拒绝旧映射。不要自己叠加屏幕位置或二次缩放。

默认 `coordinateMode:"adaptive"` 保留 v1.0 行为：截图后数组按截图像素解释；AX-only（含动作后的自动观察）恢复逻辑点。移植原版脚本时显式使用：

```js
let app=await cua.getApp({pid:123,windowId:456},{coordinateMode:'original'});
await app.getAXState(); // 数组仍为截图像素，不会切回逻辑点
let coordinates=await app.getCoordinateInfo({emit:false});
```

original 模式第一次 AX-only 会静默截取窗口以测量实际缩放，不输出隐藏图像；后续 AX 保留最近截图映射。缩放上限默认1600，可在 getApp 或截图时指定320..4096。窗口调整尺寸后重新观察会重新测量；测不到比例则报 `COORDINATES_UNAVAILABLE`，不会猜测或回退到逻辑点。original 模式因此要求正常屏幕录制授权；这是坐标兼容模式，不表示其他所有原版行为完全相同。

应用对象默认严格绑定 PID/窗口，重启后不会自动跟随：

```js
let preview=await app.reconnect(); // 只列同 bundle ID、同安装路径的候选及窗口信息
// 观察列表并明确选中窗口；以下 PID/ID 仅为示例
let replacement=await app.reconnect({pid:789,windowId:1011});
```

确认调用返回**新对象和完整初始 AX 观察**，继承坐标模式和截图尺寸设置，旧引用/差分/映射不继承。旧对象仍失效。候选可含隐藏的辅助窗口，必须核对窗口标题、尺寸与可见性；不得默认选择第一项。身份缺失或候选不匹配会拒绝，API 不隐式启动应用。

| 方法 | 说明 |
|---|---|
| click(index或[x,y],options?) | mouseButton、clickCount、strategy:auto/ax/event、key、durationMs；普通点击默认 AXPress 优先 |
| typeText(text,{strategy?,target?}) | 支持验证后的 AX 插入或真实进程定向 Unicode。target 可指定当前窗口的可编辑 AX 索引 |
| pressKey('CMD+A',{strategy?,durationMs?}) | auto 可用 AX 选择；event 强制真实键包 |
| drag(from,to,{duration?}) | duration0.1..2秒，默认0.4；后台真实事件 |
| scroll(index或point,direction,pages?,{distanceMode?}) | up/down/left/right，pages默认1、范围>0..10；calibrated默认，legacy可选 |
| selectText(index,text,{prefix?,suffix?,selectionType?}) | text/cursor_before/cursor_after，UTF-16选择范围 |
| setValue(index,text) | AXValue 语义设置 |
| performSecondaryAction(index,action) | focus/press/showMenu/increment/decrement/confirm |
| paste(text,{format:'text'}) | 纯文本 AX 插入，不用剪贴板 |
| ocr({emit?,maxDimension?}) | 本机 Vision OCR，矩形为窗口内逻辑点 |
| move([x,y]) | 只移动独立覆盖光标，不产生鼠标输入 |

修饰键点击示例：`await app.click([200,400],{key:'super+shift',durationMs:250})`。key 仅接受 cmd/command/meta/super、shift、ctrl/control、alt/option，以 `+` 连接；支持坐标和最新元素索引。修饰键或时长选项强制后台事件，`strategy:'ax'` 会拒绝，auto 会选择 event。真实 Command 标志保留给目标，路由临时添加的 Command 仅在未请求时移除。

click/pressKey 的 `durationMs` 为0..5000毫秒，控制每个 down/up 对之间的间隔；显式 key duration（含0）禁用 CMD+A 的 AX 替代。不模拟系统自动重复，也不生成全局修饰键 down/up。取消、重置、目标移动会尝试仅向原目标释放已按住的键或按钮；应用退出或强制硬终止无法保证收件。实验 AppKit 路径的局部通知会覆盖所请求的按住区间，长按没有新增真人 IME 并用验收。

垂直默认距离已校准为 `round(windowHeight*pages)`；两种自建应用、两档尺寸和连续滚动的实测一致。水平保留 `round(windowWidth*0.8*pages)`：原版本轮水平输入未产生位移，不能声称水平兼容。第四个参数 `{distanceMode:'legacy'}` 保留 v1.0 两轴的0.8算法。返回 `scrollDistance` 给出发送的逻辑点增量；实际位移仍由应用决定。完整数据见 [兼容改进验收](COMPATIBILITY_V1_1.md)。

富文本 paste 和浏览器 API 未实现，显式报错。纯后台菜单操作受限。真实事件需要应用支持；event 文本要求已经存在的可读、非安全文本焦点和选择范围，不因传了索引而自动设置焦点。

## 光标和截图

光标是独立 NSPanel，跨目标位置以约60Hz缓入缓出，真实输入等待到位。拖动显示实际包进度。不可成为 key/main、穿透点击、不移动系统鼠标。文字/语义操作指向元素中心，不是测量的插入点。

两种样式由 `CU_AGENT_CURSOR_STYLE` 选择，锚点、运动与生命周期行为完全一致，仅绘制不同：

| 样式 | 外观 | 用途 |
| --- | --- | --- |
| `ring`（默认） | 琥珀色圆环、十字刻度与中心白点，无发光 | 形状和颜色都不像指针，便于与 Codex 自身光标区分 |
| `arrow` | 本项目原绘制的浅色描边、半透明小箭头及柔和光晕 | v1 已验证过的历史外观，按需显式选用 |

未知取值回落到默认的 `ring`；`cursorState` 的 `style` 与 `styleDescription` 报告实际生效的样式。

`CU_AGENT_CURSOR_VISIBILITY=target`（默认）在目标点被遮挡时隐藏光标，并将完整图形和光晕裁剪到目标窗口的露出区域；隐藏时连续移动与后台输入继续。`always` 保留旧版置顶进度光标。未知取值回落到 `target`。设置在 helper 启动时读取，修改环境后需重连 MCP 客户端。`cursorState` 增加 `visibilityMode`、`visibilityReason`、全局逻辑点的 `clipRects`、`occluderCount`、`occlusionGeometry`，这些是绘制诊断，不能证明输入成功。详见[可见性规则与验证范围](CURSOR_OCCLUSION.md)。

操作间窗口移动会跟随；尺寸变化会隐藏并拒绝旧映射；移动或拖动途中窗口变化则停止输入。光标还会在30秒空闲、目标隐藏/关闭、重置、取消、断开时清理。CU_AGENT_CURSOR=0 可关闭。

cursorState 返回可见性、相对/全局逻辑点、面板状态和最近256个本项目绘制记录，不能据此断言输入成功。hideCursor 显式隐藏。

```js
await cua.getScreenshot({
  displayId:1,
  region:{x:300,y:250,width:100,height:100},
  maxDimension:4096,
  includeAgentCursor:true
});
```

显示器 region 使用该显示器内逻辑点。普通窗口/显示器截图排除覆盖光标；includeAgentCursor:true 允许屏幕视觉验证。应用 allowlist 模式禁用显示器截图，仍能截取允许窗口。锁屏、其他 Space 或隐藏桌面不在支持保证内。

## 独立性与实测边界

标准 MCP stdio → 工作线程 REPL/cua → 串行 JSONL Swift helper；无需原版运行时/服务。macOS14.4+ 构建目标，本机实测26.6.2 arm64、Node24.15.0。真实鼠标路由使用未公开系统入口，CU_EXPERIMENTAL_APPKIT_FOCUS=1 使用本机已验证的局部 AppKit 通知，默认关闭。应用可能自行激活或重排；失败后停止并重新观察，不自动恢复焦点掩盖问题。

原生底层分析与新证据见 REPL_CURSOR_RESEARCH.md、FOCUS_FIDELITY.md。多屏只有坐标公式测试，其他系统/应用兼容性不能由单台机器的验收推断。

当前原版macOS与独立版并非完全相同：2026-10-22实测原版返回JPEG，AX-only观察后仍使用Retina截图像素；独立版返回PNG，并提供上述显式坐标兼容、重连与定时输入选项。水平滚动、输入路径及浏览器能力仍有差异，详见 [原版对照基线](ORIGINAL_BASELINE.md)。这些首次明确测量的差异不代表本次更新才引入。

## 真人并用配置（v1.2）

真实事件策略与局部AppKit激活是两回事。pi setup默认设置 `CU_EXPERIMENTAL_APPKIT_FOCUS=0`，`--background-events` 不再开启它；只有 `--experimental-appkit-focus` 才明确开启。`cua.status().background.appKitFocusPolicy` 报告所选策略。

未内部激活的AppKit应用可能忽略原生CMD+A/菜单快捷键和文本拖选。优先用 `pressKey('CMD+A')`、`selectText(...)`、`click(index)` 的语义等价操作，不在失败后自动激活重试。可选激活路径会在系统焦点仍属别处时激活后台文本输入上下文。[输入隔离调查](INPUT_ISOLATION.md)记录了因果追踪、原版AX Raise及边界；新增的单人并用对照已获接受，不外推到实验长按。
