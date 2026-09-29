# Decisions

This log records durable cross-agent decisions. Project-native protocol/research documents remain authoritative for their domains.

## Research claims boundary

The public implementation is a cognitive research prototype. Passing software tests does not establish psychometric, normative, clinical, or official MCCB equivalence.

## Research-safe scoring

Project-native cohort ranking must remain clearly distinct from official T scores or clinical percentiles. Compatibility/QC gates remain part of the scoring boundary.

## Protected material boundary

Licensed/private task material is not distributed in the public repository. Public code provides protocol shells and local injection points where needed.

## Surface separation

Researcher Console/reporting and Participant Runner/task execution have different interaction/layout requirements and should not be collapsed into one generic UI shell.

## Canonical state and handoff

Git is the durable project state. `AGENTS.md`, `HANDOFF.md`, `STATUS.md`, and this file improve continuity but must summarize—not override—`task-manifest.json`, `protocol-lock.json`, validation/governance docs, and implementation evidence.

## Protocol fidelity corrections (2026-09-30)

Four browser behaviors were aligned with the documented cohort operator rules (manual §5.2). These are spec-compliance corrections, not protocol changes, so `task-manifest.json` / `protocol-lock.json` versions are unchanged:

- **TMT timing precision**: recorded `partA/partB.time` is now whole seconds (truncated, never rounded), matching the operator rule "integer seconds, no rounding". Results collected **before** this change may carry decimal-second times; results after are whole seconds. Cohort ranking is order-based, so mixed-precision data remains rank-comparable.
- **TMT start-point error**: a first click on the wrong node now flashes a start-point prompt and restarts the elapsed clock, matching "point out the error, restart timing".
- **BACS practice gate**: the timed 90 s grid is now gated behind a 10-cell practice screen that must be fully completed, matching "the practice portion must be fully completed". Practice is unscored.
- **Fluency / BVMT pause prompts**: a single automatic encouragement fires after a 15 s (fluency) / 10 s (BVMT recall) inactivity pause, approximating the examiner's one-time encouragement. Prompts do not alter recorded scores.

## HVLT structural upgrade (2026-09-30)

The verbal-learning task was restructured from a 3-trial shell to a 5-trial learning + recognition protocol aligned with the commercial HVLT-R standard. This is a genuine protocol change, so the governance surfaces were bumped in the same change:

- **Governance bump (four surfaces)**: `protocolId` `hvlt-related-private-stimulus-shell` → `hvlt-r-5trial-recognition-private-shell-v1`; `taskVersion` `hvlt-web-0.4.0` → `hvlt-web-0.5.0`, in `task-manifest.json`, `protocol-lock.json`, `mccb-participant.js` `TASK_VERSIONS`, and the page's `PROTOCOL_ID` constant (four-surface consistency enforced by `tests/verify-protocol-lock.cjs`).
- **New phases**: five learning trials (study + free recall each), then a click-selection recognition phase (targets + equal-length foils, deterministically ordered with a fixed seed so the item order is identical across participants), then a config-driven delay, then delayed recall.
- **Private material requirement**: `private/stimuli.js` must now supply `foils` in addition to `words`, with `foils.length === words.length`, no empty/duplicate foils, and no overlap with `words`. Missing or invalid foils fail closed (the task will not start). The material fingerprint now also covers `foils.length`.
- **Data**: results now store `trial1`–`trial5`, `recognition`, `recognitionDetail`, and `foilsCount`; `totalLearning` is the sum of all five trials and `retention` is relative to `trial5`. Only counts/aggregates are stored — never the word list or foils.
- **Cohort boundary**: the queue manual (manual §5.2) only specifies "word reading duration 24±4 s" for the verbal-learning test; the 5-trial / recognition / ~5-minute-delay structure comes from the commercial HVLT-R standard, not the manual. Results under the new protocol are never mixed with results under the old protocol in cohort ranking (the protocol signature includes the protocol id), so old 3-trial data stays isolated under its own signature.

## Brief WAIS / 简易韦氏 4-subtest battery (2026-09-30)

An independent **supplementary research battery** — the Brief WAIS (RAVIT) 4-subtest task — was added as the 11th registered task. It is explicitly **not** an MCCB domain component; it is a standalone research battery that sits alongside the ten MCCB-related tasks.

- **Scope**: knowledge (29 items, typed open-ended, administered in the operator-manual item order), similarities (13 word pairs, typed open-ended), picture completion (21 items, 20 s each with auto-submit on timeout), and block design (10 items, 4×4 click grid, per-item deadlines, items 1–2 dual attempt, items 7–10 time-scored, auto-stop after three consecutive zeros).
- **Governance bump (single commit, all four surfaces)**: `protocolId` `brief-wais-4subtest-private-shell-v1`, `taskVersion` `bwais-web-0.1.0`, in `task-manifest.json`, `protocol-lock.json`, `mccb-participant.js` (`TASK_VERSIONS`, `TASK_TIMING_POLICY`, `TEST_ORDER`, `KEY_TO_RESULT`), and the page's `PROTOCOL_ID` constant.
- **Material policy**: private-licensed, fail-closed. `private/stimuli.js` (git-ignored) must supply `setId`/`version` plus exactly 29 knowledge strings, 13 similarity pairs, 21 picture items, and 10 block-design 4×4 grids; without a valid config the task will not start. The public repository ships the protocol shell only — no items, images, answer keys, or patterns. Results store a material fingerprint, never the material itself.
- **Scoring boundary**: the three open-ended subtests save raw responses only (`rawScore: null`) and require offline researcher scoring against the authorized operator key; only block design auto-scores. A new **open-item review gate** (`open_item_review_required`) was added to research scoring, mirroring the existing Fluency semantic-review gate, so an unreviewed battery is never eligible for cohort ranking.
- **Cohort boundary**: because the protocol signature includes the protocol id, this battery's results are isolated in cohort ranking and never mixed with the MCCB-domain tasks.

## Identity

Repository-facing maintainer identity uses **CochraneK**.
