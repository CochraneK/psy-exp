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

## Open-item review console + BWAIS extract null fix (2026-09-30)

The two open-ended scoring workflows (Fluency semantic review, BWAIS open-item review) are now a first-class researcher surface backed by symmetric storage primitives. This is a researcher-console addition plus a scoring-extract correctness fix, **not a protocol change** — `task-manifest.json` / `protocol-lock.json` versions are unchanged.

- **`reviewBwais(scores, status, reviewer)`** (`mccb-participant.js`, mirrors `reviewFluency`): `status` ∈ {`verified`, `rejected`, `unreviewed`}. `verified` is fail-closed and requires all three open-item scores in range (knowledge 0–29, similarities 0–26, pictureCompletion 0–21) **and** a finite auto-scored `blockDesign.rawScore` — a battery can never be verified with a missing or null open score. Validation is two-pass (validate everything, then apply) so a failed review leaves the result untouched. `rejected`/`unreviewed` only flip `reviewStatus` and keep previously assigned scores for audit. Writes `openReview = {status, reviewedAt, reviewer, scores?}` plus `total` for export consistency (the scorer recomputes independently), and syncs the matching `attemptHistory` entry by `_meta.recordedAt`.
- **Signature stability**: the BWAIS `protocolSignature` hashes only testKey/taskVersion/protocol/materialFingerprint/materialVersion/setId, so review metadata does not change the signature and cohort grouping stays stable across reviews (asserted explicitly by the new contract tests).
- **`research-review.html`** (researcher console, linked from `research-report.html`): lists canonical unreviewed fluency/bwais results as a pending queue; only canonical results are reviewable (QC-invalid `invalidResults` render read-only); all participant-derived strings pass through an XSS escaper; the reviewer name persists to localStorage; the guard-note wording "非 MCCB T 分" is CI-grepped, consistent with the report surfaces.
- **BWAIS extract null→0 fix (`mccb-scoring.js`)**: `Number(null) === 0` made a null open-item `rawScore` extract as `0`, so an unreviewed battery displayed a spurious total equal to its block score. Fixed with an explicit `rawScore != null` guard before `Number.isFinite`. Zero gate changes; no ranking impact (bwais is not in the scoring DOMAINS); existing verified/unreviewed fixtures (P001/P010) are unaffected.
- **Tests / registration**: `tests/verify-review.cjs` (48 assertions: gate, invalid-input zero-side-effect, missing-block fail-closed, verified full flow, rejected keeps gate closed, re-review replaces assignment, Fluency end-to-end, bundle level) is registered in `full-battery.cjs` (now 14 groups), `validate-inline-scripts.cjs`, and CI (`node --check`, `test -f`, title + guard greps).

## BWAIS synthetic-ization: private shell → public synthetic battery (2026-09-30)

The Brief WAIS 4-subtest battery switches from a **private-licensed fail-closed shell** to a **publicly executable synthetic battery**, on the same route as BVMT (`synthetic-visual-pattern-v1`) and Mazes (`generated-perfect-mazes-v1`). Stimuli are **code-generated** by `tools/gen-bwais-stimuli.cjs` (deterministic; rerunning it regenerates `pages/mccb-bwais-stimuli.js` and the dev preview `tools/bwais-stimuli-preview.html`) — 29 knowledge items, 13 similarity pairs, 21 SVG line-art picture-completion scenes (each scene misses one part), 10 left-right-symmetric 4×4 block patterns of rising difficulty. They are **not** licensed WAIS/RAVIT material, and no equivalence to the standard Wechsler instrument is claimed (consistent with the existing `mccbEquivalent:false` boundary).

- **Governance bump (single commit, all four surfaces)**: `protocolId` `brief-wais-4subtest-private-shell-v1` → `brief-wais-4subtest-synthetic-v1`; `taskVersion` `bwais-web-0.1.0` → `bwais-web-0.2.0`; `materialPolicy` `private-licensed-assets-required` → `synthetic-public-stimuli`, `publicExecutable` → `true` (task-manifest + scoring `TASK_VALIDATION`). In `task-manifest.json`, `protocol-lock.json`, `mccb-participant.js` `TASK_VERSIONS`, and the page's `PROTOCOL_ID`.
- **Material location**: stimuli now ship publicly in `pages/mccb-bwais-stimuli.js` (`window.PSY_SYNTHETIC_BWAIS`, `setId: synthetic-bwais`, `version: gen-1.1.0`). The page no longer loads `private/stimuli.js` (which remains required for HVLT/MSCEIT). The picture-completion **expected answers are not shipped to the client** — they stay in `tools/bwais-scenes.cjs` (researcher scoring reference) and the dev preview; the page remains open-ended with researcher offline scoring.
- **Fail-closed retained**: if the synthetic module is missing or structurally invalid at deploy time the task still refuses to start (exact 29/13/21/10 count validation).
- **Contract sync**: `verify-manifest.cjs` moves bwais from the private-material group to the synthetic group; `validate-drivers.cjs` / `verify-manifest.cjs` / `verify-scoring.cjs` / `verify-review.cjs` tokens updated; `browser-smoke.cjs` bwais assertion inverted from fail-closed to "publicly executable with synthetic material"; demo data materialSet renamed to `demo-synthetic-bwais`; `docs/private-stimuli.example.js` no longer documents a bwais section.
- **Cohort boundary**: results recorded under `...-synthetic-v1` are isolated from the old `...-private-shell-v1` signature in cohort ranking (no real participant data exists under the old protocol — it was fail-closed and never runnable without a local injection).

## Storage auto-sync and offline resilience: local-primary-http-replica 1.0.0 → 1.1.0 (2026-09-30)

The HTTP replica path (`research-storage.js`) gains offline resilience **without touching the local-first rule** — a network request must never enter a timed trial's critical path. This is a **storage-architecture change, not a task protocol change**: `protocol-lock.json` and all task versions are unchanged; only the storage-architecture identifier moves.

- **Error classification + exponential backoff**: flush failures split into retryable (network/429/5xx → `item.nextRetryAt = now + min(5s × 2^(attempts−1), 10min)`, state `error`/`backoff`) and fatal (401/403 → `auth_failed`; 400/404/405/413 → `rejected`, recorded as `item.blockedReason`, state `blocked`). Automatic flushes stop at the first parked/blocked item (FIFO preserved — the reference server replaces the whole bundle, so out-of-order pushes would leave a stale bundle); a **manual flush** (`syncBundle` / "立即同步") clears action gates and bypasses backoff (explicit researcher decision).
- **Automatic recovery triggers**: `startAutoSync({onSettled})` (idempotent, browser-only — Node returns `environment_unsupported`) attaches `online` + `visibilitychange→visible` listeners plus a 1.5s deferred sweep. `maybeAutoSync()` is the guard-chained entry: `replica_disabled → auto_sync_disabled → token_missing → outbox_empty → flushOutbox(auto)`. Wired into three surfaces: `research-session.js` checkpoint, `participant-runner.html` `checkpointResearchData`, and `data-governance.html` (save-config triggers an immediate attempt when autoSync is checked; `onSettled:render` keeps the page current).
- **State visibility**: `getState()` now reports `pending` (outbox length); the governance page renders a sync-state line (status / pending / last success / last error / blocked / next retry).
- **Version bump (single commit, all seven surfaces)**: `local-primary-http-replica-1.0.0` → `1.1.0` in `research-storage.js`, `task-manifest.json`, `ci.yml` (3 hard greps), `docs/BACKEND_V1.md` (+ new "Auto-sync and offline resilience (v1.1.0)" section), `docs/RESEARCH_DATA_MODEL.md`, `tests/verify-storage.cjs`, `tests/browser-smoke.cjs` (2 E2E assertions).
- **Contracts**: `verify-storage.cjs` grows 11 → 28 assertions (backoff window and doubling, backoff gate, manual bypass, 401 fatal, auto-stop on blocked, re-auth recovery, FIFO block/recovery ordering, the four `maybeAutoSync` guards, environment guard). Token remains memory-only; no new localStorage keys; Bearer/HTTPS-only rules unchanged; backward compatible (old outbox items lack the new fields, so no gate triggers).

## Unified page-leave guard: research-runtime 0.4.0 → 0.5.0 (2026-09-30)

Eleven task pages wired ad-hoc `beforeunload` warnings — 6 pages with three divergent implementations (phase check / state flag / runtime active-session check) and 5 timed tasks (lns, spatial-span, bvmt, mazes, msceit) with **no close/refresh warning at all**, so an accidental tab close silently discarded in-flight timed data. The guard is now unified in the shared runtime.

- **Single owner**: `mccb-participant.js` registers exactly one `beforeunload` listener in `installRuntimeGuards`; it is inert unless `ParticipantManager.startLeaveGuard()` has been called, and `endLeaveGuard()` disarms it. Message: “任务正在进行中，确定离开吗？”.
- **Activation window = recorded session window**: pages call `startLeaveGuard()` immediately after `markInProgress(...)` and `endLeaveGuard()` immediately after `saveResult(...)`, so the warning is live exactly while an ExperimentRuntime session is open (markInProgress→complete). Every finish/timeout/abort path funnels through `saveResult` and therefore disarms; msceit’s private-scoring `technical_failure` path deliberately keeps the guard armed (session still active, nothing saved yet).
- **One deliberate alignment (documented behavior change)**: CPT no longer warns during its 10-trial unscored practice phase — practice creates no runtime session, so nothing recorded is at risk. Every other page keeps an equivalent or wider warning window.
- **Not a protocol change**: no stimulus exposure, response window, raw score, or timing semantics change — per `docs/PROTOCOL_GOVERNANCE.md` a safety/presentation-layer change preserves protocol identity. `protocol-lock.json` and all `taskVersion`/`protocolId` values are unchanged; only the runtime identifier moves 0.4.0 → 0.5.0 (additive public API), synced in the same commit across `mccb-participant.js`, `task-manifest.json` (cross-checked by `verify-manifest.cjs`), `README.md`, `tests/verify-governance.cjs`, and `tests/verify-backend.cjs`.
- **Contracts**: `verify-participant.cjs` grows 68 → 88 assertions — a fake-window section proving exactly one listener, default-inert, armed blocking with the exact message, disarm, and idempotence; plus a wiring sweep over all 11 `TEST_ORDER` pages asserting `startLeaveGuard(`/`endLeaveGuard(` presence and the absence of any page-local `beforeunload` listener. CI inherits it via `full-battery.cjs`.

## Identity

Repository-facing maintainer identity uses **CochraneK**.
