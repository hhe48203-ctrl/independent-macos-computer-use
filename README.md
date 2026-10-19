# Independent macOS Computer Use MCP

本机运行的独立 Computer Use MCP。Agent 只使用 `js`、`js_reset` 两个入口，在持久 JavaScript REPL 内调用 `cua` 和应用对象。Swift helper 提供 Accessibility、ScreenCaptureKit、Vision OCR、后台输入，以及可见、穿透点击、不抢焦点的独立光标。

当前为 v1.0 候选版本，完整验收后才打正式标签。运行不需要 Codex、`@oai/sky`、原版服务、OpenAI API key 或 REA。研究使用了 [REA](https://github.com/morluto/rea)；交付物不含原版专有模块、二进制或图形资源，不修改原版应用或系统权限数据库。

## 构建和启动

源码需要 macOS14.4+、Node.js22+、Xcode Command Line Tools。本机验证 macOS26.6.2 arm64、Node24.15.0。预编译包只需 macOS 与 Node，无须编译器或 npm install。其他系统/架构尚未实机验证。

```sh
npm ci --ignore-scripts
npm run build
npm run doctor
node /absolute/path/to/computer_use_mcp/src/server.mjs
```

最后一条启动 MCP stdio 服务，等待客户端 JSON-RPC 输入；不是交互式终端。stdout 保持协议输出。正常授予启动终端/Agent/helper 的辅助功能与屏幕录制权限，换启动链后重新运行 doctor。本项目无法代替用户授予 TCC。构建会拒绝覆盖仍在运行的 helper，先关闭其客户端或指定独立 CU_BUILD_DIRECTORY。

## Agent 接口

`js` 参数为 `{code,timeout_ms?,title?}`，`js_reset` 参数为 `{}`。`cua`、`nodeRepl` 已初始化；顶层 await、var/let/const 和应用对象跨调用保留。

```js
let state = await cua.getState();
let app = await cua.getApp({pid:123,windowId:456}); // 从真实 inventory 选择
```

下一次 `js` 调用继续使用同一个 app：

```js
await app.getAXStateAndScreenshot();
// 按最新观察到的索引操作：await app.click(7)
// await app.typeText('你好'); await app.pressKey('CMD+A')
```

观察会自动显示 AX 文本/差分及 MCP 图像。`emit:false` 只返回内容。完整方法、截图坐标规则和差异见 [JS API](docs/JS_API.md)。每个桌面操作都应 await；调用结束后的异步回调不能继续操作桌面。超时、取消或重置会清除绑定并停止原生输入，已经发生的副作用不会回滚。REPL 是可信本地 Node.js，不是安全沙箱。

光标按参考样式独立绘制为浅色描边、半透明箭头及柔和光晕，连续缓入缓出移动，到位后才投递输入。拖动位置随真实事件包更新；不会移动系统鼠标。它不可成为 key/main，穿透点击，随窗口移动；大小变化、目标关闭、重置、断开及空闲超时会隐藏。文本操作指向元素中心，并不声称测量到插入点。

## MCP 客户端和 pi

普通 stdio 配置：

```json
{"mcpServers":{"macos-computer-use":{"command":"/absolute/path/to/node","args":["/absolute/path/to/computer_use_mcp/src/server.mjs"]}}}
```

`mcp.json` 可供支持 PLUGIN_ROOT 的本地插件客户端使用；[SDK 示例](examples/mcp-client.mjs) 展示真实调用。

```sh
node scripts/setup-pi.mjs
pi --approve --extension builtin:mcp
npm run test:pi
```

setup 仅写本项目 `.pi/mcp.json`，不改全局配置或凭证。当前 macOS26.6.2 arm64 已验证的真实事件路径可显式用 `node scripts/setup-pi.mjs --background-events` 启用；默认关闭。pi 验收已仅用5次 js 调用完成中文输入、按钮操作、读回验证和连续光标移动。

## 能力与边界

后台默认不激活、不移动系统鼠标、不回退前台。目标可完全被覆盖，但应在当前解锁桌面且未最小化。AXPress 与验证后的 AX 文本默认优先。真实鼠标/键盘事件为可选路径，依赖未公开的 CGEventSetWindowLocation 等系统行为，应用可能忽略或自行重排窗口；隔离错误需要停止并观察。实验局部 AppKit 焦点路径仅在指定本机版本验证，不能承诺任意应用兼容。

可设 CU_ALLOWED_BUNDLE_IDS 限定应用，空值拒绝所有目标；此模式禁用显示器截图。CU_AGENT_CURSOR=0 关闭可见覆盖层。普通截图排除光标，显式 `cua.getScreenshot({region,includeAgentCursor:true})` 可作视觉验证。

当前没有浏览器 API、富文本粘贴、修饰键点击或按住时长；不支持的选项明确报错。纯文本 paste 使用 AX 插入，无需剪贴板。只有一块物理 Retina 屏幕完成实测，多屏坐标公式测试不等价于真实多屏验收。不包含锁屏、隐藏桌面、TCC 绕过或凭证提取。

## 验证和打包

```sh
npm test
npm run test:desktop
npm run test:cursor
node scripts/repl-document-test.mjs
npm run test:pi
npm run package
```

桌面测试只操作临时自建 AppKit 窗口。原生事件测试显式启用本机已验证的局部焦点实验路径。真人并用测试必须先协调开始时间，自动脚本不能替代真人输入完整性。

`artifacts/` 保留本机测试结果和失败记录，默认不进入 Git。`dist/` 生成预编译插件 ZIP、源码包和 SHA256；打包须验证工作线程及 helper 在仓库外运行。当前新版的打包和真人并用验收仍在推进，旧 v0.3 结果不能代替新版证据。

架构与研究：[REPL/光标证据](docs/REPL_CURSOR_RESEARCH.md)、[原生后台机制](docs/FOCUS_FIDELITY.md)、[原始逆向记录](docs/REVERSE_ENGINEERING.md)。后两者包含 v0.3 历史接口名称；当前公开接口以 JS API 为准。
