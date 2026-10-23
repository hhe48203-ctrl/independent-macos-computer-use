# Original-update watcher (bot)

[中文版本](zh-CN/BASELINE_WATCH.md)

A read-only watcher: when a Codex/ChatGPT component moves away from the **recorded baseline**, it opens or updates one deduplicated GitHub issue.

It does not download or run the original app, connect to its private socket, import its proprietary modules, or read credentials or user configuration.

## Two signal types (complementary, not interchangeable)

| Mode | Authority | Environment | What it checks |
| --- | --- | --- | --- |
| `--upstream` | advisory | anywhere, including hosted GitHub runners | public release metadata: the Homebrew cask `chatgpt` version and the npm `@openai/codex` version |
| `--local` | **authoritative** | macOS with ChatGPT.app installed | per-file SHA-256, package versions/manifest hashes, and app version plus build against `docs/original-baseline.json` |

Public metadata can only show that **upstream published a new version**; it cannot prove **the local install changed**. Only the `--local` hash comparison is authoritative for the installed baseline. Both conclusions are written into the issue but are never merged into a single assertion.

## Manual use

```sh
# advisory: compare public upstream versions
node scripts/watch-original.mjs --upstream

# authoritative: compare installed hashes (calls reference-baseline.mjs --check)
node scripts/watch-original.mjs --local

# actually open/update the issue (requires an authenticated gh or GH_TOKEN)
node scripts/watch-original.mjs --upstream --issue
node scripts/watch-original.mjs --local --issue

# record the current upstream versions as acknowledged; alert only on the next change
node scripts/watch-original.mjs --ack
```

Exit codes: `0` no drift, `1` drift detected, `2` inconclusive (signal unreachable or no baseline). Without `--issue` only a JSON report is printed and nothing is changed.

## Issue dedupe semantics

- Each mode has a **fixed title** (`titles.local` / `titles.upstream`) so the two cannot dedupe over each other.
- When an open issue with that title exists, a comment is added only if the current observation differs from the `<!-- original-watch:... -->` marker in the issue body; otherwise the run is completely silent, so daily runs do not spam.
- The label is always `original-watch`; the bot creates it when missing.
- Closing the issue means "this round is acknowledged"; the next upstream/local change triggers it again.

## Scheduling

**GitHub Actions** (default, enabled): `.github/workflows/original-baseline-watch.yml`, daily at 06:17 UTC plus manual dispatch, opening issues as `github-actions[bot]` via `GITHUB_TOKEN`. The upstream job runs on `ubuntu-latest` and needs no desktop. The workflow treats exit code `1` (drift) as success — drift is carried by the issue, so **red only means the bot itself broke** (for example a `gh` failure or all signals unreachable, exit code `2`).

**Optional self-hosted macOS job**: `reference-baseline.mjs --local` needs a real install, so setting the repository variable `CU_SELF_HOSTED_MACOS=1` enables the authoritative job on `[self-hosted, macOS]`.

**Local launchd**: `ci/com.local.cu-original-watch.plist` (replace `__REPO__` with the absolute path, then place it in `~/Library/LaunchAgents/`).

## Acknowledge and refresh flow

1. On a machine with the app installed, run `node scripts/reference-baseline.mjs --check` to confirm whether the install drifted too.
2. Generate a new manifest with `--previous docs/original-baseline.json --output artifacts/next-reference.json`, then refresh `docs/ORIGINAL_BASELINE.md` and `docs/original-comparison.json`; the old manifest stays in Git history and is not overwritten.
3. Re-run `npm test` and `node scripts/reference-behavior-test.mjs --independent`.
4. Run `node scripts/watch-original.mjs --ack` to record the acknowledged upstream versions, then close the issue.

## Initial state

`ci/upstream-watch.json` records the upstream versions **confirmed by the current baseline** (`chatgpt-cask` = the locally accepted `26.1016.61520`). The Homebrew cask is already at `26.1016.62342`, so upstream is ahead of the baseline we accepted — a real, actionable drift that the first run reports instead of silently ignoring.

## Limits

- The check is hash/version based and **is not behavioral equivalence**; a new version must re-run the behavior comparison before equivalence can be claimed.
- The cask version and the local install version share a source, but a cask update does not mean the local install was upgraded.
- The `codex-cli` signal only tracks the public npm version of the Codex CLI and has no direct version mapping to the desktop app's `@oai/*` runtime.
- An unreachable public signal is excluded and never counted as drift; if all are unreachable the exit code is `2` rather than pretending "no change".
