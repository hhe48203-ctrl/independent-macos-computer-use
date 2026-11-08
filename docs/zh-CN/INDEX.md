# 文档索引

[English version](../README.md)

本仓库文档默认使用英文。中文翻译放在 [`zh-CN/`](.) 下并镜像同名文件，因此每页顶部都有指向对应版本的链接。

## 从这里开始

| 文档 | 内容 |
| --- | --- |
| [../README.md](../../README.md) | 定位、环境要求、MCP 客户端、持久 REPL、限制 |
| [JS_API.md](JS_API.md) | 两个 MCP 入口、`cua`/应用方法、坐标、光标与截图 |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | 进程分层与独立实现（仅英文） |
| [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) | 当前检查点、剩余工作与 v1.0 交付检查点 |

## 证据与验证

| 文档 | 内容 |
| --- | --- |
| [VALIDATION.md](VALIDATION.md) | 各版本本机验收（v1.0–v1.3）、交付文件验证、未覆盖范围 |
| [INPUT_ISOLATION.md](INPUT_ISOLATION.md) | v1.2 输入上下文与原版 AX Raise 调查、协作式配置 |
| [CURSOR_OCCLUSION.md](CURSOR_OCCLUSION.md) | v1.3 跟随目标遮挡的光标可见性、裁剪规则与限制 |
| [VALIDATION_V03.md](VALIDATION_V03.md) | v0.3 验收与保留的 v0.1/v0.2 历史 |
| [FOCUS_FIDELITY.md](FOCUS_FIDELITY.md) | 后台事件、焦点观测、更正与真人轮 |
| [BACKGROUND.md](BACKGROUND.md) | 后台机制、测试入口与被排除的方案 |
| [REPL_CURSOR_RESEARCH.md](REPL_CURSOR_RESEARCH.md) | REPL 与光标证据、REA 限制、反馈历史 |
| [validation-index.json](../validation-index.json) | v1.0 证据索引 |
| [validation-index-v1.1.json](../validation-index-v1.1.json) | v1.1 证据索引与发布门槛 |
| [validation-index-v1.2.json](../validation-index-v1.2.json) | v1.2 证据索引与门槛 |
| [validation-index-v1.3.json](../validation-index-v1.3.json) | 当前 v1.3 证据索引与门槛 |
| [validation-index-v03.json](../validation-index-v03.json) | v0.3 历史索引 |

## 参考：原版应用

| 文档 | 内容 |
| --- | --- |
| [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) | 调用链、IPC 协议、原生分层、证据分级 |
| [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md) | 2026-10-22 安装物身份、接口与行为对照 |
| [COMPATIBILITY_V1_1.md](COMPATIBILITY_V1_1.md) | 坐标、修饰键/时长、滚动校准、重连 |
| [BASELINE_WATCH.md](BASELINE_WATCH.md) | 只读漂移巡检及其两类信号 |
| [evidence-manifest.json](../evidence-manifest.json) | 历史证据清单 |
| [original-baseline.json](../original-baseline.json) | 机器可读基线清单 |
| [original-comparison.json](../original-comparison.json) | 结果、函数身份与 REA Evidence ID |
| [compatibility-v1.1.json](../compatibility-v1.1.json) | 精简可分发兼容结果 |

## 发布历史

| 文档 | 内容 |
| --- | --- |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | v1.1–v1.3 发布说明，以及保留的 v1.0 与 v0.3 说明 |
| [REPL_CURSOR_PLAN.md](REPL_CURSOR_PLAN.md) | 产出 v1.0 的验收计划 |
| [WORKLOG.md](../WORKLOG.md) | 按时间顺序的工作日志（仅英文） |

## 语言

`docs/zh-CN/` 包含上述各页的中文翻译，它是翻译而非第二份事实来源：改页面时先改英文，再同步翻译。仅英文的文档（`WORKLOG.md`、`ARCHITECTURE.md`）按设计没有中文版。

`npm run check:docs`（也包含在 `npm test` 中）校验每个相对链接可解析、每个英文页都有中文对应页，且每对页面互相链接，因此移动或重命名页面不会静默破坏整套文档。

## 双语对照副本

有两页承载技术结论，误译会改变证据含义，因此另有句级左右对照副本：

| 对照副本 | 来源 |
| --- | --- |
| [review/REVERSE_ENGINEERING.bilingual.md](review/REVERSE_ENGINEERING.bilingual.md) | [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) |
| [review/FOCUS_FIDELITY.bilingual.md](review/FOCUS_FIDELITY.bilingual.md) | [FOCUS_FIDELITY.md](FOCUS_FIDELITY.md) |

每个块（标题、段落、列表、代码）先英文再中文原文；表格逐行对照，便于直接比对数字。用 `npm run docs:bilingual` 重新生成；若提交的副本过期或两种语言块序列错位，测试会失败，因此审阅者不会看到错配的对照。
