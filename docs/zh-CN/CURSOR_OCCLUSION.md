# 光标可见性

[English version](../CURSOR_OCCLUSION.md)

默认 `CU_AGENT_CURSOR_VISIBILITY=target` 让独立光标遵守目标窗口的露出区域。连续移动以及到位后投递输入的规则保留。目标点被盖住时隐藏整个光标；锚点露出、图形跨过遮挡边缘时，完整图形和阴影按可见区域裁剪。隐藏时移动、点击、拖动、滚动和按键继续，单纯遮挡不会取消操作或重置位置。

在 MCP 服务环境中设置 `CU_AGENT_CURSOR_VISIBILITY=always` 可保留旧版置顶进度光标。它与 `CU_AGENT_CURSOR_STYLE=ring|arrow` 独立；未知可见性取值回落到 `target`。修改环境后需重启或重连客户端。`CU_AGENT_CURSOR=0` 仍可完全关闭绘制。

## 实现

helper 使用公开的 [WindowServer 窗口清单](https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo(_:_:))，按从前到后的顺序，扣除精确目标 PID/窗口之前所有非零透明度窗口的边界，仅排除自己的光标面板。同一目标进程的其他窗口也会遮挡它。剩余区域与目标及显示器边界求交。锚点被挡时使用空掩码；锚点露出时将分离的可见矩形按 backing 像素向内取整，再裁剪实际绘制，包括箭头光晕。

默认模式的面板采用普通窗口层级且不激活，仅在从隐藏转为可见、或目标本身排到光标面板前面时，排序自己的面板，不持续置前，不相对其他进程排序，不升起目标窗口，不修改目标层级。`always` 保留 status-bar 层级。两种模式均穿透点击、不能成为 key/main。移动和停留时约 60Hz 更新几何，因此移动遮挡窗口可让静止光标隐藏或重现，无需新操作。尺寸变化、目标消失、重置及超时仍沿用原有清理规则。

`cua.cursorState()` 增加：

| 字段 | 含义 |
| --- | --- |
| `visibilityMode` | 生效的 `target` 或 `always` |
| `visibilityReason` | `visible`、`clipped`、`occluded-or-outside`、`target-unavailable`、`always` 或 `inactive` |
| `clipRects` | 全局左上原点、逻辑点单位的当前绘制区域 |
| `occluderCount` | 与光标面板范围相交的前方窗口数 |
| `occlusionGeometry` | `conservative-window-bounds` |

公开窗口元数据不能提供任意逐像素透明度或所有圆角形状，所以半透明窗口和透明角落按整个边界保守隐藏。几何采样不是与合成器原子同步的掩码，采样间变化可能到下一次更新才反映；新置前窗口也能直接盖住普通层级面板。其他 Space、锁屏和真实多屏不在本机验收范围；负坐标/显示器坐标公式另有测试。

## 验证

运行 `npm run build`、`npm test`、`npm run test:cursor:occlusion`。实机测试保持临时窗口在前台后面，核对隐藏时真实点击/拖动/滚动送达、隐藏移动中间帧、重置、目标/遮挡窗口未成为前台及窗口顺序；其他应用之间的前台切换只记录，不擅自归因。离屏位图测试直接使用生产 `AgentCursorView`，在 1×/2× 下要求两种样式都有露出像素、裁剪线以外零像素、空区域完全不绘制。几何测试覆盖多个遮挡窗口、目标/显示器边缘、隐藏锚点和负坐标。历史 `test:cursor` 显式使用 `always`，继续验证完全遮挡下的旧版生命周期行为。

早期测试为获取屏幕裁剪，主动将临时窗口置前，一度使用悬浮层。参与者反馈窗口来到前面且不易覆盖。该布置已撤除，新增的光标跨进程相对排序实验也已撤除，这些尝试不记作通过的可见屏幕对照。新增回归守卫禁止测试窗口提高层级、禁止后台测试布置中置前/key/激活，并禁止光标组件跨进程相对排序、AX Raise 或激活。最终采用离屏像素与真实完全遮挡操作验收，不重复干扰性的布置。本次绘制改动不新增真人输入法验收声明。
