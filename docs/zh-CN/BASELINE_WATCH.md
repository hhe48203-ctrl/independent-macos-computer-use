# 原版更新监控（bot）

[English version](../BASELINE_WATCH.md)

一个只读的巡检 bot：发现原版 Codex/ChatGPT 相关组件相对**已记录的基线**发生变化时，自动开/更新一个去重的 GitHub issue。

它不下载、不执行原版应用，不连接其私有 socket，不导入其专有模块，也不读取凭证或用户配置。

## 两类信号（互补，不能互相替代）

| 模式 | 权威性 | 需要的环境 | 检测内容 |
| --- | --- | --- | --- |
| `--upstream` | 提示性 | 任意（含 GitHub 托管 runner） | 公共发布元数据：Homebrew cask `chatgpt` 版本、npm `@openai/codex` 版本 |
| `--local` | **权威** | 装有 ChatGPT.app 的 macOS | 与 `docs/original-baseline.json` 逐文件 SHA-256、包版本/清单哈希、App 版本与 build 对比 |

公共元数据只能说明**上游发布了一个新版本**，不能证明**本机安装物**变了；只有 `--local` 的哈希对比对已安装基线有权威性。两者结论都写进 issue，但不合并成单一断言。

## 手动运行

```sh
# 提示性：对比公共上游版本
node scripts/watch-original.mjs --upstream

# 权威：对比本机安装物哈希（内部调用 reference-baseline.mjs --check）
node scripts/watch-original.mjs --local

# 真正开/更新 issue（需要已登录的 gh，或 GH_TOKEN）
node scripts/watch-original.mjs --upstream --issue
node scripts/watch-original.mjs --local --issue

# 记录当前上游版本为"已确认"，之后只在再次变化时告警
node scripts/watch-original.mjs --ack
```

退出码：`0` 无漂移，`1` 检测到漂移，`2` 无法判定（信号不可达或无基线）。不加 `--issue` 时只打印 JSON 报告，不产生任何副作用。

## issue 去重语义

- 每个模式有**固定标题**（`titles.local` / `titles.upstream`），避免互相去重。
- 已存在同名 open issue 时，只有当前观测与 issue 正文里的 `<!-- original-watch:... -->` 标记不同才追加一条评论，否则完全静默——因此每日运行不会刷屏。
- 标签固定为 `original-watch`，bot 会自动创建该标签。
- 关闭该 issue 即表示"本轮已确认"；上游/本机再次变化时会重新触发。

## 调度

**GitHub Actions**（默认，已启用）：`.github/workflows/original-baseline-watch.yml`，每天 06:17 UTC + 手动触发，用 `GITHUB_TOKEN` 以 `github-actions[bot]` 身份开 issue。上游 job 在 `ubuntu-latest` 上跑，不需要桌面环境。workflow 把退出码 `1`（漂移）视为成功——漂移由 issue 承载，**红色只代表 bot 自身故障**（如 `gh` 失败或全部信号不可达，退出码 `2`）。

**可选的自托管 macOS job**：`reference-baseline.mjs --local` 需要真实安装物，仓库变量 `CU_SELF_HOSTED_MACOS=1` 时启用 `[self-hosted, macOS]` 上的权威 job。

**本机 launchd**：`ci/com.local.cu-original-watch.plist`（把 `__REPO__` 换成绝对路径后放入 `~/Library/LaunchAgents/`）。

## 确认与刷新流程

1. 在装有应用的机器上跑 `node scripts/reference-baseline.mjs --check` 确认本机是否同步漂移。
2. 用 `--previous docs/original-baseline.json --output artifacts/next-reference.json` 生成新清单，刷新 `docs/ORIGINAL_BASELINE.md` 与 `docs/original-comparison.json`；旧清单保留在 Git 历史，不覆盖。
3. 重跑 `npm test` 与 `node scripts/reference-behavior-test.mjs --independent`。
4. `node scripts/watch-original.mjs --ack` 记录已确认的上游版本，然后关闭 issue。

## 首次状态说明

`ci/upstream-watch.json` 记录的是**当前基线所确认**的上游版本（`chatgpt-cask` = 本机已验收的 `26.1016.61520`）。而当前 Homebrew cask 已是 `26.1016.62342`，即上游已领先于我们验收过的基线——这是真实、可执行的漂移，bot 首次运行就会为它开 issue，而不是被静默忽略。

当前状态（2026-10-24）：跟踪 issue 仍开启，且本机安装物也已越过记录的基线——`reference-baseline.mjs --check` 在安装版本 `26.1021.31345` / sky 0.7.13 下退出码为1。在新版本的行为对照存在之前，清单有意不刷新，因此两个信号现在都指向同一结论：基线需要新一轮工作。

## 限制

- 巡检基于 Hash/版本，**不是行为等价**；新版本必须重新跑行为对照才能声称等价。
- 上游 cask 版本号与本机安装版本同源，但 cask 更新不等于本机已升级。
- `codex-cli` 信号只跟踪 Codex CLI 的公共 npm 版本，与桌面 App 的 `@oai/*` 运行时无直接版本对应关系。
- 公共信号不可达时该信号被排除，不计为漂移；全部不可达时退出码 `2`，不伪装成"无变化"。
