# v1.0.0 本机验收

2026-10-19 UTC，macOS26.6.2 (25G83)、arm64、Node24.15.0、pi1.2.0，单块物理 Retina 屏幕。正常 Accessibility/Screen Recording 授权；新客户端仍须正常授权。

| 验证 | 结果与范围 |
| --- | --- |
| 自动回归 | 25项通过、0跳过：真实词法绑定/TLA、错误恢复、取消/超时/重置、旧回调隔离、跨VM图片、MCP发现、原生策略与坐标公式 |
| 新公开接口 | 只有js/js_reset；持久应用对象、AX差分、富PNG、截图坐标映射，窗口歧义和缩放失效明确报错 |
| 真实文档 | 被覆盖的自建AppKit文档中，真实Unicode（中文、emoji、NFD、ZWJ、换行）、导航键、CMD+A、选择拖动、滚动、点击均读回；SCK截图及Vision OCR通过 |
| 可见光标 | 连续中间帧和屏幕裁剪已核对；浅色半透明箭头、柔和光晕。最后生命周期测试有36个真实拖动包，窗口移动跟随、缩放失效隐藏、拖动中重置释放及目标退出清理通过，系统鼠标位置不变 |
| pi | 仅9次js调用、0工具错误，跨调用复用app，完成7项真实事件操作并验证文档/选区/滚动条/按钮结果；基础中文输入闭环另有5次js测试 |
| 真人并用对照 | 10.001秒空闲与20.159秒后台，29次真实后台动作；参与者确认“两阶段都正常，没有明显差异” |

真人对照中，两个阶段均观察到Canadian/SCIM输入源及Caps Lock/Globe切换，后台阶段43次硬件keyDown进入Codex，helper的17次keyDown只投往目标。未读取Codex草稿，**没有本轮逐字符自动完整性证明**。前台/按键元数据和人工体验分开计量，单人单机结果不外推为所有IME或应用兼容。

最初新版真人轮出现输入法/大小写切换困难，仍记作失败。随后将text/key的光标动画移到局部AppKit焦点通知之前，避免数百毫秒动画占用局部激活区间；新增时间指标及先后顺序断言。受控诊断未发现持续的全局修饰状态变化，但不证明没有瞬态；动画时序是可能原因，未证明唯一根因。失败、测量和人工复核全部保留，不倒改旧报告。

## 交付文件的独立验证

最终包的权威结果保存在证据包的 `artifacts/release-verification-v1/`。预编译验收解压**实际ZIP**到仓库外 `/tmp`、去掉NODE_PATH，通过该包的独立worker/helper完成上述真实文档操作、PNG和OCR。源码验收解压**实际tar.gz**到另一临时目录，用隔离npm配置安装锁定依赖（关闭安装脚本），重建原生helper并执行全部25项测试，要求0跳过。

发布门槛为该目录的 `packaged-repl.json`、`packaged-document.json` 和 `source-package.json` 都通过；`release-gate.json` 核对它们与最终SHA256一致。不能用候选包或旧v0.3记录替代。复现：

```sh
npm run build
npm run package
node scripts/packaged-repl-test.mjs
node scripts/source-package-test.mjs
```

真人测试需要协调开始时间；不在自动发布检查中重复。原生真实事件测试显式开启本机限定的实验局部焦点路径，默认关闭。默认AX路径、可见布置、真实事件及人工判断不能互相替代。

当前索引见 [validation-index.json](validation-index.json)，研究与架构见 [REPL_CURSOR_RESEARCH.md](REPL_CURSOR_RESEARCH.md)、[JS_API.md](JS_API.md)。[v0.3验证记录](VALIDATION_V03.md)及其索引是历史证据，旧17工具接口已退役。

## 未覆盖的范围

Intel、其他macOS版本、真实多屏、任意Electron/浏览器、复杂IME composition、锁屏及其他Space、长期运行仍未实机验收。多屏坐标公式测试不能替代多屏测试。原始后台事件使用系统SPI，应用可能忽略或自行升层；检测到隔离错误即停止，不恢复前台或过滤真人事件掩盖问题。采样间隔也不能证明每个瞬间均无干扰。

证据ZIP仅收录自建测试UI、结果和必要的输入/焦点元数据；不收录前台草稿截图、原版专有代码、研究切片或凭证。
