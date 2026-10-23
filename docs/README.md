# Documentation index

[中文版本](zh-CN/README.md)

English is the default language for this repository's documentation. Chinese translations live under [`zh-CN/`](zh-CN/) and mirror the same file names, so every page has a link to its counterpart at the top.

## Start here

| Document | What it covers |
| --- | --- |
| [../README.md](../README.md) | build, start, MCP/pi configuration, capabilities and limits |
| [JS_API.md](JS_API.md) | the two MCP entries, `cua`/app methods, coordinates, cursor and screenshots |
| [ARCHITECTURE.md](ARCHITECTURE.md) | process layering and the independent implementation |
| [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) | current checkpoint plus the v1.0 delivery checkpoints |

## Evidence and validation

| Document | What it covers |
| --- | --- |
| [VALIDATION.md](VALIDATION.md) | v1.0 and v1.1 local acceptance, deliverable verification, uncovered scope |
| [VALIDATION_V03.md](VALIDATION_V03.md) | v0.3 acceptance and the retained v0.1/v0.2 history |
| [FOCUS_FIDELITY.md](FOCUS_FIDELITY.md) | background events, focus observation, corrections and human rounds |
| [BACKGROUND.md](BACKGROUND.md) | background mechanisms, test entry points and rejected approaches |
| [REPL_CURSOR_RESEARCH.md](REPL_CURSOR_RESEARCH.md) | REPL and cursor evidence, REA limits, feedback history |
| [validation-index.json](validation-index.json) | current evidence index |
| [validation-index-v1.1.json](validation-index-v1.1.json) | v1.1 evidence index and release gate |
| [validation-index-v03.json](validation-index-v03.json) | v0.3 historical index |

## Reference: the original app

| Document | What it covers |
| --- | --- |
| [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) | call chain, IPC protocol, native layering, evidence classes |
| [ORIGINAL_BASELINE.md](ORIGINAL_BASELINE.md) | 2026-10-22 install identity, interface and behavior comparison |
| [COMPATIBILITY_V1_1.md](COMPATIBILITY_V1_1.md) | coordinates, modifiers/durations, scroll calibration, reconnection |
| [BASELINE_WATCH.md](BASELINE_WATCH.md) | the read-only drift watcher and its two signal types |
| [evidence-manifest.json](evidence-manifest.json) | historical evidence manifest |
| [original-baseline.json](original-baseline.json) | machine-readable baseline manifest |
| [original-comparison.json](original-comparison.json) | results, function identities and REA Evidence IDs |
| [compatibility-v1.1.json](compatibility-v1.1.json) | trimmed distributable compatibility results |

## Release history

| Document | What it covers |
| --- | --- |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | v1.0.0 notes plus retained v0.3 notes |
| [REPL_CURSOR_PLAN.md](REPL_CURSOR_PLAN.md) | the acceptance plan that produced v1.0 |
| [WORKLOG.md](WORKLOG.md) | chronological work log (English only) |

## Languages

`docs/zh-CN/` contains the Chinese translations of every page above. It is a translation, not a second source of truth: when a page changes, update the English page first and bring the translation along. Documents that are only English (`WORKLOG.md`, `ARCHITECTURE.md`) have no Chinese counterpart by design.

`npm run check:docs` (also part of `npm test`) verifies that every relative link resolves, that each English page has a Chinese counterpart, and that each pair links to the other, so a moved or renamed page cannot silently break the set.

## Bilingual review copies

Two pages carry technical conclusions where a mistranslation would change the meaning of the evidence, so they also have a sentence-level side-by-side copy:

| Review copy | Source |
| --- | --- |
| [zh-CN/review/REVERSE_ENGINEERING.bilingual.md](zh-CN/review/REVERSE_ENGINEERING.bilingual.md) | [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) |
| [zh-CN/review/FOCUS_FIDELITY.bilingual.md](zh-CN/review/FOCUS_FIDELITY.bilingual.md) | [FOCUS_FIDELITY.md](FOCUS_FIDELITY.md) |

Each block (heading, paragraph, list, code) is printed in English and then as the Chinese original; tables are paired row by row so numbers can be compared directly. Regenerate with `npm run docs:bilingual`, which does not require a PR: the test suite fails if the committed copy is stale or if the two languages drift out of block alignment, so a reviewer is never shown mismatched pairs.
