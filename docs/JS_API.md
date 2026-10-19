# JavaScript API

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

getApp 发送应用 API 文档和完整初始 AX 树。不启动缺失应用，也不自动选择多个窗口中的某一个。listApps/listWindows/status 可单独调用；支持 emit:false。rewriteDocumentation 重新显示本会话已发出的文档。launchApp(bundleId,{allowVisibleWindows:true}) 是明确允许可见启动窗口的扩展。requestPermissions 只触发正常 macOS 设置流程，须符合用户的权限设置请求。

getAXState 返回文字，后续默认按树行索引输出差分；加 disableDiffing:true 返回完整树。索引对应最新观察，不是跨观察稳定身份。AX 可能截断，文本值当前最多4000字符；快照120秒过期、原生最多保留16份。不要因为部分树缺失就认定元素不存在。动作完成后自动观察失败会显示提示，但不会重试已经完成的动作。

getScreenshot 返回 PNG Buffer，getAXStateAndScreenshot 返回 {state,screenshot?}。默认以 MCP image 块显示；emit:false 只返回。可用 nodeRepl.write(value) 输出文本，nodeRepl.emitImage(PNG或JPEG字节) 输出图像。以 undefined 结束调用可避免重复检查返回值。

## 坐标和操作

AX 节点 frame 始终为窗口内逻辑点、左上原点。AX-only 观察后，点数组也使用逻辑点。截图后数组使用最近截图的像素，应用对象自动除以各轴比例。尺寸变化会拒绝旧映射；重新观察即可。不要自己叠加屏幕位置或二次缩放。动作后的自动 AX 观察会恢复逻辑点坐标。

| 方法 | 说明 |
|---|---|
| click(index或[x,y],options?) | mouseButton、clickCount、strategy:auto/ax/event；默认 AXPress 优先 |
| typeText(text,{strategy?}) | auto/ax 为验证后的 AX 插入，event 为真实进程定向 Unicode |
| pressKey('CMD+A',{strategy?}) | auto 可用 AX 选择；event 强制真实键包 |
| drag(from,to,{duration?}) | duration0.1..2秒，默认0.4；后台真实事件 |
| scroll(index或point,direction,pages?) | up/down/left/right，pages默认1、范围>0..10 |
| selectText(index,text,{prefix?,suffix?,selectionType?}) | text/cursor_before/cursor_after，UTF-16选择范围 |
| setValue(index,text) | AXValue 语义设置 |
| performSecondaryAction(index,action) | focus/press/showMenu/increment/decrement/confirm |
| paste(text,{format:'text'}) | 纯文本 AX 插入，不用剪贴板 |
| ocr({emit?,maxDimension?}) | 本机 Vision OCR，矩形为窗口内逻辑点 |
| move([x,y]) | 只移动独立覆盖光标，不产生鼠标输入 |

修饰键点击、按住时长、富文本 paste 和浏览器 API 未实现，显式报错。纯后台菜单操作受限。真实事件需要应用支持；event 文本要求已经存在的可读、非安全文本焦点和选择范围，不因传了索引而自动设置焦点。

## 光标和截图

光标是独立 NSPanel，用本项目绘制的浅色描边、半透明小箭头及柔和光晕。跨目标位置以约60Hz缓入缓出，真实输入等待到位。拖动显示实际包进度。不可成为 key/main、穿透点击、不移动系统鼠标。文字/语义操作指向元素中心，不是测量的插入点。

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
