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

## Identity

Repository-facing maintainer identity uses **CochraneK**.
