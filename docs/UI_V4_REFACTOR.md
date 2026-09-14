# UI v4 — full researcher/participant surface refactor

UI v4 restructures the research-facing DOM instead of only retheming it.

## Goals

- Restore the compact, task-first feel of the earliest workspace.
- Keep the hardened researcher/participant split, QC, scoring and provenance logic.
- Reduce dashboard chrome and move technical details behind secondary affordances.
- Give Participant Runner one obvious next action and a compact progress surface.
- Make reports read like research documents rather than BI dashboards.
- Cache-bust the shared research stylesheet with `research-ui.css?v=4.0.0`.

## Surface model

### Researcher Console

`header → active participant strip → participant/task workspace → compact task grid → advanced/debug details`

The old cohort metric strip and three explanatory process cards are removed from the primary workflow.

### Participant Runner

`session identity → progress → next action → compact task roadmap → collapsed device/preflight details`

Preflight is still executed and persisted, but successful technical checks no longer dominate the participant-facing screen.

### Single-participant report

`report identity → participant summary → cognitive domains → task/QC evidence → advanced provenance`

### Cohort comparison

`selection controls → protocol-compatible matrix → export/print actions`

## Non-goals

- No task protocol changes.
- No scoring changes.
- No Research Data Model schema changes.
- No changes to private-material handling.

## Compatibility and accessibility

The refactor preserves runtime IDs that are data/behavior contracts while allowing purely presentational DOM to change. Browser zoom, keyboard focus, reduced-motion support, long-page scrolling, responsive layout and print support remain CI-enforced.
